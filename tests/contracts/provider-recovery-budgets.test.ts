import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {setImmediate} from 'node:timers/promises';
import test from 'node:test';
import {getTableColumns, getTableName, type SQL} from 'drizzle-orm';
import {PgDialect, type PgTable} from 'drizzle-orm/pg-core';

import type {AppDatabase} from '../../src/db/client.ts';
import {DomainError} from '../../src/db/contracts.ts';
import {commandResults} from '../../src/db/schema/commands.ts';
import {auditEvents, outboxEvents} from '../../src/db/schema/credit.ts';
import {assets} from '../../src/db/schema/asset.ts';
import {generationTasks, submissionAttempts, generationQuarantine} from '../../src/db/schema/generation.ts';
import {creditAccounts, creditReservations} from '../../src/db/schema/workspace.ts';
import {createServerQuote} from '../../src/config/models.ts';
import {freezeSubmissionContext, validateVideoInput} from '../../src/adapters/providers/input.ts';
import type {PrivateObjectStore} from '../../src/adapters/storage/port.ts';
import {materializeOutput} from '../../src/modules/assets/ingest.ts';
import {evaluateIntegrationHealth} from '../../src/modules/operations/integration-health.ts';
import {assertOutboxLeaseInTransaction, createOutboxHeartbeatController, OUTBOX_LEASE_MS, OUTBOX_HEARTBEAT_INTERVAL_MS, type OutboxLease} from '../../src/modules/generation/outbox.ts';

// Accelerated in-memory timing contracts, not PostgreSQL/ledger atomicity or hour-long trials.
// Keep actual lifecycle commands, durable replay, SQL fences and materialization admission.
// Stub only workspace authorization and financial effects, outside this test's timing scope.
const lifecycleUrl = new URL('../../src/modules/generation/lifecycle.ts', import.meta.url).href;
const authorizationStub = 'data:text/javascript,export const authorizeWorkspaceAccess = async () => undefined;';
const settlementStub = 'data:text/javascript,' + encodeURIComponent('export const settleInTransaction = (tx, input) => tx.testSettlement(input);');
const hooks = registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === lifecycleUrl && specifier === '../workspaces/authorize.ts') return {url: authorizationStub, shortCircuit: true};
  if (context.parentURL === lifecycleUrl && specifier === '../credits/settle.ts') return {url: settlementStub, shortCircuit: true};
  return next(specifier, context);
}});
const lifecycle = await import(lifecycleUrl).finally(() => hooks.deregister());

const origin = new Date('2026-10-15T00:00:00.000Z');
const minute = 60_000;
const at = (elapsed: number) => new Date(origin.getTime() + elapsed);
const workspaceId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const actor = {userId: 'budget-fixture-user'};
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';
const accepted = freezeSubmissionContext({workspaceId, taskId, attemptId: 'fixture-attempt', attemptNonce: 'fixture-issued-nonce',
  input: validateVideoInput({modelKey: 'replicate-wan22-t2v', mode: 'text-to-video', prompt: 'Offline budget contract', aspectRatio: '16:9'}),
  quote: createServerQuote('replicate-wan22-t2v', '1', {profile: 'acceptance', now: origin}), createdAt: origin.toISOString()});

type Row = Record<string, unknown>;
const tables = [commandResults, auditEvents, outboxEvents, assets, generationTasks, submissionAttempts, generationQuarantine, creditAccounts, creditReservations];
const columnNames = Object.fromEntries(tables.map((table) => [getTableName(table), Object.fromEntries(Object.entries(getTableColumns(table)).map(([property, column]) => [column.name, property]))]));
const dialect = new PgDialect();

// Evaluate only the real queries' scalar predicates; unsupported SQL fails loudly.
// This helper does not decide any budget, state transition or retry policy.
function matches(condition: SQL | undefined, row: Row): boolean {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  function evaluate(source: string): boolean {
    let expression = source.trim();
    while (expression.startsWith('(')) {
      let depth = 0; let close = -1;
      for (let index = 0; index < expression.length; index++) {
        if (expression[index] === '(') depth++;
        if (expression[index] === ')' && --depth === 0) { close = index; break; }
      }
      if (close !== expression.length - 1) break;
      expression = expression.slice(1, -1).trim();
    }
    for (const operator of [' or ', ' and ']) {
      let depth = 0;
      for (let index = 0; index < expression.length; index++) {
        if (expression[index] === '(') depth++;
        if (expression[index] === ')') depth--;
        if (depth === 0 && expression.startsWith(operator, index)) {
          const left = evaluate(expression.slice(0, index));
          const right = evaluate(expression.slice(index + operator.length));
          return operator === ' or ' ? left || right : left && right;
        }
      }
    }
    const atom = /^(?:"app"\.)?"([a-z_]+)"\."([a-z_]+)" (is null|<=|>=|=|<|>)(?: \$(\d+))?$/.exec(expression);
    assert.ok(atom, `Unsupported fixture predicate: ${expression}`);
    const actual = row[columnNames[atom[1]]?.[atom[2]]];
    if (atom[3] === 'is null') return actual === null || actual === undefined;
    const normalize = (value: unknown) => value instanceof Date ? value.toISOString() : typeof value === 'bigint' ? value.toString() : value;
    const left = normalize(actual) as string | number;
    const right = normalize(query.params[Number(atom[4]) - 1]) as string | number;
    if (actual === null || actual === undefined) return false;
    switch (atom[3]) {
      case '=': return left === right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      default: throw new Error(`Unsupported fixture operator ${atom[3]}`);
    }
  }
  return evaluate(query.sql);
}

function fixture() {
  let state: Record<string, Row[]> = Object.fromEntries(tables.map((table) => [getTableName(table), []]));
  let settlements: Row[] = [];
  state.generation_tasks.push({id: taskId, workspaceId, requestedBy: actor.userId, status: 'queued', version: 1,
    deadlineAt: new Date(accepted.deadlines.queueDeadlineAt), stageDeadlineAt: new Date(accepted.deadlines.queueDeadlineAt), overallDeadlineAt: new Date(accepted.deadlines.overallDeadlineAt),
    materializationAttempts: 0, dispatchStartedAt: null, submissionStartedAt: null, providerCostState: 'unknown'});
  state.credit_accounts.push({workspaceId});
  state.credit_reservations.push({id: 'fixture-reservation', workspaceId, taskId, status: 'active'});
  const database = {
    async transaction<T>(work: (tx: AppDatabase) => Promise<T>): Promise<T> {
      const before = structuredClone(state); const beforeSettlements = structuredClone(settlements);
      try { return await work(database as unknown as AppDatabase); }
      catch (error) { state = before; settlements = beforeSettlements; throw error; }
    },
    select() {
      let table: PgTable; let condition: SQL | undefined; let bound: number | undefined;
      const chain = {
        from(value: PgTable) { table = value; return chain; },
        where(value: SQL) { condition = value; return chain; },
        for() { return chain; }, orderBy() { return chain; },
        limit(value: number) { bound = value; return chain; },
        then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve().then(() => structuredClone(state[getTableName(table)].filter((row) => matches(condition, row)).slice(0, bound))).then(resolve, reject);
        },
      }; return chain;
    },
    insert(table: PgTable) {
      let value: Row;
      const chain = {values(row: Row) { value = row; return chain; }, onConflictDoNothing() { return chain; },
        then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve().then(() => { state[getTableName(table)].push(structuredClone(value)); return [value]; }).then(resolve, reject);
        }}; return chain;
    },
    update(table: PgTable) {
      let patch: Row; let condition: SQL | undefined;
      const chain = {set(value: Row) { patch = value; return chain; }, where(value: SQL) { condition = value; return chain; }, returning() { return chain; },
        then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve().then(() => {
            const rows = state[getTableName(table)].filter((row) => matches(condition, row));
            for (const row of rows) Object.assign(row, structuredClone(patch));
            return structuredClone(rows);
          }).then(resolve, reject);
        }}; return chain;
    },
    async testSettlement(input: Row) { settlements.push(structuredClone(input)); return {reservationId: input.reservationId, outcome: input.outcome}; },
  };
  return {db: database as unknown as AppDatabase, get task() { return state.generation_tasks[0]; },
    get attempt() { return state.submission_attempts[0]; }, get attempts() { return state.submission_attempts; },
    get settlements() { return settlements; }, rows(table: PgTable) { return state[getTableName(table)]; }};
}

const base = {actor, workspaceId, taskId, internalWorker: true};
async function dispatch(f: ReturnType<typeof fixture>, elapsed = 0) {
  return lifecycle.claimDispatch(f.db, {...base, idempotencyKey: 'budget-claim', provider: 'replicate', now: at(elapsed)});
}
async function unknown(f: ReturnType<typeof fixture>) {
  const claim = await dispatch(f);
  await lifecycle.markSubmissionUnknown(f.db, {...base, attemptId: claim.value.attemptId, idempotencyKey: 'budget-unknown', now: at(30_000)});
  return claim.value.attemptId as string;
}
async function submitted(f: ReturnType<typeof fixture>) {
  const claim = await dispatch(f);
  await lifecycle.recordProviderSubmission(f.db, {...base, attemptId: claim.value.attemptId, providerRequestId: 'fixture-request', idempotencyKey: 'budget-submitted', now: at(1000)});
  return claim.value.attemptId as string;
}
const deadlines = (f: ReturnType<typeof fixture>) => [f.task.deadlineAt, f.task.stageDeadlineAt, f.task.overallDeadlineAt, f.attempt?.reconcileDeadline];

test('accepted recovery policy snapshot fixes 10m/60m/90m and 24+60m/8+30m budgets', () => {
  assert.deepEqual(accepted.deadlines, {policyVersion: 1, queueDeadlineAt: at(10 * minute).toISOString(), overallDeadlineAt: at(90 * minute).toISOString(),
    executionBudgetSeconds: 3600, unknownRecoveryBudgetSeconds: 3600, maxReconciliationProbes: 24, unknownAlertAfterSeconds: 1800,
    materializationBudgetSeconds: 1800, maxMaterializationAttempts: 8});
});

for (const offset of [-1, 0, 1]) {
  test(`queue 10m admission boundary ${offset}ms`, async () => {
    const f = fixture(); const operation = dispatch(f, 10 * minute + offset);
    if (offset < 0) {
      await operation;
      assert.equal((f.task.overallDeadlineAt as Date).getTime(), at(100 * minute + offset).getTime(), 'Overall starts at dispatch, not queue creation.');
    } else { await assert.rejects(operation, conflict); assert.equal(f.task.status, 'queued'); assert.equal(f.attempts.length, 0); }
  });
  test(`submit timeout 30s boundary ${offset}ms`, () => {
    assert.equal(lifecycle.isSubmissionTimedOut(origin, at(30_000 + offset)), offset >= 0);
    assert.equal(lifecycle.isSubmissionTimedOut(at(10 * minute), at(10 * minute + 30_000 + offset)), offset >= 0);
  });
  test(`unknown recovery 60m from dispatch boundary ${offset}ms`, async () => {
    const f = fixture(); const attemptId = await unknown(f); const initial = structuredClone(deadlines(f));
    const result = await lifecycle.reconcileSubmissionUnknown(f.db, {...base, attemptId, observation: 'missing', idempotencyKey: 'budget-probe', now: at(60 * minute + offset)});
    assert.equal(result.value.status, offset < 0 ? 'probing' : 'failed');
    assert.deepEqual(deadlines(f), initial);
    if (offset >= 0) { assert.equal(f.task.failureCode, 'generation.submission_untraceable'); assert.equal(f.task.providerCostState, 'unknown'); assert.equal(f.settlements.length, 1); }
  });
  test(`known execution 60m from dispatch boundary ${offset}ms`, async () => {
    const f = fixture(); const attemptId = await submitted(f); const overall = f.task.overallDeadlineAt;
    const operation = lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-success', now: at(60 * minute + offset)});
    if (offset < 0) { await operation; assert.equal((f.task.deadlineAt as Date).getTime(), at(90 * minute + offset).getTime()); }
    else { await assert.rejects(operation, conflict); assert.equal(f.task.status, 'submitted'); }
    assert.deepEqual(f.task.overallDeadlineAt, overall);
  });
  test(`unknown age alert 30m boundary ${offset}ms`, () => {
    assert.equal(evaluateIntegrationHealth({provider: 'replicate', lastSuccessfulAt: origin, unknownOldestAt: origin, now: at(30 * minute + offset)}).reason, offset < 0 ? 'ok' : 'unknown_age');
  });
}

for (const probe of [23, 24, 25]) {
  test(`unknown upcoming probe ${probe} cannot exceed the 24-probe fence`, async () => {
    const f = fixture(); const attemptId = await unknown(f); f.attempt.probeCount = probe - 1;
    const initial = structuredClone(deadlines(f));
    const result = await lifecycle.reconcileSubmissionUnknown(f.db, {...base, attemptId, observation: 'missing', idempotencyKey: `budget-probe-${probe}`, now: at(5 * minute)});
    assert.equal(result.value.status, probe < 24 ? 'probing' : 'failed');
    assert.deepEqual(deadlines(f), initial); assert.equal(f.attempts.length, 1);
    assert.equal(f.settlements.length, probe < 24 ? 0 : 1);
    assert.equal(f.task.providerCostState, 'unknown');
  });
}

test('the exhausted 24th probe is terminal; replay or a 25th command cannot reset or settle twice', async () => {
  const f = fixture(); const attemptId = await unknown(f); f.attempt.probeCount = 22;
  const initial = structuredClone(deadlines(f));
  const probe = {...base, attemptId, observation: 'missing' as const};
  await lifecycle.reconcileSubmissionUnknown(f.db, {...probe, idempotencyKey: 'budget-probe-23', now: at(55 * minute)});
  assert.equal(f.attempt.probeCount, 23);
  await lifecycle.reconcileSubmissionUnknown(f.db, {...probe, idempotencyKey: 'budget-probe-24', now: at(58 * minute)});
  assert.equal(f.task.status, 'failed');
  assert.equal((await lifecycle.reconcileSubmissionUnknown(f.db, {...probe, idempotencyKey: 'budget-probe-24', now: at(59 * minute)})).replayed, true);
  await assert.rejects(lifecycle.reconcileSubmissionUnknown(f.db, {...probe, idempotencyKey: 'budget-probe-25', now: at(59 * minute)}), conflict);
  assert.equal(f.settlements.length, 1); assert.equal(f.attempts.length, 1); assert.deepEqual(deadlines(f), initial);
});

for (const offset of [-1, 0, 1]) {
  test(`found unknown request cannot renew the 60m execution fence ${offset}ms`, async () => {
    const f = fixture(); const attemptId = await unknown(f); const initial = structuredClone(deadlines(f));
    const operation = lifecycle.reconcileSubmissionUnknown(f.db, {...base, attemptId, observation: 'found', providerRequestId: 'fixture-found', idempotencyKey: 'budget-found-boundary', now: at(60 * minute + offset)});
    if (offset < 0) { await operation; assert.equal(f.task.status, 'submitted'); }
    else { await assert.rejects(operation, conflict); assert.equal(f.attempt.providerRequestId, null); }
    assert.deepEqual(deadlines(f), initial); assert.equal(f.attempts.length, 1);
  });
}

test('dispatch, unknown, probe and known-request replays never reset deadlines or create another attempt', async () => {
  const f = fixture(); const attemptId = await unknown(f); const initial = structuredClone(deadlines(f));
  assert.equal((await dispatch(f, 20 * minute)).replayed, true);
  assert.equal((await lifecycle.markSubmissionUnknown(f.db, {...base, attemptId, idempotencyKey: 'budget-unknown', now: at(20 * minute)})).replayed, true);
  const probe = {...base, attemptId, observation: 'missing' as const, idempotencyKey: 'budget-probe-once'};
  await lifecycle.reconcileSubmissionUnknown(f.db, {...probe, now: at(10 * minute)});
  assert.equal((await lifecycle.reconcileSubmissionUnknown(f.db, {...probe, now: at(20 * minute)})).replayed, true);
  assert.equal(f.attempt.probeCount, 1);
  await lifecycle.reconcileSubmissionUnknown(f.db, {...base, attemptId, observation: 'found', providerRequestId: 'fixture-request', idempotencyKey: 'budget-found', now: at(25 * minute)});
  await lifecycle.recordProviderSubmission(f.db, {...base, attemptId, providerRequestId: 'fixture-request', idempotencyKey: 'budget-known-repeat', now: at(40 * minute)});
  assert.deepEqual(deadlines(f), initial); assert.equal(f.attempts.length, 1);
  await assert.rejects(lifecycle.claimDispatch(f.db, {...base, idempotencyKey: 'budget-second-claim', now: at(40 * minute)}), conflict);
  assert.equal(f.attempts.length, 1);
});

const putFailure = new Error('fixture put failure before media probe');
function failingStore() {
  let puts = 0;
  const forbidden = async (): Promise<never> => { throw new Error('Unexpected fixture storage operation'); };
  const store: PrivateObjectStore = {driver: 's3', async put() { puts++; throw putFailure; }, get: forbidden, delete: forbidden, head: forbidden, list: forbidden};
  return {store, get puts() { return puts; }};
}
async function materializing(firstSuccess = 10 * minute) {
  const f = fixture(); const attemptId = await submitted(f);
  await lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-materializing', now: at(firstSuccess)});
  return {f, attemptId};
}
const materializeInput = {actorUserId: actor.userId, workspaceId, taskId, bytes: new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]), mime: 'video/mp4'};

for (const offset of [-1, 0, 1]) {
  test(`materialization 30m from first success boundary ${offset}ms`, async () => {
    const {f} = await materializing(); const store = failingStore(); const initial = structuredClone(deadlines(f));
    await assert.rejects(materializeOutput(f.db, {...materializeInput, store: store.store, now: at(40 * minute + offset)}), offset < 0 ? (error) => error === putFailure : conflict);
    assert.equal(store.puts, offset < 0 ? 1 : 0); assert.deepEqual(deadlines(f), initial);
    assert.equal(f.task.materializationAttempts, offset < 0 ? 1 : 0);
  });
  test(`overall dispatch plus 90m boundary ${offset}ms`, async () => {
    const f = fixture(); const attemptId = await submitted(f);
    // Isolate the independent overall guard with a deliberately longer persisted
    // stage. Normal stages are already <= overall; equal dates alone would pass
    // even if the overall check were accidentally deleted.
    f.task.deadlineAt = at(100 * minute); f.task.stageDeadlineAt = at(100 * minute);
    const operation = lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-overall', now: at(90 * minute + offset)});
    if (offset < 0) { await operation; assert.deepEqual(f.task.deadlineAt, at(90 * minute)); }
    else { await assert.rejects(operation, conflict); assert.equal(f.task.status, 'submitted'); }
    assert.deepEqual(f.task.overallDeadlineAt, at(90 * minute));
  });
}

test('materialization replay and failed put retries never reset first-success/overall deadlines or eight attempts', async () => {
  const {f, attemptId} = await materializing(); const initial = structuredClone(deadlines(f)); const store = failingStore();
  assert.equal((await lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-materializing', now: at(20 * minute)})).replayed, true);
  await assert.rejects(lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-new-success', now: at(20 * minute)}), conflict);
  for (let attempt = 1; attempt <= 9; attempt++) {
    await assert.rejects(materializeOutput(f.db, {...materializeInput, store: store.store, now: at((10 + attempt) * minute)}), attempt <= 8 ? (error) => error === putFailure : conflict);
    assert.equal(f.task.materializationAttempts, Math.min(attempt, 8));
    assert.equal(store.puts, Math.min(attempt, 8)); assert.deepEqual(deadlines(f), initial);
  }
  assert.equal(f.rows(assets).length, 0);
});

test('known execution and materialization also honor an earlier persisted overall cap', async () => {
  const f = fixture(); const attemptId = await submitted(f); f.task.overallDeadlineAt = at(45 * minute);
  await lifecycle.markGenerationMaterializing(f.db, {...base, attemptId, idempotencyKey: 'budget-overall-cap', now: at(30 * minute)});
  assert.deepEqual(f.task.deadlineAt, at(45 * minute));
  assert.deepEqual(f.task.stageDeadlineAt, at(45 * minute));
  const store = failingStore();
  await assert.rejects(materializeOutput(f.db, {...materializeInput, store: store.store, now: at(45 * minute)}), conflict);
  assert.equal(store.puts, 0);
});

test('lease expiry holds before at and after 60s without extending task budgets', async () => {
  assert.equal(OUTBOX_LEASE_MS, minute);
  const lease: OutboxLease = {id: 'fixture-lease', owner: 'fixture-worker', token: 'fixture-token', generation: 1n, attempts: 1, eventType: 'generation.dispatch', payload: {workspaceId, taskId}};
  for (const offset of [-1, 0, 1]) {
    const f = fixture();
    f.rows(outboxEvents).push({id: lease.id, status: 'pending', leaseOwner: lease.owner, leaseToken: lease.token, leaseGeneration: lease.generation, leaseUntil: at(minute)});
    const initial = structuredClone(f.task);
    const operation = f.db.transaction((tx) => assertOutboxLeaseInTransaction(tx, lease, at(minute + offset)));
    if (offset < 0) await operation; else await assert.rejects(operation, conflict);
    assert.deepEqual(f.task, initial);
  }
});

test('default heartbeat renews at 20s not before, stops, and never renews recovery budgets', async (t) => {
  t.mock.timers.enable({apis: ['setInterval']}); assert.equal(OUTBOX_HEARTBEAT_INTERVAL_MS, 20_000);
  const f = fixture(); const initial = structuredClone(f.task); let renewals = 0;
  const heartbeat = createOutboxHeartbeatController(async () => { renewals++; return true; });
  try {
    t.mock.timers.tick(19_999); await setImmediate(); assert.equal(renewals, 0);
    t.mock.timers.tick(1); await setImmediate(); assert.equal(renewals, 1);
    t.mock.timers.tick(1); await setImmediate(); assert.equal(renewals, 1);
    assert.deepEqual(f.task, initial);
  } finally { await heartbeat.stop(); }
  t.mock.timers.tick(20_000); await setImmediate(); assert.equal(renewals, 1);
});
