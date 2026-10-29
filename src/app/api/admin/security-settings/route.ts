import {createHmac} from 'node:crypto';
import {and, eq, isNull} from 'drizzle-orm';
import {NextResponse} from 'next/server';

import {auth, getAuthDatabase} from '../../../../lib/auth.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {authUser} from '../../../../db/schema/auth.ts';
import {auditEvents} from '../../../../db/schema/credit.ts';
import {securitySettings} from '../../../../db/schema/security.ts';
import {getServerEnv} from '../../../../config/env.ts';
import {semanticHash} from '../../../../contracts/http.ts';
import {authorizeOperatorCommand} from '../../../../modules/operations/authorize.ts';
import {recordOperatorAudit, validateOperatorReason} from '../../../../modules/operations/audit.ts';
import {inTransaction} from '../../../../modules/shared/transaction.ts';
import {publicSecuritySettings, readPublicSecuritySettings, readSecuritySettings, updateSecuritySettings, type SecuritySettingsInput} from '../../../../modules/security/settings.ts';
import {verifyTurnstile} from '../../../../modules/security/turnstile.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../workspaces/_shared.ts';

function inputFromBody(body: Record<string, unknown>): SecuritySettingsInput {
  const requiredBoolean = (name: string): boolean => {
    const value = body[name];
    if (typeof value !== 'boolean') throw new DomainError('VALIDATION', `${name} must be boolean.`);
    return value;
  };
  const optionalBoolean = (name: string): boolean | undefined => {
    const value = body[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new DomainError('VALIDATION', `${name} must be boolean.`);
    return value;
  };
  const optionalString = (name: string): string | undefined => {
    const value = body[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new DomainError('VALIDATION', `${name} must be a string.`);
    return value;
  };
  if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new DomainError('VALIDATION', 'expectedVersion must be a positive integer.');
  const siteKey = body.turnstileSiteKey;
  if (typeof siteKey !== 'string') throw new DomainError('VALIDATION', 'turnstileSiteKey must be a string.');
  return {
    expectedVersion: Number(body.expectedVersion),
    emailVerificationEnabled: requiredBoolean('emailVerificationEnabled'),
    twoFactorRequired: requiredBoolean('twoFactorRequired'),
    turnstileEnabled: requiredBoolean('turnstileEnabled'),
    turnstileSiteKey: siteKey,
    turnstileSecretKey: optionalString('turnstileSecretKey'),
    clearTurnstileSecret: optionalBoolean('clearTurnstileSecret'),
    smtpEnabled: requiredBoolean('smtpEnabled'),
    smtpUrl: optionalString('smtpUrl'),
    clearSmtpUrl: optionalBoolean('clearSmtpUrl'),
    smtpFromEmail: optionalString('smtpFromEmail'),
    smtpFromName: optionalString('smtpFromName'),
  };
}

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    await authorizeOperatorCommand(getAuthDatabase(), actor, 'superadmin');
    const [settings, user] = await Promise.all([
      readPublicSecuritySettings(getAuthDatabase()),
      getAuthDatabase().select({emailVerified: authUser.emailVerified}).from(authUser).where(eq(authUser.id, actor.userId)).limit(1),
    ]);
    return NextResponse.json({...settings, currentIdentityEmailVerified: user[0]?.emailVerified ?? false}, {headers: {'cache-control': 'no-store'}});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (parsed.valid && parsed.body.action === 'send-verification') {
      const key = commandKey(request, parsed.body);
      const runtimeSecurity = await readSecuritySettings(getAuthDatabase());
      if (runtimeSecurity.turnstileEnabled) await verifyTurnstile(runtimeSecurity, parsed.body.turnstileToken, new URL(getServerEnv().appUrl).hostname, 'email-verification');
      const verification = await inTransaction(getAuthDatabase(), async (tx) => {
        const access = await authorizeOperatorCommand(tx, actor, 'superadmin');
        const user = (await tx.select({email: authUser.email, emailVerified: authUser.emailVerified}).from(authUser).where(eq(authUser.id, access.userId)).limit(1))[0];
        if (!user || user.emailVerified) throw new DomainError('CONFLICT', 'The current account is already verified or unavailable.');
        if (!(await readPublicSecuritySettings(tx)).emailDeliveryAvailable) throw new DomainError('INFRASTRUCTURE', 'Email recovery is not configured for this installation.');
        const existing = (await tx.select({id: auditEvents.id}).from(auditEvents).where(and(eq(auditEvents.actorUserId, access.userId), isNull(auditEvents.workspaceId), eq(auditEvents.commandName, 'operator.security.email-verification'), eq(auditEvents.commandKey, key))).limit(1))[0];
        if (existing) return {email: user.email, replayed: true};
        await recordOperatorAudit(tx, {actorUserId: access.userId, commandName: 'operator.security.email-verification', commandKey: key, payload: {userId: access.userId, reason: 'Send current superadmin email verification'}});
        return {email: user.email, replayed: false};
      });
      if (verification.replayed) return NextResponse.json({verificationEmailRequested: true}, {headers: {'cache-control': 'no-store'}});
      const callbackURL = new URL('/admin?view=security-settings', getServerEnv().appUrl).toString();
      const headers = new Headers(request.headers);
      headers.set('content-type', 'application/json');
      const response = await auth.handler(new Request(new URL('/api/auth/send-verification-email', getServerEnv().appUrl), {method: 'POST', headers, body: JSON.stringify({email: verification.email, callbackURL, turnstileToken: parsed.body.turnstileToken})}));
      if (!response.ok) throw new DomainError('INFRASTRUCTURE', 'The verification email could not be sent.');
      return NextResponse.json({verificationEmailRequested: true}, {headers: {'cache-control': 'no-store'}});
    }
    if (!parsed.valid || typeof parsed.body.reason !== 'string') throw new DomainError('VALIDATION', 'A change reason is required.');
    const key = commandKey(request, parsed.body);
    const input = inputFromBody(parsed.body);
    const reason = validateOperatorReason(parsed.body.reason);
    const env = getServerEnv();
    const fingerprint = (value: string | undefined, clear: boolean | undefined) => clear ? 'clear' : value?.trim() ? createHmac('sha256', env.betterAuthSecret).update(value.trim()).digest('hex') : 'unchanged';
    const auditPayload = {
      reason,
      expectedVersion: input.expectedVersion,
      emailVerificationEnabled: input.emailVerificationEnabled,
      twoFactorRequired: input.twoFactorRequired,
      turnstileEnabled: input.turnstileEnabled,
      turnstileSiteKey: input.turnstileSiteKey,
      turnstileSecretFingerprint: fingerprint(input.turnstileSecretKey, input.clearTurnstileSecret),
      smtpEnabled: input.smtpEnabled,
      smtpUrlFingerprint: fingerprint(input.smtpUrl, input.clearSmtpUrl),
      smtpFromEmail: input.smtpFromEmail ?? null,
      smtpFromName: input.smtpFromName ?? null,
    };
    const result = await inTransaction(getAuthDatabase(), async (tx) => {
      const access = await authorizeOperatorCommand(tx, actor, 'superadmin');
      if (input.emailVerificationEnabled) {
        const identity = (await tx.select({emailVerified: authUser.emailVerified}).from(authUser).where(eq(authUser.id, access.userId)).limit(1))[0];
        if (!identity?.emailVerified) throw new DomainError('CONFLICT', 'Verify the current superadmin email before enabling email verification.');
      }
      const existing = (await tx.select({semanticHash: auditEvents.semanticHash}).from(auditEvents).where(and(
        eq(auditEvents.actorUserId, access.userId), isNull(auditEvents.workspaceId),
        eq(auditEvents.commandName, 'operator.security.settings'), eq(auditEvents.commandKey, key),
      )).limit(1))[0];
      if (existing) {
        if (existing.semanticHash !== semanticHash('operator.security.settings', auditPayload)) throw new DomainError('CONFLICT', 'The idempotency key was already used for different security settings.');
        return publicSecuritySettings(await readSecuritySettings(tx));
      }
      await tx.select({id: securitySettings.id}).from(securitySettings).where(eq(securitySettings.id, 'default')).for('update');
      const settings = await updateSecuritySettings(tx, input);
      await recordOperatorAudit(tx, {
        actorUserId: access.userId,
        commandName: 'operator.security.settings',
        commandKey: key,
        payload: auditPayload,
      });
      return settings;
    });
    return NextResponse.json(result, {status: 200, headers: {'cache-control': 'no-store'}});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
