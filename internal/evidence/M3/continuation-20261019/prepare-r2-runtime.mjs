import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(packet, 'r2');
assert.equal(existsSync(output), false, 'Retain each r2 packet without replacement.');
mkdirSync(output);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const freezeRef = 'internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json';
const freeze = read(path.join(root, freezeRef));
assert.equal(freeze.sourceTreeSha256, 'e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be');
const capture = spawnSync(process.execPath, ['scripts/candidate-digests.mjs', path.join(output, 'candidate-before')],
  {cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024});
assert.equal(capture.status, 0, capture.stderr);
const current = JSON.parse(capture.stdout);
const keys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];
assert.ok(keys.every((key) => current[key] === freeze[key]), 'r2 freeze is already stale.');
const footprint = read(path.join(output, 'candidate-before/digest-footprints.json'));
const r1 = read(path.join(packet, 'automated/verification-attempts/2026-10-19T06-15-36-336Z-cf40582e-4868-47f4-a19a-74dac9a9c38f/candidate-before/digest-footprints.json'));
const delta = Object.fromEntries(Object.keys(footprint).map((group) => {
  const before = new Map(r1[group].map((row) => [row.path, row]));
  const after = new Map(footprint[group].map((row) => [row.path, row]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].sort()
    .filter((file) => before.get(file)?.sha256 !== after.get(file)?.sha256)
    .map((file) => ({path: file, before: before.get(file) ?? null, after: after.get(file) ?? null}));
  return [group, {changedCount: changed.length, changed}];
}));
assert.equal(delta.schema.changedCount, 0);
assert.equal(delta.configuration.changedCount, 0);
assert.ok(delta.sourceTree.changed.every((row) => row.path.startsWith('scripts/') || row.path.startsWith('tests/') || row.path.startsWith('.shpitto/contracts/')),
  'r2 contains a runtime delta requiring wider review.');
write('r1-to-r2-impact.json', {createdAt: new Date().toISOString(), freezeRef,
  r1Source: '95ad817920e31e3db850155b6d321ab90c79cfeaa90d4d0d5263c9aa297a08e7', r2Source: current.sourceTreeSha256,
  allSixDigestsMatchAnnouncedR2: true, applicationRuntimeByteIdentical: true, schemaByteIdentical: true,
  configurationByteIdentical: true, lockfileByteIdentical: true, delta,
  inference: 'The runtime/schema/provider subset is unchanged, while validation policy and tests require fresh checks. No stale r1 stage record is promoted.'});
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-r2-browser-'));
const runtimeRoot = path.join(tempRoot, 'candidate');
mkdirSync(runtimeRoot);
for (const row of footprint.sourceTree) {
  const bytes = readFileSync(path.join(root, row.path));
  assert.equal(sha(bytes), row.sha256);
  const target = path.join(runtimeRoot, row.path);
  mkdirSync(path.dirname(target), {recursive: true});
  writeFileSync(target, bytes);
}
writeFileSync(path.join(runtimeRoot, 'pnpm-lock.yaml'), readFileSync(path.join(root, 'pnpm-lock.yaml')));
cpSync(path.join(root, 'public'), path.join(runtimeRoot, 'public'), {recursive: true});
symlinkSync(path.join(root, 'node_modules'), path.join(runtimeRoot, 'node_modules'), 'junction');
write('runtime-preparation.json', {createdAt: new Date().toISOString(), freezeRef, sourceTreeSha256: current.sourceTreeSha256,
  tempRoot, runtimeRoot, verifiedSourceFileCount: footprint.sourceTree.length, dependencySource: path.join(root, 'node_modules'),
  lockfileMatches: true, privateEnvFilesCopied: false, shippedFilesModified: false,
  r1CompiledBuildReused: false, browserPort: 3199});
console.log(JSON.stringify({status: 'READY_FOR_FRESH_BUILD', runtimeRoot, sourceTreeSha256: current.sourceTreeSha256,
  changedPaths: delta.sourceTree.changed.map((row) => row.path)}));
