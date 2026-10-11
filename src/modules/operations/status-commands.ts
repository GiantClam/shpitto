import {and, eq} from 'drizzle-orm';

import {semanticHash} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {authUser} from '../../db/schema/auth.ts';
import {billingAccounts} from '../../db/schema/billing.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {authorizeOperatorCommand} from './authorize.ts';
import {disableOperatorUser} from './commands.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

export type StatusCommandResult = Readonly<{
  changed: boolean;
  version: number;
}>;

function validateId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError('VALIDATION', `${field} is required.`);
  return normalized;
}

function validateReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 3 || normalized.length > 500 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new DomainError('VALIDATION', 'A status-change reason must be 3-500 characters without control characters.');
  }
  return normalized;
}

async function authorizeStatusCommand(tx: TransactionDatabase, actor: WorkspaceActor, reason: string): Promise<void> {
  validateReason(reason);
  await authorizeOperatorCommand(tx, actor, 'operator');
}

async function lockUser(tx: TransactionDatabase, userId: string): Promise<typeof authUser.$inferSelect> {
  const rows = await tx.select().from(authUser).where(eq(authUser.id, userId)).for('update').limit(1);
  const user = rows[0];
  if (!user) throw new DomainError('NOT_FOUND', 'User is not available.');
  return user;
}

async function lockUserAccess(tx: TransactionDatabase, userId: string, now: Date) {
  const rows = await tx.select().from(userAccessControls).where(eq(userAccessControls.userId, userId)).for('update').limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const inserted = await tx.insert(userAccessControls).values({
    userId,
    status: 'active',
    disabledAt: null,
    reason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning();
  return inserted[0] ?? (await tx.select().from(userAccessControls).where(eq(userAccessControls.userId, userId)).for('update').limit(1))[0];
}

export async function disableUser(
  db: AppDatabase,
  actor: WorkspaceActor,
  targetUserId: string,
  reason: string,
): Promise<StatusCommandResult> {
  const userId = validateId(targetUserId, 'targetUserId');
  const normalizedReason = validateReason(reason);
  // Compatibility for existing internal callers. Public commands must carry
  // the caller's reviewed version/key; this helper cannot bypass owner/audit rules.
  await authorizeOperatorCommand(db, actor, 'operator');
  const current = (await db.select({version: userAccessControls.version}).from(userAccessControls).where(eq(userAccessControls.userId, userId)).limit(1))[0];
  const expectedVersion = current?.version ?? 1;
  const idempotencyKey = semanticHash('operator.account.disable.compat', {targetUserId: userId, expectedVersion, reason: normalizedReason});
  const result = await disableOperatorUser(db, {actor, targetUserId: userId, reason: normalizedReason, expectedVersion, idempotencyKey});
  return {changed: result.changed, version: result.version};
}

export async function restoreUser(
  db: AppDatabase,
  actor: WorkspaceActor,
  targetUserId: string,
  reason: string,
): Promise<StatusCommandResult> {
  const userId = validateId(targetUserId, 'targetUserId');
  return inTransaction(db, async (tx) => {
    await authorizeStatusCommand(tx, actor, reason);
    const user = await lockUser(tx, userId);
    const now = new Date();
    const access = await lockUserAccess(tx, userId, now);
    if (!access) throw new DomainError('INFRASTRUCTURE', 'User access state could not be initialized.');
    if (access.status === 'active') return {changed: false, version: access.version};
    await tx.update(userAccessControls).set({status: 'active', disabledAt: null, reason: null, version: access.version + 1, updatedAt: now}).where(and(
      eq(userAccessControls.userId, userId),
      eq(userAccessControls.version, access.version),
    ));
    await tx.update(authUser).set({disabledAt: null, updatedAt: now}).where(eq(authUser.id, user.id));
    return {changed: true, version: access.version + 1};
  });
}

async function setWorkspaceStatus(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  status: 'active' | 'suspended',
  reason: string,
): Promise<StatusCommandResult> {
  const id = validateId(workspaceId, 'workspaceId');
  return inTransaction(db, async (tx) => {
    await authorizeStatusCommand(tx, actor, reason);
    const rows = await tx.select().from(workspaces).where(eq(workspaces.id, id)).for('update').limit(1);
    const workspace = rows[0];
    if (!workspace) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    if (workspace.status === status) return {changed: false, version: workspace.version};
    const now = new Date();
    await tx.update(workspaces).set({status, version: workspace.version + 1, updatedAt: now}).where(eq(workspaces.id, id));
    return {changed: true, version: workspace.version + 1};
  });
}

export function suspendWorkspace(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  reason: string,
): Promise<StatusCommandResult> {
  return setWorkspaceStatus(db, actor, workspaceId, 'suspended', reason);
}

export function resumeWorkspace(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  reason: string,
): Promise<StatusCommandResult> {
  return setWorkspaceStatus(db, actor, workspaceId, 'active', reason);
}

async function setBillingHold(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  status: 'active' | 'hold',
  reason: string,
): Promise<StatusCommandResult> {
  const id = validateId(workspaceId, 'workspaceId');
  return inTransaction(db, async (tx) => {
    await authorizeStatusCommand(tx, actor, reason);
    const workspaceRows = await tx.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.id, id)).for('update').limit(1);
    if (!workspaceRows[0]) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    const accountRows = await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, id)).for('update').limit(1);
    const now = new Date();
    const account = accountRows[0];
    if (!account) {
      await tx.insert(billingAccounts).values({workspaceId: id, status, holdReason: status === 'hold' ? reason : null, version: 1, createdAt: now, updatedAt: now});
      return {changed: true, version: 1};
    }
    const nextReason = status === 'hold' ? reason : null;
    if (account.status === status && account.holdReason === nextReason) return {changed: false, version: account.version};
    await tx.update(billingAccounts).set({status, holdReason: nextReason, version: account.version + 1, updatedAt: now}).where(and(
      eq(billingAccounts.workspaceId, id),
      eq(billingAccounts.version, account.version),
    ));
    return {changed: true, version: account.version + 1};
  });
}

export function placeBillingHold(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  reason: string,
): Promise<StatusCommandResult> {
  return setBillingHold(db, actor, workspaceId, 'hold', reason);
}

export function releaseBillingHold(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceId: string,
  reason: string,
): Promise<StatusCommandResult> {
  return setBillingHold(db, actor, workspaceId, 'active', reason);
}
