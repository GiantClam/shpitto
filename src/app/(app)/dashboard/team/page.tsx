import {headers} from 'next/headers';
import {and, asc, desc, eq} from 'drizzle-orm';

import {SiteShell} from '../../../../components/shell/site-shell';
import {auth, getAuthDatabase} from '../../../../lib/auth';
import {authUser} from '../../../../db/schema/auth';
import {workspaceMembers, workspaces} from '../../../../db/schema/workspace';
import {TeamPanel} from '../team-panel';
import {DomainError} from '../../../../db/contracts';
import {authorizeWorkspaceAccess} from '../../../../modules/workspaces/authorize';
import {requireActiveVerifiedUser} from '../../../../modules/workspaces/policy';

export const dynamic = 'force-dynamic';

export default async function TeamPage({searchParams}: {searchParams: Promise<{workspace?: string | string[]}>}) {
  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;
  if (!userId) return <SiteShell><main className="page"><p className="eyebrow">Team</p><h1>Sign in to manage workspaces</h1><div className="actions"><a className="button" href="/login">Open sign in</a><a className="button button-muted" href="/invitations/accept">Accept an invitation</a></div></main></SiteShell>;
  const db = getAuthDatabase();
  const unavailable = <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>Workspace unavailable</h1><p>This team workspace is unavailable to your account.</p><a className="button" href="/dashboard">Open dashboard</a></main></SiteShell>;
  try {
    await requireActiveVerifiedUser(db, userId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return unavailable;
    throw error;
  }
  const memberships = await db.select({workspace: workspaces}).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(and(eq(workspaceMembers.userId, userId), eq(workspaces.kind, 'team'), eq(workspaces.status, 'active'))).orderBy(desc(workspaces.createdAt), asc(workspaces.id));
  const requestedWorkspaceValue = (await searchParams).workspace;
  const requestedWorkspace = Array.isArray(requestedWorkspaceValue) ? requestedWorkspaceValue[0] : requestedWorkspaceValue;
  const team = requestedWorkspace === undefined ? memberships[0]?.workspace : memberships.find((row) => row.workspace.id === requestedWorkspace)?.workspace;
  const teamLinks = <nav className="actions" aria-label="Team workspaces">{memberships.map(({workspace}) => <a className="button button-muted" key={workspace.id} href={`/workspaces/${workspace.id}/settings/members`} aria-current={team?.id === workspace.id ? 'page' : undefined}>{workspace.name}</a>)}</nav>;
  if (!team) return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>{requestedWorkspace === undefined ? 'No team workspace yet' : 'Workspace unavailable'}</h1><p>{requestedWorkspace === undefined ? 'Create a team or accept an invitation to collaborate with other members.' : 'This team workspace is unavailable to your account. Choose one of your teams below.'}</p>{teamLinks}<div className="actions"><a className="button" href="/workspaces/new">Create a team workspace</a><a className="button button-muted" href="/invitations/accept">Accept an invitation</a></div></main></SiteShell>;
  try {
    await authorizeWorkspaceAccess(db, team.id, {userId});
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return unavailable;
    throw error;
  }
  const rows = await db.select({member: workspaceMembers, user: authUser}).from(workspaceMembers).innerJoin(authUser, eq(authUser.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, team.id));
  const members = rows.map((row) => ({userId: row.member.userId, email: row.user.email, role: row.member.role}));
  const viewerRole = rows.find((row) => row.member.userId === userId)?.member.role;
  return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1 className="workspace-page-title">{team.name} members</h1><p>Owner actions remain server-authorized and take effect immediately for active sessions.</p>{teamLinks}<div className="actions"><a className="button button-muted" href={`/dashboard?workspace=${team.id}`}>Open workspace</a><a className="button button-muted" href="/workspaces/new">Create a team workspace</a><a className="button button-muted" href="/invitations/accept">Accept an invitation</a></div><TeamPanel workspaceId={team.id} members={members} viewerRole={viewerRole} /></main></SiteShell>;
}
