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

function parseIPv4(address: string): readonly [number, number, number, number] | null {
  const octets = address.split('.').map(Number);
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? [octets[0], octets[1], octets[2], octets[3]]
    : null;
}

function privateIPv4(address: string): boolean {
  const octets = parseIPv4(address);
  if (!octets) return false;
  const [first, second, third] = octets;
  return first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) || (first === 192 && second === 168) || (first === 192 && second === 88 && third === 99) ||
    (first === 198 && second >= 18 && second <= 19) || (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) || first >= 224;
}

function parseIPv6(address: string): readonly number[] | null {
  const normalized = address.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%', 1)[0];
  if (!normalized.includes(':')) return null;
  const groups = normalized.split('::');
  if (groups.length > 2) return null;
  const expand = (part: string): number[] => {
    if (!part) return [];
    const tokens = part.split(':');
    const result: number[] = [];
    for (const token of tokens) {
      if (token.includes('.')) {
        const octets = parseIPv4(token);
        if (!octets) return [];
        result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(token)) result.push(Number.parseInt(token, 16));
      else return [];
    }
    return result;
  };
  const left = expand(groups[0]);
  const right = groups.length === 2 ? expand(groups[1]) : [];
  if (left.length + right.length > 8 || (groups.length === 1 && left.length !== 8)) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

function privateAddress(address: string): boolean {
  if (!address.includes(':')) {
    const parsed = parseIPv4(address);
    return parsed ? privateIPv4(address) : false;
  }
  const groups = parseIPv6(address);
  if (!groups) return true;
  const allZero = groups.every((group) => group === 0);
  if (allZero || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)) return true;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return privateIPv4(`${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`);
  }
  if ((groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0 || (groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true;
  if (groups[0] === 0x2001 && groups[1] === 0xdb8) return true;
  if (groups[0] === 0x2001 && groups[1] === 2 && groups[2] === 0) return true;
  if (groups[0] === 0x2001 && groups[1] === 0) return true;
  if (groups[0] === 0x2001 && (groups[1] & 0xfff0) === 0x0010) return true;
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) return true;
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    return privateIPv4(`${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`);
  }
  if (groups[0] === 0x2002) return privateIPv4(`${groups[1] >>> 8}.${groups[1] & 255}.${groups[2] >>> 8}.${groups[2] & 255}`);
  return false;
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
  if ((parseIPv4(url.hostname) || parseIPv6(url.hostname)) && privateAddress(url.hostname)) throw new DomainError('FORBIDDEN', 'Provider output cannot target a private or link-local address.');
  let records: ReadonlyArray<{address: string; family: number}>;
  try {
    records = await withDeadline(() => resolveHost(url.hostname, {all: true, verbatim: true}), deadline);
  } catch (error) {
    if (error instanceof ProviderOutputTimeoutError) throw error;
    throw new DomainError('CONFLICT', 'Provider output hostname could not be resolved.');
  }
  if (records.length === 0 || records.some((record) => {
    const address = record.address;
    return (!parseIPv4(address) && !parseIPv6(address)) || privateAddress(address);
  })) throw new DomainError('FORBIDDEN', 'Provider output resolves to a private or link-local address.');
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
