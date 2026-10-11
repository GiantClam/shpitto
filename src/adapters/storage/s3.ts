import {lookup} from 'node:dns/promises';
import {createHash} from 'node:crypto';

import {DomainError} from '../../db/contracts.ts';

export const MAX_REMOTE_OUTPUT_BYTES = 250 * 1024 * 1024;
export const REMOTE_OUTPUT_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 3;
const ALLOWED_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export type RemoteObject = Readonly<{bytes: Uint8Array; mime: string; sha256: string; finalUrl: string}>;
export type RemoteFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type HostResolver = (hostname: string, options: {all: true; verbatim: true}) => Promise<ReadonlyArray<{address: string; family: number}>>;

function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('::ffff:')) return normalized.startsWith('::ffff:') ? privateAddress(normalized.slice(7)) : true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254) || octets[0] === 0;
}

class ProviderOutputTimeoutError extends DomainError {
  constructor() {
    super('CONFLICT', 'Provider output download timed out.');
  }
}

function timeoutError(): DomainError {
  return new ProviderOutputTimeoutError();
}

async function withDeadline<T>(operation: () => Promise<T>, deadline: number, onTimeout?: () => void): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    onTimeout?.();
    throw timeoutError();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch { /* Preserve the deadline as the public failure. */ }
      reject(timeoutError());
    }, remaining);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function assertSafeOrigin(url: URL, resolveHost: HostResolver, deadline: number): Promise<void> {
  if (url.protocol !== 'https:' || url.username || url.password) throw new DomainError('FORBIDDEN', 'Provider output must use HTTPS without URL credentials.');
  if (privateAddress(url.hostname)) throw new DomainError('FORBIDDEN', 'Provider output cannot target a private or link-local address.');
  let records: ReadonlyArray<{address: string; family: number}>;
  try {
    records = await withDeadline(() => resolveHost(url.hostname, {all: true, verbatim: true}), deadline);
  } catch (error) {
    if (error instanceof ProviderOutputTimeoutError) throw error;
    throw new DomainError('CONFLICT', 'Provider output hostname could not be resolved.');
  }
  if (records.length === 0 || records.some((record) => privateAddress(record.address))) throw new DomainError('FORBIDDEN', 'Provider output resolves to a private or link-local address.');
}

function cancelResponse(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readBounded(response: Response, deadline: number, abort: () => void): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REMOTE_OUTPUT_BYTES)) {
    cancelResponse(response);
    throw new DomainError('VALIDATION', 'Provider output exceeds the bounded size.');
  }
  if (!response.body) throw new DomainError('VALIDATION', 'Provider output body is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await withDeadline(() => reader.read(), deadline, () => { abort(); void reader.cancel().catch(() => undefined); });
    if (next.done) break;
    const chunk = next.value;
    size += chunk.byteLength;
    if (size > MAX_REMOTE_OUTPUT_BYTES) {
      abort();
      void reader.cancel().catch(() => undefined);
      throw new DomainError('VALIDATION', 'Provider output exceeds the bounded size.');
    }
    chunks.push(chunk);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

/** Fetch a temporary provider URL with redirect, DNS, MIME and byte limits. */
export async function fetchPrivateProviderOutput(urlText: string, fetcher: RemoteFetch = fetch, resolveHost: HostResolver = lookup): Promise<RemoteObject> {
  const deadline = Date.now() + REMOTE_OUTPUT_TIMEOUT_MS;
  let url: URL;
  try { url = new URL(urlText); } catch { throw new DomainError('VALIDATION', 'Provider output URL is invalid.'); }
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertSafeOrigin(url, resolveHost, deadline);
    const controller = new AbortController();
    const response = await withDeadline(() => fetcher(url, {method: 'GET', redirect: 'manual', signal: controller.signal, headers: {Accept: 'video/*'}}), deadline, () => controller.abort());
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      cancelResponse(response);
      if (!location || redirects === MAX_REDIRECTS) throw new DomainError('CONFLICT', 'Provider output redirect chain is unavailable.');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      cancelResponse(response);
      throw new DomainError('CONFLICT', 'Provider output is unavailable.');
    }
    const mime = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      cancelResponse(response);
      throw new DomainError('VALIDATION', 'Provider output MIME type is not supported.');
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBounded(response, deadline, () => controller.abort());
    } catch (error) {
      controller.abort();
      throw error;
    }
    return Object.freeze({bytes, mime, sha256: createHash('sha256').update(bytes).digest('hex'), finalUrl: url.toString()});
  }
  throw new DomainError('CONFLICT', 'Provider output redirect chain is unavailable.');
}
