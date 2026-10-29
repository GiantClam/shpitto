import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createOutboxHeartbeatController} from '../../src/modules/generation/outbox.ts';

type TimerCallback = () => void;

function fakeTimer() {
  let callback: TimerCallback | undefined;
  let cancelled = false;
  const set = ((_handler: TimerCallback) => {
    callback = _handler;
    return {unref: () => undefined} as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  const clear = (() => { cancelled = true; }) as typeof clearInterval;
  return {
    fire: () => { if (!cancelled) callback?.(); },
    isCancelled: () => cancelled,
    set,
    clear,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return {promise, resolve};
}

test('outbox heartbeat serializes renewals, skips timer backlog, and drains on stop', async () => {
  const timer = fakeTimer();
  const first = deferred<boolean>();
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const controller = createOutboxHeartbeatController(async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (calls === 1) await first.promise;
    active -= 1;
    return true;
  }, {setInterval: timer.set, clearInterval: timer.clear, intervalMs: 10});

  timer.fire();
  timer.fire();
  timer.fire();
  await Promise.resolve();
  assert.equal(calls, 1);
  const stopping = controller.stop();
  assert.equal(timer.isCancelled(), true);
  first.resolve(true);
  await stopping;
  assert.equal(maxActive, 1);
  assert.equal(calls, 1);
  assert.equal(controller.hasLostLease(), false);
});

test('outbox heartbeat records lease loss and rejects later explicit renewals', async () => {
  const timer = fakeTimer();
  let calls = 0;
  const controller = createOutboxHeartbeatController(async () => {
    calls += 1;
    return false;
  }, {setInterval: timer.set, clearInterval: timer.clear});

  timer.fire();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.hasLostLease(), true);
  await assert.rejects(controller.renew(), /no longer owns this lease/);
  await controller.stop();
  assert.equal(calls, 1);
});
