"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { Locale } from "@/lib/i18n";

type AuthCardShellProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  backHref: string;
  footer: string;
  children: ReactNode;
};

export function AuthCardShell({ locale, onLocaleChange, backHref, footer, children }: AuthCardShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-white shadow-xl">
        <div className="p-8">
          <div className="mb-8 flex items-center gap-3">
            <Link href={backHref} className="-ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
              <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)]" />
            </Link>
            <BrandLogo variant="full" className="shrink-0" />
            <div className="ml-auto">
              <LanguageSwitcher locale={locale} compact onLocaleChange={onLocaleChange} />
            </div>
          </div>

          {children}
        </div>
        <div className="border-t border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_88%,white_12%)] px-8 py-4 text-center text-xs text-[var(--shp-muted)]">
          {footer}
        </div>
      </section>
    </main>
  );
}
