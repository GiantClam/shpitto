import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEnvFile} from 'node:process';
import {ok, strictEqual} from 'node:assert/strict';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import type {Pool} from 'pg';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {DomainError} from '../src/db/contracts.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {generationQuarantine, generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {outboxEvents} from '../src/db/schema/credit.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {
  claimDispatch,
  cancelGenerationTask,
  markGenerationMaterializing,
  markSubmissionUnknown,
  recordProviderSubmission,
  settleGenerationTask,
} from '../src/modules/generation/lifecycle.ts';
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
import {processLocalWorkerOnce} from './local-worker.ts';

if (existsSync(resolve(process.cwd(), '.env.local'))) loadEnvFile(resolve(process.cwd(), '.env.local'));

const userId = `probe-m3-recovery-${randomUUID()}`;
const workspaceId = randomUUID();
const actor = {userId};
const baseNow = new Date();
const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now: baseNow});

async function cleanup(pool: Pool): Promise<void> {
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

async function outboxForTask(pool: Pool, taskId: string): Promise<{id: string; status: string}> {
  const result = await pool.query<{id: string; status: string}>(
    `select id, status from app.outbox_events where workspace_id = $1::uuid and event_type = 'generation.dispatch' and payload->>'taskId' = $2 order by created_at desc limit 1`,
    [workspaceId, taskId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing dispatch event for ${taskId}.`);
  return row;
}

async function taskStatus(db: ReturnType<typeof createDatabase>['db'], taskId: string): Promise<string> {
  const row = (await db.select({status: generationTasks.status}).from(generationTasks).where(and(eq(generationTasks.id, taskId), eq(generationTasks.workspaceId, workspaceId))).limit(1))[0];
  if (!row) throw new Error(`Missing task ${taskId}.`);
  return row.status;
}

async function reservationStatus(db: ReturnType<typeof createDatabase>['db'], taskId: string): Promise<string> {
  const row = (await db.select({status: creditReservations.status}).from(creditReservations).where(and(eq(creditReservations.taskId, taskId), eq(creditReservations.workspaceId, workspaceId))).limit(1))[0];
  if (!row) throw new Error(`Missing reservation for ${taskId}.`);
  return row.status;
}

async function correlatedRecoveryEvidence(pool: Pool, taskIds: readonly string[]): Promise<ReadonlyArray<Record<string, unknown>>> {
  const result = await pool.query<Record<string, unknown>>(`
    select
      t.id::text as task_id,
      r.id::text as reservation_id,
      r.status as reservation_status,
      (select count(*)::int from app.submission_attempts a where a.task_id = t.id and a.workspace_id = t.workspace_id) as attempt_count,
      (select count(*)::int from app.outbox_events e where e.workspace_id = t.workspace_id and (e.payload->>'taskId' = t.id::text or e.aggregate_id = r.id)) as event_count,
      (select count(*)::int from app.command_results c where c.workspace_id = t.workspace_id and c.result->>'taskId' = t.id::text) as command_count,
      (select count(*)::int from app.credit_ledger_entries l
        join app.credit_allocations a on a.grant_id = l.grant_id and a.workspace_id = l.workspace_id
        where a.reservation_id = r.id and l.business_key like a.id::text || ':%'
          and l.entry_type in ('release', 'refund')) as release_count
    from app.generation_tasks t
    join app.credit_reservations r on r.task_id = t.id and r.workspace_id = t.workspace_id
    where t.workspace_id = $1::uuid and t.id = any($2::uuid[])
    order by t.id`, [workspaceId, taskIds]);
  return result.rows;
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();

  const database = createDatabase();
  try {
    await cleanup(database.pool);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'M3 Recovery Probe', $2, true, $3, $3)`,
      [userId, `${userId}@example.test`, baseNow],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'M3 Recovery Probe', $2, $3, $3)`,
      [workspaceId, userId, baseNow],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $2, 'owner', $3)`,
      [workspaceId, userId, baseNow],
    );
    await database.pool.query(
      `insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`,
      [workspaceId, baseNow],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`,
      [workspaceId, baseNow],
    );
    await issueGrant(database.db, {
      actorUserId: userId,
      workspaceId,
      commandName: 'probe.m3-recovery-grant',
      commandKey: 'probe-m3-recovery-grant',
      businessKey: 'probe-m3-recovery-grant',
      source: 'manual',
      amount: 1000n,
      payload: {amount: '1000'},
    });
    await database.pool.query(`update app.outbox_events set status = 'published' where workspace_id = $1::uuid`, [workspaceId]);

    const cancelled = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-cancel-create', quote, input: {prompt: 'cancel'}, now: baseNow});
    const cancelEvent = await outboxForTask(database.pool, cancelled.value.taskId);
    const cancelResult = await cancelGenerationTask(database.db, {actor, workspaceId, taskId: cancelled.value.taskId, idempotencyKey: 'm3-cancel', now: baseNow});
    strictEqual(cancelResult.value.status, 'cancelled');
    strictEqual(await taskStatus(database.db, cancelled.value.taskId), 'cancelled');
    strictEqual(await reservationStatus(database.db, cancelled.value.taskId), 'released');
    strictEqual((await outboxForTask(database.pool, cancelled.value.taskId)).status, 'failed');
    ok(cancelEvent.id, 'Cancellation must have a dispatch event.');
    await processLocalWorkerOnce({workspaceId, now: baseNow});
    strictEqual((await database.db.select().from(submissionAttempts).where(eq(submissionAttempts.taskId, cancelled.value.taskId))).length, 0, 'A cancelled task must not dispatch.');

    const overdue = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-overdue-create', quote, input: {prompt: 'overdue'}, now: baseNow});
    await processLocalWorkerOnce({workspaceId, now: new Date(baseNow.getTime() + 11 * 60 * 1000)});
    strictEqual(await taskStatus(database.db, overdue.value.taskId), 'failed');
    strictEqual(await reservationStatus(database.db, overdue.value.taskId), 'released');
    strictEqual((await database.db.select().from(submissionAttempts).where(eq(submissionAttempts.taskId, overdue.value.taskId))).length, 0, 'Overdue queue settlement must precede dispatch.');

    const unknown = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-unknown-create', quote, input: {prompt: 'unknown'}, now: baseNow});
    const unknownClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: unknown.value.taskId, idempotencyKey: 'm3-unknown-claim', now: baseNow});
    await markSubmissionUnknown(database.db, {actor, workspaceId, taskId: unknown.value.taskId, attemptId: unknownClaim.value.attemptId, idempotencyKey: 'm3-unknown-mark', now: new Date(baseNow.getTime() + 31_000)});
    await processLocalWorkerOnce({workspaceId, now: new Date(baseNow.getTime() + 31_000)});
    let unknownAttempt = (await database.db.select({probeCount: submissionAttempts.probeCount}).from(submissionAttempts).where(eq(submissionAttempts.id, unknownClaim.value.attemptId)).limit(1))[0];
    strictEqual(unknownAttempt?.probeCount, 1);
    const firstProbeTask = (await database.db.select({nextActionAt: generationTasks.nextActionAt}).from(generationTasks).where(eq(generationTasks.id, unknown.value.taskId)).limit(1))[0];
    ok(firstProbeTask);
    strictEqual(firstProbeTask.nextActionAt.getTime(), baseNow.getTime() + 181_000, 'Each missing observation waits the persisted 150-second probe interval.');
    await processLocalWorkerOnce({workspaceId, now: firstProbeTask.nextActionAt});
    unknownAttempt = (await database.db.select({probeCount: submissionAttempts.probeCount}).from(submissionAttempts).where(eq(submissionAttempts.id, unknownClaim.value.attemptId)).limit(1))[0];
    strictEqual(unknownAttempt?.probeCount, 2);
    strictEqual(await taskStatus(database.db, unknown.value.taskId), 'submission_unknown');

    const materializing = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-materializing-create', quote, input: {prompt: 'materializing'}, now: baseNow});
    const materialClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: materializing.value.taskId, idempotencyKey: 'm3-materializing-claim', now: baseNow});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: materializing.value.taskId, attemptId: materialClaim.value.attemptId, providerRequestId: 'probe-m3-materializing', idempotencyKey: 'm3-materializing-submit', internalWorker: true, now: baseNow});
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: materializing.value.taskId, attemptId: materialClaim.value.attemptId, idempotencyKey: 'm3-materializing-mark', internalWorker: true, now: baseNow});
    await database.pool.query(`update app.generation_tasks set materialization_attempts = 8 where id = $1::uuid and workspace_id = $2::uuid`, [materializing.value.taskId, workspaceId]);
    await processLocalWorkerOnce({workspaceId, now: new Date(baseNow.getTime() + 182_000)}).catch((error: unknown) => {
      ok(error instanceof DomainError && error.code === 'CONFLICT', 'Exhausted materialization should fail before invoking ffprobe.');
    });
    strictEqual(await taskStatus(database.db, materializing.value.taskId), 'failed');
    strictEqual(await reservationStatus(database.db, materializing.value.taskId), 'released');

    const deadlineTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-deadline-create', quote, input: {prompt: 'deadline'}, now: baseNow});
    const deadlineClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: deadlineTask.value.taskId, idempotencyKey: 'm3-deadline-claim', now: baseNow});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: deadlineTask.value.taskId, attemptId: deadlineClaim.value.attemptId, providerRequestId: 'probe-m3-deadline', idempotencyKey: 'm3-deadline-submit', internalWorker: true, now: baseNow});
    const materializingAt = new Date(baseNow.getTime() + 50 * 60 * 1000);
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: deadlineTask.value.taskId, attemptId: deadlineClaim.value.attemptId, idempotencyKey: 'm3-deadline-mark', internalWorker: true, now: materializingAt});
    const deadlineRow = (await database.db.select({deadlineAt: generationTasks.deadlineAt, overallDeadlineAt: generationTasks.overallDeadlineAt}).from(generationTasks).where(eq(generationTasks.id, deadlineTask.value.taskId)).limit(1))[0];
    ok(deadlineRow?.deadlineAt && deadlineRow.overallDeadlineAt);
    strictEqual(deadlineRow.deadlineAt.getTime(), baseNow.getTime() + 80 * 60 * 1000, 'Materialization receives a 30-minute budget from authenticated success.');
    strictEqual(deadlineRow.overallDeadlineAt.getTime(), baseNow.getTime() + 90 * 60 * 1000);

    const capped = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-capped-create', quote, input: {prompt: 'capped deadline'}, now: baseNow});
    const cappedClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: capped.value.taskId, idempotencyKey: 'm3-capped-claim', now: baseNow});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: capped.value.taskId, attemptId: cappedClaim.value.attemptId, providerRequestId: 'probe-m3-capped', idempotencyKey: 'm3-capped-submit', internalWorker: true, now: baseNow});
    // A shortened accepted overall budget exercises the cap while execution is still within its 60-minute deadline.
    const shortenedOverall = new Date(baseNow.getTime() + 65 * 60 * 1000);
    await database.db.update(generationTasks).set({overallDeadlineAt: shortenedOverall}).where(and(eq(generationTasks.id, capped.value.taskId), eq(generationTasks.workspaceId, workspaceId)));
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: capped.value.taskId, attemptId: cappedClaim.value.attemptId, idempotencyKey: 'm3-capped-mark', internalWorker: true, now: materializingAt});
    const cappedRow = (await database.db.select({deadlineAt: generationTasks.deadlineAt}).from(generationTasks).where(eq(generationTasks.id, capped.value.taskId)).limit(1))[0];
    strictEqual(cappedRow?.deadlineAt.getTime(), shortenedOverall.getTime(), 'Materialization must not extend the persisted overall budget.');

    const expired = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'm3-expired-create', quote, input: {prompt: 'expired'}, now: baseNow});
    const expiredClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: expired.value.taskId, idempotencyKey: 'm3-expired-claim', now: baseNow});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: expired.value.taskId, attemptId: expiredClaim.value.attemptId, providerRequestId: 'probe-m3-expired', idempotencyKey: 'm3-expired-submit', internalWorker: true, now: baseNow});
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: expired.value.taskId, attemptId: expiredClaim.value.attemptId, idempotencyKey: 'm3-expired-mark', internalWorker: true, now: baseNow});
    const expiredAssetId = randomUUID();
    // Metadata-only fixture isolates the deadline guard; this probe makes no successful media validation claim.
    await database.pool.query(
      `insert into app.assets (id, workspace_id, task_id, purpose, state, object_key, created_by, mime, bytes, sha256, duration_ms, upload_expires_at, created_at, updated_at) values ($1::uuid, $2::uuid, $3::uuid, 'output', 'ready', $4, $5, 'video/mp4', 1, $6, 1, null, $7, $7)`,
      [expiredAssetId, workspaceId, expired.value.taskId, `tasks/${expired.value.taskId}/outputs/${expiredAssetId}.mp4`, userId, 'probe', baseNow],
    );
    let expiredRejected = false;
    try {
      await settleGenerationTask(database.db, {actor, workspaceId, taskId: expired.value.taskId, idempotencyKey: 'm3-expired-success', outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, internalWorker: true, now: new Date(baseNow.getTime() + 30 * 60 * 1000)});
    } catch (error) {
      expiredRejected = error instanceof DomainError && error.code === 'CONFLICT';
    }
    ok(expiredRejected, 'An expired materializing task must reject success settlement.');
    strictEqual(await taskStatus(database.db, expired.value.taskId), 'materializing');
    strictEqual(await reservationStatus(database.db, expired.value.taskId), 'active');

    const finalClock = new Date(baseNow.getTime() + 91 * 60 * 1000);
    const finalSweep = await sweepExpiredGenerationTasks(database.db, finalClock, {workspaceId});
    strictEqual(finalSweep.failed, 4, 'All remaining unknown/materializing tasks must refund once after their deadlines.');
    const ledgerBeforeLateSuccess = (await database.pool.query<{count: number}>(`select count(*)::int as count from app.credit_ledger_entries where workspace_id = $1::uuid`, [workspaceId])).rows[0]?.count ?? 0;
    const lateSuccess = await settleGenerationTask(database.db, {
      actor,
      workspaceId,
      taskId: expired.value.taskId,
      idempotencyKey: 'm3-late-success-after-refund',
      outcome: 'succeeded',
      providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'},
      now: finalClock,
    });
    strictEqual(lateSuccess.value.status, 'quarantined', 'A success observed after refund must be quarantined.');
    strictEqual(await taskStatus(database.db, expired.value.taskId), 'failed', 'The recovery winner must remain failed after late success.');
    strictEqual(await reservationStatus(database.db, expired.value.taskId), 'released');
    const ledgerAfterLateSuccess = (await database.pool.query<{count: number}>(`select count(*)::int as count from app.credit_ledger_entries where workspace_id = $1::uuid`, [workspaceId])).rows[0]?.count ?? 0;
    strictEqual(ledgerAfterLateSuccess, ledgerBeforeLateSuccess, 'Late success must not create another debit or refund.');
    const lateQuarantine = await database.db.select({eventType: generationQuarantine.eventType}).from(generationQuarantine).where(eq(generationQuarantine.taskId, expired.value.taskId));
    strictEqual(lateQuarantine.some((row) => row.eventType === 'generation.succeeded'), true);
    const unrelatedId = randomUUID();
    await database.pool.query(
      `insert into app.outbox_events (id, workspace_id, event_type, aggregate_id, business_key, payload, status, available_at, lease_until, lease_owner, lease_token, lease_generation, attempts, created_at) values ($1::uuid, $2::uuid, 'probe.unrelated', null, $3, '{}'::jsonb, 'pending', $4, null, null, null, 0, 0, $4)`,
      [unrelatedId, workspaceId, `probe-m3-unrelated-${unrelatedId}`, baseNow],
    );
    strictEqual(await processLocalWorkerOnce({workspaceId, now: finalClock}), false, 'There is no generation work left to claim.');
    const unrelated = (await database.db.select({status: outboxEvents.status, attempts: outboxEvents.attempts, leaseOwner: outboxEvents.leaseOwner}).from(outboxEvents).where(eq(outboxEvents.id, unrelatedId)).limit(1))[0];
    strictEqual(unrelated?.status, 'pending');
    strictEqual(unrelated?.attempts, 0, 'The generation worker must not claim unrelated events.');
    strictEqual(unrelated?.leaseOwner, null);

    const pendingDispatches = (await database.pool.query<{count: number}>(`select count(*)::int as count from app.outbox_events where workspace_id = $1::uuid and event_type = 'generation.dispatch' and status = 'pending'`, [workspaceId])).rows[0]?.count ?? 0;
    strictEqual(pendingDispatches, 0);
    const balance = (await database.pool.query<{available: string; reserved: string; consumed: string}>(`select sum(available)::text as available, sum(reserved)::text as reserved, sum(consumed)::text as consumed from app.credit_grants where workspace_id = $1::uuid`, [workspaceId])).rows[0];
    strictEqual(balance?.available, '1000');
    strictEqual(balance?.reserved, '0');
    strictEqual(balance?.consumed, '0');
    const correlation = await correlatedRecoveryEvidence(database.pool, [unknown.value.taskId, overdue.value.taskId, expired.value.taskId]);
    strictEqual(correlation.length, 3, 'Recovery evidence must retain all selected task correlations.');
    for (const row of correlation) {
      if (Number(row.event_count) < 1 || Number(row.command_count) < 1 || Number(row.release_count) < 1) {
        throw new Error(`Recovery evidence lost a task/event/command/release correlation: ${JSON.stringify(row)}`);
      }
    }
    const correlationText = JSON.stringify(correlation);
    const secretFree = !/(DATABASE_URL|BETTER_AUTH_SECRET|MAIL_SMTP_URL|postgres:\/\/|signedUrl|downloadUrl|token=)/i.test(correlationText);
    strictEqual(secretFree, true, 'Correlated recovery evidence must not contain connection secrets or signed URLs.');
  } finally {
    try {
      await cleanup(database.pool);
      const remaining = await database.pool.query<{count: number}>('select count(*)::int as count from app.workspaces where id = $1::uuid', [workspaceId]);
      strictEqual(remaining.rows[0]?.count, 0, 'The probe workspace must be removed.');
    } finally {
      await database.pool.end();
    }
  }
  console.log(JSON.stringify({status: 'PASS', cancelledNoDispatch: true, overdueWorkerRefundBeforeDispatch: true, unknownProbeCounts: [1, 2], materializationExhausted: true, materializationBudgetMinutes: 30, deadlineCappedAtOverall: true, expiredSuccessRejected: true, lateSuccessAfterRefund: {status: 'quarantined', ledgerUnchanged: true}, correlatedRecoveryEvidence: {taskCount: 3, secretFree: true}, unrelatedOutboxUnclaimed: true, reserved: '0', fixturesRemoved: true}));
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
