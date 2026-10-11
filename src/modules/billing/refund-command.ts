import {and, eq, inArray} from 'drizzle-orm';

import type {BillingRefundProvider} from '../../adapters/billing/refunds.ts';
import {createFakeBillingRefundProvider} from '../../adapters/billing/refunds.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingOrders, billingRefundRequests} from '../../db/schema/billing.ts';
import {outboxEvents} from '../../db/schema/credit.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';
import {recordBillingRecoveryInTransaction} from './recovery.ts';
import {deliverOperatorRefund} from './refund-delivery.ts';
import {previewBillingRefund} from './refund-preview.ts';
import {authorizeOperatorCommand} from '../operations/authorize.ts';
import {recordOperatorAudit, recordTenantAccess, validateExpectedVersion, validateOperatorReason} from '../operations/audit.ts';

export type RefundCommandResult = Readonly<{requestId: string; status: 'pending' | 'confirmed' | 'failed' | 'unknown'; externalId: string | null; amountMinor: bigint; orderId: string; replayed?: boolean}>;

async function lockRefundScope(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1);
  await tx.select({workspaceId: billingAccounts.workspaceId}).from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).for('update').limit(1);
}

export async function requestBillingRefund(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; orderId: string; idempotencyKey: string; amountMinor?: bigint; reason: string; provider?: BillingRefundProvider; now?: Date}>): Promise<RefundCommandResult> {
  if (!input.reason.trim()) throw new DomainError('VALIDATION', 'Refund reason is required.');
  const now = input.now ?? new Date();
  const preview = await previewBillingRefund(db, {actor: input.actor, workspaceId: input.workspaceId, orderId: input.orderId, amountMinor: input.amountMinor});
  if (!preview.eligible) throw new DomainError('CONFLICT', `Refund cannot start from ${preview.reason}.`);
  const prepared = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    return executeDurableCommand(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'billing.refund', idempotencyKey: input.idempotencyKey, payload: {orderId: input.orderId, amountMinor: preview.amountMinor.toString(), reason: input.reason}}, async () => {
      const id = crypto.randomUUID();
      await tx.insert(billingRefundRequests).values({id, workspaceId: input.workspaceId, orderId: input.orderId, provider: 'fixture', idempotencyKey: `refund:${input.idempotencyKey}`, amountMinor: preview.amountMinor, currency: preview.currency, reason: input.reason, status: 'pending', externalId: null, createdAt: now, updatedAt: now, resolvedAt: null});
      return {requestId: id, status: 'pending' as const, externalId: null, amountMinor: preview.amountMinor, orderId: input.orderId};
    });
  });
  const preparedValue = prepared.value as RefundCommandResult;
  if (prepared.replayed) return {...preparedValue, replayed: true};
  const provider = input.provider ?? createFakeBillingRefundProvider();
  const order = (await inTransaction(db, (tx) => tx.select({currency: billingOrders.currency}).from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.workspaceId, input.workspaceId))).limit(1)))[0];
  if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
  const remote = await provider.createRefund({requestId: preparedValue.requestId, orderId: input.orderId, amountMinor: preview.amountMinor, currency: order.currency, idempotencyKey: `refund:${input.idempotencyKey}`});
  if ('unknown' in remote) {
    await inTransaction(db, (tx) => tx.update(billingRefundRequests).set({status: 'unknown', updatedAt: now}).where(eq(billingRefundRequests.id, preparedValue.requestId)));
    return {...preparedValue, status: 'unknown' as const, replayed: false};
  }
  const result = await inTransaction(db, async (tx) => {
    await lockRefundScope(tx, input.workspaceId);
    await tx.update(billingRefundRequests).set({status: 'confirmed', externalId: remote.externalId, updatedAt: now, resolvedAt: now}).where(eq(billingRefundRequests.id, preparedValue.requestId));
    const recovery = await recordBillingRecoveryInTransaction(tx, {workspaceId: input.workspaceId, orderId: input.orderId, externalId: remote.externalId, kind: 'refund', amountMinor: remote.amountMinor, actorUserId: input.actor.userId, now});
    return {requestId: preparedValue.requestId, status: recovery.status === 'refunded' ? 'confirmed' as const : 'confirmed' as const, externalId: remote.externalId, amountMinor: remote.amountMinor, orderId: input.orderId};
  });
  return {...result, replayed: false};
}

export async function requestBillingRefundAsOperator(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; orderId: string; expectedVersion: number; idempotencyKey: string; amountMinor?: bigint; reason: string; purpose: string; provider?: BillingRefundProvider; now?: Date}>): Promise<RefundCommandResult> {
  const reason = validateOperatorReason(input.reason);
  const purpose = validateOperatorReason(input.purpose);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  const prepared = await inTransaction(db, async (tx) => {
    const access = await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
    const account = (await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).for('update').limit(1))[0];
    if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
    await recordTenantAccess(tx, {actorUserId: access.userId, workspaceId: input.workspaceId, purpose, now});
    return executeDurableCommand(tx, {actorUserId: access.userId, workspaceId: input.workspaceId, commandName: 'operator.billing.refund', idempotencyKey: input.idempotencyKey, payload: {orderId: input.orderId, amountMinor: input.amountMinor?.toString() ?? null, expectedVersion, reason, purpose}}, async () => {
      if (account.version !== expectedVersion) throw new DomainError('CONFLICT', 'The billing account version is stale; refresh the refund preview.');
      const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.workspaceId, input.workspaceId))).for('update').limit(1))[0];
      if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
      if (order.provider !== 'fixture') throw new DomainError('FORBIDDEN', 'Live refund execution is not enabled.');
      if (order.status !== 'paid') throw new DomainError('CONFLICT', 'Only a currently paid order can be refunded.');
      const pending = (await tx.select({id: billingRefundRequests.id}).from(billingRefundRequests).where(and(eq(billingRefundRequests.orderId, order.id), inArray(billingRefundRequests.status, ['pending', 'unknown']))).limit(1))[0];
      if (pending) throw new DomainError('CONFLICT', 'An unresolved refund already exists for this order.');
      const amountMinor = input.amountMinor ?? order.paidMinor;
      if (amountMinor <= 0n || amountMinor > order.paidMinor - order.refundedMinor) throw new DomainError('VALIDATION', 'Refund amount must be within the remaining paid amount.');
      const id = crypto.randomUUID();
      await tx.insert(billingRefundRequests).values({id, workspaceId: input.workspaceId, orderId: order.id, provider: 'fixture', idempotencyKey: `refund:${id}`, amountMinor, currency: order.currency, reason, status: 'pending', externalId: null, createdAt: now, updatedAt: now, resolvedAt: null});
      await tx.update(billingAccounts).set({version: account.version + 1, updatedAt: now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
      await recordOperatorAudit(tx, {actorUserId: access.userId, workspaceId: input.workspaceId, commandName: 'operator.billing.refund', commandKey: input.idempotencyKey, payload: {requestId: id, orderId: order.id, amountMinor: amountMinor.toString(), requestedAmountMinor: input.amountMinor?.toString() ?? null, expectedVersion, reason, purpose}, now});
      await tx.insert(outboxEvents).values({id: crypto.randomUUID(), workspaceId: input.workspaceId, eventType: 'billing.refund_requested', aggregateId: id, businessKey: `billing.refund:${id}`, payload: {requestId: id, orderId: order.id, amountMinor: amountMinor.toString(), currency: order.currency}, status: 'pending', availableAt: now, createdAt: now});
      return {requestId: id, status: 'pending' as const, externalId: null, amountMinor: amountMinor.toString(), orderId: order.id, currency: order.currency};
    });
  });
  const result = await deliverOperatorRefund(db, {actor: input.actor, workspaceId: input.workspaceId, requestId: prepared.value.requestId, purpose, provider: input.provider, now: input.now});
  return {...result, replayed: prepared.replayed};
}

export async function reconcileBillingRefund(db: AppDatabase, input: Readonly<{requestId: string; actor: WorkspaceActor; externalId: string; now?: Date}>): Promise<RefundCommandResult> {
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const observed = (await tx.select({workspaceId: billingRefundRequests.workspaceId}).from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)).limit(1))[0];
    if (!observed) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
    await lockRefundScope(tx, observed.workspaceId);
    const request = (await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)).for('update').limit(1))[0];
    if (!request) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
    await requireCurrentOwner(tx, request.workspaceId, input.actor);
    if (request.status === 'confirmed') return {requestId: request.id, status: 'confirmed', externalId: request.externalId, amountMinor: request.amountMinor, orderId: request.orderId, replayed: true};
    await tx.update(billingRefundRequests).set({status: 'confirmed', externalId: input.externalId, updatedAt: now, resolvedAt: now}).where(eq(billingRefundRequests.id, request.id));
    await recordBillingRecoveryInTransaction(tx, {workspaceId: request.workspaceId, orderId: request.orderId, externalId: input.externalId, kind: 'refund', amountMinor: request.amountMinor, actorUserId: input.actor.userId, now});
    return {requestId: request.id, status: 'confirmed', externalId: input.externalId, amountMinor: request.amountMinor, orderId: request.orderId, replayed: false};
  });
}
