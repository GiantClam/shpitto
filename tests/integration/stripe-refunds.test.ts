import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {semanticHash} from '../../src/contracts/http.ts';
import {snapshotBillingProduct} from '../../src/config/plans.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import * as schema from '../../src/db/schema/index.ts';
import {createStripeRefundProvider} from '../../src/adapters/billing/stripe-refunds.ts';
import type {StripeTestRefundInput, StripeTestRefundResult} from '../../src/adapters/billing/stripe-test.ts';
import type {BillingRefundProvider} from '../../src/adapters/billing/refunds.ts';
import {requestBillingRefund, requestBillingRefundAsOperator, reconcileBillingRefund} from '../../src/modules/billing/refund-command.ts';
import {deliverOperatorRefund} from '../../src/modules/billing/refund-delivery.ts';
import {getOwnerBillingView} from '../../src/modules/billing/queries.ts';
import {recordTrustedSecondFactor} from '../../src/modules/operations/authorize.ts';
import {issueGrant} from '../../src/modules/credits/ledger.ts';

// Disposable loopback PostgreSQL only. No env files, application config, SDK or network provider.
const databaseName = `shpitto_stripe_refunds_${randomUUID().replaceAll('-', '')}`;
let admin: Client;
let pool: Pool;
let db: AppDatabase;
let created = false;
let databaseUrl: string;
const now = new Date();
before(async () => {
  const url = new URL('postgres://shpitto:shpitto-local-only@127.0.0.1:55433/postgres');
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 3000});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();
  pool = new Pool({connectionString: url.toString(), max: 8});
  await pool.query(await readFile(resolve('src/db/legacy-credit-baseline.sql'), 'utf8'));
  db = drizzle(pool, {schema});
  await migrate(db, {migrationsFolder: resolve('src/db/migrations')});
});
after(async () => {
  await pool?.end();
  if (created) {
    await admin.query(`drop database "${databaseName}" with (force)`);
    assert.equal((await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rowCount, 0);
  }
  await admin?.end();
});

async function fixture(provider: 'stripe' | 'fixture' = 'stripe', withAlias = true) {
  const workspaceId = randomUUID();
  const orderId = randomUUID();
  const userId = `refund-${randomUUID()}`;
  const actor = {userId, sessionId: `session-${userId}`};
  const customerId = `cus_${randomUUID().replaceAll('-', '')}`;
  const paymentIntentId = `pi_${randomUUID().replaceAll('-', '')}`;
  const payload = {catalogVersion: 1, productKey: 'refund-pack', kind: 'pack', interval: null, credits: '250', amountMinor: '900', currency: 'usd', creditExpiry: 'never', provider: 'stripe', priceReference: 'price_refund'};
  const snapshot = provider === 'stripe' ? {...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)} : snapshotBillingProduct('fixture-pack', 'local');
  await db.insert(schema.authUser).values({id: userId, name: userId, email: `${userId}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now});
  await db.insert(schema.authSession).values({id: actor.sessionId, userId, token: randomUUID(), expiresAt: new Date(now.getTime() + 3600_000), createdAt: now, updatedAt: now});
  await db.insert(schema.operatorRoles).values({userId, role: 'operator', grantedAt: now, updatedAt: now});
  await recordTrustedSecondFactor(db, actor, now);
  await pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Refund fixture',$2,$3,$3)", [workspaceId, userId, now]);
  await pool.query("insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',$3)", [workspaceId, userId, now]);
  await pool.query('insert into app.billing_accounts (workspace_id,created_at,updated_at) values ($1,$2,$2)', [workspaceId, now]);
  await pool.query('insert into app.credit_accounts (workspace_id,created_at,updated_at) values ($1,$2,$2)', [workspaceId, now]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,$2,$3,$4,'Refund fixture')", [workspaceId, provider, customerId, now]);
  await pool.query("insert into app.billing_orders (id,workspace_id,provider,customer_id,kind,catalog_snapshot,status,currency,paid_minor,paid_at,created_at,updated_at) values ($1,$2,$3,$4,'pack',$5,'paid','usd',900,$6,$6,$6)", [orderId, workspaceId, provider, customerId, snapshot, now]);
  await issueGrant(db, {actorUserId: userId, workspaceId, commandName: 'test.billing.grant', commandKey: orderId, businessKey: `billing:${orderId}:grant`, source: 'purchase', amount: 250n, payload: {orderId}});
  if (withAlias) await pool.query("insert into app.billing_payment_aliases (workspace_id,provider,object_kind,external_id,order_id,created_at) values ($1,$2,'payment_intent',$3,$4,$5)", [workspaceId, provider, paymentIntentId, orderId, now]);
  return {workspaceId, orderId, actor, customerId, paymentIntentId};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function command(f: Fixture) {
  return {actor: f.actor, workspaceId: f.workspaceId, orderId: f.orderId, expectedVersion: 1, idempotencyKey: randomUUID(), reason: 'Customer refund requested', purpose: 'Investigate refund request', now};
}
function remote(input: StripeTestRefundInput, status: 'pending' | 'failed' | 'succeeded' = 'succeeded'): StripeTestRefundResult {
  return {status, refundId: `re_${input.requestId}`, paymentIntentId: input.paymentIntentId, customerId: input.customerId, amountMinor: input.amountMinor, currency: input.currency, providerStatus: status};
}
function harness(observe: (input: StripeTestRefundInput) => StripeTestRefundResult | Promise<StripeTestRefundResult>) {
  const calls: {mode: string; input: StripeTestRefundInput & {refundId?: string}}[] = [];
  const provider = createStripeRefundProvider(db, {
    async createRefund(input) { calls.push({mode: 'create', input}); return observe(input); },
    async retrieveRefund(input) { calls.push({mode: 'retrieve', input}); return observe(input); },
    async lookupRefund(input) { calls.push({mode: 'lookup', input}); return observe(input); },
  });
  return {provider, calls};
}
async function facts(f: Fixture) {
  return {
    requests: (await pool.query('select * from app.billing_refund_requests where workspace_id=$1', [f.workspaceId])).rows,
    cash: (await pool.query('select * from app.billing_cash_events where workspace_id=$1', [f.workspaceId])).rows,
    order: (await pool.query('select * from app.billing_orders where id=$1', [f.orderId])).rows[0],
    outbox: (await pool.query("select * from app.outbox_events where workspace_id=$1 and event_type='billing.refund_requested'", [f.workspaceId])).rows,
    grant: (await pool.query('select * from app.credit_grants where workspace_id=$1', [f.workspaceId])).rows[0],
  };
}

test('fixture defaults still execute offline and preserve owner manual recovery', async () => {
  const f = await fixture('fixture');
  assert.equal((await requestBillingRefundAsOperator(db, command(f))).status, 'confirmed');
  const owner = await fixture('fixture');
  const provider: BillingRefundProvider = {provider: 'fixture', async createRefund() { return {unknown: true}; }};
  const pending = await requestBillingRefund(db, {...command(owner), provider});
  assert.equal(pending.status, 'unknown');
  assert.equal((await reconcileBillingRefund(db, {actor: owner.actor, requestId: pending.requestId, externalId: 'fixture_manual', now})).status, 'confirmed');
});

test('Stripe requires explicit matching provider, without recording an intent or falling back', async () => {
  const f = await fixture();
  await assert.rejects(requestBillingRefundAsOperator(db, command(f)), /provider|enabled/i);
  await assert.rejects(requestBillingRefund(db, command(f)), /provider|enabled/i);
  assert.equal((await facts(f)).requests.length, 0);
});

test('Stripe binds durable request, historical customer and canonical payment intent and confirms exactly once', async () => {
  const f = await fixture();
  const h = harness((input) => remote(input));
  await pool.query('update app.billing_customer_history set valid_until=$2 where workspace_id=$1', [f.workspaceId, now]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'stripe','cus_replacement',$2,'Replacement')", [f.workspaceId, now]);
  const input = {...command(f), provider: h.provider};
  const result = await requestBillingRefundAsOperator(db, input);
  assert.equal(result.status, 'confirmed');
  assert.equal((await requestBillingRefundAsOperator(db, input)).status, 'confirmed');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].input, {workspaceId: f.workspaceId, customerId: f.customerId, paymentIntentId: f.paymentIntentId, requestId: result.requestId, orderId: f.orderId, amountMinor: '900', currency: 'usd', idempotencyKey: `refund:${result.requestId}`});
  const stored = await facts(f);
  assert.equal(stored.requests[0].provider, 'stripe');
  assert.equal(stored.cash.length, 1);
  assert.equal(stored.order.refunded_minor, '900');
  assert.equal(stored.outbox[0].status, 'published');
  assert.equal(stored.grant.voided, '250');
  assert.equal(stored.grant.available, '0');
});

test('owner refund command replays the current confirmed result after the order becomes refunded', async () => {
  const f = await fixture();
  const h = harness((input) => remote(input));
  const input = {...command(f), provider: h.provider};

  const first = await requestBillingRefund(db, input);
  assert.equal(first.status, 'confirmed');
  assert.equal((await facts(f)).order.status, 'refunded');

  const replay = await requestBillingRefund(db, input);
  assert.deepEqual(replay, {...first, replayed: true});
  assert.deepEqual(h.calls.map(({mode}) => mode), ['create']);
  const stored = await facts(f);
  assert.equal(stored.requests.length, 1);
  assert.equal(stored.cash.length, 1);
  assert.equal(stored.grant.voided, '250');
});

test('owner billing projection separates refunded cash from voided credits and rejects members', async () => {
  const f = await fixture();
  const h = harness((input) => remote(input));
  await requestBillingRefund(db, {...command(f), provider: h.provider});

  const ownerView = await getOwnerBillingView(db, {actor: f.actor, workspaceId: f.workspaceId});
  assert.equal(ownerView.orders.length, 1);
  assert.equal(ownerView.orders[0].paidMinor, 900n);
  assert.equal(ownerView.orders[0].refundedMinor, 900n);
  assert.equal(ownerView.grants.length, 1);
  assert.equal(ownerView.grants[0].issued, 250n);
  assert.equal(ownerView.grants[0].available, 0n);
  assert.equal(ownerView.grants[0].voided, 250n);

  const memberId = `refund-member-${randomUUID()}`;
  await db.insert(schema.authUser).values({id: memberId, name: memberId, email: `${memberId}@example.test`, emailVerified: true, twoFactorEnabled: false, createdAt: now, updatedAt: now});
  await pool.query("insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'member',$3)", [f.workspaceId, memberId, now]);
  await assert.rejects(getOwnerBillingView(db, {actor: {userId: memberId}, workspaceId: f.workspaceId}), /owner/i);
});

for (const status of ['pending', 'unknown', 'failed'] as const) {
  test(`Stripe ${status} cannot create confirmed cash; recovery is read-only`, async () => {
    const f = await fixture();
    let resolved = false;
    const h = harness((input) => resolved ? remote(input) : status === 'unknown' ? {status: 'unknown', code: 'provider_unavailable'} : remote(input, status));
    const result = await requestBillingRefundAsOperator(db, {...command(f), provider: h.provider});
    assert.equal(result.status, status);
    assert.equal((await facts(f)).cash.length, 0);
    assert.equal((await facts(f)).grant.available, '250');
    if (status === 'failed') {
      assert.equal((await facts(f)).outbox[0].status, 'published');
      return;
    }
    resolved = true;
    const recovered = await deliverOperatorRefund(db, {actor: f.actor, workspaceId: f.workspaceId, requestId: result.requestId, purpose: 'Recover refund observation', provider: h.provider, now: new Date(now.getTime() + 61_000)});
    assert.equal(recovered.status, 'confirmed');
    assert.deepEqual(h.calls.map((call) => call.mode), ['create', status === 'pending' ? 'retrieve' : 'lookup']);
    assert.equal((await facts(f)).cash.length, 1);
  });
}

for (const field of ['amountMinor', 'currency', 'customerId', 'paymentIntentId'] as const) {
  test(`mismatched Stripe ${field} evidence remains unresolved`, async () => {
    const f = await fixture();
    const h = harness((input) => ({...remote(input), [field]: field === 'amountMinor' ? '1' : 'wrong'}));
    assert.equal((await requestBillingRefundAsOperator(db, {...command(f), provider: h.provider})).status, 'unknown');
    assert.equal((await facts(f)).cash.length, 0);
  });
}

test('missing or ambiguous canonical aliases fail closed before any Stripe call', async () => {
  for (const ambiguous of [false, true]) {
    const f = await fixture('stripe', ambiguous);
    const h = harness((input) => remote(input));
    if (ambiguous) await pool.query("insert into app.billing_payment_aliases (workspace_id,provider,object_kind,external_id,order_id,created_at) values ($1,'stripe','payment_intent',$2,$3,$4)", [f.workspaceId, `pi_ambiguous_${f.orderId}`, f.orderId, now]);
    assert.equal((await requestBillingRefundAsOperator(db, {...command(f), provider: h.provider})).status, 'unknown');
    assert.equal(h.calls.length, 0);
    assert.equal((await facts(f)).cash.length, 0);
  }
});

test('adapter exceptions and unverified failed responses remain unknown, never terminal failure or cash', async () => {
  for (const throws of [true, false]) {
    const f = await fixture();
    const h = harness(() => { if (throws) throw new Error('SDK sensitive raw failure'); return {status: 'failed', code: 'provider_rejected'}; });
    assert.equal((await requestBillingRefundAsOperator(db, {...command(f), provider: h.provider})).status, 'unknown');
    assert.equal((await facts(f)).cash.length, 0);
  }
});

test('owner Stripe reconciliation requires authoritative readback, not a supplied external ID', async () => {
  const f = await fixture();
  let state: 'pending' | 'succeeded' = 'pending';
  const h = harness((input) => remote(input, state));
  const initial = await requestBillingRefund(db, {...command(f), provider: h.provider});
  assert.equal(initial.status, 'pending');
  const input = {actor: f.actor, requestId: initial.requestId, externalId: initial.externalId!, now};
  await assert.rejects(reconcileBillingRefund(db, input), /provider|enabled/i);
  const forged = await reconcileBillingRefund(db, {...input, externalId: 're_forged', provider: h.provider});
  assert.equal(forged.status, 'unknown');
  assert.equal((await facts(f)).cash.length, 0);
  assert.equal((await reconcileBillingRefund(db, {...input, provider: h.provider})).status, 'pending');
  state = 'succeeded';
  assert.equal((await reconcileBillingRefund(db, {...input, provider: h.provider})).status, 'confirmed');
  assert.ok(h.calls.slice(1).every((call) => call.mode === 'retrieve'));
  assert.equal((await facts(f)).cash.length, 1);
});

test('auth, step-up and expected version reject before provider work or refund creation', async () => {
  const f = await fixture();
  const h = harness((input) => remote(input));
  await assert.rejects(requestBillingRefundAsOperator(db, {...command(f), expectedVersion: 2, provider: h.provider}), /version/i);
  await assert.rejects(requestBillingRefundAsOperator(db, {...command(f), actor: {...f.actor, sessionId: 'wrong-session'}, provider: h.provider}), /session/i);
  await pool.query('delete from app.operator_step_ups where user_id=$1', [f.actor.userId]);
  await assert.rejects(requestBillingRefundAsOperator(db, {...command(f), provider: h.provider}), /factor|step.up/i);
  assert.equal(h.calls.length, 0);
  assert.equal((await facts(f)).requests.length, 0);
});

test('parallel commands submit once, block other unresolved intents, and expired claims only look up', async () => {
  const f = await fixture();
  const h = harness(() => ({status: 'unknown', code: 'provider_unavailable'}));
  const input = {...command(f), provider: h.provider};
  const results = await Promise.all([requestBillingRefundAsOperator(db, input), requestBillingRefundAsOperator(db, input)]);
  assert.equal(results[0].requestId, results[1].requestId);
  assert.equal(h.calls.filter((call) => call.mode === 'create').length, 1);
  await assert.rejects(requestBillingRefundAsOperator(db, {...input, expectedVersion: 2, idempotencyKey: randomUUID()}), /unresolved/i);
  await pool.query("update app.outbox_events set lease_until=$2,lease_owner='crashed',lease_token=$3,available_at=$2 where workspace_id=$1 and event_type='billing.refund_requested'", [f.workspaceId, new Date(now.getTime() - 1), randomUUID()]);
  await deliverOperatorRefund(db, {actor: f.actor, workspaceId: f.workspaceId, requestId: results[0].requestId, purpose: 'Recover expired delivery', provider: h.provider, now});
  assert.deepEqual(h.calls.map((call) => call.mode), ['create', 'lookup']);
});

test('Stripe port refuses fixture-shaped success and mismatched providers on recovery', async () => {
  const f = await fixture();
  const input = command(f);
  const legacy: BillingRefundProvider = {provider: 'stripe', async createRefund() { return {externalId: 're_unverified', amountMinor: 900n}; }};
  const initial = await requestBillingRefundAsOperator(db, {...input, provider: legacy});
  assert.equal(initial.status, 'unknown');
  await assert.rejects(deliverOperatorRefund(db, {actor: f.actor, workspaceId: f.workspaceId, requestId: initial.requestId, purpose: input.purpose, provider: {provider: 'fixture', async createRefund() { assert.fail('Provider mismatch.'); }}}), /provider/i);
  assert.equal((await facts(f)).cash.length, 0);
  assert.equal((await facts(f)).grant.available, '250');
});

test('bridge rejects caller money/order/key drift and never uses caller payment target', async () => {
  const f = await fixture();
  const h = harness(() => ({status: 'unknown', code: 'provider_unavailable'}));
  const initial = await requestBillingRefundAsOperator(db, {...command(f), provider: h.provider});
  const input = {requestId: initial.requestId, orderId: f.orderId, amountMinor: 900n, currency: 'usd', idempotencyKey: `refund:${initial.requestId}`};
  for (const update of [{amountMinor: 1n}, {currency: 'eur'}, {orderId: randomUUID()}, {idempotencyKey: 'caller-key'}]) {
    assert.deepEqual(await h.provider.createRefund({...input, ...update}), {unknown: true});
  }
  assert.equal(h.calls.length, 1);
  const malicious = {...input, paymentIntentId: 'pi_caller', customerId: 'cus_caller', workspaceId: randomUUID()};
  await h.provider.lookupRefund!(malicious);
  assert.equal(h.calls.at(-1)!.input.paymentIntentId, f.paymentIntentId);
  assert.equal(h.calls.at(-1)!.input.customerId, f.customerId);
  assert.equal(h.calls.at(-1)!.input.workspaceId, f.workspaceId);
});

test('lost finalization rejects stale lease and recovers successful cash by read-only lookup', async () => {
  const f = await fixture();
  let first = true;
  const h = harness(async (input) => {
    if (first) {
      first = false;
      // Remote work occurs after committed intent/claim; another connection can lock all scopes.
      const client = new Client({connectionString: databaseUrl});
      await client.connect();
      try {
        await client.query('begin');
        await client.query("set local lock_timeout='500ms'");
        await client.query('select * from app.workspaces where id=$1 for update', [f.workspaceId]);
        await client.query('select * from app.billing_accounts where workspace_id=$1 for update', [f.workspaceId]);
        await client.query('select * from app.billing_refund_requests where id=$1 for update', [input.requestId]);
        await client.query("update app.outbox_events set lease_generation=lease_generation+1,lease_until=$2 where business_key=$1", [`billing.refund:${input.requestId}`, new Date(now.getTime() - 1)]);
        await client.query('commit');
      } finally { await client.end(); }
    }
    return remote(input);
  });
  await assert.rejects(requestBillingRefundAsOperator(db, {...command(f), provider: h.provider}), /lease/i);
  const stored = await facts(f);
  assert.equal(stored.cash.length, 0);
  const result = await deliverOperatorRefund(db, {actor: f.actor, workspaceId: f.workspaceId, requestId: String(stored.requests[0].id), purpose: 'Recover lost local acknowledgment', provider: h.provider, now});
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(h.calls.map((call) => call.mode), ['create', 'lookup']);
  assert.equal((await facts(f)).cash.length, 1);
  assert.equal((await facts(f)).grant.voided, '250');
});

test('owner readback rechecks ownership before applying external cash evidence', async () => {
  const f = await fixture();
  let revoke = false;
  const h = harness(async (input) => {
    if (!revoke) return {status: 'unknown', code: 'provider_unavailable'};
    await pool.query("update app.workspace_members set role='member' where workspace_id=$1 and user_id=$2", [f.workspaceId, f.actor.userId]);
    return remote(input);
  });
  const initial = await requestBillingRefund(db, {...command(f), provider: h.provider});
  revoke = true;
  await assert.rejects(reconcileBillingRefund(db, {requestId: initial.requestId, actor: f.actor, externalId: `re_${initial.requestId}`, provider: h.provider, now}), /owner|forbidden/i);
  assert.equal((await facts(f)).cash.length, 0);
});

test('changed durable refund binding rejects late successful delivery evidence', async () => {
  const f = await fixture();
  const h = harness(async (input) => {
    await pool.query('update app.billing_refund_requests set amount_minor=1 where id=$1', [input.requestId]);
    return remote(input);
  });
  await assert.rejects(requestBillingRefundAsOperator(db, {...command(f), provider: h.provider}), /binding changed/i);
  assert.equal((await facts(f)).cash.length, 0);
  assert.equal((await facts(f)).grant.available, '250');
});
