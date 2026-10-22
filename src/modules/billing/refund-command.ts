import {and, eq, inArray} from 'drizzle-orm';

import {classifyBillingRefund, selectBillingRefundProvider, type BillingRefundProvider, type BillingRefundProviderResult, type BillingRefundObservation} from '../../adapters/billing/refunds.ts';
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
type RefundRow = typeof billingRefundRequests.$inferSelect;

function resultOf(request: RefundRow): RefundCommandResult {
  return {requestId: request.id, status: request.status as RefundCommandResult['status'], externalId: request.externalId, amountMinor: request.amountMinor, orderId: request.orderId};
}

async function lockRefundScope(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1);
  await tx.select({workspaceId: billingAccounts.workspaceId}).from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).for('update').limit(1);
}

async function applyOwnerObservation(tx: TransactionDatabase, observed: RefundRow, actor: WorkspaceActor, outcome: BillingRefundObservation, now: Date): Promise<RefundCommandResult> {
  await lockRefundScope(tx, observed.workspaceId);
  const request = (await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, observed.id)).for('update').limit(1))[0];
  if (!request) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
  await requireCurrentOwner(tx, request.workspaceId, actor);
  if (request.status === 'confirmed' || request.status === 'failed') return {...resultOf(request), replayed: true};
  if (request.provider !== observed.provider || request.orderId !== observed.orderId || request.workspaceId !== observed.workspaceId || request.amountMinor !== observed.amountMinor || request.currency !== observed.currency || request.idempotencyKey !== observed.idempotencyKey || (request.externalId && outcome.externalId && request.externalId !== outcome.externalId)) throw new DomainError('CONFLICT', 'The refund binding changed during observation.');
  const externalId = outcome.externalId ?? request.externalId;
  if (outcome.status === 'confirmed') {
    await recordBillingRecoveryInTransaction(tx, {workspaceId: request.workspaceId, orderId: request.orderId, externalId: outcome.externalId!, kind: 'refund', amountMinor: request.amountMinor, actorUserId: actor.userId, now});
  }
  await tx.update(billingRefundRequests).set({status: outcome.status, externalId, updatedAt: now, resolvedAt: outcome.status === 'confirmed' || outcome.status === 'failed' ? now : null}).where(eq(billingRefundRequests.id, request.id));
  return {...resultOf(request), status: outcome.status, externalId, replayed: false};
}

export async function requestBillingRefund(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; orderId: string; idempotencyKey: string; amountMinor?: bigint; reason: string; provider?: BillingRefundProvider; now?: Date}>): Promise<RefundCommandResult> {
  if (!input.reason.trim()) throw new DomainError('VALIDATION', 'Refund reason is required.');
  const now = input.now ?? new Date();
  const preview = await previewBillingRefund(db, {actor: input.actor, workspaceId: input.workspaceId, orderId: input.orderId, amountMinor: input.amountMinor});
  const prepared = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await lockRefundScope(tx, input.workspaceId);
    return executeDurableCommand(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'billing.refund', idempotencyKey: input.idempotencyKey, payload: {orderId: input.orderId, amountMinor: preview.amountMinor.toString(), reason: input.reason}}, async () => {
      const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.workspaceId, input.workspaceId))).for('update').limit(1))[0];
      if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
      selectBillingRefundProvider(order.provider, input.provider);
      if (!preview.eligible) throw new DomainError('CONFLICT', `Refund cannot start from ${preview.reason}.`);
      if (order.status !== 'paid' || preview.amountMinor > order.paidMinor - order.refundedMinor) throw new DomainError('CONFLICT', 'The remaining paid amount changed.');
      const pending = (await tx.select({id: billingRefundRequests.id}).from(billingRefundRequests).where(and(eq(billingRefundRequests.orderId, order.id), inArray(billingRefundRequests.status, ['pending', 'unknown']))).limit(1))[0];
      if (pending) throw new DomainError('CONFLICT', 'An unresolved refund already exists for this order.');
      const id = crypto.randomUUID();
      await tx.insert(billingRefundRequests).values({id, workspaceId: input.workspaceId, orderId: input.orderId, provider: order.provider, idempotencyKey: `refund:${order.provider === 'stripe' ? id : input.idempotencyKey}`, amountMinor: preview.amountMinor, currency: order.currency, reason: input.reason, status: 'pending', externalId: null, createdAt: now, updatedAt: now, resolvedAt: null});
      return {requestId: id, status: 'pending' as const, externalId: null, amountMinor: preview.amountMinor, orderId: input.orderId};
    });
  });
  const preparedValue = prepared.value as RefundCommandResult;
  if (prepared.replayed) {
    const request = (await db.select().from(billingRefundRequests).where(and(
      eq(billingRefundRequests.id, preparedValue.requestId),
      eq(billingRefundRequests.workspaceId, input.workspaceId),
      eq(billingRefundRequests.orderId, input.orderId),
    )).limit(1))[0];
    if (!request) throw new DomainError('INFRASTRUCTURE', 'The refund command result is missing its durable request.');
    return {...resultOf(request), replayed: true};
  }
  const request = (await db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, preparedValue.requestId)).limit(1))[0];
  if (!request) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
  const provider = selectBillingRefundProvider(request.provider, input.provider);
  let remote: BillingRefundProviderResult;
  try { remote = await provider.createRefund({requestId: request.id, orderId: request.orderId, amountMinor: request.amountMinor, currency: request.currency, idempotencyKey: request.idempotencyKey}); }
  catch { remote = {unknown: true}; }
  return inTransaction(db, (tx) => applyOwnerObservation(tx, request, input.actor, classifyBillingRefund(provider, remote, request.amountMinor), now));
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
      selectBillingRefundProvider(order.provider, input.provider);
      if (order.status !== 'paid') throw new DomainError('CONFLICT', 'Only a currently paid order can be refunded.');
      const pending = (await tx.select({id: billingRefundRequests.id}).from(billingRefundRequests).where(and(eq(billingRefundRequests.orderId, order.id), inArray(billingRefundRequests.status, ['pending', 'unknown']))).limit(1))[0];
      if (pending) throw new DomainError('CONFLICT', 'An unresolved refund already exists for this order.');
      const amountMinor = input.amountMinor ?? order.paidMinor;
      if (amountMinor <= 0n || amountMinor > order.paidMinor - order.refundedMinor) throw new DomainError('VALIDATION', 'Refund amount must be within the remaining paid amount.');
      const id = crypto.randomUUID();
      await tx.insert(billingRefundRequests).values({id, workspaceId: input.workspaceId, orderId: order.id, provider: order.provider, idempotencyKey: `refund:${id}`, amountMinor, currency: order.currency, reason, status: 'pending', externalId: null, createdAt: now, updatedAt: now, resolvedAt: null});
      await tx.update(billingAccounts).set({version: account.version + 1, updatedAt: now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
      await recordOperatorAudit(tx, {actorUserId: access.userId, workspaceId: input.workspaceId, commandName: 'operator.billing.refund', commandKey: input.idempotencyKey, payload: {requestId: id, orderId: order.id, amountMinor: amountMinor.toString(), requestedAmountMinor: input.amountMinor?.toString() ?? null, expectedVersion, reason, purpose}, now});
      await tx.insert(outboxEvents).values({id: crypto.randomUUID(), workspaceId: input.workspaceId, eventType: 'billing.refund_requested', aggregateId: id, businessKey: `billing.refund:${id}`, payload: {requestId: id, orderId: order.id, amountMinor: amountMinor.toString(), currency: order.currency}, status: 'pending', availableAt: now, createdAt: now});
      return {requestId: id, status: 'pending' as const, externalId: null, amountMinor: amountMinor.toString(), orderId: order.id, currency: order.currency};
    });
  });
  const result = await deliverOperatorRefund(db, {actor: input.actor, workspaceId: input.workspaceId, requestId: prepared.value.requestId, purpose, provider: input.provider, now: input.now});
  return {...result, replayed: prepared.replayed};
}

export async function reconcileBillingRefund(db: AppDatabase, input: Readonly<{requestId: string; actor: WorkspaceActor; externalId: string; provider?: BillingRefundProvider; now?: Date}>): Promise<RefundCommandResult> {
  const now = input.now ?? new Date();
  const request = await inTransaction(db, async (tx) => {
    const observed = (await tx.select({workspaceId: billingRefundRequests.workspaceId}).from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)).limit(1))[0];
    if (!observed) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
    await lockRefundScope(tx, observed.workspaceId);
    const request = (await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)).for('update').limit(1))[0];
    if (!request) throw new DomainError('NOT_FOUND', 'The refund request was not found.');
    await requireCurrentOwner(tx, request.workspaceId, input.actor);
    return request;
  });
  const provider = selectBillingRefundProvider(request.provider, input.provider);
  if (request.status === 'confirmed' || request.status === 'failed') return {...resultOf(request), replayed: true};
  let remote: BillingRefundProviderResult = {unknown: true};
  if (request.provider === 'fixture') remote = {externalId: input.externalId, amountMinor: request.amountMinor};
  else {
    try { remote = await provider.retrieveRefund?.({requestId: request.id, orderId: request.orderId, amountMinor: request.amountMinor, currency: request.currency, idempotencyKey: request.idempotencyKey, externalId: input.externalId}) ?? {unknown: true}; }
    catch { remote = {unknown: true}; }
  }
  return inTransaction(db, (tx) => applyOwnerObservation(tx, request, input.actor, classifyBillingRefund(provider, remote, request.amountMinor), now));
}
