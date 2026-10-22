import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {isProtectedPath, validateChangeManifest, validateEvidence, validateRetainedEvidence} from '../../scripts/validate-change.ts';
import {createRollbackReport} from '../../scripts/rollback-customization.ts';
import {checkDocsManifest} from '../../scripts/check-doc-contracts.ts';
import {validateReleaseEvidence} from '../../scripts/export-release.ts';
import {validateDeploymentEvidence} from '../../scripts/deploy-release.ts';

const root = process.cwd();
const readJson = (ref: string) => JSON.parse(readFileSync(path.join(root, ref), 'utf8')) as Record<string, unknown>;
const candidate = {candidateId: 'candidate', sourceTreeSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64), configurationSha256: 'c'.repeat(64), contractSha256: 'd'.repeat(64), validatorSha256: 'e'.repeat(64), lockfileSha256: 'f'.repeat(64)};
const completeEvidence = () => ({
  ...candidate, capturedAt: '2026-10-19T00:00:00Z', implementerId: 'implementer', policyVersion: 'v1',
  checks: ['typecheck', 'lint', 'format-check', 'boundary-checks', 'relevant-domain-tests'].map((id) => ({id, status: 'PASS', exitCode: 0, outputRef: `logs/${id}.log`})),
  review: {reviewerId: 'reviewer', independentFromImplementer: true, decision: 'PASS'},
});

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
  assert.equal(isProtectedPath('src/app/../db/schema.ts'), true);
  assert.equal(isProtectedPath('src/app/(marketing)/page.tsx'), false);
  const errors = validateChangeManifest({release: 'v1', baseline: 'x', dirtyWork: [], intent: 'visual', classification: 'presentation', changedFiles: [{path: 'src/db/schema.ts', classification: 'presentation', reason: 'theme'}], checks: [], recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}});
  assert.equal(errors.some((error) => error.includes('engineering-change')), true);
});

test('validation, release and tooling controls require engineering classification', () => {
  for (const file of ['scripts/validate-change.ts', 'scripts/export-release.ts', 'scripts/deploy-release.ts', 'scripts/lib/trusted-validation.mjs', 'tooling/lint-policy.json', 'tooling/format-policy.json']) {
    assert.equal(isProtectedPath(file), true, file);
    const errors = validateChangeManifest({release: 'v1', baseline: 'x', dirtyWork: [], intent: 'visual', classification: 'presentation', changedFiles: [{path: file, classification: 'presentation', reason: 'theme'}], checks: [], recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}});
    assert.match(errors.join('\n'), /engineering-change/, file);
  }
});

test('Windows path aliases cannot bypass protected classification', () => {
  for (const file of ['SRC/DB/schema.ts', 'Scripts/validate-change.ts', 'src/db./schema.ts', 'src/db /schema.ts', 'D:/github/shpitto/src/db/schema.ts', '../src/db/schema.ts', 'src/db/schema.ts:stream']) {
    const errors = validateChangeManifest({release: 'v1', baseline: 'x', dirtyWork: [], intent: 'visual', classification: 'presentation', changedFiles: [{path: file, classification: 'presentation', reason: 'theme'}], checks: [], recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}});
    assert.notDeepEqual(errors, [], file);
  }
});

test('protected file classification must also reclassify the overall workflow', () => {
  const manifest = {release: 'v1', baseline: 'x', dirtyWork: [], intent: 'visual', classification: 'presentation', changedFiles: [{path: 'src/db/schema.ts', classification: 'engineering-change', reason: 'contract revision'}], checks: [], recovery: {patchRef: 'patch.diff', preservesUnrelatedWork: true, overlaps: []}};
  assert.match(validateChangeManifest(manifest).join('\n'), /overall.*engineering-change/i);
  assert.deepEqual(validateChangeManifest({...manifest, classification: 'engineering-change'}), []);
});

test('manifest evidence requires retained outputs and a passing record status', () => {
  const base = completeEvidence();
  assert.match(validateRetainedEvidence({...base, status: 'FAIL'}, 'internal/evidence/record.json').join('\n'), /status/);
  const checks = base.checks.map((check) => ({...check, outputSha256: 'a'.repeat(64)}));
  assert.match(validateRetainedEvidence({...base, checks, status: 'READY_FOR_REVIEW'}, path.join(root, 'missing-record.json')).join('\n'), /missing|escapes/i);
});

test('evidence rejects stale digests and accepts a complete independent record', () => {
  const base = completeEvidence();
  assert.deepEqual(validateEvidence(base, candidate), []);
  assert.match(validateEvidence({...base, lockfileSha256: 'stale'}, candidate).join('\n'), /stale evidence digest/);
});

test('matching digest values must each be SHA-256 strings in both evidence and current candidate', () => {
  const base = completeEvidence();
  for (const key of ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256']) {
    for (const value of ['x', true, 1, {}, null, 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), ` ${'a'.repeat(64)}`]) {
      assert.notDeepEqual(validateEvidence({...base, [key]: value}, {...candidate, [key]: value}), [], `${key}: ${JSON.stringify(value)}`);
    }
  }
});

test('evidence metadata requires a parseable date string and a canonical nonempty policy identity', () => {
  const base = completeEvidence();
  for (const capturedAt of [true, 1, {}, ' ', 'not-a-date', '2026-13-01T00:00:00Z', ' 2026-10-19T00:00:00Z ']) {
    assert.notDeepEqual(validateEvidence({...base, capturedAt}, candidate), [], JSON.stringify(capturedAt));
  }
  for (const policyVersion of [true, 1, {}, ' ', ' v1', 'v1 ']) {
    assert.notDeepEqual(validateEvidence({...base, policyVersion}, candidate), [], JSON.stringify(policyVersion));
  }
  assert.deepEqual(validateEvidence({...base, policyVersion: 'another-policy-version'}, candidate), []);
});

test('release evidence requires every mandatory check to succeed with a unique identity and output', () => {
  const base = completeEvidence();
  for (const checks of [
    [],
    ...base.checks.map((required) => base.checks.filter((check) => check.id !== required.id)),
    [...base.checks, base.checks[0]],
    base.checks.map((check, index) => index === 0 ? {...check, id: ''} : check),
    base.checks.map((check, index) => index === 0 ? {...check, outputRef: ' '} : check),
    base.checks.map((check, index) => index === 0 ? {...check, status: 'FAIL'} : check),
    base.checks.map((check, index) => index === 0 ? {...check, exitCode: 1} : check),
  ]) assert.notDeepEqual(validateEvidence({...base, checks}, candidate), [], JSON.stringify(checks));
});

test('release review requires an explicit PASS from an identified reviewer distinct from the implementer', () => {
  const base = completeEvidence();
  const invalid = [
    {...base, implementerId: undefined},
    {...base, implementerId: ' '},
    {...base, review: {...base.review, reviewerId: undefined}},
    {...base, review: {...base.review, reviewerId: ' '}},
    {...base, review: {...base.review, reviewerId: 'implementer'}},
    {...base, review: {...base.review, reviewerId: ' implementer '}},
    {...base, review: {...base.review, independentFromImplementer: false}},
    {...base, review: {...base.review, decision: undefined}},
    {...base, review: {...base.review, decision: 'FAIL'}},
    {...base, review: {...base.review, decision: 'NOT_RUN'}},
    {...base, review: 'PASS'},
  ];
  for (const evidence of invalid) assert.notDeepEqual(validateEvidence(evidence, candidate), [], JSON.stringify(evidence.review));
});

test('release evidence binds both explicit candidate identities even when all six digests match', () => {
  const base = completeEvidence();
  assert.notDeepEqual(validateEvidence({...base, candidateId: 'different-candidate'}, candidate), []);
  for (const candidateId of [undefined, '', ' ', ' candidate ', 1]) {
    assert.notDeepEqual(validateEvidence({...base, candidateId}, {...candidate, candidateId}), []);
    assert.notDeepEqual(validateEvidence(base, {...candidate, candidateId}), []);
  }
});

test('release export and deployment reject JSON-only evidence without trusted staging context', () => {
  for (const validate of [validateReleaseEvidence, validateDeploymentEvidence]) {
    assert.throws(() => validate('historical-evidence.json', 'historical-candidate.json'), /trusted validation context/i);
  }
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
