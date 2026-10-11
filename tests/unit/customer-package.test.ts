import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {test} from 'node:test';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createCustomerPackage, validateCustomerCommands} from '../../scripts/customer-package.ts';

test('customer package keeps runnable buyer commands without internal evidence tooling', () => {
  const source = JSON.parse(readFileSync('package.json', 'utf8'));
  const candidate = createCustomerPackage(source);
  for (const command of ['services:up', 'demo:seed', 'db:migrate', 'ops:owner', 'validate:change']) assert.ok(candidate.scripts[command]);
  assert.equal(candidate.scripts['verify:acceptance'], undefined);
  assert.equal(candidate.scripts['export:candidate'], undefined);
  assert.equal(source.scripts['export:candidate'], 'node --experimental-strip-types scripts/package-release.ts');
  assert.deepEqual(validateCustomerCommands(candidate, (file) => existsSync(file)), []);
});

test('customer package rejects a missing command script or a missing nested command', () => {
  assert.deepEqual(validateCustomerCommands({scripts: {demo: 'node scripts/missing.ts'}}, () => false), ['demo references missing file scripts/missing.ts']);
  assert.deepEqual(validateCustomerCommands({scripts: {verify: 'pnpm absent'}}, () => true), ['verify references missing command absent']);
});

test('buyer change validator accepts manifest-only and demands an explicit baseline for evidence', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'shpitto-change-cli-'));
  try {
    const manifest = path.join(directory, 'change.json');
    writeFileSync(manifest, JSON.stringify({release: 'v1', baseline: 'buyer-checkout', dirtyWork: [], intent: 'brand update', changedFiles: [], checks: [], recovery: {patchRef: 'change.patch', preservesUnrelatedWork: true, overlaps: []}}), 'utf8');
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-change.ts', '--manifest', manifest], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'PASS');
    const rejected = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-change.ts', '--manifest', manifest, '--evidence', 'absent.json'], {encoding: 'utf8'});
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /requires --candidate/);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
