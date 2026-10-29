import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {relative, resolve} from 'node:path';

import {createReplicateProvider, type ReplicateRequest, type ReplicateResponse} from '../src/adapters/providers/replicate/index.ts';
import {freezeSubmissionContext, validateVideoInput} from '../src/adapters/providers/input.ts';
import {getProviderModel} from '../src/config/provider-models.ts';
import {createServerQuote} from '../src/config/models.ts';
import {semanticHash} from '../src/contracts/http.ts';

const env = globalThis.process['env'];
const token = env.REPLICATE_API_TOKEN?.trim();
const imageUrl = env.REPLICATE_I2V_IMAGE_URL?.trim();
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function safeError(error: unknown): string { if (error instanceof Error) return error.name + ": " + error.message; return String(error); }
function sleep(milliseconds: number): Promise<void> { return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)); }

async function main(): Promise<void> {
  if (!token) throw new Error('REPLICATE_API_TOKEN is required.');
  if (!imageUrl) throw new Error('REPLICATE_I2V_IMAGE_URL is required.');
  if (!outputPath) throw new Error('Usage: probe-replicate-i2v-real.ts --output <evidence.json>');
  const image = new URL(imageUrl);
  if (image.protocol !== 'https:' || image.username || image.password || image.hash) throw new Error('The test image URL must be an HTTPS URL without credentials or fragments.');

  const model = getProviderModel('replicate-wan22-i2v');
  const now = new Date();
  const base = createServerQuote('mock-video', '1', {now});
  const {quoteHash: _baseHash, ...baseQuote} = base;
  const quotePayload = {...baseQuote, modelId: model.modelKey};
  const quote = {...quotePayload, quoteHash: semanticHash('credit.quote', quotePayload)};
  const cropSha256 = '0'.repeat(64);
  const assetId = randomUUID();
  const input = validateVideoInput({modelKey: model.modelKey, mode: 'image-to-video', prompt: 'A slow cinematic camera move across the scene, stable motion, no text', aspectRatio: '16:9', image: {assetId, cropSha256, confirmed: true}});
  const workspaceId = randomUUID();
  const context = freezeSubmissionContext({
    input,
    workspaceId,
    taskId: randomUUID(),
    attemptId: randomUUID(),
    attemptNonce: randomUUID(),
    quote,
    createdAt: now.toISOString(),
    authorizedImage: {assetId, workspaceId, state: 'ready', kind: 'image', cropSha256, width: 1280, height: 720},
  });
  const requests: ReplicateRequest[] = [];
  const transport = {async request(request: ReplicateRequest): Promise<ReplicateResponse> {
    requests.push(request);
    const response = await fetch(request.url, {
      method: request.method,
      headers: {...request.headers, Authorization: `Bearer ${token}`},
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json().catch(() => undefined);
    return {status: response.status, body};
  }};
  const provider = createReplicateProvider({transport, mode: 'test', token, resolveOwnedImageUrl: async () => imageUrl});
  const submitted = await provider.submit(context);
  assert.equal(submitted.kind, 'accepted');
  const requestId = submitted.requestId;
  const ref = {provider: 'replicate' as const, modelKey: model.modelKey, requestId, catalog: model};
  let observation = await provider.getStatus(ref);
  let lastEvidence = observation.evidence;
  let polls = 1;
  while (!['completed', 'failed'].includes(observation.status) && polls < 240) {
    await sleep(5_000);
    observation = await provider.getStatus(ref);
    lastEvidence = observation.evidence;
    polls += 1;
  }

  if (observation.status !== 'completed') {

    const failedResult = await provider.readResult(ref);

    throw new Error('Replicate I2V ended with provider status ' + observation.status + ' (' + lastEvidence.code + '), result=' + JSON.stringify(failedResult));

  }
  const result = await provider.readResult(ref);
  assert.equal(result.kind, 'outputCandidates');
  const candidate = result.candidates[0];
  assert.equal(candidate?.kind, 'remote');
  const mediaResponse = await fetch(candidate.url, {signal: AbortSignal.timeout(30_000)});
  assert.equal(mediaResponse.ok, true);
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  assert.ok(bytes.byteLength > 0);
  const mediaPath = resolve(`internal/evidence/M4/task-5.10/replicate-i2v-real-${requestId}.mp4`);
  const mediaRelativePath = relative(process.cwd(), mediaPath).replaceAll('\\', '/');
  await writeFile(mediaPath, bytes);
  const evidence = {
    status: 'REPLICATE_I2V_REAL_OUTPUT_VERIFIED',
    provider: 'replicate',
    modelKey: model.modelKey,
    requestId,
    submittedAt: now.toISOString(),
    completedAt: new Date().toISOString(),
    providerStatus: observation.status,
    polls,
    input: {prompt: input.prompt, resolution: input.preset.resolution, numFrames: input.preset.numFrames, framesPerSecond: input.preset.framesPerSecond, aspectRatio: input.aspectRatio, imageUrlHost: image.host, imageUrlHasQuery: Boolean(image.search)},
    output: {path: mediaRelativePath, bytes: bytes.byteLength, sha256: sha256(bytes)},
    requestShape: {createRequests: requests.filter((request) => request.method === 'POST').length, readRequests: requests.filter((request) => request.method === 'GET').length, retryFlags: [...new Set(requests.map((request) => request.retry))]},
    limitations: ['This provider smoke verifies real Replicate I2V execution and retrieval. Application-owned R2 publication, callback, reservation settlement, cost confirmation and independent review remain separate evidence.'],
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({status: evidence.status, requestId, bytes: bytes.byteLength, evidence: outputPath, media: mediaRelativePath}));
}

main().catch((error: unknown) => { console.error(`Replicate I2V probe failed: ${safeError(error)}`); process.exitCode = 1; });

















