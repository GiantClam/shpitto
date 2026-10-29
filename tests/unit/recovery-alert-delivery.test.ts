import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateRecoveryAlert, authorizeRecoveryAlert, authorizeRecoveryAlertHeaders, readRecoveryAlertBody, deliverRecoveryAlert, RECOVERY_ACTION} from '../../src/modules/operations/recovery-alert-delivery.ts';
import {success} from '../../src/contracts/http.ts';

const workspaceId = 'fc130d11-5a78-4cf7-a257-e07ca6187716';
const incidentId = 'fc130d11-5a78-4cf7-a257-e07ca6187717';
const payload = {incidentId, workspaceId, workerKey: 'provider-sweep', code: 'sweep_heartbeat_missing', expectedAt: '2026-10-15T13:00:00.000Z', observedAt: '2026-10-15T14:00:00.000Z', lastSweepAt: '2026-10-15T13:56:59.000Z', ageSeconds: 181, action: RECOVERY_ACTION} as const;
const config = {projectId: 'isolated', expectedProjectId: 'isolated', profile: 'acceptance', workspaceId, workerKey: 'provider-sweep', secret: 'a'.repeat(64), appUrl: 'https://demo.example.test', alertUrl: 'https://demo.example.test/api/internal/recovery-alerts'};

test('recovery alert accepts only redacted correlated evidence and exact dedicated scope', () => {
  assert.deepEqual(validateRecoveryAlert(payload), payload);
  authorizeRecoveryAlert(payload, `Bearer ${config.secret}`, config);
  for (const changed of [{workspaceId: '00000000-0000-4000-8000-000000000000'}, {workerKey: 'other'}, {profile: 'production'}, {projectId: 'other'}, {secret: ''}]) {
    assert.throws(() => authorizeRecoveryAlert(payload, `Bearer ${config.secret}`, {...config, ...changed}));
  }
  assert.throws(() => authorizeRecoveryAlert(payload, 'Bearer wrong', config));
  assert.throws(() => validateRecoveryAlert({...payload, token: 'never accept'}));
  assert.throws(() => validateRecoveryAlert({...payload, action: 'arbitrary instruction'}));
  assert.throws(() => validateRecoveryAlert({...payload, ageSeconds: 179}));
  assert.throws(() => validateRecoveryAlert({...payload, observedAt: 'invalid'}));
  assert.throws(() => validateRecoveryAlert({...payload, lastSweepAt: '2026-10-15T14:01:00Z'}));
});

test('header authentication precedes streaming and authenticated stalled bodies have a deadline', async () => {
  assert.throws(()=>authorizeRecoveryAlertHeaders('',config));
  assert.throws(()=>authorizeRecoveryAlertHeaders(`Bearer ${config.secret}`,{...config,secret:''}));
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));}}));
  await assert.rejects(()=>readRecoveryAlertBody(response,10),/timed out/);
  await assert.rejects(()=>readRecoveryAlertBody(new Response('x'.repeat(4097))),/too large/);
  await assert.rejects(()=>readRecoveryAlertBody(new Response(''),0),/invalid/);
});

test('external delivery requires configured HTTPS origin and matching durable receipt', async () => {
  let posts = 0;
  const send: typeof fetch = async (url, options) => {
    posts++;
    assert.equal(String(url), config.alertUrl);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('idempotency-key'), incidentId);
    return Response.json(success({incidentId, received: true, duplicate: false}));
  };
  await deliverRecoveryAlert(payload, config, send);
  assert.equal(posts, 1);
  for (const alertUrl of ['http://demo.example.test/api/internal/recovery-alerts', 'https://other.example.test/api/internal/recovery-alerts', `${config.alertUrl}?token=bad`]) {
    await assert.rejects(() => deliverRecoveryAlert(payload, {...config, alertUrl}, send));
  }
  await deliverRecoveryAlert(payload, config, async () => Response.json(success({incidentId, received:true, duplicate:true})));
  await assert.rejects(() => deliverRecoveryAlert(payload, config, async () => Response.json(success({incidentId:'wrong',received:true}))));
  await assert.rejects(() => deliverRecoveryAlert(payload, config, async () => new Response('', {status:503})));
  await assert.rejects(() => deliverRecoveryAlert(payload, config, async () => {throw new Error('private transport detail');}), /Recovery alert delivery failed/);
});

test('contradictory outage ages and future baselines are not accepted as durable evidence', () => {
  for(const change of [{lastSweepAt: payload.observedAt}, {expectedAt:'2026-10-15T14:01:00.000Z'}, {ageSeconds:1000}, {ageSeconds:180}]) {
    assert.throws(()=>validateRecoveryAlert({...payload,...change}));
  }
  assert.doesNotThrow(()=>validateRecoveryAlert({...payload,lastSweepAt:null,expectedAt:payload.lastSweepAt}));
});
