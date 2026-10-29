import {createHash, randomUUID} from 'node:crypto';

import type {AppDatabase} from '../../db/client.ts';
import {assets} from '../../db/schema/asset.ts';
import {resolvePrivateObjectStore, type PrivateObjectStore} from '../../adapters/storage/port.ts';
import {authorizeWorkspaceAccess} from '../workspaces/authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {validateInputImageBytes} from './validate-input.ts';

export async function uploadInputAsset(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; root?: string; store?: PrivateObjectStore; bytes: Uint8Array; mime: string; now?: Date}>): Promise<Readonly<{assetId: string; objectKey: string; sha256: string}>> {
  const now = input.now ?? new Date();
  const store = resolvePrivateObjectStore(input.store, input.root);
  await authorizeWorkspaceAccess(db, input.workspaceId, input.actor);
  await validateInputImageBytes(input.bytes, input.mime);
  const assetId = randomUUID();
  const extension = input.mime === 'image/png' ? 'png' : input.mime === 'image/jpeg' ? 'jpg' : 'webp';
  const objectKey = `workspaces/${input.workspaceId}/inputs/${assetId}.${extension}`;
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  await store.put(objectKey, input.bytes, input.mime);
  try {
    await db.insert(assets).values({id: assetId, workspaceId: input.workspaceId, taskId: null, purpose: 'input', state: 'ready', objectKey, createdBy: input.actor.userId, mime: input.mime, bytes: BigInt(input.bytes.length), sha256, durationMs: null, uploadExpiresAt: null, createdAt: now, updatedAt: now});
  } catch (error) {
    await store.delete(objectKey).catch(() => undefined);
    throw error;
  }
  return {assetId, objectKey, sha256};
}
