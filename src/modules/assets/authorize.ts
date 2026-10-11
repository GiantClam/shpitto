import {createHmac, timingSafeEqual} from 'node:crypto';

import {and, eq, notInArray, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {assets} from '../../db/schema/asset.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {authorizeWorkspaceAccess} from '../workspaces/authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {resolvePrivateObjectStore, type PrivateObjectStore} from '../../adapters/storage/port.ts';

const DOWNLOAD_TTL_MS = 60_000;
const TERMINAL = ['succeeded', 'failed', 'cancelled'];

export type AssetDownloadToken = Readonly<{token: string; expiresAt: string}>;

function tokenPayload(workspaceId: string, assetId: string, expiresAt: number): string {
  return `${workspaceId}.${assetId}.${expiresAt}`;
}

export function createAssetDownloadToken(secret: string, workspaceId: string, assetId: string, now = new Date()): AssetDownloadToken {
  const expiresAt = now.getTime() + DOWNLOAD_TTL_MS;
  const payload = tokenPayload(workspaceId, assetId, expiresAt);
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return Object.freeze({token: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString()});
}

export function verifyAssetDownloadToken(secret: string, token: string, workspaceId: string, assetId: string, now = new Date()): boolean {
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  if (parts[0] !== workspaceId || parts[1] !== assetId) return false;
  const expiresAt = Number(parts[2]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  const expected = createHmac('sha256', secret).update(tokenPayload(workspaceId, assetId, expiresAt)).digest();
  const actual = Buffer.from(parts[3], 'base64url');
  return actual.length === expected.length && actual.toString('base64url') === parts[3] && timingSafeEqual(actual, expected);
}

export async function authorizeAsset(db: AppDatabase, workspaceId: string, assetId: string, actor: WorkspaceActor): Promise<typeof assets.$inferSelect> {
  await authorizeWorkspaceAccess(db, workspaceId, actor);
  const rows = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.workspaceId, workspaceId))).limit(1);
  const asset = rows[0];
  if (!asset || asset.state !== 'ready') throw new DomainError('NOT_FOUND', 'Ready asset was not found.');
  return asset;
}

export async function deleteAsset(db: AppDatabase, workspaceId: string, assetId: string, actor: WorkspaceActor, root?: string, now = new Date(), store?: PrivateObjectStore): Promise<void> {
  const asset = await db.transaction(async (tx) => {
    // Serialize ownership/membership changes while allowing task inserts to take
    // their workspace foreign-key lock before releasing the input asset lock.
    await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('no key update').limit(1);
    const access = await authorizeWorkspaceAccess(tx, workspaceId, actor);
    const current = (await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.workspaceId, workspaceId))).for('update').limit(1))[0];
    if (!current || current.state !== 'ready') throw new DomainError('NOT_FOUND', 'Ready asset was not found.');
    if (access.membership.role !== 'owner' && current.createdBy !== actor.userId) {
      throw new DomainError('FORBIDDEN', 'Only a current workspace owner or the asset creator may delete this asset.');
    }
    const active = await tx.select({id: generationTasks.id}).from(generationTasks).where(and(
      eq(generationTasks.workspaceId, workspaceId),
      sql`${generationTasks.inputSnapshot}->>'assetId' = ${current.id}`,
      notInArray(generationTasks.status, TERMINAL),
    )).limit(1);
    if (active[0]) throw new DomainError('CONFLICT', 'An input asset referenced by an active task cannot be deleted.');
    await tx.update(assets).set({state: 'deleted', updatedAt: now}).where(and(eq(assets.id, current.id), eq(assets.workspaceId, workspaceId)));
    return current;
  });
  await resolvePrivateObjectStore(store, root).delete(asset.objectKey).catch(() => undefined);
}
