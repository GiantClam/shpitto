import {asc, desc, eq, sql} from 'drizzle-orm';

import {serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingSubscriptions} from '../../db/schema/billing.ts';
import {creditLedgerEntries} from '../../db/schema/credit.ts';
import {creditGrants, workspaceMembers, workspaces} from '../../db/schema/workspace.ts';
import {inTransaction} from '../shared/transaction.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import {recordTenantAccess, validateOperatorReason} from './audit.ts';
import {requireCurrentOperator} from './authorize.ts';

export type WorkspaceDetailSection = 'memberships' | 'subscriptions' | 'grants' | 'ledger';
type DetailQuery = Readonly<{section: WorkspaceDetailSection; purpose: string; page: number; pageSize: number}>;
export type WorkspaceDetailPage = DetailQuery & Readonly<{workspaceId: string; hasMore: boolean; items: ReadonlyArray<Readonly<Record<string, string | boolean | number | null>>>}>;
const sections: readonly string[] = ['memberships', 'subscriptions', 'grants', 'ledger'];

export function parseWorkspaceDetailQuery(query: URLSearchParams): DetailQuery {
  for (const key of query.keys()) if (!['section', 'purpose', 'page', 'pageSize'].includes(key) || query.getAll(key).length !== 1) throw new DomainError('VALIDATION', 'Unsupported or repeated workspace detail query field.');
  const section = query.get('section') ?? '';
  const page = Number(query.get('page') ?? 1);
  const pageSize = Number(query.get('pageSize') ?? 25);
  if (!sections.includes(section) || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new DomainError('VALIDATION', 'Choose a supported section, page 1–10000 and page size 1–100.');
  return {section: section as WorkspaceDetailSection, purpose: validateOperatorReason(query.get('purpose') ?? ''), page, pageSize};
}

/** Read-only tenant records. Select allowlisted columns rather than serializing entire stored rows. */
export async function readAdminWorkspaceDetails(db: AppDatabase, input: DetailQuery & Readonly<{actor: WorkspaceActor; workspaceId: string}>): Promise<WorkspaceDetailPage> {
  const query = parseWorkspaceDetailQuery(new URLSearchParams({section: input.section, purpose: input.purpose, page: String(input.page), pageSize: String(input.pageSize)}));
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.workspaceId)) throw new DomainError('VALIDATION', 'workspaceId must be a UUID.');
  return inTransaction(db, async (tx) => {
    await requireCurrentOperator(tx, input.actor, 'operator');
    if (!(await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1))[0]) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose: query.purpose});
    const limit = query.pageSize + 1;
    const offset = (query.page - 1) * query.pageSize;
    let rows: Record<string, unknown>[];
    if (query.section === 'memberships') rows = await tx.select({id: workspaceMembers.userId, role: workspaceMembers.role, joinedAt: workspaceMembers.createdAt}).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, input.workspaceId)).orderBy(desc(workspaceMembers.createdAt), asc(workspaceMembers.userId)).limit(limit).offset(offset);
    else if (query.section === 'subscriptions') rows = await tx.select({id: billingSubscriptions.id, provider: billingSubscriptions.provider, productKey: sql<string>`${billingSubscriptions.catalogSnapshot}->>'productKey'`, status: billingSubscriptions.status, periodStart: billingSubscriptions.periodStart, periodEnd: billingSubscriptions.periodEnd, cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd, createdAt: billingSubscriptions.createdAt}).from(billingSubscriptions).where(eq(billingSubscriptions.workspaceId, input.workspaceId)).orderBy(desc(billingSubscriptions.createdAt), asc(billingSubscriptions.id)).limit(limit).offset(offset);
    else if (query.section === 'grants') rows = await tx.select({id: creditGrants.id, source: creditGrants.source, issued: creditGrants.issued, available: creditGrants.available, reserved: creditGrants.reserved, consumed: creditGrants.consumed, expired: creditGrants.expired, voided: creditGrants.voided, expiresAt: creditGrants.expiresAt, originAllocationId: creditGrants.originAllocationId, createdAt: creditGrants.createdAt}).from(creditGrants).where(eq(creditGrants.workspaceId, input.workspaceId)).orderBy(desc(creditGrants.createdAt), asc(creditGrants.id)).limit(limit).offset(offset);
    else rows = await tx.select({id: creditLedgerEntries.id, grantId: creditLedgerEntries.grantId, entryType: creditLedgerEntries.entryType, availableDelta: creditLedgerEntries.availableDelta, reservedDelta: creditLedgerEntries.reservedDelta, consumedDelta: creditLedgerEntries.consumedDelta, expiredDelta: creditLedgerEntries.expiredDelta, voidedDelta: creditLedgerEntries.voidedDelta, createdAt: creditLedgerEntries.createdAt}).from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, input.workspaceId)).orderBy(desc(creditLedgerEntries.createdAt), asc(creditLedgerEntries.id)).limit(limit).offset(offset);
    return {...query, workspaceId: input.workspaceId, hasMore: rows.length > query.pageSize, items: rows.slice(0, query.pageSize).map((row) => serializeJsonValue(row) as WorkspaceDetailPage['items'][number])};
  });
}
