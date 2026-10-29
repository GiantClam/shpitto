import {hostname, userInfo} from 'node:os';

import {and, eq, inArray} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {authAccount, authSession, authUser} from '../../db/schema/auth.ts';
import {auditEvents} from '../../db/schema/credit.ts';
import {operatorOwnerState, operatorRoles, operatorStepUps} from '../../db/schema/operator.ts';
import {inTransaction} from '../shared/transaction.ts';
import {recordOperatorAudit, validateExpectedVersion, validateOperatorReason} from './audit.ts';
import {lockAdministrativeOwnership} from './authorization.ts';
import {readSecurityPolicy} from '../security/settings.ts';

export type InitialOwnerClaimResult = Readonly<{claimed: boolean; userId: string | null}>;

/**
 * Claims fresh-install ownership for the identity returned by a successful
 * credential signup or login. The durable state row keeps later paths closed.
 */
export async function claimInitialOperatorOwner(db: AppDatabase, candidateUserId: string, now = new Date()): Promise<InitialOwnerClaimResult> {
  if (!candidateUserId.trim()) throw new DomainError('VALIDATION', 'A successful credential identity is required for the initial owner claim.');
  return inTransaction(db, async (tx) => {
    await lockAdministrativeOwnership(tx);
    const state = (await tx.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')).for('update').limit(1))[0];
    if (!state) throw new DomainError('INFRASTRUCTURE', 'Operator ownership state is unavailable.');
    if (state.initialized || !state.firstUserClaimOpen) return {claimed: false, userId: state.initializedByUserId};

    const existingRole = (await tx.select({userId: operatorRoles.userId}).from(operatorRoles).limit(1))[0];
    if (existingRole) {
      await tx.update(operatorOwnerState).set({
        firstUserClaimOpen: false,
        initialized: true,
        initializedByUserId: existingRole.userId,
        initializationMethod: 'preexisting',
        initializedAt: now,
        version: state.version + 1,
        updatedAt: now,
      }).where(eq(operatorOwnerState.id, state.id));
      return {claimed: false, userId: existingRole.userId};
    }

    const candidate = (await tx.select({userId: authUser.id})
      .from(authUser)
      .innerJoin(authAccount, and(eq(authAccount.userId, authUser.id), eq(authAccount.providerId, 'credential')))
      .where(eq(authUser.id, candidateUserId))
      .limit(1))[0];
    if (!candidate) return {claimed: false, userId: null};

    await tx.insert(operatorRoles).values({
      userId: candidate.userId,
      role: 'superadmin',
      grantedAt: now,
      revokedAt: null,
      version: 1,
      updatedAt: now,
    });
    await tx.update(operatorOwnerState).set({
      firstUserClaimOpen: false,
      initialized: true,
      initializedByUserId: candidate.userId,
      initializationMethod: 'first_registration',
      initializedAt: now,
      version: state.version + 1,
      updatedAt: now,
    }).where(eq(operatorOwnerState.id, state.id));
    await recordOperatorAudit(tx, {
      actorUserId: candidate.userId,
      commandName: 'operator.owner.first-registration-claim',
      commandKey: 'initial-owner',
      payload: {targetUserId: candidate.userId, method: 'first_registration', source: 'email-password'},
      now,
    });
    return {claimed: true, userId: candidate.userId};
  });
}

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
    const ownerState = (await tx.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')).for('update').limit(1))[0];
    if (!ownerState) throw new DomainError('INFRASTRUCTURE', 'Operator ownership state is unavailable.');
    const user = (await tx.select().from(authUser).where(eq(authUser.id, targetUserId)).for('update').limit(1))[0];
    const security = await readSecurityPolicy(tx);
    if (!user || security.emailVerificationEnabled && !user.emailVerified) throw new DomainError('FORBIDDEN', 'An existing eligible identity is required.');
    const access = (await tx.select().from(userAccessControls).where(eq(userAccessControls.userId, targetUserId)).for('update').limit(1))[0];
    const role = (await tx.select().from(operatorRoles).where(eq(operatorRoles.userId, targetUserId)).for('update').limit(1))[0];
    if (input.mode === 'bootstrap') {
      const initialized = await tx.select({id: auditEvents.id}).from(auditEvents).where(inArray(auditEvents.commandName, ['operator.owner.bootstrap', 'operator.owner.first-registration-claim'])).limit(1);
      const existingSuperadmin = await tx.select({userId: operatorRoles.userId}).from(operatorRoles).where(eq(operatorRoles.role, 'superadmin')).limit(1);
      if (ownerState.initialized || initialized[0] || existingSuperadmin[0]) throw new DomainError('CONFLICT', 'Operator administration is already initialized; bootstrap is disabled.');
      if (user.disabledAt || access?.status === 'disabled') throw new DomainError('FORBIDDEN', 'A disabled identity cannot initialize administration.');
    } else {
      if (!role || role.role !== 'superadmin') throw new DomainError('FORBIDDEN', 'Recovery can restore only a previously appointed superadmin.');
      if (role.version !== expectedVersion) throw new DomainError('CONFLICT', 'The operator role version is stale.');
    }
    const version = input.mode === 'bootstrap' ? (role?.version ?? 0) + 1 : role!.version + 1;
    if (!input.apply) return {mode: input.mode, applied: false, targetUserId, version};
    if (input.mode === 'bootstrap') {
      if (role) {
        await tx.update(operatorRoles).set({role: 'superadmin', grantedAt: now, revokedAt: null, version, updatedAt: now}).where(eq(operatorRoles.userId, targetUserId));
      } else {
        await tx.insert(operatorRoles).values({userId: targetUserId, role: 'superadmin', grantedAt: now, revokedAt: null, version, updatedAt: now});
      }
      await tx.update(operatorOwnerState).set({
        firstUserClaimOpen: false,
        initialized: true,
        initializedByUserId: targetUserId,
        initializationMethod: 'server_bootstrap',
        initializedAt: now,
        version: ownerState.version + 1,
        updatedAt: now,
      }).where(eq(operatorOwnerState.id, ownerState.id));
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
