import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {assertArchiveManifest} from './lib/candidate-integrity.mjs';
import {freeLocalPort, runLogged, waitUntil} from './lib/candidate-process.mjs';

const root = process.cwd();
const candidateId = globalThis.process['env'].SHPITTO_CANDIDATE_ID || 'local-candidate-20261007-completion';
assert.match(candidateId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/);
const manifest = JSON.parse(readFileSync(path.join(root, 'internal/evidence/m8/artifact-manifest', candidateId, 'manifest.json'), 'utf8'));
assertArchiveManifest(root, manifest);
const local = JSON.parse(readFileSync(path.join(root, 'internal/evidence/m8/local-demo', candidateId, 'result.json'), 'utf8'));
assert.equal(local.status, 'PASS');
assert.equal(local.archive.sha256, manifest.zip.sha256);
assert(local.retained?.customerRoot, 'Run verify:candidate-local with SHPITTO_CANDIDATE_KEEP=1 first.');
const cwd = local.retained.customerRoot;
const docker = process.platform === 'win32' && existsSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe') ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
const evidenceDir = path.join(root, 'internal/evidence/m8/docker', candidateId);
mkdirSync(evidenceDir, {recursive: true});
const logs = new Map();
const checks = {};
const suffix = randomUUID().slice(0, 8);
const name = `shpitto-candidate-web-${suffix}`;
const image = `shpitto-candidate:${candidateId.toLowerCase()}`;
const envFile = path.join(cwd, '.data', `docker-${suffix}.env`);
const run = (args, label, timeoutMs = 120000) => runLogged(docker, args, {cwd, logs, name: label, timeoutMs});
let result;
let created = false;
try {
  const started = performance.now();
  await run(['build', '--tag', image, '--file', 'Dockerfile', '.'], 'docker-build', 900000);
  checks.frozenCandidateImageBuild = 'PASS';
  const imageId = (await run(['image', 'inspect', image, '--format', '{{.Id}}'], 'image-identity')).trim();
  const port = await freeLocalPort();
  writeFileSync(envFile, [
    'NODE_ENV=production', `APP_URL=http://127.0.0.1:${port}`,
    `DATABASE_URL=postgres://shpitto:shpitto-local-only@host.docker.internal:55432/${local.retained.restoredDatabaseName}`,
    `BETTER_AUTH_SECRET=${randomUUID()}${randomUUID()}`, 'STORAGE_DRIVER=s3-compatible',
    'STORAGE_S3_ENDPOINT=http://host.docker.internal:9000', 'STORAGE_S3_REGION=local',
    'STORAGE_S3_BUCKET=shpitto-candidate', 'STORAGE_S3_ACCESS_KEY_ID=local-candidate',
    'STORAGE_S3_SECRET_ACCESS_KEY=local-candidate-secret', 'STORAGE_S3_FORCE_PATH_STYLE=true',
    'GENERATION_DRIVER=provider',
    'MAIL_DRIVER=smtp', 'MAIL_SMTP_URL=smtp://host.docker.internal:1025',
  ].join('\n') + '\n', 'utf8');
  await run(['run', '--detach', '--name', name, '--publish', `127.0.0.1:${port}:3000`, '--env-file', envFile, image], 'docker-start');
  created = true;
  const origin = `http://127.0.0.1:${port}`;
  await waitUntil(async () => {try {return (await fetch(`${origin}/api/healthz`)).ok;} catch {return false;}}, 'standalone Docker readiness');
  checks.productionCoreReadiness = 'PASS';
  const pages = {};
  for (const route of ['/', '/login', '/docs/v1', '/docs/v1/template/local-journey']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
    pages[route] = await response.text();
  }
  checks.standalonePagesAndDocs = 'PASS';
  for (const route of ['/brand/shpitto-logo-full.png', '/brand/shpitto-icon.png']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(path.join(cwd, 'public', route)));
  }
  const resources = [...new Set([...Object.values(pages).join('\n').matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+\.(?:css|js))"/g)].map((match) => match[1]))];
  assert(resources.some((route) => route.endsWith('.css')) && resources.some((route) => route.endsWith('.js')));
  for (const route of resources) assert.equal((await fetch(new URL(route, origin))).status, 200, route);
  checks.publicBrandAndStaticAssets = 'PASS';
  await run(['restart', name], 'docker-restart');
  await waitUntil(async () => {try {return (await fetch(`${origin}/api/healthz`)).ok;} catch {return false;}}, 'Docker restart readiness');
  checks.containerRestart = 'PASS';
  assertArchiveManifest(root, manifest);
  result = {status: 'PASS', candidateId, archive: manifest.zip, imageId, elapsedMs: Math.round(performance.now() - started), checks, staticResourceCount: resources.length,
    profile: 'local-docker-standalone-production-core', realAccounts: 'NOT_PROVIDED', productionDeployment: 'NOT_RUN',
    note: 'The immutable candidate Dockerfile was built and run locally with a restored disposable database. External adapters are configured by kind but not contacted. Hosting, live provider/payment/mail behavior and production recovery remain separate gates.'};
} catch (error) {
  result = {status: 'FAIL', candidateId, archive: manifest.zip, checks, error: String(error.message), productionDeployment: 'NOT_RUN'};
  process.exitCode = 1;
} finally {
  if (created) {
    await run(['logs', name], 'docker-runtime-log').catch(() => undefined);
    await run(['rm', '--force', name], 'docker-cleanup').catch(() => {result.status = 'FAIL'; process.exitCode = 1;});
  }
  rmSync(envFile, {force: true});
  for (const [label, output] of logs) writeFileSync(path.join(evidenceDir, `${label}.log`), output, 'utf8');
  writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
}
