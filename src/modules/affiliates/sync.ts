import {randomUUID} from 'node:crypto';

import {and, asc, count, eq, gt, gte, inArray, lte} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {affiliateAttributions, affiliateCorrectionCases, affiliateDeliveryEvents, affiliatePayments, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../../db/schema/affiliate.ts';
import {authUser} from '../../db/schema/auth.ts';
import {workspaceMembers, workspaces} from '../../db/schema/workspace.ts';
import {recordOperatorAudit} from '../operations/audit.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {reviewFresh} from './commission-review.ts';
import {deliverAffiliateEvent, readAffiliateReviewEvidence, recordAffiliateAbuseInTransaction, reconcileAffiliateWorkspace, refreshAffiliateReviewInventory, synchronizeAffiliateAccount, verifyWorkspaceAttribution, type AffiliateActionRequest, type AffiliateAuthority} from './runtime.ts';

export const AFFILIATE_SYNC_INTERVAL_MS = 5 * 60_000;
async function lockWorkspace(tx: TransactionDatabase, id: string): Promise<void> {
  await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, id)).for('update');
}

/** Signal values come from verified provider readback; raw card data and fingerprints never enter storage. */
export async function deriveAffiliateAbuseSignals(db: AppDatabase, workspaceId: string, authority: AffiliateAuthority, now = new Date()) {
  const attribution = (await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.workspaceId, workspaceId)).limit(1))[0];
  if (attribution?.status !== 'verified' || !attribution.affiliateId || !attribution.programId) return null;
  const owners = await db.select({userId: workspaceMembers.userId}).from(workspaceMembers).innerJoin(authUser, eq(authUser.id, workspaceMembers.userId)).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner'), eq(authUser.emailVerified, true)));
  const counts = await db.select({total: count()}).from(affiliateAttributions).where(and(eq(affiliateAttributions.affiliateId, attribution.affiliateId), eq(affiliateAttributions.programId, attribution.programId), eq(affiliateAttributions.status, 'verified'), gte(affiliateAttributions.createdAt, new Date(now.getTime() - 86400_000)), lte(affiliateAttributions.createdAt, now)));
  let signals: Readonly<{ownerMatchesAffiliate: boolean | null; sameInstrumentFingerprintCount: number | null}> = {ownerMatchesAffiliate: null, sameInstrumentFingerprintCount: null};
  try { if (authority.readAbuseSignals) signals = await authority.readAbuseSignals({workspaceId, affiliateId: attribution.affiliateId, ownerUserIds: owners.map((row) => row.userId)}); } catch { /* Missing authoritative evidence is held as unknown. */ }
  if (signals.sameInstrumentFingerprintCount !== null && (!Number.isSafeInteger(signals.sameInstrumentFingerprintCount) || signals.sameInstrumentFingerprintCount < 0)) throw new DomainError('VALIDATION', 'Verified instrument count is invalid.');
  return inTransaction(db, (tx) => recordAffiliateAbuseInTransaction(tx, {workspaceId, ...signals, workspacesAttributedLast24h: counts[0]?.total ?? 0, now}));
}

/** A submitted batch remains pending until a separate authoritative status read confirms the intended outcome. */
export async function processAffiliateReviewAction(db: AppDatabase, actionId: string, authority: AffiliateAuthority, at?: Date, injectedClock?: () => Date): Promise<string> {
  const clock = injectedClock ?? (at ? () => at : () => new Date());
  const startedAt = clock();
  const observed = (await db.select().from(affiliateReviewActions).where(eq(affiliateReviewActions.id, actionId)).limit(1))[0];
  if (!observed || observed.status === 'succeeded' || observed.nextActionAt > startedAt || (observed.leaseUntil && observed.leaseUntil > startedAt)) return 'not_ready';
  let approvalReadback: Awaited<ReturnType<AffiliateAuthority['readCommission']>> | null = null;
  let preparedCheckpoint = -1;
  if (observed.action === 'approve') {
    if (await synchronizeAffiliateAccount(db, authority, at, clock) !== 'succeeded') return 'not_ready';
    if (await reconcileAffiliateWorkspace(db, observed.workspaceId, authority, at, clock) !== 'ready') return 'not_ready';
    await deriveAffiliateAbuseSignals(db, observed.workspaceId, authority, clock());
    await refreshAffiliateReviewInventory(db, authority, at);
    const config = (await db.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0]!;
    preparedCheckpoint = config.accountCheckpointVersion;
    const payload = observed.payload as Omit<AffiliateActionRequest, 'batchReference' | 'payloadDigest'>;
    try { approvalReadback = await authority.readCommission({workspaceId: observed.workspaceId, paymentReference: payload.paymentReference}); } catch { return 'not_ready'; }
  }
  const claimAt = clock();
  const claim = await inTransaction(db, async (tx) => {
    const hint = (await tx.select({workspaceId: affiliateReviewActions.workspaceId}).from(affiliateReviewActions).where(eq(affiliateReviewActions.id, actionId)).limit(1))[0];
    if (!hint) return null;
    await lockWorkspace(tx, hint.workspaceId);
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
    const action = (await tx.select().from(affiliateReviewActions).where(eq(affiliateReviewActions.id, actionId)).for('update').limit(1))[0]!;
    const review = (await tx.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, action.reviewId)).for('update').limit(1))[0]!;
    if (action.status === 'succeeded' || action.nextActionAt > claimAt || (action.leaseUntil && action.leaseUntil > claimAt) || config?.enabled !== 'enabled' || action.reviewVersion !== observed.reviewVersion) return null;
    const payload = action.payload as Omit<AffiliateActionRequest, 'batchReference' | 'payloadDigest'>;
    if (config.policyVersion !== action.policyVersion || review.reviewVersion !== action.reviewVersion || config.accountId !== payload.accountId || config.programId !== payload.programId) {
      await tx.update(affiliateReviewActions).set({status: 'failed', providerStatus: 'local_evidence_changed', nextActionAt: new Date(startedAt.getTime() + AFFILIATE_SYNC_INTERVAL_MS), updatedAt: startedAt}).where(eq(affiliateReviewActions.id, actionId));
      return null;
    }
    if (action.action === 'approve') {
      const age = approvalReadback ? claimAt.getTime() - approvalReadback.checkedAt.getTime() : Infinity;
      if (config.accountCheckpointVersion !== preparedCheckpoint || config.accountSyncStatus !== 'succeeded' || config.autoPayoutEnabled !== 'disabled' || review.status !== 'approve_pending' || approvalReadback?.accountId !== config.accountId || approvalReadback.programId !== config.programId || approvalReadback.paymentReference !== payload.paymentReference || !['eligible', 'approved'].includes(approvalReadback.status) || age < 0 || age > 60_000) return null;
      const payment = (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, action.workspaceId), eq(affiliatePayments.paymentReference, payload.paymentReference))).limit(1))[0];
      if (payment?.historyComplete !== 'yes' || payment.saleStatus !== 'acknowledged' || (config.commissionPolicy === 'first_payment' && payment.firstPayment !== 'yes')) return null;
      await tx.update(affiliateReviewRecords).set({accountCheckpointVersion: config.accountCheckpointVersion, accountCheckpointAt: config.accountCheckpointAt, refreshedAt: approvalReadback.checkedAt, updatedAt: claimAt}).where(eq(affiliateReviewRecords.id, review.id));
      const state = await readAffiliateReviewEvidence(tx, review.id, claimAt);
      if (!reviewFresh({...state.review, status: 'eligible'}, state.evidence, claimAt)) return null;
    }
    const token = randomUUID();
    await tx.update(affiliateReviewActions).set({leaseToken: token, leaseUntil: new Date(claimAt.getTime() + 60_000), attempts: action.attempts + 1, updatedAt: claimAt}).where(eq(affiliateReviewActions.id, actionId));
    return {action, payload, token, config};
  });
  if (!claim) return 'not_ready';
  let batchReference = claim.action.providerBatchReference;
  let outcome: 'submitted' | 'succeeded' | 'failed' = 'failed';
  let providerStatus = 'readback_unavailable';
  try {
    if (!authority.sendReviewAction || !authority.readReviewAction) throw new Error('Affiliate action port is unavailable.');
    const request: AffiliateActionRequest = {...claim.payload, batchReference, payloadDigest: claim.action.payloadDigest};
    // Once an attempt was claimed, a timeout/crash can conceal an accepted send. Only read back thereafter.
    if (!batchReference && claim.action.attempts === 0) {
      const result = await authority.sendReviewAction(request);
      if (result.actionReference !== actionId || result.payloadDigest !== request.payloadDigest) throw new Error('Affiliate action identity mismatch.');
      batchReference = result.batchReference;
    }
    const result = await authority.readReviewAction({...request, batchReference});
    if (result.actionReference !== actionId || result.payloadDigest !== request.payloadDigest) throw new Error('Affiliate action readback identity mismatch.');
    providerStatus = result.providerStatus.slice(0, 120);
    outcome = result.status === 'succeeded' && result.providerStatus === (claim.payload.action === 'approve' ? 'approved' : 'denied') ? 'succeeded' : result.status === 'pending' ? 'submitted' : 'failed';
  } catch { /* Keep the durable action and correlation key for a safe retry. */ }
  const completedAt = clock();
  return inTransaction(db, async (tx) => {
    await lockWorkspace(tx, claim.action.workspaceId);
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0]!;
    const current = (await tx.select().from(affiliateReviewActions).where(eq(affiliateReviewActions.id, actionId)).for('update').limit(1))[0]!;
    if (current.leaseToken !== claim.token) return 'stale_lease';
    const review = (await tx.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, current.reviewId)).for('update').limit(1))[0]!;
    const evidence = current.action === 'approve' && config.enabled === 'enabled' ? await readAffiliateReviewEvidence(tx, review.id, completedAt) : null;
    const payment = current.action === 'approve' ? (await tx.select().from(affiliatePayments).where(and(eq(affiliatePayments.workspaceId, current.workspaceId), eq(affiliatePayments.paymentReference, claim.payload.paymentReference))).limit(1))[0] : null;
    const approvalInvalidated = current.action === 'approve' && (!evidence || !reviewFresh({...evidence.review, status: 'eligible'}, evidence.evidence, completedAt) || config.accountCheckpointVersion !== claim.config.accountCheckpointVersion || payment?.historyComplete !== 'yes' || payment.saleStatus !== 'acknowledged' || (config.commissionPolicy === 'first_payment' && payment.firstPayment !== 'yes'));
    if (!current.leaseUntil || current.leaseUntil <= completedAt || config.enabled !== 'enabled' || config.policyVersion !== claim.config.policyVersion || config.accountId !== claim.config.accountId || config.programId !== claim.config.programId || review.reviewVersion !== current.reviewVersion || approvalInvalidated) {
      await tx.insert(affiliateCorrectionCases).values({id: randomUUID(), workspaceId: current.workspaceId, paymentReference: review.paymentReference, reason: 'review_action_completion_requires_readback', status: 'open', createdAt: completedAt}).onConflictDoNothing();
      outcome = 'submitted';
      providerStatus = 'local_evidence_changed';
    } else if (outcome === 'succeeded') {
      await tx.update(affiliateReviewRecords).set({status: claim.payload.action === 'approve' ? 'approved' : 'denied', reviewVersion: review.reviewVersion + 1, refreshedAt: completedAt, updatedAt: completedAt}).where(eq(affiliateReviewRecords.id, review.id));
    }
    await tx.update(affiliateReviewActions).set({status: outcome, providerBatchReference: batchReference, providerStatus, leaseToken: null, leaseUntil: null, nextActionAt: new Date(completedAt.getTime() + 60_000), updatedAt: completedAt}).where(eq(affiliateReviewActions.id, actionId));
    await recordOperatorAudit(tx, {actorUserId: current.actorUserId, workspaceId: current.workspaceId, commandName: 'affiliate.review.' + current.action + '.delivery', commandKey: actionId + ':' + current.attempts, payload: {actionId, status: outcome, providerStatus}, now: completedAt});
    return outcome;
  });
}

/** Callable from the ordinary worker loop; a persisted schedule prevents work more often than every five minutes. */
export async function runAffiliateSyncCycle(db: AppDatabase, authority: AffiliateAuthority, input: Readonly<{now?: Date; force?: boolean; batchSize?: number}> = {}) {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? 50;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new DomainError('VALIDATION', 'Affiliate sync batch size must be 1-100.');
  const scheduled = await inTransaction(db, async (tx) => {
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
    if (config?.enabled !== 'enabled') return 'disabled';
    if (!input.force && config.lastSyncAttemptAt && now.getTime() - config.lastSyncAttemptAt.getTime() < AFFILIATE_SYNC_INTERVAL_MS) return 'not_due';
    await tx.update(affiliateSettings).set({lastSyncAttemptAt: now}).where(eq(affiliateSettings.id, 'default'));
    return 'ready';
  });
  if (scheduled !== 'ready') return {status: scheduled, workspaces: 0, actions: 0};
  if (await synchronizeAffiliateAccount(db, authority, input.now) !== 'succeeded') return {status: 'account_refresh_failed', workspaces: 0, actions: 0};
  let cursor = '';
  let workspaceCount = 0;
  for (;;) {
    const rows = await db.select({workspaceId: affiliateAttributions.workspaceId}).from(affiliateAttributions).where(and(inArray(affiliateAttributions.status, ['unattributed', 'invalid', 'pending', 'verified']), cursor ? gt(affiliateAttributions.workspaceId, cursor) : undefined)).orderBy(asc(affiliateAttributions.workspaceId)).limit(batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      await verifyWorkspaceAttribution(db, row.workspaceId, authority, input.now);
      await deriveAffiliateAbuseSignals(db, row.workspaceId, authority, input.now);
      await reconcileAffiliateWorkspace(db, row.workspaceId, authority, input.now);
      let eventCursor = '';
      for (;;) {
        const events = await db.select({id: affiliateDeliveryEvents.id}).from(affiliateDeliveryEvents).where(and(eq(affiliateDeliveryEvents.workspaceId, row.workspaceId), inArray(affiliateDeliveryEvents.status, ['pending', 'failed']), lte(affiliateDeliveryEvents.nextActionAt, input.now ?? new Date()), eventCursor ? gt(affiliateDeliveryEvents.id, eventCursor) : undefined)).orderBy(asc(affiliateDeliveryEvents.id)).limit(batchSize);
        if (events.length === 0) break;
        for (const event of events) await deliverAffiliateEvent(db, event.id, authority, input.now);
        eventCursor = events[events.length - 1]!.id;
      }
      workspaceCount += 1;
    }
    cursor = rows[rows.length - 1]!.workspaceId;
  }
  await refreshAffiliateReviewInventory(db, authority, input.now, batchSize);
  let actionCursor = '';
  let actionCount = 0;
  for (;;) {
    const actions = await db.select({id: affiliateReviewActions.id}).from(affiliateReviewActions).where(and(inArray(affiliateReviewActions.status, ['pending', 'submitted', 'failed']), lte(affiliateReviewActions.nextActionAt, input.now ?? new Date()), actionCursor ? gt(affiliateReviewActions.id, actionCursor) : undefined)).orderBy(asc(affiliateReviewActions.id)).limit(batchSize);
    if (actions.length === 0) break;
    for (const action of actions) { await processAffiliateReviewAction(db, action.id, authority, input.now); actionCount += 1; }
    actionCursor = actions[actions.length - 1]!.id;
  }
  return {status: 'processed', workspaces: workspaceCount, actions: actionCount};
}
