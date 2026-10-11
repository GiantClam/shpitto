import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {loadEnvFile} from 'node:process';

import {and, eq} from 'drizzle-orm';

import {getServerEnv} from '../src/config/env.ts';
import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';
import {createDatabase} from '../src/db/client.ts';
import {generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {workspaces} from '../src/db/schema/workspace.ts';
import {claimOutbox, acknowledgeOutbox, failOutbox, releaseOutbox, startOutboxHeartbeat} from '../src/modules/generation/outbox.ts';
import {claimDispatch, markGenerationMaterializing, recordProviderSubmission, reconcileSubmissionUnknown, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {defaultMockScript, observeMock, submitMock} from '../src/modules/generation/mock.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
import {cleanupOrphanedAssetsDetailed, type CleanupOrphanedAssetsReport} from '../src/modules/assets/cleanup.ts';
import {runAffiliateSyncCycle} from '../src/modules/affiliates/sync.ts';
import {createUnavailableAffiliateAuthority} from '../src/modules/affiliates/runtime.ts';
import {drainAffiliateNotifications, type AffiliateNotificationAuthority} from '../src/modules/affiliates/notifications.ts';

if (existsSync(join(process.cwd(), '.env.local'))) loadEnvFile(join(process.cwd(), '.env.local'));

type DispatchPayload = Readonly<{taskId?: unknown; workspaceId?: unknown}>;
const owner = `local-worker-${randomUUID()}`;
const localFixture = readFileSync(resolve(process.cwd(), 'tests/fixtures/video/local-demo.mp4'));

function payloadOf(value: unknown): DispatchPayload {
  return value && typeof value === 'object' ? value as DispatchPayload : {};
}

function assertLocalProfile(): ReturnType<typeof getServerEnv> {
  const env = getServerEnv();
  if (env.nodeEnv === 'production' || env.generationDriver !== 'mock' || env.storageDriver !== 'local') {
    throw new Error('The local worker is restricted to the local Mock profile.');
  }
  return env;
}

export async function processLocalWorkerOnce(options: Readonly<{workspaceId?: string; now?: Date; runSweep?: boolean}> = {}): Promise<boolean> {
  const env = assertLocalProfile();
  const clock = (): Date => options.now ?? new Date();
  const database = createDatabase();
  const store = getPrivateObjectStore();
  try {
    const swept = options.runSweep === false ? null : await sweepExpiredGenerationTasks(database.db, clock(), {workspaceId: options.workspaceId});
    const lease = await claimOutbox(database.db, owner, clock(), {eventType: 'generation.dispatch', workspaceId: options.workspaceId});
    if (!lease) return (swept?.failed ?? 0) > 0;
    let failedDispatch: Readonly<{actor: {userId: string}; workspaceId: string; taskId: string}> | null = null;
    let materializationStarted = false;
    const heartbeat = startOutboxHeartbeat(database.db, lease, {now: clock});
    const renew = heartbeat.renew;
    try {
      await renew();
      const payload = payloadOf(lease.payload);
      if (typeof payload.taskId !== 'string' || typeof payload.workspaceId !== 'string') throw new Error('Invalid generation dispatch payload.');
      const task = (await database.db.select({id: generationTasks.id, requestedBy: generationTasks.requestedBy}).from(generationTasks).where(and(eq(generationTasks.id, payload.taskId), eq(generationTasks.workspaceId, payload.workspaceId), options.workspaceId ? eq(generationTasks.workspaceId, options.workspaceId) : undefined)).limit(1))[0];
      if (!task) {
        if (!await acknowledgeOutbox(database.db, lease, clock())) throw new Error('The local worker no longer owns this lease.');
        return true;
      }
      const actor = {userId: task.requestedBy};
      failedDispatch = {actor, workspaceId: payload.workspaceId, taskId: task.id};
      const current = (await database.db.select({status: generationTasks.status, nextActionAt: generationTasks.nextActionAt}).from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1))[0];
      if (!current || ['succeeded', 'failed', 'cancelled'].includes(current.status)) {
        // Terminal domain commands may already have published or failed this event atomically.
        await acknowledgeOutbox(database.db, lease, clock());
        return true;
      }
      if (current.status === 'submission_unknown') {
        const unknownAttempt = (await database.db.select().from(submissionAttempts).where(and(eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, payload.workspaceId))).limit(1))[0];
        if (!unknownAttempt) throw new Error('Unknown submission attempt missing.');
        const now = clock();
        if (current.nextActionAt > now) {
          await releaseOutbox(database.db, lease, current.nextActionAt, now);
          return true;
        }
        await renew();
        const reconciled = await reconcileSubmissionUnknown(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, attemptId: unknownAttempt.id, idempotencyKey: `worker.reconcile.${unknownAttempt.id}.${unknownAttempt.probeCount}`, observation: 'missing', internalWorker: true, outboxLease: lease, now: options.now});
        if (reconciled.value.status === 'probing') await releaseOutbox(database.db, lease, new Date(reconciled.value.nextActionAt), clock());
        else await acknowledgeOutbox(database.db, lease, clock());
        return true;
      }
      let attempt = (await database.db.select().from(submissionAttempts).where(and(eq(submissionAttempts.taskId, task.id), eq(submissionAttempts.workspaceId, payload.workspaceId))).orderBy(submissionAttempts.attemptNo).limit(1))[0];
      let claim = attempt ? {value: {attemptId: attempt.id, clientReference: attempt.clientReference}} : null;
      if (!claim) {
        await renew();
        const created = await claimDispatch(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, idempotencyKey: `worker.claim.${lease.id}`, outboxLease: lease, now: options.now});
        claim = created;
        attempt = (await database.db.select().from(submissionAttempts).where(eq(submissionAttempts.id, created.value.attemptId)).limit(1))[0];
      }
      if (!attempt) throw new Error('Generation submission attempt missing.');
      let providerRequestId = attempt.providerRequestId;
      if (!providerRequestId && ['claimed'].includes(attempt.state)) {
        await renew();
        const submission = submitMock(claim.value.clientReference);
        providerRequestId = submission.providerRequestId;
        await recordProviderSubmission(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, attemptId: attempt.id, providerRequestId, idempotencyKey: `worker.submit.${lease.id}`, internalWorker: true, outboxLease: lease, now: options.now});
      }
      if (!providerRequestId && !['materializing', 'succeeded'].includes(attempt.state)) throw new Error('Mock submission did not produce a provider request ID.');
      const observation = observeMock({providerRequestId: providerRequestId ?? 'mock-materializing', clientReference: claim.value.clientReference, status: 'submitted'}, defaultMockScript(), 0);
      if (observation.status === 'failed') {
        await renew();
        await settleGenerationTask(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, idempotencyKey: `worker.fail.${lease.id}`, outcome: 'failed', failureCode: observation.failureCode, providerCostEvidence: {state: 'unknown'}, internalWorker: true, outboxLease: lease, now: options.now});
      } else {
        await renew();
        const taskStatus = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1))[0]?.status;
        if (taskStatus === 'submitted' || taskStatus === 'running') {
          await renew();
          await markGenerationMaterializing(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, attemptId: claim.value.attemptId, idempotencyKey: `worker.materialize.${lease.id}`, internalWorker: true, outboxLease: lease, now: options.now});
        }
        const ready = await database.db.select({id: assets.id}).from(assets).where(and(eq(assets.taskId, task.id), eq(assets.workspaceId, payload.workspaceId), eq(assets.purpose, 'output'), eq(assets.state, 'ready'))).limit(1);
        if (!ready[0]) {
          materializationStarted = true;
          await renew();
          await materializeOutput(database.db, {actorUserId: task.requestedBy, workspaceId: payload.workspaceId, taskId: task.id, store, bytes: new Uint8Array(localFixture), mime: 'video/mp4', outboxLease: lease, now: options.now});
        }
        await renew();
        await settleGenerationTask(database.db, {actor, workspaceId: payload.workspaceId, taskId: task.id, idempotencyKey: `worker.success.${lease.id}`, outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, internalWorker: true, outboxLease: lease, now: options.now});
      }
      await acknowledgeOutbox(database.db, lease, clock());
    } catch (error) {
      const leaseOwned = !heartbeat.hasLostLease() && await renew().then(() => true).catch(() => false);
      const materializationAttempts = failedDispatch && materializationStarted
        ? (await database.db.select({attempts: generationTasks.materializationAttempts}).from(generationTasks).where(eq(generationTasks.id, failedDispatch.taskId)).limit(1).catch(() => []))[0]?.attempts ?? 0
        : 0;
      const retryExhausted = materializationAttempts >= 8;
      let terminalized = false;
      if (leaseOwned && failedDispatch && retryExhausted) {
        terminalized = await settleGenerationTask(database.db, {
          ...failedDispatch,
          idempotencyKey: `worker.failure.${lease.id}.${lease.attempts}`,
          outcome: 'failed',
          failureCode: 'generation.materialization_failed',
          providerCostEvidence: {state: 'unknown'},
          internalWorker: true,
          outboxLease: lease,
          now: options.now,
        }).then(() => true).catch(() => false);
      }
      const retryAt = new Date(clock().getTime() + Math.min(60_000, 1_000 * 2 ** Math.max(0, lease.attempts - 1)));
      const released = leaseOwned && (!retryExhausted || !terminalized) && await releaseOutbox(database.db, lease, retryAt, clock()).catch(() => false);
      if (leaseOwned && !released && (!retryExhausted || terminalized)) await failOutbox(database.db, lease, clock()).catch(() => undefined);
      throw error;
    } finally {
      await heartbeat.stop();
    }
    return true;
  } finally {
    await database.pool.end();
  }
}

const LOCAL_SWEEP_INTERVAL_MS = 10_000;
const LOCAL_CLEANUP_INTERVAL_MS = 60_000;

/** Cleanup does not depend on dispatch leases, queue activity, or task deadlines. */
export async function processLocalCleanupOnce(options: Readonly<{workspaceId?: string; now?: Date}> = {}): Promise<ReadonlyArray<CleanupOrphanedAssetsReport>> {
  const env = assertLocalProfile();
  const database = createDatabase();
  const store = getPrivateObjectStore();
  try {
    const tenants = await database.db.select({id: workspaces.id}).from(workspaces)
      .where(options.workspaceId ? eq(workspaces.id, options.workspaceId) : undefined).orderBy(workspaces.id);
    const reports: CleanupOrphanedAssetsReport[] = [];
    for (const tenant of tenants) {
      try {
        const report = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: tenant.id, store, root: env.assetRoot, now: options.now});
        reports.push(report);
        if (report.failures.length > 0) console.error(`Local asset cleanup has ${report.failures.length} retryable removal failures in workspace ${tenant.id}.`);
      } catch (error) {
        console.error(`Local asset cleanup failed for workspace ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return reports;
  } finally {
    await database.pool.end();
  }
}

export function startIndependentCleanupLoop(options: Readonly<{
  intervalMs?: number;
  run?: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}> = {}): () => Promise<void> {
  const run = options.run ?? processLocalCleanupOnce;
  const onError = options.onError ?? ((error: unknown) => { console.error(error instanceof Error ? error.message : 'Local asset cleanup failed.'); });
  let stopped = false;
  let pending: Promise<void> | null = null;
  const tick = (): void => {
    if (stopped || pending) return;
    pending = Promise.resolve().then(() => run()).then(() => {}, onError).finally(() => { pending = null; });
  };
  const timer = setInterval(tick, options.intervalMs ?? LOCAL_CLEANUP_INTERVAL_MS);
  timer.unref?.();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

function startIndependentSweepLoop(): () => Promise<void> {
  const database = createDatabase();
  let stopped = false;
  let tail: Promise<void> = Promise.resolve();
  const sweep = (): void => {
    tail = tail.then(async () => {
      if (stopped) return;
      await sweepExpiredGenerationTasks(database.db).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : 'Local deadline sweep failed.');
      });
    });
  };
  const timer = setInterval(sweep, LOCAL_SWEEP_INTERVAL_MS);
  timer.unref?.();
  sweep();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await tail;
    await database.pool.end();
  };
}

/** The local scheduler stays active while the optional provider remains disabled/unavailable. */
export async function processLocalAffiliateSyncOnce(authority: AffiliateNotificationAuthority = createUnavailableAffiliateAuthority()) {
  assertLocalProfile();
  const database = createDatabase();
  try {
    const notifications = await drainAffiliateNotifications(database.db, authority);
    const result = await runAffiliateSyncCycle(database.db, authority);
    return {...result, notifications};
  } finally {await database.pool.end();}
}

function startIndependentAffiliateLoop(): () => Promise<void> {
  let pending: Promise<void> | null = null;
  const tick = () => {
    if (pending) return;
    pending = processLocalAffiliateSyncOnce().then(() => {}, () => console.error('Local affiliate synchronization failed.')).finally(() => {pending = null;});
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.(); tick();
  return async () => {clearInterval(timer); await pending;};
}

const isDirectExecution = process.argv[1]?.replaceAll('\\', '/').endsWith('/local-worker.ts') ?? false;
if (isDirectExecution) {
  assertLocalProfile();
  const once = process.argv.includes('--once');
  if (once) {
    Promise.all([processLocalWorkerOnce(), processLocalCleanupOnce(), processLocalAffiliateSyncOnce()]).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
  } else {
    const stopSweep = startIndependentSweepLoop();
    const stopCleanup = startIndependentCleanupLoop();
    const stopAffiliates = startIndependentAffiliateLoop();
    let stopping = false;
    process.once('SIGINT', () => { stopping = true; });
    process.once('SIGTERM', () => { stopping = true; });
    const loop = async (): Promise<void> => {
      try {
        while (!stopping) {
          try {
            const processed = await processLocalWorkerOnce({runSweep: false});
            if (!processed && !stopping) await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(error instanceof Error ? error.message : 'Local worker iteration failed.');
            if (!stopping) await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } finally {
        await Promise.all([stopSweep(), stopCleanup(), stopAffiliates()]);
      }
    };
    loop().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
  }
}
