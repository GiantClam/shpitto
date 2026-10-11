import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {creditAccounts, creditGrants} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';

export type GrantSource = 'subscription' | 'purchase' | 'compensation' | 'manual' | 'demo';

export type IssueGrantInput = Readonly<{
  actorUserId: string;
  workspaceId: string;
  commandName: string;
  commandKey: string;
  businessKey: string;
  source: GrantSource;
  amount: bigint;
  expiresAt?: Date | null;
  originAllocationId?: string | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type IssueGrantOptions = Readonly<{
  failAfter?: 'audit' | 'outbox';
}>;

export type IssueGrantResult = Readonly<{
  grantId: string;
  workspaceId: string;
  amount: bigint;
  replayed: boolean;
}>;

function assertInput(input: IssueGrantInput): void {
  if (input.amount <= 0n) throw new DomainError('VALIDATION', 'Grant amount must be positive.');
  if (!input.businessKey.trim()) throw new DomainError('VALIDATION', 'Grant business key is required.');
  if (!input.actorUserId.trim()) throw new DomainError('VALIDATION', 'Grant actor is required.');
}

async function lockCreditAccount(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await tx.select({workspaceId: creditAccounts.workspaceId}).from(creditAccounts)
    .where(eq(creditAccounts.workspaceId, workspaceId)).for('update').limit(1);
  if (!rows[0]) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
}

export async function issueGrantInTransaction(
  tx: TransactionDatabase,
  input: IssueGrantInput,
  options: IssueGrantOptions = {},
): Promise<IssueGrantResult> {
  await lockCreditAccount(tx, input.workspaceId);
  const hash = semanticHash(input.commandName, input.payload);
  const existing = await tx.select({id: creditGrants.id, amount: creditGrants.issued}).from(creditGrants)
    .where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.businessKey, input.businessKey))).limit(1);
  if (existing[0]) {
    const audit = await tx.select({semanticHash: auditEvents.semanticHash}).from(auditEvents).where(and(
      eq(auditEvents.actorUserId, input.actorUserId),
      eq(auditEvents.workspaceId, input.workspaceId),
      eq(auditEvents.commandName, input.commandName),
      eq(auditEvents.commandKey, input.commandKey),
    )).limit(1);
    if (!audit[0] || audit[0].semanticHash !== hash) throw new DomainError('CONFLICT', 'Grant business key was already used for a different command.');
    return {grantId: existing[0].id, workspaceId: input.workspaceId, amount: existing[0].amount, replayed: true};
  }

  const grantId = randomUUID();
  const timestamp = new Date();
  await tx.insert(creditGrants).values({
    id: grantId,
    workspaceId: input.workspaceId,
    source: input.source,
    issued: input.amount,
    available: input.amount,
    reserved: 0n,
    consumed: 0n,
    expired: 0n,
    voided: 0n,
    expiresAt: input.expiresAt ?? null,
    originAllocationId: input.originAllocationId ?? null,
    businessKey: input.businessKey,
    createdAt: timestamp,
  });
  await tx.insert(creditLedgerEntries).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    grantId,
    entryType: input.source === 'compensation' ? 'compensation' : 'grant_issued',
    availableDelta: input.amount,
    reservedDelta: 0n,
    consumedDelta: 0n,
    expiredDelta: 0n,
    voidedDelta: 0n,
    businessKey: `${input.businessKey}:ledger`,
    createdAt: timestamp,
  });
  await tx.insert(auditEvents).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    commandName: input.commandName,
    commandKey: input.commandKey,
    semanticHash: hash,
    payload: serializeJsonValue(input.payload),
    createdAt: timestamp,
  });
  if (options.failAfter === 'audit') throw new Error('injected-audit-failure');
  await tx.insert(outboxEvents).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    eventType: 'credit.grant_issued',
    aggregateId: grantId,
    businessKey: `${input.businessKey}:outbox`,
    payload: serializeJsonValue({grantId, workspaceId: input.workspaceId, amount: input.amount}),
    status: 'pending',
    availableAt: timestamp,
    leaseUntil: null,
    leaseOwner: null,
    leaseToken: null,
    leaseGeneration: 0n,
    attempts: 0,
    createdAt: timestamp,
  });
  if (options.failAfter === 'outbox') throw new Error('injected-outbox-failure');
  return {grantId, workspaceId: input.workspaceId, amount: input.amount, replayed: false};
}

/** Issue one immutable grant with ledger, audit and outbox rows in one transaction. */
export async function issueGrant(
  db: AppDatabase,
  input: IssueGrantInput,
  options: IssueGrantOptions = {},
): Promise<IssueGrantResult> {
  assertInput(input);
  return inTransaction(db, (tx) => issueGrantInTransaction(tx, input, options));
}
