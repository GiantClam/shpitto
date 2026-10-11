import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingSubscriptions} from '../../db/schema/billing.ts';
import {parseBillingCatalogSnapshot, type BillingCatalogSnapshot, type BillingProvider} from './contracts.ts';
import {findCurrentCustomer} from './customer-history.ts';
import {inTransaction} from '../shared/transaction.ts';

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
}>;

function identifier(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) throw new DomainError('VALIDATION', `${field} is invalid.`);
  return value;
}

function period(start: Date | null | undefined, end: Date | null | undefined): {periodStart: Date | null; periodEnd: Date | null} {
  if ((start === null || start === undefined) !== (end === null || end === undefined)) throw new DomainError('VALIDATION', 'Subscription period must contain both endpoints or neither.');
  if (start && end && end <= start) throw new DomainError('VALIDATION', 'Subscription period must end after it starts.');
  return {periodStart: start ?? null, periodEnd: end ?? null};
}

export async function mirrorSubscription(db: AppDatabase, input: SubscriptionObservation) {
  const externalId = identifier(input.externalId, 'externalId');
  const customerId = identifier(input.customerId, 'customerId');
  const catalog = parseBillingCatalogSnapshot(input.catalogSnapshot);
  if (catalog.provider !== input.provider || catalog.kind !== 'subscription') throw new DomainError('CONFLICT', 'Subscription catalog does not match the provider or product kind.');
  const now = input.now ?? new Date();
  const {periodStart, periodEnd} = period(input.periodStart, input.periodEnd);
  return inTransaction(db, async (tx) => {
    const customer = await findCurrentCustomer(tx, input.workspaceId, input.provider);
    if (!customer || customer.customerId !== customerId) throw new DomainError('CONFLICT', 'Subscription customer is not the current workspace customer.');
    const existingRows = await tx.select().from(billingSubscriptions).where(and(
      eq(billingSubscriptions.provider, input.provider),
      eq(billingSubscriptions.externalId, externalId),
    )).for('update').limit(1);
    const existing = existingRows[0];
    if (existing && (existing.workspaceId !== input.workspaceId || existing.customerId !== customerId)) throw new DomainError('CONFLICT', 'Subscription identity is bound to another workspace customer.');
    if (existing) {
      const existingCatalog = parseBillingCatalogSnapshot(existing.catalogSnapshot);
      if (existingCatalog.snapshotHash !== catalog.snapshotHash) throw new DomainError('CONFLICT', 'Subscription catalog terms are immutable for an existing subscription.');
      const effectivePeriodStart = existing.periodStart ?? periodStart;
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
}

export async function markSubscriptionCanceled(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingProvider; externalId: string; now?: Date}>) {
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const rows = await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.workspaceId, input.workspaceId), eq(billingSubscriptions.provider, input.provider), eq(billingSubscriptions.externalId, input.externalId))).for('update').limit(1);
    const subscription = rows[0];
    if (!subscription) throw new DomainError('NOT_FOUND', 'Subscription was not found.');
    await tx.update(billingSubscriptions).set({status: 'canceled', cancelAtPeriodEnd: false, updatedAt: now}).where(eq(billingSubscriptions.id, subscription.id));
    return {...subscription, status: 'canceled' as const, cancelAtPeriodEnd: false, updatedAt: now};
  });
}
