import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {classifyBillingRefund, selectBillingRefundProvider, type BillingRefundProvider, type BillingRefundProviderResult} from '../../adapters/billing/refunds.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingRefundRequests} from '../../db/schema/billing.ts';
import {outboxEvents} from '../../db/schema/credit.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {assertOutboxLeaseInTransaction, OUTBOX_LEASE_MS, startOutboxHeartbeat, type OutboxLease} from '../generation/outbox.ts';
import {recordOperatorAudit, recordTenantAccess, validateOperatorReason} from '../operations/audit.ts';
import {authorizeOperatorCommand} from '../operations/authorize.ts';
import {inTransaction} from '../shared/transaction.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {recordBillingRecoveryInTransaction} from './recovery.ts';
import type {RefundCommandResult} from './refund-command.ts';

type DeliveryInput = Readonly<{actor: WorkspaceActor; workspaceId: string; requestId: string; purpose: string; provider?: BillingRefundProvider; now?: Date}>;
type RefundRow = typeof billingRefundRequests.$inferSelect;

function resultOf(request: RefundRow): RefundCommandResult {
  return {requestId: request.id, status: request.status as RefundCommandResult['status'], externalId: request.externalId, amountMinor: request.amountMinor, orderId: request.orderId};
}

async function claimRefundDelivery(db: AppDatabase, input: DeliveryInput, purpose: string, now: Date): Promise<Readonly<{request: RefundRow; lease: OutboxLease | null; submit: boolean}>> {
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const observed = (await tx.select().from(billingRefundRequests).where(and(eq(billingRefundRequests.id, input.requestId), eq(billingRefundRequests.workspaceId, input.workspaceId))).limit(1))[0];
    if (!observed) throw new DomainError('NOT_FOUND', 'Refund intent was not found.');
    selectBillingRefundProvider(observed.provider, input.provider);
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose, now});
    if (observed.status === 'confirmed' || observed.status === 'failed') return {request: observed, lease: null, submit: false};
    const event = (await tx.select().from(outboxEvents).where(and(eq(outboxEvents.businessKey, `billing.refund:${observed.id}`), eq(outboxEvents.workspaceId, input.workspaceId), eq(outboxEvents.eventType, 'billing.refund_requested'))).for('update').limit(1))[0];
    const request = (await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, observed.id)).for('update').limit(1))[0];
    if (!request) throw new DomainError('NOT_FOUND', 'Refund intent was not found.');
    if (request.status === 'confirmed' || request.status === 'failed') return {request, lease: null, submit: false};
    if (!event || event.status !== 'pending') throw new DomainError('INFRASTRUCTURE', 'The refund delivery intent is unavailable.');
    if (event.availableAt > now || (event.leaseUntil && event.leaseUntil > now)) return {request, lease: null, submit: false};
    const lease: OutboxLease = {id: event.id, eventType: event.eventType, payload: event.payload, owner: `refund-${randomUUID()}`, token: randomUUID(), generation: event.leaseGeneration + 1n, attempts: event.attempts + 1};
    const submit = event.leaseGeneration === 0n && request.status === 'pending';
    await tx.update(outboxEvents).set({leaseOwner: lease.owner, leaseToken: lease.token, leaseGeneration: lease.generation, leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS), attempts: lease.attempts}).where(eq(outboxEvents.id, event.id));
    await recordOperatorAudit(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'operator.billing.refund.delivery', commandKey: `${request.id}:${lease.generation}`, payload: {requestId: request.id, mode: submit ? 'submit' : 'lookup', purpose}, now});
    return {request, lease, submit};
  });
}

/** Only a never-claimed intent may submit. An expired/unknown attempt can only look up evidence. */
export async function deliverOperatorRefund(db: AppDatabase, input: DeliveryInput): Promise<RefundCommandResult> {
  const purpose = validateOperatorReason(input.purpose);
  const clock = () => input.now ?? new Date();
  const {request, lease, submit} = await claimRefundDelivery(db, input, purpose, clock());
  if (!lease) return resultOf(request);
  const provider = selectBillingRefundProvider(request.provider, input.provider);
  const heartbeat = startOutboxHeartbeat(db, lease, {now: clock});
  try {
    await heartbeat.renew();
    const providerInput = {requestId: request.id, orderId: request.orderId, amountMinor: request.amountMinor, currency: request.currency, idempotencyKey: request.idempotencyKey};
    let observation: BillingRefundProviderResult;
    try { observation = submit ? await provider.createRefund(providerInput) : await provider.lookupRefund?.(providerInput) ?? {unknown: true}; }
    catch { observation = {unknown: true}; }
    // Mismatched observations remain unresolved; they cannot write cash/ledger effects.
    const outcome = classifyBillingRefund(provider, observation, request.amountMinor);
    return await inTransaction(db, async (tx) => {
      const now = clock();
      // Match billing reconciliation's workspace/account order before cash effects.
      await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, request.workspaceId)).for('update').limit(1);
      await tx.select({workspaceId: billingAccounts.workspaceId}).from(billingAccounts).where(eq(billingAccounts.workspaceId, request.workspaceId)).for('update').limit(1);
      await assertOutboxLeaseInTransaction(tx, lease, now);
      const current = (await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, request.id)).for('update').limit(1))[0];
      if (!current) throw new DomainError('INFRASTRUCTURE', 'The recorded refund intent is missing.');
      if (current.status === 'confirmed' || current.status === 'failed') return resultOf(current);
      if (current.workspaceId !== request.workspaceId || current.orderId !== request.orderId || current.provider !== request.provider || current.idempotencyKey !== request.idempotencyKey || current.amountMinor !== request.amountMinor || current.currency !== request.currency || (current.externalId && outcome.externalId && current.externalId !== outcome.externalId)) throw new DomainError('CONFLICT', 'The refund binding changed during observation.');
      if (outcome.status !== 'confirmed') {
        const externalId = outcome.externalId ?? current.externalId;
        await tx.update(billingRefundRequests).set({status: outcome.status, externalId, updatedAt: now, resolvedAt: outcome.status === 'failed' ? now : null}).where(eq(billingRefundRequests.id, request.id));
        await tx.update(outboxEvents).set({status: outcome.status === 'failed' ? 'published' : 'pending', leaseUntil: null, leaseOwner: null, leaseToken: null, availableAt: new Date(now.getTime() + OUTBOX_LEASE_MS)}).where(eq(outboxEvents.id, lease.id));
        await recordOperatorAudit(tx, {actorUserId: input.actor.userId, workspaceId: request.workspaceId, commandName: `operator.billing.refund.${outcome.status}`, commandKey: `${request.id}:${lease.generation}`, payload: {requestId: request.id, mode: submit ? 'submit' : 'lookup'}, now});
        return {...resultOf(current), status: outcome.status, externalId};
      }
      const externalId = outcome.externalId!;
      await recordBillingRecoveryInTransaction(tx, {workspaceId: request.workspaceId, orderId: request.orderId, externalId, kind: 'refund', amountMinor: request.amountMinor, actorUserId: input.actor.userId, now});
      await tx.update(billingRefundRequests).set({status: 'confirmed', externalId, updatedAt: now, resolvedAt: now}).where(eq(billingRefundRequests.id, request.id));
      await tx.update(outboxEvents).set({status: 'published', leaseUntil: null, leaseOwner: null, leaseToken: null}).where(eq(outboxEvents.id, lease.id));
      await recordOperatorAudit(tx, {actorUserId: input.actor.userId, workspaceId: request.workspaceId, commandName: 'operator.billing.refund.confirmed', commandKey: request.id, payload: {requestId: request.id, orderId: request.orderId, externalId, amountMinor: request.amountMinor.toString()}, now});
      return {...resultOf(request), status: 'confirmed', externalId};
    });
  } finally {await heartbeat.stop();}
}
