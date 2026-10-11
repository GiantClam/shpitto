import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';
import {and, eq} from 'drizzle-orm';

import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {assets} from '../src/db/schema/asset.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';
import {authorizeAsset, createAssetDownloadToken, deleteAsset, verifyAssetDownloadToken} from '../src/modules/assets/authorize.ts';
import {ASSET_CLEANUP_CURSOR_KEY, runConfiguredAssetCleanupBatch} from '../src/trigger/cleanup-assets.ts';

const runtimeEnv = globalThis.process['env'];
const ADMIN_DATABASE_URL = runtimeEnv.LIVE_PROBE_ADMIN_DATABASE_URL ?? 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres';
type ProbeMedia = Readonly<{source: string; modelKey: 'fal-wan22-t2v' | 'fal-wan22-i2v' | 'replicate-wan22-t2v' | 'replicate-wan22-i2v'}>;

const defaultMedia: readonly ProbeMedia[] = [
  {source: 'internal/evidence/M4/task-5.10/fal-t2v-real-01a1232d-b908-7442-b7df-6558dd769706.mp4', modelKey: 'fal-wan22-t2v'},
  {source: 'internal/evidence/M4/task-5.10/fal-i2v-real-01a12337-c628-7363-93bd-2e526b11514b.mp4', modelKey: 'fal-wan22-i2v'},
];

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function probeMedia(): readonly ProbeMedia[] {
  const source = option('--media');
  if (!source) return defaultMedia;
  const modelKey = option('--model-key');
  if (!modelKey || !['fal-wan22-t2v', 'fal-wan22-i2v', 'replicate-wan22-t2v', 'replicate-wan22-i2v'].includes(modelKey)) {
    throw new Error('A supported --model-key is required when --media is provided.');
  }
  return [{source, modelKey: modelKey as ProbeMedia['modelKey']}];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error('Usage: probe-real-provider-private-lifecycle.ts --output <evidence.json>');
  if (runtimeEnv.STORAGE_DRIVER !== 's3') throw new Error('The live lifecycle probe requires STORAGE_DRIVER=s3.');
  const mediaFiles = probeMedia();

  const startedAt = new Date();
  const databaseName = `shpitto_live_probe_${randomUUID().replaceAll('-', '')}`;
  const databaseUrl = new URL(ADMIN_DATABASE_URL);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = new Client({connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 5_000});
  let createdDatabase = false;
  let droppedDatabase = false;
  const store = getPrivateObjectStore();
  const attemptedObjectKeys = new Set<string>();
  const checks: Record<string, string> = {};

  try {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    createdDatabase = true;
    const downloadSecret = `probe-${randomUUID()}-${randomUUID()}`;
    Object.assign(runtimeEnv, {
      NODE_ENV: 'test',
      APP_URL: 'http://127.0.0.1:3100',
      BETTER_AUTH_SECRET: downloadSecret,
      DATABASE_URL: databaseUrl.toString(),
      GENERATION_DRIVER: 'provider',
      MAIL_DRIVER: 'local',
    });

    const migrationClient = createMigrationClient();
    try {
      await migrationClient.connect();
      try {
        await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
      } catch (error) {
        const cause = (error as {cause?: {message?: unknown; code?: unknown}}).cause;
        console.error(JSON.stringify({migrationError: error instanceof Error ? error.name : 'Error', cause: typeof cause?.message === 'string' ? cause.message : null, code: cause?.code ?? null}));
        throw error;
      }
    } finally {
      await migrationClient.end().catch(() => undefined);
    }
    checks.disposableDatabaseMigration = 'PASS';

    const database = createDatabase();
    const actorUserId = `probe-owner-${randomUUID()}`;
    const outsiderUserId = `probe-outsider-${randomUUID()}`;
    const workspaceId = randomUUID();
    const now = new Date();
    const published: Array<Record<string, unknown>> = [];
    try {
      await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values ($1, 'Live Probe Owner', $2, true, $4, $4), ($3, 'Live Probe Outsider', $5, true, $4, $4)`,
      [actorUserId, `${actorUserId}@example.test`, outsiderUserId, now, `${outsiderUserId}@example.test`]);
      await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
        values ($1::uuid, 'team', 'Isolated live provider probe', $2, $3, $3)`, [workspaceId, actorUserId, now]);
      await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at)
        values ($1::uuid, $2, 'owner', $3)`, [workspaceId, actorUserId, now]);

      for (const [index, media] of mediaFiles.entries()) {
        const taskId = randomUUID();
        const mode = media.modelKey.endsWith('-i2v') ? 'i2v' : 't2v';
        await database.pool.query(`insert into app.generation_tasks (
          id, workspace_id, requested_by, mode, model_key, catalog_version, catalog_snapshot,
          input_snapshot, policy_snapshot, quoted_credits, status, deadline_at, queue_deadline_at,
          stage_deadline_at, overall_deadline_at, materialization_attempts, next_action_at, version,
          created_at, updated_at
        ) values (
          $1::uuid, $2::uuid, $3, $4, $5, 1, '{}'::jsonb,
          '{}'::jsonb, '{}'::jsonb, 1, 'materializing', $6, $6,
          $6, $6, 0, $6, 1, $7, $7
        )`, [taskId, workspaceId, actorUserId, mode, media.modelKey, new Date(now.getTime() + 30 * 60 * 1000), now]);

        const bytes = new Uint8Array(await readFile(resolve(media.source)));
        const materialized = await materializeOutput(database.db, {
          actorUserId,
          workspaceId,
          taskId,
          store,
          bytes,
          mime: 'video/mp4',
          now,
        });
        attemptedObjectKeys.add(materialized.objectKey);
        assert.equal(materialized.sha256, sha256(bytes));
        const row = await authorizeAsset(database.db, workspaceId, materialized.assetId, {userId: actorUserId});
        assert.equal(row.state, 'ready');
        assert.equal(row.objectKey, materialized.objectKey);
        await assert.rejects(
          authorizeAsset(database.db, workspaceId, materialized.assetId, {userId: outsiderUserId}),
          (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN',
        );
        const token = createAssetDownloadToken(downloadSecret, workspaceId, materialized.assetId, now);
        assert.equal(verifyAssetDownloadToken(downloadSecret, token.token, workspaceId, materialized.assetId, now), true);
        assert.equal(verifyAssetDownloadToken(downloadSecret, token.token, workspaceId, randomUUID(), now), false);
        const downloaded = await store.get(row.objectKey);
        assert.equal(sha256(downloaded), materialized.sha256);
        published.push({source: media.source, modelKey: media.modelKey, taskId, assetId: materialized.assetId, objectKey: materialized.objectKey, bytes: materialized.bytes, sha256: materialized.sha256});
      }
      checks.realProviderOutputMaterialization = 'PASS';
      checks.readyAssetPublication = 'PASS';
      checks.currentMembershipAuthorization = 'PASS';
      checks.sixtySecondTokenBinding = 'PASS';
      checks.authorizedObjectHash = 'PASS';

      const first = published[0]!;
      await deleteAsset(database.db, workspaceId, String(first.assetId), {userId: actorUserId}, undefined, now, store);
      assert.equal(await store.head(String(first.objectKey)), null);
      const deletedRow = (await database.db.select({state: assets.state}).from(assets).where(and(eq(assets.id, String(first.assetId)), eq(assets.workspaceId, workspaceId))).limit(1))[0];
      assert.equal(deletedRow?.state, 'deleted');
      attemptedObjectKeys.delete(String(first.objectKey));
      checks.authorizedAssetDeletion = 'PASS';

      const orphanAssetId = randomUUID();
      const orphanKey = `workspaces/${workspaceId}/orphans/${orphanAssetId}.mp4`;
      attemptedObjectKeys.add(orphanKey);
      const orphanBytes = new Uint8Array(await readFile(resolve(mediaFiles[0]!.source)));
      await store.put(orphanKey, orphanBytes, 'video/mp4');
      const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      await database.pool.query(`insert into app.assets (
        id, workspace_id, task_id, purpose, state, object_key, created_by, mime, bytes, sha256,
        duration_ms, upload_expires_at, created_at, updated_at
      ) values ($1::uuid, $2::uuid, null, 'output', 'pending', $3, $4, 'video/mp4', $5, $6, null, null, $7, $7)`,
      [orphanAssetId, workspaceId, orphanKey, actorUserId, BigInt(orphanBytes.byteLength), sha256(orphanBytes), old]);
      const cleanup = await runConfiguredAssetCleanupBatch(database.db, store, now);
      assert.equal(cleanup.workspaces.length, 1);
      assert.equal(cleanup.workspaces[0]?.workspaceId, workspaceId);
      assert.equal(cleanup.workspaces[0]?.deletedRows, 1);
      assert.equal(cleanup.workspaces[0]?.failures, 0);
      assert.equal(await store.head(orphanKey), null);
      assert.equal((await database.db.select({id: assets.id}).from(assets).where(eq(assets.id, orphanAssetId))).length, 0);
      attemptedObjectKeys.delete(orphanKey);
      checks.scheduledS3OrphanCleanup = 'PASS';

      await store.delete(ASSET_CLEANUP_CURSOR_KEY).catch(() => undefined);
      const remainingPublished = published.slice(1);
      for (const item of remainingPublished) {
        await deleteAsset(database.db, workspaceId, String(item.assetId), {userId: actorUserId}, undefined, now, store);
        assert.equal(await store.head(String(item.objectKey)), null);
        attemptedObjectKeys.delete(String(item.objectKey));
      }
      checks.exactProbeObjectCleanup = 'PASS';

      const evidence = {
        status: 'PASS_REAL_PROVIDER_PRIVATE_LIFECYCLE',
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        profile: 'Cloudflare R2 through the shared S3-compatible adapter',
        isolation: {disposableDatabase: true, isolatedWorkspace: true, freshObjectKeysOnly: true, existingBusinessObjectsReadOrDeleted: false},
        providerOutputs: published,
        checks,
        cleanup: {remainingAttemptedObjectKeys: [...attemptedObjectKeys], cursorRemoved: (await store.head(ASSET_CLEANUP_CURSOR_KEY)) === null},
        limitations: [
          `This reuses already-captured ${[...new Set(mediaFiles.map((media) => media.modelKey.split('-')[0]))].join(' and ')} provider output files and creates no provider request.`,
          'It proves application storage, publication, authorization and cleanup, not provider webhook delivery, cost confirmation or credit settlement.',
          'Independent M4 review remains open.',
        ],
      };
      assert.deepEqual(evidence.cleanup.remainingAttemptedObjectKeys, []);
      assert.equal(evidence.cleanup.cursorRemoved, true);
      await writeFile(resolve(output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({status: evidence.status, outputs: published.length, checks: Object.keys(checks).length, evidence: output}));
    } finally {
      for (const key of attemptedObjectKeys) await store.delete(key).catch(() => undefined);
      await store.delete(ASSET_CLEANUP_CURSOR_KEY).catch(() => undefined);
      await database.pool.end();
    }
  } finally {
    if (createdDatabase) {
      await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [databaseName]);
      await admin.query(`drop database "${databaseName}"`);
      droppedDatabase = (await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rows.length === 0;
    }
    await admin.end().catch(() => undefined);
    if (createdDatabase && !droppedDatabase) throw new Error('Disposable live-probe database was not removed.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Live provider private lifecycle probe failed.');
  process.exitCode = 1;
});


