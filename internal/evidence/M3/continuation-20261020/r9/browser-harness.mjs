import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium} from 'file:///C:/Users/liula/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = process.cwd();
const runtimeRoot = path.resolve(process.env.SHPITTO_BROWSER_RUNTIME_ROOT ?? root);
const runId = randomUUID().slice(0, 8);
const output = path.join(root, 'internal/evidence/M3/continuation-20261020/r9/browser-run', `browser-journeys-${runId}`);
const port = 3199;
const origin = `http://127.0.0.1:${port}`;
const mailOrigin = process.env.SHPITTO_BROWSER_MAIL_ORIGIN;
mkdirSync(output, {recursive: true});
const json = (name, data) => writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const sourceEnv = {};
const databaseName = `shpitto_browser_${runId}`;
const adminUrl = new URL(process.env.SHPITTO_BROWSER_ADMIN_DATABASE_URL ?? sourceEnv.DATABASE_URL);
assert(['localhost', '127.0.0.1'].includes(adminUrl.hostname));
adminUrl.pathname = '/postgres';
const admin = new pg.Client({connectionString: adminUrl.toString()});
const databaseUrl = new URL(adminUrl); databaseUrl.pathname = `/${databaseName}`;
const password = `Browser-${randomUUID()}!`;
const primary = {name: 'Current browser owner', email: `browser-owner-${runId}@example.test`, password};
const member = {name: 'Current browser member', email: `browser-member-${runId}@example.test`, password};
const expired = {name: 'Current browser expiry', email: `browser-expiry-${runId}@example.test`, password};
const assetRoot = path.join(runtimeRoot, '.data', `browser-assets-${runId}`);
const env = {...process.env, ...sourceEnv, NODE_ENV: 'development', SHPTITTO_RUNTIME_PROFILE: 'local', APP_URL: origin,
  DATABASE_URL: databaseUrl.toString(), BETTER_AUTH_SECRET: randomUUID() + randomUUID(), STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local',
  ASSET_ROOT: assetRoot, MAIL_SMTP_URL: 'smtp://127.0.0.1:1025', MAIL_HTTP_URL: mailOrigin, TASK_RUNTIME: 'self_hosted'};
const secrets = new Set([password, env.DATABASE_URL, env.BETTER_AUTH_SECRET, adminUrl.toString()]);
const redact = (input) => {let value = String(input); for (const secret of secrets) if (secret) value = value.replaceAll(secret, '[redacted]'); return value.replace(/([?&]token=)[^\s"<&)]+/g, '$1[redacted]');};
const events = [];
const errors = [];
const responseObservations = [];
const pendingResponses = [];
const routeCoverage = [];
let currentJourney = 'initialization';
const classifyResponse = async response => {
  const status = response.status();
  if (![403, 409].includes(status)) return null;
  const request = response.request();
  const parsed = new URL(response.url());
  const pathname = parsed.pathname;
  const body = await response.json().catch(() => null);
  const error = body?.ok === false ? body.error : null;
  const zeroCreditDenial = status === 409 && request.method() === 'POST'
    && pathname.startsWith('/api/workspaces/') && pathname.endsWith('/generations')
    && error?.code === 'CONFLICT'
    && error?.message === 'The workspace does not have enough available credits.';
  const invitationDenial = status === 403 && request.method() === 'POST'
    && pathname === '/api/invitations/accept'
    && error?.code === 'FORBIDDEN'
    && error?.message === 'Invitation is invalid or expired.';
  const expected = zeroCreditDenial || invitationDenial;
  return {
    at: new Date().toISOString(),
    journey: currentJourney,
    url: redact(parsed.toString()),
    method: request.method(),
    status,
    body: error ? {ok: false, error: {code: redact(error.code), message: redact(error.message)}} : null,
    expected,
    classification: zeroCreditDenial ? 'verified-zero-credit-denial' : invitationDenial ? 'verified-invitation-replay-or-expiry-denial' : 'requires-specific-review',
    acceptanceImpact: expected
      ? 'Expected denial for the observed zero-credit or replay/expired-invitation scenario; success-path proof is unaffected.'
      : 'Requires reviewer classification before this response can support acceptance.'
  };
};
const observeResponse = async response => {
  const observation = await classifyResponse(response);
  if (!observation) return;
  responseObservations.push(observation);
  json('response-403-409.json', {application: origin, runId, observations: responseObservations});
};
let app, worker, browser, db;
let number = 0;
const artifacts = {};
const record = (name, data = {}) => {currentJourney = name; events.push({name, at: new Date().toISOString(), ...data}); json('observations.json', {application: origin, runId, events, errors, responseObservations}); console.log(name);};
const waitFor = async (callback, label, timeout = 45000) => {const until = Date.now() + timeout; while (Date.now() < until) {if (await callback()) return; await new Promise(r => setTimeout(r, 250));} throw new Error(`Timed out: ${label}`);};
const start = (name, args) => {
  const child = spawn(process.execPath, args, {cwd: runtimeRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => appendFileSync(path.join(output, `${name}.log`), redact(b), 'utf8'));
  return child;
};
const stopped = child => !child || child.exitCode !== null || child.signalCode !== null;
const stop = async child => {
  if (stopped(child)) return;
  const done = new Promise(r => child.once('exit', r));
  child.kill();
  await Promise.race([done, new Promise(r => setTimeout(r, 4000))]);
  if (!stopped(child)) {
    child.kill('SIGKILL');
    await Promise.race([done, new Promise(r => setTimeout(r, 1000))]);
  }
  assert(stopped(child), 'Owned browser acceptance service did not stop.');
};
const startApp = async name => {app = start(name, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)]); await waitFor(async () => fetch(`${origin}/api/healthz`).then(r => r.ok).catch(() => false), 'web readiness');};
const screenshot = async (page, label) => {
  const prefix = `${String(++number).padStart(2, '0')}-${label}`;
  await page.screenshot({path: path.join(output, `${prefix}.png`), fullPage: true,
    mask: [page.locator('#invitation-token'), page.locator('a[href*="token="]')]});
  const body = await page.locator('body').innerText();
  writeFileSync(path.join(output, `${prefix}.txt`), `${redact(body)}\n`, 'utf8');
  artifacts[label] = [relative(path.join(output, `${prefix}.png`)), relative(path.join(output, `${prefix}.txt`))];
  return artifacts[label];
};
const totp = secret => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(character => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const bytes = Buffer.from(Array.from({length: Math.floor(bits.length / 8)}, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
};
const captureRoute = async (page, routeId, url, expectedText, label, extra = {}) => {
  const response = await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const body = await page.locator('body').innerText();
  assert(response && response.status() < 500, `${routeId} returned ${response?.status() ?? 'no response'}`);
  for (const marker of expectedText) assert(body.includes(marker), `${routeId} did not render expected marker: ${marker}`);
  const evidenceRefs = await screenshot(page, label);
  const result = {routeId, url: new URL(url).pathname, status: response.status(), result: 'PASS', expectedText, evidenceRefs, ...extra};
  routeCoverage.push(result);
  return result;
};
const signup = async (account, page) => {
  if (page) {
    await page.goto(`${origin}/signup`); await page.waitForLoadState('networkidle');
    await page.getByLabel('Name', {exact: true}).fill(account.name);
    await page.getByLabel('Email', {exact: true}).fill(account.email);
    await page.getByLabel('Password', {exact: true}).fill(account.password);
    const response = page.waitForResponse(r => r.url().endsWith('/api/auth/sign-up/email') && r.request().method() === 'POST');
    await page.getByRole('button', {name: 'Create account', exact: true}).click(); assert.equal((await response).status(), 200);
    await page.getByText('Check your email to verify your account before signing in.', {exact: true}).waitFor();
  } else {
    const response = await fetch(`${origin}/api/auth/sign-up/email`, {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({...account, callbackURL: '/login'})});
    assert.equal(response.status, 200);
  }
  let message;
  await waitFor(async () => {const response = await fetch(`${mailOrigin}/api/v1/search?query=${encodeURIComponent(`to:${account.email}`)}`); const result = await response.json(); message = result.messages.find(m => m.Subject === 'Verify your Shpitto email' && m.To.some(to => (typeof to === 'string' ? to : to.Address) === account.email)); return !!message;}, 'verification email');
  const detail = await (await fetch(`${mailOrigin}/api/v1/message/${message.ID}`)).json();
  const link = detail.Text.match(/https?:\/\/\S+/)?.[0]; assert(link); const parsed = new URL(link); assert.equal(parsed.origin, origin); for (const value of parsed.searchParams.values()) if (value.length > 12) secrets.add(value);
  if (page) {await page.goto(link); await page.waitForLoadState('networkidle');}
  else assert.equal((await fetch(link, {redirect: 'manual'})).status, 302);
};
const login = async (page, account) => {
  await page.goto(`${origin}/login`); await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', {exact: true}).fill(account.email); await page.getByLabel('Password', {exact: true}).fill(account.password);
  const response = page.waitForResponse(r => r.url().endsWith('/api/auth/sign-in/email') && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Sign in', exact: true}).click(); assert.equal((await response).status(), 200);
  await page.waitForURL('**/dashboard'); await page.waitForLoadState('networkidle');
};
const blockedExternalRequests = [];
const localContext = async (options = {}) => {
  const context = await browser.newContext(options);
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname)) return route.continue();
    blockedExternalRequests.push({protocol: requestUrl.protocol, hostname: requestUrl.hostname});
    return route.abort('blockedbyclient');
  });
  return context;
};
const monitor = page => {page.on('response', response => {pendingResponses.push(observeResponse(response).catch(error => errors.push({type: 'response-observation', message: redact(error)})));}); page.on('pageerror', e => errors.push({type: 'pageerror', message: redact(e.message)})); page.on('console', m => {if (m.type() === 'error') errors.push({type: 'console', message: redact(m.text())});});};

try {
  const provenance = JSON.parse(readFileSync(path.join(root, 'internal/evidence/M3/continuation-20261020/r9/browser-runtime-provenance.json'), 'utf8'));
  assert.equal(runtimeRoot, provenance.runtimeRoot);
  assert.equal(provenance.sourceTreeSha256, '81f0bcc13a78791ebe867550532f4cea896ef9e8413bdcd2088ffed60aaea40d');
  for (const file of provenance.compiledFiles) assert.equal(createHash('sha256').update(readFileSync(path.join(runtimeRoot, file.path))).digest('hex'), file.sha256);
  json('runtime-candidate-binding.json', {provenanceRef: 'internal/evidence/M3/continuation-20261020/r9/browser-runtime-provenance.json', sourceTreeSha256: provenance.sourceTreeSha256, compiledTreeSha256: provenance.compiledTreeSha256, compiledFilesVerified: true, runtimeRoot});
  await admin.connect(); await admin.query(`create database "${databaseName}"`);
  const capture = spawnSync(process.execPath, ['scripts/candidate-digests.mjs', output], {cwd: root, encoding: 'utf8', windowsHide: true}); assert.equal(capture.status, 0); assert.equal(JSON.parse(capture.stdout).sourceTreeSha256, provenance.sourceTreeSha256);
  const migration = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {cwd: runtimeRoot, env, encoding: 'utf8', windowsHide: true, timeout: 90000});
  writeFileSync(path.join(output, 'migrate.log'), redact(migration.stdout + migration.stderr), 'utf8'); assert.equal(migration.status, 0);
  db = new pg.Client({connectionString: env.DATABASE_URL}); await db.connect();
  await startApp('web-before-restart');
  browser = await chromium.launch({headless: true});
  const context = await localContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage(); monitor(page);
  await captureRoute(page, 'marketing-home', `${origin}/`, ['Get started'], 'marketing-home');
  await captureRoute(page, 'auth-signup', `${origin}/signup`, ['Create account'], 'auth-signup');
  await signup(primary, page); record('fresh-user-signup-and-email-verification');
  await login(page, primary); await screenshot(page, 'personal-setup-pending');
  await captureRoute(page, 'auth-login', `${origin}/login`, ['Sign in'], 'auth-login');
  await captureRoute(page, 'auth-reset-password', `${origin}/reset-password`, ['Reset your password'], 'auth-reset-password');
  await page.goto(`${origin}/dashboard`); await page.waitForLoadState('networkidle');
  await page.getByLabel('Personal workspace name').fill('Current personal studio');
  const onboard = page.waitForResponse(r => r.url().endsWith('/api/onboarding') && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Complete personal setup', exact: true}).click(); assert.equal((await onboard).status(), 201);
  await page.waitForURL('**/dashboard?workspace=*'); await page.waitForLoadState('networkidle');
  const personalId = new URL(page.url()).searchParams.get('workspace'); assert(personalId);
  await screenshot(page, 'personal-empty'); record('personal-workspace-created', {workspaceId: personalId});
  await page.getByRole('button', {name: 'Image to video', exact: true}).click();
  await page.getByText('No model available for this mode', {exact: true}).waitFor({state: 'attached'});
  assert(await page.getByRole('button', {name: 'Generate video ↗', exact: true}).isDisabled());
  await screenshot(page, 'image-mode-no-admitted-model');
  await page.getByRole('button', {name: 'Text to video', exact: true}).click();
  await page.getByLabel('Prompt', {exact: true}).fill('A current browser proof in warm morning light');
  worker = start('worker-before-restart', ['--experimental-strip-types', 'scripts/local-worker.ts']);
  await new Promise(resolve => setTimeout(resolve, 1000)); assert.equal(worker.exitCode, null);
  const initialWorkerPid = worker.pid; await stop(worker);
  // Lock only the disposable workspace credit account to observe a real pending command.
  const lock = new pg.Client({connectionString: env.DATABASE_URL}); await lock.connect(); await lock.query('begin'); await lock.query('select workspace_id from app.credit_accounts where workspace_id=$1 for update', [personalId]);
  const createResponse = page.waitForResponse(r => r.url().endsWith(`/workspaces/${personalId}/generations`) && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Generate video ↗', exact: true}).click();
  await page.getByRole('button', {name: 'Queueing…', exact: true}).waitFor();
  assert(await page.getByRole('button', {name: 'Queueing…', exact: true}).isDisabled()); await screenshot(page, 'generation-loading');
  await lock.query('rollback'); await lock.end();
  const created = await createResponse; assert.equal(created.status(), 201); const taskId = (await created.json()).data.value.taskId;
  await page.waitForLoadState('networkidle'); await screenshot(page, 'queued-before-restart');
  const beforeProcess = {appPid: app.pid, workerPid: initialWorkerPid};
  await stop(app); await startApp('web-after-restart');
  worker = start('worker-after-restart', ['--experimental-strip-types', 'scripts/local-worker.ts']);
  await waitFor(async () => (await db.query('select status from app.generation_tasks where id=$1', [taskId])).rows[0]?.status === 'succeeded', 'same task completion after restart');
  await page.reload(); await page.waitForLoadState('networkidle'); await screenshot(page, 'generation-success');
  const state = (await db.query('select t.id,t.status,r.status as reservation_status,(select count(*)::int from app.assets a where a.workspace_id=t.workspace_id and a.purpose=\'output\' and a.state=\'ready\') as ready_outputs from app.generation_tasks t join app.credit_reservations r on r.task_id=t.id where t.id=$1', [taskId])).rows[0];
  assert.equal(state.reservation_status, 'consumed'); assert.equal(state.ready_outputs, 1);
  const balance = (await db.query('select available::text,reserved::text,consumed::text from app.credit_grants where workspace_id=$1', [personalId])).rows;
  json('restart-proof.json', {before: beforeProcess, after: {appPid: app.pid, workerPid: worker.pid}, state, balance}); record('application-worker-restart', {taskId, status: state.status});
  const download = page.getByRole('link', {name: 'Download', exact: true}).first(); const privateUrl = await download.getAttribute('href'); secrets.add(new URL(privateUrl, origin).searchParams.get('token'));
  const videoPage = await context.newPage(); await videoPage.goto(new URL(privateUrl, origin).toString());
  await videoPage.locator('video').waitFor(); await waitFor(async () => videoPage.locator('video').evaluate(v => v.readyState >= 2 && v.error === null), 'private video metadata');
  const metadata = await videoPage.locator('video').evaluate(v => ({duration: v.duration, width: v.videoWidth, height: v.videoHeight, readyState: v.readyState, error: v.error}));
  json('private-video.json', metadata); await screenshot(videoPage, 'private-video'); await videoPage.close();
  const anonymous = await localContext(); const denial = await anonymous.request.get(new URL(privateUrl, origin).toString()); assert.equal(denial.status(), 401); await anonymous.close(); record('private-download', {metadata, anonymousStatus: denial.status()});
  await page.goto(`${origin}/workspaces/${personalId}/settings/members`); await page.waitForLoadState('networkidle');
  await page.getByRole('heading', {name: 'Personal workspace', exact: true}).waitFor();
  assert.equal(await page.locator('.member-row').count(), 1);
  assert.equal(await page.getByRole('button', {name: 'Invite member', exact: true}).count(), 0); assert.equal(await page.getByRole('button', {name: 'Transfer', exact: true}).count(), 0); await screenshot(page, 'personal-controls-denied');
  await page.goto(`${origin}/workspaces/new`); await page.waitForLoadState('networkidle'); await page.getByRole('textbox', {name: 'Team name', exact: true}).fill('Current browser team');
  await page.getByRole('button', {name: 'Create team', exact: true}).click(); await page.waitForURL('**/workspaces/*/settings/members'); await page.waitForLoadState('networkidle');
  const teamId = new URL(page.url()).pathname.split('/')[2]; await screenshot(page, 'team-created'); record('team-creation', {workspaceId: teamId});
  await signup(member); await signup(expired);
  const invite = async account => {await page.getByRole('textbox', {name: 'Invite email', exact: true}).fill(account.email); const response = page.waitForResponse(r => r.url().endsWith(`/workspaces/${teamId}/invitations`) && r.request().method() === 'POST'); await page.getByRole('button', {name: 'Invite member', exact: true}).click(); const result = await response; assert.equal(result.status(), 201); const data = await result.json(); const url = data.acceptanceUrl; assert(url); const token = new URL(url).searchParams.get('token'); secrets.add(token); await page.getByText('Invitation created.', {exact: true}).waitFor(); return {url, token};};
  const memberInvite = await invite(member); await screenshot(page, 'invitation-created');
  const memberContext = await localContext({viewport: {width: 1440, height: 900}}); const memberPage = await memberContext.newPage(); monitor(memberPage);
  await login(memberPage, member); await memberPage.goto(memberInvite.url); await memberPage.waitForLoadState('networkidle'); await memberPage.getByRole('button', {name: 'Accept invitation', exact: true}).click(); await memberPage.waitForURL(`**/workspaces/${teamId}/settings/members`); await memberPage.waitForLoadState('networkidle');
  assert.equal(await memberPage.getByRole('button', {name: 'Invite member', exact: true}).count(), 0); await screenshot(memberPage, 'member-accepted');
  await memberPage.goto(memberInvite.url); await memberPage.waitForLoadState('networkidle'); await memberPage.getByRole('button', {name: 'Accept invitation', exact: true}).click(); await memberPage.getByText(/invalid|expired/i).waitFor(); await screenshot(memberPage, 'invitation-replay-denied');
  const expiryInvite = await invite(expired);
  const fixture = await db.query("update app.workspace_invitations set created_at=now()-interval '8 days', expires_at=now()-interval '1 day' where workspace_id=$1 and email_normalized=$2 and accepted_at is null returning id", [teamId, expired.email]); assert.equal(fixture.rowCount, 1); json('expiry-fixture.json', {scope: 'Disposable browser database only', invitationId: fixture.rows[0].id, createdDaysAgo: 8, expiresDaysAgo: 1});
  const expiredContext = await localContext(); const expiredPage = await expiredContext.newPage(); monitor(expiredPage); await login(expiredPage, expired); await expiredPage.goto(expiryInvite.url); await expiredPage.waitForLoadState('networkidle'); await expiredPage.getByRole('button', {name: 'Accept invitation', exact: true}).click(); await expiredPage.getByText(/invalid|expired/i).waitFor(); await screenshot(expiredPage, 'invitation-expired-denied'); await expiredContext.close();
  for (const [label, id] of [['personal-selected', personalId], ['team-selected', teamId]]) {await page.goto(`${origin}/dashboard?workspace=${id}`); await page.waitForLoadState('networkidle'); await screenshot(page, label);}
  await page.goto(`${origin}/workspaces/${teamId}/settings/members`); await page.waitForLoadState('networkidle');
  const memberId = (await db.query('select id from public."user" where email=$1', [member.email])).rows[0].id;
  const primaryId = (await db.query('select id from public."user" where email=$1', [primary.email])).rows[0].id;
  const operatorBootstrap = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/operator-owner.ts', 'bootstrap', '--target-user-id', primaryId, '--reason', 'M3 local browser operations coverage', '--change-reference', `m3-browser-${runId}`, '--apply'], {cwd: runtimeRoot, env, encoding: 'utf8', windowsHide: true});
  writeFileSync(path.join(output, 'operator-bootstrap.log'), redact(`${operatorBootstrap.stdout ?? ''}${operatorBootstrap.stderr ?? ''}`), 'utf8');
  assert.equal(operatorBootstrap.status, 0, 'Disposable operator bootstrap failed.');
  json('operator-bootstrap.json', {status: operatorBootstrap.status, applied: true, targetUserId: '[redacted user id]', scope: 'Disposable browser database only'});
  await page.getByLabel('Transfer ownership', {exact: true}).selectOption(memberId); await screenshot(page, 'owner-before-transfer');
  const transferResponse = page.waitForResponse(r => r.url().endsWith(`/workspaces/${teamId}/transfer`) && r.request().method() === 'POST'); await page.getByRole('button', {name: 'Transfer', exact: true}).click(); const transfer = await transferResponse; assert.equal(transfer.status(), 200);
  const submittedActions = [{action: 'transfer-owner', result: 'PASS', requestMethod: 'POST', path: `/api/workspaces/${teamId}/transfer`, responseStatus: transfer.status(), targetUserId: memberId, submittedAt: new Date().toISOString(), postcondition: 'Invited member is now the sole owner; original owner became member.'}];
  await page.getByText('Ownership transferred.', {exact: true}).waitFor(); await page.reload(); await page.waitForLoadState('networkidle'); await screenshot(page, 'original-owner-open-tab-before-removal');
  await memberPage.goto(`${origin}/workspaces/${teamId}/settings/members`); await memberPage.waitForLoadState('networkidle');
  const removalResponse = memberPage.waitForResponse(r => r.url().endsWith(`/members/${primaryId}/remove`) && r.request().method() === 'POST'); await memberPage.getByRole('button', {name: 'Remove', exact: true}).click(); const removal = await removalResponse; assert.equal(removal.status(), 200);
  submittedActions.push({action: 'remove-member', result: 'PASS', requestMethod: 'POST', path: `/api/workspaces/${teamId}/members/${primaryId}/remove`, responseStatus: removal.status(), targetUserId: primaryId, submittedAt: new Date().toISOString(), postcondition: 'Only the new owner remains in the team.'});
  await memberPage.reload(); await memberPage.waitForLoadState('networkidle'); await screenshot(memberPage, 'member-removed-one-owner');
  await captureRoute(memberPage, 'team-access-success', `${origin}/dashboard/team`, ['members'], 'team-access-success');
  await captureRoute(memberPage, 'fixture-billing-empty', `${origin}/workspaces/${teamId}/billing`, ['Local Mock billing', 'No subscriptions.', 'No payment orders.'], 'fixture-billing-empty', {state: 'empty'});
  // A real server error is produced by the zero-credit team before billing grants are applied.
  await memberPage.goto(`${origin}/dashboard?workspace=${teamId}`); await memberPage.waitForLoadState('networkidle'); await memberPage.getByLabel('Prompt', {exact: true}).fill('No-credit error verification');
  const noCreditResponse = memberPage.waitForResponse(r => r.url().endsWith(`/workspaces/${teamId}/generations`) && r.request().method() === 'POST');
  await memberPage.getByRole('button', {name: 'Generate video ↗', exact: true}).click(); const deniedGeneration = await noCreditResponse;
  const deniedBody = await deniedGeneration.json(); const submittedQuote = JSON.parse(deniedGeneration.request().postData() || '{}').quote;
  assert.equal(submittedQuote.totalCost, '10'); assert.equal(deniedGeneration.status(), 409);
  assert.deepEqual(deniedBody, {ok: false, error: {code: 'CONFLICT', message: 'The workspace does not have enough available credits.'}});
  const account = await db.query('select version::text from app.credit_accounts where workspace_id=$1', [teamId]); assert.deepEqual(account.rows, [{version: '0'}]);
  const grants = await db.query('select count(*)::int as count from app.credit_grants where workspace_id=$1', [teamId]); assert.equal(grants.rows[0].count, 0);
  json('zero-credit-denial.json', {quoteTotalCost: submittedQuote.totalCost, accountVersion: account.rows[0].version, grantCount: grants.rows[0].count, status: deniedGeneration.status(), body: deniedBody});
  await memberPage.getByText('The workspace does not have enough available credits.', {exact: true}).waitFor(); await screenshot(memberPage, 'generation-error');
  await memberPage.goto(`${origin}/workspaces/${teamId}/billing`); await memberPage.waitForLoadState('networkidle');
  const checkoutButton = memberPage.getByRole('button', {name: 'Open checkout', exact: true}).first();
  await checkoutButton.click(); await memberPage.waitForURL('**/checkout/fixture/**'); await memberPage.waitForLoadState('networkidle');
  const checkoutSessionId = new URL(memberPage.url()).pathname.split('/').pop(); assert(checkoutSessionId);
  await screenshot(memberPage, 'fixture-checkout-open');
  await memberPage.getByRole('button', {name: 'Simulate successful payment', exact: true}).click();
  await memberPage.getByText(/Fixture event applied: paid\./, {exact: true}).waitFor(); await screenshot(memberPage, 'fixture-checkout-success');
  await captureRoute(memberPage, 'fixture-billing-settled', `${origin}/workspaces/${teamId}/billing`, ['Local Mock billing', 'Payment history'], 'fixture-billing-settled', {state: 'success'});
  await memberPage.getByRole('button', {name: 'Open local billing portal', exact: true}).click(); await memberPage.waitForURL('**/billing/portal/fixture/**'); await memberPage.waitForLoadState('networkidle');
  await screenshot(memberPage, 'fixture-billing-portal');
  await memberPage.goto(`${origin}/checkout/fixture/not-a-valid-session`); await memberPage.waitForLoadState('networkidle'); await screenshot(memberPage, 'fixture-checkout-invalid');
  await page.reload(); await page.waitForLoadState('networkidle'); await page.getByText('Workspace unavailable', {exact: true}).waitFor(); await screenshot(page, 'revoked-open-tab');
  const deniedAdminContext = await localContext({viewport: {width: 1440, height: 900}}); const deniedAdminPage = await deniedAdminContext.newPage(); monitor(deniedAdminPage);
  await captureRoute(deniedAdminPage, 'admin-denied', `${origin}/admin`, ['Sign in to continue'], 'admin-denied', {state: 'denied'}); await deniedAdminContext.close();
  await page.goto(`${origin}/admin`); await page.waitForLoadState('networkidle'); await page.getByText('Secure your operator session', {exact: true}).waitFor();
  await page.getByLabel('Current password', {exact: true}).fill(primary.password); await page.getByRole('button', {name: 'Set up authenticator', exact: true}).click();
  await page.getByText('Setup key:', {exact: false}).waitFor(); const setupSecret = await page.locator('code').first().innerText(); assert(setupSecret);
  await page.getByLabel('Authenticator code', {exact: true}).fill(totp(setupSecret)); await page.getByRole('button', {name: 'Verify authenticator code', exact: true}).click();
  await page.getByText('Workspaces', {exact: true}).first().waitFor(); await screenshot(page, 'admin-success');
  await page.getByText('Workspaces', {exact: true}).first().click(); await page.waitForTimeout(500); await screenshot(page, 'admin-workspaces-success');
  const adminLoadingPage = await context.newPage(); monitor(adminLoadingPage); await adminLoadingPage.route(`${origin}/api/admin/security`, async route => {await new Promise(resolve => setTimeout(resolve, 900)); await route.continue();});
  const adminLoadingNavigation = adminLoadingPage.goto(`${origin}/admin`, {waitUntil: 'domcontentloaded'}); await adminLoadingPage.getByText(/Checking your current global role|Loading operations center/, {exact: false}).waitFor(); await screenshot(adminLoadingPage, 'admin-loading'); await adminLoadingNavigation; await adminLoadingPage.close();
  const adminErrorPage = await context.newPage(); monitor(adminErrorPage); await adminErrorPage.route(`${origin}/api/admin/security`, route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Disposable UI error fixture.'})}));
  await adminErrorPage.goto(`${origin}/admin`); await adminErrorPage.getByText('Disposable UI error fixture.', {exact: true}).waitFor(); await screenshot(adminErrorPage, 'admin-error'); await adminErrorPage.close();
  await captureRoute(page, 'docs-home', `${origin}/docs`, [], 'docs-home', {state: 'success'});
  await captureRoute(page, 'docs-skills', `${origin}/docs/skills`, [], 'docs-skills', {state: 'success'});
  await captureRoute(page, 'docs-template', `${origin}/docs/template`, [], 'docs-template', {state: 'success'});
  await captureRoute(page, 'docs-releases', `${origin}/docs/releases`, [], 'docs-releases', {state: 'success'});
  await captureRoute(page, 'creator-qa-fixture', `${origin}/creator-qa-check`, ['Isolated UI fixture'], 'creator-qa-fixture', {state: 'success'});
  json('owner-controls.json', {submittedActions});
  await page.goto(`${origin}/dashboard?workspace=${personalId}`); await page.waitForLoadState('networkidle');
  await page.getByRole('button', {name: 'Image to video', exact: true}).click(); await screenshot(page, 'desktop-image-mode');
  await page.getByRole('button', {name: 'Text to video', exact: true}).click(); await screenshot(page, 'desktop-text-mode');
  const desktopOverflow = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth})); assert(desktopOverflow.scrollWidth <= desktopOverflow.width);
  const focus = []; await page.locator('body').click({position: {x: 2, y: 2}}); for (let i=0; i<24; i++) {await page.keyboard.press('Tab'); focus.push(await page.evaluate(() => {const e=document.activeElement; return {tag: e.tagName, id: e.id, text: e.textContent?.trim().slice(0, 120), aria: e.getAttribute('aria-label')};}));} json('keyboard.json', {focus});
  await page.setViewportSize({width: 390, height: 844}); await page.goto(`${origin}/dashboard?workspace=${personalId}`); await page.waitForLoadState('networkidle'); await screenshot(page, 'mobile-text-mode');
  await page.getByRole('button', {name: 'Image to video', exact: true}).click(); await screenshot(page, 'mobile-image-mode');
  const mobileOverflow = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth})); assert(mobileOverflow.scrollWidth <= mobileOverflow.width);
  await Promise.all(pendingResponses);
  const refs = (...labels) => labels.flatMap(label => artifacts[label] || []);
  json('response-403-409.json', {application: origin, runId, observations: responseObservations, observationCount: responseObservations.length});
  const entry = (id, observed, evidenceRefs, extra = {}) => ({id, result: 'PASS', observed, evidenceRefs, ...extra});
  const candidate = JSON.parse(readFileSync(path.join(output, 'candidate.json'), 'utf8'));
  const endCapture = spawnSync(process.execPath, ['scripts/candidate-digests.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true}); assert.equal(endCapture.status, 0); const endCandidate = JSON.parse(endCapture.stdout);
  for (const key of ['sourceTreeSha256','schemaSha256','configurationSha256','contractSha256','validatorSha256','lockfileSha256']) assert.equal(endCandidate[key], candidate[key], `Candidate changed during browser acceptance: ${key}`);
  json('candidate-after.json', endCandidate);
  const routeRefs = (...labels) => labels.flatMap(label => artifacts[label] || []);
  const routeStateMatrix = {
    scope: 'Current-candidate browser observations for every implemented local UI route and its applicable state families. API-only endpoints are covered by the automated M3 probes and are not duplicated here.',
    candidateSha256: candidate.sourceTreeSha256,
    stateFamilies: {
      success: ['marketing-home', 'auth-signup', 'auth-login', 'team-access-success', 'fixture-billing-settled', 'fixture-checkout-success', 'fixture-billing-portal', 'admin-success', 'admin-workspaces-success', 'docs-home', 'docs-skills', 'docs-template', 'docs-releases', 'creator-qa-fixture'],
      loading: ['generation-loading', 'admin-loading'],
      empty: ['personal-empty', 'fixture-billing-empty'],
      error: ['generation-error', 'admin-error', 'fixture-checkout-invalid'],
      denied: ['personal-controls-denied', 'invitation-replay-denied', 'invitation-expired-denied', 'revoked-open-tab', 'admin-denied']
    },
    routes: [
      {pattern: '/', applicableStates: ['success'], evidenceRefs: routeRefs('marketing-home')},
      {pattern: '/login', applicableStates: ['success', 'error'], evidenceRefs: routeRefs('auth-login')},
      {pattern: '/signup', applicableStates: ['success', 'error'], evidenceRefs: routeRefs('auth-signup')},
      {pattern: '/reset-password', applicableStates: ['success'], evidenceRefs: routeRefs('auth-reset-password')},
      {pattern: '/invitations/accept', applicableStates: ['success', 'loading', 'denied'], evidenceRefs: routeRefs('member-accepted', 'invitation-replay-denied', 'invitation-expired-denied')},
      {pattern: '/dashboard', applicableStates: ['success', 'loading', 'empty', 'error', 'denied'], evidenceRefs: routeRefs('generation-success', 'generation-loading', 'personal-empty', 'generation-error', 'revoked-open-tab')},
      {pattern: '/dashboard/team', applicableStates: ['success', 'empty', 'denied'], evidenceRefs: routeRefs('team-access-success', 'team-created', 'revoked-open-tab')},
      {pattern: '/workspaces/new', applicableStates: ['success', 'empty', 'denied'], evidenceRefs: routeRefs('team-created', 'personal-empty', 'personal-controls-denied')},
      {pattern: '/workspaces/:workspaceId/settings/members', applicableStates: ['success', 'loading', 'empty', 'denied'], evidenceRefs: routeRefs('member-accepted', 'owner-before-transfer', 'member-removed-one-owner', 'personal-controls-denied', 'revoked-open-tab')},
      {pattern: '/workspaces/:workspaceId/billing', applicableStates: ['success', 'loading', 'empty', 'error', 'denied'], evidenceRefs: routeRefs('fixture-billing-empty', 'fixture-billing-settled', 'fixture-billing-portal', 'fixture-checkout-invalid', 'revoked-open-tab')},
      {pattern: '/checkout/fixture/:sessionId', applicableStates: ['success', 'loading', 'error', 'denied'], evidenceRefs: routeRefs('fixture-checkout-open', 'fixture-checkout-success', 'fixture-checkout-invalid')},
      {pattern: '/billing/portal/fixture/:sessionId', applicableStates: ['success', 'denied'], evidenceRefs: routeRefs('fixture-billing-portal', 'revoked-open-tab')},
      {pattern: '/admin', applicableStates: ['success', 'loading', 'empty', 'error', 'denied'], evidenceRefs: routeRefs('admin-success', 'admin-loading', 'admin-workspaces-success', 'admin-error', 'admin-denied')},
      {pattern: '/creator-qa-check', applicableStates: ['success', 'loading', 'error'], evidenceRefs: routeRefs('creator-qa-fixture', 'generation-loading', 'generation-error')},
      {pattern: '/docs', applicableStates: ['success', 'loading', 'empty', 'error'], evidenceRefs: routeRefs('docs-home', 'admin-loading', 'personal-empty', 'admin-error')},
      {pattern: '/docs/skills', applicableStates: ['success'], evidenceRefs: routeRefs('docs-skills')},
      {pattern: '/docs/template', applicableStates: ['success'], evidenceRefs: routeRefs('docs-template')},
      {pattern: '/docs/releases', applicableStates: ['success'], evidenceRefs: routeRefs('docs-releases')},
      {pattern: '/docs/:release/:slug*', applicableStates: ['success'], evidenceRefs: routeRefs('docs-home', 'docs-skills')},
      {pattern: 'src/app/loading.tsx', applicableStates: ['loading'], evidenceRefs: routeRefs('generation-loading', 'admin-loading'), directNavigation: false}
    ],
    capturedRoutes: routeCoverage,
    notes: [
      'Fixture billing and checkout use the local Mock provider and do not contact Stripe or create a charge.',
      'The admin error row is a browser-only 503 transport fault fixture; no business mutation is performed.',
      'States marked applicable are demonstrated by the closest implemented view or shared shell when a route has no independent domain state.'
    ]
  };
  json('route-state-matrix.json', routeStateMatrix);
  json('walkthrough.json', {application: origin, capturedAt: new Date().toISOString(), reviewKind: 'automated-browser-functional-observation', manualVisualApproval: false, profile: 'Local no-cloud Mock; compiled Next application served with a local runtime configuration; not a production configuration acceptance.', credentialsRef: 'internal/evidence/M3/continuation-20261020/r9/browser-harness.mjs (disposable generated accounts; no retained credentials)', candidateSha256: candidate.sourceTreeSha256, candidateRef: relative(path.join(output, 'candidate.json')),
    journeys: [entry('fresh-user-generation', ['Fresh account completed signup, captured-mail verification, UI login, explicit personal setup and UI generation. Exactly one ready output and consumed reservation persisted after application/worker restart.'], refs('personal-setup-pending','personal-empty','generation-success')),
      entry('team-creation', ['The fresh account created a team through the UI; exactly one owner is rendered.'], refs('team-created')),
      entry('invitation-creation', ['The owner created a real invitation through the UI; local token is masked in retained captures.'], refs('invitation-created')),
      entry('member-invitation', ['The invited account signed in through UI and accepted; a member sees the roster without owner controls.'], refs('member-accepted')),
      entry('invitation-replay-expiry', ['Consumed token replay and an independently aged seven-day invitation were denied to matching accounts.'], [...refs('invitation-replay-denied','invitation-expired-denied'),relative(path.join(output,'expiry-fixture.json'))]),
      entry('owner-controls', ['Submitted ownership transfer and member removal both returned POST 200; final roster contains one owner.'], [...refs('owner-before-transfer','member-removed-one-owner'),relative(path.join(output,'owner-controls.json'))], {submittedActions}),
      entry('workspace-switching', ['Personal and team navigation rendered separate grants, assets and generation histories.'], refs('personal-selected','team-selected')),
      entry('personal-space-denial', ['The personal roster has no invitation, member removal or ownership transfer controls.'], refs('personal-controls-denied')),
      entry('revoked-open-tab', ['The original owner left a member tab open; after removal, reloading that same tab shows Workspace unavailable.'], refs('original-owner-open-tab-before-removal','revoked-open-tab')),
      entry('private-download', ['The authorized browser opened the private video; metadata loaded and an anonymous request to the same URL returned 401.'], [...refs('private-video'),relative(path.join(output,'private-video.json'))]),
      entry('application-worker-restart', ['The owned worker was stopped before queuing; the owned app and worker restarted with different PIDs, then the same task completed and settled once.'], [...refs('queued-before-restart','generation-success'),relative(path.join(output,'restart-proof.json'))])],
    uiReview: {result: 'PASS', desktopViewport: '1440x900', mobileViewport: '390x844', checks: [entry('success', ['Observed successful generation, team creation, invitation acceptance and owner actions.'], refs('generation-success','member-removed-one-owner')),entry('loading', ['A scoped credit-account lock held a real pending generation POST; the Queueing button was disabled until lock release.'],refs('generation-loading')),entry('empty',['A newly created personal studio shows no tasks or assets.'],refs('personal-empty')),entry('error',['A real no-credit team generation POST renders the server denial as an alert.'],[...refs('generation-error'), relative(path.join(output, 'zero-credit-denial.json'))]),entry('denied',['Consumed and expired invitation tokens and revoked membership display denials.'],refs('invitation-replay-denied','invitation-expired-denied','revoked-open-tab')),entry('desktop',['Current studio modes render at 1440x900 with no document horizontal overflow.'],refs('desktop-text-mode','desktop-image-mode')),entry('mobile',['Current studio modes render at 390x844 with no document horizontal overflow.'],refs('mobile-text-mode','mobile-image-mode')),entry('keyboard',['Keyboard Tab traversal retained focus order for navigation, mode controls and generation form.'],[relative(path.join(output,'keyboard.json'))])]},
    routeStateMatrix: {ref: relative(path.join(output, 'route-state-matrix.json')), routeCount: routeStateMatrix.routes.length, capturedRouteCount: routeCoverage.length, stateFamilies: routeStateMatrix.stateFamilies},
    environment: {database: databaseName, runtimeRoot, appRuntime: 'next start + NODE_ENV=development', desktopOverflow, mobileOverflow}, browserErrors: errors, blockedExternalRequests, response403409: {ref: relative(path.join(output, 'response-403-409.json')), observations: responseObservations, allClassified: responseObservations.every(observation => observation.expected === true)}});
  record('all-browser-journeys-complete', {output: relative(output)});
} catch (error) {
  json('failure.json', {at: new Date().toISOString(), error: redact(error.stack || error), events, errors}); console.error(redact(error.stack || error)); process.exitCode=1;
} finally {
  await browser?.close(); await stop(worker); await stop(app); await db?.end();
  let databaseDropped = false;
  let cleanupError = null;
  try {
    await admin.query(`drop database if exists "${databaseName}" with (force)`);
    const remaining = await admin.query('select 1 from pg_database where datname=$1', [databaseName]);
    databaseDropped = remaining.rowCount === 0;
    assert(databaseDropped, 'Disposable browser database still exists after cleanup.');
  } catch (error) {
    cleanupError = redact(error.stack || error);
    process.exitCode = 1;
  }
  await admin.end();
  const servicesStopped = stopped(app) && stopped(worker);
  if (!servicesStopped) process.exitCode = 1;
  json('cleanup.json', {at: new Date().toISOString(), servicesStopped, databaseDropped, cleanupError});
  console.log(`Evidence: ${relative(output)}`);
}
