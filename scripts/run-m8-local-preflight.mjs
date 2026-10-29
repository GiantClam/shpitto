import {mkdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const evidenceRoot = path.join(root, 'internal', 'evidence', 'm8');

const checks = [
  {task: '9.1', id: 'export-boundaries', cwd: '.', command: process.execPath, args: ['--experimental-strip-types', 'scripts/check-release-boundaries.ts'], output: 'export-scan'},
  {task: '9.2', id: 'release-boundaries-tests', cwd: '.', command: process.execPath, args: ['--experimental-strip-types', '--test', 'tests/release/export-boundaries.test.ts'], output: 'export-scan'},
  {task: '9.5', id: 'deployment-preflight', cwd: '.', command: process.execPath, args: ['scripts/check-deployment-preflight.mjs'], output: 'managed-preflight'},
  {task: '9.6', id: 'docker-context', cwd: '.', command: process.execPath, args: ['--experimental-strip-types', 'scripts/check-release-boundaries.ts'], output: 'docker-preflight'},
  {task: '9.7', id: 'format-and-typecheck', cwd: '.', command: process.execPath, args: ['node_modules/typescript/bin/tsc', '--noEmit'], output: 'config-migration'},
  {task: '9.8', id: 'backup-restore-scripts', cwd: '.', command: process.execPath, args: ['scripts/check-deployment-preflight.mjs'], output: 'restore-preflight'},
  {task: '9.9', id: 'health-and-operations', cwd: '.', command: process.execPath, args: ['scripts/check-deployment-preflight.mjs'], output: 'operations-preflight'},
  {task: '9.4', id: 'candidate-runtime-evidence', cwd: '.', command: process.execPath, args: ['scripts/check-candidate-evidence.mjs'], output: 'local-demo'},
  {task: '9.10', id: 'vendor-commerce-evidence', cwd: '.', command: process.execPath, args: ['internal/vendor/verify-local.mjs'], output: 'commerce-separation'},
];

const results = [];
for (const check of checks) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(check.command, check.args, {
    cwd: path.join(root, check.cwd),
    encoding: 'utf8',
    windowsHide: true,
    env: {...process.env},
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const directory = path.join(evidenceRoot, check.output);
  mkdirSync(directory, {recursive: true});
  writeFileSync(path.join(directory, `${check.id}.log`), output, 'utf8');
  results.push({
    task: check.task,
    check: check.id,
    command: [check.command, ...check.args].join(' '),
    startedAt,
    exitCode: result.status ?? 1,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    outputRef: path.relative(root, path.join(directory, `${check.id}.log`)).replaceAll('\\', '/'),
  });
}

const failed = results.filter((result) => result.status !== 'PASS');
const summary = {
  status: failed.length === 0 ? 'PASS' : 'FAIL',
  profile: 'local-preflight-only',
  productionDeployment: 'NOT_RUN',
  realAccounts: 'NOT_PROVIDED',
  note: 'Preflight evidence proves local contracts and packaging checks only. It does not promote M8 or close real provider, billing, affiliate, commerce, or production gates.',
  checks: results,
};
for (const directory of ['export-scan', 'managed-preflight', 'docker-preflight', 'config-migration', 'restore-preflight', 'operations-preflight']) {
  mkdirSync(path.join(evidenceRoot, directory), {recursive: true});
  writeFileSync(path.join(evidenceRoot, directory, 'result.json'), JSON.stringify(summary, null, 2), 'utf8');
}
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
