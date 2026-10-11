import assert from 'node:assert/strict';
import {test} from 'node:test';

import {materializeOutput} from '../../src/modules/assets/ingest.ts';
import {validateInputImageBytes} from '../../src/modules/assets/validate-input.ts';
import {probePrivateMedia} from '../../src/modules/assets/media-probe.ts';
import {createOutboxHeartbeatController} from '../../src/modules/generation/outbox.ts';
import {isSubmissionTimedOut} from '../../src/modules/generation/lifecycle.ts';
import {defaultMockScript, observeMock, submitMock} from '../../src/modules/generation/mock.ts';
import {validateGenerationInputSnapshot} from '../../src/modules/generation/create.ts';
import {DomainError} from '../../src/db/contracts.ts';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const assetId = '00000000-0000-4000-8000-000000000002';

function domainCode(error: unknown, code: DomainError['code']): boolean {
  return error instanceof DomainError && error.code === code;
}

async function rejectsCode(action: () => unknown | Promise<unknown>, code: DomainError['code']): Promise<void> {
  await assert.rejects(Promise.resolve().then(action), (error: unknown) => domainCode(error, code));
}

test('generation input snapshots reject unsafe and ambiguous shapes', async () => {
  await rejectsCode(() => validateGenerationInputSnapshot(null as never, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot([] as never, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({sourceUrl: 'https://example.test/video.mp4'} as never, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({assetId: 'bad', prompt: 'ok'}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({assetId, assetWorkspaceId: workspaceId, assetState: 'ready'}, 'other'), 'FORBIDDEN');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 12} as never, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: '   '}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 'bad\u0000text'}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({options: []} as never, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({options: Object.fromEntries(Array.from({length: 33}, (_, index) => [`k${index}`, true]))}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 'ok', options: {'': true}}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 'ok', options: {'sourceUrl': 'x'}}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 'ok', options: {value: null} as never}, workspaceId), 'VALIDATION');
  await rejectsCode(() => validateGenerationInputSnapshot({prompt: 'ok', options: {value: Number.NaN}}, workspaceId), 'VALIDATION');
  const valid = validateGenerationInputSnapshot({assetId, assetWorkspaceId: workspaceId, assetState: 'ready', prompt: 'ok', options: {fps: 24, muted: false}}, workspaceId);
  assert.equal(Object.isFrozen(valid), true);
  assert.deepEqual(valid.options, {fps: 24, muted: false});
});

test('mock provider covers delayed, failed and successful observations', () => {
  const submission = submitMock('client-reference');
  assert.equal(defaultMockScript().outcome, 'success');
  assert.equal(observeMock(submission, {outcome: 'delay', delayPolls: 2}, 0).status, 'running');
  assert.equal(observeMock(submission, {outcome: 'delay', delayPolls: 2}, 2).status, 'succeeded');
  assert.equal(observeMock(submission, {outcome: 'failure'}, 0).failureCode, 'mock.provider_failed');
  assert.equal(observeMock(submission, {outcome: 'failure', failureCode: 'fixture.failed'}, 0).failureCode, 'fixture.failed');
  assert.match(observeMock(submission, defaultMockScript(), 0).outputObjectKey ?? '', /^mock\/[a-f0-9]{64}\.mp4$/);
});

test('asset media boundaries fail before any database write', async () => {
  await rejectsCode(() => validateInputImageBytes(new Uint8Array(), 'image/png'), 'VALIDATION');
  await rejectsCode(() => validateInputImageBytes(new Uint8Array([1, 2, 3]), 'image/gif'), 'VALIDATION');
  await rejectsCode(() => probePrivateMedia('missing-root', 'missing.mp4'), 'VALIDATION');
  await rejectsCode(() => materializeOutput({} as never, {actorUserId: 'user', workspaceId, taskId: assetId, root: 'missing-root', bytes: new Uint8Array(), mime: 'video/mp4'}), 'VALIDATION');
  await rejectsCode(() => materializeOutput({} as never, {actorUserId: 'user', workspaceId, taskId: assetId, root: 'missing-root', bytes: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), mime: 'video/mp4'}), 'VALIDATION');
  await rejectsCode(() => materializeOutput({} as never, {actorUserId: 'user', workspaceId, taskId: assetId, root: 'missing-root', bytes: new Uint8Array([0, 0, 0, 0]), mime: 'video/webm'}), 'VALIDATION');
  await rejectsCode(() => materializeOutput({} as never, {actorUserId: 'user', workspaceId, taskId: assetId, root: 'missing-root', bytes: new Uint8Array([0, 0, 0, 0]), mime: 'image/png'}), 'VALIDATION');
});

test('lifecycle timeouts use the exact boundary and reject invalid clocks', () => {
  const started = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(isSubmissionTimedOut(started, new Date(started.getTime() + 29_999)), false);
  assert.equal(isSubmissionTimedOut(started, new Date(started.getTime() + 30_000)), true);
  assert.throws(() => isSubmissionTimedOut(new Date(Number.NaN), started), (error: unknown) => domainCode(error, 'VALIDATION'));
  assert.throws(() => isSubmissionTimedOut(started, new Date(Number.NaN)), (error: unknown) => domainCode(error, 'VALIDATION'));
});

test('heartbeat serializes renewal and fences a lost lease', async () => {
  let tick: (() => void) | undefined;
  let renewals = 0;
  const timer = {unref: () => undefined} as unknown as ReturnType<typeof setInterval>;
  const controller = createOutboxHeartbeatController(
    async () => {
      renewals += 1;
      return renewals < 2;
    },
    {intervalMs: 1, setInterval: ((callback: () => void) => { tick = callback; return timer; }) as unknown as typeof setInterval, clearInterval: () => undefined},
  );
  await controller.renew();
  assert.equal(controller.hasLostLease(), false);
  await assert.rejects(controller.renew(), /no longer owns this lease/);
  assert.equal(controller.hasLostLease(), true);
  tick?.();
  await controller.stop();
  await controller.stop();
});
