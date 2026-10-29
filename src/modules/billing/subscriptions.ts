import {and, eq, inArray} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingCheckoutAttempts, billingCustomerHistory, billingSubscriptions} from '../../db/schema/billing.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {parseBillingCatalogSnapshot, type BillingCatalogSnapshot, type BillingProvider, type ReconciliationFence} from './contracts.ts';
import {findCurrentCustomer} from './customer-history.ts';
import {inTransaction} from '../shared/transaction.ts';
import {consumeReconciliationFence, recordReconciliationHold} from './reconciliation-fence.ts';

export type SubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export type SubscriptionObservation = Readonly<{
  workspaceId: string;
  provider: BillingProvider;
  externalId: string;
  customerId: string;
  catalogSnapshot: BillingCatalogSnapshot;
  status: SubscriptionStatus;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  now?: Date;
  fence?: ReconciliationFence;
  /** Required to establish a new Stripe lifecycle binding before its first paid invoice. */
  checkoutSessionId?: string;
}>;

function identifier(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) throw new DomainError('VALIDATION', `${field} is invalid.`);
  return value;
}

function period(start: Date | null | undefined, end: Date | null | undefined): {periodStart: Date | null; periodEnd: Date | null} {
  if ((start === null || start === undefined) !== (end === null || end === undefined)) throw new DomainError('VALIDATION', 'Subscription period must contain both endpoints or neither.');
  if (start && end && (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)) throw new DomainError('VALIDATION', 'Subscription period must end after it starts.');
  return {periodStart: start ?? null, periodEnd: end ?? null};
}

export async function mirrorSubscription(db: AppDatabase, input: SubscriptionObservation) {
  const externalId = identifier(input.externalId, 'externalId');
  const customerId = identifier(input.customerId, 'customerId');
  const catalog = parseBillingCatalogSnapshot(input.catalogSnapshot);
  if (catalog.provider !== input.provider || catalog.kind !== 'subscription') throw new DomainError('CONFLICT', 'Subscription catalog does not match the provider or product kind.');
  const now = input.now ?? new Date();
  const {periodStart, periodEnd} = period(input.periodStart, input.periodEnd);
  const result = await inTransaction(db, async (tx) => {
    if (input.provider === 'stripe') await consumeReconciliationFence(tx, input.workspaceId, input.fence, now);
    else {
      await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
      await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).for('update').limit(1);
    }
    const existingRows = await tx.select().from(billingSubscriptions).where(and(
      eq(billingSubscriptions.provider, input.provider),
      eq(billingSubscriptions.externalId, externalId),
    )).for('update').limit(1);
    const existing = existingRows[0];
    if (existing && (existing.workspaceId !== input.workspaceId || existing.customerId !== customerId)) throw new DomainError('CONFLICT', 'Subscription identity is bound to another workspace customer.');
    if (input.provider === 'stripe') {
      const customer = (await tx.select().from(billingCustomerHistory).where(and(eq(billingCustomerHistory.workspaceId, input.workspaceId), eq(billingCustomerHistory.provider, 'stripe'), eq(billingCustomerHistory.customerId, customerId))).limit(1))[0];
      if (!customer) throw new DomainError('CONFLICT', 'Subscription customer has no persisted workspace mapping.');
      const attempt = input.checkoutSessionId ? (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'stripe'), eq(billingCheckoutAttempts.stripeSessionId, input.checkoutSessionId))).limit(1))[0] : undefined;
      const other = (await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.workspaceId, input.workspaceId), inArray(billingSubscriptions.status, ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused']))).limit(1))[0];
      const reason = other && other.externalId !== externalId ? 'unexpected-second-subscription'
        : existing && parseBillingCatalogSnapshot(existing.catalogSnapshot).snapshotHash !== catalog.snapshotHash ? 'unsupported-subscription-catalog-change'
        : !existing && (!attempt || attempt.workspaceId !== input.workspaceId || attempt.customerId !== customerId || parseBillingCatalogSnapshot(attempt.catalogSnapshot).snapshotHash !== catalog.snapshotHash) ? 'subscription-missing-immutable-checkout-binding' : null;
      if (reason) {
        await recordReconciliationHold(tx, {workspaceId: input.workspaceId, provider: 'stripe', externalReference: externalId, reason, payload: input, now});
        return {held: reason};
      }
    } else {
      const customer = await findCurrentCustomer(tx, input.workspaceId, input.provider);
      if (!customer || customer.customerId !== customerId) throw new DomainError('CONFLICT', 'Subscription customer is not the current workspace customer.');
    }
    if (existing) {
      const existingCatalog = parseBillingCatalogSnapshot(existing.catalogSnapshot);
      if (existingCatalog.snapshotHash !== catalog.snapshotHash) throw new DomainError('CONFLICT', 'Subscription catalog terms are immutable for an existing subscription.');
      const effectivePeriodStart = input.provider === 'stripe' && periodStart && periodEnd && (!existing.periodEnd || periodEnd > existing.periodEnd) ? periodStart : existing.periodStart ?? periodStart;
      const effectivePeriodEnd = existing.periodEnd && periodEnd ? (periodEnd > existing.periodEnd ? periodEnd : existing.periodEnd) : (existing.periodEnd ?? periodEnd);
      await tx.update(billingSubscriptions).set({status: input.status, periodStart: effectivePeriodStart, periodEnd: effectivePeriodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd, updatedAt: now}).where(eq(billingSubscriptions.id, existing.id));
      return {...existing, status: input.status, periodStart: effectivePeriodStart, periodEnd: effectivePeriodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd, updatedAt: now};
    }
    const id = crypto.randomUUID();
    await tx.insert(billingSubscriptions).values({id, workspaceId: input.workspaceId, provider: input.provider, customerId, externalId, catalogSnapshot: catalog, status: input.status, periodStart, periodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false, createdAt: now, updatedAt: now});
    const inserted = (await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, id)).limit(1))[0];
    if (!inserted) throw new DomainError('INFRASTRUCTURE', 'Subscription was not persisted.');
    return inserted;
  });
  if ('held' in result) throw new DomainError('CONFLICT', `Subscription reconciliation held: ${result.held}`);
  return result;
}

export async function markSubscriptionCanceled(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingProvider; externalId: string; now?: Date; fence?: ReconciliationFence}>) {
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    if (input.provider === 'stripe') await consumeReconciliationFence(tx, input.workspaceId, input.fence, now);
    const rows = await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.workspaceId, input.workspaceId), eq(billingSubscriptions.provider, input.provider), eq(billingSubscriptions.externalId, input.externalId))).for('update').limit(1);
    const subscription = rows[0];
    if (!subscription) throw new DomainError('NOT_FOUND', 'Subscription was not found.');
    await tx.update(billingSubscriptions).set({status: 'canceled', cancelAtPeriodEnd: false, updatedAt: now}).where(eq(billingSubscriptions.id, subscription.id));
    return {...subscription, status: 'canceled' as const, cancelAtPeriodEnd: false, updatedAt: now};
  });
}
