import {createHash, randomBytes, randomUUID} from 'node:crypto';

import {and, eq, isNull, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {authUser} from '../../db/schema/auth.ts';
import {mailOutbox, workspaceInvitations} from '../../db/schema/invitations.ts';
import {workspaceMembers} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {
  lockWorkspace,
  requireActiveVerifiedUser,
  type WorkspaceActor,
} from './policy.ts';
import {authorizeWorkspaceOwner} from './authorize.ts';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_EXPIRY_MS = INVITATION_TTL_MS;

type InvitationTx = TransactionDatabase;

export type InvitationSummary = Readonly<{
  invitationId: string;
  workspaceId: string;
  emailNormalized: string;
  expiresAt: Date;
}>;

export type InvitationCreationResult = InvitationSummary & Readonly<{token: string}>;

export type InvitationAcceptanceResult = Readonly<{
  workspaceId: string;
  changed: boolean;
}>;

const INVALID_INVITATION_MESSAGE = 'Invitation is invalid or expired.';

function invalidInvitation(): never {
  throw new DomainError('FORBIDDEN', INVALID_INVITATION_MESSAGE);
}

export function normalizeInvitationEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new DomainError('VALIDATION', 'A valid invitation email is required.');
  }
  return normalized;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createTeamInvitation(
  db: AppDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
  email: string,
): Promise<InvitationCreationResult> {
  const emailNormalized = normalizeInvitationEmail(email);
  return inTransaction(db, async (tx) => {
    const access = await authorizeWorkspaceOwner(tx, workspaceId, actor);
    if (access.workspace.kind !== 'team') {
      throw new DomainError('FORBIDDEN', 'Personal workspaces cannot invite members.');
    }

    const existingPending = await tx.select({id: workspaceInvitations.id})
      .from(workspaceInvitations)
      .where(and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.emailNormalized, emailNormalized),
        isNull(workspaceInvitations.acceptedAt),
      ))
      .limit(1);
    if (existingPending.length > 0) {
      throw new DomainError('CONFLICT', 'An invitation is already pending for this email.');
    }

    const existingMember = await tx.select({userId: workspaceMembers.userId})
      .from(workspaceMembers)
      .innerJoin(authUser, eq(authUser.id, workspaceMembers.userId))
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        sql`lower(${authUser.email}) = ${emailNormalized}`,
      ))
      .limit(1);
    if (existingMember.length > 0) {
      throw new DomainError('CONFLICT', 'This user is already a workspace member.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const token = newToken();
    const invitationId = randomUUID();
    await tx.insert(workspaceInvitations).values({
      id: invitationId,
      workspaceId,
      emailNormalized,
      role: 'member',
      tokenHash: hashToken(token),
      expiresAt,
      acceptedAt: null,
      acceptedBy: null,
      inviterId: actor.userId,
      createdAt: now,
    });
    await tx.insert(mailOutbox).values({
      id: randomUUID(),
      kind: 'workspace_invitation',
      invitationId,
      businessKey: `workspace-invitation:${invitationId}`,
      recipientEmail: emailNormalized,
      payload: {invitationId, workspaceId, token, expiresAt: expiresAt.toISOString()},
      status: 'pending',
      availableAt: now,
      attempts: 0,
      createdAt: now,
    });
    return {invitationId, workspaceId, emailNormalized, expiresAt, token};
  });
}

async function findInvitationByToken(tx: InvitationTx, tokenHash: string) {
  const rows = await tx.select().from(workspaceInvitations).where(eq(workspaceInvitations.tokenHash, tokenHash)).limit(1);
  return rows[0];
}

export async function acceptTeamInvitation(
  db: AppDatabase,
  actor: WorkspaceActor,
  token: string,
): Promise<InvitationAcceptanceResult> {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) invalidInvitation();
  const tokenHash = hashToken(token);
  return inTransaction(db, async (tx) => {
    const candidate = await findInvitationByToken(tx, tokenHash);
    if (!candidate) invalidInvitation();
    let workspace;
    try {
      workspace = await lockWorkspace(tx, candidate.workspaceId);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOT_FOUND') invalidInvitation();
      throw error;
    }
    if (workspace.kind !== 'team' || workspace.status !== 'active') invalidInvitation();

    const rows = await tx.select().from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, tokenHash))
      .for('update')
      .limit(1);
    const invitation = rows[0];
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) invalidInvitation();

    await requireActiveVerifiedUser(tx, actor.userId);
    const userRows = await tx.select({id: authUser.id, email: authUser.email})
      .from(authUser).where(eq(authUser.id, actor.userId)).limit(1);
    const user = userRows[0];
    if (!user || user.email.trim().toLowerCase() !== invitation.emailNormalized) invalidInvitation();

    const inserted = await tx.insert(workspaceMembers).values({
      workspaceId: invitation.workspaceId,
      userId: actor.userId,
      role: invitation.role,
      createdAt: new Date(),
    }).onConflictDoNothing().returning({userId: workspaceMembers.userId});
    await tx.update(workspaceInvitations)
      .set({acceptedAt: new Date(), acceptedBy: actor.userId})
      .where(eq(workspaceInvitations.id, invitation.id));
    return {workspaceId: invitation.workspaceId, changed: inserted.length > 0};
  });
}

export const createInvitation = createTeamInvitation;
export const acceptInvitation = acceptTeamInvitation;
