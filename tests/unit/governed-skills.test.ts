import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {isProtectedPath, validateChangeManifest, validateEvidence} from '../../scripts/validate-change.ts';
import {createRollbackReport} from '../../scripts/rollback-customization.ts';
import {checkDocsManifest} from '../../scripts/check-doc-contracts.ts';

const root = process.cwd();
const readJson = (ref: string) => JSON.parse(readFileSync(path.join(root, ref), 'utf8')) as Record<string, unknown>;

test('catalog contains twelve canonical Skills with required sections', () => {
  const registry = readJson('skills/registry.json') as {skills: Array<{id: string}>};
  assert.equal(registry.skills.length, 12);
  for (const skill of registry.skills) {
    const source = readFileSync(path.join(root, 'skills', skill.id, 'SKILL.md'), 'utf8');
    for (const section of ['## Inputs', '## Allowed scope', '## Protected contracts', '## Outputs and evidence', '## Recovery', '## Escalation']) assert.match(source, new RegExp(section));
  }
});

test('protected paths require engineering classification', () => {
  assert.equal(isProtectedPath('src/db/schema.ts'), true);
  assert.equal(isProtectedPath('src/app/(marketing)/page.tsx'), false);
  const errors = validateChangeManifest({release: 'v1', baseline: 'x', dirtyWork: [], intent: 'visual', classification: 'presentation', changedFiles: [{path: 'src/db/schema.ts', classification: 'presentation', reason: 'theme'}], checks: [], recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}});
  assert.equal(errors.some((error) => error.includes('engineering-change')), true);
});

test('evidence rejects stale digests and accepts a complete independent record', () => {
  const candidate = {sourceTreeSha256: 'a', schemaSha256: 'b', configurationSha256: 'c', contractSha256: 'd', validatorSha256: 'e', lockfileSha256: 'f'};
  const base = {candidateId: 'candidate', capturedAt: '2026-10-04T00:00:00Z', ...candidate, policyVersion: 'v1', checks: [{status: 'PASS', exitCode: 0, outputRef: 'logs/check.txt'}], review: {independentFromImplementer: true}};
  assert.deepEqual(validateEvidence(base, candidate), []);
  assert.match(validateEvidence({...base, lockfileSha256: 'stale'}, candidate).join('\n'), /stale evidence digest/);
});

test('rollback blocks overlaps and permits a scoped patch', () => {
  assert.equal(createRollbackReport({recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: ['src/config/brand.ts']}}).status, 'BLOCKED');
  assert.equal(createRollbackReport({recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}}).status, 'READY');
});

test('docs manifest exposes published-only versioned sections', () => {
  const manifest = readJson('content/docs/v1/manifest.json') as {version: string; source: string; navigation: Array<{title: string; path: string}>; search: {mode: string; source: string}};
  const files = [...new Set(manifest.navigation.map((entry) => `${manifest.source}/${entry.path}`))];
  assert.deepEqual(checkDocsManifest(manifest, files), []);
});

test('docs manifest rejects traversal paths instead of reading outside the release source', () => {
  const manifest = readJson('content/docs/v1/manifest.json') as {version: string; source: string; navigation: Array<{title: string; path: string}>; search: {mode: string; source: string}};
  const unsafe = {...manifest, navigation: [...manifest.navigation, {title: 'Unsafe', path: '../../../../package.json'}]};
  const files = [...new Set(unsafe.navigation.map((entry) => `${unsafe.source}/${entry.path}`))];
  assert.match(checkDocsManifest(unsafe, files).join('\n'), /not a normalized MDX source path/);
});
