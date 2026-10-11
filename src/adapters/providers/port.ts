import type {ServerQuote} from '../../config/models.ts';

export type ProviderName = 'mock' | 'replicate' | 'fal';
export type VideoMode = 'text-to-video' | 'image-to-video';
export type AspectRatio = '16:9' | '9:16';

/** Public input contains only product choices and a crop confirmation, never vendor parameters or URLs. */
export type VideoInput = Readonly<{
  modelKey: string;
  mode: VideoMode;
  prompt: string;
  aspectRatio: AspectRatio;
  image?: Readonly<{assetId: string; cropSha256: string; confirmed: true}>;
}>;

export type SafePreset = Readonly<{resolution: '720p'; numFrames: 81; framesPerSecond: 16}>;
export type ValidatedVideoInput = VideoInput & Readonly<{preset: SafePreset}>;

export type ModelCapabilities = Readonly<{
  modelKey: string;
  modes: readonly VideoMode[];
  aspectRatios: readonly AspectRatio[];
  preset: SafePreset;
  requiresOwnedCrop: boolean;
  liveEnabled: boolean;
}>;

export type ProviderCatalogSnapshot = Readonly<{
  catalogVersion: 1;
  modelKey: string;
  provider: ProviderName;
  mode: VideoMode;
  endpoint: string;
  modelVersion: string | null;
  schemaSha256: string;
  immutableBuild: boolean;
  liveEnabled: false;
  preset: SafePreset;
}>;

/** Construct only after the asset module authorizes access and verifies normalized crop metadata. */
export type AuthorizedOwnedImage = Readonly<{
  assetId: string;
  workspaceId: string;
  state: 'ready';
  kind: 'image';
  width: number;
  height: number;
  cropSha256: string;
}>;

export type SubmissionContext = Readonly<{
  workspaceId: string;
  taskId: string;
  attemptId: string;
  attemptNonce: string;
  input: ValidatedVideoInput;
  inputSha256: string;
  catalog: ProviderCatalogSnapshot;
  quote: ServerQuote;
  createdAt: string;
  deadlines: Readonly<{
    policyVersion: 1;
    queueDeadlineAt: string;
    overallDeadlineAt: string;
    executionBudgetSeconds: number;
    unknownRecoveryBudgetSeconds: 3600;
    maxReconciliationProbes: 24;
    unknownAlertAfterSeconds: 1800;
    materializationBudgetSeconds: 1800;
    maxMaterializationAttempts: 8;
  }>;
}>;

/** Evidence codes are sanitized classifications, never raw vendor bodies, prompts, or signed locations. */
export type ProviderEvidence = Readonly<{code: string; httpStatus?: number}>;
export type SubmitResult =
  | Readonly<{kind: 'accepted'; requestId: string; statusUrl?: string; resultUrl?: string}>
  | Readonly<{kind: 'definitelyRejected'; code: string}>
  | Readonly<{kind: 'unknown'; evidence: ProviderEvidence}>;

/** Reconciliation uses the accepted attempt's catalog, never the current mutable registry. */
export type ProviderRequestRef = Readonly<{provider: ProviderName; modelKey: string; requestId: string; catalog: ProviderCatalogSnapshot; statusUrl?: string; resultUrl?: string}>;
export type ProviderObservation = Readonly<{
  ref: ProviderRequestRef;
  status: 'queued' | 'running' | 'completed' | 'failed';
  observedAt: string;
  evidence: ProviderEvidence;
}>;

/** Internal candidates must pass safe fetching, MIME/size/media checks and owned materialization before delivery. */
export type OutputCandidate =
  | Readonly<{kind: 'remote'; url: string}>
  | Readonly<{kind: 'mock'; objectKey: string}>;
export type ProviderResult =
  | Readonly<{kind: 'outputCandidates'; candidates: readonly OutputCandidate[]}>
  | Readonly<{kind: 'failed'; code: string}>
  | Readonly<{kind: 'unavailable'; evidence: ProviderEvidence}>;

export type VerifiedObservation = Readonly<{
  observation: ProviderObservation;
  eventId: string;
  accountId: string;
  attemptNonce: string;
  authenticatedAt: string;
}>;

/** Adapters normalize protocols only. Domain commands retain task, reservation and settlement authority. */
export interface ProviderPort {
  capabilities(modelKey: string): ModelCapabilities;
  validate(input: VideoInput): ValidatedVideoInput;
  submit(attempt: SubmissionContext): Promise<SubmitResult>;
  getStatus(ref: ProviderRequestRef): Promise<ProviderObservation>;
  readResult(ref: ProviderRequestRef): Promise<ProviderResult>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers, ref?: ProviderRequestRef): Promise<VerifiedObservation>;
}
