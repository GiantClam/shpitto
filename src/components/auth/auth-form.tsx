'use client';

import {useState, type FormEvent} from 'react';

type AuthFormMode = 'signup' | 'login' | 'reset-request' | 'reset-confirm';

const paths: Record<AuthFormMode, string> = {
  signup: '/api/auth/sign-up/email',
  login: '/api/auth/sign-in/email',
  'reset-request': '/api/auth/request-password-reset',
  'reset-confirm': '/api/auth/reset-password',
};
const labels: Record<AuthFormMode, string> = {
  signup: 'Create account',
  login: 'Sign in',
  'reset-request': 'Send reset link',
  'reset-confirm': 'Save new password',
};

export function AuthForm({mode, token}: Readonly<{mode: AuthFormMode; token?: string}>) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [secondFactor, setSecondFactor] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (mode === 'reset-confirm' && password !== data.get('confirmPassword')) {
      setFailed(true);
      setMessage('The passwords do not match.');
      return;
    }
    const body = secondFactor
      ? {code: String(data.get('code') ?? ''), trustDevice: false}
      : mode === 'signup'
      ? {name: data.get('name'), email: data.get('email'), password, callbackURL: '/login'}
      : mode === 'login'
        ? {email: data.get('email'), password, callbackURL: '/dashboard'}
        : mode === 'reset-request'
          ? {email: data.get('email'), redirectTo: new URL('/reset-password', window.location.origin).toString()}
          : {newPassword: password, token};
    setPending(true);
    setFailed(false);
    setMessage('');
    try {
      const response = await fetch(secondFactor ? '/api/auth/two-factor/verify-totp' : paths[mode], {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
      const result = await response.json() as {message?: string; twoFactorRedirect?: boolean};
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? 'Unable to complete this request. Please try again.');
      } else if (mode === 'login' && result.twoFactorRedirect === true) {
        setSecondFactor(true);
        setMessage('Enter the six-digit code from your authenticator to finish signing in.');
      } else if (mode === 'login') {
        window.location.assign('/dashboard');
      } else {
        setMessage(mode === 'signup'
          ? 'Check your email to verify your account before signing in.'
          : mode === 'reset-request'
            ? 'If an account exists for this email, a password reset link has been sent.'
            : 'Your password has been updated. You can now sign in.');
      }
    } catch {
      setFailed(true);
      setMessage('Unable to reach the service. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="status-card auth-form">
      {mode === 'signup' && <><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required /></>}
      {mode !== 'reset-confirm' && !secondFactor && <><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></>}
      {mode !== 'reset-request' && !secondFactor && <>
        <label htmlFor="password">{mode === 'reset-confirm' ? 'New password' : 'Password'}</label>
        <input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required />
      </>}
      {secondFactor && <>
        <label htmlFor="code">Authenticator code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        <button type="button" className="button button-secondary" disabled={pending} onClick={() => {setSecondFactor(false); setMessage(''); setFailed(false);}}>Use another account</button>
      </>}
      {mode === 'reset-confirm' && <>
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </>}
      <button className="button" type="submit" disabled={pending}>{pending ? 'Please wait…' : secondFactor ? 'Verify and sign in' : labels[mode]}</button>
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      {mode === 'reset-confirm' && message && !failed && <a href="/login">Sign in</a>}
    </form>
  );
}
