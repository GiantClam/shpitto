import {createHash} from 'node:crypto';
import {and, eq} from 'drizzle-orm';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {assets} from '../../db/schema/asset.ts';
import type {PrivateObjectStore} from '../../adapters/storage/port.ts';
import {signProviderInputUrl} from '../../adapters/storage/provider-input-url.ts';
import type {AuthorizedOwnedImage, ValidatedVideoInput} from '../../adapters/providers/port.ts';
import {getServerEnv} from '../../config/env.ts';
import {inspectInputImageBytes} from '../assets/validate-input.ts';

export async function readWorkerInputImage(db: AppDatabase, store: PrivateObjectStore, workspaceId: string, input: ValidatedVideoInput): Promise<Readonly<{authorized: AuthorizedOwnedImage; url: string}> | undefined> {
  if (!input.image) return undefined;
  const row = (await db.select().from(assets).where(and(eq(assets.id, input.image.assetId), eq(assets.workspaceId, workspaceId), eq(assets.purpose, 'input'), eq(assets.state, 'ready'))).limit(1))[0];
  if (!row || !row.mime?.startsWith('image/') || row.sha256 !== input.image.cropSha256 || !row.bytes || row.bytes > 20n * 1024n * 1024n) throw new DomainError('FORBIDDEN', 'Provider input is not the confirmed ready workspace image.');
  const bytes = await store.get(row.objectKey);
  if (BigInt(bytes.length) !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new DomainError('CONFLICT', 'Provider input failed its integrity check.');
  const dimensions = await inspectInputImageBytes(bytes, row.mime);
  const [width, height] = input.aspectRatio === '16:9' ? [1280, 720] : [720, 1280];
  if (dimensions.width !== width || dimensions.height !== height) throw new DomainError('VALIDATION', 'Provider input must be an already-confirmed normalized crop.');
  const env = getServerEnv();
  const url = signProviderInputUrl({endpoint: env.storageS3Endpoint, region: env.storageS3Region, bucket: env.storageS3Bucket, accessKeyId: env.storageS3AccessKeyId, secretAccessKey: env.storageS3SecretAccessKey, forcePathStyle: env.storageS3ForcePathStyle, workspaceId, objectKey: row.objectKey, expiresSeconds: 3600});
  return Object.freeze({authorized: Object.freeze({assetId: row.id, workspaceId, state: 'ready', kind: 'image', cropSha256: row.sha256, width, height}), url});
}
