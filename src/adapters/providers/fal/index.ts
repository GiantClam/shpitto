import {permitsAcceptanceSubmission} from '../admission.ts';
import type {AcceptanceSubmissionScope} from '../port.ts';

import {DomainError} from '../../../db/contracts.ts';
import {getProviderModel} from '../../../config/provider-models.ts';
import {mapProviderInput, validateVideoInput} from '../input.ts';
import {normalizeObservation, normalizeResult, normalizeSubmission} from '../normalize.ts';
import type {ProviderPort, ProviderRequestRef, SubmissionContext, SubmitResult} from '../port.ts';
import {verifyFalWebhook, type FalWebhookOptions} from './webhook.ts';

export type FalRequest = Readonly<{
  method: 'POST' | 'GET';
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
  /** fal and the transport MUST not retry a paid create request. */
  retry: false;
}>;

export type FalResponse = Readonly<{status: number; body?: unknown}>;
export interface FalTransport { request(request: FalRequest): Promise<FalResponse>; }

export type FalAdapterOptions = Readonly<{
  transport: FalTransport;
  mode: 'test' | 'live';
  token?: string;
  queueBaseUrl?: string;
  webhookPublicKeyPem?: string;
  webhookJwks?: FalWebhookOptions['jwks'];
  webhookJwksFetchedAt?: Date;
  webhookAccountId?: string;
  webhookBaseUrl?: string;
  acceptanceScope?: AcceptanceSubmissionScope;
  resolveOwnedImageUrl?: (image: Readonly<{assetId: string; cropSha256: string}>) => Promise<string>;
}>;

const DEFAULT_QUEUE_BASE_URL = 'https://queue.fal.run';
const REQUEST_ID = /^[A-Za-z0-9_-]{1,200}$/;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function baseUrl(options: FalAdapterOptions): URL {
  let url: URL;
  try { url = new URL(options.queueBaseUrl ?? DEFAULT_QUEUE_BASE_URL); } catch { throw new DomainError('CONFLICT', 'fal queue base URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('CONFLICT', 'fal queue base URL must use HTTPS.');
  return url;
}

function endpointUrl(options: FalAdapterOptions, endpoint: string, requestId?: string, kind?: 'status' | 'result', webhookUrl?: string): string {
  const base = baseUrl(options);
  const endpointPath = (requestId ? endpoint.split('/').slice(0, 2) : endpoint.split('/')).map((part) => encodeURIComponent(part)).join('/');
  const suffix = requestId && kind ? `/requests/${encodeURIComponent(requestId)}/${kind === 'status' ? 'status' : ''}` : '';
  const url = new URL(`${endpointPath}${suffix}`.replace(/\/$/, ''), base);
  if (webhookUrl) url.searchParams.set('fal_webhook', webhookUrl);
  return url.toString().replace(/\/$/, '');
}

function callbackUrl(options: FalAdapterOptions, attemptNonce: string): string | undefined {
  if (!options.webhookBaseUrl) return undefined;
  let url: URL;
  try { url = new URL(`${options.webhookBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(attemptNonce)}`); } catch { throw new DomainError('CONFLICT', 'fal webhook base URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('CONFLICT', 'fal webhook base URL must use HTTPS.');
  return url.toString();
}

function trackingUrl(options: FalAdapterOptions, value: unknown, endpoint: string, requestId: string, kind: 'status' | 'result'): string {
  const expected = endpointUrl(options, endpoint, requestId, kind);
  if (value === undefined) return expected;
  if (typeof value !== 'string') throw new DomainError('CONFLICT', 'fal tracking URL is invalid.');
  let actual: URL;
  try { actual = new URL(value); } catch { throw new DomainError('CONFLICT', 'fal tracking URL is invalid.'); }
  const allowed = baseUrl(options);
  if (value.length > 2048 || actual.origin !== allowed.origin || actual.username || actual.password || actual.protocol !== 'https:' || actual.search || actual.hash || actual.pathname === '/' || !(actual.pathname.replace(/\/$/, '').endsWith(`/${encodeURIComponent(requestId)}`) || (kind === 'status' && actual.pathname.replace(/\/$/, '').endsWith(`/${encodeURIComponent(requestId)}/status`)))) {
    throw new DomainError('CONFLICT', 'fal tracking URL is outside the persisted queue contract.');
  }
  return actual.toString().replace(/\/$/, '');
}

function headers(options: FalAdapterOptions): Readonly<Record<string, string>> {
  return Object.freeze({
    'Content-Type': 'application/json',
    'X-Fal-No-Retry': '1',
    ...(options.token ? {Authorization: `Key ${options.token}`} : {}),
  });
}

function assertRequestId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) throw new DomainError('CONFLICT', 'fal did not return a usable request ID.');
}

async function imageUrl(options: FalAdapterOptions, context: SubmissionContext): Promise<string | undefined> {
  const image = context.input.image;
  if (!image) return undefined;
  if (options.resolveOwnedImageUrl) return options.resolveOwnedImageUrl(image);
  if (options.mode === 'live') throw new DomainError('CONFLICT', 'Live fal I2V requires a server-owned image URL resolver.');
  return `https://app.example/internal/owned-image/${encodeURIComponent(image.assetId)}`;
}

function checkResponse(response: FalResponse): Readonly<Record<string, unknown>> {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new DomainError('CONFLICT', 'fal returned an invalid HTTP response.');
  return object(response.body);
}

export function createFalProvider(options: FalAdapterOptions): ProviderPort {
  if (!options.transport || typeof options.transport.request !== 'function') throw new DomainError('CONFLICT', 'fal transport is required.');
  if (options.mode === 'live' && !options.token) throw new DomainError('CONFLICT', 'Live fal mode requires a server-side token.');
  return Object.freeze({
    capabilities(modelKey: string) {
      const model = getProviderModel(modelKey);
      if (model.provider !== 'fal') throw new DomainError('VALIDATION', 'The selected model is not a fal model.');
      return Object.freeze({modelKey: model.modelKey, modes: Object.freeze([model.mode]), aspectRatios: Object.freeze(['16:9', '9:16'] as const), preset: model.preset, requiresOwnedCrop: model.mode === 'image-to-video', liveEnabled: model.liveEnabled});
    },
    validate(input) {
      const model = getProviderModel(input.modelKey);
      if (model.provider !== 'fal') throw new DomainError('VALIDATION', 'The selected model is not a fal model.');
      return validateVideoInput(input);
    },
    async submit(context): Promise<SubmitResult> {
      if (context.catalog.provider !== 'fal') throw new DomainError('VALIDATION', 'The submission catalog is not a fal contract.');
      if (options.mode === 'live' && !context.catalog.liveEnabled && !permitsAcceptanceSubmission(context, options.acceptanceScope)) throw new DomainError('CONFLICT', 'The fal catalog row is disabled pending live account evidence.');
      const image = await imageUrl(options, context);
      const input = mapProviderInput(context.input, context.catalog, image);
      try {
        let statusUrl: string | undefined;
        let resultUrl: string | undefined;
        const response = await options.transport.request(Object.freeze({method: 'POST', url: endpointUrl(options, context.catalog.endpoint, undefined, undefined, callbackUrl(options, context.attemptNonce)), headers: headers(options), body: Object.freeze(input), retry: false}));
        const body = checkResponse(response);
        if (response.status >= 200 && response.status < 300) {
          assertRequestId(body.request_id);
          statusUrl = trackingUrl(options, body.status_url, context.catalog.endpoint, body.request_id, 'status');
          resultUrl = trackingUrl(options, body.response_url, context.catalog.endpoint, body.request_id, 'result');
        }
        return normalizeSubmission('fal', {httpStatus: response.status, body, ...(response.status >= 200 && response.status < 300 ? {statusUrl, resultUrl} : {})});
      } catch (error) {
        if (error instanceof DomainError) throw error;
        return Object.freeze({kind: 'unknown', evidence: Object.freeze({code: 'transport_timeout_or_unknown'})});
      }
    },
    async getStatus(ref: ProviderRequestRef) {
      if (ref.provider !== 'fal') throw new DomainError('VALIDATION', 'The request is not a fal request.');
      assertRequestId(ref.requestId);
      try {
        const response = await options.transport.request(Object.freeze({method: 'GET', url: trackingUrl(options, ref.statusUrl, ref.catalog.endpoint, ref.requestId, 'status'), headers: headers(options), retry: false}));
        const body = checkResponse(response);
        if (response.status < 200 || response.status >= 300) throw new DomainError('CONFLICT', 'fal status is unavailable.');
        return normalizeObservation(ref, body);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError('CONFLICT', 'fal status is unavailable.');
      }
    },
    async readResult(ref: ProviderRequestRef) {
      if (ref.provider !== 'fal') throw new DomainError('VALIDATION', 'The request is not a fal request.');
      assertRequestId(ref.requestId);
      try {
        const response = await options.transport.request(Object.freeze({method: 'GET', url: trackingUrl(options, ref.resultUrl, ref.catalog.endpoint, ref.requestId, 'result'), headers: headers(options), retry: false}));
        const body = checkResponse(response);
        if (response.status < 200 || response.status >= 300) return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: 'fal.result_unavailable', httpStatus: response.status})});
        // fal result responses omit request_id; the persisted result URL is the identity fence.
        return normalizeResult(ref, typeof body.request_id === 'string' ? body : {...body, request_id: ref.requestId});
      } catch (error) {
        if (error instanceof DomainError) throw error;
        return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: 'fal.result_unavailable'})});
      }
    },
    async verifyWebhook(rawBody, headers, ref) {
      if (!ref) throw new DomainError('CONFLICT', 'A persisted provider request reference is required before webhook verification (task 5.4).');
      return verifyFalWebhook(rawBody, headers, ref, {
        publicKeyPem: options.webhookPublicKeyPem ?? '',
        jwks: options.webhookJwks,
        jwksFetchedAt: options.webhookJwksFetchedAt,
        expectedAccountId: options.webhookAccountId,
      });
    },
  } satisfies ProviderPort);
}
