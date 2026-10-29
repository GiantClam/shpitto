import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {authUser} from '../../db/schema/auth.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {readSecurityPolicy} from '../security/settings.ts';
import {workspaceMembers, workspaces} from '../../db/schema/workspace.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export const RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

export type WorkspaceActor = Readonly<{
  userId: string;
  /** Better Auth session identity used for session-bound operator step-up. */
  sessionId?: string;
  /** Set by the trusted server session, never by a browser body. */
  recentAuthenticationAt?: Date | string;
}>;

export type WorkspaceAccess = Readonly<{
  workspace: typeof workspaces.$inferSelect;
  membership: typeof workspaceMembers.$inferSelect;
}>;

type WorkspaceQueryDatabase = AppDatabase | TransactionDatabase;

function fail(code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION', message: string): never {
  throw new DomainError(code, message);
}

function assertUserId(userId: string): void {
  if (typeof userId !== 'string' || userId.trim().length === 0) fail('VALIDATION', 'A current user is required.');
}

function assertWorkspaceId(workspaceId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    fail('VALIDATION', 'workspaceId must be a UUID.');
  }
}

export function assertRecentAuthentication(actor: WorkspaceActor, now = new Date()): void {
  const value = actor.recentAuthenticationAt;
  const authenticatedAt = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!authenticatedAt || Number.isNaN(authenticatedAt.getTime())) {
    fail('FORBIDDEN', 'Recent authentication is required.');
  }
  const age = now.getTime() - authenticatedAt.getTime();
  if (age < 0 || age > RECENT_AUTH_MAX_AGE_MS) fail('FORBIDDEN', 'Recent authentication is required.');
}

export async function lockWorkspace(tx: TransactionDatabase, workspaceId: string): Promise<typeof workspaces.$inferSelect> {
  assertWorkspaceId(workspaceId);
  const rows = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1);
  const workspace = rows[0];
  if (!workspace) fail('NOT_FOUND', 'Workspace not found.');
  return workspace;
}

export async function requireActiveVerifiedUser(db: WorkspaceQueryDatabase, userId: string): Promise<void> {
  const rows = await db.select({
    id: authUser.id,
    emailVerified: authUser.emailVerified,
    authDisabledAt: authUser.disabledAt,
    accessStatus: userAccessControls.status,
  }).from(authUser)
    .leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id))
    .where(eq(authUser.id, userId)).limit(1);
  const user = rows[0];
  if (!user) fail('FORBIDDEN', 'Current user is not available.');
  const security = await readSecurityPolicy(db);
  if (user.authDisabledAt || user.accessStatus === 'disabled' || security.emailVerificationEnabled && !user.emailVerified) fail('FORBIDDEN', 'An active user is required.');
}

export async function requireCurrentMembership(
  db: WorkspaceQueryDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceAccess> {
  assertUserId(actor.userId);
  const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const workspace = workspaceRows[0];
  if (!workspace) fail('NOT_FOUND', 'Workspace not found.');
  const membershipRows = await db.select().from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.userId, actor.userId),
  )).limit(1);
  const membership = membershipRows[0];
  if (!membership) fail('FORBIDDEN', 'You are not a member of this workspace.');
  await requireActiveVerifiedUser(db, actor.userId);
  return {workspace, membership};
}

export async function requireCurrentOwner(
  tx: TransactionDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceAccess> {
  const workspace = await lockWorkspace(tx, workspaceId);
  const access = await requireCurrentMembership(tx, workspaceId, actor);
  if (access.workspace.id !== workspace.id || access.membership.role !== 'owner') {
    fail('FORBIDDEN', 'Only a current workspace owner may perform this operation.');
  }
  if (workspace.status !== 'active') fail('FORBIDDEN', 'This workspace is not active.');
  return {workspace, membership: access.membership};
}

export async function assertPersonalWorkspaceImmutable(
  db: WorkspaceQueryDatabase,
  workspace: typeof workspaces.$inferSelect,
): Promise<void> {
  if (workspace.kind !== 'personal') return;
  const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
  const creator = members.find((member) => member.userId === workspace.createdBy);
  if (members.length !== 1 || !creator || creator.role !== 'owner') {
    fail('CONFLICT', 'Personal workspace ownership is invalid and cannot be changed.');
  }
}

export async function requireEligibleTransferTarget(
  tx: TransactionDatabase,
  workspaceId: string,
  currentUserId: string,
  targetUserId: string,
): Promise<typeof workspaceMembers.$inferSelect> {
  if (targetUserId === currentUserId) fail('CONFLICT', 'Ownership is already held by this user.');
  const memberRows = await tx.select().from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.userId, targetUserId),
  )).limit(1);
  const membership = memberRows[0];
  if (!membership || membership.role !== 'member') fail('CONFLICT', 'Ownership transfer requires an existing active member.');
  await requireActiveVerifiedUser(tx, targetUserId);
  return membership;
}

export async function countOwners(tx: TransactionDatabase, workspaceId: string): Promise<number> {
  const rows = await tx.select({userId: workspaceMembers.userId}).from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.role, 'owner'),
  ));
  return rows.length;
}
