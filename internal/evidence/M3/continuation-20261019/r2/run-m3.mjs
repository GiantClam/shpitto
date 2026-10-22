import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(packet, 'automated');
assert.equal(existsSync(output), false, 'Select a fresh automated output directory.');
mkdirSync(output);
const freezeRef = 'internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json';
const freeze = JSON.parse(readFileSync(path.join(root, freezeRef), 'utf8'));
assert.equal(freeze.sourceTreeSha256, 'e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be');
const compose = readFileSync(path.join(root, 'deploy/compose.local.yml'), 'utf8');
const declared = Object.fromEntries(['USER', 'PASSWORD'].map((key) => {
  const match = compose.match(new RegExp(`^\\s+POSTGRES_${key}: ([^\\r\\n]+)$`, 'm'));
  assert.ok(match, `Missing local PostgreSQL ${key}.`);
  return [key, match[1].trim()];
}));
const env = {...process.env};
// Empty overrides suppress all ambient .env integration settings in the driver.
for (const name of ['.env', '.env.local']) {
  if (!existsSync(path.join(root, name))) continue;
  for (const line of readFileSync(path.join(root, name), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) env[match[1]] = '';
  }
}
for (const key of Object.keys(env)) {
  if (/^(FAL_|REPLICATE_|STRIPE_|TRIGGER_|FIRSTPROMOTER_|RAILWAY_|STORAGE_S3_|AFFILIATE_|SHPITTO_PROVIDER_WORKER_|BILLING_)/.test(key)) env[key] = '';
}
const databaseUrl = new URL('postgres://127.0.0.1:55432/postgres');
databaseUrl.username = declared.USER;
databaseUrl.password = declared.PASSWORD;
Object.assign(env, {
  DATABASE_URL: databaseUrl.toString(), NODE_ENV: 'test',
  APP_URL: 'http://127.0.0.1:3199', BETTER_AUTH_SECRET: 'local-m3-continuation-isolated-auth-secret',
  STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local',
  MAIL_SMTP_URL: 'smtp://127.0.0.1:1025', MAIL_HTTP_URL: 'http://127.0.0.1:8025',
  WORKER_HEALTH_URL: 'http://127.0.0.1:8080/healthz', TASK_RUNTIME: 'self_hosted',
  SHPTITTO_RUNTIME_PROFILE: '', SHPITTO_M3_OUTPUT: '', SHPITTO_M3_BROWSER_EVIDENCE: '',
  NEXT_TELEMETRY_DISABLED: '1',
});
const staleBrowserRef = 'internal/evidence/M3/continuation-20261019/r2/browser-journeys-final/walkthrough.json';
const launch = {
  startedAt: new Date().toISOString(), freezeRef, expectedSourceTreeSha256: freeze.sourceTreeSha256,
  outputRef: path.relative(root, output).replaceAll('\\', '/'), selectedBrowserRef: staleBrowserRef,
  selectedBrowserPurpose: 'Real current UI capture will be retained separately after the automated attempt; this run supplies no UI proof.',
  localDatabaseEndpoint: '127.0.0.1:55432/postgres', container: 'shpitto-completion-pg-20261019',
  remoteIntegrationSettingsSuppressed: true, paidOrCloudProviderCallsAuthorized: false,
  independentReview: 'NOT_RUN', integrationDecision: 'NOT_RUN',
};
const resultFile = path.join(packet, 'launch-result.json');
const logFile = path.join(packet, 'automated-driver.log');
writeFileSync(resultFile, `${JSON.stringify(launch, null, 2)}\n`, 'utf8');
writeFileSync(logFile, '', 'utf8');
const child = spawn(process.execPath, ['scripts/verify-m3.mjs', '--output', output, '--browser-evidence', staleBrowserRef], {
  cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
  const clean = String(data).replaceAll(databaseUrl.toString(), '[redacted database URL]').replaceAll(declared.PASSWORD, '[redacted]');
  appendFileSync(logFile, clean, 'utf8');
  process.stdout.write(clean);
});
const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code, signal) => resolve({code, signal}));
});
writeFileSync(resultFile, `${JSON.stringify({...launch, endedAt: new Date().toISOString(), ...exitCode}, null, 2)}\n`, 'utf8');
process.exitCode = exitCode.code ?? 1;
