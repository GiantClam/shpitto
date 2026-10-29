import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {and, eq} from 'drizzle-orm';
import {getProviderWorkerConfig, getServerEnv} from '../src/config/env.ts';
import {assertPrivateRailwayWorkerDatabase} from '../src/config/provider-worker.ts';
import {createDatabase} from '../src/db/client.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {assets} from '../src/db/schema/asset.ts';
import {authSession} from '../src/db/schema/auth.ts';
import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';
import {createAssetDownloadToken} from '../src/modules/assets/authorize.ts';

const RUN_ID = 'c051d17d-5515-4de9-b324-4aa01ae81bda';
const STATE_PATH = `/tmp/shpitto-fal-authorized-${RUN_ID}.json`;
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
type State = {runId: string; ownerId: string; outsiderId: string; workspaceId: string; taskId: string; cleanupProbe?: {assetId: string; objectKey: string; syntheticCreatedAt: string; seededAt?: string}};

export type AuthorizedVideoMetadata = {streams: Array<{width: number; height: number; nb_frames: string; r_frame_rate: string; avg_frame_rate: string}>; format: {duration: string}};
/** FFmpeg r_frame_rate is an estimated timestamp base, not the requested FPS. */
export function assertAuthorizedVideoMetadata(metadata: AuthorizedVideoMetadata): void {
  const stream = metadata.streams[0];
  assert.ok(stream);
  assert.equal(stream.width, 1280); assert.equal(stream.height, 720);
  assert.equal(stream.nb_frames, '81');
  const rate = stream.avg_frame_rate.split('/').map(Number);
  assert.ok(rate.length === 2 && rate.every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(rate[0] / rate[1] - 16) <= 1 / 16, 'Measured average FPS must agree with the requested preset within 0.0625 FPS.');
  const duration = Number(metadata.format.duration);
  assert.ok(Number.isFinite(duration) && Math.abs(duration - 81 / 16) <= 1 / 16, 'Encoded duration must agree with the authorized frame/rate preset within one frame.');
}

export function assertScheduledCleanupReceipt(receipt: {httpStatus: number; seededAt: string; lastCleanupAt?: string; errors?: number}): void {
  assert.equal(receipt.httpStatus, 200); assert.equal(receipt.errors, 0);
  const seededAt = Date.parse(receipt.seededAt), cleanedAt = Date.parse(receipt.lastCleanupAt ?? '');
  assert.ok(Number.isFinite(seededAt) && Number.isFinite(cleanedAt) && cleanedAt >= seededAt, 'A cleanup observation must be fresh relative to the fixture seed.');
}
const provenance = {seededAuthFixture: true, actualProviderCostStatus: 'UNKNOWN', postCounterSource: 'local-only'} as const;

let step = 'preflight';
async function main(): Promise<void> {
  const phase = process.argv[2];
  assert.ok(['verify-api', 'seed-orphan', 'verify-orphan'].includes(phase));
  const state: State = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  assert.equal(state.runId, RUN_ID);
  const config = getProviderWorkerConfig();
  const env = getServerEnv();
  assert.equal(env.runtimeProfile, 'acceptance');
  assert.equal(env.storageDriver, 's3');
  assert.equal(config.allowCreate, false);
  if (config.state === 'active') assert.equal(config.workspaceId, state.workspaceId);
  assertPrivateRailwayWorkerDatabase(env.databaseUrl);
  const database = createDatabase({max: 2});
  const store = getPrivateObjectStore();
  try {
    const task = (await database.db.select().from(generationTasks).where(and(eq(generationTasks.id, state.taskId), eq(generationTasks.workspaceId, state.workspaceId), eq(generationTasks.requestedBy, state.ownerId))).limit(1))[0];
    assert.equal(task?.status, 'succeeded');
    const output = (await database.db.select().from(assets).where(and(eq(assets.taskId, state.taskId), eq(assets.workspaceId, state.workspaceId), eq(assets.purpose, 'output'), eq(assets.state, 'ready'))).limit(1))[0];
    assert.ok(output);
    if (phase === 'seed-orphan') {
      assert.equal(config.state, 'active');
      assert.equal(state.cleanupProbe, undefined, 'A run may create only one cleanup probe.');
      const assetId = randomUUID();
      const objectKey = `workspaces/${state.workspaceId}/inputs/${assetId}.m4-cleanup-probe`;
      const seededAt = new Date().toISOString();
      const syntheticCreatedAt = new Date(Date.parse(seededAt) - 25 * 60 * 60 * 1_000).toISOString();
      const bytes = Buffer.from('Owned M4 cleanup fixture; never a provider input.', 'utf8');
      state.cleanupProbe = {assetId, objectKey, syntheticCreatedAt, seededAt};
      await writeFile(STATE_PATH, JSON.stringify(state), {mode: 0o600});
      await store.put(objectKey, bytes, 'application/octet-stream');
      const head = await store.head(objectKey);
      assert.equal(head?.bytes, bytes.byteLength);
      await database.db.insert(assets).values({id: assetId, workspaceId: state.workspaceId, taskId: null, purpose: 'input', state: 'pending', objectKey, createdBy: state.ownerId, mime: 'application/octet-stream', bytes: BigInt(bytes.byteLength), sha256: digest(bytes), createdAt: new Date(syntheticCreatedAt), updatedAt: new Date()});
      console.log(JSON.stringify({...provenance, phase, runId: RUN_ID, workspaceId: state.workspaceId, assetId, objectPresentBefore: true, syntheticDatabaseAgeHours: 25, seededAt, realObjectCreatedNow: true, manualCleanupCalled: false, providerCalls: 0}));
      return;
    }
    if (phase === 'verify-orphan') {
      assert.ok(state.cleanupProbe);
      const rows = await database.db.select({id: assets.id}).from(assets).where(and(eq(assets.id, state.cleanupProbe.assetId), eq(assets.workspaceId, state.workspaceId))).limit(1);
      const orphan = await store.head(state.cleanupProbe.objectKey);
      const retained = await store.head(output.objectKey);
      const r = await fetch(`http://127.0.0.1:${envPort()}/healthz`, {signal: AbortSignal.timeout(5_000)});
      const health = await r.json() as {lastCleanupAt?: string; errors?: number};
      assert.equal(rows.length, 0); assert.equal(orphan, null); assert.ok(retained);
      const seededAt = state.cleanupProbe.seededAt ?? new Date(Date.parse(state.cleanupProbe.syntheticCreatedAt) + 25 * 60 * 60 * 1_000).toISOString();
      assertScheduledCleanupReceipt({httpStatus: r.status, seededAt, lastCleanupAt: health.lastCleanupAt, errors: health.errors});
      console.log(JSON.stringify({...provenance, phase, runId: RUN_ID, workspaceId: state.workspaceId, cleanupAssetId: state.cleanupProbe.assetId, pendingRowRemoved: true, freshR2ObjectRemoved: true, readyOutputRetained: true, fixtureSeededAt: seededAt, lastScheduledCleanupAt: health.lastCleanupAt, schedulerErrors: health.errors, ageEvidence: 'synthetic database age; real scheduled R2 deletion', manualCleanupCalled: false, providerCalls: 0}));
      return;
    }
    step = 'private-object-integrity';
    const privateBytes = await store.get(output.objectKey);
    assert.equal(digest(privateBytes), output.sha256);
    step = 'media-inspection';
    const file = `/tmp/shpitto-m4-owned-video-${randomUUID()}.mp4`;
    let metadata: AuthorizedVideoMetadata;
    let fileWritten = false;
    try {
      await writeFile(file, privateBytes, {flag: 'wx', mode: 0o600}); fileWritten = true;
      metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file], {encoding: 'utf8', timeout: 15_000, maxBuffer: 65_536}));
    } finally { if (fileWritten) await unlink(file); }
    console.log(JSON.stringify({event: 'owned-video-media-observed', media: metadata}));
    step = 'requested-preset-comparison';
    assertAuthorizedVideoMetadata(metadata);
    step = 'temporary-auth-sessions';
    const sessions = [state.ownerId, state.outsiderId].map((userId) => ({id: randomUUID(), userId, token: randomUUID() + randomUUID(), expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(), updatedAt: new Date()}));
    await database.db.insert(authSession).values(sessions);
    try {
      const url = new URL(`/api/workspaces/${state.workspaceId}/assets/${output.id}/download`, env.appUrl);
      const capability = createAssetDownloadToken(env.betterAuthSecret, state.workspaceId, output.id);
      url.searchParams.set('token', capability.token);
      const expired = new URL(url); expired.searchParams.set('token', createAssetDownloadToken(env.betterAuthSecret, state.workspaceId, output.id, new Date(Date.now() - 61_000)).token);
      const wrongAsset = new URL(url); wrongAsset.searchParams.set('token', createAssetDownloadToken(env.betterAuthSecret, state.workspaceId, randomUUID()).token);
      const headers = {authorization: `Bearer ${sessions[0].token}`};
      const fetchStatus = async (target: URL, requestHeaders?: Record<string, string>) => (await fetch(target, {headers: requestHeaders, redirect: 'manual', signal: AbortSignal.timeout(15_000)})).status;
      step = 'http-capability-negative-checks';
      const anonymous = await fetchStatus(url);
      const expiredStatus = await fetchStatus(expired, headers);
      const wrongAssetStatus = await fetchStatus(wrongAsset, headers);
      console.log(JSON.stringify({event: 'owned-download-negative-statuses', anonymous, expiredStatus, wrongAssetStatus}));
      assert.equal(anonymous, 401); assert.equal(expiredStatus, 403); assert.equal(wrongAssetStatus, 403);
      step = 'unsigned-r2-head';
      const r2 = new URL(env.storageS3Endpoint);
      r2.pathname = `${r2.pathname.replace(/\/$/, '')}/${encodeURIComponent(env.storageS3Bucket)}/${output.objectKey.split('/').map(encodeURIComponent).join('/')}`;
      const privateStatus = (await fetch(r2, {method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15_000)})).status;
      // S3 API rejection of unsigned requests may be 400 (malformed authentication), not solely 403.
      // This is an unsigned API check, not an independent public-bucket-policy audit.
      assert.ok([400, 401, 403].includes(privateStatus));
      console.log(JSON.stringify({...provenance, phase, runId: RUN_ID, workspaceId: state.workspaceId, taskId: state.taskId, assetId: output.id, sha256: output.sha256, media: metadata, http: {anonymous, expiredCapability: expiredStatus, wrongAssetCapability: wrongAssetStatus, unsignedR2Head: privateStatus}, unsignedS3CheckIsPublicPolicyAudit: false, sessionTokensRecorded: false, providerCalls: 0}));
    } finally { for (const session of sessions) await database.db.delete(authSession).where(eq(authSession.id, session.id)); }
  } finally { await database.pool.end(); }
}
function envPort(): string { return process.argv[3] ?? '8080'; }
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/probe-fal-runtime-verification.ts')) main().catch(() => {console.error(JSON.stringify({event: 'owned-fal-runtime-verification-failed', step, secretValuesRecorded: false})); process.exitCode = 1;});
