import {createHash, randomUUID} from 'node:crypto';

import {and, eq, inArray, isNull, or, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {serializeJsonValue} from '../../contracts/http.ts';
import {billingAccounts, billingCashEvents, billingCheckoutAttempts, billingCustomerHistory, billingOrders, billingPaymentAliases, billingReconciliationCases, billingSubscriptions} from '../../db/schema/billing.ts';
import {creditGrants} from '../../db/schema/workspace.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {issueGrantInTransaction} from '../credits/ledger.ts';
import {snapshotBillingProduct} from '../../config/plans.ts';
import {parseBillingCatalogSnapshot, parseMoneyMinor, type BillingCatalogSnapshot, type PaymentAlias, type ReconciliationFence} from './contracts.ts';
import {attachPaymentAliases, findCanonicalOrderId} from './payment-aliases.ts';
import {recordBillingRecoveryInTransaction} from './recovery.ts';
import {recordAffiliatePaymentInTransaction} from '../affiliates/runtime.ts';
import {consumeReconciliationFence, recordReconciliationHold, resolveReconciliationScope} from './reconciliation-fence.ts';

export type PaymentEventType = 'checkout.completed' | 'invoice.paid' | 'payment_intent.succeeded' | 'payment.failed' | 'charge.refunded' | 'charge.dispute.created' | 'charge.dispute.lost' | 'charge.dispute.reversed';

export type PaymentObservation = Readonly<{
  provider: 'fixture' | 'stripe';
  eventId: string;
  eventType: PaymentEventType;
  workspaceId?: string;
  customerId?: string;
  checkoutSessionId?: string;
  invoiceId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  productKey?: string;
  amountMinor?: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  externalSubscriptionId?: string;
  relatedEventId?: string;
  refundId?: string;
  disputeId?: string;
  economicLossId?: string;
  /** Effective provider payment time; receipt time is not history completeness. */
  paidAt?: string;
  fence?: ReconciliationFence;
  /** Server-only authoritative mapper evidence, never copied from webhook metadata. */
  stripe?: Readonly<{
    supported: boolean;
    priceReference: string;
    /** Original canonical paid amount, separate from the incremental recovery amount. */
    paymentAmountMinor: string;
    billingReason?: 'subscription_create' | 'subscription_cycle';
  }>;
}>;

export type ReconcileResult = Readonly<{
  eventId: string;
  orderId: string | null;
  status: 'paid' | 'failed' | 'held' | 'duplicate' | 'recovery';
  grantId: string | null;
  replayed: boolean;
}>;

const PAID_EVENTS = new Set<PaymentEventType>(['checkout.completed', 'invoice.paid', 'payment_intent.succeeded']);
const RECOVERY_EVENTS = new Set<PaymentEventType>(['charge.refunded', 'charge.dispute.created', 'charge.dispute.lost', 'charge.dispute.reversed']);
const RESOLVABLE_STRIPE_PAID_CASE_REASONS = [
  'Stripe paid semantics, price, amount, or currency are unverified.',
  'unverified-stripe-payment-observation',
] as const;

function id(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) throw new DomainError('VALIDATION', `${field} is invalid.`);
  return value;
}

function iso(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DomainError('VALIDATION', `${field} is invalid.`);
  return date;
}

function aliases(input: PaymentObservation): PaymentAlias[] {
  const result: PaymentAlias[] = [];
  if (input.checkoutSessionId && !(input.provider === 'stripe' && input.stripe?.billingReason === 'subscription_cycle')) result.push({provider: input.provider, objectKind: 'checkout_session', externalId: input.checkoutSessionId});
  if (input.invoiceId) result.push({provider: input.provider, objectKind: 'invoice', externalId: input.invoiceId});
  if (input.paymentIntentId) result.push({provider: input.provider, objectKind: 'payment_intent', externalId: input.paymentIntentId});
  if (input.chargeId) result.push({provider: input.provider, objectKind: 'charge', externalId: input.chargeId});
  if (result.length === 0) throw new DomainError('VALIDATION', 'At least one payment alias is required.');
  return result;
}

async function lockAccount(tx: TransactionDatabase, workspaceId: string, now: Date): Promise<typeof billingAccounts.$inferSelect> {
  const rows = await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).for('update').limit(1);
  const account = rows[0];
  if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
  const generation = account.reconciliationGeneration + 1n;
  await tx.update(billingAccounts).set({
    reconciliationLeaseOwner: `local-reconciler:${workspaceId}`,
    reconciliationLeaseToken: randomUUID(),
    reconciliationGeneration: generation,
    reconciliationLeaseUntil: new Date(now.getTime() + 60_000),
    updatedAt: now,
  }).where(eq(billingAccounts.workspaceId, workspaceId));
  return {...account, reconciliationGeneration: generation};
}

async function openRecoveryCase(tx: TransactionDatabase, input: Readonly<{workspaceId: string; externalReference: string; reason: string; payload: unknown; now: Date}>): Promise<void> {
  await tx.insert(billingReconciliationCases).values({
    id: randomUUID(), workspaceId: input.workspaceId, provider: 'fixture', externalReference: input.externalReference,
    reason: input.reason, payload: serializeJsonValue(input.payload), status: 'open', createdAt: input.now, resolvedAt: null,
  }).onConflictDoNothing();
  await tx.update(billingAccounts).set({status: 'hold', holdReason: input.reason, updatedAt: input.now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
}

function snapshotForAttempt(attempt: typeof billingCheckoutAttempts.$inferSelect): BillingCatalogSnapshot {
  return parseBillingCatalogSnapshot(attempt.catalogSnapshot);
}

type ResolvedOrder = Readonly<{orderId: string; order: typeof billingOrders.$inferSelect; catalog: BillingCatalogSnapshot; workspaceId: string; customerId: string; attemptId: string | null}>;

/** The synthetic invoice alias serializes the supported subscription/line period without a new table. */
function periodAlias(input: PaymentObservation): PaymentAlias | null {
  if (!input.externalSubscriptionId || !input.periodStart || !input.periodEnd) return null;
  const start = iso(input.periodStart, 'periodStart')!;
  const end = iso(input.periodEnd, 'periodEnd')!;
  if (end <= start) throw new DomainError('CONFLICT', 'Subscription service period is incomplete or invalid.');
  const digest = createHash('sha256').update(JSON.stringify([input.externalSubscriptionId, start.toISOString(), end.toISOString()])).digest('hex');
  return {provider: 'stripe', objectKind: 'invoice', externalId: `subscription-period:${digest}`};
}

async function resolveStripeOrder(tx: TransactionDatabase, input: PaymentObservation, paymentAliases: PaymentAlias[], workspaceId: string, now: Date): Promise<ResolvedOrder> {
  const recovery = RECOVERY_EVENTS.has(input.eventType);
  const existingOrderId = await findCanonicalOrderId(tx, paymentAliases);
  const order = existingOrderId ? (await tx.select().from(billingOrders).where(eq(billingOrders.id, existingOrderId)).for('update').limit(1))[0] : undefined;
  const attempt = input.checkoutSessionId && input.stripe?.billingReason !== 'subscription_cycle'
    ? (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'stripe'), eq(billingCheckoutAttempts.stripeSessionId, input.checkoutSessionId))).limit(1))[0] : undefined;
  const subscription = input.externalSubscriptionId
    ? (await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.provider, 'stripe'), eq(billingSubscriptions.externalId, input.externalSubscriptionId))).for('update').limit(1))[0] : undefined;
  const binding = order ?? subscription ?? attempt;
  if (!binding) throw new DomainError('CONFLICT', 'Stripe payment has no immutable Checkout, subscription, or canonical order binding.');
  if ([order, subscription, attempt].some((row) => row && (row.workspaceId !== workspaceId || row.customerId !== binding.customerId)) ||
      (input.customerId && input.customerId !== binding.customerId)) throw new DomainError('CONFLICT', 'Stripe customer/workspace binding conflicts with persisted identity.');
  const mapped = (await tx.select().from(billingCustomerHistory).where(and(eq(billingCustomerHistory.provider, 'stripe'), eq(billingCustomerHistory.workspaceId, workspaceId), eq(billingCustomerHistory.customerId, binding.customerId))).limit(1))[0];
  if (!mapped) throw new DomainError('CONFLICT', 'Stripe customer has no historical workspace mapping.');
  const catalog = parseBillingCatalogSnapshot(binding.catalogSnapshot);
  if (catalog.provider !== 'stripe' || [order, subscription, attempt].some((row) => row && parseBillingCatalogSnapshot(row.catalogSnapshot).snapshotHash !== catalog.snapshotHash)) throw new DomainError('CONFLICT', 'Stripe immutable catalog binding conflicts.');
  const evidence = input.stripe;
  if (!evidence?.supported || evidence.priceReference !== catalog.priceReference || input.currency !== catalog.currency || input.amountMinor === undefined) throw new DomainError('CONFLICT', 'Stripe paid semantics, price, amount, or currency are unverified.');
  const paymentAmount = BigInt(parseMoneyMinor(evidence.paymentAmountMinor));
  const observedAmount = BigInt(parseMoneyMinor(input.amountMinor));
  if (recovery && (observedAmount <= 0n || observedAmount > paymentAmount ||
      !(input.eventType === 'charge.refunded' ? id(input.refundId, 'refundId') : id(input.disputeId, 'disputeId')))) throw new DomainError('CONFLICT', 'Stripe recovery requires a stable refund/dispute identity and verified incremental amount.');
  // Supported taxes/discounts are checked by the authoritative mapper; cash never determines credits.
  if (paymentAmount <= 0n || (!recovery && observedAmount !== paymentAmount) || (order && order.paidMinor !== paymentAmount)) throw new DomainError('CONFLICT', 'Stripe verified amount conflicts with canonical payment.');
  if (recovery && !input.invoiceId && !input.paymentIntentId && !input.chargeId) throw new DomainError('CONFLICT', 'Stripe recovery requires a canonical cash payment identity.');
  let serviceAlias: PaymentAlias | null = null;
  // Cash recovery uses payment identity, never entitlement periods or the current subscription slot.
  if (catalog.kind === 'subscription' && !recovery) {
    serviceAlias = periodAlias(input);
    if (!input.invoiceId || !input.externalSubscriptionId || !serviceAlias || !['subscription_create', 'subscription_cycle'].includes(evidence.billingReason ?? '')) throw new DomainError('CONFLICT', 'Stripe recurring payment requires a supported invoice and complete service period.');
    const other = (await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.workspaceId, workspaceId), inArray(billingSubscriptions.status, ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused']))).limit(1))[0];
    if (other && other.externalId !== input.externalSubscriptionId) throw new DomainError('CONFLICT', 'Unexpected second external subscription.');
    if (!subscription && (!attempt || evidence.billingReason !== 'subscription_create')) throw new DomainError('CONFLICT', 'Renewal requires its stored subscription binding.');
    if (order) {
      const periods = await tx.select().from(billingPaymentAliases).where(and(eq(billingPaymentAliases.orderId, order.id), eq(billingPaymentAliases.objectKind, 'invoice')));
      if (periods.some((row) => row.externalId.startsWith('subscription-period:') && row.externalId !== serviceAlias!.externalId)) throw new DomainError('CONFLICT', 'Canonical invoice service period is immutable.');
    }
    const periodOrderId = await findCanonicalOrderId(tx, [serviceAlias]);
    if (periodOrderId && periodOrderId !== order?.id) {
      throw new DomainError('CONFLICT', 'Distinct payments claim the same subscription service period.');
    }
    paymentAliases.push(serviceAlias);
  } else if (catalog.kind === 'pack' && (input.externalSubscriptionId || evidence.billingReason)) {
    throw new DomainError('CONFLICT', 'Stripe pack payment cannot carry recurring semantics.');
  }
  if (order) return {orderId: order.id, order, catalog, workspaceId, customerId: binding.customerId, attemptId: attempt?.id ?? null};
  const orderId = randomUUID();
  const inserted = (await tx.insert(billingOrders).values({id: orderId, workspaceId, provider: 'stripe', customerId: binding.customerId, kind: catalog.kind, catalogSnapshot: catalog,
    status: 'pending', currency: catalog.currency, paidMinor: paymentAmount, refundedMinor: 0n, paidAt: null, grantBusinessKey: null, createdAt: now, updatedAt: now}).returning())[0]!;
  return {orderId, order: inserted, catalog, workspaceId, customerId: binding.customerId, attemptId: attempt?.id ?? null};
}

/** A held recovery observation remains a barrier even when its entitlement terms were unverifiable. */
async function hasStripeRecoveryEvidence(tx: TransactionDatabase, workspaceId: string, paymentAliases: readonly PaymentAlias[]): Promise<boolean> {
  const fields = {checkout_session: 'checkoutSessionId', invoice: 'invoiceId', payment_intent: 'paymentIntentId', charge: 'chargeId'} as const;
  const cases = await tx.select({id: billingReconciliationCases.id}).from(billingReconciliationCases).where(and(
    eq(billingReconciliationCases.workspaceId, workspaceId), eq(billingReconciliationCases.provider, 'stripe'),
    inArray(sql<string>`${billingReconciliationCases.payload}->>'eventType'`, [...RECOVERY_EVENTS]),
    or(...paymentAliases.map(alias => sql`${billingReconciliationCases.payload}->>${fields[alias.objectKind]} = ${alias.externalId}`)),
  )).limit(1);
  return cases.length > 0;
}

/** A verified canonical paid observation may close only its earlier unverified paid-observation cases. */
async function resolveStripePaidCases(tx: TransactionDatabase, workspaceId: string, paymentAliases: readonly PaymentAlias[], now: Date): Promise<void> {
  const fields = {checkout_session: 'checkoutSessionId', invoice: 'invoiceId', payment_intent: 'paymentIntentId', charge: 'chargeId'} as const;
  const cases = await tx.select().from(billingReconciliationCases).where(and(
    eq(billingReconciliationCases.workspaceId, workspaceId),
    eq(billingReconciliationCases.provider, 'stripe'),
    eq(billingReconciliationCases.status, 'open'),
    inArray(billingReconciliationCases.reason, [...RESOLVABLE_STRIPE_PAID_CASE_REASONS]),
    inArray(sql<string>`${billingReconciliationCases.payload}->>'eventType'`, [...PAID_EVENTS]),
    or(...paymentAliases.map(alias => sql`${billingReconciliationCases.payload}->>${fields[alias.objectKind]} = ${alias.externalId}`)),
  )).for('update');
  for (const item of cases) {
    await tx.update(billingReconciliationCases).set({status: 'resolved', resolvedAt: now}).where(eq(billingReconciliationCases.id, item.id));
  }
  if (cases.length === 0) return;
  const unresolved = await tx.select({id: billingReconciliationCases.id}).from(billingReconciliationCases).where(and(
    eq(billingReconciliationCases.workspaceId, workspaceId), eq(billingReconciliationCases.status, 'open'),
  )).limit(1);
  if (unresolved.length === 0) {
    await tx.update(billingAccounts).set({status: 'active', holdReason: null, updatedAt: now}).where(eq(billingAccounts.workspaceId, workspaceId));
  }
}

async function hasDisputeSource(tx: TransactionDatabase, workspaceId: string, orderId: string, input: PaymentObservation): Promise<boolean> {
  if (input.eventType !== 'charge.dispute.reversed' || !input.economicLossId) return false;
  const source = await tx.select({id: billingCashEvents.id}).from(billingCashEvents).where(and(
    eq(billingCashEvents.workspaceId, workspaceId), eq(billingCashEvents.orderId, orderId),
    eq(billingCashEvents.economicLossKey, input.economicLossId),
    inArray(billingCashEvents.eventKind, ['dispute_opened', 'dispute_lost']),
  )).limit(1);
  return source.length > 0;
}

async function resolveOrder(tx: TransactionDatabase, input: PaymentObservation, paymentAliases: readonly PaymentAlias[], now: Date): Promise<Readonly<{orderId: string; order: typeof billingOrders.$inferSelect; catalog: BillingCatalogSnapshot; workspaceId: string; customerId: string; attemptId: string | null}>> {
  const existingOrderId = await findCanonicalOrderId(tx, paymentAliases);
  if (existingOrderId) {
    const rows = await tx.select().from(billingOrders).where(eq(billingOrders.id, existingOrderId)).for('update').limit(1);
    const order = rows[0];
    if (!order) throw new DomainError('CONFLICT', 'Payment alias points to a missing order.');
    const catalog = parseBillingCatalogSnapshot(order.catalogSnapshot);
    return {orderId: order.id, order, catalog, workspaceId: order.workspaceId, customerId: order.customerId, attemptId: null};
  }

  let attempt: typeof billingCheckoutAttempts.$inferSelect | undefined;
  if (input.checkoutSessionId) {
    const rows = await tx.select().from(billingCheckoutAttempts).where(and(
      eq(billingCheckoutAttempts.provider, 'fixture'), eq(billingCheckoutAttempts.stripeSessionId, input.checkoutSessionId),
    )).for('update').limit(1);
    attempt = rows[0];
  }
  const workspaceId = attempt?.workspaceId ?? id(input.workspaceId, 'workspaceId');
  const customerId = attempt?.customerId ?? id(input.customerId, 'customerId');
  if (!workspaceId || !customerId) throw new DomainError('CONFLICT', 'Payment cannot be mapped to a workspace customer.');
  const customer = await tx.select().from(billingCustomerHistory).where(and(
    eq(billingCustomerHistory.workspaceId, workspaceId), eq(billingCustomerHistory.provider, 'fixture'), eq(billingCustomerHistory.customerId, customerId), isNull(billingCustomerHistory.validUntil),
  )).limit(1);
  if (!customer[0]) throw new DomainError('CONFLICT', 'Payment customer is not mapped to this workspace.');
  if (attempt && input.customerId && input.customerId !== attempt.customerId) throw new DomainError('CONFLICT', 'Payment customer does not match Checkout.');
  const catalog = attempt ? snapshotForAttempt(attempt) : snapshotBillingProduct(id(input.productKey, 'productKey')!, 'local');
  const amountMinor = parseMoneyMinor(input.amountMinor ?? catalog.amountMinor);
  const currency = input.currency ?? catalog.currency;
  if (currency !== catalog.currency) throw new DomainError('CONFLICT', 'Payment currency does not match the catalog snapshot.');
  const orderId = randomUUID();
  const orderValues = {
    id: orderId, workspaceId, provider: 'fixture' as const, customerId, kind: catalog.kind, catalogSnapshot: catalog,
    status: 'pending' as const, currency, paidMinor: BigInt(amountMinor), refundedMinor: 0n, paidAt: null, grantBusinessKey: null,
    createdAt: now, updatedAt: now,
  };
  await tx.insert(billingOrders).values(orderValues);
  const rows = await tx.select().from(billingOrders).where(eq(billingOrders.id, orderId)).limit(1);
  return {orderId, order: rows[0]!, catalog, workspaceId, customerId, attemptId: attempt?.id ?? null};
}

export async function reconcilePayment(db: AppDatabase, input: PaymentObservation, now = new Date()): Promise<ReconcileResult> {
  const paymentAliases = aliases(input);
  const stripeWorkspaceId = input.provider === 'stripe' ? await resolveReconciliationScope(db, input) : undefined;
  return inTransaction(db, async (tx) => {
    let stripeResolved: ResolvedOrder | undefined;
    if (input.provider === 'stripe') {
      await consumeReconciliationFence(tx, stripeWorkspaceId!, input.fence, now);
      try {
        stripeResolved = await resolveStripeOrder(tx, input, paymentAliases, stripeWorkspaceId!, now);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await recordReconciliationHold(tx, {workspaceId: stripeWorkspaceId!, provider: 'stripe', externalReference: input.eventId, reason: error.publicMessage, payload: input, now});
        return {eventId: input.eventId, orderId: null, status: 'held', grantId: null, replayed: false};
      }
    }
    const knownOrderId = await findCanonicalOrderId(tx, paymentAliases);
    const knownOrder = knownOrderId
      ? (await tx.select({workspaceId: billingOrders.workspaceId, customerId: billingOrders.customerId}).from(billingOrders).where(eq(billingOrders.id, knownOrderId)).limit(1))[0]
      : undefined;
    if (knownOrder && input.workspaceId && input.workspaceId !== knownOrder.workspaceId) throw new DomainError('CONFLICT', 'Payment workspace does not match the canonical order.');
    if (knownOrder && input.customerId && input.customerId !== knownOrder.customerId) throw new DomainError('CONFLICT', 'Payment customer does not match the canonical order.');
    const workspaceIdHint = stripeResolved?.workspaceId ?? input.workspaceId ?? knownOrder?.workspaceId;
    let workspaceId = workspaceIdHint;
    if (!workspaceId && input.checkoutSessionId) {
      const attempt = await tx.select({workspaceId: billingCheckoutAttempts.workspaceId}).from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.stripeSessionId, input.checkoutSessionId)).limit(1);
      workspaceId = attempt[0]?.workspaceId;
    }
    if (!workspaceId) throw new DomainError('CONFLICT', 'Webhook event has no local workspace mapping.');
    // Preserve workspace -> billing -> credits ordering when the optional
    // affiliate fact is recorded in this same transaction.
    const lockedWorkspace = await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1);
    if (!lockedWorkspace[0]) throw new DomainError('NOT_FOUND', 'Workspace not found.');
    if (input.provider === 'fixture') await lockAccount(tx, workspaceId, now);
    const resolved = stripeResolved ?? await resolveOrder(tx, input, paymentAliases, now);
    const workspace = await tx.select({createdBy: workspaces.createdBy}).from(workspaces).where(eq(workspaces.id, resolved.workspaceId)).limit(1);
    if (!workspace[0]) throw new DomainError('NOT_FOUND', 'Workspace not found.');
    await attachPaymentAliases(tx, paymentAliases.map((alias) => ({...alias, workspaceId: resolved.workspaceId, orderId: resolved.orderId, createdAt: now})));

    if (RECOVERY_EVENTS.has(input.eventType)) {
      const eventKind = input.eventType === 'charge.refunded' ? 'refund' : input.eventType === 'charge.dispute.reversed' ? 'dispute_reversed' : input.eventType === 'charge.dispute.lost' ? 'dispute_lost' : 'dispute_opened';
      const amount = BigInt(parseMoneyMinor(input.amountMinor ?? resolved.catalog.amountMinor));
      const externalId = eventKind === 'refund' ? input.refundId ?? input.eventId : input.disputeId ?? input.eventId;
      if (eventKind === 'dispute_reversed' && !(await hasDisputeSource(tx, resolved.workspaceId, resolved.orderId, input))) {
        await recordReconciliationHold(tx, {workspaceId: resolved.workspaceId, provider: 'stripe', externalReference: input.eventId, reason: 'dispute-reversal-missing-source', payload: input, now});
        return {eventId: input.eventId, orderId: resolved.orderId, status: 'held' as const, grantId: null, replayed: false};
      }
      const recovery = await recordBillingRecoveryInTransaction(tx, {workspaceId: resolved.workspaceId, orderId: resolved.orderId, externalId, relatedExternalId: input.relatedEventId, economicLossId: input.economicLossId, kind: eventKind, amountMinor: amount, currency: input.currency, actorUserId: workspace[0].createdBy, now});
      if (input.provider === 'stripe' && resolved.catalog.kind === 'subscription' && (!input.periodStart || !input.periodEnd) && !recovery.replayed) {
        await recordReconciliationHold(tx, {workspaceId: resolved.workspaceId, provider: 'stripe', externalReference: input.eventId, reason: 'stripe-recovery-service-period-unavailable', payload: input, now});
      }
      return {eventId: input.eventId, orderId: resolved.orderId, status: recovery.replayed ? 'duplicate' as const : 'recovery' as const, grantId: null, replayed: recovery.replayed};
    }

    if (input.eventType === 'payment.failed') {
      if (input.provider === 'stripe' && (resolved.order.status === 'held' || resolved.order.status === 'refunded' || resolved.order.refundedMinor > 0n)) return {eventId: input.eventId, orderId: resolved.orderId, status: 'held', grantId: null, replayed: false};
      if (resolved.order.status === 'paid') {
        const existingGrant = (await tx.select({id: creditGrants.id}).from(creditGrants).where(and(eq(creditGrants.workspaceId, resolved.workspaceId), eq(creditGrants.businessKey, `billing:${resolved.orderId}:grant`))).limit(1))[0];
        if (existingGrant) return {eventId: input.eventId, orderId: resolved.orderId, status: 'duplicate' as const, grantId: existingGrant.id, replayed: true};
      }
      await tx.update(billingOrders).set({status: 'failed', updatedAt: now}).where(eq(billingOrders.id, resolved.orderId));
      return {eventId: input.eventId, orderId: resolved.orderId, status: 'failed' as const, grantId: null, replayed: false};
    }
    if (!PAID_EVENTS.has(input.eventType)) throw new DomainError('VALIDATION', 'Unsupported payment event.');
    if (resolved.order.status === 'paid') {
      const existingGrant = (await tx.select({id: creditGrants.id}).from(creditGrants).where(and(eq(creditGrants.workspaceId, resolved.workspaceId), eq(creditGrants.businessKey, `billing:${resolved.orderId}:grant`))).limit(1))[0];
      if (!existingGrant) throw new DomainError('CONFLICT', 'A paid order is missing its canonical credit grant.');
      if (input.provider === 'stripe') await resolveStripePaidCases(tx, resolved.workspaceId, paymentAliases, now);
      return {eventId: input.eventId, orderId: resolved.orderId, status: 'duplicate' as const, grantId: existingGrant.id, replayed: true};
    }
    if (resolved.order.status === 'held' || resolved.order.status === 'refunded' ||
        (input.provider === 'stripe' && await hasStripeRecoveryEvidence(tx, resolved.workspaceId, paymentAliases))) {
      if (input.provider === 'stripe' && resolved.order.status !== 'held' && resolved.order.status !== 'refunded') await tx.update(billingOrders).set({status: 'held', updatedAt: now}).where(eq(billingOrders.id, resolved.orderId));
      if (input.provider === 'stripe') await recordReconciliationHold(tx, {workspaceId: resolved.workspaceId, provider: 'stripe', externalReference: input.eventId, reason: 'paid-event-after-recovery-fact', payload: input, now});
      else await openRecoveryCase(tx, {workspaceId: resolved.workspaceId, externalReference: input.eventId, reason: 'paid-event-after-recovery-fact', payload: input, now});
      return {eventId: input.eventId, orderId: resolved.orderId, status: 'held' as const, grantId: null, replayed: false};
    }
    const paidMinor = BigInt(parseMoneyMinor(input.amountMinor ?? resolved.catalog.amountMinor));
    const paidAt = input.paidAt ? iso(input.paidAt, 'paidAt')! : now;
    if (paidAt > now) throw new DomainError('VALIDATION', 'Payment time cannot be in the future.');
    await tx.update(billingOrders).set({status: 'paid', paidMinor, paidAt, updatedAt: now, grantBusinessKey: resolved.order.grantBusinessKey ?? `billing:${resolved.orderId}:grant`}).where(eq(billingOrders.id, resolved.orderId));
    await recordAffiliatePaymentInTransaction(tx, {workspaceId: resolved.workspaceId, payment: {paymentReference: resolved.orderId, kind: resolved.catalog.kind, paidAt, amountMinor: paidMinor, currency: resolved.order.currency, historyComplete: false}, now});
    const grantBusinessKey = resolved.order.grantBusinessKey ?? `billing:${resolved.orderId}:grant`;
    const grant = await issueGrantInTransaction(tx, {
      actorUserId: workspace[0].createdBy,
      workspaceId: resolved.workspaceId,
      commandName: 'billing.reconcile-payment',
      commandKey: `billing:${input.eventId}`,
      businessKey: grantBusinessKey,
      source: resolved.catalog.kind === 'subscription' ? 'subscription' : 'purchase',
      amount: BigInt(resolved.catalog.credits),
      expiresAt: resolved.catalog.creditExpiry === 'service_period_end' ? iso(input.periodEnd, 'periodEnd') : null,
      payload: {eventId: input.eventId, orderId: resolved.orderId, catalogHash: resolved.catalog.snapshotHash},
    });
    if (resolved.attemptId) {
      await tx.update(billingCheckoutAttempts).set({status: 'paid', resolvedAt: now, resolutionReference: input.eventId, updatedAt: now}).where(and(eq(billingCheckoutAttempts.id, resolved.attemptId), inArray(billingCheckoutAttempts.status, ['creating', 'open', 'unknown'])));
    }
    if (resolved.catalog.kind === 'subscription' && input.externalSubscriptionId) {
      const periodStart = iso(input.periodStart, 'periodStart');
      const periodEnd = iso(input.periodEnd, 'periodEnd');
      if (!periodStart || !periodEnd) throw new DomainError('VALIDATION', 'Subscription payment requires a service period.');
      await tx.insert(billingSubscriptions).values({id: randomUUID(), workspaceId: resolved.workspaceId, provider: input.provider, customerId: resolved.customerId, externalId: input.externalSubscriptionId, catalogSnapshot: resolved.catalog, status: 'active', periodStart, periodEnd, cancelAtPeriodEnd: false, createdAt: now, updatedAt: now}).onConflictDoNothing();
    }
    if (input.provider === 'stripe') await resolveStripePaidCases(tx, resolved.workspaceId, paymentAliases, now);
    return {eventId: input.eventId, orderId: resolved.orderId, status: 'paid' as const, grantId: grant.grantId, replayed: grant.replayed};
  });
}
