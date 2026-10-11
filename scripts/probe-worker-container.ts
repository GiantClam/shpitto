import {resolve} from 'node:path';
import {strict as assert} from 'node:assert';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {and, eq} from 'drizzle-orm';

import {getServerEnv} from '../src/config/env.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';

const userId = 'probe-worker-container-user';
const workspaceId = '00000000-0000-4000-8000-000000000926';
const now = new Date();

async function migrateDatabase(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  try {
    await migrate(drizzle(client), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  } finally {
    await client.end();
  }
}

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  for (const table of ['assets', 'submission_attempts', 'command_results', 'outbox_events', 'audit_events', 'credit_ledger_entries', 'credit_allocations']) {
    await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  }
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = $1::uuid', [workspaceId]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) {
    await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  }
  await pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
  await pool.query('delete from "user" where id = $1', [userId]);
}

async function waitForContainerWorker(database: ReturnType<typeof createDatabase>, taskId: string): Promise<{status: string; assetState: string | null}> {
  const deadline = Date.now() + 30_000;
  let lastStatus = 'missing';
  let lastAssetState: string | null = null;
  while (Date.now() < deadline) {
    const task = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1))[0];
    const asset = (await database.db.select({state: assets.state}).from(assets).where(and(eq(assets.taskId, taskId), eq(assets.purpose, 'output'))).limit(1))[0];
    lastStatus = task?.status ?? 'missing';
    lastAssetState = asset?.state ?? null;
    if (lastStatus === 'succeeded' && lastAssetState === 'ready') return {status: lastStatus, assetState: lastAssetState};
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return {status: lastStatus, assetState: lastAssetState};
}

async function run(): Promise<void> {
  const env = getServerEnv();
  if (env.nodeEnv === 'production' || env.generationDriver !== 'mock' || env.storageDriver !== 'local') {
    throw new Error('Container worker probe requires a local Mock profile.');
  }
  await migrateDatabase();
  const database = createDatabase();
  try {
    await cleanup(database.pool);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Container Worker Probe', $2, true, $3, $3)`,
      [userId, `${userId}@example.test`, now],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'Container Worker Probe', $2, $3, $3)`,
      [workspaceId, userId, now],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $2, 'owner', $3)`,
      [workspaceId, userId, now],
    );
    await database.pool.query(
      `insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`,
      [workspaceId, now],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`,
      [workspaceId, now],
    );
    await issueGrant(database.db, {
      actorUserId: userId,
      workspaceId,
      commandName: 'probe.worker-container-grant',
      commandKey: 'grant',
      businessKey: 'probe-worker-container-grant',
      source: 'manual',
      amount: 100n,
      payload: {amount: '100'},
    });
    const created = await createGenerationTask(database.db, {
      actor: {userId},
      workspaceId,
      idempotencyKey: 'worker-container-create',
      quote: createServerQuote(DEFAULT_MODEL_ID, '2', {now}),
      input: {prompt: 'container worker smoke'},
      now,
    });
    const observed = await waitForContainerWorker(database, created.value.taskId);
    assert.deepEqual(observed, {status: 'succeeded', assetState: 'ready'}, `Docker worker did not finish: ${JSON.stringify(observed)}`);
    console.log(JSON.stringify({status: 'PASS', profile: 'local-docker-worker', taskId: created.value.taskId, observed}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
