import type {LocalDemoCredentials} from '../../lib/demo';

export function DemoAccessCard({credentials}: Readonly<{credentials: LocalDemoCredentials}>) {
  return (
    <aside className="demo-card" aria-label="Local demo access">
      <p className="eyebrow">Local acceptance account</p>
      <p>Use the owner account to create and manage the seeded team workspace.</p>
      <dl className="demo-credentials">
        <div><dt>Owner email</dt><dd>{credentials.owner.email}</dd></div>
        <div><dt>Owner password</dt><dd>{credentials.owner.password}</dd></div>
        <div><dt>Member email</dt><dd>{credentials.member.email}</dd></div>
        <div><dt>Member password</dt><dd>{credentials.member.password}</dd></div>
      </dl>
      <a className="button button-muted" href={`/invitations/accept?token=${encodeURIComponent(credentials.invitationToken)}`}>Open seeded invitation</a>
    </aside>
  );
}
