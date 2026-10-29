import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {creditAccounts, creditAllocations, creditGrants, creditReservations} from '../../db/schema/workspace.ts';
import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import {issueGrantInTransaction} from './ledger.ts';
import {assertCreditProjectionReconciledInTransaction} from './queries.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {type TransactionDatabase} from '../shared/transaction.ts';

const COMPENSATION_DAYS = 7;

export type SettlementOutcome = 'cancelled' | 'failed' | 'consumed';

export type SettleReservationInput = Readonly<{
  actorUserId: string;
  workspaceId: string;
  reservationId: string;
  idempotencyKey: string;
  outcome: SettlementOutcome;
  now?: Date;
  providerCostEvidence?: Readonly<Record<string, unknown>>;
}>;

export type SettlementAllocation = Readonly<{
  allocationId: string;
  grantId: string;
  amount: string;
  source: string;
  sourceExpiry: string | null;
  disposition: 'available' | 'expired' | 'consumed';
  compensationGrantId: string | null;
}>;

export type SettlementResult = Readonly<{
  reservationId: string;
  outcome: SettlementOutcome;
  allocations: ReadonlyArray<SettlementAllocation>;
}>;

function assertOutcome(value: string): asserts value is SettlementOutcome {
  if (value !== 'cancelled' && value !== 'failed' && value !== 'consumed') {
    throw new DomainError('VALIDATION', 'Unsupported credit settlement outcome.');
  }
}

async function lockAccount(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await tx.select({workspaceId: creditAccounts.workspaceId})
    .from(creditAccounts)
    .where(eq(creditAccounts.workspaceId, workspaceId))
    .for('update')
    .limit(1);
  if (!rows[0]) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
}

export async function settleInTransaction(tx: TransactionDatabase, input: SettleReservationInput): Promise<SettlementResult> {
  assertOutcome(input.outcome);
  const now = input.now ?? new Date();
  await lockAccount(tx, input.workspaceId);
  await assertCreditProjectionReconciledInTransaction(tx, input.workspaceId);

  const reservationRows = await tx.select().from(creditReservations).where(and(
    eq(creditReservations.id, input.reservationId),
    eq(creditReservations.workspaceId, input.workspaceId),
  )).for('update').limit(1);
  const reservation = reservationRows[0];
  if (!reservation) throw new DomainError('NOT_FOUND', 'Credit reservation was not found.');
  if (reservation.status !== 'active') {
    throw new DomainError('CONFLICT', 'The credit reservation already has a terminal settlement.');
  }

  const rows = await tx.select({allocation: creditAllocations, grant: creditGrants})
    .from(creditAllocations)
    .innerJoin(creditGrants, eq(creditGrants.id, creditAllocations.grantId))
    .where(and(
      eq(creditAllocations.reservationId, input.reservationId),
      eq(creditAllocations.workspaceId, input.workspaceId),
    ));
  const settled: SettlementAllocation[] = [];

  for (const row of rows) {
    const allocation = row.allocation;
    const grant = row.grant;
    const businessKey = `${allocation.id}:${input.outcome}`;
    const existingLedger = await tx.select({id: creditLedgerEntries.id})
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.businessKey, businessKey)).limit(1);
    if (existingLedger[0]) {
      throw new DomainError('CONFLICT', 'A terminal credit ledger entry already exists for this allocation.');
    }

    const sourceExpired = allocation.sourceExpiry !== null && allocation.sourceExpiry.getTime() <= now.getTime();
    const expiredDisposition = input.outcome !== 'consumed' && sourceExpired;
    const disposition: SettlementAllocation['disposition'] = input.outcome === 'consumed'
      ? 'consumed'
      : expiredDisposition ? 'expired' : 'available';
    const availableDelta = disposition === 'available' ? allocation.amount : 0n;
    const consumedDelta = disposition === 'consumed' ? allocation.amount : 0n;
    const expiredDelta = disposition === 'expired' ? allocation.amount : 0n;

    await tx.update(creditGrants).set({
      reserved: grant.reserved - allocation.amount,
      available: grant.available + availableDelta,
      consumed: grant.consumed + consumedDelta,
      expired: grant.expired + expiredDelta,
    }).where(and(eq(creditGrants.id, grant.id), eq(creditGrants.workspaceId, input.workspaceId)));
    await tx.insert(creditLedgerEntries).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      grantId: grant.id,
      entryType: input.outcome === 'consumed' ? 'consume' : input.outcome === 'failed' ? 'refund' : 'release',
      availableDelta,
      reservedDelta: -allocation.amount,
      consumedDelta,
      expiredDelta,
      voidedDelta: 0n,
      businessKey,
      createdAt: now,
    });

    let compensationGrantId: string | null = null;
    if (input.outcome === 'failed' && disposition === 'expired' && grant.source === 'subscription') {
      const compensation = await issueGrantInTransaction(tx, {
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        commandName: 'credits.failure-compensation',
        commandKey: `credits.failure-compensation:${allocation.id}`,
        businessKey: `credits.failure-compensation:${allocation.id}`,
        source: 'compensation',
        amount: allocation.amount,
        expiresAt: new Date(now.getTime() + COMPENSATION_DAYS * 24 * 60 * 60 * 1000),
        originAllocationId: allocation.id,
        payload: {
          allocationId: allocation.id,
          sourceGrantId: grant.id,
          amount: allocation.amount.toString(10),
          expiresAt: new Date(now.getTime() + COMPENSATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      compensationGrantId = compensation.grantId;
    }
    settled.push({
      allocationId: allocation.id,
      grantId: grant.id,
      amount: allocation.amount.toString(10),
      source: grant.source,
      sourceExpiry: allocation.sourceExpiry?.toISOString() ?? null,
      disposition,
      compensationGrantId,
    });
  }

  await tx.update(creditReservations).set({status: input.outcome === 'consumed' ? 'consumed' : 'released'})
    .where(and(eq(creditReservations.id, input.reservationId), eq(creditReservations.workspaceId, input.workspaceId)));
  const commandName = `credits.${input.outcome}`;
  await tx.insert(auditEvents).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    commandName,
    commandKey: input.idempotencyKey,
    semanticHash: semanticHash(commandName, {reservationId: input.reservationId, outcome: input.outcome}),
    payload: serializeJsonValue({reservationId: input.reservationId, outcome: input.outcome, providerCostEvidence: input.providerCostEvidence ?? null}),
    createdAt: now,
  });
  await tx.insert(outboxEvents).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    eventType: `credit.reservation_${input.outcome}`,
    aggregateId: input.reservationId,
    businessKey: `${input.reservationId}:${input.outcome}:outbox`,
    payload: serializeJsonValue({reservationId: input.reservationId, outcome: input.outcome, allocations: settled}),
    status: 'pending',
    availableAt: now,
    leaseUntil: null,
    leaseOwner: null,
    leaseToken: null,
    leaseGeneration: 0n,
    attempts: 0,
    createdAt: now,
  });
  return {reservationId: input.reservationId, outcome: input.outcome, allocations: settled};
}

/** Settle a reservation once, preserving each allocation's source expiry. */
export async function settleReservation(db: AppDatabase, input: SettleReservationInput): Promise<{value: SettlementResult; replayed: boolean}> {
  assertOutcome(input.outcome);
  const commandName = `credits.${input.outcome}`;
  const payload = {reservationId: input.reservationId, outcome: input.outcome, providerCostEvidence: input.providerCostEvidence ?? null};
  return db.transaction((tx) => executeDurableCommand(tx, {
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    commandName,
    idempotencyKey: input.idempotencyKey,
    payload,
  }, () => settleInTransaction(tx, input)));
}

