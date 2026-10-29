'use client';

import {useEffect, useState, type FormEvent} from 'react';

import {adminRequest} from './http';
import {TurnstileWidget} from '../components/auth/turnstile-widget';

type SecuritySettings = Readonly<{
  emailVerificationEnabled: boolean;
  twoFactorRequired: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileConfigured: boolean;
  currentIdentityEmailVerified: boolean;
  emailDeliveryAvailable: boolean;
  smtpEnabled: boolean;
  smtpConfigured: boolean;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  version: number;
}>;

export function SecuritySettingsPanel() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [form, setForm] = useState({emailVerificationEnabled: false, twoFactorRequired: false, turnstileEnabled: false, turnstileSiteKey: '', turnstileSecretKey: '', smtpEnabled: false, smtpUrl: '', smtpFromEmail: '', smtpFromName: 'Shpitto', reason: ''});
  const [clearTurnstileSecret, setClearTurnstileSecret] = useState(false);
  const [clearSmtpUrl, setClearSmtpUrl] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationWidgetVersion, setVerificationWidgetVersion] = useState(0);

  useEffect(() => {
    adminRequest<SecuritySettings>('/api/admin/security-settings').then((value) => {
      setSettings(value);
      setForm((current) => ({...current, emailVerificationEnabled: value.emailVerificationEnabled, twoFactorRequired: value.twoFactorRequired, turnstileEnabled: value.turnstileEnabled, turnstileSiteKey: value.turnstileSiteKey ?? '', smtpEnabled: value.smtpEnabled, smtpFromEmail: value.smtpFromEmail ?? '', smtpFromName: value.smtpFromName ?? 'Shpitto'}));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Security settings are unavailable.'));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage(''); setError('');
    const idempotencyKey = `security-settings-${crypto.randomUUID()}`;
    try {
      const value = await adminRequest<SecuritySettings>('/api/admin/security-settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify({...form, expectedVersion: settings?.version ?? 1, idempotencyKey, clearTurnstileSecret, clearSmtpUrl})});
      setSettings(value);
      setForm((current) => ({...current, turnstileSecretKey: '', smtpUrl: '', reason: ''}));
      setClearTurnstileSecret(false); setClearSmtpUrl(false);
      setMessage('Security settings saved. Secret fields remain write-only.');
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Security settings could not be saved.');}
    finally {setPending(false);}
  }

  async function sendVerificationEmail() {
    setPending(true); setError(''); setVerificationMessage('');
    try {
      await adminRequest('/api/admin/security-settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': `security-email-verify-${crypto.randomUUID()}`}, body: JSON.stringify({action: 'send-verification', turnstileToken: verificationToken})});
      setVerificationMessage('Verification instructions were sent if email delivery succeeded. Check your inbox before enabling email verification.');
      setVerificationToken(''); setVerificationWidgetVersion((value) => value + 1);
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Verification email could not be requested.');}
    finally {setPending(false);}
  }

  if (error && !settings) return <div className="admin-state admin-state-error" role="alert">{error}</div>;
  return <section className="admin-resource-card ui-card">
    <header className="admin-resource-header"><div><p className="admin-eyebrow">Superadmin only</p><h1>Security settings</h1><p>Configure optional email verification, operator 2FA and Cloudflare Turnstile. Secrets are write-only and never returned.</p></div><div className="admin-resource-meta"><span>Version {settings?.version ?? '—'}</span><span>SMTP {settings?.smtpConfigured ? 'configured' : 'not configured'}</span></div></header>
    <form className="admin-settings-form" onSubmit={save}>
      {!settings?.currentIdentityEmailVerified ? <div className="admin-state"><span>Your superadmin account email is not verified. Verify it before enabling the email-verification requirement.</span>{settings?.turnstileEnabled && settings.turnstileSiteKey ? <TurnstileWidget key={verificationWidgetVersion} siteKey={settings.turnstileSiteKey} action="email-verification" onToken={setVerificationToken} /> : null}<button className="ui-button ui-button-secondary" type="button" disabled={pending || !settings?.emailDeliveryAvailable || settings.turnstileEnabled && !verificationToken} onClick={sendVerificationEmail}>{pending ? 'Sending…' : 'Send verification email'}</button></div> : null}
      <label className="admin-security-toggle"><input type="checkbox" checked={form.emailVerificationEnabled} disabled={!settings?.currentIdentityEmailVerified} onChange={(event) => setForm({...form, emailVerificationEnabled: event.target.checked})} /><span><strong>Email verification</strong><small>When enabled, users must verify email before sign-in. Verify the current superadmin account first.</small></span></label>
      <label className="admin-security-toggle"><input type="checkbox" checked={form.twoFactorRequired} onChange={(event) => setForm({...form, twoFactorRequired: event.target.checked})} /><span><strong>Require 2FA for operator access</strong><small>When disabled, operator sessions can use password authentication without a step-up.</small></span></label>
      <fieldset className="admin-settings-fieldset"><legend>Cloudflare Turnstile</legend><label className="admin-security-toggle"><input type="checkbox" checked={form.turnstileEnabled} onChange={(event) => setForm({...form, turnstileEnabled: event.target.checked})} /><span><strong>Enable Turnstile</strong><small>{settings?.turnstileConfigured ? 'A secret key is stored.' : 'No secret key is stored.'}</small></span></label><label className="ui-label"><span>Site key</span><input className="ui-input" required={form.turnstileEnabled} value={form.turnstileSiteKey} onChange={(event) => setForm({...form, turnstileSiteKey: event.target.value})} autoComplete="off" /></label><label className="ui-label"><span>Secret key</span><input className="ui-input" type="password" value={form.turnstileSecretKey} required={form.turnstileEnabled && !settings?.turnstileConfigured} onChange={(event) => setForm({...form, turnstileSecretKey: event.target.value})} autoComplete="new-password" placeholder={settings?.turnstileConfigured ? 'Leave empty to keep current secret' : 'Enter secret key'} /></label><label className="admin-security-toggle admin-security-toggle-compact"><input type="checkbox" checked={clearTurnstileSecret} onChange={(event) => setClearTurnstileSecret(event.target.checked)} /><span>Clear stored Turnstile secret</span></label></fieldset>
      <fieldset className="admin-settings-fieldset"><legend>SMTP delivery</legend><label className="admin-security-toggle"><input type="checkbox" checked={form.smtpEnabled} onChange={(event) => setForm({...form, smtpEnabled: event.target.checked})} /><span><strong>Enable SMTP</strong><small>{settings?.smtpConfigured ? 'An SMTP URL is stored.' : 'No SMTP URL is stored.'}</small></span></label><label className="ui-label"><span>SMTP URL</span><input className="ui-input" type="password" value={form.smtpUrl} required={form.smtpEnabled && !settings?.smtpConfigured} onChange={(event) => setForm({...form, smtpUrl: event.target.value})} autoComplete="new-password" placeholder={settings?.smtpConfigured ? 'Leave empty to keep current URL' : 'smtps://user:password@example.com:465'} /></label><label className="ui-label"><span>From email</span><input className="ui-input" type="email" value={form.smtpFromEmail} required={form.smtpEnabled} onChange={(event) => setForm({...form, smtpFromEmail: event.target.value})} /></label><label className="ui-label"><span>From name</span><input className="ui-input" value={form.smtpFromName} onChange={(event) => setForm({...form, smtpFromName: event.target.value})} /></label><label className="admin-security-toggle admin-security-toggle-compact"><input type="checkbox" checked={clearSmtpUrl} onChange={(event) => setClearSmtpUrl(event.target.checked)} /><span>Clear stored SMTP URL</span></label></fieldset>
      <label className="ui-label"><span>Change reason</span><input className="ui-input" value={form.reason} onChange={(event) => setForm({...form, reason: event.target.value})} minLength={3} maxLength={500} required /></label>
      <button className="ui-button ui-button-default" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save security settings'}</button>
      {message ? <p className="admin-state" role="status">{message}</p> : null}{error ? <p className="admin-state admin-state-error" role="alert">{error}</p> : null}
      {verificationMessage ? <p className="admin-state" role="status">{verificationMessage}</p> : null}
    </form>
  </section>;
}
