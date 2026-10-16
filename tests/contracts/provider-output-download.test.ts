import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import test from 'node:test';

import {DomainError} from '../../src/db/contracts.ts';
import {fetchPrivateProviderOutput, MAX_REMOTE_OUTPUT_BYTES} from '../../src/adapters/storage/s3.ts';

const publicHost = [{address: '93.184.216.34', family: 4}];

const video = () => new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': 'video/mp4'}});
const domainCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

for (const [label, url] of [['HTTP', 'http://provider.example/video'], ['username and password', 'https://user:secret@provider.example/video'], ['username only', 'https://user@provider.example/video']]) {
  test(`output origin rejects insecure or credentialed URL: ${label}`, async () => {
    let requests = 0; let resolutions = 0;
    await assert.rejects(fetchPrivateProviderOutput(url, async () => { requests++; return video(); }, async () => { resolutions++; return publicHost; }), domainCode('FORBIDDEN'));
    assert.equal(requests, 0); assert.equal(resolutions, 0);
  });
}

for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '127.0.0.1', '0.0.0.0', '::', '::1', 'fc00::1', 'fdff::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'fe90::1', 'febf::1', '::ffff:7f00:1', '::ffff:a00:1', '0:0:0:0:0:0:0:1',
  '0:0:0:0:0:ffff:c0a8:101', 'FE80:0:0:0:0:0:0:1', 'fec0::1', 'ff02::1', 'ff0e::1', '100::1', '2001:db8::1', '2001:2::1', '2001::1', '2002:a00:1::', '3fff::1', '64:ff9b::a00:1', '::ffff:100.64.0.1', '::ffff:192.0.2.1', '::ffff:224.0.0.1', '::ffff:240.0.0.1']) {
  test(`output DNS blocks private address ${address} before transport`, async () => {
    let requests = 0;
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async () => { requests++; return video(); }, async (_hostname, options) => {
      assert.deepEqual(options, {all: true, verbatim: true});
      return [{address, family: address.includes(':') ? 6 : 4}];
    }), domainCode('FORBIDDEN'));
    assert.equal(requests, 0);
  });
}

test('private IPv6 URL literals are canonicalized and rejected before DNS even if resolver would report public', async () => {
  for (const literal of ['[::1]', '[0:0:0:0:0:0:0:1]', '[fe90::1]', '[::ffff:127.0.0.1]', '[::ffff:a00:1]']) {
    let requests = 0; let resolutions = 0;
    await assert.rejects(fetchPrivateProviderOutput(`https://${literal}/video`, async () => { requests++; return video(); }, async () => { resolutions++; return publicHost; }), domainCode('FORBIDDEN'));
    assert.equal(requests, 0); assert.equal(resolutions, 0);
  }
});

test('public IPv6 canonical forms and mapped public IPv4 retain access', async () => {
  for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888', '2606:4700:4700:0:0:0:0:1111', '::ffff:93.184.216.34', '0:0:0:0:0:ffff:5db8:d822', '172.15.255.255', '172.32.0.1', '192.169.1.1']) {
    const result = await fetchPrivateProviderOutput('https://provider.example/video', async () => video(), async () => [{address, family: address.includes(':') ? 6 : 4}]);
    assert.deepEqual(result.bytes, new Uint8Array([1, 2, 3]));
  }
});

test('malformed DNS addresses fail closed before transport', async () => {
  for (const address of ['', 'not-an-IP', '::gg', '999.1.1.1']) {
    let requests = 0;
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async () => { requests++; return video(); }, async () => [{address, family: 6}]), domainCode('FORBIDDEN'));
    assert.equal(requests, 0);
  }
});

test('output DNS rejects empty and mixed public/private answers in either order', async () => {
  for (const records of [[], [...publicHost, {address: '::1', family: 6}], [{address: '10.0.0.1', family: 4}, ...publicHost]]) {
    let requests = 0;
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async () => { requests++; return video(); }, async () => records), domainCode('FORBIDDEN'));
    assert.equal(requests, 0);
  }
});

test('malformed URL and failed DNS never start transport or expose URL secrets', async () => {
  let requests = 0;
  for (const [url, code] of [['not a URL', 'VALIDATION'], ['https://provider.example/video?secret=fixture-private', 'CONFLICT']] as const) {
    await assert.rejects(fetchPrivateProviderOutput(url, async () => { requests++; return video(); }, async () => { throw new Error('fixture DNS failure'); }), (error: unknown) => {
      assert.ok(error instanceof DomainError); assert.equal(error.code, code);
      assert.doesNotMatch(error.publicMessage, /fixture-private|secret/); return true;
    });
  }
  assert.equal(requests, 0);
});

test('output permits public IPv4/IPv6 answers and normalizes supported MIME', async () => {
  for (const mime of ['video/mp4', 'video/webm', 'video/quicktime', 'VIDEO/MP4; charset=binary']) {
    const result = await fetchPrivateProviderOutput('https://provider.example/video', async (_url, init) => {
      assert.equal(init?.redirect, 'manual'); assert.equal(init?.method, 'GET');
      return new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': mime}});
    }, async () => [...publicHost, {address: '2606:4700:4700::1111', family: 6}]);
    assert.equal(result.mime, mime.toLowerCase().split(';')[0]);
    assert.deepEqual(result.bytes, new Uint8Array([1, 2, 3]));
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  }
});

test('every redirect revalidates DNS, including the same hostname', async () => {
  let requests = 0; let resolutions = 0;
  await assert.rejects(fetchPrivateProviderOutput('https://provider.example/start', async () => {
    requests++;
    return new Response(null, {status: 302, headers: {location: '/next'}});
  }, async () => ++resolutions < 3 ? publicHost : [{address: '169.254.169.254', family: 4}]), domainCode('FORBIDDEN'));
  assert.equal(requests, 2); assert.equal(resolutions, 3);
});

test('public redirects cannot reach private DNS/IP, HTTP, or URL credentials', async () => {
  for (const location of ['https://private.example/video', 'https://127.0.0.1/video', 'https://[::1]/video', 'http://provider.example/video', 'https://user:secret@provider.example/video']) {
    let requests = 0;
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/start', async () => {
      requests++; return new Response(null, {status: 307, headers: {location}});
    }, async (hostname) => hostname === 'provider.example' ? publicHost : [{address: '::1', family: 6}]), domainCode('FORBIDDEN'));
    assert.equal(requests, 1);
  }
});

test('three redirects are permitted but a fourth or missing location exhausts the chain', async () => {
  for (const redirects of [3, 4]) {
    let requests = 0; let resolutions = 0;
    const operation = fetchPrivateProviderOutput('https://provider.example/start', async () => ++requests <= redirects
      ? new Response(null, {status: 302, headers: {location: `/hop-${requests}`}}) : video(), async () => { resolutions++; return publicHost; });
    if (redirects === 3) assert.equal((await operation).finalUrl, 'https://provider.example/hop-3');
    else await assert.rejects(operation, domainCode('CONFLICT'));
    assert.equal(requests, 4); assert.equal(resolutions, 4);
  }
  await assert.rejects(fetchPrivateProviderOutput('https://provider.example/start', async () => new Response(null, {status: 302}), async () => publicHost), domainCode('CONFLICT'));
});

test('unsupported MIME and unavailable responses cancel without consuming media', async () => {
  for (const [status, mime, code] of [[200, 'text/html', 'VALIDATION'], [200, 'application/octet-stream', 'VALIDATION'], [200, '', 'VALIDATION'], [503, 'video/mp4', 'CONFLICT']] as const) {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({cancel() { cancelled = true; }}), {status, headers: {'content-type': mime}});
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async () => response, async () => publicHost), domainCode(code));
    assert.equal(cancelled, true);
  }
});

test('declared sizes reject malformed lengths and 250 MiB plus one before reading', async () => {
  assert.equal(MAX_REMOTE_OUTPUT_BYTES, 250 * 1024 * 1024);
  for (const length of [String(MAX_REMOTE_OUTPUT_BYTES + 1), '-1', '1.5', 'not-a-size']) {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({cancel() { cancelled = true; }}), {headers: {'content-type': 'video/mp4', 'content-length': length}});
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async () => response, async () => publicHost), domainCode('VALIDATION'));
    assert.equal(cancelled, true);
  }
  // The declaration is a cap, not a substitute for the streamed byte count.
  for (const length of [MAX_REMOTE_OUTPUT_BYTES - 1, MAX_REMOTE_OUTPUT_BYTES]) {
    const result = await fetchPrivateProviderOutput('https://provider.example/video', async () => new Response(new Uint8Array([1]), {headers: {'content-type': 'video/mp4', 'content-length': String(length)}}), async () => publicHost);
    assert.equal(result.bytes.length, 1);
  }
});

test('streamed overflow cannot hide behind absent or small content-length; aborts and cancels', async () => {
  // Reuse one 1 MiB chunk: exercise actual counting without allocating a 251 MiB fixture/result.
  const chunk = new Uint8Array(1024 * 1024);
  for (const declared of [undefined, '1']) {
    let cancelled = false; let signal: AbortSignal | null | undefined; let emitted = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { emitted++; controller.enqueue(emitted <= 250 ? chunk : new Uint8Array([1])); },
      cancel() { cancelled = true; },
    }), {headers: {'content-type': 'video/mp4', ...(declared ? {'content-length': declared} : {})}});
    await assert.rejects(fetchPrivateProviderOutput('https://provider.example/video', async (_url, init) => { signal = init?.signal; return response; }, async () => publicHost), domainCode('VALIDATION'));
    assert.ok(emitted >= 251); assert.equal(signal?.aborted, true); assert.equal(cancelled, true);
  }
});

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
