import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, test} from 'node:test';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {semanticHash} from '../../src/contracts/http.ts';
import type {AppDatabase} from '../../src/db/client.ts';
import * as schema from '../../src/db/schema/index.ts';
import {snapshotBillingProduct} from '../../src/config/plans.ts';
import {parseBillingCatalogSnapshot} from '../../src/modules/billing/contracts.ts';
import {reconcilePayment, type PaymentObservation} from '../../src/modules/billing/reconcile-payment.ts';
import {claimReconciliation, resolveReconciliationScope} from '../../src/modules/billing/reconciliation-fence.ts';
import {markSubscriptionCanceled, mirrorSubscription} from '../../src/modules/billing/subscriptions.ts';

// No env files, application database factory, hosted databases, or provider calls.
const databaseName = `shpitto_stripe_reconcile_${randomUUID().replaceAll('-', '')}`;
let admin: Client;
let pool: Pool;
let db: AppDatabase;
let created = false;
let databaseUrl: string;
const now = new Date('2026-10-20T12:00:00Z');
before(async () => {
  const url = new URL(process.env.STRIPE_RECONCILIATION_TEST_ADMIN_DATABASE_URL ?? 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres');
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

function catalog(kind: 'subscription' | 'pack' = 'subscription') {
  const payload = {catalogVersion: 1, productKey: `approved-${kind}`, kind, interval: kind === 'subscription' ? 'month' : null,
    credits: '1000', amountMinor: '2500', currency: 'usd', creditExpiry: kind === 'subscription' ? 'service_period_end' : 'never',
    provider: 'stripe', priceReference: 'price_approved'};
  return parseBillingCatalogSnapshot({...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)});
}

async function fixture(kind: 'subscription' | 'pack' = 'subscription', provider: 'stripe' | 'fixture' = 'stripe') {
  const workspaceId = randomUUID();
  const userId = `reconcile-${randomUUID()}`;
  const customerId = `cus_${randomUUID().replaceAll('-', '')}`;
  const checkoutSessionId = `cs_${randomUUID()}`;
  const snapshot = provider === 'stripe' ? catalog(kind) : snapshotBillingProduct('fixture-pack', 'local');
  await pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,true,now(),now())', [userId, `${userId}@example.test`]);
  await pool.query("insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Reconcile fixture',$2,now(),now())", [workspaceId, userId]);
  await pool.query("insert into app.workspace_members (workspace_id,user_id,role,created_at) values ($1,$2,'owner',now())", [workspaceId, userId]);
  await pool.query('insert into app.billing_accounts (workspace_id,created_at,updated_at) values ($1,now(),now())', [workspaceId]);
  await pool.query('insert into app.credit_accounts (workspace_id,created_at,updated_at) values ($1,now(),now())', [workspaceId]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,$2,$3,$4,'Test binding')", [workspaceId, provider, customerId, now]);
  await pool.query("insert into app.billing_checkout_attempts (id,workspace_id,provider,customer_id,kind,catalog_snapshot,stripe_session_id,idempotency_key,status,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$9)", [randomUUID(), workspaceId, provider, customerId, snapshot.kind, snapshot, checkoutSessionId, randomUUID(), now]);
  const input: PaymentObservation = {provider, workspaceId, customerId, checkoutSessionId, eventId: `evt_${randomUUID()}`, eventType: 'invoice.paid', invoiceId: `in_${randomUUID()}`,
    paymentIntentId: `pi_${randomUUID()}`, chargeId: `ch_${randomUUID()}`, externalSubscriptionId: `sub_${randomUUID()}`,
    amountMinor: snapshot.amountMinor, currency: 'usd', periodStart: '2026-10-20T00:00:00Z', periodEnd: '2026-11-20T00:00:00Z',
    stripe: {supported: true, priceReference: snapshot.priceReference, paymentAmountMinor: snapshot.amountMinor, billingReason: 'subscription_create'}};
  return {workspaceId, customerId, checkoutSessionId, snapshot, input};
}

async function apply(input: PaymentObservation, at = now) {
  const workspaceId = await resolveReconciliationScope(db, input);
  const fence = await claimReconciliation(db, {workspaceId, owner: 'test-mapper', now: at});
  return reconcilePayment(db, {...input, fence}, at);
}

async function rows(table: 'credit_grants' | 'billing_orders' | 'billing_cash_events' | 'billing_reconciliation_cases', workspaceId: string) {
  return (await pool.query(`select * from app.${table} where workspace_id=$1`, [workspaceId])).rows;
}

test('fixture defaults still reconcile and deduplicate without Stripe evidence or a fence', async () => {
  const f = await fixture('pack', 'fixture');
  const input = {...f.input, stripe: undefined, externalSubscriptionId: undefined};
  const first = await reconcilePayment(db, input, now);
  assert.equal(first.status, 'paid');
  assert.equal((await reconcilePayment(db, {...input, eventId: 'evt_fixture_alias', eventType: 'payment_intent.succeeded'}, now)).grantId, first.grantId);
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 1);
});

test('invoice, Checkout, and intent aliases converge; renewal invoice gets a distinct grant and original expiry', async () => {
  const f = await fixture();
  const first = await apply(f.input);
  assert.equal(first.status, 'paid');
  const duplicate = await apply({...f.input, eventId: 'evt_checkout_alias', eventType: 'checkout.completed'});
  assert.equal(duplicate.grantId, first.grantId);
  const intent = await apply({...f.input, eventId: 'evt_intent_alias', eventType: 'payment_intent.succeeded', checkoutSessionId: undefined});
  assert.equal(intent.grantId, first.grantId);
  const renewal = {...f.input, eventId: 'evt_renewal', invoiceId: 'in_renewal', paymentIntentId: 'pi_renewal', chargeId: 'ch_renewal', periodStart: '2026-11-20T00:00:00Z', periodEnd: '2026-12-20T00:00:00Z', stripe: {...f.input.stripe!, billingReason: 'subscription_cycle' as const}};
  const next = await apply(renewal);
  assert.equal(next.status, 'paid');
  assert.notEqual(next.grantId, first.grantId);
  assert.equal((await apply({...renewal, eventId: 'evt_renewal_replay'})).grantId, next.grantId);
  const grants = await rows('credit_grants', f.workspaceId);
  assert.deepEqual(grants.map((row) => (row.expires_at as Date).toISOString()).sort(), ['2026-11-20T00:00:00.000Z', '2026-12-20T00:00:00.000Z']);
  assert.equal((await rows('billing_orders', f.workspaceId)).length, 2);
  assert.equal((await pool.query("select * from app.billing_payment_aliases where workspace_id=$1 and object_kind='checkout_session'", [f.workspaceId])).rowCount, 1);
});

test('historical bound subscription renews and mirrors after current customer replacement', async () => {
  const f = await fixture();
  await apply(f.input);
  await pool.query('update app.billing_customer_history set valid_until=$2 where workspace_id=$1', [f.workspaceId, now]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,previous_customer_id,valid_from,change_reason) values ($1,'stripe',$2,$3,$4,'Audited replacement')", [f.workspaceId, `cus_new_${f.workspaceId}`, f.customerId, now]);
  const renewed = await apply({...f.input, workspaceId: undefined, checkoutSessionId: undefined, eventId: 'evt_history', invoiceId: 'in_history', paymentIntentId: undefined, chargeId: undefined, periodStart: '2026-11-20T00:00:00Z', periodEnd: '2026-12-20T00:00:00Z', stripe: {...f.input.stripe!, billingReason: 'subscription_cycle'}});
  assert.equal(renewed.status, 'paid');
  const fence = await claimReconciliation(db, {workspaceId: f.workspaceId, owner: 'lifecycle', now});
  const mirror = await mirrorSubscription(db, {workspaceId: f.workspaceId, provider: 'stripe', externalId: f.input.externalSubscriptionId!, customerId: f.customerId, catalogSnapshot: f.snapshot, status: 'active', cancelAtPeriodEnd: true, fence, now});
  assert.equal(mirror?.cancelAtPeriodEnd, true);
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 2);
});

test('missing service period is a durable hold with no grant, never a perpetual subscription grant', async () => {
  const f = await fixture();
  assert.equal((await apply({...f.input, periodEnd: undefined})).status, 'held');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
  assert.equal((await rows('billing_reconciliation_cases', f.workspaceId)).length, 1);
  assert.equal((await pool.query('select status from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0].status, 'hold');
});

test('a claim commits before remote work and a newer generation or expired lease rejects old apply atomically', async () => {
  const f = await fixture();
  const stale = await claimReconciliation(db, {workspaceId: f.workspaceId, owner: 'old-fetch', now, leaseMs: 1000});
  // Another connection can acquire the locks while the caller would be fetching Stripe.
  const client = new Client({connectionString: databaseUrl});
  await client.connect();
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='500ms'");
    await client.query('select * from app.workspaces where id=$1 for update', [f.workspaceId]);
    await client.query('select * from app.billing_accounts where workspace_id=$1 for update', [f.workspaceId]);
    await client.query('rollback');
  } finally { await client.end(); }
  const later = new Date(now.getTime() + 2000);
  const fresh = await claimReconciliation(db, {workspaceId: f.workspaceId, owner: 'new-fetch', now: later});
  await assert.rejects(reconcilePayment(db, {...f.input, fence: stale}, later), /fence|lease|stale/i);
  assert.equal((await rows('billing_orders', f.workspaceId)).length, 0);
  assert.equal((await reconcilePayment(db, {...f.input, fence: fresh}, later)).status, 'paid');
  await assert.rejects(reconcilePayment(db, {...f.input, fence: fresh}, new Date(later.getTime() + 60_001)), /fence|lease|stale/i);
});

test('refund-before-paid persists cash evidence and late failed/paid deliveries cannot restore entitlement', async () => {
  const f = await fixture();
  assert.equal((await apply({...f.input, eventId: 'evt_refund_first', eventType: 'charge.refunded', refundId: 're_before_paid'})).status, 'recovery');
  assert.equal((await apply({...f.input, eventId: 'evt_failed_late', eventType: 'payment.failed'})).status, 'held');
  assert.equal((await apply(f.input)).status, 'held');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
  const cash = await rows('billing_cash_events', f.workspaceId);
  assert.equal(cash.length, 1);
  assert.equal(cash[0].amount_minor, '2500');
  assert.ok(['held', 'refunded'].includes((await rows('billing_orders', f.workspaceId))[0].status as string));
});

test('Stripe needs a fence, persisted catalog binding, verified amounts, currency, and supported paid semantics', async () => {
  const missingFence = await fixture();
  await assert.rejects(reconcilePayment(db, missingFence.input, now), /fence/i);
  for (const update of [{stripe: undefined}, {amountMinor: undefined}, {currency: undefined}, {currency: 'eur'}, {stripe: {...missingFence.input.stripe!, priceReference: 'price_wrong'}}, {stripe: {...missingFence.input.stripe!, supported: false}}]) {
    const f = await fixture();
    assert.equal((await apply({...f.input, ...update})).status, 'held');
    assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
  }
  const unbound = await fixture();
  assert.equal((await apply({...unbound.input, checkoutSessionId: undefined, externalSubscriptionId: undefined, productKey: 'fixture-pack'})).status, 'held');
  assert.equal((await rows('billing_orders', unbound.workspaceId)).length, 0);
});

test('a verified canonical paid observation resolves only matching unverified paid cases and releases holds when none remain', async () => {
  const f = await fixture();
  const unverified = {...f.input, stripe: {...f.input.stripe!, supported: false}};
  assert.equal((await apply(unverified)).status, 'held');
  const opened = await rows('billing_reconciliation_cases', f.workspaceId);
  assert.equal(opened.length, 1);
  assert.equal(opened[0]!.status, 'open');
  assert.equal((await pool.query('select status from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0]!.status, 'hold');

  const paid = await apply({...f.input, eventId: 'evt_verified_paid_after_hold', eventType: 'payment_intent.succeeded'});
  assert.equal(paid.status, 'paid');
  const resolved = await rows('billing_reconciliation_cases', f.workspaceId);
  assert.equal(resolved[0]!.status, 'resolved');
  assert.ok(resolved[0]!.resolved_at instanceof Date);
  assert.equal((await pool.query('select status, hold_reason from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0]!.status, 'active');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 1);

  const g = await fixture();
  assert.equal((await apply({...g.input, stripe: {...g.input.stripe!, supported: false}})).status, 'held');
  await pool.query(
    "insert into app.billing_reconciliation_cases (id,workspace_id,provider,external_reference,reason,payload,status,created_at) values ($1,$2,'stripe','evt_unrelated_manual_review','manual-review',$3,'open',$4)",
    [randomUUID(), g.workspaceId, {eventType: 'payment.failed'}, now],
  );
  assert.equal((await apply({...g.input, eventId: 'evt_verified_paid_with_other_case'})).status, 'paid');
  const remaining = await rows('billing_reconciliation_cases', g.workspaceId);
  assert.deepEqual(remaining.map(row => [row.reason, row.status]).sort(), [
    ['Stripe paid semantics, price, amount, or currency are unverified.', 'resolved'],
    ['manual-review', 'open'],
  ].sort());
  const account = (await pool.query('select status, hold_reason from app.billing_accounts where workspace_id=$1', [g.workspaceId])).rows[0]!;
  assert.equal(account.status, 'hold');
  assert.equal(account.hold_reason, 'Stripe paid semantics, price, amount, or currency are unverified.');
});

test('second external subscription produces a recovery hold instead of losing evidence to uniqueness rollback', async () => {
  const f = await fixture();
  await apply(f.input);
  const second = await apply({...f.input, eventId: 'evt_second', externalSubscriptionId: 'sub_unexpected', invoiceId: 'in_second', paymentIntentId: 'pi_second', chargeId: undefined, stripe: {...f.input.stripe!, billingReason: 'subscription_cycle'}});
  assert.equal(second.status, 'held');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 1);
  assert.ok((await rows('billing_reconciliation_cases', f.workspaceId)).length > 0);
});

test('scope rejects forged workspace/customer hints and lifecycle requires a live matching fence', async () => {
  const a = await fixture();
  const b = await fixture();
  await assert.rejects(resolveReconciliationScope(db, {...a.input, workspaceId: b.workspaceId}), /mapping|workspace|binding/i);
  await assert.rejects(resolveReconciliationScope(db, {...a.input, customerId: b.customerId}), /mapping|customer|binding/i);
  const lifecycle = {workspaceId: a.workspaceId, provider: 'stripe' as const, externalId: a.input.externalSubscriptionId!, customerId: a.customerId, catalogSnapshot: a.snapshot, status: 'active' as const, checkoutSessionId: a.checkoutSessionId, now};
  await assert.rejects(mirrorSubscription(db, lifecycle), /fence/i);
  const fence = await claimReconciliation(db, {workspaceId: a.workspaceId, owner: 'lifecycle', now});
  await mirrorSubscription(db, {...lifecycle, fence});
  await assert.rejects(markSubscriptionCanceled(db, {workspaceId: a.workspaceId, provider: 'stripe', externalId: lifecycle.externalId, now}), /fence/i);
  assert.equal((await rows('credit_grants', a.workspaceId)).length, 0);
});

test('equal periods cannot merge distinct invoices or extend the original grant expiry', async () => {
  const f = await fixture();
  const paid = await apply(f.input);
  const samePeriod = await apply({...f.input, checkoutSessionId: undefined, eventId: 'evt_same_period', invoiceId: 'in_same_period', paymentIntentId: undefined, chargeId: undefined, stripe: {...f.input.stripe!, billingReason: 'subscription_cycle'}});
  assert.equal(samePeriod.status, 'held');
  assert.equal(samePeriod.orderId, null);
  assert.equal((await pool.query("select * from app.billing_payment_aliases where workspace_id=$1 and external_id='in_same_period'", [f.workspaceId])).rowCount, 0);
  assert.equal((await rows('billing_orders', f.workspaceId)).length, 1);
  assert.ok(paid.grantId);
  const conflict = await apply({...f.input, eventId: 'evt_period_changed', periodEnd: '2026-12-20T00:00:00Z'});
  assert.equal(conflict.status, 'held');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 1);
  assert.equal(((await rows('credit_grants', f.workspaceId))[0].expires_at as Date).toISOString(), '2026-11-20T00:00:00.000Z');
});

test('recovery without its original period retains cash and blocks later complete paid evidence', async () => {
  for (const amountMinor of ['2500', '500']) {
    const f = await fixture();
    const refund = {...f.input, eventId: `evt_missing_period_${amountMinor}`, eventType: 'charge.refunded' as const,
      refundId: `re_missing_period_${amountMinor}`, amountMinor, periodStart: undefined, periodEnd: undefined};
    await apply(refund);
    const cash = await rows('billing_cash_events', f.workspaceId);
    assert.equal(cash.length, 1);
    assert.equal(cash[0].external_id, refund.refundId);
    assert.equal(cash[0].amount_minor, amountMinor);
    assert.equal((await apply({...refund, eventId: `${refund.eventId}_retry`})).status, 'duplicate');
    assert.equal((await apply(f.input)).status, 'held');
    assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
    assert.equal((await rows('billing_orders', f.workspaceId)).length, 1);
    assert.ok((await rows('billing_reconciliation_cases', f.workspaceId)).length > 0);
    assert.equal((await pool.query('select status from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0].status, 'hold');
  }
});

test('unsupported recovery keeps its monetary evidence and blocks paid through a matching canonical alias', async () => {
  const f = await fixture();
  const refund = {...f.input, eventId: 'evt_unsupported_recovery', eventType: 'charge.refunded' as const,
    refundId: 're_unsupported_recovery', amountMinor: '500', periodEnd: undefined, stripe: {...f.input.stripe!, supported: false}};
  assert.equal((await apply(refund)).status, 'held');
  const cases = await rows('billing_reconciliation_cases', f.workspaceId);
  assert.equal(cases.length, 1);
  assert.equal((cases[0].payload as PaymentObservation).refundId, refund.refundId);
  assert.equal((cases[0].payload as PaymentObservation).amountMinor, '500');
  // No unverified amount is promoted into the confirmed cash ledger.
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 0);
  assert.equal((await apply({...f.input, chargeId: undefined})).status, 'held');
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
});

test('historical refunds preserve their original order while an unrelated replacement subscription is active', async () => {
  const f = await fixture();
  const original = await apply(f.input);
  await pool.query("update app.billing_subscriptions set status='canceled' where workspace_id=$1", [f.workspaceId]);
  const customerId = `cus_replacement_${randomUUID()}`;
  const checkoutSessionId = `cs_replacement_${randomUUID()}`;
  await pool.query('update app.billing_customer_history set valid_until=$2 where workspace_id=$1', [f.workspaceId, now]);
  await pool.query("insert into app.billing_customer_history (workspace_id,provider,customer_id,previous_customer_id,valid_from,change_reason) values ($1,'stripe',$2,$3,$4,'Replacement subscription')", [f.workspaceId, customerId, f.customerId, now]);
  await pool.query("insert into app.billing_checkout_attempts (id,workspace_id,provider,customer_id,kind,catalog_snapshot,stripe_session_id,idempotency_key,status,created_at,updated_at) values ($1,$2,'stripe',$3,'subscription',$4,$5,$6,'open',$7,$7)", [randomUUID(), f.workspaceId, customerId, f.snapshot, checkoutSessionId, randomUUID(), now]);
  const replacementInput = {...f.input, customerId, checkoutSessionId, eventId: 'evt_replacement', invoiceId: 'in_replacement', paymentIntentId: 'pi_replacement', chargeId: 'ch_replacement', externalSubscriptionId: 'sub_replacement'};
  const replacement = await apply(replacementInput);
  assert.equal(replacement.status, 'paid');
  const refund = {...f.input, checkoutSessionId: undefined, eventId: 'evt_historical_refund', eventType: 'charge.refunded' as const, refundId: 're_historical'};
  assert.equal((await apply(refund)).status, 'recovery');
  const cash = await rows('billing_cash_events', f.workspaceId);
  assert.equal(cash.length, 1);
  assert.equal(cash[0].order_id, original.orderId);
  assert.equal((await apply({...refund, eventId: 'evt_historical_refund_retry'})).status, 'duplicate');
  const grants = await rows('credit_grants', f.workspaceId);
  assert.equal(grants.find(row => row.id === original.grantId)!.voided, '1000');
  assert.equal(grants.find(row => row.id === replacement.grantId)!.voided, '0');
  assert.equal((await pool.query("select status from app.billing_subscriptions where external_id='sub_replacement'", [])).rows[0].status, 'active');
});

test('fresh recovery identities cannot exceed the non-replayed original order cash cap', async () => {
  const f = await fixture();
  await apply(f.input);
  const first = {...f.input, eventId: 'evt_cap_first', eventType: 'charge.refunded' as const, refundId: 're_cap_first', amountMinor: '1500'};
  assert.equal((await apply(first)).status, 'recovery');
  assert.equal((await apply({...first, eventId: 'evt_cap_replay'})).status, 'duplicate');
  await assert.rejects(apply({...first, eventId: 'evt_cap_fresh', refundId: 're_cap_fresh', amountMinor: '1500'}), /exceed.*original payment/i);
  const cash = await rows('billing_cash_events', f.workspaceId);
  assert.equal(cash.length, 1);
  assert.equal(cash[0].amount_minor, '1500');
  const order = (await rows('billing_orders', f.workspaceId))[0];
  assert.equal(order.paid_minor, '2500');
  assert.equal(order.refunded_minor, '1500');
});

test('Stripe packs use Checkout snapshots, verified discounted cash, and permanent catalog credit quantities', async () => {
  const f = await fixture('pack');
  const input = {...f.input, externalSubscriptionId: undefined, amountMinor: '2100', stripe: {...f.input.stripe!, paymentAmountMinor: '2100', billingReason: undefined}};
  const paid = await apply(input);
  assert.equal(paid.status, 'paid');
  const grant = (await rows('credit_grants', f.workspaceId))[0];
  assert.equal(grant.issued, '1000');
  assert.equal(grant.expires_at, null);
  const refund = {...input, eventId: 'evt_pack_partial', eventType: 'charge.refunded' as const, amountMinor: '500', refundId: 're_pack_partial'};
  assert.equal((await apply(refund)).status, 'recovery');
  assert.equal((await apply({...refund, eventId: 'evt_pack_partial_redelivery'})).status, 'duplicate');
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 1);
  assert.equal((await apply({...input, eventId: 'evt_pack_paid_stale'})).status, 'held');
});

test('lifecycle unsupported changes commit holds, while stale fences cannot cancel a subscription', async () => {
  const f = await fixture();
  await apply(f.input);
  const stale = await claimReconciliation(db, {workspaceId: f.workspaceId, owner: 'lifecycle-stale', now, leaseMs: 100});
  const later = new Date(now.getTime() + 101);
  const fresh = await claimReconciliation(db, {workspaceId: f.workspaceId, owner: 'lifecycle-new', now: later});
  await assert.rejects(markSubscriptionCanceled(db, {workspaceId: f.workspaceId, provider: 'stripe', externalId: f.input.externalSubscriptionId!, fence: stale, now: later}), /fence|stale/i);
  await assert.rejects(mirrorSubscription(db, {workspaceId: f.workspaceId, provider: 'stripe', externalId: 'sub_lifecycle_second', customerId: f.customerId, catalogSnapshot: f.snapshot, status: 'active', checkoutSessionId: f.checkoutSessionId, fence: fresh, now: later}), /held/i);
  assert.equal((await rows('billing_reconciliation_cases', f.workspaceId)).length, 1);
  assert.equal((await pool.query('select status from app.billing_subscriptions where workspace_id=$1', [f.workspaceId])).rows[0].status, 'active');
});

test('Stripe recovery must carry stable refund/dispute identities rather than delivery identities', async () => {
  const f = await fixture();
  await apply(f.input);
  assert.equal((await apply({...f.input, eventId: 'evt_missing_refund_identity', eventType: 'charge.refunded'})).status, 'held');
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 0);
});

test('a first dispute reversal becomes a hold without fabricating a prior loss', async () => {
  const f = await fixture();
  await apply(f.input);
  const won = {...f.input, eventId: 'evt_dispute_won_first', eventType: 'charge.dispute.reversed' as const,
    disputeId: 'du_won_first', economicLossId: 'dispute:du_won_first', relatedEventId: 'du_won_first'};
  assert.equal((await apply(won)).status, 'held');
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 0);
  const cases = await rows('billing_reconciliation_cases', f.workspaceId);
  assert.ok(cases.some(row => row.reason === 'dispute-reversal-missing-source'));
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 1);

  const opened = {...f.input, eventId: 'evt_dispute_opened_after', eventType: 'charge.dispute.created' as const,
    disputeId: 'du_won_first', economicLossId: 'dispute:du_won_first', amountMinor: '500'};
  assert.equal((await apply(opened)).status, 'recovery');
  const reversed = {...won, eventId: 'evt_dispute_won_after', amountMinor: '500'};
  assert.equal((await apply(reversed)).status, 'recovery');
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 2);
});

for (const terminalStatus of ['failed', 'canceled'] as const) {
  test(`a terminal ${terminalStatus} refund after a succeeded refund holds without changing confirmed cash`, async () => {
    const f = await fixture();
    const paid = await apply(f.input);
    assert.equal(paid.status, 'paid');

    const succeeded = {...f.input, eventId: `evt_refund_succeeded_${terminalStatus}`, eventType: 'charge.refunded' as const,
      refundId: `re_${terminalStatus}_refund`};
    assert.equal((await apply(succeeded)).status, 'recovery');
    const beforeCash = await rows('billing_cash_events', f.workspaceId);
    const beforeGrant = (await rows('credit_grants', f.workspaceId))[0]!;
    const beforeOrder = (await rows('billing_orders', f.workspaceId))[0]!;
    assert.equal(beforeCash.length, 1);
    assert.equal(beforeCash[0].status, 'confirmed');
    assert.equal(beforeCash[0].amount_minor, '2500');
    assert.equal(beforeGrant.voided, '1000');
    assert.equal(beforeOrder.status, 'refunded');

    // Mapper holding evidence for a terminal refund must become a durable hold,
    // while the earlier succeeded refund remains the only confirmed cash fact.
    const terminal = {...succeeded, eventId: `evt_refund_${terminalStatus}`, stripe: {...succeeded.stripe!, supported: false}};
    assert.equal((await apply(terminal)).status, 'held');
    assert.equal((await pool.query('select status from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0].status, 'hold');

    const afterCash = await rows('billing_cash_events', f.workspaceId);
    assert.equal(afterCash.length, beforeCash.length);
    assert.deepEqual(afterCash.map((row) => [row.external_id, row.amount_minor, row.status]),
      beforeCash.map((row) => [row.external_id, row.amount_minor, row.status]));
    const afterGrant = (await rows('credit_grants', f.workspaceId))[0]!;
    assert.equal(afterGrant.id, beforeGrant.id);
    assert.equal(afterGrant.voided, beforeGrant.voided);
    const afterOrder = (await rows('billing_orders', f.workspaceId))[0]!;
    assert.equal(afterOrder.status, 'refunded');
    assert.equal(afterOrder.refunded_minor, '2500');
    assert.ok((await rows('billing_reconciliation_cases', f.workspaceId)).some((row) => (row.payload as PaymentObservation).eventId === terminal.eventId));
  });
}

test('pending then failed refund holding evidence never creates confirmed cash', async () => {
  const f = await fixture();
  const pending = {...f.input, eventId: 'evt_refund_pending', eventType: 'charge.refunded' as const,
    refundId: 're_pending_then_failed', stripe: {...f.input.stripe!, supported: false}};
  assert.equal((await apply(pending)).status, 'held');
  const failed = {...pending, eventId: 'evt_refund_failed'};
  assert.equal((await apply(failed)).status, 'held');
  assert.equal((await rows('billing_cash_events', f.workspaceId)).length, 0);
  assert.equal((await rows('credit_grants', f.workspaceId)).length, 0);
  assert.equal((await rows('billing_orders', f.workspaceId)).length, 0);
  assert.equal((await pool.query('select status from app.billing_accounts where workspace_id=$1', [f.workspaceId])).rows[0].status, 'hold');
});
