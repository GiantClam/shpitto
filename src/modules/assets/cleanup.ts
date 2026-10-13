import {and, eq, isNull, lte, ne} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {assets} from '../../db/schema/asset.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {resolvePrivateObjectStore, type PrivateObjectStore} from '../../adapters/storage/port.ts';
import {assertObjectKey} from '../../adapters/storage/key.ts';

export const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Keep one workspace sweep bounded even if a volume contains unexpected files. */
export const MAX_ORPHAN_SCAN_OBJECTS = 1_000;

type DeleteObject = (root: string, objectKey: string) => Promise<void>;

export type CleanupOrphanedAssetsInput = Readonly<{
  workspaceId: string;
  root?: string;
  store?: PrivateObjectStore;
  now?: Date;
  /** Test/operations hook; the default is the validated local storage deleter. */
  deleteObject?: DeleteObject;
}>;

export type CleanupObjectFailure = Readonly<{
  objectKey: string;
  error: string;
  retryAt: string;
}>;

export type CleanupOrphanedAssetsReport = Readonly<{
  /** Number of pending asset rows removed after their object was collected. */
  deletedRows: number;
  /** Number of object keys successfully collected, including rowless objects. */
  deletedObjects: number;
  /** Number of regular files inspected under this workspace's storage prefixes. */
  scannedObjects: number;
  /** Object removals that failed; referenced rows remain available for retry. */
  failures: ReadonlyArray<CleanupObjectFailure>;
}>;

type Candidate = Readonly<{id: string; objectKey: string}>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function retryAt(now: Date): string {
  return now.toISOString();
}

async function readScanCursor(store: PrivateObjectStore, cursorKey: string): Promise<string | null> {
  try {
    const value: unknown = JSON.parse(Buffer.from(await store.get(cursorKey)).toString('utf8'));
    return value && typeof value === 'object' && 'after' in value && typeof value.after === 'string' ? value.after : null;
  } catch (error) {
    if (error instanceof SyntaxError || (error as {code?: string}).code === 'ENOENT' || (error as {code?: string}).code === 'NOT_FOUND') return null;
    throw error;
  }
}

async function writeScanCursor(store: PrivateObjectStore, cursorKey: string, after: string | null): Promise<void> {
  await store.put(cursorKey, Buffer.from(JSON.stringify({after}), 'utf8'), 'application/json');
}

async function isOldObject(store: PrivateObjectStore, objectKey: string, cutoff: Date): Promise<boolean> {
  const head = await store.head(objectKey);
  return Boolean(head?.modifiedAt && head.modifiedAt.getTime() <= cutoff.getTime());
}

async function collectPendingRows(db: AppDatabase, workspaceId: string, cutoff: Date): Promise<Candidate[]> {
  return db.transaction(async (tx) => tx.select({id: assets.id, objectKey: assets.objectKey}).from(assets).where(and(
    eq(assets.workspaceId, workspaceId),
    eq(assets.state, 'pending'),
    isNull(assets.taskId),
    lte(assets.createdAt, cutoff),
  )).for('update', {skipLocked: true}));
}

async function collectWorkspacePrefixes(db: AppDatabase, workspaceId: string): Promise<string[]> {
  const tasks = await db.select({id: generationTasks.id}).from(generationTasks).where(eq(generationTasks.workspaceId, workspaceId));
  return [`workspaces/${workspaceId}`, ...tasks.map((task) => `tasks/${task.id}`)].sort();
}

/**
 * Collect old taskless rows and rowless files for one workspace. A row is
 * deleted only after the validated filesystem removal succeeds; on failure
 * the row and its updated_at retry marker remain available for the next sweep.
 */
export async function cleanupOrphanedAssetsDetailed(db: AppDatabase, input: CleanupOrphanedAssetsInput): Promise<CleanupOrphanedAssetsReport> {
  const store = resolvePrivateObjectStore(input.store, input.root);
  if (input.deleteObject && !input.root) throw new Error('A storage root is required by the custom cleanup deleter.');
  assertObjectKey(`workspaces/${input.workspaceId}/cleanup-marker`);
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - ORPHAN_RETENTION_MS);
  const remove = input.deleteObject ?? ((_root: string, objectKey: string) => store.delete(objectKey));
  const failures: CleanupObjectFailure[] = [];
  let deletedRows = 0;
  let deletedObjects = 0;

  const prefixes = await collectWorkspacePrefixes(db, input.workspaceId);
  const isScopedObjectKey = (objectKey: string): boolean => prefixes.some((prefix) => objectKey === prefix || objectKey.startsWith(`${prefix}/`));
  const cursorKey = `.cleanup-cursors/${input.workspaceId}.json`;
  const savedCursor = await readScanCursor(store, cursorKey);
  const after = savedCursor && isScopedObjectKey(savedCursor) ? savedCursor : null;
  const candidates = await collectPendingRows(db, input.workspaceId, cutoff);
  for (const candidate of candidates) {
    if (!isScopedObjectKey(candidate.objectKey)) continue;
    const outcome = await db.transaction(async (tx) => {
      const locked = (await tx.select({id: assets.id, objectKey: assets.objectKey}).from(assets).where(and(
        eq(assets.id, candidate.id),
        eq(assets.workspaceId, input.workspaceId),
        eq(assets.state, 'pending'),
        isNull(assets.taskId),
        lte(assets.createdAt, cutoff),
      )).for('update', {skipLocked: true}))[0];
      if (!locked) return {status: 'skipped'} as const;
      // Object keys are expected to be unique, but keep the cleanup safe on a
      // partially migrated/local database where a foreign live row may still
      // reference the same key.
      const sharedReference = (await tx.select({id: assets.id}).from(assets).where(and(
        eq(assets.objectKey, locked.objectKey),
        ne(assets.id, locked.id),
        ne(assets.state, 'deleted'),
      )).limit(1))[0];
      if (sharedReference) return {status: 'skipped'} as const;
      try {
        await remove(input.root ?? '', locked.objectKey);
      } catch (error) {
        await tx.update(assets).set({updatedAt: now}).where(and(eq(assets.id, locked.id), eq(assets.workspaceId, input.workspaceId)));
        return {status: 'failed', objectKey: locked.objectKey, error: errorMessage(error)} as const;
      }
      const deleted = await tx.delete(assets).where(and(
        eq(assets.id, locked.id),
        eq(assets.workspaceId, input.workspaceId),
        eq(assets.state, 'pending'),
        isNull(assets.taskId),
      )).returning({id: assets.id});
      return {status: deleted.length === 1 ? 'deleted' : 'skipped'} as const;
    });
    if (outcome.status === 'deleted') {
      deletedRows += 1;
      deletedObjects += 1;
    } else if (outcome.status === 'failed') {
      failures.push({objectKey: outcome.objectKey, error: outcome.error, retryAt: retryAt(now)});
    }
  }

  const liveRows = await db.select({objectKey: assets.objectKey}).from(assets).where(and(eq(assets.workspaceId, input.workspaceId), ne(assets.state, 'deleted')));
  const referenced = new Set(liveRows.map((row) => row.objectKey));
  const physicalKeys = new Set<string>();
  for (const prefix of prefixes) {
    const remaining = MAX_ORPHAN_SCAN_OBJECTS - physicalKeys.size;
    if (remaining <= 0) break;
    const keys = await store.list(prefix, remaining, after);
    for (const key of keys) physicalKeys.add(key);
  }

  for (const objectKey of physicalKeys) {
    const old = await isOldObject(store, objectKey, cutoff);
    if (referenced.has(objectKey) || !old) continue;
    const current = await db.select({objectKey: assets.objectKey}).from(assets).where(and(
      eq(assets.objectKey, objectKey),
      ne(assets.state, 'deleted'),
    )).limit(1);
    if (current[0]) continue;
    try {
      await remove(input.root ?? '', objectKey);
      deletedObjects += 1;
    } catch (error) {
      failures.push({objectKey, error: errorMessage(error), retryAt: retryAt(now)});
    }
  }

  // Save progress only after completing the page. Failures remain eligible on
  // the next full cycle; new keys before the cursor are also found after wrap.
  const lastKey = [...physicalKeys].at(-1) ?? null;
  await writeScanCursor(store, cursorKey, physicalKeys.size === MAX_ORPHAN_SCAN_OBJECTS ? lastKey : null);
  return Object.freeze({deletedRows, deletedObjects, scannedObjects: physicalKeys.size, failures});
}

/** Backward-compatible count used by existing probe and worker callers. */
export async function cleanupOrphanedAssets(db: AppDatabase, input: CleanupOrphanedAssetsInput): Promise<number> {
  return (await cleanupOrphanedAssetsDetailed(db, input)).deletedRows;
}
