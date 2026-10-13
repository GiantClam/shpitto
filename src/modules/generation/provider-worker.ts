import {and, eq} from 'drizzle-orm';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {generationTasks, submissionAttempts, providerWebhookInbox} from '../../db/schema/generation.ts';
import {assets} from '../../db/schema/asset.ts';
import type {ProviderPort, ProviderRequestRef, SubmissionContext} from '../../adapters/providers/port.ts';
import type {PrivateObjectStore} from '../../adapters/storage/port.ts';
import {createRuntimeProvider, assertConfiguredProviderCallback} from '../../adapters/providers/runtime.ts';
import {getProviderModel} from '../../config/provider-models.ts';
import {providerWorkerAction, type ProviderWorkerConfig} from '../../config/provider-worker.ts';
import {materializeProviderOutput} from '../../trigger/materialize.ts';
import {beginProviderSubmission, claimDispatch, markSubmissionUnknown, recordProviderSubmission, reconcileSubmissionUnknown, markGenerationMaterializing, settleGenerationTask} from './lifecycle.ts';
import {claimOutbox, acknowledgeOutbox, releaseOutbox, startOutboxHeartbeat, assertOutboxLeaseInTransaction, type OutboxLease} from './outbox.ts';
import {processProviderWebhook} from './provider-webhooks.ts';
import type {ReadyInputSnapshot} from './create.ts';
import {providerInputFromSnapshot, restoreWorkerSubmissionContext} from './provider-input.ts';
import {readWorkerInputImage} from './provider-image.ts';
import {sweepExpiredGenerationTasks} from './sweep-recovery.ts';

type Task = typeof generationTasks.$inferSelect;
type Attempt = typeof submissionAttempts.$inferSelect;
type WorkerDependencies = Readonly<{
  config: ProviderWorkerConfig; owner: string; store: PrivateObjectStore; now?: Date;
  providerFactory?: (context: SubmissionContext, imageUrl?: string) => ProviderPort;
  materialize?: typeof materializeProviderOutput;
}>;

async function taskRow(db: AppDatabase, workspaceId: string, taskId: string): Promise<Task | undefined> {
  return (await db.select().from(generationTasks).where(and(eq(generationTasks.id, taskId), eq(generationTasks.workspaceId, workspaceId))).limit(1))[0];
}
async function attemptRow(db: AppDatabase, task: Task): Promise<Attempt | undefined> {
  return (await db.select().from(submissionAttempts).where(and(eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, task.workspaceId))).orderBy(submissionAttempts.attemptNo).limit(1))[0];
}
function command(task: Task, lease: OutboxLease, now?: Date) {
  return {actor: {userId: task.requestedBy}, workspaceId: task.workspaceId, taskId: task.id, internalWorker: true, outboxLease: lease, now} as const;
}

async function markUnknown(db: AppDatabase, task: Task, attempt: Attempt, lease: OutboxLease, now?: Date): Promise<void> {
  await markSubmissionUnknown(db, {...command(task, lease, now), attemptId: attempt.id, idempotencyKey: `provider-worker.unknown.${attempt.id}`});
}
async function reconcileUnknown(db: AppDatabase, task: Task, attempt: Attempt, lease: OutboxLease, now: Date): Promise<'ack' | Date> {
  if (task.status === 'dispatching') { await markUnknown(db, task, attempt, lease, now); return new Date(now.getTime() + 150_000); }
  if (task.nextActionAt > now) return task.nextActionAt;
  const result = await reconcileSubmissionUnknown(db, {...command(task, lease, now), attemptId: attempt.id, idempotencyKey: `provider-worker.reconcile.${attempt.id}.${attempt.probeCount}`, observation: attempt.providerRequestId ? 'found' : 'missing', providerRequestId: attempt.providerRequestId ?? undefined});
  return result.value.status === 'failed' ? 'ack' : new Date(result.value.nextActionAt);
}

async function processInbox(db: AppDatabase, task: Task, attempt: Attempt, lease: OutboxLease, now?: Date): Promise<void> {
  if (!attempt.providerRequestId) return;
  const events = await db.select().from(providerWebhookInbox).where(and(eq(providerWebhookInbox.provider, attempt.provider), eq(providerWebhookInbox.providerRequestId, attempt.providerRequestId), eq(providerWebhookInbox.attemptNonce, attempt.clientReference), eq(providerWebhookInbox.status, 'received'))).orderBy(providerWebhookInbox.receivedAt).limit(20);
  for (const event of events) {
    const payload = event.payload as {status?: unknown; authenticatedAt?: unknown};
    if (!payload.authenticatedAt || !['queued', 'running', 'completed', 'failed'].includes(String(payload.status))) throw new DomainError('CONFLICT', 'Stored provider callback lacks authenticated observation evidence.');
    await processProviderWebhook(db, {provider: attempt.provider as 'replicate' | 'fal', verified: {eventId: event.externalEventId, observation: {status: payload.status as 'queued' | 'running' | 'completed' | 'failed'}}, actorUserId: task.requestedBy, workspaceId: task.workspaceId, taskId: task.id, attemptId: attempt.id, outboxLease: lease, now});
  }
}

async function finishOutput(db: AppDatabase, task: Task, attempt: Attempt, provider: ProviderPort, ref: ProviderRequestRef, lease: OutboxLease, input: WorkerDependencies): Promise<void> {
  if (['submitted', 'running'].includes(task.status)) await markGenerationMaterializing(db, {...command(task, lease, input.now), attemptId: attempt.id, idempotencyKey: `provider-worker.materialize.${attempt.id}`});
  const ready = (await db.select({id: assets.id}).from(assets).where(and(eq(assets.taskId, task.id), eq(assets.workspaceId, task.workspaceId), eq(assets.purpose, 'output'), eq(assets.state, 'ready'))).limit(1))[0];
  if (!ready) {
    const result = await provider.readResult(ref);
    if (result.kind !== 'outputCandidates' || !result.candidates[0] || result.candidates[0].kind !== 'remote') throw new DomainError('CONFLICT', 'Authoritative provider output is unavailable.');
    await (input.materialize ?? materializeProviderOutput)(db, {candidate: result.candidates[0], actorUserId: task.requestedBy, workspaceId: task.workspaceId, taskId: task.id, store: input.store, outboxLease: lease, now: input.now});
  }
  await settleGenerationTask(db, {...command(task, lease, input.now), idempotencyKey: `provider-worker.success.${task.id}`, outcome: 'succeeded', providerCostEvidence: {state: 'unknown'}});
}

async function handleTask(db: AppDatabase, task: Task, lease: OutboxLease, input: WorkerDependencies, renew: () => Promise<void>): Promise<'ack' | Date> {
  const clock = () => input.now ?? new Date();
  let attempt = await attemptRow(db, task);
  let action = providerWorkerAction(task.status, Boolean(task.submissionStartedAt), input.config.allowCreate);
  if (action === 'terminal') return 'ack';
  if (action === 'paused') return new Date(clock().getTime() + input.config.pollMs);
  if (!attempt) {
    if (action !== 'submit') throw new DomainError('CONFLICT', 'Provider recovery requires a persisted attempt.');
    if (!input.providerFactory) {
      createRuntimeProvider(task.modelKey, {workspaceId: task.workspaceId, modelKeys: input.config.modelKeys});
      assertConfiguredProviderCallback(getProviderModel(task.modelKey).provider);
    }
    const claimed = await claimDispatch(db, {...command(task, lease, input.now), provider: getProviderModel(task.modelKey).provider, idempotencyKey: `provider-worker.claim.${task.id}`});
    task = (await taskRow(db, task.workspaceId, task.id))!;
    attempt = await attemptRow(db, task);
    if (!attempt || claimed.value.attemptId !== attempt.id) throw new DomainError('CONFLICT', 'Provider attempt claim was not persisted.');
  }
  if (action === 'reconcile') return reconcileUnknown(db, task, attempt, lease, clock());
  await processInbox(db, task, attempt, lease, input.now);
  task = (await taskRow(db, task.workspaceId, task.id))!;
  attempt = (await attemptRow(db, task))!;
  action = providerWorkerAction(task.status, Boolean(task.submissionStartedAt), input.config.allowCreate);
  if (action === 'terminal') return 'ack';
  const image = await readWorkerInputImage(db, input.store, task.workspaceId, providerInputFromSnapshot(task.modelKey, task.inputSnapshot as ReadyInputSnapshot));
  const context = restoreWorkerSubmissionContext(task, attempt, image?.authorized);
  const provider = input.providerFactory ? input.providerFactory(context, image?.url) : createRuntimeProvider(task.modelKey, {workspaceId: task.workspaceId, modelKeys: input.config.modelKeys}, image ? async () => image.url : undefined);
  if (action === 'submit') {
    if (!input.providerFactory) assertConfiguredProviderCallback(context.catalog.provider);
    await renew();
    if (!await beginProviderSubmission(db, {...command(task, lease, input.now), attemptId: attempt.id})) {
      task = (await taskRow(db, task.workspaceId, task.id))!;
      if (task.status === 'dispatching') await markUnknown(db, task, attempt, lease, input.now);
      return new Date(clock().getTime() + 150_000);
    }
    const submission = await provider.submit(context);
    await renew();
    if (submission.kind === 'unknown') { await markUnknown(db, task, attempt, lease, input.now); return new Date(clock().getTime() + 150_000); }
    if (submission.kind === 'definitelyRejected') {
      await settleGenerationTask(db, {...command(task, lease, input.now), idempotencyKey: `provider-worker.rejected.${attempt.id}`, outcome: 'failed', failureCode: submission.code, providerCostEvidence: {state: 'unknown'}});
      return 'ack';
    }
    await recordProviderSubmission(db, {...command(task, lease, input.now), attemptId: attempt.id, providerRequestId: submission.requestId, statusUrl: submission.statusUrl, resultUrl: submission.resultUrl, idempotencyKey: `provider-worker.submitted.${attempt.id}`});
    attempt = (await attemptRow(db, task))!;
    task = (await taskRow(db, task.workspaceId, task.id))!;
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) return 'ack';
  }
  if (!attempt.providerRequestId) throw new DomainError('CONFLICT', 'Polling requires the persisted provider request identity.');
  const ref: ProviderRequestRef = {provider: context.catalog.provider, modelKey: context.catalog.modelKey, requestId: attempt.providerRequestId, catalog: context.catalog, ...(attempt.providerStatusUrl ? {statusUrl: attempt.providerStatusUrl} : {}), ...(attempt.providerResultUrl ? {resultUrl: attempt.providerResultUrl} : {})};
  await renew();
  if (task.status !== 'materializing') {
    const status = await provider.getStatus(ref);
    if (status.status === 'failed') {
      await settleGenerationTask(db, {...command(task, lease, input.now), idempotencyKey: `provider-worker.failed.${attempt.id}`, outcome: 'failed', failureCode: status.evidence.code, providerCostEvidence: {state: 'unknown'}});
      return 'ack';
    }
    if (status.status !== 'completed') return new Date(clock().getTime() + input.config.pollMs);
  }
  await finishOutput(db, task, attempt, provider, ref, lease, input);
  return 'ack';
}

async function countMaterializationFailure(db: AppDatabase, task: Task, lease: OutboxLease, now?: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(generationTasks).where(and(eq(generationTasks.id, task.id), eq(generationTasks.workspaceId, task.workspaceId))).for('update').limit(1))[0];
    await assertOutboxLeaseInTransaction(tx, lease, now ?? new Date());
    if (!row || row.status !== 'materializing') return 0;
    const attempts = Math.min(8, row.materializationAttempts > task.materializationAttempts ? row.materializationAttempts : row.materializationAttempts + 1);
    await tx.update(generationTasks).set({materializationAttempts: attempts, updatedAt: now ?? new Date()}).where(eq(generationTasks.id, row.id));
    return attempts;
  });
}

/** One fenced dispatch/reconciliation cycle restricted to the configured workspace. */
export async function runProviderWorkerOnce(db: AppDatabase, input: WorkerDependencies): Promise<Readonly<{claimed: boolean; outcome: 'paused' | 'idle' | 'handled'}>> {
  if (input.config.state !== 'active' || !input.config.workspaceId) return {claimed: false, outcome: 'paused'};
  const clock = () => input.now ?? new Date();
  // Restoration settles overdue work before any resumed network/status/materialization operation.
  await sweepExpiredGenerationTasks(db, clock(), {workspaceId: input.config.workspaceId});
  const lease = await claimOutbox(db, input.owner, clock(), {eventType: 'generation.dispatch', workspaceId: input.config.workspaceId});
  if (!lease) return {claimed: false, outcome: 'idle'};
  const heartbeat = startOutboxHeartbeat(db, lease, {now: clock});
  let task: Task | undefined;
  try {
    await heartbeat.renew();
    const payload = lease.payload as {taskId?: unknown; workspaceId?: unknown};
    if (payload.workspaceId !== input.config.workspaceId || typeof payload.taskId !== 'string') throw new DomainError('CONFLICT', 'Worker lease payload does not match its workspace scope.');
    task = await taskRow(db, input.config.workspaceId, payload.taskId);
    const outcome = !task ? 'ack' : !input.config.modelKeys.includes(task.modelKey) ? new Date(clock().getTime() + input.config.pollMs) : await handleTask(db, task, lease, input, heartbeat.renew);
    if (outcome === 'ack') await acknowledgeOutbox(db, lease, clock());
    else if (!await releaseOutbox(db, lease, outcome, clock())) throw new DomainError('CONFLICT', 'Provider worker lost its lease before release.');
    return {claimed: true, outcome: 'handled'};
  } catch (error) {
    const owned = !heartbeat.hasLostLease() && await heartbeat.renew().then(() => true).catch(() => false);
    if (owned && task) {
      const attempts = await countMaterializationFailure(db, task, lease, input.now);
      if (attempts >= 8) {
        await settleGenerationTask(db, {...command(task, lease, input.now), idempotencyKey: `provider-worker.exhausted.${task.id}`, outcome: 'failed', failureCode: 'generation.materialization_failed', providerCostEvidence: {state: 'unknown'}});
      } else await releaseOutbox(db, lease, new Date(clock().getTime() + Math.min(60_000, 1_000 * 2 ** Math.min(6, lease.attempts - 1))), clock());
    } else if (owned) await releaseOutbox(db, lease, new Date(clock().getTime() + 30_000), clock());
    throw error;
  } finally { await heartbeat.stop(); }
}
