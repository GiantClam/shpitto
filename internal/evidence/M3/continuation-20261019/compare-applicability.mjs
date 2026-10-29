import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessBrowserEvidence, collectOwnedModules, isRetainedM3Artifact} from '../../../../scripts/m3-evidence.mjs';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const ref = (file) => path.relative(root, file).replaceAll('\\', '/');
const read = (file) => JSON.parse(readFileSync(path.resolve(root, file), 'utf8'));
const write = (name, value) => writeFileSync(path.join(packet, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const attempts = path.join(packet, 'automated', 'verification-attempts');
const attemptNames = readdirSync(attempts);
assert.equal(attemptNames.length, 1, 'Ambiguous verification attempt.');
const attempt = path.join(attempts, attemptNames[0]);
const currentRef = ref(path.join(attempt, 'candidate-before', 'candidate.json'));
const footprintRef = ref(path.join(attempt, 'candidate-before', 'digest-footprints.json'));
const current = read(currentRef);
const footprints = read(footprintRef);
const freezeRef = 'internal/evidence/m7/local-current-20261019/continuation/baseline/candidate.json';
const freeze = read(freezeRef);
const digestKeys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];
assert.ok(digestKeys.every((key) => current[key] === freeze[key]), 'Candidate does not match the declared freeze.');
const aggregate = (rows) => sha(rows.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n'));
function compare(before, after, include = () => true) {
  const left = new Map(before.filter((row) => include(row.path)).map((row) => [row.path, row]));
  const right = new Map(after.filter((row) => include(row.path)).map((row) => [row.path, row]));
  const unchanged = [];
  const changed = [];
  for (const file of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const old = left.get(file);
    const now = right.get(file);
    if (old && now && old.sha256 === now.sha256 && old.bytes === now.bytes) unchanged.push(file);
    else changed.push({path: file, change: !old ? 'ADDED' : !now ? 'REMOVED' : 'MODIFIED', before: old ?? null, after: now ?? null});
  }
  return {status: changed.length ? 'CHANGED' : 'BYTE_IDENTICAL', unchangedCount: unchanged.length, changedCount: changed.length, unchanged, changed};
}
const m3Ref = 'internal/evidence/acceptance/M3/working-tree-20261001-current/record.json';
const m4Ref = 'internal/evidence/acceptance/M4/m4-self-hosted-20261017/record.json';
const m3 = read(m3Ref);
const m4 = read(m4Ref);
const m3FootprintRef = path.posix.join(path.posix.dirname(m3.candidate.endDigestsRef), 'digest-footprints.json');
const m4FootprintRef = 'internal/evidence/acceptance/M4/m4-self-hosted-20261017/digest-footprints.json';
const historical = [{id: 'M3', recordRef: m3Ref, record: m3, footprintRef: m3FootprintRef},
  {id: 'M4', recordRef: m4Ref, record: m4, footprintRef: m4FootprintRef}];
const owned = new Set(collectOwnedModules(root));
const comparison = historical.map((entry) => {
  const old = read(entry.footprintRef);
  const integrity = Object.fromEntries(Object.entries(old).map(([group, rows]) => [group,
    {expected: entry.record.candidate[`${group}Sha256`], actual: aggregate(rows), matches: aggregate(rows) === entry.record.candidate[`${group}Sha256`]}]));
  assert.ok(Object.values(integrity).every((item) => item.matches), `${entry.id} footprint integrity mismatch.`);
  const groups = Object.fromEntries(Object.keys(old).map((group) => [group, compare(old[group], footprints[group])]));
  const source = old.sourceTree;
  const scopes = {
    runtimeSource: compare(source, footprints.sourceTree, (file) => file.startsWith('src/')),
    providerAdapters: compare(source, footprints.sourceTree, (file) => file.startsWith('src/adapters/providers/')),
    storageAdapters: compare(source, footprints.sourceTree, (file) => file.startsWith('src/adapters/storage/')),
    generationDomain: compare(source, footprints.sourceTree, (file) => file.startsWith('src/modules/generation/')),
    providerContracts: compare([...source, ...old.contract], [...footprints.sourceTree, ...footprints.contract], (file) => file.startsWith('internal/contracts/providers/')),
    deployment: compare(source, footprints.sourceTree, (file) => file.startsWith('deploy/') || file.startsWith('.github/')),
    providerWorkerScripts: compare(source, footprints.sourceTree, (file) => /^scripts\/provider-worker[^/]*\.(?:mjs|ts)$/.test(file)),
    currentM3OwnedModules: compare(source, footprints.sourceTree, (file) => owned.has(file)),
    schema: compare(old.schema, footprints.schema),
  };
  return {
    stageId: entry.id, recordRef: entry.recordRef, footprintRef: entry.footprintRef,
    historicalStatus: entry.record.status, historicalSourceTreeSha256: entry.record.candidate.sourceTreeSha256,
    historicalReviewDecision: entry.record.independentReview?.decision,
    historicalIntegrationDecision: entry.record.integrationDecision?.decision,
    exactCandidateDigests: Object.fromEntries(digestKeys.map((key) => [key,
      {historical: entry.record.candidate[key], current: current[key], matches: entry.record.candidate[key] === current[key]}])),
    historicalFootprintIntegrity: integrity, groups, scopes,
    currentApprovalInherited: false,
  };
});
write('footprint-comparison.json', {createdAt: new Date().toISOString(), currentRef, footprintRef, freezeRef,
  declaredFreezeMatchesAllSixDigests: true, comparison});

const browsers = [
  'internal/evidence/M3/browser-walkthrough-20261001.json',
  ...readdirSync(path.join(root, 'internal/evidence/M3')).filter((name) => name.startsWith('browser-journeys-20261019-'))
    .map((name) => `internal/evidence/M3/${name}/walkthrough.json`).filter((file) => existsSync(path.join(root, file))),
];
write('browser-applicability.json', {
  createdAt: new Date().toISOString(), currentRef, sourceTreeSha256: current.sourceTreeSha256,
  currentBrowserAcceptance: 'NOT_RUN', evidenceCarriedForward: false,
  records: browsers.map((file) => {
    const evidence = read(file);
    const cleanupRef = path.posix.join(path.posix.dirname(file), 'cleanup.json');
    const cleanup = existsSync(path.join(root, cleanupRef)) ? read(cleanupRef) : null;
    const structure = assessBrowserEvidence(evidence, (artifact) => isRetainedM3Artifact(root, artifact));
    const sourceMatches = evidence.candidateSha256 === current.sourceTreeSha256;
    const controls = evidence.journeys?.find((journey) => journey.id === 'owner-controls');
    const submitted = ['remove-member', 'transfer-owner'].map((action) => ({action,
      valid: (controls?.submittedActions ?? []).some((row) => row.action === action && row.result === 'PASS'
        && row.requestMethod === 'POST' && Number(row.responseStatus) === 200
        && typeof row.path === 'string' && row.path.startsWith('/api/')
        && typeof row.targetUserId === 'string' && row.targetUserId.length > 0
        && !Number.isNaN(Date.parse(row.submittedAt)))}));
    return {recordRef: file, candidateSha256: evidence.candidateSha256, capturedAt: evidence.capturedAt,
      exactSourceMatches: sourceMatches, structure, submittedOwnerControls: submitted,
      cleanupRef: cleanup ? cleanupRef : null, cleanup,
      applicability: sourceMatches ? 'REQUIRES_REVIEW' : 'STALE_REJECTED',
      acceptedForCurrentCandidate: false};
  }),
  requiredNextAction: 'Capture real desktop 1440x900/mobile 390x844 and keyboard evidence for all eleven journeys against the exact candidate, including actual remove-member/transfer-owner submissions and verified local cleanup. Independent product/verifier review and separate integration remain required.',
});
console.log(JSON.stringify({status: 'COMPARISON_RETAINED', currentSource: current.sourceTreeSha256,
  stages: comparison.map((stage) => ({stageId: stage.stageId,
    runtimeSource: stage.scopes.runtimeSource.status, runtimeChanged: stage.scopes.runtimeSource.changedCount,
    providerAdapters: stage.scopes.providerAdapters.status, schema: stage.scopes.schema.status,
    changedSourcePaths: stage.groups.sourceTree.changed.map((row) => row.path)}))}, null, 2));
