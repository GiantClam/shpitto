import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {randomUUID, createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {Client} from 'pg';
import {execFileSync} from 'node:child_process';
import {uploadInputAsset} from '../../src/modules/assets/upload.ts';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {getServerEnv} from '../../src/config/env.ts';
import {parseProviderWorkerConfig} from '../../src/config/provider-worker.ts';
import {createDatabase, type DatabaseHandle} from '../../src/db/client.ts';
import {createLocalObjectStore} from '../../src/adapters/storage/local.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {createGenerationTask} from '../../src/modules/generation/create.ts';
import {issueGrant} from '../../src/modules/credits/ledger.ts';
import {runProviderWorkerOnce} from '../../src/modules/generation/provider-worker.ts';
import {createReplicateProvider} from '../../src/adapters/providers/replicate/index.ts';
import {createFalProvider} from '../../src/adapters/providers/fal/index.ts';
import {materializeOutput} from '../../src/modules/assets/ingest.ts';
import {authorizeAsset} from '../../src/modules/assets/authorize.ts';
import {claimOutbox} from '../../src/modules/generation/outbox.ts';
import {adoptVerifiedProviderRequest, beginProviderSubmission, claimDispatch, settleGenerationTask} from '../../src/modules/generation/lifecycle.ts';
import {drainTerminalProviderWebhookInbox, processProviderWebhook, ingestProviderWebhook} from '../../src/modules/generation/provider-webhooks.ts';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {dispatchGeneration} from '../../src/trigger/dispatch.ts';
import {runOutboxPumpOnce} from '../../src/trigger/outbox.ts';
import {reconcileProviderRequest} from '../../src/trigger/reconcile.ts';
import {runRecoverySweep, startRecoverySchedule} from '../../src/trigger/sweep-recovery.ts';
import {runGenerationTrigger} from '../../src/adapters/tasks/trigger.ts';

const databaseName = `shpitto_worker_probe_${randomUUID().replaceAll('-', '')}`;
let database: DatabaseHandle;
let admin: Client;
let root: string;
let bytes: Uint8Array;
let createdDatabase = false;
let previousDatabaseUrl: string | undefined;

before(async () => {
  const url = new URL(process.env.PROVIDER_WORKER_TEST_ADMIN_DATABASE_URL ?? getServerEnv().databaseUrl);
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname) && ['55432', '55433'].includes(url.port);
  if (!local) {
    assert.ok(url.hostname.endsWith('.railway.internal'), 'Remote probe requires Railway private PostgreSQL.');
    assert.equal(getServerEnv().runtimeProfile, 'acceptance');
    const approvedProject = process.env.PROVIDER_WORKER_TEST_ISOLATED_PROJECT_ID;
    assert.ok(approvedProject, 'Remote probe needs an explicit isolated project binding.');
    assert.equal(approvedProject, process.env.RAILWAY_PROJECT_ID);
    assert.equal(approvedProject, process.env.SHPITTO_PROVIDER_WORKER_PROJECT_ID);
  }
  admin = new Client({connectionString: url.toString()});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  createdDatabase = true;
  url.pathname = `/${databaseName}`;
  previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url.toString();
  const migration = new Client({connectionString: url.toString()});
  try {
    await migration.connect();
    await migration.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
    await migrate(drizzle(migration), {migrationsFolder: resolve('src/db/migrations')});
  } finally { await migration.end(); }
  database = createDatabase({max: 8});
  root = await mkdtemp(join(tmpdir(), 'shpitto-worker-probe-'));
  bytes = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
});

after(async () => {
  await database?.pool.end();
  if (createdDatabase) { await admin.query(`drop database "${databaseName}" with (force)`); }
  await admin?.end();
  if (previousDatabaseUrl !== undefined) process.env.DATABASE_URL = previousDatabaseUrl;
  if (root) { assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /shpitto-worker-probe-/); await rm(root, {recursive: true, force: true}); }
});

async function fixture(modelKey = 'replicate-wan22-t2v') {
  const workspaceId = randomUUID();
  const userId = `worker-fixture-${randomUUID()}`;
  const now = new Date();
  await database.pool.query(`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,$3,$3)`, [userId, `${userId}@example.test`, now]);
  await database.pool.query(`insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Worker fixture',$2,$3,$3)`, [workspaceId, userId, now]);
  await database.pool.query(`insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',$3)`, [workspaceId, userId, now]);
  await database.pool.query(`insert into app.credit_accounts (workspace_id,version,created_at,updated_at) values ($1,0,$2,$2)`, [workspaceId, now]);
  await database.pool.query(`insert into app.billing_accounts (workspace_id,status,version,created_at,updated_at) values ($1,'active',1,$2,$2)`, [workspaceId, now]);
  await issueGrant(database.db, {actorUserId: userId, workspaceId, commandName: 'worker-fixture.grant', commandKey: randomUUID(), businessKey: randomUUID(), source: 'demo', amount: 100n, payload: {fixture: true}});
  const store = createLocalObjectStore(root);
  let generationInput: Parameters<typeof createGenerationTask>[1]['input'] = {prompt: 'Deterministic worker contract fixture', options: {aspectRatio: '16:9'}};
  if (modelKey.endsWith('-i2v')) {
    const path = join(root, `normalized-${randomUUID()}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720', '-frames:v', '1', '-threads', '1', path], {timeout: 15_000, windowsHide: true});
    const image = await uploadInputAsset(database.db, {actor: {userId}, workspaceId, store, bytes: new Uint8Array(await readFile(path)), mime: 'image/jpeg', now});
    generationInput = {prompt: 'Deterministic owned-image fixture', assetId: image.assetId, assetWorkspaceId: workspaceId, assetState: 'ready', options: {aspectRatio: '16:9', cropSha256: image.sha256, cropConfirmed: true}};
  }
  const created = await createGenerationTask(database.db, {actor: {userId}, workspaceId, idempotencyKey: randomUUID(), quote: createServerQuote(modelKey, '1', {profile: 'acceptance', now}), profile: 'acceptance', acceptanceWorkspaceId: workspaceId, input: generationInput, authorizeReadyInput: async (tx, actor, workspace, input) => { await authorizeAsset(tx, workspace, input.assetId!, actor); }, now});
  const config = parseProviderWorkerConfig({runtimeProfile: 'acceptance', generationDriver: 'provider', storageDriver: 's3', railwayProjectId: 'fixture-project', expectedProjectId: 'fixture-project', workspaceId, state: 'active', allowCreate: 'true', modelKeys: modelKey, pollMs: '1000'});
  return {workspaceId, userId, now, taskId: created.value.taskId, reservationId: created.value.reservationId, config, store};
}
async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  const rows = await database.pool.query(`select t.status,t.provider_cost_state,r.status as reservation,g.available::text,g.reserved::text,g.consumed::text from app.generation_tasks t join app.credit_reservations r on r.task_id=t.id join app.credit_grants g on g.workspace_id=t.workspace_id where t.id=$1 and t.workspace_id=$2`, [f.taskId, f.workspaceId]);
  return rows.rows[0];
}
const materialize: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['materialize']> = (db, input) => materializeOutput(db, {...input, bytes, mime: 'video/mp4'});

test('thin Trigger entrypoints preserve durable dispatch, exact reconciliation and terminal recovery', async () => {
  const f = await fixture();
  let dispatchCalls = 0;
  const pumped = await runGenerationTrigger(database.db, {
    owner: 'trigger-entrypoint-fixture', workspaceId: f.workspaceId, now: f.now,
    handle: async (lease) => {
      dispatchCalls++;
      assert.equal(lease.eventType, 'generation.dispatch');
      const dispatch = await dispatchGeneration(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId,
        taskId: f.taskId, idempotencyKey: `trigger-dispatch-${f.taskId}`, provider: 'replicate', outboxLease: lease, now: f.now});
      assert.equal(dispatch.value.status, 'dispatching');
      return 'ack';
    },
  });
  assert.deepEqual(pumped, {claimed: true, outcome: 'published'});
  assert.equal(dispatchCalls, 1);
  assert.equal((await snapshot(f)).status, 'dispatching');
  assert.deepEqual(await runGenerationTrigger(database.db, {workspaceId: f.workspaceId, now: f.now, handle: async () => {
    assert.fail('Acknowledged dispatch must not be scheduled again.');
  }}), {claimed: false});

  let reads = 0;
  const provider = createReplicateProvider({mode: 'test', transport: {async request(request) {
    assert.equal(request.method, 'GET', 'Reconciliation must never call provider create.');
    assert.equal(request.url, 'https://api.replicate.com/v1/predictions/trigger-owned-request');
    assert.equal(request.retry, false);
    reads++;
    return {status: 200, body: {id: 'trigger-owned-request', status: 'processing'}};
  }}});
  const catalog = getProviderModel('replicate-wan22-t2v');
  const observation = await reconcileProviderRequest(provider, {provider: 'replicate', modelKey: catalog.modelKey, requestId: 'trigger-owned-request', catalog});
  assert.equal(observation.status, 'running');
  assert.equal(reads, 1);
  const overdue = new Date(f.now.getTime() + 91 * 60_000);
  assert.ok((await runRecoverySweep(database.db, overdue)).failed >= 1);
  assert.equal((await snapshot(f)).reservation, 'released');
  assert.equal((await snapshot(f)).available, '100');
  assert.equal((await runRecoverySweep(database.db, overdue)).failed, 0);

  let stop: (() => Promise<void>) | undefined;
  try {
    const completed = new Promise<void>((resolve, reject) => {
      stop = startRecoverySchedule({db: database.db, intervalMs: 60_000, now: () => overdue,
        onResult: (result) => { assert.equal(result.failed, 0); resolve(); }, onError: reject});
    });
    await completed;
  } finally { await stop?.(); }
});

test('Trigger outbox release, failure and thrown handlers preserve lease and reservation boundaries', async () => {
  for (const outcome of ['release', 'fail', 'throw'] as const) {
    const f = await fixture();
    const input = {owner: `trigger-${outcome}`, workspaceId: f.workspaceId, eventType: 'generation.dispatch', now: f.now,
      handle: async () => {
        if (outcome === 'throw') throw new Error('controlled-handler-fault');
        return outcome;
      }};
    if (outcome === 'throw') await assert.rejects(() => runOutboxPumpOnce(database.db, input), /controlled-handler-fault/);
    else assert.deepEqual(await runOutboxPumpOnce(database.db, input), {claimed: true, outcome: outcome === 'release' ? 'released' : 'failed'});
    const events = await database.pool.query('select status, lease_owner from app.outbox_events where workspace_id=$1 and event_type=$2', [f.workspaceId, 'generation.dispatch']);
    assert.equal(events.rows[0].status, outcome === 'fail' ? 'failed' : 'pending');
    assert.equal(events.rows[0].lease_owner, null);
    assert.equal((await snapshot(f)).reservation, 'active', 'Runner scheduling outcomes are not task settlement.');
  }
});

for (const modelKey of ['replicate-wan22-t2v', 'replicate-wan22-i2v', 'fal-wan22-t2v', 'fal-wan22-i2v']) test(`${modelKey} is submitted once, materialized privately and settles UNKNOWN cost`, async () => {
  const f = await fixture(modelKey);
  let creates = 0;
  let reads = 0;
  const factory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = (context, imageUrl) => {
    const transport = {async request(request: {method: string}) {
      if (request.method === 'POST') {
        creates++;
        const state = await database.pool.query(`select submission_started_at from app.generation_tasks where id=$1`, [f.taskId]);
        assert.ok(state.rows[0].submission_started_at, 'The network-start fence must precede the POST.');
        return context.catalog.provider === 'replicate' ? {status: 201, body: {id: `fixture-prediction-${modelKey}`}} : {status: 200, body: {request_id: `fixture-fal-${modelKey}`}};
      }
      reads++;
      return context.catalog.provider === 'replicate'
        ? {status: 200, body: {id: `fixture-prediction-${modelKey}`, status: reads === 1 ? 'processing' : 'succeeded', output: 'https://provider.example/output.mp4'}}
        : {status: 200, body: {request_id: `fixture-fal-${modelKey}`, status: reads === 1 ? 'IN_PROGRESS' : 'COMPLETED', video: {url: 'https://provider.example/output.mp4'}}};
    }};
    const options = {transport, mode: 'live' as const, token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: [modelKey]}, resolveOwnedImageUrl: imageUrl ? async () => imageUrl : undefined};
    return context.catalog.provider === 'replicate' ? createReplicateProvider(options) : createFalProvider(options);
  };
  await runProviderWorkerOnce(database.db, {...f, owner: 'first-worker', providerFactory: factory, materialize});
  assert.equal((await snapshot(f)).reservation, 'active');
  // Simulates a fresh process resuming the persisted provider identity, never another create.
  await runProviderWorkerOnce(database.db, {...f, owner: 'restarted-worker', now: new Date(f.now.getTime() + 2_000), providerFactory: factory, materialize});
  assert.equal(creates, 1);
  assert.deepEqual(await snapshot(f), {status: 'succeeded', provider_cost_state: 'unknown', reservation: 'consumed', available: '90', reserved: '0', consumed: '10'});
  const asset = (await database.pool.query(`select id,object_key,sha256 from app.assets where task_id=$1 and workspace_id=$2 and state='ready'`, [f.taskId, f.workspaceId])).rows[0];
  await authorizeAsset(database.db, f.workspaceId, String(asset.id), {userId: f.userId});
  await assert.rejects(() => authorizeAsset(database.db, f.workspaceId, String(asset.id), {userId: 'outsider'}));
  assert.equal(createHash('sha256').update(await f.store.get(String(asset.object_key))).digest('hex'), asset.sha256);
  await runProviderWorkerOnce(database.db, {...f, owner: 'duplicate-worker', now: new Date(f.now.getTime() + 3_000), providerFactory: factory, materialize});
  assert.equal(creates, 1);
});

test('definitive provider failure releases the original reservation', async () => {
  const f = await fixture();
  let creates = 0;
  const factory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = () => createReplicateProvider({mode: 'live', token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport: {async request(request) { if (request.method === 'POST') { creates++; return {status: 401}; } throw new Error('No read expected.'); }}});
  await runProviderWorkerOnce(database.db, {...f, owner: 'rejected-worker', providerFactory: factory, materialize});
  assert.equal(creates, 1);
  assert.deepEqual(await snapshot(f), {status: 'failed', provider_cost_state: 'unknown', reservation: 'released', available: '100', reserved: '0', consumed: '0'});
});

test('unknown submission recovers for at most 24 probes without a second create', async () => {
  const f = await fixture();
  let creates = 0;
  const factory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = () => createReplicateProvider({mode: 'live', token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport: {async request() { creates++; throw new Error('Ambiguous create timeout.'); }}});
  await runProviderWorkerOnce(database.db, {...f, owner: 'unknown-worker', now: f.now, providerFactory: factory, materialize});
  assert.equal((await snapshot(f)).status, 'submission_unknown');
  for (let i = 1; i <= 24; i++) await runProviderWorkerOnce(database.db, {...f, owner: `unknown-restart-${i}`, now: new Date(f.now.getTime() + i * 151_000), providerFactory: factory, materialize});
  assert.equal(creates, 1);
  assert.equal((await snapshot(f)).reservation, 'released');
});

test('a persisted network-start marker blocks restart and stale lease re-submission', async () => {
  const f = await fixture();
  const lease = (await claimOutbox(database.db, 'crashing-worker', f.now, {eventType: 'generation.dispatch', workspaceId: f.workspaceId}))!;
  const claim = await claimDispatch(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId, taskId: f.taskId, idempotencyKey: randomUUID(), provider: 'replicate', outboxLease: lease, now: f.now});
  const start = {actor: {userId: f.userId}, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: claim.value.attemptId, outboxLease: lease, now: f.now};
  assert.equal(await beginProviderSubmission(database.db, start), true);
  assert.equal(await beginProviderSubmission(database.db, start), false);
  await assert.rejects(() => beginProviderSubmission(database.db, {...start, now: new Date(f.now.getTime() + 61_000)}), /lease/);
  let creates = 0;
  await runProviderWorkerOnce(database.db, {...f, owner: 'replacement-worker', now: new Date(f.now.getTime() + 61_000), providerFactory: () => { creates++; throw new Error('Must not submit.'); }, materialize});
  assert.equal(creates, 0);
  assert.equal((await snapshot(f)).status, 'submission_unknown');
});

test('authenticated inbox completion and polling have only one terminal ledger effect', async () => {
  const f = await fixture();
  let creates = 0;
  const providerFactory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = (context) => createReplicateProvider({mode: 'live', token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport: {async request(request) { if (request.method === 'POST') { creates++; return {status: 201, body: {id: 'callback-fixture'}}; } return {status: 200, body: {id: 'callback-fixture', status: 'processing', output: 'https://provider.example/output.mp4'}}; }}});
  await runProviderWorkerOnce(database.db, {...f, owner: 'callback-worker', now: f.now, providerFactory, materialize});
  const attempt = (await database.pool.query(`select id,client_reference from app.submission_attempts where task_id=$1 and workspace_id=$2`, [f.taskId, f.workspaceId])).rows[0];
  const catalog = (await import('../../src/config/provider-models.ts')).getProviderModel('replicate-wan22-t2v');
  const verified = {eventId: 'callback-completion', accountId: 'fixture-account', attemptNonce: String(attempt.client_reference), authenticatedAt: f.now.toISOString(), observation: {ref: {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'callback-fixture', catalog}, status: 'completed' as const, observedAt: f.now.toISOString(), evidence: {code: 'replicate.completed'}}};
  const rawBody = new TextEncoder().encode('{"id":"callback-fixture","status":"succeeded"}');
  assert.equal((await ingestProviderWebhook(database.db, {provider: 'replicate', rawBody, verified, now: f.now})).duplicate, false);
  assert.equal((await ingestProviderWebhook(database.db, {provider: 'replicate', rawBody, verified, now: f.now})).duplicate, true);
  await runProviderWorkerOnce(database.db, {...f, owner: 'inbox-restart', now: new Date(f.now.getTime() + 2_000), providerFactory, materialize});
  assert.equal(creates, 1);
  assert.equal((await snapshot(f)).reservation, 'consumed');
  const inbox = await database.pool.query(`select status from app.provider_webhook_inbox where provider_request_id=$1`, ['callback-fixture']);
  assert.equal(inbox.rows[0].status, 'processed');
});

test('paused or unadmitted worker has no effect on another workspace', async () => {
  const f = await fixture();
  const before = await snapshot(f);
  const paused = {...f.config, state: 'paused' as const, workspaceId: null};
  await runProviderWorkerOnce(database.db, {...f, config: paused, owner: 'paused-worker', materialize});
  await runProviderWorkerOnce(database.db, {...f, config: {...f.config, workspaceId: randomUUID()}, owner: 'other-workspace-worker', materialize});
  assert.deepEqual(await snapshot(f), before);
});


test('verified callback recovers an accepted create whose request ID write was lost', async () => {
  const f = await fixture();
  const lease = (await claimOutbox(database.db, 'accepted-crash-worker', f.now, {eventType: 'generation.dispatch', workspaceId: f.workspaceId}))!;
  const claim = await claimDispatch(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId, taskId: f.taskId, idempotencyKey: randomUUID(), provider: 'replicate', outboxLease: lease, now: f.now});
  const catalog = (await import('../../src/config/provider-models.ts')).getProviderModel('replicate-wan22-t2v');
  const verified = {eventId: `recovery-${randomUUID()}`, accountId: 'fixture-account', attemptNonce: claim.value.clientReference, authenticatedAt: f.now.toISOString(), observation: {ref: {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: `recovered-${randomUUID()}`, catalog}, status: 'completed' as const, observedAt: f.now.toISOString(), evidence: {code: 'replicate.completed'}}};
  await assert.rejects(() => adoptVerifiedProviderRequest(database.db, verified, f.now), /submit fence/);
  assert.equal(await beginProviderSubmission(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: claim.value.attemptId, outboxLease: lease, now: f.now}), true);
  await adoptVerifiedProviderRequest(database.db, verified, f.now);
  await adoptVerifiedProviderRequest(database.db, verified, f.now);
  await assert.rejects(() => adoptVerifiedProviderRequest(database.db, {...verified, observation: {...verified.observation, ref: {...verified.observation.ref, requestId: 'unrelated-request'}}}, f.now), /replace/);
  assert.equal((await snapshot(f)).status, 'submitted');
  assert.equal((await snapshot(f)).reservation, 'active');
});


async function pendingCallbackFixture() {
  const f = await fixture();
  const requestId = `pending-${randomUUID()}`;
  const providerFactory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = () => createReplicateProvider({mode: 'live', token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport: {async request(request) { return request.method === 'POST' ? {status: 201, body: {id: requestId}} : {status: 200, body: {id: requestId, status: 'processing'}}; }}});
  await runProviderWorkerOnce(database.db, {...f, owner: 'pending-callback-worker', now: f.now, providerFactory, materialize});
  const attempt = (await database.pool.query(`select id,client_reference from app.submission_attempts where task_id=$1`, [f.taskId])).rows[0];
  const catalog = (await import('../../src/config/provider-models.ts')).getProviderModel('replicate-wan22-t2v');
  const verified = {eventId: `terminal-${randomUUID()}`, accountId: 'fixture-account', attemptNonce: String(attempt.client_reference), authenticatedAt: f.now.toISOString(), observation: {ref: {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId, catalog}, status: 'completed' as const, observedAt: f.now.toISOString(), evidence: {code: 'replicate.completed'}}};
  const rawBody = new TextEncoder().encode(JSON.stringify({id: requestId, status: 'succeeded'}));
  return {f, attempt, verified, rawBody};
}

test('actual PostgreSQL stale-lease callback processing rolls back inbox and task together', async () => {
  const {f, attempt, verified, rawBody} = await pendingCallbackFixture();
  await ingestProviderWebhook(database.db, {provider: 'replicate', rawBody, verified, now: f.now});
  const now = new Date(f.now.getTime() + 2_000);
  const lease = (await claimOutbox(database.db, 'current-inbox-owner', now, {eventType: 'generation.dispatch', workspaceId: f.workspaceId}))!;
  const input = {provider: 'replicate' as const, verified, actorUserId: f.userId, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: String(attempt.id), now};
  await assert.rejects(() => processProviderWebhook(database.db, {...input, outboxLease: {...lease, token: randomUUID()}}), /lease/);
  assert.equal((await snapshot(f)).status, 'submitted');
  const unchanged = await database.pool.query(`select status from app.provider_webhook_inbox where external_event_id=$1`, [verified.eventId]);
  assert.equal(unchanged.rows[0].status, 'received');
  await processProviderWebhook(database.db, {...input, outboxLease: lease});
  assert.equal((await snapshot(f)).status, 'materializing');
});

test('terminal inbox drain quarantines a late completion without reopening credits', async () => {
  const {f, attempt, verified, rawBody} = await pendingCallbackFixture();
  await settleGenerationTask(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId, taskId: f.taskId, idempotencyKey: randomUUID(), outcome: 'failed', failureCode: 'fixture.timeout', providerCostEvidence: {state: 'unknown'}, internalWorker: true, now: f.now});
  const before = await snapshot(f);
  await ingestProviderWebhook(database.db, {provider: 'replicate', rawBody, verified, now: f.now});
  assert.equal((await runProviderWorkerOnce(database.db, {...f, owner: 'terminal-dispatch', now: f.now, materialize})).claimed, false);
  const drained = await drainTerminalProviderWebhookInbox(database.db, {workspaceId: f.workspaceId, now: f.now});
  assert.equal(drained.quarantined, 1);
  assert.deepEqual(await snapshot(f), before);
  assert.equal((await drainTerminalProviderWebhookInbox(database.db, {workspaceId: f.workspaceId, now: f.now})).scanned, 0);
});


test('JPEG image2 support does not permit a forged PNG MIME declaration', async () => {
  const f = await fixture();
  const path = join(root, `mime-fixture-${randomUUID()}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720', '-frames:v', '1', '-threads', '1', path], {timeout: 15_000, windowsHide: true});
  await assert.rejects(async () => uploadInputAsset(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId, store: f.store, bytes: new Uint8Array(await readFile(path)), mime: 'image/png', now: f.now}), /decoded safely/);
});

test('self-hosted restart drains a multi-batch overdue backlog before any provider transport', async () => {
  const f = await fixture();
  await issueGrant(database.db, {actorUserId: f.userId, workspaceId: f.workspaceId, commandName: 'worker-fixture.backlog', commandKey: randomUUID(), businessKey: randomUUID(), source: 'demo', amount: 1000n, payload: {fixture: true}});
  const ids: string[] = [];
  for (let i = 0; i < 101; i++) {
    const task = await createGenerationTask(database.db, {actor: {userId: f.userId}, workspaceId: f.workspaceId,
      idempotencyKey: randomUUID(), quote: createServerQuote('replicate-wan22-t2v', '1', {profile: 'acceptance', now: f.now}),
      profile: 'acceptance', acceptanceWorkspaceId: f.workspaceId, input: {prompt: 'Overdue restoration fixture', options: {aspectRatio: '16:9'}}, now: f.now});
    ids.push(task.value.taskId);
  }
  await database.pool.query(`update app.generation_tasks set deadline_at=$1,queue_deadline_at=$1 where id=any($2::uuid[]) and workspace_id=$3`, [new Date(f.now.getTime() - 1), ids, f.workspaceId]);
  let calls = 0;
  const providerFactory: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['providerFactory']> = () => createReplicateProvider({mode: 'live', token: 'fixture', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport: {async request() {
    calls++;
    const pending = await database.pool.query(`select count(*)::int as count from app.generation_tasks where id=any($1::uuid[]) and status not in ('failed','succeeded','cancelled')`, [ids]);
    assert.equal(pending.rows[0].count, 0, 'All overdue batches must settle before the first network operation.');
    return {status: 422, body: {detail: 'Deterministic fixture rejection'}};
  }}});
  await runProviderWorkerOnce(database.db, {...f, owner: 'restored-self-hosted-worker', now: f.now, providerFactory, materialize});
  const released = await database.pool.query(`select count(*)::int as count from app.credit_reservations where task_id=any($1::uuid[]) and status='released'`, [ids]);
  assert.equal(released.rows[0].count, 101);
  assert.equal(calls, 1);
  await runProviderWorkerOnce(database.db, {...f, owner: 'second-restored-worker', now: f.now, providerFactory, materialize});
  assert.equal(calls, 1, 'Restart does not resubmit already terminal work.');
});
