import {randomUUID} from 'node:crypto';

import {and, eq, sql} from 'drizzle-orm';

import {affiliateCorrectionCases, affiliatePayments, affiliateSettings} from '../../db/schema/affiliate.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';
import {recordAffiliateRefundInTransaction} from './runtime.ts';

/** Billing owns economic-loss normalization; no local commission balance is inferred here. */
export async function recordAffiliateCashRecoveryInTransaction(tx: TransactionDatabase, input: Readonly<{
  workspaceId: string;
  orderId: string;
  kind: 'refund' | 'dispute_opened' | 'dispute_lost' | 'dispute_reversed';
  externalId: string;
  incrementalLossMinor: bigint;
  now: Date;
}>): Promise<void> {
  const config = (await tx.select({enabled: affiliateSettings.enabled}).from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
  if (config?.enabled !== 'enabled') return;
  const payment = (await tx.select({id: affiliatePayments.id}).from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, input.workspaceId), eq(affiliatePayments.paymentReference, input.orderId))).limit(1))[0];
  const reason = input.kind === 'dispute_reversed' ? 'dispute_reversed_requires_provider_correction' : input.kind.startsWith('dispute_') ? 'payment_dispute' : !payment ? 'cash_recovery_before_affiliate_payment' : null;
  if (reason) await tx.insert(affiliateCorrectionCases).values({id: randomUUID(), workspaceId: input.workspaceId, paymentReference: input.orderId, reason, status: 'open', createdAt: input.now, resolvedAt: null}).onConflictDoUpdate({target: [affiliateCorrectionCases.workspaceId, affiliateCorrectionCases.paymentReference, affiliateCorrectionCases.reason], set: {status: 'open', resolvedAt: null, version: sql`${affiliateCorrectionCases.version} + 1`}});
  if (payment && input.incrementalLossMinor > 0n) await recordAffiliateRefundInTransaction(tx, {workspaceId: input.workspaceId, paymentReference: input.orderId, refundReference: input.kind === 'dispute_lost' ? `dispute-loss:${input.externalId}` : input.externalId, amountMinor: input.incrementalLossMinor, now: input.now});
}
