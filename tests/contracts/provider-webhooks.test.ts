import assert from 'node:assert/strict';
import {createHash, createHmac, generateKeyPairSync, sign} from 'node:crypto';
import test from 'node:test';

import {getProviderModel} from '../../src/config/provider-models.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';
import {confirmReplicateAccountBinding} from '../../src/adapters/providers/replicate/account-binding.ts';
import {verifyFalWebhook} from '../../src/adapters/providers/fal/webhook.ts';
import {evaluateIntegrationHealth} from '../../src/modules/operations/integration-health.ts';
import {redactRecoveryTelemetry} from '../../src/modules/operations/telemetry.ts';
import {fetchPrivateProviderOutput} from '../../src/adapters/storage/s3.ts';

const now = new Date('2026-10-04T00:00:00.000Z');

function ref(provider: 'replicate' | 'fal', requestId: string) {
  const modelKey = provider === 'replicate' ? 'replicate-wan22-t2v' : 'fal-wan22-t2v';
  return {provider, modelKey, requestId, catalog: getProviderModel(modelKey)} as const;
}

test('Replicate raw-body HMAC authenticates the confirmed account and exact request with explicit route correlation', async () => {
  const secret = `whsec_${Buffer.from('local-replicate-secret').toString('base64')}`;
  const nonce = '5b432c7c-78c0-42a8-a10b-645843bf2001';
  const binding = await confirmReplicateAccountBinding({transport: {async request(request) {return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'acct_local'} : {key: secret}};}}, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:acct_local', now});
  const body = new TextEncoder().encode(JSON.stringify({id: 'pred_123', status: 'processing'}));
  const eventId = 'wh_123';
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${eventId}.${timestamp}.${new TextDecoder().decode(body)}`).digest('base64');
  const verified = verifyReplicateWebhook(body, new Headers({'webhook-id': eventId, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}`}), ref('replicate', 'pred_123'), {secret, binding, expectedAttemptNonce: nonce, now});
  assert.equal(verified.observation.status, 'running');
  assert.equal(verified.attemptNonce, nonce);
  assert.equal(verified.accountId, 'user:acct_local');
  assert.throws(() => verifyReplicateWebhook(body, new Headers({'webhook-id': eventId, 'webhook-timestamp': String(timestamp - 301), 'webhook-signature': `v1,${signature}`}), ref('replicate', 'pred_123'), {secret, binding, expectedAttemptNonce: nonce, now}), /stale/i);
});

test('fal ED25519 verification rejects altered raw bytes and accepts the signed digest', () => {
  const keys = generateKeyPairSync('ed25519');
  const body = new TextEncoder().encode(JSON.stringify({request_id: 'fal_123', status: 'IN_PROGRESS', account_id: 'acct_fal', metadata: {attempt_nonce: 'nonce-fal'}}));
  const eventId = 'fal_evt_1';
  const timestamp = Math.floor(now.getTime() / 1000);
  const digest = createHash('sha256').update(body).digest('hex');
  const signature = sign(null, Buffer.from(`${eventId}.${timestamp}.${digest}`), keys.privateKey).toString('base64');
  const verified = verifyFalWebhook(body, new Headers({'x-fal-webhook-id': eventId, 'x-fal-webhook-timestamp': String(timestamp), 'x-fal-webhook-signature': signature}), ref('fal', 'fal_123'), {publicKeyPem: keys.publicKey.export({type: 'spki', format: 'pem'}).toString(), expectedAccountId: 'acct_fal', expectedAttemptNonce: 'nonce-fal', now});
  assert.equal(verified.observation.status, 'running');
  const jwk = keys.publicKey.export({format: 'jwk'});
  assert.throws(() => verifyFalWebhook(body, new Headers({'x-fal-webhook-id': eventId, 'x-fal-webhook-timestamp': String(timestamp), 'x-fal-webhook-signature': signature, 'x-fal-key-id': 'local'}), ref('fal', 'fal_123'), {jwks: {keys: [jwk]}, jwksFetchedAt: now, expectedAccountId: 'acct_fal', expectedAttemptNonce: 'nonce-fal', now}), /signature|modern/i);
  assert.throws(() => verifyFalWebhook(new TextEncoder().encode(`${new TextDecoder().decode(body)} `), new Headers({'x-fal-webhook-id': eventId, 'x-fal-webhook-timestamp': String(timestamp), 'x-fal-webhook-signature': signature}), ref('fal', 'fal_123'), {publicKeyPem: keys.publicKey.export({type: 'spki', format: 'pem'}).toString(), now}), /signature/i);
});

test('fal modern webhook headers bind request ID, user ID, timestamp, and raw body', () => {
  const keys = generateKeyPairSync('ed25519');
  const body = new TextEncoder().encode(JSON.stringify({request_id: 'fal_modern_123', status: 'COMPLETED', metadata: {attempt_nonce: 'nonce-modern'}}));
  const requestId = 'fal_modern_evt';
  const userId = 'acct-modern';
  const timestamp = Math.floor(now.getTime() / 1000);
  const digest = createHash('sha256').update(body).digest('hex');
  const canonical = `${requestId}\n${userId}\n${timestamp}\n${digest}`;
  const signature = sign(null, Buffer.from(canonical), keys.privateKey).toString('hex');
  const headers = new Headers({
    'X-Fal-Webhook-Request-Id': requestId,
    'X-Fal-Webhook-User-Id': userId,
    'X-Fal-Webhook-Timestamp': String(timestamp),
    'X-Fal-Webhook-Signature': signature,
  });
  const verified = verifyFalWebhook(body, headers, ref('fal', 'fal_modern_123'), {publicKeyPem: keys.publicKey.export({type: 'spki', format: 'pem'}).toString(), expectedAccountId: userId, expectedAttemptNonce: 'nonce-modern', now});
  assert.equal(verified.accountId, userId);
  assert.equal(verified.eventId, requestId);
  assert.equal(verified.observation.status, 'completed');
});

function modernFalFixture(overrides: Record<string, unknown> = {}, userId = 'acct_fal', timestamp = String(Math.floor(now.getTime() / 1000))) {
  const keys = generateKeyPairSync('ed25519');
  const body = Buffer.from(JSON.stringify({request_id: 'fal_123', status: 'COMPLETED', metadata: {attempt_nonce: 'nonce-fal'}, ...overrides}));
  const canonical = `fal_123\n${userId}\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`;
  const headers = new Headers({
    'x-fal-webhook-request-id': 'fal_123',
    'x-fal-webhook-user-id': userId,
    'x-fal-webhook-timestamp': timestamp,
    'x-fal-webhook-signature': sign(null, Buffer.from(canonical), keys.privateKey).toString('hex'),
  });
  const jwk = keys.publicKey.export({format: 'jwk'});
  const publicKeyPem = keys.publicKey.export({type: 'spki', format: 'pem'}).toString();
  const options = {jwks: {keys: [jwk]}, jwksFetchedAt: now, expectedAccountId: 'acct_fal', expectedAttemptNonce: 'nonce-fal', now};
  return {body, headers, jwk, publicKeyPem, options};
}

test('fal modern JWKS uses the official keys array without a key-ID header and tries rotated Ed25519 keys', () => {
  const fixture = modernFalFixture();
  const wrongKey = generateKeyPairSync('ed25519').publicKey.export({format: 'jwk'});
  const unsupportedKey = generateKeyPairSync('ed448').publicKey.export({format: 'jwk'});
  const keys = [unsupportedKey, {kty: 'OKP', crv: 'Ed25519', x: 'invalid'}, wrongKey, fixture.jwk];
  const options = {...fixture.options, jwks: {keys}};
  const verified = verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), options);
  assert.equal(verified.observation.status, 'completed');
  assert.equal(verified.accountId, 'acct_fal');
  fixture.headers.set('x-fal-key-id', 'not-a-selection-hint');
  assert.equal(verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), options).eventId, 'fal_123');
});

test('fal modern account identity comes only from the signed user header, not body account fields', () => {
  const fixture = modernFalFixture({account_id: 'body-account', user_id: 'body-user'});
  for (const options of [fixture.options, {...fixture.options, publicKeyPem: fixture.publicKeyPem}]) {
    const verified = verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), options);
    assert.equal(verified.accountId, 'acct_fal');
    const unpinned = verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...options, expectedAccountId: undefined});
    assert.equal(unpinned.accountId, 'acct_fal');
  }
});

test('fal body account identity cannot authorize a different signed user', () => {
  const fixture = modernFalFixture({account_id: 'acct_fal', user_id: 'acct_fal'}, 'other-signed-user');
  for (const options of [fixture.options, {...fixture.options, publicKeyPem: fixture.publicKeyPem}]) {
    assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), options), /account identity/i);
  }
});

test('fal modern signatures verify with the padded Ed25519 keys served by official JWKS', () => {
  const fixture = modernFalFixture();
  const jwks = {keys: [{...fixture.jwk, x: `${fixture.jwk.x}=`}]};
  assert.equal(verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, jwks}).accountId, 'acct_fal');
});

test('fal authentication fails closed for missing configuration, non-fal references, invalid identities and malformed bounded bodies', () => {
  const fixture = modernFalFixture();
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {now}), /not configured/i);
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('replicate', 'fal_123'), fixture.options), /not fal/i);
  for (const body of [Buffer.alloc(0), Buffer.alloc(1_000_001), Buffer.from('{'), Buffer.from('[]'), Buffer.from('null'), Buffer.from([0xff])]) {
    assert.throws(() => verifyFalWebhook(body, fixture.headers, ref('fal', 'fal_123'), fixture.options), /body/i);
  }
  const invalidIdentity = modernFalFixture({request_id: '../other-request'});
  assert.throws(() => verifyFalWebhook(invalidIdentity.body, invalidIdentity.headers, ref('fal', 'fal_123'), invalidIdentity.options), /request identity/i);
});

test('fal JWKS verification fails closed for untrusted keys and expired, future, missing or invalid cache times', () => {
  const fixture = modernFalFixture();
  const wrongKey = generateKeyPairSync('ed25519').publicKey.export({format: 'jwk'});
  for (const jwks of [{keys: []}, {keys: [wrongKey]}, {keys: [{...fixture.jwk, crv: 'X25519'}]}]) {
    assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, jwks}), /signature|keys/i);
  }
  for (const jwksFetchedAt of [undefined, new Date(NaN), new Date(now.getTime() + 1), new Date(now.getTime() - 86_400_000)]) {
    assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, jwksFetchedAt}), /signature|keys/i);
  }
  assert.equal(verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, jwksFetchedAt: new Date(now.getTime() - 86_399_999)}).accountId, 'acct_fal');
});

test('fal modern PEM compatibility is explicit, Ed25519-only, and does not need a JWKS snapshot', () => {
  const fixture = modernFalFixture();
  const options = {...fixture.options, publicKeyPem: fixture.publicKeyPem, jwks: undefined, jwksFetchedAt: undefined};
  assert.equal(verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), options).accountId, 'acct_fal');
  const wrongPem = generateKeyPairSync('ed25519').publicKey.export({type: 'spki', format: 'pem'}).toString();
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, publicKeyPem: wrongPem}), /signature/i);
  const unsupportedPem = generateKeyPairSync('ed448').publicKey.export({type: 'spki', format: 'pem'}).toString();
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...options, publicKeyPem: unsupportedPem}), /signature/i);
});

test('fal modern canonical signing preserves the exact timestamp text and enforces the five-minute window', () => {
  const seconds = Math.floor(now.getTime() / 1000);
  const padded = modernFalFixture({}, 'acct_fal', `0${seconds}`);
  assert.equal(verifyFalWebhook(padded.body, padded.headers, ref('fal', 'fal_123'), {...padded.options, publicKeyPem: padded.publicKeyPem}).accountId, 'acct_fal');
  for (const delta of [-300, 300]) {
    const fixture = modernFalFixture({}, 'acct_fal', String(seconds + delta));
    assert.equal(verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), fixture.options).accountId, 'acct_fal');
  }
  for (const timestamp of [String(seconds - 301), String(seconds + 301), `${seconds}.0`, `${seconds}e0`, `+${seconds}`, 'NaN']) {
    const fixture = modernFalFixture({}, 'acct_fal', timestamp);
    assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, publicKeyPem: fixture.publicKeyPem}), /timestamp/i);
  }
  const fixture = modernFalFixture();
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, publicKeyPem: fixture.publicKeyPem, now: new Date(NaN)}), /timestamp/i);
});

test('fal modern protocol requires its four headers and a strict 64-byte hexadecimal signature', () => {
  const fixture = modernFalFixture();
  const options = {...fixture.options, publicKeyPem: fixture.publicKeyPem};
  for (const name of ['x-fal-webhook-request-id', 'x-fal-webhook-user-id', 'x-fal-webhook-timestamp', 'x-fal-webhook-signature']) {
    const headers = new Headers(fixture.headers);
    headers.delete(name);
    headers.set('x-fal-webhook-id', 'legacy-event');
    headers.set('x-fal-timestamp', fixture.headers.get('x-fal-webhook-timestamp')!);
    headers.set('x-fal-signature', fixture.headers.get('x-fal-webhook-signature')!);
    assert.throws(() => verifyFalWebhook(fixture.body, headers, ref('fal', 'fal_123'), options), /header|signature/i);
  }
  const signature = fixture.headers.get('x-fal-webhook-signature')!;
  for (const value of [Buffer.from(signature, 'hex').toString('base64'), `ed25519:${signature}`, `${signature}garbage`, signature.slice(2), '0'.repeat(128)]) {
    const headers = new Headers(fixture.headers);
    headers.set('x-fal-webhook-signature', value);
    assert.throws(() => verifyFalWebhook(fixture.body, headers, ref('fal', 'fal_123'), options), /signature/i);
  }
});

test('fal modern signatures bind raw bytes and authenticated headers to the exact persisted request and nonce', () => {
  const fixture = modernFalFixture();
  for (const body of [Buffer.concat([fixture.body, Buffer.from(' ')]), Buffer.from(fixture.body.toString().replace('COMPLETED', 'IN_PROGRESS'))]) {
    assert.throws(() => verifyFalWebhook(body, fixture.headers, ref('fal', 'fal_123'), fixture.options), /signature/i);
  }
  for (const [name, value] of [['x-fal-webhook-request-id', 'other-request'], ['x-fal-webhook-user-id', 'other-user']]) {
    const headers = new Headers(fixture.headers);
    headers.set(name, value);
    assert.throws(() => verifyFalWebhook(fixture.body, headers, ref('fal', 'fal_123'), fixture.options), /signature/i);
  }
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'other-persisted-request'), fixture.options), /request identity/i);
  assert.throws(() => verifyFalWebhook(fixture.body, fixture.headers, ref('fal', 'fal_123'), {...fixture.options, expectedAttemptNonce: 'other-nonce'}), /attempt identity/i);
  const withoutMetadata = modernFalFixture({metadata: undefined});
  assert.equal(verifyFalWebhook(withoutMetadata.body, withoutMetadata.headers, ref('fal', 'fal_123'), withoutMetadata.options).attemptNonce, 'nonce-fal');
  assert.throws(() => verifyFalWebhook(withoutMetadata.body, withoutMetadata.headers, ref('fal', 'fal_123'), {...withoutMetadata.options, expectedAttemptNonce: undefined}), /correlation/i);
});

test('health and telemetry remain redacted and bounded', () => {
  const health = evaluateIntegrationHealth({provider: 'replicate', lastSuccessfulAt: new Date('2026-10-03T00:00:00.000Z'), unknownOldestAt: new Date('2026-10-03T23:00:00.000Z'), now});
  assert.equal(health.status, 'degraded');
  const telemetry = redactRecoveryTelemetry({workspaceId: 'workspace', taskId: 'task', attemptId: 'attempt', provider: 'replicate', status: 'submission_unknown', unknownAgeSeconds: 1_800, prompt: 'secret prompt', signedUrl: 'https://secret.example'});
  assert.equal('prompt' in telemetry, false);
  assert.equal('signedUrl' in telemetry, false);
});

test('remote output fetch follows only bounded public HTTPS redirects and MIME limits', async () => {
  const resolver = async () => [{address: '93.184.216.34', family: 4}];
  let calls = 0;
  const result = await fetchPrivateProviderOutput('https://provider.example/start', async (url) => {
    calls += 1;
    if (calls === 1) return new Response(null, {status: 302, headers: {location: 'https://provider.example/final'}});
    assert.equal(String(url), 'https://provider.example/final');
    return new Response(new Uint8Array([0, 1, 2]), {status: 200, headers: {'content-type': 'video/mp4', 'content-length': '3'}});
  }, resolver);
  assert.equal(result.bytes.byteLength, 3);
  await assert.rejects(() => fetchPrivateProviderOutput('http://127.0.0.1/output', async () => new Response(null, {status: 200}), resolver), /HTTPS|private/i);
});
