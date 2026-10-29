import {DomainError} from '../../db/contracts.ts';
import type {FalRequest, FalResponse} from './fal/index.ts';

const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 30_000;
const ORIGINS = new Set(['https://api.replicate.com', 'https://queue.fal.run']);

/** One upstream HTTP operation only; timeouts or ambiguous creates are never retried here. */
export function createProviderHttpTransport(fetcher: typeof fetch = fetch): Readonly<{request: (request: FalRequest) => Promise<FalResponse>}> {
  return Object.freeze({async request(request: FalRequest): Promise<FalResponse> {
    const url = new URL(request.url);
    if (!ORIGINS.has(url.origin) || url.username || url.password || url.hash) throw new DomainError('FORBIDDEN', 'Provider transport origin is not allowed.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(url, {method: request.method, headers: request.headers, ...(request.body ? {body: JSON.stringify(request.body)} : {}), redirect: 'manual', signal: controller.signal});
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new DomainError('FORBIDDEN', 'Provider transport does not follow redirects.');
      }
      const declared = response.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new DomainError('CONFLICT', 'Provider response exceeds the bounded size.');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new DomainError('CONFLICT', 'Provider response exceeds the bounded size.'); }
        chunks.push(next.value);
      }
      let body: unknown;
      if (size) {
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        try { body = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { throw new DomainError('CONFLICT', 'Provider response is not valid JSON.'); }
      }
      return Object.freeze({status: response.status, body});
    } finally { clearTimeout(timer); controller.abort(); }
  }});
}
