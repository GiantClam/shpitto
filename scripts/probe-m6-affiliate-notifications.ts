import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';
import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {affiliateNotificationInbox} from '../src/db/schema/affiliate-inbox.ts';
import {affiliateAttributions, affiliatePayments, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../src/db/schema/affiliate.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts, billingCustomerHistory} from '../src/db/schema/billing.ts';
import {workspaces} from '../src/db/schema/workspace.ts';
import {handleAffiliateNotification} from '../src/modules/affiliates/notification-http.ts';
import {ingestAffiliateNotification, parseAffiliateNotification, processAffiliateNotification, type AffiliateNotificationAuthority} from '../src/modules/affiliates/notifications.ts';
import {processLocalAffiliateSyncOnce} from './local-worker.ts';

const configured = new URL(getServerEnv().databaseUrl);
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname));
const name = 'm6_notifications_' + randomUUID().replaceAll('-', '');
const admin = new Client({connectionString: configured.toString()});
await admin.connect();
await admin.query(`create database "${name}"`);
configured.pathname = '/' + name;
globalThis.process['env'].DATABASE_URL = configured.toString();
const database = createDatabase();
const db = database.db;
const cases: string[] = [];
try {
  await migrate(db, {migrationsFolder: 'src/db/migrations'});
  const body = {event_id: randomUUID(), event_type: 'commission.updated', entity_type: 'commission', entity_id: 42, action: 'updated', timestamp: new Date().toISOString(), data: {status: 'approved', email: 'discard@example.test'}};
  const notification = parseAffiliateNotification(body);
  assert.equal((await processLocalAffiliateSyncOnce()).status, 'disabled');
  await assert.rejects(ingestAffiliateNotification(db, notification), e => e instanceof DomainError && e.code === 'FORBIDDEN');
  assert.equal((await db.select().from(affiliateNotificationInbox)).length, 0);
  cases.push('disabled scheduler and ingestion do not invoke provider or write affiliate inbox');
  let databaseReads = 0;
  async function request(value: string, header: string | null = 'Bearer local-notification-secret', options: Readonly<{headers?: Record<string, string>; secret?: string; production?: boolean; url?: string}> = {}) {
    return handleAffiliateNotification(new Request(options.url ?? 'http://127.0.0.1:3101/api/webhooks/affiliate', {method: 'POST', headers: {'content-type': 'application/json', ...(header ? {authorization: header} : {}), ...options.headers}, body: value}), {secret: options.secret ?? 'local-notification-secret', production: options.production ?? false, getDatabase: () => {databaseReads += 1; return db;}});
  }
  assert.equal((await request(JSON.stringify(body), undefined, {secret: ''})).status, 404);
  assert.equal((await request(JSON.stringify(body), undefined, {production: true})).status, 404);
  assert.equal((await request(JSON.stringify(body), null)).status, 401);
  assert.equal((await request(JSON.stringify(body), 'Bearer incorrect')).status, 401);
  assert.equal((await request('x'.repeat(32769))).status, 400);
  assert.equal((await request(JSON.stringify({...body, data: '汉'.repeat(12000)}))).status, 400);
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(JSON.stringify(body), undefined, {headers: {'x-event-id': randomUUID()}})).status, 400);
  assert.equal((await request(JSON.stringify(body), undefined, {headers: {'x-event-type': 'commission.created'}})).status, 400);
  assert.equal(databaseReads, 0, 'Authentication, transport and body rejection must precede database access.');
  assert.equal((await request(JSON.stringify(body))).status, 403);
  await db.update(affiliateSettings).set({enabled: 'enabled', accountId: 'local-account', programId: 'local-program'}).where(eq(affiliateSettings.id, 'default'));
  assert.equal((await request(JSON.stringify(body), undefined, {production: true, url: 'https://example.test/api/webhooks/affiliate', headers: {'x-event-id': body.event_id.toUpperCase(), 'x-event-type': body.event_type}})).status, 202);
  assert.equal((await request(JSON.stringify(body))).status, 200);
  assert.equal((await request(JSON.stringify({...body, entity_id: 43}))).status, 409);
  const replay = await Promise.all([ingestAffiliateNotification(db, notification), ingestAffiliateNotification(db, notification)]);
  assert.ok(replay.every(r => r.duplicate));
  await assert.rejects(ingestAffiliateNotification(db, {...notification, entityId: 43}), e => e instanceof DomainError && e.code === 'CONFLICT');
  const stored = (await db.select().from(affiliateNotificationInbox))[0]!;
  assert.ok(!JSON.stringify(stored).includes('discard@example.test'));
  assert.equal(stored.status, 'pending');
  cases.push('authenticated bounded HTTP intake persists sanitized signal and concurrent duplicates once');
  let reads = 0;
  const authority: AffiliateNotificationAuthority = {
    async verifyReference() {return 'unavailable';},
    async readHistory() {return {complete: false, customers: [], payments: []};},
    async readCommission() {throw new Error('No commission evidence supplied');},
    async deliver() {throw new Error('No delivery permitted');},
    async readAccount() {return {accountId: 'local-account', programId: 'local-program', campaignRevision: 'first-payment-v1', automaticPayouts: false, firstPaymentOnly: true, complete: true, checkedAt: new Date()};},
    async readNotification(input) {reads += 1; return {accountId: 'local-account', programId: 'local-program', eventId: input.eventId, entityType: input.entityType, entityId: input.entityId, complete: true, checkedAt: new Date(), payments: []};},
  };
  assert.equal(await processAffiliateNotification(db, notification.eventId, {...authority, readNotification: undefined}), 'unavailable');
  assert.equal(await processAffiliateNotification(db, notification.eventId, {...authority, readNotification: async input => ({...await authority.readNotification!(input), accountId: 'foreign'})}), 'pending');
  await db.update(affiliateNotificationInbox).set({nextActionAt: new Date(0)}).where(eq(affiliateNotificationInbox.eventId, notification.eventId));
  assert.equal(await processAffiliateNotification(db, notification.eventId, authority), 'processed');
  const beforeReads = reads;
  assert.equal(await processAffiliateNotification(db, notification.eventId, authority), 'not_ready');
  assert.equal(reads, beforeReads);
  cases.push('unavailable/foreign readback stays pending; authoritative refresh and replay are fenced');
  const concurrent = {...notification, eventId: randomUUID()};
  await ingestAffiliateNotification(db, concurrent);
  const beforeConcurrentReads = reads;
  const concurrentResults = await Promise.all([processAffiliateNotification(db, concurrent.eventId, authority), processAffiliateNotification(db, concurrent.eventId, authority)]);
  assert.deepEqual(concurrentResults.sort(), ['not_ready', 'processed']);
  assert.equal(reads - beforeConcurrentReads, 1, 'Only the live lease holder may request provider readback.');
  const scheduled = {...notification, eventId: randomUUID()};
  await ingestAffiliateNotification(db, scheduled);
  assert.equal((await processLocalAffiliateSyncOnce(authority)).notifications, 1);
  assert.equal((await db.select().from(affiliateNotificationInbox).where(eq(affiliateNotificationInbox.eventId, scheduled.eventId)))[0]!.status, 'processed');
  cases.push('concurrent claims perform one readback and the ordinary local worker drains the durable inbox');

  const fixtureTime = new Date();
  const userId = 'notification-probe-' + randomUUID();
  const workspaceId = randomUUID();
  const reviewId = randomUUID();
  const actionId = randomUUID();
  const paymentReference = 'notification-payment';
  const payment = {paymentReference, kind: 'pack' as const, paidAt: new Date(fixtureTime.getTime() - 600_000), amountMinor: 1000n, currency: 'usd', historyComplete: true};
  const customer = {provider: 'fixture', customerId: 'notification-customer'};
  await db.insert(authUser).values({id: userId, name: 'Notification probe', email: userId + '@example.test', emailVerified: true, createdAt: fixtureTime, updatedAt: fixtureTime});
  await db.insert(workspaces).values({id: workspaceId, kind: 'team', name: 'Notification probe', createdBy: userId, status: 'active', version: 1, createdAt: fixtureTime, updatedAt: fixtureTime});
  await db.insert(billingAccounts).values({workspaceId, status: 'active', version: 1, createdAt: fixtureTime, updatedAt: fixtureTime});
  await db.insert(billingCustomerHistory).values({workspaceId, ...customer, previousCustomerId: null, validFrom: fixtureTime, changeReason: 'Local notification fixture'});
  await db.insert(affiliateAttributions).values({workspaceId, creatorUserId: userId, workspaceUid: 'workspace:' + workspaceId, affiliateId: 'notification-affiliate', touchReference: 'notification-touch', programId: 'local-program', status: 'verified', policyVersion: 1, createdAt: fixtureTime});
  await db.insert(affiliatePayments).values({id: randomUUID(), workspaceId, ...payment, amountMinor: '1000', historyComplete: 'yes', firstPayment: 'yes', saleStatus: 'acknowledged', createdAt: fixtureTime});
  await db.insert(affiliateReviewRecords).values({id: reviewId, workspaceId, paymentReference, status: 'approve_pending', reason: 'Local pending approval', policyVersion: 1, reviewVersion: 7, accountCheckpointVersion: 0, refreshedAt: fixtureTime, createdAt: fixtureTime, updatedAt: fixtureTime});
  await db.insert(affiliateReviewActions).values({id: actionId, workspaceId, reviewId, actorUserId: userId, action: 'approve', payload: {}, payloadDigest: 'a'.repeat(64), policyVersion: 1, reviewVersion: 7, status: 'submitted', nextActionAt: new Date(fixtureTime.getTime() + 60_000), createdAt: fixtureTime, updatedAt: fixtureTime});
  const paymentAuthority: AffiliateNotificationAuthority = {...authority,
    async readHistory() {return {complete: true, customers: [customer], payments: [payment]};},
    async readCommission() {return {accountId: 'local-account', programId: 'local-program', paymentReference, status: 'eligible', checkedAt: new Date()};},
    async readNotification(input) {return {...await authority.readNotification!(input), payments: [{workspaceId, paymentReference}]};},
  };
  const reviewNotification = {...notification, eventId: randomUUID()};
  await ingestAffiliateNotification(db, reviewNotification);
  await processAffiliateNotification(db, reviewNotification.eventId, paymentAuthority);
  const pendingReview = (await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewId)))[0]!;
  assert.equal(pendingReview.status, 'approve_pending');
  assert.equal(pendingReview.reviewVersion, 7);
  assert.equal((await db.select().from(affiliateReviewActions).where(eq(affiliateReviewActions.id, actionId)))[0]!.status, 'submitted');
  cases.push('notification refresh cannot replace the status or version of a durable pending approval action');
  const raced = {...notification, eventId: randomUUID()};
  await ingestAffiliateNotification(db, raced);
  assert.equal(await processAffiliateNotification(db, raced.eventId, {...authority, readNotification: async input => {
    await db.update(affiliateSettings).set({policyVersion: 2}).where(eq(affiliateSettings.id, 'default'));
    return authority.readNotification!(input);
  }}), 'pending');
  let simulated = new Date();
  const slow = {...notification, eventId: randomUUID()};
  await ingestAffiliateNotification(db, slow, simulated);
  assert.equal(await processAffiliateNotification(db, slow.eventId, {...authority, readNotification: async input => {
    simulated = new Date(simulated.getTime() + 61_000);
    return {...await authority.readNotification!(input), checkedAt: simulated};
  }}, () => simulated), 'stale_lease');
  cases.push('policy changes and expired processing leases cannot acknowledge stale evidence');
  console.log(JSON.stringify({status: 'PASS', environment: 'isolated local Docker PostgreSQL', externalCalls: false, cases}, null, 2));
} finally {
  await database.pool.end();
  await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [name]);
  await admin.query(`drop database "${name}"`);
  await admin.end();
}
