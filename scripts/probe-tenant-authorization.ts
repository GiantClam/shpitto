import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {creditAccounts, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {assertWorkspaceResource, authorizeWorkspaceAccess} from '../src/modules/workspaces/authorize.ts';
import {createTeamWorkspace, demoteWorkspaceMember, removeWorkspaceMember} from '../src/modules/workspaces/commands.ts';
import {DomainError} from '../src/db/contracts.ts';

const suffix = randomUUID();
const users = {
  owner: `tenant-auth-owner-${suffix}`,
  member: `tenant-auth-member-${suffix}`,
  other: `tenant-auth-other-${suffix}`,
};

async function migrateDatabase(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  try {
    await migrate(drizzle(client), {migrationsFolder: 'src/db/migrations'});
  } finally {
    await client.end();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rejectedWithForbidden(result: PromiseSettledResult<unknown>): boolean {
  return result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'FORBIDDEN';
}

async function run(): Promise<void> {
  await migrateDatabase();
  const database = createDatabase({max: 8});
  let workspaceOne = '';
  let workspaceTwo = '';
  try {
    const now = new Date();
    await database.db.insert(authUser).values([
      {id: users.owner, name: 'Tenant auth owner', email: `${users.owner}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.member, name: 'Tenant auth member', email: `${users.member}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.other, name: 'Tenant auth other', email: `${users.other}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
    ]);
    workspaceOne = (await createTeamWorkspace(database.db, {userId: users.owner}, 'Tenant auth one')).workspaceId;
    workspaceTwo = (await createTeamWorkspace(database.db, {userId: users.other}, 'Tenant auth two')).workspaceId;
    await database.db.insert(workspaceMembers).values({workspaceId: workspaceOne, userId: users.member, role: 'member', createdAt: now});

    const crossWorkspace = await Promise.allSettled([
      authorizeWorkspaceAccess(database.db, workspaceTwo, {userId: users.member}),
    ]);
    assert(rejectedWithForbidden(crossWorkspace[0]!), 'Cross-workspace ID substitution unexpectedly succeeded.');

    const authorized = await authorizeWorkspaceAccess(database.db, workspaceOne, {userId: users.member});
    let resourceMismatchRejected = false;
    try {
      assertWorkspaceResource(authorized, workspaceTwo);
    } catch (error) {
      resourceMismatchRejected = error instanceof DomainError && error.code === 'FORBIDDEN';
    }
    assert(resourceMismatchRejected, 'Cross-workspace resource binding unexpectedly succeeded.');

    await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceTwo));
    await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceTwo));
    await database.db.delete(workspaces).where(eq(workspaces.id, workspaceTwo));
    const missingWorkspace = await Promise.allSettled([
      authorizeWorkspaceAccess(database.db, workspaceTwo, {userId: users.member}),
    ]);
    assert(rejectedWithForbidden(missingWorkspace[0]!), 'Missing workspace disclosed a tenant-specific error.');
    workspaceTwo = '';

    await removeWorkspaceMember(database.db, workspaceOne, {userId: users.owner}, users.member);
    const postRemoval = await Promise.allSettled([
      authorizeWorkspaceAccess(database.db, workspaceOne, {userId: users.member}),
    ]);
    assert(rejectedWithForbidden(postRemoval[0]!), 'Removed member retained workspace access.');

    await database.db.insert(workspaceMembers).values({workspaceId: workspaceOne, userId: users.member, role: 'member', createdAt: new Date()});
    const race = await Promise.allSettled([
      removeWorkspaceMember(database.db, workspaceOne, {userId: users.owner}, users.owner),
      demoteWorkspaceMember(database.db, workspaceOne, {userId: users.owner}, users.owner),
    ]);
    assert(race.every((result) => result.status === 'rejected'), 'Last-owner race unexpectedly changed ownership.');
    const owners = await database.db.select({userId: workspaceMembers.userId}).from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceOne),
      eq(workspaceMembers.role, 'owner'),
    ));
    assert(owners.length === 1 && owners[0]!.userId === users.owner, 'Last-owner race lost the owner.');

    console.log(JSON.stringify({
      status: 'PASS',
      crossWorkspaceRejected: true,
      missingWorkspaceNonDisclosing: true,
      resourceMismatchRejected: true,
      postRemovalRejected: true,
      lastOwnerRaceRejected: true,
    }));
  } finally {
    if (workspaceOne) await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceOne));
    if (workspaceTwo) await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceTwo));
    if (workspaceOne) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceOne));
    if (workspaceTwo) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceTwo));
    if (workspaceOne) await database.db.delete(workspaces).where(eq(workspaces.id, workspaceOne));
    if (workspaceTwo) await database.db.delete(workspaces).where(eq(workspaces.id, workspaceTwo));
    await database.db.delete(authUser).where(eq(authUser.id, users.owner));
    await database.db.delete(authUser).where(eq(authUser.id, users.member));
    await database.db.delete(authUser).where(eq(authUser.id, users.other));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
