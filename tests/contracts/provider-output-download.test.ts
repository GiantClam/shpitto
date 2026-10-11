import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import test from 'node:test';

import {DomainError} from '../../src/db/contracts.ts';
import {fetchPrivateProviderOutput} from '../../src/adapters/storage/s3.ts';

const publicHost = [{address: '93.184.216.34', family: 4}];

function assertTimeout(error: unknown): void {
  assert.ok(error instanceof DomainError, 'A stalled download must fail with a domain error.');
  assert.equal(error.code, 'CONFLICT');
  assert.match(error.publicMessage, /timed out/i);
}

test('provider output download deadline includes DNS and prevents a late request', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let resolveDns!: (records: typeof publicHost) => void;
  const dns = new Promise<typeof publicHost>((resolve) => { resolveDns = resolve; });
  let calls = 0;
  let failure: unknown;
  const operation = fetchPrivateProviderOutput('https://provider.example/video?secret=not-public', async () => {
    calls += 1;
    return new Response(new Uint8Array([1]), {headers: {'content-type': 'video/mp4'}});
  }, () => dns).catch((error: unknown) => { failure = error; });
  try {
    t.mock.timers.tick(120_000);
    await setImmediate();
    assertTimeout(failure);
    assert.doesNotMatch(String(failure), /secret|not-public/);
  } finally {
    resolveDns(publicHost);
    await operation;
  }
  assert.equal(calls, 0, 'DNS finishing after the deadline must not start transport.');
});

test('provider output request deadline aborts the pending HTTP request', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let signal: AbortSignal | undefined;
  const operation = fetchPrivateProviderOutput('https://provider.example/video', (_url, init) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>(() => undefined);
  }, async () => publicHost);
  const failure = operation.catch((error: unknown) => error);
  await setImmediate();
  t.mock.timers.tick(120_000);
  await setImmediate();
  assertTimeout(await failure);
  assert.equal(signal?.aborted, true);
});

test('provider output stream deadline cancels the unfinished response body', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; },
  }), {
    headers: {'content-type': 'video/mp4'},
  });
  const operation = fetchPrivateProviderOutput('https://provider.example/video', async () => response, async () => publicHost);
  const failure = operation.catch((error: unknown) => error);
  await setImmediate();
  t.mock.timers.tick(120_000);
  await setImmediate();
  assertTimeout(await failure);
  assert.equal(cancelled, true);
});

test('provider output redirects share the original download deadline', async (t) => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: new Date('2026-10-10T00:00:00Z')});
  let firstResponse!: (response: Response) => void;
  let calls = 0;
  let secondSignal: AbortSignal | undefined;
  const operation = fetchPrivateProviderOutput('https://provider.example/start', (_url, init) => {
    calls += 1;
    if (calls === 1) return new Promise<Response>((resolve) => { firstResponse = resolve; });
    secondSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => undefined);
  }, async () => publicHost);
  const failure = operation.catch((error: unknown) => error);
  await setImmediate();
  t.mock.timers.tick(90_000);
  firstResponse(new Response(null, {status: 302, headers: {location: '/final'}}));
  await setImmediate();
  assert.equal(calls, 2);
  t.mock.timers.tick(30_000);
  await setImmediate();
  assertTimeout(await failure);
  assert.equal(secondSignal?.aborted, true);
});

test('provider output abort listener errors are normalized as a download timeout', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const operation = fetchPrivateProviderOutput('https://provider.example/video', (_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted.', 'AbortError')), {once: true});
    });
  }, async () => publicHost);
  const failure = operation.catch((error: unknown) => error);
  await setImmediate();
  t.mock.timers.tick(120_000);
  await setImmediate();
  assertTimeout(await failure);
});
