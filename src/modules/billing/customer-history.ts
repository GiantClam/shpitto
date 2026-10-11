import {and, eq, isNull} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingCustomerHistory} from '../../db/schema/billing.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';

export type BillingCustomerProvider = 'fixture' | 'stripe';

export type CustomerHistoryEntry = Readonly<{
  provider: BillingCustomerProvider;
  workspaceId: string;
  customerId: string;
  previousCustomerId: string | null;
  validFrom: Date;
  validUntil: Date | null;
  changeReason: string;
}>;

function customerId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) throw new DomainError('VALIDATION', 'The billing customer identifier is invalid.');
  return value;
}

function reason(value: string): string {
  if (value.trim().length < 3 || value.trim().length > 255) throw new DomainError('VALIDATION', 'A billing customer history reason is required.');
  return value.trim();
}

export async function findCurrentCustomer(tx: TransactionDatabase, workspaceId: string, provider: BillingCustomerProvider): Promise<CustomerHistoryEntry | null> {
  const rows = await tx.select().from(billingCustomerHistory).where(and(
    eq(billingCustomerHistory.workspaceId, workspaceId),
    eq(billingCustomerHistory.provider, provider),
    isNull(billingCustomerHistory.validUntil),
  )).limit(1);
  const row = rows[0];
  return row ? {...row, provider: row.provider as BillingCustomerProvider} : null;
}

export async function ensureCurrentCustomer(tx: TransactionDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider; now: Date; create: boolean}>): Promise<string> {
  const current = await findCurrentCustomer(tx, input.workspaceId, input.provider);
  if (current) return current.customerId;
  if (!input.create) throw new DomainError('CONFLICT', 'A billing customer is not configured for this workspace.');
  const generated = customerId(`${input.provider}_customer_${input.workspaceId}`);
  await tx.insert(billingCustomerHistory).values({
    workspaceId: input.workspaceId,
    provider: input.provider,
    customerId: generated,
    previousCustomerId: null,
    validFrom: input.now,
    validUntil: null,
    changeReason: 'Created by local billing Checkout command',
  });
  return generated;
}

export async function replaceCustomer(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider; customerId: string; reason: string; now?: Date}>): Promise<CustomerHistoryEntry> {
  const nextCustomerId = customerId(input.customerId);
  const changeReason = reason(input.reason);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const currentRows = await tx.select().from(billingCustomerHistory).where(and(
      eq(billingCustomerHistory.workspaceId, input.workspaceId),
      eq(billingCustomerHistory.provider, input.provider),
      isNull(billingCustomerHistory.validUntil),
    )).for('update').limit(1);
    const current = currentRows[0];
    if (!current) throw new DomainError('NOT_FOUND', 'A current billing customer is not configured for this workspace.');
    const currentEntry = {...current, provider: current.provider as BillingCustomerProvider};
    if (current.customerId === nextCustomerId) return currentEntry;
    await tx.update(billingCustomerHistory).set({validUntil: now}).where(and(
      eq(billingCustomerHistory.provider, input.provider),
      eq(billingCustomerHistory.customerId, current.customerId),
    ));
    await tx.insert(billingCustomerHistory).values({
      workspaceId: input.workspaceId,
      provider: input.provider,
      customerId: nextCustomerId,
      previousCustomerId: currentEntry.customerId,
      validFrom: now,
      validUntil: null,
      changeReason,
    });
    return {provider: input.provider, workspaceId: input.workspaceId, customerId: nextCustomerId, previousCustomerId: currentEntry.customerId, validFrom: now, validUntil: null, changeReason};
  });
}

export async function listCustomerHistory(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider}>): Promise<readonly CustomerHistoryEntry[]> {
  return inTransaction(db, async (tx) => (await tx.select().from(billingCustomerHistory).where(and(
    eq(billingCustomerHistory.workspaceId, input.workspaceId),
    eq(billingCustomerHistory.provider, input.provider),
  )).orderBy(billingCustomerHistory.validFrom)).map((row) => ({...row, provider: row.provider as BillingCustomerProvider})));
}
