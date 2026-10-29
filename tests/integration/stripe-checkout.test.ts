import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import type {BillingCheckoutProvider} from '../../src/adapters/billing/fake.ts';
import {semanticHash} from '../../src/contracts/http.ts';
import * as schema from '../../src/db/schema/index.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import {openBillingPortal, openCheckout, type CheckoutCommandInput} from '../../src/modules/billing/checkout.ts';
import {replaceCustomer} from '../../src/modules/billing/customer-history.ts';
import {parseBillingCatalogSnapshot, type BillingCatalogSnapshot} from '../../src/modules/billing/contracts.ts';

// Never load application env files. Only this suite's explicitly local disposable DB is writable.
const databaseName = `shpitto_stripe_checkout_${randomUUID().replaceAll('-', '')}`;
let admin: Client;
let pool: Pool;
let db: AppDatabase;
let databaseUrl: string;
let created = false;
const now = new Date('2026-10-20T12:00:00Z');
before(async () => {
  const url = new URL(process.env.STRIPE_CHECKOUT_TEST_ADMIN_DATABASE_URL ?? 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && ['55432', '55433'].includes(url.port), 'Only disposable LOCAL PostgreSQL on 55432/55433 is permitted.');
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 3000});
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();
  pool = new Pool({connectionString: url.toString(), max: 10});
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

function snapshot(kind: 'subscription' | 'pack' = 'pack', version = 1): BillingCatalogSnapshot {
  const payload = {catalogVersion: version, productKey: `test-${kind}`, kind, interval: kind === 'subscription' ? 'month' : null,
    credits: '250', amountMinor: '900', currency: 'usd', creditExpiry: kind === 'subscription' ? 'service_period_end' : 'never',
    provider: 'stripe', priceReference: `price_test${version}`};
  return parseBillingCatalogSnapshot({...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)});
}

function deferred<T>() {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolveValue = resolve; });
  return {promise, resolve: resolveValue};
}

function provider(overrides: Partial<BillingCheckoutProvider> = {}): BillingCheckoutProvider {
  const customers = new Map<string, string>();
  return {
    provider: 'stripe',
    async createCustomer(input) {
      const customerId = customers.get(input.idempotencyKey) ?? `cus_${randomUUID().replaceAll('-', '')}`;
      customers.set(input.idempotencyKey, customerId);
      return {customerId};
    },
    async createCheckout(input) { return {sessionId: `cs_${input.attemptId}`, url: `https://checkout.stripe.test/${input.attemptId}`}; },
    async retrieveCheckout(input) { return {sessionId: input.sessionId, url: `https://checkout.stripe.test/${input.attemptId}`, status: 'open'}; },
    async createPortal() { return {url: 'https://billing.stripe.test/portal'}; },
    ...overrides,
  };
}

async function fixture(overrides: Partial<CheckoutCommandInput> = {}): Promise<CheckoutCommandInput> {
  const workspaceId = randomUUID();
  const userId = `checkout-${randomUUID()}`;
  await pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,now(),now())', [userId, `${userId}@example.test`]);
  await pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Checkout fixture',$2,now(),now())", [workspaceId, userId]);
  await pool.query("insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',now())", [workspaceId, userId]);
  await pool.query("insert into app.billing_accounts (workspace_id,created_at,updated_at) values ($1,now(),now())", [workspaceId]);
  return {actor: {userId}, workspaceId, idempotencyKey: 'checkout-1', profile: 'test', catalogProductKey: 'test-pack',
    snapshotBillingProduct: () => snapshot(), provider: provider(), now, ...overrides};
}

async function attempts(workspaceId: string) {
  return (await pool.query('select * from app.billing_checkout_attempts where workspace_id=$1', [workspaceId])).rows;
}

test('fixture defaults still create and replay deterministic Checkout and portal', async () => {
  const input = await fixture({provider: undefined, catalogProductKey: 'fixture-pack', snapshotBillingProduct: undefined});
  const first = await openCheckout(db, input);
  assert.equal(first.provider, 'fixture');
  assert.deepEqual(await openCheckout(db, input), {...first, replayed: true});
  const portal = await openBillingPortal(db, {...input, appUrl: 'http://localhost:3100'});
  assert.match(portal.portalUrl, /\/billing\/portal\/fixture\//);
});

test('Stripe requires explicit server catalog; fixture terms cannot be relabeled as Stripe', async () => {
  const input = await fixture({snapshotBillingProduct: undefined});
  await assert.rejects(openCheckout(db, input), /catalog/i);
  assert.equal((await attempts(input.workspaceId)).length, 0);
  await assert.rejects(openCheckout(db, {...input, snapshotBillingProduct: () => ({...snapshot(), snapshotHash: '0'.repeat(64)})}), /snapshot/i);
  await assert.rejects(openCheckout(db, {...input, snapshotBillingProduct: () => snapshot('subscription')}), /product/i);
});

test('concurrent customer creation and command replay use a persisted stable remote key and one binding', async () => {
  const keys: string[] = [];
  const entered = deferred<void>();
  const release = deferred<void>();
  const remote = provider({async createCustomer(input) {
    keys.push(input.idempotencyKey);
    if (keys.length === 2) entered.resolve();
    await release.promise;
    return {customerId: 'cus_concurrent'};
  }});
  const input = await fixture({provider: remote});
  const first = openCheckout(db, input);
  const second = openCheckout(db, input);
  await entered.promise;
  // Remote I/O must leave both workspace and billing locks available to another transaction.
  const observer = new Client({connectionString: databaseUrl});
  await observer.connect();
  try {
    await observer.query('begin');
    await observer.query('select id from app.workspaces where id=$1 for update nowait', [input.workspaceId]);
    await observer.query('select workspace_id from app.billing_accounts where workspace_id=$1 for update nowait', [input.workspaceId]);
  } finally {
    await observer.query('rollback');
    await observer.end();
  }
  release.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(new Set(keys).size, 1);
  assert.equal(results[0].sessionId, results[1].sessionId);
  assert.equal((await attempts(input.workspaceId)).length, 1);
  const history = (await pool.query('select * from app.billing_customer_history where workspace_id=$1', [input.workspaceId])).rows;
  assert.equal(history.length, 1);
  assert.equal(history[0].customer_id, 'cus_concurrent');
  const intents = (await pool.query("select result from app.command_results where workspace_id=$1 and command_name='billing.customer.provision'", [input.workspaceId])).rows;
  assert.equal(intents.length, 1);
  assert.equal((intents[0].result as {customerId: string}).customerId, 'cus_concurrent');
});

test('unknown customer provisioning survives process replacement and does not invent a Stripe identity', async () => {
  let durableKey = '';
  const input = await fixture({provider: provider({async createCustomer(value) { durableKey = value.idempotencyKey; return {unknown: true}; }})});
  await assert.rejects(openCheckout(db, input), /customer.*unknown/i);
  assert.equal((await pool.query('select * from app.billing_customer_history where workspace_id=$1', [input.workspaceId])).rowCount, 0);
  const result = await openCheckout(db, {...input, provider: provider({async createCustomer(value) {
    assert.equal(value.idempotencyKey, durableKey);
    return {customerId: 'cus_recovered'};
  }})});
  assert.equal(result.status, 'open');
  assert.equal((await attempts(input.workspaceId))[0].customer_id, 'cus_recovered');
});

test('expired unknown customer intent fails closed beyond provider retention', async () => {
  let calls = 0;
  const input = await fixture({provider: provider({async createCustomer() { calls++; return {unknown: true}; }})});
  await assert.rejects(openCheckout(db, input));
  await assert.rejects(openCheckout(db, {...input, now: new Date(now.getTime() + 24 * 3600_000)}), /reconcil|retention/i);
  assert.equal(calls, 1);
});

test('stale owner cannot bind a customer after the remote provisioning call', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let sessions = 0;
  const input = await fixture({provider: provider({async createCustomer() {
    entered.resolve(); await release.promise; return {customerId: 'cus_staleowner'};
  }, async createCheckout() { sessions++; return {sessionId: 'cs_forbidden', url: 'https://checkout.stripe.test/forbidden'}; }})});
  const pending = openCheckout(db, input);
  const rejected = assert.rejects(pending, /owner/i);
  await entered.promise;
  await pool.query("update app.workspace_members set role='member' where workspace_id=$1 and user_id=$2", [input.workspaceId, input.actor.userId]);
  release.resolve();
  await rejected;
  assert.equal(sessions, 0);
  assert.equal((await pool.query('select * from app.billing_customer_history where workspace_id=$1', [input.workspaceId])).rowCount, 0);
  await assert.rejects(openCheckout(db, input), /owner/i);
});

test('Checkout retries retain immutable catalog, customer and provider key across config and customer changes', async () => {
  const requests: unknown[] = [];
  const input = await fixture({provider: provider({async createCheckout(value) {
    requests.push(value);
    return requests.length === 1 ? {unknown: true} : {sessionId: 'cs_recovered', url: 'https://checkout.stripe.test/recovered'};
  }})});
  assert.equal((await openCheckout(db, input)).status, 'unknown');
  await replaceCustomer(db, {workspaceId: input.workspaceId, provider: 'stripe', customerId: 'cus_replacement', reason: 'Audited test replacement', now});
  const result = await openCheckout(db, {...input, snapshotBillingProduct: () => { throw new Error('Current catalog must not be consulted on replay.'); }});
  assert.equal(result.sessionId, 'cs_recovered');
  assert.deepEqual(requests[1], requests[0]);
  assert.equal((await pool.query('select * from app.billing_customer_history where workspace_id=$1', [input.workspaceId])).rowCount, 2);
});

test('known Stripe session replays retrieve provider URL and preserve identity on late unknown', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let calls = 0;
  const input = await fixture({provider: provider({async createCheckout() {
    calls++;
    if (calls === 1) { entered.resolve(); await release.promise; return {unknown: true}; }
    return {sessionId: 'cs_monotonic', url: 'https://checkout.stripe.test/original'};
  }, async retrieveCheckout(value) {
    assert.equal(value.sessionId, 'cs_monotonic');
    return {sessionId: value.sessionId, url: 'https://checkout.stripe.test/refreshed', status: 'open'};
  }})});
  const late = openCheckout(db, input);
  await entered.promise;
  const known = await openCheckout(db, input);
  assert.equal(known.sessionId, 'cs_monotonic');
  release.resolve();
  assert.equal((await late).sessionId, 'cs_monotonic');
  const replay = await openCheckout(db, input);
  assert.equal(replay.checkoutUrl, 'https://checkout.stripe.test/refreshed');
  assert.equal((await attempts(input.workspaceId))[0].status, 'open');
});

test('late unknown customer response cannot erase a concurrent successful provisioning result', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let calls = 0;
  const input = await fixture({provider: provider({async createCustomer() {
    if (++calls === 1) { entered.resolve(); await release.promise; return {unknown: true}; }
    return {customerId: 'cus_known'};
  }})});
  const late = openCheckout(db, input);
  await entered.promise;
  const known = await openCheckout(db, input);
  release.resolve();
  assert.equal((await late).sessionId, known.sessionId);
  assert.equal((await attempts(input.workspaceId))[0].customer_id, 'cus_known');
});

test('local timeout never releases recurring slot; only provider expiry permits replacement', async () => {
  let expired = false;
  const input = await fixture({catalogProductKey: 'test-subscription', snapshotBillingProduct: () => snapshot('subscription'),
    provider: provider({async retrieveCheckout(value) {
      return {sessionId: value.sessionId, url: expired ? null : 'https://checkout.stripe.test/open', status: expired ? 'expired' : 'open'};
    }})});
  await openCheckout(db, input);
  const later = {...input, now: new Date(now.getTime() + 2 * 3600_000)};
  await assert.rejects(openCheckout(db, {...later, idempotencyKey: 'second-recurring'}), /pending|recurring/i);
  assert.equal((await openCheckout(db, later)).status, 'open');
  expired = true;
  assert.equal((await openCheckout(db, later)).status, 'expired');
  assert.equal((await openCheckout(db, {...later, idempotencyKey: 'replacement-recurring'})).status, 'open');
});

test('unknown Checkout cannot be recreated after idempotency retention and still occupies recurring slot', async () => {
  let calls = 0;
  const input = await fixture({catalogProductKey: 'test-subscription', snapshotBillingProduct: () => snapshot('subscription'),
    provider: provider({async createCheckout() { calls++; return {unknown: true}; }})});
  await openCheckout(db, input);
  const later = {...input, now: new Date(now.getTime() + 24 * 3600_000)};
  assert.equal((await openCheckout(db, later)).status, 'unknown');
  assert.equal(calls, 1);
  await assert.rejects(openCheckout(db, {...later, idempotencyKey: 'replacement'}), /pending|recurring/i);
});

test('concurrent distinct recurring commands create only one remote Checkout', async () => {
  let calls = 0;
  const input = await fixture({catalogProductKey: 'test-subscription', snapshotBillingProduct: () => snapshot('subscription'),
    provider: provider({async createCheckout(value) { calls++; return {sessionId: `cs_${value.attemptId}`, url: 'https://checkout.stripe.test/concurrent'}; }})});
  const results = await Promise.allSettled([openCheckout(db, input), openCheckout(db, {...input, idempotencyKey: 'another'})]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(calls, 1);
  assert.equal((await attempts(input.workspaceId)).length, 1);
});

test('Stripe portal uses real current customer during hold and an immutable server return URL', async () => {
  const input = await fixture();
  await openCheckout(db, input);
  await pool.query("update app.billing_accounts set status='hold',hold_reason='recovery' where workspace_id=$1", [input.workspaceId]);
  let calls = 0;
  const remote = provider({async createPortal(value) {
    calls++;
    assert.match(value.customerId, /^cus_/);
    assert.equal(value.returnUrl, 'https://app.example.test/dashboard');
    return {url: 'https://billing.stripe.test/real'};
  }});
  const portalInput = {...input, provider: remote, appUrl: 'https://app.example.test'};
  const portal = await openBillingPortal(db, portalInput);
  assert.equal(portal.provider, 'stripe');
  assert.equal(portal.portalUrl, 'https://billing.stripe.test/real');
  assert.equal((await openBillingPortal(db, portalInput)).replayed, true);
  assert.equal(calls, 1);
  await pool.query("update app.workspace_members set role='member' where workspace_id=$1", [input.workspaceId]);
  await assert.rejects(openBillingPortal(db, portalInput), /owner/i);
});

test('invalid command identity, member and billing hold fail before customer provisioning', async () => {
  let calls = 0;
  const input = await fixture({provider: provider({async createCustomer() { calls++; return {customerId: 'cus_shouldnotexist'}; }})});
  await assert.rejects(openCheckout(db, {...input, idempotencyKey: ''}), /Idempotency/i);
  assert.equal(calls, 0);
  await pool.query("update app.workspace_members set role='member' where workspace_id=$1", [input.workspaceId]);
  await assert.rejects(openCheckout(db, input), /owner/i);
  await pool.query("update app.workspace_members set role='owner' where workspace_id=$1", [input.workspaceId]);
  await pool.query("update app.billing_accounts set status='hold',hold_reason='recovery' where workspace_id=$1", [input.workspaceId]);
  await assert.rejects(openCheckout(db, input), /hold/i);
  assert.equal(calls, 0);
});

test('portal without a current Stripe customer never creates a synthetic mapping', async () => {
  let calls = 0;
  const input = await fixture({provider: provider({async createPortal() { calls++; return {url: 'https://billing.stripe.test/unexpected'}; }})});
  await assert.rejects(openBillingPortal(db, {...input, appUrl: 'https://app.example.test'}), /customer/i);
  assert.equal(calls, 0);
  assert.equal((await pool.query('select * from app.billing_customer_history where workspace_id=$1', [input.workspaceId])).rowCount, 0);
});

test('known Checkout retrieval unknown or conflicting identity preserves the accepted session', async () => {
  const input = await fixture();
  const known = await openCheckout(db, input);
  const unknown = await openCheckout(db, {...input, provider: provider({async retrieveCheckout() { return {unknown: true}; }})});
  assert.equal(unknown.sessionId, known.sessionId);
  assert.equal(unknown.checkoutUrl, known.checkoutUrl);
  assert.equal(unknown.status, 'open');
  await assert.rejects(openCheckout(db, {...input, provider: provider({async retrieveCheckout() {
    return {sessionId: 'cs_wrong', url: null, status: 'expired'};
  }})}), /conflicting/i);
  assert.equal((await attempts(input.workspaceId))[0].stripe_session_id, known.sessionId);
  assert.equal((await attempts(input.workspaceId))[0].status, 'open');
});

test('paid session retrieval leaves recurring slot until canonical payment reconciliation', async () => {
  const input = await fixture({catalogProductKey: 'test-subscription', snapshotBillingProduct: () => snapshot('subscription')});
  await openCheckout(db, input);
  const paidObservation = {...input, provider: provider({async retrieveCheckout(value) { return {sessionId: value.sessionId, url: null, status: 'paid'}; }})};
  assert.equal((await openCheckout(db, paidObservation)).status, 'open');
  await assert.rejects(openCheckout(db, {...paidObservation, idempotencyKey: 'premature-replacement'}), /pending|recurring/i);
});

test('portal lost response retries stored customer and return origin after configuration changes', async () => {
  let original: unknown;
  const input = await fixture();
  await openCheckout(db, input);
  const first = {...input, appUrl: 'https://app.example.test', provider: provider({async createPortal(value) {
    original = value;
    throw new Error('Remote response lost');
  }})};
  await assert.rejects(openBillingPortal(db, first), /lost/);
  await replaceCustomer(db, {workspaceId: input.workspaceId, provider: 'stripe', customerId: 'cus_portalreplacement', reason: 'Audited portal test', now});
  const result = await openBillingPortal(db, {...first, appUrl: 'https://changed.example.test', provider: provider({async createPortal(value) {
    assert.deepEqual(value, original);
    return {url: 'https://billing.stripe.test/recovered'};
  }})});
  assert.equal(result.portalUrl, 'https://billing.stripe.test/recovered');
});
