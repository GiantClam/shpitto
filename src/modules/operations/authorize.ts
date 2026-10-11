import {randomUUID} from 'node:crypto';

import {and, desc, eq, gt, isNull, lte} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {authSession, authUser} from '../../db/schema/auth.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {operatorRoles, operatorStepUps, OPERATOR_STEP_UP_TTL_MS, type OperatorRole} from '../../db/schema/operator.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

const ROLE_RANK: Readonly<Record<OperatorRole, number>> = {
  support: 1,
  operator: 2,
  superadmin: 3,
};

export type OperatorAccess = Readonly<{
  userId: string;
  sessionId: string;
  role: OperatorRole;
  stepUpExpiresAt: Date;
}>;

type OperatorQueryDatabase = AppDatabase | TransactionDatabase;

function requireSession(actor: WorkspaceActor): string {
  if (!actor.sessionId) throw new DomainError('FORBIDDEN', 'A current live session is required.');
  return actor.sessionId;
}

function parseRole(role: string): OperatorRole {
  if (role === 'support' || role === 'operator' || role === 'superadmin') return role;
  throw new DomainError('FORBIDDEN', 'Operator access is unavailable.');
}

async function requireLiveSession(db: OperatorQueryDatabase, actor: WorkspaceActor, now: Date): Promise<string> {
  const sessionId = requireSession(actor);
  const rows = await db.select({id: authSession.id, userId: authSession.userId, expiresAt: authSession.expiresAt})
    .from(authSession).where(eq(authSession.id, sessionId)).limit(1);
  const session = rows[0];
  if (!session || session.userId !== actor.userId || session.expiresAt.getTime() <= now.getTime()) {
    throw new DomainError('FORBIDDEN', 'A current live session is required.');
  }
  return sessionId;
}

export async function requireOperatorIdentity(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
  minimumRole: OperatorRole = 'operator',
  now = new Date(),
): Promise<Readonly<{userId: string; sessionId: string; role: OperatorRole}>> {
  const sessionId = await requireLiveSession(db, actor, now);
  const users = await db.select({
    id: authUser.id,
    emailVerified: authUser.emailVerified,
    twoFactorEnabled: authUser.twoFactorEnabled,
    authDisabledAt: authUser.disabledAt,
    accessStatus: userAccessControls.status,
  }).from(authUser)
    .leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id))
    .where(eq(authUser.id, actor.userId)).limit(1);
  const user = users[0];
  if (!user || !user.emailVerified || user.authDisabledAt || user.accessStatus === 'disabled') throw new DomainError('FORBIDDEN', 'Operator access is unavailable.');

  const rows = await db.select({role: operatorRoles.role})
    .from(operatorRoles)
    .where(and(
      eq(operatorRoles.userId, actor.userId),
      isNull(operatorRoles.revokedAt),
    ))
    .limit(1);
  const role = rows[0] ? parseRole(rows[0].role) : null;
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw new DomainError('FORBIDDEN', 'Operator access is unavailable.');
  }
  return {userId: actor.userId, sessionId, role};
}

export async function requireCurrentOperator(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
  minimumRole: OperatorRole = 'operator',
  now = new Date(),
): Promise<Readonly<{userId: string; sessionId: string; role: OperatorRole}>> {
  const operator = await requireOperatorIdentity(db, actor, minimumRole, now);
  const user = (await db.select({enabled: authUser.twoFactorEnabled}).from(authUser).where(eq(authUser.id, actor.userId)).limit(1))[0];
  const completed = (await db.select({id: operatorStepUps.id}).from(operatorStepUps).where(and(eq(operatorStepUps.userId, actor.userId), eq(operatorStepUps.sessionId, operator.sessionId), lte(operatorStepUps.verifiedAt, now))).limit(1))[0];
  if (!user?.enabled || !completed) throw new DomainError('FORBIDDEN', 'Complete second-factor verification for this session.');
  return operator;
}

export async function recordTrustedSecondFactor(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
  now = new Date(),
): Promise<Readonly<{stepUpId: string; expiresAt: Date}>> {
  const sessionId = await requireLiveSession(db, actor, now);
  await requireOperatorIdentity(db, actor, 'support', now);
  const users = await db.select({
    id: authUser.id,
    emailVerified: authUser.emailVerified,
    authDisabledAt: authUser.disabledAt,
    accessStatus: userAccessControls.status,
  }).from(authUser)
    .leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id))
    .where(eq(authUser.id, actor.userId)).limit(1);
  const user = users[0];
  if (!user || !user.emailVerified || user.authDisabledAt || user.accessStatus === 'disabled') throw new DomainError('FORBIDDEN', 'A verified active user is required.');
  const expiresAt = new Date(now.getTime() + OPERATOR_STEP_UP_TTL_MS);
  const stepUpId = randomUUID();
  await db.insert(operatorStepUps).values({
    id: stepUpId,
    userId: actor.userId,
    sessionId,
    method: 'trusted_second_factor',
    verifiedAt: now,
    expiresAt,
    createdAt: now,
  });
  return {stepUpId, expiresAt};
}

export async function requireTrustedStepUp(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
  now = new Date(),
): Promise<Date> {
  const sessionId = await requireLiveSession(db, actor, now);
  const rows = await db.select({expiresAt: operatorStepUps.expiresAt})
    .from(operatorStepUps)
    .where(and(
      eq(operatorStepUps.userId, actor.userId),
      eq(operatorStepUps.sessionId, sessionId),
      lte(operatorStepUps.verifiedAt, now),
      gt(operatorStepUps.expiresAt, now),
    ))
    .orderBy(desc(operatorStepUps.expiresAt))
    .limit(1);
  const expiresAt = rows[0]?.expiresAt;
  if (!expiresAt) throw new DomainError('FORBIDDEN', 'Trusted step-up verification is required.');
  return expiresAt;
}

export async function authorizeOperatorCommand(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
  minimumRole: OperatorRole = 'operator',
  now = new Date(),
): Promise<OperatorAccess> {
  const operator = await requireCurrentOperator(db, actor, minimumRole, now);
  const stepUpExpiresAt = await requireTrustedStepUp(db, actor, now);
  return {...operator, stepUpExpiresAt};
}

export async function readOperatorSession(
  db: OperatorQueryDatabase,
  actor: WorkspaceActor,
): Promise<Readonly<{role: OperatorRole | null; stepUpExpiresAt: Date | null}>> {
  if (!actor.sessionId) return {role: null, stepUpExpiresAt: null};
  try {
    const operator = await requireCurrentOperator(db, actor, 'support');
    const stepUpExpiresAt = await requireTrustedStepUp(db, actor);
    return {role: operator.role, stepUpExpiresAt};
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return {role: null, stepUpExpiresAt: null};
    throw error;
  }
}
