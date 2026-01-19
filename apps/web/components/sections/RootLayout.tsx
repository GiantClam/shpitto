"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface RootLayoutProps {
  children: React.ReactNode;
  branding?: {
    name?: string;
    logo?: string;
    colors?: {
      primary?: string;
      accent?: string;
    };
  };
  title?: string;
  project_json?: any;
  onNavigate?: (path: string) => void;
}

export const RootLayout = ({ children, branding, title, project_json, onNavigate }: RootLayoutProps) => {
  const primaryColor = branding?.colors?.primary || "#2563eb";
  const siteName = branding?.name || "Vanguard Industrial";
  const pageTitle = title || siteName;
  
  const seoDescription = "Premium industrial solutions and manufacturing excellence. Factory-direct pricing and global logistics support.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": siteName,
    "logo": branding?.logo,
    "url": typeof window !== "undefined" ? window.location.origin : "",
    "sameAs": [
      "https://www.linkedin.com/company/vanguard-textile",
      "https://twitter.com/vanguardtextile"
    ]
  };

  const pages = project_json?.pages || [];
  const navLinks = pages.length > 0 
    ? pages.map((p: any) => ({ 
        label: p.seo?.title?.split("|")[0].trim() || p.path, 
        url: p.path 
      })).slice(0, 5)
    : [
        { label: "Home", url: "/" },
        { label: "Products", url: "/products" },
        { label: "Solutions", url: "/solutions" },
        { label: "About", url: "/about" },
        { label: "Contact", url: "/contact" }
      ];

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-blue-100" style={{ "--primary": primaryColor } as any}>
      <title>{pageTitle}</title>
      <meta name="description" content={seoDescription} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 group cursor-pointer"
            onClick={() => onNavigate && onNavigate("/")}
          >
            {branding?.logo ? (
              <img src={branding.logo} alt={`${siteName} Logo`} className="h-10 w-auto" />
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">V</div>
            )}
            <span className="font-bold text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
              {siteName}
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link: any) => (
              <a 
                key={link.url} 
                href={link.url} 
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(link.url);
                  }
                }}
                className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                    link.url === "/" ? "text-blue-600 bg-blue-50/50" : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
                )}
              >
                {link.label}
              </a>
            ))}
            <button className="ml-4 bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:-translate-y-0.5 transition-all">
                Request Quote
            </button>
          </nav>

          <button className="md:hidden p-2 text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </button>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
                <div className="text-white font-bold text-xl mb-6">{siteName}</div>
                <p className="text-sm leading-relaxed mb-6">Global leaders in premium industrial textile manufacturing and distribution since 1994. OEKO-TEX® Certified.</p>
                <div className="flex gap-4">
                    {["facebook", "twitter", "linkedin"].map(platform => <div key={platform} className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors cursor-pointer">f</div>)}
                </div>
            </div>
            <nav>
                <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Products</h4>
                <ul className="space-y-4 text-sm">
                    <li><a href="#" className="hover:text-white transition-colors">Hotel Textiles</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">Industrial Fabrics</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">Eco-Series</a></li>
                </ul>
            </nav>
            <nav>
                <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Support</h4>
                <ul className="space-y-4 text-sm">
                    <li><a href="#" className="hover:text-white transition-colors">Technical Data</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">Certifications</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">Shipping Info</a></li>
                </ul>
            </nav>
            <div>
                <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Subscribe</h4>
                <p className="text-sm mb-4">Get the latest industrial insights and OEKO-TEX® updates.</p>
                <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
                    <input type="email" placeholder="Corporate Email" className="bg-slate-800 border-none rounded-lg px-4 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <button type="submit" className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors">→</button>
                </form>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <div>© 2024 {siteName}. All rights reserved. Industrial Grade Excellence.</div>
            <nav className="flex gap-8">
                <a href="#" className="hover:text-white">Privacy Policy</a>
                <a href="#" className="hover:text-white">Terms of Service</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
};
