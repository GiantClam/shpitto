import {createHmac, timingSafeEqual} from 'node:crypto';

import {DomainError} from '../../../db/contracts.ts';
import {normalizeObservation} from '../normalize.ts';
import type {ProviderObservation, ProviderRequestRef, VerifiedObservation} from '../port.ts';

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_TOLERANCE_SECONDS = 300;

export type ReplicateWebhookOptions = Readonly<{
  secret: string;
  expectedAccountId?: string;
  expectedAttemptNonce?: string;
  now?: Date;
  toleranceSeconds?: number;
}>;

function header(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim() ?? '';
  if (!value) throw new DomainError('FORBIDDEN', `Missing Replicate webhook header: ${name}.`);
  return value;
}

function json(rawBody: Uint8Array): Record<string, unknown> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'Replicate webhook body is outside the bounded size.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(rawBody)); } catch { throw new DomainError('VALIDATION', 'Replicate webhook body is invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('VALIDATION', 'Replicate webhook body must be an object.');
  return value as Record<string, unknown>;
}

function secretBytes(value: string): Uint8Array {
  const encoded = value.startsWith('whsec_') ? value.slice(6) : value;
  try {
    const decoded = Buffer.from(encoded, 'base64');
    return decoded.byteLength > 0 ? decoded : Buffer.from(value, 'utf8');
  } catch {
    return Buffer.from(value, 'utf8');
  }
}

function verifySignature(rawBody: Uint8Array, headers: Headers, options: ReplicateWebhookOptions): {eventId: string; timestamp: number} {
  if (!options.secret.trim()) throw new DomainError('INFRASTRUCTURE', 'Replicate webhook verification is not configured.');
  const eventId = header(headers, 'webhook-id');
  const timestampText = header(headers, 'webhook-timestamp');
  const timestamp = Number(timestampText);
  const nowMs = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(timestamp) || Math.abs(nowMs - timestamp * 1000) > (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000) {
    throw new DomainError('FORBIDDEN', 'Replicate webhook timestamp is stale.');
  }
  const signed = `${eventId}.${timestamp}.${new TextDecoder().decode(rawBody)}`;
  const expected = createHmac('sha256', secretBytes(options.secret)).update(signed).digest('base64');
  const candidates = header(headers, 'webhook-signature').split(/[ ,]+/).filter(Boolean).map((entry) => entry.replace(/^v\d+,/, ''));
  const matches = candidates.some((candidate) => {
    const actual = Buffer.from(candidate, 'base64');
    const wanted = Buffer.from(expected, 'base64');
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
  if (!matches) throw new DomainError('FORBIDDEN', 'Replicate webhook signature is invalid.');
  return {eventId, timestamp};
}

function requestRef(body: Record<string, unknown>): {requestId: string; attemptNonce: string; accountId: string} {
  const requestId = body.id;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) throw new DomainError('FORBIDDEN', 'Replicate webhook request identity is invalid.');
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  const attemptNonce = typeof metadata.attempt_nonce === 'string' ? metadata.attempt_nonce : '';
  const accountId = typeof body.account_id === 'string' ? body.account_id : '';
  return {requestId, attemptNonce, accountId};
}

export function verifyReplicateWebhook(rawBody: Uint8Array, headers: Headers, ref: ProviderRequestRef, options: ReplicateWebhookOptions): VerifiedObservation {
  if (ref.provider !== 'replicate') throw new DomainError('VALIDATION', 'The persisted provider reference is not Replicate.');
  const {eventId} = verifySignature(rawBody, headers, options);
  const body = json(rawBody);
  const identity = requestRef(body);
  if (identity.requestId !== ref.requestId) throw new DomainError('CONFLICT', 'Replicate webhook request identity does not match the persisted attempt.');
  if (options.expectedAccountId && identity.accountId !== options.expectedAccountId) throw new DomainError('FORBIDDEN', 'Replicate webhook account identity is not trusted.');
  if (options.expectedAttemptNonce && identity.attemptNonce && identity.attemptNonce !== options.expectedAttemptNonce) throw new DomainError('CONFLICT', 'Replicate webhook attempt identity does not match.');
  const attemptNonce = options.expectedAttemptNonce ?? identity.attemptNonce;
  if (!attemptNonce) throw new DomainError('CONFLICT', 'Replicate webhook attempt correlation is missing.');
  const observation = normalizeObservation(ref, body);
  return Object.freeze({observation, eventId, accountId: identity.accountId, attemptNonce, authenticatedAt: new Date().toISOString()});
}

export function verifyReplicateWebhookWithoutRef(rawBody: Uint8Array, headers: Headers, options: ReplicateWebhookOptions): Readonly<{eventId: string; requestId: string; attemptNonce: string; accountId: string; body: Record<string, unknown>}> {
  const {eventId} = verifySignature(rawBody, headers, options);
  const body = json(rawBody);
  const identity = requestRef(body);
  if (options.expectedAccountId && identity.accountId !== options.expectedAccountId) throw new DomainError('FORBIDDEN', 'Replicate webhook account identity is not trusted.');
  if (options.expectedAttemptNonce && identity.attemptNonce !== options.expectedAttemptNonce) throw new DomainError('CONFLICT', 'Replicate webhook attempt identity does not match.');
  return Object.freeze({eventId, requestId: identity.requestId, attemptNonce: options.expectedAttemptNonce ?? identity.attemptNonce, accountId: identity.accountId, body});
}
