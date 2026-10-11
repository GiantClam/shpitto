import {headers} from 'next/headers';
import {eq} from 'drizzle-orm';

import {SiteShell} from '../../../../../../components/shell/site-shell';
import {auth, getAuthDatabase} from '../../../../../../lib/auth';
import {authUser} from '../../../../../../db/schema/auth';
import {workspaceMembers} from '../../../../../../db/schema/workspace';
import {TeamPanel} from '../../../../dashboard/team-panel';
import {DomainError} from '../../../../../../db/contracts';
import {authorizeWorkspaceAccess} from '../../../../../../modules/workspaces/authorize';
import {requireActiveVerifiedUser} from '../../../../../../modules/workspaces/policy';

export const dynamic = 'force-dynamic';

export default async function WorkspaceMembersPage({params}: {params: Promise<{w: string}>}) {
  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;
  if (!userId) return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>Sign in to manage members</h1><div className="actions"><a className="button" href="/login">Open sign in</a><a className="button button-muted" href="/invitations/accept">Accept an invitation</a></div></main></SiteShell>;
  const {w} = await params;
  const db = getAuthDatabase();
  const access = await (async () => {
    await requireActiveVerifiedUser(db, userId);
    return authorizeWorkspaceAccess(db, w, {userId});
  })().catch((error: unknown) => {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return null;
    throw error;
  });
  if (!access) return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>Workspace unavailable</h1><p>Membership is checked again for every private operation.</p><div className="actions"><a className="button" href="/dashboard/team">Choose a team</a><a className="button button-muted" href="/workspaces/new">Create a team workspace</a></div></main></SiteShell>;
  const workspace = access.workspace;
  const rows = await db.select({member: workspaceMembers, user: authUser}).from(workspaceMembers).innerJoin(authUser, eq(authUser.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id));
  const members = rows.map((row) => ({userId: row.member.userId, email: row.user.email, role: row.member.role}));
  const viewerRole = rows.find((row) => row.member.userId === userId)?.member.role;
  return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1 className="workspace-page-title">{workspace.name} members</h1><p>Owner actions remain server-authorized and update active sessions immediately.</p><TeamPanel workspaceId={workspace.id} workspaceKind={workspace.kind} members={members} viewerRole={viewerRole} /></main></SiteShell>;
}
