import {createHmac, timingSafeEqual} from 'node:crypto';

import type {AffiliateConfig, ReferralTouch} from './contracts.ts';

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type TokenPayload = Readonly<{affiliateId: string; touchReference: string; programId: string; capturedAt: string; expiresAt: string}>;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(value: string): TokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TokenPayload> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.affiliateId !== 'string' || typeof parsed.touchReference !== 'string' || typeof parsed.programId !== 'string' || typeof parsed.capturedAt !== 'string' || typeof parsed.expiresAt !== 'string') return null;
    return parsed as TokenPayload;
  } catch { return null; }
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createReferralToken(touch: Readonly<{affiliateId: string; touchReference: string; programId: string}>, secret: string, now = new Date()): string {
  if (!secret.trim()) throw new Error('Referral signing secret is required.');
  if (!Object.values(touch).every((value) => value.trim() === value && value.length > 0 && value.length <= 255 && !/[\u0000-\u001f\u007f]/.test(value))) throw new Error('Referral fields must be bounded nonempty identifiers.');
  if (!Number.isFinite(now.getTime())) throw new Error('Referral capture time is invalid.');
  const capturedAt = now;
  const expiresAt = new Date(now.getTime() + MAX_AGE_MS);
  const payload = encode({affiliateId: touch.affiliateId, touchReference: touch.touchReference, programId: touch.programId, capturedAt: capturedAt.toISOString(), expiresAt: expiresAt.toISOString()});
  return payload + '.' + signature(payload, secret);
}

export function verifyReferralToken(token: string, secret: string, config: Pick<AffiliateConfig, 'programId'>, now = new Date()): ReferralTouch | null {
  if (!token || token.length > 4096 || !secret.trim() || !config.programId || !Number.isFinite(now.getTime()) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = signature(payload, secret);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const decoded = decode(payload);
  if (!decoded || decoded.programId !== config.programId) return null;
  if (![decoded.affiliateId, decoded.touchReference, decoded.programId].every((value) => value.trim() === value && value.length > 0 && value.length <= 255 && !/[\u0000-\u001f\u007f]/.test(value))) return null;
  const capturedAt = new Date(decoded.capturedAt);
  const expiresAt = new Date(decoded.expiresAt);
  if (Number.isNaN(capturedAt.getTime()) || Number.isNaN(expiresAt.getTime()) || capturedAt > now || expiresAt <= now || expiresAt <= capturedAt || expiresAt.getTime() - capturedAt.getTime() > MAX_AGE_MS || now.getTime() - capturedAt.getTime() > MAX_AGE_MS) return null;
  return {affiliateId: decoded.affiliateId, touchReference: decoded.touchReference, programId: decoded.programId, capturedAt, expiresAt};
}

export function chooseLastValidTouch(touches: readonly ReferralTouch[], now = new Date()): ReferralTouch | null {
  return [...touches].filter((touch) => touch.expiresAt > now && touch.capturedAt <= now).sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime() || right.touchReference.localeCompare(left.touchReference))[0] ?? null;
}

export function bindAttribution(current: Readonly<{workspaceId: string; touchReference: string | null}> | null, workspaceId: string, touch: ReferralTouch | null): Readonly<{workspaceId: string; touchReference: string | null}> {
  if (current) return current;
  return {workspaceId, touchReference: touch?.touchReference ?? null};
}
