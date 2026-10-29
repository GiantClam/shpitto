import assert from 'node:assert/strict';
import test from 'node:test';

import type {PrivateObjectStore} from '../../src/adapters/storage/port.ts';
import {DomainError} from '../../src/db/contracts.ts';
import {runPrivateStorageLiveProbe} from '../../scripts/probe-private-storage-live.ts';

function fixtureStore(options: {failGet?: boolean; failPut?: boolean; failDelete?: boolean} = {}) {
  const objects = new Map<string, {bytes: Uint8Array; contentType?: string}>();
  objects.set('existing/business-object.mp4', {bytes: new Uint8Array([99])});
  const deleted: string[] = [];
  const store: PrivateObjectStore = {
    driver: 's3',
    async put(key, bytes, contentType) {
      objects.set(key, {bytes: new Uint8Array(bytes), contentType});
      if (options.failPut) throw new Error('Response lost after write.');
    },
    async get(key) {
      if (options.failGet) return new Uint8Array([0]);
      const object = objects.get(key);
      if (!object) throw new DomainError('NOT_FOUND', 'Private object was not found.');
      return new Uint8Array(object.bytes);
    },
    async head(key) {
      const object = objects.get(key);
      return object ? {bytes: object.bytes.byteLength, contentType: object.contentType, modifiedAt: new Date()} : null;
    },
    async list(prefix, limit, after = null) {
      return [...objects.keys()].filter((key) => key.startsWith(`${prefix}/`) && (!after || key > after)).sort().slice(0, limit);
    },
    async delete(key) {
      if (options.failDelete) throw new Error('Delete transport failure.');
      deleted.push(key);
      objects.delete(key);
    },
  };
  return {store, objects, deleted};
}

const media = [{bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4', extension: 'mp4', source: 'fixture.mp4'}];
const target = {bucket: 'private-media', endpoint: 'https://account.r2.cloudflarestorage.com'};

test('live probe verifies roundtrip, overwrite, pagination, anonymous denial and exact-key cleanup', async () => {
  const fixture = fixtureStore();
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 403});
  assert.equal(report.status, 'PASS_LIVE_S3_ADAPTER');
  assert.ok(report.checks.every((check) => check.status === 'PASS'));
  assert.equal(report.cleanup.listConfirmedEmpty, true);
  assert.equal(report.cleanup.headConfirmedMissing, true);
  assert.equal(report.cleanup.getConfirmedMissing, true);
  assert.equal(report.cleanup.remainingKeys.length, 0);
  assert.equal(fixture.deleted.length, 2);
  assert.ok(fixture.deleted.every((key) => key.startsWith(`${report.prefix}/`)));
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});

test('live probe accepts the R2 S3 API unsigned-request rejection shape', async () => {
  const fixture = fixtureStore();
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 400});
  assert.equal(report.status, 'PASS_LIVE_S3_ADAPTER');
  assert.match(report.checks.find((check) => check.name === 'unsigned_s3_get_denied')?.detail ?? '', /400 InvalidArgument/);
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});
test('live probe supports multiple provider media files under one fresh isolated prefix', async () => {
  const fixture = fixtureStore();
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media: [...media, {...media[0], source: 'second.mp4'}], ...target, anonymousRead: async () => 403});
  assert.equal(report.status, 'PASS_LIVE_S3_ADAPTER');
  assert.equal(report.media.length, 2);
  assert.equal(fixture.deleted.length, 3);
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});

test('hash mismatch fails proof and still removes only the generated probe objects', async () => {
  const fixture = fixtureStore({failGet: true});
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 403});
  assert.equal(report.status, 'FAIL_LIVE_S3_ADAPTER');
  assert.ok(report.checks.some((check) => check.status === 'FAIL'));
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});

test('lost put response triggers cleanup of the exact attempted key', async () => {
  const fixture = fixtureStore({failPut: true});
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 403});
  assert.equal(report.status, 'FAIL_LIVE_S3_ADAPTER');
  assert.equal(fixture.deleted.length, 1);
  assert.equal(report.cleanup.listConfirmedEmpty, true);
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});

test('cleanup failure cannot produce a passing live evidence record', async () => {
  const fixture = fixtureStore({failDelete: true});
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 403});
  assert.equal(report.status, 'FAIL_LIVE_S3_ADAPTER');
  assert.equal(report.cleanup.remainingKeys.length, 2);
  assert.ok(report.cleanup.errors.length > 0);
  assert.ok(fixture.objects.has('existing/business-object.mp4'));
});

test('unauthenticated access success fails proof and preserves cleanup', async () => {
  const fixture = fixtureStore();
  const report = await runPrivateStorageLiveProbe({store: fixture.store, media, ...target, anonymousRead: async () => 200});
  assert.equal(report.status, 'FAIL_LIVE_S3_ADAPTER');
  assert.ok(report.checks.some((check) => check.name === 'unsigned_s3_get_denied' && check.status === 'FAIL'));
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});

test('probe refuses local or insecure transport before storage side effects', async () => {
  const fixture = fixtureStore();
  await assert.rejects(() => runPrivateStorageLiveProbe({store: {...fixture.store, driver: 'local'}, media, ...target, anonymousRead: async () => 403}), /S3/i);
  await assert.rejects(() => runPrivateStorageLiveProbe({store: fixture.store, media, ...target, endpoint: 'http://localhost:9000', anonymousRead: async () => 403}), /HTTPS/i);
  assert.equal(fixture.deleted.length, 0);
  assert.deepEqual([...fixture.objects.keys()], ['existing/business-object.mp4']);
});
