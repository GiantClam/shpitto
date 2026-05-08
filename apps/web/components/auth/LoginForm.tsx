"use client";

import { createClient } from "@/lib/supabase/client";
import { serializeAuthTheme, withAuthQueryPath, withAuthThemePath } from "@/lib/auth/theme";
import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { getLandingCopy, type Locale } from "@/lib/i18n";
import type { AuthTheme } from "@/lib/auth/theme";

type LoginFormProps = {
  initialLocale: Locale;
  nextPath: string;
  theme?: AuthTheme;
  projectId?: string;
  siteKey?: string;
};

export function LoginForm({ initialLocale, nextPath, theme, projectId, siteKey }: LoginFormProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  const supabase = createClient();
  const copy = getLandingCopy(locale).login;

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

      const response = await fetch("/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, projectId, siteKey }),
      });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Invalid login credentials" });
      setLoading(false);
    } else {
      window.location.assign(nextPath);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}${withAuthQueryPath("/auth/callback", {
            next: nextPath,
            theme: serializeAuthTheme(theme),
            projectId,
            siteKey,
          })}`,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
        setLoading(false);
        return;
      }

      if (!data?.url) {
        setMessage({ type: "error", text: copy.oauthMissing });
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (error: any) {
      setMessage({ type: "error", text: String(error?.message || error || copy.oauthFailed) });
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

      const response = await fetch("/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: nextPath, theme: serializeAuthTheme(theme), projectId, siteKey }),
      });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Failed to send password reset link." });
    } else {
      setMessage({ type: "success", text: data.message || copy.resetLinkSent });
    }
    setLoading(false);
  };

  return (
    <AuthCardShell locale={locale} onLocaleChange={setLocale} backHref="/" footer={copy.legal} theme={theme}>
      <h1 className="mb-2 text-2xl font-bold text-[var(--shp-text)]">{copy.welcome}</h1>
      <p className="mb-8 text-[var(--shp-muted)]">{copy.subtitle}</p>

      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[var(--shp-panel)] px-4 py-3 font-semibold text-[var(--shp-text)] transition-all hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_6%,var(--shp-panel)_94%)]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {copy.google}
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-[var(--shp-panel)] px-2 text-[var(--shp-muted)]">{copy.divider}</span>
        </div>
      </div>

      <form onSubmit={mode === "forgot" ? handleForgotPassword : handleEmailLogin} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{copy.email}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            placeholder="name@company.com"
          />
        </div>
        {mode === "signin" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{copy.password}</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
              placeholder={copy.passwordPlaceholder}
            />
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setMessage(null);
                }}
                className="text-sm font-semibold text-[var(--shp-primary)] hover:underline"
              >
                {copy.forgotPassword}
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <div className={`rounded-lg p-3 text-sm ${message.type === "error" ? "bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] text-[var(--shp-primary-pressed)]" : "bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] text-[var(--shp-primary-pressed)]"}`}>
            {message.text}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--shp-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--shp-primary-pressed)]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "forgot" ? copy.sendResetLink : copy.signIn}
        </button>
      </form>

      <div className="mt-6 text-center text-sm">
        {mode === "forgot" ? (
          <button
            onClick={() => {
              setMode("signin");
              setMessage(null);
            }}
            disabled={loading}
            className="font-bold text-[var(--shp-primary)] hover:underline"
          >
            {copy.backToSignIn}
          </button>
        ) : (
          <>
            <span className="text-[var(--shp-muted)]">{copy.noAccount}</span>
            <Link
              href={withAuthThemePath("/register", nextPath, theme, undefined, { projectId, siteKey })}
              className="font-bold text-[var(--shp-primary)] hover:underline"
            >
              {copy.signUp}
            </Link>
          </>
        )}
      </div>
    </AuthCardShell>
  );
}
