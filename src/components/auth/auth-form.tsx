'use client';

import {useEffect, useState, type FormEvent} from 'react';
import {TurnstileWidget} from './turnstile-widget';

type AuthFormMode = 'signup' | 'login' | 'reset-request' | 'reset-confirm';
type PublicSecuritySettings = Readonly<{emailVerificationEnabled: boolean; emailDeliveryAvailable: boolean; turnstileEnabled: boolean; turnstileSiteKey: string | null}>;

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
  const [security, setSecurity] = useState<PublicSecuritySettings | null>(null);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [resendVerification, setResendVerification] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/security/public', {cache: 'no-store'}).then((response) => response.ok ? response.json() as Promise<PublicSecuritySettings> : null).then((value) => {if (active && value) setSecurity(value);}).catch(() => undefined).finally(() => {if (active) setSecurityLoaded(true);});
    return () => {active = false;};
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (mode === 'reset-confirm' && password !== data.get('confirmPassword')) {
      setFailed(true);
      setMessage('The passwords do not match.');
      return;
    }
    if (mode === 'reset-request' && security && !security.emailDeliveryAvailable) {
      setFailed(true);
      setMessage('Email recovery is not configured for this installation. Contact its administrator.');
      return;
    }
    if (resendVerification && security && !security.emailDeliveryAvailable) {
      setFailed(true);
      setMessage('Email verification delivery is not configured for this installation.');
      return;
    }
    const body = secondFactor
      ? {code: String(data.get('code') ?? ''), trustDevice: false}
      : resendVerification
      ? {email: data.get('email'), callbackURL: new URL('/login', window.location.origin).toString(), turnstileToken}
      : mode === 'signup'
      ? {name: data.get('name'), email: data.get('email'), password, callbackURL: '/login'}
      : mode === 'login'
        ? {email: data.get('email'), password, callbackURL: '/dashboard'}
        : mode === 'reset-request'
          ? {email: data.get('email'), redirectTo: new URL('/reset-password', window.location.origin).toString(), turnstileToken}
          : {newPassword: password, token};
    const requestBody = secondFactor ? body : mode === 'reset-confirm' ? body : {...body, turnstileToken};
    const requestPath = secondFactor ? '/api/auth/two-factor/verify-totp' : resendVerification ? '/api/auth/send-verification-email' : paths[mode];
    setPending(true);
    setFailed(false);
    setMessage('');
    try {
      const response = await fetch(requestPath, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(requestBody)});
      const result = await response.json() as {message?: string; twoFactorRedirect?: boolean};
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? 'Unable to complete this request. Please try again.');
      } else if (resendVerification) {
        setMessage('If this account needs verification, instructions will be sent when email delivery is available.');
      } else if (mode === 'login' && result.twoFactorRedirect === true) {
        setSecondFactor(true);
        setMessage('Enter the six-digit code from your authenticator to finish signing in.');
      } else if (mode === 'login') {
        window.location.assign('/dashboard');
      } else {
        setMessage(mode === 'signup'
          ? security?.emailVerificationEnabled ? 'Check your email to verify your account before signing in.' : 'Your account has been created. You can now sign in.'
          : mode === 'reset-request'
            ? 'If an account exists and email recovery is available, reset instructions will arrive shortly.'
            : 'Your password has been updated. You can now sign in.');
      }
      setTurnstileToken('');
    } catch {
      setFailed(true);
      setMessage('Unable to reach the service. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const recoveryUnavailable = mode === 'reset-request' && securityLoaded && !security?.emailDeliveryAvailable;

  return (
    <form onSubmit={submit} className="status-card auth-form">
      {mode === 'reset-request' && !securityLoaded ? <p role="status">Checking email recovery availability…</p> : null}
      {recoveryUnavailable ? <p role="status">Email recovery is not configured for this installation. Contact its administrator.</p> : null}
      {mode === 'signup' && <><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required /></>}
      {mode !== 'reset-confirm' && !secondFactor && !recoveryUnavailable && <><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></>}
      {mode !== 'reset-request' && !secondFactor && !resendVerification && <>
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
      {!secondFactor && !recoveryUnavailable && mode !== 'reset-confirm' && security?.turnstileEnabled && security.turnstileSiteKey ? <TurnstileWidget key={`${mode}-${resendVerification}`} siteKey={security.turnstileSiteKey} action={resendVerification ? 'email-verification' : mode === 'signup' ? 'signup' : mode === 'login' ? 'login' : 'password-reset'} onToken={setTurnstileToken} /> : null}
      {!recoveryUnavailable ? <button className="button" type="submit" disabled={pending || (mode === 'reset-request' && !securityLoaded)}>{pending ? 'Please wait…' : secondFactor ? 'Verify and sign in' : labels[mode]}</button> : null}
      {mode === 'login' && !secondFactor ? <button type="button" className="button button-secondary" onClick={() => {setResendVerification((value) => !value); setTurnstileToken(''); setMessage(''); setFailed(false);}}>{resendVerification ? 'Use password sign in' : 'Resend verification email'}</button> : null}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      {mode === 'reset-confirm' && message && !failed && <a href="/login">Sign in</a>}
    </form>
  );
}
