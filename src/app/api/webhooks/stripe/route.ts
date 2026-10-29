import {getAuthDatabase} from '../../../../lib/auth.ts';
import {ingestStripeWebhook} from '../../../../modules/billing/inbox.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {getServerEnv} from '../../../../config/env.ts';
import {safeError, safeSuccess} from '../../workspaces/_shared.ts';
import {getStripeTestEventRuntime} from '../../../../modules/billing/runtime.ts';
import {verifyStripeTestWebhook} from '../../../../adapters/billing/stripe-test-ingress.ts';
import {processStripeTestDelivery} from '../../../../modules/billing/stripe-test-inbox.ts';
import {reconcileStripeTestEvent} from '../../../../modules/billing/stripe-test-reconciliation.ts';

export const runtime = 'nodejs';

/** Explicit test-mode ingress is isolated from the offline fixture and commercial production. */
export async function POST(request: Request) {
  try {
    const stripe = getStripeTestEventRuntime();
    if (stripe) {
      const rawBody = new Uint8Array(await request.arrayBuffer());
      const verified = verifyStripeTestWebhook(rawBody, request.headers.get('stripe-signature'), stripe.configuration.webhookSecret);
      const db = getAuthDatabase();
      const result = await processStripeTestDelivery(db, {eventId: verified.hint.eventId, eventType: verified.hint.eventType,
        objectId: verified.hint.objectId, payloadHash: verified.payloadHash,
        process: () => reconcileStripeTestEvent(db, {hint: verified.hint, mapper: stripe.mapper})});
      return safeSuccess(result, result.duplicate ? 200 : 202);
    }
    const env = getServerEnv();
    if (env.nodeEnv === 'production') throw new DomainError('FORBIDDEN', 'The local billing webhook is disabled in production.');
    const secret = env.billingWebhookSecret;
    if (!secret) throw new DomainError('INFRASTRUCTURE', 'Billing webhook verification is not configured.');
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const result = await ingestStripeWebhook(getAuthDatabase(), {rawBody, signatureHeader: request.headers.get('stripe-signature'), secret});
    return safeSuccess(result, result.duplicate ? 200 : 202);
  } catch (error) {
    return safeError(error);
  }
}
