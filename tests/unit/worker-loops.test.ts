import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:net';
import {startWorkerLoops, startWorkerLoopsAfterBind} from '../../src/modules/generation/worker-loops.ts';
import {assertScheduledCleanupReceipt} from '../../scripts/probe-fal-runtime-verification.ts';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('worker readiness requires independent recovery success, not just a fresh dispatcher', async () => {
  let now = 0;
  const ticks: Array<() => void> = [];
  let failSweep = true;
  let errors = 0;
  const loops = startWorkerLoops({now: () => new Date(now), onError: () => { errors++; },
    schedule: (tick) => { ticks.push(tick); return () => undefined; },
    loops: [{name: 'dispatch', intervalMs: 1000, staleMs: 120_000, run: async () => undefined},
      {name: 'sweep', intervalMs: 10_000, staleMs: 180_000, run: async () => { if (failSweep) throw new Error('controlled-failure'); }}]});
  assert.equal(loops.snapshot().ready, false);
  await flush();
  assert.equal(loops.snapshot().ready, false);
  assert.equal(errors, 1);
  failSweep = false;
  ticks[1]!();
  await flush();
  assert.equal(loops.snapshot().ready, true);
  now = 180_001;
  ticks[0]!();
  await flush();
  assert.equal(loops.snapshot().ready, false, 'A live dispatcher cannot hide a stalled independent recovery loop.');
  await loops.stop();
});

test('worker loops skip overlapping cycles and drain outstanding work on shutdown', async () => {
  const ticks: Array<() => void> = [];
  let cancelled = 0;
  let runs = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const loops = startWorkerLoops({schedule: (tick) => { ticks.push(tick); return () => { cancelled++; }; },
    loops: [{name: 'cleanup', intervalMs: 60_000, staleMs: 180_000, run: async () => { runs++; await pending; }}]});
  await flush();
  ticks[0]!();
  assert.equal(runs, 1);
  let stopped = false;
  const stop = loops.stop().then(() => { stopped = true; });
  await flush();
  assert.equal(stopped, false);
  release();
  await stop;
  ticks[0]!();
  await loops.stop();
  assert.equal(runs, 1);
  assert.equal(cancelled, 1);
});

test('worker loops contain default error reporting and reject unsafe recovery cadence', async () => {
  assert.throws(() => startWorkerLoops({loops: [{name: 'sweep', intervalMs: 60_001, staleMs: 180_000, run: async () => undefined}]}), /interval/);
  const loops = startWorkerLoops({loops: [{name: 'inbox', intervalMs: 1000, staleMs: 120_000, run: async () => { throw new Error('fixture'); }}]});
  await flush();
  assert.equal(loops.snapshot().errors, 1);
  await loops.stop();
});

test('actual health snapshot preserves scheduled cleanup receipt compatibility', async () => {
  const loops = startWorkerLoops({now: () => new Date('2026-10-15T12:00:01Z'),
    loops: [{name: 'cleanup', intervalMs: 60_000, staleMs: 180_000, run: async () => undefined}]});
  await flush();
  try {
    const health = loops.snapshot();
    assertScheduledCleanupReceipt({...health, httpStatus: 200, seededAt: '2026-10-15T12:00:00Z'});
    assert.equal(health.lastCleanupAt, health.loops.cleanup?.lastSuccessAt);
  } finally { await loops.stop(); }
});

test('failed TCP bind starts no dispatch or maintenance operation', async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const address = occupied.address();
  assert.ok(address && typeof address !== 'string');
  const worker = createServer();
  let calls = 0;
  try {
    await assert.rejects(() => startWorkerLoopsAfterBind(() => new Promise<void>((resolve, reject) => {
      worker.once('error', reject); worker.listen(address.port, '127.0.0.1', resolve);
    }), {loops: ['dispatch', 'sweep', 'inbox', 'cleanup'].map((name) => ({name: name as 'dispatch' | 'sweep' | 'inbox' | 'cleanup', intervalMs: 1000, staleMs: 120_000, run: async () => { calls++; }}))}), /EADDRINUSE/);
    assert.equal(calls, 0);
  } finally {
    worker.close();
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});
