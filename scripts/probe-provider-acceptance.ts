import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {extname, isAbsolute, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import type {ReadyInputSnapshot} from '../src/modules/generation/create.ts';
import type {SubmissionContext} from '../src/adapters/providers/port.ts';

const ROWS = ['fal-wan22-t2v', 'fal-wan22-i2v', 'replicate-wan22-t2v', 'replicate-wan22-i2v'] as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,200}$/;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
type Args = Readonly<{runId: string; modelKey: typeof ROWS[number]; phase: 'prepare' | 'submit' | 'inspect' | 'verify'; confirm: boolean; cropConfirmed: boolean; imagePath?: string}>;
export type ProbeState = {runId: string; modelKey: string; ownerId: string; outsiderId: string; stage: string; authorizedMaxPosts: number; observedPostRequests: number; workspaceId?: string; taskId?: string; [key: string]: unknown};

export function parseProbeArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  const flags = new Set(['--confirm-one-paid-request', '--confirm-input-crop']);
  const names = new Set(['--run-id', '--model-key', '--phase', '--input-image-path', ...flags]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    assert.ok(names.has(key) && !values.has(key), 'Unknown or repeated argument.');
    const value = flags.has(key) ? 'true' : argv[++i];
    assert.ok(value && !value.startsWith('--'), 'Missing argument value.');
    values.set(key, value);
  }
  const runId = (values.get('--run-id') ?? '').toLowerCase(), modelKey = values.get('--model-key') ?? '', phase = values.get('--phase') ?? '';
  assert.match(runId, UUID); assert.ok(ROWS.includes(modelKey as Args['modelKey']));
  assert.ok(['prepare', 'submit', 'inspect', 'verify'].includes(phase));
  const confirm = values.has('--confirm-one-paid-request'), cropConfirmed = values.has('--confirm-input-crop'), imagePath = values.get('--input-image-path');
  if (phase === 'submit') assert.ok(confirm, 'Submit requires --confirm-one-paid-request.');
  if (imagePath) assert.ok(isAbsolute(imagePath) && !imagePath.includes('://') && /\.(png|jpe?g)$/i.test(imagePath), 'Input must be an absolute local JPEG/PNG path.');
  if (phase === 'prepare' && modelKey.endsWith('-i2v')) assert.ok(imagePath && cropConfirmed, 'I2V requires --input-image-path and --confirm-input-crop.');
  if (modelKey.endsWith('-t2v')) assert.ok(!imagePath && !cropConfirmed, 'T2V does not accept an image.');
  return {runId, modelKey: modelKey as Args['modelKey'], phase: phase as Args['phase'], confirm, cropConfirmed, imagePath};
}

export function assertRunScope(state: ProbeState, args: Pick<Args, 'runId' | 'modelKey'>): void {
  assert.match(args.runId, UUID); assert.ok(ROWS.includes(args.modelKey));
  assert.equal(state.runId, args.runId); assert.equal(state.modelKey, args.modelKey);
  assert.equal(state.ownerId, `acceptance-owner-${args.runId}`); assert.equal(state.outsiderId, `acceptance-outsider-${args.runId}`);
  assert.equal(state.authorizedMaxPosts, 1); assert.ok([0, 1].includes(state.observedPostRequests));
}

export function assertSubmitAllowed(state: ProbeState, task: {status: string; submissionStartedAt: Date | null}): void {
  assert.equal(state.stage, 'prepared', 'Local submit fence already consumed or preparation incomplete.');
  assert.equal(state.observedPostRequests, 0); assert.equal(task.status, 'queued'); assert.equal(task.submissionStartedAt, null);
}

export async function preflightBeforeFence<T>(preflight: () => Promise<unknown>, fence: () => Promise<T>): Promise<T> {
  await preflight(); return fence();
}

export async function requireSubmissionFence(begin: () => Promise<boolean>): Promise<void> {
  assert.equal(await begin(), true, 'Durable submit fence already started.');
}

/** Count reservation is irreversible even when persistence or transport fails. */
export function onePaidCreate(persistCount: () => Promise<void>) {
  let consumed = false;
  return async <T>(request: () => Promise<T>): Promise<T> => {
    assert.equal(consumed, false, 'A second paid POST is forbidden.'); consumed = true;
    await persistCount(); return request();
  };
}

export function parseOutputMedia(value: unknown): {width: number; height: number; durationMs: number} {
  const parsed = value as {streams?: Array<{width?: unknown; height?: unknown}>; format?: {duration?: unknown}} | null;
  const width = parsed?.streams?.[0]?.width, height = parsed?.streams?.[0]?.height;
  const seconds = typeof parsed?.format?.duration === 'string' ? Number(parsed.format.duration) : NaN;
  assert.ok(typeof width === 'number' && Number.isInteger(width) && width > 0 && width <= 4096);
  assert.ok(typeof height === 'number' && Number.isInteger(height) && height > 0 && height <= 4096);
  assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 3600);
  return {width, height, durationMs: Math.round(seconds * 1000)};
}

export async function probeOutputMedia(bytes: Uint8Array) {
  // MP4 movie metadata may trail large media data; a pipe cannot satisfy ffprobe seeks.
  const dir = await mkdtemp(join(tmpdir(), 'shpitto-acceptance-probe-'));
  try {
    const file = join(dir, 'owned-output.mp4'); await writeFile(file, bytes, {flag: 'wx', mode: 0o600});
    const stdout = await new Promise<string>((done, reject) => {
      execFile('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', file, '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration', '-of', 'json'], {timeout: 15_000, maxBuffer: 65_536, windowsHide: true, encoding: 'utf8'},
      (error, output) => error ? reject(new Error('Owned output media inspection failed.')) : done(output));
    });
    return parseOutputMedia(JSON.parse(stdout));
  } finally {await rm(dir, {recursive: true, force: true});}
}

export function sanitizeReport(state: ProbeState & Record<string, unknown>) {
  const id = (value: unknown) => typeof value === 'string' && ID.test(value) ? value : null;
  const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
  return {runId: UUID.test(state.runId) ? state.runId : null, modelKey: ROWS.includes(state.modelKey as Args['modelKey']) ? state.modelKey : null,
    workspaceId: id(state.workspaceId), taskId: id(state.taskId), attemptId: id(state.attemptId), providerRequestId: id(state.providerRequestId),
    phase: typeof state.phase === 'string' && ['prepare', 'submit', 'inspect', 'verify'].includes(state.phase) ? state.phase : null,
    stage: ['initializing', 'prepared', 'started', 'accepted', 'unknown', 'definitelyRejected', 'verified'].includes(state.stage) ? state.stage : null,
    observedPostRequests: [0, 1].includes(state.observedPostRequests) ? state.observedPostRequests : null,
    inputSha256: digest(state.inputSha256), accountIdSha256: digest(state.accountIdSha256), catalogSnapshotSha256: digest(state.catalogSnapshotSha256),
    normalizedInputImageSha256: digest(state.normalizedInputImageSha256), reservationId: typeof state.reservationId === 'string' && UUID.test(state.reservationId) ? state.reservationId : null,
    quotedCredits: typeof state.quotedCredits === 'string' && /^[1-9][0-9]*$/.test(state.quotedCredits) ? state.quotedCredits : null,
    providerCostStatus: 'UNKNOWN', automaticRetry: false, secretValuesRecorded: false, postCounterSource: 'local pre-transport admission'};
}

/** Explicit entry point; importing pure helpers never loads runtime configuration. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseProbeArgs(argv);
  const [{and, eq}, configApi, isolation, {createDatabase}, tables, {assets}, workspaceTables, {authUser, authSession}, {createServerQuote},
    {getProviderModel}, {completePersonalWorkspaceOnboarding}, {createGenerationTask}, lifecycle, outbox, inputApi, {readWorkerInputImage},
    runtime, {createFalProvider}, {createReplicateProvider}, {createProviderHttpTransport}, assetAuth, {uploadInputAsset}, {inspectInputImageBytes},
    {getPrivateObjectStore}, {semanticHash}] = await Promise.all([
    import('drizzle-orm'), import('../src/config/env.ts'), import('../src/config/provider-worker.ts'), import('../src/db/client.ts'),
    import('../src/db/schema/generation.ts'), import('../src/db/schema/asset.ts'), import('../src/db/schema/workspace.ts'), import('../src/db/schema/auth.ts'),
    import('../src/config/models.ts'), import('../src/config/provider-models.ts'), import('../src/modules/workspaces/onboard.ts'), import('../src/modules/generation/create.ts'),
    import('../src/modules/generation/lifecycle.ts'), import('../src/modules/generation/outbox.ts'), import('../src/modules/generation/provider-input.ts'),
    import('../src/modules/generation/provider-image.ts'), import('../src/adapters/providers/runtime.ts'), import('../src/adapters/providers/fal/index.ts'),
    import('../src/adapters/providers/replicate/index.ts'), import('../src/adapters/providers/http.ts'), import('../src/modules/assets/authorize.ts'),
    import('../src/modules/assets/upload.ts'), import('../src/modules/assets/validate-input.ts'), import('../src/adapters/storage/runtime.ts'), import('../src/contracts/http.ts'),
  ]);
  const config = configApi.getProviderWorkerConfig(), env = configApi.getServerEnv();
  isolation.assertPrivateRailwayWorkerDatabase(env.databaseUrl);
  assert.equal(env.runtimeProfile, 'acceptance'); assert.equal(env.generationDriver, 'provider'); assert.equal(env.storageDriver, 's3');
  assert.equal(config.allowCreate, false, 'Background creates must remain disabled.');
  if (args.phase === 'prepare' || args.phase === 'submit') assert.equal(config.state, 'paused');
  assert.ok(config.modelKeys.includes(args.modelKey));
  const model = getProviderModel(args.modelKey), base = new URL(env.appUrl);
  assert.equal(base.protocol, 'https:'); assert.equal(base.username + base.password + base.search + base.hash, '');
  const expectedAccount = model.provider === 'fal' ? env.falWebhookAccountId : env.replicateWebhookAccountId;
  assert.ok(expectedAccount, 'An explicit expected callback account identity is required.');
  const statePath = resolve(`/tmp/shpitto-provider-acceptance-${args.runId}.json`);
  const database = createDatabase({max: 4, connectionTimeoutMillis: 5_000}), db = database.db, store = getPrivateObjectStore();
  const {generationTasks, submissionAttempts, providerWebhookInbox} = tables;
  const snapshotHash = (value: unknown) => semanticHash('acceptance.snapshot', value);
  let state: ProbeState;
  const save = async () => {
    const temporary = `${statePath}.${randomUUID()}`, file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, statePath);
  };
  const report = () => console.log(JSON.stringify(sanitizeReport({...state, phase: args.phase})));
  try {
    if (args.phase === 'prepare') {
      state = {runId: args.runId, modelKey: args.modelKey, ownerId: `acceptance-owner-${args.runId}`, outsiderId: `acceptance-outsider-${args.runId}`,
        stage: 'initializing', authorizedMaxPosts: 1, observedPostRequests: 0, preparedAt: new Date().toISOString(), accountIdSha256: hash(expectedAccount)};
      const fresh = await open(statePath, 'wx', 0o600);
      try { await fresh.writeFile(JSON.stringify(state)); await fresh.sync(); } finally { await fresh.close(); }
      let bytes: Buffer | undefined, mime = '';
      if (args.imagePath) {
        const meta = await stat(args.imagePath); assert.ok(meta.isFile() && meta.size > 0 && meta.size <= 20 * 1024 * 1024);
        bytes = await readFile(args.imagePath); mime = extname(args.imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
        assert.deepEqual(await inspectInputImageBytes(bytes, mime), {width: 1280, height: 720});
      }
      const now = new Date();
      await db.insert(authUser).values([state.ownerId, state.outsiderId].map(id => ({id, name: 'Seeded provider acceptance identity', email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now})));
      const workspace = await completePersonalWorkspaceOnboarding(db, state.ownerId, `Provider acceptance ${args.runId}`, {profile: 'test', fundDemoCredits: true, idempotencyKey: `acceptance.prepare.${args.runId}`});
      assert.equal(workspace.created, true, 'A pre-existing workspace is forbidden.');
      state = {...state, workspaceId: workspace.workspaceId}; await save();
      const uploaded = bytes ? await uploadInputAsset(db, {actor: {userId: state.ownerId}, workspaceId: workspace.workspaceId, store, bytes, mime}) : undefined;
      const input: ReadyInputSnapshot = {prompt: 'Gentle ocean waves at sunrise, steady wide camera, peaceful movement, no text or people.',
        ...(uploaded ? {assetId: uploaded.assetId, assetWorkspaceId: workspace.workspaceId, assetState: 'ready' as const} : {}),
        options: {aspectRatio: '16:9', ...(uploaded ? {cropSha256: uploaded.sha256, cropConfirmed: true} : {})}};
      const quote = createServerQuote(args.modelKey, '1', {profile: 'acceptance', now});
      const created = await createGenerationTask(db, {actor: {userId: state.ownerId}, workspaceId: workspace.workspaceId, acceptanceWorkspaceId: workspace.workspaceId,
        profile: 'acceptance', mode: uploaded ? 'i2v' : 't2v', input, quote, idempotencyKey: `acceptance.task.${args.runId}`, now,
        authorizeReadyInput: async (tx, actor, workspaceId, snapshot) => {
          assert.ok(uploaded && snapshot.assetId === uploaded.assetId);
          const asset = await assetAuth.authorizeAsset(tx, workspaceId, uploaded.assetId, actor); assert.equal(asset.sha256, uploaded.sha256);
        }});
      state = {...state, stage: 'prepared', taskId: created.value.taskId, reservationId: created.value.reservationId, inputSnapshot: input,
        inputSnapshotSha256: snapshotHash(input), quoteSnapshot: quote, providerSnapshot: model, scope: {workspaceId: workspace.workspaceId, modelKeys: [args.modelKey]},
        quotedCredits: quote.totalCost, catalogSnapshotSha256: snapshotHash({...quote, providerContract: model}), normalizedInputImageSha256: uploaded?.sha256 ?? null,
        cropConsent: uploaded ? {assetId: uploaded.assetId, cropSha256: uploaded.sha256, confirmed: true, confirmedAt: now.toISOString(), width: 1280, height: 720, mime} : null};
      await save(); report(); return;
    }
    state = JSON.parse(await readFile(statePath, 'utf8')) as ProbeState; assertRunScope(state, args);
    assert.equal(state.accountIdSha256, hash(expectedAccount));
    assert.match(String(state.workspaceId), UUID); assert.match(String(state.taskId), UUID);
    const workspaceId = String(state.workspaceId), taskId = String(state.taskId), actor = {userId: state.ownerId};
    if (config.state === 'active') assert.equal(config.workspaceId, workspaceId);
    const workspace = (await db.select({id: workspaceTables.workspaces.id}).from(workspaceTables.workspaces).where(and(eq(workspaceTables.workspaces.id, workspaceId), eq(workspaceTables.workspaces.createdBy, state.ownerId), eq(workspaceTables.workspaces.name, `Provider acceptance ${args.runId}`))).limit(1))[0];
    assert.ok(workspace, 'Only this run-owned fresh workspace may be queried.');
    const readTask = async () => (await db.select().from(generationTasks).where(and(eq(generationTasks.id, taskId), eq(generationTasks.workspaceId, workspaceId), eq(generationTasks.requestedBy, state.ownerId), eq(generationTasks.modelKey, args.modelKey))).limit(1))[0];
    const task = await readTask(); assert.ok(task);
    assert.equal(snapshotHash(task.inputSnapshot), state.inputSnapshotSha256);
    assert.equal(snapshotHash(task.catalogSnapshot), snapshotHash({...state.quoteSnapshot as object, providerContract: state.providerSnapshot}));
    assert.equal(snapshotHash(task.catalogSnapshot), state.catalogSnapshotSha256); assert.equal(task.quotedCredits.toString(), state.quotedCredits);
    assert.equal((task.inputSnapshot as ReadyInputSnapshot).options?.cropSha256 ?? null, state.normalizedInputImageSha256);
    assert.equal(snapshotHash(state.providerSnapshot), snapshotHash(model));
    const scope = {workspaceId, modelKeys: [args.modelKey]}; assert.equal(snapshotHash(state.scope), snapshotHash(scope));
    const allocations = await db.select({amount: workspaceTables.creditAllocations.amount, source: workspaceTables.creditGrants.source})
      .from(workspaceTables.creditAllocations).innerJoin(workspaceTables.creditGrants, and(eq(workspaceTables.creditGrants.id, workspaceTables.creditAllocations.grantId), eq(workspaceTables.creditGrants.workspaceId, workspaceId)))
      .where(and(eq(workspaceTables.creditAllocations.reservationId, String(state.reservationId)), eq(workspaceTables.creditAllocations.workspaceId, workspaceId))).limit(8);
    assert.ok(allocations.length && allocations.every(a => a.source === 'demo' && a.amount > 0n), 'Only demo funds may back this reservation.');
    assert.equal(allocations.reduce((total, a) => total + a.amount, 0n), task.quotedCredits);
    if (args.phase === 'submit') {
      assertSubmitAllowed(state, task);
      const image = await readWorkerInputImage(db, store, workspaceId, inputApi.providerInputFromSnapshot(args.modelKey, task.inputSnapshot as ReadyInputSnapshot));
      const realTransport = createProviderHttpTransport();
      let fenceAttempted = false, fenceStarted = false;
      const once = onePaidCreate(async () => {state = {...state, observedPostRequests: 1}; await save();});
      const transport = {async request(request: Parameters<typeof realTransport.request>[0]) {
        if (request.method !== 'POST') {
          assert.equal(fenceAttempted, false, 'Account reads must finish before the durable fence.'); return realTransport.request(request);
        }
        assert.ok(fenceStarted); const url = new URL(request.url);
        assert.equal(url.origin + url.pathname, model.provider === 'replicate' ? 'https://api.replicate.com/v1/predictions' : `https://queue.fal.run/${model.endpoint}`);
        return once(() => realTransport.request(request));
      }};
      const keys = configApi.getProviderCredentials();
      const common = {mode: 'live' as const, transport, acceptanceScope: scope, webhookAccountId: expectedAccount,
        resolveOwnedImageUrl: image ? async (requested: {assetId: string; cropSha256: string}) => {
          assert.equal(requested.assetId, image.authorized.assetId); assert.equal(requested.cropSha256, image.authorized.cropSha256); return image.url;
        } : undefined};
      const replicateOptions = {...common, token: keys.replicateToken, webhookBaseUrl: keys.replicateWebhookBaseUrl, webhookSecret: env.replicateWebhookSecret};
      const provider = model.provider === 'fal' ? createFalProvider({...common, token: keys.falToken, webhookBaseUrl: keys.falWebhookBaseUrl}) : createReplicateProvider(replicateOptions);
      const lease = await preflightBeforeFence(async () => {
        runtime.createRuntimeProvider(args.modelKey, scope);
        await runtime.preflightConfiguredProviderCallback(model.provider);
        if (model.provider === 'replicate') {
          // Prime this exact adapter transport's account proof before any submit fence.
          const {confirmReplicateAccountBinding} = await import('../src/adapters/providers/replicate/account-binding.ts');
          const binding = await confirmReplicateAccountBinding(replicateOptions); assert.equal(hash(binding.accountId), state.accountIdSha256);
          state = {...state, preflightAccountIdSha256: hash(binding.accountId), preflightExpiresAt: binding.expiresAt};
        }
      }, async () => {
        const lock = await open(`${statePath}.submit`, 'wx', 0o600); try { await lock.sync(); } finally { await lock.close(); }
        state = {...state, stage: 'started'}; await save();
        return outbox.claimOutbox(db, `acceptance-${args.runId}`, new Date(), {eventType: 'generation.dispatch', workspaceId});
      });
      assert.ok(lease, 'No run-owned dispatch lease.');
      const heartbeat = outbox.startOutboxHeartbeat(db, lease);
      let attemptId: string | undefined;
      const command = () => ({actor, workspaceId, taskId, attemptId: attemptId!, internalWorker: true, outboxLease: lease});
      try {
        const payload = lease.payload as {taskId?: string}; assert.equal(payload.taskId, taskId);
        const claimed = await lifecycle.claimDispatch(db, {...command(), provider: model.provider, idempotencyKey: `acceptance.claim.${args.runId}`});
        attemptId = claimed.value.attemptId;
        const attempt = (await db.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, attemptId), eq(submissionAttempts.taskId, taskId), eq(submissionAttempts.workspaceId, workspaceId), eq(submissionAttempts.provider, model.provider))).limit(1))[0];
        const current = await readTask(); assert.ok(attempt && current);
        const context: SubmissionContext = inputApi.restoreWorkerSubmissionContext(current, attempt, image?.authorized);
        state = {...state, attemptId, attemptNonceSha256: hash(attempt.clientReference), inputSha256: context.inputSha256, stage: 'started'}; await save();
        await heartbeat.renew();
        if (model.provider === 'replicate') assert.ok(Date.parse(String(state.preflightExpiresAt)) > Date.now() + 30_000, 'Account proof is too old; no durable submit fence started.');
        fenceAttempted = true;
        await requireSubmissionFence(() => lifecycle.beginProviderSubmission(db, command()));
        fenceStarted = true;
        const result = await provider.submit(context);
        state = {...state, stage: result.kind, submittedAt: new Date().toISOString(), ...(result.kind === 'accepted' ? {providerRequestId: result.requestId} : {})}; await save();
        if (result.kind === 'accepted') await lifecycle.recordProviderSubmission(db, {...command(), providerRequestId: result.requestId, statusUrl: result.statusUrl, resultUrl: result.resultUrl, idempotencyKey: `acceptance.record.${args.runId}`});
        else if (result.kind === 'unknown') await lifecycle.markSubmissionUnknown(db, {...command(), idempotencyKey: `acceptance.unknown.${args.runId}`});
        else await lifecycle.settleGenerationTask(db, {...command(), outcome: 'failed', failureCode: result.code, providerCostEvidence: {state: 'unknown'}, idempotencyKey: `acceptance.rejected.${args.runId}`});
        if (result.kind !== 'accepted') process.exitCode = 1;
        report();
      } catch {
        state = {...state, stage: 'unknown'};
        try { await save(); } finally {
          if (attemptId && fenceAttempted) await lifecycle.markSubmissionUnknown(db, {...command(), idempotencyKey: `acceptance.unknown.${args.runId}`});
        }
        report(); process.exitCode = 1;
      } finally {
        try { await outbox.releaseOutbox(db, lease, new Date(Date.now() + (state.stage === 'unknown' ? 150_000 : 0)), new Date()); }
        finally { await heartbeat.stop(); }
      }
      return;
    }
    const attempt = typeof state.attemptId === 'string' ? (await db.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, state.attemptId), eq(submissionAttempts.taskId, taskId), eq(submissionAttempts.workspaceId, workspaceId), eq(submissionAttempts.provider, model.provider))).limit(1))[0] : undefined;
    if (attempt) {
      assert.equal(hash(attempt.clientReference), state.attemptNonceSha256);
      if (state.providerRequestId) assert.equal(attempt.providerRequestId, state.providerRequestId);
      if (attempt.providerRequestId) state = {...state, providerRequestId: attempt.providerRequestId};
    }
    const reservation = (await db.select().from(workspaceTables.creditReservations).where(and(eq(workspaceTables.creditReservations.id, String(state.reservationId)), eq(workspaceTables.creditReservations.taskId, taskId), eq(workspaceTables.creditReservations.workspaceId, workspaceId))).limit(1))[0];
    const inbox = attempt?.providerRequestId ? await db.select().from(providerWebhookInbox).where(and(eq(providerWebhookInbox.provider, model.provider), eq(providerWebhookInbox.providerRequestId, attempt.providerRequestId), eq(providerWebhookInbox.attemptNonce, attempt.clientReference))).limit(20) : [];
    const outputs = await db.select().from(assets).where(and(eq(assets.taskId, taskId), eq(assets.workspaceId, workspaceId), eq(assets.purpose, 'output'), eq(assets.state, 'ready'))).limit(2);
    const callbacks = inbox.map(entry => {
      const p = entry.payload as Record<string, unknown>;
      return {authenticated: typeof p.authenticatedAt === 'string' && Number.isFinite(Date.parse(p.authenticatedAt)) && p.providerRequestId === attempt?.providerRequestId && p.attemptNonce === attempt?.clientReference,
        accountMatches: typeof p.accountId === 'string' && hash(p.accountId) === state.accountIdSha256, processed: entry.status === 'processed', completed: p.status === 'completed'};
    });
    const output = outputs[0], privateBytes = output ? await store.get(output.objectKey) : undefined;
    let media: ReturnType<typeof parseOutputMedia> | undefined;
    if (output && privateBytes) {
      assert.equal(hash(privateBytes), output.sha256); assert.equal(BigInt(privateBytes.length), output.bytes);
      media = await probeOutputMedia(privateBytes); assert.equal(media.durationMs, output.durationMs);
    }
    const evidence = {profile: 'acceptance', taskRuntime: config.taskRuntime, taskStatus: task.status, attemptState: attempt?.state, reservationStatus: reservation?.status, callbacks,
      contract: {provider: model.provider, mode: model.mode, endpoint: model.endpoint, modelVersion: model.modelVersion, schemaSha256: model.schemaSha256, preset: model.preset},
      normalizedInputImage: state.normalizedInputImageSha256 ? {sha256: state.normalizedInputImageSha256, width: 1280, height: 720, cropConfirmed: true} : null,
      output: output ? {assetId: output.id, sha256: output.sha256, bytes: output.bytes?.toString(), mime: output.mime, durationMs: output.durationMs, width: media?.width, height: media?.height} : null};
    if (args.phase === 'inspect') { console.log(JSON.stringify({...sanitizeReport({...state, phase: args.phase}), ...evidence})); return; }
    assert.equal(task.status, 'succeeded'); assert.equal(attempt?.state, 'succeeded'); assert.equal(reservation?.status, 'consumed');
    assert.equal(state.observedPostRequests, 1); assert.ok(attempt?.providerRequestId); assert.equal(outputs.length, 1);
    assert.ok(callbacks.some(c => c.authenticated && c.accountMatches && c.completed && c.processed));
    assert.ok(output && media); assert.equal(media.width, 1280); assert.equal(media.height, 720);
    await assetAuth.authorizeAsset(db, workspaceId, output.id, actor);
    await assert.rejects(() => assetAuth.authorizeAsset(db, workspaceId, output.id, {userId: state.outsiderId}));
    const now = new Date(), sessions = [state.ownerId, state.outsiderId].map(userId => ({id: randomUUID(), userId, token: randomUUID() + randomUUID(), expiresAt: new Date(now.getTime() + 600_000), createdAt: now, updatedAt: now}));
    try {
      await db.insert(authSession).values(sessions);
      const token = assetAuth.createAssetDownloadToken(env.betterAuthSecret, workspaceId, output.id);
      const url = new URL(`/api/workspaces/${workspaceId}/assets/${output.id}/download`, base); url.searchParams.set('token', token.token);
      const download = (target: URL, session = sessions[0]) => fetch(target, {headers: {authorization: `Bearer ${session.token}`}, redirect: 'manual', signal: AbortSignal.timeout(30_000)});
      const response = await download(url); assert.equal(response.status, 200); assert.equal(hash(new Uint8Array(await response.arrayBuffer())), output.sha256);
      const denied = await download(url, sessions[1]); assert.equal(denied.status, 403); await denied.body?.cancel();
      for (const invalid of [assetAuth.createAssetDownloadToken(env.betterAuthSecret, workspaceId, randomUUID()).token, assetAuth.createAssetDownloadToken(env.betterAuthSecret, workspaceId, output.id, new Date(Date.now() - 120_000)).token]) {
        assert.equal(assetAuth.verifyAssetDownloadToken(env.betterAuthSecret, invalid, workspaceId, output.id), false);
        const bad = new URL(url); bad.searchParams.set('token', invalid); const rejected = await download(bad); assert.equal(rejected.status, 403); await rejected.body?.cancel();
      }
      state = {...state, stage: 'verified'}; await save();
      console.log(JSON.stringify({...sanitizeReport({...state, phase: args.phase}), ...evidence, verification: {ownerHttp: 200, outsiderHttp: 403, wrongTokenHttp: 403, expiredTokenHttp: 403, privateHash: 'PASS', domainReservationConsumed: true, authenticatedAccountCallback: true}, actualProviderCostConfirmed: false}));
    } finally { for (const session of sessions) await db.delete(authSession).where(and(eq(authSession.id, session.id), eq(authSession.userId, session.userId))); }
  } finally { await database.pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {console.error('Provider acceptance probe failed. No secrets or signed URLs are printed. Inspect this run; never retry a started submission.'); process.exitCode = 1;});
}

