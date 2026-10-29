"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { Locale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Change password",
    body: "Confirm your current password before setting a new one. After the change, old sessions will be signed out.",
    current: "Current password",
    next: "New password",
    confirm: "Confirm new password",
    submit: "Change password",
    success: "Password changed. Please sign in again.",
    mismatch: "Passwords do not match.",
    short: "Password must be at least 8 characters.",
    back: "Back to workspace",
  },
  zh: {
    title: "修改密码",
    body: "请先确认当前密码，再设置新密码。修改完成后旧会话会退出。",
    current: "当前密码",
    next: "新密码",
    confirm: "确认新密码",
    submit: "修改密码",
    success: "密码已修改，请重新登录。",
    mismatch: "两次输入的新密码不一致。",
    short: "密码至少需要 8 个字符。",
    back: "返回工作台",
  },
};

export function ChangePasswordForm({ initialLocale }: { initialLocale: Locale }) {
  const t = copy[initialLocale] || copy.en;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: t.short });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: t.mismatch });
      return;
    }

    setLoading(true);
    const response = await fetch("/auth/password/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Failed to change password." });
    } else {
      setMessage({ type: "success", text: data.message || t.success });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4">
      <section className="w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-white p-8 shadow-xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/chat" className="-ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
            <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)]" />
          </Link>
          <BrandLogo variant="full" className="shrink-0" />
        </div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--shp-primary)_12%,white_88%)] text-[var(--shp-primary)]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--shp-text)]">{t.title}</h1>
        <p className="mb-6 text-sm leading-6 text-[var(--shp-muted)]">{t.body}</p>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder={t.current}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={t.next}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={t.confirm}
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] px-4 py-3 text-[var(--shp-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[var(--shp-primary)]"
          />
          {message ? (
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_10%,white_90%)] p-3 text-sm text-[var(--shp-primary-pressed)]">
              {message.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--shp-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--shp-primary-pressed)]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.submit}
          </button>
        </form>
        <Link href="/chat" className="mt-5 block text-center text-sm font-semibold text-[var(--shp-primary)] hover:underline">
          {t.back}
        </Link>
      </section>
    </main>
  );
}
