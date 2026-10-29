import {InvitationAccept} from '../../../../components/workspaces/invitation-accept';
import {SiteShell} from '../../../../components/shell/site-shell';
import {readLocalDemoCredentials} from '../../../../lib/demo';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitationPage({searchParams}: {searchParams: Promise<{token?: string}>}) {
  const params = await searchParams;
  const demo = readLocalDemoCredentials();
  return <SiteShell><main className="page"><p className="eyebrow">Team invitation</p><h1>Join a workspace</h1><p>Sign in with the invited email before accepting. Expired and mismatched tokens are rejected server-side.</p><InvitationAccept initialToken={params.token ?? demo?.invitationToken ?? ''} />{demo ? <p className="demo-hint">The seeded member account is <strong>{demo.member.email}</strong>. Use the password shown on the local sign-in page.</p> : null}</main></SiteShell>;
}
