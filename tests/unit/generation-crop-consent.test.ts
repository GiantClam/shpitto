import assert from 'node:assert/strict';
import {test} from 'node:test';
import {centerCrop, bindReadyCrop, confirmCrop, buildGenerationInput, buildGenerationRequest, type CropRevision, type NormalizedCrop} from '../../src/components/generation/crop-consent.ts';

const revision: CropRevision = {workspaceId: 'workspace-one', modelId: 'catalog-i2v', catalogVersion: 1, aspectRatio: '16:9', revision: 2};
const normalized: NormalizedCrop = {...revision, sha256: 'a'.repeat(64), width: 1280, height: 720};
const upload = {assetId: '10d8337e-7816-4d03-9a0e-5bca9937f4c5', sha256: normalized.sha256};

test('center crop previews the exact approved landscape and portrait dimensions', () => {
  assert.deepEqual(centerCrop(1600, 1200, '16:9'), {x: 0, y: 150, width: 1600, height: 900, outputWidth: 1280, outputHeight: 720});
  assert.deepEqual(centerCrop(1600, 1200, '9:16'), {x: 462.5, y: 0, width: 675, height: 1200, outputWidth: 720, outputHeight: 1280});
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => centerCrop(width, 1200, '16:9'));
});

test('confirmation binds the ready upload to exact normalized bytes and current revision', () => {
  const ready = bindReadyCrop(revision, normalized, {...upload, objectKey: 'never-copy-this'});
  assert.ok(ready);
  assert.equal('objectKey' in ready, false);
  const consent = confirmCrop(revision, ready);
  assert.ok(consent);
  assert.equal(consent.assetState, 'ready');
  assert.equal(consent.assetWorkspaceId, revision.workspaceId);
  assert.equal(consent.confirmed, true);
  for (const patch of [{assetWorkspaceId: 'workspace-two'}, {assetState: 'pending'}, {assetId: '../foreign'}]) {
    assert.equal(confirmCrop(revision, {...ready, ...patch} as typeof ready), null);
  }
  for (const bad of [{...upload, sha256: 'b'.repeat(64)}, {...upload, assetId: '../foreign'}, null]) {
    assert.throws(() => bindReadyCrop(revision, normalized, bad));
  }
  for (const bad of [{...normalized, width: 720}, {...normalized, height: 1280}, {...normalized, sha256: 'not-a-digest'}]) {
    assert.throws(() => bindReadyCrop(revision, bad, upload));
  }
});

test('source, aspect, workspace, model and catalog changes reject stale completion and consent', () => {
  const ready = bindReadyCrop(revision, normalized, upload)!;
  const changes: Partial<CropRevision>[] = [{revision: 3}, {aspectRatio: '9:16'}, {workspaceId: 'workspace-two'}, {modelId: 'other-model'}, {catalogVersion: 2}];
  for (const change of changes) {
    const current = {...revision, ...change};
    assert.equal(bindReadyCrop(current, normalized, upload), null);
    assert.equal(confirmCrop(current, ready), null);
    assert.throws(() => buildGenerationInput(current, 'image-to-video', 'A quiet landscape', confirmCrop(revision, ready)));
  }
});

test('generation payload allows only public aspect and confirmed owned-crop fields', () => {
  const ready = bindReadyCrop(revision, normalized, upload)!;
  const consent = confirmCrop(revision, ready);
  assert.throws(() => buildGenerationInput(revision, 'image-to-video', 'A quiet landscape', null));
  assert.throws(() => buildGenerationInput(revision, 'image-to-video', 'A quiet landscape', {...consent!, confirmed: false} as never));
  assert.deepEqual(buildGenerationInput(revision, 'image-to-video', '  A quiet landscape  ', consent), {
    prompt: 'A quiet landscape', assetId: upload.assetId, assetWorkspaceId: 'workspace-one', assetState: 'ready',
    options: {aspectRatio: '16:9', cropSha256: 'a'.repeat(64), cropConfirmed: true},
  });
  assert.deepEqual(buildGenerationInput(revision, 'text-to-video', 'A quiet landscape', consent), {
    prompt: 'A quiet landscape', options: {aspectRatio: '16:9'},
  });
  for (const prompt of [' ', 'x'.repeat(10001), 'unsafe\u0000', 'unsafe\nnewline']) assert.throws(() => buildGenerationInput(revision, 'text-to-video', prompt, null));
});

test('catalog selection uses its matching authoritative quote and projects only public fields', () => {
  const quote = {modelId: revision.modelId, catalogVersion: 1, quantity: '1', unitCost: '10', totalCost: '10', issuedAt: '2026-10-15T00:00:00.000Z', quoteHash: 'quote-digest'};
  const choice = {label: 'Approved video', mode: 'text-to-video' as const, quote: {...quote, endpoint: 'never-serialize'}, providerSecret: 'never-serialize'};
  assert.deepEqual(buildGenerationRequest(revision, choice, 'A quiet landscape', null), {quote, mode: 'text-to-video', input: {prompt: 'A quiet landscape', options: {aspectRatio: '16:9'}}});
  assert.throws(() => buildGenerationRequest({...revision, modelId: 'other'}, choice, 'A quiet landscape', null));
  assert.throws(() => buildGenerationRequest({...revision, catalogVersion: 2}, choice, 'A quiet landscape', null));
});
