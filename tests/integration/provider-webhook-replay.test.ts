import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, before, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../src/db/schema/index.ts';
import type {DatabaseHandle} from '../../src/db/client.ts';
import {confirmReplicateAccountBinding} from '../../src/adapters/providers/replicate/account-binding.ts';
import {createReplicateProvider, type ReplicateRequest} from '../../src/adapters/providers/replicate/index.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';
import {createLocalObjectStore} from '../../src/adapters/storage/local.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {parseProviderWorkerConfig} from '../../src/config/provider-worker.ts';
import {issueGrant} from '../../src/modules/credits/ledger.ts';
import {materializeOutput} from '../../src/modules/assets/ingest.ts';
import {createGenerationTask} from '../../src/modules/generation/create.ts';
import {settleGenerationTask} from '../../src/modules/generation/lifecycle.ts';
import {claimOutbox, releaseOutbox} from '../../src/modules/generation/outbox.ts';
import {runProviderWorkerOnce} from '../../src/modules/generation/provider-worker.ts';
import {drainTerminalProviderWebhookInbox, ingestProviderWebhook, processProviderWebhook} from '../../src/modules/generation/provider-webhooks.ts';
import type {WebhookCrashInput, WebhookCrashResult} from '../fixtures/provider-webhook-crash-child.ts';

// Run with PROVIDER_WORKER_TEST_ADMIN_DATABASE_URL only; never load an application
// env file or fall back to DATABASE_URL. Every HTTP request below is in-memory.
const databaseName = `shpitto_webhook_replay_${randomUUID().replaceAll('-', '')}`;
const catalog = getProviderModel('replicate-wan22-t2v');
const accountId = 'user:replay-fixture';
const token = 'replay-fixture-token';
const webhookBaseUrl = 'https://app.example.test/api/webhooks/replicate';
let admin: Client | undefined;
let database: DatabaseHandle | undefined;
let databaseUrl: string;
let createdDatabase = false;
let root: string | undefined;
let media: Uint8Array;

function connectFixture(): DatabaseHandle {
  const pool = new Pool({connectionString: databaseUrl, max: 12, connectionTimeoutMillis: 5_000, statement_timeout: 15_000});
  return {pool, db: drizzle(pool, {schema})};
}
function handle(): DatabaseHandle { assert.ok(database); return database; }

function crashChild(input: WebhookCrashInput): Promise<WebhookCrashResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../fixtures/provider-webhook-crash-child.ts', import.meta.url))], {
      env: {NODE_ENV: 'test'}, serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    });
    let result: WebhookCrashResult | undefined, stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Webhook crash child exceeded 30 seconds.')); }, 30_000);
    child.stderr!.on('data', chunk => { stderr = (stderr + String(chunk)).slice(0, 4_000); });
    child.once('message', (message: WebhookCrashResult) => { result = message; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      try {
        assert.equal(signal, null, stderr);
        assert.equal(code, input.phase === 'receive' ? 86 : 0, stderr);
        assert.ok(result, 'Child must report committed work before exiting.');
        assert.equal(result.phase, input.phase);
        assert.notEqual(result.pid, process.pid);
        resolveResult(result);
      } catch (error) { reject(error); }
    });
    child.send!(input, error => { if (error) { child.kill('SIGKILL'); reject(error); } });
  });
}

before(async () => {
  const configured = process.env.PROVIDER_WORKER_TEST_ADMIN_DATABASE_URL;
  assert.ok(configured, 'An explicit disposable local PostgreSQL admin URL is required.');
  const url = new URL(configured);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && ['55432', '55433'].includes(url.port), 'Only local test ports 55432/55433 are allowed.');
  assert.equal(url.search + url.hash, '', 'Connection overrides are forbidden.');
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 5_000});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  createdDatabase = true;
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();
  const migration = new Client({connectionString: databaseUrl});
  try {
    await migration.connect();
    await migration.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
    await migrate(drizzle(migration), {migrationsFolder: resolve('src/db/migrations')});
  } finally { await migration.end(); }
  database = connectFixture();
  root = await mkdtemp(join(tmpdir(), 'shpitto-webhook-replay-'));
  media = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
});

after(async () => {
  try { await database?.pool.end(); }
  finally {
    try { if (createdDatabase) await admin!.query(`drop database "${databaseName}" with (force)`); }
    finally {
      await admin?.end();
      if (root) {
        assert.equal(dirname(root), resolve(tmpdir()));
        assert.match(root, /shpitto-webhook-replay-/);
        await rm(root, {recursive: true, force: true});
      }
    }
  }
});

// Documented Replicate prediction shape, matching the boundary contract fixture:
// https://replicate.com/docs/reference/http#predictions.get
// https://replicate.com/docs/topics/webhooks/verify-webhook
// Account comes from GET /account + /webhooks/default/secret preflight, nonce from
// the issued callback URL. Neither account_id nor metadata is a prediction field.
function prediction(requestId: string, now: Date, status: 'processing' | 'succeeded') {
  return {id: requestId, model: catalog.endpoint, version: catalog.modelVersion,
    input: {prompt: 'Authenticated inbox replay fixture'}, output: status === 'succeeded' ? 'https://replicate.delivery/fixture/output.mp4' : null,
    data_removed: false, error: null, status, created_at: now.toISOString(),
    urls: {web: `https://replicate.com/p/${requestId}`, get: `https://api.replicate.com/v1/predictions/${requestId}`, cancel: `https://api.replicate.com/v1/predictions/${requestId}/cancel`}};
}
function signed(rawBody: Uint8Array, messageId: string, now: Date, secret: string) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${messageId}.${timestamp}.`).update(rawBody).digest('base64');
  return new Headers({'webhook-id': messageId, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}`});
}

const materialize: NonNullable<Parameters<typeof runProviderWorkerOnce>[1]['materialize']> = (db, input) => materializeOutput(db, {...input, bytes: media, mime: 'video/mp4'});

async function fixture() {
  const {pool, db} = handle();
  const workspaceId = randomUUID(), userId = `webhook-${randomUUID()}`, now = new Date();
  await pool.query(`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,$3,$3)`, [userId, `${userId}@example.test`, now]);
  await pool.query(`insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Webhook fixture',$2,$3,$3)`, [workspaceId, userId, now]);
  await pool.query(`insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',$3)`, [workspaceId, userId, now]);
  await pool.query(`insert into app.credit_accounts (workspace_id,version,created_at,updated_at) values ($1,0,$2,$2)`, [workspaceId, now]);
  await pool.query(`insert into app.billing_accounts (workspace_id,status,version,created_at,updated_at) values ($1,'active',1,$2,$2)`, [workspaceId, now]);
  await issueGrant(db, {actorUserId: userId, workspaceId, commandName: 'webhook-fixture.grant', commandKey: randomUUID(), businessKey: randomUUID(), source: 'demo', amount: 100n, payload: {fixture: true}});
  const created = await createGenerationTask(db, {actor: {userId}, workspaceId, idempotencyKey: randomUUID(),
    quote: createServerQuote(catalog.modelKey, '1', {profile: 'acceptance', now}), profile: 'acceptance', acceptanceWorkspaceId: workspaceId,
    input: {prompt: 'Authenticated inbox replay fixture', options: {aspectRatio: '16:9'}}, now});
  const config = parseProviderWorkerConfig({runtimeProfile: 'acceptance', generationDriver: 'provider', storageDriver: 's3', railwayProjectId: 'fixture-project', expectedProjectId: 'fixture-project', workspaceId, state: 'active', allowCreate: 'true', modelKeys: catalog.modelKey, pollMs: '1000'});
  const requestId = `prediction-${randomUUID()}`, secret = `whsec_${Buffer.from(`fixture-key-${randomUUID()}`).toString('base64')}`;
  const requests: ReplicateRequest[] = [];
  let completed = false;
  const transport = {async request(request: ReplicateRequest) {
    requests.push(request);
    assert.equal(request.retry, false);
    assert.equal(request.headers.Authorization, `Bearer ${token}`);
    if (request.url.endsWith('/account')) { assert.equal(request.method, 'GET'); return {status: 200, body: {type: 'user', username: 'replay-fixture'}}; }
    if (request.url.endsWith('/webhooks/default/secret')) { assert.equal(request.method, 'GET'); return {status: 200, body: {key: secret}}; }
    if (request.method === 'POST') {
      assert.equal(request.url, 'https://api.replicate.com/v1/predictions');
      const fence = (await pool.query('select submission_started_at from app.generation_tasks where id=$1', [created.value.taskId])).rows[0];
      assert.ok(fence.submission_started_at);
      return {status: 201, body: prediction(requestId, now, 'processing')};
    }
    assert.equal(request.url, `https://api.replicate.com/v1/predictions/${requestId}`);
    return {status: 200, body: prediction(requestId, now, completed ? 'succeeded' : 'processing')};
  }};
  const options = {transport, token, webhookSecret: secret, webhookAccountId: accountId, webhookBaseUrl};
  const binding = await confirmReplicateAccountBinding({...options, now});
  assert.equal(binding.accountId, accountId);
  assert.deepEqual(requests.map(r => r.url), ['https://api.replicate.com/v1/account', 'https://api.replicate.com/v1/webhooks/default/secret']);
  const provider = createReplicateProvider({...options, mode: 'live', acceptanceScope: {workspaceId, modelKeys: [catalog.modelKey]}});
  assert.ok(root);
  const store = createLocalObjectStore(join(root, workspaceId));
  const worker = {config, store, providerFactory: () => provider, materialize};
  assert.equal((await runProviderWorkerOnce(db, {...worker, owner: 'initial-submit', now})).claimed, true);
  const attempt = (await pool.query('select id,client_reference from app.submission_attempts where task_id=$1 and workspace_id=$2', [created.value.taskId, workspaceId])).rows[0];
  const nonce = String(attempt.client_reference);
  assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(requests.find(r => r.method === 'POST')!.body!.webhook, `${webhookBaseUrl}/${nonce}`);
  return {workspaceId, userId, now, taskId: created.value.taskId, attemptId: String(attempt.id), nonce, requestId, secret, binding, requests, options, worker,
    ref: {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId, catalog}, complete: () => { completed = true; }};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function callback(f: Fixture, status: 'processing' | 'succeeded' = 'succeeded', messageId: string = randomUUID(), requestId = f.requestId, nonce = f.nonce) {
  const rawBody = Buffer.from(JSON.stringify(prediction(requestId, f.now, status)), 'utf8');
  const headers = signed(rawBody, messageId, f.now, f.secret);
  const verified = verifyReplicateWebhook(rawBody, headers, f.ref, {secret: f.secret, binding: f.binding, expectedAttemptNonce: nonce, now: f.now});
  return {rawBody, headers, verified};
}
function ingest(f: Fixture, event: ReturnType<typeof callback>) {
  return ingestProviderWebhook(handle().db, {provider: 'replicate', rawBody: event.rawBody, verified: event.verified, now: f.now});
}
async function snapshot(f: Fixture) {
  return (await handle().pool.query(`select t.status,r.status as reservation,g.available::text,g.reserved::text,g.consumed::text,
    (select count(*)::int from app.credit_ledger_entries where workspace_id=$2 and entry_type='consume') as consumes,
    (select count(*)::int from app.credit_ledger_entries where workspace_id=$2 and entry_type='refund') as refunds,
    (select count(*)::int from app.audit_events where workspace_id=$2 and command_name in ('credits.consumed','credits.failed')) as settlements,
    (select count(*)::int from app.outbox_events where workspace_id=$2 and event_type in ('credit.reservation_consumed','credit.reservation_failed')) as events
    from app.generation_tasks t join app.credit_reservations r on r.task_id=t.id and r.workspace_id=t.workspace_id
    join app.credit_grants g on g.workspace_id=t.workspace_id where t.id=$1 and t.workspace_id=$2`, [f.taskId, f.workspaceId])).rows[0];
}
const consumed = {status: 'succeeded', reservation: 'consumed', available: '90', reserved: '0', consumed: '10', consumes: 1, refunds: 0, settlements: 1, events: 1};
async function inbox(f: Fixture) {
  return (await handle().pool.query('select external_event_id,status,payload_hash,payload,processed_at from app.provider_webhook_inbox where provider=$1 and provider_request_id=$2 order by external_event_id', ['replicate', f.requestId])).rows;
}
async function leaseFor(f: Fixture) {
  const now = new Date(f.now.getTime() + 2_000);
  const lease = await claimOutbox(handle().db, `restarted-${randomUUID()}`, now, {eventType: 'generation.dispatch', workspaceId: f.workspaceId});
  assert.ok(lease);
  return {provider: 'replicate' as const, actorUserId: f.userId, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: f.attemptId, outboxLease: lease, now};
}
async function finish(f: Fixture, input: Awaited<ReturnType<typeof leaseFor>>) {
  assert.equal(await releaseOutbox(handle().db, input.outboxLease, input.now, input.now), true);
  f.complete();
  const results = await Promise.all(Array.from({length: 10}, (_, i) => runProviderWorkerOnce(handle().db, {...f.worker, owner: `settlement-race-${i}`, now: input.now})));
  assert.equal(results.filter(r => r.claimed).length, 1);
  assert.deepEqual(await snapshot(f), consumed);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal((await handle().pool.query("select count(*)::int as n from app.assets where task_id=$1 and workspace_id=$2 and purpose='output' and state='ready'", [f.taskId, f.workspaceId])).rows[0].n, 1);
}

for (let iteration = 1; iteration <= 3; iteration++) test(`M4 signed replay/crash race ${iteration}: 20 exact replays, ten receivers/processors/settlers`, async () => {
  const f = await fixture();
  const event = callback(f);
  const before = await snapshot(f);
  assert.equal(before.status, 'submitted');
  assert.equal(before.reservation, 'active');
  assert.equal(before.settlements, 0);
  const reception = await crashChild({phase: 'receive', databaseUrl, workspaceId: f.workspaceId, eventId: event.verified.eventId, now: f.now.toISOString(),
    rawBody: event.rawBody.toString('base64'), headers: [...event.headers], nonce: f.nonce, requestId: f.requestId, secret: f.secret, modelKey: catalog.modelKey});
  assert.ok(reception.phase === 'receive');
  const {receipts} = reception;
  assert.equal(receipts.filter(r => !r.duplicate).length, 1);
  assert.equal(receipts.filter(r => r.duplicate).length, 9);
  assert.deepEqual(receipts.find(r => !r.duplicate), {eventId: event.verified.eventId, duplicate: false, acknowledged: true, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: f.attemptId, status: 'received'});
  assert.ok(receipts.every(r => r.acknowledged && r.status === 'received'));

  // The receiver has exited with code 86 and no graceful pool cleanup. Read its
  // committed receipt independently before starting any processing process.
  const restarted = new Client({connectionString: databaseUrl});
  type Receipt = {external_event_id: string; status: string; payload_hash: string; processed_at: Date | null; payload: {status: 'completed'; accountId: string; attemptNonce: string}};
  try {
    await restarted.connect();
    const rows = (await restarted.query<Receipt>('select external_event_id,status,payload_hash,payload,processed_at from app.provider_webhook_inbox where external_event_id=$1', [event.verified.eventId])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'received');
    assert.equal(rows[0].processed_at, null);
    assert.equal(rows[0].payload_hash, createHash('sha256').update(event.rawBody).digest('hex'));
    assert.equal(rows[0].payload.accountId, accountId);
    assert.equal(rows[0].payload.attemptNonce, f.nonce);
    assert.equal(rows[0].payload.status, 'completed');
  } finally { await restarted.end(); }
  assert.deepEqual(await snapshot(f), before, 'Acknowledgement persists evidence without settling credits.');
  for (let i = 0; i < 20; i++) {
    const replay = callback(f, 'succeeded', event.verified.eventId);
    assert.deepEqual(replay.rawBody, event.rawBody);
    assert.deepEqual([...replay.headers], [...event.headers]);
    assert.equal((await ingest(f, replay)).duplicate, true);
  }
  await assert.rejects(() => ingest(f, callback(f, 'processing', event.verified.eventId)), /different payload/i);
  assert.equal((await inbox(f)).length, 1);
  const now = new Date(f.now.getTime() + 2_000);
  const recovery = await crashChild({phase: 'resume', databaseUrl, workspaceId: f.workspaceId, eventId: event.verified.eventId, now: now.toISOString()});
  assert.ok(recovery.phase === 'resume');
  assert.notEqual(recovery.pid, reception.pid);
  assert.equal(recovery.outcomes.filter(status => status === 'processed').length, 1);
  assert.equal(recovery.outcomes.filter(status => status === 'replayed').length, 9);
  const input = {provider: 'replicate' as const, actorUserId: f.userId, workspaceId: f.workspaceId, taskId: f.taskId, attemptId: f.attemptId, outboxLease: recovery.lease, now};
  assert.equal((await snapshot(f)).status, 'materializing');
  assert.equal((await snapshot(f)).settlements, 0);
  await finish(f, input);
  assert.equal((await ingest(f, event)).status, 'processed');
  assert.equal((await inbox(f)).length, 1);
  assert.equal((await inbox(f))[0].status, 'processed');
  assert.ok((await inbox(f))[0].processed_at);
  assert.deepEqual(await snapshot(f), consumed);
});

test('M4 signed identity, issued nonce, account and key rejection leave inbox and credits unchanged', async () => {
  const f = await fixture(), before = await snapshot(f);
  assert.throws(() => callback(f, 'succeeded', randomUUID(), `wrong-${randomUUID()}`), /request identity/i);
  const unknownRequest = `unknown-${randomUUID()}`;
  const rawBody = Buffer.from(JSON.stringify(prediction(unknownRequest, f.now, 'succeeded')), 'utf8');
  const messageId = randomUUID();
  const verified = verifyReplicateWebhook(rawBody, signed(rawBody, messageId, f.now, f.secret), {...f.ref, requestId: unknownRequest}, {secret: f.secret, binding: f.binding, expectedAttemptNonce: f.nonce, now: f.now});
  await assert.rejects(() => ingestProviderWebhook(handle().db, {provider: 'replicate', rawBody, verified, now: f.now}), /not linked/i);
  await assert.rejects(() => ingest(f, callback(f, 'succeeded', randomUUID(), f.requestId, randomUUID())), /nonce/i);
  const foreign = await fixture();
  await assert.rejects(() => ingest(f, callback(f, 'succeeded', randomUUID(), f.requestId, foreign.nonce)), /nonce/i);
  const valid = callback(f);
  const otherKey = `whsec_${Buffer.from('foreign-account-signing-key').toString('base64')}`;
  assert.throws(() => verifyReplicateWebhook(valid.rawBody, signed(valid.rawBody, valid.verified.eventId, f.now, otherKey), f.ref, {secret: f.secret, binding: f.binding, expectedAttemptNonce: f.nonce, now: f.now}), /signature/i);
  for (const mismatch of ['account', 'key']) {
    const methods: string[] = [];
    const transport = {async request(request: ReplicateRequest) {
      methods.push(request.method);
      return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: mismatch === 'account' ? 'foreign-owner' : 'replay-fixture'} : {key: otherKey}};
    }};
    const receiver = createReplicateProvider({...f.options, transport, mode: 'test'});
    await assert.rejects(() => receiver.verifyWebhook(valid.rawBody, valid.headers, f.ref, {attemptNonce: f.nonce}), /binding.*(account|signing key)/i);
    assert.deepEqual(methods, mismatch === 'account' ? ['GET'] : ['GET', 'GET']);
  }
  assert.equal((await inbox(f)).length, 0);
  assert.deepEqual(await snapshot(f), before);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 1);
});

test('M4 completed/running reordering preserves materialization and terminal immutability', async () => {
  for (const statuses of [['processing', 'succeeded'], ['succeeded', 'processing']] as const) {
    const f = await fixture(), input = await leaseFor(f);
    let completed = false;
    for (const status of statuses) {
      const event = callback(f, status);
      await ingest(f, event);
      assert.equal((await processProviderWebhook(handle().db, {...input, verified: event.verified})).status, 'processed');
      completed ||= status === 'succeeded';
      assert.equal((await snapshot(f)).status, completed ? 'materializing' : 'submitted');
    }
    await finish(f, input);
    const terminal = await snapshot(f), calls = f.requests.length;
    for (const status of ['processing', 'succeeded'] as const) await ingest(f, callback(f, status));
    const drained = await drainTerminalProviderWebhookInbox(handle().db, {workspaceId: f.workspaceId, now: input.now});
    assert.deepEqual(drained, {scanned: 2, processed: 2, quarantined: 1, replayed: 0, failed: 0});
    assert.deepEqual(await snapshot(f), terminal);
    assert.equal(f.requests.length, calls);
    assert.equal((await inbox(f)).filter(r => r.status === 'processed').length, 4);
    assert.equal((await drainTerminalProviderWebhookInbox(handle().db, {workspaceId: f.workspaceId, now: input.now})).scanned, 0);
  }
});

test('M4 late signed completion after refund is quarantined without another provider POST', async () => {
  const f = await fixture(), input = await leaseFor(f);
  await settleGenerationTask(handle().db, {...input, actor: {userId: f.userId}, idempotencyKey: randomUUID(), outcome: 'failed', failureCode: 'fixture.timeout', providerCostEvidence: {state: 'unknown'}, internalWorker: true});
  const refunded = await snapshot(f), calls = f.requests.length;
  assert.deepEqual(refunded, {status: 'failed', reservation: 'released', available: '100', reserved: '0', consumed: '0', consumes: 0, refunds: 1, settlements: 1, events: 1});
  const event = callback(f);
  await ingest(f, event);
  assert.equal((await runProviderWorkerOnce(handle().db, {...f.worker, owner: 'late-completion', now: input.now})).claimed, false);
  assert.deepEqual(await drainTerminalProviderWebhookInbox(handle().db, {workspaceId: f.workspaceId, now: input.now}), {scanned: 1, processed: 1, quarantined: 1, replayed: 0, failed: 0});
  assert.equal((await handle().pool.query('select count(*)::int as n from app.generation_quarantine where task_id=$1 and workspace_id=$2', [f.taskId, f.workspaceId])).rows[0].n, 1);
  assert.equal((await ingest(f, event)).duplicate, true);
  assert.equal((await drainTerminalProviderWebhookInbox(handle().db, {workspaceId: f.workspaceId, now: input.now})).scanned, 0);
  assert.deepEqual(await snapshot(f), refunded);
  assert.equal(f.requests.length, calls);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 1);
});
