import {and, desc, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {affiliateCorrectionCases, affiliateReviewRecords, affiliateSettings} from '../../db/schema/affiliate.ts';
import {requireCurrentOperator} from '../operations/authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

type Query = Readonly<{page?: number; pageSize?: number; status?: string}>;
function page(input: Query) {
  const number = input.page ?? 1;
  const size = input.pageSize ?? 50;
  if (!Number.isSafeInteger(number) || number < 1 || number > 10000 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new DomainError('VALIDATION', 'Affiliate pagination is out of bounds.');
  return {page: number, pageSize: size};
}

export async function readAffiliateAdminStatus(db: AppDatabase, actor: WorkspaceActor) {
  await requireCurrentOperator(db, actor, 'support');
  const config = (await db.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
  return {enabled: config?.enabled === 'enabled', integrationStatus: config?.enabled === 'enabled' ? 'unavailable' : 'disabled', commissionPolicy: config?.commissionPolicy ?? 'first_payment', policyVersion: config?.policyVersion ?? 1, providerCampaignRevision: config?.providerCampaignRevision ?? 'first-payment-v1', accountSyncStatus: config?.accountSyncStatus ?? 'pending', accountCheckpointAt: config?.accountCheckpointAt?.toISOString() ?? null, dashboardUrl: config?.dashboardUrl ?? null};
}

export async function listAffiliateReviews(db: AppDatabase, actor: WorkspaceActor, input: Query = {}) {
  await requireCurrentOperator(db, actor, 'support');
  const paging = page(input);
  if (input.status && !['eligible', 'held', 'approve_pending', 'deny_pending', 'approved', 'denied'].includes(input.status)) throw new DomainError('VALIDATION', 'Affiliate review status is unsupported.');
  const rows = await db.select().from(affiliateReviewRecords).where(input.status ? eq(affiliateReviewRecords.status, input.status) : undefined).orderBy(desc(affiliateReviewRecords.updatedAt), desc(affiliateReviewRecords.id)).limit(paging.pageSize + 1).offset((paging.page - 1) * paging.pageSize);
  return {...paging, hasMore: rows.length > paging.pageSize, items: rows.slice(0, paging.pageSize).map((row) => ({id: row.id, workspaceId: row.workspaceId, paymentReference: row.paymentReference, status: row.status, reason: row.reason, expectedVersion: row.reviewVersion, reviewVersion: row.reviewVersion, policyVersion: row.policyVersion, accountCheckpointVersion: row.accountCheckpointVersion, refreshedAt: row.refreshedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString()}))};
}

export async function listAffiliateHolds(db: AppDatabase, actor: WorkspaceActor, input: Query = {}) {
  await requireCurrentOperator(db, actor, 'support');
  const paging = page(input);
  if (input.status && !['open', 'resolved'].includes(input.status)) throw new DomainError('VALIDATION', 'Affiliate hold status is unsupported.');
  const rows = await db.select().from(affiliateCorrectionCases).where(and(input.status ? eq(affiliateCorrectionCases.status, input.status) : undefined)).orderBy(desc(affiliateCorrectionCases.createdAt), desc(affiliateCorrectionCases.id)).limit(paging.pageSize + 1).offset((paging.page - 1) * paging.pageSize);
  return {...paging, hasMore: rows.length > paging.pageSize, items: rows.slice(0, paging.pageSize).map((row) => ({id: row.id, workspaceId: row.workspaceId, paymentReference: row.paymentReference, status: row.status, reason: row.reason, expectedVersion: row.version, version: row.version, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null}))};
}
