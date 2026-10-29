import {SiteShell} from '../../../components/shell/site-shell';
import {AuthForm} from '../../../components/auth/auth-form';

export default async function ResetPasswordPage({searchParams}: Readonly<{searchParams: Promise<{token?: string; error?: string}>}>) {
  const {token, error} = await searchParams;
  return (
    <SiteShell>
      <main className="page">
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        {error && <p role="alert">This reset link is invalid or expired. Request a new link below.</p>}
        <AuthForm mode={token && !error ? 'reset-confirm' : 'reset-request'} token={token} />
      </main>
    </SiteShell>
  );
}

