import {semanticHash} from '../contracts/http.ts';
import {DomainError} from '../db/contracts.ts';
import type {ModelCapabilities, ProviderCatalogSnapshot, SafePreset} from '../adapters/providers/port.ts';

export const SAFE_VIDEO_PRESET: SafePreset = Object.freeze({resolution: '720p', numFrames: 81, framesPerSecond: 16});

/** Digests bind retained official schemas in internal/contracts/providers, not paid/live account acceptance. */
export const providerModels: readonly ProviderCatalogSnapshot[] = Object.freeze([
  Object.freeze({catalogVersion: 1, modelKey: 'replicate-wan22-t2v', provider: 'replicate', mode: 'text-to-video', endpoint: 'wan-video/wan-2.2-t2v-fast', modelVersion: 'c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d', schemaSha256: 'bb24e298f722cd892bfe9bf608e08796ab249c921b10f87542b47dcdefb89f09', immutableBuild: true, liveEnabled: false, preset: SAFE_VIDEO_PRESET}),
  Object.freeze({catalogVersion: 1, modelKey: 'replicate-wan22-i2v', provider: 'replicate', mode: 'image-to-video', endpoint: 'wan-video/wan-2.2-i2v-fast', modelVersion: '4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea', schemaSha256: '469876007a77a8e92e9879c714f1273e003deac577a4bd6e699c1eff44440b6c', immutableBuild: true, liveEnabled: false, preset: SAFE_VIDEO_PRESET}),
  Object.freeze({catalogVersion: 1, modelKey: 'fal-wan22-t2v', provider: 'fal', mode: 'text-to-video', endpoint: 'fal-ai/wan/v2.2-a14b/text-to-video', modelVersion: null, schemaSha256: 'b23b17eb18956feaaa318cfb77bf8ad7c9ff7af560fe274118bbf594a8a654c7', immutableBuild: false, liveEnabled: false, preset: SAFE_VIDEO_PRESET}),
  Object.freeze({catalogVersion: 1, modelKey: 'fal-wan22-i2v', provider: 'fal', mode: 'image-to-video', endpoint: 'fal-ai/wan/v2.2-a14b/image-to-video', modelVersion: null, schemaSha256: '012030973ffd700e00516d016e37996b10dd1b969fd2c79da21c92c8e130cef5', immutableBuild: false, liveEnabled: false, preset: SAFE_VIDEO_PRESET}),
]);

const mockModel: ProviderCatalogSnapshot = Object.freeze({
  catalogVersion: 1, modelKey: 'mock-video', provider: 'mock', mode: 'text-to-video', endpoint: 'local/persistent-mock-v1',
  modelVersion: 'local-mock-v1', schemaSha256: semanticHash('provider.mock.contract.v1', SAFE_VIDEO_PRESET),
  immutableBuild: false, liveEnabled: false, preset: SAFE_VIDEO_PRESET,
});

export function getProviderModel(modelKey: string): ProviderCatalogSnapshot {
  const model = modelKey === mockModel.modelKey ? mockModel : providerModels.find((entry) => entry.modelKey === modelKey);
  if (!model) throw new DomainError('VALIDATION', 'The requested provider model is unavailable.');
  return model;
}

export function providerCapabilities(modelKey: string): ModelCapabilities {
  const model = getProviderModel(modelKey);
  return Object.freeze({
    modelKey, modes: Object.freeze([model.mode]), aspectRatios: Object.freeze(['16:9', '9:16'] as const),
    preset: model.preset, requiresOwnedCrop: model.mode === 'image-to-video', liveEnabled: model.liveEnabled,
  });
}

/** A contract recheck may block new submissions; it never silently selects a new version or schema. */
export function assertInspectedProviderContract(modelKey: string, observed: Readonly<{endpoint: string; modelVersion: string | null; schemaSha256: string}>): void {
  const model = getProviderModel(modelKey);
  if (observed.endpoint !== model.endpoint || observed.modelVersion !== model.modelVersion || observed.schemaSha256 !== model.schemaSha256) {
    throw new DomainError('CONFLICT', 'Provider contract drift requires an evidence-backed review before new submissions.');
  }
}
