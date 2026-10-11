import assert from 'node:assert/strict';
import {createHash, createHmac, generateKeyPairSync, sign} from 'node:crypto';
import test from 'node:test';

import {getProviderModel} from '../../src/config/provider-models.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';
import {verifyFalWebhook} from '../../src/adapters/providers/fal/webhook.ts';
import {evaluateIntegrationHealth} from '../../src/modules/operations/integration-health.ts';
import {redactRecoveryTelemetry} from '../../src/modules/operations/telemetry.ts';
import {fetchPrivateProviderOutput} from '../../src/adapters/storage/s3.ts';

const now = new Date('2026-10-04T00:00:00.000Z');

function ref(provider: 'replicate' | 'fal', requestId: string) {
  const modelKey = provider === 'replicate' ? 'replicate-wan22-t2v' : 'fal-wan22-t2v';
  return {provider, modelKey, requestId, catalog: getProviderModel(modelKey)} as const;
}

test('Replicate raw-body HMAC binds event, timestamp, exact request and attempt', () => {
  const secret = Buffer.from('local-replicate-secret').toString('base64');
  const body = new TextEncoder().encode(JSON.stringify({id: 'pred_123', status: 'processing', account_id: 'acct_local', metadata: {attempt_nonce: 'nonce-1'}}));
  const eventId = 'wh_123';
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${eventId}.${timestamp}.${new TextDecoder().decode(body)}`).digest('base64');
  const verified = verifyReplicateWebhook(body, new Headers({'webhook-id': eventId, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}`}), ref('replicate', 'pred_123'), {secret, expectedAccountId: 'acct_local', expectedAttemptNonce: 'nonce-1', now});
  assert.equal(verified.observation.status, 'running');
  assert.equal(verified.attemptNonce, 'nonce-1');
  assert.throws(() => verifyReplicateWebhook(body, new Headers({'webhook-id': eventId, 'webhook-timestamp': String(timestamp - 301), 'webhook-signature': `v1,${signature}`}), ref('replicate', 'pred_123'), {secret, now}), /stale/i);
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
  const jwk = keys.publicKey.export({format: 'jwk'}) as JsonWebKey;
  const viaJwks = verifyFalWebhook(body, new Headers({'x-fal-webhook-id': eventId, 'x-fal-webhook-timestamp': String(timestamp), 'x-fal-webhook-signature': signature, 'x-fal-key-id': 'local'}), ref('fal', 'fal_123'), {jwks: {local: jwk}, jwksFetchedAt: now, expectedAccountId: 'acct_fal', expectedAttemptNonce: 'nonce-fal', now});
  assert.equal(viaJwks.observation.status, 'running');
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
