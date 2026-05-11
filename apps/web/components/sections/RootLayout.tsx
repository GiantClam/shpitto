"use client";

import Image from "next/image";
import React from "react";
import { cn } from "@/lib/utils";
import { inferNavLabel, resolveStylePresetFromProject } from "@/lib/design-style-preset";

export interface RootLayoutProps {
  children: React.ReactNode;
  branding?: {
    name?: string;
    logo?: string;
    colors?: {
      primary?: string;
      accent?: string;
    };
    style?: {
      borderRadius?: string;
      typography?: string;
    };
  };
  title?: string;
  project_json?: any;
  onNavigate?: (path: string) => void;
  seoSchema?: string;
}

export const RootLayout = ({ children, branding, title, project_json, onNavigate, seoSchema }: RootLayoutProps) => {
  const stylePreset = resolveStylePresetFromProject(project_json, branding);
  const primaryColor = branding?.colors?.primary || stylePreset.colors.primary;
  const accentColor = branding?.colors?.accent || stylePreset.colors.accent;
  const brandFont = branding?.style?.typography || stylePreset.typography;
  const siteName = branding?.name || "Shpitto";
  const pageTitle = title || siteName;

  const seoDescription = "Professional industrial solutions with predictable delivery and measurable quality.";

  const defaultJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    logo: branding?.logo,
    url: typeof window !== "undefined" ? window.location.origin : "",
    sameAs: ["https://www.linkedin.com", "https://twitter.com"],
  };

  let jsonLd: any = defaultJsonLd;
  if (typeof seoSchema === "string" && seoSchema.trim()) {
    try {
      jsonLd = JSON.parse(seoSchema);
    } catch {
      jsonLd = defaultJsonLd;
    }
  }

  const pages = project_json?.pages || [];
  const navLinks =
    pages.length > 0
      ? pages
          .map((p: any) => ({
            label: inferNavLabel(p, stylePreset.navLabelMaxChars),
            fullTitle: p?.seo?.title || "",
            url: p?.path || "/",
          }))
          .slice(0, 6)
      : [
          { label: "Home", fullTitle: "Home", url: "/" },
          { label: "Products", fullTitle: "Products", url: "/products" },
          { label: "Solutions", fullTitle: "Solutions", url: "/solutions" },
          { label: "About", fullTitle: "About", url: "/about" },
          { label: "Contact", fullTitle: "Contact", url: "/contact" },
        ];

  const currentPath = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
  const isDark = stylePreset.mode === "dark";

  const headerClass =
    stylePreset.headerVariant === "solid"
      ? isDark
        ? "sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800"
        : "sticky top-0 z-50 bg-white border-b border-slate-200"
      : isDark
        ? "sticky top-0 z-50 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/80"
        : "sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm";

  const footerClass =
    stylePreset.footerVariant === "light"
      ? "bg-white text-slate-700 py-16 border-t border-slate-200"
      : isDark
        ? "bg-zinc-950 text-zinc-100 py-16 border-t border-zinc-800"
        : "bg-slate-900 text-slate-300 py-16 border-t border-slate-800";

  const navActiveClass =
    stylePreset.navVariant === "underline"
      ? "text-[var(--primary)] font-bold border-b-2 border-[var(--primary)] pb-1"
      : "text-[var(--primary)] font-bold bg-[color:var(--primary)]/10 px-3 py-1 rounded-full";
  const navInactiveClass =
    stylePreset.navVariant === "underline"
      ? "text-slate-600 hover:text-[var(--primary)] border-b-2 border-transparent hover:border-[color:var(--primary)]/50 pb-1"
      : "text-slate-600 hover:text-[var(--primary)] hover:bg-[color:var(--primary)]/10 px-3 py-1 rounded-full";

  const ctaClass =
    stylePreset.buttonVariant === "outline"
      ? "ml-4 border border-[var(--primary)] text-[var(--primary)] px-5 py-2.5 rounded-full text-sm font-bold hover:bg-[var(--primary)] hover:text-white transition-all"
      : "ml-4 bg-[var(--primary)] text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg hover:opacity-90 hover:-translate-y-0.5 transition-all";

  return (
    <div
      data-style-mode={stylePreset.mode}
      className={cn("min-h-screen flex flex-col selection:bg-blue-100", isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-slate-900")}
      style={
        {
          "--primary": primaryColor,
          "--accent": accentColor,
          "--brand-bg": stylePreset.colors.background,
          "--brand-surface": stylePreset.colors.surface,
          "--brand-panel": stylePreset.colors.panel,
          "--brand-text": stylePreset.colors.text,
          "--brand-muted": stylePreset.colors.muted,
          "--brand-border": stylePreset.colors.border,
          fontFamily: brandFont || undefined,
        } as any
      }
    >
      <title>{pageTitle}</title>
      <meta name="description" content={seoDescription} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className={headerClass}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => onNavigate && onNavigate("/")}>
            {branding?.logo ? (
              <Image
                src={branding.logo}
                alt={`${siteName} Logo`}
                width={160}
                height={40}
                unoptimized
                sizes="160px"
                className="h-10 w-auto"
              />
            ) : (
              <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">{siteName[0] || "S"}</div>
            )}
            <span className="font-bold text-xl tracking-tight text-slate-900 group-hover:text-[var(--primary)] transition-colors">{siteName}</span>
          </div>

          <nav className="hidden md:flex items-center gap-2 lg:gap-4">
            {navLinks.map((link: any) => {
              const isActive = link.url === currentPath;
              return (
                <a
                  key={link.url}
                  href={link.url}
                  title={link.fullTitle}
                  onClick={(e) => {
                    if (onNavigate) {
                      e.preventDefault();
                      onNavigate(link.url);
                    }
                  }}
                  className={cn(
                    "inline-block max-w-[10ch] lg:max-w-[12ch] truncate whitespace-nowrap text-sm font-semibold transition-colors",
                    isActive ? navActiveClass : navInactiveClass,
                  )}
                >
                  {link.label}
                </a>
              );
            })}
            <button className={ctaClass}>Request Quote</button>
          </nav>

          <button className="md:hidden p-2 text-slate-600" aria-label="Open mobile menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-grow">{children}</main>

      <footer className={footerClass}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
              <div className="text-white font-bold text-xl mb-6">{siteName}</div>
              <p className="text-sm leading-relaxed mb-6">Built for industrial buyers who need speed, quality, and predictable engineering support.</p>
              <div className="flex gap-4">
                {["facebook", "twitter", "linkedin"].map((platform) => (
                  <div
                    key={platform}
                    className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-[var(--primary)] hover:text-white transition-colors cursor-pointer"
                  >
                    f
                  </div>
                ))}
              </div>
            </div>
            <nav>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Products</h4>
              <ul className="space-y-4 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Core Products
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Custom Solutions
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Certifications
                  </a>
                </li>
              </ul>
            </nav>
            <nav>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Support</h4>
              <ul className="space-y-4 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Technical Docs
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Lead Times
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Logistics
                  </a>
                </li>
              </ul>
            </nav>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Subscribe</h4>
              <p className="text-sm mb-4">Receive product and manufacturing updates.</p>
              <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
                <input type="email" placeholder="Corporate Email" className="bg-slate-800 border-none rounded-lg px-4 py-2 w-full text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none" />
                <button type="submit" className="bg-[var(--primary)] text-white p-2 rounded-lg hover:opacity-90 transition-colors">
                  →
                </button>
              </form>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <div>© {new Date().getFullYear()} {siteName}. All rights reserved.</div>
            <nav className="flex gap-8">
              <a href="#" className="hover:text-white">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white">
                Terms of Service
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
};
