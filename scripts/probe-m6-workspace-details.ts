import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {snapshotBillingProduct} from '../src/config/plans.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {billingAccounts, billingCustomerHistory, billingSubscriptions} from '../src/db/schema/billing.ts';
import {creditLedgerEntries} from '../src/db/schema/credit.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {operatorTenantAccess} from '../src/db/schema/operations.ts';
import {creditGrants, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {parseWorkspaceDetailQuery, readAdminWorkspaceDetails, type WorkspaceDetailSection} from '../src/modules/operations/workspace-details.ts';

const configured = new URL(getServerEnv().databaseUrl);
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'This probe requires local PostgreSQL.');
const databaseName = 'm6_details_' + randomUUID().replaceAll('-', '');
const admin = new Client({connectionString: configured.toString()});
await admin.connect();
await admin.query(`create database "${databaseName}"`);
configured.pathname = '/' + databaseName;
const database = createDatabase({connectionString: configured.toString()});
const db = database.db;
const errorCode = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
try {
  await migrate(db, {migrationsFolder: 'src/db/migrations'});
  const now = new Date();
  const workspaceId = randomUUID();
  const foreignWorkspaceId = randomUUID();
  const users = ['operator', 'support', 'owner'];
  await db.insert(authUser).values(users.map((id) => ({id, name: id, email: 'private-email-' + id + '@example.test', emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now})));
  await db.insert(authSession).values(users.map((id) => ({id: id + '-session', userId: id, token: randomUUID(), expiresAt: new Date(now.getTime() + 3600_000), createdAt: now, updatedAt: now})));
  await db.insert(operatorRoles).values([{userId: 'operator', role: 'operator', grantedAt: now, updatedAt: now}, {userId: 'support', role: 'support', grantedAt: now, updatedAt: now}]);
  const actor = {userId: 'operator', sessionId: 'operator-session'};
  const support = {userId: 'support', sessionId: 'support-session'};
  const owner = {userId: 'owner', sessionId: 'owner-session'};
  await recordTrustedSecondFactor(db, actor, now);
  await recordTrustedSecondFactor(db, support, now);
  await db.insert(workspaces).values([workspaceId, foreignWorkspaceId].map((id) => ({id, kind: 'team', name: 'Local detail probe', status: 'suspended', createdBy: owner.userId, createdAt: now, updatedAt: now})));
  await db.insert(billingAccounts).values([workspaceId, foreignWorkspaceId].map((id) => ({workspaceId: id, status: 'hold', holdReason: 'Local probe', createdAt: now, updatedAt: now})));
  await db.insert(workspaceMembers).values([{workspaceId, userId: owner.userId, role: 'owner', createdAt: now}, {workspaceId, userId: support.userId, role: 'member', createdAt: now}, {workspaceId: foreignWorkspaceId, userId: actor.userId, role: 'owner', createdAt: now}]);
  const privateMarker = 'PRIVATE_DETAIL_CANARY';
  const expected = new Map<WorkspaceDetailSection, string[]>([['memberships', [owner.userId, support.userId]]]);
  const subscriptions: string[] = [];
  const grants: string[] = [];
  const ledger: string[] = [];
  for (const tenant of [workspaceId, foreignWorkspaceId]) {
    const customerId = privateMarker + ':customer:' + tenant;
    await db.insert(billingCustomerHistory).values({workspaceId: tenant, provider: 'fixture', customerId, validFrom: now, changeReason: 'Local details fixture'});
    for (const index of [0, 1]) {
      const subscriptionId = randomUUID(); const grantId = randomUUID(); const ledgerId = randomUUID();
      await db.insert(billingSubscriptions).values({id: subscriptionId, workspaceId: tenant, provider: 'fixture', customerId, externalId: privateMarker + ':subscription:' + subscriptionId, catalogSnapshot: snapshotBillingProduct('fixture-monthly', 'test'), status: index === 0 ? 'active' : 'canceled', periodStart: now, periodEnd: new Date(now.getTime() + 86400_000), createdAt: now, updatedAt: now});
      await db.insert(creditGrants).values({id: grantId, workspaceId: tenant, source: 'manual', issued: 9007199254740993n, available: 9007199254740993n, reserved: 0n, consumed: 0n, expired: 0n, voided: 0n, businessKey: privateMarker + ':grant:' + grantId, createdAt: now});
      await db.insert(creditLedgerEntries).values({id: ledgerId, workspaceId: tenant, grantId, entryType: 'grant_issued', availableDelta: 9007199254740993n, reservedDelta: 0n, consumedDelta: 0n, expiredDelta: 0n, voidedDelta: 0n, businessKey: privateMarker + ':ledger:' + ledgerId, createdAt: now});
      if (tenant === workspaceId) {subscriptions.push(subscriptionId); grants.push(grantId); ledger.push(ledgerId);}
    }
  }
  expected.set('subscriptions', subscriptions); expected.set('grants', grants); expected.set('ledger', ledger);
  let reads = 0;
  for (const [section, ids] of expected) {
    const input = {actor, workspaceId, section, purpose: 'Inspect ' + section + ' for local support', page: 1, pageSize: 1};
    await assert.rejects(readAdminWorkspaceDetails(db, {...input, actor: support}), errorCode('FORBIDDEN'));
    await assert.rejects(readAdminWorkspaceDetails(db, {...input, actor: owner}), errorCode('FORBIDDEN'));
    const first = await readAdminWorkspaceDetails(db, input);
    const second = await readAdminWorkspaceDetails(db, {...input, page: 2});
    const third = await readAdminWorkspaceDetails(db, {...input, page: 3});
    reads += 3;
    assert.equal(first.items.length, 1); assert.equal(first.hasMore, true);
    assert.equal(second.items.length, 1); assert.equal(second.hasMore, false);
    assert.equal(third.items.length, 0); assert.equal(third.hasMore, false);
    assert.deepEqual([String(first.items[0]!.id), String(second.items[0]!.id)], [...ids].sort());
    assert.ok(!JSON.stringify([first, second]).includes(privateMarker));
    assert.ok(!JSON.stringify([first, second]).includes('private-email'));
    if (section === 'grants') assert.equal(first.items[0]!.available, '9007199254740993');
    if (section === 'ledger') assert.equal(first.items[0]!.availableDelta, '9007199254740993');
    if (section === 'subscriptions') assert.equal(first.items[0]!.productKey, 'fixture-monthly');
  }
  const audited = await db.select().from(operatorTenantAccess);
  assert.equal(audited.length, reads);
  assert.ok(audited.every((row) => row.workspaceId === workspaceId && row.actorUserId === actor.userId && row.purpose.startsWith('Inspect ')));
  const baseQuery = 'section=grants&purpose=Review+local+records';
  for (const suffix of ['&sort=password', '&pageSize=101', '&page=10001', '&page=-1', '&page=1&page=2', '&section=ledger']) assert.throws(() => parseWorkspaceDetailQuery(new URLSearchParams(baseQuery + suffix)), errorCode('VALIDATION'));
  const input = {actor, workspaceId, section: 'grants' as const, purpose: 'Review credit records', page: 1, pageSize: 25};
  await assert.rejects(readAdminWorkspaceDetails(db, {...input, purpose: ''}), errorCode('VALIDATION'));
  await assert.rejects(readAdminWorkspaceDetails(db, {...input, workspaceId: randomUUID()}), errorCode('NOT_FOUND'));
  await assert.rejects(readAdminWorkspaceDetails(db, {...input, actor: {...actor, sessionId: support.sessionId}}), errorCode('FORBIDDEN'));
  await db.update(operatorRoles).set({revokedAt: now}).where(eq(operatorRoles.userId, actor.userId));
  await assert.rejects(readAdminWorkspaceDetails(db, input), errorCode('FORBIDDEN'));
  assert.equal((await db.select().from(operatorTenantAccess)).length, reads);
  console.log(JSON.stringify({status: 'PASS', database: 'isolated local Docker PostgreSQL', sections: [...expected.keys()], deterministicPagination: true, tenantIsolation: true, recordedPurpose: true, redactedFields: true, exactBigIntegers: true, suspendedWorkspaceRead: true, supportAndOwnerDenied: true, revokedAndWrongSessionDenied: true, queryBoundsEnforced: true}));
} finally {
  await database.pool.end();
  await admin.query(`drop database "${databaseName}" with (force)`);
  await admin.end();
}
