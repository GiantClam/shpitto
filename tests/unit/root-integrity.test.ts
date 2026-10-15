import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const script = path.resolve('scripts/check-root-integrity.mjs');
const inputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.dockerignore', 'internal/spikes/selected-stack/package.json', 'internal/spikes/selected-stack/pnpm-lock.yaml', 'internal/restart/provenance.json', 'tooling/root-dependency-baseline.json'];

function fixture(run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'shpitto-root-integrity-'));
  try {
    for (const input of inputs) {
      const target = path.join(directory, input);
      mkdirSync(path.dirname(target), {recursive: true});
      copyFileSync(input, target);
    }
    run(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function verify(directory: string) {
  return spawnSync(process.execPath, [script], {cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024, windowsHide: true});
}

function editJson(directory: string, file: string, edit: (value: any) => void): void {
  const target = path.join(directory, file);
  const value = JSON.parse(readFileSync(target, 'utf8'));
  edit(value);
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('the exact existing application dependency evolution passes without rewriting historical proof', () => fixture((directory) => {
  const result = verify(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'PASS');
}));

for (const [name, mutate] of [
  ['an additional runtime dependency', (directory: string) => editJson(directory, 'package.json', (value) => {value.dependencies.unreviewed = '1.0.0';})],
  ['a missing runtime dependency', (directory: string) => editJson(directory, 'package.json', (value) => {delete value.dependencies.react;})],
  ['an optional dependency', (directory: string) => editJson(directory, 'package.json', (value) => {value.optionalDependencies = {unreviewed: '1.0.0'};})],
  ['implicit bundling of the whole dependency graph', (directory: string) => editJson(directory, 'package.json', (value) => {value.bundledDependencies = true;})],
  ['a new transitive override', (directory: string) => editJson(directory, 'package.json', (value) => {value.pnpm = {overrides: {unreviewed: '1.0.0'}};})],
  ['another Next patch', (directory: string) => editJson(directory, 'package.json', (value) => {value.dependencies.next = '16.3.9';})],
  ['an S3 version range', (directory: string) => editJson(directory, 'package.json', (value) => {value.dependencies['@aws-sdk/client-s3'] = '^3.1141.0';})],
  ['a changed development dependency', (directory: string) => editJson(directory, 'package.json', (value) => {value.devDependencies.typescript = '6.0.4';})],
  ['a changed package manager', (directory: string) => editJson(directory, 'package.json', (value) => {value.packageManager = 'pnpm@12.7.0';})],
  ['a changed application lockfile', (directory: string) => writeFileSync(path.join(directory, 'pnpm-lock.yaml'), 'unreviewed lock\n', 'utf8')],
  ['rewritten historical dependency proof', (directory: string) => editJson(directory, 'internal/spikes/selected-stack/package.json', (value) => {value.dependencies.react = '19.4.0';})],
  ['rewritten historical lock proof', (directory: string) => writeFileSync(path.join(directory, 'internal/spikes/selected-stack/pnpm-lock.yaml'), 'rewritten historical lock\n', 'utf8')],
  ['rewritten historical provenance', (directory: string) => editJson(directory, 'internal/restart/provenance.json', (value) => {value.prototype.lockfileSha256 = '0'.repeat(64);})],
  ['legacy workspace discovery', (directory: string) => writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), 'packages: [legacy/*]\n', 'utf8')],
  ['a changed workspace override', (directory: string) => {
    const file = path.join(directory, 'pnpm-workspace.yaml');
    const original = readFileSync(file, 'utf8');
    const changed = original.replace('8.21.0', '8.21.1');
    assert.notEqual(changed, original);
    writeFileSync(file, changed, 'utf8');
  }],
  ['workspace package extensions', (directory: string) => {
    const file = path.join(directory, 'pnpm-workspace.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\npackageExtensions:\n  unreviewed@*:\n    dependencies:\n      extra: 1.0.0\n`, 'utf8');
  }],
  ['legacy TypeScript inclusion', (directory: string) => editJson(directory, 'tsconfig.json', (value) => {value.exclude = value.exclude.filter((entry: string) => entry !== 'legacy');})],
  ['legacy Docker inclusion', (directory: string) => writeFileSync(path.join(directory, '.dockerignore'), 'node_modules\n', 'utf8')],
] as const) {
  test(`root integrity rejects ${name}`, () => fixture((directory) => {
    mutate(directory);
    const result = verify(directory);
    assert.notEqual(result.status, 0, result.stdout);
  }));
}

test('historical provenance remains valid in both LF and CRLF checkouts', () => fixture((directory) => {
  const file = path.join(directory, 'internal/restart/provenance.json');
  const lf = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  for (const text of [lf, lf.replaceAll('\n', '\r\n')]) {
    writeFileSync(file, text, 'utf8');
    const result = verify(directory);
    assert.equal(result.status, 0, result.stderr);
  }
}));

test('the reviewed workspace configuration permits only checkout line-ending differences', () => fixture((directory) => {
  const file = path.join(directory, 'pnpm-workspace.yaml');
  const crlf = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
  writeFileSync(file, crlf, 'utf8');
  const result = verify(directory);
  assert.equal(result.status, 0, result.stderr);
}));
