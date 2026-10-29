import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {deepStrictEqual} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {DomainError} from '../src/db/contracts.ts';
import {generationQuarantine, generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {getGenerationRecoveryProjection} from '../src/modules/credits/queries.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {cancelGenerationTask, claimDispatch, markGenerationMaterializing, markSubmissionUnknown, recordProviderSubmission, reconcileSubmissionUnknown, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';
import {processLocalWorkerOnce} from './local-worker.ts';

const userId = 'probe-generation-lifecycle-user';
const workspaceId = '00000000-0000-4000-8000-000000000922';
const now = new Date('2026-09-29T08:00:00.000Z');
const actor = {userId};

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  for (const table of ['generation_quarantine', 'submission_attempts', 'assets', 'command_results', 'outbox_events', 'audit_events', 'credit_ledger_entries', 'credit_allocations']) {
    await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  }
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = $1::uuid', [workspaceId]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) {
    await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  }
  await pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
  await pool.query('delete from "user" where id = $1', [userId]);
}

type PublicRecoveryEvidence = Readonly<{
  workspaceId: string;
  taskId: string;
  attemptId: string | null;
  eventId: string | null;
  auditId: string | null;
  commandId: string | null;
  reservationStatus: string | null;
}>;

async function readPublicRecoveryEvidence(
  pool: {query: (text: string, values?: unknown[]) => Promise<{rows: unknown[]}>},
  taskId: string,
): Promise<PublicRecoveryEvidence | undefined> {
  const result = await pool.query(`select
      gt.workspace_id::text as "workspaceId",
      gt.id::text as "taskId",
      attempt.id::text as "attemptId",
      event.id::text as "eventId",
      audit.id::text as "auditId",
      command.id::text as "commandId",
      reservation.status as "reservationStatus"
    from app.generation_tasks gt
    left join app.credit_reservations reservation
      on reservation.workspace_id = gt.workspace_id and reservation.task_id = gt.id
    left join lateral (
      select id from app.submission_attempts
      where workspace_id = gt.workspace_id and task_id = gt.id
      order by attempt_no desc limit 1
    ) attempt on true
    left join lateral (
      select id from app.outbox_events
      where workspace_id = gt.workspace_id and aggregate_id = reservation.id
      order by created_at desc limit 1
    ) event on true
    left join lateral (
      select id from app.audit_events
      where workspace_id = gt.workspace_id
        and (payload->>'reservationId' = reservation.id::text or payload->>'taskId' = gt.id::text)
      order by created_at desc limit 1
    ) audit on true
    left join lateral (
      select id from app.command_results
      where workspace_id = gt.workspace_id and result->>'taskId' = gt.id::text
      order by created_at desc limit 1
    ) command on true
    where gt.workspace_id = $1::uuid and gt.id = $2::uuid
    limit 1`, [workspaceId, taskId]);
  return result.rows[0] as PublicRecoveryEvidence | undefined;
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();
  const database = createDatabase();
  try {
    await cleanup(database.pool);
    await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Lifecycle Probe', $2, true, $3, $3)`, [userId, `${userId}@example.test`, now]);
    await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'Lifecycle Probe', $2, $3, $3)`, [workspaceId, userId, now]);
    await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $2, 'owner', $3)`, [workspaceId, userId, now]);
    await database.pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`, [workspaceId, now]);
    await database.pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`, [workspaceId, now]);
    await issueGrant(database.db, {actorUserId: userId, workspaceId, commandName: 'probe.lifecycle-grant', commandKey: 'grant', businessKey: 'probe-lifecycle-grant', source: 'manual', amount: 100n, payload: {amount: '100'}});

    const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});
    const created = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-create', quote, input: {prompt: 'cancel me'}, now});
    const cancelled = await cancelGenerationTask(database.db, {actor, workspaceId, taskId: created.value.taskId, idempotencyKey: 'lifecycle-cancel', now});
    if (cancelled.value.status !== 'cancelled') throw new Error('Queued cancellation did not reach cancelled.');
    const released = await database.db.select({status: creditReservations.status}).from(creditReservations).where(eq(creditReservations.taskId, created.value.taskId));
    deepStrictEqual(released[0]?.status, 'released');
    let claimAfterCancelRejected = false;
    try { await claimDispatch(database.db, {actor, workspaceId, taskId: created.value.taskId, idempotencyKey: 'lifecycle-claim-after-cancel', now}); } catch (error) { claimAfterCancelRejected = error instanceof DomainError && error.code === 'CONFLICT'; }
    if (!claimAfterCancelRejected) throw new Error('A cancelled task must not be claimable.');

    const created2 = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-create-2', quote, input: {prompt: 'settle me'}, now});
    const claim = await claimDispatch(database.db, {actor, workspaceId, taskId: created2.value.taskId, idempotencyKey: 'lifecycle-claim-2', now});
    const claimReplay = await claimDispatch(database.db, {actor, workspaceId, taskId: created2.value.taskId, idempotencyKey: 'lifecycle-claim-2', now});
    if (!claimReplay.replayed || claimReplay.value.dispatchIdentity !== claim.value.dispatchIdentity) throw new Error('Dispatch claim replay was not stable.');
    let cancelAfterClaimRejected = false;
    try {
      await cancelGenerationTask(database.db, {actor, workspaceId, taskId: created2.value.taskId, idempotencyKey: 'lifecycle-cancel-after-claim', now});
    } catch (error) {
      cancelAfterClaimRejected = error instanceof DomainError && error.code === 'CONFLICT';
    }
    if (!cancelAfterClaimRejected) throw new Error('Cancellation after durable dispatch claim must be rejected.');
    const unknown = await markSubmissionUnknown(database.db, {actor, workspaceId, taskId: created2.value.taskId, attemptId: claim.value.attemptId, idempotencyKey: 'lifecycle-unknown-2', now: new Date(now.getTime() + 31_000)});
    if (unknown.value.status !== 'submission_unknown') throw new Error('Submission timeout did not enter submission_unknown.');
    let secondClaimRejected = false;
    try { await claimDispatch(database.db, {actor, workspaceId, taskId: created2.value.taskId, idempotencyKey: 'lifecycle-claim-3', now}); } catch (error) { secondClaimRejected = error instanceof DomainError && error.code === 'CONFLICT'; }
    if (!secondClaimRejected) throw new Error('Unknown submission must not create a second paid claim.');
    const failed = await reconcileSubmissionUnknown(database.db, {actor, workspaceId, taskId: created2.value.taskId, attemptId: claim.value.attemptId, idempotencyKey: 'lifecycle-reconcile-expired', observation: 'missing', internalWorker: true, now: new Date(now.getTime() + 60 * 60 * 1000 + 2 * 60 * 1000)});
    if (failed.value.status !== 'failed' || failed.value.probeCount !== 1) throw new Error('Untraceable submission did not fail after its budget deadline.');
    const recoveryEvidence = await readPublicRecoveryEvidence(database.pool, created2.value.taskId);
    if (!recoveryEvidence || recoveryEvidence.workspaceId !== workspaceId || recoveryEvidence.taskId !== created2.value.taskId || !recoveryEvidence.attemptId || !recoveryEvidence.eventId || !recoveryEvidence.auditId || !recoveryEvidence.commandId || recoveryEvidence.reservationStatus !== 'released') {
      throw new Error(`Recovery evidence was not fully correlated: ${JSON.stringify(recoveryEvidence)}`);
    }
    if (/(providerRequestId|objectKey|signedUrl|downloadUrl|secret|token)/i.test(JSON.stringify(recoveryEvidence))) {
      throw new Error('Public recovery evidence must not contain provider, object, signed URL or secret fields.');
    }
    const recoveryProjection = (await getGenerationRecoveryProjection(database.db, workspaceId, [created2.value.taskId]))[0];
    if (!recoveryProjection || recoveryProjection.workspaceId !== workspaceId || recoveryProjection.taskId !== created2.value.taskId || !recoveryProjection.attempt || !recoveryProjection.event || !recoveryProjection.command || !recoveryProjection.reservation || !recoveryProjection.release) {
      throw new Error(`Safe recovery projection was not fully correlated: ${JSON.stringify(recoveryProjection)}`);
    }
    if (/(providerRequestId|objectKey|signedUrl|downloadUrl|secret|token)/i.test(JSON.stringify(recoveryProjection))) {
      throw new Error('Safe recovery projection must not contain provider, object, signed URL or secret fields.');
    }
    if (recoveryProjection.status !== 'failed' || recoveryProjection.reservation.status !== 'released' || !['release', 'refund'].includes(recoveryProjection.release.entryType)) {
      throw new Error(`Safe recovery projection did not preserve persisted settlement state: ${JSON.stringify({status: recoveryProjection.status, reservation: recoveryProjection.reservation.status, release: recoveryProjection.release.entryType})}`);
    }
    const late = await settleGenerationTask(database.db, {actor, workspaceId, taskId: created2.value.taskId, idempotencyKey: 'lifecycle-late-2', outcome: 'failed', failureCode: 'late', now});
    if (late.value.status !== 'quarantined') throw new Error('Late terminal evidence was not quarantined.');
    const successTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-success', quote, input: {prompt: 'materialize me'}, now});
    const successClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: successTask.value.taskId, idempotencyKey: 'lifecycle-success-claim', now});
    await database.pool.query(`update app.generation_tasks set status = 'materializing', version = version + 1, updated_at = $2 where id = $1::uuid and workspace_id = $3::uuid`, [successTask.value.taskId, now, workspaceId]);
    const mediaRoot = '.data/probe-assets';
    let headerOnlyRejected = false;
    try {
      await materializeOutput(database.db, {actorUserId: userId, workspaceId, taskId: successTask.value.taskId, root: mediaRoot, bytes: new Uint8Array([...new Array(4).fill(0), ...new TextEncoder().encode('ftypmp42'), 0, 0, 0, 0]), mime: 'video/mp4', now});
    } catch (error) {
      headerOnlyRejected = error instanceof DomainError && error.code === 'VALIDATION';
    }
    if (!headerOnlyRejected) throw new Error('Header-only MP4 fixture was accepted as ready media.');
    const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/video/local-demo.mp4')));
    const output = await materializeOutput(database.db, {actorUserId: userId, workspaceId, taskId: successTask.value.taskId, root: mediaRoot, bytes: fixture, mime: 'video/mp4', now});
    const succeeded = await settleGenerationTask(database.db, {actor, workspaceId, taskId: successTask.value.taskId, idempotencyKey: 'lifecycle-success-settle', outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, now});
    if (succeeded.value.status !== 'succeeded' || !output.assetId || !successClaim.value.attemptId) throw new Error('Ready output did not cross the success boundary.');
    const failedOutputTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-failed-output', quote, input: {prompt: 'missing output'}, now});
    const failedOutputClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: failedOutputTask.value.taskId, idempotencyKey: 'lifecycle-failed-output-claim', now});
    await database.pool.query(`update app.submission_attempts set provider = 'fal' where id = $1::uuid`, [failedOutputClaim.value.attemptId]);
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: failedOutputTask.value.taskId, attemptId: failedOutputClaim.value.attemptId, providerRequestId: 'lifecycle-failed-output-provider', statusUrl: 'https://queue.fal.run/custom/status/lifecycle-failed-output-provider', resultUrl: 'https://queue.fal.run/custom/result/lifecycle-failed-output-provider', idempotencyKey: 'lifecycle-failed-output-submit', internalWorker: true, now});
    const persistedTracking = (await database.db.select({statusUrl: submissionAttempts.providerStatusUrl, resultUrl: submissionAttempts.providerResultUrl}).from(submissionAttempts).where(eq(submissionAttempts.id, failedOutputClaim.value.attemptId)).limit(1))[0];
    if (persistedTracking?.statusUrl !== 'https://queue.fal.run/custom/status/lifecycle-failed-output-provider' || persistedTracking.resultUrl !== 'https://queue.fal.run/custom/result/lifecycle-failed-output-provider') throw new Error('Provider tracking URLs were not persisted with the request identity.');
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: failedOutputTask.value.taskId, attemptId: failedOutputClaim.value.attemptId, idempotencyKey: 'lifecycle-failed-output-materialize', internalWorker: true, now});
    const failedOutput = await settleGenerationTask(database.db, {actor, workspaceId, taskId: failedOutputTask.value.taskId, idempotencyKey: 'lifecycle-failed-output-settle', outcome: 'failed', failureCode: 'generation.no_usable_output', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, now});
    if (failedOutput.value.status !== 'failed') throw new Error('A completed observation without usable output must fail instead of succeeding.');
    const overdue = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-overdue', quote, input: {prompt: 'deadline me'}, now});
    const swept = await sweepExpiredGenerationTasks(database.db, new Date(now.getTime() + 11 * 60 * 1000));
    if (swept.failed !== 1) throw new Error('Expired queued task was not failed and refunded.');
    const workerNow = new Date();
    const workerTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'lifecycle-worker', quote, input: {prompt: 'worker me'}, now: workerNow});
    await processLocalWorkerOnce({workspaceId, now: workerNow});
    await processLocalWorkerOnce({workspaceId, now: workerNow});
    await processLocalWorkerOnce({workspaceId, now: workerNow});
    const workerStatus = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, workerTask.value.taskId)).limit(1))[0]?.status;
    if (workerStatus !== 'succeeded') throw new Error(`Local worker did not complete a Mock task: ${workerStatus ?? 'missing'}`);
    const tasks = await database.db.select().from(generationTasks).where(eq(generationTasks.workspaceId, workspaceId));
    const attempts = await database.db.select().from(submissionAttempts).where(eq(submissionAttempts.workspaceId, workspaceId));
    const quarantines = await database.db.select().from(generationQuarantine).where(eq(generationQuarantine.workspaceId, workspaceId));
    deepStrictEqual(tasks.map((row) => row.status).sort(), ['cancelled', 'failed', 'failed', 'failed', 'succeeded', 'succeeded']);
    deepStrictEqual(attempts.map((row) => row.state).sort(), ['failed', 'failed', 'succeeded', 'succeeded']);
    deepStrictEqual(quarantines.map((row) => row.eventType), ['generation.failed']);
    const assetRows = await database.db.select({state: assets.state}).from(assets).where(eq(assets.workspaceId, workspaceId));
    console.log(JSON.stringify({status: 'PASS', cancelled: cancelled.value.status, claimReplayed: claimReplay.replayed, cancelAfterClaimRejected, unknown: unknown.value.status, secondClaimRejected, failed: failed.value.status, late: late.value.status, failedOutput: failedOutput.value.status, swept: swept.failed, succeeded: succeeded.value.status, worker: workerStatus, headerOnlyRejected, readyAssets: assetRows.filter((row) => row.state === 'ready').length, overdueTask: overdue.value.taskId, recoveryEvidence: {correlated: true, secretFree: true, reservationStatus: recoveryEvidence?.reservationStatus}, recoveryProjection: {correlated: true, secretFree: true, status: recoveryProjection.status, reservationStatus: recoveryProjection.reservation.status, release: recoveryProjection.release.entryType}, trackingUrlsPersisted: true}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
