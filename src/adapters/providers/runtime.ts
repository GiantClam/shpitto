import {getProviderCredentials, getServerEnv} from '../../config/env.ts';
import {getProviderModel} from '../../config/provider-models.ts';
import {DomainError} from '../../db/contracts.ts';
import {createProviderHttpTransport} from './http.ts';
import {createFalProvider} from './fal/index.ts';
import {createReplicateProvider} from './replicate/index.ts';
import type {AcceptanceSubmissionScope, ProviderPort} from './port.ts';

export function createRuntimeProvider(modelKey: string, scope: AcceptanceSubmissionScope, resolveOwnedImageUrl?: (image: Readonly<{assetId: string; cropSha256: string}>) => Promise<string>): ProviderPort {
  const env = getServerEnv();
  const keys = getProviderCredentials();
  const model = getProviderModel(modelKey);
  if (env.runtimeProfile !== 'acceptance' || !scope.modelKeys.includes(modelKey)) throw new DomainError('FORBIDDEN', 'Provider runtime is restricted to the acceptance model allowlist.');
  const transport = createProviderHttpTransport();
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
}
