import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  isRecoveryHeartbeatStale, monitorRecoveryHeartbeatOnce,
  type RecoveryHeartbeatPort, type RecoveryHeartbeatScope,
} from '../../src/modules/operations/recovery-heartbeat.ts';

const start = new Date('2026-10-15T00:00:00.000Z');
const scope: RecoveryHeartbeatScope = {
  workspaceId: '00000000-0000-4000-8000-000000000001', workerKey: 'acceptance-worker-1', expectedAt: start,
};
const claim = {status: 'claimed' as const, incidentId: '00000000-0000-4000-8000-000000000002',
  token: '00000000-0000-4000-8000-000000000003', payload: {
    incidentId: '00000000-0000-4000-8000-000000000002', workspaceId: scope.workspaceId, workerKey: scope.workerKey,
    expectedAt: start.toISOString(), observedAt: '2026-10-15T00:03:01.000Z', lastSweepAt: null, ageSeconds: 181,
    code: 'sweep_heartbeat_missing' as const,
    action: 'Restore the assigned worker/database; drain overdue tasks before dispatch. Never reset submission fences.' as const,
  }};

test('freshness uses strictly more than 180 seconds, including a missing first heartbeat', () => {
  assert.equal(isRecoveryHeartbeatStale(null, start, new Date('2026-10-15T00:03:00.000Z')), false);
  assert.equal(isRecoveryHeartbeatStale(null, start, new Date('2026-10-15T00:03:00.001Z')), true);
  assert.equal(isRecoveryHeartbeatStale(new Date('2026-10-15T00:02:00Z'), start, new Date('2026-10-15T00:04:00Z')), false);
  assert.equal(isRecoveryHeartbeatStale(null, start, new Date('2026-10-14T23:59:59Z')), false);
});

test('independent monitor delivers only the bounded actionable allowlist with stable idempotency', async () => {
  let completed = false;
  const port: RecoveryHeartbeatPort = {claim: async () => claim, complete: async (_scope, received, delivered) => {
    assert.deepEqual(received, claim); completed = delivered; return true;
  }};
  const result = await monitorRecoveryHeartbeatOnce(port, scope, async (payload, options) => {
    assert.deepEqual(Object.keys(payload).sort(), ['action', 'ageSeconds', 'code', 'expectedAt', 'incidentId', 'lastSweepAt', 'observedAt', 'workerKey', 'workspaceId']);
    assert.equal(payload.workspaceId, scope.workspaceId);
    assert.equal(payload.workerKey, scope.workerKey);
    assert.equal(payload.observedAt, '2026-10-15T00:03:01.000Z');
    assert.equal(payload.lastSweepAt, null);
    assert.equal(payload.ageSeconds, 181);
    assert.equal(payload.code, 'sweep_heartbeat_missing');
    assert.equal(payload.action, 'Restore the assigned worker/database; drain overdue tasks before dispatch. Never reset submission fences.');
    assert.doesNotMatch(JSON.stringify(payload), /https?:|secret|token|password|stack/i);
    assert.ok(JSON.stringify(payload).length < 1024);
    assert.equal(options.idempotencyKey, `recovery-heartbeat:${claim.incidentId}`);
  });
  assert.equal(completed, true);
  assert.deepEqual(result, {status: 'delivered', incidentId: claim.incidentId});
});

test('delivery failure is retryable and never acknowledged as delivered or leaked', async () => {
  const port: RecoveryHeartbeatPort = {claim: async () => claim, complete: async (_scope, _claim, delivered) => {
    assert.equal(delivered, false); return true;
  }};
  assert.deepEqual(await monitorRecoveryHeartbeatOnce(port, scope, async () => { throw new Error('https://secret.invalid/token'); }),
    {status: 'retry', incidentId: claim.incidentId});
});

test('late external completion reports superseded when the durable fence rejects it', async () => {
  const port: RecoveryHeartbeatPort = {claim: async () => claim, complete: async () => false};
  assert.equal((await monitorRecoveryHeartbeatOnce(port, scope, async () => undefined)).status, 'superseded');
});

test('healthy, leased and delivered observations never invoke external delivery', async () => {
  for (const status of ['healthy', 'waiting', 'already_delivered'] as const) {
    const port: RecoveryHeartbeatPort = {claim: async () => ({status}), complete: async () => assert.fail('No claim.')};
    assert.deepEqual(await monitorRecoveryHeartbeatOnce(port, scope, async () => assert.fail('No delivery.')), {status});
  }
});

test('invalid or unbounded identity and missing expected start fail before database or delivery access', async () => {
  const port: RecoveryHeartbeatPort = {claim: async () => assert.fail('Invalid scope.'), complete: async () => false};
  for (const bad of [{workspaceId: 'not-a-workspace'}, {workerKey: 'https://secret.invalid'}, {workerKey: 'x'.repeat(129)}, {workerKey: '.worker'},
    {expectedAt: undefined}, {expectedAt: new Date(NaN)}]) {
    await assert.rejects(monitorRecoveryHeartbeatOnce(port, {...scope, ...bad} as RecoveryHeartbeatScope, async () => assert.fail('No delivery.')),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'VALIDATION');
  }
});

test('worker identity accepts the receiver slug contract up to 128 characters', async () => {
  const port: RecoveryHeartbeatPort = {claim: async () => ({status: 'healthy'}), complete: async () => false};
  for (const workerKey of ['sweep.instance-1', 'x'.repeat(128)]) {
    assert.deepEqual(await monitorRecoveryHeartbeatOnce(port, {...scope, workerKey}, async () => assert.fail('Healthy.')), {status: 'healthy'});
  }
});
