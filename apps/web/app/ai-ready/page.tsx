import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Network, Search, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";
import { AI_READY_FAQ, getAiReadinessPillars } from "@/lib/ai-readiness";

export const metadata: Metadata = {
  title: "AI-Ready Website Content for Export B2B Teams | Shpitto",
  description:
    "Learn how Shpitto helps manufacturers, trading companies, and industrial suppliers structure export website content for SEO, search visibility, and future AI discovery.",
  alternates: {
    canonical: "/ai-ready",
  },
  openGraph: {
    title: "AI-Ready Website Content for Export B2B Teams | Shpitto",
    description:
      "Learn how Shpitto helps manufacturers, trading companies, and industrial suppliers structure export website content for SEO, search visibility, and future AI discovery.",
    url: "/ai-ready",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI-Ready Website Content for Export B2B Teams | Shpitto",
    description:
      "Learn how Shpitto helps manufacturers, trading companies, and industrial suppliers structure export website content for SEO, search visibility, and future AI discovery.",
  },
};

export default async function AiReadyPage() {
  const locale = await getServerLocale();
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const pillars = getAiReadinessPillars();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHPITTO_SITE_URL || "https://shpitto.com").replace(
    /\/+$/,
    "",
  );
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "AI-Ready Content", item: `${siteUrl}/ai-ready` },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: AI_READY_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(960px_420px_at_18%_0%,rgba(252,89,83,0.14),transparent_70%),linear-gradient(180deg,#fffaf5,#f4ebe3)] text-[var(--shp-text)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" locale={locale} />

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-28">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-muted)]">
          <Link href="/" className="transition-colors hover:text-[var(--shp-primary)]">
            Home
          </Link>
          <span>/</span>
          <span className="text-[var(--shp-primary)]">AI-Ready Content</span>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] bg-white/70 px-4 py-2 text-sm font-bold text-[var(--shp-primary)] shadow-sm">
              <Bot className="h-4 w-4" />
              Search + AI Visibility
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-black tracking-tight lg:text-7xl">
              Build export website content that search engines and AI systems can actually understand
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--shp-muted)]">
              For manufacturers, trading companies, and industrial suppliers, AI-ready content starts with clear structure:
              company pages, product pages, application pages, FAQs, and inquiry paths that work for overseas buyers and
              future answer engines alike.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/launch-center" className="shp-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.14em]">
                Start with a sample website <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/example-websites"
                className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-white/70 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-text)]"
              >
                See example websites
              </Link>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/78 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">What this changes</div>
            <div className="mt-6 space-y-4">
              {[
                {
                  icon: <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />,
                  text: "Clearer page intent for category, product, and application search queries.",
                },
                {
                  icon: <Network className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />,
                  text: "Stronger semantic links between blog posts, use-case pages, and commercial pages.",
                },
                {
                  icon: <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />,
                  text: "Better buyer trust through structured proof, FAQs, and inquiry-ready page flows.",
                },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-4 text-sm leading-6 text-[var(--shp-muted)]"
                >
                  {item.icon}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="mt-14 grid gap-5 lg:grid-cols-3">
          {pillars.map((item) => (
            <article
              key={item.title}
              className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]"
            >
              <h2 className="text-2xl font-black text-[var(--shp-text)]">{item.title}</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">{item.description}</p>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-[var(--shp-muted)]">
                {item.points.map((point) => (
                  <li
                    key={point}
                    className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-3"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-14 rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,240,237,0.96))] p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">Where to go next</div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Link href="/use-cases" className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/75 px-5 py-5">
              <h2 className="text-lg font-bold text-[var(--shp-text)]">Use cases</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--shp-muted)]">See how page structure changes for manufacturers, traders, and suppliers.</p>
            </Link>
            <Link href="/example-websites" className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/75 px-5 py-5">
              <h2 className="text-lg font-bold text-[var(--shp-text)]">Example websites</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--shp-muted)]">Review sample homepage, product, and application directions before you build.</p>
            </Link>
            <Link href="/blog" className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/75 px-5 py-5">
              <h2 className="text-lg font-bold text-[var(--shp-text)]">Guides</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--shp-muted)]">Read tactical articles on homepage structure, product pages, and export SEO.</p>
            </Link>
          </div>
        </section>

        <section className="mt-14 rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
          <div className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">
            <Search className="h-4 w-4" />
            Common questions
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {AI_READY_FAQ.map((item) => (
              <div key={item.question} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-5 py-5">
                <h2 className="text-base font-bold text-[var(--shp-text)]">{item.question}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--shp-muted)]">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
