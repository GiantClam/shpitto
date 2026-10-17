export type AspectRatio = '16:9' | '9:16';
export type VideoInputMode = 'text-to-video' | 'image-to-video';
export type CropScope = Readonly<{workspaceId: string; modelId: string; catalogVersion: number; aspectRatio: AspectRatio}>;
export type CropRevision = CropScope & Readonly<{revision: number}>;
export type NormalizedCrop = CropRevision & Readonly<{sha256: string; width: number; height: number}>;
export type ReadyCrop = NormalizedCrop & Readonly<{assetId: string; assetWorkspaceId: string; assetState: 'ready'}>;
export type CropConsent = ReadyCrop & Readonly<{confirmed: true}>;
export type PublicGenerationQuote = Readonly<{modelId: string; catalogVersion: number; quantity: string; unitCost: string; totalCost: string; issuedAt: string; quoteHash: string}>;
/** Server-supplied, already admitted choices and quotes; never a provider catalog snapshot. */
export type GenerationModelChoice = Readonly<{label: string; mode: VideoInputMode; quote: PublicGenerationQuote}>;

export function generationChoicesForMode(choices: readonly GenerationModelChoice[], mode: VideoInputMode): readonly GenerationModelChoice[] {
  return choices.filter((choice) => choice.mode === mode);
}

export function selectGenerationModel(choices: readonly GenerationModelChoice[], mode: VideoInputMode, preferredModelId?: string): GenerationModelChoice | null {
  const available = generationChoicesForMode(choices, mode);
  return available.find((choice) => choice.quote.modelId === preferredModelId) ?? available[0] ?? null;
}

export function cropScopeKey(scope: CropScope): string {
  return JSON.stringify([scope.workspaceId, scope.modelId, scope.catalogVersion, scope.aspectRatio]);
}

export function sameCropRevision(current: CropRevision, other: CropRevision): boolean {
  return cropScopeKey(current) === cropScopeKey(other) && current.revision === other.revision;
}

export function centerCrop(width: number, height: number, aspectRatio: AspectRatio) {
  if (aspectRatio !== '16:9' && aspectRatio !== '9:16') throw new Error('Choose a supported aspect ratio.');
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('The image has invalid dimensions.');
  const [outputWidth, outputHeight] = aspectRatio === '16:9' ? [1280, 720] : [720, 1280];
  const cropWidth = Math.min(width, height * outputWidth / outputHeight);
  const cropHeight = Math.min(height, width * outputHeight / outputWidth);
  return {x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight, outputWidth, outputHeight};
}

function validNormalized(crop: NormalizedCrop): boolean {
  const expected = centerCrop(1280, 1280, crop.aspectRatio);
  return Number.isSafeInteger(crop.revision) && crop.revision > 0 && /^[a-f0-9]{64}$/.test(crop.sha256)
    && crop.width === expected.outputWidth && crop.height === expected.outputHeight;
}

const ASSET_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

/** Only a successful owned upload endpoint response may be passed here. */
export function bindReadyCrop(current: CropRevision, crop: NormalizedCrop, response: unknown): ReadyCrop | null {
  if (!sameCropRevision(current, crop)) return null;
  const upload = response as {assetId?: unknown; sha256?: unknown} | null;
  if (!validNormalized(crop) || !upload || typeof upload.assetId !== 'string' || !ASSET_ID.test(upload.assetId) || upload.sha256 !== crop.sha256) {
    throw new Error('The uploaded image does not match the normalized crop. Choose the image again.');
  }
  return {...current, sha256: crop.sha256, width: crop.width, height: crop.height, assetId: upload.assetId, assetWorkspaceId: current.workspaceId, assetState: 'ready'};
}

export function confirmCrop(current: CropRevision, crop: ReadyCrop): CropConsent | null {
  if (!sameCropRevision(current, crop) || !validNormalized(crop) || !ASSET_ID.test(crop.assetId) || crop.assetWorkspaceId !== current.workspaceId || crop.assetState !== 'ready') return null;
  return {...crop, confirmed: true};
}

export function hasConfirmedCrop(current: CropRevision, crop: CropConsent | null): boolean {
  return crop?.confirmed === true && confirmCrop(current, crop) !== null;
}

export function buildGenerationInput(current: CropRevision, mode: VideoInputMode, prompt: string, consent: CropConsent | null) {
  const text = prompt.trim();
  if (!text || prompt.length > 10000 || /[\u0000-\u001f\u007f]/.test(prompt)) throw new Error('Enter a valid prompt of up to 10,000 characters without control characters or line breaks.');
  centerCrop(1280, 1280, current.aspectRatio);
  if (mode === 'text-to-video') return {prompt: text, options: {aspectRatio: current.aspectRatio}};
  if (mode !== 'image-to-video' || !hasConfirmedCrop(current, consent)) throw new Error('Upload and confirm the current normalized image crop first.');
  return {prompt: text, assetId: consent!.assetId, assetWorkspaceId: current.workspaceId, assetState: 'ready' as const,
    options: {aspectRatio: current.aspectRatio, cropSha256: consent!.sha256, cropConfirmed: true}};
}

export function buildGenerationRequest(current: CropRevision, model: GenerationModelChoice, prompt: string, consent: CropConsent | null) {
  const {modelId, catalogVersion, quantity, unitCost, totalCost, issuedAt, quoteHash} = model.quote;
  if (modelId !== current.modelId || catalogVersion !== current.catalogVersion) throw new Error('Refresh the selected model quote before generating.');
  return {quote: {modelId, catalogVersion, quantity, unitCost, totalCost, issuedAt, quoteHash}, mode: model.mode, input: buildGenerationInput(current, model.mode, prompt, consent)};
}
