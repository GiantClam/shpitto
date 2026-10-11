import {schedules} from '@trigger.dev/sdk';
import {gt} from 'drizzle-orm';

import type {PrivateObjectStore} from '../adapters/storage/port.ts';
import {getPrivateObjectStore} from '../adapters/storage/runtime.ts';
import {createDatabase, type AppDatabase} from '../db/client.ts';
import {workspaces} from '../db/schema/workspace.ts';
import {cleanupOrphanedAssetsDetailed, type CleanupOrphanedAssetsReport} from '../modules/assets/cleanup.ts';

export const ASSET_CLEANUP_CURSOR_KEY = '.cleanup-cursors/workspace-sweep.json';
export const ASSET_CLEANUP_WORKSPACE_BATCH_SIZE = 100;

type WorkspaceCleanupResult = Readonly<{
  workspaceId: string;
  deletedRows: number;
  deletedObjects: number;
  scannedObjects: number;
  failures: number;
  error?: string;
}>;

export type AssetCleanupBatchReport = Readonly<{
  workspaces: ReadonlyArray<WorkspaceCleanupResult>;
  nextWorkspaceAfter: string | null;
  wrapped: boolean;
}>;

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

async function readWorkspaceCursor(store: PrivateObjectStore): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(await store.get(ASSET_CLEANUP_CURSOR_KEY)).toString('utf8'));
    return parsed && typeof parsed === 'object' && 'after' in parsed && typeof parsed.after === 'string' ? parsed.after : null;
  } catch (error) {
    if (error instanceof SyntaxError || (error as {code?: string}).code === 'NOT_FOUND') return null;
    throw error;
  }
}

async function writeWorkspaceCursor(store: PrivateObjectStore, after: string | null): Promise<void> {
  await store.put(ASSET_CLEANUP_CURSOR_KEY, Buffer.from(JSON.stringify({after}), 'utf8'), 'application/json');
}

async function selectWorkspaceIds(db: AppDatabase, after: string | null, limit: number): Promise<string[]> {
  const rows = await db.select({id: workspaces.id}).from(workspaces)
    .where(after ? gt(workspaces.id, after) : undefined)
    .orderBy(workspaces.id).limit(limit);
  return rows.map((row) => row.id);
}

export async function runAssetCleanupBatch(input: Readonly<{
  store: PrivateObjectStore;
  batchSize?: number;
  now?: Date;
  loadWorkspaceIds: (after: string | null, limit: number) => Promise<ReadonlyArray<string>>;
  cleanupWorkspace: (workspaceId: string, now: Date) => Promise<CleanupOrphanedAssetsReport>;
}>): Promise<AssetCleanupBatchReport> {
  const batchSize = input.batchSize ?? ASSET_CLEANUP_WORKSPACE_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('Asset cleanup workspace batch size must be between 1 and 1000.');
  }
  const savedAfter = await readWorkspaceCursor(input.store);
  let ids = [...await input.loadWorkspaceIds(savedAfter, batchSize + 1)];
  let wrapped = false;
  if (ids.length === 0 && savedAfter) {
    ids = [...await input.loadWorkspaceIds(null, batchSize + 1)];
    wrapped = true;
  }
  const hasMore = ids.length > batchSize;
  const selected = ids.slice(0, batchSize);
  const now = input.now ?? new Date();
  const results: WorkspaceCleanupResult[] = [];
  for (const workspaceId of selected) {
    try {
      const report = await input.cleanupWorkspace(workspaceId, now);
      results.push({
        workspaceId,
        deletedRows: report.deletedRows,
        deletedObjects: report.deletedObjects,
        scannedObjects: report.scannedObjects,
        failures: report.failures.length,
      });
    } catch (error) {
      results.push({workspaceId, deletedRows: 0, deletedObjects: 0, scannedObjects: 0, failures: 1, error: safeError(error)});
    }
  }
  const nextWorkspaceAfter = hasMore ? selected.at(-1) ?? null : null;
  await writeWorkspaceCursor(input.store, nextWorkspaceAfter);
  return Object.freeze({workspaces: results, nextWorkspaceAfter, wrapped});
}

export async function runConfiguredAssetCleanupBatch(
  db: AppDatabase,
  store: PrivateObjectStore,
  now = new Date(),
): Promise<AssetCleanupBatchReport> {
  return runAssetCleanupBatch({
    store,
    now,
    loadWorkspaceIds: (after, limit) => selectWorkspaceIds(db, after, limit),
    cleanupWorkspace: (workspaceId, cleanupNow) => cleanupOrphanedAssetsDetailed(db, {workspaceId, store, now: cleanupNow}),
  });
}

export const orphanAssetCleanupSchedule = schedules.task({
  id: 'orphan-asset-cleanup',
  cron: {pattern: '17 * * * *', timezone: 'UTC', environments: ['PRODUCTION']},
  queue: {concurrencyLimit: 1},
  run: async () => {
    const database = createDatabase();
    try {
      return await runConfiguredAssetCleanupBatch(database.db, getPrivateObjectStore());
    } finally {
      await database.pool.end();
    }
  },
});

