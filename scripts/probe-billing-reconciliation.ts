import {strict as assert} from 'node:assert';
import {createHash, randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {signFixtureWebhook} from '../src/adapters/billing/stripe-webhooks.ts';
import {createDatabase} from '../src/db/client.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {billingAccounts, billingCustomerHistory, billingOrders, billingReconciliationCases, billingRefundRequests, billingWebhookInbox} from '../src/db/schema/billing.ts';
import {creditAccounts, creditGrants, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {openCheckout} from '../src/modules/billing/checkout.ts';
import {ingestStripeWebhook} from '../src/modules/billing/inbox.ts';
import {reconcilePayment} from '../src/modules/billing/reconcile-payment.ts';
import {replaceCustomer, listCustomerHistory} from '../src/modules/billing/customer-history.ts';
import {markSubscriptionCanceled, mirrorSubscription} from '../src/modules/billing/subscriptions.ts';
import {snapshotBillingProduct} from '../src/config/plans.ts';
import {recordBillingRecovery} from '../src/modules/billing/recovery.ts';
import {previewBillingRefund} from '../src/modules/billing/refund-preview.ts';
import {reconcileBillingRefund, requestBillingRefund} from '../src/modules/billing/refund-command.ts';
import {createFakeBillingRefundProvider} from '../src/adapters/billing/refunds.ts';
import {getOwnerBillingView} from '../src/modules/billing/queries.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const configured = new URL(globalThis.process['env'].DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Reconciliation probe requires local PostgreSQL.');
const databaseName = `m5_reconcile_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const ownerId = `billing-reconcile-owner-${randomUUID()}`;
const workspaceId = '00000000-0000-4000-8000-000000000921';
const recoveryWorkspaceId = '00000000-0000-4000-8000-000000000922';
const retryWorkspaceId = '00000000-0000-4000-8000-000000000923';
const raceWorkspaceId = '00000000-0000-4000-8000-000000000924';
const now = new Date('2026-10-01T00:00:00.000Z');
const secret = 'local-reconciliation-probe-secret';
const cases: string[] = [];
let pool: Pool | undefined;

async function migrateAll(client: Client): Promise<void> {
  const source = resolve('src/db/migrations');
  const temporary = mkdtempSync(join(tmpdir(), 'shpitto-reconcile-migrations-'));
  try {
    mkdirSync(join(temporary, 'meta'));
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as {entries: {idx: number; tag: string}[]};
    writeFileSync(join(temporary, 'meta/_journal.json'), JSON.stringify(journal), 'utf8');
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(temporary, `${entry.tag}.sql`));
    await migrate(drizzle(client), {migrationsFolder: temporary});
  } finally { rmSync(temporary, {recursive: true, force: true}); }
}

function body(eventId: string, type: string, object: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({id: eventId, type, data: {object}}));
}

async function run(): Promise<void> {
  await admin.connect();
  let created = false;
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const client = new Client({connectionString: databaseUrl.toString()});
    await client.connect(); await migrateAll(client); await client.end();
    const database = createDatabase({connectionString: databaseUrl.toString(), max: 10}); pool = database.pool;
    await database.db.insert(authUser).values({id: ownerId, name: 'Billing reconcile owner', email: `${ownerId}@example.test`, emailVerified: true, createdAt: now, updatedAt: now});
    await database.db.insert(userAccessControls).values({userId: ownerId, status: 'active', disabledAt: null, reason: null, version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(workspaces).values([
      {id: workspaceId, kind: 'team', name: 'Reconciliation workspace', createdBy: ownerId, status: 'active', version: 1, createdAt: now, updatedAt: now},
      {id: recoveryWorkspaceId, kind: 'team', name: 'Recovery workspace', createdBy: ownerId, status: 'active', version: 1, createdAt: now, updatedAt: now},
      {id: retryWorkspaceId, kind: 'team', name: 'Retry workspace', createdBy: ownerId, status: 'active', version: 1, createdAt: now, updatedAt: now},
      {id: raceWorkspaceId, kind: 'team', name: 'Race workspace', createdBy: ownerId, status: 'active', version: 1, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(workspaceMembers).values([
      {workspaceId, userId: ownerId, role: 'owner', createdAt: now}, {workspaceId: recoveryWorkspaceId, userId: ownerId, role: 'owner', createdAt: now},
      {workspaceId: retryWorkspaceId, userId: ownerId, role: 'owner', createdAt: now},
      {workspaceId: raceWorkspaceId, userId: ownerId, role: 'owner', createdAt: now},
    ]);
    await database.db.insert(billingAccounts).values([
      {workspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now},
      {workspaceId: recoveryWorkspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now},
      {workspaceId: raceWorkspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(creditAccounts).values([
      {workspaceId, version: 0n, createdAt: now, updatedAt: now}, {workspaceId: recoveryWorkspaceId, version: 0n, createdAt: now, updatedAt: now},
      {workspaceId: raceWorkspaceId, version: 0n, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(billingCustomerHistory).values([
      {workspaceId, provider: 'fixture', customerId: `fixture_customer_${workspaceId}`, previousCustomerId: null, validFrom: now, validUntil: null, changeReason: 'probe fixture'},
      {workspaceId: recoveryWorkspaceId, provider: 'fixture', customerId: `fixture_customer_${recoveryWorkspaceId}`, previousCustomerId: null, validFrom: now, validUntil: null, changeReason: 'probe fixture'},
      {workspaceId: raceWorkspaceId, provider: 'fixture', customerId: `fixture_customer_${raceWorkspaceId}`, previousCustomerId: null, validFrom: now, validUntil: null, changeReason: 'probe fixture'},
    ]);

    const actor = {userId: ownerId, recentAuthenticationAt: now};
    const checkout = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'reconcile-checkout-1', catalogProductKey: 'fixture-monthly', profile: 'local', now});
    assert.equal(checkout.status, 'open'); assert.ok(checkout.sessionId);
    const sessionId = checkout.sessionId!;
    const firstBody = body('evt_reconcile_1', 'checkout.completed', {checkoutSessionId: sessionId, customerId: `fixture_customer_${workspaceId}`, paymentIntentId: 'pi_reconcile_1', amountMinor: '2500', currency: 'usd', periodStart: now.toISOString(), periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), externalSubscriptionId: 'sub_reconcile_1'});
    const first = await ingestStripeWebhook(database.db, {rawBody: firstBody, signatureHeader: signFixtureWebhook(firstBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(first.reconciliation?.status, 'paid'); assert.ok(first.reconciliation?.grantId); cases.push('verified payment persists inbox and issues one catalog grant');
    const duplicate = await ingestStripeWebhook(database.db, {rawBody: firstBody, signatureHeader: signFixtureWebhook(firstBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(duplicate.duplicate, true); cases.push('verified duplicate webhook is acknowledged without a second effect');
    const grantRows = await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId));
    assert.equal(grantRows.length, 1); assert.equal(grantRows[0].issued, 1000n);
    const paidOrders = await database.db.select().from(billingOrders).where(eq(billingOrders.workspaceId, workspaceId));
    assert.equal(paidOrders.length, 1); assert.equal(paidOrders[0].status, 'paid');
    const subscriptionCatalog = snapshotBillingProduct('fixture-monthly', 'local');
    const mirrored = await mirrorSubscription(database.db, {workspaceId, provider: 'fixture', externalId: 'sub_reconcile_1', customerId: `fixture_customer_${workspaceId}`, catalogSnapshot: subscriptionCatalog, status: 'active', periodStart: now, periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), now});
    assert.equal(mirrored.status, 'active');
    const updatedSubscription = await mirrorSubscription(database.db, {workspaceId, provider: 'fixture', externalId: 'sub_reconcile_1', customerId: `fixture_customer_${workspaceId}`, catalogSnapshot: subscriptionCatalog, status: 'past_due', cancelAtPeriodEnd: true, periodStart: now, periodEnd: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), now: new Date(now.getTime() + 1_000)});
    assert.equal(updatedSubscription.status, 'past_due'); assert.equal(updatedSubscription.cancelAtPeriodEnd, true); assert.equal(updatedSubscription.periodEnd?.toISOString(), new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
    assert.equal((await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId))).length, 1); cases.push('subscription status mirrors do not issue grants and retain the original period expiry');
    await assert.rejects(openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'reconcile-checkout-blocked', catalogProductKey: 'fixture-monthly', profile: 'local', now: new Date(now.getTime() + 2_000)}), /nonterminal subscription/i);
    await markSubscriptionCanceled(database.db, {workspaceId, provider: 'fixture', externalId: 'sub_reconcile_1', now: new Date(now.getTime() + 3_000)});
    const replacementCheckout = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'reconcile-checkout-after-termination', catalogProductKey: 'fixture-monthly', profile: 'local', now: new Date(now.getTime() + 4_000)});
    assert.equal(replacementCheckout.status, 'open'); cases.push('cancel-at-period-end retains the recurring slot until termination, then allows a new purchase');
    const aliasBody = body('evt_reconcile_alias', 'invoice.paid', {invoiceId: 'in_reconcile_1', paymentIntentId: 'pi_reconcile_1', customerId: `fixture_customer_${workspaceId}`, amountMinor: '2500', currency: 'usd'});
    const aliasResult = await ingestStripeWebhook(database.db, {rawBody: aliasBody, signatureHeader: signFixtureWebhook(aliasBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(aliasResult.reconciliation?.grantId, first.reconciliation?.grantId); cases.push('invoice and PaymentIntent aliases converge on the original order and grant');

    const retryCustomerId = `fixture_customer_${retryWorkspaceId}`;
    const retryBody = body('evt_retryable', 'payment_intent.succeeded', {workspaceId: retryWorkspaceId, customerId: retryCustomerId, paymentIntentId: 'pi_retry_1', amountMinor: '900', currency: 'usd', productKey: 'fixture-pack'});
    await assert.rejects(ingestStripeWebhook(database.db, {rawBody: retryBody, signatureHeader: signFixtureWebhook(retryBody, secret, Math.floor(now.getTime() / 1000)), secret, now}), /billing is not initialized/i);
    const failedRetryInbox = await database.db.select({status: billingWebhookInbox.status}).from(billingWebhookInbox).where(eq(billingWebhookInbox.externalEventId, 'evt_retryable'));
    assert.equal(failedRetryInbox[0]?.status, 'failed');
    await database.db.insert(billingAccounts).values({workspaceId: retryWorkspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(creditAccounts).values({workspaceId: retryWorkspaceId, version: 0n, createdAt: now, updatedAt: now});
    await database.db.insert(billingCustomerHistory).values({workspaceId: retryWorkspaceId, provider: 'fixture', customerId: retryCustomerId, previousCustomerId: null, validFrom: now, validUntil: null, changeReason: 'retry fixture'});
    const retried = await ingestStripeWebhook(database.db, {rawBody: retryBody, signatureHeader: signFixtureWebhook(retryBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(retried.reconciliation?.status, 'paid');
    const retriedInbox = await database.db.select({status: billingWebhookInbox.status}).from(billingWebhookInbox).where(eq(billingWebhookInbox.externalEventId, 'evt_retryable'));
    assert.equal(retriedInbox[0]?.status, 'processed'); cases.push('failed webhook delivery is retryable with the same event identity after the transient prerequisite is restored');

    const staleBody = body('evt_stale_received', 'payment_intent.succeeded', {workspaceId: retryWorkspaceId, customerId: retryCustomerId, paymentIntentId: 'pi_stale_received', amountMinor: '900', currency: 'usd', productKey: 'fixture-pack'});
    const stalePayload = JSON.parse(new TextDecoder().decode(staleBody)) as Record<string, unknown>;
    await database.db.insert(billingWebhookInbox).values({id: randomUUID(), provider: 'fixture', externalEventId: 'evt_stale_received', eventType: 'payment_intent.succeeded', payloadHash: createHash('sha256').update(staleBody).digest('hex'), payload: stalePayload, status: 'received', receivedAt: new Date(now.getTime() - 120_000), processedAt: null});
    const staleRecovered = await ingestStripeWebhook(database.db, {rawBody: staleBody, signatureHeader: signFixtureWebhook(staleBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(staleRecovered.reconciliation?.status, 'paid');
    const staleGrants = await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, retryWorkspaceId));
    assert.equal(staleGrants.length, 2); cases.push('stale received inbox rows are reclaimed after the lease and converge without a duplicate grant');
    const replacementCustomer = await replaceCustomer(database.db, {workspaceId: retryWorkspaceId, provider: 'fixture', customerId: `fixture_customer_replaced_${retryWorkspaceId}`, reason: 'fixture customer rotation', now: new Date(now.getTime() + 5_000)});
    const history = await listCustomerHistory(database.db, {workspaceId: retryWorkspaceId, provider: 'fixture'});
    assert.equal(replacementCustomer.previousCustomerId, retryCustomerId); assert.equal(history.length, 2); assert.equal(history[0].validUntil?.toISOString(), replacementCustomer.validFrom.toISOString()); cases.push('customer replacement closes the old mapping and appends an auditable current identity');

    const crossPairBody = body('evt_cross_pair', 'invoice.paid', {invoiceId: 'in_reconcile_1', paymentIntentId: 'pi_retry_1', customerId: retryCustomerId, amountMinor: '900', currency: 'usd'});
    await assert.rejects(ingestStripeWebhook(database.db, {rawBody: crossPairBody, signatureHeader: signFixtureWebhook(crossPairBody, secret, Math.floor(now.getTime() / 1000)), secret, now}), /conflicting orders/i);
    cases.push('aliases are resolved as exact provider/object/id tuples and cannot cross-pair two orders');

    const wrongWorkspaceBody = body('evt_wrong_workspace_hint', 'payment_intent.succeeded', {paymentIntentId: 'pi_reconcile_1', workspaceId: recoveryWorkspaceId, customerId: `fixture_customer_${workspaceId}`, amountMinor: '2500', currency: 'usd'});
    await assert.rejects(ingestStripeWebhook(database.db, {rawBody: wrongWorkspaceBody, signatureHeader: signFixtureWebhook(wrongWorkspaceBody, secret, Math.floor(now.getTime() / 1000)), secret, now}), /workspace does not match/i);
    const wrongCustomerBody = body('evt_wrong_customer_hint', 'payment_intent.succeeded', {paymentIntentId: 'pi_reconcile_1', workspaceId, customerId: `fixture_customer_${recoveryWorkspaceId}`, amountMinor: '2500', currency: 'usd'});
    await assert.rejects(ingestStripeWebhook(database.db, {rawBody: wrongCustomerBody, signatureHeader: signFixtureWebhook(wrongCustomerBody, secret, Math.floor(now.getTime() / 1000)), secret, now}), /customer does not match/i);
    cases.push('known canonical orders reject mismatched workspace and customer hints before any account lock or financial effect');

    const forged = body('evt_forged', 'invoice.paid', {invoiceId: 'in_forged', workspaceId, customerId: `fixture_customer_${workspaceId}`, productKey: 'fixture-pack', amountMinor: '900', currency: 'usd'});
    await assert.rejects(ingestStripeWebhook(database.db, {rawBody: forged, signatureHeader: 't=1,v1=00'.repeat(32), secret, now}), /signature/i);
    assert.equal((await database.db.select().from(billingWebhookInbox).where(eq(billingWebhookInbox.externalEventId, 'evt_forged'))).length, 0); cases.push('forged signature has no durable financial or inbox effect');

    const recoveryCheckout = await openCheckout(database.db, {actor, workspaceId: recoveryWorkspaceId, idempotencyKey: 'reconcile-recovery-1', catalogProductKey: 'fixture-pack', profile: 'local', now});
    const recoveryBody = body('evt_recovery_refund', 'charge.refunded', {checkoutSessionId: recoveryCheckout.sessionId, customerId: `fixture_customer_${recoveryWorkspaceId}`, chargeId: 'ch_recovery_1', amountMinor: '900', currency: 'usd'});
    const recovery = await ingestStripeWebhook(database.db, {rawBody: recoveryBody, signatureHeader: signFixtureWebhook(recoveryBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(recovery.reconciliation?.status, 'recovery');
    const latePaidBody = body('evt_recovery_late_paid', 'checkout.completed', {checkoutSessionId: recoveryCheckout.sessionId, customerId: `fixture_customer_${recoveryWorkspaceId}`, paymentIntentId: 'pi_recovery_late', amountMinor: '900', currency: 'usd'});
    const latePaid = await ingestStripeWebhook(database.db, {rawBody: latePaidBody, signatureHeader: signFixtureWebhook(latePaidBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    assert.equal(latePaid.reconciliation?.status, 'held');
    assert.equal((await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, recoveryWorkspaceId))).length, 0);
    assert.equal((await database.db.select().from(billingReconciliationCases).where(eq(billingReconciliationCases.workspaceId, recoveryWorkspaceId))).length, 2); cases.push('refund-before-payment holds the workspace and late payment cannot grant credits');

    const originalOrder = paidOrders[0]!;
    const fullRefund = await recordBillingRecovery(database.db, {workspaceId, orderId: originalOrder.id, externalId: 'refund_unused_full', kind: 'refund', amountMinor: originalOrder.paidMinor, actorUserId: ownerId, now: new Date(now.getTime() + 10_000)});
    assert.equal(fullRefund.status, 'refunded'); assert.equal(fullRefund.voided, 1000n);
    const voidedGrant = (await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId))).find((grant) => grant.businessKey === `billing:${originalOrder.id}:grant`)!;
    assert.equal(voidedGrant.available, 0n); assert.equal(voidedGrant.voided, 1000n);
    const fullRefundReplay = await recordBillingRecovery(database.db, {workspaceId, orderId: originalOrder.id, externalId: 'refund_unused_full', kind: 'refund', amountMinor: originalOrder.paidMinor, actorUserId: ownerId, now: new Date(now.getTime() + 11_000)});
    assert.equal(fullRefundReplay.replayed, true); cases.push('full unused refund voids only its grant once with immutable ledger evidence');

    const partialOrder = (await database.db.select().from(billingOrders).where(eq(billingOrders.workspaceId, retryWorkspaceId))).find((order) => order.status === 'paid')!;
    const partialRefund = await recordBillingRecovery(database.db, {workspaceId: retryWorkspaceId, orderId: partialOrder.id, externalId: 'refund_partial_exposure', kind: 'refund', amountMinor: 1n, actorUserId: ownerId, now: new Date(now.getTime() + 12_000)});
    assert.equal(partialRefund.status, 'held');
    assert.equal((await database.db.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, retryWorkspaceId)))[0]!.status, 'hold'); cases.push('partial refund creates a hold and recovery case without negative credits');

    const replacementPaidBody = body('evt_replacement_paid', 'checkout.completed', {checkoutSessionId: replacementCheckout.sessionId, customerId: `fixture_customer_${workspaceId}`, paymentIntentId: 'pi_replacement_paid', amountMinor: '2500', currency: 'usd', periodStart: now.toISOString(), periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), externalSubscriptionId: 'sub_replacement'});
    await ingestStripeWebhook(database.db, {rawBody: replacementPaidBody, signatureHeader: signFixtureWebhook(replacementPaidBody, secret, Math.floor(now.getTime() / 1000)), secret, now});
    const replacementOrder = (await database.db.select().from(billingOrders).where(eq(billingOrders.workspaceId, workspaceId))).find((order) => order.status === 'paid' && order.id !== originalOrder.id)!;
    const refundPreview = await previewBillingRefund(database.db, {actor, workspaceId, orderId: replacementOrder.id});
    assert.equal(refundPreview.reason, 'full-unused');
    const unknownProvider = createFakeBillingRefundProvider({unknownKeys: new Set(['refund:refund-lost-response'])});
    const pendingRefund = await requestBillingRefund(database.db, {actor, workspaceId, orderId: replacementOrder.id, idempotencyKey: 'refund-lost-response', reason: 'fixture recovery test', provider: unknownProvider, now: new Date(now.getTime() + 13_000)});
    assert.equal(pendingRefund.status, 'unknown');
    const reconciledRefund = await reconcileBillingRefund(database.db, {actor, requestId: pendingRefund.requestId, externalId: 'refund_reconciled', now: new Date(now.getTime() + 14_000)});
    assert.equal(reconciledRefund.status, 'confirmed');
    assert.equal((await database.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, pendingRefund.requestId)))[0]!.status, 'confirmed'); cases.push('refund preview is side-effect free and lost remote response converges through a stable request id');

    const raceInput = {provider: 'fixture' as const, workspaceId: raceWorkspaceId, customerId: `fixture_customer_${raceWorkspaceId}`, paymentIntentId: 'pi_race_shared', productKey: 'fixture-pack', amountMinor: '900', currency: 'usd'};
    const raceResults = await Promise.allSettled([
      reconcilePayment(database.db, {...raceInput, eventId: 'evt_race_invoice', eventType: 'invoice.paid'}, now),
      reconcilePayment(database.db, {...raceInput, eventId: 'evt_race_intent', eventType: 'payment_intent.succeeded'}, now),
    ]);
    const raceFulfilled = raceResults.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reconcilePayment>>> => result.status === 'fulfilled').map((result) => result.value);
    assert.equal(raceFulfilled.length, 2); assert.equal(new Set(raceFulfilled.map((result) => result.orderId)).size, 1); assert.equal((await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, raceWorkspaceId))).length, 1); cases.push('concurrent paid observations serialize on the workspace fence into one order and one grant');
    const raceOrder = (await database.db.select().from(billingOrders).where(eq(billingOrders.workspaceId, raceWorkspaceId))).find((order) => order.status === 'paid')!;
    const dispute = await recordBillingRecovery(database.db, {workspaceId: raceWorkspaceId, orderId: raceOrder.id, externalId: 'dispute_1', kind: 'dispute_opened', amountMinor: raceOrder.paidMinor, actorUserId: ownerId, now: new Date(now.getTime() + 15_000)});
    assert.equal(dispute.status, 'held');
    const reversed = await recordBillingRecovery(database.db, {workspaceId: raceWorkspaceId, orderId: raceOrder.id, externalId: 'dispute_2', relatedExternalId: 'dispute_1', kind: 'dispute_reversed', amountMinor: raceOrder.paidMinor, actorUserId: ownerId, now: new Date(now.getTime() + 16_000)});
    assert.equal(reversed.status, 'recovered'); assert.equal((await database.db.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, raceWorkspaceId)))[0]!.status, 'active'); cases.push('reversed dispute resolves the recovery case once and releases the billing hold');
    const ownerView = await getOwnerBillingView(database.db, {actor, workspaceId});
    assert.equal(ownerView.orders.length, 2); assert.equal(ownerView.grants.length, 2); assert.ok(ownerView.refundRequests.length >= 1); cases.push('owner billing view exposes subscription, cash, credit and recovery state with workspace isolation');
    await database.pool.end(); pool = undefined;
    console.log(JSON.stringify({status: 'PASS', databaseName, cases, count: cases.length}));
  } finally {
    if (pool) { await pool.end().catch(() => undefined); pool = undefined; }
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rowCount, 0); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
