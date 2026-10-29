import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {createHash, randomUUID} from 'node:crypto';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../src/db/schema/index.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import {receiveRecoveryAlert} from '../../src/modules/operations/recovery-alert-inbox.ts';
import {deliverRecoveryAlert, validateRecoveryAlert} from '../../src/modules/operations/recovery-alert-delivery.ts';
import {
  beginRecoverySweep, writeRecoveryHeartbeat, createRecoveryHeartbeatRepository, runRecoveryHeartbeatMonitorOnce,
  type RecoveryHeartbeatScope,
} from '../../src/modules/operations/recovery-heartbeat.ts';

// Only disposable local databases; never read application env files or provider configuration.
const databaseName = `shpitto_heartbeat_test_${randomUUID().replaceAll('-', '')}`;
let admin: Client;
let pool: Pool;
let db: AppDatabase;
let created = false;
let adminUrl: string;
before(async () => {
  const url = new URL(process.env.RECOVERY_HEARTBEAT_TEST_ADMIN_DATABASE_URL ?? 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && ['55432', '55433'].includes(url.port), 'Heartbeat tests require a disposable local database on 55432/55433.');
  adminUrl = url.toString();
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 3000});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  pool = new Pool({connectionString: url.toString(), max: 8});
  await pool.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
  db = drizzle(pool, {schema});
  await migrate(db, {migrationsFolder: resolve('src/db/migrations')});
});
after(async () => {
  await pool?.end();
  if (created) await admin.query(`drop database "${databaseName}" with (force)`);
  await admin?.end();
});

async function serverTime(offsetMs = 0): Promise<Date> {
  return new Date((await pool.query<{now: string | Date}>('select date_trunc(\'milliseconds\', clock_timestamp()) + $1 * interval \'1 millisecond\' as now', [offsetMs])).rows[0]!.now);
}
async function fixture(ageMs = 0): Promise<RecoveryHeartbeatScope> {
  const workspaceId = randomUUID();
  const userId = `heartbeat-${randomUUID()}`;
  await pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,now(),now())', [userId, `${userId}@example.test`]);
  await pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Heartbeat fixture',$2,now(),now())", [workspaceId, userId]);
  return {workspaceId, workerKey: 'acceptance-instance-1', expectedAt: await serverTime(-ageMs)};
}
async function incident(scope: RecoveryHeartbeatScope) {
  return (await pool.query('select * from app.recovery_heartbeat_incidents where workspace_id=$1 and worker_key=$2 order by opened_at desc', [scope.workspaceId, scope.workerKey])).rows;
}
async function makeRetryDue(scope: RecoveryHeartbeatScope) {
  await pool.query('update app.recovery_heartbeat_incidents set lease_until=case when lease_token is not null then clock_timestamp()-interval \'1 second\' end, next_attempt_at=clock_timestamp()-interval \'1 second\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
}

test('successful sweep is durable across independent database readers and strictly monotonic', async () => {
  const scope = await fixture(600_000);
  const startedAt = await beginRecoverySweep(db, scope);
  assert.equal(await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: startedAt}), true);
  assert.equal(await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: new Date(startedAt.getTime() - 60_000)}), false);
  const independent = drizzle(pool, {schema});
  assert.deepEqual(await runRecoveryHeartbeatMonitorOnce(independent, {...scope, deliver: async () => assert.fail('Healthy.')}), {status: 'healthy'});
  assert.equal((await incident(scope)).length, 0);
  const row = (await pool.query<{last_success_at: string | Date}>('select last_success_at from app.recovery_heartbeats where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey])).rows[0]!;
  assert.equal(new Date(row.last_success_at).toISOString(), startedAt.toISOString());
});

test('absent heartbeat alerts from immutable expected start; same worker in another workspace stays isolated', async () => {
  const stale = await fixture(181_000);
  const healthy = await fixture();
  const deliveries: string[] = [];
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...stale, deliver: async (payload) => { deliveries.push(payload.workspaceId); }})).status, 'delivered');
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...healthy, deliver: async () => assert.fail('Other workspace.')})).status, 'healthy');
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...stale, expectedAt: await serverTime(), deliver: async () => assert.fail('Already delivered.')})).status, 'already_delivered');
  assert.deepEqual(deliveries, [stale.workspaceId]);
});

test('registration and an unfinished sweep never count as a durable successful heartbeat', async () => {
  const scope = await fixture(181_000);
  await beginRecoverySweep(db, scope);
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async (payload) => {
    assert.equal(payload.lastSweepAt, null);
    assert.equal(payload.expectedAt, scope.expectedAt.toISOString());
  }})).status, 'delivered');
});

test('stale persisted heartbeat creates one incident; concurrent claims and duplicate monitors deliver once', async () => {
  const scope = await fixture(600_000);
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await serverTime(-181_000)});
  let deliveries = 0;
  const results = await Promise.all(Array.from({length: 6}, () => runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async () => { deliveries++; }})));
  assert.equal(deliveries, 1);
  assert.equal(results.filter((result) => result.status === 'delivered').length, 1);
  assert.equal((await incident(scope)).length, 1);
});

test('failed delivery remains pending, backs off and retries with the same external idempotency key', async () => {
  const scope = await fixture(600_000);
  const keys: string[] = [];
  const payloads: string[] = [];
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async (payload, options) => { payloads.push(JSON.stringify(payload)); keys.push(options.idempotencyKey); throw new Error('redacted-delivery-fault'); }})).status, 'retry');
  assert.equal((await incident(scope))[0].delivered_at, null);
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async () => assert.fail('Backoff.')})).status, 'waiting');
  await makeRetryDue(scope);
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async (payload, options) => { payloads.push(JSON.stringify(payload)); keys.push(options.idempotencyKey); }})).status, 'delivered');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(payloads[0], payloads[1]);
  assert.equal((await incident(scope))[0].attempts, 2);
});

test('expired leases retry a crashed delivery and reject its late acknowledgment', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const first = await repo.claim(scope);
  assert.equal(first.status, 'claimed');
  assert.equal((await repo.claim(scope)).status, 'waiting');
  await makeRetryDue(scope);
  const second = await repo.claim(scope);
  assert.equal(second.status, 'claimed');
  if (first.status !== 'claimed' || second.status !== 'claimed') assert.fail('Expected claims.');
  assert.equal(first.incidentId, second.incidentId);
  assert.notEqual(first.token, second.token);
  assert.equal(await repo.complete(scope, first, true), false);
  assert.equal(await repo.complete(scope, second, true), true);
});

test('old sweep success cannot clear an alert; newer recovery and a new outage get a new incident', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const oldStart = await serverTime(-1_000);
  const first = await repo.claim(scope);
  if (first.status !== 'claimed') assert.fail('Expected stale incident.');
  assert.equal(await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: oldStart}), true);
  assert.equal((await incident(scope))[0].recovered_at, null, 'An old success cannot resolve a newer incident even when its timestamp looks fresh.');
  assert.equal((await repo.claim(scope)).status, 'waiting');
  await pool.query('select pg_sleep(0.005)');
  const freshStart = await beginRecoverySweep(db, scope);
  assert.equal(await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: freshStart}), true);
  assert.ok((await incident(scope))[0].recovered_at);
  assert.equal(await repo.complete(scope, first, true), true, 'Recovery preserves the valid in-flight delivery lease.');
  assert.equal(await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: oldStart}), false);
  assert.equal((await repo.claim(scope)).status, 'healthy');
  // Controlled outage fixture advances age without waiting three wall-clock minutes.
  await pool.query('update app.recovery_heartbeats set last_success_at=clock_timestamp()-interval \'181 seconds\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
  const second = await repo.claim(scope);
  if (second.status !== 'claimed') assert.fail('Expected new outage.');
  assert.notEqual(first.incidentId, second.incidentId);
  assert.equal(await repo.complete(scope, first, false), false);
  assert.equal(await repo.complete(scope, second, true), true);
  assert.equal((await incident(scope)).length, 2);
});

test('future-dated successes cannot fabricate freshness and instance scopes do not overlap', async () => {
  const scope = await fixture(600_000);
  await assert.rejects(writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: new Date(NaN)}), /start/i);
  await assert.rejects(writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await serverTime(60_000)}), /future|start/i);
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await beginRecoverySweep(db, scope)});
  assert.equal((await runRecoveryHeartbeatMonitorOnce(db, {...scope, workerKey: 'acceptance-instance-2', deliver: async () => undefined})).status, 'delivered');
  const ownership = (await pool.query("select owner, version from app.schema_ownership where key='recovery-heartbeat'")).rows[0];
  assert.deepEqual(ownership, {owner: 'shpitto-domain', version: 1});
});

test('long outages retain bounded deliverable evidence and the original expected time', async () => {
  const scope = {...await fixture(400 * 86_400_000), workerKey: 'sweep.instance-1'};
  const claim = await createRecoveryHeartbeatRepository(db).claim(scope);
  if (claim.status !== 'claimed') assert.fail('Expected long-outage incident.');
  assert.equal(claim.payload.ageSeconds, 31_536_000);
  assert.equal(claim.payload.expectedAt, scope.expectedAt.toISOString());
  assert.deepEqual(validateRecoveryAlert(claim.payload), claim.payload);
});

test('concurrent successful completions preserve the newest sweep timestamp', async () => {
  const scope = await fixture(600_000);
  const newest = await serverTime(-1_000);
  await Promise.all([writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: newest}),
    writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: new Date(newest.getTime() - 30_000)})]);
  const row = (await pool.query<{last_success_at: string | Date}>('select last_success_at from app.recovery_heartbeats where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey])).rows[0]!;
  assert.equal(new Date(row.last_success_at).toISOString(), newest.toISOString());
});

test('a success completing more than three minutes after its start cannot heal an active incident', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const claim = await repo.claim(scope);
  if (claim.status !== 'claimed') assert.fail('Expected incident.');
  // Simulate an incident opened earlier than a sweep that then took over three minutes.
  await pool.query('update app.recovery_heartbeat_incidents set opened_at=clock_timestamp()-interval \'300 seconds\' where id=$1', [claim.incidentId]);
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await serverTime(-181_000)});
  assert.equal((await incident(scope))[0].recovered_at, null);
});

async function alertFixture() {
  const scope = await fixture(600_000);
  const claim = await createRecoveryHeartbeatRepository(db).claim(scope);
  if (claim.status !== 'claimed') assert.fail('Expected incident for recipient fixture.');
  return {scope, payload: claim.payload};
}

test('receiver persists one operator note for concurrent duplicates with the canonical evidence hash', async () => {
  const {scope, payload} = await alertFixture();
  const receipts = await Promise.all([receiveRecoveryAlert(db, payload), receiveRecoveryAlert(db, payload)]);
  assert.deepEqual(receipts.map((receipt) => receipt.duplicate).sort(), [false, true]);
  assert.ok(receipts.every((receipt) => receipt.received && receipt.incidentId === payload.incidentId));
  const notes = (await pool.query('select * from app.operator_recovery_notes where workspace_id=$1', [scope.workspaceId])).rows;
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, payload.incidentId);
  assert.equal(notes[0].subject_type, 'sweep_heartbeat');
  assert.equal(notes[0].subject_id, scope.workerKey);
  assert.equal(notes[0].status, 'open');
  const digest = createHash('sha256').update(JSON.stringify(validateRecoveryAlert(payload))).digest('hex');
  assert.ok(String(notes[0].reason).includes(`sha256=${digest}`));
  assert.ok(String(notes[0].reason).includes(payload.action));
  assert.doesNotMatch(String(notes[0].reason), /https?:|password|token|secret/i);
});

test('receiver rejects changed evidence under an existing incident key and retains the original note', async () => {
  const {payload} = await alertFixture();
  await receiveRecoveryAlert(db, payload);
  await assert.rejects(receiveRecoveryAlert(db, {...payload, observedAt: new Date(Date.parse(payload.observedAt) + 1000).toISOString(), ageSeconds: payload.ageSeconds + 1}),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CONFLICT');
  assert.equal((await receiveRecoveryAlert(db, payload)).duplicate, true);
  assert.equal((await pool.query('select id from app.operator_recovery_notes where id=$1', [payload.incidentId])).rowCount, 1);
});

test('receiver limits new incidents to three per workspace minute while allowing duplicate receipts', async () => {
  const {scope, payload} = await alertFixture();
  const alerts = [payload, {...payload, incidentId: randomUUID()}, {...payload, incidentId: randomUUID()}];
  const receipts = await Promise.all(alerts.map((alert) => receiveRecoveryAlert(db, alert)));
  assert.ok(receipts.every((receipt) => !receipt.duplicate));
  const fourth = {...payload, incidentId: randomUUID()};
  await assert.rejects(receiveRecoveryAlert(db, fourth), /rate limit/i);
  assert.equal((await receiveRecoveryAlert(db, payload)).duplicate, true);
  assert.equal((await pool.query('select id from app.operator_recovery_notes where workspace_id=$1', [scope.workspaceId])).rowCount, 3);
  // Controlled window expiry; the receiver still uses its own DB clock.
  await pool.query('update app.operator_recovery_notes set created_at=clock_timestamp()-interval \'61 seconds\' where id=$1', [payload.incidentId]);
  assert.equal((await receiveRecoveryAlert(db, fourth)).duplicate, false);
});

test('monitor marks delivery only after the injected HTTP adapter validates a durable receiver receipt', async () => {
  const scope = await fixture(600_000);
  const config = {profile: 'acceptance', projectId: 'heartbeat-fixture', expectedProjectId: 'heartbeat-fixture',
    workspaceId: scope.workspaceId, workerKey: scope.workerKey, secret: 'local-fixture-only-'.repeat(4),
    appUrl: 'https://receiver.example.test', alertUrl: 'https://receiver.example.test/api/internal/recovery-alerts'};
  const result = await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: (payload) => deliverRecoveryAlert(payload, config,
    async (_url, options) => {
      const received = validateRecoveryAlert(JSON.parse(String(options?.body)));
      assert.equal(new Headers(options?.headers).get('idempotency-key'), received.incidentId);
      return Response.json({ok: true, data: await receiveRecoveryAlert(db, received)}, {status: 202});
    })});
  assert.equal(result.status, 'delivered');
  const rows = await incident(scope);
  assert.ok(rows[0].delivered_at);
  assert.equal((await pool.query('select id from app.operator_recovery_notes where id=$1', [rows[0].id])).rowCount, 1);
});

test('failed delivery survives fresh recovery and retries the original payload and incident', async () => {
  const scope = await fixture(600_000);
  const payloads: string[] = [];
  const first = await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async (payload) => {
    payloads.push(JSON.stringify(payload)); throw new Error('controlled-delivery-fault');
  }});
  await pool.query('select pg_sleep(0.005)');
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await beginRecoverySweep(db, scope)});
  assert.ok((await incident(scope))[0].recovered_at);
  assert.equal((await incident(scope))[0].delivered_at, null);
  await makeRetryDue(scope);
  const retry = await runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver: async (payload) => { payloads.push(JSON.stringify(payload)); }});
  assert.equal(retry.status, 'delivered');
  assert.ok('incidentId' in first && 'incidentId' in retry && first.incidentId === retry.incidentId);
  assert.equal(payloads[0], payloads[1]);
  assert.equal((await createRecoveryHeartbeatRepository(db).claim(scope)).status, 'healthy');
});

test('in-flight delivery remains valid after a fresh recovery and acknowledges the recovered incident', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const claim = await repo.claim(scope);
  if (claim.status !== 'claimed') assert.fail('Expected incident.');
  await pool.query('select pg_sleep(0.005)');
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await beginRecoverySweep(db, scope)});
  const recovered = (await incident(scope))[0];
  assert.ok(recovered.recovered_at);
  assert.equal(recovered.lease_token, claim.token);
  assert.equal(await repo.complete(scope, claim, true), true);
  assert.ok((await incident(scope))[0].delivered_at);
});

test('a new outage is recorded independently while an older recovered incident awaits delivery', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const old = await repo.claim(scope);
  if (old.status !== 'claimed') assert.fail('Expected first incident.');
  await repo.complete(scope, old, false);
  await pool.query('select pg_sleep(0.005)');
  await writeRecoveryHeartbeat(db, {...scope, sweepStartedAt: await beginRecoverySweep(db, scope)});
  await pool.query('update app.recovery_heartbeats set last_success_at=clock_timestamp()-interval \'181 seconds\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
  assert.equal((await repo.claim(scope)).status, 'waiting');
  const rows = await incident(scope);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.recovered_at === null).length, 1);
  await makeRetryDue(scope);
  const retry = await repo.claim(scope);
  if (retry.status !== 'claimed') assert.fail('Expected older pending delivery.');
  assert.equal(retry.incidentId, old.incidentId);
  assert.deepEqual(retry.payload, old.payload);
  assert.equal(await repo.complete(scope, retry, true), true);
  const next = await repo.claim(scope);
  if (next.status !== 'claimed') assert.fail('Expected newer outage delivery.');
  assert.notEqual(next.incidentId, old.incidentId);
  assert.equal(await repo.complete(scope, old, true), false);
  assert.equal(await repo.complete(scope, next, true), true);
});

test('future initial registration is bounded to server time and persisted future registrations are clamped', async () => {
  const scope = {...await fixture(), expectedAt: await serverTime(365 * 86_400_000)};
  const startedAt = await beginRecoverySweep(db, scope);
  let persisted = (await pool.query<{expected_at: string | Date}>('select expected_at from app.recovery_heartbeats where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey])).rows[0]!;
  assert.ok(new Date(persisted.expected_at) <= startedAt, 'A caller future timestamp must not blind the monitor.');
  await pool.query('update app.recovery_heartbeats set expected_at=clock_timestamp()+interval \'1 year\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
  await createRecoveryHeartbeatRepository(db).claim(scope);
  persisted = (await pool.query<{expected_at: string | Date}>('select expected_at from app.recovery_heartbeats where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey])).rows[0]!;
  assert.ok(new Date(persisted.expected_at) <= await serverTime());
  await pool.query('update app.recovery_heartbeats set expected_at=clock_timestamp()-interval \'181 seconds\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
  assert.equal((await createRecoveryHeartbeatRepository(db).claim(scope)).status, 'claimed');
});

test('pending incident evidence stays immutable when a future registration is repaired', async () => {
  const scope = await fixture(600_000);
  const repo = createRecoveryHeartbeatRepository(db);
  const original = await repo.claim(scope);
  if (original.status !== 'claimed') assert.fail('Expected incident.');
  await repo.complete(scope, original, false);
  await pool.query('update app.recovery_heartbeats set expected_at=clock_timestamp()+interval \'1 year\' where workspace_id=$1 and worker_key=$2', [scope.workspaceId, scope.workerKey]);
  await makeRetryDue(scope);
  const retry = await repo.claim(scope);
  if (retry.status !== 'claimed') assert.fail('Expected immutable pending incident.');
  assert.deepEqual(retry.payload, original.payload);
  assert.deepEqual(validateRecoveryAlert(retry.payload), retry.payload);
});

test('deployed v1 migration stays byte-identical and upgrades retain original payload and delivery state', async () => {
  const v1Hash = '45f6e0b9db591d314a1d9502a1b51430f642a437e46c00c77a045a7a5462e787';
  assert.equal(createHash('sha256').update(await readFile(resolve('src/db/migrations/0027_recovery_heartbeat.sql'))).digest('hex'), v1Hash);
  const journal = JSON.parse(await readFile(resolve('src/db/migrations/meta/_journal.json'), 'utf8'));
  assert.equal(journal.entries.at(-1).idx, 28);
  const legacyFolder = await mkdtemp(resolve(tmpdir(), 'heartbeat-migrations-'));
  const upgradeName = `shpitto_heartbeat_upgrade_${randomUUID().replaceAll('-', '')}`;
  let upgradePool: Pool | undefined;
  let databaseCreated = false;
  try {
    await mkdir(resolve(legacyFolder, 'meta'));
    const entries = journal.entries.filter((entry: {idx: number}) => entry.idx <= 27);
    await writeFile(resolve(legacyFolder, 'meta/_journal.json'), JSON.stringify({...journal, entries}), 'utf8');
    for (const entry of entries) await copyFile(resolve(`src/db/migrations/${entry.tag}.sql`), resolve(legacyFolder, `${entry.tag}.sql`));
    await admin.query(`create database "${upgradeName}"`); databaseCreated = true;
    const url = new URL(adminUrl); url.pathname = `/${upgradeName}`;
    upgradePool = new Pool({connectionString: url.toString(), max: 2});
    await upgradePool.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
    const upgradeDb = drizzle(upgradePool, {schema});
    await migrate(upgradeDb, {migrationsFolder: legacyFolder});
    const workspaceId = randomUUID(), userId = `upgrade-${randomUUID()}`;
    await upgradePool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,now(),now())', [userId, `${userId}@example.test`]);
    await upgradePool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Upgrade fixture',$2,now(),now())", [workspaceId, userId]);
    // Legacy punctuation-leading identities remain intact; new writes enforce the shared slug contract.
    for (const workerKey of ['sweep.instance', '.legacy-worker']) {
      await upgradePool.query("insert into app.recovery_heartbeats (workspace_id,worker_key,expected_at) values ($1,$2,'2026-10-15T00:00:00Z')", [workspaceId, workerKey]);
      await upgradePool.query("insert into app.recovery_heartbeat_incidents (id,workspace_id,worker_key,opened_at,last_sweep_at,age_seconds,recovered_at,delivered_at,attempts,next_attempt_at,lease_token,lease_until) values ($1,$2,$3,'2026-10-15T00:10:00Z',null,600,'2026-10-15T00:11:00Z',null,2,'2026-10-15T00:12:00Z',$4,'2026-10-15T00:13:00Z')", [randomUUID(), workspaceId, workerKey, randomUUID()]);
    }
    const before = (await upgradePool.query('select * from app.recovery_heartbeat_incidents order by id')).rows;
    assert.ok(before.every(row => !('expected_at' in row)));
    await migrate(upgradeDb, {migrationsFolder: resolve('src/db/migrations')});
    const after = (await upgradePool.query<Record<string, unknown> & {expected_at: Date | string}>('select * from app.recovery_heartbeat_incidents order by id')).rows;
    assert.deepEqual(after.map(({expected_at, ...row}) => row), before);
    assert.ok(after.every(row => new Date(row.expected_at).toISOString() === '2026-10-15T00:00:00.000Z'));
    assert.equal((await upgradePool.query("select is_nullable from information_schema.columns where table_schema='app' and table_name='recovery_heartbeat_incidents' and column_name='expected_at'")).rows[0].is_nullable, 'NO');
    assert.equal((await upgradePool.query('select hash from drizzle.__drizzle_migrations where created_at=1780000027000')).rows[0].hash, v1Hash);
    await assert.rejects(upgradePool.query("insert into app.recovery_heartbeats (workspace_id,worker_key,expected_at) values ($1,'.new-invalid',now())", [workspaceId]), /worker_check/);
  } finally {
    await upgradePool?.end();
    if (databaseCreated) await admin.query(`drop database "${upgradeName}" with (force)`);
    assert.ok(resolve(legacyFolder).startsWith(`${resolve(tmpdir())}${sep}heartbeat-migrations-`));
    await rm(legacyFolder, {recursive: true, force: true});
  }
});
