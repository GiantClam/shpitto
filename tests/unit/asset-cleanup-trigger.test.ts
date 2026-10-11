import assert from 'node:assert/strict';
import test from 'node:test';

import type {PrivateObjectStore} from '../../src/adapters/storage/port.ts';
import {ASSET_CLEANUP_CURSOR_KEY, runAssetCleanupBatch} from '../../src/trigger/cleanup-assets.ts';

function memoryStore(): PrivateObjectStore {
  const objects = new Map<string, Uint8Array>();
  return {
    driver: 's3',
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) {
      const value = objects.get(key);
      if (!value) {
        const error = new Error('missing') as Error & {code: string};
        error.code = 'NOT_FOUND';
        throw error;
      }
      return new Uint8Array(value);
    },
    async delete(key) { objects.delete(key); },
    async head(key) { const value = objects.get(key); return value ? {bytes: value.byteLength, modifiedAt: new Date()} : null; },
    async list(prefix, limit, after = null) {
      return [...objects.keys()].filter((key) => key.startsWith(`${prefix}/`) && (!after || key > after)).sort().slice(0, limit);
    },
  };
}

const emptyReport = {deletedRows: 0, deletedObjects: 0, scannedObjects: 0, failures: []};

test('production cleanup batches workspaces, persists progress, and wraps', async () => {
  const store = memoryStore();
  const ids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  const cleaned: string[] = [];
  const load = async (after: string | null, limit: number) => ids.filter((id) => !after || id > after).slice(0, limit);
  const cleanup = async (workspaceId: string) => { cleaned.push(workspaceId); return emptyReport; };

  const first = await runAssetCleanupBatch({store, batchSize: 2, loadWorkspaceIds: load, cleanupWorkspace: cleanup});
  assert.deepEqual(cleaned, ids.slice(0, 2));
  assert.equal(first.nextWorkspaceAfter, ids[1]);
  assert.match(Buffer.from(await store.get(ASSET_CLEANUP_CURSOR_KEY)).toString('utf8'), new RegExp(ids[1]));

  const second = await runAssetCleanupBatch({store, batchSize: 2, loadWorkspaceIds: load, cleanupWorkspace: cleanup});
  assert.deepEqual(cleaned, ids);
  assert.equal(second.nextWorkspaceAfter, null);

  const third = await runAssetCleanupBatch({store, batchSize: 2, loadWorkspaceIds: load, cleanupWorkspace: cleanup});
  assert.deepEqual(cleaned, [...ids, ...ids.slice(0, 2)]);
  assert.equal(third.nextWorkspaceAfter, ids[1]);
});

test('one workspace failure does not prevent later workspace cleanup', async () => {
  const store = memoryStore();
  const ids = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012'];
  const report = await runAssetCleanupBatch({
    store,
    loadWorkspaceIds: async () => ids,
    cleanupWorkspace: async (workspaceId) => {
      if (workspaceId === ids[0]) throw new Error('transport details must not escape');
      return {...emptyReport, deletedObjects: 1};
    },
  });
  assert.deepEqual(report.workspaces.map((item) => ({workspaceId: item.workspaceId, failures: item.failures, error: item.error})), [
    {workspaceId: ids[0], failures: 1, error: 'Error'},
    {workspaceId: ids[1], failures: 0, error: undefined},
  ]);
});
