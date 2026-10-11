import assert from 'node:assert/strict';
import {test} from 'node:test';

import {validateStageProgression} from '../../scripts/check-stage-progression.mjs';

const digests = {sourceTreeSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64), configurationSha256: 'c'.repeat(64), contractSha256: 'd'.repeat(64), validatorSha256: 'e'.repeat(64), lockfileSha256: 'f'.repeat(64), digestInputs: {sourceTree: ['src', 'tests'], schema: ['src/db']}};
const stage = {stageId: 'M4', status: 'IN_PROGRESS', candidateId: 'development', criteriaIds: ['M4-C01', 'M4-C02']};
const record = {recordKind: 'DEVELOPMENT_VERIFICATION', stageId: 'M4', status: 'IN_PROGRESS', candidateId: 'development', candidate: digests, criterionResults: [{criterionId: 'M4-C01', mandatory: true, result: 'NOT_RUN'}, {criterionId: 'M4-C02', mandatory: true, result: 'NOT_RUN'}], commands: ['typecheck', 'lint', 'format-check', 'verify-db-boundary', 'verify-openspec', 'frozen-lock-install', 'production-build', 'billing-schema', 'contracts-provider-inputs', 'contracts-billing-contracts'].map((commandId) => ({commandId, status: 'PASS', exitCode: 0, outputRef: 'proof.log'})), invalidation: {affectedStages: ['M3'], currentM3Applicability: 'STALE', changedDigestRefs: ['changes.json'], requiredReruns: ['generation-regression'], carriedEvidence: []}, prerequisites: [{stageId: 'M3', observedStatus: 'PASS', requiredProfile: 'historical-local-mock', evidenceRefs: ['m3.json']}]};
const evidenceExists = (ref: string) => ['proof.log', 'changes.json', 'm3.json'].includes(ref);
const validate = (input: Parameters<typeof validateStageProgression>[0]) => validateStageProgression({...input, evidenceExists});

test('current development keeps historical predecessor approval and incomplete gates distinct', () => {
  assert.deepEqual(validate({stage, record, current: digests}), []);
});

test('source changes and narrowed validator footprints fail current development validation', () => {
  assert.ok(validate({stage, record: {...record, candidate: {...digests, sourceTreeSha256: '0'.repeat(64)}}, current: digests}).some((error: string) => error.includes('sourceTreeSha256')));
  assert.ok(validate({stage, record: {...record, candidate: {...digests, digestInputs: {sourceTree: ['src']}}}, current: digests}).some((error: string) => error.includes('footprint')));
});

test('omitted or duplicated stage criteria cannot hide incomplete stage evidence', () => {
  for (const criterionResults of [record.criterionResults.slice(0, 1), [record.criterionResults[0], record.criterionResults[0]]]) {
    assert.ok(validate({stage, record: {...record, criterionResults}, current: digests}).some((error: string) => error.includes('criteria')));
  }
});

test('stage register drift and unreviewed carry-forward are rejected', () => {
  assert.ok(validate({stage: {...stage, status: 'PASS'}, record, current: digests}).some((error: string) => error.includes('status')));
  assert.ok(validate({stage, record: {...record, invalidation: {...record.invalidation, carriedEvidence: [{oldRecordRef: 'm3.json'}]}}, current: digests}).some((error: string) => error.includes('carry-forward')));
});

test('development records cannot promote unrun criteria into a stage PASS', () => {
  assert.ok(validate({stage: {...stage, status: 'PASS'}, record: {...record, status: 'PASS', criterionResults: record.criterionResults.map((entry) => ({...entry, mandatory: false}))}, current: digests}).some((error: string) => error.includes('development')));
});

test('missing, failed or evidence-free required commands invalidate development verification', () => {
  for (const commands of [[], record.commands.map((entry) => ({...entry, exitCode: 1, status: 'FAIL'})), record.commands.map((entry) => ({...entry, outputRef: 'missing.log'}))]) {
    assert.ok(validate({stage, record: {...record, commands}, current: digests}).some((error: string) => error.includes('command')));
  }
});

test('M6 current development requires retained operations, recovery, privileged, MFA and affiliate probes', () => {
  const m6stage = {...stage, stageId: 'M6'};
  const m6record = {...record, stageId: 'M6'};
  assert.ok(validate({stage: m6stage, record: m6record, current: digests}).some((error: string) => error.includes('m6-operations')));
  const commands = [...record.commands, ...['m6-operations', 'm6-privileged', 'm6-mfa', 'm6-recovery', 'm6-affiliate', 'm6-affiliate-db', 'm6-affiliate-races', 'm6-cash-affiliate', 'm6-affiliate-notifications'].map((commandId) => ({commandId, status: 'PASS', exitCode: 0, outputRef: 'proof.log'}))];
  assert.deepEqual(validate({stage: m6stage, record: {...m6record, commands}, current: digests}), []);
});

test('carry-forward needs existing proof and independent reviewed equivalence', () => {
  const carry = {oldRecordRef: 'm3.json', unchangedScopes: ['src/app'], equivalenceRationale: 'identical bytes', reviewerId: '/reviewer', reviewEvidenceRef: 'missing.json'};
  assert.ok(validate({stage, record: {...record, invalidation: {...record.invalidation, carriedEvidence: [carry]}}, current: digests}).some((error: string) => error.includes('carry-forward')));
});
