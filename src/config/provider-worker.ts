import {providerModels} from './provider-models.ts';

export type ProviderWorkerConfig = Readonly<{
  state: 'paused' | 'active';
  workspaceId: string | null;
  allowCreate: boolean;
  modelKeys: readonly string[];
  pollMs: number;
}>;

export function parseProviderWorkerConfig(input: Readonly<{
  runtimeProfile: string; generationDriver: string; storageDriver: string;
  railwayProjectId: string; expectedProjectId: string; workspaceId: string;
  state: string; allowCreate: string; modelKeys: string; pollMs: string;
}>): ProviderWorkerConfig {
  const state = input.state || 'paused';
  if (state !== 'paused' && state !== 'active') throw new Error('Provider worker state must be paused or active.');
  if (input.allowCreate && !['true', 'false'].includes(input.allowCreate)) throw new Error('Provider worker allow-create must be true or false.');
  const allowCreate = input.allowCreate === 'true';
  const modelKeys = input.modelKeys ? input.modelKeys.split(',').map((key) => key.trim()) : providerModels.map((model) => model.modelKey);
  if (!modelKeys.length || modelKeys.some((key) => !providerModels.some((model) => model.modelKey === key))) throw new Error('Provider worker model allowlist is invalid.');
  const pollMs = input.pollMs ? Number(input.pollMs) : 5_000;
  if (!Number.isInteger(pollMs) || pollMs < 1_000 || pollMs > 30_000) throw new Error('Provider worker poll interval must be between 1000 and 30000 ms.');
  {
    if (input.runtimeProfile !== 'acceptance' || input.generationDriver !== 'provider' || input.storageDriver !== 's3') throw new Error('Provider worker requires the isolated acceptance provider/S3 profile.');
    if (!input.railwayProjectId || !input.expectedProjectId || input.railwayProjectId !== input.expectedProjectId) throw new Error('Provider worker Railway project binding does not match.');
    if (state === 'active' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.workspaceId)) throw new Error('Active provider worker requires an explicit workspace UUID.');
  }
  return Object.freeze({state, workspaceId: state === 'active' ? input.workspaceId : null, allowCreate: state === 'active' && allowCreate, modelKeys: Object.freeze([...new Set(modelKeys)]), pollMs});
}

/** A persisted start fence always wins over a later worker's create permission. */
export function providerWorkerAction(status: string, submissionStarted: boolean, allowCreate: boolean): 'paused' | 'submit' | 'reconcile' | 'poll' | 'materialize' | 'terminal' {
  if (['succeeded', 'failed', 'cancelled'].includes(status)) return 'terminal';
  if (status === 'materializing') return 'materialize';
  if (status === 'submission_unknown' || (status === 'dispatching' && submissionStarted)) return 'reconcile';
  if (status === 'submitted' || status === 'running') return 'poll';
  if (status === 'queued' || status === 'dispatching') return allowCreate ? 'submit' : 'paused';
  throw new Error('Provider worker received an unsupported task state.');
}

/** Reject libpq-style query overrides before pg can resolve a different effective target. */
export function assertPrivateRailwayWorkerDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const literalPrivateDns = host.endsWith('.railway.internal') && host.length <= 253 && host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (!literalPrivateDns || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.railway.internal') || url.port !== '5432' || !url.username || !url.password || url.pathname.length < 2 || url.search || url.hash) {
    throw new Error('Worker database requires an explicit private Railway PostgreSQL target without query overrides.');
  }
}
