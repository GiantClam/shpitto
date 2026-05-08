"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { Locale } from "@/lib/i18n";
import type { AuthTheme } from "@/lib/auth/theme";

type AuthCardShellProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  backHref: string;
  footer: string;
  children: ReactNode;
  theme?: AuthTheme;
};

export function AuthCardShell({ locale, onLocaleChange, backHref, footer, children, theme }: AuthCardShellProps) {
  const brandName = String(theme?.brandName || "Shpitto").trim() || "Shpitto";
  const hasCustomLogo = Boolean(theme?.logo);
  const hasCustomBrand = Boolean(theme?.brandName && brandName !== "Shpitto");
  const cssVars = theme
    ? ({
        "--shp-bg": theme.colors?.background,
        "--shp-surface": theme.colors?.surface,
        "--shp-panel": theme.colors?.panel,
        "--shp-text": theme.colors?.text,
        "--shp-muted": theme.colors?.muted,
        "--shp-border": theme.colors?.border,
        "--shp-primary": theme.colors?.primary,
        "--shp-primary-pressed": theme.colors?.primary,
        "--shp-accent": theme.colors?.accent,
        fontFamily: theme.typography || undefined,
      } as CSSProperties)
    : undefined;

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4"
      style={cssVars}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, color-mix(in_oklab, var(--shp-primary) 20%, transparent), transparent 38%), radial-gradient(circle at bottom right, color-mix(in_oklab, var(--shp-accent) 18%, transparent), transparent 34%)",
        }}
      />
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[var(--shp-panel)] shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="p-8">
          <div className="mb-8 flex items-center gap-3">
            <Link href={backHref} className="-ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
              <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)]" />
            </Link>
            {hasCustomLogo ? (
              <Link
                href="/"
                aria-label={brandName}
                className="inline-flex items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,white_12%)] px-3 py-2"
              >
                <div
                  role="img"
                  aria-label={brandName}
                  className="h-10 w-24 rounded-lg bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${theme?.logo}")`, backgroundSize: "contain" }}
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
            <div className="ml-auto">
              <LanguageSwitcher locale={locale} compact onLocaleChange={onLocaleChange} />
            </div>
          </div>

          {children}
        </div>
        <div className="border-t border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,white_12%)] px-8 py-4 text-center text-xs text-[var(--shp-muted)]">
          {footer}
        </div>
      </section>
    </main>
  );
}
