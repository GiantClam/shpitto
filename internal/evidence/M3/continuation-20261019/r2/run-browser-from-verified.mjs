import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => writeFileSync(path.join(packet, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
assert.equal(existsSync(path.join(packet, 'browser-launch-result.json')), false, 'Preserve each browser launch result.');
const prep = read(path.join(packet, 'runtime-preparation.json'));
const runtimeRoot = read(path.join(packet, 'browser-runtime-provenance.json')).runtimeRoot;
const freeze = read(path.join(packet, 'candidate-before/candidate.json'));
const env = {...process.env};
for (const name of ['.env', '.env.local']) {
  if (!existsSync(path.join(root, name))) continue;
  for (const line of readFileSync(path.join(root, name), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) env[match[1]] = '';
  }
}
for (const name of Object.keys(env)) {
  if (/^(FAL_|REPLICATE_|STRIPE_|TRIGGER_|FIRSTPROMOTER_|RAILWAY_|STORAGE_S3_|AFFILIATE_|SHPITTO_PROVIDER_WORKER_|BILLING_)/.test(name)) env[name] = '';
}
const compose = readFileSync(path.join(root, 'deploy/compose.local.yml'), 'utf8');
const declared = Object.fromEntries(['USER', 'PASSWORD'].map((name) => {
  const match = compose.match(new RegExp(`^\\s+POSTGRES_${name}: ([^\\r\\n]+)$`, 'm'));
  assert.ok(match);
  return [name, match[1].trim()];
}));
const adminUrl = new URL('postgres://127.0.0.1:55432/postgres');
adminUrl.username = declared.USER;
adminUrl.password = declared.PASSWORD;
const redact = (value) => String(value).replaceAll(adminUrl.toString(), '[redacted database URL]').replaceAll(declared.PASSWORD, '[redacted]');
async function run(name, args, options = {}) {
  const logPath = path.join(packet, `${name}.log`);
  assert.equal(existsSync(logPath), false, 'Preserve logs from every invocation.');
  writeFileSync(logPath, '', 'utf8');
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, args, {cwd: options.cwd ?? root, env: options.env ?? env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
    const clean = redact(data);
    appendFileSync(logPath, clean, 'utf8');
    output += clean;
    process.stdout.write(clean);
  });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({exitCode: code, signal}));
  });
  const retained = {name, startedAt, completedAt: new Date().toISOString(), ...result,
    outputRef: path.relative(root, logPath).replaceAll('\\', '/'), outputSha256: sha(readFileSync(logPath))};
  write(`${name}-result.json`, retained);
  return {...retained, output};
}
const startedAt = new Date().toISOString();
const provenance = read(path.join(packet, 'browser-runtime-provenance.json'));
assert.equal(provenance.sourceTreeSha256, freeze.sourceTreeSha256);
const originalPath = path.join(packet, 'browser-harness.mjs');
const original = readFileSync(originalPath, 'utf8');
let harness = original
  .replaceAll("'internal/evidence/M3/continuation-20261019'", "'internal/evidence/M3/continuation-20261019/r2'")
  .replaceAll('internal/evidence/M3/continuation-20261019/browser-runtime-provenance.json', 'internal/evidence/M3/continuation-20261019/r2/browser-runtime-provenance.json')
  .replaceAll('95ad817920e31e3db850155b6d321ab90c79cfeaa90d4d0d5263c9aa297a08e7', freeze.sourceTreeSha256)
  .replaceAll('internal/evidence/M3/continuation-20261019/browser-harness.mjs', 'internal/evidence/M3/continuation-20261019/r2/browser-harness.mjs')
  .replace("const origin = `http://127.0.0.1:${port}`;", "const origin = `http://127.0.0.1:${port}`;\nconst mailOrigin = process.env.SHPITTO_BROWSER_MAIL_ORIGIN;")
  .replaceAll("'http://127.0.0.1:8025'", 'mailOrigin')
  .replaceAll('`http://127.0.0.1:8025/', '`${mailOrigin}/')
  .replaceAll('await browser.newContext(', 'await localContext(')
  .replace("profile: 'Local no-cloud Mock;", "reviewKind: 'automated-browser-functional-observation', manualVisualApproval: false, profile: 'Local no-cloud Mock;")
  .replace('assert.equal(capture.status, 0);', 'assert.equal(capture.status, 0); assert.equal(JSON.parse(capture.stdout).sourceTreeSha256, provenance.sourceTreeSha256);')
  .replace('const monitor = page =>', `const blockedExternalRequests = [];
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
const monitor = page =>`)
  .replace('browserErrors: errors});', 'browserErrors: errors, blockedExternalRequests});');
assert.ok(harness.includes('const localContext = async'));
writeFileSync(path.join(packet, 'browser-harness-executed.mjs'), harness, 'utf8');
write('browser-harness-execution-adaptation.json', {sourceRef: 'internal/evidence/M3/continuation-20261019/r2/browser-harness.mjs',
  sourceSha256: sha(original), retainedRunnerSha256: sha(harness), uiAssertionsPreserved: true,
  changes: ['r2 source/build/provenance binding', 'Own dynamic local mail service', 'External browser requests blocked'],
  realUiInteractions: true, scriptedResponseFulfillment: false, inventedManualProof: false});
const freePort = async (port = 0) => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  const selected = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return selected;
};
const automatedDeadline = Date.now() + 900_000;
let automatedEnded = false;
while (Date.now() < automatedDeadline) {
  const launchPath = path.join(packet, 'launch-result.json');
  if (existsSync(launchPath)) {
    try {automatedEnded = Boolean(read(launchPath).endedAt);} catch {}
  }
  if (automatedEnded) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(automatedEnded, 'The owned M3 automated runner must release port 3199 first.');
assert.equal(await freePort(3199), 3199, 'Do not attach to any unrelated application on 3199.');
const mailPort = await freePort();
const mailOrigin = `http://127.0.0.1:${mailPort}`;
const mailLog = path.join(packet, 'local-mail.log');
writeFileSync(mailLog, '', 'utf8');
const mail = spawn(process.execPath, [path.join(runtimeRoot, 'scripts/local-mail-capture.mjs')],
  {cwd: runtimeRoot, env: {...env, MAIL_CAPTURE_PORT: String(mailPort)}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
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
  browserResult = await run('browser-driver', ['--experimental-strip-types', path.join(packet, 'browser-harness-executed.mjs')],
    {env: {...env, SHPITTO_BROWSER_RUNTIME_ROOT: runtimeRoot, SHPITTO_BROWSER_ADMIN_DATABASE_URL: adminUrl.toString(),
      SHPITTO_BROWSER_MAIL_ORIGIN: mailOrigin, NEXT_TELEMETRY_DISABLED: '1'}});
} finally {
  if (mail.exitCode === null && mail.signalCode === null) {
    const ended = new Promise((resolve) => mail.once('exit', resolve));
    mail.kill();
    await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  mailStopped = mail.exitCode !== null || mail.signalCode !== null;
}
const evidenceRef = browserResult?.output.match(/Evidence: ([^\r\n]+)/)?.[1] ?? null;
const result = {startedAt, completedAt: new Date().toISOString(), sourceTreeSha256: freeze.sourceTreeSha256,
  webOrigin: 'http://127.0.0.1:3199', mailOrigin, localMailServiceStopped: mailStopped,
  browserResult: browserResult ? {...browserResult, output: undefined} : null, evidenceRef,
  temporaryRuntimeRetained: runtimeRoot, paidProviderCalls: false,
  independentReview: 'NOT_RUN', integrationDecision: 'NOT_RUN'};
write('browser-launch-result.json', result);
console.log(JSON.stringify(result, null, 2));
process.exitCode = browserResult?.exitCode === 0 && mailStopped ? 0 : 1;
