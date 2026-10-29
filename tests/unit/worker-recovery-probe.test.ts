import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {
  parseRecoveryProbeArgs, assertRecoveryProbeStage, assertRecoveryProbeScope, recoveryProbeReport,
  recoveryFixtureTimes, recoveryTaskHash, type RecoveryProbeScope,
} from '../../scripts/probe-worker-recovery-acceptance.ts';

const runId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const binding: RecoveryProbeScope = {
  profile: 'acceptance', nodeEnv: 'production', generationDriver: 'provider', storageDriver: 's3', taskRuntime: 'self_hosted',
  databaseUrl: 'postgres://fixture:local-only@postgres.railway.internal:5432/fixture',
  projectId: 'isolated-project', expectedProjectId: 'isolated-project', workerKey: 'provider.sweep-1',
  workerState: 'paused', workerWorkspaceId: null, allowCreate: false, modelKeys: ['replicate-wan22-t2v'], monitorWorkspaceId: workspaceId,
};

test('import is inert and CLI accepts only the four explicit phases and a UUID', () => {
  for (const phase of ['prepare', 'seed-overdue', 'inspect', 'verify']) {
    assert.deepEqual(parseRecoveryProbeArgs(['--run-id', runId, '--phase', phase]), {runId, phase});
  }
  for (const args of [[], ['--run-id', 'invalid', '--phase', 'prepare'], ['--run-id', runId, '--phase', 'submit'],
    ['--run-id', runId, '--phase', 'inspect', '--phase', 'verify'], ['--run-id', runId, '--phase'],
    ['--run-id', runId, '--phase', 'prepare', '--confirm-paid']]) assert.throws(() => parseRecoveryProbeArgs(args));
});

test('stage fence forbids retrying partial prepare/seed and verification before complete seeding', () => {
  assert.doesNotThrow(() => assertRecoveryProbeStage('prepare', undefined));
  assert.doesNotThrow(() => assertRecoveryProbeStage('seed-overdue', 'prepared'));
  for (const stage of ['preparing', 'seeding', 'seeded', 'verified']) {
    assert.throws(() => assertRecoveryProbeStage('prepare', stage));
    assert.throws(() => assertRecoveryProbeStage('seed-overdue', stage));
  }
  for (const stage of ['preparing', 'prepared', 'seeding']) assert.throws(() => assertRecoveryProbeStage('verify', stage));
  for (const stage of ['seeded', 'verified']) assert.doesNotThrow(() => assertRecoveryProbeStage('verify', stage));
});

test('scope fails closed on nonacceptance, public database, wrong project, creates and active seeding', () => {
  assert.doesNotThrow(() => assertRecoveryProbeScope(binding, 'prepare'));
  const own = {projectId: binding.projectId, workerKey: binding.workerKey, workspaceId};
  assert.doesNotThrow(() => assertRecoveryProbeScope(binding, 'seed-overdue', own));
  for (const bad of [{profile: 'production'}, {nodeEnv: 'test'}, {generationDriver: 'mock'}, {storageDriver: 'local'},
    {taskRuntime: 'trigger'}, {expectedProjectId: 'different'}, {allowCreate: true}, {workerKey: '.invalid'},
    {databaseUrl: 'postgres://fixture:local-only@localhost:55432/fixture'}, {modelKeys: []},
    {databaseUrl: `${binding.databaseUrl}?host=other`}, {workerState: 'active', workerWorkspaceId: workspaceId}]) {
    assert.throws(() => assertRecoveryProbeScope({...binding, ...bad}, 'seed-overdue', own));
  }
  assert.throws(() => assertRecoveryProbeScope(binding, 'inspect', {...own, projectId: 'other'}));
  assert.throws(() => assertRecoveryProbeScope(binding, 'inspect', {...own, workerKey: 'other'}));
});

test('active inspect/verify require exactly this fresh workspace and the monitor binding', () => {
  const own = {projectId: binding.projectId, workerKey: binding.workerKey, workspaceId};
  for (const phase of ['inspect', 'verify'] as const) {
    assert.doesNotThrow(() => assertRecoveryProbeScope({...binding, workerState: 'active', workerWorkspaceId: workspaceId}, phase, own));
    assert.throws(() => assertRecoveryProbeScope({...binding, workerState: 'active', workerWorkspaceId: runId}, phase, own));
    assert.throws(() => assertRecoveryProbeScope({...binding, monitorWorkspaceId: runId}, phase, own));
  }
});

test('fixture clocks explicitly age queued work twenty minutes and unknown work ninety-five minutes', () => {
  const times = recoveryFixtureTimes(new Date('2026-10-15T12:00:00.000Z'));
  assert.equal(times.queued.toISOString(), '2026-10-15T11:40:00.000Z');
  assert.equal(times.unknown.toISOString(), '2026-10-15T10:25:00.000Z');
  assert.throws(() => recoveryFixtureTimes(new Date(NaN)));
});

test('task evidence hash locks snapshots and timestamps but tolerates legitimate terminalization', () => {
  const row = {id: workspaceId, workspaceId, createdAt: new Date('2026-10-15T10:00:00Z'), inputSnapshot: {prompt: 'fixture'},
    submissionStartedAt: null, quotedCredits: 10n, status: 'queued', version: 1};
  assert.equal(recoveryTaskHash(row), recoveryTaskHash({...row, status: 'failed', failureCode: 'generation.deadline_exceeded', version: 2}));
  for (const change of [{createdAt: new Date('2026-10-15T11:00:00Z')}, {inputSnapshot: {prompt: 'changed'}},
    {submissionStartedAt: new Date('2026-10-15T10:00:01Z')}, {quotedCredits: 11n}]) {
    assert.notEqual(recoveryTaskHash(row), recoveryTaskHash({...row, ...change}));
  }
});

test('report is a closed redacted count/ID projection and never claims real upstream recovery', () => {
  const report = recoveryProbeReport({runId, workspaceId, phase: 'inspect', stage: 'seeding', taskIds: [workspaceId, 'secret'],
    taskCount: 1, failedCount: 0, releasedCount: 0, providerKey: 'secret', workerKey: 'secret', nonce: 'secret', payload: {raw: 'secret'}});
  assert.deepEqual(report.taskIds, [workspaceId]);
  assert.equal(report.proof, 'fake-clock/domain-fault fixture; no upstream outcome proof');
  assert.deepEqual(report.fixtureClockOffsetsMinutes, {queued: -20, unknown: -95});
  assert.doesNotMatch(JSON.stringify(report), /secret|nonce|providerKey|workerKey|payload/);
  assert.equal(recoveryProbeReport({runId: 'secret', taskCount: -1}).runId, null);
});

test('driver contains irreversible local fences and no provider transport or direct task/balance writes', async () => {
  const source = await readFile(new URL('../../scripts/probe-worker-recovery-acceptance.ts', import.meta.url), 'utf8');
  assert.match(source, /open\(statePath, 'wx'/);
  assert.match(source, /open\(`\$\{statePath\}\.seed`, 'wx'/);
  assert.match(source, /import\.meta\.url === pathToFileURL/);
  assert.doesNotMatch(source, /adapters\/providers|fetch\(|(?:db|tx)\.update\(|\b(?:update|delete from)\s+app\./i);
});
