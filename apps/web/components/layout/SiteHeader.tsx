import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getLandingCopy, type Locale } from "@/lib/i18n";

type SiteHeaderProps = {
  userEmail?: string;
  getStartedHref?: string;
  locale?: Locale;
};

export function SiteHeader({ userEmail = "", getStartedHref = "/chat", locale = "en" }: SiteHeaderProps) {
  const copy = getLandingCopy(locale).nav;
  return (
    <header className="fixed top-0 z-50 w-full border-b border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_76%,transparent)] backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <BrandLogo variant="mark" className="shrink-0" />
          <Link href="/" className="text-xl font-bold tracking-tight text-[var(--shp-text)]">
            Shpitto
          </Link>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--shp-muted)] md:flex">
          <Link href={getStartedHref} className="hover:text-[var(--shp-primary)]">
            {copy.projects}
          </Link>
          <Link href="/#features" className="hover:text-[var(--shp-primary)]">
            {copy.features}
          </Link>
          <Link href="/#showcase" className="hover:text-[var(--shp-primary)]">
            {copy.showcase}
          </Link>
          <Link href="/blog" className="hover:text-[var(--shp-primary)]">
            {copy.blog}
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <LanguageSwitcher locale={locale} compact />
          {userEmail ? (
            <>
              <span className="hidden max-w-[260px] truncate text-sm font-medium text-[var(--shp-muted)] sm:block" title={userEmail}>
                {userEmail}
              </span>
              <SignOutButton
                className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] px-6 py-2.5 text-sm font-bold text-[var(--shp-text)] hover:border-[var(--shp-primary)] hover:text-[var(--shp-primary)]"
              >
                {copy.signOut}
              </SignOutButton>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-bold text-[var(--shp-muted)] hover:text-[var(--shp-primary)] sm:block">
                {copy.login}
              </Link>
              <Link href={getStartedHref} className="shp-btn-primary rounded-full px-6 py-2.5 text-sm font-bold">
                {copy.getStarted}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
