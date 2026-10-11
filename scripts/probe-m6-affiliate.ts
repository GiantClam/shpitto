import {createHmac} from 'node:crypto';

import {defaultAffiliateConfig, workspaceUid} from '../src/modules/affiliates/contracts.ts';
import {bindAttribution, chooseLastValidTouch, createReferralToken, verifyReferralToken} from '../src/modules/affiliates/attribution.ts';
import {AFFILIATE_ELIGIBILITY_DELAY_MS, resolveFirstPayment} from '../src/modules/affiliates/eligibility.ts';
import {isDuplicateDelivery, refundIntent, saleIntent} from '../src/modules/affiliates/delivery.ts';
import {incrementalRefundDecision} from '../src/modules/affiliates/refunds.ts';
import {assertCampaignRevision, shouldDenyLaterPayment} from '../src/modules/affiliates/policy.ts';
import {approveReview, denyReview, reviewFresh, type CommissionReview, type CommissionReviewEvidence} from '../src/modules/affiliates/commission-review.ts';
import {canHandoffPayout} from '../src/modules/affiliates/payout-guard.ts';
import {evaluateAbuse} from '../src/modules/affiliates/abuse-review.ts';
import {createDisabledFirstPromoterAdapter} from '../src/adapters/affiliates/firstpromoter.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function rejects(work: () => unknown, message: string): void {
  let rejected = false;
  try { work(); } catch { rejected = true; }
  assert(rejected, message);
}

const workspaceId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-10-04T00:00:00.000Z');
const config = defaultAffiliateConfig({enabled: 'enabled', programId: 'buyer-program'});

async function run(): Promise<void> {
  assert(defaultAffiliateConfig().enabled === 'disabled', 'Affiliate integration must be disabled by default.');
  const disabledAdapter = createDisabledFirstPromoterAdapter(config);
  assert(!await disabledAdapter.verifyReference({affiliateId: 'unverified', touchReference: 'unverified', programId: 'buyer-program'}), 'An unavailable adapter verified an arbitrary reference.');
  const unavailable = await Promise.allSettled([disabledAdapter.readAccount(), disabledAdapter.deliver({eventKind: 'sale', eventReference: 'pay-1', workspaceUid: workspaceUid(workspaceId), payloadDigest: '0'.repeat(64)})]);
  assert(unavailable.every((result) => result.status === 'rejected'), 'An unavailable adapter fabricated readback or delivery state.');
  assert(workspaceUid(workspaceId) === 'workspace:' + workspaceId, 'Workspace UID is not stable.');
  const token = createReferralToken({affiliateId: 'aff-1', touchReference: 'touch-1', programId: 'buyer-program'}, 'local-secret', now);
  assert(verifyReferralToken(token, 'local-secret', config, new Date(now.getTime() + 1000))?.touchReference === 'touch-1', 'Valid referral token was rejected.');
  assert(verifyReferralToken(token + 'x', 'local-secret', config, now) === null, 'Tampered referral token was accepted.');
  assert(verifyReferralToken(token + '.extra', 'local-secret', config, now) === null, 'Extra token segments were accepted.');
  assert(verifyReferralToken(token, 'local-secret', config, new Date(now.getTime() - 1)) === null, 'Future referral touch was accepted.');
  assert(verifyReferralToken(token, 'local-secret', config, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) === null, 'Expired referral touch was accepted.');
  assert(verifyReferralToken(token, 'local-secret', defaultAffiliateConfig(), now) === null, 'Referral was accepted without a configured program.');
  const oversizedLifetime = Buffer.from(JSON.stringify({affiliateId: 'aff-1', touchReference: 'touch-1', programId: 'buyer-program', capturedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString()})).toString('base64url');
  const oversizedToken = oversizedLifetime + '.' + createHmac('sha256', 'local-secret').update(oversizedLifetime).digest('base64url');
  assert(verifyReferralToken(oversizedToken, 'local-secret', config, now) === null, 'Signed referral exceeded the 30-day bound.');
  rejects(() => createReferralToken({affiliateId: '', touchReference: 'touch-1', programId: 'buyer-program'}, 'local-secret', now), 'Empty referral identity was signed.');
  assert(verifyReferralToken(token, 'local-secret', defaultAffiliateConfig({enabled: 'enabled', programId: 'other'}), now) === null, 'Foreign-program referral token was accepted.');
  const touch = verifyReferralToken(token, 'local-secret', config, now)!;
  const newer = {...touch, touchReference: 'touch-2', capturedAt: new Date(now.getTime() + 2000)};
  assert(chooseLastValidTouch([touch, newer], new Date(now.getTime() + 3000))?.touchReference === 'touch-2', 'Last valid referral touch did not win.');
  assert(bindAttribution(null, workspaceId, touch).touchReference === 'touch-1', 'Initial attribution was not bound.');
  assert(bindAttribution({workspaceId, touchReference: 'touch-1'}, workspaceId, newer).touchReference === 'touch-1', 'Attribution was mutable.');
  const payment = {paymentReference: 'pay-1', kind: 'subscription' as const, paidAt: new Date(now.getTime() - AFFILIATE_ELIGIBILITY_DELAY_MS - 1), amountMinor: 1200n, currency: 'usd', historyComplete: true};
  assert(resolveFirstPayment([payment], now).firstPaymentReference === 'pay-1', 'First payment was not selected chronologically.');
  assert(resolveFirstPayment([{...payment, paymentReference: 'pay-2', historyComplete: false}], now).status === 'held', 'Incomplete history did not hold export.');
  assert(resolveFirstPayment([payment], now, 'pay-old').reason === 'older_payment_conflict', 'Late older payment did not create a conflict hold.');
  const sale = saleIntent(payment, workspaceUid(workspaceId));
  assert(isDuplicateDelivery([sale], sale), 'Duplicate sale delivery was not deduplicated.');
  const firstRefund = refundIntent('pay-1', 'refund-1', 200n, workspaceUid(workspaceId));
  const secondRefund = refundIntent('pay-1', 'refund-2', 200n, workspaceUid(workspaceId));
  assert(firstRefund.eventReference !== secondRefund.eventReference, 'Equal partial refunds collapsed into one identity.');
  assert(isDuplicateDelivery([firstRefund], refundIntent('pay-1', 'refund-1', 200n, workspaceUid(workspaceId))), 'Retry of the same refund changed its identity.');
  rejects(() => isDuplicateDelivery([firstRefund], refundIntent('pay-1', 'refund-1', 300n, workspaceUid(workspaceId))), 'Conflicting refund semantics were accepted.');
  assert(incrementalRefundDecision({saleAcknowledged: false, originalCashMinor: 1200n, alreadyExportedMinor: 0n, requestedMinor: 100n}).allowed === false, 'Refund before sale acknowledgement was allowed.');
  assert(incrementalRefundDecision({saleAcknowledged: true, originalCashMinor: 1200n, alreadyExportedMinor: 900n, requestedMinor: 400n}).reason === 'exceeds_cash_basis', 'Refund cumulative limit was not enforced.');
  assert(incrementalRefundDecision({saleAcknowledged: true, originalCashMinor: 1200n, alreadyExportedMinor: -500n, requestedMinor: 1300n}).allowed === false, 'Negative exported amount bypassed the refund basis.');
  assert(shouldDenyLaterPayment(config, 'pay-2', 'pay-1'), 'First-payment guard did not deny a later sale.');
  assertCampaignRevision(config, null);
  const review: CommissionReview = {status: 'eligible', reason: 'first payment', policyVersion: 1, reviewVersion: 1, accountCheckpointVersion: 1, refreshedAt: new Date(now.getTime() - 1000), accountCheckpointAt: now};
  const evidence: CommissionReviewEvidence = {policyVersion: 1, reviewVersion: 1, accountCheckpointVersion: 1, accountCheckpointAt: now, accountSyncStatus: 'succeeded', unresolvedHolds: 0, pendingDenials: 0};
  const approved = approveReview(review, evidence, now);
  assert(approved.status === 'approved', 'Fresh review could not be approved.');
  assert(denyReview(review).status === 'deny_pending', 'Review denial did not remain asynchronous.');
  for (const changed of [
    {...evidence, policyVersion: 2}, {...evidence, reviewVersion: 2}, {...evidence, accountCheckpointVersion: 2},
    {...evidence, accountSyncStatus: 'failed' as const}, {...evidence, accountSyncStatus: 'pending' as const},
    {...evidence, pendingDenials: 1}, {...evidence, unresolvedHolds: 1}, {...evidence, accountCheckpointAt: new Date(now.getTime() - 1)},
  ]) rejects(() => approveReview(review, changed, now), 'Changed or incomplete review evidence authorized approval.');
  for (const changed of [
    {...review, refreshedAt: new Date(now.getTime() + 1)}, {...review, refreshedAt: new Date(now.getTime() - 60_001)},
    {...review, accountCheckpointAt: new Date(now.getTime() - 300_001)}, {...review, accountCheckpointAt: new Date(now.getTime() + 1)},
    {...review, refreshedAt: null}, {...review, refreshedAt: new Date(NaN)},
  ]) assert(!reviewFresh(changed, {...evidence, accountCheckpointAt: changed.accountCheckpointAt}, now), 'Stale or future review evidence was accepted.');
  const handoff = {review: approved, evidence, providerDashboardUrl: 'https://app.firstpromoter.com/dashboard', approvedDashboardOrigin: 'https://app.firstpromoter.com', now};
  assert(canHandoffPayout(handoff), 'Fresh approved hosted handoff was blocked.');
  assert(!canHandoffPayout({...handoff, review}), 'Unapproved commission was allowed to hand off.');
  for (const providerDashboardUrl of ['https://evil.example', 'https://app.firstpromoter.com.evil.example', 'https://operator@app.firstpromoter.com', 'http://app.firstpromoter.com', 'invalid']) {
    assert(!canHandoffPayout({...handoff, providerDashboardUrl}), 'Unreviewed or unsafe dashboard origin was allowed.');
  }
  assert(!canHandoffPayout({...handoff, approvedDashboardOrigin: null}), 'Missing dashboard origin review was accepted.');
  assert(!canHandoffPayout({...handoff, evidence: {...evidence, pendingDenials: 1}}), 'Pending denial allowed payout handoff.');
  assert(evaluateAbuse({ownerMatchesAffiliate: true, workspacesAttributedLast24h: 1, sameInstrumentFingerprintCount: null}).status === 'held', 'Self-referral was not held.');
  assert(evaluateAbuse({ownerMatchesAffiliate: null, workspacesAttributedLast24h: 1, sameInstrumentFingerprintCount: null}).status === 'unknown', 'Missing abuse evidence was not marked unknown.');
  assert(evaluateAbuse({ownerMatchesAffiliate: false, workspacesAttributedLast24h: 4, sameInstrumentFingerprintCount: 1}).status === 'held', 'Abuse threshold was not held.');
  console.log(JSON.stringify({status: 'PASS', scope: 'local-pure-contracts-only', databaseVerified: false, providerVerified: false, runtimeIntegrationVerified: false, unavailableAdapterFailsClosed: true, signedReferralBounds: true, attributionHelper: true, chronologicalEligibilityHelper: true, deliveryIdentityConflicts: true, incrementalRefundIdentities: true, firstPaymentPolicyHelper: true, reviewEvidenceFences: true, approvedOriginPayoutGuard: true, abuseDecisionHelper: true}));
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

