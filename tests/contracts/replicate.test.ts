import assert from 'node:assert/strict';
import test from 'node:test';

import {getProviderModel} from '../../src/config/provider-models.ts';
import {freezeSubmissionContext, mapProviderInput, validateVideoInput} from '../../src/adapters/providers/input.ts';
import {createReplicateProvider, type ReplicateRequest, type ReplicateResponse} from '../../src/adapters/providers/replicate/index.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {semanticHash} from '../../src/contracts/http.ts';

const now = '2026-10-01T06:00:00.000Z';
const workspaceId = '3cfd7229-8b8f-424a-9846-944681e7c6aa';
const t2v = {modelKey: 'replicate-wan22-t2v', mode: 'text-to-video', prompt: 'A blue bird over an ocean', aspectRatio: '16:9'} as const;
const i2v = {modelKey: 'replicate-wan22-i2v', mode: 'image-to-video', prompt: 'A blue bird over an ocean', aspectRatio: '9:16', image: {assetId: 'e7e3475e-ea2a-4c0d-98e3-de1a2339e154', cropSha256: 'a'.repeat(64), confirmed: true}} as const;

function quote(modelId: string) {
  const {quoteHash: _hash, ...base} = createServerQuote('mock-video', '1', {now: new Date(now)});
  const payload = {...base, modelId};
  return {...payload, quoteHash: semanticHash('credit.quote', payload)};
}

function context(inputValue: typeof t2v | typeof i2v) {
  const input = validateVideoInput(inputValue);
  return freezeSubmissionContext({input, workspaceId, taskId: 'task-1', attemptId: 'attempt-1', attemptNonce: 'nonce-1', quote: quote(input.modelKey), createdAt: now, authorizedImage: input.image ? {assetId: input.image.assetId, workspaceId, state: 'ready', kind: 'image', cropSha256: input.image.cropSha256, width: 720, height: 1280} : undefined});
}

function fakeTransport(responses: ReplicateResponse[] | ((request: ReplicateRequest) => Promise<ReplicateResponse>)) {
  const requests: ReplicateRequest[] = [];
  const transport = {async request(request: ReplicateRequest) {requests.push(request); return typeof responses === 'function' ? responses(request) : responses.shift()!;}};
  return {transport, requests};
}

test('builds pinned T2V create request with safe schema fields and no automatic retry', async () => {
  const fake = fakeTransport([{status: 201, body: {id: 'pred_t2v_123'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'test', webhookBaseUrl: 'https://app.example/api/webhooks/replicate'});
  const result = await provider.submit(context(t2v));
  assert.deepEqual(result, {kind: 'accepted', requestId: 'pred_t2v_123'});
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0].method, 'POST');
  assert.equal(fake.requests[0].url, 'https://api.replicate.com/v1/predictions');
  assert.equal(fake.requests[0].retry, false);
  assert.deepEqual(fake.requests[0].body, {
    version: getProviderModel('replicate-wan22-t2v').modelVersion,
    input: {prompt: 'A blue bird over an ocean', resolution: '720p', num_frames: 81, frames_per_second: 16, interpolate_output: false, disable_safety_checker: false, aspect_ratio: '16:9', optimize_prompt: false},
    webhook: 'https://app.example/api/webhooks/replicate/nonce-1',
    webhook_events_filter: ['completed'],
  });
  assert.equal(JSON.stringify(fake.requests[0]).includes('Bearer'), false);
});

test('builds pinned I2V request with owned image and omits unsupported aspect_ratio', async () => {
  const fake = fakeTransport([{status: 201, body: {id: 'pred_i2v_123'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'test'});
  assert.deepEqual(await provider.submit(context(i2v)), {kind: 'accepted', requestId: 'pred_i2v_123'});
  const body = fake.requests[0].body as Record<string, unknown>;
  assert.equal(body.version, getProviderModel('replicate-wan22-i2v').modelVersion);
  assert.deepEqual(body.input, {prompt: 'A blue bird over an ocean', resolution: '720p', num_frames: 81, frames_per_second: 16, interpolate_output: false, disable_safety_checker: false, image: `https://app.example/internal/owned-image/${i2v.image.assetId}`});
  assert.equal('aspect_ratio' in (body.input as object), false);
});

test('uses configured server-side image resolver and rejects arbitrary image URLs', async () => {
  const fake = fakeTransport([{status: 201, body: {id: 'pred_i2v_456'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'test', resolveOwnedImageUrl: async (input) => `https://cdn.example/assets/${input.assetId}?sig=opaque`});
  await provider.submit(context(i2v));
  assert.equal((fake.requests[0].body as {input: {image: string}}).input.image, 'https://cdn.example/assets/e7e3475e-ea2a-4c0d-98e3-de1a2339e154?sig=opaque');
});

test('live I2V requires an explicit server-owned image resolver before any provider call', async () => {
  const fake = fakeTransport([{status: 201, body: {id: 'pred_i2v_live'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'live', token: 'test-token'});
  await assert.rejects(() => provider.submit(context(i2v)), /resolver|disabled|live/i);
  assert.equal(fake.requests.length, 0);
});

test('transport timeout is unknown and never retried or converted to rejection', async () => {
  let calls = 0;
  const provider = createReplicateProvider({mode: 'test', transport: {async request() {calls += 1; throw new Error('timeout');}}});
  const result = await provider.submit(context(t2v));
  assert.equal(result.kind, 'unknown');
  assert.equal((result as {evidence: {code: string}}).evidence.code, 'transport_timeout_or_unknown');
  assert.equal(calls, 1);
});

test('explicit validation rejection is definitelyRejected while 5xx stays unknown', async () => {
  const rejected = fakeTransport([{status: 422, body: {detail: 'invalid input'}}]);
  const provider = createReplicateProvider({transport: rejected.transport, mode: 'test'});
  assert.deepEqual(await provider.submit(context(t2v)), {kind: 'definitelyRejected', code: 'replicate.http_422'});
  const unknown = fakeTransport([{status: 503, body: {detail: 'busy'}}]);
  const second = createReplicateProvider({transport: unknown.transport, mode: 'test'});
  assert.equal((await second.submit(context(t2v))).kind, 'unknown');
});

test('status and result use exact persisted prediction ID and normalize errors/output', async () => {
  const fake = fakeTransport([
    {status: 200, body: {id: 'pred_123', status: 'processing'}},
    {status: 200, body: {id: 'pred_123', status: 'succeeded', output: 'https://replicate.delivery/video.mp4'}},
  ]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'test'});
  const catalog = getProviderModel('replicate-wan22-t2v');
  const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'pred_123', catalog};
  assert.equal((await provider.getStatus(ref)).status, 'running');
  assert.deepEqual(await provider.readResult(ref), {kind: 'outputCandidates', candidates: [{kind: 'remote', url: 'https://replicate.delivery/video.mp4'}]});
  assert.equal(fake.requests[0].url, 'https://api.replicate.com/v1/predictions/pred_123');
  assert.equal(fake.requests[1].url, 'https://api.replicate.com/v1/predictions/pred_123');
  assert.equal(fake.requests[0].retry, false);
});

test('mismatched ID and malformed response are rejected before attachment', async () => {
  const fake = fakeTransport([{status: 200, body: {id: 'different', status: 'succeeded', output: 'https://replicate.delivery/video.mp4'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'test'});
  const catalog = getProviderModel('replicate-wan22-t2v');
  const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'pred_123', catalog};
  await assert.rejects(() => provider.getStatus(ref), /identity/i);
  const malformed = fakeTransport([{status: 200, body: {id: 'pred_123', status: 'succeeded', output: 'file:///secret.mp4'}}]);
  const second = createReplicateProvider({transport: malformed.transport, mode: 'test'});
  assert.equal((await second.readResult(ref)).kind, 'unavailable');
});

test('status and result responses without the persisted prediction ID are rejected', async () => {
  const catalog = getProviderModel('replicate-wan22-t2v');
  const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'pred_123', catalog};
  const missingStatusId = fakeTransport([{status: 200, body: {status: 'processing'}}]);
  const statusProvider = createReplicateProvider({transport: missingStatusId.transport, mode: 'test'});
  await assert.rejects(() => statusProvider.getStatus(ref), /identity/i);
  const missingResultId = fakeTransport([{status: 200, body: {status: 'succeeded', output: 'https://replicate.delivery/video.mp4'}}]);
  const resultProvider = createReplicateProvider({transport: missingResultId.transport, mode: 'test'});
  await assert.rejects(() => resultProvider.readResult(ref), /identity/i);
});

test('live mode remains blocked while the catalog row is disabled', async () => {
  const fake = fakeTransport([{status: 201, body: {id: 'pred_live'}}]);
  const provider = createReplicateProvider({transport: fake.transport, mode: 'live', token: 'test-token'});
  await assert.rejects(() => provider.submit(context(t2v)), /disabled|live/i);
  assert.equal(fake.requests.length, 0);
});

test('request builder only accepts the exact persisted Replicate contract', async () => {
  const input = validateVideoInput(t2v);
  const catalog = getProviderModel(input.modelKey);
  const payload = mapProviderInput(input, catalog);
  assert.equal(payload.aspect_ratio, '16:9');
  assert.equal(catalog.modelVersion, 'c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d');
  const provider = createReplicateProvider({mode: 'test', transport: {request: async () => ({status: 201, body: {id: 'pred'}})}});
  assert.equal(provider.capabilities(catalog.modelKey).modelKey, catalog.modelKey);
  assert.equal(provider.validate(t2v).modelKey, catalog.modelKey);
  assert.throws(() => provider.capabilities('mock-video'), /Replicate/i);
  assert.throws(() => provider.validate({...t2v, modelKey: 'mock-video'}), /Replicate|mode/i);
  assert.rejects(() => provider.verifyWebhook(new Uint8Array(), new Headers()), /task 5.4/i);
});

test('configuration and identity errors fail closed before provider attachment', async () => {
  assert.throws(() => createReplicateProvider({mode: 'live', transport: {request: async () => ({status: 201, body: {id: 'x'}})}}), /token/i);
  const input = validateVideoInput(t2v);
  const catalog = getProviderModel(input.modelKey);
  const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: 'bad/id', catalog};
  const provider = createReplicateProvider({mode: 'test', transport: {request: async () => ({status: 200, body: {status: 'processing'}})}});
  await assert.rejects(() => provider.getStatus(ref), /prediction ID/i);
  assert.throws(() => mapProviderInput(validateVideoInput(i2v), getProviderModel('replicate-wan22-i2v'), 'http://foreign.example/image.png'), /HTTPS/i);
});

test('invalid endpoint/webhook settings, missing IDs and transport errors stay bounded', async () => {
  const badEndpoint = createReplicateProvider({mode: 'test', apiBaseUrl: 'http://localhost:9999', transport: {request: async () => ({status: 201, body: {id: 'never'}})}});
  await assert.rejects(() => badEndpoint.submit(context(t2v)), /HTTPS/i);
  const badWebhook = createReplicateProvider({mode: 'test', webhookBaseUrl: 'http://localhost/webhook', transport: {request: async () => ({status: 201, body: {id: 'never'}})}});
  await assert.rejects(() => badWebhook.submit(context(t2v)), /HTTPS/i);
  const missingId = fakeTransport([{status: 201, body: {}}]);
  const missing = createReplicateProvider({mode: 'test', transport: missingId.transport});
  assert.equal((await missing.submit(context(t2v))).kind, 'unknown');
  const failedTransport = createReplicateProvider({mode: 'test', transport: {request: async () => {throw new Error('socket closed');}}});
  const ref = {provider: 'replicate' as const, modelKey: getProviderModel('replicate-wan22-t2v').modelKey, requestId: 'pred_123', catalog: getProviderModel('replicate-wan22-t2v')};
  assert.equal((await failedTransport.readResult(ref)).kind, 'unavailable');
  await assert.rejects(() => failedTransport.getStatus(ref), /unavailable/i);
});

test('adapter refuses non-Replicate persisted refs and malformed upstream status responses', async () => {
  const provider = createReplicateProvider({mode: 'test', transport: {request: async () => ({status: 99, body: {}})}});
  const mockCatalog = getProviderModel('mock-video');
  const mockRef = {provider: 'mock' as const, modelKey: mockCatalog.modelKey, requestId: 'mock_123', catalog: mockCatalog};
  await assert.rejects(() => provider.getStatus(mockRef), /Replicate request/i);
  await assert.rejects(() => provider.readResult(mockRef), /Replicate request/i);
  const replicateCatalog = getProviderModel('replicate-wan22-t2v');
  const ref = {provider: 'replicate' as const, modelKey: replicateCatalog.modelKey, requestId: 'pred_123', catalog: replicateCatalog};
  await assert.rejects(() => provider.getStatus(ref), /invalid HTTP/i);
  await assert.rejects(() => provider.readResult(ref), /invalid HTTP/i);
  const contextValue = context(t2v);
  await assert.rejects(() => provider.submit({...contextValue, catalog: mockCatalog}), /Replicate contract/i);
  await assert.rejects(() => provider.submit({...contextValue, catalog: {...replicateCatalog, modelVersion: null} as typeof replicateCatalog}), /version/i);
});
