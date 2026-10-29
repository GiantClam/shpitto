import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

import {createDatabase} from '../src/db/client.ts';
import {getServerEnv} from '../src/config/env.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {operatorTenantAccess} from '../src/db/schema/operations.ts';
import {commandResults} from '../src/db/schema/commands.ts';
import {creditAccounts, creditGrants, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../src/db/schema/credit.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';
import {issueDemoGrant} from '../src/modules/credits/issue-demo.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {adjustWorkspaceCredits, disableOperatorUser, setOperatorRole, setWorkspaceAdminStatus} from '../src/modules/operations/commands.ts';
import {listAdminUsers, listAdminWorkspaces, readAdminWorkspace} from '../src/modules/operations/queries.ts';

const suffix = randomUUID();
const ids = {superadmin: `m6-superadmin-${suffix}`, operator: `m6-operator-${suffix}`, target: `m6-target-${suffix}`};
const sessions = {superadmin: `m6-superadmin-session-${suffix}`, operator: `m6-operator-session-${suffix}`};
const now = new Date('2026-10-04T00:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function forbidden(result: PromiseSettledResult<unknown>): boolean { return result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'FORBIDDEN'; }

async function migrateDatabase(connectionString: string): Promise<void> {
  const client = new Client({connectionString});
  await client.connect();
  try { await migrate(drizzle(client), {migrationsFolder: 'src/db/migrations'}); } finally { await client.end(); }
}

async function run(connectionString: string): Promise<void> {
  await migrateDatabase(connectionString);
  const database = createDatabase({connectionString, max: 10});
  let workspaceId = '';
  let secondaryWorkspaceId = '';
  try {
    await database.db.insert(authUser).values([
      {id: ids.superadmin, name: 'M6 Superadmin', email: `${ids.superadmin}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now},
      {id: ids.operator, name: 'M6 Operator', email: `${ids.operator}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now},
      {id: ids.target, name: 'M6 Target', email: `${ids.target}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(authSession).values([
      {id: sessions.superadmin, userId: ids.superadmin, token: `${sessions.superadmin}-token`, expiresAt: new Date('2030-01-01T00:00:00.000Z'), createdAt: now, updatedAt: now},
      {id: sessions.operator, userId: ids.operator, token: `${sessions.operator}-token`, expiresAt: new Date('2030-01-01T00:00:00.000Z'), createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(operatorRoles).values([
      {userId: ids.superadmin, role: 'superadmin', grantedAt: now, revokedAt: null, version: 1, updatedAt: now},
      {userId: ids.operator, role: 'operator', grantedAt: now, revokedAt: null, version: 1, updatedAt: now},
    ]);
    const superActor = {userId: ids.superadmin, sessionId: sessions.superadmin};
    const operatorActor = {userId: ids.operator, sessionId: sessions.operator};
    await recordTrustedSecondFactor(database.db, superActor, now);
    await recordTrustedSecondFactor(database.db, operatorActor, now);
    workspaceId = (await createTeamWorkspace(database.db, {userId: ids.superadmin}, 'M6 Operations Probe')).workspaceId;
    await database.db.insert(creditAccounts).values({workspaceId, version: 0n, createdAt: now, updatedAt: now}).onConflictDoNothing();
    const demoGrant = await issueDemoGrant(database.db, {actorUserId: ids.superadmin, workspaceId, profile: 'local', now});

    const ownerDenied = await Promise.allSettled([listAdminUsers(database.db, {userId: ids.target, sessionId: sessions.superadmin})]);
    assert(forbidden(ownerDenied[0]!), 'Unprivileged admin read was accepted.');
    const users = await listAdminUsers(database.db, operatorActor, {pageSize: 10});
    assert(users.items.some((row) => row.id === ids.operator && row.email === 'm***@example.test'), 'Admin users were not redacted and bounded.');
    const workspacesPage = await listAdminWorkspaces(database.db, operatorActor, {pageSize: 10});
    assert(workspacesPage.items.some((row) => row.id === workspaceId), 'Admin workspace projection missed the workspace.');
    await readAdminWorkspace(database.db, operatorActor, workspaceId, 'Investigate failed generation recovery');

    const suspended = await setWorkspaceAdminStatus(database.db, {actor: operatorActor, workspaceId, status: 'suspended', expectedVersion: 1, idempotencyKey: 'm6-status-1', reason: 'Investigate failed generation recovery', now});
    const suspendedReplay = await setWorkspaceAdminStatus(database.db, {actor: operatorActor, workspaceId, status: 'suspended', expectedVersion: 1, idempotencyKey: 'm6-status-1', reason: 'Investigate failed generation recovery', now});
    assert(suspended.changed && !suspended.replayed && suspendedReplay.replayed, 'Admin command replay did not return the stored result.');
    const grantAdjustment = await adjustWorkspaceCredits(database.db, {actor: operatorActor, workspaceId, amount: 20n, expectedVersion: 0, idempotencyKey: 'm6-credit-1', reason: 'Resolve verified credit discrepancy', now});
    const grantReplay = await adjustWorkspaceCredits(database.db, {actor: operatorActor, workspaceId, amount: 20n, expectedVersion: 0, idempotencyKey: 'm6-credit-1', reason: 'Resolve verified credit discrepancy', now});
    assert(grantAdjustment.changed && grantReplay.replayed, 'Credit adjustment replay did not converge.');
    const debit = await adjustWorkspaceCredits(database.db, {actor: operatorActor, workspaceId, grantId: demoGrant.grantId, amount: -5n, expectedVersion: 1, idempotencyKey: 'm6-credit-2', reason: 'Correct duplicate local grant', now});
    assert(debit.changed, 'Available credit adjustment was not applied.');
    secondaryWorkspaceId = (await createTeamWorkspace(database.db, {userId: ids.superadmin}, 'M6 Credit Scope Probe')).workspaceId;
    await database.db.insert(creditAccounts).values({workspaceId: secondaryWorkspaceId, version: 0n, createdAt: now, updatedAt: now}).onConflictDoNothing();
    const secondCredit = {actor: operatorActor, workspaceId: secondaryWorkspaceId, amount: 11n, expectedVersion: 0, idempotencyKey: 'm6-credit-1', reason: 'Verify independently scoped adjustment', now};
    const secondGrant = await adjustWorkspaceCredits(database.db, secondCredit);
    const otherActorCredit = {actor: superActor, workspaceId, amount: 7n, expectedVersion: 2, idempotencyKey: 'm6-credit-1', reason: 'Verify independently scoped adjustment', now};
    const otherActorGrant = await adjustWorkspaceCredits(database.db, otherActorCredit);
    assert(secondGrant.grantId !== grantAdjustment.grantId && otherActorGrant.grantId !== grantAdjustment.grantId, 'Independent credit commands shared one grant identity.');
    assert((await adjustWorkspaceCredits(database.db, secondCredit)).replayed && (await adjustWorkspaceCredits(database.db, otherActorCredit)).replayed, 'Same-scope replay stopped converging after scoped credit identities.');
    const secondDebit = {actor: operatorActor, workspaceId: secondaryWorkspaceId, grantId: secondGrant.grantId, amount: -3n, expectedVersion: 1, idempotencyKey: 'm6-credit-2', reason: 'Verify independently scoped debit', now};
    const otherActorDebit = {actor: superActor, workspaceId, grantId: otherActorGrant.grantId, amount: -2n, expectedVersion: 3, idempotencyKey: 'm6-credit-2', reason: 'Verify independently scoped debit', now};
    await adjustWorkspaceCredits(database.db, secondDebit);
    await adjustWorkspaceCredits(database.db, otherActorDebit);
    assert((await adjustWorkspaceCredits(database.db, secondDebit)).replayed && (await adjustWorkspaceCredits(database.db, otherActorDebit)).replayed, 'Debit replay duplicated effects.');
    assert((await database.db.select().from(creditGrants).where(eq(creditGrants.id, secondGrant.grantId)))[0]?.available === 8n && (await database.db.select().from(creditGrants).where(eq(creditGrants.id, otherActorGrant.grantId)))[0]?.available === 5n, 'Scoped commands did not preserve each grant balance.');
    const scopedLedger = await database.db.select().from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, secondaryWorkspaceId));
    const scopedOutbox = await database.db.select().from(outboxEvents).where(and(eq(outboxEvents.workspaceId, secondaryWorkspaceId), eq(outboxEvents.eventType, 'credit.manual_adjusted')));
    assert(scopedLedger.length === 2 && scopedOutbox.length === 2, 'Same-scope replay created duplicate ledger or outbox effects.');

    const soleSuperadminDenied = await Promise.allSettled([disableOperatorUser(database.db, {actor: operatorActor, targetUserId: ids.superadmin, expectedVersion: 1, idempotencyKey: 'm6-disable-superadmin', reason: 'Test administrative ownership guard', now})]);
    assert(soleSuperadminDenied[0]!.status === 'rejected' && soleSuperadminDenied[0].reason instanceof DomainError && soleSuperadminDenied[0].reason.code === 'CONFLICT', 'Sole active superadmin disablement must fail with a domain conflict.');
    const disabled = await disableOperatorUser(database.db, {actor: operatorActor, targetUserId: ids.target, expectedVersion: 1, idempotencyKey: 'm6-disable-target', reason: 'Disable compromised test account', now});
    assert(disabled.changed, 'Account disablement command did not commit.');
    const roleChanged = await setOperatorRole(database.db, {actor: superActor, targetUserId: ids.target, role: 'support', expectedVersion: 1, idempotencyKey: 'm6-role-target', reason: 'Grant bounded support read access', now});
    assert(roleChanged.changed, 'Superadmin role command did not commit.');
    const auditRows = await database.db.select({id: auditEvents.id}).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId));
    assert(auditRows.length >= 4, 'Privileged effects did not leave audit evidence.');
    console.log(JSON.stringify({status: 'PASS', ownerDenied: true, redactedList: true, tenantAccessAudited: true, commandReplay: true, creditAdjustment: true, creditCommandScopeIsolation: true, scopedCreditReplay: true, soleSuperadminGuard: true, disablement: true, roleMutation: true, auditRows: auditRows.length}));
  } finally {
    for (const cleanupWorkspaceId of [secondaryWorkspaceId, workspaceId].filter(Boolean)) {
      await database.db.delete(auditEvents).where(eq(auditEvents.workspaceId, cleanupWorkspaceId));
      await database.db.delete(operatorTenantAccess).where(eq(operatorTenantAccess.workspaceId, cleanupWorkspaceId));
      await database.db.delete(commandResults).where(eq(commandResults.workspaceId, cleanupWorkspaceId));
      await database.db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, cleanupWorkspaceId));
      await database.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, cleanupWorkspaceId));
      await database.db.delete(creditGrants).where(eq(creditGrants.workspaceId, cleanupWorkspaceId));
      await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, cleanupWorkspaceId));
      await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, cleanupWorkspaceId));
      await database.db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, cleanupWorkspaceId));
      await database.db.delete(workspaces).where(eq(workspaces.id, cleanupWorkspaceId));
    }
    await database.db.delete(operatorRoles).where(eq(operatorRoles.userId, ids.superadmin));
    await database.db.delete(operatorRoles).where(eq(operatorRoles.userId, ids.operator));
    await database.db.delete(operatorRoles).where(eq(operatorRoles.userId, ids.target));
    await database.db.delete(commandResults).where(eq(commandResults.actorUserId, ids.superadmin));
    await database.db.delete(commandResults).where(eq(commandResults.actorUserId, ids.operator));
    await database.db.delete(auditEvents).where(eq(auditEvents.actorUserId, ids.superadmin));
    await database.db.delete(auditEvents).where(eq(auditEvents.actorUserId, ids.operator));
    await database.db.delete(operatorTenantAccess).where(eq(operatorTenantAccess.actorUserId, ids.operator));
    await database.db.delete(authUser).where(eq(authUser.id, ids.superadmin));
    await database.db.delete(authUser).where(eq(authUser.id, ids.operator));
    await database.db.delete(authUser).where(eq(authUser.id, ids.target));
    await database.pool.end();
  }
}

async function runDisposable(): Promise<void> {
  const configured = new URL(getServerEnv().databaseUrl);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Operations probe requires local PostgreSQL.');
  const databaseName = `m6_operations_probe_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
  const probeUrl = new URL(configured); probeUrl.pathname = `/${databaseName}`;
  const admin = new Client({connectionString: adminUrl.toString()});
  let created = false;
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    await run(probeUrl.toString());
  } finally {
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

runDisposable().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
