import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, Pool} from 'pg';

import * as schema from '../src/db/schema/index.ts';
import {getServerEnv} from '../src/config/env.ts';
import {DomainError} from '../src/db/contracts.ts';
import {affiliateAttributions, affiliateCorrectionCases, affiliateDeliveryEvents, affiliatePayments, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../src/db/schema/affiliate.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {auditEvents} from '../src/db/schema/credit.ts';
import {billingAccounts, billingCustomerHistory, billingOrders} from '../src/db/schema/billing.ts';
import {creditAccounts, creditGrants, workspaces} from '../src/db/schema/workspace.ts';
import {inTransaction} from '../src/modules/shared/transaction.ts';
import type {AffiliatePayment, ReferralTouch} from '../src/modules/affiliates/contracts.ts';
import {captureWorkspaceAttributionInTransaction, deliverAffiliateEvent, readAffiliateReviewEvidence, recordAffiliateAbuseInTransaction, recordAffiliatePaymentInTransaction, recordAffiliateRefundInTransaction, reconcileAffiliateWorkspace, refreshAffiliateReview, synchronizeAffiliateAccount, verifyWorkspaceAttribution, type AffiliateAuthority} from '../src/modules/affiliates/runtime.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';
import {completePersonalWorkspaceOnboarding} from '../src/modules/workspaces/onboard.ts';
import {reconcilePayment} from '../src/modules/billing/reconcile-payment.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {changeAffiliatePolicy, handoffAffiliatePayout, releaseAffiliateAbuseHold, runAffiliateReviewCommand} from '../src/modules/affiliates/commands.ts';
import {deriveAffiliateAbuseSignals, processAffiliateReviewAction, runAffiliateSyncCycle} from '../src/modules/affiliates/sync.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function conflict(result: PromiseSettledResult<unknown>): boolean { return result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'CONFLICT'; }

async function run(): Promise<void> {
  const base = new URL(getServerEnv().databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('This probe requires an explicitly configured local Docker database.');
  const name = 'affiliate_probe_' + randomUUID().replaceAll('-', '');
  const admin = new Client({connectionString: base.toString()});
  await admin.connect();
  let pool: Pool | null = null;
  let created = false;
  try {
    await admin.query('CREATE DATABASE ' + name);
    created = true;
    const isolated = new URL(base);
    isolated.pathname = '/' + name;
    pool = new Pool({connectionString: isolated.toString(), max: 10});
    const db = drizzle(pool, {schema});
    await migrate(db, {migrationsFolder: 'src/db/migrations'});
    const now = new Date('2026-10-04T01:00:00.000Z');
    const createdAt = new Date(now.getTime() - 3600_000);
    const userId = 'affiliate-local-fixture-' + randomUUID();
    await db.insert(authUser).values({id: userId, name: 'Local affiliate probe', email: userId + '@example.test', emailVerified: true, createdAt, updatedAt: createdAt});
    const touch: ReferralTouch = {affiliateId: 'buyer-affiliate', touchReference: 'verified-touch', programId: 'buyer-program', capturedAt: new Date(createdAt.getTime() - 1000), expiresAt: new Date(now.getTime() + 86400_000)};
    async function workspace(candidate: ReferralTouch | null) {
      const workspaceId = randomUUID();
      await inTransaction(db, async (tx) => {
        await tx.insert(workspaces).values({id: workspaceId, kind: 'team', name: 'Affiliate DB fixture', createdBy: userId, status: 'active', version: 1, createdAt, updatedAt: createdAt});
        await tx.insert(billingAccounts).values({workspaceId, status: 'active', version: 1, createdAt, updatedAt: createdAt});
        await captureWorkspaceAttributionInTransaction(tx, {workspaceId, creatorUserId: userId, touch: candidate, now: createdAt});
      });
      return workspaceId;
    }
    const disabledWorkspace = await workspace(touch);
    assert((await db.select().from(affiliateAttributions)).length === 0, 'Disabled integration wrote affiliate state.');
    const noProvider = {async readHistory() { throw new Error('Disabled integration must not call provider ports.'); }} as unknown as AffiliateAuthority;
    assert(await reconcileAffiliateWorkspace(db, disabledWorkspace, noProvider, now) === 'disabled', 'Disabled reconciliation attempted provider I/O.');
    await db.update(affiliateSettings).set({enabled: 'enabled', accountId: 'buyer-account', programId: 'buyer-program', updatedAt: now}).where(eq(affiliateSettings.id, 'default'));
    const retro = await Promise.allSettled([inTransaction(db, (tx) => captureWorkspaceAttributionInTransaction(tx, {workspaceId: disabledWorkspace, creatorUserId: userId, touch, now}))]);
    assert(conflict(retro[0]!), 'Old disabled workspace accepted late attribution.');
    const unattributed = await workspace(null);
    await inTransaction(db, (tx) => captureWorkspaceAttributionInTransaction(tx, {workspaceId: unattributed, creatorUserId: userId, touch, now: createdAt}));
    assert((await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, unattributed)))[0]?.status === 'unattributed', 'Late referral replaced a sealed unattributed binding.');
    const workspaceId = await workspace(touch);
    const customers = [{provider: 'fixture', customerId: 'historical-customer'}, {provider: 'fixture', customerId: 'current-customer'}];
    await db.insert(billingCustomerHistory).values([
      {workspaceId, ...customers[0]!, previousCustomerId: null, validFrom: createdAt, validUntil: new Date(createdAt.getTime() + 1000), changeReason: 'fixture initial'},
      {workspaceId, ...customers[1]!, previousCustomerId: customers[0]!.customerId, validFrom: new Date(createdAt.getTime() + 1000), validUntil: null, changeReason: 'fixture replacement'},
    ]);
    const payment: AffiliatePayment = {paymentReference: 'canonical-first', kind: 'pack', paidAt: new Date(now.getTime() - 600_000), amountMinor: 1000n, currency: 'usd', historyComplete: true};
    const renewal: AffiliatePayment = {...payment, paymentReference: 'canonical-later', kind: 'subscription', paidAt: new Date(now.getTime() - 100_000)};
    const deliveries: string[] = [];
    const authority: AffiliateAuthority = {
      async verifyReference(candidate) { return candidate.touchReference === touch.touchReference ? 'verified' : 'invalid'; },
      async readHistory() { return {complete: true, customers, payments: [renewal, payment]}; },
      async readAccount() { return {accountId: 'buyer-account', programId: 'buyer-program', campaignRevision: 'first-payment-v1', automaticPayouts: false, firstPaymentOnly: true, complete: true, checkedAt: now}; },
      async readCommission(input) { return {accountId: 'buyer-account', programId: 'buyer-program', paymentReference: input.paymentReference, status: 'eligible', checkedAt: now}; },
      async deliver(input) { deliveries.push(input.eventKind + ':' + input.eventReference); return {status: 'acknowledged', eventReference: input.eventReference, payloadDigest: input.payloadDigest}; },
    };
    await synchronizeAffiliateAccount(db, authority, now);
    const unattributedCustomers = [{provider: 'fixture', customerId: 'unattributed-customer'}];
    await db.insert(billingCustomerHistory).values({workspaceId: unattributed, ...unattributedCustomers[0]!, validFrom: createdAt, changeReason: 'unattributed fixture'});
    const unattributedPayment = {...payment, paymentReference: 'unattributed-first'};
    const unattributedAuthority = {...authority, async readHistory() { return {complete: true, customers: unattributedCustomers, payments: [unattributedPayment]}; }};
    assert(await reconcileAffiliateWorkspace(db, unattributed, unattributedAuthority, now) === 'unattributed', 'Unattributed workspace did not reconcile billing history.');
    const unattributedFirst = (await db.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, unattributed)))[0]!;
    assert(unattributedFirst.firstPayment === 'yes' && unattributedFirst.saleStatus === 'held', 'Unattributed payment did not consume the first-payment slot without exporting.');
    const unattributedEvent = (await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.workspaceId, unattributed)))[0]!;
    assert(await deliverAffiliateEvent(db, unattributedEvent.id, authority, now) === 'not_ready', 'Unattributed sale was sent to affiliate tracking.');
    const invalidWorkspace = await workspace({...touch, touchReference: 'invalid-touch'});
    await verifyWorkspaceAttribution(db, invalidWorkspace, authority, now);
    const invalidCustomers = [{provider: 'fixture', customerId: 'invalid-referral-customer'}];
    await db.insert(billingCustomerHistory).values({workspaceId: invalidWorkspace, ...invalidCustomers[0]!, validFrom: createdAt, changeReason: 'invalid referral fixture'});
    assert(await reconcileAffiliateWorkspace(db, invalidWorkspace, {...authority, async readHistory() { return {complete: true, customers: invalidCustomers, payments: [{...payment, paymentReference: 'invalid-referral-first'}]}; }}, now) === 'unattributed', 'Invalid referral did not reconcile its first payment.');
    assert((await db.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, invalidWorkspace)))[0]?.firstPayment === 'yes', 'Invalid referral left the first-payment slot unconsumed.');
    assert(await verifyWorkspaceAttribution(db, workspaceId, {...authority, async verifyReference() { throw new Error('fixture transient outage'); }}, now) === 'pending', 'Transient verifier failure discarded the candidate.');
    await Promise.all([verifyWorkspaceAttribution(db, workspaceId, authority, now), verifyWorkspaceAttribution(db, workspaceId, authority, now)]);
    assert((await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.eventKind, 'signup'))).length === 1, 'Concurrent verification duplicated signup.');
    await Promise.all([payment, payment, renewal].map((p) => inTransaction(db, (tx) => recordAffiliatePaymentInTransaction(tx, {workspaceId, payment: p, now}))));
    assert((await db.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, workspaceId))).length === 2, 'Canonical payment retry duplicated payment state.');
    assert(await reconcileAffiliateWorkspace(db, workspaceId, {...authority, async readHistory() { return {complete: true, customers: [customers[1]!], payments: [payment, renewal]}; }}, now) === 'history_incomplete', 'Partial historical customer coverage was accepted.');
    assert(await reconcileAffiliateWorkspace(db, workspaceId, authority, new Date(now.getTime() - 400_000)) === 'waiting', 'Five-minute eligibility window was bypassed.');
    const reconciled = await Promise.all([reconcileAffiliateWorkspace(db, workspaceId, authority, now), reconcileAffiliateWorkspace(db, workspaceId, authority, now)]);
    assert(reconciled.every((status) => status === 'ready'), 'Concurrent history reconciliation did not converge.');
    assert((await db.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, workspaceId), eq(affiliatePayments.firstPayment, 'yes'))))[0]?.paymentReference === payment.paymentReference, 'Arrival order replaced canonical chronological first payment.');
    const refund = (reference: string, amountMinor: bigint) => inTransaction(db, (tx) => recordAffiliateRefundInTransaction(tx, {workspaceId, paymentReference: payment.paymentReference, refundReference: reference, amountMinor, now}));
    const initialRefund = await refund('refund-1', 200n);
    assert(initialRefund?.status === 'held', 'Refund did not wait for sale acknowledgement.');
    const events = await db.select().from(affiliateDeliveryEvents);
    const firstSale = events.find((event) => event.eventKind === 'sale' && event.eventReference === payment.paymentReference)!;
    const laterSale = events.find((event) => event.eventKind === 'sale' && event.eventReference === renewal.paymentReference)!;
    const signup = events.find((event) => event.eventKind === 'signup')!;
    assert(await deliverAffiliateEvent(db, firstSale.id, authority, now) === 'not_ready', 'Sale bypassed signup acknowledgement.');
    await deliverAffiliateEvent(db, signup.id, authority, now);
    await Promise.all([deliverAffiliateEvent(db, firstSale.id, authority, now), deliverAffiliateEvent(db, firstSale.id, authority, now)]);
    await deliverAffiliateEvent(db, laterSale.id, authority, now);
    assert(deliveries.filter((event) => event === 'sale:' + payment.paymentReference).length === 1, 'Concurrent delivery submitted the same claimed sale twice.');
    assert(await deliverAffiliateEvent(db, initialRefund!.id, authority, now) === 'acknowledged', 'Sale acknowledgement did not release its refund.');
    await Promise.all([refund('refund-2', 200n), refund('refund-2', 200n)]);
    assert((await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.eventKind, 'refund'))).length === 2, 'Equal partial cash refunds or duplicate retry lost their distinct identities.');
    const excess = await Promise.allSettled([refund('refund-3', 400n), refund('refund-4', 400n)]);
    assert(excess.filter((result) => result.status === 'fulfilled').length === 1 && excess.some(conflict), 'Concurrent cash refunds exceeded the sale basis.');
    const changedRefund = await Promise.allSettled([refund('refund-1', 201n)]);
    assert(conflict(changedRefund[0]!), 'Refund retry changed its amount.');
    assert(await synchronizeAffiliateAccount(db, authority, now) === 'succeeded', 'Complete account fixture failed to persist checkpoint.');
    const reviewed = await refreshAffiliateReview(db, {workspaceId, paymentReference: payment.paymentReference, authority, now});
    assert(reviewed?.status === 'eligible', 'First payment did not receive an eligible persisted review.');
    assert(!(await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, now))).fresh, 'Missing acknowledged-sale review was omitted from account backlog.');
    assert(!(await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, new Date(now.getTime() + 60_001)))).fresh, 'Stale persisted row was accepted.');
    const laterReview = await refreshAffiliateReview(db, {workspaceId, paymentReference: renewal.paymentReference, authority, now});
    assert(laterReview?.status === 'deny_pending', 'Later commission under first-payment policy did not await denial.');
    assert(!(await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, now))).fresh, 'Account pending-denial backlog allowed approval.');
    await refreshAffiliateReview(db, {workspaceId, paymentReference: renewal.paymentReference, authority: {...authority, async readCommission(input) { return {...await authority.readCommission(input), status: 'denied'}; }}, now});
    assert((await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, now))).fresh, 'Authoritative completed denial did not clear the backlog.');
    assert(await synchronizeAffiliateAccount(db, {...authority, async readAccount() { throw new Error('fixture readback unavailable'); }}, now) === 'failed', 'Account refresh failure was not durable.');
    assert(!(await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, now))).fresh, 'Failed checkpoint preserved stale approval readiness.');
    await synchronizeAffiliateAccount(db, authority, now);
    assert(!(await inTransaction(db, (tx) => readAffiliateReviewEvidence(tx, reviewed!.id, now))).fresh, 'Changed checkpoint generation did not fence old review.');

    const sessionId = 'affiliate-command-session';
    await db.update(authUser).set({twoFactorEnabled: true}).where(eq(authUser.id, userId));
    await db.insert(operatorRoles).values({userId, role: 'superadmin', grantedAt: now, version: 1, updatedAt: now});
    await db.insert(authSession).values({id: sessionId, userId, token: 'local-affiliate-command-session-token', expiresAt: new Date(now.getTime() + 3600_000), createdAt: now, updatedAt: now});
    const actor = {userId, sessionId};
    await recordTrustedSecondFactor(db, actor, now);
    let commandNow = now;
    let batchStatus: 'pending' | 'failed' | 'succeeded' = 'pending';
    const commissionStatuses = new Map<string, 'eligible' | 'approved' | 'denied'>([[payment.paymentReference, 'eligible'], [renewal.paymentReference, 'denied']]);
    let sends = 0;
    const commandAuthority: AffiliateAuthority = {
      ...authority,
      async readAccount() { return {...await authority.readAccount(), checkedAt: commandNow}; },
      async readCommission(input) { return {...await authority.readCommission(input), status: commissionStatuses.get(input.paymentReference) ?? 'eligible', checkedAt: commandNow}; },
      async sendReviewAction(input) { sends += 1; return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, batchReference: 'fixture-batch:' + input.actionReference}; },
      async readReviewAction(input) {
        const intended = input.action === 'approve' ? 'approved' as const : 'denied' as const;
        if (batchStatus === 'succeeded') commissionStatuses.set(input.paymentReference, intended);
        return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, status: batchStatus, providerStatus: batchStatus === 'succeeded' ? intended : batchStatus};
      },
      async readAbuseSignals() { return {ownerMatchesAffiliate: false, sameInstrumentFingerprintCount: 1}; },
    };
    const policyInput = {actor, expectedVersion: 1, idempotencyKey: 'affiliate-policy-1', reason: 'Review the fixture manual-payout campaign', commissionPolicy: 'first_payment' as const, providerCampaignRevision: 'first-payment-v1', approvedDashboardOrigin: 'https://app.firstpromoter.com', dashboardUrl: 'https://app.firstpromoter.com/dashboard', authority: commandAuthority, now: commandNow};
    const policy = await changeAffiliatePolicy(db, policyInput);
    assert(policy.version === 2 && (await changeAffiliatePolicy(db, policyInput)).replayed, 'Reviewed campaign command did not preserve version/idempotency.');
    assert(conflict((await Promise.allSettled([changeAffiliatePolicy(db, {...policyInput, idempotencyKey: 'stale-policy'})]))[0]!), 'Stale policy update was accepted.');
    const reviewBeforeCommand = (await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewed!.id)))[0]!;
    const approvalInput = {actor, workspaceId, reviewId: reviewed!.id, action: 'approve' as const, expectedVersion: reviewBeforeCommand.reviewVersion, idempotencyKey: 'affiliate-approve-audit-fault', reason: 'Approve a verified first-payment commission', authority: commandAuthority, now: commandNow};
    await pool.query("CREATE FUNCTION app.probe_reject_affiliate_audit() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''fixture audit write failed''; END'; CREATE TRIGGER probe_reject_affiliate_audit BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.probe_reject_affiliate_audit();");
    const auditFailure = await Promise.allSettled([runAffiliateReviewCommand(db, approvalInput)]);
    await pool.query('DROP TRIGGER probe_reject_affiliate_audit ON app.audit_events; DROP FUNCTION app.probe_reject_affiliate_audit();');
    assert(auditFailure[0]?.status === 'rejected' && (await db.select().from(affiliateReviewActions)).length === 0, 'Audit failure left a provider action intent.');
    const currentReview = (await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewed!.id)))[0]!;
    assert(currentReview.status === 'eligible', 'Audit failure partially changed the business review state.');
    const approvedInput = {...approvalInput, expectedVersion: currentReview.reviewVersion, idempotencyKey: 'affiliate-approve-1'};
    const approval = await runAffiliateReviewCommand(db, approvedInput);
    assert(approval.status === 'pending' && (await runAffiliateReviewCommand(db, approvedInput)).replayed, 'Approval intent was not pending/idempotent.');
    assert(conflict((await Promise.allSettled([runAffiliateReviewCommand(db, {...approvedInput, reason: 'Different approval semantics'})]))[0]!), 'Command-key semantic conflict was accepted.');
    assert(await processAffiliateReviewAction(db, approval.actionId as string, commandAuthority, commandNow) === 'submitted', 'Asynchronous action was falsely treated as completed.');
    commandNow = new Date(now.getTime() + 60_000);
    batchStatus = 'failed';
    assert(await processAffiliateReviewAction(db, approval.actionId as string, commandAuthority, commandNow) === 'failed', 'Failed provider batch was not visible.');
    assert((await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewed!.id)))[0]?.status === 'approve_pending', 'Failed batch advanced commission approval.');
    commandNow = new Date(now.getTime() + 120_000);
    batchStatus = 'succeeded';
    assert(await processAffiliateReviewAction(db, approval.actionId as string, commandAuthority, commandNow) === 'succeeded' && sends === 1, 'Batch retry resubmitted an already-known external action.');
    const completedReview = (await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewed!.id)))[0]!;
    const handoff = await handoffAffiliatePayout(db, {actor, workspaceId, reviewId: reviewed!.id, expectedVersion: completedReview.reviewVersion, idempotencyKey: 'affiliate-handoff-1', reason: 'Review the hosted manual settlement dashboard', authority: commandAuthority, now: commandNow});
    assert(handoff.fundsTransferred === false && handoff.dashboardUrl === policyInput.dashboardUrl, 'Audited hosted handoff claimed funds movement or wrong origin.');
    const cycle = await runAffiliateSyncCycle(db, commandAuthority, {now: commandNow});
    assert(cycle.status === 'processed' && (await runAffiliateSyncCycle(db, commandAuthority, {now: commandNow})).status === 'not_due', 'Persisted five-minute sync schedule did not fence repeated worker ticks.');
    const beforeAbuse = (await db.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, workspaceId), eq(affiliatePayments.firstPayment, 'yes'))))[0]!.paymentReference;
    await deriveAffiliateAbuseSignals(db, workspaceId, {...commandAuthority, async readAbuseSignals() { return {ownerMatchesAffiliate: true, sameInstrumentFingerprintCount: 1}; }}, commandNow);
    const abuseCase = (await db.select().from(affiliateCorrectionCases).where(and(eq(affiliateCorrectionCases.workspaceId, workspaceId), eq(affiliateCorrectionCases.reason, 'abuse:self-referral'))))[0]!;
    const releaseInput = {actor, workspaceId, caseId: abuseCase.id, expectedVersion: abuseCase.version, idempotencyKey: 'affiliate-release-1', reason: 'Independent evidence confirms a legitimate referral', authority: commandAuthority, now: commandNow};
    assert((await releaseAffiliateAbuseHold(db, releaseInput)).status === 'resolved' && (await releaseAffiliateAbuseHold(db, releaseInput)).replayed, 'Reasoned abuse release did not commit/replay its audit.');
    assert((await db.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, workspaceId), eq(affiliatePayments.firstPayment, 'yes'))))[0]!.paymentReference === beforeAbuse, 'Abuse release reset first-payment eligibility.');
    assert((await db.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId))).length >= 6, 'Affiliate commands or async completion lost audit evidence.');
    await synchronizeAffiliateAccount(db, authority, now);
    const older: AffiliatePayment = {...payment, paymentReference: 'late-discovered-older', paidAt: new Date(payment.paidAt.getTime() - 1000)};
    await inTransaction(db, (tx) => recordAffiliatePaymentInTransaction(tx, {workspaceId, payment: older, now}));
    assert((await db.select().from(affiliatePayments).where(eq(affiliatePayments.paymentReference, payment.paymentReference)))[0]?.historyComplete === 'no', 'New canonical observation left stale history eligible.');
    assert(await reconcileAffiliateWorkspace(db, workspaceId, {...authority, async readHistory() { return {complete: true, customers, payments: [older, renewal, payment]}; }}, now) === 'older_payment_conflict', 'Older discovery silently rewrote first-payment identity.');
    assert((await db.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, workspaceId), eq(affiliatePayments.firstPayment, 'yes'))))[0]?.paymentReference === payment.paymentReference, 'Exported first payment changed after conflict.');
    await inTransaction(db, (tx) => recordAffiliateAbuseInTransaction(tx, {workspaceId, ownerMatchesAffiliate: true, workspacesAttributedLast24h: 4, sameInstrumentFingerprintCount: null, now}));
    const holds = await db.select().from(affiliateCorrectionCases).where(eq(affiliateCorrectionCases.workspaceId, workspaceId));
    assert(holds.some((hold) => hold.reason === 'older_payment_conflict') && holds.some((hold) => hold.reason === 'abuse:self-referral'), 'Eligibility/abuse holds did not persist.');
    const rolledBack: AffiliatePayment = {...payment, paymentReference: 'rollback-payment'};
    await Promise.allSettled([inTransaction(db, async (tx) => { await recordAffiliatePaymentInTransaction(tx, {workspaceId, payment: rolledBack, now}); throw new Error('fixture transaction failure'); })]);
    assert((await db.select().from(affiliatePayments).where(eq(affiliatePayments.paymentReference, rolledBack.paymentReference))).length === 0 && (await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.eventReference, rolledBack.paymentReference))).length === 0, 'Affiliate observation/outbox partially committed.');
    const retryWorkspace = await workspace(touch);
    await verifyWorkspaceAttribution(db, retryWorkspace, authority, now);
    const retryEvent = (await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.workspaceId, retryWorkspace)))[0]!;
    assert(await deliverAffiliateEvent(db, retryEvent.id, {...authority, async deliver() { throw new Error('fixture transport outage'); }}, now) === 'failed', 'Delivery outage was not persisted for retry.');
    assert(await deliverAffiliateEvent(db, retryEvent.id, authority, now) === 'not_ready', 'Failed delivery ignored next-action backoff.');
    const retryAt = new Date(now.getTime() + 60_000);
    assert(await deliverAffiliateEvent(db, retryEvent.id, {...authority, async deliver(input) { return {status: 'acknowledged', eventReference: 'foreign-event', payloadDigest: input.payloadDigest}; }}, retryAt) === 'failed', 'Unrelated acknowledgement advanced delivery state.');
    assert(await deliverAffiliateEvent(db, retryEvent.id, authority, new Date(now.getTime() + 120_000)) === 'acknowledged', 'Stable event could not retry after provider outage.');
    const deliveredRetry = (await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.id, retryEvent.id)))[0]!;
    assert(deliveredRetry.attempts === 3 && deliveredRetry.payloadDigest === retryEvent.payloadDigest, 'Delivery retry changed the durable payload or lost attempt evidence.');
    const realNow = new Date();
    const rootTouch = {...touch, capturedAt: new Date(realNow.getTime() - 1000), expiresAt: new Date(realNow.getTime() + 86400_000)};
    const createIdentity = {actorUserId: userId, commandName: 'workspace.create-team', idempotencyKey: 'affiliate-root-team', payload: {name: 'Root affiliate team'}};
    const team = await createTeamWorkspace(db, {userId}, 'Root affiliate team', createIdentity, rootTouch);
    const teamRetry = await createTeamWorkspace(db, {userId}, 'Root affiliate team', createIdentity, {...rootTouch, touchReference: 'replacement-touch'});
    assert(teamRetry.workspaceId === team.workspaceId && teamRetry.replayed, 'Root team creation retry did not converge.');
    assert((await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, team.workspaceId)))[0]?.touchReference === rootTouch.touchReference, 'Root team hook lost or replaced creator attribution.');
    const personal = await completePersonalWorkspaceOnboarding(db, userId, 'Root affiliate personal', {referralTouch: rootTouch});
    await completePersonalWorkspaceOnboarding(db, userId, 'Root affiliate personal', {referralTouch: {...rootTouch, touchReference: 'replacement-touch'}});
    assert((await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, personal.workspaceId)))[0]?.touchReference === rootTouch.touchReference, 'Root onboarding hook changed the sealed referral on retry.');
    await db.insert(creditAccounts).values({workspaceId: team.workspaceId, version: 0n, createdAt: realNow, updatedAt: realNow});
    await db.insert(billingCustomerHistory).values({workspaceId: team.workspaceId, provider: 'fixture', customerId: 'root-billing-customer', previousCustomerId: null, validFrom: realNow, validUntil: null, changeReason: 'root hook fixture'});
    const effectivePaidAt = new Date(realNow.getTime() - 600_000).toISOString();
    const paid = await reconcilePayment(db, {provider: 'fixture', eventId: 'root-payment-event', eventType: 'payment_intent.succeeded', workspaceId: team.workspaceId, customerId: 'root-billing-customer', paymentIntentId: 'root-payment-intent', productKey: 'fixture-pack', amountMinor: '900', currency: 'usd', paidAt: effectivePaidAt}, realNow);
    const paidRetry = await reconcilePayment(db, {provider: 'fixture', eventId: 'root-invoice-event', eventType: 'invoice.paid', workspaceId: team.workspaceId, customerId: 'root-billing-customer', paymentIntentId: 'root-payment-intent', invoiceId: 'root-invoice', amountMinor: '900', currency: 'usd', paidAt: effectivePaidAt}, realNow);
    assert(paid.status === 'paid' && paidRetry.orderId === paid.orderId && paidRetry.grantId === paid.grantId, 'Root billing aliases did not converge on one order/grant.');
    const hookedPayments = await db.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, team.workspaceId));
    const hookedEvents = await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.workspaceId, team.workspaceId));
    assert(hookedPayments.length === 1 && hookedPayments[0]!.paymentReference === paid.orderId && hookedPayments[0]!.paidAt.toISOString() === effectivePaidAt && hookedEvents.length === 1 && hookedEvents[0]!.status === 'held', 'Billing hook did not persist canonical time and held affiliate intent.');
    assert((await db.select().from(creditGrants).where(eq(creditGrants.workspaceId, team.workspaceId))).length === 1, 'Affiliate hold interfered with purchased credits.');
    await pool.query("CREATE FUNCTION app.probe_reject_credit() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''fixture credit write failed''; END'; CREATE TRIGGER probe_reject_credit BEFORE INSERT ON app.credit_grants FOR EACH ROW EXECUTE FUNCTION app.probe_reject_credit();");
    const failedBilling = await Promise.allSettled([reconcilePayment(db, {provider: 'fixture', eventId: 'root-rollback-event', eventType: 'payment_intent.succeeded', workspaceId: team.workspaceId, customerId: 'root-billing-customer', paymentIntentId: 'root-rollback-intent', productKey: 'fixture-pack', amountMinor: '900', currency: 'usd', paidAt: effectivePaidAt}, realNow)]);
    await pool.query('DROP TRIGGER probe_reject_credit ON app.credit_grants; DROP FUNCTION app.probe_reject_credit();');
    assert(failedBilling[0]?.status === 'rejected', 'Credit failure injection did not fail billing.');
    assert((await db.select().from(billingOrders).where(eq(billingOrders.workspaceId, team.workspaceId))).length === 1 && (await db.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, team.workspaceId))).length === 1 && (await db.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.workspaceId, team.workspaceId))).length === 1 && (await db.select().from(creditGrants).where(eq(creditGrants.workspaceId, team.workspaceId))).length === 1, 'Credit failure left partial order/affiliate/outbox effects.');
    console.log(JSON.stringify({status: 'PASS', scope: 'local-docker-postgresql-with-injected-authoritative-fixtures', realAccountVerified: false, disposableDatabase: true, attributionSealed: true, transientCandidateRetained: true, concurrentCanonicalPayments: true, allHistoricalCustomersRequired: true, chronologicalFirstPayment: true, orderedLeasedDelivery: true, stableDeliveryRetries: true, equalPartialRefunds: true, concurrentRefundBasis: true, persistentReviewCheckpointFences: true, pendingDenialHold: true, auditedCommandsAndRollback: true, asyncBatchFailureAndReadback: true, reviewedHostedHandoff: true, persistedFiveMinuteSchedule: true, verifiedSignalAbuseRelease: true, olderPaymentConflict: true, persistentAbuseHold: true, atomicRollback: true, rootWorkspaceHooks: true, rootBillingCanonicalHook: true, rootBillingCreditFailureRollback: true}));
  } finally {
    await pool?.end();
    if (created) await admin.query('DROP DATABASE ' + name);
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
