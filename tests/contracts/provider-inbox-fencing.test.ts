import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {getTableColumns, getTableName, type SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';

import type {AppDatabase} from '../../src/db/client.ts';
import {DomainError} from '../../src/db/contracts.ts';
import {generationTasks, providerWebhookInbox, submissionAttempts} from '../../src/db/schema/generation.ts';
import {creditAccounts} from '../../src/db/schema/workspace.ts';
import {outboxEvents} from '../../src/db/schema/credit.ts';
import type {OutboxLease} from '../../src/modules/generation/outbox.ts';
import {getProviderModel} from '../../src/config/provider-models.ts';

// Keep domain spies test-only: intercept this module's lifecycle import, then remove the hook.
// No application injection seam, database connection, or extra runner flag is needed.
const moduleUrl = new URL('../../src/modules/generation/provider-webhooks.ts', import.meta.url).href;
const lifecycleStub = 'data:text/javascript,' + encodeURIComponent(`
  export * from ${JSON.stringify(new URL('../../src/modules/generation/lifecycle.ts', import.meta.url).href)};
  export const markGenerationMaterializing = (db, input) => db.testDomain('materialize', input);
  export const settleGenerationTask = (db, input) => db.testDomain('settle', input);
`);
const hooks = registerHooks({resolve(specifier, context, next) {
  return context.parentURL === moduleUrl && specifier === './lifecycle.ts'
    ? {url: lifecycleStub, shortCircuit: true} : next(specifier, context);
}});
const webhooks = await import(moduleUrl).finally(() => hooks.deregister());

const now = new Date('2026-10-13T00:00:00.000Z');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const foreignWorkspaceId = '99999999-9999-4999-8999-999999999999';
const uuid = (prefix: string, index = 1) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${String(index).padStart(12, '0')}`;

function record(index = 1, scope = workspaceId, taskStatus = 'submitted', observation = 'completed', inboxStatus = 'received') {
  const task = {id: uuid('2', index), workspaceId: scope, requestedBy: `creator-${index}`, status: taskStatus};
  const attempt = {id: uuid('3', index), taskId: task.id, workspaceId: scope, provider: 'fal', providerRequestId: `request_${index}`, clientReference: uuid('4', index)};
  const inbox = {id: uuid('5', index), provider: 'fal', externalEventId: `event_${index}`, providerRequestId: attempt.providerRequestId, attemptNonce: attempt.clientReference,
    status: inboxStatus, payloadHash: 'd'.repeat(64), receivedAt: new Date(now.getTime() + index), processedAt: null as Date | null,
    payload: {status: observation, providerRequestId: attempt.providerRequestId, attemptNonce: attempt.clientReference, authenticatedAt: now.toISOString()} as Record<string, unknown>};
  return {task, attempt, inbox};
}
type RecordFixture = ReturnType<typeof record>;
const tables = [generationTasks, submissionAttempts, providerWebhookInbox, creditAccounts, outboxEvents];
const columns = Object.fromEntries(tables.map((table) => [getTableName(table), Object.fromEntries(Object.entries(getTableColumns(table)).map(([property, column]) => [column.name, property]))]));
const dialect = new PgDialect();

function fixture(records: RecordFixture[] = [record()]) {
  let state = {records: structuredClone(records), domainEffects: 0, financialEffects: 0, quarantines: 0, inboxUpdates: 0};
  let depth = 0;
  const locks: string[] = [];
  const queries: Array<{sql: string; params: unknown[]; limit?: number}> = [];
  const calls: Array<{kind: string; input: Record<string, unknown>; depth: number; transaction: boolean}> = [];
  const flags = {leaseLive: true, failInboxUpdate: false, missInboxUpdate: false, failDomain: false, domainError: null as Error | null, loseLeaseDuringMark: false, activateBeforeTransaction: false, actualLeaseWorkspace: workspaceId};
  const lease: OutboxLease = {id: uuid('6'), eventType: 'generation.dispatch', payload: {workspaceId, taskId: records[0].task.id}, owner: 'worker', token: uuid('7'), generation: 1n, attempts: 1};
  const leaseRow = () => ({id: lease.id, workspaceId: flags.actualLeaseWorkspace, eventType: lease.eventType, payload: lease.payload, status: 'pending', leaseOwner: lease.owner, leaseToken: lease.token, leaseGeneration: lease.generation, leaseUntil: new Date(now.getTime() + 60_000)});
  type Bag = Record<string, Record<string, unknown>>;
  const matches = (condition: SQL | undefined, bag: Bag): boolean => {
    if (!condition) return true;
    const {sql, params} = dialect.sqlToQuery(condition);
    for (const match of sql.matchAll(/"([a-z_]+)"\."([a-z_]+)"\s*(=|>)\s*\$(\d+)/g)) {
      const actual = bag[match[1]]?.[columns[match[1]]?.[match[2]]];
      const expected = params[Number(match[4]) - 1];
      const encoded = actual instanceof Date ? actual.toISOString() : typeof actual === 'bigint' ? actual.toString() : actual;
      const expectedEncoded = expected instanceof Date ? expected.toISOString() : typeof expected === 'bigint' ? expected.toString() : expected;
      if (match[3] === '=' ? encoded !== expectedEncoded : !(actual instanceof Date && actual.getTime() > new Date(String(expected)).getTime())) return false;
    }
    for (const match of sql.matchAll(/"([a-z_]+)"\."([a-z_]+)"\s+in\s*\(([^)]+)\)/gi)) {
      const allowed = [...match[3].matchAll(/\$(\d+)/g)].map((parameter) => params[Number(parameter[1]) - 1]);
      if (!allowed.includes(bag[match[1]]?.[columns[match[1]]?.[match[2]]])) return false;
    }
    return true;
  };
  const database = (transaction: boolean) => ({
    async transaction<T>(work: (tx: AppDatabase) => Promise<T>): Promise<T> {
      if (flags.activateBeforeTransaction) { state.records[0].task.status = 'submitted'; flags.activateBeforeTransaction = false; }
      const before = structuredClone(state);
      const beforeLease = flags.leaseLive;
      depth++;
      try { return await work(database(true) as unknown as AppDatabase); }
      catch (error) { state = before; if (!flags.loseLeaseDuringMark) flags.leaseLive = beforeLease; throw error; }
      finally { depth--; }
    },
    select(selection?: Record<string, unknown>) {
      let table: typeof tables[number]; let condition: SQL | undefined; let joined = false; let bound: number | undefined;
      const rows = () => {
        const query = condition ? dialect.sqlToQuery(condition) : {sql: '', params: []};
        queries.push({...query, limit: bound});
        const candidates = table === outboxEvents ? (flags.leaseLive ? [leaseRow()] : []) : state.records.map((item) => table === creditAccounts ? {workspaceId: item.task.workspaceId} : table === generationTasks ? item.task : table === submissionAttempts ? item.attempt : item.inbox);
        const found = joined ? state.records.filter(({task, attempt, inbox}) => task.id === attempt.taskId && task.workspaceId === attempt.workspaceId && inbox.provider === attempt.provider && inbox.providerRequestId === attempt.providerRequestId && inbox.attemptNonce === attempt.clientReference)
          .filter((item) => matches(condition, {generation_tasks: item.task, submission_attempts: item.attempt, provider_webhook_inbox: item.inbox}))
          .map((item) => ({...structuredClone(item), requestedBy: item.task.requestedBy, actorUserId: item.task.requestedBy, workspaceId: item.task.workspaceId, taskId: item.task.id, attemptId: item.attempt.id}))
          : candidates.filter((candidate) => matches(condition, {[getTableName(table)]: candidate})).map((candidate) => structuredClone(candidate));
        return bound === undefined ? found : found.slice(0, bound);
      };
      const chain = {
        from(value: typeof tables[number]) { table = value; return chain; },
        innerJoin() { joined = true; return chain; },
        where(value: SQL) { condition = value; return chain; },
        for() { locks.push(getTableName(table)); return chain; },
        orderBy() { return chain; },
        limit(value: number) { bound = value; return chain; },
        then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve().then(rows).then(resolve, reject); },
      };
      void selection;
      return chain;
    },
    update(table: typeof providerWebhookInbox) {
      assert.equal(table, providerWebhookInbox);
      let patch: Record<string, unknown>; let condition: SQL;
      const apply = () => {
        if (flags.failInboxUpdate) throw new Error('inbox update failed');
        if (flags.missInboxUpdate) return [];
        if (flags.loseLeaseDuringMark) flags.leaseLive = false;
        const changed = state.records.filter((item) => matches(condition, {provider_webhook_inbox: item.inbox}));
        for (const item of changed) Object.assign(item.inbox, patch);
        state.inboxUpdates += changed.length;
        return changed.map((item) => ({id: item.inbox.id}));
      };
      const chain = {set(value: Record<string, unknown>) { patch = value; return chain; }, where(value: SQL) { condition = value; return chain; }, returning() { return chain; }, then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve().then(apply).then(resolve, reject); }};
      return chain;
    },
    async testDomain(kind: string, input: Record<string, unknown>) {
      calls.push({kind, input, depth, transaction});
      if (flags.domainError) throw flags.domainError;
      if (flags.failDomain) throw new DomainError('CONFLICT', 'domain transition lost its lease');
      if (input.outboxLease && !flags.leaseLive) throw new DomainError('CONFLICT', 'worker lease expired');
      const item = state.records.find((value) => value.task.id === input.taskId && value.task.workspaceId === input.workspaceId);
      assert.ok(item);
      state.domainEffects++;
      if (kind === 'materialize') { item.task.status = 'materializing'; return {value: {status: 'materializing'}, replayed: false}; }
      if (['succeeded', 'failed', 'cancelled'].includes(item.task.status)) { state.quarantines++; return {value: {status: 'quarantined'}, replayed: false}; }
      state.financialEffects++; item.task.status = String(input.outcome);
      if (input.outboxLease) flags.leaseLive = false;
      return {value: {status: input.outcome}, replayed: false};
    },
  });
  const input = {provider: 'fal' as const, verified: {eventId: records[0].inbox.externalEventId, observation: {status: records[0].inbox.payload.status as 'completed' | 'failed' | 'queued' | 'running'}}, actorUserId: records[0].task.requestedBy, workspaceId: records[0].task.workspaceId, taskId: records[0].task.id, attemptId: records[0].attempt.id, now};
  return {db: database(false) as unknown as AppDatabase, input, lease, flags, calls, locks, queries, get state() { return state; }};
}

test('inbox domain transition and acknowledgement share an outer transaction and preserve lease-free admin recovery', async () => {
  const f = fixture();
  assert.deepEqual(await webhooks.processProviderWebhook(f.db, f.input), {status: 'processed'});
  assert.equal(f.state.records[0].task.status, 'materializing');
  assert.equal(f.state.records[0].inbox.status, 'processed');
  assert.equal(f.calls[0].depth, 1);
  assert.equal(f.calls[0].transaction, true);
  assert.equal(f.calls[0].input.outboxLease, undefined);
});

test('an inbox marking failure rolls back the domain transition instead of partially committing it', async () => {
  const f = fixture(); f.flags.failInboxUpdate = true;
  await assert.rejects(webhooks.processProviderWebhook(f.db, f.input), /inbox update failed/);
  assert.equal(f.state.records[0].task.status, 'submitted');
  assert.equal(f.state.domainEffects, 0);
  assert.equal(f.state.records[0].inbox.status, 'received');
});

test('received completion does not swallow domain fencing conflicts or consume the inbox', async () => {
  const f = fixture(); f.flags.failDomain = true;
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease}), /lost its lease/);
  assert.equal(f.state.records[0].inbox.status, 'received');
  assert.equal(f.state.domainEffects, 0);
});

test('worker inbox passes its lease to domain commands and locks account/task before lease', async () => {
  for (const status of ['completed', 'failed']) {
    const f = fixture([record(1, workspaceId, 'submitted', status)]);
    await webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease});
    assert.equal(f.calls[0].input.outboxLease, f.lease);
    assert.ok(f.locks.indexOf('credit_accounts') >= 0);
    assert.ok(f.locks.indexOf('generation_tasks') > f.locks.indexOf('credit_accounts'));
    assert.ok(f.locks.indexOf('outbox_events') > f.locks.indexOf('generation_tasks'));
  }
});

test('expired leases cannot mark received progress events processed, even when no domain transition is needed', async () => {
  const f = fixture([record(1, workspaceId, 'submitted', 'running')]); f.flags.leaseLive = false;
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease}), /lease/);
  assert.equal(f.state.inboxUpdates, 0);
  assert.equal(f.state.records[0].inbox.status, 'received');
});

test('terminal completion quarantines through succeeded settlement without reopening or charging', async () => {
  for (const terminal of ['succeeded', 'failed', 'cancelled']) {
    const f = fixture([record(1, workspaceId, terminal)]);
    assert.deepEqual(await webhooks.processProviderWebhook(f.db, f.input), {status: 'quarantined'});
    assert.equal(f.calls[0].kind, 'settle');
    assert.equal(f.calls[0].input.outcome, 'succeeded');
    assert.equal(f.state.financialEffects, 0);
    assert.equal(f.state.quarantines, 1);
    assert.equal(f.state.records[0].task.status, terminal);
    assert.equal(f.state.records[0].inbox.status, 'processed');
    assert.deepEqual(await webhooks.processProviderWebhook(f.db, f.input), {status: 'replayed'});
    assert.equal(f.state.quarantines, 1);
  }
});

test('a failed-event inbox marking error rolls back settlement and financial effects', async () => {
  const f = fixture([record(1, workspaceId, 'submitted', 'failed')]); f.flags.failInboxUpdate = true;
  await assert.rejects(webhooks.processProviderWebhook(f.db, f.input), /inbox update failed/);
  assert.equal(f.state.financialEffects, 0);
  assert.equal(f.state.records[0].task.status, 'submitted');
  assert.equal(f.state.records[0].inbox.status, 'received');
});

test('exact binding is required for workspace, task, attempt, provider, request and nonce before any domain effect', async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => ({...f.input, workspaceId: foreignWorkspaceId}),
    (f: ReturnType<typeof fixture>) => ({...f.input, taskId: f.state.records[1].task.id, attemptId: f.state.records[1].attempt.id}),
    (f: ReturnType<typeof fixture>) => ({...f.input, attemptId: f.state.records[1].attempt.id}),
    (f: ReturnType<typeof fixture>) => ({...f.input, provider: 'replicate' as const}),
  ];
  for (const input of cases) {
    const f = fixture([record(), record(2)]);
    await assert.rejects(webhooks.processProviderWebhook(f.db, input(f)), /workspace|linked|binding|found/i);
    assert.equal(f.state.domainEffects, 0);
    assert.equal(f.state.inboxUpdates, 0);
  }
  for (const field of ['providerRequestId', 'attemptNonce'] as const) {
    const row = record(); row.inbox[field] = 'other-identity';
    const f = fixture([row]);
    await assert.rejects(webhooks.processProviderWebhook(f.db, f.input), /linked|binding|found/i);
    assert.equal(f.state.domainEffects, 0);
  }
});

test('stored authenticated identity and status cannot be replaced by caller-supplied observations', async () => {
  const payloads = [
    {authenticatedAt: undefined}, {authenticatedAt: 'not-a-date'}, {authenticatedAt: 42},
    {providerRequestId: 'other-request'}, {attemptNonce: 'other-nonce'}, {status: 'unexpected'},
  ];
  for (const patch of payloads) {
    const row = record(); row.inbox.payload = {...row.inbox.payload, ...patch};
    const f = fixture([row]);
    await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, verified: {eventId: row.inbox.externalEventId, observation: {status: 'completed'}}}), /stored|authenticated|evidence|binding/i);
    assert.equal(f.state.domainEffects, 0);
    assert.equal(f.state.inboxUpdates, 0);
  }
  const f = fixture();
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, verified: {eventId: f.input.verified.eventId, observation: {status: 'failed'}}}), /stored|observation|evidence|binding/i);
  assert.equal(f.state.financialEffects, 0);
});

test('processed inbox replays still validate their exact workspace and attempt binding', async () => {
  const f = fixture([record(1, workspaceId, 'succeeded', 'completed', 'processed'), record(2)]);
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, taskId: f.state.records[1].task.id, attemptId: f.state.records[1].attempt.id}), /linked|binding|found/i);
  assert.equal(f.state.domainEffects, 0);
});

test('worker leases must be bound to this dispatch task and authoritative workspace, not just a valid token', async () => {
  const f = fixture(); f.flags.actualLeaseWorkspace = foreignWorkspaceId;
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease}), /lease|scope|binding/i);
  assert.equal(f.state.domainEffects, 0);
  const other = fixture();
  const lease = {...other.lease, payload: {workspaceId, taskId: uuid('2', 2)}};
  await assert.rejects(webhooks.processProviderWebhook(other.db, {...other.input, outboxLease: lease}), /lease|scope|binding/i);
  assert.equal(other.state.domainEffects, 0);
});

test('materializing completion is a fenced acknowledgement, not a swallowed error or second materialization', async () => {
  const f = fixture([record(1, workspaceId, 'materializing')]);
  assert.deepEqual(await webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease}), {status: 'processed'});
  assert.equal(f.state.domainEffects, 0);
  assert.equal(f.state.records[0].inbox.status, 'processed');
});

test('lease loss while acknowledging nonterminal completion rolls back the acknowledgement and domain transition', async () => {
  const f = fixture(); f.flags.loseLeaseDuringMark = true;
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, outboxLease: f.lease}), /lease/);
  assert.equal(f.state.domainEffects, 0);
  assert.equal(f.state.records[0].task.status, 'submitted');
  assert.equal(f.state.records[0].inbox.status, 'received');
});

test('terminal-only inbox drain is workspace-scoped, bounded and independent of dispatch leases', async () => {
  const f = fixture([
    record(1, workspaceId, 'failed'), record(2, workspaceId, 'succeeded', 'failed'),
    record(3, foreignWorkspaceId, 'failed'), record(4, workspaceId, 'submitted'),
    record(5, workspaceId, 'cancelled', 'running'), record(6, workspaceId, 'failed', 'completed', 'processed'),
  ]);
  const result = await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, limit: 2, now});
  assert.deepEqual(result, {scanned: 2, processed: 2, quarantined: 2, replayed: 0, failed: 0});
  assert.equal(f.state.financialEffects, 0);
  assert.ok(f.calls.every((call) => call.input.workspaceId === workspaceId && call.input.outboxLease === undefined));
  assert.equal(f.state.records[2].inbox.status, 'received');
  assert.equal(f.state.records[3].inbox.status, 'received');
  const scan = f.queries[0];
  assert.equal(scan.limit, 2);
  assert.ok(scan.params.includes(workspaceId));
  assert.match(scan.sql, /generation_tasks.*status.*in/i);
  assert.match(scan.sql, /workspace_id/);
});

test('terminal drain selects only exact provider/request/nonce attempt joins and leaves malformed evidence received', async () => {
  const mismatch = record(1, workspaceId, 'failed'); mismatch.inbox.attemptNonce = 'other-nonce';
  const malformed = record(2, workspaceId, 'failed'); malformed.inbox.payload.authenticatedAt = null;
  const f = fixture([mismatch, malformed, record(3, workspaceId, 'cancelled')]);
  const result = await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now});
  assert.deepEqual(result, {scanned: 2, processed: 1, quarantined: 1, replayed: 0, failed: 1});
  assert.equal(f.state.records[0].inbox.status, 'received');
  assert.equal(f.state.records[1].inbox.status, 'received');
  assert.equal(f.state.records[2].inbox.status, 'processed');
});

test('terminal drain rejects missing scope and unbounded limits before reading any rows', async () => {
  for (const limit of [0, 101, 1.5, NaN, Infinity]) {
    const f = fixture();
    await assert.rejects(webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, limit, now}), /bounded|limit/i);
    assert.equal(f.queries.length, 0);
  }
  for (const scope of ['', '   ']) {
    const f = fixture();
    await assert.rejects(webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId: scope, now}), /workspace|scope/i);
    assert.equal(f.queries.length, 0);
  }
});

test('terminal drain defaults to a twenty-row maximum and reruns have no financial or quarantine duplicates', async () => {
  const f = fixture(Array.from({length: 25}, (_, index) => record(index + 1, workspaceId, 'failed')));
  assert.equal((await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now})).scanned, 20);
  assert.equal((await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now})).scanned, 5);
  assert.equal((await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now})).scanned, 0);
  assert.equal(f.state.financialEffects, 0);
  assert.equal(f.state.quarantines, 25);
});

test('admin recovery can retry failed inbox rows without a worker lease', async () => {
  const f = fixture([record(1, workspaceId, 'submitted', 'failed', 'failed')]);
  assert.deepEqual(await webhooks.processProviderWebhook(f.db, f.input), {status: 'processed'});
  assert.equal(f.state.records[0].inbox.status, 'processed');
  assert.equal(f.state.financialEffects, 1);
});

test('a lost inbox identity/state update rolls back its otherwise successful domain transition', async () => {
  const f = fixture(); f.flags.missInboxUpdate = true;
  await assert.rejects(webhooks.processProviderWebhook(f.db, f.input), /acknowledgement lost/);
  assert.equal(f.state.records[0].task.status, 'submitted');
  assert.equal(f.state.records[0].inbox.status, 'received');
  assert.equal(f.state.domainEffects, 0);
});

test('terminal drain rechecks task terminality inside its transaction instead of trusting the earlier scan', async () => {
  const f = fixture([record(1, workspaceId, 'failed')]); f.flags.activateBeforeTransaction = true;
  assert.deepEqual(await webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now}), {scanned: 1, processed: 0, quarantined: 0, replayed: 0, failed: 1});
  assert.equal(f.state.records[0].task.status, 'submitted');
  assert.equal(f.state.records[0].inbox.status, 'received');
  assert.equal(f.state.domainEffects, 0);
});

test('terminal drain propagates infrastructure failures and rolls back the failing row', async () => {
  const f = fixture([record(1, workspaceId, 'failed')]); f.flags.domainError = new Error('database unavailable');
  await assert.rejects(webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now}), /database unavailable/);
  assert.equal(f.state.records[0].inbox.status, 'received');
  assert.equal(f.state.financialEffects, 0);
});

test('invalid processing clocks fail closed before any database reads or mutations', async () => {
  const f = fixture();
  await assert.rejects(webhooks.processProviderWebhook(f.db, {...f.input, now: new Date(NaN)}), /timestamp/i);
  await assert.rejects(webhooks.drainTerminalProviderWebhookInbox(f.db, {workspaceId, now: new Date(NaN)}), /timestamp/i);
  assert.equal(f.queries.length, 0);
  assert.equal(f.state.domainEffects, 0);
});

function ingestFixture() {
  const row = record();
  const rawBody = Buffer.from(JSON.stringify({request_id: row.attempt.providerRequestId, status: 'COMPLETED'}));
  row.inbox.payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const f = fixture([row]);
  const catalog = getProviderModel('fal-wan22-t2v');
  const verified = {eventId: row.inbox.externalEventId, accountId: 'fixture-account', attemptNonce: row.attempt.clientReference, authenticatedAt: now.toISOString(), observation: {ref: {provider: 'fal' as const, modelKey: catalog.modelKey, requestId: row.attempt.providerRequestId, catalog}, status: 'completed' as const, observedAt: now.toISOString(), evidence: {code: 'fal.completed'}}};
  return {f, input: {provider: 'fal' as const, rawBody, verified, now}};
}

test('authenticated inbox ingestion remains idempotent and rejects event-ID payload substitution', async () => {
  const {f, input} = ingestFixture();
  const result = await webhooks.ingestProviderWebhook(f.db, input);
  assert.equal(result.duplicate, true);
  assert.equal(result.workspaceId, workspaceId);
  assert.equal(result.attemptId, f.input.attemptId);
  await assert.rejects(webhooks.ingestProviderWebhook(f.db, {...input, rawBody: Buffer.concat([input.rawBody, Buffer.from(' ')])}), /different payload/i);
  assert.equal(f.state.inboxUpdates, 0);
});

test('ingestion rejects altered attempt correlation and malformed bounded input before inbox effects', async () => {
  const {f, input} = ingestFixture();
  await assert.rejects(webhooks.ingestProviderWebhook(f.db, {...input, verified: {...input.verified, attemptNonce: 'other-nonce'}}), /nonce/i);
  await assert.rejects(webhooks.ingestProviderWebhook(f.db, {...input, provider: 'replicate'}), /identity/i);
  await assert.rejects(webhooks.ingestProviderWebhook(f.db, {...input, now: new Date(NaN)}), /timestamp/i);
  for (const rawBody of [Buffer.alloc(0), Buffer.alloc(1_000_001)]) await assert.rejects(webhooks.ingestProviderWebhook(f.db, {...input, rawBody}), /bounded size/i);
  assert.equal(f.state.inboxUpdates, 0);
});
