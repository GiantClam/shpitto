import assert from 'node:assert/strict';
import test from 'node:test';
import {drainRecoveryBatches} from '../../src/modules/generation/sweep-recovery.ts';
import {runProviderWorkerOnce} from '../../src/modules/generation/provider-worker.ts';
import {DomainError} from '../../src/db/contracts.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import type {PrivateObjectStore} from '../../src/adapters/storage/port.ts';

test('restoration drains more than one batch and confirms emptiness before progress', async () => {
  const batches = [{scanned: 100, failed: 100}, {scanned: 1, failed: 1}, {scanned: 0, failed: 0}];
  let calls = 0;
  const result = await drainRecoveryBatches(async () => batches[calls++]!);
  assert.deepEqual(result, {scanned: 101, failed: 101, batches: 3, drained: true});
});

test('restoration defers dispatch on a nonprogressing or over-budget backlog', async () => {
  assert.deepEqual(await drainRecoveryBatches(async () => ({scanned: 1, failed: 0})), {scanned: 1, failed: 0, batches: 1, drained: false});
  const bounded = await drainRecoveryBatches(async () => ({scanned: 100, failed: 100}), 2);
  assert.deepEqual(bounded, {scanned: 200, failed: 200, batches: 2, drained: false});
  await assert.rejects(() => drainRecoveryBatches(async () => ({scanned: 0, failed: 0}), 0), /batch/);
  await assert.rejects(() => drainRecoveryBatches(async () => { throw new Error('fixture-read-error'); }), /fixture-read-error/);
});

test('incomplete restoration returns recovery_pending before outbox claim or provider construction', async () => {
  let transactions = 0;
  let providers = 0;
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const query = {from: () => query, where: () => query, orderBy: () => query, limit: async () => [{id: '00000000-0000-4000-8000-000000000002', workspaceId, requestedBy: 'fixture-owner'}]};
  const db = {select: () => query, transaction: async () => { transactions++; throw new DomainError('CONFLICT', 'Controlled settlement contention.'); }} as unknown as AppDatabase;
  const result = await runProviderWorkerOnce(db, {config: {taskRuntime: 'self_hosted', state: 'active', workspaceId, allowCreate: true, modelKeys: ['replicate-wan22-t2v'], pollMs: 1000},
    owner: 'fixture-worker', store: {} as PrivateObjectStore, providerFactory: () => { providers++; throw new Error('Provider must not be constructed.'); }});
  assert.deepEqual(result, {claimed: false, outcome: 'recovery_pending'});
  assert.equal(transactions, 1, 'Only the blocked settlement runs; claimOutbox must not open another transaction.');
  assert.equal(providers, 0);
});
