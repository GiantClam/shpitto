import assert from 'node:assert/strict';
import {test} from 'node:test';

import {startIndependentCleanupLoop} from '../../scripts/local-worker.ts';

test('cleanup ticks independently, skips overlap, survives failure, and stops cleanly', async (t) => {
  t.mock.timers.enable({apis: ['setInterval']});
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  let release: () => void = () => {};
  let calls = 0;
  const errors: unknown[] = [];
  const stop = startIndependentCleanupLoop({intervalMs: 5, run: async () => {
    calls += 1;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    if (calls === 2) throw new Error('simulated cleanup failure');
  }, onError: (error) => { errors.push(error); }});
  t.after(stop);
  await flush();
  t.mock.timers.tick(25);
  await flush();
  assert.equal(calls, 1, 'A slow cleanup must not overlap or queue unbounded ticks.');
  release();
  await flush();
  t.mock.timers.tick(5);
  await flush();
  assert.equal(errors.length, 1);
  t.mock.timers.tick(5);
  await flush();
  assert.equal(calls, 3, 'A cleanup error must not stop future independent sweeps.');
  await stop();
  const stoppedAt = calls;
  t.mock.timers.tick(15);
  await flush();
  assert.equal(calls, stoppedAt);
});
