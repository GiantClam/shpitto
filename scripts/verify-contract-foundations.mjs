import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from 'pg';

import {assessCoverage, collectOwnedModules, mergeLcov} from './m3-evidence.mjs';

const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'internal/evidence/acceptance/foundations-20261001');
const attempt = path.join(output, `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}`);
mkdirSync(path.join(attempt, 'logs'), {recursive: true});
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const adminUrl = 'postgres://postgres@127.0.0.1:55432/postgres';
const databaseName = `foundations_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const baseEnv = {...globalThis.process['env'], NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString(), APP_URL: 'http://127.0.0.1:3198', BETTER_AUTH_SECRET: `foundation-${randomUUID()}-isolated`, STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local'};
const sanitized = (text) => String(text).replaceAll(baseEnv.BETTER_AUTH_SECRET, '[redacted]').replace(/(?:postgres(?:ql)?|smtp|https?):\/\/[^\s"']+/gi, '[redacted URL]');
const commands = [];
const reports = [];
const pnpm = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
let scratch;
let created = false;
let cleaned = false;
let verifiedResult = null;
const admin = new Client({connectionString: adminUrl, connectionTimeoutMillis: 5000});

function run(id, executable, args, options = {}) {
  const startAt = new Date().toISOString();
  const result = spawnSync(executable, args, {cwd: options.cwd ?? root, env: {...baseEnv, ...options.env}, encoding: 'utf8', windowsHide: true, shell: options.shell ?? false, timeout: 600_000, maxBuffer: 16 * 1024 * 1024});
  const outputRef = relative(path.join(attempt, 'logs', `${id}.log`));
  writeFileSync(path.join(root, outputRef), sanitized(`${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`), 'utf8');
  const entry = {commandId: id, invocation: [executable, ...args].join(' '), startAt, endAt: new Date().toISOString(), exitCode: result.status, status: result.status === 0 ? 'PASS' : 'FAIL', outputRef};
  commands.push(entry);
  json(path.join(attempt, 'commands.json'), commands);
  console.log(`${id}: ${entry.status}`);
  assert.equal(result.status, 0, `${id} failed: ${outputRef}`);
  return result.stdout;
}

function covered(id, file, cwd) {
  const lcov = path.join(attempt, `${id}.lcov`);
  run(id, process.execPath, ['--experimental-strip-types', '--test', '--experimental-test-coverage', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`, '--test-coverage-include=**/src/**', file], {cwd});
  reports.push(readFileSync(lcov, 'utf8'));
}

try {
  const before = JSON.parse(run('candidate-before', process.execPath, ['scripts/candidate-digests.mjs', path.join(attempt, 'candidate-before')]));
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  created = true;
  const version = (await admin.query("select version(), current_setting('server_version') as server_version")).rows[0];
  json(path.join(attempt, 'environment.json'), {databaseName, disposable: true, version, node: process.version, productionRequests: false});
  run('migrate', process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts']);
  for (const name of ['typecheck', 'lint', 'format:check', 'verify:config', 'verify:db-boundary', 'verify:m2-foundation', 'verify:local-services', 'verify:shells', 'verify:content-boundaries', 'verify:openspec']) {
    run(name.replaceAll(':', '-'), pnpm, ['pnpm', name], {shell: true});
  }
  // Each existing probe cleans its own fixtures; the enclosing database is disposable.
  for (const probe of ['m2-foundation', 'onboarding', 'workspaces', 'invitations', 'tenant-authorization', 'operator', 'access-states', 'command-contract', 'credit-ledger', 'credit-reservation', 'credit-refund', 'credit-migration-backfill', 'auth-lifecycle', 'generation-create', 'generation-lifecycle', 'generation-races', 'assets', 'asset-cleanup', 'asset-security', 'outbox-lease', 'm3-recovery']) {
    covered(`regression-${probe}`, `scripts/probe-${probe}.ts`);
  }
  for (const directory of ['tests/unit', 'tests/contracts']) {
    for (const file of readdirSync(path.join(root, directory)).filter((name) => name.endsWith('.test.ts')).sort()) {
      covered(`${path.basename(directory)}-${path.basename(file, '.test.ts')}`, `${directory}/${file}`);
    }
  }
  run('billing-schema', process.execPath, ['--experimental-strip-types', 'scripts/probe-billing-schema.ts'], {env: {DATABASE_URL: adminUrl}});
  covered('billing-reconciliation-service', 'scripts/probe-billing-reconciliation.ts');
  // Run the service probe through the coverage harness so the executable
  // checkout command is included in the owned-module denominator.
  covered('billing-checkout-service', 'scripts/probe-billing-checkout.ts');
  const owned = collectOwnedModules(root).filter((file) => file !== 'src/adapters/providers/port.ts');
  // Catalog contracts are delivered domain behavior and belong in this denominator.
  for (const file of ['src/config/provider-models.ts', 'src/config/plans.ts', 'src/modules/billing/contracts.ts']) if (!owned.includes(file)) owned.push(file);
  const merged = mergeLcov(reports, root);
  const ownedReports = merged.reports.filter((report) => owned.includes(report.path));
  const coverage = assessCoverage({ownedModules: owned, reports: ownedReports, malformed: merged.malformed.filter((file) => owned.includes(file)), suitePassed: true});
  json(path.join(attempt, 'coverage.json'), {...coverage, ownedModules: owned, reports: ownedReports, exclusions: [{path: 'src/adapters/providers/port.ts', reason: 'Type-only interface and DTO definitions; no runtime implementation.'}, {path: 'src/db/schema/**', reason: 'Declarative schemas are exercised by disposable PostgreSQL constraints.'}]});
  assert.equal(coverage.status, 'PASS', 'Owned-domain coverage must pass without missing source.');
  scratch = mkdtempSync(path.join(os.tmpdir(), 'shpitto-foundations-'));
  const candidateRoot = path.join(scratch, 'candidate');
  const excluded = new Set(['.git', '.next', '.data', '.omx', '.codex', '.agents', '.turbo', '.cache', '.playwright-cli', '.gstack', '.opencode', '.tmp', 'node_modules', 'coverage', 'output', 'test-results', 'playwright-report', 'legacy', 'verification-attempts']);
  cpSync(root, candidateRoot, {recursive: true, filter: (source) => {
    const pieces = path.relative(root, source).split(path.sep);
    return !pieces.some((piece) => excluded.has(piece) || piece.startsWith('.tmp-')) && !(pieces[0] === 'internal' && pieces[1] === 'evidence') && !/^\.env(?:\.|$)/.test(path.basename(source));
  }});
  run('frozen-lock-install', pnpm, ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts'], {cwd: candidateRoot, shell: true, env: {NODE_ENV: 'development'}});
  run('production-build', pnpm, ['pnpm', 'build'], {cwd: candidateRoot, shell: true, env: {NODE_ENV: 'production', STORAGE_DRIVER: 's3-compatible', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'smtp', MAIL_SMTP_URL: 'smtp://127.0.0.1:1025'}});
  const after = JSON.parse(run('candidate-after', process.execPath, ['scripts/candidate-digests.mjs', path.join(attempt, 'candidate-after')]));
  for (const key of Object.keys(before).filter((key) => key.endsWith('Sha256'))) assert.equal(after[key], before[key], `Candidate changed during verification: ${key}`);
  verifiedResult = {status: 'PASS', scope: 'M4 tasks 5.1-5.3 and M5 tasks 6.1-6.4 local contracts/services plus affected M3 regressions; not M4/M5 stage approval.', candidate: after, commands: commands.length, coveragePercent: coverage.percent, historicalM3Ref: 'internal/evidence/acceptance/M3/working-tree-20261001-current/record.json'};
} catch (error) {
  json(path.join(attempt, 'failure.json'), {status: 'FAIL', reason: sanitized(error instanceof Error ? error.message : error)});
  console.error(sanitized(error instanceof Error ? error.message : error));
  process.exitCode = 1;
} finally {
  try {
    if (created) {
      await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [databaseName]);
      await admin.query(`drop database "${databaseName}"`);
      cleaned = (await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rows.length === 0;
      assert.ok(cleaned, 'Disposable database remains after cleanup.');
    }
    if (scratch) {
      const resolved = path.resolve(scratch);
      assert.ok(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('shpitto-foundations-'));
      rmSync(resolved, {recursive: true, force: true, maxRetries: 3});
    }
    if (verifiedResult) json(path.join(attempt, 'result.json'), verifiedResult);
  } catch (error) {
    json(path.join(attempt, 'failure.json'), {status: 'FAIL', phase: 'cleanup', reason: sanitized(error instanceof Error ? error.message : error)});
    process.exitCode = 1;
  } finally {
    await admin.end().catch(() => undefined);
    json(path.join(attempt, 'cleanup.json'), {databaseName, databaseCreated: created, databaseDroppedAndAbsent: cleaned, scratchRemoved: !scratch || !existsSync(scratch)});
  }
  console.log(`Evidence: ${relative(attempt)}`);
}
