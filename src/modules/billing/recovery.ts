import {randomUUID} from 'node:crypto';

import {and, eq, inArray} from 'drizzle-orm';

import {serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingCashEvents, billingOrders, billingReconciliationCases} from '../../db/schema/billing.ts';
import {creditGrants, workspaces} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {voidUnusedGrantInTransaction} from '../credits/reversals.ts';
import {recordAffiliateCashRecoveryInTransaction} from '../affiliates/cash-recovery.ts';

export type RecoveryKind = 'refund' | 'dispute_opened' | 'dispute_lost' | 'dispute_reversed';
type RecoveryInput = Readonly<{workspaceId: string; orderId: string; externalId: string; kind: RecoveryKind; amountMinor: bigint; currency?: string; actorUserId?: string; relatedExternalId?: string; economicLossId?: string; now: Date}>;
type RecoveryResult = Readonly<{status: 'refunded' | 'held' | 'recovered'; caseId: string | null; voided: bigint; restored: bigint; replayed: boolean}>;

function reference(value: string): string {
  if (!value || value.trim() !== value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) throw new DomainError('VALIDATION', 'Cash recovery identity is invalid.');
  return value;
}

/** Unique incremental cash facts only; provider adapters must normalize cumulative charge totals. */
export async function recordBillingRecoveryInTransaction(tx: TransactionDatabase, input: RecoveryInput): Promise<RecoveryResult> {
  if (input.amountMinor <= 0n) throw new DomainError('VALIDATION', 'Recovery amount must be positive.');
  const externalId = reference(input.externalId);
  const relatedExternalId = input.relatedExternalId === undefined ? null : reference(input.relatedExternalId);
  const economicLossId = input.economicLossId === undefined ? undefined : reference(input.economicLossId);
  await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
  await tx.select({workspaceId: billingAccounts.workspaceId}).from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).for('update').limit(1);
  const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.workspaceId, input.workspaceId), eq(billingOrders.id, input.orderId))).for('update').limit(1))[0];
  if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
  if (input.currency && input.currency !== order.currency) throw new DomainError('CONFLICT', 'Cash recovery currency does not match the canonical payment.');
  if (input.amountMinor > order.paidMinor) throw new DomainError('CONFLICT', 'Cash recovery exceeds the original payment.');
  const observations = await tx.select().from(billingCashEvents).where(and(eq(billingCashEvents.workspaceId, input.workspaceId), eq(billingCashEvents.orderId, order.id)));
  const sourceDispute = relatedExternalId ? observations.find((event) => event.externalId === relatedExternalId && (event.eventKind === 'dispute_opened' || event.eventKind === 'dispute_lost')) : undefined;
  const economicLossKey = economicLossId ?? sourceDispute?.economicLossKey ?? `${input.kind === 'refund' ? 'refund' : 'dispute'}:${externalId}`;
  const existing = (await tx.select().from(billingCashEvents).where(and(eq(billingCashEvents.provider, order.provider), eq(billingCashEvents.eventKind, input.kind), eq(billingCashEvents.externalId, externalId))).limit(1))[0];
  if (existing) {
    if (existing.orderId !== order.id || existing.amountMinor !== input.amountMinor || existing.economicLossKey !== economicLossKey || existing.relatedExternalId !== relatedExternalId) throw new DomainError('CONFLICT', 'Cash recovery identity has conflicting semantics.');
    return {status: order.status === 'refunded' ? 'refunded' : input.kind === 'dispute_reversed' ? 'recovered' : 'held', caseId: null, voided: 0n, restored: 0n, replayed: true};
  }
  if (input.kind === 'dispute_reversed' && (!sourceDispute || sourceDispute.amountMinor !== input.amountMinor || sourceDispute.economicLossKey !== economicLossKey)) throw new DomainError('CONFLICT', 'A reversal must match its previously recorded dispute.');
  const sameLoss = observations.filter((event) => event.economicLossKey === economicLossKey);
  if (sameLoss.some((event) => event.amountMinor !== input.amountMinor)) throw new DomainError('CONFLICT', 'The same economic loss cannot change its amount.');
  const priorConfirmedLoss = sameLoss.some((event) => event.eventKind === 'refund' || event.eventKind === 'dispute_lost');
  const confirmedLoss = input.kind === 'refund' || input.kind === 'dispute_lost';
  const incrementalLossMinor = confirmedLoss && !priorConfirmedLoss ? input.amountMinor : 0n;
  const uniqueLosses = new Map(observations.filter((event) => event.eventKind === 'refund' || event.eventKind === 'dispute_lost').map((event) => [event.economicLossKey, event.amountMinor]));
  const totalLoss = [...uniqueLosses.values()].reduce((total, value) => total + value, 0n) + incrementalLossMinor;
  if (totalLoss > order.paidMinor) throw new DomainError('CONFLICT', 'Cumulative economic losses exceed the original payment.');
  const duplicateRefund = sameLoss.some((event) => event.eventKind === 'refund');
  const refundedMinor = order.refundedMinor + (input.kind === 'refund' && !duplicateRefund ? input.amountMinor : 0n);
  if (refundedMinor > order.paidMinor) throw new DomainError('CONFLICT', 'Cumulative cash refunds exceed the original payment.');
  await tx.insert(billingCashEvents).values({id: randomUUID(), workspaceId: input.workspaceId, provider: order.provider, eventKind: input.kind, externalId, economicLossKey, relatedExternalId, orderId: order.id, amountMinor: input.amountMinor, currency: order.currency, status: 'confirmed', occurredAt: input.now, createdAt: input.now});
  await recordAffiliateCashRecoveryInTransaction(tx, {workspaceId: input.workspaceId, orderId: order.id, kind: input.kind, externalId, incrementalLossMinor, now: input.now});

  if (input.kind === 'dispute_reversed') {
    const disputeReferences = sameLoss.filter((event) => event.eventKind === 'dispute_opened' || event.eventKind === 'dispute_lost').map((event) => event.externalId);
    const cases = await tx.select().from(billingReconciliationCases).where(and(eq(billingReconciliationCases.workspaceId, input.workspaceId), eq(billingReconciliationCases.provider, order.provider), inArray(billingReconciliationCases.externalReference, disputeReferences), eq(billingReconciliationCases.reason, 'payment-dispute'), eq(billingReconciliationCases.status, 'open'))).for('update');
    for (const item of cases) await tx.update(billingReconciliationCases).set({status: 'resolved', resolvedAt: input.now}).where(eq(billingReconciliationCases.id, item.id));
    const unresolved = await tx.select({id: billingReconciliationCases.id}).from(billingReconciliationCases).where(and(eq(billingReconciliationCases.workspaceId, input.workspaceId), eq(billingReconciliationCases.status, 'open'))).limit(1);
    if (cases.length > 0 && unresolved.length === 0) {
      await tx.update(billingAccounts).set({status: 'active', holdReason: null, updatedAt: input.now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
      if (order.refundedMinor === 0n && order.paidAt) await tx.update(billingOrders).set({status: 'paid', updatedAt: input.now}).where(eq(billingOrders.id, order.id));
    }
    // Disputes do not void credits here. Never restore credits voided by a separate cash refund.
    return {status: 'recovered', caseId: cases[0]?.id ?? null, voided: 0n, restored: 0n, replayed: false};
  }

  if (input.kind === 'refund' && refundedMinor === order.paidMinor && (order.status === 'paid' || order.status === 'held')) {
    const grant = (await tx.select({id: creditGrants.id}).from(creditGrants).where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.businessKey, `billing:${order.id}:grant`))).limit(1))[0];
    const voided = grant && input.actorUserId ? (await voidUnusedGrantInTransaction(tx, {workspaceId: input.workspaceId, grantId: grant.id, actorUserId: input.actorUserId, commandKey: `refund:${externalId}`, reason: 'full cash refund', now: input.now})).voided : 0n;
    const status = voided > 0n || !grant ? 'refunded' as const : 'held' as const;
    await tx.update(billingOrders).set({status, refundedMinor, updatedAt: input.now}).where(eq(billingOrders.id, order.id));
    if (status === 'refunded') return {status, caseId: null, voided, restored: 0n, replayed: false};
  }
  const reason = input.kind === 'refund' ? 'cash-refund-requires-reconciliation' : 'payment-dispute';
  await tx.update(billingOrders).set({status: order.status === 'refunded' && input.kind === 'refund' ? 'refunded' : 'held', refundedMinor, updatedAt: input.now}).where(eq(billingOrders.id, order.id));
  await tx.update(billingAccounts).set({status: 'hold', holdReason: reason, updatedAt: input.now}).where(eq(billingAccounts.workspaceId, input.workspaceId));
  const caseId = randomUUID();
  await tx.insert(billingReconciliationCases).values({id: caseId, workspaceId: input.workspaceId, provider: order.provider, externalReference: externalId, reason, payload: serializeJsonValue({orderId: order.id, amountMinor: input.amountMinor.toString(), economicLossKey, kind: input.kind}), status: 'open', createdAt: input.now, resolvedAt: null}).onConflictDoNothing();
  return {status: 'held', caseId, voided: 0n, restored: 0n, replayed: false};
}

export async function recordBillingRecovery(db: AppDatabase, input: Omit<RecoveryInput, 'now'> & Readonly<{now?: Date}>): Promise<RecoveryResult> {
  return inTransaction(db, (tx) => recordBillingRecoveryInTransaction(tx, {...input, now: input.now ?? new Date()}));
}
