import {randomUUID} from 'node:crypto';

import {and, eq, gt, lte, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {creditLedgerEntries} from '../../db/schema/credit.ts';
import {creditAccounts, creditGrants} from '../../db/schema/workspace.ts';
import {type TransactionDatabase} from '../shared/transaction.ts';
import {assertCreditProjectionReconciledInTransaction} from './queries.ts';

export type ExpirySweepResult = Readonly<{expiredGrantIds: ReadonlyArray<string>; expiredAmount: string}>;

/** Move only unreserved expired grant amounts to the expired bucket. */
export async function sweepExpiredCreditsInTransaction(tx: TransactionDatabase, workspaceId: string, now: Date): Promise<ExpirySweepResult> {
  const account = await tx.select({workspaceId: creditAccounts.workspaceId}).from(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId)).for('update').limit(1);
  if (!account[0]) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
  await assertCreditProjectionReconciledInTransaction(tx, workspaceId);
  const grants = await tx.select().from(creditGrants).where(and(
    eq(creditGrants.workspaceId, workspaceId),
    gt(creditGrants.available, 0n),
    lte(creditGrants.expiresAt, now),
  )).for('update');
  let expiredAmount = 0n;
  const expiredGrantIds: string[] = [];
  for (const grant of grants) {
    const amount = grant.available;
    if (amount <= 0n) continue;
    await tx.update(creditGrants).set({available: 0n, expired: sql`${creditGrants.expired} + ${amount}`})
      .where(eq(creditGrants.id, grant.id));
    await tx.insert(creditLedgerEntries).values({
      id: randomUUID(), workspaceId, grantId: grant.id, entryType: 'expire',
      availableDelta: -amount, reservedDelta: 0n, consumedDelta: 0n, expiredDelta: amount, voidedDelta: 0n,
      businessKey: `${grant.id}:expire:${now.toISOString()}`, createdAt: now,
    });
    expiredAmount += amount;
    expiredGrantIds.push(grant.id);
  }
  return {expiredGrantIds, expiredAmount: expiredAmount.toString(10)};
}

export async function sweepExpiredCredits(db: AppDatabase, workspaceId: string, now = new Date()): Promise<ExpirySweepResult> {
  return db.transaction((tx) => sweepExpiredCreditsInTransaction(tx, workspaceId, now));
}

