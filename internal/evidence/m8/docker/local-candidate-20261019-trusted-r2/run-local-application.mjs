import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertArchiveManifest, assertExtractedFiles, validateArchiveEntries} from '../../../../../scripts/lib/candidate-integrity.mjs';
import {freeLocalPort, runLogged, waitUntil} from '../../../../../scripts/lib/candidate-process.mjs';

// Evidence-only adaptation of scripts/verify-candidate-docker.mjs. It needs no
// retained previous runtime directory or restored database and edits no source.
const root = process.cwd();
const candidateId = 'local-candidate-20261019-trusted-r2';
const expectedArchiveSha256 = 'cc9750578638109350e05b60865a76e139e752a9bd97ed2a436f279ffac5ea66';
const expectedSourceSha256 = 'e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be';
const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
assert(!existsSync(path.join(evidenceDir, 'result.json')), 'Preserve an existing Docker result; do not rerun in place.');
const manifestRef = `internal/evidence/m8/artifact-manifest/${candidateId}/manifest.json`;
const manifest = JSON.parse(readFileSync(path.join(root, manifestRef), 'utf8'));
assert.equal(manifest.candidateId, candidateId);
assert.equal(manifest.zip.sha256, expectedArchiveSha256);
const archivePath = assertArchiveManifest(root, manifest);
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-r2-docker-'));
const extracted = path.join(temporaryRoot, 'extracted');
const candidateRoot = path.join(extracted, 'customerRuntime');
const environmentFile = path.join(temporaryRoot, 'runtime.env');
const suffix = randomUUID().slice(0, 8);
const name = `shpitto-candidate-r2-${suffix}`;
const image = `shpitto-candidate:${candidateId}`;
const logs = new Map();
const checks = {};
const secrets = new Set();
const startedAt = new Date().toISOString();
const started = performance.now();
const command = (args, label, cwd = candidateRoot, timeoutMs = 120_000) =>
  runLogged(docker, args, {cwd, logs, name: label, timeoutMs});
const hash = (value) => createHash('sha256').update(value).digest('hex');
const redact = (value) => {
  let output = String(value);
  for (const secret of secrets) if (secret) output = output.replaceAll(secret, '[REDACTED]');
  return output;
};
let result;
let containerCreated = false;
let imageBuilt = false;
let cleanupFailed = false;
try {
  mkdirSync(extracted);
  const listing = await runLogged('tar', ['-tf', archivePath], {cwd: root, logs, name: 'archive-list'});
  validateArchiveEntries(listing.split(/\r?\n/).filter(Boolean), manifest.files);
  await runLogged('tar', ['-xf', archivePath, '-C', extracted], {cwd: root, logs, name: 'archive-extract'});
  assertExtractedFiles(extracted, manifest.files);
  checks.authorizedArchiveAndEveryExtractedFile = 'PASS';
  const compose = readFileSync(path.join(candidateRoot, 'deploy/compose.local.yml'), 'utf8');
  const local = Object.fromEntries(['USER', 'PASSWORD'].map((key) => {
    const match = compose.match(new RegExp(`^\\s+POSTGRES_${key}: ([^\\r\\n]+)$`, 'm'));
    assert(match, 'Declared local PostgreSQL setting missing from exact archive.');
    return [key, match[1].trim()];
  }));
  secrets.add(local.PASSWORD);
  const existing = (await command(['image', 'ls', '--quiet', image], 'new-tag-preflight')).trim();
  assert.equal(existing, '', 'The scoped r2 image tag already exists; preserve its identity.');
  await command(['build', '--pull=false', '--progress=plain', '--tag', image, '--file', 'Dockerfile', '.'], 'docker-build', candidateRoot, 900_000);
  imageBuilt = true;
  checks.exactExtractedCandidateImageBuild = 'PASS';
  const imageId = (await command(['image', 'inspect', image, '--format', '{{.Id}}'], 'image-identity')).trim();
  const imageMetadata = JSON.parse((await command(['image', 'inspect', image, '--format', '{{json .Config.Labels}}'], 'image-labels')).trim());
  const port = await freeLocalPort();
  const origin = `http://127.0.0.1:${port}`;
  const databaseUrl = `postgres://${encodeURIComponent(local.USER)}:${encodeURIComponent(local.PASSWORD)}@host.docker.internal:55432/postgres`;
  const authSecret = randomUUID() + randomUUID();
  const storageSecret = randomUUID();
  for (const secret of [databaseUrl, authSecret, storageSecret]) secrets.add(secret);
  writeFileSync(environmentFile, [
    'NODE_ENV=production', `APP_URL=${origin}`, `DATABASE_URL=${databaseUrl}`,
    `BETTER_AUTH_SECRET=${authSecret}`, 'STORAGE_DRIVER=s3-compatible',
    'STORAGE_S3_ENDPOINT=http://127.0.0.1:1', 'STORAGE_S3_REGION=local',
    'STORAGE_S3_BUCKET=local-docker-evidence', `STORAGE_S3_ACCESS_KEY_ID=${randomUUID()}`,
    `STORAGE_S3_SECRET_ACCESS_KEY=${storageSecret}`, 'STORAGE_S3_FORCE_PATH_STYLE=true',
    'GENERATION_DRIVER=provider', 'MAIL_DRIVER=smtp', 'MAIL_SMTP_URL=smtp://127.0.0.1:1',
    'TASK_RUNTIME=self_hosted',
  ].join('\n') + '\n', {encoding: 'utf8', flag: 'wx'});
  await command(['run', '--detach', '--name', name, '--label', `shpitto.evidence=${candidateId}`,
    '--publish', `127.0.0.1:${port}:3000`, '--env-file', environmentFile, image], 'docker-start');
  containerCreated = true;
  const request = (route) => fetch(new URL(route, origin), {signal: AbortSignal.timeout(8000), redirect: 'manual'});
  const ready = async (label) => {
    let body;
    await waitUntil(async () => {
      try {
        const response = await request('/api/healthz');
        if (!response.ok) return false;
        body = await response.json();
        return body.status === 'ready' && body.database === 'ready';
      } catch {return false;}
    }, label);
    return body;
  };
  const initialReadiness = await ready('local Docker application readiness');
  checks.localApplicationAndDatabaseReadiness = 'PASS';
  const pages = {};
  const routeResults = [];
  for (const route of ['/', '/login', '/docs/v1', '/docs/v1/template/local-journey']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    const body = await response.text();
    assert.match(body.toLowerCase(), /<!doctype html>/);
    pages[route] = body;
    routeResults.push({route, status: response.status, bytes: Buffer.byteLength(body), sha256: hash(body)});
  }
  checks.standalonePagesAndDocs = 'PASS';
  const assetResults = [];
  for (const route of ['/brand/shpitto-logo-full.png', '/brand/shpitto-icon.png']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, readFileSync(path.join(candidateRoot, 'public', route)));
    assetResults.push({route, status: 200, bytes: bytes.length, sha256: hash(bytes)});
  }
  checks.brandAssetBytesMatchExactArchive = 'PASS';
  const resources = [...new Set([...Object.values(pages).join('\n').matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+\.(?:css|js))"/g)].map((match) => match[1]))];
  assert(resources.some((route) => route.endsWith('.css')) && resources.some((route) => route.endsWith('.js')));
  const staticResults = [];
  for (const route of resources) {
    const target = new URL(route, origin);
    assert.equal(target.origin, origin, 'Probe static resources only from the scoped local container.');
    const response = await request(route);
    assert.equal(response.status, 200, route);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 0);
    staticResults.push({route, status: 200, bytes: bytes.length, sha256: hash(bytes)});
  }
  checks.renderedJavaScriptAndStylesheets = 'PASS';
  await command(['restart', name], 'docker-restart');
  const restartReadiness = await ready('local Docker application restart readiness');
  for (const route of ['/', '/docs/v1', '/docs/v1/template/local-journey']) assert.equal((await request(route)).status, 200, route);
  checks.containerRestartAndDocsReadiness = 'PASS';
  const containerIdentity = JSON.parse((await command(['inspect', name, '--format', '{{json .State}}'], 'container-state')).trim());
  assert.equal(containerIdentity.Running, true);
  assertArchiveManifest(root, manifest);
  assertExtractedFiles(extracted, manifest.files);
  checks.archiveAndBuildContextUnchanged = 'PASS';
  writeFileSync(path.join(evidenceDir, 'http-observations.json'), JSON.stringify({origin, initialReadiness, restartReadiness, pages: routeResults, brandAssets: assetResults, staticResources: staticResults}, null, 2) + '\n', 'utf8');
  result = {status: 'PASS', candidateId, archive: manifest.zip, expectedSourceTreeSha256: expectedSourceSha256,
    profile: 'local-docker-application-only', image, imageId, imageLabels: imageMetadata,
    startedAt, elapsedMs: Math.round(performance.now() - started), checks,
    staticResourceCount: resources.length, container: {name, host: '127.0.0.1', port, noHostMounts: true, noWorkerStarted: true},
    readinessDatabase: {scope: 'declared disposable PostgreSQL administrative database; SELECT 1 only', container: 'shpitto-completion-pg-20261019', port: 55432, database: 'postgres', databasesCreated: 0},
    productionDeployment: 'NOT_RUN', productionAcceptance: 'NOT_CLAIMED', realAccounts: 'NOT_PROVIDED',
    remoteProvidersAccessed: false,
    note: 'Exact ZIP Dockerfile built from a separately extracted verified archive. NODE_ENV=production is the image application mode only. Local HTTP GET readiness, public pages, Docs, static bytes and restart were checked; no host application, worker, payment, provider, mail or storage call was exercised.'};
} catch (error) {
  process.exitCode = 1;
  result = {status: 'FAIL', candidateId, archive: manifest.zip, image, profile: 'local-docker-application-only', checks,
    startedAt, error: redact(error instanceof Error ? error.message : error), productionDeployment: 'NOT_RUN', productionAcceptance: 'NOT_CLAIMED'};
} finally {
  // Remove only this invocation's unique container, never a shared service.
  if (containerCreated) {
    await command(['logs', name], 'docker-runtime-log').catch(() => undefined);
    await command(['rm', '--force', name], 'docker-cleanup').catch(() => {cleanupFailed = true;});
  }
  const remaining = await command(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], 'container-cleanup-verification', root).catch(() => {cleanupFailed = true; return 'unverified';});
  if (remaining.trim()) cleanupFailed = true;
  rmSync(environmentFile, {force: true});
  try {rmSync(temporaryRoot, {recursive: true, force: true, maxRetries: 3, retryDelay: 1000});}
  catch {cleanupFailed = true;}
  result.cleanup = {containerRemoved: !remaining.trim(), temporaryEnvironmentFileRemoved: !existsSync(environmentFile),
    extractionRemoved: !existsSync(temporaryRoot), imageRetainedAsEvidence: imageBuilt, databaseMutationsPerformed: false,
    sharedPostgresContainerPreserved: true, volumesCreatedOrDeleted: false};
  if (cleanupFailed) {result.status = 'FAIL'; result.cleanupError = true; process.exitCode = 1;}
  result.completedAt = new Date().toISOString();
  for (const [label, output] of logs) writeFileSync(path.join(evidenceDir, `${label}.log`), redact(output), 'utf8');
  writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result, null, 2));
}
