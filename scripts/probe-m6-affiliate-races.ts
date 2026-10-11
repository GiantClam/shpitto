import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, Pool} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import * as schema from '../src/db/schema/index.ts';
import {affiliateCorrectionCases, affiliateDeliveryEvents, affiliatePayments, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../src/db/schema/affiliate.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {billingAccounts, billingCustomerHistory} from '../src/db/schema/billing.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {workspaces} from '../src/db/schema/workspace.ts';
import {runAffiliateReviewCommand} from '../src/modules/affiliates/commands.ts';
import {captureWorkspaceAttributionInTransaction, deliverAffiliateEvent, readAffiliateReviewEvidence, recordAffiliatePaymentInTransaction, reconcileAffiliateWorkspace, refreshAffiliateReview, synchronizeAffiliateAccount, verifyWorkspaceAttribution, type AffiliateAuthority} from '../src/modules/affiliates/runtime.ts';
import {processAffiliateReviewAction, runAffiliateSyncCycle} from '../src/modules/affiliates/sync.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {inTransaction} from '../src/modules/shared/transaction.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function fixture() {
  const base = new URL(getServerEnv().databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Local Docker database required.');
  const name = 'affiliate_race_' + randomUUID().replaceAll('-', '');
  const admin = new Client({connectionString: base.toString()});
  await admin.connect();
  await admin.query('CREATE DATABASE ' + name);
  base.pathname = '/' + name;
  const pool = new Pool({connectionString: base.toString()});
  const db = drizzle(pool, {schema});
  const close = async () => { await pool.end(); await admin.query('DROP DATABASE ' + name); await admin.end(); };
  try {
    await migrate(db, {migrationsFolder: 'src/db/migrations'});
    let now = new Date('2026-10-04T06:00:00.000Z');
    const createdAt = new Date(now.getTime() - 3600_000);
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const sessionId = randomUUID();
    const actor = {userId, sessionId};
    await db.insert(authUser).values({id: userId, email: userId + '@example.test', name: 'Race fixture', emailVerified: true, twoFactorEnabled: true, createdAt, updatedAt: createdAt});
    await db.insert(authSession).values({id: sessionId, userId, token: randomUUID(), expiresAt: new Date(now.getTime() + 3600_000), createdAt, updatedAt: createdAt});
    await db.insert(operatorRoles).values({userId, role: 'operator', version: 1, grantedAt: createdAt, updatedAt: createdAt});
    await recordTrustedSecondFactor(db, actor, now);
    await db.insert(workspaces).values({id: workspaceId, name: 'Local race fixture', kind: 'team', status: 'active', createdBy: userId, version: 1, createdAt, updatedAt: createdAt});
    await db.insert(billingAccounts).values({workspaceId, status: 'active', version: 1, createdAt, updatedAt: createdAt});
    const customers = [{provider: 'fixture', customerId: 'customer'}];
    await db.insert(billingCustomerHistory).values({workspaceId, ...customers[0]!, validFrom: createdAt, changeReason: 'fixture'});
    await db.update(affiliateSettings).set({enabled: 'enabled', accountId: 'account', programId: 'program', updatedAt: now}).where(eq(affiliateSettings.id, 'default'));
    const payment = {paymentReference: 'payment', kind: 'pack' as const, paidAt: new Date(now.getTime() - 600_000), amountMinor: 1000n, currency: 'usd', historyComplete: true};
    const payments = [payment];
    let sends = 0;
    const authority: AffiliateAuthority = {
      async verifyReference() { return 'verified'; },
      async readHistory() { return {complete: true, customers, payments}; },
      async readAccount() { return {accountId: 'account', programId: 'program', campaignRevision: 'first-payment-v1', automaticPayouts: false, firstPaymentOnly: true, complete: true, checkedAt: now}; },
      async readCommission(input) { return {accountId: 'account', programId: 'program', paymentReference: input.paymentReference, status: input.paymentReference === payment.paymentReference ? 'eligible' : 'denied', checkedAt: now}; },
      async deliver(input) { return {status: 'acknowledged', eventReference: input.eventReference, payloadDigest: input.payloadDigest}; },
      async sendReviewAction(input) { sends += 1; return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, batchReference: 'batch'}; },
      async readReviewAction(input) { return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, status: 'succeeded', providerStatus: 'approved'}; },
      async readAbuseSignals() { return {ownerMatchesAffiliate: false, sameInstrumentFingerprintCount: 1}; },
    };
    await inTransaction(db, async (tx) => {
      await captureWorkspaceAttributionInTransaction(tx, {workspaceId, creatorUserId: userId, touch: {affiliateId: 'affiliate', touchReference: 'touch', programId: 'program', capturedAt: createdAt, expiresAt: new Date(now.getTime() + 86400_000)}, now: createdAt});
      await recordAffiliatePaymentInTransaction(tx, {workspaceId, payment, now});
    });
    await synchronizeAffiliateAccount(db, authority, now);
    await verifyWorkspaceAttribution(db, workspaceId, authority, now);
    await reconcileAffiliateWorkspace(db, workspaceId, authority, now);
    const events = await db.select().from(affiliateDeliveryEvents);
    const signup = events.find((event) => event.eventKind === 'signup')!;
    const sale = events.find((event) => event.eventKind === 'sale')!;
    await deliverAffiliateEvent(db, signup.id, authority, now);
    await deliverAffiliateEvent(db, sale.id, authority, now);
    const review = await refreshAffiliateReview(db, {workspaceId, paymentReference: payment.paymentReference, authority, now});
    const approval = await runAffiliateReviewCommand(db, {actor, workspaceId, reviewId: review!.id, action: 'approve', expectedVersion: review!.reviewVersion, reason: 'Approve verified local fixture', idempotencyKey: randomUUID(), authority, now});
    const openHold = async () => { await inTransaction(db, async (tx) => { await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for('update'); await tx.insert(affiliateCorrectionCases).values({id: randomUUID(), workspaceId, paymentReference: 'payment', reason: 'fixture-new-hold', status: 'open', createdAt: now}); }); };
    const action = async () => (await db.select().from(affiliateReviewActions).where(eq(affiliateReviewActions.id, approval.actionId as string)))[0]!;
    const pending = async () => assert((await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, review!.id)))[0]?.status === 'approve_pending', 'Uncertain or invalidated approval falsely completed.');
    return {db, close, authority, workspaceId, payment, payments, review: review!, signup, sale, actionId: approval.actionId as string, openHold, action, pending, sends: () => sends, now: () => now, advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); }};
  } catch (error) { await close(); throw error; }
}

const completed: string[] = [];
async function check(name: string, test: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture();
  try { await test(f); completed.push(name); } finally { await f.close(); }
}

await check('hold-after-enqueue', async (f) => {
  await f.openHold();
  assert(await processAffiliateReviewAction(f.db, f.actionId, f.authority, f.now()) === 'not_ready' && f.sends() === 0, 'New hold did not prevent approval dispatch.');
  await f.pending();
});
await check('hold-during-request', async (f) => {
  const port = {...f.authority, async sendReviewAction(input: Parameters<NonNullable<AffiliateAuthority['sendReviewAction']>>[0]) { const result = await f.authority.sendReviewAction!(input); await f.openHold(); return result; }};
  assert(await processAffiliateReviewAction(f.db, f.actionId, port, f.now()) === 'submitted', 'In-flight hold did not fence approval completion.');
  await f.pending();
});
await check('checkpoint-during-request', async (f) => {
  const port = {...f.authority, async readReviewAction(input: Parameters<NonNullable<AffiliateAuthority['readReviewAction']>>[0]) { await synchronizeAffiliateAccount(f.db, f.authority, f.now()); return f.authority.readReviewAction!(input); }};
  assert(await processAffiliateReviewAction(f.db, f.actionId, port, f.now()) === 'submitted', 'Changed checkpoint did not fence approval completion.');
  await f.pending();
});
await check('lost-batch-response-readback-only', async (f) => {
  const port = {...f.authority, async sendReviewAction(input: Parameters<NonNullable<AffiliateAuthority['sendReviewAction']>>[0]): Promise<never> { await f.authority.sendReviewAction!(input); throw new Error('Response lost after provider acceptance.'); }};
  assert(await processAffiliateReviewAction(f.db, f.actionId, port, f.now()) === 'failed', 'Lost batch response did not remain retryable.');
  assert((await f.action()).providerBatchReference === null, 'Fault did not cover missing batch identity.');
  f.advance(60_000);
  assert(await processAffiliateReviewAction(f.db, f.actionId, port, f.now()) === 'succeeded' && f.sends() === 1, 'Unknown accepted batch was sent again instead of read back.');
});
await check('all-pages-and-missing-review-backlog', async (f) => {
  for (let i = 0; i < 5; i += 1) {
    const later = {...f.payment, paymentReference: 'later-' + i, paidAt: new Date(f.payment.paidAt.getTime() + i + 1)};
    f.payments.push(later);
    await inTransaction(f.db, (tx) => recordAffiliatePaymentInTransaction(tx, {workspaceId: f.workspaceId, payment: later, now: f.now()}));
  }
  await reconcileAffiliateWorkspace(f.db, f.workspaceId, f.authority, f.now());
  const rows = await f.db.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.eventKind, 'sale'), eq(affiliateDeliveryEvents.status, 'pending')));
  for (const row of rows) await deliverAffiliateEvent(f.db, row.id, f.authority, f.now());
  const state = await inTransaction(f.db, (tx) => readAffiliateReviewEvidence(tx, f.review.id, f.now()));
  assert(state.evidence.pendingDenials >= 5, 'Unreviewed exported commissions were absent from the backlog.');
  await runAffiliateSyncCycle(f.db, f.authority, {now: f.now(), batchSize: 2, force: true});
  assert((await f.db.select().from(affiliateReviewRecords)).length === 6, 'Fixed batch size starved later commission reviews.');
});
await check('delivery-completion-live-clock', async (f) => {
  await f.db.update(affiliateDeliveryEvents).set({status: 'pending', nextActionAt: f.now(), acknowledgedAt: null}).where(eq(affiliateDeliveryEvents.id, f.signup.id));
  const port = {...f.authority, async deliver(input: Parameters<AffiliateAuthority['deliver']>[0]) { f.advance(60_001); return f.authority.deliver(input); }};
  assert(await deliverAffiliateEvent(f.db, f.signup.id, port, undefined, f.now) === 'stale_completion', 'Expired delivery lease used request-start time.');
});
await check('sale-history-invalidated-during-delivery', async (f) => {
  await f.db.update(affiliateDeliveryEvents).set({status: 'pending', nextActionAt: f.now(), acknowledgedAt: null}).where(eq(affiliateDeliveryEvents.id, f.sale.id));
  const port = {...f.authority, async deliver(input: Parameters<AffiliateAuthority['deliver']>[0]) { await inTransaction(f.db, (tx) => recordAffiliatePaymentInTransaction(tx, {workspaceId: f.workspaceId, payment: {...f.payment, paymentReference: 'newly-discovered', paidAt: new Date(f.payment.paidAt.getTime() - 1000)}, now: f.now()})); return f.authority.deliver(input); }};
  assert(await deliverAffiliateEvent(f.db, f.sale.id, port, f.now()) === 'stale_completion', 'New history during sale delivery falsely acknowledged sale.');
});
for (const change of [{policyVersion: 2}, {accountId: 'replacement-account'}, {programId: 'replacement-program'}]) await check('delivery-config-fence-' + Object.keys(change)[0], async (f) => {
  await f.db.update(affiliateDeliveryEvents).set({status: 'pending', nextActionAt: f.now(), acknowledgedAt: null}).where(eq(affiliateDeliveryEvents.id, f.signup.id));
  const port = {...f.authority, async deliver(input: Parameters<AffiliateAuthority['deliver']>[0]) { await f.db.update(affiliateSettings).set(change).where(eq(affiliateSettings.id, 'default')); return f.authority.deliver(input); }};
  assert(await deliverAffiliateEvent(f.db, f.signup.id, port, f.now()) === 'stale_completion', 'Changed configuration accepted obsolete delivery completion.');
});
await check('approval-completion-live-clock', async (f) => {
  const port = {...f.authority, async readReviewAction(input: Parameters<NonNullable<AffiliateAuthority['readReviewAction']>>[0]) { f.advance(60_001); return f.authority.readReviewAction!(input); }};
  assert(await processAffiliateReviewAction(f.db, f.actionId, port, undefined, f.now) === 'submitted', 'Expired approval lease used request-start time.');
  await f.pending();
});
await check('account-completion-clock-and-policy-fence', async (f) => {
  const laterPort = {...f.authority, async readAccount() { f.advance(1000); return f.authority.readAccount(); }};
  assert(await synchronizeAffiliateAccount(f.db, laterPort, undefined, f.now) === 'succeeded', 'Readback checked after request start was incorrectly future-dated.');
  const changedPort = {...f.authority, async readAccount() { await f.db.update(affiliateSettings).set({policyVersion: 2}).where(eq(affiliateSettings.id, 'default')); return f.authority.readAccount(); }};
  assert(await synchronizeAffiliateAccount(f.db, changedPort, undefined, f.now) === 'stale_checkpoint', 'Changed policy allowed obsolete account checkpoint completion.');
});
console.log(JSON.stringify({status: 'PASS', scope: 'local-docker-disposable-postgresql', realAccountVerified: false, checks: completed}));
