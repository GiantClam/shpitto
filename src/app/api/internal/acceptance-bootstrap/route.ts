import {randomBytes, randomUUID} from 'node:crypto';

import {and, eq, like} from 'drizzle-orm';
import {NextResponse} from 'next/server';

import {getServerEnv, getRuntimeProfile} from '../../../../config/env.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {authUser} from '../../../../db/schema/auth.ts';
import {workspaceMembers} from '../../../../db/schema/workspace.ts';
import {createAuth, getAuthDatabase} from '../../../../lib/auth.ts';
import {createTeamWorkspace} from '../../../../modules/workspaces/commands.ts';
import {assertAcceptanceBootstrapAuthorized} from '../../../../modules/acceptance/bootstrap.ts';

export const runtime = 'nodejs';

function password(): string {
  return `Acceptance-${randomBytes(24).toString('base64url')}`;
}

async function createVerifiedUser(auth: ReturnType<typeof createAuth>, db: ReturnType<typeof getAuthDatabase>, input: Readonly<{name: string; email: string; password: string}>): Promise<string> {
  const result = await auth.api.signUpEmail({
    body: {name: input.name, email: input.email, password: input.password, callbackURL: '/login'},
    headers: new Headers({origin: new URL(getServerEnv().appUrl).origin}),
  });
  await db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, result.user.id));
  return result.user.id;
}

/** One-time acceptance-only seed for a hosted owner/member test journey. */
export async function POST(request: Request) {
  try {
    assertAcceptanceBootstrapAuthorized({
      runtimeProfile: getRuntimeProfile(),
      enabled: process.env.SHPITTO_ACCEPTANCE_BOOTSTRAP_ENABLED?.trim() ?? '',
      configuredSecret: process.env.SHPITTO_ACCEPTANCE_BOOTSTRAP_SECRET?.trim() ?? '',
      authorizationHeader: request.headers.get('authorization') ?? '',
    });
    const db = getAuthDatabase();
    const existing = await db.select({id: authUser.id}).from(authUser).where(and(
      like(authUser.email, 'acceptance-owner-%@shpitto.local'),
      eq(authUser.emailVerified, true),
    )).limit(1);
    if (existing[0]) throw new DomainError('CONFLICT', 'Acceptance bootstrap has already been used.');

    const runId = randomUUID();
    const owner = {name: 'Acceptance Stripe Owner', email: `acceptance-owner-${runId}@shpitto.local`, password: password()};
    const member = {name: 'Acceptance Stripe Member', email: `acceptance-member-${runId}@shpitto.local`, password: password()};
    const bootstrapAuth = createAuth(db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});
    const ownerId = await createVerifiedUser(bootstrapAuth, db, owner);
    const memberId = await createVerifiedUser(bootstrapAuth, db, member);
    const workspace = await createTeamWorkspace(db, {userId: ownerId}, 'Acceptance Stripe Workspace');
    await db.insert(workspaceMembers).values({workspaceId: workspace.workspaceId, userId: memberId, role: 'member', createdAt: new Date()});
    return NextResponse.json({status: 'created', owner, member, workspaceId: workspace.workspaceId}, {status: 201, headers: {'cache-control': 'no-store'}});
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'INFRASTRUCTURE';
    const status = code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 500;
    return NextResponse.json({ok: false, error: {code, message: error instanceof Error ? error.message : 'Acceptance bootstrap failed.'}}, {status, headers: {'cache-control': 'no-store'}});
  }
}
