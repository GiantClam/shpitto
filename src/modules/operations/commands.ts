import {randomUUID} from 'node:crypto';

import {and, eq, isNull, or, gt} from 'drizzle-orm';

import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {authSession, authUser} from '../../db/schema/auth.ts';
import {userAccessControls} from '../../db/schema/access.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {billingAccounts} from '../../db/schema/billing.ts';
import {operatorRoles} from '../../db/schema/operator.ts';
import {creditAccounts, creditGrants, workspaces} from '../../db/schema/workspace.ts';
import {commandPayload, executeDurableCommand} from '../shared/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {authorizeOperatorCommand} from './authorize.ts';
import {assertRoleMutationPreservesOwner, lockAdministrativeOwnership, requireSurvivingAdministrativeOwner} from './authorization.ts';
import {recordOperatorAudit, recordTenantAccess, validateExpectedVersion, validateOperatorReason} from './audit.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

export type OperatorCommandResult = Readonly<{changed: boolean; version: number; replayed?: boolean}>;

function id(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError('VALIDATION', `${field} is required.`);
  return normalized;
}

function amount(value: bigint): bigint {
  if (typeof value !== 'bigint' || value === 0n || value < -9_000_000_000_000_000n || value > 9_000_000_000_000_000n) throw new DomainError('VALIDATION', 'Credit adjustment amount is out of bounds.');
  return value;
}

async function lockOperatorRole(tx: TransactionDatabase, userId: string) {
  return (await tx.select().from(operatorRoles).where(eq(operatorRoles.userId, userId)).for('update').limit(1))[0] ?? null;
}

export async function setOperatorRole(
  db: AppDatabase,
  input: Readonly<{actor: WorkspaceActor; targetUserId: string; role: 'support' | 'operator' | 'superadmin' | null; expectedVersion: number; idempotencyKey: string; reason: string; now?: Date}>,
): Promise<OperatorCommandResult> {
  const targetUserId = id(input.targetUserId, 'targetUserId');
  const reason = validateOperatorReason(input.reason);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await lockAdministrativeOwnership(tx);
    const access = await authorizeOperatorCommand(tx, input.actor, 'superadmin', now);
    const target = await tx.select({id: authUser.id, emailVerified: authUser.emailVerified, disabledAt: authUser.disabledAt}).from(authUser).where(eq(authUser.id, targetUserId)).for('update').limit(1);
    if (!target[0]) throw new DomainError('NOT_FOUND', 'The operator user was not found.');
    const current = await lockOperatorRole(tx, targetUserId);
    const currentVersion = current?.version ?? 1;
    const identity = {actorUserId: access.userId, commandName: 'operator.role.set', idempotencyKey: input.idempotencyKey, payload: commandPayload({targetUserId, role: input.role, expectedVersion, reason})};
    const execution = await executeDurableCommand(tx, identity, async () => {
      if (currentVersion !== expectedVersion) throw new DomainError('CONFLICT', 'The operator role version is stale.');
      if (input.role === 'superadmin') {
        const targetAccess = (await tx.select({status: userAccessControls.status}).from(userAccessControls).where(eq(userAccessControls.userId, targetUserId)).for('update').limit(1))[0];
        if (!target[0]!.emailVerified || target[0]!.disabledAt || targetAccess?.status === 'disabled') throw new DomainError('FORBIDDEN', 'A superadmin appointment requires an active verified identity.');
      }
      await assertRoleMutationPreservesOwner(tx, targetUserId, input.role, now);
      if (input.role === null) {
        if (current) await tx.update(operatorRoles).set({revokedAt: now, version: current.version + 1, updatedAt: now}).where(eq(operatorRoles.userId, targetUserId));
        await recordOperatorAudit(tx, {actorUserId: access.userId, commandName: 'operator.role.set', commandKey: input.idempotencyKey, payload: {targetUserId, role: null, reason}, now});
        return {changed: Boolean(current && current.revokedAt === null), version: currentVersion + (current ? 1 : 0)};
      }
      if (current) {
        await tx.update(operatorRoles).set({role: input.role, revokedAt: null, version: current.version + 1, updatedAt: now}).where(eq(operatorRoles.userId, targetUserId));
      } else {
        await tx.insert(operatorRoles).values({userId: targetUserId, role: input.role, grantedAt: now, revokedAt: null, version: 1, updatedAt: now});
      }
      await recordOperatorAudit(tx, {actorUserId: access.userId, commandName: 'operator.role.set', commandKey: input.idempotencyKey, payload: {targetUserId, role: input.role, reason}, now});
      return {changed: true, version: current ? currentVersion + 1 : 1};
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function disableOperatorUser(
  db: AppDatabase,
  input: Readonly<{actor: WorkspaceActor; targetUserId: string; expectedVersion: number; idempotencyKey: string; reason: string; now?: Date}>,
): Promise<OperatorCommandResult> {
  const targetUserId = id(input.targetUserId, 'targetUserId');
  const reason = validateOperatorReason(input.reason);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    await lockAdministrativeOwnership(tx);
    const access = await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const target = (await tx.select().from(authUser).where(eq(authUser.id, targetUserId)).for('update').limit(1))[0];
    if (!target) throw new DomainError('NOT_FOUND', 'The user was not found.');
    const role = await lockOperatorRole(tx, targetUserId);
    if (role?.role === 'superadmin' && role.revokedAt === null) await requireSurvivingAdministrativeOwner(tx, targetUserId, now);
    const existing = (await tx.select().from(userAccessControls).where(eq(userAccessControls.userId, targetUserId)).for('update').limit(1))[0];
    const version = existing?.version ?? 1;
    const identity = {actorUserId: access.userId, commandName: 'operator.account.disable', idempotencyKey: input.idempotencyKey, payload: commandPayload({targetUserId, expectedVersion, reason})};
    const execution = await executeDurableCommand(tx, identity, async () => {
      if (version !== expectedVersion) throw new DomainError('CONFLICT', 'The account access version is stale.');
      if (existing?.status === 'disabled') return {changed: false, version};
      if (existing) {
        await tx.update(userAccessControls).set({status: 'disabled', disabledAt: now, reason, version: version + 1, updatedAt: now}).where(and(eq(userAccessControls.userId, targetUserId), eq(userAccessControls.version, version)));
      } else {
        await tx.insert(userAccessControls).values({userId: targetUserId, status: 'disabled', disabledAt: now, reason, version: version + 1, createdAt: now, updatedAt: now});
      }
      await tx.update(authUser).set({disabledAt: now, updatedAt: now}).where(eq(authUser.id, targetUserId));
      await tx.delete(authSession).where(eq(authSession.userId, targetUserId));
      await recordOperatorAudit(tx, {actorUserId: access.userId, commandName: 'operator.account.disable', commandKey: input.idempotencyKey, payload: {targetUserId, reason}, now});
      return {changed: true, version: version + 1};
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function setWorkspaceAdminStatus(
  db: AppDatabase,
  input: Readonly<{actor: WorkspaceActor; workspaceId: string; status: 'active' | 'suspended'; expectedVersion: number; idempotencyKey: string; reason: string; now?: Date}>,
): Promise<OperatorCommandResult> {
  const workspaceId = id(input.workspaceId, 'workspaceId');
  const reason = validateOperatorReason(input.reason);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const access = await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const workspace = (await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for('update').limit(1))[0];
    if (!workspace) throw new DomainError('NOT_FOUND', 'Workspace is not available.');
    const identity = {actorUserId: access.userId, workspaceId, commandName: 'operator.workspace.status', idempotencyKey: input.idempotencyKey, payload: commandPayload({workspaceId, status: input.status, expectedVersion, reason})};
    const execution = await executeDurableCommand(tx, identity, async () => {
      if (workspace.version !== expectedVersion) throw new DomainError('CONFLICT', 'The workspace version is stale.');
      if (workspace.status === input.status) return {changed: false, version: workspace.version};
      await tx.update(workspaces).set({status: input.status, version: workspace.version + 1, updatedAt: now}).where(and(eq(workspaces.id, workspaceId), eq(workspaces.version, workspace.version)));
      await recordOperatorAudit(tx, {actorUserId: access.userId, workspaceId, commandName: 'operator.workspace.status', commandKey: input.idempotencyKey, payload: {status: input.status, reason}, now});
      return {changed: true, version: workspace.version + 1};
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

async function voidGrantAmount(tx: TransactionDatabase, input: Readonly<{workspaceId: string; grantId: string; amount: bigint; actorUserId: string; businessKey: string; reason: string; now: Date}>): Promise<void> {
  const grant = (await tx.select().from(creditGrants).where(and(eq(creditGrants.workspaceId, input.workspaceId), eq(creditGrants.id, input.grantId))).for('update').limit(1))[0];
  if (!grant) throw new DomainError('NOT_FOUND', 'The credit grant was not found.');
  if (grant.reserved > 0n || grant.consumed > 0n) throw new DomainError('CONFLICT', 'Reserved or consumed credits cannot be manually adjusted.');
  if (input.amount > grant.available) throw new DomainError('CONFLICT', 'The credit adjustment exceeds available credits.');
  await tx.update(creditGrants).set({available: grant.available - input.amount, voided: grant.voided + input.amount}).where(eq(creditGrants.id, grant.id));
  await tx.insert(creditLedgerEntries).values({id: randomUUID(), workspaceId: input.workspaceId, grantId: grant.id, entryType: 'void', availableDelta: -input.amount, reservedDelta: 0n, consumedDelta: 0n, expiredDelta: 0n, voidedDelta: input.amount, businessKey: `${input.businessKey}:ledger`, createdAt: input.now});
  await tx.insert(outboxEvents).values({id: randomUUID(), workspaceId: input.workspaceId, eventType: 'credit.manual_adjusted', aggregateId: grant.id, businessKey: `${input.businessKey}:outbox`, payload: serializeJsonValue({workspaceId: input.workspaceId, grantId: grant.id, amount: input.amount.toString()}), status: 'pending', availableAt: input.now, leaseUntil: null, leaseOwner: null, leaseToken: null, leaseGeneration: 0n, attempts: 0, createdAt: input.now}).onConflictDoNothing();
}

export async function adjustWorkspaceCredits(
  db: AppDatabase,
  input: Readonly<{actor: WorkspaceActor; workspaceId: string; grantId?: string; amount: bigint; expectedVersion: number; idempotencyKey: string; reason: string; now?: Date}>,
): Promise<Readonly<{changed: boolean; version: number; grantId: string; replayed?: boolean}>> {
  const workspaceId = id(input.workspaceId, 'workspaceId');
  const reason = validateOperatorReason(input.reason);
  const delta = amount(input.amount);
  const expectedVersion = validateExpectedVersion(input.expectedVersion);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const access = await authorizeOperatorCommand(tx, input.actor, 'operator', now);
    const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId)).for('update').limit(1))[0];
    if (!account) throw new DomainError('NOT_FOUND', 'The workspace credit account was not found.');
    const version = Number(account.version);
    const identity = {actorUserId: access.userId, workspaceId, commandName: 'operator.credit.adjust', idempotencyKey: input.idempotencyKey, payload: commandPayload({workspaceId, grantId: input.grantId ?? null, amount: delta.toString(), expectedVersion, reason})};
    const execution = await executeDurableCommand(tx, identity, async () => {
      if (version !== expectedVersion) throw new DomainError('CONFLICT', 'The credit account version is stale.');
      const businessKey = 'operator-credit:' + semanticHash(identity.commandName, {actorUserId: access.userId, workspaceId, idempotencyKey: input.idempotencyKey});
      let grantId = input.grantId ?? '';
      if (delta > 0n) {
        grantId = randomUUID();
        await tx.insert(creditGrants).values({id: grantId, workspaceId, source: 'manual', issued: delta, available: delta, reserved: 0n, consumed: 0n, expired: 0n, voided: 0n, expiresAt: null, originAllocationId: null, businessKey, createdAt: now});
        await tx.insert(creditLedgerEntries).values({id: randomUUID(), workspaceId, grantId, entryType: 'grant_issued', availableDelta: delta, reservedDelta: 0n, consumedDelta: 0n, expiredDelta: 0n, voidedDelta: 0n, businessKey: `${businessKey}:ledger`, createdAt: now});
        await tx.insert(outboxEvents).values({id: randomUUID(), workspaceId, eventType: 'credit.manual_adjusted', aggregateId: grantId, businessKey: `${businessKey}:outbox`, payload: serializeJsonValue({workspaceId, grantId, amount: delta.toString()}), status: 'pending', availableAt: now, leaseUntil: null, leaseOwner: null, leaseToken: null, leaseGeneration: 0n, attempts: 0, createdAt: now});
      } else {
        if (!grantId) throw new DomainError('VALIDATION', 'grantId is required for a negative credit adjustment.');
        await voidGrantAmount(tx, {workspaceId, grantId, amount: -delta, actorUserId: access.userId, businessKey, reason, now});
      }
      await tx.update(creditAccounts).set({version: account.version + 1n, updatedAt: now}).where(and(eq(creditAccounts.workspaceId, workspaceId), eq(creditAccounts.version, account.version)));
      await recordOperatorAudit(tx, {actorUserId: access.userId, workspaceId, commandName: 'operator.credit.adjust', commandKey: input.idempotencyKey, payload: {grantId, amount: delta.toString(), reason}, now});
      return {changed: true, version: version + 1, grantId};
    });
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function recordRecoveryAccess(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; purpose: string; now?: Date}>): Promise<void> {
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator', input.now ?? new Date());
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose: input.purpose, now: input.now});
  });
}
