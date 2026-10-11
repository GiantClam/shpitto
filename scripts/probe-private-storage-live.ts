import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import type {PrivateObjectStore} from '../src/adapters/storage/port.ts';
import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';
import {getServerEnv} from '../src/config/env.ts';
import {DomainError} from '../src/db/contracts.ts';

export type ProbeMedia = Readonly<{bytes: Uint8Array; contentType: string; extension: string; source: string}>;
type ProbeCheck = Readonly<{name: string; status: 'PASS' | 'FAIL'; detail?: string}>;
type ProbeObject = Readonly<{key: string; source: string; bytes: number; sha256: string}>;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeError(error: unknown): string {
  if (error instanceof DomainError) return `DomainError:${error.code}`;
  const code = (error as {name?: unknown})?.name;
  const status = (error as {$metadata?: {httpStatusCode?: unknown}})?.$metadata?.httpStatusCode;
  return `${typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : 'Error'}${typeof status === 'number' ? `:${status}` : ''}`;
}

export async function runPrivateStorageLiveProbe(input: Readonly<{
  store: PrivateObjectStore;
  endpoint: string;
  bucket: string;
  media: ReadonlyArray<ProbeMedia>;
  anonymousRead: (objectKey: string) => Promise<number>;
}>) {
  assert.equal(input.store.driver, 's3', 'A real S3-compatible adapter must be used.');
  const endpoint = new URL(input.endpoint);
  assert.equal(endpoint.protocol, 'https:', 'The live storage probe requires HTTPS.');
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'The endpoint must not contain credentials or query data.');
  assert.ok(input.media.length > 0 && input.media.length <= 8, 'Supply one to eight bounded media fixtures.');
  for (const media of input.media) {
    assert.ok(media.bytes.byteLength > 0 && media.bytes.byteLength <= 250 * 1024 * 1024, 'Media must be nonempty and bounded.');
    assert.match(media.extension, /^[a-z0-9]{1,8}$/);
  }
  const prefix = `shpitto-acceptance-${randomUUID()}`;
  const createdKeys: string[] = [];
  const objects: ProbeObject[] = [];
  const checks: ProbeCheck[] = [];
  const cleanupErrors: string[] = [];
  let remainingKeys: string[] = [];
  let headConfirmedMissing = false;
  let getConfirmedMissing = false;
  let listConfirmedEmpty = false;
  let activeCheck = 'prefix_initially_empty';
  const startedAt = new Date().toISOString();
  try {
    assert.deepEqual(await input.store.list(prefix, 10), []);
    checks.push({name: activeCheck, status: 'PASS'});
    for (const [index, media] of input.media.entries()) {
      const key = `${prefix}/media-${index}.${media.extension}`;
      activeCheck = `media_${index}_put`;
      createdKeys.push(key);
      await input.store.put(key, media.bytes, media.contentType);
      checks.push({name: activeCheck, status: 'PASS'});
      activeCheck = `media_${index}_head`;
      const head = await input.store.head(key);
      assert.equal(head?.bytes, media.bytes.byteLength);
      assert.equal(head?.contentType, media.contentType);
      checks.push({name: activeCheck, status: 'PASS'});
      activeCheck = `media_${index}_get_sha256`;
      const downloaded = await input.store.get(key);
      assert.equal(downloaded.byteLength, media.bytes.byteLength);
      assert.equal(sha256(downloaded), sha256(media.bytes));
      checks.push({name: activeCheck, status: 'PASS'});
      objects.push({key, source: media.source, bytes: media.bytes.byteLength, sha256: sha256(media.bytes)});
    }
    const cursorKey = `${prefix}/z-cleanup-cursor.json`;
    createdKeys.push(cursorKey);
    activeCheck = 'cleanup_cursor_overwrite';
    await input.store.put(cursorKey, new TextEncoder().encode('{"after":null}'), 'application/json');
    const cursorBytes = new TextEncoder().encode('{"after":"verified"}');
    await input.store.put(cursorKey, cursorBytes, 'application/json');
    assert.equal(sha256(await input.store.get(cursorKey)), sha256(cursorBytes));
    checks.push({name: activeCheck, status: 'PASS'});
    activeCheck = 'prefix_scoped_list';
    const expectedKeys = [...createdKeys].sort();
    assert.deepEqual([...await input.store.list(prefix, 100)].sort(), expectedKeys);
    checks.push({name: activeCheck, status: 'PASS'});
    activeCheck = 'list_limit_and_start_after';
    const first = await input.store.list(prefix, 1);
    assert.deepEqual(first, expectedKeys.slice(0, 1));
    assert.deepEqual(await input.store.list(prefix, 100, first[0]), expectedKeys.slice(1));
    checks.push({name: activeCheck, status: 'PASS'});
    activeCheck = 'unsigned_s3_get_denied';
    const status = await input.anonymousRead(createdKeys[0]);
    assert.ok([400, 401, 403].includes(status), 'Unsigned S3 API read must not return the object.');
    checks.push({name: activeCheck, status: 'PASS', detail: `HTTP ${status}; R2 may return 400 InvalidArgument for unsigned S3 API requests, and public/custom-domain routes are checked separately.`});
  } catch (error) {
    checks.push({name: activeCheck, status: 'FAIL', detail: safeError(error)});
  } finally {
    for (const key of createdKeys) {
      try {
        assert.ok(key.startsWith(`${prefix}/`));
        await input.store.delete(key);
      } catch (error) {
        cleanupErrors.push(`delete:${key}:${safeError(error)}`);
      }
    }
    try {
      const heads = await Promise.all(createdKeys.map((key) => input.store.head(key)));
      headConfirmedMissing = heads.every((head) => head === null);
      if (!headConfirmedMissing) cleanupErrors.push('head:probe_objects_remain');
    } catch (error) {
      cleanupErrors.push(`head:${safeError(error)}`);
    }
    getConfirmedMissing = true;
    for (const key of createdKeys) {
      try {
        await input.store.get(key);
        getConfirmedMissing = false;
        cleanupErrors.push(`get:${key}:object_remains`);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'NOT_FOUND') {
          getConfirmedMissing = false;
          cleanupErrors.push(`get:${key}:${safeError(error)}`);
        }
      }
    }
    try {
      remainingKeys = [...await input.store.list(prefix, 100)];
      listConfirmedEmpty = remainingKeys.length === 0;
      if (!listConfirmedEmpty) cleanupErrors.push('list:probe_objects_remain');
    } catch (error) {
      cleanupErrors.push(`list:${safeError(error)}`);
    }
    checks.push({name: 'exact_key_delete_and_absence', status: cleanupErrors.length === 0 && headConfirmedMissing && getConfirmedMissing && listConfirmedEmpty ? 'PASS' : 'FAIL'});
  }
  return {
    status: checks.every((check) => check.status === 'PASS') ? 'PASS_LIVE_S3_ADAPTER' : 'FAIL_LIVE_S3_ADAPTER',
    startedAt,
    finishedAt: new Date().toISOString(),
    adapter: 'src/adapters/storage/s3-object-store.ts',
    runtimeFactory: 'src/adapters/storage/runtime.ts',
    endpoint: endpoint.origin,
    bucket: input.bucket,
    prefix,
    checks,
    media: objects,
    cleanup: {attemptedKeys: createdKeys, remainingKeys, headConfirmedMissing, getConfirmedMissing, listConfirmedEmpty, errors: cleanupErrors},
    limitations: ['This probe verifies real object-store operations only. It does not prove database publication, provider callbacks, reservations, cost settlement, or all public bucket access routes.'],
  };
}

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const outputIndex = flags.indexOf('--output');
  const output = outputIndex >= 0 ? flags[outputIndex + 1] : undefined;
  if (outputIndex >= 0) flags.splice(outputIndex, 2);
  if (!output || flags.length < 1 || flags.length > 8) throw new Error('Usage: probe-private-storage-live.ts --output <evidence.json> <media.mp4> [...]');
  const env = getServerEnv();
  if (env.storageDriver !== 's3') throw new Error('Configure STORAGE_DRIVER=s3 and bucket-scoped STORAGE_S3 credentials before running the live probe.');
  const store = getPrivateObjectStore();
  const media: ProbeMedia[] = await Promise.all(flags.map(async (file) => {
    const absolute = resolve(file);
    const metadata = await stat(absolute);
    assert.ok(metadata.isFile() && metadata.size > 0 && metadata.size <= 250 * 1024 * 1024, 'Media fixture must be a bounded regular file.');
    return {bytes: await readFile(absolute), contentType: 'video/mp4', extension: 'mp4', source: file.replaceAll('\\', '/')};
  }));
  const report = await runPrivateStorageLiveProbe({store, endpoint: env.storageS3Endpoint, bucket: env.storageS3Bucket, media, anonymousRead: async (key) => {
    const endpoint = new URL(env.storageS3Endpoint);
    const url = `${endpoint.origin}/${encodeURIComponent(env.storageS3Bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000)});
    await response.body?.cancel();
    return response.status;
  }});
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({status: report.status, checks: report.checks.length, mediaFiles: report.media.length, cleanup: report.cleanup.errors.length === 0, evidence: output}));
  if (report.status !== 'PASS_LIVE_S3_ADAPTER') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(`Live private storage probe failed: ${safeError(error)}`); process.exitCode = 1; });
}
