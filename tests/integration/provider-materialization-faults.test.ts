import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {after, before, mock, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand} from '@aws-sdk/client-s3';
import * as schema from '../../src/db/schema/index.ts';
import type {DatabaseHandle} from '../../src/db/client.ts';
import {createReplicateProvider, type ReplicateRequest} from '../../src/adapters/providers/replicate/index.ts';
import {createFalProvider} from '../../src/adapters/providers/fal/index.ts';
import {createLocalObjectStore} from '../../src/adapters/storage/local.ts';
import type {PrivateObjectStore} from '../../src/adapters/storage/port.ts';
import {createS3ObjectStore, type S3CommandClient} from '../../src/adapters/storage/s3-object-store.ts';
import type {HostResolver, RemoteFetch} from '../../src/adapters/storage/s3.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {parseProviderWorkerConfig} from '../../src/config/provider-worker.ts';
import {authorizeAsset} from '../../src/modules/assets/authorize.ts';
import {cleanupOrphanedAssetsDetailed, ORPHAN_RETENTION_MS} from '../../src/modules/assets/cleanup.ts';
import {createGenerationTask} from '../../src/modules/generation/create.ts';
import {issueGrant} from '../../src/modules/credits/ledger.ts';
import {runProviderWorkerOnce} from '../../src/modules/generation/provider-worker.ts';
import {settleGenerationTask} from '../../src/modules/generation/lifecycle.ts';
import {materializeProviderOutput} from '../../src/trigger/materialize.ts';

// No env-file loader or application DATABASE_URL fallback: create/drop only this
// suite's random database on an explicitly supplied loopback test service.
const databaseName = `shpitto_materialization_${randomUUID().replaceAll('-', '')}`;
const outputUrl = 'https://93.184.216.34/materialization-fixture.mp4';
const webhookSecret = `whsec_${Buffer.from('materialization-only-fake-signing-key').toString('base64')}`;
let database: DatabaseHandle;
let admin: Client | undefined;
let createdDatabase = false;
let root: string | undefined;
let media: Uint8Array;

before(async () => {
  const configured = process.env.PROVIDER_MATERIALIZATION_TEST_ADMIN_DATABASE_URL;
  assert.ok(configured, 'Set PROVIDER_MATERIALIZATION_TEST_ADMIN_DATABASE_URL to a disposable local PostgreSQL admin URL.');
  const url = new URL(configured);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1', 'Only a literal loopback address is allowed; no DNS or cloud database.');
  assert.ok(Number(url.port) >= 1024, 'Use an explicit non-system test port.');
  assert.equal(url.pathname, '/postgres', 'The admin connection must name postgres, never an application database.');
  assert.equal(url.search + url.hash, '', 'Connection overrides are forbidden.');
  mock.method(globalThis, 'fetch', async () => assert.fail('Uninjected network fetch is forbidden in this suite.'));
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 5_000});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  createdDatabase = true;
  url.pathname = `/${databaseName}`;
  const migration = new Client({connectionString: url.toString()});
  try {
    await migration.connect();
    await migration.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
    await migrate(drizzle(migration), {migrationsFolder: resolve('src/db/migrations')});
  } finally { await migration.end(); }
  const pool = new Pool({connectionString: url.toString(), max: 8, connectionTimeoutMillis: 5_000, statement_timeout: 15_000});
  database = {pool, db: drizzle(pool, {schema})};
  // A real PG trigger fails the publication INSERT, not a mocked transaction.
  // These objects exist only in this suite's disposable database.
  await pool.query(`create table app.materialization_test_faults (task_id uuid primary key);
    create function app.reject_materialization_test_output() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from app.materialization_test_faults where task_id=new.task_id) then
        raise exception 'fixture-publication-fault';
      end if;
      return new;
    end; $$;
    create trigger materialization_test_publication before insert on app.assets
      for each row execute function app.reject_materialization_test_output()`);
  root = await mkdtemp(join(tmpdir(), 'shpitto-materialization-'));
  media = new Uint8Array(await readFile(resolve('tests/fixtures/video/local-demo.mp4')));
});

after(async () => {
  try { await database?.pool.end(); }
  finally {
    try { if (createdDatabase) await admin!.query(`drop database "${databaseName}" with (force)`); }
    finally {
      await admin?.end();
      mock.restoreAll();
      if (root) {
        assert.equal(dirname(root), resolve(tmpdir()));
        assert.match(root, /shpitto-materialization-/);
        await rm(root, {recursive: true, force: true});
      }
    }
  }
});

async function fixture(modelKey = 'replicate-wan22-t2v', driver: 'local' | 's3' = 'local', source: 'demo' | 'subscription' = 'demo') {
  const workspaceId = randomUUID();
  const userId = `materialization-${randomUUID()}`;
  const now = new Date();
  await database.pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,$3,$3)', [userId, `${userId}@example.test`, now]);
  await database.pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Materialization fixture',$2,$3,$3)", [workspaceId, userId, now]);
  await database.pool.query("insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',$3)", [workspaceId, userId, now]);
  await database.pool.query('insert into app.credit_accounts (workspace_id,version,created_at,updated_at) values ($1,0,$2,$2)', [workspaceId, now]);
  await database.pool.query("insert into app.billing_accounts (workspace_id,status,version,created_at,updated_at) values ($1,'active',1,$2,$2)", [workspaceId, now]);
  const grant = await issueGrant(database.db, {actorUserId: userId, workspaceId, commandName: 'materialization-fixture.grant', commandKey: randomUUID(), businessKey: randomUUID(), source, amount: 100n, expiresAt: source === 'subscription' ? new Date(now.getTime() + 30_000) : null, payload: {fixture: true}});
  const task = await createGenerationTask(database.db, {actor: {userId}, workspaceId, idempotencyKey: randomUUID(), quote: createServerQuote(modelKey, '1', {profile: 'acceptance', now}), profile: 'acceptance', acceptanceWorkspaceId: workspaceId, input: {prompt: 'Materialization fault fixture', options: {aspectRatio: '16:9'}}, now});
  const config = parseProviderWorkerConfig({runtimeProfile: 'acceptance', generationDriver: 'provider', storageDriver: 's3', railwayProjectId: 'materialization-fixture', expectedProjectId: 'materialization-fixture', workspaceId, state: 'active', allowCreate: 'true', modelKeys: modelKey, pollMs: '1000'});
  const storage = storageFixture(driver);
  return {workspaceId, userId, grantId: grant.grantId, taskId: task.value.taskId, reservationId: task.value.reservationId, now, config, store: storage.store, storage};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function snapshot(f: Fixture) {
  return (await database.pool.query(`select t.status,t.materialization_attempts,t.failure_code,t.provider_cost_state,
    r.status as reservation,g.available::text,g.reserved::text,g.consumed::text
    from app.generation_tasks t join app.credit_reservations r on r.task_id=t.id
    join app.credit_grants g on g.workspace_id=t.workspace_id where t.id=$1 and t.workspace_id=$2 and g.id=$3`, [f.taskId, f.workspaceId, f.grantId])).rows[0];
}

function providerFixture(f: Fixture) {
  let creates = 0;
  let reads = 0;
  let unavailable = false;
  let resultUrl = outputUrl;
  const requestId = `materialization-${randomUUID()}`;
  const isReplicate = f.config.modelKeys[0].startsWith('replicate-');
  const transport = {async request(request: ReplicateRequest) {
    assert.equal(request.retry, false);
    if (isReplicate && request.url === 'https://api.replicate.com/v1/account') return {status: 200, body: {type: 'user', username: 'materialization-fixture'}};
    if (isReplicate && request.url === 'https://api.replicate.com/v1/webhooks/default/secret') return {status: 200, body: {key: webhookSecret}};
    if (request.method === 'POST') {
      assert.equal(request.url, isReplicate ? 'https://api.replicate.com/v1/predictions' : 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video');
      assert.equal(++creates, 1, 'A materialization retry must never create a second prediction.');
      return isReplicate ? {status: 201, body: {id: requestId}} : {status: 200, body: {request_id: requestId}};
    }
    reads++;
    if (isReplicate) {
      assert.equal(request.url, `https://api.replicate.com/v1/predictions/${requestId}`);
      return {status: 200, body: {id: requestId, status: 'succeeded', output: unavailable ? null : resultUrl}};
    }
    assert.ok([`https://queue.fal.run/fal-ai/wan/requests/${requestId}`, `https://queue.fal.run/fal-ai/wan/requests/${requestId}/status`].includes(request.url));
    return request.url.endsWith('/status')
      ? {status: 200, body: {request_id: requestId, status: 'COMPLETED'}}
      : {status: 200, body: {video: unavailable ? {} : {url: resultUrl}}};
  }};
  const providerFactory = () => isReplicate
    ? createReplicateProvider({mode: 'live', token: 'materialization-fake-token', webhookBaseUrl: 'https://app.example.test/api/webhooks/replicate', webhookAccountId: 'user:materialization-fixture', webhookSecret, acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport})
    : createFalProvider({mode: 'live', token: 'materialization-fake-token', acceptanceScope: {workspaceId: f.workspaceId, modelKeys: f.config.modelKeys}, transport});
  return {providerFactory, requestId, counts: () => ({creates, reads}), output: () => resultUrl,
    refreshResult: () => { resultUrl = `${outputUrl}?revision=2`; }, setUnavailable: (value: boolean) => { unavailable = value; }};
}

type Fault = 'download' | 'expired-url' | 'stream' | 'put' | 'lost-put-response' | 'probe-read' | 'corrupt-media' | 'publication' | 'cleanup-delete' | 'unavailable-result';

function storageFixture(driver: 'local' | 's3') {
  const disk = createLocalObjectStore(root!);
  const commands: string[] = [];
  const client: S3CommandClient = {async send(command) {
    commands.push((command as object).constructor.name);
    if (command instanceof PutObjectCommand) {
      assert.equal(command.input.Bucket, 'materialization-fixture');
      await disk.put(command.input.Key!, new Uint8Array(command.input.Body as Uint8Array), command.input.ContentType);
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const bytes = await disk.get(command.input.Key!).catch(() => { throw {name: 'NoSuchKey'}; });
      return {ContentLength: bytes.byteLength, Body: {transformToByteArray: async () => bytes}};
    }
    if (command instanceof HeadObjectCommand) {
      const head = await disk.head(command.input.Key!);
      if (!head) throw {name: 'NotFound'};
      return {ContentLength: head.bytes, LastModified: head.modifiedAt, ContentType: head.contentType};
    }
    if (command instanceof ListObjectsV2Command) return {Contents: (await disk.list(command.input.Prefix!.replace(/\/$/, ''), command.input.MaxKeys!, command.input.StartAfter)).map(Key => ({Key}))};
    if (command instanceof DeleteObjectCommand) { await disk.delete(command.input.Key!); return {}; }
    assert.fail('Unexpected S3 command; network fallback is forbidden.');
  }};
  const backing = driver === 'local' ? disk : createS3ObjectStore({endpoint: 'https://storage.example.test', region: 'fixture', bucket: 'materialization-fixture', accessKeyId: 'fixture-only', secretAccessKey: 'fixture-only'}, client);
  let fault: Fault | undefined;
  let putFaults = 0;
  let probeFaults = 0;
  let deleteFaults = 0;
  const puts: string[] = [];
  const deletes: string[] = [];
  const store: PrivateObjectStore = {
    driver,
    async put(key, bytes, mime) {
      if (key.includes('/outputs/')) {
        puts.push(key);
        if (fault === 'put') { putFaults++; throw new Error('fixture-put-fault'); }
      }
      await backing.put(key, bytes, mime);
      if (key.includes('/outputs/') && fault === 'lost-put-response') { putFaults++; throw new Error('fixture-committed-put-response-lost'); }
    },
    async get(key) {
      if (key.includes('/outputs/') && fault === 'probe-read') { probeFaults++; throw new Error('fixture-probe-read-fault'); }
      return backing.get(key);
    },
    async delete(key) {
      if (key.includes('/outputs/')) {
        deletes.push(key);
        if (fault === 'cleanup-delete') { deleteFaults++; throw new Error('fixture-cleanup-delete-fault'); }
      }
      await backing.delete(key);
    },
    head: key => backing.head(key),
    list: (prefix, limit, after) => backing.list(prefix, limit, after),
  };
  return {store, commands, puts, deletes, setFault: (value?: Fault) => { fault = value; }, counts: () => ({putFaults, probeFaults, deleteFaults})};
}

const profiles = ['replicate-wan22-t2v', 'fal-wan22-t2v'].flatMap(modelKey => (['local', 's3'] as const).map(driver => ({modelKey, driver})));

for (const {modelKey, driver} of profiles) test(`${modelKey}/${driver}: real adapter materialization uses isolated DNS, private ingestion and exactly one settlement`, async () => {
  const f = await fixture(modelKey, driver);
  const p = providerFixture(f);
  let resolutions = 0;
  const resolveHost: HostResolver = async (hostname) => {
    assert.equal(hostname, '93.184.216.34');
    resolutions++;
    return [{address: '93.184.216.34', family: 4}];
  };
  const fetcher: RemoteFetch = async (url, init) => {
    assert.equal(String(url), outputUrl);
    assert.equal(init?.redirect, 'manual');
    return new Response(Buffer.from(media), {headers: {'content-type': 'video/mp4'}});
  };
  await runProviderWorkerOnce(database.db, {...f, owner: 'materialization-first', providerFactory: p.providerFactory,
    materialize: (db, input) => materializeProviderOutput(db, {...input, fetcher, resolveHost})});
  assert.equal(resolutions, 1, 'The supplied DNS resolver must be used; tests must not resolve external hosts.');
  assert.deepEqual(await snapshot(f), {status: 'succeeded', materialization_attempts: 1, failure_code: null, provider_cost_state: 'unknown', reservation: 'consumed', available: '90', reserved: '0', consumed: '10'});
  const assets = (await database.pool.query<{id: string; object_key: string; sha256: string; bytes: string; duration_ms: number}>("select id,object_key,sha256,bytes::text,duration_ms from app.assets where task_id=$1 and state='ready'", [f.taskId])).rows;
  assert.equal(assets.length, 1);
  assert.equal(assets[0].sha256, createHash('sha256').update(media).digest('hex'));
  assert.equal(assets[0].bytes, String(media.byteLength));
  assert.equal(assets[0].duration_ms, 2000, 'The fixture is a real two-second video, not merely an MP4 signature.');
  await authorizeAsset(database.db, f.workspaceId, assets[0].id, {userId: f.userId});
  assert.deepEqual(Buffer.from(await f.store.get(assets[0].object_key)), Buffer.from(media));
  await runProviderWorkerOnce(database.db, {...f, owner: 'materialization-replay', now: new Date(f.now.getTime() + 60_000), providerFactory: p.providerFactory});
  assert.equal(p.counts().creates, 1);
  assert.equal((await database.pool.query("select count(*)::int as count from app.credit_ledger_entries where workspace_id=$1 and entry_type='consume'", [f.workspaceId])).rows[0].count, 1);
  await assertTerminalEffects(f, p.requestId, 'succeeded');
  if (driver === 's3') assert.ok(f.storage.commands.includes('PutObjectCommand') && f.storage.commands.includes('GetObjectCommand'));
});

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.message} ${error.cause ? errorText(error.cause) : ''}` : String(error);
}

async function assertTerminalEffects(f: Fixture, requestId: string, outcome: 'succeeded' | 'failed' | 'pending') {
  const terminal = (await database.pool.query(`select entry_type,grant_id,available_delta::text,reserved_delta::text,consumed_delta::text,expired_delta::text
    from app.credit_ledger_entries where workspace_id=$1 and entry_type in ('consume','refund','release')`, [f.workspaceId])).rows;
  assert.equal(terminal.length, outcome === 'pending' ? 0 : 1, 'Only one allocation may have one terminal ledger effect.');
  if (terminal[0]) {
    assert.equal(terminal[0].entry_type, outcome === 'succeeded' ? 'consume' : 'refund');
    assert.equal(terminal[0].grant_id, f.grantId, 'Settlement must use the original reserved grant, not an unrelated source.');
    assert.equal(terminal[0].reserved_delta, '-10');
    assert.equal(terminal[0].consumed_delta, outcome === 'succeeded' ? '10' : '0');
  }
  const attempts = (await database.pool.query('select provider_request_id,state from app.submission_attempts where task_id=$1', [f.taskId])).rows;
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].provider_request_id, requestId);
  if (outcome !== 'pending') assert.equal(attempts[0].state, outcome);
  const commands = (await database.pool.query("select status from app.command_results where workspace_id=$1 and command_name='generation.settle' and result->>'status' <> 'quarantined'", [f.workspaceId])).rows;
  assert.deepEqual(commands.map(row => row.status), outcome === 'pending' ? [] : ['committed']);
  const audits = (await database.pool.query("select command_name from app.audit_events where workspace_id=$1 and command_name in ('credits.consumed','credits.failed')", [f.workspaceId])).rows;
  assert.equal(audits.filter(row => row.command_name === (outcome === 'succeeded' ? 'credits.consumed' : 'credits.failed')).length, outcome === 'pending' ? 0 : 1);
  const events = (await database.pool.query("select event_type from app.outbox_events where workspace_id=$1 and event_type in ('credit.reservation_consumed','credit.reservation_failed')", [f.workspaceId])).rows;
  assert.deepEqual(events.map(row => row.event_type), outcome === 'pending' ? [] : [outcome === 'succeeded' ? 'credit.reservation_consumed' : 'credit.reservation_failed']);
  const outputs = (await database.pool.query("select id from app.assets where task_id=$1 and purpose='output'", [f.taskId])).rows;
  assert.equal(outputs.length, outcome === 'succeeded' ? 1 : 0, 'No partial/delivered asset may be published on a failed attempt.');
}

async function faultFixture(modelKey: string, driver: 'local' | 's3', fault: Fault, source: 'demo' | 'subscription' = 'demo') {
  const f = await fixture(modelKey, driver, source);
  const p = providerFixture(f);
  let active: Fault | undefined = fault;
  let downloads = 0;
  let resolutions = 0;
  f.storage.setFault(fault);
  p.setUnavailable(fault === 'unavailable-result');
  if (fault === 'publication' || fault === 'cleanup-delete') await database.pool.query('insert into app.materialization_test_faults (task_id) values ($1)', [f.taskId]);
  const resolveHost: HostResolver = async (hostname) => {
    assert.equal(hostname, '93.184.216.34');
    resolutions++;
    return [{address: '93.184.216.34', family: 4}];
  };
  const fetcher: RemoteFetch = async (url, init) => {
    assert.equal(String(url), p.output());
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'manual');
    downloads++;
    if (active === 'download') throw new Error('fixture-download-fault');
    if (active === 'expired-url') return new Response(null, {status: 403});
    if (active === 'stream') return new Response(new ReadableStream({start(controller) { controller.enqueue(media.slice(0, 12)); controller.error(new Error('fixture-stream-fault')); }}), {headers: {'content-type': 'video/mp4'}});
    // Keep a valid container signature: only the real ffprobe can reject this.
    const bytes = active === 'corrupt-media' ? media.slice(0, 12) : media;
    return new Response(Buffer.from(bytes), {headers: {'content-type': 'video/mp4', 'content-length': String(bytes.byteLength)}});
  };
  const run = (index: number, at = new Date(f.now.getTime() + index * 60_001)) => runProviderWorkerOnce(database.db, {...f, owner: `materialization-fault-${index}`, now: at, providerFactory: p.providerFactory,
    materialize: (db, input) => materializeProviderOutput(db, {...input, fetcher, resolveHost})});
  const clear = async () => {
    active = undefined;
    f.storage.setFault(undefined);
    p.setUnavailable(false);
    if (fault === 'expired-url') p.refreshResult();
    await database.pool.query('delete from app.materialization_test_faults where task_id=$1', [f.taskId]);
  };
  const reject = async (index: number) => {
    const expected: Record<Fault, RegExp> = {
      download: /fixture-download-fault/, 'expired-url': /Provider output is unavailable/,
      stream: /fixture-stream-fault/, put: /fixture-put-fault/, 'lost-put-response': /fixture-committed-put-response-lost/,
      'probe-read': /fixture-probe-read-fault/, 'corrupt-media': /Media validation failed/,
      publication: /fixture-publication-fault/, 'cleanup-delete': /fixture-publication-fault/,
      'unavailable-result': /Authoritative provider output is unavailable/,
    };
    await assert.rejects(() => run(index), error => expected[fault].test(errorText(error)), `Fault ${fault} must reach its intended real boundary.`);
    assert.equal(p.counts().creates, 1);
    assert.equal(downloads, resolutions, 'Every HTTP fixture request must first use the isolated DNS resolver.');
    assert.equal(downloads, fault === 'unavailable-result' ? 0 : index + 1);
    const state = await snapshot(f);
    assert.equal(state.materialization_attempts, index + 1, 'Each failed cycle consumes one, not zero or two, materialization attempts.');
    if (index < 7) {
      assert.deepEqual(state, {status: 'materializing', materialization_attempts: index + 1, failure_code: null, provider_cost_state: 'unknown', reservation: 'active', available: '90', reserved: '10', consumed: '0'});
      await assertTerminalEffects(f, p.requestId, 'pending');
    }
    const budgets = (await database.pool.query<{deadline_at: Date; stage_deadline_at: Date; overall_deadline_at: Date}>('select deadline_at,stage_deadline_at,overall_deadline_at from app.generation_tasks where id=$1', [f.taskId])).rows[0];
    assert.equal(budgets.deadline_at.getTime(), f.now.getTime() + 30 * 60_000, 'Retries must not extend the thirty-minute stage.');
    assert.equal(budgets.stage_deadline_at.getTime(), budgets.deadline_at.getTime());
    assert.equal(budgets.overall_deadline_at.getTime(), f.now.getTime() + 90 * 60_000, 'Retries must preserve the accepted overall cap.');
  };
  return {f, p, run, clear, reject};
}

async function assertOrphanRecovery(f: Fixture, expectedOrphans: number, retryDelete = false) {
  const prefix = `tasks/${f.taskId}/outputs`;
  const rows = (await database.pool.query('select object_key from app.assets where task_id=$1', [f.taskId])).rows;
  const referenced = new Set(rows.map(row => String(row.object_key)));
  const objects = await f.store.list(prefix, 100);
  const orphans = objects.filter(key => !referenced.has(key));
  assert.equal(orphans.length, expectedOrphans);
  if (orphans.length === 0) return;
  const dates = await Promise.all(orphans.map(async key => (await f.store.head(key))!.modifiedAt!.getTime()));
  const foreign = `tasks/${randomUUID()}/outputs/unrelated.mp4`;
  await f.store.put(foreign, media, 'video/mp4');
  const early = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: f.workspaceId, store: f.store, now: new Date(Math.min(...dates) + ORPHAN_RETENTION_MS - 1)});
  assert.equal(early.deletedObjects, 0, 'Rowless uploads must be retained for the complete 24-hour window.');
  assert.deepEqual(early.failures, []);
  const collectAt = new Date(Math.max(...dates) + ORPHAN_RETENTION_MS);
  if (retryDelete) {
    f.storage.setFault('cleanup-delete');
    const failed = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: f.workspaceId, store: f.store, now: collectAt});
    assert.equal(failed.deletedObjects, 0);
    assert.deepEqual(failed.failures.map(item => item.objectKey).sort(), [...orphans].sort());
    assert.ok(failed.failures.every(item => item.error.includes('fixture-cleanup-delete-fault') && item.retryAt === collectAt.toISOString()));
    assert.deepEqual(await f.store.list(prefix, 100), objects, 'A failed cleanup must retain each orphan for retry.');
    f.storage.setFault(undefined);
  }
  const collected = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: f.workspaceId, store: f.store, now: collectAt});
  assert.equal(collected.deletedObjects, expectedOrphans);
  assert.deepEqual(collected.failures, []);
  assert.deepEqual(await f.store.list(prefix, 100), [...referenced]);
  assert.ok(await f.store.head(foreign), 'Workspace cleanup must not cross its task prefixes.');
  for (const key of referenced) assert.ok(await f.store.head(key), 'Cleanup must retain the eventual ready output.');
}

const faults: readonly Fault[] = ['download', 'expired-url', 'stream', 'put', 'lost-put-response', 'probe-read', 'corrupt-media', 'publication', 'cleanup-delete', 'unavailable-result'];
for (const {modelKey, driver} of profiles) for (const fault of faults) {
  test(`${modelKey}/${driver}: ${fault} retries real materialization without premature publication or another create`, async () => {
    const h = await faultFixture(modelKey, driver, fault);
    await h.reject(0);
    const counts = h.f.storage.counts();
    if (fault === 'put' || fault === 'lost-put-response') assert.equal(counts.putFaults, 1);
    if (fault === 'probe-read') assert.equal(counts.probeFaults, 1);
    if (fault === 'cleanup-delete') assert.equal(counts.deleteFaults, 1);
    if (['probe-read', 'corrupt-media', 'publication'].includes(fault)) {
      assert.equal(h.f.storage.deletes.length, 1, 'Failed probe/publication must attempt compensating object deletion.');
      assert.deepEqual(await h.f.store.list(`tasks/${h.f.taskId}/outputs`, 100), []);
    }
    await h.clear();
    await h.run(1);
    assert.deepEqual(await snapshot(h.f), {status: 'succeeded', materialization_attempts: 2, failure_code: null, provider_cost_state: 'unknown', reservation: 'consumed', available: '90', reserved: '0', consumed: '10'});
    await assertTerminalEffects(h.f, h.p.requestId, 'succeeded');
    const beforeReplay = h.p.counts();
    await h.run(2);
    assert.deepEqual(h.p.counts(), beforeReplay, 'A terminal replay must perform no provider IO, including reads.');
    assert.deepEqual(h.p.counts(), {creates: 1, reads: 3}, 'Retries reread only the persisted authoritative result.');
    const ready = (await database.pool.query<{id: string; object_key: string; sha256: string; duration_ms: number}>("select id,object_key,sha256,duration_ms from app.assets where task_id=$1 and state='ready'", [h.f.taskId])).rows[0];
    assert.equal(ready.sha256, createHash('sha256').update(media).digest('hex'));
    assert.equal(ready.duration_ms, 2000);
    await authorizeAsset(database.db, h.f.workspaceId, ready.id, {userId: h.f.userId});
    assert.deepEqual(Buffer.from(await h.f.store.get(ready.object_key)), Buffer.from(media));
    await assertOrphanRecovery(h.f, fault === 'lost-put-response' || fault === 'cleanup-delete' ? 1 : 0, fault === 'cleanup-delete');
    await assertTerminalEffects(h.f, h.p.requestId, 'succeeded');
  });

  test(`${modelKey}/${driver}: ${fault} exhausts eight attempts with one original-source refund and no second create`, async () => {
    const h = await faultFixture(modelKey, driver, fault);
    for (let index = 0; index < 8; index++) await h.reject(index);
    assert.deepEqual(await snapshot(h.f), {status: 'failed', materialization_attempts: 8, failure_code: 'generation.materialization_failed', provider_cost_state: 'unknown', reservation: 'released', available: '100', reserved: '0', consumed: '0'});
    await assertTerminalEffects(h.f, h.p.requestId, 'failed');
    const refund = (await database.pool.query("select available_delta::text,expired_delta::text from app.credit_ledger_entries where workspace_id=$1 and entry_type='refund'", [h.f.workspaceId])).rows[0];
    assert.deepEqual(refund, {available_delta: '10', expired_delta: '0'});
    assert.equal((await database.pool.query("select count(*)::int as count from app.credit_grants where workspace_id=$1", [h.f.workspaceId])).rows[0].count, 1, 'An unexpired source refund must not invent compensation grants.');
    const beforeReplay = h.p.counts();
    await h.clear();
    await h.run(8);
    await h.run(9);
    assert.deepEqual(h.p.counts(), beforeReplay);
    assert.deepEqual(beforeReplay, {creates: 1, reads: 9});
    const late = await settleGenerationTask(database.db, {actor: {userId: h.f.userId}, workspaceId: h.f.workspaceId, taskId: h.f.taskId,
      internalWorker: true, idempotencyKey: `materialization-late-success-${h.f.taskId}`, outcome: 'succeeded', providerCostEvidence: {state: 'unknown'}, now: new Date(h.f.now.getTime() + 10 * 60_001)});
    assert.equal(late.value.status, 'quarantined', 'Late success after refund cannot resurrect or rebill the task.');
    assert.equal((await snapshot(h.f)).status, 'failed');
    await assertOrphanRecovery(h.f, fault === 'lost-put-response' || fault === 'cleanup-delete' ? 8 : 0, fault === 'cleanup-delete');
    await assertTerminalEffects(h.f, h.p.requestId, 'failed');
  });
}

for (const {modelKey, driver} of profiles) {
  test(`${modelKey}/${driver}: thirty-minute materialization deadline refunds before resumed output IO`, async () => {
    const h = await faultFixture(modelKey, driver, 'lost-put-response');
    await h.reject(0);
    await h.clear();
    const beforeDeadline = h.p.counts();
    await h.run(1, new Date(h.f.now.getTime() + 30 * 60_000));
    assert.deepEqual(await snapshot(h.f), {status: 'failed', materialization_attempts: 1, failure_code: 'generation.deadline_exceeded', provider_cost_state: 'unknown', reservation: 'released', available: '100', reserved: '0', consumed: '0'});
    assert.deepEqual(h.p.counts(), beforeDeadline, 'Overdue-first recovery must refund before any provider result/download retry.');
    await h.run(2, new Date(h.f.now.getTime() + 90 * 60_000));
    assert.deepEqual(h.p.counts(), beforeDeadline);
    await assertTerminalEffects(h.f, h.p.requestId, 'failed');
    await assertOrphanRecovery(h.f, 1);
  });

  test(`${modelKey}/${driver}: expired subscription failure creates one linked seven-day compensation, never a consumed charge`, async () => {
    const h = await faultFixture(modelKey, driver, 'expired-url', 'subscription');
    for (let index = 0; index < 8; index++) await h.reject(index);
    assert.deepEqual(await snapshot(h.f), {status: 'failed', materialization_attempts: 8, failure_code: 'generation.materialization_failed', provider_cost_state: 'unknown', reservation: 'released', available: '90', reserved: '0', consumed: '0'});
    await assertTerminalEffects(h.f, h.p.requestId, 'failed');
    const refund = (await database.pool.query("select available_delta::text,expired_delta::text from app.credit_ledger_entries where workspace_id=$1 and entry_type='refund'", [h.f.workspaceId])).rows[0];
    assert.deepEqual(refund, {available_delta: '0', expired_delta: '10'});
    const compensation = (await database.pool.query<{issued: string; available: string; reserved: string; consumed: string; source: string; expires_at: Date; origin_allocation_id: string}>(`select issued::text,available::text,reserved::text,consumed::text,source,expires_at,origin_allocation_id
      from app.credit_grants where workspace_id=$1 and source='compensation'`, [h.f.workspaceId])).rows;
    assert.equal(compensation.length, 1);
    assert.equal(compensation[0].issued, '10');
    assert.equal(compensation[0].available, '10');
    assert.equal(compensation[0].reserved, '0');
    assert.equal(compensation[0].consumed, '0');
    const allocation = (await database.pool.query('select id,grant_id from app.credit_allocations where reservation_id=$1', [h.f.reservationId])).rows;
    assert.equal(allocation.length, 1);
    assert.equal(compensation[0].origin_allocation_id, allocation[0].id);
    assert.equal(allocation[0].grant_id, h.f.grantId);
    assert.equal(compensation[0].expires_at.getTime(), h.f.now.getTime() + 7 * 60_001 + 7 * 24 * 60 * 60_000);
    await h.clear();
    const beforeReplay = h.p.counts();
    await h.run(8);
    await h.run(9);
    assert.deepEqual(h.p.counts(), beforeReplay);
    await assertTerminalEffects(h.f, h.p.requestId, 'failed');
    assert.equal((await database.pool.query("select count(*)::int as count from app.credit_grants where workspace_id=$1 and source='compensation'", [h.f.workspaceId])).rows[0].count, 1);
  });
}
