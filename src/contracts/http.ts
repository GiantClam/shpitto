import {createHash} from 'node:crypto';

import {DomainError} from '../db/contracts.ts';

export type HttpSuccess<T> = Readonly<{ok: true; data: T}>;
export type HttpFailure = Readonly<{
  ok: false;
  error: Readonly<{code: string; message: string}>;
}>;

export type HttpEnvelope<T> = HttpSuccess<T> | HttpFailure;

const SAFE_KEY = /^[A-Za-z0-9._~-]{1,128}$/;
const DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/;

export function success<T>(data: T): HttpSuccess<T> {
  return {ok: true, data};
}

export function failure(code: string, message: string): HttpFailure {
  return {ok: false, error: {code, message}};
}

export function parseJsonObject(raw: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new DomainError('VALIDATION', 'A valid JSON object is required.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DomainError('VALIDATION', 'A valid JSON object is required.');
  }
  return parsed as Record<string, unknown>;
}

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_KEY.test(value)) {
    throw new DomainError('VALIDATION', 'Idempotency-Key must be 1-128 ASCII URL-safe characters.');
  }
  return value;
}

export function parseDecimalInteger(value: unknown, field = 'quantity'): string {
  if (typeof value !== 'string' || !DECIMAL_INTEGER.test(value)) {
    throw new DomainError('VALIDATION', `${field} must be a nonnegative decimal integer string.`);
  }
  return value;
}

export function serializeJsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeJsonValue(entry)]));
  }
  return value;
}

/** Stable JSON is the semantic input to durable command identity. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString(10));
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  throw new DomainError('VALIDATION', 'Request contains an unsupported value.');
}

export function semanticHash(commandName: string, payload: unknown): string {
  return createHash('sha256').update(commandName).update('\0').update(canonicalJson(payload)).digest('hex');
}

export function commandKeyFromRequest(request: Request, body: Readonly<Record<string, unknown>>): string {
  const header = request.headers.get('idempotency-key');
  const bodyKey = body.idempotencyKey;
  if (header && bodyKey !== undefined && header !== bodyKey) {
    throw new DomainError('CONFLICT', 'Idempotency-Key header and body value must match.');
  }
  return parseIdempotencyKey(header ?? bodyKey);
}

export function hasTrustedMutationOrigin(request: Request, appUrl: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true;
  let expected: string;
  try {
    expected = new URL(appUrl).origin;
  } catch {
    return false;
  }
  const origin = request.headers.get('origin');
  if (origin) return origin === expected;
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
