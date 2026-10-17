import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CREATION_DRAFT_KEY, clearCreationDraft, parseCreationDraft, readCreationDraft, saveCreationDraft, selectCreationDraftModel, type CreationDraft} from '../../src/components/generation/creation-draft.ts';
import {buildGenerationRequest, generationChoicesForMode, selectGenerationModel, type GenerationModelChoice} from '../../src/components/generation/crop-consent.ts';

const draft: CreationDraft = {version: 1, prompt: '  A quiet landscape  ', mode: 'image-to-video', aspectRatio: '9:16'};
const textModel: GenerationModelChoice = {label: 'Admitted text model', mode: 'text-to-video',
  quote: {modelId: 'admitted-text', catalogVersion: 3, quantity: '1', unitCost: '8', totalCost: '8', issuedAt: '2026-10-17T00:00:00.000Z', quoteHash: 'server-text-quote'}};
const imageModel: GenerationModelChoice = {label: 'Admitted image model', mode: 'image-to-video', quote: {...textModel.quote, modelId: 'admitted-image', quoteHash: 'server-image-quote'}};

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value);}, removeItem: (key) => {values.delete(key);}};
}

test('draft parsing validates the versioned shape and reconstructs only creative fields', () => {
  const untrusted = {...draft, modelId: 'unadmitted-model', quote: {totalCost: '0'}, prices: [0], workspaceId: 'foreign-workspace',
    consent: {confirmed: true}, assetId: 'foreign-asset', assetWorkspaceId: 'foreign-workspace', options: {cropConfirmed: true}};
  assert.deepEqual(parseCreationDraft(JSON.stringify(untrusted)), draft);
  assert.deepEqual(parseCreationDraft(JSON.stringify({...draft, mode: 'text-to-video', aspectRatio: '16:9', prompt: ''})),
    {version: 1, prompt: '', mode: 'text-to-video', aspectRatio: '16:9'});
  assert.equal(parseCreationDraft(JSON.stringify({...draft, prompt: 'x'.repeat(10000)}))?.prompt.length, 10000);
  for (const value of [null, [], true, 1, 'draft', {}, {...draft, version: 2}, {...draft, version: '1'},
    {...draft, prompt: null}, {...draft, prompt: 1}, {...draft, prompt: 'x'.repeat(10001)},
    {...draft, mode: 'text-to-image'}, {...draft, mode: 'IMAGE-TO-VIDEO'}, {...draft, aspectRatio: '1:1'}]) {
    assert.equal(parseCreationDraft(JSON.stringify(value)), null);
  }
  for (const field of ['version', 'prompt', 'mode', 'aspectRatio']) {
    assert.equal(parseCreationDraft(JSON.stringify(Object.fromEntries(Object.entries(draft).filter(([key]) => key !== field)))), null);
  }
  for (const raw of [null, '', 'not JSON', '{', JSON.stringify(draft) + ' trailing']) assert.equal(parseCreationDraft(raw), null);
});

test('session draft handoff saves only allowed fields and clears only the pending draft', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated-session-state', 'preserve');
  assert.equal(readCreationDraft(storage), null);
  const untrusted = {...draft, modelId: 'unadmitted-model', quote: {totalCost: '0'}, prices: [0], workspaceId: 'foreign',
    assetId: 'foreign-asset', consent: {confirmed: true}, toJSON() {throw new Error('Must not serialize untrusted fields');}};
  assert.equal(saveCreationDraft(storage, untrusted), true);
  assert.deepEqual(JSON.parse(storage.getItem(CREATION_DRAFT_KEY)!), draft);
  assert.deepEqual(readCreationDraft(storage), draft);
  assert.deepEqual(readCreationDraft(storage), draft);
  assert.equal(clearCreationDraft(storage), true);
  assert.equal(readCreationDraft(storage), null);
  assert.equal(clearCreationDraft(storage), true);
  assert.equal(storage.getItem('unrelated-session-state'), 'preserve');
});

test('invalid and corrupt drafts are never returned or written', () => {
  const storage = memoryStorage();
  for (const raw of ['{', 'null', '[]', JSON.stringify({...draft, version: 2}), JSON.stringify({...draft, prompt: 'x'.repeat(10001)})]) {
    storage.setItem(CREATION_DRAFT_KEY, raw);
    assert.equal(readCreationDraft(storage), null);
    assert.equal(storage.getItem(CREATION_DRAFT_KEY), null);
  }
  for (const value of [null, {...draft, prompt: 42}, {...draft, mode: 'unknown'}, {...draft, aspectRatio: '1:1'}, {...draft, version: 2}]) {
    assert.equal(saveCreationDraft(storage, value as CreationDraft), false);
    assert.equal(storage.getItem(CREATION_DRAFT_KEY), null);
  }
});

test('unavailable storage, quota errors and blocked cleanup never throw', () => {
  const blocked = () => {throw new Error('Storage is unavailable');};
  for (const storage of [null, undefined, {getItem: blocked, setItem: blocked, removeItem: blocked}]) {
    assert.equal(saveCreationDraft(storage, draft), false);
    assert.equal(readCreationDraft(storage), null);
    assert.equal(clearCreationDraft(storage), false);
  }
  const storage = memoryStorage();
  assert.equal(saveCreationDraft({...storage, setItem() {throw new DOMException('Full', 'QuotaExceededError');}}, draft), false);
  storage.setItem(CREATION_DRAFT_KEY, 'corrupt');
  assert.equal(readCreationDraft({...storage, removeItem: blocked}), null);
  assert.equal(clearCreationDraft({...storage, removeItem: blocked}), false);
  assert.equal(saveCreationDraft(storage, {...draft, get prompt(): string {throw new Error('Invalid draft');}}), false);
});

test('restoration selects only an admitted model of the requested mode and preserves the server quote', () => {
  const restored = parseCreationDraft(JSON.stringify({...draft, modelId: textModel.quote.modelId, quote: {...textModel.quote, totalCost: '0'},
    workspaceId: 'foreign', assetId: 'foreign-asset', consent: {confirmed: true}}))!;
  assert.equal(selectCreationDraftModel(restored, [textModel, imageModel]), imageModel);
  const textDraft = {...restored, mode: 'text-to-video' as const};
  const selected = selectCreationDraftModel(textDraft, [imageModel, textModel])!;
  assert.equal(selected, textModel);
  assert.deepEqual(buildGenerationRequest({workspaceId: 'current-workspace', modelId: selected.quote.modelId, catalogVersion: 3,
    aspectRatio: textDraft.aspectRatio, revision: 0}, selected, textDraft.prompt, null), {
    quote: textModel.quote, mode: 'text-to-video', input: {prompt: 'A quiet landscape', options: {aspectRatio: '9:16'}},
  });
  assert.throws(() => buildGenerationRequest({workspaceId: 'current-workspace', modelId: imageModel.quote.modelId, catalogVersion: 3,
    aspectRatio: restored.aspectRatio, revision: 0}, imageModel, restored.prompt, null), /Upload and confirm/);
});

test('restoration never falls back to a different mode or an unadmitted draft model', () => {
  assert.equal(selectCreationDraftModel(draft, [textModel]), null);
  assert.equal(selectCreationDraftModel({...draft, mode: 'text-to-video'}, [imageModel]), null);
  assert.equal(selectCreationDraftModel(draft, []), null);
  assert.equal(selectCreationDraftModel({...draft, modelId: 'invented'} as CreationDraft, []), null);
});

test('studio mode selection filters choices and keeps the selected provider model inside that mode', () => {
  const choices = [textModel, imageModel];
  assert.deepEqual(generationChoicesForMode(choices, 'text-to-video'), [textModel]);
  assert.deepEqual(generationChoicesForMode(choices, 'image-to-video'), [imageModel]);
  assert.equal(selectGenerationModel(choices, 'image-to-video', textModel.quote.modelId), imageModel);
  assert.equal(selectGenerationModel(choices, 'text-to-video', textModel.quote.modelId), textModel);
  assert.equal(selectGenerationModel([textModel], 'image-to-video'), null);
});
