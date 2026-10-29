import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import type {JsonWebKey} from 'node:crypto';

import {DomainError} from '../../../db/contracts.ts';
import {normalizeObservation} from '../normalize.ts';
import type {ProviderRequestRef, VerifiedObservation} from '../port.ts';
import {FAL_JWKS_MAX_AGE_MS, parseFalJwks} from './jwks.ts';

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_TOLERANCE_SECONDS = 300;

export type FalWebhookOptions = Readonly<{
  publicKeyPem?: string;
  jwks?: Readonly<{keys: readonly JsonWebKey[]}>;
  jwksFetchedAt?: Date;
  expectedAccountId?: string;
  expectedAttemptNonce?: string;
  now?: Date;
  toleranceSeconds?: number;
}>;

function header(headers: Headers, ...names: string[]): string {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  throw new DomainError('FORBIDDEN', `Missing fal webhook header: ${names[0]}.`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseBody(rawBody: Uint8Array): Record<string, unknown> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'fal webhook body is outside the bounded size.');
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(rawBody));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new DomainError('VALIDATION', 'fal webhook body is invalid JSON.');
  }
}

function signatureBytes(value: string, modern: boolean): Buffer {
  const normalized = modern ? value : value.replace(/^ed25519[=:]/i, '').trim();
  if (/^[a-f0-9]{128}$/i.test(normalized)) return Buffer.from(normalized, 'hex');
  if (!modern && /^[A-Za-z0-9+/]{86}(?:==)?$/.test(normalized)) {
    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length === 64 && bytes.toString('base64').replace(/=+$/, '') === normalized.replace(/=+$/, '')) return bytes;
  }
  throw new DomainError('FORBIDDEN', 'fal webhook signature is invalid.');
}

function verify(rawBody: Uint8Array, headers: Headers, options: FalWebhookOptions): {eventId: string; accountId: string; modern: boolean} {
  if (!options.publicKeyPem?.trim() && !options.jwks) throw new DomainError('INFRASTRUCTURE', 'fal webhook verification is not configured.');
  const modern = headers.has('x-fal-webhook-request-id') || headers.has('x-fal-webhook-user-id');
  const eventId = modern
    ? header(headers, 'x-fal-webhook-request-id')
    : header(headers, 'x-fal-webhook-id', 'x-fal-event-id', 'x-webhook-id');
  const accountId = modern ? header(headers, 'x-fal-webhook-user-id') : '';
  const timestampText = modern
    ? header(headers, 'x-fal-webhook-timestamp')
    : header(headers, 'x-fal-webhook-timestamp', 'x-fal-timestamp', 'x-webhook-timestamp');
  const timestamp = Number(timestampText);
  const nowMs = (options.now ?? new Date()).getTime();
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(timestampText) || !Number.isSafeInteger(timestamp) || !Number.isFinite(nowMs) || !Number.isFinite(tolerance) || tolerance < 0 || Math.abs(nowMs - timestamp * 1000) > tolerance * 1000) throw new DomainError('FORBIDDEN', 'fal webhook timestamp is invalid or stale.');
  const signature = signatureBytes(modern ? header(headers, 'x-fal-webhook-signature') : header(headers, 'x-fal-webhook-signature', 'x-fal-signature', 'x-webhook-signature'), modern);
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const canonical = Buffer.from(modern ? `${eventId}\n${accountId}\n${timestampText}\n${digest}` : `${eventId}.${timestampText}.${digest}`, 'utf8');
  try {
    if (options.publicKeyPem?.trim()) {
      const key = createPublicKey(options.publicKeyPem);
      if (key.asymmetricKeyType !== 'ed25519' || !verifySignature(null, canonical, key, signature)) throw new Error('invalid signature');
    } else {
      // The official JWKS is only a trust source for fal's modern four-header protocol.
      const fetchedAt = options.jwksFetchedAt?.getTime() ?? NaN;
      if (!modern || !Number.isFinite(fetchedAt) || nowMs < fetchedAt || nowMs - fetchedAt >= FAL_JWKS_MAX_AGE_MS) throw new Error('invalid jwks');
      const valid = parseFalJwks(options.jwks).some((jwk) => {
        try { return verifySignature(null, canonical, createPublicKey({key: jwk, format: 'jwk'}), signature); }
        catch { return false; }
      });
      if (!valid) throw new Error('invalid signature');
    }
  } catch {
    throw new DomainError('FORBIDDEN', 'fal webhook signature is invalid.');
  }
  return {eventId, accountId, modern};
}

function identity(body: Record<string, unknown>): {requestId: string; attemptNonce: string; accountId: string} {
  const requestId = body.request_id ?? body.id;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) throw new DomainError('FORBIDDEN', 'fal webhook request identity is invalid.');
  const metadataSource = body.metadata ?? record(body.payload).metadata;
  const metadata = metadataSource && typeof metadataSource === 'object' && !Array.isArray(metadataSource) ? metadataSource as Record<string, unknown> : {};
  return {requestId, attemptNonce: typeof metadata.attempt_nonce === 'string' ? metadata.attempt_nonce : '', accountId: typeof body.account_id === 'string' ? body.account_id : (typeof body.user_id === 'string' ? body.user_id : '')};
}

export function verifyFalWebhook(rawBody: Uint8Array, headers: Headers, ref: ProviderRequestRef, options: FalWebhookOptions): VerifiedObservation {
  if (ref.provider !== 'fal') throw new DomainError('VALIDATION', 'The persisted provider reference is not fal.');
  const body = parseBody(rawBody);
  const {eventId, accountId: headerAccountId, modern} = verify(rawBody, headers, options);
  const current = identity(body);
  if (current.requestId !== ref.requestId) throw new DomainError('CONFLICT', 'fal webhook request identity does not match the persisted attempt.');
  const accountId = modern ? headerAccountId : current.accountId;
  if (options.expectedAccountId && accountId !== options.expectedAccountId) throw new DomainError('FORBIDDEN', 'fal webhook account identity is not trusted.');
  if (options.expectedAttemptNonce && current.attemptNonce && current.attemptNonce !== options.expectedAttemptNonce) throw new DomainError('CONFLICT', 'fal webhook attempt identity does not match.');
  const attemptNonce = options.expectedAttemptNonce ?? current.attemptNonce;
  if (!attemptNonce) throw new DomainError('CONFLICT', 'fal webhook attempt correlation is missing.');
  return Object.freeze({observation: normalizeObservation(ref, body), eventId, accountId, attemptNonce, authenticatedAt: new Date().toISOString()});
}
