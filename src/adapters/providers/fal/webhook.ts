import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';

import {DomainError} from '../../../db/contracts.ts';
import {normalizeObservation} from '../normalize.ts';
import type {ProviderRequestRef, VerifiedObservation} from '../port.ts';

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_TOLERANCE_SECONDS = 300;

export type FalWebhookOptions = Readonly<{
  publicKeyPem?: string;
  jwks?: Readonly<Record<string, JsonWebKey>>;
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

function parseBody(rawBody: Uint8Array): Record<string, unknown> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'fal webhook body is outside the bounded size.');
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new DomainError('VALIDATION', 'fal webhook body is invalid JSON.');
  }
}

function signatureBytes(value: string): Buffer {
  const normalized = value.replace(/^ed25519[=:]/i, '').trim();
  if (/^[a-f0-9]{128}$/i.test(normalized)) return Buffer.from(normalized, 'hex');
  try {
    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length !== 64) throw new Error('length');
    return bytes;
  } catch { throw new DomainError('FORBIDDEN', 'fal webhook signature is invalid.'); }
}

function verify(rawBody: Uint8Array, headers: Headers, options: FalWebhookOptions): {eventId: string; timestamp: number; accountId: string} {
  if (!options.publicKeyPem?.trim() && !options.jwks) throw new DomainError('INFRASTRUCTURE', 'fal webhook verification is not configured.');
  const modernRequestId = headers.get('x-fal-webhook-request-id')?.trim();
  const modernUserId = headers.get('x-fal-webhook-user-id')?.trim();
  const modern = Boolean(modernRequestId || modernUserId);
  const eventId = modern
    ? header(headers, 'x-fal-webhook-request-id')
    : header(headers, 'x-fal-webhook-id', 'x-fal-event-id', 'x-webhook-id');
  const accountId = modern
    ? header(headers, 'x-fal-webhook-user-id')
    : (headers.get('x-fal-webhook-user-id')?.trim() ?? '');
  const timestampText = modern
    ? header(headers, 'x-fal-webhook-timestamp')
    : header(headers, 'x-fal-webhook-timestamp', 'x-fal-timestamp', 'x-webhook-timestamp');
  const timestamp = Number(timestampText);
  const nowMs = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(timestamp) || Math.abs(nowMs - timestamp * 1000) > (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000) throw new DomainError('FORBIDDEN', 'fal webhook timestamp is stale.');
  const signature = signatureBytes(header(headers, 'x-fal-webhook-signature', 'x-fal-signature', 'x-webhook-signature'));
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const canonical = modern ? `${eventId}\n${accountId}\n${timestamp}\n${digest}` : `${eventId}.${timestamp}.${digest}`;
  try {
    const key = options.publicKeyPem?.trim()
      ? createPublicKey(options.publicKeyPem)
      : (() => {
        const keyId = header(headers, 'x-fal-key-id', 'x-fal-kid');
        const fetchedAt = options.jwksFetchedAt?.getTime() ?? 0;
        if (!fetchedAt || nowMs - fetchedAt > 24 * 60 * 60 * 1000) throw new Error('stale jwks');
        const jwk = options.jwks?.[keyId];
        if (!jwk) throw new Error('unknown jwk');
        return createPublicKey({key: jwk as never, format: 'jwk'});
      })();
    if (!verifySignature(null, Buffer.from(canonical, 'utf8'), key, signature)) throw new Error('invalid');
  } catch {
    throw new DomainError('FORBIDDEN', 'fal webhook signature is invalid.');
  }
  return {eventId, timestamp, accountId};
}

function identity(body: Record<string, unknown>): {requestId: string; attemptNonce: string; accountId: string} {
  const requestId = body.request_id ?? body.id;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) throw new DomainError('FORBIDDEN', 'fal webhook request identity is invalid.');
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  return {requestId, attemptNonce: typeof metadata.attempt_nonce === 'string' ? metadata.attempt_nonce : '', accountId: typeof body.account_id === 'string' ? body.account_id : (typeof body.user_id === 'string' ? body.user_id : '')};
}

export function verifyFalWebhook(rawBody: Uint8Array, headers: Headers, ref: ProviderRequestRef, options: FalWebhookOptions): VerifiedObservation {
  if (ref.provider !== 'fal') throw new DomainError('VALIDATION', 'The persisted provider reference is not fal.');
  const {eventId, accountId: headerAccountId} = verify(rawBody, headers, options);
  const body = parseBody(rawBody);
  const current = identity(body);
  if (current.requestId !== ref.requestId) throw new DomainError('CONFLICT', 'fal webhook request identity does not match the persisted attempt.');
  const accountId = current.accountId || headerAccountId;
  if (options.expectedAccountId && accountId !== options.expectedAccountId) throw new DomainError('FORBIDDEN', 'fal webhook account identity is not trusted.');
  if (options.expectedAttemptNonce && current.attemptNonce && current.attemptNonce !== options.expectedAttemptNonce) throw new DomainError('CONFLICT', 'fal webhook attempt identity does not match.');
  const attemptNonce = options.expectedAttemptNonce ?? current.attemptNonce;
  if (!attemptNonce) throw new DomainError('CONFLICT', 'fal webhook attempt correlation is missing.');
  return Object.freeze({observation: normalizeObservation(ref, body), eventId, accountId, attemptNonce, authenticatedAt: new Date().toISOString()});
}
