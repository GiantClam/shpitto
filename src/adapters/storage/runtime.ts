import {createHash} from 'node:crypto';

import {getServerEnv} from '../../config/env.ts';
import {createPrivateObjectStore, type PrivateObjectStore} from './port.ts';

let cachedSignature = '';
let cachedStore: PrivateObjectStore | null = null;

export function getPrivateObjectStore(): PrivateObjectStore {
  const env = getServerEnv();
  const config = {storageDriver: env.storageDriver, assetRoot: env.assetRoot, storageS3: env.storageDriver === 's3' || env.storageDriver === 's3-compatible' ? {
    endpoint: env.storageS3Endpoint,
    region: env.storageS3Region,
    bucket: env.storageS3Bucket,
    accessKeyId: env.storageS3AccessKeyId,
    secretAccessKey: env.storageS3SecretAccessKey,
    forcePathStyle: env.storageS3ForcePathStyle,
    allowInsecureEndpoint: env.nodeEnv !== 'production',
  } : undefined};
  const signature = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  if (cachedStore && cachedSignature === signature) return cachedStore;
  cachedStore = createPrivateObjectStore(config);
  cachedSignature = signature;
  return cachedStore;
}
