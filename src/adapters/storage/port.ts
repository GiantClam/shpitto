import {DomainError} from '../../db/contracts.ts';
import {createLocalObjectStore} from './local.ts';
import {createS3ObjectStore, type S3ObjectStoreConfig} from './s3-object-store.ts';

export type PrivateObjectHead = Readonly<{bytes: number; modifiedAt: Date | null; contentType?: string}>;

export interface PrivateObjectStore {
  readonly driver: 'local' | 's3';
  put(objectKey: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  get(objectKey: string): Promise<Uint8Array>;
  delete(objectKey: string): Promise<void>;
  head(objectKey: string): Promise<PrivateObjectHead | null>;
  list(prefix: string, limit: number, after?: string | null): Promise<ReadonlyArray<string>>;
}

export type StorageRuntimeConfig = Readonly<{
  storageDriver: string;
  assetRoot: string;
  storageS3?: S3ObjectStoreConfig;
}>;

export function resolvePrivateObjectStore(store?: PrivateObjectStore, root?: string): PrivateObjectStore {
  if (store) return store;
  if (root) return createLocalObjectStore(root);
  throw new DomainError('CONFLICT', 'A private object storage adapter is required.');
}

export function createPrivateObjectStore(config: StorageRuntimeConfig): PrivateObjectStore {
  if (config.storageDriver === 'local') return createLocalObjectStore(config.assetRoot);
  if (config.storageDriver === 's3' || config.storageDriver === 's3-compatible') {
    if (!config.storageS3) throw new DomainError('CONFLICT', 'S3-compatible storage configuration is incomplete.');
    return createS3ObjectStore(config.storageS3);
  }
  throw new DomainError('CONFLICT', 'The configured private storage driver is unsupported.');
}
