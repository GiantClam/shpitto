import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertAuthorizedVideoMetadata, assertScheduledCleanupReceipt} from '../../scripts/probe-fal-runtime-verification.ts';

test('authorized video inspection checks measured average FPS and duration without confusing estimated base time rate', () => {
  const metadata = {streams: [{width: 1280, height: 720, nb_frames: '81', r_frame_rate: '48000/1001', avg_frame_rate: '1769472/110681'}], format: {duration: '5.067000'}};
  assert.doesNotThrow(() => assertAuthorizedVideoMetadata(metadata));
  for (const patch of [{width: 1920}, {height: 1080}, {nb_frames: '161'}, {avg_frame_rate: '15/1'}]) {
    assert.throws(() => assertAuthorizedVideoMetadata({...metadata, streams: [{...metadata.streams[0], ...patch}]}));
  }
  for (const duration of ['NaN', '10', '0']) assert.throws(() => assertAuthorizedVideoMetadata({...metadata, format: {duration}}));
  assert.throws(() => assertAuthorizedVideoMetadata({...metadata, streams: []}));
});

test('scheduled cleanup receipt rejects stale observations and unhealthy status', () => {
  const receipt = {httpStatus: 200, seededAt: '2026-10-13T09:47:00.000Z', lastCleanupAt: '2026-10-13T09:49:03.790Z', errors: 0};
  assert.doesNotThrow(() => assertScheduledCleanupReceipt(receipt));
  for (const patch of [{httpStatus: 503}, {errors: 1}, {lastCleanupAt: '2026-10-13T09:46:00.000Z'}, {lastCleanupAt: undefined}, {seededAt: 'invalid'}]) assert.throws(() => assertScheduledCleanupReceipt({...receipt, ...patch}));
});
