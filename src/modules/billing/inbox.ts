import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingWebhookInbox} from '../../db/schema/billing.ts';
import {inTransaction} from '../shared/transaction.ts';
import {parseVerifiedBillingEvent, verifyStripeSignature, type VerifiedBillingEvent} from '../../adapters/billing/stripe-webhooks.ts';
import {reconcilePayment, type PaymentEventType, type ReconcileResult} from './reconcile-payment.ts';

const EVENT_TYPES = new Set<PaymentEventType>(['checkout.completed', 'invoice.paid', 'payment_intent.succeeded', 'payment.failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.lost', 'charge.dispute.reversed']);
const RECEIVED_RETRY_AFTER_MS = 60_000;

function eventInput(event: VerifiedBillingEvent): Parameters<typeof reconcilePayment>[1] {
  const object = (event.payload.data as {object: Record<string, unknown>}).object;
  const text = (key: string): string | undefined => typeof object[key] === 'string' ? object[key] as string : undefined;
  const eventType = event.eventType as PaymentEventType;
  if (!EVENT_TYPES.has(eventType)) throw new DomainError('VALIDATION', 'Webhook event type is unsupported.');
  return {
    provider: 'fixture', eventId: event.eventId, eventType,
    workspaceId: text('workspaceId'), customerId: text('customerId'), checkoutSessionId: text('checkoutSessionId'), invoiceId: text('invoiceId'), paymentIntentId: text('paymentIntentId'), chargeId: text('chargeId'), productKey: text('productKey'), amountMinor: text('amountMinor'), currency: text('currency'), periodStart: text('periodStart'), periodEnd: text('periodEnd'), externalSubscriptionId: text('externalSubscriptionId'), relatedEventId: text('relatedEventId'), refundId: text('refundId'), disputeId: text('disputeId'), economicLossId: text('economicLossId'), paidAt: text('paidAt'),
  };
}

export type IngestWebhookResult = Readonly<{eventId: string; duplicate: boolean; reconciliation: ReconcileResult | null}>;

/** Verify, persist delivery identity, then pass the sanitized event to reconciliation. */
export async function ingestStripeWebhook(db: AppDatabase, input: Readonly<{rawBody: Uint8Array; signatureHeader: string | null; secret: string; now?: Date}>): Promise<IngestWebhookResult> {
  const now = input.now ?? new Date();
  verifyStripeSignature(input.rawBody, input.signatureHeader, input.secret, now);
  const event = parseVerifiedBillingEvent(input.rawBody);
  const recorded = await inTransaction(db, async (tx) => {
    const existing = await tx.select({id: billingWebhookInbox.id, payloadHash: billingWebhookInbox.payloadHash, status: billingWebhookInbox.status, receivedAt: billingWebhookInbox.receivedAt}).from(billingWebhookInbox).where(and(eq(billingWebhookInbox.provider, event.provider), eq(billingWebhookInbox.externalEventId, event.eventId))).for('update').limit(1);
    if (existing[0]) {
      if (existing[0].payloadHash !== event.payloadHash) throw new DomainError('CONFLICT', 'A webhook event id was reused with a different payload.');
      const staleReceived = existing[0].status === 'received' && now.getTime() - existing[0].receivedAt.getTime() >= RECEIVED_RETRY_AFTER_MS;
      if (existing[0].status === 'failed' || staleReceived) {
        await tx.update(billingWebhookInbox).set({status: 'received', receivedAt: now, processedAt: null}).where(eq(billingWebhookInbox.id, existing[0].id));
        return {duplicate: false};
      }
      return {duplicate: true};
    }
    await tx.insert(billingWebhookInbox).values({id: randomUUID(), provider: event.provider, externalEventId: event.eventId, eventType: event.eventType, payloadHash: event.payloadHash, payload: event.payload, status: 'received', receivedAt: now, processedAt: null});
    return {duplicate: false};
  });
  if (recorded.duplicate) return {eventId: event.eventId, duplicate: true, reconciliation: null};
  try {
    const reconciliation = await reconcilePayment(db, eventInput(event), now);
    await inTransaction(db, async (tx) => {
      await tx.update(billingWebhookInbox).set({status: 'processed', processedAt: now}).where(and(eq(billingWebhookInbox.provider, event.provider), eq(billingWebhookInbox.externalEventId, event.eventId)));
    });
    return {eventId: event.eventId, duplicate: false, reconciliation};
  } catch (error) {
    await inTransaction(db, async (tx) => {
      await tx.update(billingWebhookInbox).set({status: 'failed', processedAt: now}).where(and(eq(billingWebhookInbox.provider, event.provider), eq(billingWebhookInbox.externalEventId, event.eventId)));
    });
    throw error;
  }
}
