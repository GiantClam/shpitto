import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(packet, 'browser-run');
const expectedBrowserDigest = JSON.parse(spawnSync(process.execPath, ['scripts/candidate-digests.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true}).stdout).sourceTreeSha256;
assert.equal(existsSync(output), false, 'Select a fresh browser output directory.');
mkdirSync(output, {recursive: true});

const compose = readFileSync(path.join(root, 'deploy/compose.local.yml'), 'utf8');
const declared = Object.fromEntries(['USER', 'PASSWORD'].map((key) => {
  const match = compose.match(new RegExp(`^\\s+POSTGRES_${key}: ([^\\r\\n]+)$`, 'm'));
  assert.ok(match, `Missing local PostgreSQL ${key}.`);
  return [key, match[1].trim()];
}));
const adminUrl = new URL('postgres://127.0.0.1:55432/postgres');
adminUrl.username = declared.USER;
adminUrl.password = declared.PASSWORD;
const sourceEnv = {...process.env};
for (const name of ['.env', '.env.local']) {
  if (!existsSync(path.join(root, name))) continue;
  for (const line of readFileSync(path.join(root, name), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) sourceEnv[match[1]] = '';
  }
}
for (const key of Object.keys(sourceEnv)) {
  if (/^(FAL_|REPLICATE_|STRIPE_|TRIGGER_|FIRSTPROMOTER_|RAILWAY_|STORAGE_S3_|AFFILIATE_|SHPITTO_PROVIDER_WORKER_|BILLING_)/.test(key)) sourceEnv[key] = '';
}
const env = {
  ...sourceEnv,
  NODE_ENV: 'production',
  APP_URL: 'http://127.0.0.1:3199',
  DATABASE_URL: adminUrl.toString(),
  BETTER_AUTH_SECRET: 'local-m3-r4b-build-authentication-secret',
  STORAGE_DRIVER: 's3-compatible',
  GENERATION_DRIVER: 'provider',
  MAIL_DRIVER: 'smtp',
  MAIL_SMTP_URL: 'smtp://127.0.0.1:1025',
  MAIL_HTTP_URL: 'http://127.0.0.1:8025',
  TASK_RUNTIME: 'self_hosted',
  ASSET_ROOT: path.join(root, '.data', 'm3-r4b-assets'),
  NEXT_TELEMETRY_DISABLED: '1',
};
const redact = (value) => String(value).replaceAll(adminUrl.toString(), '[redacted database URL]').replaceAll(declared.PASSWORD, '[redacted]');
const json = (name, value) => writeFileSync(path.join(packet, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const candidateResult = spawnSync(process.execPath, ['scripts/candidate-digests.mjs', output], {cwd: root, encoding: 'utf8', windowsHide: true});
assert.equal(candidateResult.status, 0, redact(candidateResult.stderr));
const candidate = JSON.parse(readFileSync(path.join(output, 'candidate.json'), 'utf8'));
assert.equal(candidate.sourceTreeSha256, expectedBrowserDigest);

const pnpm = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const build = spawnSync(pnpm, ['pnpm', 'build'], {cwd: root, env, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32', timeout: 20 * 60 * 1000, maxBuffer: 32 * 1024 * 1024});
writeFileSync(path.join(packet, 'fresh-browser-build.log'), redact(`${build.stdout ?? ''}${build.stderr ?? ''}`), 'utf8');
assert.equal(build.status, 0, 'Fresh current-candidate browser build failed.');

const compiledFiles = [];
function visit(directory) {
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const relative = path.relative(path.join(root, '.next'), file).split(path.sep)[0];
    if (['cache', 'node_modules', 'standalone'].includes(relative)) continue;
    if (statSync(file).isDirectory()) visit(file);
    else {
      const bytes = readFileSync(file);
      compiledFiles.push({path: path.relative(root, file).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes)});
    }
  }
}
visit(path.join(root, '.next'));
const compiledTreeSha256 = hash(compiledFiles.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n'));
json('browser-runtime-provenance.json', {
  createdAt: new Date().toISOString(),
  runtimeRoot: root,
  sourceTreeSha256: candidate.sourceTreeSha256,
  allSixCandidateDigests: candidate,
  sourceSnapshotVerifiedAgainstCandidate: true,
  buildId: readFileSync(path.join(root, '.next', 'BUILD_ID'), 'utf8').trim(),
  buildCommand: {invocation: 'pnpm build', status: 'PASS', outputRef: 'internal/evidence/M3/continuation-20261019/r4b/fresh-browser-build.log'},
  compiledFiles,
  compiledTreeSha256,
  interpretation: 'Fresh current-candidate local browser runtime; no release or production acceptance is asserted.',
});

const original = readFileSync(path.join(root, 'internal/evidence/M3/continuation-20261019/r2/browser-harness-executed-attempt2.mjs'), 'utf8');
const harness = original
  .replaceAll('internal/evidence/M3/continuation-20261019/r2', 'internal/evidence/M3/continuation-20261019/r4b/browser-run')
  .replaceAll('e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be', candidate.sourceTreeSha256)
  .replaceAll('internal/evidence/M3/continuation-20261019/r2/browser-harness.mjs', 'internal/evidence/M3/continuation-20261019/r4b/browser-harness.mjs')
  .replaceAll('internal/evidence/M3/continuation-20261019/r4b/browser-run/browser-runtime-provenance.json', 'internal/evidence/M3/continuation-20261019/r4b/browser-runtime-provenance.json')
  .replace('const errors = [];', `const errors = [];
const responseObservations = [];
let currentJourney = 'initialization';
const classifyResponse = response => {
  const status = response.status();
  if (![403, 409].includes(status)) return null;
  const request = response.request();
  const parsed = new URL(response.url());
  const pathname = parsed.pathname;
  const invitationRoute = pathname.includes('/invitations');
  const membershipRoute = pathname.includes('/members') || pathname.includes('/settings/members');
  const ownershipRoute = pathname.includes('/transfer');
  const expected = status === 403
    ? invitationRoute || membershipRoute || ownershipRoute || currentJourney.includes('denied') || currentJourney.includes('revoked')
    : invitationRoute || currentJourney.includes('invitation');
  return {
    at: new Date().toISOString(),
    journey: currentJourney,
    url: redact(parsed.toString()),
    method: request.method(),
    status,
    expected,
    classification: expected ? 'expected-authorization-or-conflict-path' : 'unclassified-response',
    acceptanceImpact: expected
      ? 'Expected denial/conflict recorded separately; no success-path criterion is downgraded.'
      : 'Requires reviewer classification before this response can support acceptance.'
  };
};
const observeResponse = response => {
  const observation = classifyResponse(response);
  if (!observation) return;
  responseObservations.push(observation);
  json('response-403-409.json', {application: origin, runId, observations: responseObservations});
};`)
  .replace("const record = (name, data = {}) => {events.push({name, at: new Date().toISOString(), ...data}); json('observations.json', {application: origin, runId, events, errors}); console.log(name);};", "const record = (name, data = {}) => {currentJourney = name; events.push({name, at: new Date().toISOString(), ...data}); json('observations.json', {application: origin, runId, events, errors, responseObservations}); console.log(name);};")
  .replace("const monitor = page => {page.on('pageerror', e => errors.push({type: 'pageerror', message: redact(e.message)})); page.on('console', m => {if (m.type() === 'error') errors.push({type: 'console', message: redact(m.text())});});};", "const monitor = page => {page.on('response', observeResponse); page.on('pageerror', e => errors.push({type: 'pageerror', message: redact(e.message)})); page.on('console', m => {if (m.type() === 'error') errors.push({type: 'console', message: redact(m.text())});});};")
  .replace("const expiredContext = await localContext(); const expiredPage = await expiredContext.newPage();", "const expiredContext = await localContext(); const expiredPage = await expiredContext.newPage(); monitor(expiredPage);")
  .replace("const refs = (...labels) => labels.flatMap(label => artifacts[label] || []);", "const refs = (...labels) => labels.flatMap(label => artifacts[label] || []);\n  json('response-403-409.json', {application: origin, runId, observations: responseObservations, observationCount: responseObservations.length});")
  .replace("environment: {database: databaseName, runtimeRoot, appRuntime: 'next start + NODE_ENV=development', desktopOverflow, mobileOverflow}, browserErrors: errors, blockedExternalRequests});", "environment: {database: databaseName, runtimeRoot, appRuntime: 'next start + NODE_ENV=development', desktopOverflow, mobileOverflow}, browserErrors: errors, blockedExternalRequests, response403409: {ref: relative(path.join(output, 'response-403-409.json')), observations: responseObservations, allClassified: responseObservations.every(observation => observation.expected === true)}});");
writeFileSync(path.join(packet, 'browser-harness.mjs'), harness, 'utf8');
json('browser-harness-adaptation.json', {
  sourceRef: 'internal/evidence/M3/continuation-20261019/r2/browser-harness-executed-attempt2.mjs',
  sourceSha256: hash(original),
  retainedRunnerRef: 'internal/evidence/M3/continuation-20261019/r4b/browser-harness.mjs',
  retainedRunnerSha256: hash(harness),
  currentCandidateBinding: candidate.sourceTreeSha256,
  realUiInteractions: true,
  scriptedResponseFulfillment: false,
  manualVisualApproval: false,
});

const freePort = async (port = 0) => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  const selected = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return selected;
};
assert.equal(await freePort(3199), 3199, 'Do not attach to an unrelated application on 3199.');
const mailPort = await freePort();
const mailOrigin = `http://127.0.0.1:${mailPort}`;
const mailLog = path.join(packet, 'local-mail.log');
writeFileSync(mailLog, '', 'utf8');
const mail = spawn(process.execPath, ['scripts/local-mail-capture.mjs'], {cwd: root, env: {...sourceEnv, MAIL_CAPTURE_PORT: String(mailPort)}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
for (const stream of [mail.stdout, mail.stderr]) stream.on('data', (data) => appendFileSync(mailLog, redact(data), 'utf8'));
let browserResult;
let mailStopped = false;
try {
  const deadline = Date.now() + 10_000;
  let ready = false;
  while (Date.now() < deadline) {
    ready = await fetch(`${mailOrigin}/api/v1/search`, {signal: AbortSignal.timeout(500)}).then((response) => response.ok).catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Private local mail capture did not start.');
  const logPath = path.join(packet, 'browser-driver.log');
  const browser = spawn(process.execPath, ['--experimental-strip-types', path.join(packet, 'browser-harness.mjs')], {
    cwd: root,
    env: {...sourceEnv, SHPITTO_BROWSER_RUNTIME_ROOT: root, SHPITTO_BROWSER_ADMIN_DATABASE_URL: adminUrl.toString(), SHPITTO_BROWSER_MAIL_ORIGIN: mailOrigin, NEXT_TELEMETRY_DISABLED: '1'},
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(logPath, '', 'utf8');
  for (const stream of [browser.stdout, browser.stderr]) stream.on('data', (data) => appendFileSync(logPath, redact(data), 'utf8'));
  const result = await new Promise((resolve, reject) => {browser.once('error', reject); browser.once('exit', (code, signal) => resolve({code, signal}));});
  browserResult = {result, outputRef: path.relative(root, logPath).replaceAll('\\', '/'), outputSha256: hash(readFileSync(logPath))};
  json('browser-driver-result.json', browserResult);
  assert.equal(result.code, 0, 'Current-candidate browser journey failed.');
} finally {
  if (mail.exitCode === null && mail.signalCode === null) {
    const ended = new Promise((resolve) => mail.once('exit', resolve));
    mail.kill();
    await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  mailStopped = mail.exitCode !== null || mail.signalCode !== null;
}
const driverLog = readFileSync(path.join(packet, 'browser-driver.log'), 'utf8');
const evidenceRef = driverLog.match(/Evidence: ([^\r\n]+)/)?.[1] ?? null;
const result = {startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), sourceTreeSha256: candidate.sourceTreeSha256,
  webOrigin: 'http://127.0.0.1:3199', mailOrigin, localMailServiceStopped: mailStopped, browserResult, evidenceRef,
  runtimeRoot: root, paidProviderCalls: false, manualVisualApproval: false, independentReview: 'NOT_RUN', integrationDecision: 'NOT_RUN'};
json('browser-launch-result.json', result);
assert.ok(evidenceRef, 'Browser harness did not report a retained evidence directory.');
assert.ok(mailStopped, 'Local mail service did not stop.');
