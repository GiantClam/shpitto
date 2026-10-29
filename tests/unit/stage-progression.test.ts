import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

import {validateStageProgression} from '../../scripts/check-stage-progression.mjs';

const digests = {sourceTreeSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64), configurationSha256: 'c'.repeat(64), contractSha256: 'd'.repeat(64), validatorSha256: 'e'.repeat(64), lockfileSha256: 'f'.repeat(64), digestInputs: {sourceTree: ['src', 'tests'], schema: ['src/db']}};
const stage = {stageId: 'M4', status: 'IN_PROGRESS', candidateId: 'development', criteriaIds: ['M4-C01', 'M4-C02']};
const record = {recordKind: 'DEVELOPMENT_VERIFICATION', stageId: 'M4', status: 'IN_PROGRESS', candidateId: 'development', candidate: digests, criterionResults: [{criterionId: 'M4-C01', mandatory: true, result: 'NOT_RUN'}, {criterionId: 'M4-C02', mandatory: true, result: 'NOT_RUN'}], commands: ['typecheck', 'lint', 'format-check', 'verify-db-boundary', 'verify-openspec', 'frozen-lock-install', 'production-build', 'billing-schema', 'contracts-provider-inputs', 'contracts-billing-contracts'].map((commandId) => ({commandId, status: 'PASS', exitCode: 0, outputRef: 'proof.log'})), invalidation: {affectedStages: ['M3'], currentM3Applicability: 'STALE', changedDigestRefs: ['changes.json'], requiredReruns: ['generation-regression'], carriedEvidence: []}, prerequisites: [{stageId: 'M3', observedStatus: 'PASS', requiredProfile: 'historical-local-mock', evidenceRefs: ['m3.json']}]};
const evidenceExists = (ref: string) => ['proof.log', 'changes.json', 'm3.json'].includes(ref);
const validate = (input: Parameters<typeof validateStageProgression>[0]) => validateStageProgression({...input, evidenceExists});

test('current development keeps historical predecessor approval and incomplete gates distinct', () => {
  assert.deepEqual(validate({stage, record, current: digests}), []);
});

test('automatically verified development may queue review without blocking downstream work', () => {
  assert.deepEqual(validate({stage, record: {...record, status: 'READY_FOR_REVIEW'}, current: digests}), []);
});

test('validator changes can mark development evidence stale without changing the stage register', () => {
  assert.deepEqual(validate({stage, record: {...record, status: 'STALE'}, current: digests}), []);
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

// Synthetic evidence only: this fixture does not approve or write a project record.
function acceptedFixture() {
  const current = {...digests, digestInputs: {sourceTree: ['src', 'tests'], schema: ['src/db'], configuration: ['package.json'], contract: ['contracts'], validator: ['scripts', 'tests']}};
  const acceptedStage = {...stage, status: 'PASS', candidateId: 'synthetic-acceptance', gateTaskId: '5.10', prerequisiteStages: ['M3'], prerequisiteTaskIds: ['5.1', '5.2']};
  const traceability = {
    gates: {M4: '5.10'},
    tasks: [{id: '5.1', milestone: 'M4', scenarios: ['SC-PRV-01'], T: ['T2']}, {id: '5.2', milestone: 'M4', scenarios: ['SC-GEN-20'], T: ['T49']}, {id: '5.10', milestone: 'M4', depends: ['5.1', '5.2'], scenarios: ['SC-PRV-01'], T: ['T53']}],
    scenarios: [{id: 'SC-PRV-01', taskIds: ['5.1', '5.10'], T: ['T02']}, {id: 'SC-GEN-20', taskIds: ['5.2'], T: ['T49']}, {id: 'SC-GEN-08', taskIds: ['4.12', '5.10'], T: ['T53']}],
    requirements: [{milestones: ['M3', 'M4'], taskIds: ['4.12', '5.10'], scenarioIds: ['SC-GEN-08'], T: ['T53'], subcases: [] as string[]}],
  };
  const proof = {evidenceRefs: ['proof.log']};
  const acceptedRecord = {
    ...record, recordKind: 'IMPLEMENTATION_ACCEPTANCE', status: 'PASS', candidateId: acceptedStage.candidateId, candidate: current,
    commands: record.commands.map((entry) => ({...entry})),
    criterionResults: stage.criteriaIds.map((criterionId) => ({criterionId, mandatory: true, result: 'PASS', ...proof})),
    commonStandardResults: ['scope', 'build-and-checks', 'coverage', 'defects', 'isolation-security', 'financial-task-integrity', 'ui-completeness', 'evidence', 'recovery'].map((standard) => ({standard, applicable: true, result: 'PASS', ...proof})),
    scenarioResults: ['SC-PRV-01', 'SC-GEN-20', 'SC-GEN-08', 'T02', 'T49', 'T53'].map((id) => ({ids: [id], mandatory: true, result: 'PASS', commandRef: 'typecheck', ...proof})),
    coverage: {status: 'PASS', percent: 80, totalBranches: 10, coveredBranches: 8, denominator: 10, ownedModuleManifestRef: 'modules.json', evidenceRef: 'coverage.json'},
    defects: [] as {severity: string; status: string; mandatoryCriterionAffected: boolean}[],
    submission: {implementerId: 'implementer', submittedAt: '2026-10-15T10:00:00Z', reportRef: 'proof.log'},
    independentReview: {reviewerId: 'reviewer', independentFromImplementer: true, decision: 'PASS', reviewedAt: '2026-10-15T11:00:00Z', evidenceRefs: ['review.json']},
    integrationDecision: {integratorId: 'integrator', decision: 'PASS', decidedAt: '2026-10-15T12:00:00Z', evidenceRefs: ['integration.json']},
    prerequisites: [{stageId: 'M3', observedStatus: 'PASS', evidenceRefs: ['m3.json']}, ...['5.1', '5.2'].map((taskId) => ({taskId, observedStatus: 'PASS', evidenceRefs: [`task-${taskId}.json`]}))],
    invalidation: {...record.invalidation, currentM3Applicability: 'PASS', carriedEvidence: [{oldRecordRef: 'm3.json', unchangedScopes: ['src/modules/credits'], equivalenceRationale: 'Affected M3 regressions rerun on this candidate.', reviewerId: 'reviewer', reviewEvidenceRef: 'equivalence.json'}]},
  };
  const identity = {stageId: 'M4', candidateId: acceptedStage.candidateId, decision: 'PASS', candidateDigests: current};
  const evidence = new Map<string, unknown>([
    ['proof.log', 'retained'], ['changes.json', {}], ['m3.json', {stageId: 'M3', status: 'PASS'}],
    ['task-5.1.json', {taskId: '5.1', status: 'PASS'}], ['task-5.2.json', {taskId: '5.2', status: 'PASS'}],
    ['modules.json', {inclusion: ['src/modules/example.ts']}],
    ['coverage.json', {status: 'PASS', percent: 80, branchesFound: 10, branchesHit: 8, missingSources: [], malformed: [], reports: [{path: 'src/modules/example.ts', branchesFound: 10, branchesHit: 8}]}],
    ['review.json', {...identity, ...acceptedRecord.independentReview}],
    ['integration.json', {...identity, ...acceptedRecord.integrationDecision, independentReviewRef: 'review.json'}],
    ['equivalence.json', {...identity, stageId: 'M3', independentFromImplementer: true, ...acceptedRecord.invalidation.carriedEvidence[0], ...proof}],
  ]);
  return {stage: acceptedStage, record: acceptedRecord, current, traceability, evidence};
}

function validateAccepted(fixture: ReturnType<typeof acceptedFixture>) {
  return validateStageProgression({...fixture, evidenceExists: (ref) => fixture.evidence.has(ref), readEvidence: (ref) => fixture.evidence.get(ref)});
}

test('a separately reviewed current acceptance can pass without changing development semantics', () => {
  assert.deepEqual(validateAccepted(acceptedFixture()), []);
  assert.deepEqual(validate({stage, record, current: digests}), []);
});

type AcceptanceFixture = ReturnType<typeof acceptedFixture>;
function patchProof(fixture: AcceptanceFixture, ref: string, patch: Record<string, unknown>) {
  fixture.evidence.set(ref, {...fixture.evidence.get(ref) as object, ...patch});
}
function rejectsAcceptance(name: string, change: (fixture: AcceptanceFixture) => void, reason: RegExp) {
  test(`acceptance fails closed: ${name}`, () => {
    const fixture = acceptedFixture();
    assert.deepEqual(validateAccepted(fixture), [], 'negative case must start from independently valid evidence');
    change(fixture);
    assert.match(validateAccepted(fixture).join('\n'), reason);
  });
}

rejectsAcceptance('non-PASS stage', (f) => {f.stage.status = 'IN_PROGRESS';}, /PASS statuses/);
rejectsAcceptance('different candidate identity', (f) => {f.record.candidateId = 'other';}, /identity mismatch/);
for (const key of ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'] as const) {
  rejectsAcceptance(`changed candidate ${key}`, (f) => {f.record.candidate = {...f.current, [key]: '0'.repeat(64)};}, new RegExp(key));
  for (const ref of ['review.json', 'integration.json', 'equivalence.json']) {
    rejectsAcceptance(`${ref} is stale for ${key}`, (f) => {patchProof(f, ref, {candidateDigests: {...f.current, [key]: '0'.repeat(64)}});}, /JSON evidence|M3 applicability|carry-forward/);
  }
}
rejectsAcceptance('malformed current digests even when record agrees', (f) => {f.current.validatorSha256 = 'x'.repeat(64);}, /validatorSha256/);
rejectsAcceptance('narrowed canonical footprint', (f) => {f.record.candidate = {...f.current, digestInputs: {...f.current.digestInputs, sourceTree: ['src']}};}, /footprint/);
rejectsAcceptance('missing canonical footprint group', (f) => {f.current.digestInputs.validator = [];}, /footprint/);
rejectsAcceptance('omitted criterion', (f) => {f.record.criterionResults.pop();}, /criteria/);
rejectsAcceptance('duplicated criterion', (f) => {f.record.criterionResults[1] = f.record.criterionResults[0];}, /criteria/);
rejectsAcceptance('nonmandatory criterion', (f) => {f.record.criterionResults[0].mandatory = false;}, /criteria/);
rejectsAcceptance('unrun criterion', (f) => {f.record.criterionResults[0].result = 'NOT_RUN';}, /criteria/);
rejectsAcceptance('criterion with nonexistent evidence', (f) => {f.record.criterionResults[0].evidenceRefs = ['missing.log'];}, /criteria/);
rejectsAcceptance('missing common standard', (f) => {f.record.commonStandardResults.pop();}, /common standards/);
rejectsAcceptance('duplicate common standard', (f) => {f.record.commonStandardResults[1] = f.record.commonStandardResults[0];}, /common standards/);
rejectsAcceptance('inapplicable common standard', (f) => {f.record.commonStandardResults[0].applicable = false;}, /common standards/);
rejectsAcceptance('blocked common standard', (f) => {f.record.commonStandardResults[0].result = 'BLOCKED';}, /common standards/);
rejectsAcceptance('common standard without proof', (f) => {f.record.commonStandardResults[0].evidenceRefs = [];}, /common standards/);
rejectsAcceptance('shared scenario omitted', (f) => {f.record.scenarioResults = f.record.scenarioResults.filter((entry) => entry.ids[0] !== 'SC-GEN-08');}, /scenario set/);
rejectsAcceptance('scenario duplicated inside a grouped result', (f) => {f.record.scenarioResults[0].ids.push('SC-PRV-01');}, /scenario set/);
rejectsAcceptance('unexpected scenario', (f) => {f.record.scenarioResults[0].ids.push('SC-OTHER-01');}, /scenario set/);
rejectsAcceptance('new shared traceability obligation not yet executed', (f) => {f.traceability.scenarios.push({id: 'SC-PRV-15', taskIds: ['5.10'], T: ['T53']});}, /scenario set/);
rejectsAcceptance('shared requirement remains mandatory despite an earlier task mapping', (f) => {
  f.traceability.scenarios.push({id: 'SC-GEN-05', taskIds: ['4.12'], T: ['T53']});
  f.traceability.requirements[0].scenarioIds.push('SC-GEN-05');
}, /scenario set/);
rejectsAcceptance('required traceability subcase not executed', (f) => {f.traceability.requirements[0].subcases.push('T12.a');}, /scenario set/);
rejectsAcceptance('new milestone task not yet evidenced', (f) => {f.traceability.tasks.push({id: '5.9', milestone: 'M4', scenarios: ['SC-PRV-01'], T: ['T02']});}, /prerequisite/);
rejectsAcceptance('missing canonical traceability', (f) => {f.traceability.tasks = [];}, /traceability tasks/);
rejectsAcceptance('wrong gate task', (f) => {f.traceability.gates.M4 = '5.9';}, /traceability/);
rejectsAcceptance('scenario waived by mandatory flag', (f) => {f.record.scenarioResults[0].mandatory = false;}, /scenarios require/);
rejectsAcceptance('stale scenario result', (f) => {f.record.scenarioResults[0].result = 'STALE';}, /scenarios require/);
rejectsAcceptance('scenario without retained evidence', (f) => {f.record.scenarioResults[0].evidenceRefs = [];}, /scenarios require/);
rejectsAcceptance('scenario command is not recorded', (f) => {f.record.scenarioResults[0].commandRef = 'invented';}, /commandRef/);
for (const command of record.commands) {
  rejectsAcceptance(`required command ${command.commandId} omitted`, (f) => {f.record.commands = f.record.commands.filter((entry) => entry.commandId !== command.commandId);}, /commands/);
}
rejectsAcceptance('command failed', (f) => {f.record.commands[0].exitCode = 1;}, /commands/);
rejectsAcceptance('command NOT_RUN despite zero exit', (f) => {f.record.commands[0].status = 'NOT_RUN';}, /commands/);
rejectsAcceptance('duplicate command IDs', (f) => {f.record.commands.push({...f.record.commands[0]});}, /commands/);
rejectsAcceptance('command output missing', (f) => {f.record.commands[0].outputRef = 'missing.log';}, /commands/);
rejectsAcceptance('coverage below 80%', (f) => {f.record.coverage.percent = 79.99;}, /coverage/);
rejectsAcceptance('fabricated 80% with real lower branch count', (f) => {patchProof(f, 'coverage.json', {branchesHit: 7, percent: 70});}, /coverage/);
rejectsAcceptance('coverage denominator mismatch', (f) => {f.record.coverage.denominator = 9;}, /coverage/);
rejectsAcceptance('missing coverage JSON', (f) => {f.evidence.delete('coverage.json');}, /coverage/);
rejectsAcceptance('owned manifest includes unreported module', (f) => {patchProof(f, 'modules.json', {inclusion: ['src/modules/example.ts', 'src/modules/forgotten.ts']});}, /owned modules/);
rejectsAcceptance('coverage reports omit owned module', (f) => {patchProof(f, 'coverage.json', {reports: []});}, /owned modules/);
rejectsAcceptance('coverage omits module in top-level record', (f) => {Object.assign(f.record.coverage, {missingModules: ['src/modules/forgotten.ts']});}, /owned modules/);
rejectsAcceptance('coverage explicitly lists missing source', (f) => {patchProof(f, 'coverage.json', {missingSources: ['src/modules/example.ts']});}, /owned modules/);
rejectsAcceptance('coverage owned-module declarations disagree', (f) => {patchProof(f, 'coverage.json', {ownedModules: ['src/modules/other.ts']});}, /owned modules/);
rejectsAcceptance('malformed missing-module declaration', (f) => {Object.assign(f.record.coverage, {missingModules: {unreported: true}});}, /owned modules/);
rejectsAcceptance('malformed coverage report', (f) => {patchProof(f, 'coverage.json', {malformed: ['bad.lcov']});}, /owned modules/);
rejectsAcceptance('coverage aggregate disagrees with report sum', (f) => {patchProof(f, 'coverage.json', {reports: [{path: 'src/modules/example.ts', branchesFound: 9, branchesHit: 8}]});}, /owned modules/);
for (const severity of ['P0', 'P1', 'P2']) {
  rejectsAcceptance(`open ${severity} mandatory defect`, (f) => {f.record.defects.push({severity, status: 'OPEN', mandatoryCriterionAffected: true});}, /defects/);
}
rejectsAcceptance('unknown defect disposition', (f) => {f.record.defects.push({severity: 'P0', status: 'DEFERRED', mandatoryCriterionAffected: false});}, /defects/);
rejectsAcceptance('implementer self-review', (f) => {f.record.independentReview.reviewerId = 'implementer'; patchProof(f, 'review.json', {reviewerId: 'implementer'});}, /independent reviewer/);
rejectsAcceptance('implementer self-review disguised by whitespace', (f) => {f.record.independentReview.reviewerId = ' implementer '; patchProof(f, 'review.json', {reviewerId: ' implementer '});}, /independent reviewer/);
rejectsAcceptance('review independence not asserted', (f) => {f.record.independentReview.independentFromImplementer = false;}, /independent reviewer/);
rejectsAcceptance('review is only a Markdown claim', (f) => {f.record.independentReview.evidenceRefs = ['proof.log'];}, /reviewer JSON/);
rejectsAcceptance('review bound to another stage', (f) => {patchProof(f, 'review.json', {stageId: 'M5'});}, /reviewer JSON/);
rejectsAcceptance('review bound to another candidate', (f) => {patchProof(f, 'review.json', {candidateId: 'other'});}, /reviewer JSON/);
rejectsAcceptance('review JSON is not an object', (f) => {f.evidence.set('review.json', []);}, /reviewer JSON/);
rejectsAcceptance('review decision was not PASS', (f) => {patchProof(f, 'review.json', {decision: 'BLOCKED'});}, /reviewer JSON/);
rejectsAcceptance('reviewer also integrates', (f) => {f.record.integrationDecision.integratorId = 'reviewer'; patchProof(f, 'integration.json', {integratorId: 'reviewer'});}, /separate integrator/);
rejectsAcceptance('integrator points to another review', (f) => {patchProof(f, 'integration.json', {independentReviewRef: 'missing.json'});}, /integrator JSON/);
rejectsAcceptance('integration precedes review', (f) => {f.record.integrationDecision.decidedAt = '2026-10-15T10:30:00Z'; patchProof(f, 'integration.json', {decidedAt: f.record.integrationDecision.decidedAt});}, /timestamps/);
rejectsAcceptance('missing prerequisite stage', (f) => {f.record.prerequisites = f.record.prerequisites.filter((entry) => !('stageId' in entry) || entry.stageId !== 'M3');}, /prerequisite/);
rejectsAcceptance('missing prerequisite task', (f) => {f.record.prerequisites.pop();}, /prerequisite/);
rejectsAcceptance('duplicated prerequisite', (f) => {f.record.prerequisites.push(f.record.prerequisites[0]);}, /prerequisite/);
rejectsAcceptance('blocked prerequisite', (f) => {f.record.prerequisites[0].observedStatus = 'BLOCKED';}, /prerequisite/);
rejectsAcceptance('prerequisite claim contradicts retained record', (f) => {patchProof(f, 'task-5.1.json', {status: 'FAIL'});}, /prerequisite/);
rejectsAcceptance('historical M3 approval with STALE current applicability', (f) => {f.record.invalidation.currentM3Applicability = 'STALE';}, /M3 applicability/);
rejectsAcceptance('M3 applicability claimed without equivalence', (f) => {f.record.invalidation.carriedEvidence = [];}, /M3 applicability/);
rejectsAcceptance('M3 equivalence reviewed by implementer', (f) => {f.record.invalidation.carriedEvidence[0].reviewerId = 'implementer'; patchProof(f, 'equivalence.json', {reviewerId: 'implementer'});}, /carry-forward/);
rejectsAcceptance('equivalence proof names different historical record', (f) => {patchProof(f, 'equivalence.json', {oldRecordRef: 'other.json'});}, /carry-forward/);
rejectsAcceptance('another stage equivalence cannot masquerade as current M3 applicability', (f) => {
  f.evidence.set('m5.json', {stageId: 'M5', status: 'PASS'});
  f.record.prerequisites[0].evidenceRefs.push('m5.json');
  f.record.invalidation.carriedEvidence[0].oldRecordRef = 'm5.json';
  patchProof(f, 'equivalence.json', {stageId: 'M5', oldRecordRef: 'm5.json'});
}, /M3 applicability/);
rejectsAcceptance('equivalence lacks retained regressions', (f) => {patchProof(f, 'equivalence.json', {evidenceRefs: []});}, /carry-forward/);

test('malformed or unreadable acceptance inputs cannot throw a successful validation', () => {
  const fixture = acceptedFixture();
  for (const field of ['criterionResults', 'commonStandardResults', 'scenarioResults', 'commands', 'coverage', 'defects', 'prerequisites', 'invalidation']) {
    assert.ok(validateStageProgression({...fixture, record: {...fixture.record, [field]: null} as unknown as typeof fixture.record, evidenceExists: (ref) => fixture.evidence.has(ref), readEvidence: (ref) => fixture.evidence.get(ref)}).length, field);
  }
  assert.ok(validateStageProgression({...fixture, evidenceExists: () => true, readEvidence: () => {throw new Error('invalid JSON');}}).length);
  assert.ok(validateStageProgression({...fixture, traceability: undefined}).length);
  assert.deepEqual(validate({stage, record, current: digests}), [], 'development was not mutated by negative cases');
});

// Execute the real CLI body against in-memory files/subprocesses: no candidate capture,
// env reads, record writes or external tools are performed by these routing tests.
function syntheticCli(fixture: AcceptanceFixture, acceptance = true) {
  const root = path.resolve('synthetic-stage-root');
  const files = new Map<string, unknown>([...fixture.evidence].map(([ref, value]) => [path.resolve(root, ref), value]));
  const stages = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map((stageId) => {
    const selected = stageId === 'M4' && acceptance;
    const currentDevelopment = ['M4', 'M5', 'M6'].includes(stageId);
    const descriptor = selected ? {...fixture.stage} : {...stage, stageId, status: currentDevelopment ? 'IN_PROGRESS' : 'PASS'};
    const ref = `internal/evidence/acceptance/${stageId}/synthetic/record.json`;
    const value = selected ? fixture.record : {...record, stageId, status: descriptor.status, commands: [...record.commands, ...(stageId === 'M6' ? ['m6-operations', 'm6-privileged', 'm6-mfa', 'm6-recovery', 'm6-affiliate', 'm6-affiliate-db', 'm6-affiliate-races', 'm6-cash-affiliate', 'm6-affiliate-notifications'].map((commandId) => ({commandId, status: 'PASS', exitCode: 0, outputRef: 'proof.log'})) : [])], candidate: acceptance ? fixture.current : digests};
    files.set(path.resolve(root, ref), value);
    return {...descriptor, evidenceRecordRefs: [ref]};
  });
  files.set(path.resolve(root, 'openspec/changes/restart-shpitto-video-saas/acceptance-status.json'), {stages});
  if (acceptance) files.set(path.resolve(root, 'openspec/changes/restart-shpitto-video-saas/traceability.json'), fixture.traceability);
  const calls: string[][] = [];
  const output: string[] = [];
  const original = readFileSync(new URL('../../scripts/check-stage-progression.mjs', import.meta.url), 'utf8');
  const source = original.slice(0, original.indexOf('if (process.argv[1]')).replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  runInNewContext(`${source}\nrun();`, {
    path, process: {cwd: () => root, execPath: 'node', platform: 'win32'},
    existsSync: (ref: string) => files.has(ref),
    readFileSync: (ref: string) => {if (!files.has(ref)) throw new Error('missing synthetic file'); return JSON.stringify(files.get(ref));},
    spawnSync: (_executable: string, args: string[]) => {calls.push(args); return {status: 0, stdout: args[0] === 'scripts/candidate-digests.mjs' ? JSON.stringify(acceptance ? fixture.current : digests) : '{}'};},
    console: {log: (value: string) => output.push(value)},
  });
  return {calls, result: JSON.parse(output[0]) as {checks: {stageId: string; scope: string}[]}};
}

test('CLI routes acceptance through current validation without relabeling historical or development records', () => {
  const {calls, result} = syntheticCli(acceptedFixture());
  assert.equal(result.checks.find((entry) => entry.stageId === 'M4')?.scope, 'current-accepted');
  assert.equal(result.checks.find((entry) => entry.stageId === 'M3')?.scope, 'historical-approved');
  assert.equal(result.checks.find((entry) => entry.stageId === 'M5')?.scope, 'current-development');
  assert.ok(calls.some((args) => args.includes('internal/evidence/acceptance/M4/synthetic/record.json') && args.includes('--current')));
  const development = syntheticCli(acceptedFixture(), false);
  assert.equal(development.result.checks.find((entry) => entry.stageId === 'M4')?.scope, 'current-development');
});

test('CLI cannot promote acceptance with missing reviewer JSON evidence', () => {
  const fixture = acceptedFixture();
  fixture.evidence.delete('review.json');
  assert.throws(() => syntheticCli(fixture), /independent reviewer JSON evidence/);
});
