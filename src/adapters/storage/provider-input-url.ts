import {createHash, createHmac} from 'node:crypto';
import {DomainError} from '../../db/contracts.ts';
import {assertObjectKey} from './key.ts';

function encode(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function hmac(key: string | Uint8Array, value: string): Buffer { return createHmac('sha256', key).update(value).digest(); }

/** SigV4 read-only capability for one already-authorized input; never persisted or logged. */
export function signProviderInputUrl(input: Readonly<{
  endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean;
  workspaceId: string; objectKey: string; expiresSeconds: number; now?: Date;
}>): string {
  assertObjectKey(input.objectKey);
  if (!input.objectKey.startsWith(`workspaces/${input.workspaceId}/inputs/`)) throw new DomainError('FORBIDDEN', 'Provider input URL requires a workspace-owned input key.');
  if (!Number.isInteger(input.expiresSeconds) || input.expiresSeconds < 1 || input.expiresSeconds > 3600) throw new DomainError('VALIDATION', 'Provider input URL expiry must be bounded by one hour.');
  const url = new URL(input.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new DomainError('FORBIDDEN', 'Provider input storage endpoint must use HTTPS.');
  if (!input.accessKeyId || !input.secretAccessKey || !input.bucket || !input.region) throw new DomainError('INFRASTRUCTURE', 'Provider input signing is not configured.');
  const timestamp = (input.now ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = timestamp.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const path = input.objectKey.split('/').map(encode).join('/');
  const basePath = url.pathname.replace(/\/$/, '');
  if (input.forcePathStyle) url.pathname = `${basePath}/${encode(input.bucket)}/${path}`;
  else { url.hostname = `${input.bucket}.${url.hostname}`; url.pathname = `${basePath}/${path}`; }
  const parameters = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': timestamp, 'X-Amz-Expires': String(input.expiresSeconds), 'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
  const canonical = ['GET', url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), 's3'), 'aws4_request');
  const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonical)}`).toString('hex');
  url.search = `${query}&X-Amz-Signature=${signature}`;
  return url.toString();
}
