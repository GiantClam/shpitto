import {and, eq} from 'drizzle-orm';

import type {TransactionDatabase} from '../shared/transaction.ts';
import {billingPaymentAliases} from '../../db/schema/billing.ts';
import {DomainError} from '../../db/contracts.ts';
import type {PaymentAlias} from './contracts.ts';

export type PaymentAliasInput = Readonly<PaymentAlias & {workspaceId: string; orderId: string; createdAt: Date}>;

/** Resolve any known provider object to one canonical order. */
export async function findCanonicalOrderId(tx: TransactionDatabase, aliases: readonly PaymentAlias[]): Promise<string | null> {
  if (aliases.length === 0) return null;
  const rows = [] as Array<{orderId: string}>;
  for (const alias of aliases) {
    const matches = await tx.select({orderId: billingPaymentAliases.orderId}).from(billingPaymentAliases).where(and(
      eq(billingPaymentAliases.provider, alias.provider),
      eq(billingPaymentAliases.objectKind, alias.objectKind),
      eq(billingPaymentAliases.externalId, alias.externalId),
    ));
    rows.push(...matches);
  }
  const ids = [...new Set(rows.map((row) => row.orderId))];
  if (ids.length > 1) throw new DomainError('CONFLICT', 'Payment aliases resolve to conflicting orders.');
  return ids[0] ?? null;
}

/** Add aliases idempotently while rejecting cross-order identity reuse. */
export async function attachPaymentAliases(tx: TransactionDatabase, aliases: readonly PaymentAliasInput[]): Promise<void> {
  for (const alias of aliases) {
    const existing = await tx.select({orderId: billingPaymentAliases.orderId}).from(billingPaymentAliases).where(and(
      eq(billingPaymentAliases.provider, alias.provider),
      eq(billingPaymentAliases.objectKind, alias.objectKind),
      eq(billingPaymentAliases.externalId, alias.externalId),
    )).limit(1);
    if (existing[0] && existing[0].orderId !== alias.orderId) {
      throw new DomainError('CONFLICT', 'A provider alias is already bound to another order.');
    }
    if (!existing[0]) {
      await tx.insert(billingPaymentAliases).values(alias).onConflictDoNothing();
    }
  }
}
