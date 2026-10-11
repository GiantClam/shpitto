import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp, rm, symlink, utimes} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {deepStrictEqual, strictEqual} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {assets} from '../src/db/schema/asset.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {creditAccounts} from '../src/db/schema/workspace.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {authorizeAsset, createAssetDownloadToken, deleteAsset, verifyAssetDownloadToken} from '../src/modules/assets/authorize.ts';
import {uploadInputAsset} from '../src/modules/assets/upload.ts';
import {probePrivateMedia} from '../src/modules/assets/media-probe.ts';
import {deletePrivateObject, resolveLocalObjectPath, writePrivateObject} from '../src/adapters/storage/local.ts';
import {cleanupOrphanedAssetsDetailed} from '../src/modules/assets/cleanup.ts';

const execFile = promisify(execFileCallback);

const userA = 'probe-assets-a';
const userB = 'probe-assets-b';
const workspaceA = '00000000-0000-4000-8000-000000000941';
const workspaceB = '00000000-0000-4000-8000-000000000942';
const now = new Date('2026-09-29T08:00:00.000Z');
const actorA = {userId: userA};

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  for (const table of ['generation_quarantine', 'submission_attempts', 'assets', 'command_results', 'outbox_events', 'audit_events', 'credit_ledger_entries', 'credit_allocations']) {
    await pool.query(`delete from app.${table} where workspace_id in ($1::uuid, $2::uuid)`, [workspaceA, workspaceB]);
  }
  await pool.query('update app.credit_reservations set task_id = null where workspace_id in ($1::uuid, $2::uuid)', [workspaceA, workspaceB]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) {
    await pool.query(`delete from app.${table} where workspace_id in ($1::uuid, $2::uuid)`, [workspaceA, workspaceB]);
  }
  await pool.query('delete from app.workspaces where id in ($1::uuid, $2::uuid)', [workspaceA, workspaceB]);
  await pool.query('delete from "user" where id in ($1, $2)', [userA, userB]);
}

async function expectDomainError(action: () => Promise<unknown>, code: DomainError['code']): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DomainError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code} domain error.`);
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();
  const database = createDatabase();
  const root = await mkdtemp(join(tmpdir(), 'shpitto-assets-'));
  try {
    await cleanup(database.pool);
    await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Asset A', 'asset-a@example.test', true, $3, $3), ($2, 'Asset B', 'asset-b@example.test', true, $3, $3)`, [userA, userB, now]);
    await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'Assets A', $3, $4, $4), ($2::uuid, 'personal', 'Assets B', $5, $4, $4)`, [workspaceA, workspaceB, userA, now, userB]);
    await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $3, 'owner', $4), ($2::uuid, $5, 'owner', $4)`, [workspaceA, workspaceB, userA, now, userB]);
    for (const workspaceId of [workspaceA, workspaceB]) {
      await database.pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`, [workspaceId, now]);
      await database.pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`, [workspaceId, now]);
    }
    await issueGrant(database.db, {actorUserId: userA, workspaceId: workspaceA, commandName: 'probe.assets-grant', commandKey: 'assets-grant', businessKey: 'probe-assets-grant', source: 'manual', amount: 100n, payload: {amount: '100'}});

    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=', 'base64'));
    const uploaded = await uploadInputAsset(database.db, {actor: actorA, workspaceId: workspaceA, root, bytes: png, mime: 'image/png', now});
    await expectDomainError(() => authorizeAsset(database.db, workspaceB, uploaded.assetId, actorA), 'FORBIDDEN');
    await database.db.update(assets).set({state: 'quarantined'}).where(eq(assets.id, uploaded.assetId));
    await expectDomainError(() => authorizeAsset(database.db, workspaceA, uploaded.assetId, actorA), 'NOT_FOUND');
    await database.db.update(assets).set({state: 'ready'}).where(eq(assets.id, uploaded.assetId));
    const token = createAssetDownloadToken('probe-secret', workspaceA, uploaded.assetId, now);
    strictEqual(verifyAssetDownloadToken('probe-secret', token.token, workspaceA, uploaded.assetId, now), true);
    strictEqual(verifyAssetDownloadToken('probe-secret', token.token, workspaceA, uploaded.assetId, new Date(now.getTime() + 60_000)), false);
    strictEqual(verifyAssetDownloadToken('probe-secret', token.token, workspaceA, uploaded.assetId, new Date(now.getTime() + 60_001)), false);
    await expectDomainError(() => Promise.resolve(resolveLocalObjectPath(root, '../escape')), 'VALIDATION');

    const quote = createServerQuote(DEFAULT_MODEL_ID, '1', {now});
    const task = await createGenerationTask(database.db, {
      actor: actorA,
      workspaceId: workspaceA,
      idempotencyKey: 'assets-active-input-task',
      quote,
      input: {assetId: uploaded.assetId, assetWorkspaceId: workspaceA, assetState: 'ready'},
      authorizeReadyInput: async (tx, actor, workspaceId, input) => {
        await authorizeAsset(tx, workspaceId, input.assetId!, actor);
      },
      now,
    });
    await expectDomainError(() => deleteAsset(database.db, workspaceA, uploaded.assetId, actorA, root, now), 'CONFLICT');

    const recentOrphanId = randomUUID();
    const expiredOrphanId = randomUUID();
    const boundaryOrphanId = randomUUID();
    const retryOrphanId = randomUUID();
    const recentOrphanKey = `workspaces/${workspaceA}/orphans/${recentOrphanId}.png`;
    const expiredOrphanKey = `workspaces/${workspaceA}/orphans/${expiredOrphanId}.png`;
    const boundaryOrphanKey = `workspaces/${workspaceA}/orphans/${boundaryOrphanId}.png`;
    const retryOrphanKey = `workspaces/${workspaceA}/orphans/${retryOrphanId}.png`;
    const rowlessOrphanKey = `tasks/${task.value.taskId}/outputs/rowless-${randomUUID()}.mp4`;
    const foreignOrphanKey = `workspaces/${workspaceB}/orphans/${randomUUID()}.png`;
    await writePrivateObject(root, recentOrphanKey, png);
    await writePrivateObject(root, expiredOrphanKey, png);
    await writePrivateObject(root, boundaryOrphanKey, png);
    await writePrivateObject(root, retryOrphanKey, png);
    await writePrivateObject(root, rowlessOrphanKey, png);
    await writePrivateObject(root, foreignOrphanKey, png);
    const oldObjectTime = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    await Promise.all([expiredOrphanKey, boundaryOrphanKey, retryOrphanKey, rowlessOrphanKey, foreignOrphanKey].map((key) => utimes(resolve(root, key), oldObjectTime, oldObjectTime)));
    await database.pool.query(
      `insert into app.assets (id, workspace_id, task_id, purpose, state, object_key, created_by, mime, bytes, sha256, duration_ms, upload_expires_at, created_at, updated_at)
       values ($1::uuid, $3::uuid, null, 'output', 'pending', $4, $2, 'image/png', $5, $6, null, null, $7, $7),
              ($8::uuid, $3::uuid, null, 'output', 'pending', $9, $2, 'image/png', $5, $6, null, null, $10, $10),
              ($11::uuid, $3::uuid, null, 'output', 'pending', $12, $2, 'image/png', $5, $6, null, null, $13, $13),
              ($14::uuid, $3::uuid, null, 'output', 'pending', $15, $2, 'image/png', $5, $6, null, null, $16, $16)`,
      [recentOrphanId, userA, workspaceA, recentOrphanKey, png.byteLength, 'orphan', now, expiredOrphanId, expiredOrphanKey, new Date(now.getTime() - 25 * 60 * 60 * 1000), boundaryOrphanId, boundaryOrphanKey, new Date(now.getTime() - 24 * 60 * 60 * 1000), retryOrphanId, retryOrphanKey, new Date(now.getTime() - 25 * 60 * 60 * 1000)],
    );
    let failRetryOnce = true;
    const firstCleanup = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: workspaceA, root, now, deleteObject: async (storageRoot, objectKey) => {
      if (objectKey === retryOrphanKey && failRetryOnce) {
        failRetryOnce = false;
        throw new Error('simulated local delete failure');
      }
      await deletePrivateObject(storageRoot, objectKey);
    }});
    strictEqual(firstCleanup.deletedRows, 2, 'Expired and exact-boundary rows are collected at twenty-four hours.');
    strictEqual(firstCleanup.deletedObjects, 3, 'Two rows and one rowless materialization orphan are collected.');
    strictEqual(firstCleanup.failures.length, 1, 'A filesystem failure is reported for retry.');
    strictEqual(firstCleanup.failures[0]?.objectKey, retryOrphanKey);
    strictEqual(existsSync(resolve(root, recentOrphanKey)), true, 'A recent orphan object must remain available during recovery.');
    strictEqual(existsSync(resolve(root, expiredOrphanKey)), false, 'An expired orphan object must be collected after the retention window.');
    strictEqual(existsSync(resolve(root, boundaryOrphanKey)), false, 'The exact twenty-four-hour boundary is eligible.');
    strictEqual(existsSync(resolve(root, rowlessOrphanKey)), false, 'A rowless materialization orphan is collected after the grace period.');
    strictEqual(existsSync(resolve(root, retryOrphanKey)), true, 'A failed removal keeps its object for retry.');
    strictEqual((await database.pool.query<{count: number}>(`select count(*)::int as count from app.assets where id in ($1::uuid, $2::uuid)`, [retryOrphanId, recentOrphanId])).rows[0]?.count, 2, 'Recent and failed rows remain referenced.');
    const retryCleanup = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: workspaceA, root, now: new Date(now.getTime() + 2 * 60 * 60 * 1000)});
    strictEqual(retryCleanup.deletedRows, 1, 'A failed orphan is retried after its recorded retry delay.');
    strictEqual(retryCleanup.failures.length, 0);
    strictEqual(existsSync(resolve(root, retryOrphanKey)), false);
    const beforeBoundaryCleanup = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: workspaceA, root, now: new Date(now.getTime() + 23 * 60 * 60 * 1000)});
    strictEqual(beforeBoundaryCleanup.deletedRows, 0, 'The recent orphan remains before twenty-four hours.');
    const exactBoundaryCleanup = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: workspaceA, root, now: new Date(now.getTime() + 24 * 60 * 60 * 1000)});
    strictEqual(exactBoundaryCleanup.deletedRows, 1, 'The recent orphan is collected at exactly twenty-four hours.');
    strictEqual(existsSync(resolve(root, recentOrphanKey)), false);
    strictEqual(existsSync(resolve(root, foreignOrphanKey)), true, 'A foreign workspace orphan is never collected by this workspace sweep.');
    strictEqual((await database.pool.query<{count: number}>(`select count(*)::int as count from app.assets where id in ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, [recentOrphanId, expiredOrphanId, boundaryOrphanId, retryOrphanId])).rows[0]?.count, 0);
    strictEqual(existsSync(resolve(root, uploaded.objectKey)), true, 'An active input reference remains available.');

    const linkPath = join(root, 'link');
    let symlinkChecked = false;
    try {
      await symlink(root, linkPath, 'junction');
      symlinkChecked = true;
      await expectDomainError(() => Promise.resolve(writePrivateObject(root, 'link/escape.bin', new Uint8Array([1]))), 'FORBIDDEN');
    } catch (error) {
      if (!(error instanceof Error) || !/EPERM|EEXIST|operation not permitted/i.test(error.message)) throw error;
    }

    await execFile('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:d=0.2', '-an', '-c:v', 'mpeg4', '-y', join(root, 'probe-media.mp4')], {timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true});
    const mediaProbe = await probePrivateMedia(root, 'probe-media.mp4').catch((error) => error instanceof DomainError ? 'rejected' : (() => { throw error; })());
    const taskRow = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, task.value.taskId)).limit(1))[0];
    const assetRow = (await database.db.select({state: assets.state}).from(assets).where(eq(assets.id, uploaded.assetId)).limit(1))[0];
    if (typeof mediaProbe === 'string' || !mediaProbe.format.includes('mp4') || mediaProbe.durationMs === null || mediaProbe.durationMs <= 0) throw new Error(`Unexpected ffprobe result: ${JSON.stringify(mediaProbe)}`);
    deepStrictEqual({status: 'PASS', crossWorkspace: 'denied', tokenExpiry: 'denied', traversal: 'denied', activeInputDeletion: 'denied', symlink: symlinkChecked ? 'denied' : 'unavailable-on-host', task: taskRow?.status, asset: assetRow?.state}, {status: 'PASS', crossWorkspace: 'denied', tokenExpiry: 'denied', traversal: 'denied', activeInputDeletion: 'denied', symlink: symlinkChecked ? 'denied' : 'unavailable-on-host', task: 'queued', asset: 'ready'});
    console.log(JSON.stringify({status: 'PASS', crossWorkspace: 'denied', tokenExpiry: 'denied', traversal: 'denied', activeInputDeletion: 'denied', orphanRetention: {recentBefore24h: 'retained', exactBoundary: 'deleted', rowless: 'deleted', failedRemovalRetried: 'deleted', foreignWorkspace: 'retained'}, symlink: symlinkChecked ? 'denied' : 'unavailable-on-host', mediaProbe}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
    await rm(root, {recursive: true, force: true});
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
