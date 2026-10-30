import {randomUUID} from 'node:crypto';
import {and, eq} from 'drizzle-orm';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingWebhookInbox} from '../../db/schema/billing.ts';
import {inTransaction} from '../shared/transaction.ts';
import type {ReconcileResult} from './reconcile-payment.ts';

type Receipt = Readonly<{eventId: string; eventType: string; objectId: string; payloadHash: string}>;
const STALE_AFTER_MS = 120_000;
export const STRIPE_DELIVERY_RETRY_LIMIT = 3;
type DeliveryContext = Readonly<{attemptNumber: number; retryLimit: number}>;

/** Called only after Stripe signature/test-mode verification. Stores delivery identity, not metadata authority. */
export async function processStripeTestDelivery(db: AppDatabase, input: Receipt & Readonly<{
  now?: Date;
  process: (context: DeliveryContext) => Promise<readonly ReconcileResult[]>;
}>): Promise<Readonly<{eventId: string; duplicate: boolean; reconciliation: readonly ReconcileResult[]}>> {
  if (!/^evt_[A-Za-z0-9_-]{1,240}$/.test(input.eventId) || !/^[a-f0-9]{64}$/.test(input.payloadHash) || input.eventType.length > 100 || input.objectId.length > 255) {
    throw new DomainError('VALIDATION', 'Stripe delivery identity is invalid.');
  }
  const now = input.now ?? new Date();
  const identity = and(eq(billingWebhookInbox.provider, 'stripe'), eq(billingWebhookInbox.externalEventId, input.eventId));
  const attempt = await inTransaction(db, async tx => {
    const inserted = await tx.insert(billingWebhookInbox).values({id: randomUUID(), provider: 'stripe', externalEventId: input.eventId,
      eventType: input.eventType, payloadHash: input.payloadHash, payload: {id: input.eventId, type: input.eventType, objectId: input.objectId, retryCount: 1},
      status: 'received', receivedAt: now, processedAt: null}).onConflictDoNothing().returning({id: billingWebhookInbox.id});
    if (inserted.length) return {duplicate: false, attemptNumber: 1};
    const existing = (await tx.select().from(billingWebhookInbox).where(identity).for('update').limit(1))[0];
    if (!existing || existing.payloadHash !== input.payloadHash) throw new DomainError('CONFLICT', 'A Stripe event id was reused with a different payload.');
    if (existing.status === 'processed') return {duplicate: true, attemptNumber: 0};
    if (existing.status === 'received' && now.getTime() - existing.receivedAt.getTime() < STALE_AFTER_MS) {
      throw new DomainError('INFRASTRUCTURE', 'This Stripe delivery is still being processed.');
    }
    const payload = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload as Record<string, unknown> : {};
    const previousAttempts = typeof payload.retryCount === 'number' && Number.isSafeInteger(payload.retryCount) && payload.retryCount >= 0 ? payload.retryCount : 0;
    const attemptNumber = previousAttempts + 1;
    await tx.update(billingWebhookInbox).set({status: 'received', receivedAt: now, processedAt: null, payload: {...payload, retryCount: attemptNumber}}).where(identity);
    return {duplicate: false, attemptNumber};
  });
  if (attempt.duplicate) return {eventId: input.eventId, duplicate: true, reconciliation: []};
  const owned = and(identity, eq(billingWebhookInbox.status, 'received'), eq(billingWebhookInbox.receivedAt, now));
  try {
    const reconciliation = await input.process({attemptNumber: attempt.attemptNumber, retryLimit: STRIPE_DELIVERY_RETRY_LIMIT});
    await db.update(billingWebhookInbox).set({status: 'processed', processedAt: new Date()}).where(owned);
    return {eventId: input.eventId, duplicate: false, reconciliation};
  } catch (error) {
    await db.update(billingWebhookInbox).set({status: 'failed', processedAt: new Date()}).where(owned);
    throw error;
  }
}
