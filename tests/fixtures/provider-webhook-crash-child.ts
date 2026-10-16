import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '../../src/db/schema/index.ts';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {confirmReplicateAccountBinding} from '../../src/adapters/providers/replicate/account-binding.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';
import type {ReplicateRequest} from '../../src/adapters/providers/replicate/index.ts';
import {claimOutbox, type OutboxLease} from '../../src/modules/generation/outbox.ts';
import {ingestProviderWebhook, processProviderWebhook, type ProviderWebhookIngestResult} from '../../src/modules/generation/provider-webhooks.ts';

type Scope = {databaseUrl: string; workspaceId: string; eventId: string; now: string};
export type WebhookCrashInput = Scope & (
  | {phase: 'receive'; rawBody: string; headers: [string, string][]; nonce: string; requestId: string; secret: string; modelKey: string}
  | {phase: 'resume'}
);
export type WebhookCrashResult =
  | {phase: 'receive'; pid: number; receipts: ProviderWebhookIngestResult[]}
  | {phase: 'resume'; pid: number; lease: OutboxLease; outcomes: string[]};

// The parent passes only synthetic authentication and its newly created fixture
// database over IPC. This executable never reads env files or calls HTTP/fetch.
async function run(input: WebhookCrashInput): Promise<WebhookCrashResult> {
  const url = new URL(input.databaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && ['55432', '55433'].includes(url.port));
  assert.match(url.pathname, /^\/shpitto_webhook_replay_[a-f0-9]{32}$/);
  assert.equal(url.search + url.hash, '');
  const now = new Date(input.now);
  assert.ok(Number.isFinite(now.getTime()));
  const pool = new Pool({connectionString: url.toString(), max: 10, connectionTimeoutMillis: 5_000, statement_timeout: 15_000});
  const db = drizzle(pool, {schema});
  if (input.phase === 'receive') {
    const reads: string[] = [];
    const binding = await confirmReplicateAccountBinding({token: 'replay-fixture-token', webhookSecret: input.secret, webhookAccountId: 'user:replay-fixture', now,
      transport: {async request(request: ReplicateRequest) {
        assert.equal(request.method, 'GET');
        assert.equal(request.retry, false);
        assert.equal(request.headers.Authorization, 'Bearer replay-fixture-token');
        reads.push(request.url);
        if (request.url === 'https://api.replicate.com/v1/account') return {status: 200, body: {type: 'user', username: 'replay-fixture'}};
        assert.equal(request.url, 'https://api.replicate.com/v1/webhooks/default/secret');
        return {status: 200, body: {key: input.secret}};
      }}});
    assert.deepEqual(reads, ['https://api.replicate.com/v1/account', 'https://api.replicate.com/v1/webhooks/default/secret']);
    const catalog = getProviderModel(input.modelKey);
    const ref = {provider: 'replicate' as const, modelKey: catalog.modelKey, requestId: input.requestId, catalog};
    const rawBody = Buffer.from(input.rawBody, 'base64');
    const body = JSON.parse(rawBody.toString('utf8'));
    assert.equal(Object.hasOwn(body, 'account_id'), false);
    assert.equal(Object.hasOwn(body, 'metadata'), false);
    const receipts = await Promise.all(Array.from({length: 10}, () => {
      const verified = verifyReplicateWebhook(rawBody, new Headers(input.headers), ref, {secret: input.secret, binding, expectedAttemptNonce: input.nonce, now});
      assert.equal(verified.eventId, input.eventId);
      return ingestProviderWebhook(db, {provider: 'replicate', rawBody, verified, now});
    }));
    assert.ok(receipts.every(receipt => receipt.workspaceId === input.workspaceId));
    // Intentionally leave the Pool open: the receiver exits immediately after
    // committed receipts, without running processing or graceful DB cleanup.
    return {phase: 'receive', pid: process.pid, receipts};
  }
  assert.equal(input.phase, 'resume');
  try {
    type Stored = {task_id: string; attempt_id: string; requested_by: string; status: string; payload: {status: 'completed'}};
    const rows = (await pool.query<Stored>(`select i.status,i.payload,a.id as attempt_id,a.task_id,t.requested_by
      from app.provider_webhook_inbox i join app.submission_attempts a on a.provider=i.provider and a.provider_request_id=i.provider_request_id and a.client_reference::text=i.attempt_nonce
      join app.generation_tasks t on t.id=a.task_id and t.workspace_id=a.workspace_id
      where i.provider='replicate' and i.external_event_id=$1 and a.workspace_id=$2`, [input.eventId, input.workspaceId])).rows;
    assert.equal(rows.length, 1);
    const stored = rows[0];
    assert.equal(stored.status, 'received');
    assert.equal(stored.payload.status, 'completed');
    const lease = await claimOutbox(db, `child-restart-${process.pid}`, now, {eventType: 'generation.dispatch', workspaceId: input.workspaceId});
    assert.ok(lease);
    const command = {provider: 'replicate' as const, actorUserId: stored.requested_by, workspaceId: input.workspaceId,
      taskId: stored.task_id, attemptId: stored.attempt_id, outboxLease: lease, now,
      verified: {eventId: input.eventId, observation: {status: stored.payload.status}}};
    await assert.rejects(() => processProviderWebhook(db, {...command, outboxLease: {...lease, token: randomUUID()}}), /lease/i);
    assert.equal((await pool.query('select status from app.provider_webhook_inbox where external_event_id=$1', [input.eventId])).rows[0].status, 'received');
    const outcomes = await Promise.all(Array.from({length: 10}, async () => (await processProviderWebhook(db, command)).status));
    return {phase: 'resume', pid: process.pid, lease, outcomes};
  } finally { await pool.end(); }
}

assert.equal(typeof process.send, 'function', 'This fixture is IPC-only.');
process.once('message', (input: WebhookCrashInput) => {
  void run(input).then(result => {
    process.send!(result, (error: Error | null) => process.exit(error ? 1 : result.phase === 'receive' ? 86 : 0));
  }).catch(error => {
    process.stderr.write(String(error).slice(0, 2_000));
    process.exit(1);
  });
});
