import {and, asc, desc, eq, inArray, or, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {generationTasks, submissionAttempts} from '../../db/schema/generation.ts';
import {creditAllocations, creditGrants, creditReservations} from '../../db/schema/workspace.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export type CreditBalanceRow = Readonly<{
  grantId: string;
  source: string;
  originAllocationId: string | null;
  expiresAt: string | null;
  available: string;
  reserved: string;
  consumed: string;
  expired: string;
  voided: string;
  ledgerAvailable: string;
  ledgerReserved: string;
  ledgerConsumed: string;
  ledgerExpired: string;
  ledgerVoided: string;
  reconciled: boolean;
  allocations: ReadonlyArray<Readonly<{
    allocationId: string;
    reservationId: string;
    amount: string;
    sourceExpiry: string | null;
    reservationStatus: string;
  }>>;
}>;

export type CreditBalance = Readonly<{
  workspaceId: string;
  available: string;
  reserved: string;
  consumed: string;
  expired: string;
  voided: string;
  held: boolean;
  rows: ReadonlyArray<CreditBalanceRow>;
}>;

/**
 * A deliberately narrow task recovery view for the authenticated workspace UI.
 *
 * This projection contains correlation identifiers and bounded timing/state
 * evidence only. It intentionally does not select task snapshots, outbox
 * payloads, command results, provider request identifiers or storage fields.
 */
export type GenerationRecoveryProjection = Readonly<{
  workspaceId: string;
  taskId: string;
  status: string;
  version: number;
  failureCode: string | null;
  deadlineAt: Date;
  queueDeadlineAt: Date;
  stageDeadlineAt: Date | null;
  overallDeadlineAt: Date | null;
  nextActionAt: Date;
  materializationAttempts: number;
  attempt: Readonly<{
    id: string;
    attemptNo: number;
    state: string;
    startedAt: Date;
    reconcileDeadline: Date;
    probeCount: number;
    costState: string;
  }> | null;
  event: Readonly<{
    id: string;
    eventType: string;
    status: string;
    createdAt: Date;
  }> | null;
  command: Readonly<{
    id: string;
    commandName: string;
    status: string;
    createdAt: Date;
  }> | null;
  reservation: Readonly<{
    id: string;
    status: string;
    totalCost: string;
  }> | null;
  release: Readonly<{
    id: string;
    entryType: string;
    amount: string;
    businessKey: string;
    createdAt: Date;
  }> | null;
}>;

export type CreditReadDatabase = AppDatabase | TransactionDatabase;

async function readProjectionRows(db: CreditReadDatabase, workspaceId: string) {
  return db.select({
    grant: creditGrants,
    ledgerAvailable: sql<string>`coalesce(sum(${creditLedgerEntries.availableDelta}), 0)::text`,
    ledgerReserved: sql<string>`coalesce(sum(${creditLedgerEntries.reservedDelta}), 0)::text`,
    ledgerConsumed: sql<string>`coalesce(sum(${creditLedgerEntries.consumedDelta}), 0)::text`,
    ledgerExpired: sql<string>`coalesce(sum(${creditLedgerEntries.expiredDelta}), 0)::text`,
    ledgerVoided: sql<string>`coalesce(sum(${creditLedgerEntries.voidedDelta}), 0)::text`,
  }).from(creditGrants)
    .leftJoin(creditLedgerEntries, and(
      eq(creditLedgerEntries.grantId, creditGrants.id),
      eq(creditLedgerEntries.workspaceId, workspaceId),
    ))
    .where(eq(creditGrants.workspaceId, workspaceId))
    .groupBy(creditGrants.id)
    .orderBy(sql`${creditGrants.expiresAt} asc nulls last, ${creditGrants.createdAt} asc, ${creditGrants.id} asc`);
}

function projectionMatches(row: Awaited<ReturnType<typeof readProjectionRows>>[number]): boolean {
  return row.grant.available.toString() === row.ledgerAvailable &&
    row.grant.reserved.toString() === row.ledgerReserved &&
    row.grant.consumed.toString() === row.ledgerConsumed &&
    row.grant.expired.toString() === row.ledgerExpired &&
    row.grant.voided.toString() === row.ledgerVoided;
}

/** Block balance-consuming commands while immutable ledger and projections disagree. */
export async function assertCreditProjectionReconciledInTransaction(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await readProjectionRows(tx, workspaceId);
  if (rows.some((row) => !projectionMatches(row))) {
    throw new DomainError('CONFLICT', 'Credit reconciliation hold: the workspace balance requires operator review.');
  }
}

/** Read an explainable balance projection and hold the surface on any ledger mismatch. */
export async function getCreditBalance(db: AppDatabase, workspaceId: string, now = new Date()): Promise<CreditBalance> {
  const rows = await readProjectionRows(db, workspaceId);
  const allocationRows = await db.select({
    allocationId: creditAllocations.id,
    grantId: creditAllocations.grantId,
    reservationId: creditAllocations.reservationId,
    amount: creditAllocations.amount,
    sourceExpiry: creditAllocations.sourceExpiry,
    reservationStatus: creditReservations.status,
  }).from(creditAllocations)
    .innerJoin(creditReservations, and(
      eq(creditReservations.id, creditAllocations.reservationId),
      eq(creditReservations.workspaceId, creditAllocations.workspaceId),
    ))
    .where(eq(creditAllocations.workspaceId, workspaceId))
    .orderBy(sql`${creditAllocations.createdAt} asc, ${creditAllocations.id} asc`);
  const allocationsByGrant = new Map<string, Array<{allocationId: string; reservationId: string; amount: string; sourceExpiry: string | null; reservationStatus: string}>>();
  for (const allocation of allocationRows) {
    const current = allocationsByGrant.get(allocation.grantId) ?? [];
    current.push({
      allocationId: allocation.allocationId,
      reservationId: allocation.reservationId,
      amount: allocation.amount.toString(),
      sourceExpiry: allocation.sourceExpiry?.toISOString() ?? null,
      reservationStatus: allocation.reservationStatus,
    });
    allocationsByGrant.set(allocation.grantId, current);
  }
  let available = 0n; let reserved = 0n; let consumed = 0n; let expired = 0n; let voided = 0n; let held = false;
  const projected = rows.map((row) => {
    const values = {
      available: row.grant.available.toString(), reserved: row.grant.reserved.toString(), consumed: row.grant.consumed.toString(), expired: row.grant.expired.toString(), voided: row.grant.voided.toString(),
    };
    const reconciled = projectionMatches(row);
    if (!reconciled) held = true;
    available += row.grant.expiresAt !== null && row.grant.expiresAt <= now ? 0n : row.grant.available;
    reserved += row.grant.reserved; consumed += row.grant.consumed; expired += row.grant.expired; voided += row.grant.voided;
    return {grantId: row.grant.id, source: row.grant.source, originAllocationId: row.grant.originAllocationId, expiresAt: row.grant.expiresAt?.toISOString() ?? null, ...values, ledgerAvailable: row.ledgerAvailable, ledgerReserved: row.ledgerReserved, ledgerConsumed: row.ledgerConsumed, ledgerExpired: row.ledgerExpired, ledgerVoided: row.ledgerVoided, reconciled, allocations: allocationsByGrant.get(row.grant.id) ?? []};
  });
  return {workspaceId, available: available.toString(), reserved: reserved.toString(), consumed: consumed.toString(), expired: expired.toString(), voided: voided.toString(), held, rows: projected};
}

/**
 * Read safe, workspace-scoped recovery evidence for persisted generation
 * tasks. The joins preserve the operational lineage without returning any
 * provider, object, signed-location, secret or token fields.
 */
export async function getGenerationRecoveryProjection(
  db: CreditReadDatabase,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<ReadonlyArray<GenerationRecoveryProjection>> {
  const ids = [...new Set(taskIds)].filter((taskId) => taskId.length > 0).slice(0, 100);
  if (ids.length === 0) return [];

  const tasks = await db.select({
    workspaceId: generationTasks.workspaceId,
    taskId: generationTasks.id,
    status: generationTasks.status,
    version: generationTasks.version,
    failureCode: generationTasks.failureCode,
    deadlineAt: generationTasks.deadlineAt,
    queueDeadlineAt: generationTasks.queueDeadlineAt,
    stageDeadlineAt: generationTasks.stageDeadlineAt,
    overallDeadlineAt: generationTasks.overallDeadlineAt,
    nextActionAt: generationTasks.nextActionAt,
    materializationAttempts: generationTasks.materializationAttempts,
  }).from(generationTasks).where(and(
    eq(generationTasks.workspaceId, workspaceId),
    inArray(generationTasks.id, ids),
  )).orderBy(desc(generationTasks.updatedAt), desc(generationTasks.id));

  const attempts = await db.selectDistinctOn([submissionAttempts.taskId], {
    id: submissionAttempts.id,
    taskId: submissionAttempts.taskId,
    attemptNo: submissionAttempts.attemptNo,
    state: submissionAttempts.state,
    startedAt: submissionAttempts.startedAt,
    reconcileDeadline: submissionAttempts.reconcileDeadline,
    probeCount: submissionAttempts.probeCount,
    costState: submissionAttempts.costState,
  }).from(submissionAttempts).where(and(
    eq(submissionAttempts.workspaceId, workspaceId),
    inArray(submissionAttempts.taskId, ids),
  )).orderBy(asc(submissionAttempts.taskId), desc(submissionAttempts.attemptNo), desc(submissionAttempts.startedAt), desc(submissionAttempts.id));
  const attemptByTask = new Map<string, typeof attempts[number]>();
  for (const attempt of attempts) if (!attemptByTask.has(attempt.taskId)) attemptByTask.set(attempt.taskId, attempt);

  const reservations = await db.select({
    id: creditReservations.id,
    taskId: creditReservations.taskId,
    status: creditReservations.status,
    totalCost: creditReservations.totalCost,
  }).from(creditReservations).where(and(
    eq(creditReservations.workspaceId, workspaceId),
    inArray(creditReservations.taskId, ids),
  ));
  const reservationByTask = new Map<string, typeof reservations[number]>();
  for (const reservation of reservations) if (reservation.taskId) reservationByTask.set(reservation.taskId, reservation);
  const reservationIds = reservations.map((reservation) => reservation.id);

  const events = reservationIds.length === 0 ? [] : await db.selectDistinctOn([outboxEvents.aggregateId], {
    id: outboxEvents.id,
    aggregateId: outboxEvents.aggregateId,
    eventType: outboxEvents.eventType,
    status: outboxEvents.status,
    createdAt: outboxEvents.createdAt,
  }).from(outboxEvents).where(and(
    eq(outboxEvents.workspaceId, workspaceId),
    inArray(outboxEvents.aggregateId, reservationIds),
  )).orderBy(asc(outboxEvents.aggregateId), desc(outboxEvents.createdAt), desc(outboxEvents.id));
  const eventByReservation = new Map<string, typeof events[number]>();
  for (const event of events) if (event.aggregateId && !eventByReservation.has(event.aggregateId)) eventByReservation.set(event.aggregateId, event);

  // Extract only the task correlation from command JSON. The command payload
  // itself is intentionally never selected into this public projection.
  const commandTaskId = sql<string | null>`${commandResults.result}->>'taskId'`;
  const commands = await db.selectDistinctOn([commandTaskId], {
    id: commandResults.id,
    taskId: commandTaskId,
    commandName: commandResults.commandName,
    status: commandResults.status,
    createdAt: commandResults.createdAt,
  }).from(commandResults).where(and(eq(commandResults.workspaceId, workspaceId), inArray(commandTaskId, ids))).orderBy(commandTaskId, desc(commandResults.createdAt), desc(commandResults.id));
  const commandByTask = new Map<string, typeof commands[number]>();
  for (const command of commands) if (command.taskId) commandByTask.set(command.taskId, command);

  // A grant can fund many tasks. The immutable allocation settlement identity,
  // not the shared grant identity, ties a refund/release to its reservation.
  const releases = reservationIds.length === 0 ? [] : await db.selectDistinctOn([creditAllocations.reservationId], {
    reservationId: creditAllocations.reservationId,
    id: creditLedgerEntries.id,
    entryType: creditLedgerEntries.entryType,
    amount: creditLedgerEntries.availableDelta,
    businessKey: creditLedgerEntries.businessKey,
    createdAt: creditLedgerEntries.createdAt,
  }).from(creditAllocations).innerJoin(creditLedgerEntries, and(
    eq(creditLedgerEntries.workspaceId, creditAllocations.workspaceId),
    eq(creditLedgerEntries.grantId, creditAllocations.grantId),
    or(eq(creditLedgerEntries.businessKey, sql`${creditAllocations.id}::text || ':failed'`), eq(creditLedgerEntries.businessKey, sql`${creditAllocations.id}::text || ':cancelled'`)),
  )).where(and(
    eq(creditAllocations.workspaceId, workspaceId),
    inArray(creditAllocations.reservationId, reservationIds),
    or(eq(creditLedgerEntries.entryType, 'release'), eq(creditLedgerEntries.entryType, 'refund')),
  )).orderBy(asc(creditAllocations.reservationId), desc(creditLedgerEntries.createdAt), desc(creditLedgerEntries.id));
  const releaseByReservation = new Map<string, typeof releases[number]>();
  for (const release of releases) releaseByReservation.set(release.reservationId, release);

  return tasks.map((task) => {
    const reservation = reservationByTask.get(task.taskId);
    const event = reservation ? eventByReservation.get(reservation.id) : undefined;
    const command = commandByTask.get(task.taskId);
    const release = reservation ? releaseByReservation.get(reservation.id) : undefined;
    const attempt = attemptByTask.get(task.taskId);
    return {
      ...task,
      attempt: attempt ? {
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        state: attempt.state,
        startedAt: attempt.startedAt,
        reconcileDeadline: attempt.reconcileDeadline,
        probeCount: attempt.probeCount,
        costState: attempt.costState,
      } : null,
      event: event ? {id: event.id, eventType: event.eventType, status: event.status, createdAt: event.createdAt} : null,
      command: command ? {id: command.id, commandName: command.commandName, status: command.status, createdAt: command.createdAt} : null,
      reservation: reservation ? {id: reservation.id, status: reservation.status, totalCost: reservation.totalCost.toString()} : null,
      release: release ? {id: release.id, entryType: release.entryType, amount: release.amount.toString(), businessKey: release.businessKey, createdAt: release.createdAt} : null,
    } satisfies GenerationRecoveryProjection;
  });
}

