import {randomUUID} from 'node:crypto';

import {and, eq, isNull} from 'drizzle-orm';

import {parseIdempotencyKey, semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {affiliateCorrectionCases, affiliateReviewActions, affiliateReviewRecords, affiliateSettings} from '../../db/schema/affiliate.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {recordOperatorAudit, validateExpectedVersion, validateOperatorReason} from '../operations/audit.ts';
import {authorizeOperatorCommand} from '../operations/authorize.ts';
import {executeDurableCommand, type CommandIdentity} from '../shared/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {canHandoffPayout} from './payout-guard.ts';
import {readAffiliateReviewEvidence, refreshAffiliateReview, refreshAffiliateReviewInventory, synchronizeAffiliateAccount, type AffiliateAuthority} from './runtime.ts';

type Result = Readonly<Record<string, unknown>>;
type Envelope = Readonly<{actor: WorkspaceActor; expectedVersion: number; idempotencyKey: string; reason: string; authority: AffiliateAuthority; now?: Date}>;
type ReviewEnvelope = Envelope & Readonly<{workspaceId: string; reviewId: string}>;

function identity(input: Envelope & {workspaceId?: string}, commandName: string, payload: Readonly<Record<string, unknown>>): CommandIdentity {
  parseIdempotencyKey(input.idempotencyKey);
  return {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName, idempotencyKey: input.idempotencyKey, payload: {...payload, expectedVersion: validateExpectedVersion(input.expectedVersion), reason: validateOperatorReason(input.reason)}};
}

async function replay(db: AppDatabase, input: Envelope, command: CommandIdentity, role: 'operator' | 'superadmin' = 'operator'): Promise<Result | null> {
  await authorizeOperatorCommand(db, input.actor, role, input.now ?? new Date());
  const existing = (await db.select().from(commandResults).where(and(eq(commandResults.actorUserId, command.actorUserId), eq(commandResults.commandName, command.commandName), eq(commandResults.idempotencyKey, command.idempotencyKey), command.workspaceId ? eq(commandResults.workspaceId, command.workspaceId) : isNull(commandResults.workspaceId))).limit(1))[0];
  if (!existing) return null;
  if (existing.semanticHash !== semanticHash(command.commandName, command.payload)) throw new DomainError('CONFLICT', 'The affiliate command key has different semantics.');
  if (existing.status !== 'committed' || !existing.result) throw new DomainError('CONFLICT', 'The affiliate command is pending.');
  return {...existing.result as Record<string, unknown>, replayed: true};
}

async function lockWorkspace(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  if (!(await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1))[0]) throw new DomainError('NOT_FOUND', 'Affiliate workspace was not found.');
}

async function prepareReview(db: AppDatabase, input: ReviewEnvelope) {
  const prior = (await db.select().from(affiliateReviewRecords).where(and(eq(affiliateReviewRecords.id, input.reviewId), eq(affiliateReviewRecords.workspaceId, input.workspaceId))).limit(1))[0];
  if (!prior?.paymentReference) throw new DomainError('NOT_FOUND', 'The affiliate review was not found.');
  if (prior.reviewVersion !== input.expectedVersion) throw new DomainError('CONFLICT', 'The affiliate review version is stale.');
  if (prior.status === 'approve_pending' || prior.status === 'deny_pending') throw new DomainError('CONFLICT', 'An affiliate provider action is still pending.');
  if (await synchronizeAffiliateAccount(db, input.authority, input.now) !== 'succeeded') throw new DomainError('INFRASTRUCTURE', 'Affiliate account refresh is incomplete.');
  await refreshAffiliateReviewInventory(db, input.authority, input.now);
  const review = (await db.select().from(affiliateReviewRecords).where(eq(affiliateReviewRecords.id, input.reviewId)).limit(1))[0];
  if (!review || review.reviewVersion !== input.expectedVersion + 1) throw new DomainError('CONFLICT', 'The affiliate review changed during refresh.');
  return review;
}

async function audited(tx: TransactionDatabase, input: Envelope, command: CommandIdentity, result: Result): Promise<void> {
  await recordOperatorAudit(tx, {actorUserId: input.actor.userId, workspaceId: command.workspaceId, commandName: command.commandName, commandKey: input.idempotencyKey, payload: {request: command.payload, result}, now: input.now});
}

export async function runAffiliateReviewCommand(db: AppDatabase, input: ReviewEnvelope & Readonly<{action: 'approve' | 'deny'}>): Promise<Result> {
  if (input.action !== 'approve' && input.action !== 'deny') throw new DomainError('VALIDATION', 'Unsupported affiliate review action.');
  const now = input.now ?? new Date();
  const command = identity(input, 'affiliate.review.' + input.action, {workspaceId: input.workspaceId, reviewId: input.reviewId, action: input.action});
  const prior = await replay(db, input, command);
  if (prior) return prior;
  // Denying a later-payment commission is a valid pending-denial action; its readback is still refreshed.
  const before = (await db.select().from(affiliateReviewRecords).where(and(eq(affiliateReviewRecords.id, input.reviewId), eq(affiliateReviewRecords.workspaceId, input.workspaceId))).limit(1))[0];
  let prepared: typeof affiliateReviewRecords.$inferSelect;
  if (input.action === 'deny' && before?.status === 'deny_pending') {
    if (before.reviewVersion !== input.expectedVersion) throw new DomainError('CONFLICT', 'The affiliate review version is stale.');
    const existingAction = (await db.select({id: affiliateReviewActions.id}).from(affiliateReviewActions).where(and(eq(affiliateReviewActions.reviewId, input.reviewId), eq(affiliateReviewActions.reviewVersion, before.reviewVersion))).limit(1))[0];
    if (existingAction) throw new DomainError('CONFLICT', 'An affiliate provider action is still pending.');
    if (await synchronizeAffiliateAccount(db, input.authority, input.now) !== 'succeeded') throw new DomainError('INFRASTRUCTURE', 'Affiliate account refresh is incomplete.');
    const refreshed = await refreshAffiliateReview(db, {workspaceId: input.workspaceId, paymentReference: before.paymentReference!, authority: input.authority, now: input.now});
    if (!refreshed || refreshed.reviewVersion !== input.expectedVersion + 1) throw new DomainError('CONFLICT', 'The affiliate review changed during refresh.');
    prepared = refreshed;
  } else prepared = await prepareReview(db, input);
  return inTransaction(db, async (tx) => {
    const now = input.now ?? new Date();
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    await lockWorkspace(tx, input.workspaceId);
    const execution = await executeDurableCommand(tx, command, async () => {
      const state = await readAffiliateReviewEvidence(tx, input.reviewId, now);
      if (state.review.reviewVersion !== prepared.reviewVersion) throw new DomainError('CONFLICT', 'The affiliate review changed after refresh.');
      if (input.action === 'approve' && (!state.fresh || state.review.status !== 'eligible')) throw new DomainError('CONFLICT', 'Affiliate approval requires fresh eligible evidence without holds.');
      if (input.action === 'deny' && (!prepared.refreshedAt || state.evidence.accountSyncStatus !== 'succeeded')) throw new DomainError('CONFLICT', 'Affiliate denial requires authoritative current readback.');
      const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0]!;
      const version = prepared.reviewVersion + 1;
      const actionId = randomUUID();
      const payload = {actionReference: actionId, action: input.action, accountId: config.accountId!, programId: config.programId!, paymentReference: prepared.paymentReference!};
      await tx.update(affiliateReviewRecords).set({status: input.action === 'approve' ? 'approve_pending' : 'deny_pending', reviewVersion: version, updatedAt: now}).where(eq(affiliateReviewRecords.id, input.reviewId));
      await tx.insert(affiliateReviewActions).values({id: actionId, workspaceId: input.workspaceId, reviewId: input.reviewId, actorUserId: input.actor.userId, action: input.action, payload: serializeJsonValue(payload), payloadDigest: semanticHash('affiliate.provider-action', payload), policyVersion: config.policyVersion, reviewVersion: version, status: 'pending', nextActionAt: now, createdAt: now, updatedAt: now});
      const result = {reviewId: input.reviewId, actionId, status: 'pending', version};
      await audited(tx, input, command, result);
      return result;
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function releaseAffiliateAbuseHold(db: AppDatabase, input: Envelope & Readonly<{workspaceId: string; caseId: string}>): Promise<Result> {
  const command = identity(input, 'affiliate.abuse.release', {workspaceId: input.workspaceId, caseId: input.caseId});
  const prior = await replay(db, input, command);
  if (prior) return prior;
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    await lockWorkspace(tx, input.workspaceId);
    const execution = await executeDurableCommand(tx, command, async () => {
      const hold = (await tx.select().from(affiliateCorrectionCases).where(and(eq(affiliateCorrectionCases.id, input.caseId), eq(affiliateCorrectionCases.workspaceId, input.workspaceId))).for('update').limit(1))[0];
      if (!hold || !hold.reason.startsWith('abuse:')) throw new DomainError('NOT_FOUND', 'A releasable affiliate abuse hold was not found.');
      if (hold.version !== input.expectedVersion || hold.status !== 'open') throw new DomainError('CONFLICT', 'The affiliate hold version is stale or already resolved.');
      await tx.update(affiliateCorrectionCases).set({status: 'resolved', resolvedAt: now, version: hold.version + 1}).where(eq(affiliateCorrectionCases.id, hold.id));
      const result = {caseId: hold.id, status: 'resolved', version: hold.version + 1};
      await audited(tx, input, command, result);
      return result;
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function changeAffiliatePolicy(db: AppDatabase, input: Envelope & Readonly<{commissionPolicy: 'first_payment' | 'provider_campaign'; providerCampaignRevision: string; approvedDashboardOrigin: string; dashboardUrl: string}>): Promise<Result> {
  const command = identity(input, 'affiliate.policy.change', {commissionPolicy: input.commissionPolicy, providerCampaignRevision: input.providerCampaignRevision, approvedDashboardOrigin: input.approvedDashboardOrigin, dashboardUrl: input.dashboardUrl});
  const prior = await replay(db, input, command, 'superadmin');
  if (prior) return prior;
  if (!['first_payment', 'provider_campaign'].includes(input.commissionPolicy) || !input.providerCampaignRevision.trim() || input.providerCampaignRevision.length > 255) throw new DomainError('VALIDATION', 'Affiliate campaign policy is invalid.');
  let origin: URL;
  let dashboard: URL;
  try { origin = new URL(input.approvedDashboardOrigin); dashboard = new URL(input.dashboardUrl); } catch { throw new DomainError('VALIDATION', 'The reviewed dashboard must be HTTPS.'); }
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || dashboard.origin !== origin.origin || dashboard.username || dashboard.password) throw new DomainError('VALIDATION', 'The dashboard must match its reviewed HTTPS origin.');
  const remote = await input.authority.readAccount();
  const now = input.now ?? new Date();
  const age = now.getTime() - remote.checkedAt.getTime();
  if (!remote.complete || remote.automaticPayouts || remote.campaignRevision !== input.providerCampaignRevision || (input.commissionPolicy === 'first_payment' && !remote.firstPaymentOnly) || age < 0 || age > 60_000 || !Number.isFinite(age)) throw new DomainError('CONFLICT', 'Affiliate campaign readback does not match the requested policy.');
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'superadmin', now);
    const execution = await executeDurableCommand(tx, command, async () => {
      const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('update').limit(1))[0];
      if (!config || config.policyVersion !== input.expectedVersion || (config.accountId !== null && remote.accountId !== config.accountId) || (config.programId !== null && remote.programId !== config.programId)) throw new DomainError('CONFLICT', 'Affiliate policy or account identity changed.');
      const version = config.policyVersion + 1;
      await tx.update(affiliateSettings).set({enabled: 'enabled', accountId: remote.accountId, programId: remote.programId, commissionPolicy: input.commissionPolicy, providerCampaignRevision: input.providerCampaignRevision, reviewedCampaignRevision: input.providerCampaignRevision, approvedDashboardOrigin: origin.origin, dashboardUrl: dashboard.toString(), policyVersion: version, accountCheckpointVersion: config.accountCheckpointVersion + 1, accountSyncStatus: 'pending', accountCheckpointAt: null, updatedAt: now}).where(eq(affiliateSettings.id, 'default'));
      const result = {accountId: remote.accountId, programId: remote.programId, policyVersion: version, version, status: 'reviewed'};
      await audited(tx, input, command, result);
      return result;
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function handoffAffiliatePayout(db: AppDatabase, input: ReviewEnvelope): Promise<Result> {
  const command = identity(input, 'affiliate.payout.handoff', {workspaceId: input.workspaceId, reviewId: input.reviewId});
  const prior = await replay(db, input, command);
  if (prior) return prior;
  const now = input.now ?? new Date();
  const prepared = await prepareReview(db, input);
  return inTransaction(db, async (tx) => {
    const now = input.now ?? new Date();
    await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    await lockWorkspace(tx, input.workspaceId);
    const execution = await executeDurableCommand(tx, command, async () => {
      const state = await readAffiliateReviewEvidence(tx, input.reviewId, now);
      const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0]!;
      if (state.review.reviewVersion !== prepared.reviewVersion || !canHandoffPayout({...state, providerDashboardUrl: config.dashboardUrl, approvedDashboardOrigin: config.approvedDashboardOrigin, now})) throw new DomainError('CONFLICT', 'Affiliate payout handoff requires current approved evidence and a reviewed dashboard.');
      const result = {reviewId: input.reviewId, dashboardUrl: config.dashboardUrl, version: state.review.reviewVersion, status: 'handoff_recorded', fundsTransferred: false};
      await audited(tx, input, command, result);
      return result;
    });
    return {...execution.value, replayed: execution.replayed};
  });
}
