import {resolve} from 'node:path';
import {deepStrictEqual} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {auditEvents, outboxEvents} from '../src/db/schema/credit.ts';
import {commandResults} from '../src/db/schema/commands.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';

const userId = 'probe-generation-create-user';
const workspaceId = '00000000-0000-4000-8000-000000000921';
const now = new Date('2026-09-29T08:00:00.000Z');

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  await pool.query('delete from app.command_results where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.outbox_events where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.audit_events where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.generation_quarantine where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.submission_attempts where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.assets where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_ledger_entries where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_allocations where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_reservations where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.generation_tasks where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_grants where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_accounts where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.billing_accounts where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.workspace_members where workspace_id = $1::uuid', [workspaceId]);
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
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'Generation Probe', $2, true, $3, $3)`,
      [userId, `${userId}@example.test`, now],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
       values ($1::uuid, 'personal', 'Generation Probe', $2, $3, $3)`,
      [workspaceId, userId, now],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at)
       values ($1::uuid, $2, 'owner', $3)`,
      [workspaceId, userId, now],
    );
    await database.pool.query(
      `insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at)
       values ($1::uuid, 'active', 1, $2, $2)`,
      [workspaceId, now],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, version, created_at, updated_at)
       values ($1::uuid, 0, $2, $2)`,
      [workspaceId, now],
    );
    await issueGrant(database.db, {
      actorUserId: userId,
      workspaceId,
      commandName: 'probe.generation-grant',
      commandKey: 'grant',
      businessKey: 'probe-generation-grant',
      source: 'manual',
      amount: 100n,
      expiresAt: null,
      payload: {amount: '100'},
    });

    const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});
    const first = await createGenerationTask(database.db, {
      actor: {userId},
      workspaceId,
      idempotencyKey: 'generation-create-1',
      quote,
      input: {prompt: 'a durable local clip'},
      now,
    });
    const replay = await createGenerationTask(database.db, {
      actor: {userId},
      workspaceId,
      idempotencyKey: 'generation-create-1',
      quote,
      input: {prompt: 'a durable local clip'},
      now,
    });
    if (first.replayed || !replay.replayed || replay.value.taskId !== first.value.taskId) {
      throw new Error('Generation command replay did not return the original task.');
    }

    let conflictingReplay = false;
    try {
      await createGenerationTask(database.db, {
        actor: {userId},
        workspaceId,
        idempotencyKey: 'generation-create-1',
        quote,
        input: {prompt: 'a different clip'},
        now,
      });
    } catch (error) {
      conflictingReplay = error instanceof DomainError && error.code === 'CONFLICT';
    }
    if (!conflictingReplay) throw new Error('Reusing an idempotency key for a different input must conflict.');

    await database.pool.query(`update app.billing_accounts set status = 'hold' where workspace_id = $1::uuid`, [workspaceId]);
    let billingHoldRejected = false;
    try {
      await createGenerationTask(database.db, {
        actor: {userId},
        workspaceId,
        idempotencyKey: 'generation-create-held',
        quote,
        input: {prompt: 'blocked while held'},
        now,
      });
    } catch (error) {
      billingHoldRejected = error instanceof DomainError && error.code === 'FORBIDDEN';
    }
    await database.pool.query(`update app.billing_accounts set status = 'active' where workspace_id = $1::uuid`, [workspaceId]);
    if (!billingHoldRejected) throw new Error('Billing hold must reject a new generation before reserving credits.');

    let untrustedAssetRejected = false;
    try {
      await createGenerationTask(database.db, {
        actor: {userId},
        workspaceId,
        idempotencyKey: 'generation-create-asset-without-authorizer',
        quote,
        input: {assetId: '00000000-0000-4000-8000-000000000101', assetWorkspaceId: workspaceId, assetState: 'ready'},
        now,
      });
    } catch (error) {
      untrustedAssetRejected = error instanceof DomainError && error.code === 'FORBIDDEN';
    }
    if (!untrustedAssetRejected) throw new Error('Asset readiness must come from a trusted server resolver.');

    const taskRows = await database.db.select().from(generationTasks).where(eq(generationTasks.id, first.value.taskId));
    const reservationRows = await database.db.select().from(creditReservations).where(eq(creditReservations.taskId, first.value.taskId));
    const effects = await database.pool.query<{tasks: string; reservations: string; commands: string; outbox: string; audit: string}>(
      `select
        (select count(*)::text from app.generation_tasks where workspace_id = $1::uuid) as tasks,
        (select count(*)::text from app.credit_reservations where workspace_id = $1::uuid) as reservations,
        (select count(*)::text from app.command_results where workspace_id = $1::uuid) as commands,
        (select count(*)::text from app.outbox_events where workspace_id = $1::uuid and event_type = 'generation.dispatch') as outbox,
        (select count(*)::text from app.audit_events where workspace_id = $1::uuid and command_name = 'generation.create') as audit`,
      [workspaceId],
    );
    deepStrictEqual(effects.rows, [{tasks: '1', reservations: '1', commands: '1', outbox: '1', audit: '1'}]);
    if (taskRows[0]?.status !== 'queued' || reservationRows[0]?.taskId !== first.value.taskId) {
      throw new Error('Task and reservation were not atomically bound.');
    }

    console.log(JSON.stringify({status: 'PASS', taskId: first.value.taskId, reservationId: first.value.reservationId, replayed: replay.replayed, conflictingReplay, billingHoldRejected, untrustedAssetRejected}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
