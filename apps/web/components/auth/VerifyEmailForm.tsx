"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { serializeAuthTheme, withAuthThemePath } from "@/lib/auth/theme";
import type { Locale } from "@/lib/i18n";
import type { AuthTheme } from "@/lib/auth/theme";

type Props = {
  initialLocale: Locale;
  email: string;
  nextPath: string;
  token: string;
  theme?: AuthTheme;
  projectId?: string;
  siteKey?: string;
};

const copy = {
  en: {
    title: "Verify your email",
    body: "Open the verification link from your inbox to finish creating your Shpitto account.",
    verifying: "Verifying your email...",
    verified: "Email verified. You can now sign in.",
    emailLabel: "Verification email",
    resend: "Resend verification email",
    sent: "If the account exists, a verification email has been sent.",
    back: "Back to sign in",
    missingEmail: "Enter your email on the sign-in page to resend verification.",
    missingToken: "This verification link is missing a token.",
  },
  zh: {
    title: "验证你的邮箱",
    body: "打开邮箱里的验证链接，即可完成 Shpitto 账号创建。",
    verifying: "正在验证邮箱...",
    verified: "邮箱已验证，现在可以登录。",
    emailLabel: "验证邮箱",
    resend: "重新发送验证邮件",
    sent: "如果该账号存在，验证邮件已发送。",
    back: "返回登录",
    missingEmail: "请先在登录页输入邮箱，再重新发送验证邮件。",
    missingToken: "验证链接缺少 token。",
  },
};

export function VerifyEmailForm({ initialLocale, email, nextPath, token, theme, projectId, siteKey }: Props) {
  const t = copy[initialLocale] || copy.en;
  const loginHref = withAuthThemePath("/login", nextPath, theme, undefined, { projectId, siteKey });
  const brandName = String(theme?.brandName || "Shpitto").trim() || "Shpitto";
  const hasCustomBrand = Boolean(theme?.brandName && brandName !== "Shpitto");
  const [loading, setLoading] = useState(Boolean(token));
  const [message, setMessage] = useState<string | null>(token ? t.verifying : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    async function verify() {
      setLoading(true);
      setError(null);
      setMessage(t.verifying);

    const response = await fetch("/auth/email-verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, projectId, siteKey }),
    });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Failed to verify email.");
        setMessage(null);
      } else {
        setMessage(data.message || t.verified);
      }
      setLoading(false);
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token, t.verifying, t.verified]);

  const resend = async () => {
    if (!email) {
      setError(t.missingEmail);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/auth/email-verification/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next: nextPath, theme: serializeAuthTheme(theme), projectId, siteKey }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setError(data.error || "Failed to resend verification email.");
    } else {
      setMessage(data.message || t.sent);
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4">
      <section className="w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[var(--shp-panel)] p-8 shadow-xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href={loginHref} className="-ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
            <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)]" />
          </Link>
          {theme?.logo ? (
            <Link
              href="/"
              aria-label={brandName}
              className="inline-flex items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,white_12%)] px-3 py-2"
            >
              <div
                role="img"
                aria-label={brandName}
                className="h-10 w-24 rounded-lg bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${theme.logo}")`, backgroundSize: "contain" }}
              />
              <span className="max-w-[12rem] truncate text-sm font-bold text-[var(--shp-text)]">{brandName}</span>
            </Link>
          ) : hasCustomBrand ? (
            <Link
              href="/"
              aria-label={brandName}
              className="inline-flex items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,white_12%)] px-3 py-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--shp-primary)] text-sm font-black text-white">
                {brandName.charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[12rem] truncate text-sm font-bold text-[var(--shp-text)]">{brandName}</span>
            </Link>
          ) : (
            <BrandLogo variant="full" className="shrink-0" />
          )}
        </div>

        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--shp-primary)_12%,var(--shp-panel)_88%)] text-[var(--shp-primary)]">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--shp-text)]">{t.title}</h1>
        <p className="mb-6 text-sm leading-6 text-[var(--shp-muted)]">{t.body}</p>

        {email ? (
          <div className="mb-4 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_70%,var(--shp-panel)_30%)] px-4 py-3 text-sm">
            <p className="text-[var(--shp-muted)]">{t.emailLabel}</p>
            <p className="font-semibold text-[var(--shp-text)]">{email}</p>
          </div>
        ) : null}

        {!token && !email ? <div className="mb-4 rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] p-3 text-sm text-[var(--shp-primary-pressed)]">{t.missingToken}</div> : null}
        {message ? <div className="mb-4 rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] p-3 text-sm text-[var(--shp-primary-pressed)]">{message}</div> : null}
        {error ? <div className="mb-4 rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] p-3 text-sm text-[var(--shp-primary-pressed)]">{error}</div> : null}

        <button
          type="button"
          onClick={resend}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--shp-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--shp-primary-pressed)] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t.resend}
        </button>
        <Link href={loginHref} className="mt-5 block text-center text-sm font-semibold text-[var(--shp-primary)] hover:underline">
          {t.back}
        </Link>
      </section>
    </main>
  );
}
