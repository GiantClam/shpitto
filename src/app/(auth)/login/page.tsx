import {SiteShell} from '../../../components/shell/site-shell';
import {AuthForm} from '../../../components/auth/auth-form';
import {DemoAccessCard} from '../../../components/auth/demo-access-card';
import {readLocalDemoCredentials} from '../../../lib/demo';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const demo = readLocalDemoCredentials();
  return (
    <SiteShell>
      <main className="page">
        <p className="eyebrow">Account</p>
        <h1>Sign in</h1>
        <AuthForm mode="login" />
        <p><a href="/signup">Create an account</a> · <a href="/reset-password">Reset password</a></p>
        {demo ? <DemoAccessCard credentials={demo} /> : null}
      </main>
    </SiteShell>
  );
}
