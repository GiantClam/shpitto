"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appNavigation, marketingNavigation } from "../../content/navigation";
import { site } from "../../content/site";
import type { TemplateDictionary } from "../../lib/i18n";
import { SignedIn } from "../auth/auth-components";
import { UserButton } from "../auth/user-button";

type SiteHeaderProps = {
  dictionary: TemplateDictionary;
};

export function SiteHeader({ dictionary }: SiteHeaderProps) {
  const pathname = usePathname() || "/";
  const navItems = pathname === "/app" || pathname.startsWith("/app/") ? appNavigation : marketingNavigation;
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__identity">
          <Link href="/" className="brand-mark">{site.name}</Link>
          <span className="shell-badge">{dictionary.aiImageTemplate}</span>
        </div>
        <div className="site-header__controls">
        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} className={item.href === pathname ? "nav-link nav-link--active" : "nav-link"}>
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="header-actions" aria-label="Global actions">
          <SignedIn><UserButton /></SignedIn>
        </div>
        </div>
      </div>
    </header>
  );
}
