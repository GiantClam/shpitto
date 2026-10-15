import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';

const now = new Date('2026-10-15T00:00:00.000Z');
const secret = Buffer.from('isolated-replicate-signature-fixture').toString('base64');
const catalog = getProviderModel('replicate-wan22-t2v');
const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'owned_request', catalog};
const options = {secret, expectedAccountId: 'owned_account', expectedAttemptNonce: 'owned_nonce', now};
const valid = {id: ref.requestId, status: 'processing', account_id: 'owned_account', metadata: {attempt_nonce: 'owned_nonce'}};

function signed(body: Uint8Array, signingSecret = Buffer.from(secret, 'base64')) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
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

test('Replicate authenticated account and attempt metadata cannot substitute for the persisted binding', () => {
  for (const account_id of ['other_account', 42, undefined]) {
    const body = bytes({...valid, account_id});
    assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, options), /account identity/i);
  }
  const wrongNonce = bytes({...valid, metadata: {attempt_nonce: 'other_nonce'}});
  assert.throws(() => verifyReplicateWebhook(wrongNonce, signed(wrongNonce), ref, options), /attempt identity/i);
  for (const metadata of [undefined, [], {attempt_nonce: 42}]) {
    const body = bytes({...valid, metadata});
    assert.throws(() => verifyReplicateWebhook(body, signed(body), ref, {...options, expectedAttemptNonce: undefined}), /correlation/i);
    assert.equal(verifyReplicateWebhook(body, signed(body), ref, options).attemptNonce, 'owned_nonce');
  }
  const body = bytes(valid);
  assert.equal(verifyReplicateWebhook(body, signed(body), ref, {secret, now}).attemptNonce, 'owned_nonce');
});

test('Replicate signing secret prefix and explicit raw-secret compatibility preserve exact HMAC authentication', () => {
  const body = bytes(valid);
  assert.equal(verifyReplicateWebhook(body, signed(body), ref, {...options, secret: `whsec_${secret}`}).observation.status, 'running');
  const rawSecret = '???';
  assert.equal(verifyReplicateWebhook(body, signed(body, Buffer.from(rawSecret, 'utf8')), ref, {...options, secret: rawSecret}).observation.status, 'running');
});
