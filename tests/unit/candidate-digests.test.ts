import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

test('changing mandatory traceability mappings invalidates contract and validator digests', () => {
  const root = process.cwd();
  const script = path.resolve(root, 'scripts/candidate-digests.mjs');
  const run = (cwd: string) => {
    const result = spawnSync(process.execPath, [script], {cwd, encoding: 'utf8', maxBuffer: 1024 * 1024});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as {digestInputs: Record<string, string[]>; sourceTreeSha256: string; contractSha256: string; validatorSha256: string};
  };
  const baseline = run(root);
  const fixture = mkdtempSync(path.join(tmpdir(), 'shpitto-candidate-mapping-'));
  try {
    for (const input of new Set(Object.values(baseline.digestInputs).flat())) {
      const target = path.join(fixture, input);
      if (statSync(path.join(root, input)).isDirectory()) {
        mkdirSync(target, {recursive: true});
        writeFileSync(path.join(target, 'fixture.txt'), 'candidate fixture\n', 'utf8');
      } else {
        mkdirSync(path.dirname(target), {recursive: true});
        writeFileSync(target, '{}\n', 'utf8');
      }
    }
    writeFileSync(path.join(fixture, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');
    const mapping = path.join(fixture, 'openspec/changes/restart-shpitto-video-saas/traceability.json');
    mkdirSync(path.dirname(mapping), {recursive: true});
    writeFileSync(mapping, '{"requirements":[{"id":"REQ-GEN-08","T":["T01"]}]}\n', 'utf8');
    const before = run(fixture);
    writeFileSync(mapping, '{"requirements":[{"id":"REQ-GEN-08","T":[]}]}\n', 'utf8');
    const after = run(fixture);
    assert.notEqual(after.contractSha256, before.contractSha256);
    assert.notEqual(after.validatorSha256, before.validatorSha256);
    const providerDirectory = path.join(fixture, 'internal/contracts/providers');
    mkdirSync(providerDirectory, {recursive: true});
    const providerSchema = path.join(providerDirectory, 'model.schema.json');
    writeFileSync(providerSchema, '{"type":"object","required":["prompt"]}\n', 'utf8');
    const providerBefore = run(fixture);
    writeFileSync(providerSchema, '{"type":"object","required":["prompt","image"]}\n', 'utf8');
    const providerAfter = run(fixture);
    assert.notEqual(providerAfter.contractSha256, providerBefore.contractSha256);
    assert.notEqual(providerAfter.sourceTreeSha256, providerBefore.sourceTreeSha256);
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});
