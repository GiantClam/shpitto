import {hostname, userInfo} from 'node:os';

import {eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {authSession, authUser} from '../../db/schema/auth.ts';
import {auditEvents} from '../../db/schema/credit.ts';
import {operatorRoles, operatorStepUps} from '../../db/schema/operator.ts';
import {inTransaction} from '../shared/transaction.ts';
import {recordOperatorAudit, validateExpectedVersion, validateOperatorReason} from './audit.ts';
import {lockAdministrativeOwnership} from './authorization.ts';

type ServerAccessInput = Readonly<{
  targetUserId: string;
  reason: string;
  changeReference: string;
  apply?: boolean;
  now?: Date;
}>;

/** CLI only: authority is independently authenticated administrative host/database access. */
export async function administerOperatorOwner(db: AppDatabase, input: ServerAccessInput & (
  Readonly<{mode: 'bootstrap'}> | Readonly<{mode: 'recover'; expectedVersion: number}>
)): Promise<Readonly<{mode: 'bootstrap' | 'recover'; applied: boolean; targetUserId: string; version: number}>> {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) throw new DomainError('VALIDATION', 'targetUserId is required.');
  const reason = validateOperatorReason(input.reason);
  const changeReference = validateOperatorReason(input.changeReference);
  const expectedVersion = input.mode === 'recover' ? validateExpectedVersion(input.expectedVersion) : null;
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    // Also serializes two first-time invocations before any role row exists.
    await lockAdministrativeOwnership(tx);
    const user = (await tx.select().from(authUser).where(eq(authUser.id, targetUserId)).for('update').limit(1))[0];
    if (!user || !user.emailVerified) throw new DomainError('FORBIDDEN', 'An existing verified identity is required.');
    const access = (await tx.select().from(userAccessControls).where(eq(userAccessControls.userId, targetUserId)).for('update').limit(1))[0];
    const role = (await tx.select().from(operatorRoles).where(eq(operatorRoles.userId, targetUserId)).for('update').limit(1))[0];
    if (input.mode === 'bootstrap') {
      const initialized = await tx.select({id: auditEvents.id}).from(auditEvents).where(eq(auditEvents.commandName, 'operator.owner.bootstrap')).limit(1);
      const existingRoles = await tx.select({userId: operatorRoles.userId}).from(operatorRoles).limit(1);
      if (initialized[0] || existingRoles[0]) throw new DomainError('CONFLICT', 'Operator administration is already initialized; bootstrap is disabled.');
      if (user.disabledAt || access?.status === 'disabled') throw new DomainError('FORBIDDEN', 'A disabled identity cannot initialize administration.');
    } else {
      if (!role || role.role !== 'superadmin') throw new DomainError('FORBIDDEN', 'Recovery can restore only a previously appointed superadmin.');
      if (role.version !== expectedVersion) throw new DomainError('CONFLICT', 'The operator role version is stale.');
    }
    const version = input.mode === 'bootstrap' ? 1 : role!.version + 1;
    if (!input.apply) return {mode: input.mode, applied: false, targetUserId, version};
    if (input.mode === 'bootstrap') {
      await tx.insert(operatorRoles).values({userId: targetUserId, role: 'superadmin', grantedAt: now, revokedAt: null, version, updatedAt: now});
    } else {
      await tx.update(operatorRoles).set({revokedAt: null, version, updatedAt: now}).where(eq(operatorRoles.userId, targetUserId));
      await tx.update(authUser).set({disabledAt: null, updatedAt: now}).where(eq(authUser.id, targetUserId));
      if (access) await tx.update(userAccessControls).set({status: 'active', disabledAt: null, reason, version: access.version + 1, updatedAt: now}).where(eq(userAccessControls.userId, targetUserId));
      // Recovery never manufactures a verified session or a second-factor stamp.
      await tx.delete(operatorStepUps).where(eq(operatorStepUps.userId, targetUserId));
      await tx.delete(authSession).where(eq(authSession.userId, targetUserId));
    }
    await recordOperatorAudit(tx, {
      actorUserId: targetUserId,
      commandName: `operator.owner.${input.mode}`,
      commandKey: input.mode === 'bootstrap' ? 'initial-owner' : `recover:${version}`,
      payload: {targetUserId, reason, changeReference, expectedVersion, version, authority: 'out-of-band-server-access', serverPrincipal: userInfo().username, serverHost: hostname()},
      now,
    });
    return {mode: input.mode, applied: true, targetUserId, version};
  });
}
