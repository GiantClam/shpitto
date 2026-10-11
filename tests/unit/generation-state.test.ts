import assert from 'node:assert/strict';
import {test} from 'node:test';

import {DomainError} from '../../src/db/contracts.ts';
import {
  canTransitionGenerationTask,
  isTerminalGenerationState,
  transitionGenerationTask,
} from '../../src/modules/generation/state.ts';
import {validateGenerationInputSnapshot} from '../../src/modules/generation/create.ts';

const now = new Date('2026-09-29T08:00:00.000Z');

function errorCode(code: string) {
  return (error: unknown) => error instanceof DomainError && error.code === code;
}

test('generation task states are monotonic and terminal states cannot reopen', () => {
  assert.equal(canTransitionGenerationTask('queued', 'dispatching'), true);
  assert.equal(canTransitionGenerationTask('queued', 'succeeded'), false);
  assert.equal(canTransitionGenerationTask('materializing', 'succeeded'), true);
  assert.equal(isTerminalGenerationState('failed'), true);
  assert.equal(isTerminalGenerationState('running'), false);

  const queued = {status: 'queued' as const, version: 1, failureCode: null, updatedAt: now};
  const dispatching = transitionGenerationTask(queued, 'dispatching', {now});
  assert.deepEqual(dispatching, {status: 'dispatching', version: 2, failureCode: null, updatedAt: now});
  const failed = transitionGenerationTask(dispatching, 'failed', {now, failureCode: 'DISPATCH_UNAVAILABLE'});
  assert.equal(failed.failureCode, 'DISPATCH_UNAVAILABLE');
  assert.equal(failed.version, 3);
  assert.throws(() => transitionGenerationTask(failed, 'queued', {now}), errorCode('CONFLICT'));
  assert.throws(() => transitionGenerationTask(dispatching, 'failed', {now}), errorCode('VALIDATION'));
});

test('accepted input snapshots reject browser/provider URLs and foreign or non-ready assets', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const assetId = '00000000-0000-4000-8000-000000000101';
  assert.deepEqual(validateGenerationInputSnapshot({prompt: '  make a clip  '}, workspaceId), {prompt: '  make a clip  '});
  assert.deepEqual(validateGenerationInputSnapshot({assetId, assetWorkspaceId: workspaceId, assetState: 'ready'}, workspaceId), {assetId, assetWorkspaceId: workspaceId, assetState: 'ready'});
  assert.throws(() => validateGenerationInputSnapshot({prompt: 'x', sourceUrl: 'https://example.test/video.mp4'} as never, workspaceId), errorCode('VALIDATION'));
  assert.throws(() => validateGenerationInputSnapshot({assetId, assetWorkspaceId: '00000000-0000-4000-8000-000000000002', assetState: 'ready'}, workspaceId), errorCode('FORBIDDEN'));
  assert.throws(() => validateGenerationInputSnapshot({assetId, assetWorkspaceId: workspaceId}, workspaceId), errorCode('FORBIDDEN'));
  assert.throws(() => validateGenerationInputSnapshot({}, workspaceId), errorCode('VALIDATION'));
});
