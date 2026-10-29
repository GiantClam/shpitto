import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp, rm, symlink, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {cleanupOrphanedAssetsDetailed, MAX_ORPHAN_SCAN_OBJECTS} from '../src/modules/assets/cleanup.ts';
import {deletePrivateObject, writePrivateObject} from '../src/adapters/storage/local.ts';

const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();
const userId = `probe-cleanup-${randomUUID()}`;
const runtimeEnv = globalThis.process['env'];
const now = new Date();
const old = new Date(now.getTime() - 25 * 60 * 60 * 1_000);

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  try {
    await migrate(drizzle(migrationClient), {migrationsFolder: resolve('src/db/migrations')});
  } finally {
    await migrationClient.end();
  }
  const database = createDatabase();
  const root = await mkdtemp(join(tmpdir(), 'shpitto-cleanup-'));
  const external = await mkdtemp(join(tmpdir(), 'shpitto-cleanup-external-'));
  const prefix = `workspaces/${workspaceId}`;
  const retained = `${prefix}/0-retained`;
  const target = `${prefix}/a/orphan.bin`;
  try {
    await database.pool.query('insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $2, true, $3, $3)', [userId, `${userId}@example.test`, now]);
    await database.pool.query("insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1, 'team', 'Cleanup probe', $3, $4, $4), ($2, 'team', 'Foreign cleanup probe', $3, $4, $4)", [workspaceId, foreignWorkspaceId, userId, now]);
    // Exactly one full scan page of recent files must not starve an older file.
    for (let i = 0; i < MAX_ORPHAN_SCAN_OBJECTS - 1; i += 1) {
      await writePrivateObject(root, `${retained}/${String(i).padStart(4, '0')}.bin`, new Uint8Array([1]));
    }
    // The page ends at a.txt; the sibling a/ directory sorts after that file.
    await writePrivateObject(root, `${prefix}/a.txt`, new Uint8Array([1]));
    await writePrivateObject(root, target, new Uint8Array([1]));
    await utimes(resolve(root, target), old, old);
    const first = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId, root, now});
    assert.equal(first.scannedObjects, MAX_ORPHAN_SCAN_OBJECTS);
    assert.equal(first.deletedObjects, 0);
    assert.equal(existsSync(resolve(root, target)), true);

    // A fresh process must resume after the retained page, not repeat it.
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import {createDatabase} from './src/db/client.ts';
      import {cleanupOrphanedAssetsDetailed} from './src/modules/assets/cleanup.ts';
      const runtimeEnv = globalThis.process['env'];
      const database = createDatabase();
      try {
        const report = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: runtimeEnv.CLEANUP_PROBE_WORKSPACE, root: runtimeEnv.CLEANUP_PROBE_ROOT, now: new Date(runtimeEnv.CLEANUP_PROBE_NOW)});
        if (report.deletedObjects !== 1 || report.scannedObjects > 1000) throw new Error('Retained files starved a later orphan after restart.');
      } finally { await database.pool.end(); }
    `], {cwd: process.cwd(), env: {...runtimeEnv, CLEANUP_PROBE_WORKSPACE: workspaceId, CLEANUP_PROBE_ROOT: root, CLEANUP_PROBE_NOW: now.toISOString()}, encoding: 'utf8', timeout: 30_000, maxBuffer: 32_768, windowsHide: true});
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.equal(existsSync(resolve(root, target)), false);

    // A new object behind the cursor is seen on the next complete cycle.
    const behind = `${prefix}/0-new-orphan.bin`;
    await writePrivateObject(root, behind, new Uint8Array([1]));
    await utimes(resolve(root, behind), old, old);
    let failed = false;
    const failure = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId, root, now, deleteObject: async (storageRoot, key) => {
      if (key === behind) { failed = true; throw new Error('simulated cleanup removal failure'); }
      await deletePrivateObject(storageRoot, key);
    }});
    assert.equal(failed, true);
    assert.equal(failure.failures.length, 1);
    assert.equal(existsSync(resolve(root, behind)), true);
    for (let i = 0; i < 3 && existsSync(resolve(root, behind)); i += 1) await cleanupOrphanedAssetsDetailed(database.db, {workspaceId, root, now});
    assert.equal(existsSync(resolve(root, behind)), false, 'A failed object is retried after scan wrap.');
    assert.equal(existsSync(resolve(root, `${retained}/0000.bin`)), true);

    // Global references protect a key even if the referencing row has another tenant.
    const referenced = `${prefix}/0-referenced.bin`;
    const foreign = `workspaces/${foreignWorkspaceId}/orphan.bin`;
    await writePrivateObject(root, referenced, new Uint8Array([1]));
    await writePrivateObject(root, foreign, new Uint8Array([1]));
    await Promise.all([referenced, foreign].map((key) => utimes(resolve(root, key), old, old)));
    await database.pool.query("insert into app.assets (id, workspace_id, purpose, state, object_key, created_by, mime, bytes, sha256, created_at, updated_at) values ($1, $2, 'input', 'ready', $3, $4, 'image/png', 1, 'probe', $5, $5)", [randomUUID(), foreignWorkspaceId, referenced, userId, old]);
    const outside = join(external, 'outside.bin');
    await writeFile(outside, new Uint8Array([1]));
    await utimes(outside, old, old);
    await symlink(external, resolve(root, `${prefix}/0-linked`), 'junction');
    for (let i = 0; i < 3; i += 1) await cleanupOrphanedAssetsDetailed(database.db, {workspaceId, root, now});
    assert.equal(existsSync(resolve(root, referenced)), true);
    assert.equal(existsSync(resolve(root, foreign)), true);
    assert.equal(existsSync(outside), true);
    await assert.rejects(cleanupOrphanedAssetsDetailed(database.db, {workspaceId: '../escape', root, now}));

    // Malformed cursor state safely replays a page; no reference/retention bypass.
    await writeFile(resolve(root, `.cleanup-cursors/${workspaceId}.json`), '{partial', 'utf8');
    const reset = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId, root, now});
    assert.equal(reset.scannedObjects, MAX_ORPHAN_SCAN_OBJECTS);
    assert.equal(reset.deletedObjects, 0);

    // Exercise the actual default scheduled caller with an empty dispatch queue.
    const scheduled = `workspaces/${foreignWorkspaceId}/scheduled-orphan.bin`;
    await writePrivateObject(root, scheduled, new Uint8Array([1]));
    await utimes(resolve(root, scheduled), old, old);
    const scheduledChild = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import {existsSync} from 'node:fs';
      import {startIndependentCleanupLoop} from './scripts/local-worker.ts';
      const runtimeEnv = globalThis.process['env'];
      const stop = startIndependentCleanupLoop({intervalMs: 5});
      try {
        for (let attempt = 0; attempt < 100 && existsSync(runtimeEnv.CLEANUP_PROBE_TARGET); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
        if (existsSync(runtimeEnv.CLEANUP_PROBE_TARGET)) throw new Error('Scheduled worker cleanup did not collect the orphan.');
      } finally { await stop(); }
    `], {cwd: process.cwd(), env: {...runtimeEnv, ASSET_ROOT: root, CLEANUP_PROBE_TARGET: resolve(root, scheduled)}, encoding: 'utf8', timeout: 30_000, maxBuffer: 32_768, windowsHide: true});
    assert.equal(scheduledChild.status, 0, scheduledChild.stderr || scheduledChild.stdout);
    assert.equal(existsSync(resolve(root, scheduled)), false);
    assert.equal(existsSync(resolve(root, referenced)), true);
    console.log(JSON.stringify({status: 'PASS', boundedScan: '1000', restartProgress: 'resumed', failedRemoval: 'retried', recentFiles: 'retained', newEarlierFile: 'collected', globalReference: 'retained', foreignWorkspace: 'retained-by-scoped-sweep', symlink: 'ignored', traversal: 'denied', malformedCursor: 'reset', scheduledCaller: 'collected-with-empty-queue'}));
  } finally {
    await database.pool.query('delete from app.assets where workspace_id in ($1, $2)', [workspaceId, foreignWorkspaceId]);
    await database.pool.query('delete from app.workspaces where id in ($1, $2)', [workspaceId, foreignWorkspaceId]);
    await database.pool.query('delete from "user" where id = $1', [userId]);
    await database.pool.end();
    await rm(root, {recursive: true, force: true});
    await rm(external, {recursive: true, force: true});
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
