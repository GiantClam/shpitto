import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {mailOutbox, workspaceInvitations} from '../src/db/schema/invitations.ts';
import {workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';
import {acceptTeamInvitation, createTeamInvitation, INVITATION_TTL_MS} from '../src/modules/workspaces/invitations.ts';

const suffix = randomUUID();
const users = {
  owner: `invitation-probe-owner-${suffix}`,
  invited: `invitation-probe-invited-${suffix}`,
  mismatch: `invitation-probe-mismatch-${suffix}`,
};

async function migrateDatabase(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  try {
    await migrate(drizzle(migrationClient), {migrationsFolder: 'src/db/migrations'});
  } finally {
    await migrationClient.end();
  }
}

async function run(): Promise<void> {
  await migrateDatabase();
  const database = createDatabase({max: 10});
  let workspaceId = '';
  const personalId = randomUUID();
  const now = new Date();
  try {
    await database.db.insert(authUser).values([
      {id: users.owner, name: 'Invitation Probe Owner', email: `${users.owner}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.invited, name: 'Invitation Probe Invited', email: `${users.invited}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.mismatch, name: 'Invitation Probe Mismatch', email: `${users.mismatch}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
    ]);
    workspaceId = (await createTeamWorkspace(database.db, {userId: users.owner}, 'Invitation probe')).workspaceId;
    const rejectsCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;
    for (const email of ['x', 'x'.repeat(321), 'bad\n@example.test', 'invalid-email']) {
      await assert.rejects(createTeamInvitation(database.db, workspaceId, {userId: users.owner}, email), rejectsCode('VALIDATION'));
    }
    for (const invalidToken of ['short', 'x'.repeat(257), 'x'.repeat(43)]) {
      await assert.rejects(acceptTeamInvitation(database.db, {userId: users.invited}, invalidToken), rejectsCode('FORBIDDEN'));
    }
    await database.db.insert(workspaces).values({id: personalId, kind: 'personal', name: 'Invitation personal', createdBy: users.owner, status: 'active', version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(workspaceMembers).values({workspaceId: personalId, userId: users.owner, role: 'owner', createdAt: now});
    await assert.rejects(createTeamInvitation(database.db, personalId, {userId: users.owner}, `${users.invited}@example.test`), rejectsCode('FORBIDDEN'));
    assert.equal((await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, personalId))).length, 0);

    const created = await createTeamInvitation(database.db, workspaceId, {userId: users.owner}, ` ${users.invited.toUpperCase()}@EXAMPLE.TEST `);
    await assert.rejects(createTeamInvitation(database.db, workspaceId, {userId: users.owner}, `${users.invited}@example.test`), rejectsCode('CONFLICT'));
    assert(created.expiresAt.getTime() - Date.now() > 6 * 24 * 60 * 60 * 1000, 'Invitation expiry is not seven days.');
    const invitationRows = await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, created.invitationId));
    assert(invitationRows.length === 1, 'Created invitation row is missing.');
    assert(
      invitationRows[0]!.expiresAt.getTime() - invitationRows[0]!.createdAt.getTime() === INVITATION_TTL_MS,
      'Invitation expiry is not exactly seven days.',
    );
    const outboxRows = await database.db.select().from(mailOutbox).where(eq(mailOutbox.invitationId, created.invitationId));
    assert(outboxRows.length === 1, 'Committed mail intent is missing.');
    const token = (outboxRows[0]!.payload as {token?: unknown}).token;
    assert(typeof token === 'string', 'Mail intent did not retain a delivery token.');
    assert.notEqual(invitationRows[0]!.tokenHash, token);
    assert.match(invitationRows[0]!.tokenHash, /^[a-f0-9]{64}$/);

    const concurrent = await Promise.allSettled(Array.from({length: 10}, () => acceptTeamInvitation(database.db, {userId: users.invited}, token)));
    const concurrentWinners = concurrent.filter((result) => result.status === 'fulfilled');
    const concurrentRejected = concurrent.filter((result) => result.status === 'rejected');
    assert.equal(concurrentWinners.length, 1, 'Concurrent acceptance must have exactly one winner.');
    assert.equal(concurrentRejected.length, 9, 'Nine duplicate accepts must be rejected.');
    assert.equal(concurrentWinners[0]!.value.changed, true);
    for (const result of concurrent) {
      if (result.status === 'rejected') assert(rejectsCode('FORBIDDEN')(result.reason));
    }
    const members = await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, users.invited)));
    assert(members.length === 1, 'Concurrent acceptance created duplicate membership.');
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.invited}, token), rejectsCode('FORBIDDEN'));
    await assert.rejects(createTeamInvitation(database.db, workspaceId, {userId: users.owner}, `${users.invited}@example.test`), rejectsCode('CONFLICT'));
    await assert.rejects(createTeamInvitation(database.db, workspaceId, {userId: users.invited}, `other-${suffix}@example.test`), rejectsCode('FORBIDDEN'));

    const mismatchInvite = await createTeamInvitation(database.db, workspaceId, {userId: users.owner}, `${users.mismatch}@example.test`);
    const mismatchOutbox = await database.db.select().from(mailOutbox).where(eq(mailOutbox.invitationId, mismatchInvite.invitationId));
    const mismatchToken = (mismatchOutbox[0]!.payload as {token: string}).token;
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.invited}, mismatchToken), rejectsCode('FORBIDDEN'));
    await database.db.update(workspaces).set({status: 'suspended'}).where(eq(workspaces.id, workspaceId));
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.mismatch}, mismatchToken), rejectsCode('FORBIDDEN'));
    await database.db.update(workspaces).set({status: 'active'}).where(eq(workspaces.id, workspaceId));
    assert.equal((await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, mismatchInvite.invitationId)))[0]!.acceptedAt, null);
    await database.db.update(authUser).set({emailVerified: false}).where(eq(authUser.id, users.mismatch));
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.mismatch}, mismatchToken), rejectsCode('FORBIDDEN'));
    await database.db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, users.mismatch));
    // Membership may be established through another authorized path before token acceptance.
    await database.db.insert(workspaceMembers).values({workspaceId, userId: users.mismatch, role: 'member', createdAt: now});
    assert.equal((await acceptTeamInvitation(database.db, {userId: users.mismatch}, mismatchToken)).changed, false);
    const acceptedExisting = (await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, mismatchInvite.invitationId)))[0]!;
    assert.equal(acceptedExisting.acceptedBy, users.mismatch);
    assert(acceptedExisting.acceptedAt instanceof Date);
    assert.equal((await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, users.mismatch)))).length, 1);

    const expiredInvite = await createTeamInvitation(database.db, workspaceId, {userId: users.owner}, `expired-${suffix}@example.test`);
    const expiredCreatedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expiredAt = new Date(expiredCreatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await database.db.update(workspaceInvitations).set({createdAt: expiredCreatedAt, expiresAt: expiredAt}).where(eq(workspaceInvitations.id, expiredInvite.invitationId));
    const expiredOutbox = await database.db.select().from(mailOutbox).where(eq(mailOutbox.invitationId, expiredInvite.invitationId));
    const expiredToken = (expiredOutbox[0]!.payload as {token: string}).token;
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.mismatch}, expiredToken), rejectsCode('FORBIDDEN'));

    const rollbackId = randomUUID();
    let rolledBack = false;
    try {
      await database.db.transaction(async (tx) => {
        const rollbackNow = new Date();
        await tx.insert(workspaceInvitations).values({
          id: rollbackId,
          workspaceId,
          emailNormalized: `rollback-${suffix}@example.test`,
          role: 'member',
          tokenHash: `rollback-${suffix}`,
          expiresAt: new Date(rollbackNow.getTime() + 7 * 24 * 60 * 60 * 1000),
          inviterId: users.owner,
          createdAt: rollbackNow,
        });
        await tx.insert(mailOutbox).values({
          id: randomUUID(), kind: 'workspace_invitation', invitationId: rollbackId,
          businessKey: `rollback-${suffix}`, recipientEmail: `rollback-${suffix}@example.test`,
          payload: {token: 'rollback'}, status: 'pending', availableAt: rollbackNow, attempts: 0, createdAt: rollbackNow,
        });
        throw new Error('intentional rollback');
      });
    } catch {
      rolledBack = true;
    }
    assert(rolledBack, 'Rollback transaction did not fail as expected.');
    const rollbackRows = await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, rollbackId));
    assert(rollbackRows.length === 0, 'Invitation survived a rolled-back mail intent transaction.');

    const deletedWorkspaceInvite = await createTeamInvitation(
      database.db,
      workspaceId,
      {userId: users.owner},
      `deleted-${suffix}@example.test`,
    );
    const deletedWorkspaceOutbox = await database.db.select().from(mailOutbox)
      .where(eq(mailOutbox.invitationId, deletedWorkspaceInvite.invitationId));
    const deletedWorkspaceToken = (deletedWorkspaceOutbox[0]!.payload as {token: string}).token;
    await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
    await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await assert.rejects(acceptTeamInvitation(database.db, {userId: users.mismatch}, deletedWorkspaceToken), rejectsCode('FORBIDDEN'));
    workspaceId = '';

    console.log(JSON.stringify({
      status: 'PASS',
      raceAttempts: concurrent.length,
      concurrentWinners: concurrentWinners.length,
      concurrentRejected: concurrentRejected.length,
      exactSevenDayExpiry: true,
      replayRejected: true,
      mismatchRejected: true,
      expiryRejected: true,
      deletedWorkspaceRejected: true,
      rollbackClean: true,
    }));
  } finally {
    await database.db.delete(workspaces).where(eq(workspaces.id, personalId));
    if (workspaceId) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
    if (workspaceId) await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await database.db.delete(authUser).where(eq(authUser.id, users.owner));
    await database.db.delete(authUser).where(eq(authUser.id, users.invited));
    await database.db.delete(authUser).where(eq(authUser.id, users.mismatch));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
