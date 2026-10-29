import type {JsonWebKey} from 'node:crypto';

import {DomainError} from '../../../db/contracts.ts';

const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const MAX_RESPONSE_BYTES = 65_536;
const TIMEOUT_MS = 5_000;
export const FAL_JWKS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FalJwks = Readonly<{keys: readonly JsonWebKey[]; fetchedAt: Date}>;

/** Accept the provider's keys array, keeping only usable public Ed25519 verification keys. */
export function parseFalJwks(value: unknown): readonly JsonWebKey[] {
  const document = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (!Array.isArray(document.keys)) throw new DomainError('INFRASTRUCTURE', 'fal webhook verification keys are invalid.');
  const keys = document.keys.flatMap((entry: unknown): JsonWebKey[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const key = entry as Record<string, unknown>;
    if (key.kty !== 'OKP' || key.crv !== 'Ed25519' || typeof key.x !== 'string' || !/^[A-Za-z0-9_-]{43}=?$/.test(key.x)) return [];
    if (key.alg !== undefined && key.alg !== 'EdDSA' && key.alg !== 'Ed25519') return [];
    if (key.use !== undefined && key.use !== 'sig') return [];
    if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) return [];
    // fal publishes padded x values; Node's JWK import uses unpadded base64url.
    const x = key.x.replace(/=$/, '');
    const bytes = Buffer.from(x, 'base64url');
    if (bytes.byteLength !== 32 || bytes.toString('base64url') !== x) return [];
    return [Object.freeze({kty: 'OKP', crv: 'Ed25519', x})];
  });
  if (keys.length === 0) throw new DomainError('INFRASTRUCTURE', 'fal webhook verification keys are invalid.');
  return Object.freeze(keys);
}

async function fetchFalJwks(fetcher: typeof fetch): Promise<readonly JsonWebKey[]> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('JWKS deadline exceeded')); }, TIMEOUT_MS);
  });
  const read = async () => {
    const response = await fetcher(JWKS_URL, {headers: {accept: 'application/json'}, cache: 'no-store', redirect: 'error', signal: controller.signal});
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error('JWKS deadline exceeded');
    }
    reader = response.body?.getReader();
    if (!response.ok || response.redirected || (response.url && response.url !== JWKS_URL) || !reader) throw new Error('Invalid JWKS response');
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)) || Number(declaredLength) > MAX_RESPONSE_BYTES)) throw new Error('Invalid JWKS size');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Invalid JWKS size');
      chunks.push(value);
    }
    const document: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, size)));
    return parseFalJwks(document);
  };
  try {
    return await Promise.race([read(), deadline]);
  } catch {
    controller.abort();
    throw new DomainError('INFRASTRUCTURE', 'fal webhook verification keys are unavailable or invalid.');
  } finally {
    clearTimeout(timer);
    // Cleanup must not extend the deadline if an upstream stream refuses cancellation.
    if (reader) void reader.cancel().catch(() => undefined);
  }
}

/** One bounded refresh per process, with no stale-key fallback after expiry or failure. */
export function createFalJwksLoader(fetcher: typeof fetch = (url, options) => fetch(url, options), clock: () => number = () => Date.now()): () => Promise<FalJwks> {
  let cache: Readonly<{keys: readonly JsonWebKey[]; fetchedAtMs: number}> | undefined;
  let pending: Promise<FalJwks> | undefined;
  const snapshot = (cached: NonNullable<typeof cache>): FalJwks => Object.freeze({keys: cached.keys, fetchedAt: new Date(cached.fetchedAtMs)});
  return async () => {
    const nowMs = clock();
    if (cache && nowMs >= cache.fetchedAtMs && nowMs - cache.fetchedAtMs < FAL_JWKS_MAX_AGE_MS) return snapshot(cache);
    if (!pending) {
      pending = fetchFalJwks(fetcher).then((keys) => {
        cache = Object.freeze({keys, fetchedAtMs: clock()});
        return snapshot(cache);
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}

export const getFalJwks = createFalJwksLoader();
