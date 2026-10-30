import {randomUUID} from 'node:crypto';
import {and, eq, isNull} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {serializeJsonValue} from '../../contracts/http.ts';
import {billingAccounts, billingCheckoutAttempts, billingCustomerHistory, billingOrders, billingReconciliationCases, billingSubscriptions} from '../../db/schema/billing.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import type {BillingProvider, PaymentAlias, ReconciliationFence} from './contracts.ts';
import {findCanonicalOrderId} from './payment-aliases.ts';

export type ReconciliationScope = Readonly<{
  provider: BillingProvider;
  workspaceId?: string;
  customerId?: string;
  checkoutSessionId?: string;
  invoiceId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  externalSubscriptionId?: string;
  stripe?: Readonly<{
    billingReason?: string;
    checkout?: Readonly<{attemptId?: string; workspaceId?: string; customerId?: string; catalogHash?: string; amountMinor?: string; currency?: string}>;
  }>;
}>;

/** Provider mappers call this on trusted object identities, never metadata tenant hints alone. */
export async function resolveReconciliationScope(db: AppDatabase, input: ReconciliationScope): Promise<string> {
  return inTransaction(db, async (tx) => {
    const bindings: Array<{workspaceId: string; customerId: string}> = [];
    const aliases: PaymentAlias[] = [];
    for (const [objectKind, externalId] of [
      ['invoice', input.invoiceId], ['payment_intent', input.paymentIntentId], ['charge', input.chargeId],
      ['checkout_session', input.stripe?.billingReason === 'subscription_cycle' ? undefined : input.checkoutSessionId],
    ] as const) if (externalId) aliases.push({provider: input.provider, objectKind, externalId});
    const orderId = await findCanonicalOrderId(tx, aliases);
    if (orderId) {
      const order = (await tx.select().from(billingOrders).where(eq(billingOrders.id, orderId)).limit(1))[0];
      if (!order) throw new DomainError('CONFLICT', 'Canonical payment binding is missing.');
      bindings.push(order);
    }
    if (input.checkoutSessionId && input.stripe?.billingReason !== 'subscription_cycle') {
      const attempt = (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, input.provider), eq(billingCheckoutAttempts.stripeSessionId, input.checkoutSessionId))).limit(1))[0];
      if (attempt) bindings.push(attempt);
    }
    if (input.externalSubscriptionId) {
      const subscription = (await tx.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.provider, input.provider), eq(billingSubscriptions.externalId, input.externalSubscriptionId))).limit(1))[0];
      if (subscription) bindings.push(subscription);
    }
    if (input.customerId) {
      const customer = (await tx.select().from(billingCustomerHistory).where(and(eq(billingCustomerHistory.provider, input.provider), eq(billingCustomerHistory.customerId, input.customerId))).limit(1))[0];
      if (!customer) throw new DomainError('CONFLICT', 'Provider customer has no persisted workspace mapping.');
      bindings.push(customer);
    }
    const binding = bindings[0];
    if (!binding || bindings.some((item) => item.workspaceId !== binding.workspaceId || item.customerId !== binding.customerId) ||
        (input.workspaceId && input.workspaceId !== binding.workspaceId) || (input.customerId && input.customerId !== binding.customerId)) {
      throw new DomainError('CONFLICT', 'Provider workspace/customer binding does not match persisted mapping.');
    }
    return binding.workspaceId;
  });
}

/** Commit the claim, fetch provider state outside any transaction, then apply with this fence. */
export async function claimReconciliation(db: AppDatabase, input: Readonly<{workspaceId: string; owner: string; now?: Date; leaseMs?: number}>): Promise<ReconciliationFence> {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? 60_000;
  if (!input.owner.trim() || input.owner.length > 255 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 300_000 || !Number.isFinite(now.getTime())) throw new DomainError('VALIDATION', 'Reconciliation claim is invalid.');
  return inTransaction(db, async (tx) => {
    await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
    const account = (await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).for('update').limit(1))[0];
    if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
    if (account.reconciliationLeaseUntil && account.reconciliationLeaseUntil > now) throw new DomainError('INFRASTRUCTURE', 'Reconciliation lease is already claimed.');
    const token = randomUUID();
    const generation = account.reconciliationGeneration + 1n;
    const leaseUntil = new Date(now.getTime() + leaseMs);
    await tx.update(billingAccounts).set({reconciliationLeaseOwner: input.owner, reconciliationLeaseToken: token, reconciliationGeneration: generation, reconciliationLeaseUntil: leaseUntil, updatedAt: now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
    return {workspaceId: input.workspaceId, owner: input.owner, token, generation: generation.toString(), leaseUntil: leaseUntil.toISOString()};
  });
}

/** Lock in workspace -> billing order and consume exactly one live claim atomically with apply. */
export async function consumeReconciliationFence(tx: TransactionDatabase, workspaceId: string, fence: ReconciliationFence | undefined, now: Date): Promise<void> {
  if (!fence || fence.workspaceId !== workspaceId) throw new DomainError('INFRASTRUCTURE', 'A matching reconciliation fence is required.');
  await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1);
  const account = (await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).for('update').limit(1))[0];
  if (!account || account.reconciliationLeaseToken !== fence.token || account.reconciliationLeaseOwner !== fence.owner ||
      account.reconciliationGeneration.toString() !== fence.generation || !account.reconciliationLeaseUntil ||
      account.reconciliationLeaseUntil.toISOString() !== fence.leaseUntil || account.reconciliationLeaseUntil <= now) {
    throw new DomainError('INFRASTRUCTURE', 'Reconciliation fence is stale or its lease expired.');
  }
  await tx.update(billingAccounts).set({reconciliationLeaseOwner: null, reconciliationLeaseToken: null, reconciliationLeaseUntil: null, updatedAt: now}).where(eq(billingAccounts.workspaceId, workspaceId));
}

export async function recordReconciliationHold(tx: TransactionDatabase, input: Readonly<{workspaceId: string; provider: BillingProvider; externalReference: string; reason: string; payload: unknown; now: Date}>): Promise<void> {
  await tx.insert(billingReconciliationCases).values({id: randomUUID(), workspaceId: input.workspaceId, provider: input.provider, externalReference: input.externalReference, reason: input.reason, payload: serializeJsonValue(input.payload), status: 'open', createdAt: input.now, resolvedAt: null}).onConflictDoNothing();
  // Keep the first unresolved reason; subsequent facts are append-only cases.
  await tx.update(billingAccounts).set({status: 'hold', holdReason: input.reason, updatedAt: input.now}).where(and(eq(billingAccounts.workspaceId, input.workspaceId), isNull(billingAccounts.holdReason)));
}
