import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const digestKeys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];

/** Historical approval never replaces current development freshness. */
export function validateStageProgression({stage, record, current, evidenceExists = () => false, readEvidence = () => null}) {
  const errors = [];
  if (record.stageId !== stage.stageId || record.candidateId !== stage.candidateId) errors.push('Stage candidate identity mismatch.');
  if (record.status !== stage.status) errors.push('Stage status mismatch.');
  if (record.recordKind !== 'DEVELOPMENT_VERIFICATION' || !['IN_PROGRESS', 'BLOCKED', 'STALE'].includes(record.status)) errors.push('This development validator cannot promote a milestone gate.');
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
    if (record.stageId !== stageId || record.candidateId !== stage.candidateId || record.status !== stage.status) throw new Error(`Register and record disagree for ${stageId}.`);
    const development = ['M4', 'M5', 'M6'].includes(stageId);
    if (!development && record.status !== 'PASS') throw new Error(`Historical prerequisite ${stageId} is not approved.`);
    if (development) {
      const errors = validateStageProgression({stage, record, current, evidenceExists, readEvidence: read});
      if (errors.length) throw new Error(`${stageId}: ${errors.join(' ')}`);
    }
    const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', 'internal/restart/check-acceptance-record.py', ref, ...(development ? ['--current'] : [])], {encoding: 'utf8', windowsHide: true});
    if (result.status !== 0) throw new Error(result.stdout || result.stderr || `Record validation failed for ${stageId}.`);
    checks.push({stageId, status: record.status, scope: development ? 'current-development' : 'historical-approved', recordRef: ref});
  }
  console.log(JSON.stringify({status: 'PASS', checks, note: 'Validation of IN_PROGRESS development records is not stage approval.'}, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { run(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
