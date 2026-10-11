import assert from 'node:assert/strict';
import test from 'node:test';

import {getProviderModel} from '../../src/config/provider-models.ts';
import {mapProviderInput, validateVideoInput, freezeSubmissionContext} from '../../src/adapters/providers/input.ts';
import {createFalProvider, type FalRequest, type FalResponse} from '../../src/adapters/providers/fal/index.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {semanticHash} from '../../src/contracts/http.ts';

const now = '2026-10-01T06:00:00.000Z';
const workspaceId = '3cfd7229-8b8f-424a-9846-944681e7c6aa';
const t2v = {modelKey: 'fal-wan22-t2v', mode: 'text-to-video', prompt: 'A blue bird over an ocean', aspectRatio: '16:9'} as const;
const i2v = {modelKey: 'fal-wan22-i2v', mode: 'image-to-video', prompt: 'A blue bird over an ocean', aspectRatio: '9:16', image: {assetId: 'e7e3475e-ea2a-4c0d-98e3-de1a2339e154', cropSha256: 'a'.repeat(64), confirmed: true}} as const;

function quote(modelId: string) {
  const {quoteHash: _hash, ...base} = createServerQuote('mock-video', '1', {now: new Date(now)});
  const payload = {...base, modelId};
  return {...payload, quoteHash: semanticHash('credit.quote', payload)};
}

function context(inputValue: typeof t2v | typeof i2v) {
  const input = validateVideoInput(inputValue);
  return freezeSubmissionContext({input, workspaceId, taskId: 'task-1', attemptId: 'attempt-1', attemptNonce: 'nonce-1', quote: quote(input.modelKey), createdAt: now, authorizedImage: input.image ? {assetId: input.image.assetId, workspaceId, state: 'ready', kind: 'image', cropSha256: input.image.cropSha256, width: 720, height: 1280} : undefined});
}

function fakeTransport(responses: FalResponse[] | ((request: FalRequest) => Promise<FalResponse>)) {
  const requests: FalRequest[] = [];
  const transport = {async request(request: FalRequest) {requests.push(request); return typeof responses === 'function' ? responses(request) : responses.shift()!;}};
  return {transport, requests};
}

test('builds fal T2V queue request with safe mapping and no retry', async () => {
  const fake = fakeTransport([{status: 200, body: {request_id: 'fal_req_123', status_url: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/requests/fal_req_123/status', response_url: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/requests/fal_req_123'}}]);
  const provider = createFalProvider({transport: fake.transport, mode: 'test'});
  const submitted = await provider.submit(context(t2v));
  assert.deepEqual(submitted, {kind: 'accepted', requestId: 'fal_req_123', statusUrl: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/requests/fal_req_123/status', resultUrl: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/requests/fal_req_123'});
  assert.equal(fake.requests[0].headers.Authorization, undefined);
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0].url, 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video');
  assert.equal(fake.requests[0].retry, false);
  assert.equal(fake.requests[0].headers['X-Fal-No-Retry'], '1');
  assert.deepEqual(fake.requests[0].body, {prompt: 'A blue bird over an ocean', resolution: '720p', num_frames: 81, frames_per_second: 16, aspect_ratio: '16:9', interpolator_model: 'none', num_interpolated_frames: 0, enable_safety_checker: true, enable_output_safety_checker: true, enable_prompt_expansion: false});
});

test('builds fal I2V request with authorized image and validates tracking origins', async () => {
  const fake = fakeTransport([{status: 200, body: {request_id: 'fal_req_i2v', status_url: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/requests/fal_req_i2v/status', response_url: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/requests/fal_req_i2v'}}]);
  const provider = createFalProvider({transport: fake.transport, mode: 'test', resolveOwnedImageUrl: async (image) => `https://cdn.example/${image.assetId}?crop=${image.cropSha256}`});
  assert.deepEqual(await provider.submit(context(i2v)), {kind: 'accepted', requestId: 'fal_req_i2v', statusUrl: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/requests/fal_req_i2v/status', resultUrl: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/requests/fal_req_i2v'});
  const body = fake.requests[0].body as Record<string, unknown>;
  assert.equal(body.image_url, `https://cdn.example/${i2v.image.assetId}?crop=${i2v.image.cropSha256}`);
  assert.equal(typeof body.aspect_ratio, 'string');
});

test('status and result require exact request ID and completed result video', async () => {
  const fake = fakeTransport([
    {status: 200, body: {request_id: 'fal_req_123', status: 'IN_QUEUE'}},
    {status: 200, body: {request_id: 'fal_req_123', status: 'COMPLETED'}},
    {status: 200, body: {video: {url: 'https://cdn.fal.video/result.mp4'}}},
  ]);
  const provider = createFalProvider({transport: fake.transport, mode: 'test'});
  const catalog = getProviderModel('fal-wan22-t2v');
  const ref = {provider: 'fal' as const, modelKey: catalog.modelKey, requestId: 'fal_req_123', catalog, statusUrl: 'https://queue.fal.run/custom/status/fal_req_123', resultUrl: 'https://queue.fal.run/custom/result/fal_req_123'};
  assert.equal((await provider.getStatus(ref)).status, 'queued');
  assert.deepEqual(await provider.readResult(ref), {kind: 'unavailable', evidence: {code: 'fal.result_unavailable'}});
  assert.deepEqual(await provider.readResult(ref), {kind: 'outputCandidates', candidates: [{kind: 'remote', url: 'https://cdn.fal.video/result.mp4'}]});
  assert.equal(fake.requests[0].url, 'https://queue.fal.run/custom/status/fal_req_123');
  assert.equal(fake.requests[1].url, 'https://queue.fal.run/custom/result/fal_req_123');
  assert.equal(fake.requests[2].url, 'https://queue.fal.run/custom/result/fal_req_123');
});

test('missing IDs, foreign tracking URLs and live disabled rows fail closed', async () => {
  const missing = fakeTransport([{status: 200, body: {status_url: 'https://queue.fal.run/x', response_url: 'https://queue.fal.run/y'}}]);
  const provider = createFalProvider({transport: missing.transport, mode: 'test'});
  await assert.rejects(() => provider.submit(context(t2v)), /request ID/i);
  const foreign = fakeTransport([{status: 200, body: {request_id: 'fal_req_123', status_url: 'https://evil.example/status', response_url: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/requests/fal_req_123'}}]);
  const second = createFalProvider({transport: foreign.transport, mode: 'test'});
  await assert.rejects(() => second.submit(context(t2v)), /tracking URL/i);
  const live = fakeTransport([{status: 200, body: {request_id: 'never'}}]);
  const liveProvider = createFalProvider({transport: live.transport, mode: 'live', token: 'test-token'});
  await assert.rejects(() => liveProvider.submit(context(t2v)), /disabled|live/i);
  assert.equal(live.requests.length, 0);
});

test('configuration and provider identity errors remain bounded', async () => {
  assert.throws(() => createFalProvider({transport: {request: async () => ({status: 200, body: {request_id: 'x'}})}, mode: 'live'}), /token/i);
  const provider = createFalProvider({transport: {request: async () => ({status: 200, body: {request_id: 'x', status: 'COMPLETED'}})}, mode: 'test'});
  const replicate = getProviderModel('replicate-wan22-t2v');
  await assert.rejects(() => provider.getStatus({provider: 'replicate', modelKey: replicate.modelKey, requestId: 'x', catalog: replicate}), /fal request/i);
  assert.equal(mapProviderInput(validateVideoInput(t2v), getProviderModel('fal-wan22-t2v')).aspect_ratio, '16:9');
});
