import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {creditGrants} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';

export type VoidGrantResult = Readonly<{grantId: string; voided: bigint; replayed: boolean}>;

export async function voidUnusedGrantInTransaction(tx: TransactionDatabase, input: Readonly<{workspaceId: string; grantId: string; actorUserId: string; commandKey: string; reason: string; now: Date}>): Promise<VoidGrantResult> {
  const rows = await tx.select().from(creditGrants).where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.id, input.grantId))).for('update').limit(1);
  const grant = rows[0];
  if (!grant) throw new DomainError('NOT_FOUND', 'The credit grant was not found.');
  if (grant.reserved > 0n || grant.consumed > 0n || grant.available === 0n) return {grantId: grant.id, voided: 0n, replayed: true};
  const amount = grant.available;
  const businessKey = `billing:${grant.id}:refund-void`;
  const existing = await tx.select({id: creditLedgerEntries.id}).from(creditLedgerEntries).where(eq(creditLedgerEntries.businessKey, businessKey)).limit(1);
  if (existing[0]) return {grantId: grant.id, voided: 0n, replayed: true};
  await tx.update(creditGrants).set({available: 0n, voided: grant.voided + amount}).where(eq(creditGrants.id, grant.id));
  await tx.insert(creditLedgerEntries).values({id: randomUUID(), workspaceId: input.workspaceId, grantId: grant.id, entryType: 'void', availableDelta: -amount, reservedDelta: 0n, consumedDelta: 0n, expiredDelta: 0n, voidedDelta: amount, businessKey, createdAt: input.now});
  await tx.insert(auditEvents).values({id: randomUUID(), actorUserId: input.actorUserId, workspaceId: input.workspaceId, commandName: 'billing.refund-void', commandKey: input.commandKey, semanticHash: semanticHash('billing.refund-void', {grantId: grant.id, amount: amount.toString(), reason: input.reason}), payload: serializeJsonValue({grantId: grant.id, amount: amount.toString(), reason: input.reason}), createdAt: input.now}).onConflictDoNothing();
  await tx.insert(outboxEvents).values({id: randomUUID(), workspaceId: input.workspaceId, eventType: 'credit.grant_voided', aggregateId: grant.id, businessKey: `${businessKey}:outbox`, payload: serializeJsonValue({grantId: grant.id, workspaceId: input.workspaceId, amount: amount.toString()}), status: 'pending', availableAt: input.now, leaseUntil: null, leaseOwner: null, leaseToken: null, leaseGeneration: 0n, attempts: 0, createdAt: input.now}).onConflictDoNothing();
  return {grantId: grant.id, voided: amount, replayed: false};
}

export async function voidUnusedGrant(db: AppDatabase, input: Readonly<{workspaceId: string; grantId: string; actorUserId: string; commandKey: string; reason: string; now?: Date}>): Promise<VoidGrantResult> {
  return inTransaction(db, (tx) => voidUnusedGrantInTransaction(tx, {...input, now: input.now ?? new Date()}));
}
