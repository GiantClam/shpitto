import {randomUUID} from 'node:crypto';

import {and, eq, gt, isNull, lte, or, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents, outboxEvents} from '../../db/schema/credit.ts';
import {assets} from '../../db/schema/asset.ts';
import {generationQuarantine, generationTasks, submissionAttempts} from '../../db/schema/generation.ts';
import {creditAccounts, creditReservations} from '../../db/schema/workspace.ts';
import type {VerifiedObservation} from '../../adapters/providers/port.ts';
import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import {authorizeWorkspaceAccess} from '../workspaces/authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {executeDurableCommand, type CommandIdentity, type CommandExecution} from '../shared/commands.ts';
import {type TransactionDatabase} from '../shared/transaction.ts';
import {settleInTransaction, type SettlementResult} from '../credits/settle.ts';
import {assertOutboxLeaseInTransaction, type OutboxLease} from './outbox.ts';
import {assertGenerationTaskTransition, isTerminalGenerationState, type GenerationTaskStatus} from './state.ts';

const EXECUTION_BUDGET_MS = 60 * 60 * 1000;
const MATERIALIZATION_BUDGET_MS = 30 * 60 * 1000;
const OVERALL_BUDGET_MS = 90 * 60 * 1000;
const UNKNOWN_RECONCILE_MS = 60 * 60 * 1000;
const SUBMISSION_TIMEOUT_MS = 30 * 1000;
const MAX_RECONCILIATION_PROBES = 24;
const RECONCILIATION_INTERVAL_MS = 150_000;

type TaskRow = typeof generationTasks.$inferSelect;

/** Current user access is required even when the durable command only replays. */
async function executeGenerationCommand<T>(
  tx: TransactionDatabase,
  input: Readonly<{actor: WorkspaceActor; workspaceId: string; internalWorker?: boolean}>,
  identity: CommandIdentity,
  work: () => Promise<T>,
): Promise<CommandExecution<T>> {
  if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  return executeDurableCommand(tx, identity, work);
}
async function lockAccount(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await tx.select({workspaceId: creditAccounts.workspaceId})
    .from(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId)).for('update').limit(1);
  if (!rows[0]) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
}

async function lockTask(tx: TransactionDatabase, workspaceId: string, taskId: string): Promise<TaskRow> {
  const rows = await tx.select().from(generationTasks).where(and(
    eq(generationTasks.id, taskId),
    eq(generationTasks.workspaceId, workspaceId),
  )).for('update').limit(1);
  const task = rows[0];
  if (!task) throw new DomainError('NOT_FOUND', 'Generation task was not found.');
  return task;
}

type DeadlineFence = 'active' | 'expired' | 'any';
type TransitionClock = Readonly<{now?: Date; outboxLease?: OutboxLease}>;

async function lockDispatchEvents(tx: TransactionDatabase, workspaceId: string, reservationId: string): Promise<void> {
  await tx.select({id: outboxEvents.id}).from(outboxEvents).where(and(
    eq(outboxEvents.workspaceId, workspaceId), eq(outboxEvents.aggregateId, reservationId),
    eq(outboxEvents.eventType, 'generation.dispatch'), eq(outboxEvents.status, 'pending'),
  )).for('update');
}

/**
 * Persist a state transition only for the row that was locked and inspected in
 * this transaction. The version and status predicates make the transition an
 * optimistic fence as well as a row-lock fence; deadline predicates prevent a
 * stale worker from advancing an accepted budget after recovery owns it.
 */
async function updateTaskFenced(
  tx: TransactionDatabase,
  task: TaskRow,
  workspaceId: string,
  clock: TransitionClock,
  patch: Readonly<Record<string, unknown>>,
  deadline: DeadlineFence = 'any',
): Promise<void> {
  const now = clock.now ?? new Date();
  assertDate(now);
  await assertOutboxLeaseInTransaction(tx, clock.outboxLease, now);
  // Normal execution uses the statement's wall clock, after every prior lock
  // wait. Explicit timestamps remain deterministic for trusted replay probes.
  const cutoff = clock.now ?? sql`clock_timestamp()`;
  const predicates = [
    eq(generationTasks.id, task.id),
    eq(generationTasks.workspaceId, workspaceId),
    eq(generationTasks.status, task.status),
    eq(generationTasks.version, task.version),
  ];
  if (deadline === 'active') {
    predicates.push(gt(generationTasks.deadlineAt, cutoff));
    predicates.push(or(isNull(generationTasks.overallDeadlineAt), gt(generationTasks.overallDeadlineAt, cutoff))!);
  } else if (deadline === 'expired') {
    predicates.push(lte(generationTasks.deadlineAt, cutoff));
  }
  if (clock.outboxLease) {
    // The exact owner/token/generation row is already locked above. Include its
    // live expiry in the write itself, including time spent acquiring that lock.
    predicates.push(sql`exists (select 1 from ${outboxEvents} where ${outboxEvents.id} = ${clock.outboxLease.id} and ${outboxEvents.leaseUntil} > ${cutoff})`);
  }
  const changed = await tx.update(generationTasks).set({
    ...patch,
    version: task.version + 1,
    updatedAt: now,
  }).where(and(...predicates)).returning({id: generationTasks.id});
  if (!changed[0]) {
    throw new DomainError('CONFLICT', 'Generation task transition lost its active version, deadline, or worker lease.');
  }
}

function assertDate(value: Date): void {
  if (Number.isNaN(value.getTime())) throw new DomainError('VALIDATION', 'A valid lifecycle timestamp is required.');
}

function assertBeforeDeadline(task: TaskRow, now: Date): void {
  if (task.deadlineAt <= now || (task.overallDeadlineAt && task.overallDeadlineAt <= now)) {
    throw new DomainError('CONFLICT', 'The generation deadline has expired. Recovery must settle the task first.');
  }
}

export type DispatchClaimResult = Readonly<{
  taskId: string;
  workspaceId: string;
  status: 'dispatching';
  dispatchIdentity: string;
  attemptId: string;
  clientReference: string;
  reconcileDeadline: string;
}>;

export type ClaimDispatchInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  idempotencyKey: string;
  provider?: string;
  outboxLease?: OutboxLease;
  now?: Date;
}>;

async function claimInTransaction(tx: TransactionDatabase, input: ClaimDispatchInput): Promise<DispatchClaimResult> {
  await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  await lockAccount(tx, input.workspaceId);
  const task = await lockTask(tx, input.workspaceId, input.taskId);
  await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
  if (task.status !== 'queued') {
    throw new DomainError('CONFLICT', `Only queued generation tasks can be claimed; current state is ${task.status}.`);
  }
  const reservationRows = await tx.select({id: creditReservations.id, status: creditReservations.status})
    .from(creditReservations).where(and(
      eq(creditReservations.taskId, input.taskId),
      eq(creditReservations.workspaceId, input.workspaceId),
    )).for('update').limit(1);
  const reservation = reservationRows[0];
  if (!reservation || reservation.status !== 'active') throw new DomainError('CONFLICT', 'The task credit reservation is not active.');
  const now = input.now ?? new Date();
  assertDate(now);
  assertBeforeDeadline(task, now);

  const dispatchIdentity = randomUUID();
  const attemptId = randomUUID();
  const clientReference = dispatchIdentity;
  const stageDeadline = new Date(now.getTime() + EXECUTION_BUDGET_MS);
  const overallDeadline = new Date(now.getTime() + OVERALL_BUDGET_MS);
  await tx.insert(submissionAttempts).values({
    id: attemptId,
    taskId: task.id,
    workspaceId: input.workspaceId,
    attemptNo: 1,
    provider: input.provider ?? 'mock',
    clientReference,
    providerRequestId: null,
    state: 'claimed',
    startedAt: now,
    reconcileDeadline: new Date(now.getTime() + UNKNOWN_RECONCILE_MS),
    probeCount: 0,
    costMinor: null,
    costCurrency: null,
    costState: 'unknown',
  });
  await updateTaskFenced(tx, task, input.workspaceId, input, {
    status: 'dispatching',
    dispatchStartedAt: now,
    submissionStartedAt: null,
    dispatchIdentity,
    providerCostState: 'unknown',
    providerCostMinor: null,
    providerCostCurrency: null,
    deadlineAt: stageDeadline,
    stageDeadlineAt: stageDeadline,
    overallDeadlineAt: overallDeadline,
    materializationAttempts: task.materializationAttempts,
    nextActionAt: now,
  }, 'active');
  return {
    taskId: task.id,
    workspaceId: input.workspaceId,
    status: 'dispatching',
    dispatchIdentity,
    attemptId,
    clientReference,
    reconcileDeadline: new Date(now.getTime() + UNKNOWN_RECONCILE_MS).toISOString(),
  };
}

/** At most one live owner may cross this durable network-start fence. Replays return false. */
export async function beginProviderSubmission(db: AppDatabase, input: Readonly<{
  actor: WorkspaceActor; workspaceId: string; taskId: string; attemptId: string; outboxLease: OutboxLease; now?: Date;
}>): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockAccount(tx, input.workspaceId);
    const task = await lockTask(tx, input.workspaceId, input.taskId);
    await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
    if (task.status !== 'dispatching' || task.submissionStartedAt) return false;
    const attempt = (await tx.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, input.attemptId), eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, input.workspaceId))).for('update').limit(1))[0];
    if (!attempt || attempt.state !== 'claimed' || attempt.providerRequestId) return false;
    const now = input.now ?? new Date();
    assertBeforeDeadline(task, now);
    await updateTaskFenced(tx, task, input.workspaceId, input, {submissionStartedAt: now, nextActionAt: now}, 'active');
    return true;
  });
}

export type MarkSubmissionUnknownInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  idempotencyKey: string;
  now?: Date;
  internalWorker?: boolean;
  outboxLease?: OutboxLease;
}>;

export type MarkSubmissionUnknownResult = Readonly<{
  taskId: string;
  attemptId: string;
  status: 'submission_unknown';
  reconcileDeadline: string;
}>;

async function markSubmissionUnknownInTransaction(tx: TransactionDatabase, input: MarkSubmissionUnknownInput): Promise<MarkSubmissionUnknownResult> {
  if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  await lockAccount(tx, input.workspaceId);
  const task = await lockTask(tx, input.workspaceId, input.taskId);
  if (task.status !== 'dispatching') throw new DomainError('CONFLICT', 'Only dispatching tasks can enter submission_unknown.');
  const attempts = await tx.select().from(submissionAttempts).where(and(
    eq(submissionAttempts.id, input.attemptId),
    eq(submissionAttempts.taskId, task.id),
    eq(submissionAttempts.workspaceId, input.workspaceId),
  )).for('update').limit(1);
  const attempt = attempts[0];
  if (!attempt || attempt.state !== 'claimed') throw new DomainError('CONFLICT', 'The submission attempt is not claimable for reconciliation.');
  const now = input.now ?? new Date();
  assertDate(now);
  const reconcileDeadline = attempt.reconcileDeadline;
  await tx.update(submissionAttempts).set({state: 'submission_unknown', reconcileDeadline})
    .where(eq(submissionAttempts.id, attempt.id));
  await updateTaskFenced(tx, task, input.workspaceId, input, {
    status: 'submission_unknown', submissionStartedAt: task.dispatchStartedAt ?? now,
    deadlineAt: reconcileDeadline, nextActionAt: now,
  }, 'active');
  return {taskId: task.id, attemptId: attempt.id, status: 'submission_unknown', reconcileDeadline: reconcileDeadline.toISOString()};
}

/** Record a submit timeout without granting any second paid-create right. */
export async function markSubmissionUnknown(db: AppDatabase, input: MarkSubmissionUnknownInput): Promise<{value: MarkSubmissionUnknownResult; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    commandName: 'generation.mark-submission-unknown', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, attemptId: input.attemptId},
  }, () => markSubmissionUnknownInTransaction(tx, input)));
}

export function isSubmissionTimedOut(startedAt: Date, now = new Date()): boolean {
  assertDate(startedAt);
  assertDate(now);
  return now.getTime() - startedAt.getTime() >= SUBMISSION_TIMEOUT_MS;
}

export type ReconcileSubmissionUnknownInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  idempotencyKey: string;
  observation: 'found' | 'missing';
  providerRequestId?: string;
  now?: Date;
  internalWorker?: boolean;
  outboxLease?: OutboxLease;
}>;

export type ReconcileSubmissionUnknownResult = Readonly<{
  taskId: string;
  attemptId: string;
  status: 'submitted' | 'probing' | 'failed';
  probeCount: number;
  nextActionAt: string;
}>;

async function reconcileSubmissionUnknownInTransaction(tx: TransactionDatabase, input: ReconcileSubmissionUnknownInput): Promise<ReconcileSubmissionUnknownResult> {
  if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  await lockAccount(tx, input.workspaceId);
  const task = await lockTask(tx, input.workspaceId, input.taskId);
  if (task.status !== 'submission_unknown') throw new DomainError('CONFLICT', 'Only submission_unknown tasks can be reconciled.');
  const rows = await tx.select().from(submissionAttempts).where(and(
    eq(submissionAttempts.id, input.attemptId), eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, input.workspaceId),
  )).for('update').limit(1);
  const attempt = rows[0];
  if (!attempt || attempt.state !== 'submission_unknown') throw new DomainError('CONFLICT', 'The attempt is not awaiting reconciliation.');
  await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
  const now = input.now ?? new Date();
  assertDate(now);
  if (input.observation === 'found') {
    if (!input.providerRequestId?.trim()) throw new DomainError('VALIDATION', 'Provider request evidence is required.');
    const nextActionAt = now;
    await tx.update(submissionAttempts).set({state: 'submitted', providerRequestId: input.providerRequestId.trim(), probeCount: attempt.probeCount})
      .where(eq(submissionAttempts.id, attempt.id));
    await updateTaskFenced(tx, task, input.workspaceId, input, {status: 'submitted', nextActionAt}, 'active');
    return {taskId: task.id, attemptId: attempt.id, status: 'submitted', probeCount: attempt.probeCount, nextActionAt: nextActionAt.toISOString()};
  }
  const exhausted = attempt.probeCount + 1 >= MAX_RECONCILIATION_PROBES || now.getTime() >= attempt.reconcileDeadline.getTime();
  if (exhausted) {
    const settled = await settleGenerationInTransaction(tx, {
      actor: input.actor, workspaceId: input.workspaceId, taskId: task.id,
      idempotencyKey: `${input.idempotencyKey}.settle`, outcome: 'failed', failureCode: 'generation.submission_untraceable',
      providerCostEvidence: {state: 'unknown'}, internalWorker: true, outboxLease: input.outboxLease, now: input.now,
    });
    return {taskId: task.id, attemptId: attempt.id, status: settled.status === 'failed' ? 'failed' : 'probing', probeCount: attempt.probeCount + 1, nextActionAt: now.toISOString()};
  }
  const nextActionAt = new Date(now.getTime() + RECONCILIATION_INTERVAL_MS);
  await tx.update(submissionAttempts).set({probeCount: attempt.probeCount + 1}).where(eq(submissionAttempts.id, attempt.id));
  await updateTaskFenced(tx, task, input.workspaceId, input, {nextActionAt}, 'active');
  return {taskId: task.id, attemptId: attempt.id, status: 'probing', probeCount: attempt.probeCount + 1, nextActionAt: nextActionAt.toISOString()};
}

/** Reconcile an existing ambiguous attempt; this command never creates another provider submission. */
export async function reconcileSubmissionUnknown(db: AppDatabase, input: ReconcileSubmissionUnknownInput): Promise<{value: ReconcileSubmissionUnknownResult; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    commandName: 'generation.reconcile-submission', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, attemptId: input.attemptId, observation: input.observation, providerRequestId: input.providerRequestId ?? null},
  }, () => reconcileSubmissionUnknownInTransaction(tx, input)));
}

/** Recover an accepted request only from a verified provider callback bound to the pre-POST nonce. */
export async function adoptVerifiedProviderRequest(db: AppDatabase, verified: VerifiedObservation, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const found = (await tx.select({workspaceId: submissionAttempts.workspaceId, taskId: submissionAttempts.taskId, id: submissionAttempts.id}).from(submissionAttempts)
      .where(and(eq(submissionAttempts.provider, verified.observation.ref.provider), eq(submissionAttempts.clientReference, verified.attemptNonce))).limit(1))[0];
    if (!found) throw new DomainError('CONFLICT', 'Authenticated callback is not linked to an issued attempt.');
    await lockAccount(tx, found.workspaceId);
    const task = await lockTask(tx, found.workspaceId, found.taskId);
    const attempt = (await tx.select().from(submissionAttempts).where(eq(submissionAttempts.id, found.id)).for('update').limit(1))[0]!;
    const ref = verified.observation.ref;
    if (task.modelKey !== ref.modelKey || attempt.provider !== ref.provider) throw new DomainError('CONFLICT', 'Callback contract does not match the issued attempt.');
    if (attempt.providerRequestId) {
      if (attempt.providerRequestId !== ref.requestId) throw new DomainError('CONFLICT', 'Callback cannot replace an existing provider request identity.');
      return;
    }
    if (!task.submissionStartedAt || !['claimed', 'submission_unknown', 'failed'].includes(attempt.state)) throw new DomainError('CONFLICT', 'Callback cannot adopt an attempt that never crossed the submit fence.');
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(ref.requestId)) throw new DomainError('VALIDATION', 'Provider request identity is invalid.');
    const terminal = isTerminalGenerationState(task.status as GenerationTaskStatus);
    await tx.update(submissionAttempts).set({providerRequestId: ref.requestId, ...(terminal ? {} : {state: 'submitted'})}).where(eq(submissionAttempts.id, attempt.id));
    if (!terminal) {
      // An overdue accepted create is immediately settled by sweep before any materialization.
      await updateTaskFenced(tx, task, task.workspaceId, {now}, {status: 'submitted', nextActionAt: now}, 'any');
    }
  });
}

export type RecordProviderSubmissionInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  providerRequestId: string;
  statusUrl?: string;
  resultUrl?: string;
  idempotencyKey: string;
  now?: Date;
  internalWorker?: boolean;
  outboxLease?: OutboxLease;
}>;

/** Persist the provider request ID only for the already claimed attempt. */
export async function recordProviderSubmission(db: AppDatabase, input: RecordProviderSubmissionInput): Promise<{value: {taskId: string; status: 'submitted'; providerRequestId: string}; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'generation.record-submission', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, attemptId: input.attemptId, providerRequestId: input.providerRequestId, statusUrl: input.statusUrl ?? null, resultUrl: input.resultUrl ?? null},
  }, async () => {
    if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
    await lockAccount(tx, input.workspaceId);
    const task = await lockTask(tx, input.workspaceId, input.taskId);
    await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
    const rows = await tx.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, input.attemptId), eq(submissionAttempts.taskId, task.id))).for('update').limit(1);
    const attempt = rows[0];
    if (attempt?.providerRequestId === input.providerRequestId.trim()) {
      if (input.statusUrl && !isTrustedProviderTrackingUrl(input.statusUrl, attempt.provider, input.providerRequestId)) throw new DomainError('VALIDATION', 'Provider status URL is outside the trusted provider contract.');
      if (input.resultUrl && !isTrustedProviderTrackingUrl(input.resultUrl, attempt.provider, input.providerRequestId)) throw new DomainError('VALIDATION', 'Provider result URL is outside the trusted provider contract.');
      await tx.update(submissionAttempts).set({providerStatusUrl: attempt.providerStatusUrl ?? input.statusUrl ?? null, providerResultUrl: attempt.providerResultUrl ?? input.resultUrl ?? null}).where(eq(submissionAttempts.id, attempt.id));
      return {taskId: task.id, status: 'submitted' as const, providerRequestId: attempt.providerRequestId};
    }
    if (task.status !== 'dispatching') throw new DomainError('CONFLICT', 'Only dispatching tasks can record a provider submission.');
    if (!attempt || attempt.state !== 'claimed') throw new DomainError('CONFLICT', 'The claimed attempt is not available.');
    const now = input.now ?? new Date();
    assertDate(now);
    assertBeforeDeadline(task, now);
    if (!input.providerRequestId.trim()) throw new DomainError('VALIDATION', 'Provider request ID is required.');
    const statusUrl = input.statusUrl?.trim() || null;
    const resultUrl = input.resultUrl?.trim() || null;
    if (statusUrl && !isTrustedProviderTrackingUrl(statusUrl, attempt.provider, input.providerRequestId)) throw new DomainError('VALIDATION', 'Provider status URL is outside the trusted provider contract.');
    if (resultUrl && !isTrustedProviderTrackingUrl(resultUrl, attempt.provider, input.providerRequestId)) throw new DomainError('VALIDATION', 'Provider result URL is outside the trusted provider contract.');
    await tx.update(submissionAttempts).set({state: 'submitted', providerRequestId: input.providerRequestId.trim(), providerStatusUrl: statusUrl, providerResultUrl: resultUrl}).where(eq(submissionAttempts.id, attempt.id));
    await updateTaskFenced(tx, task, input.workspaceId, input, {status: 'submitted', nextActionAt: now}, 'active');
    return {taskId: task.id, status: 'submitted' as const, providerRequestId: input.providerRequestId.trim()};
  }));
}

function isTrustedProviderTrackingUrl(value: string, provider: string, requestId: string): boolean {
  try {
    const url = new URL(value);
    if (value.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
    if (provider === 'fal') return url.origin === 'https://queue.fal.run' && (url.pathname.endsWith(`/${encodeURIComponent(requestId)}`) || url.pathname.endsWith(`/${encodeURIComponent(requestId)}/status`));
    if (provider === 'replicate') return url.origin === 'https://api.replicate.com' && url.pathname === `/v1/predictions/${encodeURIComponent(requestId)}`;
    return false;
  } catch {
    return false;
  }
}

export async function markGenerationMaterializing(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; taskId: string; attemptId: string; idempotencyKey: string; now?: Date; internalWorker?: boolean; outboxLease?: OutboxLease}>): Promise<{value: {taskId: string; status: 'materializing'}; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'generation.mark-materializing', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, attemptId: input.attemptId},
  }, async () => {
    if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
    await lockAccount(tx, input.workspaceId);
    const task = await lockTask(tx, input.workspaceId, input.taskId);
    await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
    if (task.status !== 'submitted' && task.status !== 'running') throw new DomainError('CONFLICT', 'Only submitted or running tasks can materialize.');
    const attempt = (await tx.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, input.attemptId), eq(submissionAttempts.taskId, task.id))).for('update').limit(1))[0];
    if (!attempt || !['submitted', 'running'].includes(attempt.state)) throw new DomainError('CONFLICT', 'The provider attempt is not materializable.');
    const now = input.now ?? new Date();
    assertDate(now);
    assertBeforeDeadline(task, now);
    await tx.update(submissionAttempts).set({state: 'materializing'}).where(eq(submissionAttempts.id, attempt.id));
    const materializationDeadline = new Date(Math.min(now.getTime() + MATERIALIZATION_BUDGET_MS, task.overallDeadlineAt?.getTime() ?? Infinity));
    await updateTaskFenced(tx, task, input.workspaceId, input, {
      status: 'materializing', deadlineAt: materializationDeadline, stageDeadlineAt: materializationDeadline, nextActionAt: now,
    }, 'active');
    return {taskId: task.id, status: 'materializing' as const};
  }));
}

/** Claim a queued task exactly once; the account lock is the cancellation/claim race boundary. */
export async function claimDispatch(db: AppDatabase, input: ClaimDispatchInput): Promise<{value: DispatchClaimResult; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId,
    workspaceId: input.workspaceId,
    commandName: 'generation.claim-dispatch',
    idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, provider: input.provider ?? 'mock'},
  }, () => claimInTransaction(tx, input)));
}

export type CancelGenerationInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  idempotencyKey: string;
  now?: Date;
}>;

export type CancelGenerationResult = Readonly<{
  taskId: string;
  workspaceId: string;
  status: 'cancelled';
  settlement: SettlementResult;
}>;

async function cancelInTransaction(tx: TransactionDatabase, input: CancelGenerationInput): Promise<CancelGenerationResult> {
  await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  await lockAccount(tx, input.workspaceId);
  const task = await lockTask(tx, input.workspaceId, input.taskId);
  assertGenerationTaskTransition(task.status as GenerationTaskStatus, 'cancelled');
  if (task.status !== 'queued') throw new DomainError('CONFLICT', 'Generation cancellation is only available while queued.');
  const reservationRows = await tx.select({id: creditReservations.id, status: creditReservations.status})
    .from(creditReservations).where(and(
      eq(creditReservations.taskId, task.id), eq(creditReservations.workspaceId, input.workspaceId),
    )).for('update').limit(1);
  const reservation = reservationRows[0];
  if (!reservation || reservation.status !== 'active') throw new DomainError('CONFLICT', 'The task credit reservation is not active.');
  await lockDispatchEvents(tx, input.workspaceId, reservation.id);
  const now = input.now ?? new Date();
  assertDate(now);
  assertBeforeDeadline(task, now);
  const settlement = await settleInTransaction(tx, {
    actorUserId: input.actor.userId,
    workspaceId: input.workspaceId,
    reservationId: reservation.id,
    idempotencyKey: `${input.idempotencyKey}:credits`,
    outcome: 'cancelled',
    now,
  });
  await tx.update(outboxEvents).set({status: 'failed'}).where(and(
    eq(outboxEvents.workspaceId, input.workspaceId),
    eq(outboxEvents.aggregateId, reservation.id),
    eq(outboxEvents.eventType, 'generation.dispatch'),
    eq(outboxEvents.status, 'pending'),
  ));
  await tx.insert(auditEvents).values({
    id: randomUUID(), actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    commandName: 'generation.cancel', commandKey: input.idempotencyKey,
    semanticHash: semanticHash('generation.cancel', {taskId: task.id}),
    payload: serializeJsonValue({taskId: task.id, reservationId: reservation.id}), createdAt: now,
  });
  await updateTaskFenced(tx, task, input.workspaceId, input, {
    status: 'cancelled',
    failureCode: null,
    providerCostState: 'not_applicable',
    nextActionAt: now,
  }, 'active');
  return {taskId: task.id, workspaceId: input.workspaceId, status: 'cancelled', settlement};
}

/** Cancel and release the hold in one transaction before any provider-side claim exists. */
export async function cancelGenerationTask(db: AppDatabase, input: CancelGenerationInput): Promise<{value: CancelGenerationResult; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    commandName: 'generation.cancel', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId},
  }, () => cancelInTransaction(tx, input)));
}

export type SettleGenerationInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  taskId: string;
  idempotencyKey: string;
  outcome: 'succeeded' | 'failed';
  failureCode?: string;
  providerCostEvidence?: Readonly<{state: 'unknown' | 'known' | 'not_applicable'; minor?: string; currency?: string}>;
  internalWorker?: boolean;
  outboxLease?: OutboxLease;
  now?: Date;
}>;

export type SettleGenerationResult = Readonly<{
  taskId: string;
  workspaceId: string;
  status: 'succeeded' | 'failed' | 'quarantined';
  settlement?: SettlementResult;
  quarantineId?: string;
}>;

async function settleGenerationInTransaction(tx: TransactionDatabase, input: SettleGenerationInput): Promise<SettleGenerationResult> {
  if (!input.internalWorker) await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  await lockAccount(tx, input.workspaceId);
  const task = await lockTask(tx, input.workspaceId, input.taskId);
  await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
  const observedAt = input.now ?? new Date();
  assertDate(observedAt);
  const eventKey = `${input.idempotencyKey}:${input.outcome}`;
  if (isTerminalGenerationState(task.status as GenerationTaskStatus)) {
    const quarantineId = randomUUID();
    await tx.insert(generationQuarantine).values({
      id: quarantineId, taskId: task.id, workspaceId: input.workspaceId,
      eventType: `generation.${input.outcome}`, eventKey,
      payload: serializeJsonValue({outcome: input.outcome, failureCode: input.failureCode ?? null, providerCostEvidence: input.providerCostEvidence ?? null}),
      createdAt: observedAt,
    }).onConflictDoNothing({target: [generationQuarantine.taskId, generationQuarantine.eventKey]});
    return {taskId: task.id, workspaceId: input.workspaceId, status: 'quarantined', quarantineId};
  }
  if (input.outcome === 'failed' && input.failureCode === 'generation.deadline_exceeded' && task.deadlineAt > observedAt) {
    throw new DomainError('CONFLICT', 'The generation deadline changed before recovery acquired the task.');
  }
  if (input.outcome === 'succeeded') {
    if (task.status !== 'materializing') throw new DomainError('CONFLICT', 'Generation success requires the materializing state.');
    assertBeforeDeadline(task, observedAt);
    const readyOutput = await tx.select({id: assets.id}).from(assets).where(and(
      eq(assets.taskId, task.id), eq(assets.workspaceId, input.workspaceId),
      eq(assets.purpose, 'output'), eq(assets.state, 'ready'),
    )).limit(1);
    if (!readyOutput[0]) throw new DomainError('CONFLICT', 'Generation success requires a ready private output asset.');
  } else if (!input.failureCode?.trim()) {
    throw new DomainError('VALIDATION', 'A failure code is required for a failed generation task.');
  }
  const reservationRows = await tx.select({id: creditReservations.id, status: creditReservations.status})
    .from(creditReservations).where(and(eq(creditReservations.taskId, task.id), eq(creditReservations.workspaceId, input.workspaceId)))
    .for('update').limit(1);
  const reservation = reservationRows[0];
  if (!reservation || reservation.status !== 'active') throw new DomainError('CONFLICT', 'The task credit reservation is not active.');
  await lockDispatchEvents(tx, input.workspaceId, reservation.id);
  const now = input.now ?? new Date();
  assertDate(now);
  const next = input.outcome;
  assertGenerationTaskTransition(task.status as GenerationTaskStatus, next);
  const cost = input.providerCostEvidence;
  const deadlineFence: DeadlineFence = next === 'succeeded'
    ? 'active'
    : input.failureCode === 'generation.deadline_exceeded' ? 'expired' : 'any';
  const settlement = await settleInTransaction(tx, {
    actorUserId: input.actor.userId,
    workspaceId: input.workspaceId,
    reservationId: reservation.id,
    idempotencyKey: `${input.idempotencyKey}:credits`,
    outcome: input.outcome === 'succeeded' ? 'consumed' : 'failed',
    now,
    providerCostEvidence: input.providerCostEvidence,
  });
  await tx.update(submissionAttempts).set({
    state: next === 'succeeded' ? 'succeeded' : 'failed',
    costState: cost?.state ?? 'unknown',
    costMinor: cost?.minor ? BigInt(cost.minor) : null,
    costCurrency: cost?.currency ?? null,
  }).where(and(eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, input.workspaceId)));
  // Keep terminalization behind credit/attempt writes: any contention there
  // must still roll back the entire settlement if the live fence has expired.
  await updateTaskFenced(tx, task, input.workspaceId, input, {
    status: next,
    failureCode: next === 'failed' ? input.failureCode!.trim() : null,
    providerCostState: cost?.state ?? (next === 'succeeded' ? 'known' : 'unknown'),
    providerCostMinor: cost?.minor ? BigInt(cost.minor) : null,
    providerCostCurrency: cost?.currency ?? null,
    nextActionAt: now,
  }, deadlineFence);
  await tx.update(outboxEvents).set({status: input.outcome === 'failed' ? 'failed' : 'published', leaseUntil: null, leaseOwner: null, leaseToken: null})
    .where(and(eq(outboxEvents.workspaceId, input.workspaceId), eq(outboxEvents.aggregateId, reservation.id), eq(outboxEvents.eventType, 'generation.dispatch'), eq(outboxEvents.status, 'pending')));
  return {taskId: task.id, workspaceId: input.workspaceId, status: next, settlement};
}

/** Settle exactly once; late provider evidence is quarantined without reopening or rebilling. */
export async function settleGenerationTask(db: AppDatabase, input: SettleGenerationInput): Promise<{value: SettleGenerationResult; replayed: boolean}> {
  return db.transaction((tx) => executeGenerationCommand(tx, input, {
    actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    commandName: 'generation.settle', idempotencyKey: input.idempotencyKey,
    payload: {taskId: input.taskId, outcome: input.outcome, failureCode: input.failureCode ?? null, providerCostEvidence: input.providerCostEvidence ?? null},
  }, () => settleGenerationInTransaction(tx, input)));
}
