import {resolve} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {deepStrictEqual, strictEqual} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {generationQuarantine, generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {cancelGenerationTask, claimDispatch, markGenerationMaterializing, recordProviderSubmission, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';

if (existsSync(resolve(process.cwd(), '.env.local'))) loadEnvFile(resolve(process.cwd(), '.env.local'));

const userId = 'probe-generation-races-user';
const workspaceId = '00000000-0000-4000-8000-000000000951';
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

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();
  const database = createDatabase();
  try {
    await cleanup(database.pool);
    await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Race Probe', $2, true, $3, $3)`, [userId, `${userId}@example.test`, now]);
    await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'Race Probe', $2, $3, $3)`, [workspaceId, userId, now]);
    await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $2, 'owner', $3)`, [workspaceId, userId, now]);
    await database.pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`, [workspaceId, now]);
    await database.pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`, [workspaceId, now]);
    await issueGrant(database.db, {actorUserId: userId, workspaceId, commandName: 'probe.race-grant', commandKey: 'race-grant', businessKey: 'probe-race-grant', source: 'manual', amount: 300n, payload: {amount: '300'}});
    const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});

    const cancelTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'race-cancel-create', quote, input: {prompt: 'cancel race'}, now});
    const cancelRace = await Promise.allSettled([
      cancelGenerationTask(database.db, {actor, workspaceId, taskId: cancelTask.value.taskId, idempotencyKey: 'race-cancel', now}),
      claimDispatch(database.db, {actor, workspaceId, taskId: cancelTask.value.taskId, idempotencyKey: 'race-claim', now}),
    ]);
    const cancelFulfilled = cancelRace.filter((result) => result.status === 'fulfilled');
    strictEqual(cancelFulfilled.length, 1);
    const cancelStatus = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, cancelTask.value.taskId)).limit(1))[0]?.status;
    if (cancelStatus !== 'cancelled' && cancelStatus !== 'dispatching') throw new Error(`Unexpected cancel/claim race status: ${cancelStatus ?? 'missing'}`);

    const terminalTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'race-terminal-create', quote, input: {prompt: 'terminal race'}, now});
    const claim = await claimDispatch(database.db, {actor, workspaceId, taskId: terminalTask.value.taskId, idempotencyKey: 'race-terminal-claim', now});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: terminalTask.value.taskId, attemptId: claim.value.attemptId, providerRequestId: 'race-provider-request', idempotencyKey: 'race-terminal-submit', internalWorker: true, now});
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: terminalTask.value.taskId, attemptId: claim.value.attemptId, idempotencyKey: 'race-terminal-materialize', internalWorker: true, now});
    const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/video/local-demo.mp4')));
    await materializeOutput(database.db, {actorUserId: userId, workspaceId, taskId: terminalTask.value.taskId, root: '.data/probe-race-assets', bytes: fixture, mime: 'video/mp4', now});
    // Both terminal commands begin before either can observe the other's commit.
    // PostgreSQL row locking plus the active task version/deadline fence must leave
    // exactly one terminal winner; the losing observation is quarantined regardless
    // of which transaction acquires the account/task locks first.
    const terminalRace = await Promise.allSettled([
      settleGenerationTask(database.db, {actor, workspaceId, taskId: terminalTask.value.taskId, idempotencyKey: 'race-terminal-success', outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, now}),
      settleGenerationTask(database.db, {actor, workspaceId, taskId: terminalTask.value.taskId, idempotencyKey: 'race-terminal-failure', outcome: 'failed', failureCode: 'race.failure', providerCostEvidence: {state: 'unknown'}, now}),
    ]);
    const terminalResults = terminalRace.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    const terminalStatuses = terminalResults.map((result) => result.value.status).sort();
    deepStrictEqual(terminalStatuses.filter((status) => status !== 'quarantined').length, 1, 'Concurrent terminal settlement must produce exactly one winner.');
    strictEqual(terminalStatuses.filter((status) => status === 'quarantined').length, 1, 'Concurrent terminal settlement must quarantine exactly one loser.');
    const terminalRow = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, terminalTask.value.taskId)).limit(1))[0];
    strictEqual(terminalRow?.status, terminalStatuses.includes('succeeded') ? 'succeeded' : 'failed');
    const terminalReservation = (await database.db.select({id: creditReservations.id, status: creditReservations.status}).from(creditReservations).where(eq(creditReservations.taskId, terminalTask.value.taskId)).limit(1))[0];
    strictEqual(terminalReservation?.status, terminalRow?.status === 'succeeded' ? 'consumed' : 'released');
    const terminalLedgerCount = (await database.pool.query<{count: number}>(
      `select count(*)::int as count
         from app.credit_ledger_entries l
         join app.credit_allocations a on a.grant_id = l.grant_id and a.workspace_id = l.workspace_id
        where a.reservation_id = $1::uuid and l.business_key like a.id::text || ':%'`,
      [terminalReservation?.id],
    )).rows[0]?.count ?? 0;
    strictEqual(terminalLedgerCount, 1, 'Concurrent terminal settlement must create exactly one ledger effect.');
    const attempts = await database.db.select({state: submissionAttempts.state}).from(submissionAttempts).where(eq(submissionAttempts.taskId, terminalTask.value.taskId));
    deepStrictEqual(attempts.map((row) => row.state), [terminalRow?.status]);

    // Exercise both orderings of the deadline/success terminal fence. Each
    // task gets exactly one active terminal winner; the opposite observation
    // is retained as quarantine evidence and cannot change credits or state.
    const successFirst = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'race-deadline-success-first-create', quote, input: {prompt: 'deadline success first'}, now});
    const successFirstClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: successFirst.value.taskId, idempotencyKey: 'race-deadline-success-first-claim', now});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: successFirst.value.taskId, attemptId: successFirstClaim.value.attemptId, providerRequestId: 'race-deadline-success-first-provider', idempotencyKey: 'race-deadline-success-first-submit', internalWorker: true, now});
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: successFirst.value.taskId, attemptId: successFirstClaim.value.attemptId, idempotencyKey: 'race-deadline-success-first-materialize', internalWorker: true, now});
    await materializeOutput(database.db, {actorUserId: userId, workspaceId, taskId: successFirst.value.taskId, root: '.data/probe-race-assets', bytes: fixture, mime: 'video/mp4', now});
    const successFirstResult = await settleGenerationTask(database.db, {actor, workspaceId, taskId: successFirst.value.taskId, idempotencyKey: 'race-deadline-success-first-success', outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, now: new Date(now.getTime() + 1_000)});
    const successFirstLateDeadline = await settleGenerationTask(database.db, {actor, workspaceId, taskId: successFirst.value.taskId, idempotencyKey: 'race-deadline-success-first-deadline', outcome: 'failed', failureCode: 'generation.deadline_exceeded', providerCostEvidence: {state: 'unknown'}, internalWorker: true, now: new Date(now.getTime() + 31 * 60 * 1000)});
    deepStrictEqual([successFirstResult.value.status, successFirstLateDeadline.value.status].sort(), ['quarantined', 'succeeded']);
    strictEqual((await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, successFirst.value.taskId)).limit(1))[0]?.status, 'succeeded');

    const deadlineFirst = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'race-deadline-first-create', quote, input: {prompt: 'deadline first'}, now});
    const deadlineFirstClaim = await claimDispatch(database.db, {actor, workspaceId, taskId: deadlineFirst.value.taskId, idempotencyKey: 'race-deadline-first-claim', now});
    await recordProviderSubmission(database.db, {actor, workspaceId, taskId: deadlineFirst.value.taskId, attemptId: deadlineFirstClaim.value.attemptId, providerRequestId: 'race-deadline-first-provider', idempotencyKey: 'race-deadline-first-submit', internalWorker: true, now});
    await markGenerationMaterializing(database.db, {actor, workspaceId, taskId: deadlineFirst.value.taskId, attemptId: deadlineFirstClaim.value.attemptId, idempotencyKey: 'race-deadline-first-materialize', internalWorker: true, now});
    const deadlineFirstRow = (await database.db.select({deadlineAt: generationTasks.deadlineAt}).from(generationTasks).where(eq(generationTasks.id, deadlineFirst.value.taskId)).limit(1))[0];
    if (!deadlineFirstRow?.deadlineAt) throw new Error('Deadline-first fixture did not persist a materialization deadline.');
    const deadlineFirstAt = new Date(deadlineFirstRow.deadlineAt.getTime() + 1);
    const deadlineFirstResult = await settleGenerationTask(database.db, {actor, workspaceId, taskId: deadlineFirst.value.taskId, idempotencyKey: 'race-deadline-first-deadline', outcome: 'failed', failureCode: 'generation.deadline_exceeded', providerCostEvidence: {state: 'unknown'}, internalWorker: true, now: deadlineFirstAt});
    const deadlineFirstLateSuccess = await settleGenerationTask(database.db, {actor, workspaceId, taskId: deadlineFirst.value.taskId, idempotencyKey: 'race-deadline-first-success', outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, now: deadlineFirstAt});
    deepStrictEqual([deadlineFirstResult.value.status, deadlineFirstLateSuccess.value.status].sort(), ['failed', 'quarantined']);
    strictEqual((await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, deadlineFirst.value.taskId)).limit(1))[0]?.status, 'failed');
    const deadlineQuarantine = await database.db.select({eventType: generationQuarantine.eventType}).from(generationQuarantine).where(eq(generationQuarantine.taskId, deadlineFirst.value.taskId));
    deepStrictEqual(deadlineQuarantine.map((row) => row.eventType), ['generation.succeeded']);

    const crashTask = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: 'race-crash-create', quote, input: {prompt: 'crash after reserve'}, now});
    const swept = await sweepExpiredGenerationTasks(database.db, new Date(now.getTime() + 11 * 60 * 1000));
    const crashStatus = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, crashTask.value.taskId)).limit(1))[0]?.status;
    strictEqual(crashStatus, 'failed');
    if (swept.failed < 1) throw new Error('Crash-after-reserve sweep did not settle the overdue task.');

    const taskCount = (await database.pool.query('select count(*)::int as count from app.generation_tasks where workspace_id = $1::uuid', [workspaceId]) as {rows: Array<{count: number}>}).rows[0]?.count;
    const attemptCount = (await database.pool.query('select count(*)::int as count from app.submission_attempts where workspace_id = $1::uuid', [workspaceId]) as {rows: Array<{count: number}>}).rows[0]?.count;
    const assetCount = (await database.db.select({id: assets.id}).from(assets).where(eq(assets.workspaceId, workspaceId))).length;
    console.log(JSON.stringify({status: 'PASS', cancelClaimWinnerCount: cancelFulfilled.length, cancelClaimStatus: cancelStatus, terminalStatuses, terminalStatus: terminalRow?.status, reservation: terminalReservation?.status, attempts: attempts.length, deadlineSuccessFence: {successFirst: [successFirstResult.value.status, successFirstLateDeadline.value.status], deadlineFirst: [deadlineFirstResult.value.status, deadlineFirstLateSuccess.value.status], lateSuccessQuarantined: true}, crashAfterReserve: crashStatus, taskCount, attemptCount, assetCount}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
