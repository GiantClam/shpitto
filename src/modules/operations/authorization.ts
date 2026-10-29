import {and, eq, isNull, sql} from 'drizzle-orm';

import {DomainError} from '../../db/contracts.ts';
import {authUser} from '../../db/schema/auth.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {operatorRoles} from '../../db/schema/operator.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';
import {readSecurityPolicy} from '../security/settings.ts';

export async function lockAdministrativeOwnership(tx: TransactionDatabase): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('operator-owner-administration', 0))`);
}

/**
 * Role edits and account disablement use this lock. It prevents a race from
 * leaving the system without an active superadmin recovery owner.
 */
export async function requireSurvivingAdministrativeOwner(
  tx: TransactionDatabase,
  targetUserId: string,
  now = new Date(),
): Promise<void> {
  const rows = await tx.select({
    userId: operatorRoles.userId,
    revokedAt: operatorRoles.revokedAt,
    emailVerified: authUser.emailVerified,
    disabledAt: authUser.disabledAt,
    accessStatus: userAccessControls.status,
  }).from(operatorRoles)
    .innerJoin(authUser, eq(authUser.id, operatorRoles.userId))
    .leftJoin(userAccessControls, eq(userAccessControls.userId, operatorRoles.userId))
    .where(and(
      eq(operatorRoles.role, 'superadmin'),
      isNull(operatorRoles.revokedAt),
    ));
  const security = await readSecurityPolicy(tx);
  const survivor = rows.some((row) => row.userId !== targetUserId && (!security.emailVerificationEnabled || row.emailVerified) && !row.disabledAt && row.accessStatus !== 'disabled');
  if (!survivor) throw new DomainError('CONFLICT', 'At least one active superadmin must remain.');
}

export async function assertRoleMutationPreservesOwner(
  tx: TransactionDatabase,
  targetUserId: string,
  nextRole: 'support' | 'operator' | 'superadmin' | null,
  now = new Date(),
): Promise<void> {
  const target = await tx.select({role: operatorRoles.role, revokedAt: operatorRoles.revokedAt})
    .from(operatorRoles).where(eq(operatorRoles.userId, targetUserId)).for('update').limit(1);
  const current = target[0];
  if (current?.role === 'superadmin' && current.revokedAt === null && nextRole !== 'superadmin') {
    await requireSurvivingAdministrativeOwner(tx, targetUserId, now);
  }
}
