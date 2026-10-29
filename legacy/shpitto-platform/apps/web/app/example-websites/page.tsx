import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileStack, Globe2, Search } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";
import { getExampleWebsites } from "@/lib/example-websites";

export const metadata: Metadata = {
  title: "Example Websites for Export B2B Teams | Shpitto",
  description:
    "Explore sample website directions for manufacturers, trading companies, and industrial suppliers building SEO-friendly export websites with Shpitto.",
  alternates: {
    canonical: "/example-websites",
  },
  openGraph: {
    title: "Example Websites for Export B2B Teams | Shpitto",
    description:
      "Explore sample website directions for manufacturers, trading companies, and industrial suppliers building SEO-friendly export websites with Shpitto.",
    url: "/example-websites",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Example Websites for Export B2B Teams | Shpitto",
    description:
      "Explore sample website directions for manufacturers, trading companies, and industrial suppliers building SEO-friendly export websites with Shpitto.",
  },
};

export default async function ExampleWebsitesPage() {
  const locale = await getServerLocale();
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const examples = getExampleWebsites();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHPITTO_SITE_URL || "https://shpitto.com").replace(
    /\/+$/,
    "",
  );
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Example Websites", item: `${siteUrl}/example-websites` },
    ],
  };
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Example Websites for Export B2B Teams",
    itemListElement: examples.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      description: item.summary,
      url: `${siteUrl}${item.useCaseHref}`,
    })),
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(960px_420px_at_18%_0%,rgba(252,89,83,0.14),transparent_70%),linear-gradient(180deg,#fffaf5,#f4ebe3)] text-[var(--shp-text)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" locale={locale} />

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-28">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-muted)]">
          <Link href="/" className="transition-colors hover:text-[var(--shp-primary)]">
            Home
          </Link>
          <span>/</span>
          <span className="text-[var(--shp-primary)]">Example Websites</span>
        </nav>

        <div className="mx-auto mt-8 max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] bg-white/70 px-4 py-2 text-sm font-bold text-[var(--shp-primary)] shadow-sm">
            <Globe2 className="h-4 w-4" />
            Sample Export Website Directions
          </div>
          <h1 className="text-balance text-5xl font-black tracking-tight lg:text-7xl">
            Review example websites before you generate your own
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[var(--shp-muted)]">
            These are sample website directions for common export B2B scenarios. Use them to understand how homepage
            positioning, product structure, application pages, and inquiry routes should change by business model.
          </p>
        </div>

        <div className="mt-12 grid gap-6">
          {examples.map((item) => (
            <article
              key={item.slug}
              className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]"
            >
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">{item.eyebrow}</div>
                  <h2 className="mt-3 text-3xl font-black text-[var(--shp-text)]">{item.label}</h2>
                  <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">{item.summary}</p>

                  <div className="mt-6 rounded-[1.5rem] border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] p-5">
                    <div className="mb-3 text-sm font-bold text-[var(--shp-text)]">Positioning direction</div>
                    <p className="text-sm leading-7 text-[var(--shp-muted)]">{item.positioning}</p>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {item.seoFocus.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,white_90%)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--shp-primary)]"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-white/72 p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--shp-text)]">
                      <FileStack className="h-4 w-4 text-[var(--shp-primary)]" />
                      High-value pages
                    </div>
                    <ul className="space-y-3 text-sm leading-7 text-[var(--shp-muted)]">
                      {item.pageHighlights.map((page) => (
                        <li
                          key={page}
                          className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-3"
                        >
                          {page}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,240,237,0.96))] p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--shp-text)]">
                      <Search className="h-4 w-4 text-[var(--shp-primary)]" />
                      Sample prompt
                    </div>
                    <p className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/80 px-4 py-4 font-mono text-xs leading-6 text-[var(--shp-muted)]">
                      {item.samplePrompt}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-4">
                <Link href={item.useCaseHref} className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-primary)]">
                  Explore matching use case <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={item.relatedGuideHref} className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-text)]">
                  Read related guide <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
