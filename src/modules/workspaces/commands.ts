import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts} from '../../db/schema/billing.ts';
import {creditAccounts, workspaceMembers, workspaces} from '../../db/schema/workspace.ts';
import {inTransaction} from '../shared/transaction.ts';
import {executeDurableCommand, type CommandIdentity} from '../shared/commands.ts';
import {
  assertPersonalWorkspaceImmutable,
  assertRecentAuthentication,
  countOwners,
  lockWorkspace,
  requireActiveVerifiedUser,
  requireEligibleTransferTarget,
  type WorkspaceActor,
} from './policy.ts';
import {authorizeWorkspaceAccess, authorizeWorkspaceOwner} from './authorize.ts';
import {captureWorkspaceAttributionInTransaction} from '../affiliates/runtime.ts';
import type {ReferralTouch} from '../affiliates/contracts.ts';

export type WorkspaceCommandResult = Readonly<{
  workspaceId: string;
  changed: boolean;
  replayed?: boolean;
}>;

function validateName(name: string): string {
  const value = name.trim();
  if (value.length < 1 || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new DomainError('VALIDATION', 'workspaceName must be 1-100 characters without control characters.');
  }
  return value;
}

function validateUserId(userId: string): string {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new DomainError('VALIDATION', 'targetUserId is required.');
  }
  return userId.trim();
}

function timestamp(): Date {
  return new Date();
}

export async function createTeamWorkspace(
  db: AppDatabase,
  actor: WorkspaceActor,
  workspaceName = 'Team workspace',
  command?: CommandIdentity,
  referralTouch: ReferralTouch | null = null,
): Promise<WorkspaceCommandResult> {
  const name = validateName(workspaceName);
  return inTransaction(db, async (tx) => {
    const work = async (): Promise<WorkspaceCommandResult> => {
      await requireActiveVerifiedUser(tx, actor.userId);
      const workspaceId = randomUUID();
      const now = timestamp();
      await tx.insert(workspaces).values({
        id: workspaceId,
        kind: 'team',
        name,
        createdBy: actor.userId,
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(workspaceMembers).values({workspaceId, userId: actor.userId, role: 'owner', createdAt: now});
      await tx.insert(creditAccounts).values({
        workspaceId,
        version: 0n,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(billingAccounts).values({
        workspaceId,
        status: 'active',
        holdReason: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await captureWorkspaceAttributionInTransaction(tx, {workspaceId, creatorUserId: actor.userId, touch: referralTouch, now});
      return {workspaceId, changed: true};
    };
    if (!command) return work();
    const execution = await executeDurableCommand(tx, command, work);
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function transferWorkspaceOwnership(
  db: AppDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
  targetUserId: string,
): Promise<WorkspaceCommandResult> {
  const target = validateUserId(targetUserId);
  assertRecentAuthentication(actor);
  return inTransaction(db, async (tx) => {
    const access = await authorizeWorkspaceOwner(tx, workspaceId, actor);
    await assertPersonalWorkspaceImmutable(tx, access.workspace);
    if (access.workspace.kind !== 'team') throw new DomainError('FORBIDDEN', 'Personal workspace collaboration requires a separate team workspace.');
    await requireEligibleTransferTarget(tx, workspaceId, actor.userId, target);
    const now = timestamp();
    await tx.update(workspaceMembers).set({role: 'owner'}).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, target),
    ));
    await tx.update(workspaceMembers).set({role: 'member'}).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, actor.userId),
    ));
    await tx.update(workspaces).set({version: access.workspace.version + 1, updatedAt: now}).where(eq(workspaces.id, workspaceId));
    if ((await countOwners(tx, workspaceId)) < 1) throw new DomainError('CONFLICT', 'A team must retain an owner.');
    return {workspaceId, changed: true};
  });
}

export async function removeWorkspaceMember(
  db: AppDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
  targetUserId: string,
): Promise<WorkspaceCommandResult> {
  const target = validateUserId(targetUserId);
  return inTransaction(db, async (tx) => {
    const access = await authorizeWorkspaceOwner(tx, workspaceId, actor);
    await assertPersonalWorkspaceImmutable(tx, access.workspace);
    if (access.workspace.kind !== 'team') throw new DomainError('FORBIDDEN', 'Personal workspace collaboration requires a separate team workspace.');
    const targetRows = await tx.select().from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, target),
    )).limit(1);
    const membership = targetRows[0];
    if (!membership) throw new DomainError('NOT_FOUND', 'Workspace member not found.');
    if (membership.role === 'owner' && (await countOwners(tx, workspaceId)) <= 1) {
      throw new DomainError('CONFLICT', 'A team must retain an owner.');
    }
    await tx.delete(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, target),
    ));
    await tx.update(workspaces).set({version: access.workspace.version + 1, updatedAt: timestamp()}).where(eq(workspaces.id, workspaceId));
    return {workspaceId, changed: true};
  });
}

export async function demoteWorkspaceMember(
  db: AppDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
  targetUserId: string,
): Promise<WorkspaceCommandResult> {
  const target = validateUserId(targetUserId);
  return inTransaction(db, async (tx) => {
    const access = await authorizeWorkspaceOwner(tx, workspaceId, actor);
    await assertPersonalWorkspaceImmutable(tx, access.workspace);
    if (access.workspace.kind !== 'team') throw new DomainError('FORBIDDEN', 'Personal workspace collaboration requires a separate team workspace.');
    const targetRows = await tx.select().from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, target),
    )).limit(1);
    const membership = targetRows[0];
    if (!membership) throw new DomainError('NOT_FOUND', 'Workspace member not found.');
    if (membership.role !== 'owner') return {workspaceId, changed: false};
    if ((await countOwners(tx, workspaceId)) <= 1) throw new DomainError('CONFLICT', 'A team must retain an owner.');
    await tx.update(workspaceMembers).set({role: 'member'}).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, target),
    ));
    await tx.update(workspaces).set({version: access.workspace.version + 1, updatedAt: timestamp()}).where(eq(workspaces.id, workspaceId));
    return {workspaceId, changed: true};
  });
}

export async function leaveWorkspace(
  db: AppDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceCommandResult> {
  return inTransaction(db, async (tx) => {
    const workspace = await lockWorkspace(tx, workspaceId);
    await assertPersonalWorkspaceImmutable(tx, workspace);
    if (workspace.kind !== 'team') throw new DomainError('FORBIDDEN', 'Personal workspace ownership is immutable; create a separate team workspace to collaborate.');
    const membership = (await authorizeWorkspaceAccess(tx, workspaceId, actor)).membership;
    if (membership.role === 'owner' && (await countOwners(tx, workspaceId)) <= 1) {
      throw new DomainError('CONFLICT', 'A team must retain an owner.');
    }
    await tx.delete(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, actor.userId),
    ));
    await tx.update(workspaces).set({version: workspace.version + 1, updatedAt: timestamp()}).where(eq(workspaces.id, workspaceId));
    return {workspaceId, changed: true};
  });
}
