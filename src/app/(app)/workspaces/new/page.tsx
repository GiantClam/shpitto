import {headers} from 'next/headers';

import {SiteShell} from '../../../../components/shell/site-shell';
import {auth} from '../../../../lib/auth';
import {TeamPanel} from '../../dashboard/team-panel';

export const dynamic = 'force-dynamic';

export default async function NewWorkspacePage() {
  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id) return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>Sign in to create a team workspace</h1><p>Team workspaces belong to the account that creates them.</p><a className="button" href="/login">Open sign in</a></main></SiteShell>;
  return <SiteShell><main className="page"><p className="eyebrow">Workspace access</p><h1>Create a team workspace</h1><p>Personal workspace ownership remains immutable. Collaboration starts in a separate team workspace.</p><TeamPanel members={[]} /></main></SiteShell>;
}
