import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {after, before, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../src/db/schema/index.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import {processStripeTestDelivery} from '../../src/modules/billing/stripe-test-inbox.ts';
import {reconcileStripeTestEvent} from '../../src/modules/billing/stripe-test-reconciliation.ts';
import {parseBillingCatalogSnapshot} from '../../src/modules/billing/contracts.ts';
import {semanticHash} from '../../src/contracts/http.ts';
import type {createStripeTestEventMapper, StripeTestEventHint} from '../../src/adapters/billing/stripe-test-events.ts';

const name = `shpitto_stripe_inbox_${randomUUID().replaceAll('-', '')}`;
let admin: Client;
let pool: Pool;
let db: AppDatabase;
let created = false;
before(async () => {
  const url = new URL(process.env.STRIPE_INBOX_TEST_ADMIN_DATABASE_URL ?? 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && ['55432', '55433'].includes(url.port), 'Only a disposable local database is permitted.');
  admin = new Client({connectionString: url.toString(), connectionTimeoutMillis: 3000});
  await admin.connect();
  await admin.query(`create database "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  pool = new Pool({connectionString: url.toString()});
  await pool.query(await readFile('src/db/legacy-credit-baseline.sql', 'utf8'));
  db = drizzle(pool, {schema});
  await migrate(db, {migrationsFolder: 'src/db/migrations'});
});
after(async () => {
  await pool?.end();
  if (created) await admin.query(`drop database "${name}" with (force)`);
  await admin?.end();
});
function receipt() {return {eventId: `evt_${randomUUID()}`, eventType: 'checkout.session.completed', objectId: 'cs_test_example', payloadHash: 'a'.repeat(64)};}

test('processed redelivery never executes an economic callback twice', async () => {
  const input = receipt();
  let calls = 0;
  const process = async () => {calls++; return [];};
  assert.equal((await processStripeTestDelivery(db, {...input, process})).duplicate, false);
  assert.equal((await processStripeTestDelivery(db, {...input, process})).duplicate, true);
  assert.equal(calls, 1);
  assert.equal((await pool.query('select status from app.billing_webhook_inbox where external_event_id=$1', [input.eventId])).rows[0].status, 'processed');
});

test('failed delivery is retryable, while changed payload cannot reuse event identity', async () => {
  const input = receipt();
  await assert.rejects(processStripeTestDelivery(db, {...input, process: async () => {throw new Error('temporary');}}), /temporary/);
  assert.equal((await processStripeTestDelivery(db, {...input, process: async () => []})).duplicate, false);
  await assert.rejects(processStripeTestDelivery(db, {...input, payloadHash: 'b'.repeat(64), process: async () => []}), /different payload/);
});

test('in-flight duplicate requests receive retryable failure until durable processing finishes', async () => {
  const input = receipt();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => {started = resolve;});
  const blocked = new Promise<void>(resolve => {release = resolve;});
  const first = processStripeTestDelivery(db, {...input, process: async () => {started(); await blocked; return [];}});
  await entered;
  try {await assert.rejects(processStripeTestDelivery(db, {...input, process: async () => []}), /still being processed/);}
  finally {release();}
  await first;
  assert.equal((await processStripeTestDelivery(db, {...input, process: async () => []})).duplicate, true);
});

test('stale processing can resume and the receipt excludes untrusted metadata', async () => {
  const input = receipt();
  const now = new Date();
  await pool.query("insert into app.billing_webhook_inbox (id,provider,external_event_id,event_type,payload_hash,payload,status,received_at) values ($1,'stripe',$2,$3,$4,'{}','received',$5)", [randomUUID(), input.eventId, input.eventType, input.payloadHash, new Date(now.getTime() - 121000)]);
  assert.equal((await processStripeTestDelivery(db, {...input, now, process: async () => []})).duplicate, false);
});

test('the application resolves immutable terms, commits its claim before fetch, and grants only once', async () => {
  const workspaceId = randomUUID();
  const userId = `inbox-${randomUUID()}`;
  const customerId = `cus_${randomUUID().replaceAll('-', '')}`;
  const sessionId = `cs_test_${randomUUID().replaceAll('-', '')}`;
  const terms = {catalogVersion: 1, productKey: 'stored-pack', kind: 'pack', interval: null, credits: '250', amountMinor: '900', currency: 'usd', creditExpiry: 'never', provider: 'stripe', priceReference: 'price_stored'};
  const snapshot = parseBillingCatalogSnapshot({...terms, snapshotHash: semanticHash('billing.catalog.snapshot', terms)});
  await pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,now(),now())', [userId, `${userId}@example.test`]);
  await pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Inbox test',$2,now(),now())", [workspaceId, userId]);
  await pool.query('insert into app.billing_accounts (workspace_id,created_at,updated_at) values ($1,now(),now())', [workspaceId]);
  await pool.query('insert into app.credit_accounts (workspace_id,created_at,updated_at) values ($1,now(),now())', [workspaceId]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'stripe',$2,now(),'Test binding')", [workspaceId, customerId]);
  await pool.query("insert into app.billing_checkout_attempts (id,workspace_id,provider,customer_id,kind,catalog_snapshot,stripe_session_id,idempotency_key,status,created_at,updated_at) values ($1,$2,'stripe',$3,'pack',$4,$5,$6,'open',now(),now())", [randomUUID(), workspaceId, customerId, snapshot, sessionId, randomUUID()]);
  const hint: StripeTestEventHint = {eventId: 'evt_app_pack', eventType: 'checkout.session.completed', objectId: sessionId, objectType: 'checkout.session', livemode: false};
  let fetched = 0;
  const mapper = {
    discoverIdentity: async () => ({provider: 'stripe', hint, customerId, checkoutSessionId: sessionId}),
    normalize: async (_discovery, binding, fence) => {
      fetched++;
      assert.equal(binding.catalogSnapshot.snapshotHash, snapshot.snapshotHash);
      const claim = (await pool.query('select reconciliation_lease_token from app.billing_accounts where workspace_id=$1', [workspaceId])).rows[0];
      assert.equal(claim.reconciliation_lease_token, fence.token);
      return [{provider: 'stripe', eventId: hint.eventId, eventType: 'checkout.completed', workspaceId, customerId, checkoutSessionId: sessionId,
        paymentIntentId: 'pi_apppack', chargeId: 'ch_apppack', amountMinor: '900', currency: 'usd', paidAt: new Date(Date.now() - 1000).toISOString(),
        stripe: {supported: true, priceReference: 'price_stored', paymentAmountMinor: '900'}, fence}];
    },
    normalizeSubscription: async () => null,
  } satisfies Pick<ReturnType<typeof createStripeTestEventMapper>, 'discoverIdentity' | 'normalize' | 'normalizeSubscription'>;
  const fullMapper = {...mapper, discover: mapper.discoverIdentity};
  assert.equal((await reconcileStripeTestEvent(db, {hint, mapper: fullMapper}))[0]!.status, 'paid');
  assert.equal((await reconcileStripeTestEvent(db, {hint, mapper: fullMapper}))[0]!.status, 'duplicate');
  assert.equal(fetched, 2);
  assert.equal((await pool.query('select * from app.credit_grants where workspace_id=$1', [workspaceId])).rowCount, 1);
  assert.equal((await pool.query('select reconciliation_lease_token from app.billing_accounts where workspace_id=$1', [workspaceId])).rows[0].reconciliation_lease_token, null);

  // A provider webhook can beat persistence of the Checkout create response.
  await pool.query("insert into app.billing_checkout_attempts (id,workspace_id,provider,customer_id,kind,catalog_snapshot,idempotency_key,status,created_at,updated_at) values ($1,$2,'stripe',$3,'pack',$4,$5,'creating',now(),now())", [randomUUID(), workspaceId, customerId, snapshot, randomUUID()]);
  const earlyHint = {...hint, eventId: 'evt_early_binding'};
  const earlyMapper = {...fullMapper, discoverIdentity: async () => ({provider: 'stripe' as const, hint: earlyHint, customerId, checkoutSessionId: 'cs_test_pending'})};
  await assert.rejects(reconcileStripeTestEvent(db, {hint: earlyHint, mapper: earlyMapper}), /purchase binding.*pending/);
  const account = (await pool.query('select status,reconciliation_lease_token from app.billing_accounts where workspace_id=$1', [workspaceId])).rows[0];
  assert.equal(account.status, 'active');
  assert.equal(account.reconciliation_lease_token, null);

  const refundHint = {...hint, eventId: 'evt_multiple_refunds', eventType: 'charge.refunded' as const, objectType: 'charge', objectId: 'ch_apppack'};
  const refundMapper: ReturnType<typeof createStripeTestEventMapper> = {...fullMapper,
    normalize: async (_discovery, _binding, fence, selection) => {
      if (selection?.refundId) throw new Error('second read failed');
      return ['re_first', 're_second'].map(refundId => ({provider: 'stripe', eventId: refundHint.eventId, eventType: 'charge.refunded', workspaceId,
        customerId, checkoutSessionId: sessionId, paymentIntentId: 'pi_apppack', chargeId: 'ch_apppack', amountMinor: '100', currency: 'usd', refundId,
        stripe: {supported: true, priceReference: 'price_stored', paymentAmountMinor: '900'}, fence}));
    },
  };
  await assert.rejects(reconcileStripeTestEvent(db, {hint: refundHint, mapper: refundMapper}), /second read failed/);
  assert.equal((await pool.query('select reconciliation_lease_token from app.billing_accounts where workspace_id=$1', [workspaceId])).rows[0].reconciliation_lease_token, null);
  assert.equal((await pool.query('select * from app.billing_cash_events where workspace_id=$1', [workspaceId])).rowCount, 1);
});
