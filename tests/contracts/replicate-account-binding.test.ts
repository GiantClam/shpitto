import assert from 'node:assert/strict';
import test from 'node:test';
import {assertReplicateAccountBinding, confirmReplicateAccountBinding} from '../../src/adapters/providers/replicate/account-binding.ts';
import type {ReplicateRequest} from '../../src/adapters/providers/replicate/index.ts';

const secret = `whsec_${Buffer.from('account-binding-contract-fixture').toString('base64')}`;

test('account preflight uses the submission token for account and signing-key reads and caches only a fresh exact binding', async () => {
  const requests: ReplicateRequest[] = [];
  const transport = {async request(request: ReplicateRequest) {
    requests.push(request);
    assert.equal(request.method, 'GET');
    assert.equal(request.retry, false);
    assert.equal(request.headers.Authorization, 'Bearer fixture-token');
    return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'fixture-owner'} : {key: secret}};
  }};
  const config = {transport, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:fixture-owner', webhookBaseUrl: 'https://app.example/api/webhooks/replicate'};
  const now = new Date('2026-10-15T00:00:00Z');
  const binding = await confirmReplicateAccountBinding({...config, now});
  assert.equal(binding.accountId, 'user:fixture-owner');
  assert.deepEqual(requests.map(request => request.url), ['https://api.replicate.com/v1/account', 'https://api.replicate.com/v1/webhooks/default/secret']);
  assert.equal(await confirmReplicateAccountBinding({...config, now: new Date(now.getTime() + 299_999)}), binding);
  assert.equal(requests.length, 2);
  assert.notEqual(await confirmReplicateAccountBinding({...config, now: new Date(now.getTime() + 300_000)}), binding);
  assert.equal(requests.length, 4);
});

test('changing token, secret, account or callback configuration cannot reuse a confirmed binding', async () => {
  const now = new Date('2026-10-15T00:00:00Z');
  for (const change of ['token', 'webhookSecret', 'webhookAccountId', 'webhookBaseUrl'] as const) {
    const requests: ReplicateRequest[] = [];
    const replacementSecret = `whsec_${Buffer.from('replacement-config-fixture-key').toString('base64')}`;
    let remoteSecret = secret;
    let username = 'fixture-owner';
    const transport = {async request(request: ReplicateRequest) {
      requests.push(request);
      return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username} : {key: remoteSecret}};
    }};
    const config = {transport, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:fixture-owner', webhookBaseUrl: 'https://app.example/api/webhooks/replicate', now};
    const original = await confirmReplicateAccountBinding(config);
    const value = {token: 'replacement-token', webhookSecret: replacementSecret, webhookAccountId: 'user:replacement-owner', webhookBaseUrl: 'https://replacement.example/api/webhooks/replicate'}[change];
    if (change === 'webhookSecret') remoteSecret = replacementSecret;
    if (change === 'webhookAccountId') username = 'replacement-owner';
    const replacement = await confirmReplicateAccountBinding({...config, [change]: value});
    assert.equal(requests.length, 4, change);
    assert.notEqual(replacement, original);
    assert.throws(() => assertReplicateAccountBinding(original, secret, now), /unconfirmed/i);
    assertReplicateAccountBinding(replacement, change === 'webhookSecret' ? replacementSecret : secret, now);
    assert.doesNotMatch(JSON.stringify(replacement), /fixture-token|replacement-token|whsec_/);
  }
});

test('expired binding is revoked when refresh fails and a backward clock cannot reuse cache', async () => {
  const now = new Date('2026-10-15T00:00:00Z');
  let failed = false;
  let calls = 0;
  const transport = {async request(request: ReplicateRequest) {
    calls++;
    if (failed) return {status: 401};
    return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'fixture-owner'} : {key: secret}};
  }};
  const config = {transport, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:fixture-owner', now};
  const original = await confirmReplicateAccountBinding(config);
  failed = true;
  await assert.rejects(() => confirmReplicateAccountBinding({...config, now: new Date(now.getTime() + 300_000)}), /not confirmed/i);
  assert.throws(() => assertReplicateAccountBinding(original, secret, now), /unconfirmed/i);
  failed = false;
  await confirmReplicateAccountBinding(config);
  await confirmReplicateAccountBinding({...config, now: new Date(now.getTime() - 1)});
  assert.equal(calls, 7);
});

test('missing, malformed and unofficial binding configuration fails before any authenticated read', async () => {
  let calls = 0;
  const transport = {async request() {calls++; return {status: 200};}};
  const config = {transport, token: 'fixture-token', webhookSecret: secret, webhookAccountId: 'user:fixture-owner'};
  for (const invalid of [{token: ''}, {webhookSecret: 'not-a-replicate-key'}, {webhookSecret: 'whsec_a'}, {webhookAccountId: 'fixture-owner'}, {webhookAccountId: 'account:user:fixture-owner'}, {apiBaseUrl: 'https://foreign.example/v1'}, {now: new Date('invalid')}]) {
    await assert.rejects(() => confirmReplicateAccountBinding({...config, ...invalid}), /binding|verification/i);
  }
  assert.equal(calls, 0);
});
