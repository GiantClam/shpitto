import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const {collectOwnedModules, mergeLcov, assessCoverage} = await import(pathToFileURL(path.join(root, 'scripts/m3-evidence.mjs')).href);
const attemptId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const output = path.join(root, '.tmp/m4-local-verification-20261015', attemptId);
mkdirSync(output, {recursive: true});
const assetsRoot = path.join(output, 'assets');
mkdirSync(assetsRoot);
const container = `shpitto-m4-verification-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const databaseUrl = `postgres://postgres:${password}@127.0.0.1:55432/postgres`;
const ownedDatabaseName = `shpitto_m4_owned_${randomUUID().replaceAll('-', '')}`;
const ownedDatabaseUrl = new URL(databaseUrl);
ownedDatabaseUrl.pathname = `/${ownedDatabaseName}`;
// No local secret files are loaded. Only disposable local services and fake transport are used.
const platformEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|PATHEXT|COMSPEC|SYSTEMROOT|WINDIR|SYSTEMDRIVE|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(name)));
const env = {...platformEnv, POSTGRES_PASSWORD: password, DATABASE_URL: ownedDatabaseUrl.toString(),
  SHPITTO_FIXTURE_ENV_ONLY: '1', NODE_OPTIONS: `--import=${new URL('./m4-fixture-env-only-20261015.mjs', import.meta.url).href}`,
  PROVIDER_WORKER_TEST_ADMIN_DATABASE_URL: databaseUrl, NODE_ENV: 'test',
  SHPTITTO_RUNTIME_PROFILE: 'local', STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local',
  APP_URL: 'http://localhost:3199', BETTER_AUTH_SECRET: randomUUID() + randomUUID(), ASSET_ROOT: assetsRoot,
  STORAGE_S3_ENDPOINT: 'https://storage.example.test', STORAGE_S3_REGION: 'auto',
  STORAGE_S3_BUCKET: 'local-fixture', STORAGE_S3_ACCESS_KEY_ID: 'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY: 'fixture-secret',
  REPLICATE_API_TOKEN: '', FAL_KEY: '', TRIGGER_SECRET_KEY: '',
};
const scope = ['src/config/env.ts', 'src/config/task-runtime.ts', 'src/modules/generation', 'src/modules/assets', 'src/adapters/providers', 'src/adapters/storage', 'src/adapters/tasks', 'src/trigger',
  'src/config/provider-models.ts', 'src/config/provider-worker.ts', 'src/config/models.ts',
  'src/modules/operations/integration-health.ts', 'src/modules/operations/telemetry.ts'];
const ownedModules = collectOwnedModules(root, scope).filter((file) => file !== 'src/adapters/providers/port.ts');
const results = [];
const lcov = [];
const normalize = (value) => String(value ?? '').replaceAll(password, '[redacted]').replaceAll(env.BETTER_AUTH_SECRET, '[redacted]').replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n';
const save = (file, value) => writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n', 'utf8');
function run(id, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {cwd: root, env, encoding: 'utf8', windowsHide: true,
    maxBuffer: 12 * 1024 * 1024, timeout: 180_000, ...options});
  writeFileSync(path.join(output, `${id}.log`), normalize(`${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? '\n' + result.error.message : ''}`), 'utf8');
  results.push({id, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status, startedAt, endedAt: new Date().toISOString(), args});
  console.log(`${id}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
  return result;
}
function test(id, files) {
  const target = path.join(output, `${id}.lcov`);
  const args = ['--experimental-strip-types', '--experimental-test-coverage', '--test-concurrency=1',
    ...scope.flatMap((entry) => ['--test-coverage-include', entry.endsWith('.ts') ? entry : `${entry}/**`]),
    '--test-reporter=spec', `--test-reporter-destination=${path.join(output, `${id}-spec.log`)}`,
    '--test-reporter=lcov', `--test-reporter-destination=${target}`, '--test', ...files];
  const result = run(id, process.execPath, args);
  try { lcov.push(readFileSync(target, 'utf8')); } catch { /* Missing output is recorded by strict coverage assessment. */ }
  return result;
}
let started = false;
try {
  const creation = run('container-start', 'docker', ['run', '--rm', '-d', '--name', container,
    '--env', 'POSTGRES_PASSWORD', '-p', '127.0.0.1:55432:5432', 'postgres:15-alpine']);
  if (creation.status !== 0) throw new Error('Isolated container did not start.');
  started = true;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {encoding: 'utf8', windowsHide: true, env});
    if (probe.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated PostgreSQL readiness failed.');
  if (run('owned-database-create', 'docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `create database "${ownedDatabaseName}"`]).status !== 0) throw new Error('Owned fixture database was not created.');
  if (run('migration', process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts']).status !== 0) throw new Error('Isolated migration failed.');
  const manifest = JSON.parse(readFileSync('internal/evidence/M4/task-5.10/railway-worker/related-test-manifest-20261015.json', 'utf8'));
  test('contracts-and-units', [...manifest.testFiles, 'tests/contracts/replicate-webhook-boundaries.test.ts', 'tests/unit/recovery-schedule.test.ts', 'tests/unit/task-runtime-env.test.ts', 'tests/unit/recovery-drain.test.ts', 'tests/unit/optional-trigger-boundary.test.ts', 'tests/unit/worker-loops.test.ts']);
  test('provider-worker-integration', ['tests/integration/provider-worker.test.ts']);
  for (const name of ['generation-create', 'generation-lifecycle', 'generation-races', 'assets', 'asset-cleanup', 'asset-security', 'outbox-lease', 'm3-recovery', 'credit-ledger', 'credit-reservation', 'credit-refund', 'generation-replay', 'provider-recovery']) {
    test(`probe-${name}`, [`scripts/probe-${name}.ts`]);
  }
  // This probe owns an additional random database and validates process-crash boundaries.
  test('probe-m3-crash-restart', ['scripts/probe-m3-crash-restart.ts']);
} catch (error) {
  results.push({id: 'runner', status: 'FAIL', error: normalize(error.message)});
  console.log('runner: FAIL (see sanitized record)');
} finally {
  if (started) run('container-cleanup', 'docker', ['stop', container]);
  if (path.relative(output, path.resolve(assetsRoot)) !== 'assets') throw new Error('Fixture asset cleanup escaped the owned attempt directory.');
  rmSync(assetsRoot, {recursive: true, force: true});
  const merged = mergeLcov(lcov, root);
  const suitePassed = results.every((entry) => entry.status === 'PASS');
  const coverage = assessCoverage({ownedModules, reports: merged.reports.filter((entry) => ownedModules.includes(entry.path)), malformed: merged.malformed, suitePassed});
  save('coverage.json', {...coverage, ownedModules, reports: merged.reports, sourceRoots: scope,
    exclusions: [{path: 'src/adapters/providers/port.ts', reason: 'Type-only declarations; no executable behavior.'},
      {path: 'src/app/**', reason: 'HTTP/UI layers require separate request and browser evidence; not core-domain coverage.'},
      {path: 'src/db/schema/**', reason: 'Declarative schema is validated through isolated PostgreSQL assertions.'},
      {path: 'scripts/probe-*.ts, tests/**, node_modules/**', reason: 'Probe/test drivers and third-party implementation are not delivered M4 domain behavior.'},
      {path: 'scripts/provider-worker.ts, scripts/provider-worker-runtime.mjs, scripts/provider-worker-preflight.ts', reason: 'Current loop lifecycle, bind gating, readiness projection and receipt compatibility are measured through shared src helpers. Historical deployed HTTP/startup receipts do not validate this changed script; current process HTTP, live shutdown/redeploy and durable external monitoring remain unverified.'}],
    minimumBranchPercent: 80, subprocessCoverage: 'Crash child assertions execute, but child LCOV is not collected or claimed.', completeM4Acceptance: false});
  save('result.json', {verifiedAt: new Date().toISOString(), status: suitePassed && coverage.status === 'PASS' ? 'PASS_LOCAL_VERIFICATION' : 'FAIL',
    profile: 'disposable local PostgreSQL / Mock and fake provider transport only', results,
    paidProviderCalls: 0, existingObjectsAccessed: false, containerRemoved: started && results.at(-1)?.status === 'PASS',
    environmentPolicy: 'Allowlisted OS paths and fixture configuration only; process.loadEnvFile disabled for all descendants by inherited preload.', localAssetsRemoved: true,
    coverageStatus: coverage.status, completeM4Acceptance: false});
  console.log(`Tests: ${suitePassed ? 'PASS' : 'FAIL'}; owned branch coverage: ${coverage.percent.toFixed(2)}%; missing modules: ${coverage.missingSources.length}; coverage: ${coverage.status}; attempt: ${attemptId}`);
  process.exitCode = suitePassed && coverage.status === 'PASS' ? 0 : 1;
}
