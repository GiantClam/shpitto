import assert from 'node:assert/strict';
import {createHash, createHmac, generateKeyPairSync, sign} from 'node:crypto';

import {getProviderModel} from '../src/config/provider-models.ts';
import {verifyReplicateWebhook} from '../src/adapters/providers/replicate/webhook.ts';
import {verifyFalWebhook} from '../src/adapters/providers/fal/webhook.ts';
import {evaluateIntegrationHealth} from '../src/modules/operations/integration-health.ts';
import {redactRecoveryTelemetry} from '../src/modules/operations/telemetry.ts';

const now = new Date('2026-10-04T00:00:00.000Z');
const replicateRef = {provider: 'replicate' as const, modelKey: 'replicate-wan22-t2v', requestId: 'pred_probe', catalog: getProviderModel('replicate-wan22-t2v')};
const falRef = {provider: 'fal' as const, modelKey: 'fal-wan22-t2v', requestId: 'fal_probe', catalog: getProviderModel('fal-wan22-t2v')};

const cases: string[] = [];
const secret = Buffer.from('probe-secret').toString('base64');
const replicateBody = new TextEncoder().encode(JSON.stringify({id: 'pred_probe', status: 'processing', account_id: 'acct', metadata: {attempt_nonce: 'nonce'}}));
const replicateEvent = 'evt-replicate';
const timestamp = Math.floor(now.getTime() / 1000);
const replicateSignature = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${replicateEvent}.${timestamp}.${new TextDecoder().decode(replicateBody)}`).digest('base64');
const replicate = verifyReplicateWebhook(replicateBody, new Headers({'webhook-id': replicateEvent, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${replicateSignature}`}), replicateRef, {secret, expectedAccountId: 'acct', expectedAttemptNonce: 'nonce', now});
assert.equal(replicate.observation.status, 'running');
cases.push('Replicate raw-body HMAC accepts exact signed request and nonce');

const keys = generateKeyPairSync('ed25519');
const falBody = new TextEncoder().encode(JSON.stringify({request_id: 'fal_probe', status: 'IN_PROGRESS', account_id: 'acct', metadata: {attempt_nonce: 'nonce'}}));
const falEvent = 'evt-fal';
const digest = createHash('sha256').update(falBody).digest('hex');
const falSignature = sign(null, Buffer.from(`${falEvent}.${timestamp}.${digest}`), keys.privateKey).toString('base64');
const fal = verifyFalWebhook(falBody, new Headers({'x-fal-webhook-id': falEvent, 'x-fal-webhook-timestamp': String(timestamp), 'x-fal-webhook-signature': falSignature}), falRef, {publicKeyPem: keys.publicKey.export({type: 'spki', format: 'pem'}).toString(), expectedAccountId: 'acct', expectedAttemptNonce: 'nonce', now});
assert.equal(fal.observation.status, 'running');
cases.push('fal ED25519 accepts exact signed digest and account binding');

assert.throws(() => verifyReplicateWebhook(replicateBody, new Headers({'webhook-id': replicateEvent, 'webhook-timestamp': String(timestamp - 301), 'webhook-signature': `v1,${replicateSignature}`}), replicateRef, {secret, now}), /stale/i);
cases.push('stale callback is rejected before durable observation');
const health = evaluateIntegrationHealth({provider: 'replicate', lastSuccessfulAt: new Date('2026-10-03T00:00:00.000Z'), unknownOldestAt: new Date('2026-10-03T23:00:00.000Z'), now});
assert.equal(health.status, 'degraded');
const telemetry = redactRecoveryTelemetry({workspaceId: 'workspace', taskId: 'task', provider: 'replicate', status: 'submission_unknown', unknownAgeSeconds: 1800, signedUrl: 'secret'});
assert.equal('signedUrl' in telemetry, false);
cases.push('unknown age degrades capability and telemetry stays secret-free');

console.log(JSON.stringify({status: 'PASS', profile: 'local deterministic provider fixtures', cases, count: cases.length}, null, 2));
