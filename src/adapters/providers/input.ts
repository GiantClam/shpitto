import {getProviderModel} from '../../config/provider-models.ts';
import type {ServerQuote} from '../../config/models.ts';
import {canonicalJson, semanticHash} from '../../contracts/http.ts';
import {DomainError} from '../../db/contracts.ts';
import {DEFAULT_GENERATION_POLICY} from '../../modules/generation/create.ts';
import type {AuthorizedOwnedImage, ProviderCatalogSnapshot, SubmissionContext, ValidatedVideoInput} from './port.ts';

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DomainError('VALIDATION', 'Video input must be a plain object.');
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new DomainError('VALIDATION', 'Video input contains an unsupported field.');
  return value as Record<string, unknown>;
}

export function validateVideoInput(value: unknown): ValidatedVideoInput {
  const input = object(value, ['modelKey', 'mode', 'prompt', 'aspectRatio', 'image']);
  if (typeof input.modelKey !== 'string') throw new DomainError('VALIDATION', 'A model key is required.');
  return validateInputForCatalog(input, getProviderModel(input.modelKey));
}

/** Version-one semantics are stable even after the current registry or its defaults change. */
function assertSupportedContract(model: ProviderCatalogSnapshot): void {
  if (model.catalogVersion !== 1) throw new DomainError('VALIDATION', 'The persisted provider contract version is unsupported.');
  const preset = object(model.preset, ['resolution', 'numFrames', 'framesPerSecond']);
  if (preset.resolution !== '720p' || preset.numFrames !== 81 || preset.framesPerSecond !== 16) {
    throw new DomainError('VALIDATION', 'The persisted version-one provider preset is unsupported.');
  }
  if (!['mock', 'replicate', 'fal'].includes(model.provider) || !['text-to-video', 'image-to-video'].includes(model.mode)) {
    throw new DomainError('VALIDATION', 'The persisted provider mapping is unsupported.');
  }
}

function validateInputForCatalog(value: unknown, model: ProviderCatalogSnapshot): ValidatedVideoInput {
  assertSupportedContract(model);
  const input = object(value, ['modelKey', 'mode', 'prompt', 'aspectRatio', 'image']);
  if (input.modelKey !== model.modelKey || input.mode !== model.mode) throw new DomainError('VALIDATION', 'The selected model does not support this input identity or mode.');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 10_000 || /[\u0000-\u001f\u007f]/.test(input.prompt)) {
    throw new DomainError('VALIDATION', 'A bounded, nonempty video prompt is required.');
  }
  if (input.aspectRatio !== '16:9' && input.aspectRatio !== '9:16') throw new DomainError('VALIDATION', 'The aspect ratio is unsupported.');
  const common = {modelKey: model.modelKey, mode: model.mode, prompt: input.prompt.trim(), aspectRatio: input.aspectRatio, preset: Object.freeze({...model.preset})};
  if (model.mode === 'text-to-video') {
    if (input.image !== undefined) throw new DomainError('VALIDATION', 'Text-to-video does not accept an input image.');
    return Object.freeze(common) as ValidatedVideoInput;
  }
  const image = object(input.image, ['assetId', 'cropSha256', 'confirmed']);
  if (typeof image.assetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(image.assetId)) {
    throw new DomainError('VALIDATION', 'The input image requires an owned asset identity.');
  }
  if (image.confirmed !== true || typeof image.cropSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.cropSha256)) {
    throw new DomainError('VALIDATION', 'Confirm the exact normalized image crop before generation.');
  }
  return Object.freeze({...common, image: Object.freeze({assetId: image.assetId, cropSha256: image.cropSha256, confirmed: true})}) as ValidatedVideoInput;
}

function assertOwnedCrop(input: ValidatedVideoInput, workspaceId: string, image?: AuthorizedOwnedImage): void {
  if (!input.image) return;
  const [width, height] = input.aspectRatio === '16:9' ? [1280, 720] : [720, 1280];
  if (!image || image.workspaceId !== workspaceId || image.assetId !== input.image.assetId || image.state !== 'ready' || image.kind !== 'image' || image.width !== width || image.height !== height || image.cropSha256 !== input.image.cropSha256) {
    throw new DomainError('FORBIDDEN', 'The confirmed crop must match an authorized, ready normalized workspace image.');
  }
}

/** Called by the trusted domain before dispatch; storage/transaction persistence remains the domain's responsibility. */
export function freezeSubmissionContext(args: Readonly<{
  input: ValidatedVideoInput; workspaceId: string; taskId: string; attemptId: string; attemptNonce: string;
  quote: ServerQuote; createdAt: string; authorizedImage?: AuthorizedOwnedImage;
}>): SubmissionContext {
  const {preset: _preset, ...publicInput} = args.input;
  const input = validateVideoInput(publicInput);
  for (const value of [args.workspaceId, args.taskId, args.attemptId, args.attemptNonce]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._~-]{1,200}$/.test(value)) throw new DomainError('VALIDATION', 'Persisted submission correlation is required.');
  }
  assertOwnedCrop(input, args.workspaceId, args.authorizedImage);
  const created = new Date(args.createdAt);
  if (Number.isNaN(created.getTime())) throw new DomainError('VALIDATION', 'A valid persisted creation timestamp is required.');
  const {quoteHash, ...quotePayload} = args.quote;
  if (args.quote.modelId !== input.modelKey || args.quote.quantity !== '1' || !/^[1-9][0-9]*$/.test(args.quote.unitCost) || args.quote.totalCost !== args.quote.unitCost || quoteHash !== semanticHash('credit.quote', quotePayload)) {
    throw new DomainError('VALIDATION', 'A matching authoritative single-video quote is required.');
  }
  const catalog = getProviderModel(input.modelKey);
  const deadlines = Object.freeze({
    policyVersion: DEFAULT_GENERATION_POLICY.policyVersion,
    queueDeadlineAt: new Date(created.getTime() + DEFAULT_GENERATION_POLICY.queueBudgetSeconds * 1000).toISOString(),
    overallDeadlineAt: new Date(created.getTime() + DEFAULT_GENERATION_POLICY.overallBudgetSeconds * 1000).toISOString(),
    executionBudgetSeconds: DEFAULT_GENERATION_POLICY.executionBudgetSeconds,
    unknownRecoveryBudgetSeconds: 3600, maxReconciliationProbes: 24, unknownAlertAfterSeconds: 1800,
    materializationBudgetSeconds: 1800, maxMaterializationAttempts: 8,
  } as const);
  return Object.freeze({
    workspaceId: args.workspaceId, taskId: args.taskId, attemptId: args.attemptId, attemptNonce: args.attemptNonce,
    input, inputSha256: semanticHash('provider.input.v1', input), catalog, quote: Object.freeze({...args.quote}),
    createdAt: created.toISOString(), deadlines,
  });
}

/** The signed URL is resolved server-side only after owned-crop authorization; it is never part of the public DTO. */
export function mapProviderInput(input: ValidatedVideoInput, catalog: ProviderCatalogSnapshot, authorizedImageUrl?: string): Readonly<Record<string, string | number | boolean>> {
  assertSupportedContract(catalog);
  if (input.modelKey !== catalog.modelKey || input.mode !== catalog.mode || canonicalJson(input.preset) !== canonicalJson(catalog.preset)) {
    throw new DomainError('VALIDATION', 'The input does not match the persisted model contract.');
  }
  const {preset: _preset, ...publicInput} = input;
  validateInputForCatalog(publicInput, catalog);
  if (catalog.provider === 'mock') throw new DomainError('VALIDATION', 'Mock generation does not use a vendor payload.');
  if (input.mode === 'image-to-video') {
    let url: URL;
    try { url = new URL(authorizedImageUrl ?? ''); } catch { throw new DomainError('VALIDATION', 'An authorized image URL is required.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('VALIDATION', 'The authorized image URL must use HTTPS.');
  }
  const common = {prompt: input.prompt, resolution: input.preset.resolution, num_frames: input.preset.numFrames, frames_per_second: input.preset.framesPerSecond};
  if (catalog.provider === 'replicate') {
    const safety = {...common, interpolate_output: false, disable_safety_checker: false};
    return Object.freeze(input.mode === 'image-to-video' ? {...safety, image: authorizedImageUrl!} : {...safety, aspect_ratio: input.aspectRatio, optimize_prompt: false});
  }
  const fal = {...common, aspect_ratio: input.aspectRatio, interpolator_model: 'none', num_interpolated_frames: 0, enable_safety_checker: true, enable_output_safety_checker: true, enable_prompt_expansion: false};
  return Object.freeze(input.mode === 'image-to-video' ? {...fal, image_url: authorizedImageUrl!} : fal);
}
