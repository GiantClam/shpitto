import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {snapshotBillingProduct} from '../src/config/plans.ts';
import {DomainError} from '../src/db/contracts.ts';
import * as schema from '../src/db/schema/index.ts';
import {recordBillingRecovery, type RecoveryKind} from '../src/modules/billing/recovery.ts';

// This probe owns a fresh database; it never migrates the configured application database.
for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const configured = new URL(globalThis.process['env'].DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Billing schema probe requires a local PostgreSQL server.');
const databaseName = `m5_billing_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured);
adminUrl.pathname = '/postgres';
const probeUrl = new URL(configured);
probeUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const client = new Client({connectionString: probeUrl.toString()});
const cases: string[] = [];
const one = '00000000-0000-4000-8000-000000000001';
const two = '00000000-0000-4000-8000-000000000002';
const order = '00000000-0000-4000-8000-000000000003';
const snapshot = JSON.stringify(snapshotBillingProduct('fixture-monthly', 'test'));

async function rejected(name: string, query: string, values: unknown[], code: string): Promise<void> {
  await assert.rejects(client.query(query, values), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === code, name);
  cases.push(name);
}

async function migrateBefore(migrationRoot: string, exclusiveIndex: number): Promise<void> {
  const temporaryMigrations = mkdtempSync(join(tmpdir(), 'shpitto-billing-migration-'));
  try {
    mkdirSync(join(temporaryMigrations, 'meta'));
    const journal = JSON.parse(readFileSync(join(migrationRoot, 'meta/_journal.json'), 'utf8')) as {entries: {idx: number; tag: string}[]};
    const priorJournal = {...journal, entries: journal.entries.filter((entry) => entry.idx < exclusiveIndex)};
    writeFileSync(join(temporaryMigrations, 'meta/_journal.json'), JSON.stringify(priorJournal), 'utf8');
    for (const entry of priorJournal.entries) copyFileSync(join(migrationRoot, `${entry.tag}.sql`), join(temporaryMigrations, `${entry.tag}.sql`));
    await migrate(drizzle(client), {migrationsFolder: temporaryMigrations});
  } finally {
    assert(resolve(temporaryMigrations).startsWith(resolve(tmpdir()) + '\\shpitto-billing-migration-') || resolve(temporaryMigrations).startsWith(resolve(tmpdir()) + '/shpitto-billing-migration-'));
    rmSync(temporaryMigrations, {recursive: true});
  }
}

async function run(): Promise<void> {
  await admin.connect();
  let created = false;
  try {
    await admin.query(`create database "${databaseName}"`);
    created = true;
    await client.connect();
    const migrationRoot = resolve('src/db/migrations');
    await migrateBefore(migrationRoot, 16);
    await client.query(`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ('billing-probe','Billing probe','billing-probe@example.test',true,now(),now())`);
    await client.query(`insert into app.workspaces (id,kind,name,created_by,created_at,updated_at) values ($1,'team','Billing one','billing-probe',now(),now()),($2,'team','Billing two','billing-probe',now(),now())`, [one, two]);
    await client.query(`insert into app.billing_accounts (workspace_id,created_at,updated_at) values ($1,now(),now()),($2,now(),now())`, [one, two]);
    await client.query(`update app.billing_accounts set status='hold',hold_reason='existing-review' where workspace_id=$1`, [one]);
    await client.query(`insert into app.credit_grants (id,workspace_id,source,issued,available,reserved,consumed,expired,voided,business_key,created_at) values ($1,$2,'demo',100,90,10,0,0,0,'billing-probe-existing-credit',now())`, [randomUUID(), one]);
    const priorCredit = (await client.query('select row_to_json(g) as value from app.credit_grants g where workspace_id=$1', [one])).rows;
    await migrateBefore(migrationRoot, 24);
    const legacyOrder = randomUUID();
    await client.query(`insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,valid_until,change_reason) values ($1,'fixture','customer-legacy-backfill',now(),now(),'pre24 fixture')`, [one]);
    await client.query(`insert into app.billing_orders (id,workspace_id,provider,customer_id,kind,catalog_snapshot,currency,paid_minor,refunded_minor,status,paid_at,created_at,updated_at) values ($1,$2,'fixture','customer-legacy-backfill','subscription',$3::jsonb,'usd',100,10,'held',now(),now(),now())`, [legacyOrder, one, snapshot]);
    const legacyFacts: readonly (readonly [RecoveryKind, string])[] = [['refund', 'legacy-refund'], ['dispute_opened', 'legacy-dispute'], ['dispute_lost', 'legacy-dispute'], ['dispute_reversed', 'legacy-already-won']];
    for (const [kind, reference] of legacyFacts) {
      await client.query(`insert into app.billing_cash_events (id,workspace_id,provider,event_kind,external_id,order_id,amount_minor,currency,status,occurred_at,created_at) values ($1,$2,'fixture',$3,$4,$5,10,'usd','confirmed',now(),now())`, [randomUUID(), one, kind, reference, legacyOrder]);
    }
    const legacyDisputeCase = randomUUID();
    const unrelatedCase = randomUUID();
    await client.query(`insert into app.billing_reconciliation_cases (id,workspace_id,provider,external_reference,reason,payload,status,created_at) values ($1,$2,'fixture','legacy-dispute','payment-dispute','{}','open',now()),($3,$2,'fixture','preexisting-review','existing-review','{}','open',now())`, [legacyDisputeCase, one, unrelatedCase]);
    const priorCash = (await client.query('select row_to_json(c) as value from app.billing_cash_events c order by external_id,event_kind')).rows;
    await migrate(drizzle(client), {migrationsFolder: migrationRoot});
    assert.deepEqual((await client.query("select row_to_json(c)::jsonb - 'economic_loss_key' - 'related_external_id' as value from app.billing_cash_events c order by external_id,event_kind")).rows, priorCash);
    const probeDb = drizzle(client, {schema});
    for (const [kind, externalId] of legacyFacts) {
      const replay = await recordBillingRecovery(probeDb, {workspaceId: one, orderId: legacyOrder, kind, externalId, amountMinor: 10n, currency: 'usd'});
      assert.equal(replay.replayed, true, `Upgrade changed the canonical identity of ${kind}.`);
      assert.equal(replay.voided, 0n);
      assert.equal(replay.restored, 0n);
    }
    assert.equal((await client.query('select count(*)::int as count from app.billing_cash_events')).rows[0].count, legacyFacts.length);
    assert.deepEqual((await client.query('select economic_loss_key,related_external_id from app.billing_cash_events order by external_id,event_kind')).rows, [{economic_loss_key: 'dispute:legacy-already-won', related_external_id: null}, {economic_loss_key: 'dispute:legacy-dispute', related_external_id: null}, {economic_loss_key: 'dispute:legacy-dispute', related_external_id: null}, {economic_loss_key: 'refund:legacy-refund', related_external_id: null}]);
    cases.push('populated cash fact upgrade derives economic loss identities without rewriting original facts');
    cases.push('all pre-upgrade cash event kinds replay through the recovery domain without new effects');
    assert.equal((await client.query("select to_regclass('app.billing_checkout_attempts') as name")).rows[0].name, 'app.billing_checkout_attempts');
    assert.deepEqual((await client.query('select row_to_json(g) as value from app.credit_grants g where workspace_id=$1', [one])).rows, priorCredit);
    assert.deepEqual((await client.query('select status,hold_reason,reconciliation_generation from app.billing_accounts where workspace_id=$1', [one])).rows[0], {status: 'hold', hold_reason: 'existing-review', reconciliation_generation: '0'});
    cases.push('upgrade preserves existing hold and available/reserved credits');
    cases.push('existing billing account inserts retain compatible defaults');
    const reversalInput = {workspaceId: one, orderId: legacyOrder, kind: 'dispute_reversed' as const, externalId: 'legacy-dispute-won-new', relatedExternalId: 'legacy-dispute', amountMinor: 10n, currency: 'usd'};
    const recovered = await recordBillingRecovery(probeDb, reversalInput);
    assert.equal(recovered.replayed, false);
    assert.equal(recovered.status, 'recovered');
    assert.equal(recovered.caseId, legacyDisputeCase);
    assert.equal(recovered.restored, 0n);
    assert.equal((await recordBillingRecovery(probeDb, reversalInput)).replayed, true);
    await assert.rejects(recordBillingRecovery(probeDb, {...reversalInput, amountMinor: 11n}), error => error instanceof DomainError && error.code === 'CONFLICT');
    assert.deepEqual((await client.query('select economic_loss_key,related_external_id from app.billing_cash_events where external_id=$1', [reversalInput.externalId])).rows[0], {economic_loss_key: 'dispute:legacy-dispute', related_external_id: 'legacy-dispute'});
    assert.equal((await client.query('select count(*)::int as count from app.billing_cash_events')).rows[0].count, legacyFacts.length + 1);
    assert.equal((await client.query('select status from app.billing_reconciliation_cases where id=$1', [legacyDisputeCase])).rows[0].status, 'resolved');
    assert.equal((await client.query('select status from app.billing_reconciliation_cases where id=$1', [unrelatedCase])).rows[0].status, 'open');
    assert.equal((await client.query('select status from app.billing_accounts where workspace_id=$1', [one])).rows[0].status, 'hold');
    assert.equal((await client.query('select refunded_minor from app.billing_orders where id=$1', [legacyOrder])).rows[0].refunded_minor, '10');
    assert.deepEqual((await client.query('select row_to_json(g) as value from app.credit_grants g where workspace_id=$1', [one])).rows, priorCredit);
    cases.push('post-upgrade dispute reversal reuses canonical loss identity, resolves only its case, and never restores unrelated credits');
    await client.query(`insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'fixture','customer-one',now(),'initial fixture'),($2,'fixture','customer-two',now(),'initial fixture')`, [one, two]);
    await rejected('customer identity cannot move tenants', `insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'fixture','customer-one',now(),'duplicate')`, [two], '23505');
    await rejected('one current customer mapping per tenant/provider', `insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'fixture','customer-extra',now(),'duplicate')`, [one], '23505');
    await client.query(`update app.billing_customer_history set valid_until=now() where customer_id='customer-one'`);
    await client.query(`insert into app.billing_customer_history (workspace_id,provider,customer_id,previous_customer_id,valid_from,change_reason) values ($1,'fixture','customer-new','customer-one',now(),'reviewed replacement')`, [one]);
    await rejected('historical customer identity cannot be deleted', `delete from app.billing_customer_history where customer_id='customer-one'`, [], '23514');
    await rejected('historical customer interval cannot reopen', `update app.billing_customer_history set valid_until=null where customer_id='customer-one'`, [], '23514');
    await rejected('replacement predecessor must share tenant', `update app.billing_customer_history set previous_customer_id='customer-two' where customer_id='customer-new'`, [], '23514');
    await rejected('new customer predecessor cannot cross tenants', `insert into app.billing_customer_history (workspace_id,provider,customer_id,previous_customer_id,valid_from,valid_until,change_reason) values ($1,'fixture','customer-invalid','customer-two',now(),now(),'invalid predecessor')`, [one], '23503');
    cases.push('customer replacement retains original identity');
    const insertOrder = `insert into app.billing_orders (id,workspace_id,provider,customer_id,kind,catalog_snapshot,currency,paid_minor,refunded_minor,created_at,updated_at) values ($1,$2,'fixture',$3,'subscription',$4::jsonb,'usd',100,0,now(),now())`;
    await client.query(insertOrder, [order, one, 'customer-one', snapshot]);
    await rejected('order cannot reference another tenant customer', insertOrder, [randomUUID(), two, 'customer-one', snapshot], '23503');
    await client.query(`insert into app.billing_customer_history (workspace_id,provider,customer_id,valid_from,change_reason) values ($1,'stripe','customer-synthetic-stripe',now(),'test-only provider binding')`, [one]);
    await rejected('Stripe order cannot bind fixture catalog terms', insertOrder.replace("'fixture'", "'stripe'"), [randomUUID(), one, 'customer-synthetic-stripe', snapshot], '23514');
    await rejected('refund cannot exceed paid cash', `update app.billing_orders set refunded_minor=101 where id=$1`, [order], '23514');
    await rejected('paid cash cannot become negative', `update app.billing_orders set paid_minor=-1 where id=$1`, [order], '23514');
    await rejected('cash minor units cannot be fractional', `update app.billing_orders set paid_minor=$1 where id=$2`, ['1.5', order], '22P02');
    await rejected('order snapshot cannot be rewritten', `update app.billing_orders set catalog_snapshot=jsonb_set(catalog_snapshot,'{credits}','"9000"') where id=$1`, [order], '23514');
    for (const change of [{interval: 'year'}, {credits: '-1'}, {amountMinor: 2500}, {currency: null}, {provider: null}]) {
      await rejected(`invalid persisted catalog snapshot ${Object.keys(change)[0]}`, insertOrder, [randomUUID(), one, 'customer-one', JSON.stringify({...JSON.parse(snapshot), ...change})], '23514');
    }
    const aliasInsert = `insert into app.billing_payment_aliases (workspace_id,provider,object_kind,external_id,order_id,created_at) values ($1,'fixture',$2,$3,$4,now())`;
    for (const kind of ['checkout_session', 'invoice', 'payment_intent']) await client.query(aliasInsert, [one, kind, `${kind}-one`, order]);
    await rejected('payment alias is globally canonical', aliasInsert, [one, 'invoice', 'invoice-one', order], '23505');
    await rejected('payment alias cannot cross tenants', aliasInsert, [two, 'invoice', 'invoice-two', order], '23503');
    await rejected('payment alias cannot be reassigned', `update app.billing_payment_aliases set external_id='rewritten' where object_kind='invoice'`, [], '23514');
    cases.push('three object aliases converge on one order');
    const cashInsert = `insert into app.billing_cash_events (id,workspace_id,provider,event_kind,external_id,economic_loss_key,order_id,amount_minor,currency,status,occurred_at,created_at) values ($1,$2,'fixture','refund',$3,'refund:' || $3,$4,10,'usd','confirmed',now(),now())`;
    await client.query(cashInsert, [randomUUID(), one, 'refund-one', order]);
    await rejected('cash event identity deduplicates observation', cashInsert, [randomUUID(), one, 'refund-one', order], '23505');
    await rejected('cash facts cannot cross tenants', cashInsert, [randomUUID(), two, 'refund-two', order], '23503');
    await rejected('cash fact requires an economic loss identity', `insert into app.billing_cash_events (id,workspace_id,provider,event_kind,external_id,order_id,amount_minor,currency,status,occurred_at,created_at) values ($1,$2,'fixture','refund','missing-loss-key',$3,10,'usd','confirmed',now(),now())`, [randomUUID(), one, order], '23502');
    await rejected('cash fact currency matches canonical order', `insert into app.billing_cash_events (id,workspace_id,provider,event_kind,external_id,economic_loss_key,order_id,amount_minor,currency,status,occurred_at,created_at) values ($1,$2,'fixture','refund','wrong-currency','refund:wrong-currency',$3,10,'eur','confirmed',now(),now())`, [randomUUID(), one, order], '23503');
    await rejected('confirmed cash facts cannot mutate', `update app.billing_cash_events set amount_minor=20 where external_id='refund-one'`, [], '23514');
    await rejected('backfilled cash facts remain immutable', `update app.billing_cash_events set economic_loss_key='rewritten' where external_id='legacy-refund'`, [], '23514');
    await rejected('confirmed cash facts cannot disappear', `delete from app.billing_cash_events where external_id='refund-one'`, [], '23514');
    await client.query(`update app.billing_orders set refunded_minor=10 where id=$1`, [order]);
    await rejected('confirmed refund projection cannot regress', `update app.billing_orders set refunded_minor=0 where id=$1`, [order], '23514');
    const checkoutInsert = `insert into app.billing_checkout_attempts (id,workspace_id,provider,customer_id,kind,catalog_snapshot,idempotency_key,status,created_at,updated_at) values ($1,$2,'fixture','customer-new','subscription',$3::jsonb,$4,$5,now(),now())`;
    const firstCheckout = randomUUID();
    await rejected('Stripe Checkout cannot bind fixture catalog terms', checkoutInsert.replace("'fixture'", "'stripe'").replace("'customer-new'", "'customer-synthetic-stripe'"), [randomUUID(), one, snapshot, 'checkout:provider-mismatch', 'creating'], '23514');
    await client.query(checkoutInsert, [firstCheckout, one, snapshot, 'checkout:first', 'unknown']);
    await rejected('unknown recurring attempt keeps live slot', checkoutInsert, [randomUUID(), one, snapshot, 'checkout:second', 'creating'], '23505');
    await rejected('non-authoritative timeout cannot release slot', `update app.billing_checkout_attempts set status='expired' where id=$1`, [firstCheckout], '23514');
    await client.query(`update app.billing_checkout_attempts set status='expired',resolved_at=now(),resolution_reference='fixture:authoritative-expiry' where id=$1`, [firstCheckout]);
    await client.query(checkoutInsert, [randomUUID(), one, snapshot, 'checkout:second', 'creating']);
    cases.push('authoritative terminal evidence releases recurring slot');
    const racePool = new Pool({connectionString: probeUrl.toString(), max: 10});
    try {
      const results = await Promise.allSettled(Array.from({length: 10}, (_, index) => racePool.query(checkoutInsert.replace("'customer-new'", "'customer-two'"), [randomUUID(), two, snapshot, `checkout:race:${index}`, 'creating'])));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const failures = results.filter((result) => result.status === 'rejected');
      assert.equal(failures.length, 9);
      assert(failures.every((result) => result.status === 'rejected' && result.reason.code === '23505'));
      cases.push('ten concurrent recurring Checkout inserts have one live slot winner');
    } finally { await racePool.end(); }
    const packSnapshot = JSON.stringify(snapshotBillingProduct('fixture-pack', 'test'));
    await client.query(checkoutInsert.replace("'subscription'", "'pack'"), [randomUUID(), one, packSnapshot, 'checkout:pack:1', 'creating']);
    await client.query(checkoutInsert.replace("'subscription'", "'pack'"), [randomUUID(), one, packSnapshot, 'checkout:pack:2', 'creating']);
    cases.push('permanent packs do not occupy the recurring slot');
    const subscriptionInsert = `insert into app.billing_subscriptions (id,workspace_id,provider,customer_id,external_id,catalog_snapshot,status,created_at,updated_at) values ($1,$2,'fixture','customer-new',$3,$4::jsonb,$5,now(),now())`;
    const subscriptionId = randomUUID();
    await rejected('Stripe subscription cannot bind fixture catalog terms', subscriptionInsert.replace("'fixture'", "'stripe'").replace("'customer-new'", "'customer-synthetic-stripe'"), [randomUUID(), one, 'subscription-provider-mismatch', snapshot, 'active'], '23514');
    await client.query(subscriptionInsert, [subscriptionId, one, 'subscription-one', snapshot, 'active']);
    await rejected('nonterminal subscriptions have a unique workspace slot', subscriptionInsert, [randomUUID(), one, 'subscription-two', snapshot, 'paused'], '23505');
    await client.query(`update app.billing_subscriptions set cancel_at_period_end=true where id=$1`, [subscriptionId]);
    await rejected('period-end cancellation retains the nonterminal slot', subscriptionInsert, [randomUUID(), one, 'subscription-two', snapshot, 'active'], '23505');
    await client.query(`update app.billing_subscriptions set status='canceled' where id=$1`, [subscriptionId]);
    await client.query(subscriptionInsert, [randomUUID(), one, 'subscription-two', snapshot, 'active']);
    cases.push('only terminal subscriptions release their slot');
    await rejected('terminal Checkout cannot reopen', `update app.billing_checkout_attempts set status='creating',resolved_at=null,resolution_reference=null where id=$1`, [firstCheckout], '23514');
    await rejected('lease metadata cannot be partial', `update app.billing_accounts set reconciliation_lease_owner='worker' where workspace_id=$1`, [one], '23514');
    const token = randomUUID();
    await client.query(`update app.billing_accounts set reconciliation_lease_owner='worker',reconciliation_lease_token=$2,reconciliation_generation=1,reconciliation_lease_until=now()+interval '60 seconds' where workspace_id=$1`, [one, token]);
    await client.query(`update app.billing_accounts set reconciliation_generation=2,reconciliation_lease_token=$2 where workspace_id=$1`, [one, randomUUID()]);
    assert.equal((await client.query(`update app.billing_accounts set updated_at=now() where workspace_id=$1 and reconciliation_generation=1 and reconciliation_lease_token=$2`, [one, token])).rowCount, 0);
    await rejected('fencing generation cannot move backward', `update app.billing_accounts set reconciliation_generation=1 where workspace_id=$1`, [one], '23514');
    cases.push('stale reconciliation token/generation has no effect');
    const version = (await client.query('show server_version')).rows[0].server_version;
    console.log(JSON.stringify({status: 'PASS', databaseName, serverVersion: version, cases, count: cases.length}));
  } finally {
    await client.end();
    if (created) {
      await admin.query(`drop database "${databaseName}" with (force)`);
      assert.equal((await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rowCount, 0);
      console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName}));
    }
    await admin.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Billing schema probe failed.');
  process.exitCode = 1;
});
