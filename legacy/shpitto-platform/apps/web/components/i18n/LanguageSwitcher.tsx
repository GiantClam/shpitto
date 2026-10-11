"use client";

import { useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import { LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n";

type LanguageSwitcherProps = {
  locale: Locale;
  compact?: boolean;
  onLocaleChange?: (locale: Locale) => void;
};

export function LanguageSwitcher({ locale, compact = false, onLocaleChange }: LanguageSwitcherProps) {
  const router = useRouter();

  function setLocale(nextLocale: Locale) {
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    onLocaleChange?.(nextLocale);
    router.refresh();
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_62%,transparent)] p-1 text-xs"
      aria-label="Language"
    >
      {!compact ? <Globe2 className="ml-1 h-3.5 w-3.5 text-[var(--shp-muted)]" /> : null}
      {(["en", "zh"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          className={[
            "rounded-full px-2 py-1 font-semibold transition-colors",
            locale === item
              ? "bg-[var(--shp-primary)] text-black"
              : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
          ].join(" ")}
          aria-pressed={locale === item}
        >
          {item === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
