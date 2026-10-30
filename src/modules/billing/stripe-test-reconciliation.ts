import {and, eq, inArray, isNull} from 'drizzle-orm';
import type {createStripeTestEventMapper, StripeTestEventBinding, StripeTestEventDiscovery, StripeTestEventHint} from '../../adapters/billing/stripe-test-events.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingCheckoutAttempts, billingCustomerHistory, billingOrders, billingPaymentAliases, billingSubscriptions} from '../../db/schema/billing.ts';
import {inTransaction} from '../shared/transaction.ts';
import {parseBillingCatalogSnapshot, type PaymentAlias, type ReconciliationFence} from './contracts.ts';
import {findCanonicalOrderId} from './payment-aliases.ts';
import {reconcilePayment, type ReconcileResult} from './reconcile-payment.ts';
import {claimReconciliation, consumeReconciliationFence, recordReconciliationHold, resolveReconciliationScope} from './reconciliation-fence.ts';
import {mirrorSubscription} from './subscriptions.ts';

type Mapper = ReturnType<typeof createStripeTestEventMapper>;
const MAX_UNBOUND_BINDING_ATTEMPTS = 3;

type BindingResolution = Readonly<{binding: StripeTestEventBinding; rebindAttemptId?: string}>;

/** Resolve only persisted purchase terms. The current configured catalog cannot rewrite old purchases. */
async function readBinding(db: AppDatabase, discovery: StripeTestEventDiscovery, workspaceId: string): Promise<BindingResolution> {
  return inTransaction(db, async tx => {
    const aliases: PaymentAlias[] = [];
    for (const [objectKind, externalId] of [
      ['checkout_session', discovery.stripe?.billingReason === 'subscription_cycle' ? undefined : discovery.checkoutSessionId],
      ['invoice', discovery.invoiceId], ['payment_intent', discovery.paymentIntentId], ['charge', discovery.chargeId],
    ] as const) if (externalId) aliases.push({provider: 'stripe', objectKind, externalId});
    const orderId = await findCanonicalOrderId(tx, aliases);
    const order = orderId ? (await tx.select().from(billingOrders).where(eq(billingOrders.id, orderId)).limit(1))[0] : undefined;
    const subscription = discovery.externalSubscriptionId ? (await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.provider, 'stripe'), eq(billingSubscriptions.externalId, discovery.externalSubscriptionId))).limit(1))[0] : undefined;
    const sessionAttempt = discovery.checkoutSessionId ? (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'stripe'), eq(billingCheckoutAttempts.stripeSessionId, discovery.checkoutSessionId))).limit(1))[0] : undefined;
    const metadata = discovery.stripe?.checkout;
    const metadataAttempt = metadata?.attemptId ? (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'stripe'), eq(billingCheckoutAttempts.id, metadata.attemptId))).limit(1))[0] : undefined;
    if (sessionAttempt && metadataAttempt && sessionAttempt.id !== metadataAttempt.id) throw new DomainError('CONFLICT', 'Stripe event Checkout metadata conflicts with the persisted session binding.');
    if (metadataAttempt?.stripeSessionId && discovery.checkoutSessionId && metadataAttempt.stripeSessionId !== discovery.checkoutSessionId) throw new DomainError('CONFLICT', 'Stripe event Checkout metadata points to a different persisted session.');
    const attempt = sessionAttempt ?? metadataAttempt;
    const fallback = !sessionAttempt && metadataAttempt?.stripeSessionId === null ? metadataAttempt : undefined;
    const bound = order ?? subscription ?? attempt;
    if (!bound) {
      const pending = (await tx.select({id: billingCheckoutAttempts.id}).from(billingCheckoutAttempts).where(and(
        eq(billingCheckoutAttempts.provider, 'stripe'), eq(billingCheckoutAttempts.workspaceId, workspaceId),
        eq(billingCheckoutAttempts.customerId, discovery.customerId),
        isNull(billingCheckoutAttempts.stripeSessionId), inArray(billingCheckoutAttempts.status, ['creating', 'open', 'unknown']),
      )).limit(1)).length;
      if (pending) throw new DomainError('INFRASTRUCTURE', 'The Stripe purchase binding is pending; retry this delivery.');
      throw new DomainError('CONFLICT', 'Stripe event has no matching immutable purchase binding.');
    }
    if ([order, subscription, attempt].some(row => row && (row.workspaceId !== workspaceId || row.customerId !== discovery.customerId))) {
      throw new DomainError('CONFLICT', 'Stripe event has no matching immutable purchase binding.');
    }
    const catalogSnapshot = parseBillingCatalogSnapshot(bound.catalogSnapshot);
    if (metadata && ((metadata.workspaceId && metadata.workspaceId !== workspaceId) || (metadata.customerId && metadata.customerId !== discovery.customerId) ||
      (metadataAttempt && metadata.attemptId !== metadataAttempt.id) || (metadata.catalogHash && metadata.catalogHash !== catalogSnapshot.snapshotHash) ||
      (metadata.amountMinor && metadata.amountMinor !== catalogSnapshot.amountMinor) || (metadata.currency && metadata.currency !== catalogSnapshot.currency))) {
      throw new DomainError('CONFLICT', 'Stripe Checkout metadata conflicts with the persisted purchase terms.');
    }
    if (catalogSnapshot.provider !== 'stripe' || [order, subscription, attempt].some(row => row && parseBillingCatalogSnapshot(row.catalogSnapshot).snapshotHash !== catalogSnapshot.snapshotHash)) {
      throw new DomainError('CONFLICT', 'Stripe purchase catalog bindings conflict.');
    }
    const storedAliases = order ? await tx.select().from(billingPaymentAliases).where(eq(billingPaymentAliases.orderId, order.id)) : [];
    const alias = (kind: PaymentAlias['objectKind']) => storedAliases.find(row => row.objectKind === kind && !row.externalId.startsWith('subscription-period:'))?.externalId;
    return {binding: {workspaceId, customerId: discovery.customerId, catalogSnapshot,
      checkoutSessionId: discovery.checkoutSessionId ?? alias('checkout_session'), invoiceId: discovery.invoiceId ?? alias('invoice'),
      paymentIntentId: discovery.paymentIntentId ?? alias('payment_intent'), chargeId: discovery.chargeId ?? alias('charge'),
      externalSubscriptionId: discovery.externalSubscriptionId}, ...(fallback ? {rebindAttemptId: fallback.id} : {})};
  });
}

async function release(db: AppDatabase, fence: ReconciliationFence): Promise<void> {
  await db.update(billingAccounts).set({reconciliationLeaseOwner: null, reconciliationLeaseToken: null, reconciliationLeaseUntil: null}).where(and(
    eq(billingAccounts.workspaceId, fence.workspaceId), eq(billingAccounts.reconciliationLeaseToken, fence.token),
    eq(billingAccounts.reconciliationLeaseOwner, fence.owner), eq(billingAccounts.reconciliationGeneration, BigInt(fence.generation)),
  ));
}

async function hold(db: AppDatabase, hint: StripeTestEventHint, fence: ReconciliationFence, reason: string): Promise<ReconcileResult> {
  await inTransaction(db, async tx => {
    const now = new Date();
    await consumeReconciliationFence(tx, fence.workspaceId, fence, now);
    await recordReconciliationHold(tx, {workspaceId: fence.workspaceId, provider: 'stripe', externalReference: hint.eventId, reason,
      payload: {eventId: hint.eventId, eventType: hint.eventType, objectId: hint.objectId}, now});
  });
  return {eventId: hint.eventId, orderId: null, status: 'held', grantId: null, replayed: false};
}

/** Discover -> commit claim -> fetch again -> apply. Every economic apply consumes a fresh fence. */
export async function reconcileStripeTestEvent(db: AppDatabase, input: Readonly<{hint: StripeTestEventHint; mapper: Mapper; attemptNumber?: number}>): Promise<readonly ReconcileResult[]> {
  const {hint, mapper} = input;
  const discovery = await mapper.discoverIdentity(hint);
  // Other customers in the same sandbox have no authority over application tenants.
  const mapped = (await db.select({workspaceId: billingCustomerHistory.workspaceId}).from(billingCustomerHistory).where(and(eq(billingCustomerHistory.provider, 'stripe'), eq(billingCustomerHistory.customerId, discovery.customerId))).limit(1))[0];
  if (!mapped) return [];
  const workspaceId = await resolveReconciliationScope(db, discovery);
  let fence = await claimReconciliation(db, {workspaceId, owner: `stripe-event:${hint.eventId}`, leaseMs: 300_000});
  try {
    let resolution: BindingResolution;
    try {
      resolution = await readBinding(db, discovery, workspaceId);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      if (error.code === 'INFRASTRUCTURE' && (input.attemptNumber ?? 0) > MAX_UNBOUND_BINDING_ATTEMPTS) {
        return [await hold(db, hint, fence, 'Stripe Checkout binding did not arrive after retry limit; manual reconciliation is required.')];
      }
      if (error.code === 'INFRASTRUCTURE') throw error;
      return [await hold(db, hint, fence, error.publicMessage)];
    }
    const binding = resolution.binding;

    if (hint.objectType === 'subscription') {
      let observation;
      try {
        observation = await mapper.normalizeSubscription(discovery, binding, fence);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        return [await hold(db, hint, fence, 'unsupported-stripe-subscription-observation')];
      }
      if (observation) await mirrorSubscription(db, observation);
      return [];
    }

    let observations;
    try {
      observations = await mapper.normalize(discovery, binding, fence);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return [await hold(db, hint, fence, 'unverified-stripe-payment-observation')];
    }
    if (!observations.length) return [];

    const results: ReconcileResult[] = [];
    for (let index = 0; index < observations.length; index++) {
      let observation = observations[index]!;
      if (index > 0) {
        fence = await claimReconciliation(db, {workspaceId, owner: `stripe-event:${hint.eventId}`, leaseMs: 300_000});
        const selected = await mapper.normalize(discovery, binding, fence, {refundId: observation.refundId});
        if (selected.length !== 1 || selected[0]!.refundId !== observation.refundId) throw new DomainError('CONFLICT', 'Stripe refund evidence changed during reconciliation.');
        observation = selected[0]!;
      }
      const repair = resolution.rebindAttemptId && ['checkout.completed', 'invoice.paid', 'payment_intent.succeeded'].includes(observation.eventType)
        ? {checkoutAttemptId: resolution.rebindAttemptId} : {};
      results.push(await reconcilePayment(db, {...observation, ...repair}));
    }
    return results;
  } finally {
    // A consumed or superseded claim is a no-op; only this exact generation can be released.
    await release(db, fence);
  }
}
