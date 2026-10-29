import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {providerModels, getProviderModel, assertInspectedProviderContract} from '../../src/config/provider-models.ts';
import {validateVideoInput, freezeSubmissionContext, mapProviderInput} from '../../src/adapters/providers/input.ts';
import {normalizeSubmission, normalizeObservation, normalizeResult} from '../../src/adapters/providers/normalize.ts';
import {createMockProvider} from '../../src/adapters/providers/mock.ts';
import {submitMock} from '../../src/modules/generation/mock.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {semanticHash} from '../../src/contracts/http.ts';

const imageId = 'e7e3475e-ea2a-4c0d-98e3-de1a2339e154';
const workspaceId = '3cfd7229-8b8f-424a-9846-944681e7c6aa';
const cropSha256 = 'a'.repeat(64);
const t2v = {modelKey: 'replicate-wan22-t2v', mode: 'text-to-video', prompt: 'A bird above the ocean', aspectRatio: '16:9'};
const i2v = {modelKey: 'replicate-wan22-i2v', mode: 'image-to-video', prompt: 'A bird above the ocean', aspectRatio: '9:16', image: {assetId: imageId, cropSha256, confirmed: true}};
const ownedImage = {assetId: imageId, workspaceId, state: 'ready' as const, kind: 'image' as const, cropSha256, width: 720, height: 1280};
const now = '2026-10-01T03:00:00.000Z';

test('all four selected schemas are inspected, byte-bound, and disabled for live use', () => {
  const manifest = JSON.parse(readFileSync('internal/contracts/providers/manifest.json', 'utf8'));
  assert.equal(providerModels.length, 4);
  for (const model of providerModels) {
    const row = manifest.rows.find((entry: {key: string}) => entry.key === model.modelKey);
    const bytes = readFileSync(`internal/contracts/providers/${row.schemaFile}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.schemaSha256);
    assert.equal(model.schemaSha256, row.schemaSha256);
    assert.equal(model.liveEnabled, false);
    assert.equal(model.immutableBuild, model.provider === 'replicate');
    assert.equal(model.modelVersion, row.observedVersion);
    assert.equal(getProviderModel(model.modelKey), model);
  }
});

test('strict public DTO rejects every unapproved top-level and nested vendor field', () => {
  for (const key of ['url', 'sourceUrl', 'image_url', 'lora', 'last_image', 'providerParams', 'seed', 'resolution', 'quote', 'endpoint', 'schemaSha256']) {
    assert.throws(() => validateVideoInput({...t2v, [key]: 'untrusted'}), /unsupported/i);
  }
  assert.throws(() => validateVideoInput({...i2v, image: {...i2v.image, url: 'https://foreign.test/image.png'}}), /unsupported/i);
  for (const aspectRatio of ['1:1', 'auto', '4:3']) assert.throws(() => validateVideoInput({...t2v, aspectRatio}));
  assert.throws(() => validateVideoInput({...t2v, mode: 'image-to-video'}));
  assert.throws(() => validateVideoInput({...t2v, image: i2v.image}));
  assert.throws(() => validateVideoInput({...i2v, image: {...i2v.image, confirmed: false}}), /confirm/i);
});

test('schema or exact-version drift blocks new submission contracts without a silent fallback', () => {
  for (const model of providerModels) {
    assert.doesNotThrow(() => assertInspectedProviderContract(model.modelKey, model));
    assert.throws(() => assertInspectedProviderContract(model.modelKey, {...model, schemaSha256: 'f'.repeat(64)}), /drift/i);
    assert.throws(() => assertInspectedProviderContract(model.modelKey, {...model, modelVersion: 'latest'}), /drift/i);
    assert.throws(() => assertInspectedProviderContract(model.modelKey, {...model, endpoint: 'other/model'}), /drift/i);
  }
});

test('safe preset is server-owned and all four mappings fit inspected schema fields', () => {
  for (const model of providerModels) {
    const dto = model.mode === 'image-to-video' ? {...i2v, modelKey: model.modelKey} : {...t2v, modelKey: model.modelKey};
    const input = validateVideoInput(dto);
    const payload = mapProviderInput(input, model, model.mode === 'image-to-video' ? 'https://owned.example/input.png?signature=private' : undefined);
    const schema = JSON.parse(readFileSync(`internal/contracts/providers/${model.modelKey}.schema.json`, 'utf8'));
    const definition = Object.entries(schema.components.schemas).find(([key]) => key === 'Input' || key.endsWith('Input'))?.[1] as {properties: Record<string, unknown>; required: string[]};
    assert.ok(Object.keys(payload).every((key) => key in definition.properties));
    assert.ok(definition.required.every((key) => key in payload));
    assert.equal(payload.resolution, '720p');
    assert.equal(payload.num_frames, 81);
    assert.equal(payload.frames_per_second, 16);
    if (model.provider === 'replicate') {
      assert.equal(payload.disable_safety_checker, false);
      assert.equal(payload.interpolate_output, false);
      if (model.mode === 'image-to-video') assert.equal('aspect_ratio' in payload, false);
      else assert.equal(payload.optimize_prompt, false);
    } else {
      assert.equal(payload.enable_safety_checker, true);
      assert.equal(payload.enable_output_safety_checker, true);
      assert.equal(payload.enable_prompt_expansion, false);
      assert.equal(payload.interpolator_model, 'none');
      assert.equal(payload.num_interpolated_frames, 0);
    }
  }
});

test('mapping rechecks crop consent instead of trusting a forged validated TypeScript object', () => {
  const input = validateVideoInput(i2v);
  const forged = {...input, image: {...input.image!, confirmed: false}} as unknown as typeof input;
  assert.throws(() => mapProviderInput(forged, getProviderModel(input.modelKey), 'https://owned.example/image.png'), /confirm/i);
});

test('accepted historical contracts map after current registry removal, while new admission is rejected', () => {
  for (const model of providerModels) {
    const original = validateVideoInput(model.mode === 'image-to-video' ? {...i2v, modelKey: model.modelKey} : {...t2v, modelKey: model.modelKey});
    const modelKey = `retired-${model.modelKey}`;
    const catalog = Object.freeze({...model, modelKey, preset: Object.freeze({...model.preset})});
    const historicalInput = Object.freeze({...original, modelKey});
    const {preset: _preset, ...publicInput} = historicalInput;
    assert.throws(() => validateVideoInput(publicInput), /unavailable/i);
    const authorizedImageUrl = model.mode === 'image-to-video' ? 'https://owned.example/accepted-crop.png' : undefined;
    const expected = mapProviderInput(original, model, authorizedImageUrl);
    assert.deepEqual(mapProviderInput(historicalInput, catalog, authorizedImageUrl), expected);
  }
});

test('accepted contract mapping refuses unsupported versions and unsupported version-one presets', () => {
  const input = validateVideoInput(t2v);
  const catalog = getProviderModel(input.modelKey);
  assert.throws(() => mapProviderInput(input, {...catalog, catalogVersion: 99} as unknown as typeof catalog), /version/i);
  const preset = {...catalog.preset, numFrames: 161};
  assert.throws(() => mapProviderInput({...input, preset} as unknown as typeof input, {...catalog, preset} as unknown as typeof catalog), /preset/i);
});

test('normalized observations retain an immutable copy of the accepted catalog', () => {
  const catalog = {...getProviderModel('fal-wan22-t2v')};
  const result = normalizeObservation({provider: 'fal', modelKey: catalog.modelKey, requestId: 'request-123', catalog}, {request_id: 'request-123', status: 'IN_PROGRESS'}, now);
  catalog.endpoint = 'other/model';
  assert.equal(result.ref.catalog.endpoint, 'fal-ai/wan/v2.2-a14b/text-to-video');
  assert.ok(Object.isFrozen(result.ref.catalog));
});

function snapshot(input = validateVideoInput(i2v), image = ownedImage) {
  const quote = quoteFor(input.modelKey);
  return freezeSubmissionContext({input, workspaceId, taskId: 'a-task', attemptId: 'an-attempt', attemptNonce: 'persisted-nonce', quote, createdAt: now, authorizedImage: image});
}

function quoteFor(modelId: string) {
  const {quoteHash: _hash, ...original} = createServerQuote('mock-video', '1', {now: new Date(now)});
  const payload = {...original, modelId};
  return {...payload, quoteHash: semanticHash('credit.quote', payload)};
}

test('crop consent binds exact authorized ready asset, workspace, dimensions and crop revision', () => {
  assert.equal(snapshot().input.image?.assetId, imageId);
  for (const replacement of [{workspaceId: 'foreign'}, {assetId: 'foreign'}, {width: 1280}, {cropSha256: 'b'.repeat(64)}, {state: 'staging'}, {kind: 'video'}]) {
    assert.throws(() => snapshot(undefined, {...ownedImage, ...replacement} as typeof ownedImage));
  }
  assert.throws(() => snapshot(validateVideoInput(i2v), null as unknown as typeof ownedImage));
});

test('frozen snapshot retains quote, deadline, endpoint and digests independent of later object changes', () => {
  const input = validateVideoInput(t2v);
  const quote = quoteFor(input.modelKey);
  const context = freezeSubmissionContext({input, quote, workspaceId, taskId: 'task-1', attemptId: 'attempt-1', attemptNonce: 'nonce-1', createdAt: now});
  quote.totalCost = '999';
  assert.equal(context.quote.totalCost, '10');
  assert.equal(context.catalog.endpoint, 'wan-video/wan-2.2-t2v-fast');
  assert.equal(context.deadlines.queueDeadlineAt, '2026-10-01T03:10:00.000Z');
  assert.equal(context.deadlines.overallDeadlineAt, '2026-10-01T04:30:00.000Z');
  assert.match(context.inputSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(context.quote));
  assert.ok(Object.isFrozen(context.catalog));
  assert.equal(JSON.stringify(context).includes('https://'), false);
});

test('submit normalization distinguishes known rejection from transport uncertainty and malformed success', () => {
  assert.deepEqual(normalizeSubmission('replicate', {httpStatus: 201, body: {id: 'prediction-123'}}), {kind: 'accepted', requestId: 'prediction-123'});
  assert.deepEqual(normalizeSubmission('fal', {httpStatus: 200, body: {request_id: 'request-123'}, statusUrl: 'https://queue.fal.run/custom/status/request-123', resultUrl: 'https://queue.fal.run/custom/result/request-123'}), {kind: 'accepted', requestId: 'request-123', statusUrl: 'https://queue.fal.run/custom/status/request-123', resultUrl: 'https://queue.fal.run/custom/result/request-123'});
  assert.equal(normalizeSubmission('fal', {httpStatus: 422, body: {detail: 'invalid'}}).kind, 'definitelyRejected');
  for (const response of [{transportFailure: true}, {httpStatus: 500}, {httpStatus: 429}, {httpStatus: 200, body: {}}]) assert.equal(normalizeSubmission('fal', response).kind, 'unknown');
});

test('completed-with-error is failure and provider output remains a candidate', () => {
  const ref = {provider: 'fal' as const, modelKey: 'fal-wan22-t2v', requestId: 'request-123', catalog: getProviderModel('fal-wan22-t2v')};
  assert.equal(normalizeObservation(ref, {request_id: 'request-123', status: 'COMPLETED', error: 'failed'}, now).status, 'failed');
  assert.equal(normalizeObservation(ref, {request_id: 'request-123', status: 'COMPLETED'}, now).status, 'completed');
  assert.equal(normalizeResult(ref, {request_id: 'request-123', video: {url: 'https://fal.media/video.mp4'}}).kind, 'outputCandidates');
  assert.equal(normalizeResult(ref, {request_id: 'request-123', video: {url: 'file:///private/file'}}).kind, 'unavailable');
  assert.equal(normalizeResult(ref, {request_id: 'request-123', error: 'vendor-private-detail', video: {url: 'https://fal.media/video.mp4'}}).kind, 'failed');
  assert.throws(() => normalizeObservation(ref, {request_id: 'different', status: 'COMPLETED'}, now), /identity/i);
  assert.throws(() => normalizeObservation(ref, {request_id: 'request-123', status: 'succeeded'}, now), /unsupported/i);
  const acceptedCatalog = {...ref.catalog, schemaSha256: 'e'.repeat(64)};
  assert.equal(normalizeObservation({...ref, catalog: acceptedCatalog}, {request_id: 'request-123', status: 'COMPLETED'}, now).ref.catalog.schemaSha256, acceptedCatalog.schemaSha256);
});

test('Mock port delegates deterministic identity and observation to existing Mock domain functions', async () => {
  const submission = submitMock('persisted-client-reference');
  const port = createMockProvider({readState: async () => ({submission, script: {outcome: 'delay', delayPolls: 2}, pollCount: 1})});
  const ref = {provider: 'mock' as const, modelKey: 'mock-video', requestId: submission.providerRequestId, catalog: getProviderModel('mock-video')};
  assert.equal((await port.getStatus(ref)).status, 'running');
  assert.equal((await port.readResult(ref)).kind, 'unavailable');
  const completed = createMockProvider({readState: async () => ({submission, script: {outcome: 'success'}, pollCount: 2})});
  assert.equal((await completed.getStatus(ref)).status, 'completed');
  assert.equal((await completed.readResult(ref)).kind, 'outputCandidates');
  await assert.rejects(() => completed.verifyWebhook(new Uint8Array(), new Headers()), /unsupported/i);
  assert.equal(completed.capabilities('mock-video').liveEnabled, false);
  assert.throws(() => completed.capabilities('fal-wan22-t2v'));
  const input = completed.validate({...t2v, modelKey: 'mock-video'} as Parameters<typeof completed.validate>[0]);
  const context = freezeSubmissionContext({input, quote: quoteFor('mock-video'), workspaceId, taskId: 'mock-task', attemptId: 'mock-attempt', attemptNonce: 'persisted-client-reference', createdAt: now});
  assert.deepEqual(await completed.submit(context), {kind: 'accepted', requestId: submission.providerRequestId});
  const failed = createMockProvider({readState: async () => ({submission, script: {outcome: 'failure'}, pollCount: 1})});
  assert.equal((await failed.getStatus(ref)).status, 'failed');
  assert.deepEqual(await failed.readResult(ref), {kind: 'failed', code: 'mock.provider_failed'});
  await assert.rejects(() => failed.getStatus({...ref, requestId: 'unrelated'}), /identity/i);
});
