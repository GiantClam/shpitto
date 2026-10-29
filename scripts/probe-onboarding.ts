import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {creditAccounts, workspaceMembers, workspaceSetups, workspaces} from '../src/db/schema/workspace.ts';
import {completePersonalWorkspaceOnboarding, ensurePendingOnboarding, getOnboardingStatus} from '../src/modules/workspaces/onboard.ts';

const userId = `probe-onboarding-${randomUUID()}`;
const failedUserId = `probe-failed-${randomUUID()}`;
const timestamp = new Date('2026-09-28T00:00:00.000Z');

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: 'src/db/migrations'});
  await migrationClient.end();

  const first = createDatabase({max: 8});
  try {
    await first.db.insert(authUser).values({
      id: userId,
      name: 'Onboarding probe',
      email: `${userId}@example.test`,
      emailVerified: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    assert.deepEqual(await getOnboardingStatus(first.db, userId), {status: 'pending', workspaceId: null});
    await Promise.all([ensurePendingOnboarding(first.db, userId), ensurePendingOnboarding(first.db, userId)]);
    assert.deepEqual(await getOnboardingStatus(first.db, userId), {status: 'pending', workspaceId: null});
    assert.equal((await first.db.select().from(workspaceSetups).where(eq(workspaceSetups.userId, userId))).length, 1);
    assert.equal((await first.db.select().from(workspaces).where(eq(workspaces.createdBy, userId))).length, 0);

    const retries = await Promise.all([
      completePersonalWorkspaceOnboarding(first.db, userId),
      completePersonalWorkspaceOnboarding(first.db, userId),
      completePersonalWorkspaceOnboarding(first.db, userId),
    ]);
    const workspaceRows = await first.db.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.createdBy, userId));
    const memberRows = await first.db.select({workspaceId: workspaceMembers.workspaceId}).from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    if (workspaceRows.length !== 1 || memberRows.length !== 1 || new Set(retries.map((row) => row.workspaceId)).size !== 1) {
      throw new Error(`Concurrent onboarding did not converge: ${JSON.stringify({retries, workspaceRows, memberRows})}`);
    }
    const workspaceId = workspaceRows[0]!.id;
    assert.equal(retries.filter((retry) => retry.created).length, 1);
    assert.deepEqual(await getOnboardingStatus(first.db, userId), {status: 'complete', workspaceId});
    const restarted = createDatabase({max: 2});
    try {
      assert.deepEqual(await getOnboardingStatus(restarted.db, userId), {status: 'complete', workspaceId});
      assert.deepEqual(await completePersonalWorkspaceOnboarding(restarted.db, userId), {status: 'complete', workspaceId, created: false});
    } finally {
      await restarted.pool.end();
    }
    await ensurePendingOnboarding(first.db, userId);
    assert.deepEqual(await getOnboardingStatus(first.db, userId), {status: 'complete', workspaceId}, 'A delayed pending marker must not undo completed setup.');
    // A persisted workspace can precede a missing/incomplete setup marker after recovery.
    await first.db.update(workspaceSetups).set({status: 'pending', workspaceId: null}).where(eq(workspaceSetups.userId, userId));
    assert.deepEqual(await completePersonalWorkspaceOnboarding(first.db, userId), {status: 'complete', workspaceId, created: false});
    assert.equal((await first.db.select().from(workspaces).where(eq(workspaces.createdBy, userId))).length, 1);
    assert.equal((await first.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId))).length, 1);
    assert.equal((await first.db.select().from(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId)))[0]!.version, 0n);

    await assert.rejects(completePersonalWorkspaceOnboarding(first.db, failedUserId), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN');
    const rollbackObserved = true;
    const failedSetupRows = await first.db.select({id: workspaceSetups.id}).from(workspaceSetups).where(eq(workspaceSetups.userId, failedUserId));
    const failedWorkspaceRows = await first.db.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.createdBy, failedUserId));
    if (!rollbackObserved || failedSetupRows.length !== 0 || failedWorkspaceRows.length !== 0) {
      throw new Error('Failed onboarding left partial rows behind.');
    }

    await first.db.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    await first.db.delete(workspaceSetups).where(eq(workspaceSetups.userId, userId));
    for (const workspace of workspaceRows) {
      await first.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspace.id));
      await first.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspace.id));
    }
    await first.db.delete(workspaces).where(eq(workspaces.createdBy, userId));
    await first.db.delete(authUser).where(eq(authUser.id, userId));
    console.log(JSON.stringify({status: 'PASS', concurrentRetries: 3, personalWorkspaces: workspaceRows.length, memberships: memberRows.length, rollbackObserved, restartSafe: true, demoCreditsIssued: false}));
  } finally {
    await first.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
