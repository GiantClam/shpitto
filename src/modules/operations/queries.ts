import {and, asc, desc, eq, ilike, inArray, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents} from '../../db/schema/credit.ts';
import {authUser} from '../../db/schema/auth.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {billingAccounts, billingOrders, billingSubscriptions} from '../../db/schema/billing.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {operatorRoles} from '../../db/schema/operator.ts';
import {creditAccounts, workspaceMembers, workspaces} from '../../db/schema/workspace.ts';
import {inTransaction} from '../shared/transaction.ts';
import {recordTenantAccess, validateOperatorReason} from './audit.ts';
import {requireCurrentOperator} from './authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

export type AdminPageInput = Readonly<{page?: number; pageSize?: number; filter?: string; status?: string; sort?: string; direction?: 'asc' | 'desc'}>;
export type AdminPage<T> = Readonly<{items: readonly T[]; page: number; pageSize: number; hasMore: boolean}>;

function pageInput(input: AdminPageInput): Required<Pick<AdminPageInput, 'page' | 'pageSize'>> {
  const page = Number.isInteger(input.page) && (input.page as number) > 0 ? input.page as number : 1;
  const pageSize = Number.isInteger(input.pageSize) && (input.pageSize as number) > 0 ? Math.min(input.pageSize as number, 100) : 50;
  return {page, pageSize};
}

function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[redacted]';
  return `${local.slice(0, 1)}***@${domain}`;
}

function assertFilter(filter: string | undefined): string | undefined {
  if (filter === undefined) return undefined;
  const value = filter.trim();
  if (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) throw new DomainError('VALIDATION', 'Admin filters are bounded text.');
  return value || undefined;
}

export async function readAdminMe(db: AppDatabase, actor: WorkspaceActor): Promise<Readonly<{userId: string; role: 'support' | 'operator' | 'superadmin'}>> {
  const access = await requireCurrentOperator(db, actor, 'support');
  return {userId: access.userId, role: access.role};
}

export async function listAdminUsers(db: AppDatabase, actor: WorkspaceActor, input: AdminPageInput = {}): Promise<AdminPage<Readonly<Record<string, unknown>>>> {
  await requireCurrentOperator(db, actor, 'support');
  const {page, pageSize} = pageInput(input);
  const filter = assertFilter(input.filter);
  const status = input.status === undefined ? undefined : input.status;
  if (status !== undefined && status !== 'active' && status !== 'disabled') throw new DomainError('VALIDATION', 'User status filter is not supported.');
  const sort = input.sort ?? 'createdAt';
  if (!['createdAt', 'email'].includes(sort)) throw new DomainError('VALIDATION', 'User sort is not supported.');
  const direction = input.direction ?? 'desc';
  const order = sort === 'email' ? (direction === 'asc' ? asc(authUser.email) : desc(authUser.email)) : (direction === 'asc' ? asc(authUser.createdAt) : desc(authUser.createdAt));
  const effectiveStatus = sql<string>`case when ${authUser.disabledAt} is not null then 'disabled' else coalesce(${userAccessControls.status}, 'active') end`;
  const rows = await db.select({id: authUser.id, name: authUser.name, email: authUser.email, emailVerified: authUser.emailVerified, createdAt: authUser.createdAt, accessStatus: effectiveStatus, accessVersion: userAccessControls.version, operatorRole: operatorRoles.role, operatorRoleVersion: operatorRoles.version, roleRevokedAt: operatorRoles.revokedAt})
    .from(authUser).leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id)).leftJoin(operatorRoles, eq(operatorRoles.userId, authUser.id))
    .where(and(
      status ? eq(effectiveStatus, status) : undefined,
      filter ? ilike(authUser.email, `%${filter}%`) : undefined,
    )).orderBy(order, asc(authUser.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;
  return {page, pageSize, hasMore, items: rows.slice(0, pageSize).map((row) => ({id: row.id, name: row.name, email: redactEmail(row.email), emailVerified: row.emailVerified, status: row.accessStatus ?? 'active', version: row.accessVersion ?? 1, operatorRole: row.roleRevokedAt ? null : row.operatorRole, operatorRoleVersion: row.operatorRoleVersion ?? 1, createdAt: row.createdAt.toISOString()}))};
}

export async function listAdminWorkspaces(db: AppDatabase, actor: WorkspaceActor, input: AdminPageInput = {}): Promise<AdminPage<Readonly<Record<string, unknown>>>> {
  await requireCurrentOperator(db, actor, 'support');
  const {page, pageSize} = pageInput(input);
  const filter = assertFilter(input.filter);
  if (input.status !== undefined && input.status !== 'active' && input.status !== 'suspended' && input.status !== 'hold') throw new DomainError('VALIDATION', 'Workspace status filter is not supported.');
  const rows = await db.select({id: workspaces.id, name: workspaces.name, kind: workspaces.kind, status: workspaces.status, createdBy: workspaces.createdBy, version: workspaces.version, createdAt: workspaces.createdAt, billingStatus: billingAccounts.status, memberCount: sql<number>`count(${workspaceMembers.userId})::int`})
    .from(workspaces).leftJoin(billingAccounts, eq(billingAccounts.workspaceId, workspaces.id)).leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(filter ? ilike(workspaces.name, `%${filter}%`) : undefined, input.status === 'hold' ? eq(billingAccounts.status, 'hold') : input.status ? eq(workspaces.status, input.status) : undefined))
    .groupBy(workspaces.id, billingAccounts.status).orderBy(desc(workspaces.createdAt), asc(workspaces.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;
  return {page, pageSize, hasMore, items: rows.slice(0, pageSize).map((row) => ({id: row.id, name: row.name, kind: row.kind, status: row.status, billingStatus: row.billingStatus ?? 'active', createdBy: row.createdBy, version: row.version, memberCount: row.memberCount, createdAt: row.createdAt.toISOString()}))};
}

export async function listAdminGenerations(db: AppDatabase, actor: WorkspaceActor, input: AdminPageInput = {}): Promise<AdminPage<Readonly<Record<string, unknown>>>> {
  await requireCurrentOperator(db, actor, 'support');
  const {page, pageSize} = pageInput(input);
  const allowed = ['queued', 'dispatching', 'submission_unknown', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'cancelled'];
  if (input.status !== undefined && !allowed.includes(input.status)) throw new DomainError('VALIDATION', 'Generation status filter is not supported.');
  const rows = await db.select({id: generationTasks.id, workspaceId: generationTasks.workspaceId, status: generationTasks.status, failureCode: generationTasks.failureCode, quotedCredits: generationTasks.quotedCredits, providerCostState: generationTasks.providerCostState, version: generationTasks.version, createdAt: generationTasks.createdAt, updatedAt: generationTasks.updatedAt})
    .from(generationTasks).where(input.status ? eq(generationTasks.status, input.status) : undefined).orderBy(desc(generationTasks.updatedAt), asc(generationTasks.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;
  return {page, pageSize, hasMore, items: rows.slice(0, pageSize).map((row) => ({id: row.id, workspaceId: row.workspaceId, status: row.status, failureCode: row.failureCode, quotedCredits: row.quotedCredits.toString(), providerCostState: row.providerCostState ?? 'unknown', version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()}))};
}

export async function listAdminBilling(db: AppDatabase, actor: WorkspaceActor, input: AdminPageInput = {}): Promise<AdminPage<Readonly<Record<string, unknown>>>> {
  await requireCurrentOperator(db, actor, 'support');
  const {page, pageSize} = pageInput(input);
  const allowed = ['pending', 'paid', 'refunded', 'held', 'failed'];
  if (input.status !== undefined && !allowed.includes(input.status)) throw new DomainError('VALIDATION', 'Billing status filter is not supported.');
  const rows = await db.select({id: billingOrders.id, workspaceId: billingOrders.workspaceId, kind: billingOrders.kind, status: billingOrders.status, currency: billingOrders.currency, paidMinor: billingOrders.paidMinor, refundedMinor: billingOrders.refundedMinor, paidAt: billingOrders.paidAt, createdAt: billingOrders.createdAt})
    .from(billingOrders).where(input.status ? eq(billingOrders.status, input.status) : undefined).orderBy(desc(billingOrders.createdAt), asc(billingOrders.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;
  return {page, pageSize, hasMore, items: rows.slice(0, pageSize).map((row) => ({id: row.id, workspaceId: row.workspaceId, kind: row.kind, status: row.status, currency: row.currency, paidMinor: row.paidMinor.toString(), refundedMinor: row.refundedMinor.toString(), paidAt: row.paidAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString()}))};
}

export async function listAdminAudit(db: AppDatabase, actor: WorkspaceActor, input: AdminPageInput = {}): Promise<AdminPage<Readonly<Record<string, unknown>>>> {
  await requireCurrentOperator(db, actor, 'support');
  const {page, pageSize} = pageInput(input);
  const rows = await db.select({id: auditEvents.id, actorUserId: auditEvents.actorUserId, workspaceId: auditEvents.workspaceId, commandName: auditEvents.commandName, commandKey: auditEvents.commandKey, semanticHash: auditEvents.semanticHash, createdAt: auditEvents.createdAt})
    .from(auditEvents).orderBy(desc(auditEvents.createdAt), asc(auditEvents.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;
  return {page, pageSize, hasMore, items: rows.slice(0, pageSize).map((row) => ({...row, createdAt: row.createdAt.toISOString()}))};
}

export async function readAdminWorkspace(db: AppDatabase, actor: WorkspaceActor, workspaceId: string, purpose: string): Promise<Readonly<Record<string, unknown>>> {
  const normalizedPurpose = validateOperatorReason(purpose);
  return inTransaction(db, async (tx) => {
    await requireCurrentOperator(tx, actor, 'operator');
    const rows = await tx.select({id: workspaces.id, name: workspaces.name, kind: workspaces.kind, status: workspaces.status, version: workspaces.version, createdBy: workspaces.createdBy, billingStatus: billingAccounts.status, memberCount: sql<number>`count(${workspaceMembers.userId})::int`})
      .from(workspaces).leftJoin(billingAccounts, eq(billingAccounts.workspaceId, workspaces.id)).leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id)).where(eq(workspaces.id, workspaceId)).groupBy(workspaces.id, billingAccounts.status).limit(1);
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    const creditAccount = (await tx.select({version: creditAccounts.version}).from(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId)).limit(1))[0];
    await recordTenantAccess(tx, {actorUserId: actor.userId, workspaceId, purpose: normalizedPurpose});
    return {...row, billingStatus: row.billingStatus ?? 'active', memberCount: row.memberCount, creditAccountVersion: creditAccount ? creditAccount.version.toString() : null};
  });
}
