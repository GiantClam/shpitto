import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {and, eq} from 'drizzle-orm';
import {getProviderWorkerConfig, getProviderCredentials, getServerEnv} from '../src/config/env.ts';
import {assertPrivateRailwayWorkerDatabase} from '../src/config/provider-worker.ts';
import {createDatabase} from '../src/db/client.ts';
import {generationTasks, submissionAttempts, providerWebhookInbox} from '../src/db/schema/generation.ts';
import {creditReservations} from '../src/db/schema/workspace.ts';
import {authUser, authSession} from '../src/db/schema/auth.ts';
import {assets} from '../src/db/schema/asset.ts';
import {createServerQuote} from '../src/config/models.ts';
import {completePersonalWorkspaceOnboarding} from '../src/modules/workspaces/onboard.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {claimDispatch, beginProviderSubmission, recordProviderSubmission, markSubmissionUnknown, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';
import {claimOutbox, releaseOutbox, startOutboxHeartbeat} from '../src/modules/generation/outbox.ts';
import {restoreWorkerSubmissionContext} from '../src/modules/generation/provider-input.ts';
import {createFalProvider} from '../src/adapters/providers/fal/index.ts';
import {createProviderHttpTransport} from '../src/adapters/providers/http.ts';
import {authorizeAsset, createAssetDownloadToken, verifyAssetDownloadToken} from '../src/modules/assets/authorize.ts';
import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';

const MODEL = 'fal-wan22-t2v';
const ENDPOINT = 'fal-ai/wan/v2.2-a14b/text-to-video';
const INPUT = {prompt: 'A calm blue ocean with gentle waves at sunrise, a steady wide camera, no text, no people, a short peaceful scene.', options: {aspectRatio: '16:9'}} as const;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function option(name: string): string { const i = process.argv.indexOf(name); return i < 0 ? '' : process.argv[i + 1] ?? ''; }
export function authorizedFalEstimate(price: {endpoint_id: string; unit_price: number; currency: string; unit: string} | undefined): number {
  assert.ok(price && price.endpoint_id === ENDPOINT && price.currency === 'USD' && price.unit === 'seconds' && Number.isFinite(price.unit_price) && price.unit_price > 0);
  const estimate = price.unit_price * 81 / 16;
  assert.ok(estimate <= 1, 'Current reference estimate exceeds the authorized budget.');
  return estimate;
}


async function main(): Promise<void> {
  const runId = option('--run-id');
  assert.match(runId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const phase = option('--phase');
  assert.ok(['prepare', 'submit', 'inspect', 'verify'].includes(phase));
  const config = getProviderWorkerConfig();
  const env = getServerEnv();
  assertPrivateRailwayWorkerDatabase(env.databaseUrl);
  const keys = getProviderCredentials();
  assert.ok(keys.falToken, 'Fal key is not loaded.');
  assert.equal(config.allowCreate, false, 'The background worker must never be permitted to create during this one-shot run.');
  const base = new URL(env.appUrl);
  const callback = new URL(keys.falWebhookBaseUrl);
  assert.equal(callback.origin, base.origin);
  assert.equal(callback.protocol, 'https:');
  assert.equal(callback.pathname.replace(/\/$/, ''), '/api/webhooks/fal');
  assert.equal(callback.search + callback.hash, '');
  assert.equal(callback.username + callback.password, '');
  const statePath = resolve(`/tmp/shpitto-fal-authorized-${runId}.json`);
  const database = createDatabase({max: 4, connectionTimeoutMillis: 5_000});
  try {
    if (phase === 'prepare') {
      assert.equal(config.state, 'paused');
      try { await readFile(statePath); throw new Error('An existing run cannot be prepared again.'); } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
      const ownerId = `m4-fal-owner-${runId}`;
      const outsiderId = `m4-fal-outsider-${runId}`;
      const now = new Date();
      await database.db.insert(authUser).values([ownerId, outsiderId].map((id) => ({id, name: 'M4 seeded acceptance identity', email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now})));
      const workspace = await completePersonalWorkspaceOnboarding(database.db, ownerId, `M4 Fal live acceptance ${runId.slice(0, 8)}`, {idempotencyKey: `m4-fal.prepare.${runId}`, profile: 'test', fundDemoCredits: true});
      const created = await createGenerationTask(database.db, {actor: {userId: ownerId}, workspaceId: workspace.workspaceId, acceptanceWorkspaceId: workspace.workspaceId, profile: 'acceptance', mode: 't2v', input: INPUT, quote: createServerQuote(MODEL, '1', {profile: 'acceptance', now}), idempotencyKey: `m4-fal.task.${runId}`, now});
      const state = {runId, ownerId, outsiderId, workspaceId: workspace.workspaceId, taskId: created.value.taskId, reservationId: created.value.reservationId, modelKey: MODEL, endpoint: ENDPOINT, authorizedMaxPosts: 1, authorizedBudgetUsd: 1, preset: {resolution: '720p', numFrames: 81, framesPerSecond: 16}, preparedAt: now.toISOString(), inputSha256: hash(JSON.stringify(INPUT)), seededAuthFixture: true, productionMailUsed: false};
      await writeFile(statePath, JSON.stringify(state), {flag: 'wx', mode: 0o600});
      console.log(JSON.stringify({phase, ...state, queuePostRequests: 0}));
      return;
    }
    const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, string | number | object>;
    assert.equal(state.runId, runId);
    assert.equal(state.authorizedMaxPosts, 1);
    assert.equal(state.authorizedBudgetUsd, 1);
    const workspaceId = String(state.workspaceId), taskId = String(state.taskId);
    const task = (await database.db.select().from(generationTasks).where(and(eq(generationTasks.id, taskId), eq(generationTasks.workspaceId, workspaceId), eq(generationTasks.requestedBy, String(state.ownerId)))).limit(1))[0];
    assert.ok(task, 'Only the task created by this run may be inspected.');
    if (phase === 'submit') {
      assert.ok(process.argv.includes('--confirm-one-paid-request'), 'Explicit one-shot authorization flag is required.');
      assert.equal(config.state, 'paused');
      assert.equal(task.status, 'queued', 'A non-queued task cannot issue another create.');
      const response = await fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(ENDPOINT)}`, {headers: {Authorization: `Key ${keys.falToken}`}, redirect: 'manual', signal: AbortSignal.timeout(15_000)});
      assert.equal(response.status, 200);
      const pricing = await response.json() as {prices: Array<{endpoint_id: string; unit_price: number; currency: string; unit: string}>};
      const price = pricing.prices.find((p) => p.endpoint_id === ENDPOINT);
      const estimateUsd = authorizedFalEstimate(price);
      assert.ok(price);
      const lease = await claimOutbox(database.db, `m4-bootstrap-${runId}`, new Date(), {eventType: 'generation.dispatch', workspaceId});
      assert.ok(lease, 'No owned dispatch lease is available.');
      const heartbeat = startOutboxHeartbeat(database.db, lease);
      try {
        const claimed = await claimDispatch(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, idempotencyKey: `m4-fal.claim.${runId}`, provider: 'fal', outboxLease: lease});
        const attempt = (await database.db.select().from(submissionAttempts).where(and(eq(submissionAttempts.id, claimed.value.attemptId), eq(submissionAttempts.workspaceId, workspaceId))).limit(1))[0]!;
        const current = (await database.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1))[0]!;
        const context = restoreWorkerSubmissionContext(current, attempt);
        await heartbeat.renew();
        assert.equal(await beginProviderSubmission(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, attemptId: attempt.id, outboxLease: lease}), true, 'The durable submit fence prevents a second POST.');
        // Dedicated bootstrap: known-ID callback correlation establishes the binding; default worker admission is unchanged.
        let posts = 0;
        const baseTransport = createProviderHttpTransport();
        const transport = {async request(request: Parameters<typeof baseTransport.request>[0]) { if (request.method === 'POST') { posts++; assert.equal(posts, 1); assert.ok(request.url.startsWith(`https://queue.fal.run/${ENDPOINT}?fal_webhook=`)); } return baseTransport.request(request); }};
        const provider = createFalProvider({mode: 'live', token: keys.falToken, transport, acceptanceScope: {workspaceId, modelKeys: [MODEL]}, webhookBaseUrl: keys.falWebhookBaseUrl});
        let result;
        try { result = await provider.submit(context); }
        catch {
          await markSubmissionUnknown(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, attemptId: attempt.id, idempotencyKey: `m4-fal.unknown.${runId}`, internalWorker: true, outboxLease: lease});
          state.submitOutcome = 'unknown'; state.observedPostRequests = posts; state.attemptId = attempt.id; state.attemptNonce = attempt.clientReference;
          await writeFile(statePath, JSON.stringify(state), {mode: 0o600});
          await releaseOutbox(database.db, lease, new Date(Date.now()+150_000), new Date());
          console.log(JSON.stringify({phase,runId,taskId,outcome:'unknown',queuePostRequests:posts,automaticRetry:false}));
          return;
        }
        state.attemptId = attempt.id; state.attemptNonce = attempt.clientReference; state.inputSha256 = context.inputSha256; state.priceReference = price; state.estimateUsd = estimateUsd; state.observedPostRequests = posts; state.submitOutcome = result.kind; state.submittedAt = new Date().toISOString();
        if (result.kind === 'accepted') {
          state.providerRequestId = result.requestId; state.statusUrl = result.statusUrl ?? ''; state.resultUrl = result.resultUrl ?? '';
          await writeFile(statePath, JSON.stringify(state), {mode: 0o600});
          await recordProviderSubmission(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, attemptId: attempt.id, providerRequestId: result.requestId, statusUrl: result.statusUrl, resultUrl: result.resultUrl, idempotencyKey: `m4-fal.record.${runId}`, internalWorker: true, outboxLease: lease});
          state.providerRequestId = result.requestId;
        } else if (result.kind === 'unknown') {
          await markSubmissionUnknown(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, attemptId: attempt.id, idempotencyKey: `m4-fal.unknown.${runId}`, internalWorker: true, outboxLease: lease});
        } else {
          await settleGenerationTask(database.db, {actor: {userId: String(state.ownerId)}, workspaceId, taskId, outcome: 'failed', failureCode: result.code, providerCostEvidence: {state: 'unknown'}, idempotencyKey: `m4-fal.rejected.${runId}`, internalWorker: true, outboxLease: lease});
        }
        await writeFile(statePath, JSON.stringify(state), {mode: 0o600});
        await releaseOutbox(database.db, lease, new Date(), new Date());
        console.log(JSON.stringify({phase, runId, workspaceId, taskId, attemptId: attempt.id, providerRequestId: state.providerRequestId ?? null, outcome: result.kind, queuePostRequests: posts, referenceEstimateUsd: estimateUsd, automaticRetry: false, providerCostStatus: 'UNKNOWN'}));
      } finally { await heartbeat.stop(); }
      return;
    }
    const attempt = (await database.db.select().from(submissionAttempts).where(and(eq(submissionAttempts.taskId, taskId), eq(submissionAttempts.workspaceId, workspaceId))).limit(1))[0];
    const reservation = (await database.db.select().from(creditReservations).where(and(eq(creditReservations.taskId, taskId), eq(creditReservations.workspaceId, workspaceId))).limit(1))[0];
    const inbox = attempt?.providerRequestId ? await database.db.select().from(providerWebhookInbox).where(and(eq(providerWebhookInbox.provider, 'fal'), eq(providerWebhookInbox.providerRequestId, attempt.providerRequestId), eq(providerWebhookInbox.attemptNonce, attempt.clientReference))).limit(8) : [];
    const output = (await database.db.select().from(assets).where(and(eq(assets.taskId, taskId), eq(assets.workspaceId, workspaceId), eq(assets.purpose, 'output'), eq(assets.state, 'ready'))).limit(1))[0];
    const callbacks = inbox.map((entry) => { const p=entry.payload as {accountId?: string; authenticatedAt?: string; status?: string}; return {eventId:entry.externalEventId,status:entry.status,observation:p.status,authenticatedAt:p.authenticatedAt,accountIdSha256:p.accountId?hash(p.accountId):null}; });
    const report = {phase, runId, workspaceId, taskId, taskStatus: task.status, reservationStatus: reservation?.status, quotedCredits: task.quotedCredits.toString(), providerRequestId: attempt?.providerRequestId, providerCostStatus: task.providerCostState ?? 'unknown', callbacks, output: output ? {assetId:output.id,objectKey:output.objectKey,bytes:output.bytes?.toString(),sha256:output.sha256,durationMs:output.durationMs,mime:output.mime} : null, queuePostRequests: state.observedPostRequests ?? (task.status === 'queued' ? 0 : null), secretValuesRecorded:false, seededAuthFixture:true, actualProviderCostStatus:'UNKNOWN', postCounterSource:'local-only'};
    if (phase === 'inspect') { console.log(JSON.stringify(report)); return; }
    assert.equal(task.status, 'succeeded'); assert.equal(reservation?.status,'consumed'); assert.ok(output); assert.ok(callbacks.some((event)=>event.authenticatedAt&&event.accountIdSha256));
    const owner = {userId:String(state.ownerId)}, outsider = {userId:String(state.outsiderId)};
    await authorizeAsset(database.db,workspaceId,output.id,owner);
    await assert.rejects(()=>authorizeAsset(database.db,workspaceId,output.id,outsider));
    const privateBytes = await getPrivateObjectStore().get(output.objectKey); assert.equal(hash(privateBytes),output.sha256);
    const sessionRows=[owner,outsider].map((actor)=>({id:randomUUID(),userId:actor.userId,token:randomUUID()+randomUUID(),expiresAt:new Date(Date.now()+600_000),createdAt:new Date(),updatedAt:new Date()}));
    await database.db.insert(authSession).values(sessionRows);
    try {
      const token=createAssetDownloadToken(env.betterAuthSecret,workspaceId,output.id);
      const url=new URL(`/api/workspaces/${workspaceId}/assets/${output.id}/download`,base);url.searchParams.set('token',token.token);
      const response=await fetch(url,{headers:{authorization:`Bearer ${sessionRows[0].token}`},redirect:'manual',signal:AbortSignal.timeout(30_000)});
      assert.equal(response.status,200);assert.equal(hash(new Uint8Array(await response.arrayBuffer())),output.sha256);
      const denied=await fetch(url,{headers:{authorization:`Bearer ${sessionRows[1].token}`},redirect:'manual',signal:AbortSignal.timeout(15_000)});assert.equal(denied.status,403);
      assert.equal(verifyAssetDownloadToken(env.betterAuthSecret,token.token,workspaceId,randomUUID()),false);
      assert.equal(verifyAssetDownloadToken(env.betterAuthSecret,token.token,workspaceId,output.id,new Date(Date.now()+61_000)),false);
      console.log(JSON.stringify({...report,verification:{authorizedHttpDownload:response.status,outsiderHttpDownload:denied.status,privateObjectHash:'PASS',currentMembership:'PASS',wrongAssetTokenLocal:'REJECTED',expiredTokenLocal:'REJECTED',realProviderCallback:'PASS',domainReservationSettlement:'PASS'},actualProviderCostConfirmed:false,source:'seeded non-production acceptance identities; real provider/worker/R2/HTTP paths'}));
    } finally { for(const session of sessionRows)await database.db.delete(authSession).where(eq(authSession.id,session.id)); }
  } finally { await database.pool.end(); }
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/probe-fal-account-bootstrap.ts')) main().catch(()=>{console.error('Authorized Fal bootstrap failed; no key, session token or signed URL is printed. Never retry a paid submit blindly; inspect the owned persisted attempt first.');process.exitCode=1;});
