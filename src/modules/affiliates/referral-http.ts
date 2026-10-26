import {eq} from 'drizzle-orm';

import {failure, hasTrustedMutationOrigin, parseJsonObject} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {affiliateSettings} from '../../db/schema/affiliate.ts';
import {inTransaction} from '../shared/transaction.ts';
import {createReferralToken} from './attribution.ts';
import type {AffiliateAuthority} from './runtime.ts';

type ReferralHttpDependencies = Readonly<{
  secret: string;
  programId: string;
  appUrl: string;
  production: boolean;
  getDatabase: () => AppDatabase;
  authority: Pick<AffiliateAuthority, 'resolveReferral'>;
  now?: () => Date;
}>;

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const FIELDS = ['touchReference'];

async function readReferral(request: Request): Promise<{touchReference: string}> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new DomainError('VALIDATION', 'A JSON referral is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('VALIDATION', 'A JSON referral is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new DomainError('VALIDATION', 'The referral body is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = parseJsonObject(Buffer.concat(chunks).toString('utf8'));
  if (Object.keys(body).some((field) => !FIELDS.includes(field)) || !FIELDS.every((field) => typeof body[field] === 'string' && body[field].trim() === body[field] && body[field].length > 0 && body[field].length <= 255 && !/[\u0000-\u001f\u007f]/.test(body[field]))) throw new DomainError('VALIDATION', 'Valid referral identifiers are required.');
  return {touchReference: body.touchReference as string};
}

function unavailable(): Response {
  return Response.json({ok: false, status: 'unavailable', error: 'Referral verification is unavailable.'}, {status: 503, headers: {'cache-control': 'no-store'}});
}

/** A failed candidate never clears the browser's previous valid touch. Only verified server identities are signed. */
export async function handleAffiliateReferral(request: Request, dependencies: ReferralHttpDependencies): Promise<Response> {
  if (request.method !== 'POST') return Response.json(failure('METHOD_NOT_ALLOWED', 'Use POST.'), {status: 405, headers: {allow: 'POST'}});
  try {
    if (!hasTrustedMutationOrigin(request, dependencies.appUrl)) throw new DomainError('FORBIDDEN', 'A same-origin request is required.');
    const candidate = await readReferral(request);
    if (!dependencies.secret.trim() || !dependencies.programId) return Response.json({ok: false, status: 'disabled'}, {headers: {'cache-control': 'no-store'}});
    if (dependencies.production && (new URL(request.url).protocol !== 'https:' || new URL(dependencies.appUrl).protocol !== 'https:')) return unavailable();
    const db = dependencies.getDatabase();
    const snapshot = (await db.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
    if (snapshot?.enabled !== 'enabled' || !snapshot.accountId || snapshot.programId !== dependencies.programId) return Response.json({ok: false, status: 'disabled'}, {headers: {'cache-control': 'no-store'}});
    const now = dependencies.now ?? (() => new Date());
    const capturedAt = now();
    let resolved: Awaited<ReturnType<NonNullable<AffiliateAuthority['resolveReferral']>>>;
    try {
      const resolver = dependencies.authority.resolveReferral;
      if (!resolver) return unavailable();
      resolved = await resolver({touchReference: candidate.touchReference, programId: dependencies.programId, capturedAt, expiresAt: new Date(capturedAt.getTime() + MAX_AGE_SECONDS * 1000)});
    } catch { return unavailable(); }
    if (!resolved) return Response.json({ok: false, status: 'invalid', error: 'The referral could not be verified.'}, {status: 400, headers: {'cache-control': 'no-store'}});
    const verified = resolved;
    if (verified.programId !== dependencies.programId || verified.touchReference !== candidate.touchReference || verified.capturedAt.getTime() !== capturedAt.getTime()) return unavailable();
    return inTransaction(db, async (tx) => {
      const current = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
      if (current?.enabled !== 'enabled' || current.accountId !== snapshot.accountId || current.programId !== snapshot.programId || current.policyVersion !== snapshot.policyVersion) return unavailable();
      const token = createReferralToken({affiliateId: verified.affiliateId, touchReference: verified.touchReference, programId: verified.programId}, dependencies.secret, now());
      const cookie = 'shpitto_referral=' + token + '; Path=/; Max-Age=' + MAX_AGE_SECONDS + '; HttpOnly; SameSite=Lax' + (dependencies.production ? '; Secure' : '');
      return Response.json({ok: true, status: 'captured'}, {headers: {'set-cookie': cookie, 'cache-control': 'no-store'}});
    });
  } catch (error) {
    if (error instanceof DomainError) return Response.json(failure(error.code, error.publicMessage), {status: error.code === 'FORBIDDEN' ? 403 : error.code === 'VALIDATION' ? 400 : 500});
    return Response.json(failure('INTERNAL_ERROR', 'The referral could not be captured.'), {status: 500});
  }
}
