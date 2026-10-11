import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnvFile} from 'node:process';

if (existsSync(join(process.cwd(), '.env.local'))) loadEnvFile(join(process.cwd(), '.env.local'));

const {eq, and, isNull} = await import('drizzle-orm');
const {getServerEnv} = await import('../src/config/env.ts');
const {createDatabase} = await import('../src/db/client.ts');
const {createAuth} = await import('../src/lib/auth.ts');
const {authUser} = await import('../src/db/schema/auth.ts');
const {creditAccounts, workspaceMembers, workspaces} = await import('../src/db/schema/workspace.ts');
const {workspaceInvitations} = await import('../src/db/schema/invitations.ts');
const {createTeamWorkspace} = await import('../src/modules/workspaces/commands.ts');
const {createTeamInvitation} = await import('../src/modules/workspaces/invitations.ts');
const {issueDemoGrant} = await import('../src/modules/credits/issue-demo.ts');

const env = getServerEnv();
if (env.nodeEnv === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.appUrl).hostname)) {
  throw new Error('The demo seed is restricted to a local development profile.');
}

const demoFile = join(process.cwd(), '.data', 'demo-credentials.json');
const reset = process.argv.includes('--reset');
const owner = {name: 'M3 Demo Owner', email: 'demo-owner@shpitto.local', password: 'DemoOwner!2026'};
const member = {name: 'M3 Demo Member', email: 'demo-member@shpitto.local', password: 'DemoMember!2026'};
const workspaceName = 'M3 Acceptance Team';
const database = createDatabase({max: 6});
const auth = createAuth(database.db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});

async function ensureUser(account: Readonly<{name: string; email: string; password: string}>): Promise<string> {
  const existing = await database.db.select({id: authUser.id}).from(authUser).where(eq(authUser.email, account.email)).limit(1);
  if (existing[0]) {
    await auth.api.signInEmail({body: {email: account.email, password: account.password}});
    await database.db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, existing[0].id));
    return existing[0].id;
  }
  const result = await auth.api.signUpEmail({
    body: {name: account.name, email: account.email, password: account.password, callbackURL: '/login'},
    headers: new Headers({origin: new URL(env.appUrl).origin}),
  });
  const userId = result.user.id;
  await database.db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, userId));
  return userId;
}

async function run(): Promise<void> {
  try {
    if (existsSync(demoFile) && !reset) {
      console.log(JSON.stringify({status: 'EXISTS', credentialsFile: demoFile}));
      return;
    }
    const ownerId = await ensureUser(owner);
    const memberId = await ensureUser(member);
    const existingWorkspace = await database.db.select().from(workspaces).where(and(
      eq(workspaces.createdBy, ownerId),
      eq(workspaces.kind, 'team'),
      eq(workspaces.name, workspaceName),
    )).limit(1);
    const workspaceId = existingWorkspace[0]?.id ?? (await createTeamWorkspace(database.db, {userId: ownerId}, workspaceName)).workspaceId;
    await database.db.insert(creditAccounts).values({workspaceId, version: 0n, createdAt: new Date(), updatedAt: new Date()}).onConflictDoNothing();
    await issueDemoGrant(database.db, {actorUserId: ownerId, workspaceId, profile: 'local'});
    if (reset) {
      await database.db.delete(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, workspaceId));
      // A previous manual acceptance may have transferred ownership to the
      // member. Restore the seeded owner before removing that membership so
      // reset always leaves a usable owner-managed fixture.
      await database.db.update(workspaceMembers)
        .set({role: 'member'})
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')));
      const seededOwnerMembership = await database.db.select({userId: workspaceMembers.userId})
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ownerId)))
        .limit(1);
      if (seededOwnerMembership[0]) {
        await database.db.update(workspaceMembers)
          .set({role: 'owner'})
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ownerId)));
      } else {
        await database.db.insert(workspaceMembers).values({workspaceId, userId: ownerId, role: 'owner', createdAt: new Date()});
      }
      await database.db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)));
    }
    const pending = await database.db.select({id: workspaceInvitations.id}).from(workspaceInvitations).where(and(
      eq(workspaceInvitations.workspaceId, workspaceId),
      eq(workspaceInvitations.emailNormalized, member.email),
      isNull(workspaceInvitations.acceptedAt),
    )).limit(1);
    if (pending[0]) throw new Error('A pending demo invitation already exists; remove .data/demo-credentials.json only after recovering its token.');
    const invitation = await createTeamInvitation(database.db, workspaceId, {userId: ownerId}, member.email);
    mkdirSync(join(process.cwd(), '.data'), {recursive: true});
    writeFileSync(demoFile, `${JSON.stringify({owner, member, workspaceId, workspaceName, invitationToken: invitation.token}, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({status: 'PASS', credentialsFile: demoFile, workspaceId, ownerId, memberId, invitationToken: invitation.token}));
  } finally {
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
