"use client";

import { useState } from "react";
import type { TemplateDictionary } from "../../lib/i18n";
import { SignInButton } from "./auth-components";
import { useSearchParams } from "next/navigation";

type AuthFormMode = 'google' | 'preview-credentials' | 'unconfigured';

type AuthFormProps = {
  mode: AuthFormMode;
  dictionary: TemplateDictionary;
};

export function AuthForm({ mode, dictionary }: AuthFormProps) {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/app';
  const [email, setEmail] = useState('demo@fluxkreafree.com');
  const [password, setPassword] = useState('flux-demo');
  const [state, setState] = useState<'idle' | 'submitting'>('idle');

  if (mode === 'google') {
    return (
      <div className="auth-form">
        <p className="auth-hint">{dictionary.authGoogleHint}</p>
        <div className="auth-form__actions">
          <SignInButton provider="google" callbackUrl={next}>
            <button type="button" className="button-primary button-primary--wide button-google"><span className="button-google__icon">G</span>{dictionary.authContinueWithGoogle}</button>
          </SignInButton>
          <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>
        </div>
      </div>
    );
  }

  if (mode === 'unconfigured') {
    return (
      <div className="auth-form">
        <p className="auth-error">{dictionary.authMisconfigured}</p>
        <div className="auth-form__actions">
          <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
      <label className="auth-field">
        <span>Email</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" name="password" autoComplete="current-password" required />
      </label>
      <input type="hidden" name="next" value={next} />
      <p className="auth-hint">{dictionary.authPreviewHint}</p>
      <div className="auth-form__actions">
        <SignInButton provider="dev-user" email={email} password={password} callbackUrl={next} onStart={() => setState("submitting")}><button type="submit" className="button-primary button-primary--wide" disabled={state === "submitting"}>{state === "submitting" ? dictionary.authSigningIn : dictionary.authPreviewSubmit}</button></SignInButton>
        <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>
      </div>
    </form>
  );
}
