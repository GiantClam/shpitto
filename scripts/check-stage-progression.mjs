import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const digestKeys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];

/** Historical approval never replaces current development freshness. */
export function validateStageProgression({stage, record, current, evidenceExists = () => false, readEvidence = () => null, traceability}) {
  if (record.recordKind === 'IMPLEMENTATION_ACCEPTANCE') {
    try { return validateAcceptedStage({stage, record, current, evidenceExists, readEvidence, traceability}); }
    catch { return ['Acceptance evidence is malformed or unreadable; promotion is denied.']; }
  }
  const errors = [];
  if (record.stageId !== stage.stageId || record.candidateId !== stage.candidateId) errors.push('Stage candidate identity mismatch.');
  if (record.status !== stage.status && !(stage.status === 'IN_PROGRESS' && ['READY_FOR_REVIEW', 'STALE'].includes(record.status))) errors.push('Stage status mismatch.');
  if (record.recordKind !== 'DEVELOPMENT_VERIFICATION' || !['IN_PROGRESS', 'READY_FOR_REVIEW', 'BLOCKED', 'STALE'].includes(record.status)) errors.push('This development validator cannot promote a milestone gate.');
  for (const key of digestKeys) {
    if (!current[key] || record.candidate?.[key] !== current[key]) errors.push(`Current candidate ${key} mismatch.`);
  }
  if (JSON.stringify(record.candidate?.digestInputs) !== JSON.stringify(current.digestInputs)) errors.push('Current canonical footprint mismatch.');
  const expected = [...stage.criteriaIds].sort();
  const actual = (record.criterionResults ?? []).map((entry) => entry.criterionId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push('Mandatory stage criteria are missing or duplicated.');
  if (record.criterionResults?.some((entry) => entry.mandatory !== true)) errors.push('Stage criteria must remain mandatory.');
  if (!record.invalidation?.affectedStages?.includes('M3')) errors.push('M3 impact must be recorded.');
  if (record.invalidation?.currentM3Applicability !== 'STALE') errors.push('Current development must retain explicit STALE M3 applicability until a separate stage-equivalence promotion.');
  if (!record.invalidation?.changedDigestRefs?.length || !record.invalidation.changedDigestRefs.every(evidenceExists) || !record.invalidation.requiredReruns?.length) errors.push('Changed-digest evidence and required reruns must be recorded.');
  const predecessor = record.prerequisites?.find((entry) => entry.stageId === 'M3');
  if (predecessor?.observedStatus !== 'PASS' || !predecessor.evidenceRefs?.length || !predecessor.evidenceRefs.every(evidenceExists)) errors.push('Historical M3 prerequisite evidence is missing.');
  const requiredCommands = ['typecheck', 'lint', 'format-check', 'verify-db-boundary', 'verify-openspec', 'frozen-lock-install', 'production-build', 'billing-schema', 'contracts-provider-inputs', 'contracts-billing-contracts'];
  if (stage.stageId === 'M6') requiredCommands.push('m6-operations', 'm6-privileged', 'm6-mfa', 'm6-recovery', 'm6-affiliate', 'm6-affiliate-db', 'm6-affiliate-races', 'm6-cash-affiliate', 'm6-affiliate-notifications');
  for (const id of requiredCommands) {
    const matches = (record.commands ?? []).filter((entry) => entry.commandId === id);
    if (matches.length !== 1 || matches[0].status !== 'PASS' || matches[0].exitCode !== 0 || !evidenceExists(matches[0].outputRef)) errors.push(`Required development command ${id} lacks passing retained evidence.`);
  }
  if ((record.commands ?? []).some((entry) => entry.status !== 'PASS' || entry.exitCode !== 0 || !evidenceExists(entry.outputRef))) errors.push('A recorded development command failed or lacks retained evidence.');
  for (const carry of record.invalidation?.carriedEvidence ?? []) {
    const review = carry.reviewEvidenceRef && evidenceExists(carry.reviewEvidenceRef) ? readEvidence(carry.reviewEvidenceRef) : null;
    if (!carry.oldRecordRef || !evidenceExists(carry.oldRecordRef) || !carry.unchangedScopes?.length || !carry.equivalenceRationale || !carry.reviewerId || review?.decision !== 'PASS' || review.independentFromImplementer !== true || review.reviewerId !== carry.reviewerId) errors.push('Unreviewed carry-forward is not accepted.');
  }
  return errors;
}

const commonStandards = ['scope', 'build-and-checks', 'coverage', 'defects', 'isolation-security', 'financial-task-integrity', 'ui-completeness', 'evidence', 'recovery'];
const acceptanceCommands = ['typecheck', 'lint', 'format-check', 'verify-db-boundary', 'verify-openspec', 'frozen-lock-install', 'production-build', 'billing-schema', 'contracts-provider-inputs', 'contracts-billing-contracts'];
const m6Commands = ['m6-operations', 'm6-privileged', 'm6-mfa', 'm6-recovery', 'm6-affiliate', 'm6-affiliate-db', 'm6-affiliate-races', 'm6-cash-affiliate', 'm6-affiliate-notifications'];
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const identity = (value) => nonempty(value) && value.trim() === value;
const strings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty) && new Set(value).size === value.length;
const exact = (expected, actual) => strings(expected) && strings(actual) && JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort());

/** Only filled acceptance records enter this path; development never inherits these promotion rules. */
function validateAcceptedStage({stage, record, current, traceability, evidenceExists, readEvidence}) {
  const errors = [];
  const retained = (refs) => strings(refs) && refs.every((ref) => evidenceExists(ref));
  const jsonProof = (ref) => {
    if (typeof ref !== 'string' || !ref.endsWith('.json') || !evidenceExists(ref)) return null;
    try {
      const value = readEvidence(ref);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
  };
  const bound = (proof, stageId = stage.stageId) => proof?.decision === 'PASS' && proof.stageId === stageId && proof.candidateId === record.candidateId && digestKeys.every((key) => proof.candidateDigests?.[key] === current[key]);
  if (!nonempty(stage.candidateId) || record.stageId !== stage.stageId || record.candidateId !== stage.candidateId) errors.push('Acceptance stage candidate identity mismatch.');
  if (stage.status !== 'PASS' || record.status !== 'PASS') errors.push('Acceptance promotion requires matching PASS statuses.');
  for (const key of digestKeys) {
    if (typeof current[key] !== 'string' || !/^[a-f0-9]{64}$/.test(current[key]) || record.candidate?.[key] !== current[key]) errors.push(`Current acceptance candidate ${key} mismatch.`);
  }
  if (!['sourceTree', 'schema', 'configuration', 'contract', 'validator'].every((key) => strings(current.digestInputs?.[key])) || JSON.stringify(record.candidate?.digestInputs) !== JSON.stringify(current.digestInputs)) errors.push('Current canonical acceptance footprint mismatch.');

  const resultSet = (entries, expected, field, label, mandatory) => {
    if (!Array.isArray(entries) || !exact(expected, entries.map((entry) => entry[field]))) errors.push(`Acceptance ${label} are missing, duplicated or unexpected.`);
    if (!Array.isArray(entries) || entries.some((entry) => entry.result !== 'PASS' || (mandatory && entry.mandatory !== true) || !retained(entry.evidenceRefs))) errors.push(`Acceptance ${label} require PASS and retained evidence.`);
  };
  resultSet(record.criterionResults, stage.criteriaIds, 'criterionId', 'criteria', true);
  resultSet(record.commonStandardResults, commonStandards, 'standard', 'common standards', false);
  if (record.commonStandardResults?.some((entry) => entry.applicable !== true)) errors.push('All nine common standards must be applicable and PASS.');

  // Gate values are task IDs, not embedded gate objects. Include shared scenario task mappings.
  const tasks = traceability?.tasks;
  const scenarios = traceability?.scenarios;
  if (!Array.isArray(tasks) || !Array.isArray(scenarios) || !Array.isArray(traceability?.requirements) || !traceability.requirements.length || !nonempty(stage.gateTaskId) || traceability?.gates?.[stage.stageId] !== stage.gateTaskId || !strings(stage.prerequisiteTaskIds) || !strings(stage.prerequisiteStages)) {
    errors.push('Acceptance requires canonical stage prerequisites and traceability.');
    return errors;
  }
  const gate = tasks.find((entry) => entry.id === stage.gateTaskId);
  const taskIds = new Set([...stage.prerequisiteTaskIds, stage.gateTaskId, ...tasks.filter((entry) => entry.milestone === stage.stageId).map((entry) => entry.id), ...(gate?.depends ?? [])]);
  if (!gate || gate.milestone !== stage.stageId || [...taskIds].some((id) => tasks.filter((entry) => entry.id === id).length !== 1)) errors.push('Acceptance traceability tasks are missing or duplicated.');
  const selectedTasks = tasks.filter((entry) => taskIds.has(entry.id));
  const requirements = traceability.requirements.filter((entry) => entry.milestones?.includes(stage.stageId) || entry.taskIds?.some((id) => taskIds.has(id)));
  const selectedScenarios = scenarios.filter((entry) => entry.taskIds?.some((id) => taskIds.has(id)) || selectedTasks.some((task) => task.scenarios?.includes(entry.id)) || requirements.some((requirement) => requirement.scenarioIds?.includes(entry.id)));
  const normalize = (id) => typeof id === 'string' ? id.replace(/^T(\d)(?=\.|$)/, 'T0$1') : id;
  const expectedIds = [...new Set([...selectedTasks.flatMap((entry) => [...(entry.scenarios ?? []), ...(entry.T ?? [])]), ...selectedScenarios.flatMap((entry) => [entry.id, ...(entry.T ?? [])]), ...requirements.flatMap((entry) => [...(entry.scenarioIds ?? []), ...(entry.T ?? []), ...(entry.subcases ?? [])])].map(normalize))];
  if (!strings(expectedIds) || selectedTasks.some((task) => !Array.isArray(task.scenarios) || !Array.isArray(task.T)) || expectedIds.some((id) => id.startsWith('SC-') && scenarios.filter((entry) => entry.id === id).length !== 1)) errors.push('Acceptance scenario traceability is incomplete or ambiguous.');
  const scenarioResults = record.scenarioResults;
  if (!Array.isArray(scenarioResults) || !exact(expectedIds, scenarioResults.flatMap((entry) => entry.ids ?? []))) errors.push('Acceptance scenario set is missing, duplicated or unexpected.');
  if (!Array.isArray(scenarioResults) || scenarioResults.some((entry) => !strings(entry.ids) || entry.mandatory !== true || entry.result !== 'PASS' || !retained(entry.evidenceRefs))) errors.push('Acceptance scenarios require mandatory PASS results and retained evidence.');

  const commands = record.commands;
  const requiredCommands = [...acceptanceCommands, ...(stage.stageId === 'M6' ? m6Commands : [])];
  if (!Array.isArray(commands) || !strings(commands.map((entry) => entry.commandId)) || commands.some((entry) => entry.status !== 'PASS' || entry.exitCode !== 0 || !nonempty(entry.outputRef) || !evidenceExists(entry.outputRef)) || requiredCommands.some((id) => commands.filter((entry) => entry.commandId === id).length !== 1)) errors.push('Acceptance commands must all PASS with unique IDs and retained output, including every required command.');
  if (scenarioResults?.some((entry) => !commands?.some((command) => command.commandId === entry.commandRef))) errors.push('Acceptance scenario commandRef must identify a retained PASS command.');

  const coverage = record.coverage;
  const manifest = jsonProof(coverage?.ownedModuleManifestRef);
  const summary = jsonProof(coverage?.evidenceRef);
  const modules = manifest?.inclusion ?? manifest?.ownedModules;
  const reports = summary?.reports;
  const total = summary?.branchesFound;
  const covered = summary?.branchesHit;
  const percent = 100 * covered / total;
  if (coverage?.status !== 'PASS' || summary?.status !== 'PASS' || !Number.isInteger(total) || total <= 0 || !Number.isInteger(covered) || covered < 0 || covered > total || percent < 80 || !Number.isFinite(coverage?.percent) || coverage.percent < 80 || coverage.percent > 100 || !Number.isFinite(summary?.percent) || Math.abs(summary.percent - percent) > 0.01 || Math.abs(coverage.percent - percent) > 0.01 || coverage.totalBranches !== total || coverage.coveredBranches !== covered || (coverage.denominator !== undefined && coverage.denominator !== total)) errors.push('Acceptance coverage needs consistent retained branch evidence of at least 80%.');
  const empty = (value) => Array.isArray(value) && value.length === 0;
  const missing = [coverage?.missingSources, coverage?.missingModules, summary?.missingModules];
  const reportsValid = Array.isArray(reports) && exact(modules, reports.map((entry) => entry.path)) && reports.every((entry) => Number.isInteger(entry.branchesFound) && entry.branchesFound >= 0 && Number.isInteger(entry.branchesHit) && entry.branchesHit >= 0 && entry.branchesHit <= entry.branchesFound) && reports.reduce((sum, entry) => sum + entry.branchesFound, 0) === total && reports.reduce((sum, entry) => sum + entry.branchesHit, 0) === covered;
  if (!reportsValid || !empty(summary?.missingSources) || !empty(summary?.malformed) || missing.some((value) => value !== undefined && !empty(value)) || (summary?.ownedModules !== undefined && !exact(modules, summary.ownedModules))) errors.push('Acceptance coverage cannot omit owned modules or change its denominator.');
  if (!Array.isArray(record.defects) || record.defects.some((entry) => !['P0', 'P1', 'P2', 'P3'].includes(entry.severity) || !['OPEN', 'CLOSED', 'RESOLVED'].includes(entry.status) || (entry.status === 'OPEN' && (['P0', 'P1'].includes(entry.severity) || entry.mandatoryCriterionAffected !== false)))) errors.push('Acceptance cannot contain open P0/P1 or mandatory defects.');

  const implementer = record.submission?.implementerId;
  const review = record.independentReview;
  const integration = record.integrationDecision;
  if (!identity(implementer) || !nonempty(record.submission?.reportRef) || !evidenceExists(record.submission.reportRef)) errors.push('Acceptance requires retained implementer submission evidence.');
  const reviewRefs = retained(review?.evidenceRefs) ? review.evidenceRefs.filter((ref) => {
    const proof = jsonProof(ref);
    return bound(proof) && proof.reviewerId === review.reviewerId && proof.independentFromImplementer === true && proof.reviewedAt === review.reviewedAt;
  }) : [];
  if (review?.decision !== 'PASS' || review.independentFromImplementer !== true || !identity(review.reviewerId) || review.reviewerId === implementer || !reviewRefs.length) errors.push('Acceptance requires independent reviewer JSON evidence bound to all six current digests.');
  const integrationRefs = retained(integration?.evidenceRefs) ? integration.evidenceRefs.filter((ref) => {
    const proof = jsonProof(ref);
    return bound(proof) && proof.integratorId === integration.integratorId && proof.decidedAt === integration.decidedAt && reviewRefs.includes(proof.independentReviewRef);
  }) : [];
  if (integration?.decision !== 'PASS' || !identity(integration.integratorId) || integration.integratorId === review?.reviewerId || !integrationRefs.length) errors.push('Acceptance requires separate integrator JSON evidence bound to all six current digests and the independent review.');
  const dates = [record.submission?.submittedAt, review?.reviewedAt, integration?.decidedAt].map((date) => typeof date === 'string' ? Date.parse(date) : NaN);
  if (dates.some((date) => !Number.isFinite(date)) || dates[0] > dates[1] || dates[1] > dates[2]) errors.push('Acceptance submission, review and integration timestamps must be ordered.');

  const expectedPrerequisites = [...stage.prerequisiteStages.map((id) => `stage:${id}`), ...[...taskIds].filter((id) => id !== stage.gateTaskId).map((id) => `task:${id}`)];
  const prerequisites = record.prerequisites;
  if (!Array.isArray(prerequisites) || !exact(expectedPrerequisites, prerequisites.map((entry) => entry.stageId ? `stage:${entry.stageId}` : `task:${entry.taskId}`)) || prerequisites.some((entry) => (entry.stageId && entry.taskId) || entry.observedStatus !== 'PASS' || !retained(entry.evidenceRefs) || !entry.evidenceRefs.some((ref) => {
    const proof = jsonProof(ref);
    return proof?.status === 'PASS' && (entry.stageId ? proof.stageId === entry.stageId : proof.taskId === entry.taskId);
  }))) errors.push('Every acceptance prerequisite requires matching retained PASS evidence.');
  const carries = record.invalidation?.carriedEvidence;
  const validCarry = (carry) => {
    const old = jsonProof(carry.oldRecordRef);
    const proof = jsonProof(carry.reviewEvidenceRef);
    return old?.status === 'PASS' && nonempty(old.stageId) && strings(carry.unchangedScopes) && nonempty(carry.equivalenceRationale) && identity(carry.reviewerId) && carry.reviewerId !== implementer && bound(proof, old.stageId) && proof.independentFromImplementer === true && proof.reviewerId === carry.reviewerId && proof.oldRecordRef === carry.oldRecordRef && exact(carry.unchangedScopes, proof.unchangedScopes) && proof.equivalenceRationale === carry.equivalenceRationale && retained(proof.evidenceRefs);
  };
  if (!Array.isArray(carries) || carries.some((carry) => !validCarry(carry))) errors.push('Acceptance carry-forward requires independent current-digest equivalence evidence.');
  const currentM3Equivalence = stage.stageId === 'M4' && carries?.some((carry) => {
    const historicalM3 = prerequisites?.some((entry) => entry.stageId === 'M3' && entry.evidenceRefs?.includes(carry.oldRecordRef));
    const oldRecord = jsonProof(carry.oldRecordRef);
    return historicalM3 && oldRecord?.stageId === 'M3' && validCarry(carry);
  });
  if (stage.stageId === 'M4' && (record.invalidation?.currentM3Applicability !== 'PASS' || !prerequisites?.some((entry) => entry.stageId === 'M3') || !currentM3Equivalence)) errors.push('M4 acceptance requires reviewed current M3 applicability/equivalence proof, not historical approval alone.');
  return errors;
}

function run() {
  const root = process.cwd();
  const read = (ref) => JSON.parse(readFileSync(path.join(root, ref), 'utf8'));
  const evidenceExists = (ref) => {
    if (typeof ref !== 'string' || !ref) return false;
    const resolved = path.resolve(root, ref.split('#')[0]);
    return resolved.startsWith(`${root}${path.sep}`) && existsSync(resolved);
  };
  const register = read('openspec/changes/restart-shpitto-video-saas/acceptance-status.json');
  const currentResult = spawnSync(process.execPath, ['scripts/candidate-digests.mjs'], {encoding: 'utf8', windowsHide: true});
  if (currentResult.status !== 0) throw new Error('Current canonical digest capture failed.');
  const current = JSON.parse(currentResult.stdout);
  const checks = [];
  for (const stageId of ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6']) {
    const stage = register.stages.find((entry) => entry.stageId === stageId);
    if (!stage) throw new Error(`Missing stage ${stageId}.`);
    const ref = stage.evidenceRecordRefs?.[0];
    if (!ref || !ref.startsWith(`internal/evidence/acceptance/${stageId}/`) || !ref.endsWith('/record.json')) throw new Error(`Invalid primary record for ${stageId}.`);
    const record = read(ref);
    const developmentStatusMismatch = ['READY_FOR_REVIEW', 'STALE'].includes(record.status) && stage.status === 'IN_PROGRESS';
    if (record.stageId !== stageId || record.candidateId !== stage.candidateId || (record.status !== stage.status && !developmentStatusMismatch)) throw new Error(`Register and record disagree for ${stageId}.`);
    const development = ['M4', 'M5', 'M6'].includes(stageId);
    if (!development && record.status !== 'PASS') throw new Error(`Historical prerequisite ${stageId} is not approved.`);
    if (development) {
      const errors = validateStageProgression({stage, record, current, evidenceExists, readEvidence: read, ...(record.recordKind === 'IMPLEMENTATION_ACCEPTANCE' ? {traceability: read('openspec/changes/restart-shpitto-video-saas/traceability.json')} : {})});
      if (errors.length) throw new Error(`${stageId}: ${errors.join(' ')}`);
    }
    const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', 'internal/restart/check-acceptance-record.py', ref, ...(development ? ['--current'] : [])], {encoding: 'utf8', windowsHide: true});
    if (result.status !== 0) throw new Error(result.stdout || result.stderr || `Record validation failed for ${stageId}.`);
    checks.push({stageId, status: record.status, scope: development ? record.recordKind === 'IMPLEMENTATION_ACCEPTANCE' ? 'current-accepted' : 'current-development' : 'historical-approved', recordRef: ref});
  }
  console.log(JSON.stringify({status: 'PASS', checks, note: 'Validation of IN_PROGRESS development records is not stage approval.'}, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { run(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
