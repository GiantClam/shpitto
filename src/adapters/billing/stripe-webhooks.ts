import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

import {DomainError} from '../../db/contracts.ts';

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type VerifiedBillingEvent = Readonly<{
  provider: 'fixture';
  eventId: string;
  eventType: 'checkout.completed' | 'invoice.paid' | 'payment_intent.succeeded' | 'payment.failed' | 'charge.refunded' | 'charge.dispute.created' | 'charge.dispute.reversed';
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
}>;

function boundedIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) {
    throw new DomainError('VALIDATION', `${field} is invalid.`);
  }
  return value;
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DomainError('VALIDATION', 'Webhook payload must be an object.');
  }
  return value as Record<string, unknown>;
}

function parseHeader(value: string): Readonly<{timestamp: number; signature: string}> {
  const parts = new Map(value.split(',').map((part) => part.split('=', 2) as [string, string]));
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1') ?? '';
  if (!Number.isSafeInteger(timestamp) || signature.length !== 64 || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new DomainError('FORBIDDEN', 'Webhook signature is invalid.');
  }
  return {timestamp, signature};
}

/** Verify the raw request bytes using a Stripe-compatible signed payload. */
export function verifyStripeSignature(rawBody: Uint8Array, signatureHeader: string | null, secret: string, now = new Date()): void {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_WEBHOOK_BYTES || !secret.trim()) {
    throw new DomainError('FORBIDDEN', 'Webhook verification is unavailable.');
  }
  if (!signatureHeader) throw new DomainError('FORBIDDEN', 'Webhook signature is required.');
  const {timestamp, signature} = parseHeader(signatureHeader);
  if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new DomainError('FORBIDDEN', 'Webhook signature has expired.');
  }
  const signed = `${timestamp}.${Buffer.from(rawBody).toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new DomainError('FORBIDDEN', 'Webhook signature is invalid.');
  }
}

export function signFixtureWebhook(rawBody: Uint8Array, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signed = `${timestamp}.${Buffer.from(rawBody).toString('utf8')}`;
  const signature = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/** Parse and minimize an already authenticated event. No browser payload is accepted here. */
export function parseVerifiedBillingEvent(rawBody: Uint8Array): VerifiedBillingEvent {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    throw new DomainError('VALIDATION', 'Webhook payload exceeds the local limit.');
  }
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(rawBody).toString('utf8')); } catch { throw new DomainError('VALIDATION', 'Webhook payload is not valid JSON.'); }
  const body = plainObject(decoded);
  const eventId = boundedIdentifier(body.id, 'event id');
  const eventType = body.type;
  if (!['checkout.completed', 'invoice.paid', 'payment_intent.succeeded', 'payment.failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.reversed'].includes(eventType as string)) {
    throw new DomainError('VALIDATION', 'Webhook event type is unsupported.');
  }
  const data = plainObject(body.data);
  const object = plainObject(data.object);
  // The fixture accepts only the fields the reconciler can prove. Unknown fields are ignored after authentication.
  const allowed: Record<string, unknown> = {id: eventId, type: eventType, data: {object}};
  return Object.freeze({
    provider: 'fixture' as const,
    eventId,
    eventType: eventType as VerifiedBillingEvent['eventType'],
    payload: Object.freeze(allowed),
    payloadHash: createHash('sha256').update(rawBody).digest('hex'),
  });
}
