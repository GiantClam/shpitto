import {createHash, randomUUID} from 'node:crypto';
import {existsSync, readFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {and, eq} from 'drizzle-orm';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {generationTasks, submissionAttempts} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {outboxEvents} from '../src/db/schema/credit.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {claimDispatch, markGenerationMaterializing, markSubmissionUnknown, recordProviderSubmission, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {claimOutbox} from '../src/modules/generation/outbox.ts';
import {materializeOutput} from '../src/modules/assets/ingest.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {deletePrivateObject, writePrivateObject} from '../src/adapters/storage/local.ts';
import {probePrivateMedia} from '../src/modules/assets/media-probe.ts';
import {processLocalWorkerOnce} from './local-worker.ts';

if (existsSync(resolve(process.cwd(), '.env.local'))) loadEnvFile(resolve(process.cwd(), '.env.local'));

type Stage = 'reservation' | 'dispatch-claim' | 'ambiguous-response' | 'durable-local-observation' | 'object-upload' | 'success-before-ack';
const STAGES: readonly Stage[] = ['reservation', 'dispatch-claim', 'ambiguous-response', 'durable-local-observation', 'object-upload', 'success-before-ack'];
const runtimeEnv = globalThis.process['env'];
const childMode = runtimeEnv.M3_CRASH_CHILD === '1';
const recoveryMode = runtimeEnv.M3_CRASH_RECOVERY_CHILD === '1';
const scriptPath = resolve(process.cwd(), 'scripts/probe-m3-crash-restart.ts');
const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/video/local-demo.mp4')));

function assertDisposableUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55432') throw new Error('Crash probe requires disposable PostgreSQL at 127.0.0.1:55432.');
}

async function waitForParentKill(payload: Readonly<Record<string, unknown>>): Promise<never> {
  process.stdout.write(`M3_CRASH_READY ${JSON.stringify(payload)}\n`);
  await new Promise<never>(() => undefined);
  throw new Error('unreachable');
}

async function runChild(): Promise<void> {
  const stage = runtimeEnv.M3_CRASH_STAGE as Stage;
  const database = createDatabase();
  const workspaceId = runtimeEnv.M3_CRASH_WORKSPACE!;
  const userId = runtimeEnv.M3_CRASH_USER!;
  const taskId = runtimeEnv.M3_CRASH_TASK;
  const now = new Date(runtimeEnv.M3_CRASH_NOW!);
  const actor = {userId};
  try {
    if (stage === 'reservation') {
      const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});
      const created = await createGenerationTask(database.db, {actor, workspaceId, idempotencyKey: `crash-reserve-${randomUUID()}`, quote, input: {prompt: 'crash reservation'}, now});
      await waitForParentKill({stage, taskId: created.value.taskId});
    }
    if (!taskId) throw new Error(`${stage} requires task id.`);
    if (stage === 'dispatch-claim') {
      await claimDispatch(database.db, {actor, workspaceId, taskId, idempotencyKey: `crash-claim-${randomUUID()}`, now});
      await waitForParentKill({stage, taskId});
    }
    if (stage === 'ambiguous-response') {
      const claim = await claimDispatch(database.db, {actor, workspaceId, taskId, idempotencyKey: `crash-ambiguous-claim-${randomUUID()}`, now});
      await markSubmissionUnknown(database.db, {actor, workspaceId, taskId, attemptId: claim.value.attemptId, idempotencyKey: `crash-ambiguous-${randomUUID()}`, now: new Date(now.getTime() + 31_000)});
      await waitForParentKill({stage, taskId});
    }
    if (stage === 'durable-local-observation') {
      await waitForParentKill({stage, status: 'NOT_APPLICABLE', reason: 'Remote webhook inbox is deferred for the local Mock profile.'});
    }
    if (stage === 'object-upload') {
      const claim = await claimDispatch(database.db, {actor, workspaceId, taskId, idempotencyKey: `crash-upload-claim-${randomUUID()}`, now});
      await recordProviderSubmission(database.db, {actor, workspaceId, taskId, attemptId: claim.value.attemptId, providerRequestId: `crash-upload-${randomUUID()}`, idempotencyKey: `crash-upload-submit-${randomUUID()}`, internalWorker: true, now});
      await markGenerationMaterializing(database.db, {actor, workspaceId, taskId, attemptId: claim.value.attemptId, idempotencyKey: `crash-upload-materialize-${randomUUID()}`, internalWorker: true, now});
      const assetId = randomUUID();
      const objectKey = `tasks/${taskId}/outputs/${assetId}.mp4`;
      const sha256 = createHash('sha256').update(fixture).digest('hex');
      await writePrivateObject(runtimeEnv.M3_CRASH_ASSET_ROOT!, objectKey, fixture);
      const media = await probePrivateMedia(runtimeEnv.M3_CRASH_ASSET_ROOT!, objectKey);
      const lockClient = new Client({connectionString: runtimeEnv.DATABASE_URL});
      await lockClient.connect();
      await lockClient.query('begin');
      await lockClient.query('select id from app.generation_tasks where id = $1::uuid and workspace_id = $2::uuid for update', [taskId, workspaceId]);
      await waitForParentKill({stage, taskId, assetId, objectKey, sha256, mediaFormat: media.format});
    }
    if (stage === 'success-before-ack') {
      const lease = await claimOutbox(database.db, `crash-before-ack-${randomUUID()}`, now, {eventType: 'generation.dispatch', workspaceId});
      if (!lease) throw new Error('Missing dispatch outbox event for acknowledgement boundary.');
      const claim = await claimDispatch(database.db, {actor, workspaceId, taskId, idempotencyKey: `crash-ack-claim-${randomUUID()}`, outboxLease: lease, now});
      await recordProviderSubmission(database.db, {actor, workspaceId, taskId, attemptId: claim.value.attemptId, providerRequestId: `crash-ack-${randomUUID()}`, idempotencyKey: `crash-ack-submit-${randomUUID()}`, internalWorker: true, outboxLease: lease, now});
      await markGenerationMaterializing(database.db, {actor, workspaceId, taskId, attemptId: claim.value.attemptId, idempotencyKey: `crash-ack-materialize-${randomUUID()}`, internalWorker: true, outboxLease: lease, now});
      await materializeOutput(database.db, {actorUserId: userId, workspaceId, taskId, root: runtimeEnv.M3_CRASH_ASSET_ROOT!, bytes: fixture, mime: 'video/mp4', outboxLease: lease, now});
      await settleGenerationTask(database.db, {actor, workspaceId, taskId, idempotencyKey: `crash-ack-success-${randomUUID()}`, outcome: 'succeeded', providerCostEvidence: {state: 'known', minor: '0', currency: 'USD'}, internalWorker: true, outboxLease: lease, now});
      await waitForParentKill({stage, taskId, eventId: lease.id});
    }
    throw new Error(`Unknown crash stage ${stage}.`);
  } finally {
    await database.pool.end();
  }
}

function spawnCrash(stage: Stage, env: Record<string, string>): Promise<{signal: NodeJS.Signals | null; code: number | null; payload: Record<string, unknown>}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', scriptPath], {env: {...runtimeEnv, ...env, M3_CRASH_CHILD: '1', M3_CRASH_STAGE: stage}, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    let ready = false;
    let readyPayload: Record<string, unknown> | null = null;
    let buffer = '';
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      for (const line of buffer.split('\n').slice(0, -1)) {
        if (!line.startsWith('M3_CRASH_READY ')) continue;
        ready = true;
        readyPayload = JSON.parse(line.slice('M3_CRASH_READY '.length)) as Record<string, unknown>;
      }
      buffer = buffer.includes('\n') ? buffer.slice(buffer.lastIndexOf('\n') + 1) : buffer;
      if (ready && !child.killed) child.kill('SIGKILL');
    });
    child.once('exit', (code, signal) => {
      // Windows reports an explicitly parent-killed child as code 1/null. The
      // ready handshake is mandatory, so an arbitrary code-1 child is never
      // accepted as a crash boundary.
      if (!ready || (signal !== 'SIGKILL' && !(process.platform === 'win32' && signal === null && code === 1))) return reject(new Error(`${stage} child did not complete the parent-kill handshake (code=${code}, signal=${signal}, ready=${ready}): ${stderr.slice(0, 1000)}${stdout.slice(0, 1000)}`));
      resolvePromise({signal: signal ?? 'SIGKILL', code, payload: readyPayload ?? {}});
    });
    setTimeout(() => { if (!ready) child.kill('SIGTERM'); }, 30_000).unref();
  });
}

async function runRecoveryChild(): Promise<void> {
  const processed = await processLocalWorkerOnce({workspaceId: runtimeEnv.M3_CRASH_WORKSPACE, now: new Date(runtimeEnv.M3_CRASH_NOW!)});
  process.stdout.write(`M3_RECOVERY_DONE ${JSON.stringify({processed})}\n`);
}

async function setupWorkspace(database: ReturnType<typeof createDatabase>, workspaceId: string, userId: string, now: Date): Promise<void> {
  await database.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'M3 Crash Probe', $2, true, $3, $3)`, [userId, `${userId}@example.test`, now]);
  await database.pool.query(`insert into app.workspaces (id, kind, name, created_by, created_at, updated_at) values ($1::uuid, 'personal', 'M3 Crash Probe', $2, $3, $3)`, [workspaceId, userId, now]);
  await database.pool.query(`insert into app.workspace_members (workspace_id, user_id, role, created_at) values ($1::uuid, $2, 'owner', $3)`, [workspaceId, userId, now]);
  await database.pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`, [workspaceId, now]);
  await database.pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`, [workspaceId, now]);
  await issueGrant(database.db, {actorUserId: userId, workspaceId, commandName: 'probe.m3-crash-grant', commandKey: `crash-grant-${workspaceId}`, businessKey: `crash-grant-${workspaceId}`, source: 'manual', amount: 1000n, payload: {amount: '1000'}});
}

async function cleanup(pool: {query: (sql: string, values?: unknown[]) => Promise<unknown>}, workspaceId: string, userId: string): Promise<void> {
  for (const table of ['generation_quarantine', 'submission_attempts', 'assets', 'command_results', 'outbox_events', 'audit_events', 'credit_ledger_entries', 'credit_allocations']) await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = $1::uuid', [workspaceId]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) await pool.query(`delete from app.${table} where workspace_id = $1::uuid`, [workspaceId]);
  await pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
  await pool.query('delete from "user" where id = $1', [userId]);
}

async function taskState(database: ReturnType<typeof createDatabase>, taskId: string): Promise<{status: string; reservation: string; attempts: number; assets: number}> {
  const task = (await database.db.select({status: generationTasks.status}).from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1))[0];
  const reservation = (await database.db.select({status: creditReservations.status}).from(creditReservations).where(eq(creditReservations.taskId, taskId)).limit(1))[0];
  const attempts = await database.db.select({id: submissionAttempts.id}).from(submissionAttempts).where(eq(submissionAttempts.taskId, taskId));
  const outputAssets = await database.db.select({id: assets.id}).from(assets).where(and(eq(assets.taskId, taskId), eq(assets.state, 'ready')));
  if (!task || !reservation) throw new Error(`Missing crash fixture state for ${taskId}.`);
  return {status: task.status, reservation: reservation.status, attempts: attempts.length, assets: outputAssets.length};
}

async function snapshot(database: ReturnType<typeof createDatabase>, workspaceId: string): Promise<Record<string, unknown>> {
  const counts = (await database.pool.query(`select
    (select count(*)::int from app.generation_tasks where workspace_id = $1::uuid) as tasks,
    (select count(*)::int from app.submission_attempts where workspace_id = $1::uuid) as attempts,
    (select count(*)::int from app.assets where workspace_id = $1::uuid) as assets,
    (select count(*)::int from app.outbox_events where workspace_id = $1::uuid) as outbox,
    (select count(*)::int from app.credit_ledger_entries where workspace_id = $1::uuid) as ledger,
    (select count(*)::int from app.credit_allocations where workspace_id = $1::uuid) as allocations,
    (select count(*)::int from app.command_results where workspace_id = $1::uuid) as commands`, [workspaceId]) as {rows: Array<Record<string, number>>}).rows[0];
  const grants = (await database.pool.query(`select coalesce(sum(available), 0)::text as available, coalesce(sum(reserved), 0)::text as reserved, coalesce(sum(consumed), 0)::text as consumed from app.credit_grants where workspace_id = $1::uuid`, [workspaceId]) as {rows: Array<Record<string, string>>}).rows[0];
  const outbox = (await database.pool.query(`select status, count(*)::int as count from app.outbox_events where workspace_id = $1::uuid group by status order by status`, [workspaceId]) as {rows: Array<{status: string; count: number}>}).rows;
  return {counts, grants, outbox};
}

async function recoverInFreshChild(databaseUrl: string, workspaceId: string, assetRoot: string, now: Date): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', scriptPath], {
      env: {...runtimeEnv, DATABASE_URL: databaseUrl, ASSET_ROOT: assetRoot, M3_CRASH_RECOVERY_CHILD: '1', M3_CRASH_WORKSPACE: workspaceId, M3_CRASH_NOW: now.toISOString()},
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk: string) => { output += chunk; });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { errors += chunk; });
    child.once('error', reject);
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Recovery child timed out.')); }, 30_000); timer.unref();
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || signal !== null || !output.includes('M3_RECOVERY_DONE ')) return reject(new Error(`Recovery child failed (code=${code}, signal=${signal}): ${errors.slice(0, 1000)}${output.slice(0, 1000)}`));
      resolvePromise();
    });
  });
}

async function runParent(): Promise<void> {
  const supplied = runtimeEnv.DATABASE_URL ? new URL(runtimeEnv.DATABASE_URL) : null;
  const suppliedIsDisposable = supplied?.hostname === '127.0.0.1' && supplied.port === '55432' && supplied.pathname !== '/postgres';
  // A verifier may supply an already-created disposable database. Otherwise
  // create an owned database on the local PostgreSQL verification service.
  const disposableAdmin = 'postgres://postgres@127.0.0.1:55432/postgres';
  assertDisposableUrl(disposableAdmin);
  const isolated = `shpitto_m3_crash_${randomUUID().replaceAll('-', '').slice(0, 18)}`;
  const admin = suppliedIsDisposable ? null : new Client({connectionString: disposableAdmin});
  let databaseUrl = suppliedIsDisposable ? runtimeEnv.DATABASE_URL! : '';
  const now = new Date('2026-10-01T00:00:00.000Z');
  const workspaceId = randomUUID();
  const userId = `probe-m3-crash-${randomUUID()}`;
  const assetRoot = resolve(process.cwd(), `.data/m3-crash-${workspaceId}`);
  const originalDatabaseUrl = runtimeEnv.DATABASE_URL;
  let database: ReturnType<typeof createDatabase> | null = null;
  try {
    if (admin) {
      await admin.connect();
      await admin.query(`CREATE DATABASE "${isolated}"`);
      const url = new URL(disposableAdmin); url.pathname = `/${isolated}`; databaseUrl = url.toString();
    }
    runtimeEnv.DATABASE_URL = databaseUrl;
    const migrationClient = createMigrationClient(); await migrationClient.connect(); await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')}); await migrationClient.end();
    database = createDatabase();
    await setupWorkspace(database, workspaceId, userId, now);
    const quote = createServerQuote(DEFAULT_MODEL_ID, '2', {now});
    const results: Record<string, unknown> = {};
    for (const stage of STAGES) {
      if (stage === 'durable-local-observation') {
        results[stage] = {result: 'NOT_APPLICABLE', reason: 'Remote webhook inbox is deferred for the local Mock profile.'};
        continue;
      }
      const created = stage === 'reservation' ? null : await createGenerationTask(database.db, {actor: {userId}, workspaceId, idempotencyKey: `crash-${stage}-create-${randomUUID()}`, quote, input: {prompt: `crash ${stage}`}, now});
      const taskId = created?.value.taskId;
      const before = await snapshot(database, workspaceId);
      const child = await spawnCrash(stage, {DATABASE_URL: databaseUrl, M3_CRASH_WORKSPACE: workspaceId, M3_CRASH_USER: userId, M3_CRASH_TASK: taskId ?? '', M3_CRASH_NOW: now.toISOString(), M3_CRASH_ASSET_ROOT: assetRoot});
      const actualTaskId = taskId ?? String(child.payload.taskId);
      if (!actualTaskId || actualTaskId === 'undefined') throw new Error(`${stage} crash handshake did not include task id.`);
      const staleObjectKey = typeof child.payload.objectKey === 'string' ? child.payload.objectKey : null;
      if (stage === 'object-upload') {
        const preRecovery = await taskState(database, actualTaskId);
        if (preRecovery.assets !== 0) throw new Error(`Object upload crash boundary already published a ready asset: ${JSON.stringify(preRecovery)}`);
        if (!staleObjectKey || !existsSync(resolve(assetRoot, staleObjectKey))) throw new Error('Object upload crash boundary did not leave the expected private object for recovery.');
      }
      let recoveryAt = now;
      if (stage === 'reservation') recoveryAt = new Date(now.getTime() + 11 * 60 * 1000);
      if (stage === 'ambiguous-response') recoveryAt = new Date(now.getTime() + 31_000);
      if (stage === 'success-before-ack') recoveryAt = new Date(now.getTime() + 61_000);
      await recoverInFreshChild(databaseUrl, workspaceId, assetRoot, recoveryAt);
      if (stage === 'ambiguous-response') {
        const current = await taskState(database, actualTaskId);
        if (current.status !== 'submission_unknown' || current.attempts !== 1) throw new Error(`Ambiguous response recovery invariant failed: ${JSON.stringify(current)}`);
        // Continue the persisted probe schedule until the bounded reconciliation
        // deadline. Every iteration is a fresh worker process invocation and no
        // provider submission is retried.
        for (let probe = 1; probe <= 23; probe += 1) {
          await recoverInFreshChild(databaseUrl, workspaceId, assetRoot, new Date(now.getTime() + 181_000 + probe * 150_000));
        }
        await recoverInFreshChild(databaseUrl, workspaceId, assetRoot, new Date(now.getTime() + 61 * 60 * 1000));
      }
      let removedStaleObject = false;
      if (staleObjectKey) {
        await deletePrivateObject(assetRoot, staleObjectKey);
        if (existsSync(resolve(assetRoot, staleObjectKey))) throw new Error(`Orphaned crash object was not removed: ${staleObjectKey}`);
        removedStaleObject = true;
      }
      const state = await taskState(database, actualTaskId);
      if (stage === 'reservation' && (state.status !== 'failed' || state.reservation !== 'released')) throw new Error(`Reservation recovery invariant failed: ${JSON.stringify(state)}`);
      if (stage === 'dispatch-claim' && (state.status !== 'succeeded' || state.reservation !== 'consumed')) throw new Error(`Dispatch claim recovery invariant failed: ${JSON.stringify(state)}`);
      if (stage === 'ambiguous-response' && (state.status !== 'failed' || state.reservation !== 'released' || state.attempts !== 1)) throw new Error(`Ambiguous response bounded recovery invariant failed: ${JSON.stringify(state)}`);
      if (stage === 'object-upload' && (state.status !== 'succeeded' || state.assets !== 1 || state.reservation !== 'consumed')) throw new Error(`Object upload recovery invariant failed: ${JSON.stringify(state)}`);
      if (stage === 'success-before-ack' && (state.status !== 'succeeded' || state.reservation !== 'consumed')) throw new Error(`Success acknowledgement recovery invariant failed: ${JSON.stringify(state)}`);
      if (stage === 'success-before-ack') {
        const eventId = String(child.payload.eventId);
        const event = (await database.pool.query(`select status, lease_owner, lease_until, attempts from app.outbox_events where id = $1::uuid`, [eventId]) as {rows: Array<{status: string; lease_owner: string | null; lease_until: Date | null; attempts: number}>}).rows[0];
        if (!event || event.status !== 'published' || event.lease_owner !== null || event.lease_until !== null || event.attempts !== 1) throw new Error(`Success acknowledgement outbox invariant failed: ${JSON.stringify(event)}`);
      }
      const after = await snapshot(database, workspaceId);
      results[stage] = {result: 'PASS', childSignal: child.signal, taskId: actualTaskId, before, after, state, objectIdentity: staleObjectKey ? {objectKey: staleObjectKey, sha256: child.payload.sha256 ?? null, removedAfterRecovery: removedStaleObject} : null};
    }
    const balance = (await database.pool.query(`select coalesce(sum(available), 0)::text as available, coalesce(sum(reserved), 0)::text as reserved, coalesce(sum(consumed), 0)::text as consumed from app.credit_grants where workspace_id = $1::uuid`, [workspaceId]) as {rows: Array<{available: string; reserved: string; consumed: string}>}).rows[0];
    if (balance?.reserved !== '0') throw new Error(`Reserved credit leak after crash probe: ${JSON.stringify(balance)}`);
    await cleanup(database.pool, workspaceId, userId);
    const leftovers = (await database.pool.query(`select
      (select count(*)::int from app.workspaces where id = $1::uuid) as workspace_count,
      (select count(*)::int from "user" where id = $2) as user_count`, [workspaceId, userId]) as {rows: Array<{workspace_count: number; user_count: number}>}).rows[0];
    if (leftovers?.workspace_count !== 0 || leftovers.user_count !== 0) throw new Error(`Crash probe fixture cleanup incomplete: ${JSON.stringify(leftovers)}`);
    console.log(JSON.stringify({status: 'PASS', database: 'disposable-127.0.0.1:55432', boundaries: results, balance, remoteInbox: 'NOT_APPLICABLE', fixturesRemoved: true}));
  } finally {
    rmSync(assetRoot, {recursive: true, force: true});
    await database?.pool.end();
    runtimeEnv.DATABASE_URL = originalDatabaseUrl;
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${isolated}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    }
  }
}

(recoveryMode ? runRecoveryChild() : childMode ? runChild() : runParent()).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
