import {randomUUID} from 'node:crypto';

import {and, count, desc, eq, inArray, sql} from 'drizzle-orm';

import {getProviderModel, providerModels} from '../../config/provider-models.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {assets} from '../../db/schema/asset.ts';
import {outboxEvents} from '../../db/schema/credit.ts';
import {generationTasks, providerWebhookInbox, submissionAttempts} from '../../db/schema/generation.ts';
import {creditAccounts, creditReservations, workspaces} from '../../db/schema/workspace.ts';
import {processProviderWebhook} from '../generation/provider-webhooks.ts';
import {sweepExpiredGenerationTasks, type SweepResult} from '../generation/sweep-recovery.ts';
import {getGenerationRecoveryProjection, type GenerationRecoveryProjection} from '../credits/queries.ts';
import {inTransaction} from '../shared/transaction.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {authorizeOperatorCommand} from './authorize.ts';
import {recordOperatorAudit, recordTenantAccess, validateExpectedVersion, validateOperatorReason} from './audit.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {evaluateIntegrationHealth, type IntegrationHealth} from './integration-health.ts';

type ModelHealth = Readonly<{modelKey: string; provider: string; configuration: 'local_fixture' | 'live_disabled' | 'live_enabled'; evidenceScope: 'selected_workspace_tasks'; sampleCount: number; observation: Omit<IntegrationHealth, 'provider'>}>;

export type AdminRecoveryView = Readonly<{
  workspaceId: string;
  tasks: readonly GenerationRecoveryProjection[];
  pendingOutbox: number;
  webhookInbox: ReadonlyArray<Readonly<{id: string; taskId: string; attemptId: string; provider: string; status: string; receivedAt: string}>>;
  assets: ReadonlyArray<Readonly<{id: string; taskId: string | null; purpose: string; state: string; updatedAt: string}>>;
  outbox: ReadonlyArray<Readonly<{id: string; taskId: string | null; eventType: string; status: string; attempts: number; availableAt: string}>>;
  modelHealth: readonly ModelHealth[];
  bounded: Readonly<{taskLimit: 100; correlationLimit: 100; scope: 'selected_workspace_tasks'}>;
  providerCostStates: Readonly<Record<string, number>>;
}>;

export async function readAdminRecovery(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; purpose: string; taskIds?: readonly string[]}>): Promise<AdminRecoveryView> {
  const purpose = validateOperatorReason(input.purpose);
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator');
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose});
    const taskIds = input.taskIds?.length ? [...new Set(input.taskIds)].slice(0, 100) : (await tx.select({id: generationTasks.id}).from(generationTasks).where(eq(generationTasks.workspaceId, input.workspaceId)).orderBy(desc(generationTasks.updatedAt)).limit(100)).map((row) => row.id);
    const tasks = await getGenerationRecoveryProjection(tx, input.workspaceId, taskIds);
    const [outboxCount] = await tx.select({value: count()}).from(outboxEvents).where(and(eq(outboxEvents.workspaceId, input.workspaceId), eq(outboxEvents.status, 'pending')));
    const inboxRows = taskIds.length === 0 ? [] : await tx.select({id: providerWebhookInbox.id, taskId: submissionAttempts.taskId, attemptId: submissionAttempts.id, provider: providerWebhookInbox.provider, status: providerWebhookInbox.status, receivedAt: providerWebhookInbox.receivedAt})
      .from(providerWebhookInbox).innerJoin(submissionAttempts, and(
        eq(submissionAttempts.provider, providerWebhookInbox.provider),
        eq(submissionAttempts.providerRequestId, providerWebhookInbox.providerRequestId),
        eq(sql`${submissionAttempts.clientReference}::text`, providerWebhookInbox.attemptNonce),
      )).where(and(eq(submissionAttempts.workspaceId, input.workspaceId), inArray(submissionAttempts.taskId, taskIds)))
      .orderBy(desc(providerWebhookInbox.receivedAt)).limit(100);
    const assetRows = taskIds.length === 0 ? [] : await tx.select({id: assets.id, taskId: assets.taskId, purpose: assets.purpose, state: assets.state, updatedAt: assets.updatedAt}).from(assets)
      .where(and(eq(assets.workspaceId, input.workspaceId), inArray(assets.taskId, taskIds))).orderBy(desc(assets.updatedAt)).limit(100);
    const outboxRows = taskIds.length === 0 ? [] : await tx.select({id: outboxEvents.id, taskId: creditReservations.taskId, eventType: outboxEvents.eventType, status: outboxEvents.status, attempts: outboxEvents.attempts, availableAt: outboxEvents.availableAt})
      .from(outboxEvents).innerJoin(creditReservations, eq(outboxEvents.aggregateId, creditReservations.id))
      .where(and(eq(outboxEvents.workspaceId, input.workspaceId), eq(creditReservations.workspaceId, input.workspaceId), inArray(creditReservations.taskId, taskIds))).orderBy(desc(outboxEvents.createdAt)).limit(100);
    const modelRows = taskIds.length === 0 ? [] : await tx.select({modelKey: generationTasks.modelKey, status: generationTasks.status, updatedAt: generationTasks.updatedAt, createdAt: generationTasks.createdAt}).from(generationTasks)
      .where(and(eq(generationTasks.workspaceId, input.workspaceId), inArray(generationTasks.id, taskIds))).limit(100);
    const modelHealth: ModelHealth[] = [getProviderModel('mock-video'), ...providerModels].map((model) => {
      const sample = modelRows.filter((row) => row.modelKey === model.modelKey);
      const latest = (status: string) => sample.filter((row) => row.status === status).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.updatedAt;
      const unknownOldestAt = sample.filter((row) => row.status === 'submission_unknown').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt;
      const health = evaluateIntegrationHealth({provider: model.provider === 'fal' ? 'fal' : 'replicate', lastSuccessfulAt: latest('succeeded'), lastFailureAt: latest('failed'), unknownOldestAt});
      const {provider: _provider, ...observation} = health;
      return {modelKey: model.modelKey, provider: model.provider, configuration: model.provider === 'mock' ? 'local_fixture' : model.liveEnabled ? 'live_enabled' : 'live_disabled', evidenceScope: 'selected_workspace_tasks', sampleCount: sample.length, observation};
    });
    const providerCostStates: Record<string, number> = {};
    for (const task of tasks) {
      const state = task.attempt?.costState === 'known' ? 'confirmed' : task.attempt?.costState ?? 'unknown';
      providerCostStates[state] = (providerCostStates[state] ?? 0) + 1;
    }
    return {workspaceId: input.workspaceId, tasks, pendingOutbox: outboxCount?.value ?? 0, webhookInbox: inboxRows.map((row) => ({...row, receivedAt: row.receivedAt.toISOString()})), assets: assetRows.map((row) => ({...row, updatedAt: row.updatedAt.toISOString()})), outbox: outboxRows.map((row) => ({...row, availableAt: row.availableAt.toISOString()})), modelHealth, bounded: {taskLimit: 100, correlationLimit: 100, scope: 'selected_workspace_tasks'}, providerCostStates};
  });
}

export async function runAdminRecoverySweep(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; purpose: string; expectedVersion: number; idempotencyKey: string; now?: Date}>): Promise<SweepResult & Readonly<{version: number; replayed: boolean}>> {
  const purpose = validateOperatorReason(input.purpose);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const [workspace] = await tx.select({version: workspaces.version}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
    if (!workspace) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    const identity = {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'operator.recovery.sweep', idempotencyKey: input.idempotencyKey, payload: {purpose, expectedVersion}};
    const result = await executeDurableCommand(tx, identity, async () => {
      if (workspace.version !== expectedVersion) throw new DomainError('CONFLICT', 'Workspace version is stale.');
      await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose, now});
      // Settlement uses savepoints on this transaction; audit/result/outbox and
      // every deadline effect commit together or all roll back.
      const sweep = await sweepExpiredGenerationTasks(tx as unknown as AppDatabase, now, {workspaceId: input.workspaceId});
      const version = workspace.version + 1;
      await tx.update(workspaces).set({version, updatedAt: now}).where(eq(workspaces.id, input.workspaceId));
      await recordOperatorAudit(tx, {...identity, commandKey: identity.idempotencyKey, payload: {...identity.payload, ...sweep}, now});
      await tx.insert(outboxEvents).values({id: randomUUID(), workspaceId: input.workspaceId, eventType: 'operator.recovery.swept', aggregateId: input.workspaceId, businessKey: `${identity.commandName}:${input.actor.userId}:${input.workspaceId}:${input.idempotencyKey}`, payload: {...sweep, version}, status: 'pending', availableAt: now, createdAt: now});
      return {...sweep, version};
    });
    return {...result.value, replayed: result.replayed};
  });
}

/** Reprocess only an authenticated stored observation; the original provider event identity owns all domain effects. */
export async function replayAdminProviderWebhook(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; inboxId: string; purpose: string; expectedVersion: number; idempotencyKey: string; now?: Date}>) {
  const purpose = validateOperatorReason(input.purpose);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.inboxId)) throw new DomainError('VALIDATION', 'A persisted inbox ID is required.');
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const [workspace] = await tx.select({version: workspaces.version}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).for('update').limit(1);
    if (!workspace) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    const identity = {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName: 'operator.recovery.webhook-replay', idempotencyKey: input.idempotencyKey, payload: {inboxId: input.inboxId, purpose, expectedVersion}};
    const result = await executeDurableCommand(tx, identity, async () => {
      if (workspace.version !== expectedVersion) throw new DomainError('CONFLICT', 'Workspace version is stale.');
      await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose, now});
      await tx.select({workspaceId: creditAccounts.workspaceId}).from(creditAccounts).where(eq(creditAccounts.workspaceId, input.workspaceId)).for('update');
      const linked = (await tx.select({inbox: providerWebhookInbox, attempt: submissionAttempts, requestedBy: generationTasks.requestedBy}).from(providerWebhookInbox)
        .innerJoin(submissionAttempts, and(eq(submissionAttempts.provider, providerWebhookInbox.provider), eq(submissionAttempts.providerRequestId, providerWebhookInbox.providerRequestId), eq(sql`${submissionAttempts.clientReference}::text`, providerWebhookInbox.attemptNonce)))
        .innerJoin(generationTasks, and(eq(generationTasks.id, submissionAttempts.taskId), eq(generationTasks.workspaceId, submissionAttempts.workspaceId)))
        .where(and(eq(providerWebhookInbox.id, input.inboxId), eq(submissionAttempts.workspaceId, input.workspaceId))).for('update').limit(1))[0];
      if (!linked) throw new DomainError('NOT_FOUND', 'The notification is not linked to this workspace and attempt.');
      const {inbox, attempt} = linked;
      const payload = inbox.payload as Record<string, unknown> | null;
      if (!payload || typeof payload !== 'object' || !['queued', 'running', 'completed', 'failed'].includes(String(payload.status)) || payload.providerRequestId !== inbox.providerRequestId || payload.attemptNonce !== inbox.attemptNonce || typeof payload.authenticatedAt !== 'string' || !Number.isFinite(Date.parse(payload.authenticatedAt))) throw new DomainError('CONFLICT', 'Stored authenticated notification evidence is incomplete.');
      const processed = await processProviderWebhook(tx as unknown as AppDatabase, {provider: inbox.provider as 'replicate' | 'fal', verified: {eventId: inbox.externalEventId, observation: {status: payload.status as 'queued' | 'running' | 'completed' | 'failed'}}, actorUserId: linked.requestedBy, workspaceId: input.workspaceId, taskId: attempt.taskId, attemptId: attempt.id, now});
      const version = workspace.version + 1;
      await tx.update(workspaces).set({version, updatedAt: now}).where(eq(workspaces.id, input.workspaceId));
      const value = {inboxId: inbox.id, taskId: attempt.taskId, attemptId: attempt.id, status: processed.status, version};
      await recordOperatorAudit(tx, {...identity, commandKey: identity.idempotencyKey, payload: {...identity.payload, ...value}, now});
      await tx.insert(outboxEvents).values({id: randomUUID(), workspaceId: input.workspaceId, eventType: 'operator.recovery.webhook-replayed', aggregateId: attempt.taskId, businessKey: `${identity.commandName}:${input.actor.userId}:${input.workspaceId}:${input.idempotencyKey}`, payload: value, status: 'pending', availableAt: now, createdAt: now});
      return value;
    });
    return {...result.value, replayed: result.replayed};
  });
}
