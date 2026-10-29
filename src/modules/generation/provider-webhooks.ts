import {createHash, randomUUID} from 'node:crypto';

import {and, eq, inArray, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {generationTasks, providerWebhookInbox, submissionAttempts} from '../../db/schema/generation.ts';
import {creditAccounts} from '../../db/schema/workspace.ts';
import {outboxEvents} from '../../db/schema/credit.ts';
import type {ProviderName, VerifiedObservation} from '../../adapters/providers/port.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';
import {assertOutboxLeaseInTransaction, type OutboxLease} from './outbox.ts';
import {markGenerationMaterializing, settleGenerationTask} from './lifecycle.ts';

const MAX_RAW_BODY_BYTES = 1_000_000;

export type ProviderWebhookIngestResult = Readonly<{
  eventId: string;
  duplicate: boolean;
  acknowledged: true;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  status: 'received' | 'processed';
}>;

function safePayload(verified: VerifiedObservation): Readonly<Record<string, unknown>> {
  return Object.freeze({
    status: verified.observation.status,
    evidence: verified.observation.evidence,
    providerRequestId: verified.observation.ref.requestId,
    attemptNonce: verified.attemptNonce,
    accountId: verified.accountId || null,
    authenticatedAt: verified.authenticatedAt,
  });
}

/** Acknowledge only an exact persisted attempt; processing can resume from this row later. */
export async function ingestProviderWebhook(db: AppDatabase, input: Readonly<{
  provider: Exclude<ProviderName, 'mock'>;
  rawBody: Uint8Array;
  verified: VerifiedObservation;
  now?: Date;
}>): Promise<ProviderWebhookIngestResult> {
  if (input.rawBody.byteLength === 0 || input.rawBody.byteLength > MAX_RAW_BODY_BYTES) throw new DomainError('VALIDATION', 'Provider webhook body is outside the bounded size.');
  if (input.verified.observation.ref.provider !== input.provider) throw new DomainError('CONFLICT', 'Provider webhook identity does not match the adapter.');
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new DomainError('VALIDATION', 'A valid provider webhook timestamp is required.');
  const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
  const safe = safePayload(input.verified);
  return db.transaction(async (tx) => {
    const attempt = (await tx.select({id: submissionAttempts.id, taskId: submissionAttempts.taskId, workspaceId: submissionAttempts.workspaceId, clientReference: submissionAttempts.clientReference})
      .from(submissionAttempts)
      .where(and(eq(submissionAttempts.provider, input.provider), eq(submissionAttempts.providerRequestId, input.verified.observation.ref.requestId)))
      .for('update').limit(1))[0];
    if (!attempt) throw new DomainError('CONFLICT', 'Provider webhook request is not linked to a persisted submission.');
    if (attempt.clientReference !== input.verified.attemptNonce) throw new DomainError('CONFLICT', 'Provider webhook attempt nonce does not match the persisted submission.');
    const task = (await tx.select({id: generationTasks.id, workspaceId: generationTasks.workspaceId}).from(generationTasks).where(and(eq(generationTasks.id, attempt.taskId), eq(generationTasks.workspaceId, attempt.workspaceId))).limit(1))[0];
    if (!task) throw new DomainError('CONFLICT', 'Provider webhook task mapping is invalid.');
    const existing = (await tx.select({id: providerWebhookInbox.id, payloadHash: providerWebhookInbox.payloadHash, status: providerWebhookInbox.status})
      .from(providerWebhookInbox).where(and(eq(providerWebhookInbox.provider, input.provider), eq(providerWebhookInbox.externalEventId, input.verified.eventId))).for('update').limit(1))[0];
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new DomainError('CONFLICT', 'A provider webhook event id was reused with a different payload.');
      return {eventId: input.verified.eventId, duplicate: true, acknowledged: true, workspaceId: task.workspaceId, taskId: task.id, attemptId: attempt.id, status: existing.status as 'received' | 'processed'};
    }
    await tx.insert(providerWebhookInbox).values({
      id: randomUUID(), provider: input.provider, externalEventId: input.verified.eventId,
      attemptNonce: input.verified.attemptNonce, providerRequestId: input.verified.observation.ref.requestId,
      payloadHash, payload: safe, status: 'received', receivedAt: now, processedAt: null,
    });
    return {eventId: input.verified.eventId, duplicate: false, acknowledged: true, workspaceId: task.workspaceId, taskId: task.id, attemptId: attempt.id, status: 'received'};
  });
}

export type ProviderWebhookProcessInput = Readonly<{
  provider: Exclude<ProviderName, 'mock'>;
  verified: Pick<VerifiedObservation, 'eventId'> & Readonly<{observation: Pick<VerifiedObservation['observation'], 'status'>}>;
  actorUserId: string;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  now?: Date;
  outboxLease?: OutboxLease;
}>;
type ProcessResult = Readonly<{status: 'processed' | 'quarantined' | 'replayed'}>;
const TERMINAL_TASK_STATES = Object.freeze(['succeeded', 'failed', 'cancelled']);

function storedStatus(inbox: typeof providerWebhookInbox.$inferSelect): VerifiedObservation['observation']['status'] {
  const payload = inbox.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.status !== 'string' || !['queued', 'running', 'completed', 'failed'].includes(payload.status)
    || payload.providerRequestId !== inbox.providerRequestId || payload.attemptNonce !== inbox.attemptNonce
    || typeof payload.authenticatedAt !== 'string' || !Number.isFinite(Date.parse(payload.authenticatedAt))) {
    throw new DomainError('CONFLICT', 'Stored authenticated notification evidence is incomplete or has an invalid identity binding.');
  }
  return payload.status as VerifiedObservation['observation']['status'];
}

/** Call only after locking the credit account and task, matching lifecycle lock order. */
async function assertInboxDispatchLease(tx: TransactionDatabase, input: ProviderWebhookProcessInput, now: Date): Promise<void> {
  const lease = input.outboxLease;
  if (!lease) return;
  const supplied = lease.payload as {workspaceId?: unknown; taskId?: unknown} | null;
  if (lease.eventType !== 'generation.dispatch' || !supplied || supplied.workspaceId !== input.workspaceId || supplied.taskId !== input.taskId) throw new DomainError('CONFLICT', 'Provider inbox lease scope does not match the task.');
  await assertOutboxLeaseInTransaction(tx, lease, now);
  const bound = (await tx.select({payload: outboxEvents.payload}).from(outboxEvents)
    .where(and(eq(outboxEvents.id, lease.id), eq(outboxEvents.workspaceId, input.workspaceId), eq(outboxEvents.eventType, 'generation.dispatch'))).limit(1))[0];
  const payload = bound?.payload as {workspaceId?: unknown; taskId?: unknown} | null;
  if (!payload || payload.workspaceId !== input.workspaceId || payload.taskId !== input.taskId) throw new DomainError('CONFLICT', 'Provider inbox lease is not bound to this workspace and task.');
}

async function processInTransaction(tx: TransactionDatabase, input: ProviderWebhookProcessInput, terminalOnly = false): Promise<ProcessResult> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new DomainError('VALIDATION', 'A valid provider webhook timestamp is required.');
  const account = (await tx.select({workspaceId: creditAccounts.workspaceId}).from(creditAccounts).where(eq(creditAccounts.workspaceId, input.workspaceId)).for('update').limit(1))[0];
  if (!account) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
  const task = (await tx.select({id: generationTasks.id, workspaceId: generationTasks.workspaceId, status: generationTasks.status}).from(generationTasks)
    .where(and(eq(generationTasks.id, input.taskId), eq(generationTasks.workspaceId, input.workspaceId))).for('update').limit(1))[0];
  if (!task) throw new DomainError('NOT_FOUND', 'Provider webhook task was not found in this workspace.');
  const terminal = TERMINAL_TASK_STATES.includes(task.status);
  if (terminalOnly && !terminal) throw new DomainError('CONFLICT', 'Terminal inbox maintenance cannot process an active task.');
  const linked = (await tx.select({inbox: providerWebhookInbox, attempt: submissionAttempts}).from(providerWebhookInbox)
    .innerJoin(submissionAttempts, and(eq(submissionAttempts.provider, providerWebhookInbox.provider), eq(submissionAttempts.providerRequestId, providerWebhookInbox.providerRequestId), eq(sql`${submissionAttempts.clientReference}::text`, providerWebhookInbox.attemptNonce)))
    .innerJoin(generationTasks, and(eq(generationTasks.id, submissionAttempts.taskId), eq(generationTasks.workspaceId, submissionAttempts.workspaceId)))
    .where(and(eq(providerWebhookInbox.provider, input.provider), eq(providerWebhookInbox.externalEventId, input.verified.eventId), eq(submissionAttempts.id, input.attemptId), eq(submissionAttempts.taskId, input.taskId), eq(submissionAttempts.workspaceId, input.workspaceId), eq(generationTasks.workspaceId, input.workspaceId))).for('update').limit(1))[0];
  if (!linked) throw new DomainError('NOT_FOUND', 'The notification is not linked to this workspace, task and attempt.');
  const status = storedStatus(linked.inbox);
  if (status !== input.verified.observation.status) throw new DomainError('CONFLICT', 'The requested observation does not match stored authenticated evidence.');
  if (linked.inbox.status === 'processed') return {status: 'replayed'};
  await assertInboxDispatchLease(tx, input, input.now ?? new Date());
  const command = {actor: {userId: input.actorUserId}, workspaceId: input.workspaceId, taskId: input.taskId, internalWorker: true, outboxLease: input.outboxLease, now: input.now};
  let resultStatus: ProcessResult['status'] = 'processed';
  let leaseTerminalized = false;
  if (status === 'failed' || (status === 'completed' && terminal)) {
    const result = await settleGenerationTask(tx as unknown as AppDatabase, {...command,
      idempotencyKey: `provider.webhook.${input.provider}.${input.verified.eventId}`, outcome: status === 'completed' ? 'succeeded' : 'failed',
      ...(status === 'failed' ? {failureCode: `provider.${input.provider}.failed`} : {}), providerCostEvidence: {state: 'unknown'},
    });
    resultStatus = result.value.status === 'quarantined' ? 'quarantined' : 'processed';
    leaseTerminalized = result.value.status === 'succeeded' || result.value.status === 'failed';
  } else if (status === 'completed' && task.status !== 'materializing') {
    await markGenerationMaterializing(tx as unknown as AppDatabase, {...command, attemptId: input.attemptId, idempotencyKey: `provider.webhook.materialize.${input.provider}.${input.verified.eventId}`});
  }
  const changed = await tx.update(providerWebhookInbox).set({status: 'processed', processedAt: input.now ?? new Date()})
    .where(and(eq(providerWebhookInbox.id, linked.inbox.id), eq(providerWebhookInbox.provider, input.provider), eq(providerWebhookInbox.providerRequestId, linked.inbox.providerRequestId), eq(providerWebhookInbox.attemptNonce, linked.attempt.clientReference), eq(providerWebhookInbox.status, linked.inbox.status))).returning({id: providerWebhookInbox.id});
  if (!changed[0]) throw new DomainError('CONFLICT', 'Provider inbox acknowledgement lost its identity or state.');
  // Successful settlement clears its own dispatch lease; other paths must still own it at acknowledgement.
  if (!leaseTerminalized) await assertInboxDispatchLease(tx, input, input.now ?? new Date());
  return {status: resultStatus};
}

/** Domain effects and acknowledgement commit together; admin recovery can omit the worker lease. */
export async function processProviderWebhook(db: AppDatabase, input: ProviderWebhookProcessInput): Promise<ProcessResult> {
  return db.transaction((tx) => processInTransaction(tx, input));
}

export type TerminalProviderInboxDrainResult = Readonly<{scanned: number; processed: number; quarantined: number; replayed: number; failed: number}>;

/** Independent, tenant-scoped maintenance for late callbacks; never processes active generation tasks. */
export async function drainTerminalProviderWebhookInbox(db: AppDatabase, input: Readonly<{workspaceId: string; limit?: number; now?: Date}>): Promise<TerminalProviderInboxDrainResult> {
  const limit = input.limit ?? 20;
  if (typeof input.workspaceId !== 'string' || !input.workspaceId.trim() || input.workspaceId.length > 200) throw new DomainError('VALIDATION', 'An explicit workspace scope is required for inbox maintenance.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('VALIDATION', 'Provider inbox drain limit must be bounded between 1 and 100.');
  if (input.now && !Number.isFinite(input.now.getTime())) throw new DomainError('VALIDATION', 'A valid provider webhook timestamp is required.');
  const rows = await db.select({inbox: providerWebhookInbox, attempt: {id: submissionAttempts.id}, task: {id: generationTasks.id, workspaceId: generationTasks.workspaceId, requestedBy: generationTasks.requestedBy}}).from(providerWebhookInbox)
    .innerJoin(submissionAttempts, and(eq(submissionAttempts.provider, providerWebhookInbox.provider), eq(submissionAttempts.providerRequestId, providerWebhookInbox.providerRequestId), eq(sql`${submissionAttempts.clientReference}::text`, providerWebhookInbox.attemptNonce)))
    .innerJoin(generationTasks, and(eq(generationTasks.id, submissionAttempts.taskId), eq(generationTasks.workspaceId, submissionAttempts.workspaceId)))
    .where(and(eq(submissionAttempts.workspaceId, input.workspaceId), eq(generationTasks.workspaceId, input.workspaceId), eq(providerWebhookInbox.status, 'received'), inArray(providerWebhookInbox.provider, ['replicate', 'fal']), inArray(generationTasks.status, TERMINAL_TASK_STATES)))
    .orderBy(providerWebhookInbox.receivedAt, providerWebhookInbox.id).limit(limit);
  let report: TerminalProviderInboxDrainResult = {scanned: rows.length, processed: 0, quarantined: 0, replayed: 0, failed: 0};
  for (const row of rows) {
    try {
      const status = storedStatus(row.inbox);
      const result = await db.transaction((tx) => processInTransaction(tx, {
        provider: row.inbox.provider as 'replicate' | 'fal', verified: {eventId: row.inbox.externalEventId, observation: {status}},
        actorUserId: row.task.requestedBy, workspaceId: input.workspaceId, taskId: row.task.id, attemptId: row.attempt.id, now: input.now,
      }, true));
      report = {...report, processed: report.processed + (result.status === 'replayed' ? 0 : 1), quarantined: report.quarantined + (result.status === 'quarantined' ? 1 : 0), replayed: report.replayed + (result.status === 'replayed' ? 1 : 0)};
    } catch (error) {
      if (!(error instanceof DomainError) || !['CONFLICT', 'NOT_FOUND'].includes(error.code)) throw error;
      // Preserve bad/unmatched evidence for operator recovery and continue the remaining bounded batch.
      report = {...report, failed: report.failed + 1};
    }
  }
  return Object.freeze(report);
}
