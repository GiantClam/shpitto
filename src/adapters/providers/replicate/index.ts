import {permitsAcceptanceSubmission} from '../admission.ts';
import type {AcceptanceSubmissionScope} from '../port.ts';

import {DomainError} from '../../../db/contracts.ts';
import {getProviderModel} from '../../../config/provider-models.ts';
import {mapProviderInput, validateVideoInput} from '../input.ts';
import {normalizeObservation, normalizeResult, normalizeSubmission} from '../normalize.ts';
import type {ProviderPort, ProviderRequestRef, SubmissionContext, SubmitResult} from '../port.ts';
import {verifyReplicateWebhook} from './webhook.ts';

export type ReplicateRequest = Readonly<{
  method: 'POST' | 'GET';
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
  /** The transport MUST perform no automatic retry for an upstream create or reconciliation request. */
  retry: false;
}>;

export type ReplicateResponse = Readonly<{status: number; body?: unknown}>;
export interface ReplicateTransport {
  request(request: ReplicateRequest): Promise<ReplicateResponse>;
}

export type ReplicateAdapterOptions = Readonly<{
  transport: ReplicateTransport;
  mode: 'test' | 'live';
  token?: string;
  apiBaseUrl?: string;
  webhookBaseUrl?: string;
  webhookSecret?: string;
  webhookAccountId?: string;
  acceptanceScope?: AcceptanceSubmissionScope;
  resolveOwnedImageUrl?: (image: Readonly<{assetId: string; cropSha256: string}>) => Promise<string>;
}>;

const DEFAULT_API_BASE_URL = 'https://api.replicate.com/v1';
const DEFAULT_TEST_IMAGE_BASE_URL = 'https://app.example/internal/owned-image';
const PRIVATE_ID = /^[A-Za-z0-9_-]{1,200}$/;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function headers(options: ReplicateAdapterOptions): Readonly<Record<string, string>> {
  const result: Record<string, string> = {'Content-Type': 'application/json'};
  if (options.token) result.Authorization = `Bearer ${options.token}`;
  return Object.freeze(result);
}

function apiUrl(options: ReplicateAdapterOptions, requestId?: string): string {
  const base = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  let url: URL;
  try { url = new URL(requestId ? `${base}/predictions/${encodeURIComponent(requestId)}` : `${base}/predictions`); } catch { throw new DomainError('CONFLICT', 'Replicate API base URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('CONFLICT', 'Replicate API base URL must use HTTPS.');
  return url.toString().replace(/\/$/, '');
}

function callbackUrl(options: ReplicateAdapterOptions, attemptNonce: string): string | undefined {
  if (!options.webhookBaseUrl) return undefined;
  let url: URL;
  try { url = new URL(`${options.webhookBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(attemptNonce)}`); } catch { throw new DomainError('CONFLICT', 'Replicate webhook base URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('CONFLICT', 'Replicate webhook base URL must use HTTPS.');
  return url.toString();
}

function checkResponse(response: ReplicateResponse): Readonly<Record<string, unknown>> {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new DomainError('CONFLICT', 'Replicate returned an invalid HTTP response.');
  return object(response.body);
}

function assertRequestId(requestId: unknown): asserts requestId is string {
  if (typeof requestId !== 'string' || !PRIVATE_ID.test(requestId)) throw new DomainError('CONFLICT', 'Replicate did not return a usable prediction ID.');
}

async function imageUrl(options: ReplicateAdapterOptions, context: SubmissionContext): Promise<string | undefined> {
  const image = context.input.image;
  if (!image) return undefined;
  if (options.resolveOwnedImageUrl) return options.resolveOwnedImageUrl(image);
  if (options.mode === 'live') throw new DomainError('CONFLICT', 'Live Replicate I2V requires a server-owned image URL resolver.');
  return `${DEFAULT_TEST_IMAGE_BASE_URL}/${encodeURIComponent(image.assetId)}`;
}

export function createReplicateProvider(options: ReplicateAdapterOptions): ProviderPort {
  if (!options.transport || typeof options.transport.request !== 'function') throw new DomainError('CONFLICT', 'Replicate transport is required.');
  if (options.mode === 'live' && !options.token) throw new DomainError('CONFLICT', 'Live Replicate mode requires a server-side token.');
  return Object.freeze({
    capabilities(modelKey: string) {
      const model = getProviderModel(modelKey);
      if (model.provider !== 'replicate') throw new DomainError('VALIDATION', 'The selected model is not a Replicate model.');
      return Object.freeze({modelKey: model.modelKey, modes: Object.freeze([model.mode]), aspectRatios: Object.freeze(['16:9', '9:16'] as const), preset: model.preset, requiresOwnedCrop: model.mode === 'image-to-video', liveEnabled: model.liveEnabled});
    },
    validate(input) {
      const model = getProviderModel(input.modelKey);
      if (model.provider !== 'replicate') throw new DomainError('VALIDATION', 'The selected model is not a Replicate model.');
      // Input validation remains owned by the shared contract; this lookup is new-admission validation.
      return validateVideoInput(input);
    },
    async submit(context): Promise<SubmitResult> {
      if (context.catalog.provider !== 'replicate') throw new DomainError('VALIDATION', 'The submission catalog is not a Replicate contract.');
      if (options.mode === 'live' && !context.catalog.liveEnabled && !permitsAcceptanceSubmission(context, options.acceptanceScope)) throw new DomainError('CONFLICT', 'The Replicate catalog row is disabled pending live account evidence.');
      const version = context.catalog.modelVersion;
      if (!version) throw new DomainError('CONFLICT', 'The persisted Replicate version is missing.');
      const ownedImageUrl = await imageUrl(options, context);
      const input = mapProviderInput(context.input, context.catalog, ownedImageUrl);
      const callback = callbackUrl(options, context.attemptNonce);
      const body: Record<string, unknown> = {version, input};
      if (callback) {
        body.webhook = callback;
        body.webhook_events_filter = ['completed'];
      }
      try {
        const response = await options.transport.request(Object.freeze({method: 'POST', url: apiUrl(options), headers: headers(options), body: Object.freeze(body), retry: false}));
        return normalizeSubmission('replicate', {httpStatus: response.status, body: response.body});
      } catch (error) {
        if (error instanceof DomainError) throw error;
        return Object.freeze({kind: 'unknown', evidence: Object.freeze({code: 'transport_timeout_or_unknown'})});
      }
    },
    async getStatus(ref: ProviderRequestRef) {
      if (ref.provider !== 'replicate') throw new DomainError('VALIDATION', 'The request is not a Replicate request.');
      assertRequestId(ref.requestId);
      try {
        const response = await options.transport.request(Object.freeze({method: 'GET', url: apiUrl(options, ref.requestId), headers: headers(options), retry: false}));
        const body = checkResponse(response);
        if (response.status < 200 || response.status >= 300) throw new DomainError('CONFLICT', 'Replicate status is unavailable.');
        return normalizeObservation(ref, body);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError('CONFLICT', 'Replicate status is unavailable.');
      }
    },
    async readResult(ref: ProviderRequestRef) {
      if (ref.provider !== 'replicate') throw new DomainError('VALIDATION', 'The request is not a Replicate request.');
      assertRequestId(ref.requestId);
      try {
        const response = await options.transport.request(Object.freeze({method: 'GET', url: apiUrl(options, ref.requestId), headers: headers(options), retry: false}));
        const body = checkResponse(response);
        if (response.status < 200 || response.status >= 300) return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: 'replicate.result_unavailable', httpStatus: response.status})});
        return normalizeResult(ref, body);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: 'replicate.result_unavailable'})});
      }
    },
    async verifyWebhook(rawBody, headers, ref) {
      if (!ref) throw new DomainError('CONFLICT', 'A persisted provider request reference is required before webhook verification (task 5.4).');
      return verifyReplicateWebhook(rawBody, headers, ref, {
        secret: options.webhookSecret ?? '',
        expectedAccountId: options.webhookAccountId,
      });
    },
  } satisfies ProviderPort);
}

