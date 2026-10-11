import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';

import {freeLocalPort, runLogged, startLogged, stopChild, waitUntil} from './candidate-process.mjs';
import {rehearseRestore} from './candidate-restore.mjs';

export async function runCandidateJourney({candidateRoot, runtimeEnv, logs, secrets, checks, evidenceDir, archiveSha256, container, onRestore}) {
  const port = await freeLocalPort();
  const origin = `http://127.0.0.1:${port}`;
  let env = {...runtimeEnv, APP_URL: origin};
  let db = new Client({connectionString: env.DATABASE_URL});
  const nodeOptions = () => ({cwd: candidateRoot, env, logs});
  let web;
  let worker;
  let token;
  const events = [];
  const record = (name, details = {}) => {events.push({name, at: new Date().toISOString(), ...details}); logs.set('journey', JSON.stringify(events, null, 2));};
  const request = (route, body, key, bearer = token) => fetch(new URL(route, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {origin, ...(body === undefined ? {} : {'content-type': 'application/json'}), ...(bearer ? {authorization: `Bearer ${bearer}`} : {}), ...(key ? {'idempotency-key': key} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), redirect: 'manual', signal: AbortSignal.timeout(30_000),
  });
  const startWeb = async (label) => {
    web = startLogged(process.execPath, [path.join(candidateRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {...nodeOptions(), name: label});
    await waitUntil(async () => {
      if (web.exitCode !== null) throw new Error(`${label} exited before readiness.`);
      return fetch(`${origin}/api/healthz`, {signal: AbortSignal.timeout(3000)}).then(async (response) => response.ok && (await response.json()).profile === 'local').catch(() => false);
    }, `${label} health`);
  };
  const startWorker = (label) => {worker = startLogged(process.execPath, ['--experimental-strip-types', 'scripts/local-worker.ts'], {...nodeOptions(), name: label});};
  try {
    await runLogged(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {...nodeOptions(), name: 'migrate'});
    await runLogged(process.execPath, ['--experimental-strip-types', 'scripts/demo-seed.ts'], {...nodeOptions(), name: 'seed'});
    const fixture = JSON.parse(readFileSync(path.join(candidateRoot, '.data', 'demo-credentials.json'), 'utf8'));
    secrets.add(fixture.invitationToken);
    secrets.add(fixture.owner.password);
    secrets.add(fixture.member.password);
    await db.connect();
    checks.freshMigrationsAndDemoSeed = 'PASS';
    await startWeb('web-initial');
    const login = await request('/api/auth/sign-in/email', {email: fixture.owner.email, password: fixture.owner.password});
    assert.equal(login.status, 200, 'Fresh candidate demo login failed.');
    token = (await login.json()).token;
    assert.equal(typeof token, 'string');
    secrets.add(token);
    const dashboard = await request(`/dashboard?workspace=${fixture.workspaceId}`);
    assert.equal(dashboard.status, 200, 'Fresh candidate dashboard failed.');
    assert.match(await dashboard.text(), /Queue generation/, 'Fresh candidate dashboard did not render the generation form.');
    checks.httpLoginAndDashboard = 'PASS';
    const workspaceId = fixture.workspaceId;
    const balance = async () => (await db.query(`select sum(available)::text as available, sum(reserved)::text as reserved, sum(consumed)::text as consumed from app.credit_grants where workspace_id = $1`, [workspaceId])).rows[0];
    const initialBalance = await balance();
    assert.deepEqual(initialBalance, {available: '100', reserved: '0', consumed: '0'});
    const quoteScript = `const {createServerQuote, DEFAULT_MODEL_ID} = await import(${JSON.stringify(pathToFileURL(path.join(candidateRoot, 'src/config/models.ts')).href)}); console.log(JSON.stringify(createServerQuote(DEFAULT_MODEL_ID, '1')));`;
    const quote = JSON.parse((await runLogged(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', quoteScript], {...nodeOptions(), name: 'quote'})).trim());
    const create = async (name) => {
      const payload = {quote, input: {prompt: `Fresh candidate ${name}`}};
      const key = `candidate.${name}.${randomUUID()}`;
      const response = await request(`/api/workspaces/${workspaceId}/generations`, payload, key);
      const result = await response.json();
      assert.equal(response.status, 201, `Generation creation failed: ${JSON.stringify(result)}`);
      assert.equal(result.ok, true);
      const taskId = result.data.value.taskId;
      const replay = await request(`/api/workspaces/${workspaceId}/generations`, payload, key);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).data.value.taskId, taskId);
      return taskId;
    };
    const task = async (id) => (await db.query('select status, failure_code from app.generation_tasks where id = $1', [id])).rows[0];
    const cancelled = await create('cancel');
    const cancellation = await request(`/api/workspaces/${workspaceId}/generations/${cancelled}/cancel`, {}, `candidate.cancel.${randomUUID()}`);
    assert.equal(cancellation.status, 200);
    assert.equal((await task(cancelled)).status, 'cancelled');
    assert.deepEqual(await balance(), initialBalance, 'Cancellation did not fully release the credit reservation.');
    checks.httpCancellationAndRefund = 'PASS';
    record('cancelled', {taskId: cancelled, balance: await balance()});
    const failed = await create('deadline-failure');
    // A fixture clock-boundary change makes the actual worker recovery path observable without waiting ten minutes.
    await db.query("update app.generation_tasks set deadline_at = now() - interval '1 second', queue_deadline_at = now() - interval '1 second' where id = $1 and status = 'queued'", [failed]);
    const succeeded = await create('success');
    startWorker('worker-initial');
    await waitUntil(async () => (await task(failed)).status === 'failed' && (await task(succeeded)).status === 'succeeded', 'worker success and deadline recovery');
    assert.equal((await task(failed)).failure_code, 'generation.deadline_exceeded');
    assert.deepEqual(await balance(), {available: '90', reserved: '0', consumed: '10'});
    checks.workerSuccessAndDeadlineFailureRefund = 'PASS';
    record('success-and-deadline-failure', {succeeded, failed, failureCode: 'generation.deadline_exceeded', balance: await balance()});
    const asset = (await db.query("select id from app.assets where task_id = $1 and purpose = 'output' and state = 'ready'", [succeeded])).rows[0];
    assert(asset, 'Successful task has no ready private output.');
    const download = async () => {
      const metadata = await request(`/api/workspaces/${workspaceId}/assets/${asset.id}`);
      assert.equal(metadata.status, 200);
      const {downloadUrl} = (await metadata.json()).data;
      secrets.add(new URL(downloadUrl, origin).searchParams.get('token'));
      assert.equal((await request(downloadUrl, undefined, undefined, '')).status, 401, 'Private asset download permitted anonymous access.');
      const response = await request(downloadUrl);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'video/mp4');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, readFileSync(path.join(candidateRoot, 'tests/fixtures/video/local-demo.mp4')), 'Private output bytes differ from the validated Mock video.');
      return {assetId: asset.id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), anonymousStatus: 401};
    };
    const privateDownload = await download();
    checks.authenticatedPrivateDownload = 'PASS';
    await stopChild(worker);
    worker = undefined;
    const recovered = await create('restart');
    assert.equal((await task(recovered)).status, 'queued');
    await stopChild(web);
    web = undefined;
    record('services-stopped-with-queued-task', {taskId: recovered, balance: await balance()});
    await db.end();
    const restore = await rehearseRestore({connectionString: env.DATABASE_URL, container, evidenceDir: path.join(evidenceDir, 'restore'), archiveSha256, assetRoot: env.ASSET_ROOT});
    onRestore(restore);
    secrets.add(restore.databaseUrl);
    env = {...env, DATABASE_URL: restore.databaseUrl, ASSET_ROOT: restore.assetRoot};
    db = new Client({connectionString: env.DATABASE_URL});
    await db.connect();
    checks.timedDatabaseAndAssetRestore = 'PASS';
    const restoredQueued = await db.query('select status from app.generation_tasks where id = $1', [recovered]);
    assert.equal(restoredQueued.rows[0]?.status, 'queued', 'Restore did not preserve the queued task boundary.');
    const restoredDispatch = await db.query("select id from app.outbox_events where event_type = 'generation.dispatch' and payload->>'taskId' = $1", [recovered]);
    assert.equal(restoredDispatch.rowCount, 1, 'Restore did not preserve the queued dispatch event.');
    checks.restoredQueuedTaskAndDispatch = 'PASS';
    await startWeb('web-restarted');
    startWorker('worker-restarted');
    await waitUntil(async () => (await task(recovered)).status === 'succeeded', 'queued task after restored web and worker restart', 180_000);
    const restoredSession = await request('/api/auth/get-session');
    assert.equal(restoredSession.status, 200);
    assert.equal((await restoredSession.json()).user.email, fixture.owner.email, 'Restored login session was not retained.');
    const restoredDashboard = await request(`/dashboard?workspace=${workspaceId}`);
    assert.equal(restoredDashboard.status, 200);
    const restoredHtml = await restoredDashboard.text();
    for (const id of [cancelled, failed, succeeded, recovered]) assert(restoredHtml.includes(id), 'Restored generation history did not render a persisted task.');
    const afterRestartDownload = await download();
    assert.deepEqual(afterRestartDownload, privateDownload);
    assert.deepEqual(await balance(), {available: '80', reserved: '0', consumed: '20'});
    const ledger = (await db.query(`select sum(available_delta)::text as available, sum(reserved_delta)::text as reserved, sum(consumed_delta)::text as consumed from app.credit_ledger_entries where workspace_id = $1`, [workspaceId])).rows[0];
    assert.deepEqual(ledger, await balance(), 'Credit ledger and projection diverged.');
    const reservations = (await db.query('select task_id, status, total_cost::text from app.credit_reservations where workspace_id = $1 order by task_id', [workspaceId])).rows;
    assert.equal(reservations.length, 4);
    for (const reservation of reservations) {
      assert.equal(reservation.status, [cancelled, failed].includes(reservation.task_id) ? 'released' : 'consumed');
      assert.equal(reservation.total_cost, '10');
    }
    const dispatched = (await db.query('select task_id, count(*)::int as attempts from app.submission_attempts where workspace_id = $1 group by task_id order by task_id', [workspaceId])).rows;
    assert.equal(dispatched.length, 2);
    assert(dispatched.every((row) => row.attempts === 1), 'Restart or HTTP retry duplicated a provider submission.');
    checks.restartPersistenceAndExactlyOnceCredits = 'PASS';
    record('restored-restart-verified', {taskId: recovered, balance: await balance(), ledger, reservations, dispatched});
    return {workspaceId, scenarios: {cancelled, deadlineFailure: failed, succeeded, restarted: recovered}, initialBalance, finalBalance: await balance(), ledger, privateDownload, reservationCount: reservations.length, providerAttempts: dispatched, restore: restore.evidence, servicesStoppedAfterRun: true};
  } finally {
    await stopChild(worker);
    await stopChild(web);
    await db.end().catch(() => undefined);
  }
}
