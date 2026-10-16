import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {verifyReplicateWebhook, verifyReplicateWebhookWithoutRef} from '../../src/adapters/providers/replicate/webhook.ts';
import {confirmReplicateAccountBinding} from '../../src/adapters/providers/replicate/account-binding.ts';
import {createReplicateProvider} from '../../src/adapters/providers/replicate/index.ts';

const now = new Date('2026-10-15T00:00:00.000Z');
const secret = `whsec_${Buffer.from('isolated-replicate-signature-fixture').toString('base64')}`;
const catalog = getProviderModel('replicate-wan22-t2v');
const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'owned_request', catalog};
const attemptNonce = '836692a3-3d95-42e7-89a7-24031af547bb';
const binding = await confirmReplicateAccountBinding({transport: {async request(request) {return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'owned_account'} : {key: secret}};}}, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:owned_account', now});
const options = {secret, binding, expectedAttemptNonce: attemptNonce, now};
const valid = {id: ref.requestId, model: catalog.endpoint, version: catalog.modelVersion, input: {}, output: null, data_removed: false, error: null, status: 'processing', created_at: now.toISOString(), urls: {web: 'https://replicate.com/p/owned_request', get: 'https://api.replicate.com/v1/predictions/owned_request', cancel: 'https://api.replicate.com/v1/predictions/owned_request/cancel'}};

function signed(body: Uint8Array, signingSecret = Buffer.from(secret.slice(6), 'base64'), signedAt = now) {
  const timestamp = String(Math.floor(signedAt.getTime() / 1000));
  const event = 'isolated_webhook_event';
  const signature = createHmac('sha256', signingSecret).update(`${event}.${timestamp}.${new TextDecoder().decode(body)}`).digest('base64');
  return new Headers({'webhook-id': event, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}`});
}
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');

test('Replicate verification fails closed before processing for missing authentication and foreign references', () => {
  const body = bytes(valid);
  const headers = signed(body);
  assert.throws(() => verifyReplicateWebhook(body, headers, {...ref, provider: 'fal'}, options), /not Replicate/i);
  assert.throws(() => verifyReplicateWebhook(body, headers, ref, {...options, secret: ' '}), /not configured/i);
  for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const missing = new Headers(headers);
    missing.delete(name);
    assert.throws(() => verifyReplicateWebhook(body, missing, ref, options), /missing.*header/i);
  }
  for (const timestamp of ['not-a-number', String(now.getTime() / 1000 + 301)]) {
    const invalid = new Headers(headers);
    invalid.set('webhook-timestamp', timestamp);
    assert.throws(() => verifyReplicateWebhook(body, invalid, ref, options), /stale/i);
  }
  const forged = new Headers(headers);
  forged.set('webhook-signature', `v1,${Buffer.alloc(32, 7).toString('base64')}`);
  assert.throws(() => verifyReplicateWebhook(body, forged, ref, options), /signature/i);
  assert.throws(() => verifyReplicateWebhook(Buffer.from(`${body.toString()} `), headers, ref, options), /signature/i);
});

test('Replicate rejects authenticated oversized, empty, malformed and non-object payloads', () => {
  for (const body of [Buffer.alloc(0), Buffer.alloc(1_000_001), Buffer.from('{'), bytes(null), bytes([]), bytes('text')]) {
    assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, options), /body/i);
  }
});

test('Replicate request identity is bounded and must match the exact persisted request', () => {
  for (const id of [undefined, 42, '../other', '', 'x'.repeat(201), 'different_request']) {
    const body = bytes({...valid, id});
    assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, options), /request identity/i);
  }
});

test('documented prediction payload needs no fictional fields and cannot override confirmed account or issued route nonce', () => {
  const body = bytes(valid);
  const verified = verifyReplicateWebhook(body, signed(body), ref, options);
  assert.equal(verified.accountId, 'user:owned_account');
  assert.equal(verified.attemptNonce, attemptNonce);
  assert.equal(verifyReplicateWebhookWithoutRef(body, signed(body), options).attemptNonce, attemptNonce);
  const invented = bytes({...valid, account_id: 'foreign_account', metadata: {attempt_nonce: 'foreign_nonce'}});
  assert.equal(verifyReplicateWebhook(invented, signed(invented), ref, options).accountId, 'user:owned_account');
  assert.throws(() => verifyReplicateWebhook(invented, signed(invented), ref, {...options, expectedAttemptNonce: undefined}), /correlation/i);
  assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, expectedAttemptNonce: 'guessable'}), /correlation/i);
});

test('unconfirmed, expired or wrong-key binding cannot authenticate a callback', () => {
  const body = bytes(valid);
  assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, binding: undefined}), /binding/i);
  assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, binding: {...binding}}), /binding/i);
  assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, now: new Date(now.getTime() + 300_000)}), /binding/i);
  assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, secret: `whsec_${Buffer.from('wrong-key').toString('base64')}`}), /binding/i);
  assert.throws(() => verifyReplicateWebhook(body, signed(body, Buffer.from('another-account-key')), ref, options), /signature/i);
});

test('adapter, reference and without-reference webhook entrypoints share confirmed account and explicit nonce context', async () => {
  const transport = {async request(request: import('../../src/adapters/providers/replicate/index.ts').ReplicateRequest) {return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'owned_account'} : {key: secret}};}};
  const config = {transport, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:owned_account'};
  const currentBinding = await confirmReplicateAccountBinding(config);
  const current = new Date();
  const currentOptions = {secret, binding: currentBinding, expectedAttemptNonce: attemptNonce, now: current};
  const body = bytes(valid);
  const headers = signed(body, undefined, current);
  const adapter = createReplicateProvider({...config, mode: 'test'});
  const verified = await adapter.verifyWebhook(body, headers, ref, {attemptNonce});
  assert.equal(verified.accountId, verifyReplicateWebhook(body, headers, ref, currentOptions).accountId);
  assert.equal(verified.attemptNonce, verifyReplicateWebhookWithoutRef(body, headers, currentOptions).attemptNonce);
  await assert.rejects(() => adapter.verifyWebhook(body, headers, ref), /correlation/i);
});

test('receiver adapter refuses an unconfirmed token/key association without trusting body fields', async () => {
  const requests: string[] = [];
  const provider = createReplicateProvider({mode: 'test', token: 'wrong-token', webhookSecret: secret, webhookAccountId: 'user:owned_account', transport: {async request(request) {
    requests.push(request.method);
    return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'owned_account'} : {key: `whsec_${Buffer.from('wrong-token-key').toString('base64')}`}};
  }}});
  const body = bytes({...valid, account_id: 'user:owned_account', metadata: {attempt_nonce: attemptNonce}});
  await assert.rejects(() => provider.verifyWebhook(body, signed(body), ref, {attemptNonce}), /binding signing key/i);
  assert.deepEqual(requests, ['GET', 'GET']);
});
