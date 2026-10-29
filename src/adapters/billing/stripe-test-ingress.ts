import {createHash} from 'node:crypto';
import Stripe from 'stripe';
import {DomainError} from '../../db/contracts.ts';
import {parseWebhookEvent} from './stripe-test-events.ts';

/** SDK verification supports rotated v1 signatures. Fixture envelopes never enter this adapter. */
export function verifyStripeTestWebhook(rawBody: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !secret.startsWith('whsec_') || rawBody.byteLength === 0 || rawBody.byteLength > 256 * 1024) {
    throw new DomainError('FORBIDDEN', 'Stripe test webhook verification is unavailable.');
  }
  try {Stripe.webhooks.constructEvent(Buffer.from(rawBody), signature, secret);}
  catch {throw new DomainError('FORBIDDEN', 'Stripe webhook signature is invalid or expired.');}
  try {return {hint: parseWebhookEvent(rawBody), payloadHash: createHash('sha256').update(rawBody).digest('hex')};}
  catch {throw new DomainError('VALIDATION', 'The Stripe test event identity or mode is unsupported.');}
}
