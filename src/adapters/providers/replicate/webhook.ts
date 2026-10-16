import {createHmac, timingSafeEqual} from 'node:crypto';

import {DomainError} from '../../../db/contracts.ts';
import {normalizeObservation} from '../normalize.ts';
import type {ProviderRequestRef, VerifiedObservation} from '../port.ts';
import {assertReplicateAccountBinding, replicateSigningKey, type ReplicateAccountBinding} from './account-binding.ts';

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_TOLERANCE_SECONDS = 300;

export type ReplicateWebhookOptions = Readonly<{
  secret: string;
  binding?: ReplicateAccountBinding;
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

function verifySignature(rawBody: Uint8Array, headers: Headers, options: ReplicateWebhookOptions): {eventId: string; timestamp: number} {
  if (!options.secret.trim()) throw new DomainError('INFRASTRUCTURE', 'Replicate webhook verification is not configured.');
  assertReplicateAccountBinding(options.binding, options.secret, options.now);
  const eventId = header(headers, 'webhook-id');
  const timestampText = header(headers, 'webhook-timestamp');
  const timestamp = Number(timestampText);
  const nowMs = (options.now ?? new Date()).getTime();
  if (!/^\d+$/.test(timestampText) || !Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp * 1000) > (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000) {
    throw new DomainError('FORBIDDEN', 'Replicate webhook timestamp is stale.');
  }
  const expected = createHmac('sha256', replicateSigningKey(options.secret)).update(`${eventId}.${timestampText}.`).update(rawBody).digest('base64');
  const candidates = header(headers, 'webhook-signature').split(/\s+/).flatMap(entry => /^v1,[A-Za-z0-9+/]+={0,2}$/.test(entry) ? [entry.slice(3)] : []);
  const matches = candidates.some((candidate) => {
    const actual = Buffer.from(candidate, 'base64');
    const wanted = Buffer.from(expected, 'base64');
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
  if (!matches) throw new DomainError('FORBIDDEN', 'Replicate webhook signature is invalid.');
  return {eventId, timestamp};
}

function requestId(body: Record<string, unknown>): string {
  const requestId = body.id;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) throw new DomainError('FORBIDDEN', 'Replicate webhook request identity is invalid.');
  return requestId;
}

export function verifyReplicateWebhook(rawBody: Uint8Array, headers: Headers, ref: ProviderRequestRef, options: ReplicateWebhookOptions): VerifiedObservation {
  if (ref.provider !== 'replicate') throw new DomainError('VALIDATION', 'The persisted provider reference is not Replicate.');
  const identity = verifyReplicateWebhookWithoutRef(rawBody, headers, options);
  if (identity.requestId !== ref.requestId) throw new DomainError('CONFLICT', 'Replicate webhook request identity does not match the persisted attempt.');
  const observation = normalizeObservation(ref, identity.body);
  return Object.freeze({observation, eventId: identity.eventId, accountId: identity.accountId, attemptNonce: identity.attemptNonce, authenticatedAt: (options.now ?? new Date()).toISOString()});
}

export function verifyReplicateWebhookWithoutRef(rawBody: Uint8Array, headers: Headers, options: ReplicateWebhookOptions): Readonly<{eventId: string; requestId: string; attemptNonce: string; accountId: string; body: Record<string, unknown>}> {
  const {eventId} = verifySignature(rawBody, headers, options);
  const body = json(rawBody);
  const id = requestId(body);
  const attemptNonce = options.expectedAttemptNonce;
  if (!attemptNonce || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptNonce)) throw new DomainError('CONFLICT', 'Replicate webhook issued attempt correlation is missing or invalid.');
  // The route nonce is private correlation data; Replicate does not sign the destination URL.
  return Object.freeze({eventId, requestId: id, attemptNonce, accountId: options.binding!.accountId, body});
}
