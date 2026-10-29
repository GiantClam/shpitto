import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

import {and, eq, sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, type Pool} from 'pg';

import {signFixtureWebhook} from '../src/adapters/billing/stripe-webhooks.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {affiliateCorrectionCases, affiliateDeliveryEvents, affiliatePayments, affiliateSettings} from '../src/db/schema/affiliate.ts';
import {billingCashEvents, billingCustomerHistory, billingOrders} from '../src/db/schema/billing.ts';
import {creditAccounts, creditGrants} from '../src/db/schema/workspace.ts';
import {ingestStripeWebhook} from '../src/modules/billing/inbox.ts';
import {reconcilePayment} from '../src/modules/billing/reconcile-payment.ts';
import {recordBillingRecovery} from '../src/modules/billing/recovery.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const configured = new URL(globalThis.process['env'].DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Cash recovery probe requires local PostgreSQL.');
const databaseName = `m6_cash_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';

async function run(): Promise<void> {
  let created = false;
  let pool: Pool | undefined;
  const cases: string[] = [];
  const now = new Date();
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const migration = new Client({connectionString: databaseUrl.toString()}); await migration.connect();
    try { await migrate(drizzle(migration), {migrationsFolder: 'src/db/migrations'}); } finally { await migration.end(); }
    const database = createDatabase({connectionString: databaseUrl.toString(), max: 8}); pool = database.pool;
    const db = database.db;
    await db.insert(authUser).values({id: 'cash-owner', name: 'Cash recovery owner', email: 'cash-owner@example.test', emailVerified: true, createdAt: now, updatedAt: now});
    const workspaceId = (await createTeamWorkspace(db, {userId: 'cash-owner'}, 'Local cash recovery')).workspaceId;
    await db.insert(creditAccounts).values({workspaceId, version: 0n, createdAt: now, updatedAt: now}).onConflictDoNothing();
    const customerId = `fixture_customer_${workspaceId}`;
    await db.insert(billingCustomerHistory).values({workspaceId, provider: 'fixture', customerId, validFrom: now, changeReason: 'cash recovery probe'});
    await db.update(affiliateSettings).set({enabled: 'enabled', accountId: 'local-account', programId: 'local-program'}).where(eq(affiliateSettings.id, 'default'));
    async function paid(reference: string): Promise<string> {
      const result = await reconcilePayment(db, {provider: 'fixture', eventId: `evt-paid-${reference}`, eventType: 'payment_intent.succeeded', workspaceId, customerId, paymentIntentId: reference, productKey: 'fixture-pack', amountMinor: '900', currency: 'usd'}, now);
      assert.ok(result.orderId); return result.orderId;
    }
    const firstOrderId = await paid('pi-first');
    const base = {workspaceId, orderId: firstOrderId, actorUserId: 'cash-owner', currency: 'usd', now};
    await db.update(affiliatePayments).set({firstPayment: 'yes'}).where(eq(affiliatePayments.paymentReference, firstOrderId));
    await recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-part-1', amountMinor: 200n});
    assert.equal((await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.eventReference, 'refund-part-1')))[0]!.status, 'held');
    await recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-part-2', amountMinor: 200n});
    assert.equal((await db.select().from(billingOrders).where(eq(billingOrders.id, firstOrderId)))[0]!.refundedMinor, 400n);
    assert.equal((await recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-part-1', amountMinor: 200n})).replayed, true);
    await assert.rejects(recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-part-1', amountMinor: 201n}), conflict);
    await assert.rejects(recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-overflow', amountMinor: 501n}), conflict);
    await assert.rejects(recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-foreign-currency', amountMinor: 1n, currency: 'eur'}), conflict);
    const final = await recordBillingRecovery(db, {...base, kind: 'refund', externalId: 'refund-final', amountMinor: 500n});
    assert.equal(final.status, 'refunded'); assert.equal(final.voided, 250n);
    const refunds = await db.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.paymentReference, firstOrderId), eq(affiliateDeliveryEvents.eventKind, 'refund')));
    assert.equal(refunds.length, 3); assert.equal(refunds.reduce((sum, row) => sum + BigInt(row.amountMinor!), 0n), 900n);
    assert.equal((await db.select().from(billingOrders).where(eq(billingOrders.id, firstOrderId)))[0]!.refundedMinor, 900n);
    cases.push('equal incremental refunds stay distinct, cumulative cash/export totals stop at the payment basis, and full unused credits reverse once');

    const overlapOrderId = await paid('pi-overlap');
    const overlap = {...base, orderId: overlapOrderId, economicLossId: 'shared-cash-loss'};
    await recordBillingRecovery(db, {...overlap, kind: 'dispute_opened', externalId: 'dispute-open', amountMinor: 900n});
    assert.equal((await db.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.paymentReference, overlapOrderId), eq(affiliateDeliveryEvents.eventKind, 'refund')))).length, 0);
    await recordBillingRecovery(db, {...overlap, kind: 'dispute_lost', externalId: 'dispute-lost', relatedExternalId: 'dispute-open', amountMinor: 900n});
    await recordBillingRecovery(db, {...overlap, kind: 'refund', externalId: 'refund-same-loss', amountMinor: 900n});
    const overlapRefunds = await db.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.paymentReference, overlapOrderId), eq(affiliateDeliveryEvents.eventKind, 'refund')));
    assert.equal(overlapRefunds.length, 1); assert.equal(overlapRefunds[0]!.amountMinor, '900');
    const reversal = await recordBillingRecovery(db, {...overlap, kind: 'dispute_reversed', externalId: 'dispute-won', relatedExternalId: 'dispute-open', amountMinor: 900n});
    assert.equal(reversal.restored, 0n);
    const overlapGrant = (await db.select().from(creditGrants).where(eq(creditGrants.businessKey, `billing:${overlapOrderId}:grant`)))[0]!;
    assert.equal(overlapGrant.available, 0n); assert.equal(overlapGrant.voided, 250n);
    assert.ok((await db.select().from(affiliateCorrectionCases).where(and(eq(affiliateCorrectionCases.paymentReference, overlapOrderId), eq(affiliateCorrectionCases.reason, 'dispute_reversed_requires_provider_correction'))))[0]);
    assert.equal((await db.select().from(affiliatePayments).where(eq(affiliatePayments.paymentReference, firstOrderId)))[0]!.firstPayment, 'yes');
    await assert.rejects(recordBillingRecovery(db, {...base, kind: 'dispute_reversed', externalId: 'forged-reversal', relatedExternalId: 'missing-dispute', amountMinor: 900n}), conflict);
    cases.push('open dispute immediately holds review; lost-dispute/refund overlap exports one loss; correlated reversal never restores unrelated cash-refund credits or resets eligibility');

    const webhookOrderId = await paid('pi-webhook');
    const secret = 'local-cash-webhook-fixture';
    async function webhook(eventId: string) {
      const rawBody = new TextEncoder().encode(JSON.stringify({id: eventId, type: 'charge.refunded', data: {object: {workspaceId, customerId, paymentIntentId: 'pi-webhook', refundId: 'canonical-refund', amountMinor: '100', currency: 'usd'}}}));
      return ingestStripeWebhook(db, {rawBody, signatureHeader: signFixtureWebhook(rawBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    }
    await webhook('evt-refund-1'); await webhook('evt-refund-2');
    assert.equal((await db.select().from(billingCashEvents).where(eq(billingCashEvents.orderId, webhookOrderId))).length, 1);
    assert.equal((await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.eventReference, 'canonical-refund'))).length, 1);
    await assert.rejects(recordBillingRecovery(db, {...base, orderId: overlapOrderId, kind: 'refund', externalId: 'canonical-refund', amountMinor: 100n}), conflict);
    cases.push('two signed webhook deliveries sharing a provider refund object converge; cross-order reuse is rejected');

    await db.execute(sql`alter table app.affiliate_delivery_events add constraint cash_probe_failure check(event_reference <> 'refund-fail-atomic')`);
    await assert.rejects(recordBillingRecovery(db, {...base, orderId: webhookOrderId, kind: 'refund', externalId: 'refund-fail-atomic', amountMinor: 100n}));
    assert.equal((await db.select().from(billingCashEvents).where(eq(billingCashEvents.externalId, 'refund-fail-atomic'))).length, 0);
    assert.equal((await db.select().from(billingOrders).where(eq(billingOrders.id, webhookOrderId)))[0]!.refundedMinor, 100n);
    await db.execute(sql`alter table app.affiliate_delivery_events drop constraint cash_probe_failure`);
    cases.push('affiliate intent failure rolls back the cash observation, refund counter and entitlement effect atomically');
    console.log(JSON.stringify({status: 'PASS', databaseName, count: cases.length, cases, externalAccountsUsed: false}));
  } finally {
    if (pool) await pool.end();
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : 'Cash recovery probe failed.'); process.exitCode = 1; });
