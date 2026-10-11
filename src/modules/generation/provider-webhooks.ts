import {createHash, randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {generationTasks, providerWebhookInbox, submissionAttempts} from '../../db/schema/generation.ts';
import type {ProviderName, VerifiedObservation} from '../../adapters/providers/port.ts';
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

/** Process an acknowledged inbox row. A failed processor leaves the row received for replay. */
export async function processProviderWebhook(db: AppDatabase, input: Readonly<{
  provider: Exclude<ProviderName, 'mock'>;
  verified: Pick<VerifiedObservation, 'eventId'> & Readonly<{observation: Pick<VerifiedObservation['observation'], 'status'>}>;
  actorUserId: string;
  workspaceId: string;
  taskId: string;
  attemptId: string;
  now?: Date;
}>): Promise<Readonly<{status: 'processed' | 'quarantined' | 'replayed'}>> {
  const now = input.now ?? new Date();
  const existing = (await db.select({id: providerWebhookInbox.id, status: providerWebhookInbox.status})
    .from(providerWebhookInbox)
    .where(and(eq(providerWebhookInbox.provider, input.provider), eq(providerWebhookInbox.externalEventId, input.verified.eventId)))
    .limit(1))[0];
  if (!existing) throw new DomainError('NOT_FOUND', 'The provider webhook must be acknowledged before processing.');
  if (existing.status === 'processed') return {status: 'replayed'};
  const status = input.verified.observation.status;
  if (status === 'failed') {
    const result = await settleGenerationTask(db, {
      actor: {userId: input.actorUserId}, workspaceId: input.workspaceId, taskId: input.taskId,
      idempotencyKey: `provider.webhook.${input.provider}.${input.verified.eventId}`,
      outcome: 'failed', failureCode: `provider.${input.provider}.failed`, providerCostEvidence: {state: 'unknown'}, internalWorker: true, now,
    });
    await db.update(providerWebhookInbox).set({status: result.value.status === 'quarantined' ? 'processed' : 'processed', processedAt: now}).where(eq(providerWebhookInbox.id, existing.id));
    return {status: result.value.status === 'quarantined' ? 'quarantined' : 'processed'};
  }
  if (status === 'completed') {
    await markGenerationMaterializing(db, {
      actor: {userId: input.actorUserId}, workspaceId: input.workspaceId, taskId: input.taskId, attemptId: input.attemptId,
      idempotencyKey: `provider.webhook.materialize.${input.provider}.${input.verified.eventId}`, internalWorker: true, now,
    }).catch((error: unknown) => {
      if (!(error instanceof DomainError) || error.code !== 'CONFLICT') throw error;
    });
  }
  await db.update(providerWebhookInbox).set({status: 'processed', processedAt: now}).where(eq(providerWebhookInbox.id, existing.id));
  return {status: 'processed'};
}
