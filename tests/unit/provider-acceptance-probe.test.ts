import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseProbeArgs, assertRunScope, assertSubmitAllowed, preflightBeforeFence, requireSubmissionFence, onePaidCreate, parseOutputMedia, probeOutputMedia, sanitizeReport, type ProbeState} from '../../scripts/probe-provider-acceptance.ts';

const runId = '845ae195-6d34-42a3-967b-e92daa6b0dde';
const args = (extra: string[] = []) => ['--run-id', runId, '--model-key', 'replicate-wan22-t2v', '--phase', 'prepare', ...extra];
const state = (): ProbeState => ({runId, modelKey: 'replicate-wan22-t2v', ownerId: `acceptance-owner-${runId}`, outsiderId: `acceptance-outsider-${runId}`, stage: 'prepared', authorizedMaxPosts: 1, observedPostRequests: 0, workspaceId: runId, taskId: runId});

test('CLI requires exact UUID, phase and the three missing rows only', () => {
  assert.equal(parseProbeArgs(args()).phase, 'prepare');
  assert.equal(parseProbeArgs(args().map(v => v === runId ? runId.toUpperCase() : v)).runId, runId);
  for (const key of ['fal-wan22-i2v', 'replicate-wan22-t2v', 'replicate-wan22-i2v']) {
    const cli = parseProbeArgs(['--run-id', runId, '--model-key', key, '--phase', 'inspect']);
    assert.equal(cli.modelKey, key);
  }
  for (const bad of [[], args(['--wat']), args(['--phase', 'submit']), args().map(v => v === runId ? '../escape' : v), args().map(v => v === 'replicate-wan22-t2v' ? 'fal-wan22-t2v' : v)]) assert.throws(() => parseProbeArgs(bad));
});

test('submit requires confirmation; I2V prepare requires local crop path and consent', () => {
  const submit = args().map(v => v === 'prepare' ? 'submit' : v);
  assert.throws(() => parseProbeArgs(submit));
  assert.equal(parseProbeArgs([...submit, '--confirm-one-paid-request']).confirm, true);
  const image = args().map(v => v === 'replicate-wan22-t2v' ? 'fal-wan22-i2v' : v);
  assert.throws(() => parseProbeArgs(image));
  assert.throws(() => parseProbeArgs([...image, '--input-image-path', 'https://example.test/x.png', '--confirm-input-crop']));
  assert.equal(parseProbeArgs([...image, '--input-image-path', '/tmp/crop.png', '--confirm-input-crop']).cropConfirmed, true);
});

test('state can authorize only its exact fresh seeded row/run', () => {
  assertRunScope(state(), parseProbeArgs(args()));
  for (const patch of [{runId: 'other'}, {modelKey: 'fal-wan22-t2v'}, {ownerId: 'business-owner'}, {authorizedMaxPosts: 2}]) assert.throws(() => assertRunScope({...state(), ...patch}, parseProbeArgs(args())));
});

test('started local or durable fence, nonqueued task or nonzero count prohibits create', () => {
  assertSubmitAllowed(state(), {status: 'queued', submissionStartedAt: null});
  for (const patch of [{stage: 'started'}, {stage: 'unknown'}, {observedPostRequests: 1}]) assert.throws(() => assertSubmitAllowed({...state(), ...patch}, {status: 'queued', submissionStartedAt: null}));
  assert.throws(() => assertSubmitAllowed(state(), {status: 'queued', submissionStartedAt: new Date()}));
  assert.throws(() => assertSubmitAllowed(state(), {status: 'submitted', submissionStartedAt: null}));
});

test('single create reserves count before I/O; concurrent and ambiguous retries fail closed', async () => {
  const order: string[] = [];
  const once = onePaidCreate(async () => {order.push('persist');});
  const post = () => once(async () => {order.push('post'); throw new Error('ambiguous');});
  const result = await Promise.allSettled([post(), post()]);
  assert.deepEqual(result.map(r => r.status), ['rejected', 'rejected']);
  assert.deepEqual(order, ['persist', 'post']);
  await assert.rejects(post);
});

test('failed count persistence sends zero requests and consumes local guard', async () => {
  let posts = 0;
  const once = onePaidCreate(async () => {throw new Error('disk');});
  await assert.rejects(() => once(async () => {posts++;}));
  await assert.rejects(() => once(async () => {posts++;}));
  assert.equal(posts, 0);
});

test('account preflight failure starts neither fence nor POST; successful preflight precedes fence', async () => {
  const order: string[] = [];
  const fence = async () => {order.push('fence'); return 'lease';};
  await assert.rejects(() => preflightBeforeFence(async () => {throw new Error('account mismatch');}, fence));
  assert.equal(order.length, 0);
  assert.equal(await preflightBeforeFence(async () => {order.push('preflight');}, fence), 'lease');
  assert.deepEqual(order, ['preflight', 'fence']);
});

test('a rejected durable fence sends zero POSTs and a successful fence permits exactly one', async () => {
  let posts = 0;
  const once = onePaidCreate(async () => {});
  const send = () => once(async () => {posts++; return 'authoritative-id';});
  await assert.rejects(() => preflightBeforeFence(async () => {}, () => requireSubmissionFence(async () => false)).then(send));
  assert.equal(posts, 0);
  assert.equal(await preflightBeforeFence(async () => {}, () => requireSubmissionFence(async () => true)).then(send), 'authoritative-id');
  await assert.rejects(send);
  assert.equal(posts, 1);
});

test('report uses a closed schema and omits all secrets, bodies, keys and signed locations', () => {
  const report = sanitizeReport({...state(), token: 'SECRET', objectKey: 'SECRET', attemptNonce: 'SECRET', inputUrl: 'https://SECRET', output: {objectKey: 'SECRET'}, rawBody: 'SECRET', statusUrl: 'SECRET', providerRequestId: 'prediction-123', catalogSnapshotSha256: 'a'.repeat(64), normalizedInputImageSha256: 'b'.repeat(64), quotedCredits: '10', reservationId: runId});
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
  assert.equal(report.providerRequestId, 'prediction-123');
  assert.equal(report.providerCostStatus, 'UNKNOWN');
  assert.equal(report.automaticRetry, false);
  assert.equal(report.catalogSnapshotSha256, 'a'.repeat(64));
  assert.equal(report.normalizedInputImageSha256, 'b'.repeat(64));
  assert.equal(report.quotedCredits, '10');
  assert.equal(report.reservationId, runId);
  assert.equal(sanitizeReport({...state(), providerRequestId: 'https://SECRET'}).providerRequestId, null);
  assert.equal(JSON.stringify(sanitizeReport({...state(), phase: {toString: () => 'submit', token: 'SECRET'}})).includes('SECRET'), false);
});

test('output inspection retains only bounded decoded dimensions and duration', () => {
  const media = {streams: [{width: 1280, height: 720, secret: 'SECRET'}], format: {duration: '5.0625'}};
  assert.deepEqual(parseOutputMedia(media), {width: 1280, height: 720, durationMs: 5063});
  for (const bad of [null, {}, {...media, streams: [{width: 0, height: 720}]}, {...media, format: {duration: 'NaN'}}, {...media, format: {duration: '-1'}}]) assert.throws(() => parseOutputMedia(bad));
});

test('output inspection supports seek-required MP4 with trailing movie metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shpitto-acceptance-media-'));
  try {
    const file = join(dir, 'trailing-moov.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=16', '-t', '0.25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], {timeout: 15_000, windowsHide: true});
    const bytes = await readFile(file);
    assert.ok(bytes.lastIndexOf('moov') > bytes.indexOf('mdat'));
    assert.deepEqual(await probeOutputMedia(bytes), {width: 1280, height: 720, durationMs: 250});
  } finally {await rm(dir, {recursive: true, force: true});}
});
