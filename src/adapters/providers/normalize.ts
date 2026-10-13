import {DomainError} from '../../db/contracts.ts';
import type {ProviderName, ProviderObservation, ProviderRequestRef, ProviderResult, SubmitResult} from './port.ts';

const requestIdentity = /^[A-Za-z0-9_-]{1,200}$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeSubmission(provider: Exclude<ProviderName, 'mock'>, response: Readonly<{httpStatus?: number; body?: unknown; transportFailure?: boolean; statusUrl?: string; resultUrl?: string}>): SubmitResult {
  if (response.transportFailure) return Object.freeze({kind: 'unknown', evidence: {code: 'transport_failure'}});
  const body = record(response.body);
  const requestId = provider === 'replicate' ? body.id : body.request_id;
  if (response.httpStatus !== undefined && response.httpStatus >= 200 && response.httpStatus < 300 && typeof requestId === 'string' && requestIdentity.test(requestId)) {
    return Object.freeze({kind: 'accepted', requestId, ...(response.statusUrl ? {statusUrl: response.statusUrl} : {}), ...(response.resultUrl ? {resultUrl: response.resultUrl} : {})});
  }
  // An explicit validation/authentication response proves rejection. Retry/throttle/server failures do not.
  if ([400, 401, 403, 404, 422].includes(response.httpStatus ?? 0)) {
    return Object.freeze({kind: 'definitelyRejected', code: `${provider}.http_${response.httpStatus}`});
  }
  return Object.freeze({kind: 'unknown', evidence: Object.freeze({code: 'unconfirmed_submission', ...(response.httpStatus !== undefined ? {httpStatus: response.httpStatus} : {})})});
}

function assertIdentity(ref: ProviderRequestRef, body: Record<string, unknown>): void {
  if (ref.catalog.provider !== ref.provider || ref.catalog.modelKey !== ref.modelKey || !requestIdentity.test(ref.requestId)) throw new DomainError('VALIDATION', 'The provider request identity is invalid.');
  const observed = ref.provider === 'replicate' ? body.id : body.request_id;
  if (observed !== ref.requestId) throw new DomainError('CONFLICT', 'The provider response identity does not match the persisted request.');
}

export function freezeProviderRef(ref: ProviderRequestRef): ProviderRequestRef {
  return Object.freeze({...ref, catalog: Object.freeze({...ref.catalog, preset: Object.freeze({...ref.catalog.preset})})});
}

export function normalizeObservation(ref: ProviderRequestRef, value: unknown, observedAt = new Date().toISOString()): ProviderObservation {
  const body = record(value);
  assertIdentity(ref, body);
  if (Number.isNaN(new Date(observedAt).getTime())) throw new DomainError('VALIDATION', 'A valid observation time is required.');
  let status: ProviderObservation['status'];
  const states: Record<string, ProviderObservation['status']> = ref.provider === 'replicate'
    ? {starting: 'queued', processing: 'running', succeeded: 'completed', failed: 'failed', canceled: 'failed'}
    : {IN_QUEUE: 'queued', IN_PROGRESS: 'running', COMPLETED: 'completed', OK: 'completed', ERROR: 'failed'};
  if (body.error) status = 'failed';
  else if (typeof body.status === 'string' && Object.hasOwn(states, body.status)) status = states[body.status];
  else throw new DomainError('CONFLICT', 'The provider returned an unsupported observation status.');
  return Object.freeze({ref: freezeProviderRef(ref), status, observedAt, evidence: Object.freeze({code: `${ref.provider}.${status}`})});
}

/** HTTPS parsing is only syntactic screening. The existing asset pipeline must enforce origins, DNS and streaming limits. */
export function normalizeResult(ref: ProviderRequestRef, value: unknown): ProviderResult {
  const body = record(value);
  assertIdentity(ref, body);
  if (body.error || ['failed', 'canceled', 'ERROR'].includes(String(body.status))) return Object.freeze({kind: 'failed', code: `${ref.provider}.result_failed`});
  const falPayload = record(body.payload);
  const location = ref.provider === 'replicate' ? body.output : (record(body.video).url ?? record(falPayload.video).url);
  if (typeof location === 'string' && location.length <= 8192) {
    try {
      const url = new URL(location);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        return Object.freeze({kind: 'outputCandidates', candidates: Object.freeze([Object.freeze({kind: 'remote', url: location} as const)])});
      }
    } catch { /* Malformed output remains unavailable, never durable success. */ }
  }
  return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: `${ref.provider}.result_unavailable`})});
}
