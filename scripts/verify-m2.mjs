import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'internal/evidence/acceptance/M2/current-verification');
mkdirSync(output, {recursive: true});
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}
const ownedFiles = [
  ...filesUnder(path.join(root, 'src/modules')),
  ...filesUnder(path.join(root, 'src/adapters/mail')),
  path.join(root, 'src/config/models.ts'),
  path.join(root, 'src/contracts/http.ts'),
  path.join(root, 'src/lib/auth.ts'),
].filter((file) => file.endsWith('.ts') && !file.endsWith(path.join('mail', 'contracts.ts'))).map(relative).sort();
const tests = [
  ...filesUnder(path.join(root, 'tests/unit')).filter((file) => file.endsWith('.test.ts')).map(relative),
  ...['m2-foundation', 'onboarding', 'workspaces', 'invitations', 'tenant-authorization', 'operator', 'access-states', 'command-contract', 'credit-ledger', 'credit-reservation', 'credit-refund', 'credit-migration-backfill', 'auth-lifecycle'].map((name) => `scripts/probe-${name}.ts`),
];
const manifest = {
  schemaVersion: '1.0', stageId: 'M2', generatedAt: new Date().toISOString(),
  inclusion: ownedFiles, minimumBranchPercent: 80,
  policy: 'All delivered modules, authentication lifecycle, mail adapter, quote and HTTP domain contracts. A missing source in LCOV fails the gate; no exclusion based on low coverage.',
  exclusions: [
    {path: 'src/adapters/mail/contracts.ts', reason: 'Type-only declarations erased before execution; no runtime statements or branches.'},
    {path: 'src/db/schema/**', reason: 'Declarative Drizzle schema; database constraints are verified by integration probes.'},
    {path: 'src/app/**', reason: 'UI and route adapters have separate request-level mandatory scenarios; domain code remains included.'},
    {path: 'scripts/**', reason: 'Verification drivers, not delivered domain code.'},
    {path: 'node_modules/**', reason: 'Third-party implementation.'},
  ],
  inputs: [...ownedFiles, ...tests].map((file) => ({path: file, sha256: existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null})),
};
writeFileSync(path.join(output, 'owned-modules.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const commands = [];
function run(name, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  const endedAt = new Date().toISOString();
  writeFileSync(path.join(output, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`);
  commands.push({name, executable: process.execPath, args, startedAt, endedAt, exitCode: result.status, signal: result.signal, log: relative(path.join(output, `${name}.log`))});
  writeFileSync(path.join(output, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'} (${startedAt} - ${endedAt})`);
  return result.status === 0;
}
const lcov = path.join(output, 'm2-all-owned.lcov');
const suitePassed = run('suite', [
  '--experimental-strip-types', '--test', '--test-concurrency=1', '--experimental-test-coverage', '--test-coverage-branches=80',
  '--test-coverage-include=src/modules/**/*.ts', '--test-coverage-include=src/adapters/mail/**/*.ts',
  '--test-coverage-include=src/config/models.ts', '--test-coverage-include=src/contracts/http.ts', '--test-coverage-include=src/lib/auth.ts',
  '--test-reporter=spec', '--test-reporter=lcov', '--test-reporter-destination=stdout', `--test-reporter-destination=${lcov}`, ...tests,
]);
const reports = [];
let current;
for (const line of existsSync(lcov) ? readFileSync(lcov, 'utf8').split(/\r?\n/) : []) {
  if (line.startsWith('SF:')) {
    current = {path: relative(path.resolve(root, line.slice(3))), branchesFound: 0, branchesHit: 0};
    reports.push(current);
  } else if (current && line.startsWith('BRF:')) current.branchesFound = Number(line.slice(4));
  else if (current && line.startsWith('BRH:')) current.branchesHit = Number(line.slice(4));
}
const missing = ownedFiles.filter((file) => !reports.some((report) => report.path === file));
const totals = reports.reduce((sum, report) => ({branchesFound: sum.branchesFound + report.branchesFound, branchesHit: sum.branchesHit + report.branchesHit}), {branchesFound: 0, branchesHit: 0});
const percent = totals.branchesFound ? totals.branchesHit / totals.branchesFound * 100 : 0;
const summary = {...totals, branchPercent: percent, missing, reports, status: suitePassed && missing.length === 0 && percent >= 80 ? 'PASS' : 'FAIL'};
writeFileSync(path.join(output, 'coverage-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Owned branches: ${totals.branchesHit}/${totals.branchesFound} (${percent.toFixed(2)}%); missing: ${missing.join(', ') || 'none'}`);
let racesPassed = true;
// Every probe cleans its fixtures before/after execution. Each process is an
// independent reset; a rejection or infra error remains a failed repetition.
for (let repetition = 1; repetition <= 3; repetition += 1) {
  for (const probe of ['workspaces', 'invitations', 'command-contract', 'credit-reservation']) {
    if (!run(`race-${repetition}-${probe}`, ['--experimental-strip-types', `scripts/probe-${probe}.ts`])) racesPassed = false;
  }
}
if (summary.status !== 'PASS' || !racesPassed) process.exitCode = 1;
