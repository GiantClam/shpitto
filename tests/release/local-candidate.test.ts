import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidateId = process.env.SHPITTO_CANDIDATE_ID ?? 'local-candidate-20261007-completion';
const evidenceRoot = path.join(root, 'internal', 'evidence', 'm8');
const manifestPath = path.join(evidenceRoot, 'artifact-manifest', candidateId, 'manifest.json');
const resultPath = path.join(evidenceRoot, 'local-demo', candidateId, 'result.json');

test('local candidate evidence is explicit and remains non-production', () => {
  assert.ok(existsSync(manifestPath), `missing candidate manifest: ${manifestPath}`);
  assert.ok(existsSync(resultPath), `missing fresh-install evidence: ${resultPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {status: string; candidateId: string; zip: {path: string; sha256: string}; releaseGate: string; productionDeployment: string};
  const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
    status: string; profile: string; candidateId: string; productionDeployment: string; realAccounts: string;
    archive: {sha256: string}; checks: Record<string, string>; logs: Record<string, string>;
    journey: {finalBalance: {available: string; reserved: string; consumed: string}; ledger: object; privateDownload: {sha256: string; bytes: number; anonymousStatus: number}; restore: {archiveSha256: string; status: string; backupMs: number; restoreMs: number; checks: Record<string, string>}; providerAttempts: Array<{attempts: number}>; servicesStoppedAfterRun: boolean};
    fixtureSha256: string;
  };
  assert.equal(manifest.status, 'IN_PROGRESS');
  assert.equal(manifest.candidateId, candidateId);
  assert.ok(manifest.zip.sha256);
  assert.equal(manifest.releaseGate, 'NOT_RUN');
  assert.equal(manifest.productionDeployment, 'NOT_RUN');
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateId, candidateId);
  assert.equal(result.productionDeployment, 'NOT_RUN');
  assert.equal(result.realAccounts, 'NOT_PROVIDED');
  assert.equal(result.profile, 'fresh-candidate-local-runtime');
  assert.equal(createHash('sha256').update(readFileSync(path.join(root, manifest.zip.path))).digest('hex'), manifest.zip.sha256);
  assert.equal(result.archive.sha256, manifest.zip.sha256, 'Runtime evidence must belong to the current frozen archive.');
  for (const check of ['archiveDigest', 'archiveExtractionAndFileDigests', 'requiredRuntimePaths', 'customerCommandClosure', 'frozenOfflineInstall', 'productionBuild', 'exportedBuyerChecks', 'freshMigrationsAndDemoSeed', 'httpLoginAndDashboard', 'httpCancellationAndRefund', 'workerSuccessAndDeadlineFailureRefund', 'authenticatedPrivateDownload', 'timedDatabaseAndAssetRestore', 'restartPersistenceAndExactlyOnceCredits']) {
    assert.equal(result.checks[check], 'PASS', `Missing executed candidate check: ${check}`);
  }
  for (const name of ['install', 'build', 'migrate', 'seed', 'web-initial', 'worker-initial', 'web-restarted', 'worker-restarted', 'journey']) {
    assert.ok(result.logs[name]!.startsWith(`internal/evidence/m8/local-demo/${candidateId}/`), `Candidate evidence must not reuse historical logs: ${name}`);
    assert.ok(existsSync(path.join(root, result.logs[name]!)), `Missing current candidate log: ${name}`);
  }
  assert.deepEqual(result.journey.finalBalance, {available: '80', reserved: '0', consumed: '20'});
  assert.deepEqual(result.journey.ledger, result.journey.finalBalance);
  assert.equal(result.journey.privateDownload.sha256, result.fixtureSha256);
  assert.ok(result.journey.privateDownload.bytes > 0);
  assert.equal(result.journey.privateDownload.anonymousStatus, 401);
  assert.equal(result.journey.providerAttempts.length, 2);
  assert.ok(result.journey.providerAttempts.every((attempt) => attempt.attempts === 1));
  assert.equal(result.journey.servicesStoppedAfterRun, true);
  assert.equal(result.journey.restore.status, 'PASS');
  assert.equal(result.journey.restore.archiveSha256, manifest.zip.sha256);
  assert.ok(result.journey.restore.backupMs > 0 && result.journey.restore.restoreMs > 0);
  for (const check of ['backupCatalog', 'liveMutationDetected', 'restoredDomainRows', 'restoredPrivateMediaBytes']) assert.equal(result.journey.restore.checks[check], 'PASS');
});
