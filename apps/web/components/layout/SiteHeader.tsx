import Link from "next/link";

type SiteHeaderProps = {
  userEmail?: string;
  getStartedHref?: string;
};

export function SiteHeader({ userEmail = "", getStartedHref = "/chat" }: SiteHeaderProps) {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_76%,transparent)] backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--shp-primary)] text-lg font-black text-black shadow-[var(--shp-glow)]">
            S
          </Link>
          <Link href="/" className="text-xl font-bold tracking-tight text-[var(--shp-text)]">
            Shpitto
          </Link>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--shp-muted)] md:flex">
          <Link href="/#features" className="hover:text-[var(--shp-primary)]">
            Features
          </Link>
          <Link href="/#showcase" className="hover:text-[var(--shp-primary)]">
            Showcase
          </Link>
          <Link href="/blog" className="hover:text-[var(--shp-primary)]">
            Blog
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          {userEmail ? (
            <>
              <span className="hidden max-w-[260px] truncate text-sm font-medium text-[var(--shp-muted)] sm:block" title={userEmail}>
                {userEmail}
              </span>
              <Link
                href="/auth/signout"
                className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] px-6 py-2.5 text-sm font-bold text-[var(--shp-text)] hover:border-[var(--shp-primary)] hover:text-[var(--shp-primary)]"
              >
                Sign out
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-bold text-[var(--shp-muted)] hover:text-[var(--shp-primary)] sm:block">
                Log in
              </Link>
              <Link href={getStartedHref} className="shp-btn-primary rounded-full px-6 py-2.5 text-sm font-bold">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
