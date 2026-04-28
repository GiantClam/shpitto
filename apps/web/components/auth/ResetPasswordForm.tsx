"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { Locale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Reset password",
    body: "Enter a new password for your account. After the change, sign in again with the new password.",
    password: "New password",
    confirm: "Confirm new password",
    submit: "Update password",
    success: "Password updated. Please sign in again.",
    mismatch: "Passwords do not match.",
    short: "Password must be at least 8 characters.",
    missingToken: "This password reset link is missing a token.",
    signIn: "Back to sign in",
  },
  zh: {
    title: "重置密码",
    body: "为你的账号设置新密码。修改完成后，请使用新密码重新登录。",
    password: "新密码",
    confirm: "确认新密码",
    submit: "更新密码",
    success: "密码已更新，请重新登录。",
    mismatch: "两次输入的密码不一致。",
    short: "密码至少需要 8 个字符。",
    missingToken: "重置密码链接缺少 token。",
    signIn: "返回登录",
  },
};

export function ResetPasswordForm({ initialLocale, token }: { initialLocale: Locale; token: string }) {
  const t = copy[initialLocale] || copy.en;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    token ? null : { type: "error", text: t.missingToken },
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!token) {
      setMessage({ type: "error", text: t.missingToken });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: "error", text: t.short });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: t.mismatch });
      return;
    }

    setLoading(true);
    const response = await fetch("/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Failed to reset password." });
    } else {
      setMessage({ type: "success", text: data.message || t.success });
      setPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4">
      <section className="w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-white p-8 shadow-xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/login" className="-ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
            <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)]" />
          </Link>
          <BrandLogo variant="full" className="shrink-0" />
        </div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--shp-primary)_12%,white_88%)] text-[var(--shp-primary)]">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--shp-text)]">{t.title}</h1>
        <p className="mb-6 text-sm leading-6 text-[var(--shp-muted)]">{t.body}</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{t.password}</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--shp-text)]">{t.confirm}</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
            />
          </div>
          {message ? (
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_10%,white_90%)] p-3 text-sm text-[var(--shp-primary-pressed)]">
              {message.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || !token}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--shp-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--shp-primary-pressed)] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.submit}
          </button>
        </form>
        <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-[var(--shp-primary)] hover:underline">
          {t.signIn}
        </Link>
      </section>
    </main>
  );
}
