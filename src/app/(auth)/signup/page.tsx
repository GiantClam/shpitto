import {SiteShell} from '../../../components/shell/site-shell';
import {AuthForm} from '../../../components/auth/auth-form';

export default function SignupPage() {
  return (
    <SiteShell>
      <main className="page">
        <p className="eyebrow">Account</p>
        <h1>Create your account</h1>
        <AuthForm mode="signup" />
        <p><a href="/login">Already have an account? Sign in</a></p>
      </main>
    </SiteShell>
  );
}

