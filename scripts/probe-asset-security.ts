import assert from 'node:assert/strict';
import {execFile as execFileCallback} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {env as runtimeEnv, loadEnvFile} from 'node:process';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';

import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

import {createDatabase, type DatabaseHandle} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {assets} from '../src/db/schema/asset.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {outboxEvents} from '../src/db/schema/credit.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {getServerEnv} from '../src/config/env.ts';
import {writePrivateObject, resolveLocalObjectPath} from '../src/adapters/storage/local.ts';
import {authorizeAsset, deleteAsset} from '../src/modules/assets/authorize.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {claimOutbox} from '../src/modules/generation/outbox.ts';
import {cancelGenerationTask, claimDispatch, markGenerationMaterializing, recordProviderSubmission, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';

if (existsSync(resolve('.env.local'))) loadEnvFile(resolve('.env.local'));

const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();
const owner = {userId: 'asset-security-owner'};
const creator = {userId: 'asset-security-creator'};
const member = {userId: 'asset-security-member'};
const now = new Date();
const quote = createServerQuote(DEFAULT_MODEL_ID, '1', {now});
const execFile = promisify(execFileCallback);

async function expectDomainError(action: () => Promise<unknown>, code: DomainError['code']): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof DomainError && error.code === code);
}

function barrier(): {promise: Promise<void>; resolve: () => void} {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return {promise, resolve: release};
}

async function isolatedDatabase(): Promise<{database: DatabaseHandle; admin: Client; name: string; connectionString: string}> {
  const name = `shpitto_asset_security_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const databaseUrl = getServerEnv().databaseUrl;
  const configured = databaseUrl ? new URL(databaseUrl) : null;
  if (configured) configured.pathname = '/postgres';
  const urls = [...new Set([configured?.toString(), 'postgres://postgres@127.0.0.1:55432/postgres'].filter(Boolean))];
  for (const connectionString of urls) {
    const admin = new Client({connectionString});
    try {
      await admin.connect();
      await admin.query(`create database "${name}"`);
    } catch {
      await admin.end().catch(() => undefined);
      continue;
    }
    const url = new URL(connectionString!);
    url.pathname = `/${name}`;
    return {database: createDatabase({connectionString: url.toString(), application_name: 'asset-security-probe'}), admin, name, connectionString: url.toString()};
  }
  throw new Error('No local PostgreSQL endpoint could create the disposable asset security database.');
}

async function waitForBlockedAsset(database: DatabaseHandle, settled: () => boolean, table = 'assets'): Promise<boolean> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (settled()) return false;
    const result = await database.pool.query<{blocked: boolean}>(
      `select exists(select 1 from pg_stat_activity where datname = current_database()
       and application_name = 'asset-security-probe' and wait_event_type = 'Lock'
       and query like $1) as blocked`, [`%"${table}"%`],
    );
    if (result.rows[0]?.blocked) return true;
    await delay(10);
  }
  return false;
}

async function run(): Promise<void> {
  const {database, admin, name, connectionString} = await isolatedDatabase();
  const root = await mkdtemp(join(tmpdir(), 'shpitto-asset-security-'));
  const results: Array<{name: string; status: 'PASS' | 'FAIL'; error?: string}> = [];
  const check = async (label: string, work: () => Promise<void>) => {
    try { await work(); results.push({name: label, status: 'PASS'}); }
    catch (error) { results.push({name: label, status: 'FAIL', error: error instanceof Error ? error.message : String(error)}); }
  };
  try {
    await migrate(database.db, {migrationsFolder: resolve('src/db/migrations')});
    for (const actor of [owner, creator, member]) {
      await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $2, true, $3, $3)`, [actor.userId, `${actor.userId}@example.test`, now]);
    }
    await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1, 'team', 'Asset security', $3, $4, $4), ($2, 'team', 'Foreign asset security', $3, $4, $4)`, [workspaceId, foreignWorkspaceId, owner.userId, now]);
    for (const actor of [owner, creator, member]) {
      await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1, $2, $3, $4)`, [workspaceId, actor.userId, actor === owner ? 'owner' : 'member', now]);
    }
    await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1, $2, 'owner', $3)`, [foreignWorkspaceId, owner.userId, now]);
    await database.pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1, 'active', 1, $2, $2)`, [workspaceId, now]);
    await database.pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1, 0, $2, $2)`, [workspaceId, now]);
    await issueGrant(database.db, {actorUserId: owner.userId, workspaceId, commandName: 'probe.asset-security-grant', commandKey: 'asset-security-grant', businessKey: 'asset-security-grant', source: 'manual', amount: 1000n, payload: {amount: '1000'}});

    async function seedAsset(purpose = 'output') {
      const id = randomUUID();
      const objectKey = `workspaces/${workspaceId}/inputs/${id}.png`;
      await writePrivateObject(root, objectKey, new Uint8Array([1, 2, 3]));
      await database.db.insert(assets).values({id, workspaceId, purpose, state: 'ready', objectKey, createdBy: creator.userId, createdAt: now, updatedAt: now});
      return {id, objectKey};
    }

    await check('same-workspace member may download but may not delete another creator asset', async () => {
      const asset = await seedAsset();
      assert.equal((await authorizeAsset(database.db, workspaceId, asset.id, member)).id, asset.id);
      await expectDomainError(() => deleteAsset(database.db, workspaceId, asset.id, member, root), 'FORBIDDEN');
      assert.equal((await authorizeAsset(database.db, workspaceId, asset.id, member)).state, 'ready');
      assert.equal(existsSync(resolveLocalObjectPath(root, asset.objectKey)), true);
    });
    await check('current owner and recorded creator may delete', async () => {
      for (const actor of [owner, creator]) {
        const asset = await seedAsset();
        await deleteAsset(database.db, workspaceId, asset.id, actor, root);
        assert.equal((await database.db.select().from(assets).where(eq(assets.id, asset.id)))[0]?.state, 'deleted');
        assert.equal(existsSync(resolveLocalObjectPath(root, asset.objectKey)), false);
      }
    });
    await check('foreign workspace and removed creator cannot delete', async () => {
      const asset = await seedAsset();
      await expectDomainError(() => deleteAsset(database.db, foreignWorkspaceId, asset.id, owner, root), 'NOT_FOUND');
      await database.pool.query('delete from app.workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, creator.userId]);
      try { await expectDomainError(() => deleteAsset(database.db, workspaceId, asset.id, creator, root), 'FORBIDDEN'); }
      finally { await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1, $2, 'member', $3)`, [workspaceId, creator.userId, now]); }
      assert.equal(existsSync(resolveLocalObjectPath(root, asset.objectKey)), true);
    });

    await check('creation winning the input lock prevents concurrent deletion', async () => {
      const asset = await seedAsset('input');
      const entered = barrier();
      const release = barrier();
      const creation = createGenerationTask(database.db, {
        actor: owner, workspaceId, idempotencyKey: 'asset-security-create-first', quote,
        input: {assetId: asset.id, assetWorkspaceId: workspaceId, assetState: 'ready'}, now,
        authorizeReadyInput: async (tx, actor, scope, input) => {
          await authorizeAsset(tx, scope, input.assetId!, actor);
          entered.resolve();
          await release.promise;
        },
      });
      await entered.promise;
      let settled = false;
      const deletion = deleteAsset(database.db, workspaceId, asset.id, creator, root).then(() => null, (error: unknown) => error).finally(() => { settled = true; });
      let blocked: boolean;
      try { blocked = await waitForBlockedAsset(database, () => settled); }
      finally { release.resolve(); }
      await creation;
      const error = await deletion;
      assert.equal(blocked, true, 'Deletion must wait for input acceptance to commit.');
      assert.ok(error instanceof DomainError && error.code === 'CONFLICT');
      assert.equal(existsSync(resolveLocalObjectPath(root, asset.objectKey)), true);
    });

    await check('deletion winning the input lock prevents stale task creation', async () => {
      const asset = await seedAsset('input');
      const blocker = new Client({connectionString});
      await blocker.connect();
      await blocker.query('begin');
      await blocker.query(`update app.assets set state = 'deleted' where id = $1`, [asset.id]);
      let settled = false;
      const creation = createGenerationTask(database.db, {
        actor: owner, workspaceId, idempotencyKey: 'asset-security-delete-first', quote,
        input: {assetId: asset.id, assetWorkspaceId: workspaceId, assetState: 'ready'}, now,
        authorizeReadyInput: async (tx, actor, scope, input) => { await authorizeAsset(tx, scope, input.assetId!, actor); },
      }).then(() => null, (error: unknown) => error).finally(() => { settled = true; });
      let blocked: boolean;
      try { blocked = await waitForBlockedAsset(database, () => settled); }
      finally { await blocker.query('commit'); await blocker.end(); }
      const error = await creation;
      assert.equal(blocked, true, 'Creation must wait for the pending asset deletion.');
      assert.ok(error instanceof DomainError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code));
      const tasks = await database.pool.query<{count: number}>(`select count(*)::int as count from app.generation_tasks where input_snapshot->>'assetId' = $1`, [asset.id]);
      assert.equal(tasks.rows[0]?.count, 0);
    });

    await check('an output reused as task input retains the same active-reference protection', async () => {
      const asset = await seedAsset('output');
      await createGenerationTask(database.db, {
        actor: owner, workspaceId, idempotencyKey: 'asset-security-reused-output', quote,
        input: {assetId: asset.id, assetWorkspaceId: workspaceId, assetState: 'ready'}, now,
        authorizeReadyInput: async (tx, actor, scope, input) => { await authorizeAsset(tx, scope, input.assetId!, actor); },
      });
      await expectDomainError(() => deleteAsset(database.db, workspaceId, asset.id, creator, root), 'CONFLICT');
      assert.equal(existsSync(resolveLocalObjectPath(root, asset.objectKey)), true);
    });

    await check('stale materialization lease cannot spend retries or disrupt its successor', async () => {
      const task = await createGenerationTask(database.db, {actor: owner, workspaceId, idempotencyKey: 'asset-security-stale-lease', quote, input: {prompt: 'stale materialization lease'}, now});
      await database.db.update(generationTasks).set({status: 'materializing'}).where(eq(generationTasks.id, task.value.taskId));
      const eventType = 'probe.asset-security';
      await database.db.insert(outboxEvents).values({id: randomUUID(), workspaceId, eventType, aggregateId: task.value.taskId, businessKey: randomUUID(), payload: {taskId: task.value.taskId}, availableAt: now, createdAt: now});
      const stale = await claimOutbox(database.db, 'stale-owner', now, {workspaceId, eventType});
      const reclaimAt = new Date(now.getTime() + 60_001);
      const current = await claimOutbox(database.db, 'current-owner', reclaimAt, {workspaceId, eventType});
      assert.ok(stale && current);
      const bytes = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
      const input = {actorUserId: owner.userId, workspaceId, taskId: task.value.taskId, root, bytes, mime: 'video/mp4', now: reclaimAt};
      await expectDomainError(() => materializeOutput(database.db, {...input, outboxLease: stale}), 'CONFLICT');
      const rejected = (await database.db.select().from(generationTasks).where(eq(generationTasks.id, task.value.taskId)))[0];
      assert.equal(rejected?.materializationAttempts, 0, 'Stale work must not consume a materialization attempt.');
      await materializeOutput(database.db, {...input, outboxLease: current});
      const accepted = (await database.db.select().from(generationTasks).where(eq(generationTasks.id, task.value.taskId)))[0];
      assert.equal(accepted?.materializationAttempts, 1);
      assert.equal((await database.db.select().from(assets).where(eq(assets.taskId, task.value.taskId))).length, 1);
    });

    for (const table of ['generation_tasks', 'outbox_events']) {
      await check(`lease expiry while awaiting ${table} lock cannot spend retries`, async () => {
        const startedAt = new Date();
        const task = await createGenerationTask(database.db, {actor: owner, workspaceId, idempotencyKey: `asset-security-wait-${table}`, quote, input: {prompt: 'blocked materialization lease'}, now: startedAt});
        await database.db.update(generationTasks).set({status: 'materializing'}).where(eq(generationTasks.id, task.value.taskId));
        const eventType = `probe.asset-security-${table}`;
        const eventId = randomUUID();
        await database.db.insert(outboxEvents).values({id: eventId, workspaceId, eventType, aggregateId: task.value.taskId, businessKey: randomUUID(), payload: {taskId: task.value.taskId}, availableAt: startedAt, createdAt: startedAt});
        const lease = await claimOutbox(database.db, 'waiting-owner', startedAt, {workspaceId, eventType});
        assert.ok(lease);
        const expiresAt = new Date(Date.now() + 300);
        await database.db.update(outboxEvents).set({leaseUntil: expiresAt}).where(eq(outboxEvents.id, eventId));
        const blocker = new Client({connectionString});
        await blocker.connect();
        await blocker.query('begin');
        await blocker.query(`select id from app.${table} where id = $1 for update`, [table === 'generation_tasks' ? task.value.taskId : eventId]);
        let settled = false;
        const bytes = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
        const materialization = materializeOutput(database.db, {actorUserId: owner.userId, workspaceId, taskId: task.value.taskId, root, bytes, mime: 'video/mp4', outboxLease: lease})
          .then(() => null, (error: unknown) => error).finally(() => { settled = true; });
        let blocked: boolean;
        try {
          blocked = await waitForBlockedAsset(database, () => settled, table);
          await delay(Math.max(0, expiresAt.getTime() - Date.now() + 20));
        } finally { await blocker.query('commit'); await blocker.end(); }
        const error = await materialization;
        assert.equal(blocked, true, 'The regression must cross lease expiry while blocked on the intended row.');
        assert.ok(error instanceof DomainError && error.code === 'CONFLICT');
        const row = (await database.db.select().from(generationTasks).where(eq(generationTasks.id, task.value.taskId)))[0];
        assert.equal(row?.materializationAttempts, 0, 'Expired work must not consume a materialization attempt after a lock wait.');
      });
    }

    await check('publication cannot commit after an asset foreign-key lock crosses the deadline', async () => {
      const task = await createGenerationTask(database.db, {actor: owner, workspaceId, idempotencyKey: 'asset-security-publication-clock', quote, input: {prompt: 'blocked publication'}, now: new Date()});
      const taskId = task.value.taskId;
      const deadlineAt = new Date(Date.now() + 1_500);
      await database.db.update(generationTasks).set({status: 'materializing', deadlineAt}).where(eq(generationTasks.id, taskId));
      const blocker = new Client({connectionString});
      await blocker.connect();
      await blocker.query('begin');
      await blocker.query('select id from app.workspaces where id = $1 for update', [workspaceId]);
      let settled = false;
      const bytes = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
      const materialization = materializeOutput(database.db, {actorUserId: owner.userId, workspaceId, taskId, root, bytes, mime: 'video/mp4'})
        .then(() => null, (error: unknown) => error).finally(() => { settled = true; });
      let blocked: boolean;
      try {
        blocked = await waitForBlockedAsset(database, () => settled);
        await delay(Math.max(0, deadlineAt.getTime() - Date.now() + 20));
      } finally { await blocker.query('commit'); await blocker.end(); }
      const error = await materialization;
      assert.equal(blocked, true, 'Publication must reach the workspace foreign-key lock.');
      assert.ok(error instanceof DomainError && error.code === 'CONFLICT');
      assert.equal((await database.db.select().from(assets).where(eq(assets.taskId, taskId))).length, 0);
    });

    const lifecycleCases = [
      {action: 'dispatch', table: 'credit_accounts', leaseOnly: false},
      {action: 'cancel', table: 'credit_accounts', leaseOnly: false},
      {action: 'success', table: 'credit_accounts', leaseOnly: false},
      {action: 'success', table: 'generation_tasks', leaseOnly: false},
      {action: 'success', table: 'credit_reservations', leaseOnly: false},
      {action: 'success', table: 'outbox_events', leaseOnly: false},
      {action: 'success', table: 'credit_reservations', leaseOnly: true},
    ] as const;
    for (const {action, table, leaseOnly} of lifecycleCases) {
      await check(`${action} resamples its ${leaseOnly ? 'lease expiry' : 'deadline'} after the ${table} lock`, async () => {
        const key = `asset-security-${action}-${table}-${leaseOnly ? 'lease' : 'deadline'}`;
        const task = await createGenerationTask(database.db, {actor: owner, workspaceId, idempotencyKey: key, quote, input: {prompt: key}, now: new Date()});
        const taskId = task.value.taskId;
        if (action === 'success') {
          const claimed = await claimDispatch(database.db, {actor: owner, workspaceId, taskId, idempotencyKey: `${key}-claim`});
          await recordProviderSubmission(database.db, {actor: owner, workspaceId, taskId, attemptId: claimed.value.attemptId, providerRequestId: key, idempotencyKey: `${key}-submit`, internalWorker: true});
          await markGenerationMaterializing(database.db, {actor: owner, workspaceId, taskId, attemptId: claimed.value.attemptId, idempotencyKey: `${key}-materializing`, internalWorker: true});
          await materializeOutput(database.db, {actorUserId: owner.userId, workspaceId, taskId, root, bytes: new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4'))), mime: 'video/mp4'});
        }
        const leaseAt = new Date();
        const eventId = randomUUID();
        await database.db.insert(outboxEvents).values({id: eventId, workspaceId, eventType: key, aggregateId: taskId, businessKey: randomUUID(), payload: {taskId}, availableAt: leaseAt, createdAt: leaseAt});
        const lease = await claimOutbox(database.db, 'lifecycle-wait-owner', leaseAt, {workspaceId, eventType: key});
        assert.ok(lease);
        const reservation = (await database.pool.query<{id: string}>('select id from app.credit_reservations where task_id = $1', [taskId])).rows[0]!;
        const deadlineAt = new Date(Date.now() + 500);
        if (leaseOnly) await database.db.update(outboxEvents).set({leaseUntil: deadlineAt}).where(eq(outboxEvents.id, eventId));
        else await database.db.update(generationTasks).set({deadlineAt}).where(eq(generationTasks.id, taskId));
        const blocker = new Client({connectionString});
        await blocker.connect();
        await blocker.query('begin');
        const id = table === 'credit_accounts' ? workspaceId : table === 'generation_tasks' ? taskId : table === 'credit_reservations' ? reservation.id : eventId;
        await blocker.query(`select ${table === 'credit_accounts' ? 'workspace_id' : 'id'} from app.${table} where ${table === 'credit_accounts' ? 'workspace_id' : 'id'} = $1 for update`, [id]);
        let settled = false;
        const common = {actor: owner, workspaceId, taskId, idempotencyKey: `${key}-transition`, outboxLease: lease};
        const operation = (action === 'dispatch' ? claimDispatch(database.db, common)
          : action === 'cancel' ? cancelGenerationTask(database.db, common)
            : settleGenerationTask(database.db, {...common, outcome: 'succeeded', internalWorker: true, providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}}))
          .then(() => null, (error: unknown) => error).finally(() => { settled = true; });
        let blocked: boolean;
        try {
          blocked = await waitForBlockedAsset(database, () => settled, table);
          await delay(Math.max(0, deadlineAt.getTime() - Date.now() + 20));
        } finally { await blocker.query('commit'); await blocker.end(); }
        const error = await operation;
        assert.equal(blocked, true, 'The transition must reach the held domain row.');
        assert.ok(error instanceof DomainError && error.code === 'CONFLICT');
        assert.equal((await database.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)))[0]?.status, action === 'success' ? 'materializing' : 'queued');
        assert.equal((await database.pool.query<{status: string}>('select status from app.credit_reservations where id = $1', [reservation.id])).rows[0]?.status, 'active');
      });
    }

    for (const phase of ['materialization', 'settlement']) {
    await check(`actual worker resamples deadline after ${phase} lock waits`, async () => {
      await database.db.update(outboxEvents).set({status: 'published'}).where(eq(outboxEvents.eventType, 'generation.dispatch'));
      const startedAt = new Date();
      const task = await createGenerationTask(database.db, {actor: owner, workspaceId, idempotencyKey: `asset-security-worker-clock-${phase}`, quote, input: {prompt: 'real worker clock'}, now: startedAt});
      const taskId = task.value.taskId;
      const claim = await claimDispatch(database.db, {actor: owner, workspaceId, taskId, idempotencyKey: `asset-security-worker-claim-${phase}`, now: startedAt});
      await recordProviderSubmission(database.db, {actor: owner, workspaceId, taskId, attemptId: claim.value.attemptId, providerRequestId: `asset-security-worker-provider-${phase}`, idempotencyKey: `asset-security-worker-submit-${phase}`, internalWorker: true, now: startedAt});
      await markGenerationMaterializing(database.db, {actor: owner, workspaceId, taskId, attemptId: claim.value.attemptId, idempotencyKey: `asset-security-worker-materializing-${phase}`, internalWorker: true, now: startedAt});
      if (phase === 'settlement') await materializeOutput(database.db, {actorUserId: owner.userId, workspaceId, taskId, root, bytes: new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4'))), mime: 'video/mp4'});
      const deadlineAt = new Date(Date.now() + 1_500);
      await database.db.update(generationTasks).set({deadlineAt}).where(eq(generationTasks.id, taskId));
      const blocker = new Client({connectionString});
      await blocker.connect();
      await blocker.query('begin');
      const table = phase === 'settlement' ? 'credit_accounts' : 'generation_tasks';
      await blocker.query(table === 'credit_accounts' ? 'select workspace_id from app.credit_accounts where workspace_id = $1 for update' : 'select id from app.generation_tasks where id = $1 for update', [table === 'credit_accounts' ? workspaceId : taskId]);
      const workerUrl = new URL(connectionString);
      workerUrl.searchParams.set('application_name', 'asset-security-probe');
      let settled = false;
      const execution = execFile(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
        import {processLocalWorkerOnce} from './scripts/local-worker.ts';
        import {DomainError} from './src/db/contracts.ts';
        try {
          await processLocalWorkerOnce({workspaceId: '${workspaceId}', runSweep: false});
          throw new Error('Worker must reject materialization after its deadline.');
        } catch (error) {
          if (!(error instanceof DomainError) || error.code !== 'CONFLICT') throw error;
        }
      `], {cwd: process.cwd(), env: {...runtimeEnv, DATABASE_URL: workerUrl.toString(), ASSET_ROOT: root, NODE_ENV: 'test', GENERATION_DRIVER: 'mock', STORAGE_DRIVER: 'local'}, timeout: 15_000, maxBuffer: 16_384, windowsHide: true})
        .then(() => null, (error: unknown) => error).finally(() => { settled = true; });
      let blocked: boolean;
      try {
        blocked = await waitForBlockedAsset(database, () => settled, table);
        await delay(Math.max(0, deadlineAt.getTime() - Date.now() + 20));
      } finally { await blocker.query('commit'); await blocker.end(); }
      const error = await execution;
      assert.equal(error, null);
      assert.equal(blocked, true, 'Actual worker must reach the held materialization task row.');
      const row = (await database.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)))[0];
      assert.equal(row?.materializationAttempts, phase === 'settlement' ? 1 : 0, 'Normal worker execution must not freeze the pre-lock wall clock.');
      assert.equal(row?.status, 'materializing');
      assert.equal((await database.pool.query<{status: string}>('select status from app.credit_reservations where task_id = $1', [taskId])).rows[0]?.status, 'active');
      assert.equal((await database.db.select().from(assets).where(eq(assets.taskId, taskId))).length, phase === 'settlement' ? 1 : 0);
    });
    }
    console.log(JSON.stringify({status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL', isolated: true, results}));
    assert.equal(results.filter((result) => result.status === 'FAIL').length, 0, 'Asset security regressions failed.');
  } finally {
    await database.pool.end();
    await admin.query(`drop database "${name}"`);
    await admin.end();
    await rm(root, {recursive: true, force: true});
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
