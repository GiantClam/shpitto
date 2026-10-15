import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import type {AppDatabase} from '../../src/db/client.ts';
import {startRecoverySchedule} from '../../src/trigger/sweep-recovery.ts';

function emptyDatabase(onQuery: () => void = () => undefined): AppDatabase {
  const query = {from: () => query, where: () => query, orderBy: () => query, limit: async () => { onQuery(); return []; }};
  return {select: () => query} as unknown as AppDatabase;
}

test('local recovery scheduling repeats the shared sweep and stop prevents subsequent ticks', {timeout: 2_000}, async () => {
  let queries = 0;
  let reports = 0;
  const database = emptyDatabase(() => { queries++; });
  let stop: (() => Promise<void>) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      stop = startRecoverySchedule({db: database, intervalMs: 5, now: () => new Date('2026-10-15T00:00:00Z'),
        onResult: (result) => { assert.deepEqual(result, {scanned: 0, failed: 0}); if (++reports >= 2) resolve(); }, onError: reject});
    });
  } finally { await stop?.(); }
  assert.ok(reports >= 2, 'Both the immediate and a subsequent scheduled tick must execute.');
  const stoppedAt = queries;
  await delay(20);
  assert.equal(queries, stoppedAt);
});

test('local recovery scheduling reports query failures and permits safe cancellation', {timeout: 2_000}, async () => {
  const fault = new Error('controlled-recovery-read-failure');
  const database = emptyDatabase(() => { throw fault; });
  let stop: (() => Promise<void>) | undefined;
  try {
    await new Promise<void>((resolve) => {
      stop = startRecoverySchedule({db: database, intervalMs: 60_000, onError: (error) => { assert.equal(error, fault); resolve(); }});
    });
  } finally { await stop?.(); }
});

test('local recovery scheduling defaults remain stoppable without custom callbacks', async () => {
  const stop = startRecoverySchedule({db: emptyDatabase()});
  await delay(5);
  await stop();
  const failureStop = startRecoverySchedule({db: emptyDatabase(() => { throw new Error('controlled-default-error'); })});
  await delay(5);
  await failureStop();
});
