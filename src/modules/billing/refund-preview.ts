import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingOrders} from '../../db/schema/billing.ts';
import {creditGrants} from '../../db/schema/workspace.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';
import {inTransaction} from '../shared/transaction.ts';
import {authorizeOperatorCommand} from '../operations/authorize.ts';
import {recordTenantAccess, validateOperatorReason} from '../operations/audit.ts';

export type RefundPreview = Readonly<{
  workspaceId: string;
  orderId: string;
  amountMinor: bigint;
  currency: string;
  orderStatus: string;
  creditGrantId: string | null;
  creditIssued: bigint;
  creditAvailable: bigint;
  creditReserved: bigint;
  creditConsumed: bigint;
  eligible: boolean;
  reason: 'full-unused' | 'partial-or-exposed' | 'already-refunded' | 'not-paid';
}>;

export async function previewBillingRefund(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; orderId: string; amountMinor?: bigint}>): Promise<RefundPreview> {
  return inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.workspaceId, input.workspaceId))).limit(1))[0];
    if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
    const grant = (await tx.select().from(creditGrants).where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.businessKey, `billing:${order.id}:grant`))).limit(1))[0];
    const amountMinor = input.amountMinor ?? order.paidMinor;
    if (amountMinor <= 0n || amountMinor > order.paidMinor) throw new DomainError('VALIDATION', 'Refund amount must be within the paid amount.');
    const reason = order.status === 'refunded' ? 'already-refunded' : order.status !== 'paid' ? 'not-paid' : amountMinor < order.paidMinor || !grant || grant.reserved > 0n || grant.consumed > 0n ? 'partial-or-exposed' : 'full-unused';
    return {workspaceId: input.workspaceId, orderId: order.id, amountMinor, currency: order.currency, orderStatus: order.status, creditGrantId: grant?.id ?? null, creditIssued: grant?.issued ?? 0n, creditAvailable: grant?.available ?? 0n, creditReserved: grant?.reserved ?? 0n, creditConsumed: grant?.consumed ?? 0n, eligible: reason !== 'already-refunded' && reason !== 'not-paid', reason};
  });
}

/** Operator preview uses the same domain facts while recording tenant purpose. */
export async function previewBillingRefundForOperator(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; orderId: string; amountMinor?: bigint; purpose: string}>): Promise<RefundPreview & Readonly<{expectedVersion: number}>> {
  const purpose = validateOperatorReason(input.purpose);
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator');
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose});
    const account = (await tx.select({version: billingAccounts.version}).from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).limit(1))[0];
    if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
    const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.workspaceId, input.workspaceId))).limit(1))[0];
    if (!order) throw new DomainError('NOT_FOUND', 'The billing order was not found.');
    const grant = (await tx.select().from(creditGrants).where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.businessKey, `billing:${order.id}:grant`))).limit(1))[0];
    const amountMinor = input.amountMinor ?? order.paidMinor;
    if (amountMinor <= 0n || amountMinor > order.paidMinor) throw new DomainError('VALIDATION', 'Refund amount must be within the paid amount.');
    const reason = order.status === 'refunded' ? 'already-refunded' : order.status !== 'paid' ? 'not-paid' : amountMinor < order.paidMinor || !grant || grant.reserved > 0n || grant.consumed > 0n ? 'partial-or-exposed' : 'full-unused';
    return {expectedVersion: account.version, workspaceId: input.workspaceId, orderId: order.id, amountMinor, currency: order.currency, orderStatus: order.status, creditGrantId: grant?.id ?? null, creditIssued: grant?.issued ?? 0n, creditAvailable: grant?.available ?? 0n, creditReserved: grant?.reserved ?? 0n, creditConsumed: grant?.consumed ?? 0n, eligible: reason !== 'already-refunded' && reason !== 'not-paid', reason};
  });
}
