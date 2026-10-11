import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand} from '@aws-sdk/client-s3';
import {createLocalObjectStore} from '../../src/adapters/storage/local.ts';
import {createPrivateObjectStore} from '../../src/adapters/storage/port.ts';
import {createS3ObjectStore, type S3CommandClient, type S3ObjectStoreConfig} from '../../src/adapters/storage/s3-object-store.ts';

const config: S3ObjectStoreConfig = {endpoint: 'https://account.r2.cloudflarestorage.com', region: 'auto', bucket: 'private-media', accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret'};

test('local private object store preserves isolated opaque-key operations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shpitto-local-store-'));
  const store = createLocalObjectStore(root);
  try {
    await store.put('workspaces/tenant/inputs/asset.webp', new Uint8Array([1, 2, 3]), 'image/webp');
    assert.deepEqual([...await store.get('workspaces/tenant/inputs/asset.webp')], [1, 2, 3]);
    assert.equal((await store.head('workspaces/tenant/inputs/asset.webp'))?.bytes, 3);
    assert.deepEqual(await store.list('workspaces/tenant', 10), ['workspaces/tenant/inputs/asset.webp']);
    await assert.rejects(() => store.put('../escape', new Uint8Array([1])), /invalid/i);
    await store.delete('workspaces/tenant/inputs/asset.webp');
    assert.equal(await store.head('workspaces/tenant/inputs/asset.webp'), null);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('one S3-compatible adapter maps put/get/head/list/delete for R2 or AWS endpoints', async () => {
  const calls: string[] = [];
  const client: S3CommandClient = {async send(command) {
    if (command instanceof PutObjectCommand) { calls.push('put'); assert.equal(command.input.Bucket, config.bucket); return {}; }
    if (command instanceof GetObjectCommand) { calls.push('get'); return {Body: {transformToByteArray: async () => new Uint8Array([4, 5])}}; }
    if (command instanceof HeadObjectCommand) { calls.push('head'); return {ContentLength: 2, ContentType: 'video/mp4', LastModified: new Date('2026-10-01T00:00:00Z')}; }
    if (command instanceof ListObjectsV2Command) { calls.push('list'); assert.equal(command.input.Prefix, 'tasks/task-1/'); return {Contents: [{Key: 'tasks/task-1/output.mp4'}]}; }
    if (command instanceof DeleteObjectCommand) { calls.push('delete'); return {}; }
    throw new Error('Unexpected S3 command.');
  }};
  const store = createS3ObjectStore(config, client);
  assert.equal(store.driver, 's3');
  assert.equal(createS3ObjectStore({...config, endpoint: 'https://s3.us-west-2.amazonaws.com', region: 'us-west-2'}, client).driver, 's3');
  await store.put('tasks/task-1/output.mp4', new Uint8Array([4, 5]), 'video/mp4');
  assert.deepEqual([...await store.get('tasks/task-1/output.mp4')], [4, 5]);
  assert.deepEqual(await store.head('tasks/task-1/output.mp4'), {bytes: 2, modifiedAt: new Date('2026-10-01T00:00:00Z'), contentType: 'video/mp4'});
  assert.deepEqual(await store.list('tasks/task-1', 5), ['tasks/task-1/output.mp4']);
  await store.delete('tasks/task-1/output.mp4');
  assert.deepEqual(calls, ['put', 'get', 'head', 'list', 'delete']);
});

test('S3-compatible adapter rejects insecure endpoint and invalid keys before transport', async () => {
  let calls = 0;
  const client: S3CommandClient = {async send() { calls += 1; return {}; }};
  assert.throws(() => createS3ObjectStore({...config, endpoint: 'http://localhost:9000'}, client), /HTTPS/i);
  assert.equal(createS3ObjectStore({...config, endpoint: 'http://localhost:9000', allowInsecureEndpoint: true, forcePathStyle: true}, client).driver, 's3');
  const store = createS3ObjectStore(config, client);
  await assert.rejects(() => store.put('../escape', new Uint8Array([1])), /invalid/i);
  assert.equal(calls, 0);
});

test('runtime factory keeps the S3-compatible deployment under one driver', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shpitto-storage-factory-'));
  try {
    assert.equal(createPrivateObjectStore({storageDriver: 'local', assetRoot: root}).driver, 'local');
    assert.throws(() => createPrivateObjectStore({storageDriver: 's3', assetRoot: root}), /configuration is incomplete/i);
  } finally { await rm(root, {recursive: true, force: true}); }
});
