"use client";

import { createClient } from "@/lib/supabase/client";
import { serializeAuthTheme, withAuthThemePath } from "@/lib/auth/theme";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import type { Locale } from "@/lib/i18n";
import type { AuthTheme } from "@/lib/auth/theme";

const copy = {
  en: {
    badge: "New Account",
    title: "Create your account",
    subtitle: "Use a dedicated sign-up screen to get started, then verify your email before signing in.",
    google: "Continue with Google",
    divider: "Or create with email",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "••••••••",
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "••••••••",
    createAccount: "Create account",
    hasAccount: "Already have an account? ",
    signIn: "Sign in",
    verification: "We will send a verification link after sign-up.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordMismatch: "Passwords do not match.",
    failedCreate: "Failed to create account.",
    legal: "By creating an account, you agree to Shpitto's Terms of Service and Privacy Policy.",
    oauthMissing: "Google OAuth URL not returned by Supabase SDK.",
    oauthFailed: "Failed to open Google OAuth",
  },
  zh: {
    badge: "新建账号",
    title: "创建你的账号",
    subtitle: "使用专门的注册界面开始创建账号，之后先完成邮箱验证，再进行登录。",
    google: "继续使用 Google",
    divider: "或使用邮箱注册",
    email: "邮箱",
    password: "密码",
    passwordPlaceholder: "••••••••",
    confirmPassword: "确认密码",
    confirmPasswordPlaceholder: "••••••••",
    createAccount: "创建账号",
    hasAccount: "已有账号？",
    signIn: "去登录",
    verification: "注册完成后，我们会向你的邮箱发送验证链接。",
    passwordTooShort: "密码至少需要 8 个字符。",
    passwordMismatch: "两次输入的密码不一致。",
    failedCreate: "创建账号失败。",
    legal: "创建账号即表示你同意 Shpitto 的服务条款和隐私政策。",
    oauthMissing: "Supabase SDK 未返回 Google OAuth 地址。",
    oauthFailed: "无法打开 Google OAuth",
  },
} as const;

type Props = {
  initialLocale: Locale;
  nextPath: string;
  theme?: AuthTheme;
  projectId?: string;
  siteKey?: string;
};

export function RegisterForm({ initialLocale, nextPath, theme, projectId, siteKey }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const router = useRouter();

  const supabase = createClient();
  const t = copy[locale] || copy.en;

  const handleGoogleSignup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}${theme ? `&theme=${encodeURIComponent(serializeAuthTheme(theme))}` : ""}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}${siteKey ? `&siteKey=${encodeURIComponent(siteKey)}` : ""}`,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
        setLoading(false);
        return;
      }

      if (!data?.url) {
        setMessage({ type: "error", text: t.oauthMissing });
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (error: any) {
      setMessage({ type: "error", text: String(error?.message || error || t.oauthFailed) });
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ type: "error", text: t.passwordTooShort });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: t.passwordMismatch });
      return;
    }

    setLoading(true);
      const response = await fetch("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next: nextPath, theme: serializeAuthTheme(theme), projectId, siteKey }),
      });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error || t.failedCreate });
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ email, next: nextPath });
    const themeQuery = serializeAuthTheme(theme);
    if (themeQuery) params.set("theme", themeQuery);
    router.push(`/verify-email?${params.toString()}`);
  };

  return (
    <AuthCardShell
      locale={locale}
      onLocaleChange={setLocale}
      backHref={withAuthThemePath("/login", nextPath, theme, undefined, { projectId, siteKey })}
      footer={t.legal}
      theme={theme}
    >
      <div className="mb-6 inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-panel)_90%)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
        {t.badge}
      </div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--shp-text)]">{t.title}</h1>
      <p className="mb-3 text-[var(--shp-muted)]">{t.subtitle}</p>
      <p className="mb-8 text-sm text-[var(--shp-muted)]">{t.verification}</p>

      <button
        onClick={handleGoogleSignup}
        disabled={loading}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[var(--shp-panel)] px-4 py-3 font-semibold text-[var(--shp-text)] transition-all hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_6%,var(--shp-panel)_94%)]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {t.google}
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-[var(--shp-panel)] px-2 text-[var(--shp-muted)]">{t.divider}</span>
        </div>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{t.email}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{t.password}</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            placeholder={t.passwordPlaceholder}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{t.confirmPassword}</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            placeholder={t.confirmPasswordPlaceholder}
          />
        </div>

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
          {t.createAccount}
        </button>
      </form>

      <div className="mt-6 text-center text-sm">
        <span className="text-[var(--shp-muted)]">{t.hasAccount}</span>
        <Link
          href={withAuthThemePath("/login", nextPath, theme, undefined, { projectId, siteKey })}
          className="font-bold text-[var(--shp-primary)] hover:underline"
        >
          {t.signIn}
        </Link>
      </div>
    </AuthCardShell>
  );
}
