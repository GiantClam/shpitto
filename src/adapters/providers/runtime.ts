import {getProviderCredentials, getServerEnv} from '../../config/env.ts';
import {getProviderModel} from '../../config/provider-models.ts';
import {DomainError} from '../../db/contracts.ts';
import {createProviderHttpTransport} from './http.ts';
import {createFalProvider} from './fal/index.ts';
import {createReplicateProvider} from './replicate/index.ts';
import {confirmReplicateAccountBinding} from './replicate/account-binding.ts';
import type {ReplicateWebhookOptions} from './replicate/webhook.ts';
import type {AcceptanceSubmissionScope, ProviderPort} from './port.ts';

// Share transport identity so only an exact, fresh account preflight can be cached.
const transport = createProviderHttpTransport();

export function createRuntimeProvider(modelKey: string, scope: AcceptanceSubmissionScope, resolveOwnedImageUrl?: (image: Readonly<{assetId: string; cropSha256: string}>) => Promise<string>): ProviderPort {
  const env = getServerEnv();
  const keys = getProviderCredentials();
  const model = getProviderModel(modelKey);
  if (env.runtimeProfile !== 'acceptance' || !scope.modelKeys.includes(modelKey)) throw new DomainError('FORBIDDEN', 'Provider runtime is restricted to the acceptance model allowlist.');
  if (model.provider === 'replicate') return createReplicateProvider({mode: 'live', token: keys.replicateToken, transport, acceptanceScope: scope, webhookBaseUrl: keys.replicateWebhookBaseUrl, webhookSecret: env.replicateWebhookSecret, webhookAccountId: env.replicateWebhookAccountId || undefined, resolveOwnedImageUrl});
  if (model.provider === 'fal') return createFalProvider({mode: 'live', token: keys.falToken, transport, acceptanceScope: scope, webhookBaseUrl: keys.falWebhookBaseUrl, webhookAccountId: env.falWebhookAccountId || undefined, resolveOwnedImageUrl});
  throw new DomainError('FORBIDDEN', 'The real provider runtime cannot run Mock tasks.');
}

export function assertConfiguredProviderCallback(provider: string): void {
  const env = getServerEnv();
  const keys = getProviderCredentials();
  const base = provider === 'replicate' ? keys.replicateWebhookBaseUrl : keys.falWebhookBaseUrl;
  let url: URL;
  try { url = new URL(base); } catch { throw new DomainError('INFRASTRUCTURE', 'Provider callback URL is not configured.'); }
  if (url.origin !== new URL(env.appUrl).origin || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== `/api/webhooks/${provider}`) throw new DomainError('FORBIDDEN', 'Provider callback URL must point to this application HTTPS endpoint.');
  if (provider === 'fal' && !env.falWebhookAccountId) throw new DomainError('INFRASTRUCTURE', 'Fal account binding must be configured before a paid request.');
  if (provider === 'replicate' && !env.replicateWebhookSecret) throw new DomainError('INFRASTRUCTURE', 'Replicate callback verification must be configured before a paid request.');
  if (provider === 'replicate' && !/^(user|organization):[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(env.replicateWebhookAccountId)) throw new DomainError('INFRASTRUCTURE', 'Replicate account binding must use canonical type:username before a paid request.');
}

/** Receivers and worker preflight use the same token/config association as the live adapter. */
export async function getRuntimeReplicateWebhookOptions(attemptNonce: string): Promise<ReplicateWebhookOptions> {
  const env = getServerEnv();
  const keys = getProviderCredentials();
  const binding = await confirmReplicateAccountBinding({transport, token: keys.replicateToken, webhookSecret: env.replicateWebhookSecret, webhookAccountId: env.replicateWebhookAccountId, webhookBaseUrl: keys.replicateWebhookBaseUrl});
  return Object.freeze({secret: env.replicateWebhookSecret, binding, expectedAttemptNonce: attemptNonce});
}

/** Await before the durable submit fence; submit independently enforces this again before POST. */
export async function preflightConfiguredProviderCallback(provider: string): Promise<void> {
  assertConfiguredProviderCallback(provider);
  if (provider === 'replicate') await getRuntimeReplicateWebhookOptions('');
}
