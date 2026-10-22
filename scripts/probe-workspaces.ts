import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {commandResults} from '../src/db/schema/commands.ts';
import {creditAccounts, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {
  createTeamWorkspace,
  demoteWorkspaceMember,
  leaveWorkspace,
  removeWorkspaceMember,
  transferWorkspaceOwnership,
} from '../src/modules/workspaces/commands.ts';
import {assertRecentAuthentication, requireCurrentMembership} from '../src/modules/workspaces/policy.ts';

const suffix = randomUUID();
const users = {
  owner: `workspace-probe-owner-${suffix}`,
  member: `workspace-probe-member-${suffix}`,
  unverified: `workspace-probe-unverified-${suffix}`,
};
const recent = new Date(Date.now() - 60_000);

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: 'src/db/migrations'});
  await migrationClient.end();

  const database = createDatabase({max: 12});
  const userRows = Object.entries(users).map(([key, id]) => ({
    id,
    name: `Workspace probe ${key}`,
    email: `${id}@example.test`,
    emailVerified: key !== 'unverified',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  let personalId = '';
  let teamId = '';
  try {
    await database.db.insert(authUser).values(userRows);
    const rejectsCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;
    for (const workspaceName of ['', 'x'.repeat(101), 'invalid\nname']) {
      await assert.rejects(createTeamWorkspace(database.db, {userId: users.owner}, workspaceName), rejectsCode('VALIDATION'));
    }
    await assert.rejects(createTeamWorkspace(database.db, {userId: users.unverified}), rejectsCode('FORBIDDEN'));
    for (const recentAuthenticationAt of [undefined, 'not-a-date', new Date(Date.now() + 60_000), new Date(Date.now() - 660_000)]) {
      assert.throws(() => assertRecentAuthentication({userId: users.owner, recentAuthenticationAt}), rejectsCode('FORBIDDEN'));
    }
    assert.doesNotThrow(() => assertRecentAuthentication({userId: users.owner, recentAuthenticationAt: recent.toISOString()}));
    const personal = await database.db.insert(workspaces).values({
      id: randomUUID(), kind: 'personal', name: 'Probe personal', createdBy: users.owner,
      status: 'active', version: 1, createdAt: new Date(), updatedAt: new Date(),
    }).returning({id: workspaces.id});
    personalId = personal[0]!.id;
    await database.db.insert(workspaceMembers).values({workspaceId: personalId, userId: users.owner, role: 'owner', createdAt: new Date()});

    const personalAttempts = await Promise.allSettled([
      transferWorkspaceOwnership(database.db, personalId, {userId: users.owner, recentAuthenticationAt: recent}, users.member),
      leaveWorkspace(database.db, personalId, {userId: users.owner}),
      removeWorkspaceMember(database.db, personalId, {userId: users.owner}, users.member),
      demoteWorkspaceMember(database.db, personalId, {userId: users.owner}, users.owner),
    ]);
    for (const attempt of personalAttempts) {
      assert.equal(attempt.status, 'rejected', 'Personal workspace accepted a team operation.');
      if (attempt.status === 'rejected') assert(rejectsCode('FORBIDDEN')(attempt.reason));
    }
    const personalMembers = await database.db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, personalId));
    if (personalMembers.length !== 1 || personalMembers[0]!.userId !== users.owner || personalMembers[0]!.role !== 'owner') {
      throw new Error('Personal workspace ownership changed.');
    }

    const command = {actorUserId: users.owner, commandName: 'workspace.create', idempotencyKey: `workspace-${suffix}`, payload: {name: 'Probe team'}};
    const team = await createTeamWorkspace(database.db, {userId: users.owner}, 'Probe team', command);
    teamId = team.workspaceId;
    assert.equal(team.replayed, false);
    const replay = await createTeamWorkspace(database.db, {userId: users.owner}, 'Probe team', command);
    assert.equal(replay.workspaceId, teamId);
    assert.equal(replay.replayed, true);
    const teamCreditAccounts = await database.db.select().from(creditAccounts).where(eq(creditAccounts.workspaceId, teamId));
    assert.equal(teamCreditAccounts.length, 1, 'Team creation must initialize exactly one credit account.');
    assert.equal(teamCreditAccounts[0]!.version, 0n, 'Team creation must not grant credits.');
    await assert.rejects(createTeamWorkspace(database.db, {userId: users.owner}, 'Changed name', {...command, payload: {name: 'Changed name'}}), rejectsCode('CONFLICT'));
    const createdTeams = await database.db.select().from(workspaces).where(and(eq(workspaces.createdBy, users.owner), eq(workspaces.kind, 'team')));
    assert.equal(createdTeams.length, 1, 'Idempotent create produced another workspace.');
    await database.db.insert(workspaceMembers).values([
      {workspaceId: teamId, userId: users.member, role: 'member', createdAt: new Date()},
      {workspaceId: teamId, userId: users.unverified, role: 'member', createdAt: new Date()},
    ]);

    const race = await Promise.allSettled(Array.from({length: 10}, (_, index) => {
      if (index % 3 === 0) return removeWorkspaceMember(database.db, teamId, {userId: users.owner}, users.owner);
      if (index % 3 === 1) return demoteWorkspaceMember(database.db, teamId, {userId: users.owner}, users.owner);
      return transferWorkspaceOwnership(database.db, teamId, {userId: users.owner, recentAuthenticationAt: recent}, users.unverified);
    }));
    race.forEach((attempt, index) => {
      assert.equal(attempt.status, 'rejected', `Last-owner attempt ${index} unexpectedly succeeded.`);
      if (attempt.status === 'rejected') assert(rejectsCode(index % 3 === 2 ? 'FORBIDDEN' : 'CONFLICT')(attempt.reason));
    });
    const ownersAfterRace = await database.db.select().from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.role, 'owner'),
    ));
    if (ownersAfterRace.length !== 1 || ownersAfterRace[0]!.userId !== users.owner) throw new Error('Last-owner race left an invalid owner set.');

    // Both owners initially have permission to remove their own ownership.
    // Row locking must serialize the checks so only one mutation can commit.
    await database.db.update(workspaceMembers).set({role: 'owner'}).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.userId, users.member)));
    const versionBeforeOwnershipRace = (await database.db.select({version: workspaces.version}).from(workspaces).where(eq(workspaces.id, teamId)))[0]!.version;
    const observedOwnerCounts: number[] = [];
    const twoOwnerRace = await Promise.allSettled(Array.from({length: 10}, (_, index) => (async () => {
      try {
        return index % 2 === 0
          ? await removeWorkspaceMember(database.db, teamId, {userId: users.owner}, users.owner)
          : await demoteWorkspaceMember(database.db, teamId, {userId: users.member}, users.member);
      } finally {
        const committedOwners = await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.role, 'owner')));
        observedOwnerCounts.push(committedOwners.length);
        assert(committedOwners.length >= 1, 'A committed state had no workspace owner.');
      }
    })()));
    const ownershipWinners = twoOwnerRace.filter((result) => result.status === 'fulfilled');
    assert.equal(ownershipWinners.length, 1, 'Two-owner race must commit exactly one membership mutation.');
    assert.equal(ownershipWinners[0]!.value.changed, true);
    const ownershipLosers = twoOwnerRace.filter((result) => result.status === 'rejected');
    assert.equal(ownershipLosers.length, 9);
    for (const result of ownershipLosers) {
      assert(result.reason instanceof DomainError && ['FORBIDDEN', 'CONFLICT'].includes(result.reason.code), 'A losing ownership operation failed for an unrelated reason.');
    }
    const raceOwners = await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.role, 'owner')));
    assert.equal(raceOwners.length, 1, 'Concurrent self-removal and self-demotion lost the last owner.');
    assert.equal((await database.db.select({version: workspaces.version}).from(workspaces).where(eq(workspaces.id, teamId)))[0]!.version, versionBeforeOwnershipRace + 1, 'Ownership race committed more than one workspace change.');
    assert.equal(observedOwnerCounts.length, 10);
    await database.db.insert(workspaceMembers).values({workspaceId: teamId, userId: users.owner, role: 'owner', createdAt: new Date()})
      .onConflictDoUpdate({target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: {role: 'owner'}});
    await database.db.update(workspaceMembers).set({role: 'member'}).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.userId, users.member)));

    await assert.rejects(leaveWorkspace(database.db, teamId, {userId: users.owner}), rejectsCode('CONFLICT'));
    await assert.rejects(removeWorkspaceMember(database.db, teamId, {userId: users.owner}, ' '), rejectsCode('VALIDATION'));
    await assert.rejects(removeWorkspaceMember(database.db, teamId, {userId: users.owner}, 'missing'), rejectsCode('NOT_FOUND'));
    await assert.rejects(demoteWorkspaceMember(database.db, teamId, {userId: users.owner}, 'missing'), rejectsCode('NOT_FOUND'));
    await assert.rejects(transferWorkspaceOwnership(database.db, teamId, {userId: users.owner, recentAuthenticationAt: recent}, users.owner), rejectsCode('CONFLICT'));
    await assert.rejects(transferWorkspaceOwnership(database.db, teamId, {userId: users.owner, recentAuthenticationAt: recent}, 'missing'), rejectsCode('CONFLICT'));
    await assert.rejects(removeWorkspaceMember(database.db, teamId, {userId: users.member}, users.owner), rejectsCode('FORBIDDEN'));
    await assert.rejects(leaveWorkspace(database.db, 'invalid-workspace', {userId: users.owner}), rejectsCode('VALIDATION'));
    await assert.rejects(removeWorkspaceMember(database.db, randomUUID(), {userId: users.owner}, users.member), rejectsCode('FORBIDDEN'));
    await assert.rejects(requireCurrentMembership(database.db, teamId, {userId: ' '}), rejectsCode('VALIDATION'));
    await assert.rejects(requireCurrentMembership(database.db, randomUUID(), {userId: users.owner}), rejectsCode('NOT_FOUND'));
    assert.equal((await demoteWorkspaceMember(database.db, teamId, {userId: users.owner}, users.member)).changed, false);
    await database.db.update(workspaceMembers).set({role: 'owner'}).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.userId, users.member)));
    assert.equal((await demoteWorkspaceMember(database.db, teamId, {userId: users.owner}, users.member)).changed, true);
    assert.equal((await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.userId, users.member))))[0]!.role, 'member');

    await transferWorkspaceOwnership(database.db, teamId, {userId: users.owner, recentAuthenticationAt: recent}, users.member);
    const finalMembers = await database.db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, teamId));
    const ownerIds = finalMembers.filter((member) => member.role === 'owner').map((member) => member.userId);
    if (ownerIds.length !== 1 || ownerIds[0] !== users.member) throw new Error('Eligible ownership transfer did not converge.');
    assert.equal((await leaveWorkspace(database.db, teamId, {userId: users.owner})).changed, true);
    assert.equal((await database.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, teamId), eq(workspaceMembers.userId, users.owner)))).length, 0);
    await assert.rejects(requireCurrentMembership(database.db, teamId, {userId: users.owner}), rejectsCode('FORBIDDEN'));
    await removeWorkspaceMember(database.db, teamId, {userId: users.member}, users.unverified);
    assert.equal((await database.db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, teamId))).length, 1);
    console.log(JSON.stringify({status: 'PASS', personalRejected: personalAttempts.length, lastOwnerRaceRejected: race.length, twoOwnerRaceAttempts: twoOwnerRace.length, twoOwnerRaceWinners: ownershipWinners.length, twoOwnerRaceRejected: ownershipLosers.length, minimumObservedOwners: Math.min(...observedOwnerCounts), transferOwner: users.member}));
  } finally {
    await database.db.delete(commandResults).where(eq(commandResults.actorUserId, users.owner));
    if (teamId) await database.db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, teamId));
    if (personalId) await database.db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, personalId));
    if (teamId) await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, teamId));
    if (teamId) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, teamId));
    if (personalId) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, personalId));
    if (teamId) await database.db.delete(workspaces).where(eq(workspaces.id, teamId));
    if (personalId) await database.db.delete(workspaces).where(eq(workspaces.id, personalId));
    await database.db.delete(authUser).where(eq(authUser.id, users.owner));
    await database.db.delete(authUser).where(eq(authUser.id, users.member));
    await database.db.delete(authUser).where(eq(authUser.id, users.unverified));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
