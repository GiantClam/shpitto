import {resolve} from 'node:path';
import {deepStrictEqual, strictEqual} from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {assets} from '../src/db/schema/asset.ts';
import {generationQuarantine, generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {cancelGenerationTask, claimDispatch, markGenerationMaterializing, recordProviderSubmission, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';

/**
 * Local M3 repeatability evidence.
 *
 * The callback rows below are normalized provider observations from the local
 * Mock/domain boundary. M4 owns authenticated provider webhook inbox and
 * signature verification; this probe deliberately does not claim that path.
 */

const userId = 'probe-generation-replay-user';
const unrelatedUserId = 'probe-generation-replay-unrelated';
const workspaceId = '00000000-0000-4000-8000-000000000981';
const unrelatedWorkspaceId = '00000000-0000-4000-8000-000000000982';
const now = new Date('2026-09-29T08:00:00.000Z');
const actor = {userId};
const assetRoot = '.data/probe-generation-replay-assets';

type PoolLike = {query: (text: string, values?: unknown[]) => Promise<unknown>};

type NormalizedProviderEvent = Readonly<{
  eventId: string;
  providerRequestId: string;
  attemptId: string;
  status: 'succeeded' | 'failed';
  failureCode?: string;
  providerCostEvidence: Readonly<{state: 'known' | 'unknown'; minor?: string; currency?: string}>;
}>;

type FixtureSnapshot = Readonly<{
  tasks: string;
  reservations: string;
  grants: string;
  allocations: string;
  ledger: string;
  audit: string;
  outbox: string;
  grantState: string;
  accountVersion: string;
  outboxState: string;
}>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup(pool: PoolLike): Promise<void> {
  const workspaces = [workspaceId, unrelatedWorkspaceId];
  for (const table of [
    'generation_quarantine', 'submission_attempts', 'assets', 'command_results', 'outbox_events',
    'audit_events', 'credit_ledger_entries', 'credit_allocations',
  ]) {
    await pool.query(`delete from app.${table} where workspace_id = any($1::uuid[])`, [workspaces]);
  }
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = any($1::uuid[])', [workspaces]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) {
    await pool.query(`delete from app.${table} where workspace_id = any($1::uuid[])`, [workspaces]);
  }
  await pool.query('delete from app.workspaces where id = any($1::uuid[])', [workspaces]);
  await pool.query('delete from "user" where id = any($1::text[])', [[userId, unrelatedUserId]]);
}

async function workspaceSnapshot(pool: PoolLike, id: string): Promise<FixtureSnapshot> {
  const result = await pool.query(`
    select
      (select count(*)::text from app.generation_tasks where workspace_id = $1::uuid) as tasks,
      (select count(*)::text from app.credit_reservations where workspace_id = $1::uuid) as reservations,
      (select count(*)::text from app.credit_grants where workspace_id = $1::uuid) as grants,
      (select count(*)::text from app.credit_allocations where workspace_id = $1::uuid) as allocations,
      (select count(*)::text from app.credit_ledger_entries where workspace_id = $1::uuid) as ledger,
      (select count(*)::text from app.audit_events where workspace_id = $1::uuid) as audit,
      (select count(*)::text from app.outbox_events where workspace_id = $1::uuid) as outbox,
      coalesce((select string_agg(concat_ws(':', id::text, issued::text, available::text, reserved::text, consumed::text, expired::text, voided::text), ',' order by id) from app.credit_grants where workspace_id = $1::uuid), '') as "grantState",
      coalesce((select version::text from app.credit_accounts where workspace_id = $1::uuid), '') as "accountVersion",
      coalesce((select string_agg(concat_ws(':', business_key, status), ',' order by id) from app.outbox_events where workspace_id = $1::uuid), '') as "outboxState"
  `, [id]) as {rows: FixtureSnapshot[]};
  const snapshot = result.rows[0];
  if (!snapshot) throw new Error(`Could not snapshot workspace ${id}.`);
  return snapshot;
}

async function createFixture(database: ReturnType<typeof createDatabase>): Promise<void> {
  await database.pool.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, 'Generation Replay Probe', $2, true, $3, $3),
            ($4, 'Unrelated Replay Probe', $5, true, $3, $3)`,
    [userId, `${userId}@example.test`, now, unrelatedUserId, `${unrelatedUserId}@example.test`],
  );
  await database.pool.query(
    `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
     values ($1::uuid, 'personal', 'Generation Replay Probe', $2, $3, $3),
            ($4::uuid, 'personal', 'Unrelated Replay Probe', $5, $3, $3)`,
    [workspaceId, userId, now, unrelatedWorkspaceId, unrelatedUserId],
  );
  await database.pool.query(
    `insert into app.workspace_members (workspace_id, user_id, role, created_at)
     values ($1::uuid, $2, 'owner', $3), ($4::uuid, $5, 'owner', $3)`,
    [workspaceId, userId, now, unrelatedWorkspaceId, unrelatedUserId],
  );
  await database.pool.query(
    `insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at)
     values ($1::uuid, 'active', 1, $2, $2), ($3::uuid, 'active', 1, $2, $2)`,
    [workspaceId, now, unrelatedWorkspaceId],
  );
  await database.pool.query(
    `insert into app.credit_accounts (workspace_id, version, created_at, updated_at)
     values ($1::uuid, 0, $2, $2), ($3::uuid, 0, $2, $2)`,
    [workspaceId, now, unrelatedWorkspaceId],
  );
  await issueGrant(database.db, {
    actorUserId: userId,
    workspaceId,
    commandName: 'probe.replay-grant',
    commandKey: 'primary',
    businessKey: 'probe-generation-replay-primary-grant',
    source: 'manual',
    amount: 100n,
    payload: {amount: '100', fixture: 'primary'},
  });
  await issueGrant(database.db, {
    actorUserId: unrelatedUserId,
    workspaceId: unrelatedWorkspaceId,
    commandName: 'probe.replay-grant',
    commandKey: 'unrelated',
    businessKey: 'probe-generation-replay-unrelated-grant',
    source: 'manual',
    amount: 7n,
    payload: {amount: '7', fixture: 'unrelated'},
  });
}

function isConflict(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'CONFLICT';
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();

  const database = createDatabase({max: 12});
  try {
    await cleanup(database.pool);
    await createFixture(database);
    const unrelatedBefore = await workspaceSnapshot(database.pool, unrelatedWorkspaceId);
    const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});

    // Ten concurrent duplicate creates converge on one durable task/reservation.
    const createAttempts = await Promise.allSettled(Array.from({length: 10}, () => createGenerationTask(database.db, {
      actor,
      workspaceId,
      idempotencyKey: 'replay-concurrent-create',
      quote,
      input: {prompt: 'concurrent replay create'},
      now,
    })));
    const createFulfilled = createAttempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createGenerationTask>>> => result.status === 'fulfilled');
    assert(createFulfilled.length === 10, 'All duplicate generation creates should resolve or replay.');
    const createdTaskIds = new Set(createFulfilled.map((result) => result.value.value.taskId));
    strictEqual(createdTaskIds.size, 1);
    strictEqual(createFulfilled.filter((result) => !result.value.replayed).length, 1);
    strictEqual(createFulfilled.filter((result) => result.value.replayed).length, 9);
    const cancelledTaskId = createFulfilled[0]!.value.value.taskId;

    // Ten concurrent duplicate cancels release the same reservation once.
    const cancelAttempts = await Promise.allSettled(Array.from({length: 10}, () => cancelGenerationTask(database.db, {
      actor,
      workspaceId,
      taskId: cancelledTaskId,
      idempotencyKey: 'replay-concurrent-cancel',
      now,
    })));
    const cancelFulfilled = cancelAttempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof cancelGenerationTask>>> => result.status === 'fulfilled');
    assert(cancelFulfilled.length === 10, 'All duplicate generation cancels should resolve or replay.');
    strictEqual(cancelFulfilled.filter((result) => !result.value.replayed).length, 1);
    strictEqual(cancelFulfilled.filter((result) => result.value.replayed).length, 9);

    // Prepare one materializing task for normalized callback/domain observations.
    const callbackCreate = await createGenerationTask(database.db, {
      actor,
      workspaceId,
      idempotencyKey: 'replay-callback-create',
      quote,
      input: {prompt: 'normalized callback fixture'},
      now,
    });
    const callbackClaim = await claimDispatch(database.db, {
      actor,
      workspaceId,
      taskId: callbackCreate.value.taskId,
      idempotencyKey: 'replay-callback-claim',
      provider: 'mock',
      now,
    });
    await recordProviderSubmission(database.db, {
      actor,
      workspaceId,
      taskId: callbackCreate.value.taskId,
      attemptId: callbackClaim.value.attemptId,
      providerRequestId: 'mock-replay-provider-request',
      idempotencyKey: 'replay-callback-submit',
      internalWorker: true,
      now,
    });
    await markGenerationMaterializing(database.db, {
      actor,
      workspaceId,
      taskId: callbackCreate.value.taskId,
      attemptId: callbackClaim.value.attemptId,
      idempotencyKey: 'replay-callback-materialize',
      internalWorker: true,
      now,
    });
    const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/video/local-demo.mp4')));
    await materializeOutput(database.db, {
      actorUserId: userId,
      workspaceId,
      taskId: callbackCreate.value.taskId,
      root: assetRoot,
      bytes: fixture,
      mime: 'video/mp4',
      now,
    });

    const successEvent: NormalizedProviderEvent = {
      eventId: 'mock-replay-event-success',
      providerRequestId: 'mock-replay-provider-request',
      attemptId: callbackClaim.value.attemptId,
      status: 'succeeded',
      providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'},
    };
    const settleInput = (event: NormalizedProviderEvent, idempotencyKey: string) => settleGenerationTask(database.db, {
      actor,
      workspaceId,
      taskId: callbackCreate.value.taskId,
      idempotencyKey,
      outcome: event.status,
      failureCode: event.failureCode,
      providerCostEvidence: event.providerCostEvidence,
      internalWorker: true,
      now,
    });

    // Twenty normalized callback/domain deliveries: ten concurrent, ten reordered-key replays.
    const concurrentSettles = await Promise.allSettled(Array.from({length: 10}, () => settleInput(successEvent, 'replay-callback-event')));
    const settleFulfilled = concurrentSettles.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof settleGenerationTask>>> => result.status === 'fulfilled');
    assert(settleFulfilled.length === 10, 'All duplicate normalized success observations should resolve or replay.');
    strictEqual(settleFulfilled.filter((result) => !result.value.replayed).length, 1);
    strictEqual(settleFulfilled.filter((result) => result.value.replayed).length, 9);
    for (let replay = 0; replay < 10; replay += 1) {
      const reorderedEvidence = replay % 2 === 0
        ? {currency: 'USD', minor: '0', state: 'known' as const}
        : {state: 'known' as const, minor: '0', currency: 'USD'};
      const repeated = await settleGenerationTask(database.db, {
        actor,
        workspaceId,
        taskId: callbackCreate.value.taskId,
        idempotencyKey: 'replay-callback-event',
        outcome: 'succeeded',
        providerCostEvidence: reorderedEvidence,
        internalWorker: true,
        now,
      });
      assert(repeated.replayed, `Normalized callback replay ${replay + 11} did not replay.`);
    }

    // The same event key with a changed payload is a conflict, never a second effect.
    let conflictingPayloadRejected = false;
    try {
      await settleGenerationTask(database.db, {
        actor,
        workspaceId,
        taskId: callbackCreate.value.taskId,
        idempotencyKey: 'replay-callback-event',
        outcome: 'succeeded',
        providerCostEvidence: {state: 'known', minor: '1', currency: 'USD'},
        internalWorker: true,
        now,
      });
    } catch (error) {
      conflictingPayloadRejected = isConflict(error);
    }
    assert(conflictingPayloadRejected, 'A conflicting normalized callback payload must be rejected.');

    // Reordered late outcomes are retained as quarantine evidence, without reopening or rebilling.
    const lateFailure: NormalizedProviderEvent = {
      eventId: 'mock-replay-event-late-failure',
      providerRequestId: successEvent.providerRequestId,
      attemptId: successEvent.attemptId,
      status: 'failed',
      failureCode: 'mock.reordered.failure',
      providerCostEvidence: {state: 'unknown'},
    };
    const lateSuccess: NormalizedProviderEvent = {...successEvent, eventId: 'mock-replay-event-late-success'};
    const reorderedEvents = [lateFailure, lateSuccess] as const;
    const reorderedResults = [
      await settleInput(reorderedEvents[0], 'replay-late-failure'),
      await settleInput(reorderedEvents[1], 'replay-late-success'),
    ];
    deepStrictEqual(reorderedResults.map((result) => result.value.status).sort(), ['quarantined', 'quarantined']);

    const callbackTask = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, callbackCreate.value.taskId)).limit(1))[0];
    strictEqual(callbackTask?.status, 'succeeded');
    const callbackAttempts = await database.db.select({state: submissionAttempts.state}).from(submissionAttempts).where(eq(submissionAttempts.taskId, callbackCreate.value.taskId));
    deepStrictEqual(callbackAttempts.map((row) => row.state), ['succeeded']);
    const callbackReservations = await database.db.select({status: creditReservations.status}).from(creditReservations).where(eq(creditReservations.taskId, callbackCreate.value.taskId));
    deepStrictEqual(callbackReservations.map((row) => row.status), ['consumed']);
    const callbackAssets = await database.db.select({id: assets.id}).from(assets).where(eq(assets.taskId, callbackCreate.value.taskId));
    strictEqual(callbackAssets.length, 1);
    const quarantineRows = await database.db.select({eventKey: generationQuarantine.eventKey}).from(generationQuarantine).where(eq(generationQuarantine.taskId, callbackCreate.value.taskId));
    strictEqual(quarantineRows.length, 2);

    const terminalEffects = await database.pool.query<{status: string; count: string}>(
      `select status, count(*)::text as count from app.generation_tasks where workspace_id = $1::uuid group by status order by status`,
      [workspaceId],
    );
    deepStrictEqual(terminalEffects.rows, [{status: 'cancelled', count: '1'}, {status: 'succeeded', count: '1'}]);
    const financialEffects = await database.pool.query<{entry_type: string; count: string}>(
      `select entry_type, count(*)::text as count from app.credit_ledger_entries where workspace_id = $1::uuid group by entry_type order by entry_type`,
      [workspaceId],
    );
    deepStrictEqual(financialEffects.rows, [
      {entry_type: 'consume', count: '1'},
      {entry_type: 'grant_issued', count: '1'},
      {entry_type: 'release', count: '1'},
      {entry_type: 'reserve', count: '2'},
    ]);
    const unrelatedAfter = await workspaceSnapshot(database.pool, unrelatedWorkspaceId);
    deepStrictEqual(unrelatedAfter, unrelatedBefore);

    console.log(JSON.stringify({
      status: 'PASS',
      scope: 'M3 local Mock/domain repeatability',
      normalizedObservationFixture: 'local Mock/domain observations; authenticated provider webhook inbox deferred to M4',
      callbackReplayCount: 20,
      callbackInterleaving: '10 concurrent deliveries followed by 10 deterministic key-reordered sequential replays',
      concurrentGenerationAttempts: 10,
      concurrentCreateReplay: {attempts: 10, effects: 1, replays: 9},
      concurrentCancelReplay: {attempts: 10, effects: 1, replays: 9},
      concurrentSettleReplay: {attempts: 10, effects: 1, replays: 9},
      conflictingPayloadRejected,
      reorderedOutcomesQuarantined: reorderedResults.length,
      reorderedEventOrder: reorderedEvents.map((event) => event.eventId),
      terminalEffects: terminalEffects.rows,
      financialEffects: financialEffects.rows,
      callbackTaskAttempts: callbackAttempts.length,
      callbackTaskAssets: callbackAssets.length,
      unrelatedRecordsUnchanged: true,
      authenticatedWebhookInbox: 'NOT_RUN',
    }));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
