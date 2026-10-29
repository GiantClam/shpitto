import assert from 'node:assert/strict';
import {test} from 'node:test';

import {assertPrivateRailwayWorkerDatabase, parseProviderWorkerConfig, providerWorkerAction} from '../../src/config/provider-worker.ts';
import {signProviderInputUrl} from '../../src/adapters/storage/provider-input-url.ts';
import {getModelCatalog, createServerQuote} from '../../src/config/models.ts';
import {createReplicateProvider} from '../../src/adapters/providers/replicate/index.ts';
import {createFalProvider} from '../../src/adapters/providers/fal/index.ts';
import {validateVideoInput, freezeSubmissionContext} from '../../src/adapters/providers/input.ts';
import {createProviderHttpTransport} from '../../src/adapters/providers/http.ts';

const workspaceId = '39116b77-d7c5-4204-b4d4-e192f007363e';
const configured = {runtimeProfile: 'acceptance', generationDriver: 'provider', storageDriver: 's3', railwayProjectId: 'isolated-project', expectedProjectId: 'isolated-project', workspaceId, state: 'active', allowCreate: 'false', modelKeys: 'replicate-wan22-t2v,fal-wan22-t2v', pollMs: ''} as const;

test('worker is paused by default and cannot scan an unassigned workspace', () => {
  const config = parseProviderWorkerConfig({...configured, state: '', workspaceId: '', allowCreate: ''});
  assert.equal(config.state, 'paused');
  assert.equal(config.allowCreate, false);
  assert.equal(config.workspaceId, null);
  assert.equal(config.pollMs, 5_000);
});

test('active worker requires acceptance profile, exact project and a workspace UUID', () => {
  assert.equal(parseProviderWorkerConfig(configured).taskRuntime, 'self_hosted');
  assert.throws(() => parseProviderWorkerConfig({...configured, taskRuntime: 'trigger'}), /TASK_RUNTIME=self_hosted/);
  assert.throws(() => parseProviderWorkerConfig({...configured, runtimeProfile: 'production'}), /acceptance/);
  assert.throws(() => parseProviderWorkerConfig({...configured, state: 'paused', runtimeProfile: 'production'}), /acceptance/);
  assert.throws(() => parseProviderWorkerConfig({...configured, state: 'paused', expectedProjectId: 'wrong-project'}), /project/);
  assert.throws(() => parseProviderWorkerConfig({...configured, expectedProjectId: 'other-project'}), /project/);
  assert.throws(() => parseProviderWorkerConfig({...configured, expectedProjectId: ''}), /project/);
  assert.throws(() => parseProviderWorkerConfig({...configured, workspaceId: ''}), /workspace/);
  assert.throws(() => parseProviderWorkerConfig({...configured, allowCreate: 'yes'}), /true or false/);
  assert.throws(() => parseProviderWorkerConfig({...configured, modelKeys: 'mock-video'}), /model/);
  assert.throws(() => parseProviderWorkerConfig({...configured, pollMs: '0'}), /poll/);
  assert.equal(parseProviderWorkerConfig({...configured, allowCreate: 'true'}).allowCreate, true);
});

test('started submissions, unknown results, restarts and terminals never choose another create', () => {
  assert.equal(providerWorkerAction('queued', false, false), 'paused');
  assert.equal(providerWorkerAction('queued', false, true), 'submit');
  assert.equal(providerWorkerAction('dispatching', false, true), 'submit');
  assert.equal(providerWorkerAction('dispatching', true, true), 'reconcile');
  assert.equal(providerWorkerAction('submission_unknown', true, true), 'reconcile');
  assert.equal(providerWorkerAction('submitted', true, false), 'poll');
  assert.equal(providerWorkerAction('materializing', true, false), 'materialize');
  for (const state of ['succeeded', 'failed', 'cancelled']) assert.equal(providerWorkerAction(state, true, true), 'terminal');
});

test('provider HTTP transport is bounded, authenticated and performs no automatic retry', async () => {
  let calls = 0;
  const transport = createProviderHttpTransport(async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.replicate.com/v1/predictions');
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer contract-fixture');
    return new Response('{"id":"one"}', {status: 201});
  });
  const result = await transport.request({method: 'POST', url: 'https://api.replicate.com/v1/predictions', headers: {Authorization: 'Bearer contract-fixture'}, body: {version: 'fixture'}, retry: false});
  assert.equal(result.status, 201);
  assert.equal(calls, 1);
  const unavailable = createProviderHttpTransport(async () => { calls++; throw new Error('socket failure'); });
  await assert.rejects(() => unavailable.request({method: 'POST', url: 'https://queue.fal.run/fal-ai/test', headers: {}, body: {}, retry: false}));
  assert.equal(calls, 2);
  await assert.rejects(() => transport.request({method: 'GET', url: 'https://foreign.example/', headers: {}, retry: false}), /origin/);
  const redirected = createProviderHttpTransport(async () => new Response(null, {status: 302, headers: {location: 'https://foreign.example/'}}));
  await assert.rejects(() => redirected.request({method: 'GET', url: 'https://api.replicate.com/v1/predictions/one', headers: {}, retry: false}), /redirect/);
  const oversized = createProviderHttpTransport(async () => new Response('x', {headers: {'content-length': '2000000'}}));
  await assert.rejects(() => oversized.request({method: 'GET', url: 'https://queue.fal.run/fal-ai/test', headers: {}, retry: false}), /bounded/);
});


test('acceptance quotes are single-video fixture credits; production remains disabled', () => {
  assert.equal(getModelCatalog('production').size, 0);
  assert.equal(getModelCatalog('acceptance').size, 4);
  const quote = createServerQuote('replicate-wan22-t2v', '1', {profile: 'acceptance'});
  assert.equal(quote.totalCost, '10');
  assert.throws(() => createServerQuote('replicate-wan22-t2v', '2', {profile: 'acceptance'}), /limit/);
  assert.throws(() => createServerQuote('replicate-wan22-t2v', '1', {profile: 'production'}), /unavailable/);
});

for (const provider of ['replicate', 'fal'] as const) test(`${provider} live admission is bound to workspace, model and inspected contract`, async () => {
  const modelKey = `${provider}-wan22-t2v`;
  const input = validateVideoInput({modelKey, mode: 'text-to-video', prompt: 'Contract fixture', aspectRatio: '16:9'});
  const context = freezeSubmissionContext({workspaceId, taskId: 'fixture-task', attemptId: 'fixture-attempt', attemptNonce: '972d2c08-92f7-4840-b832-428284271913', input, quote: createServerQuote(modelKey, '1', {profile: 'acceptance'}), createdAt: new Date().toISOString()});
  let calls = 0;
  const secret = `whsec_${Buffer.from('worker-admission-fixture-key').toString('base64')}`;
  const options = {mode: 'live' as const, token: 'fixture', webhookSecret: secret, webhookAccountId: 'user:fixture-owner', webhookBaseUrl: 'https://app.example/api/webhooks/replicate', acceptanceScope: {workspaceId, modelKeys: [modelKey]}, transport: {async request(request: {method: string; url: string}) {
    calls++;
    if (request.method === 'GET') return {status: 200, body: request.url.endsWith('/account') ? {type: 'user', username: 'fixture-owner'} : {key: secret}};
    return {status: 401};
  }}};
  const adapter = provider === 'replicate' ? createReplicateProvider(options) : createFalProvider(options);
  await assert.rejects(() => adapter.submit({...context, workspaceId: 'other-workspace'}), /disabled/);
  await assert.rejects(() => adapter.submit({...context, catalog: {...context.catalog, schemaSha256: 'a'.repeat(64)}}), /drift/);
  assert.equal(calls, 0);
  assert.equal((await adapter.submit(context)).kind, 'definitelyRejected');
  assert.equal(calls, provider === 'replicate' ? 3 : 1);
});

test('provider input capability binds private key scope, method, host and one-hour expiry', () => {
  const objectKey = `workspaces/${workspaceId}/inputs/input.jpg`;
  const input = {endpoint: 'https://r2.example.test', region: 'auto', bucket: 'isolated-fixture', accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret', forcePathStyle: true, workspaceId, objectKey, expiresSeconds: 3600, now: new Date('2026-10-13T00:00:00.000Z')};
  const url = new URL(signProviderInputUrl(input));
  assert.equal(url.pathname, `/isolated-fixture/${objectKey}`);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(url.searchParams.get('X-Amz-Date'), '20261013T000000Z');
  assert.match(url.searchParams.get('X-Amz-Signature')!, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(url.toString(), /fixture-secret/);
  assert.notEqual(signProviderInputUrl(input), signProviderInputUrl({...input, objectKey: `workspaces/${workspaceId}/inputs/other.jpg`}));
  assert.throws(() => signProviderInputUrl({...input, objectKey: 'workspaces/other/inputs/input.jpg'}), /owned/);
  assert.throws(() => signProviderInputUrl({...input, expiresSeconds: 3601}), /expiry/);
  assert.throws(() => signProviderInputUrl({...input, endpoint: 'http://r2.example.test'}), /HTTPS/);
});


test('migration isolation rejects connection-target query overrides and environment fallbacks', () => {
  const url = 'postgresql://fixture:fixture@postgres.railway.internal:5432/fixture';
  assert.doesNotThrow(() => assertPrivateRailwayWorkerDatabase(url));
  assert.throws(() => assertPrivateRailwayWorkerDatabase('postgresql://fixture:fixture@%2Ftmp%2Fnot-railway.railway.internal:5432/fixture'), /private/);
  assert.throws(() => assertPrivateRailwayWorkerDatabase('postgresql://fixture:fixture@postgres%2erailway.internal:5432/fixture'), /private/);
  for (const query of ['?host=production.example.test&port=6543', '?database=other', '?user=other', '?sslmode=require', '#host=other']) assert.throws(() => assertPrivateRailwayWorkerDatabase(url + query), /query overrides/);
  assert.throws(() => assertPrivateRailwayWorkerDatabase('postgresql://fixture:fixture@postgres.railway.internal/fixture'), /explicit/);
  assert.throws(() => assertPrivateRailwayWorkerDatabase('postgresql://fixture:fixture@production.example.test:5432/fixture'), /private/);
});
