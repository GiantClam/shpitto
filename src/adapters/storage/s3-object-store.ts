import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

import {DomainError} from '../../db/contracts.ts';
import type {PrivateObjectHead, PrivateObjectStore} from './port.ts';
import {assertObjectKey} from './key.ts';

export type S3ObjectStoreConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  allowInsecureEndpoint?: boolean;
}>;

export type S3CommandClient = Readonly<{send(command: unknown): Promise<unknown>}>;

export const MAX_PRIVATE_OBJECT_BYTES = 250 * 1024 * 1024;

function assertConfig(config: S3ObjectStoreConfig): void {
  let endpoint: URL;
  try { endpoint = new URL(config.endpoint); } catch { throw new DomainError('CONFLICT', 'S3-compatible storage endpoint is invalid.'); }
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && config.allowInsecureEndpoint)) || endpoint.username || endpoint.password) throw new DomainError('CONFLICT', 'S3-compatible storage endpoint must use HTTPS outside local contract tests.');
  if (!config.region || !config.bucket || !config.accessKeyId || !config.secretAccessKey) throw new DomainError('CONFLICT', 'S3-compatible storage credentials are incomplete.');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new DomainError('CONFLICT', 'S3-compatible storage bucket name is invalid.');
}

async function bodyBytes(body: unknown, maxBytes = MAX_PRIVATE_OBJECT_BYTES): Promise<Uint8Array> {
  if (!body) throw new DomainError('CONFLICT', 'Stored object body is empty.');
  const candidate = body as {transformToByteArray?: () => Promise<Uint8Array>; [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>};
  if (typeof candidate.transformToByteArray === 'function') { const bytes = await candidate.transformToByteArray(); if (bytes.byteLength > maxBytes) throw new DomainError('VALIDATION', 'Private object exceeds the bounded size.'); return bytes; }
  if (!candidate[Symbol.asyncIterator]) throw new DomainError('CONFLICT', 'Stored object body is unreadable.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of candidate as AsyncIterable<Uint8Array>) { const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk); size += value.byteLength; if (size > maxBytes) throw new DomainError('VALIDATION', 'Private object exceeds the bounded size.'); chunks.push(value); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function notFound(error: unknown): boolean {
  const status = (error as {$metadata?: {httpStatusCode?: number}})?.$metadata?.httpStatusCode;
  return status === 404 || (error as {name?: string})?.name === 'NotFound' || (error as {name?: string})?.name === 'NoSuchKey';
}

export function createS3ObjectStore(config: S3ObjectStoreConfig, clientOverride?: S3CommandClient): PrivateObjectStore {
  assertConfig(config);
  const client: S3CommandClient = clientOverride ?? new S3Client({endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle ?? false, credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey}});
  return {
    driver: 's3',
    async put(objectKey, bytes, contentType) {
      assertObjectKey(objectKey);
      if (bytes.byteLength > MAX_PRIVATE_OBJECT_BYTES) throw new DomainError('VALIDATION', 'Private object exceeds the bounded size.');
      await client.send(new PutObjectCommand({Bucket: config.bucket, Key: objectKey, Body: Buffer.from(bytes), ContentType: contentType}));
    },
    async get(objectKey) {
      assertObjectKey(objectKey);
      try { const response = await client.send(new GetObjectCommand({Bucket: config.bucket, Key: objectKey})) as {Body?: unknown; ContentLength?: number}; if ((response.ContentLength ?? 0) > MAX_PRIVATE_OBJECT_BYTES) throw new DomainError('VALIDATION', 'Private object exceeds the bounded size.'); return bodyBytes(response.Body); }
      catch (error) { if (notFound(error)) throw new DomainError('NOT_FOUND', 'Private object was not found.'); throw error; }
    },
    async delete(objectKey) { assertObjectKey(objectKey); await client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: objectKey})); },
    async head(objectKey): Promise<PrivateObjectHead | null> {
      assertObjectKey(objectKey);
      try { const result = await client.send(new HeadObjectCommand({Bucket: config.bucket, Key: objectKey})); const head = result as {ContentLength?: number; LastModified?: Date; ContentType?: string}; return {bytes: Number(head.ContentLength ?? 0), modifiedAt: head.LastModified ?? null, contentType: head.ContentType}; }
      catch (error) { if (notFound(error)) return null; throw error; }
    },
    async list(prefix, limit, after = null) {
      assertObjectKey(prefix);
      if (!Number.isInteger(limit) || limit < 1) throw new DomainError('VALIDATION', 'Object list limit must be a positive integer.');
      const result = await client.send(new ListObjectsV2Command({Bucket: config.bucket, Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`, StartAfter: after ?? undefined, MaxKeys: Math.max(1, Math.min(1000, limit))}));
      const keys = (((result as {Contents?: Array<{Key?: string}>}).Contents ?? []).map((item) => item.Key).filter((key): key is string => Boolean(key))).slice(0, limit);
      for (const key of keys) assertObjectKey(key);
      return keys;
    },
  };
}
