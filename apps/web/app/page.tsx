import Link from "next/link";
import { Zap } from "lucide-react";
import { Hero } from "@/components/landing/Hero";
import { EfficiencySection } from "@/components/landing/EfficiencySection";
import { VisualQualitySection } from "@/components/landing/VisualQualitySection";
import { BlogSection } from "@/components/landing/BlogSection";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = String(user?.email || "").trim();

  return (
    <div className="min-h-screen font-sans selection:bg-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)]">
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" />

      <main>
        <Hero ctaHref="/launch-center" />
        <EfficiencySection />
        <VisualQualitySection />
        <BlogSection />

        <section className="relative overflow-hidden border-y border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[var(--shp-bg)] py-32">
          <div className="absolute inset-0 bg-[radial-gradient(680px_320px_at_50%_20%,color-mix(in_oklab,var(--shp-primary)_20%,transparent),transparent_70%)]"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--shp-bg)_96%,black_4%)] via-transparent to-transparent"></div>

          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
            <h2 className="mb-8 text-4xl font-bold tracking-tight text-[var(--shp-text)] lg:text-6xl">Ready to Launch Faster?</h2>
            <p className="mx-auto mb-12 max-w-2xl text-xl text-[var(--shp-muted)]">
              Join thousands of industrial leaders who are growing fast with Shpitto. No credit card required.
            </p>
            <Link href="/chat" className="shp-btn-primary inline-flex items-center gap-2 px-10 py-5 text-lg font-black">
              <Zap className="h-5 w-5 fill-current" />
              Start Your Project Now
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_82%,black_18%)] py-16 text-sm text-[var(--shp-muted)]">
        <div className="mx-auto mb-12 grid max-w-7xl gap-12 px-6 md:grid-cols-4">
          <div className="col-span-1">
            <div className="mb-6 flex items-center gap-2 text-[var(--shp-text)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--shp-primary)] text-lg font-black text-black">
                S
              </div>
              <span className="text-xl font-bold">Shpitto</span>
            </div>
            <p className="mb-6 leading-relaxed">
              The AI-powered website builder designed specifically for the industrial sector. Smart, fast, and professional.
            </p>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] hover:bg-[var(--shp-primary)] hover:text-black">
                X
              </div>
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] hover:bg-[var(--shp-primary)] hover:text-black">
                In
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">Product</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Features</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Pricing</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Showcase</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Integrations</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">Resources</h4>
            <ul className="space-y-4">
              <li><Link href="/blog" className="hover:text-[var(--shp-primary)]">Blog</Link></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Documentation</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Community</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Help Center</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">Company</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-[var(--shp-primary)]">About Us</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Careers</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Legal</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-6 pt-8 md:flex-row">
          <div>(c) 2026 Shpitto Inc. All rights reserved.</div>
          <div className="flex gap-8">
            <Link href="/legal/privacy" className="hover:text-[var(--shp-text)]">Privacy Policy</Link>
            <Link href="/legal/terms" className="hover:text-[var(--shp-text)]">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
