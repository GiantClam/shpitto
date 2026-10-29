import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Client} from 'pg';

import {assertArchiveManifest, assertExtractedFiles, validateArchiveEntries} from './lib/candidate-integrity.mjs';
import {runLogged} from './lib/candidate-process.mjs';
import {runCandidateJourney} from './lib/candidate-journey.mjs';
import {validateCustomerCommands} from './customer-package.ts';

const root = process.cwd();
const candidateId = process.env.SHPITTO_CANDIDATE_ID?.trim() || 'local-candidate-20261007-completion';
assert.match(candidateId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/, 'Invalid candidate ID.');
const evidenceDir = path.join(root, 'internal', 'evidence', 'm8', 'local-demo', candidateId);
const manifestPath = path.join(root, 'internal', 'evidence', 'm8', 'artifact-manifest', candidateId, 'manifest.json');
const keep = process.env.SHPITTO_CANDIDATE_KEEP === '1';
const adminUrl = new URL(process.env.SHPITTO_CANDIDATE_ADMIN_DATABASE_URL || 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres');
assert.equal(adminUrl.hostname, '127.0.0.1', 'Candidate verification requires disposable local PostgreSQL.');
assert.equal(adminUrl.port, '55432', 'Candidate verification requires the disposable PostgreSQL port 55432.');
assert.equal(adminUrl.pathname, '/postgres', 'Use the disposable PostgreSQL administrative database.');
const databaseName = `shpitto_candidate_${randomUUID().replaceAll('-', '')}`;
const restoredDatabaseName = `${databaseName.slice(0, 52)}_restored`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const logs = new Map();
const secrets = new Set([adminUrl.toString(), databaseUrl.toString(), decodeURIComponent(adminUrl.password)]);
const checks = {};
const startedAt = new Date().toISOString();
let temporaryRoot;
let databaseCreated = false;
let archive;
let restored;

function redact(value) {
  let result = String(value);
  for (const secret of secrets) if (secret) result = result.replaceAll(secret, '[REDACTED]');
  return result;
}

function save(result) {
  mkdirSync(evidenceDir, {recursive: true});
  const logPaths = {};
  for (const [name, output] of logs) {
    const file = path.join(evidenceDir, `${name}.log`);
    writeFileSync(file, redact(output), 'utf8');
    logPaths[name] = path.relative(root, file).replaceAll('\\', '/');
  }
  const record = {...result, logs: logPaths, completedAt: new Date().toISOString()};
  writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(record, null, 2));
}

async function main() {
  const admin = new Client({connectionString: adminUrl.toString(), connectionTimeoutMillis: 10_000});
  let result;
  try {
    assert(existsSync(manifestPath), 'Candidate manifest is missing.');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.candidateId, candidateId, 'Candidate manifest ID mismatch.');
    archive = manifest.zip;
    const zipPath = assertArchiveManifest(root, manifest);
    checks.archiveDigest = 'PASS';
    temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m8-'));
    const list = await runLogged('tar', ['-tf', zipPath], {cwd: root, logs, name: 'archive-list'});
    validateArchiveEntries(list.split(/\r?\n/).filter(Boolean), manifest.files);
    await runLogged('tar', ['-xf', zipPath, '-C', temporaryRoot], {cwd: root, logs, name: 'extract'});
    assertExtractedFiles(temporaryRoot, manifest.files);
    checks.archiveExtractionAndFileDigests = 'PASS';
    const candidateRoot = path.join(temporaryRoot, 'customerRuntime');
    for (const required of ['package.json', 'pnpm-lock.yaml', 'Dockerfile', 'src', 'public', 'scripts/migrate.ts', 'scripts/demo-seed.ts', 'scripts/local-worker.ts', 'scripts/local-worker-runtime.mjs', 'tests/fixtures/video/local-demo.mp4']) {
      assert(existsSync(path.join(candidateRoot, required)), `Candidate is missing required runtime path: ${required}`);
    }
    checks.requiredRuntimePaths = 'PASS';
    assert.deepEqual(validateCustomerCommands(JSON.parse(readFileSync(path.join(candidateRoot, 'package.json'), 'utf8')), (file) => existsSync(path.join(candidateRoot, file))), [], 'Exported customer commands have missing dependencies.');
    checks.customerCommandClosure = 'PASS';
    // Resolve Corepack's JavaScript entry point so spaces in paths never require a command shell.
    const require = createRequire(import.meta.url);
    const corepackPackage = require.resolve('corepack/package.json', {paths: [path.dirname(process.execPath)]});
    const corepack = path.join(path.dirname(corepackPackage), 'dist', 'corepack.js');
    await runLogged(process.execPath, [corepack, 'pnpm', 'install', '--frozen-lockfile', '--offline', '--ignore-scripts'], {cwd: candidateRoot, env: {...process.env, NODE_ENV: 'development'}, logs, name: 'install', timeoutMs: 300_000});
    checks.frozenOfflineInstall = 'PASS';
    const buildEnv = {...process.env, NODE_ENV: 'production', APP_URL: 'https://candidate.invalid', DATABASE_URL: 'postgres://candidate:candidate@127.0.0.1:1/candidate', BETTER_AUTH_SECRET: 'candidate-only-build-secret', STORAGE_DRIVER: 's3-compatible', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'smtp', MAIL_SMTP_URL: 'smtp://127.0.0.1:1025'};
    await runLogged(process.execPath, [corepack, 'pnpm', 'build'], {cwd: candidateRoot, env: buildEnv, logs, name: 'build', timeoutMs: 600_000});
    checks.productionBuild = 'PASS';
    for (const command of ['typecheck', 'lint', 'format:check', 'verify:config', 'verify:db-boundary', 'verify:local-services', 'verify:shells', 'verify:content-boundaries']) {
      await runLogged(process.execPath, [corepack, 'pnpm', command], {cwd: candidateRoot, env: buildEnv, logs, name: `buyer-${command.replaceAll(':', '-')}`, timeoutMs: 120_000});
    }
    checks.exportedBuyerChecks = 'PASS';
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    databaseCreated = true;
    const runtimeEnv = {...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl.toString(), BETTER_AUTH_SECRET: randomUUID() + randomUUID(), STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local', ASSET_ROOT: path.join(candidateRoot, '.data', 'assets')};
    secrets.add(runtimeEnv.BETTER_AUTH_SECRET);
    const journey = await runCandidateJourney({candidateRoot, runtimeEnv, logs, secrets, checks, evidenceDir, archiveSha256: archive.sha256,
      // The local compose file declares the stable project name `shpitto-local`;
      // keep an override for dedicated historical restore containers.
      container: process.env.SHPITTO_CANDIDATE_POSTGRES_CONTAINER || 'shpitto-local-postgres-1', onRestore: (value) => {restored = value;}});
    // Evidence always belongs to the same immutable archive that entered the run.
    assertArchiveManifest(root, manifest);
    const fixtureHash = createHash('sha256').update(readFileSync(path.join(candidateRoot, 'tests/fixtures/video/local-demo.mp4'))).digest('hex');
    assert.equal(fixtureHash, manifest.files.find((file) => file.archivePath === 'customerRuntime/tests/fixtures/video/local-demo.mp4')?.sha256, 'Executed Mock fixture differs from the frozen archive.');
    result = {status: 'PASS', profile: 'fresh-candidate-local-runtime', candidateId, startedAt, archive, checks, journey, fixtureSha256: fixtureHash,
      retained: keep ? {customerRoot: candidateRoot, databaseName, restoredDatabaseName, restoredAssetRoot: restored?.assetRoot, databaseHost: adminUrl.hostname, databasePort: Number(adminUrl.port), servicesRunning: false} : null,
      productionDeployment: 'NOT_RUN', realAccounts: 'NOT_PROVIDED',
      note: 'The frozen archive was independently installed, built and exercised with its own local database, web and worker. Deadline failure is induced by expiring one fixture task; real provider failures and production gates remain deferred.'};
  } catch (error) {
    result = {status: 'FAIL', profile: 'fresh-candidate-local-runtime', candidateId, startedAt, archive, checks, error: redact(error instanceof Error ? error.message : error), productionDeployment: 'NOT_RUN', realAccounts: 'NOT_PROVIDED'};
    process.exitCode = 1;
  } finally {
    if (databaseCreated && !keep) {
      for (const name of [restoredDatabaseName, databaseName]) {
        await admin.query(`drop database if exists "${name}" with (force)`).catch((error) => {
          result = {...result, status: 'FAIL', cleanupError: redact(error.message)};
          process.exitCode = 1;
        });
      }
    }
    await admin.end().catch(() => undefined);
    if (temporaryRoot && !keep) {
      try {rmSync(temporaryRoot, {recursive: true, force: true, maxRetries: 3, retryDelay: 1000});}
      catch (error) {result = {...result, status: 'FAIL', cleanupError: redact(error.message)}; process.exitCode = 1;}
    }
    save(result);
  }
}

await main();
