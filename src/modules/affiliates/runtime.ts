import {randomUUID} from 'node:crypto';

import {and, asc, count, eq, gt, inArray, isNull, lt, ne, or} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {affiliateAttributions, affiliateCorrectionCases, affiliateDeliveryEvents, affiliatePayments, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../../db/schema/affiliate.ts';
import {billingCustomerHistory} from '../../db/schema/billing.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {serializeJsonValue} from '../../contracts/http.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {evaluateAbuse, type AbuseDecision} from './abuse-review.ts';
import {type AffiliatePayment, type ReferralTouch, workspaceUid} from './contracts.ts';
import {type CommissionReview, type CommissionReviewEvidence, reviewFresh} from './commission-review.ts';
import {deliveryIntent} from './delivery.ts';
import {AFFILIATE_ELIGIBILITY_DELAY_MS} from './eligibility.ts';
import {createFirstPromoterAuthority} from '../../adapters/affiliates/firstpromoter-live.ts';
import {getServerEnv} from '../../config/env.ts';

type Settings = typeof affiliateSettings.$inferSelect;
type AffiliateTx = TransactionDatabase;
type CustomerIdentity = Readonly<{provider: string; customerId: string}>;
function operationClock(at?: Date, clock?: () => Date): () => Date { return clock ?? (at ? () => at : () => new Date()); }
export type AffiliateHistory = Readonly<{complete: boolean; customers: readonly CustomerIdentity[]; payments: readonly AffiliatePayment[]}>;
export type AffiliateActionRequest = Readonly<{actionReference: string; action: 'approve' | 'deny'; accountId: string; programId: string; paymentReference: string; payloadDigest: string; batchReference: string | null}>;

/** Trusted server ports normalize verified remote identities; no runtime adapter is enabled by this module. */
export interface AffiliateAuthority {
  verifyReference(touch: ReferralTouch): Promise<'verified' | 'invalid' | 'unavailable'>;
  resolveReferral?(input: Readonly<{touchReference: string; programId: string; capturedAt: Date; expiresAt: Date}>): Promise<ReferralTouch | null>;
  readHistory(input: Readonly<{workspaceId: string; customers: readonly CustomerIdentity[]}>): Promise<AffiliateHistory>;
  readAccount(): Promise<Readonly<{accountId: string; programId: string; campaignRevision: string; automaticPayouts: boolean; firstPaymentOnly: boolean; complete: boolean; checkedAt: Date}>>;
  readCommission(input: Readonly<{workspaceId: string; paymentReference: string}>): Promise<Readonly<{accountId: string; programId: string; paymentReference: string; status: 'eligible' | 'approved' | 'denied' | 'pending'; checkedAt: Date}>>;
  deliver(input: Readonly<{accountId: string; programId: string; eventKind: string; eventReference: string; payloadDigest: string; payload: unknown}>): Promise<Readonly<{status: 'acknowledged' | 'pending'; eventReference: string; payloadDigest: string}>>;
  sendReviewAction?(input: AffiliateActionRequest): Promise<Readonly<{actionReference: string; payloadDigest: string; batchReference: string | null}>>;
  readReviewAction?(input: AffiliateActionRequest): Promise<Readonly<{actionReference: string; payloadDigest: string; status: 'pending' | 'succeeded' | 'failed'; providerStatus: string}>>;
  readAbuseSignals?(input: Readonly<{workspaceId: string; affiliateId: string; ownerUserIds: readonly string[]}>): Promise<Readonly<{ownerMatchesAffiliate: boolean | null; sameInstrumentFingerprintCount: number | null}>>;
}

export function createUnavailableAffiliateAuthority(): AffiliateAuthority {
  const unavailable = async (): Promise<never> => { throw new DomainError('INFRASTRUCTURE', 'Affiliate provider verification is unavailable.'); };
  return {verifyReference: unavailable, resolveReferral: unavailable, readHistory: unavailable, readAccount: unavailable, readCommission: unavailable, deliver: unavailable, sendReviewAction: unavailable, readReviewAction: unavailable, readAbuseSignals: unavailable};
}

/** Enable the live authority only when all acceptance/production guard inputs exist. */
export function createConfiguredAffiliateAuthority(): AffiliateAuthority {
  const env = getServerEnv();
  if (!env.firstPromoterAccountId || !env.firstPromoterApiKey || !env.affiliateProgramId) return createUnavailableAffiliateAuthority();
  return createFirstPromoterAuthority({
    accountId: env.firstPromoterAccountId,
    apiKey: env.firstPromoterApiKey,
    programId: env.affiliateProgramId,
    campaignRevision: env.affiliateProviderCampaignRevision,
    baseUrl: env.firstPromoterBaseUrl,
    autoPayoutsDisabledConfirmed: env.firstPromoterAutoPayoutsDisabledConfirmed,
    nativeStripeTrackingDisabledConfirmed: env.firstPromoterNativeStripeTrackingDisabledConfirmed,
  });
}

async function lockWorkspace(tx: AffiliateTx, workspaceId: string) {
  const row = (await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1))[0];
  if (!row) throw new DomainError('NOT_FOUND', 'Affiliate workspace was not found.');
  return row;
}

async function settings(tx: AffiliateTx): Promise<Settings | null> {
  return (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0] ?? null;
}

function enabled(value: Settings | null): value is Settings & {accountId: string; programId: string} {
  return value?.enabled === 'enabled' && Boolean(value.accountId && value.programId);
}

function validPayment(payment: AffiliatePayment): void {
  if (!payment.paymentReference.trim() || payment.paymentReference.length > 255 || !Number.isFinite(payment.paidAt.getTime()) || payment.amountMinor <= 0n || !/^[a-z]{3}$/.test(payment.currency) || !['subscription', 'pack'].includes(payment.kind)) throw new DomainError('VALIDATION', 'Affiliate payment evidence is invalid.');
}

async function correction(tx: AffiliateTx, workspaceId: string, paymentReference: string, reason: string, now: Date): Promise<void> {
  await tx.insert(affiliateCorrectionCases).values({id: randomUUID(), workspaceId, paymentReference, reason, status: 'open', createdAt: now, resolvedAt: null}).onConflictDoNothing();
}

async function hasHolds(tx: AffiliateTx, workspaceId: string): Promise<boolean> {
  return Boolean((await tx.select({id: affiliateCorrectionCases.id}).from(affiliateCorrectionCases).where(and(eq(affiliateCorrectionCases.workspaceId, workspaceId), eq(affiliateCorrectionCases.status, 'open'))).limit(1))[0]);
}

async function putDelivery(tx: AffiliateTx, input: Readonly<{workspaceId: string; eventKind: 'signup' | 'sale' | 'refund' | 'dispute'; eventReference: string; payload: unknown; paymentReference?: string; amountMinor?: bigint; status: 'pending' | 'held'; now: Date}>) {
  const intent = deliveryIntent(input.eventKind, input.eventReference, workspaceUid(input.workspaceId), input.payload);
  const prior = (await tx.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.eventKind, input.eventKind), eq(affiliateDeliveryEvents.eventReference, input.eventReference))).limit(1))[0];
  if (prior) {
    if (prior.workspaceId !== input.workspaceId || prior.payloadDigest !== intent.payloadDigest) throw new DomainError('CONFLICT', 'Affiliate event identity has conflicting semantics.');
    return prior;
  }
  return (await tx.insert(affiliateDeliveryEvents).values({id: randomUUID(), workspaceId: input.workspaceId, eventKind: input.eventKind, eventReference: input.eventReference, payloadDigest: intent.payloadDigest, payload: serializeJsonValue(input.payload), paymentReference: input.paymentReference ?? null, amountMinor: input.amountMinor?.toString() ?? null, status: input.status, attempts: 0, nextActionAt: input.now, acknowledgedAt: null, createdAt: input.now}).returning())[0]!;
}

/** Call in the workspace creation transaction. Missing referrals are sealed; disabled integration writes nothing. */
export async function captureWorkspaceAttributionInTransaction(tx: AffiliateTx, input: Readonly<{workspaceId: string; creatorUserId: string; touch: ReferralTouch | null; now?: Date}>) {
  const now = input.now ?? new Date();
  const config = await settings(tx);
  if (!enabled(config)) return null;
  const workspace = await lockWorkspace(tx, input.workspaceId);
  if (workspace.createdBy !== input.creatorUserId) throw new DomainError('FORBIDDEN', 'Only the workspace creator can bind its initial attribution.');
  const prior = (await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, input.workspaceId)).limit(1))[0];
  if (prior) return prior;
  if (workspace.createdAt.getTime() !== now.getTime()) throw new DomainError('CONFLICT', 'Attribution can only be captured during workspace creation.');
  const touch = input.touch;
  const valid = enabled(config) && touch && touch.programId === config.programId && touch.capturedAt <= workspace.createdAt && touch.expiresAt > now && now.getTime() - touch.capturedAt.getTime() <= 30 * 86400_000 && touch.expiresAt.getTime() - touch.capturedAt.getTime() <= 30 * 86400_000;
  return (await tx.insert(affiliateAttributions).values({workspaceId: input.workspaceId, creatorUserId: input.creatorUserId, workspaceUid: workspaceUid(input.workspaceId), affiliateId: valid ? touch.affiliateId : null, touchReference: valid ? touch.touchReference : null, programId: valid ? touch.programId : null, capturedAt: valid ? touch.capturedAt : null, expiresAt: valid ? touch.expiresAt : null, verifiedAt: null, status: valid ? 'pending' : 'unattributed', policyVersion: config?.policyVersion ?? 1, createdAt: now}).returning())[0]!;
}

/** Retries only the sealed candidate. A verifier failure never attaches another referral. */
export async function verifyWorkspaceAttribution(db: AppDatabase, workspaceId: string, authority: AffiliateAuthority, now = new Date()): Promise<string> {
  const prior = (await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, workspaceId)).limit(1))[0];
  if (!prior || prior.status !== 'pending') return prior?.status ?? 'unattributed';
  if (!prior.affiliateId || !prior.touchReference || !prior.programId || !prior.capturedAt || !prior.expiresAt) throw new DomainError('CONFLICT', 'Captured affiliate evidence is incomplete.');
  let outcome: 'verified' | 'invalid' | 'unavailable' = 'unavailable';
  try { outcome = await authority.verifyReference({affiliateId: prior.affiliateId, touchReference: prior.touchReference, programId: prior.programId, capturedAt: prior.capturedAt, expiresAt: prior.expiresAt}); } catch { /* Persisted pending state is retried by the caller. */ }
  return inTransaction(db, async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const current = (await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, workspaceId)).limit(1))[0]!;
    const config = await settings(tx);
    if (current.status !== 'pending' || outcome === 'unavailable') return current.status;
    if (!enabled(config) || config.programId !== prior.programId || config.policyVersion !== prior.policyVersion) return 'pending';
    await tx.update(affiliateAttributions).set({status: outcome, verifiedAt: outcome === 'verified' ? now : null}).where(eq(affiliateAttributions.workspaceId, workspaceId));
    if (outcome === 'verified') await putDelivery(tx, {workspaceId, eventKind: 'signup', eventReference: workspaceUid(workspaceId), payload: {uid: workspaceUid(workspaceId), affiliateId: prior.affiliateId, touchReference: prior.touchReference, programId: prior.programId}, status: 'pending', now});
    return outcome;
  });
}

/** Input is the already canonicalized, verified billing fact; this function makes no provider calls. */
export async function recordAffiliatePaymentInTransaction(tx: AffiliateTx, input: Readonly<{workspaceId: string; payment: AffiliatePayment; now?: Date}>) {
  const now = input.now ?? new Date();
  const config = await settings(tx);
  if (!enabled(config)) return null;
  validPayment(input.payment);
  await lockWorkspace(tx, input.workspaceId);
  const p = input.payment;
  const existing = (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, input.workspaceId), eq(affiliatePayments.paymentReference, p.paymentReference))).limit(1))[0];
  if (existing && (existing.paidAt.getTime() !== p.paidAt.getTime() || existing.amountMinor !== p.amountMinor.toString() || existing.currency !== p.currency || existing.kind !== p.kind)) throw new DomainError('CONFLICT', 'Canonical affiliate payment evidence changed.');
  if (!existing) {
    await tx.insert(affiliatePayments).values({id: randomUUID(), workspaceId: input.workspaceId, paymentReference: p.paymentReference, kind: p.kind, paidAt: p.paidAt, amountMinor: p.amountMinor.toString(), currency: p.currency, historyComplete: 'unknown', firstPayment: 'unknown', saleStatus: 'held', createdAt: now});
    // A newly observed older payment can invalidate eligibility before a pending sale is sent.
    await holdHistory(tx, input.workspaceId);
  }
  return putDelivery(tx, {workspaceId: input.workspaceId, eventKind: 'sale', eventReference: p.paymentReference, paymentReference: p.paymentReference, amountMinor: p.amountMinor, payload: {uid: workspaceUid(input.workspaceId), paymentReference: p.paymentReference, kind: p.kind, paidAt: p.paidAt.toISOString(), amountMinor: p.amountMinor.toString(), currency: p.currency}, status: 'held', now});
}

function customerKeys(customers: readonly CustomerIdentity[]): string {
  return JSON.stringify([...new Set(customers.map((customer) => customer.provider + ':' + customer.customerId))].sort());
}

async function holdHistory(tx: AffiliateTx, workspaceId: string): Promise<'history_incomplete'> {
  await tx.update(affiliatePayments).set({historyComplete: 'no'}).where(eq(affiliatePayments.workspaceId, workspaceId));
  await tx.update(affiliateDeliveryEvents).set({status: 'held'}).where(and(eq(affiliateDeliveryEvents.workspaceId, workspaceId), eq(affiliateDeliveryEvents.eventKind, 'sale'), inArray(affiliateDeliveryEvents.status, ['pending', 'failed'])));
  return 'history_incomplete';
}

export async function reconcileAffiliateWorkspace(db: AppDatabase, workspaceId: string, authority: AffiliateAuthority, at?: Date, clock?: () => Date): Promise<string> {
  const getNow = operationClock(at, clock);
  const initialConfig = (await db.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
  if (!initialConfig || !enabled(initialConfig)) return 'disabled';
  const customers = await db.select({provider: billingCustomerHistory.provider, customerId: billingCustomerHistory.customerId}).from(billingCustomerHistory).where(eq(billingCustomerHistory.workspaceId, workspaceId));
  let history: AffiliateHistory;
  try { history = await authority.readHistory({workspaceId, customers}); } catch {
    return inTransaction(db, async (tx) => { await lockWorkspace(tx, workspaceId); return holdHistory(tx, workspaceId); });
  }
  const now = getNow();
  return inTransaction(db, async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const config = await settings(tx);
    if (!enabled(config)) return 'disabled';
    if (config.policyVersion !== initialConfig.policyVersion || config.accountId !== initialConfig.accountId || config.programId !== initialConfig.programId) return holdHistory(tx, workspaceId);
    const attribution = (await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, workspaceId)).limit(1))[0];
    if (!attribution || !['verified', 'unattributed', 'invalid'].includes(attribution.status)) return 'attribution_unverified';
    const currentCustomers = await tx.select({provider: billingCustomerHistory.provider, customerId: billingCustomerHistory.customerId}).from(billingCustomerHistory).where(eq(billingCustomerHistory.workspaceId, workspaceId));
    if (!history.complete || customers.length === 0 || customerKeys(history.customers) !== customerKeys(currentCustomers) || history.payments.some((p) => !p.historyComplete)) return holdHistory(tx, workspaceId);
    const observed = await tx.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, workspaceId));
    if (observed.some((p) => !history.payments.some((h) => h.paymentReference === p.paymentReference))) return holdHistory(tx, workspaceId);
    for (const payment of history.payments) await recordAffiliatePaymentInTransaction(tx, {workspaceId, payment, now});
    const ordered = await tx.select().from(affiliatePayments).where(eq(affiliatePayments.workspaceId, workspaceId)).orderBy(asc(affiliatePayments.paidAt), asc(affiliatePayments.paymentReference));
    const first = ordered[0];
    if (!first) return 'no_payment';
    if (now.getTime() - first.paidAt.getTime() < AFFILIATE_ELIGIBILITY_DELAY_MS) return 'waiting';
    const frozen = ordered.find((p) => p.firstPayment === 'yes');
    if (frozen && frozen.paymentReference !== first.paymentReference) {
      await correction(tx, workspaceId, frozen.paymentReference, 'older_payment_conflict', now);
      await tx.update(affiliateDeliveryEvents).set({status: 'held'}).where(and(eq(affiliateDeliveryEvents.workspaceId, workspaceId), eq(affiliateDeliveryEvents.eventKind, 'sale'), inArray(affiliateDeliveryEvents.status, ['pending', 'failed'])));
      return 'older_payment_conflict';
    }
    if (await hasHolds(tx, workspaceId)) return 'held';
    if (!frozen) await tx.update(affiliatePayments).set({firstPayment: 'yes'}).where(eq(affiliatePayments.id, first.id));
    for (const payment of ordered) {
      await tx.update(affiliatePayments).set({historyComplete: 'yes', firstPayment: payment.id === first.id ? 'yes' : 'no', saleStatus: payment.saleStatus === 'acknowledged' ? 'acknowledged' : attribution.status === 'verified' ? 'pending' : 'held'}).where(eq(affiliatePayments.id, payment.id));
    }
    if (attribution.status !== 'verified') return 'unattributed';
    await tx.update(affiliateDeliveryEvents).set({status: 'pending'}).where(and(eq(affiliateDeliveryEvents.workspaceId, workspaceId), eq(affiliateDeliveryEvents.eventKind, 'sale'), eq(affiliateDeliveryEvents.status, 'held')));
    return 'ready';
  });
}

/** Confirmed cash refunds use the provider refund identity, including two equal partial amounts. */
export async function recordAffiliateRefundInTransaction(tx: AffiliateTx, input: Readonly<{workspaceId: string; paymentReference: string; refundReference: string; amountMinor: bigint; now?: Date}>) {
  const config = await settings(tx);
  if (!enabled(config)) return null;
  const now = input.now ?? new Date();
  await lockWorkspace(tx, input.workspaceId);
  if (!input.refundReference.trim() || input.amountMinor <= 0n) throw new DomainError('VALIDATION', 'A confirmed cash refund is required.');
  const payment = (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, input.workspaceId), eq(affiliatePayments.paymentReference, input.paymentReference))).limit(1))[0];
  if (!payment) throw new DomainError('NOT_FOUND', 'The canonical affiliate sale was not found.');
  const refunds = await tx.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.workspaceId, input.workspaceId), eq(affiliateDeliveryEvents.eventKind, 'refund'), eq(affiliateDeliveryEvents.paymentReference, input.paymentReference)));
  const prior = refunds.find((refund) => refund.eventReference === input.refundReference);
  const reserved = refunds.reduce((sum, refund) => sum + BigInt(refund.amountMinor ?? '0'), 0n);
  if (!prior && reserved + input.amountMinor > BigInt(payment.amountMinor)) throw new DomainError('CONFLICT', 'Cumulative affiliate cash refunds exceed the sale basis.');
  const sale = (await tx.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.workspaceId, input.workspaceId), eq(affiliateDeliveryEvents.eventKind, 'sale'), eq(affiliateDeliveryEvents.eventReference, input.paymentReference))).limit(1))[0];
  return putDelivery(tx, {workspaceId: input.workspaceId, eventKind: 'refund', eventReference: input.refundReference, paymentReference: input.paymentReference, amountMinor: input.amountMinor, payload: {uid: workspaceUid(input.workspaceId), paymentReference: input.paymentReference, refundReference: input.refundReference, amountMinor: input.amountMinor.toString(), currency: payment.currency}, status: sale?.status === 'acknowledged' ? 'pending' : 'held', now});
}

export async function recordAffiliateAbuseInTransaction(tx: AffiliateTx, input: Readonly<{workspaceId: string; ownerMatchesAffiliate: boolean | null; workspacesAttributedLast24h: number; sameInstrumentFingerprintCount: number | null; now?: Date}>): Promise<AbuseDecision> {
  const decision = evaluateAbuse(input);
  if (!enabled(await settings(tx))) return decision;
  await lockWorkspace(tx, input.workspaceId);
  if (decision.status !== 'clear') for (const reason of decision.reasons) await correction(tx, input.workspaceId, workspaceUid(input.workspaceId), 'abuse:' + reason, input.now ?? new Date());
  return decision;
}

/** Claim before the external request, then fence completion. Retries retain exactly the stored payload and identity. */
export async function deliverAffiliateEvent(db: AppDatabase, eventId: string, authority: AffiliateAuthority, at?: Date, clock?: () => Date): Promise<string> {
  const getNow = operationClock(at, clock);
  const now = getNow();
  const claimed = await inTransaction(db, async (tx) => {
    const hint = (await tx.select({workspaceId: affiliateDeliveryEvents.workspaceId}).from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.id, eventId)).limit(1))[0];
    if (!hint) return null;
    await lockWorkspace(tx, hint.workspaceId);
    const event = (await tx.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.id, eventId)).for('update').limit(1))[0];
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0] ?? null;
    if (!event || !enabled(config) || event.status === 'acknowledged' || event.status === 'held' || event.nextActionAt > now || (event.leaseUntil && event.leaseUntil > now)) return null;
    const checkpointAge = config.accountCheckpointAt ? now.getTime() - config.accountCheckpointAt.getTime() : Infinity;
    if (config.accountSyncStatus !== 'succeeded' || !Number.isFinite(checkpointAge) || checkpointAge < 0 || checkpointAge > 300_000 || config.autoPayoutEnabled !== 'disabled') return null;
    const attribution = (await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, event.workspaceId)).limit(1))[0];
    if (attribution?.status !== 'verified' || attribution.programId !== config.programId) return null;
    if (event.eventKind === 'sale') {
      if (await hasHolds(tx, event.workspaceId)) return null;
      const payment = (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, event.workspaceId), eq(affiliatePayments.paymentReference, event.eventReference))).limit(1))[0];
      if (payment?.historyComplete !== 'yes') return null;
      const signup = (await tx.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.workspaceId, event.workspaceId), eq(affiliateDeliveryEvents.eventKind, 'signup'))).limit(1))[0];
      if (signup?.status !== 'acknowledged') return null;
    }
    if (event.eventKind === 'refund') {
      const sale = (await tx.select().from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.workspaceId, event.workspaceId), eq(affiliateDeliveryEvents.eventKind, 'sale'), eq(affiliateDeliveryEvents.eventReference, event.paymentReference!))).limit(1))[0];
      if (sale?.status !== 'acknowledged') return null;
    }
    const leaseToken = randomUUID();
    await tx.update(affiliateDeliveryEvents).set({attempts: event.attempts + 1, leaseToken, leaseUntil: new Date(now.getTime() + 60_000)}).where(eq(affiliateDeliveryEvents.id, eventId));
    return {event, config, leaseToken};
  });
  if (!claimed) return 'not_ready';
  let outcome: 'acknowledged' | 'pending' | 'failed' = 'failed';
  try {
    const result = await authority.deliver({accountId: claimed.config.accountId, programId: claimed.config.programId, eventKind: claimed.event.eventKind, eventReference: claimed.event.eventReference, payloadDigest: claimed.event.payloadDigest, payload: claimed.event.payload});
    if (result.eventReference === claimed.event.eventReference && result.payloadDigest === claimed.event.payloadDigest) outcome = result.status;
  } catch { /* The durable identity remains retryable with the same payload. */ }
  const completedAt = getNow();
  return inTransaction(db, async (tx) => {
    await lockWorkspace(tx, claimed.event.workspaceId);
    const event = (await tx.select().from(affiliateDeliveryEvents).where(eq(affiliateDeliveryEvents.id, eventId)).for('update').limit(1))[0];
    if (event?.leaseToken !== claimed.leaseToken) return 'stale_lease';
    const currentConfig = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0] ?? null;
    const payment = event.eventKind === 'sale' ? (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, event.workspaceId), eq(affiliatePayments.paymentReference, event.eventReference))).limit(1))[0] : null;
    const saleInvalidated = event.eventKind === 'sale' && (payment?.historyComplete !== 'yes' || await hasHolds(tx, event.workspaceId));
    if (!event.leaseUntil || event.leaseUntil <= completedAt || event.status === 'held' || saleInvalidated || !enabled(currentConfig) || currentConfig.accountSyncStatus !== 'succeeded' || currentConfig.accountCheckpointVersion !== claimed.config.accountCheckpointVersion || currentConfig.policyVersion !== claimed.config.policyVersion || currentConfig.accountId !== claimed.config.accountId || currentConfig.programId !== claimed.config.programId) {
      await tx.update(affiliateDeliveryEvents).set({status: 'held', leaseToken: null, leaseUntil: null}).where(eq(affiliateDeliveryEvents.id, eventId));
      await correction(tx, event.workspaceId, event.paymentReference ?? event.eventReference, 'delivery_completion_requires_readback', completedAt);
      return 'stale_completion';
    }
    await tx.update(affiliateDeliveryEvents).set({status: outcome, leaseToken: null, leaseUntil: null, acknowledgedAt: outcome === 'acknowledged' ? completedAt : null, nextActionAt: new Date(completedAt.getTime() + 60_000)}).where(eq(affiliateDeliveryEvents.id, eventId));
    if (outcome === 'acknowledged' && event.eventKind === 'sale') {
      await tx.update(affiliatePayments).set({saleStatus: 'acknowledged'}).where(and(eq(affiliatePayments.workspaceId, event.workspaceId), eq(affiliatePayments.paymentReference, event.eventReference)));
      await tx.update(affiliateDeliveryEvents).set({status: 'pending'}).where(and(eq(affiliateDeliveryEvents.workspaceId, event.workspaceId), eq(affiliateDeliveryEvents.eventKind, 'refund'), eq(affiliateDeliveryEvents.paymentReference, event.eventReference), eq(affiliateDeliveryEvents.status, 'held')));
    }
    return outcome;
  });
}

export async function synchronizeAffiliateAccount(db: AppDatabase, authority: AffiliateAuthority, at?: Date, clock?: () => Date): Promise<string> {
  const getNow = operationClock(at, clock);
  const now = getNow();
  const snapshot = await inTransaction(db, async (tx) => {
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
    if (!config || !enabled(config)) return null;
    const version = config.accountCheckpointVersion + 1;
    await tx.update(affiliateSettings).set({accountCheckpointVersion: version, accountSyncStatus: 'pending', updatedAt: now}).where(eq(affiliateSettings.id, 'default'));
    return {...config, accountCheckpointVersion: version};
  });
  if (!snapshot) return 'disabled';
  let successful = false;
  try {
    const remote = await authority.readAccount();
    const age = getNow().getTime() - remote.checkedAt.getTime();
    successful = remote.complete && remote.accountId === snapshot.accountId && remote.programId === snapshot.programId && remote.campaignRevision === snapshot.providerCampaignRevision && !remote.automaticPayouts && Number.isFinite(age) && age >= 0 && age <= 60_000 && (snapshot.commissionPolicy === 'first_payment' ? remote.firstPaymentOnly : snapshot.reviewedCampaignRevision === remote.campaignRevision);
  } catch { /* Persist failed account synchronization and retain holds. */ }
  const completedAt = getNow();
  const changed = await db.update(affiliateSettings).set({accountSyncStatus: successful ? 'succeeded' : 'failed', accountCheckpointAt: successful ? completedAt : null, updatedAt: completedAt}).where(and(eq(affiliateSettings.id, 'default'), eq(affiliateSettings.accountCheckpointVersion, snapshot.accountCheckpointVersion), eq(affiliateSettings.policyVersion, snapshot.policyVersion), eq(affiliateSettings.accountId, snapshot.accountId), eq(affiliateSettings.programId, snapshot.programId), eq(affiliateSettings.providerCampaignRevision, snapshot.providerCampaignRevision), eq(affiliateSettings.commissionPolicy, snapshot.commissionPolicy), eq(affiliateSettings.enabled, 'enabled'))).returning({id: affiliateSettings.id});
  return changed.length === 0 ? 'stale_checkpoint' : successful ? 'succeeded' : 'failed';
}

export async function refreshAffiliateReview(db: AppDatabase, input: Readonly<{workspaceId: string; paymentReference: string; authority: AffiliateAuthority; now?: Date}>) {
  const snapshot = (await db.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
  if (!enabled(snapshot ?? null)) return null;
  const observedReview = (await db.select({reviewVersion: affiliateReviewRecords.reviewVersion}).from(affiliateReviewRecords).where(and(eq(affiliateReviewRecords.workspaceId, input.workspaceId), eq(affiliateReviewRecords.paymentReference, input.paymentReference))).limit(1))[0];
  let remote: Awaited<ReturnType<AffiliateAuthority['readCommission']>> | null = null;
  try { remote = await input.authority.readCommission(input); } catch { /* A failed row read persists held status. */ }
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await lockWorkspace(tx, input.workspaceId);
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0]!;
    const prior = (await tx.select().from(affiliateReviewRecords).where(and(eq(affiliateReviewRecords.workspaceId, input.workspaceId), eq(affiliateReviewRecords.paymentReference, input.paymentReference))).limit(1))[0];
    if ((prior?.reviewVersion ?? 0) !== (observedReview?.reviewVersion ?? 0)) return prior ?? null;
    if (prior && (prior.status === 'approve_pending' || prior.status === 'deny_pending')) {
      const active = (await tx.select({id: affiliateReviewActions.id}).from(affiliateReviewActions).where(and(eq(affiliateReviewActions.reviewId, prior.id), ne(affiliateReviewActions.status, 'succeeded'))).limit(1))[0];
      if (active) return prior;
    }
    const payment = (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, input.workspaceId), eq(affiliatePayments.paymentReference, input.paymentReference))).limit(1))[0];
    const age = remote ? now.getTime() - remote.checkedAt.getTime() : Infinity;
    const accountAge = config.accountCheckpointAt ? now.getTime() - config.accountCheckpointAt.getTime() : Infinity;
    const current = enabled(config) && config.policyVersion === snapshot!.policyVersion && config.accountCheckpointVersion === snapshot!.accountCheckpointVersion && config.accountId === snapshot!.accountId && config.programId === snapshot!.programId && config.accountSyncStatus === 'succeeded' && accountAge >= 0 && accountAge <= 300_000;
    const verified = current && remote?.accountId === config.accountId && remote.programId === config.programId && remote.paymentReference === input.paymentReference && age >= 0 && age <= 60_000 && payment?.saleStatus === 'acknowledged' && payment.historyComplete === 'yes';
    const later = config.commissionPolicy === 'first_payment' && payment?.firstPayment !== 'yes';
    const held = await hasHolds(tx, input.workspaceId);
    const status = !verified || held ? 'held' : remote!.status === 'denied' ? 'denied' : later ? 'deny_pending' : remote!.status === 'eligible' ? 'eligible' : remote!.status === 'approved' ? 'approved' : 'held';
    const row = {workspaceId: input.workspaceId, paymentReference: input.paymentReference, status, reason: !verified ? 'refresh_incomplete' : held ? 'unresolved_hold' : later ? 'first_payment_policy' : 'provider_review', policyVersion: config.policyVersion, reviewVersion: (prior?.reviewVersion ?? 0) + 1, accountCheckpointVersion: config.accountCheckpointVersion, accountCheckpointAt: config.accountCheckpointAt, refreshedAt: verified ? remote!.checkedAt : null, updatedAt: now};
    if (prior) return (await tx.update(affiliateReviewRecords).set(row).where(eq(affiliateReviewRecords.id, prior.id)).returning())[0]!;
    return (await tx.insert(affiliateReviewRecords).values({id: randomUUID(), ...row, createdAt: now}).returning())[0]!;
  });
}

/** Visit every exported sale: missing rows must never disappear behind a fixed batch limit. */
export async function refreshAffiliateReviewInventory(db: AppDatabase, authority: AffiliateAuthority, at?: Date, batchSize = 50): Promise<void> {
  let cursor = '';
  for (;;) {
    const rows = await db.select({id: affiliatePayments.id, workspaceId: affiliatePayments.workspaceId, paymentReference: affiliatePayments.paymentReference}).from(affiliatePayments).where(and(eq(affiliatePayments.saleStatus, 'acknowledged'), cursor ? gt(affiliatePayments.id, cursor) : undefined)).orderBy(asc(affiliatePayments.id)).limit(batchSize);
    if (rows.length === 0) return;
    for (const row of rows) await refreshAffiliateReview(db, {workspaceId: row.workspaceId, paymentReference: row.paymentReference, authority, now: at});
    cursor = rows[rows.length - 1]!.id;
  }
}

/** Readiness only: privileged approval/handoff must re-read this evidence inside its audited command transaction. */
export async function readAffiliateReviewEvidence(tx: AffiliateTx, reviewId: string, now = new Date()): Promise<Readonly<{review: CommissionReview; evidence: CommissionReviewEvidence; fresh: boolean}>> {
  const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
  const row = (await tx.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, reviewId)).for('update').limit(1))[0];
  if (!row || !enabled(config ?? null)) throw new DomainError('NOT_FOUND', 'Affiliate review is unavailable.');
  const holds = await tx.select({total: count()}).from(affiliateCorrectionCases).where(eq(affiliateCorrectionCases.status, 'open'));
  const denials = await tx.select({total: count()}).from(affiliateReviewRecords).where(eq(affiliateReviewRecords.status, 'deny_pending'));
  const backlog = await tx.select({total: count()}).from(affiliatePayments).leftJoin(affiliateReviewRecords, and(eq(affiliatePayments.workspaceId, affiliateReviewRecords.workspaceId), eq(affiliatePayments.paymentReference, affiliateReviewRecords.paymentReference))).where(and(eq(affiliatePayments.saleStatus, 'acknowledged'), or(isNull(affiliateReviewRecords.id), ne(affiliateReviewRecords.policyVersion, config!.policyVersion), isNull(affiliateReviewRecords.refreshedAt), lt(affiliateReviewRecords.refreshedAt, new Date(now.getTime() - 60_000)), gt(affiliateReviewRecords.refreshedAt, now), ne(affiliatePayments.historyComplete, 'yes'), eq(affiliateReviewRecords.status, 'held'), config!.commissionPolicy === 'first_payment' ? and(ne(affiliatePayments.firstPayment, 'yes'), ne(affiliateReviewRecords.status, 'denied')) : undefined)));
  const review = {...row, status: row.status as CommissionReview['status']};
  const evidence: CommissionReviewEvidence = {policyVersion: config!.policyVersion, reviewVersion: row.reviewVersion, accountCheckpointVersion: config!.accountCheckpointVersion, accountCheckpointAt: config!.accountCheckpointAt, accountSyncStatus: config!.accountSyncStatus as CommissionReviewEvidence['accountSyncStatus'], unresolvedHolds: holds[0]?.total ?? 0, pendingDenials: (denials[0]?.total ?? 0) + (backlog[0]?.total ?? 0)};
  return {review, evidence, fresh: reviewFresh(review, evidence, now)};
}
