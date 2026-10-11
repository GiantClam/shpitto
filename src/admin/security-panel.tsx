'use client';

import {useEffect, useState, type FormEvent} from 'react';

import {adminRequest} from './http';

export type AdminSecurity = Readonly<{userId: string; role: string; twoFactorEnabled: boolean; mfaComplete: boolean; stepUpExpiresAt: string | null}>;

export function SecurityPanel({onVerified}: Readonly<{onVerified: (security: AdminSecurity) => void}>) {
  const [security, setSecurity] = useState<AdminSecurity | null>(null);
  const [enrollment, setEnrollment] = useState<{totpURI: string; backupCodes: string[]} | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    adminRequest<AdminSecurity>('/api/admin/security').then((value) => {if (active) setSecurity(value);}).catch((reason: unknown) => {if (active) setError(reason instanceof Error ? reason.message : 'Security status is unavailable.');});
    return () => {active = false;};
  }, []);

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') ?? '');
    form.reset(); setPending(true); setError('');
    try {
      setEnrollment(await adminRequest('/api/auth/two-factor/enable', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password, method: 'totp'})}));
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Enrollment failed.');}
    finally {setPending(false);}
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') ?? '').trim();
    form.reset(); setPending(true); setError('');
    try {
      await adminRequest('/api/admin/step-up', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code})});
      const current = await adminRequest<AdminSecurity>('/api/admin/security');
      setEnrollment(null); setSecurity(current); onVerified(current);
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Verification failed.');}
    finally {setPending(false);}
  }

  let secret = '';
  try {secret = enrollment ? new URL(enrollment.totpURI).searchParams.get('secret') ?? '' : '';}
  catch { /* A malformed setup URI is reported by the missing setup key below. */ }
  return <section className="operations-card"><h2>Operator second-factor verification</h2><p>Verify a code from your authenticator for this session. Privileged commands require verification within the last ten minutes.</p>
    {!security && !error ? <p role="status">Loading security status…</p> : null}
    {security && !security.twoFactorEnabled && !enrollment ? <form onSubmit={enroll} className="operations-form"><p>Set up an authenticator for your existing account.</p><label>Current password<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={pending}>Set up authenticator</button></form> : null}
    {enrollment ? <div><p>Add a time-based account to your authenticator using this setup key, then save the recovery codes before verifying.</p><p>Setup key: <code>{secret || 'Unavailable — retry setup.'}</code></p><details><summary>One-time recovery codes</summary><pre>{enrollment.backupCodes.join('\n')}</pre></details></div> : null}
    {security?.twoFactorEnabled || enrollment ? <form onSubmit={verify} className="operations-form"><label>Authenticator code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><button disabled={pending}>Verify authenticator code</button></form> : null}
    {security?.stepUpExpiresAt ? <p role="status">Command verification expires at {new Date(security.stepUpExpiresAt).toLocaleString()}.</p> : null}
    {error ? <p role="alert" className="operations-message">{error}</p> : null}
  </section>;
}
