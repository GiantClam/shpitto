import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessBrowserEvidence, isRetainedM3Artifact} from '../../../../../scripts/m3-evidence.mjs';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const ref = (file) => path.relative(root, file).replaceAll('\\', '/');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const resultPath = path.join(packet, 'current-evidence-assessment.json');
assert.equal(existsSync(resultPath), false, 'Preserve completed evidence assessments.');
const freezeRef = 'internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json';
const freeze = read(path.join(root, freezeRef));
const automatedRef = ref(path.join(packet, 'automated/record.json'));
const automated = read(path.join(root, automatedRef));
const launch = read(path.join(packet, 'browser-launch-result.json'));
assert.equal(launch.browserResult.exitCode, 0);
assert.equal(launch.localMailServiceStopped, true);
const walkthroughRef = `${launch.evidenceRef}/walkthrough.json`;
const walkthrough = read(path.join(root, walkthroughRef));
const cleanupRef = `${launch.evidenceRef}/cleanup.json`;
const cleanup = read(path.join(root, cleanupRef));
const browser = assessBrowserEvidence(walkthrough, (file) => isRetainedM3Artifact(root, file));
assert.equal(browser.passed, true);
assert.equal(walkthrough.candidateSha256, freeze.sourceTreeSha256);
assert.equal(cleanup.servicesStopped, true);
assert.equal(cleanup.databaseDropped, true);
assert.equal(cleanup.cleanupError, null);
assert.equal(walkthrough.manualVisualApproval, false);
const owner = walkthrough.journeys.find((journey) => journey.id === 'owner-controls');
const ownerActions = ['remove-member', 'transfer-owner'].map((action) => ({action,
  valid: owner.submittedActions.some((row) => row.action === action && row.result === 'PASS'
    && row.requestMethod === 'POST' && row.responseStatus === 200 && row.path.startsWith('/api/')
    && typeof row.targetUserId === 'string' && row.targetUserId.length > 0
    && !Number.isNaN(Date.parse(row.submittedAt)))}));
assert.ok(ownerActions.every((action) => action.valid));
const keys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];
assert.equal(automated.candidate.stableAcrossVerification, true);
assert.ok(keys.every((key) => automated.candidate[key] === freeze[key]));
assert.ok(automated.commands.every((command) => command.status === 'PASS'));
const fresh = spawnSync(process.execPath, ['scripts/candidate-digests.mjs', path.join(packet, 'candidate-after-browser')],
  {cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024});
assert.equal(fresh.status, 0, fresh.stderr);
const after = JSON.parse(fresh.stdout);
assert.ok(keys.every((key) => after[key] === freeze[key]), 'Final current source no longer matches r2.');
const screenshots = readdirSync(path.join(root, launch.evidenceRef)).filter((name) => name.endsWith('.png')).sort().map((name) => {
  const file = path.join(root, launch.evidenceRef, name);
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return {ref: ref(file), bytes: statSync(file).size, sha256: hash(file), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
});
assert.ok(screenshots.some((row) => row.ref.endsWith('desktop-text-mode.png') && row.width === 1440));
assert.ok(screenshots.some((row) => row.ref.endsWith('mobile-text-mode.png') && row.width === 390));
const result = {
  createdAt: new Date().toISOString(), status: 'LOCAL_EVIDENCE_COMPLETE_REVIEW_PENDING',
  freezeRef, candidate: freeze, automatedRef, automatedGeneratedStatus: automated.status,
  automatedCommandCount: automated.commands.length, automatedCommandsPassed: true,
  automatedCoverage: automated.coverage,
  automatedBrowserTimingLimitation: 'The automated record was emitted before the new walkthrough. Its unresolved UI rows remain unmodified; this supplement retains actual later UI evidence on the same unchanged candidate.',
  walkthroughRef, cleanupRef, browserStructure: browser, journeyCount: walkthrough.journeys.length,
  uiCheckCount: walkthrough.uiReview.checks.length, ownerActions, screenshots,
  realUiExecution: true, manualVisualApproval: false, browserErrors: walkthrough.browserErrors,
  blockedExternalRequests: walkthrough.blockedExternalRequests,
  servicesStopped: cleanup.servicesStopped, databaseDropped: cleanup.databaseDropped,
  mailServiceStopped: launch.localMailServiceStopped,
  sourceStableAcrossAutomatedAndBrowserEvidence: true,
  finalCandidateRef: ref(path.join(packet, 'candidate-after-browser/candidate.json')),
  paidOrCloudCalls: false, shippedFilesModifiedByVerifier: false,
  independentReview: {decision: 'NOT_RUN', reviewerId: null},
  integrationDecision: {decision: 'NOT_RUN', integratorId: null},
  nextStep: 'Independent M3 product/verifier review must inspect this exact-candidate evidence supplement and the original automated record, then a separate integrator decides applicability. M4 carry-forward remains the explicit scoped recommendation only.',
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: result.status, source: freeze.sourceTreeSha256,
  automatedCommands: result.automatedCommandCount, coverage: automated.coverage.percent,
  browserJourneys: result.journeyCount, uiChecks: result.uiCheckCount, screenshots: screenshots.length,
  sourceStable: true, cleanup, review: 'NOT_RUN'}));
