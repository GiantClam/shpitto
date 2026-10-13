import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import test from 'node:test';

import {createFalJwksLoader, getFalJwks} from '../../src/adapters/providers/fal/jwks.ts';
import {DomainError} from '../../src/db/contracts.ts';

const OFFICIAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const MAX_AGE_MS = 86_400_000;
const MAX_BYTES = 65_536;
const now = Date.parse('2026-10-13T00:00:00.000Z');
const key = generateKeyPairSync('ed25519').publicKey.export({format: 'jwk'});
const rotatedKey = generateKeyPairSync('ed25519').publicKey.export({format: 'jwk'});

function keyError(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'INFRASTRUCTURE' && /verification keys/i.test(error.message);
}

test('fal JWKS fetches only the official endpoint without redirects or HTTP caching and returns immutable Ed25519 keys', async () => {
  let calls = 0;
  const load = createFalJwksLoader(async (url, options) => {
    calls += 1;
    assert.equal(String(url), OFFICIAL_JWKS_URL);
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    assert.equal(new Headers(options?.headers).get('accept'), 'application/json');
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({keys: [key]});
  }, () => now);
  const snapshot = await load();
  assert.deepEqual(snapshot.keys, [key]);
  assert.equal(snapshot.fetchedAt.getTime(), now);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.keys));
  assert.ok(Object.isFrozen(snapshot.keys[0]));
  assert.equal(calls, 1);
  assert.deepEqual((await load()).keys, [key]);
  assert.equal(calls, 1);
});

test('fal JWKS cold-cache and refresh requests are singleflight', async () => {
  let clock = now;
  let calls = 0;
  let finish: (response: Response) => void = () => assert.fail('fetch not started');
  const load = createFalJwksLoader(async () => {
    calls += 1;
    return new Promise<Response>((resolve) => { finish = resolve; });
  }, () => clock);
  for (const jwk of [key, rotatedKey]) {
    const pending = Array.from({length: 20}, () => load());
    assert.equal(calls, jwk === key ? 1 : 2);
    finish(Response.json({keys: [jwk]}));
    const snapshots = await Promise.all(pending);
    assert.ok(snapshots.every((snapshot) => snapshot.keys[0].x === jwk.x));
    assert.equal(snapshots[0].fetchedAt.getTime(), clock);
    clock += MAX_AGE_MS;
  }
});

test('fal JWKS accepts the padded base64url Ed25519 x values published by the official endpoint', async () => {
  const load = createFalJwksLoader(async () => Response.json({keys: [{...key, x: `${key.x}=`}]}), () => now);
  assert.deepEqual((await load()).keys, [key]);
});

test('fal process JWKS loader uses native fetch and the current clock without credentials', async (context) => {
  const fetcher = context.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(String(url), OFFICIAL_JWKS_URL);
    assert.equal(new Headers(options?.headers).has('authorization'), false);
    return Response.json({keys: [key]});
  });
  const before = Date.now();
  const snapshot = await getFalJwks();
  assert.ok(snapshot.fetchedAt.getTime() >= before && snapshot.fetchedAt.getTime() <= Date.now());
  assert.deepEqual(snapshot.keys, [key]);
  assert.deepEqual((await getFalJwks()).keys, [key]);
  assert.equal(fetcher.mock.callCount(), 1);
});

test('fal JWKS refreshes at exactly 24 hours, never uses a future cache time, and protects internal timestamps from callers', async () => {
  let clock = now;
  let calls = 0;
  const load = createFalJwksLoader(async () => { calls += 1; return Response.json({keys: [key]}); }, () => clock);
  const first = await load();
  first.fetchedAt.setTime(now + MAX_AGE_MS);
  clock = now + MAX_AGE_MS - 1;
  assert.equal((await load()).fetchedAt.getTime(), now);
  assert.equal(calls, 1);
  clock = now + MAX_AGE_MS;
  assert.equal((await load()).fetchedAt.getTime(), clock);
  assert.equal(calls, 2);
  clock -= 1;
  assert.equal((await load()).fetchedAt.getTime(), clock);
  assert.equal(calls, 3);
});

test('fal JWKS expiry failures reject instead of using stale keys, and a later refresh can recover', async () => {
  let clock = now;
  let calls = 0;
  const load = createFalJwksLoader(async () => {
    calls += 1;
    if (calls === 2) throw new Error('network with sensitive details');
    return Response.json({keys: [calls === 1 ? key : rotatedKey]});
  }, () => clock);
  await load();
  clock += MAX_AGE_MS;
  await assert.rejects(load(), keyError);
  assert.deepEqual((await load()).keys, [rotatedKey]);
  assert.equal(calls, 3);
});

test('fal JWKS failed singleflight is cleared and does not cache failures', async () => {
  let calls = 0;
  const load = createFalJwksLoader(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return Response.json({keys: [key]});
  }, () => now);
  await Promise.all(Array.from({length: 10}, () => assert.rejects(load(), keyError)));
  assert.equal(calls, 1);
  assert.deepEqual((await load()).keys, [key]);
  assert.equal(calls, 2);
});

test('fal JWKS skips malformed and unsupported keys without preventing a valid rotated key from verifying', async () => {
  const unsupported = generateKeyPairSync('ed448').publicKey.export({format: 'jwk'});
  const keys = [null, 'key', {}, unsupported, {...key, crv: 'X25519'}, {...key, use: 'enc'}, {...key, alg: 'RS256'}, {...key, key_ops: ['sign']}, {...key, x: 'invalid'}, {...key, x: Buffer.alloc(31).toString('base64url')}, key];
  const load = createFalJwksLoader(async () => Response.json({keys}), () => now);
  assert.deepEqual((await load()).keys, [key]);
});

test('fal JWKS fails closed for HTTP, JSON, schema, key and declared-size errors without leaking upstream details', async (context) => {
  const cases: ReadonlyArray<readonly [string, () => Response]> = [
    ['HTTP failure', () => new Response('sensitive upstream error', {status: 503})],
    ['redirect', () => new Response(null, {status: 302, headers: {location: 'https://attacker.example/keys'}})],
    ['missing body', () => new Response(null)],
    ['empty response', () => new Response('')],
    ['invalid JSON', () => new Response('{')],
    ['invalid UTF-8', () => new Response(new Uint8Array([0xff]))],
    ['non-object document', () => Response.json([])],
    ['missing keys', () => Response.json({})],
    ['key-ID map instead of array', () => Response.json({keys: {local: key}})],
    ['empty keys', () => Response.json({keys: []})],
    ['no Ed25519 keys', () => Response.json({keys: [{...key, crv: 'X25519'}]})],
    ['malformed Ed25519 key', () => Response.json({keys: [{...key, x: 'invalid'}]})],
    ['oversize content length', () => Response.json({keys: [key]}, {headers: {'content-length': String(MAX_BYTES + 1)}})],
    ['invalid content length', () => Response.json({keys: [key]}, {headers: {'content-length': '-1'}})],
  ];
  for (const [name, response] of cases) {
    await context.test(name, async () => {
      const load = createFalJwksLoader(async () => response(), () => now);
      await assert.rejects(load(), (error) => keyError(error) && error instanceof Error && !/sensitive|attacker/i.test(error.message));
    });
  }
});

test('fal JWKS rejects responses that have already redirected away from the fixed official origin', async () => {
  const response = Response.json({keys: [key]});
  Object.defineProperty(response, 'url', {value: 'https://attacker.example/keys'});
  const load = createFalJwksLoader(async () => response, () => now);
  await assert.rejects(load(), keyError);
});

test('fal JWKS reads bounded streamed bytes even without a trustworthy content length', async () => {
  const body = Buffer.from(JSON.stringify({keys: [key]}));
  const load = createFalJwksLoader(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body.subarray(0, 12));
      controller.enqueue(body.subarray(12));
      controller.close();
    },
  })), () => now);
  assert.deepEqual((await load()).keys, [key]);
  for (const contentLength of [undefined, '1']) {
    let cancelled = false;
    const headers = contentLength ? {'content-length': contentLength} : undefined;
    const tooLarge = createFalJwksLoader(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Buffer.alloc(MAX_BYTES)); controller.enqueue(new Uint8Array([32])); },
      cancel() { cancelled = true; },
    }), {headers}), () => now);
    await assert.rejects(tooLarge(), keyError);
    assert.ok(cancelled);
  }
});

test('fal JWKS accepts at most 64 KiB, including exact-limit responses', async () => {
  const json = JSON.stringify({keys: [key]});
  const load = createFalJwksLoader(async () => new Response(json.padEnd(MAX_BYTES, ' ')), () => now);
  assert.deepEqual((await load()).keys, [key]);
});

test('fal JWKS has a total five-second deadline even when fetch ignores abort, and late results cannot poison the cache', async (context) => {
  context.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const signals: AbortSignal[] = [];
  let finish: (response: Response) => void = () => assert.fail('fetch not started');
  const load = createFalJwksLoader(async (_url, options) => {
    calls += 1;
    if (calls > 1) return Response.json({keys: [rotatedKey]});
    const signal = options?.signal;
    assert.ok(signal);
    signals.push(signal);
    return new Promise<Response>((resolve) => { finish = resolve; });
  }, () => now);
  const pending = load();
  const rejected = assert.rejects(pending, keyError);
  context.mock.timers.tick(4_999);
  assert.equal(signals[0].aborted, false);
  context.mock.timers.tick(1);
  await rejected;
  assert.equal(signals[0].aborted, true);
  assert.deepEqual((await load()).keys, [rotatedKey]);
  finish(Response.json({keys: [key]}));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.deepEqual((await load()).keys, [rotatedKey]);
  assert.equal(calls, 2);
});

test('fal JWKS five-second deadline also covers a stalled response body and cancels its stream', async (context) => {
  context.mock.timers.enable({apis: ['setTimeout']});
  let cancelled = false;
  const signals: AbortSignal[] = [];
  const load = createFalJwksLoader(async (_url, options) => {
    const signal = options?.signal;
    assert.ok(signal);
    signals.push(signal);
    return new Response(new ReadableStream<Uint8Array>({cancel() { cancelled = true; }}));
  }, () => now);
  const rejected = assert.rejects(load(), keyError);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  context.mock.timers.tick(5_000);
  await rejected;
  assert.ok(signals[0].aborted);
  assert.ok(cancelled);
});
