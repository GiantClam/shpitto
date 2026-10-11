import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileStack, Globe2, MapPinned } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";
import { getAllUseCases } from "@/lib/use-cases";

export const metadata: Metadata = {
  title: "Use Cases for Export B2B Websites | Shpitto",
  description:
    "Explore Shpitto use cases for manufacturers, trading companies, and industrial suppliers building professional export websites with stronger SEO structure.",
  alternates: {
    canonical: "/use-cases",
  },
  openGraph: {
    title: "Use Cases for Export B2B Websites | Shpitto",
    description:
      "Explore Shpitto use cases for manufacturers, trading companies, and industrial suppliers building professional export websites with stronger SEO structure.",
    url: "/use-cases",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Use Cases for Export B2B Websites | Shpitto",
    description:
      "Explore Shpitto use cases for manufacturers, trading companies, and industrial suppliers building professional export websites with stronger SEO structure.",
  },
};

export default async function UseCasesIndexPage() {
  const locale = await getServerLocale();
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const useCases = getAllUseCases();

  return (
    <main className="min-h-screen bg-[radial-gradient(960px_420px_at_18%_0%,rgba(252,89,83,0.14),transparent_70%),linear-gradient(180deg,#fffaf5,#f4ebe3)] text-[var(--shp-text)]">
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" locale={locale} />

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] bg-white/70 px-4 py-2 text-sm font-bold text-[var(--shp-primary)] shadow-sm">
            <Globe2 className="h-4 w-4" />
            Export B2B Website Use Cases
          </div>
          <h1 className="text-balance text-5xl font-black tracking-tight lg:text-7xl">Choose the use case that matches your export business</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[var(--shp-muted)]">
            These pages explain how Shpitto fits manufacturers, trading companies, and industrial suppliers that need
            professional English websites, stronger product structure, and better inquiry paths.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {useCases.map((item) => (
            <article
              key={item.slug}
              className="flex h-full flex-col rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/75 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]"
            >
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">{item.eyebrow}</div>
              <h2 className="mt-3 text-3xl font-black">{item.label}</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">{item.description}</p>

              <div className="mt-6 rounded-[1.5rem] border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--shp-text)]">
                  <MapPinned className="h-4 w-4 text-[var(--shp-primary)]" />
                  Best fit
                </div>
                <p className="text-sm leading-7 text-[var(--shp-muted)]">{item.audience}</p>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--shp-text)]">
                  <FileStack className="h-4 w-4 text-[var(--shp-primary)]" />
                  High-value pages
                </div>
                <ul className="space-y-3 text-sm leading-6 text-[var(--shp-muted)]">
                  {item.keyPages.slice(0, 3).map((page) => (
                    <li key={page} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/75 px-4 py-3">
                      {page}
                    </li>
                  ))}
                </ul>
              </div>

              <Link href={item.href} className="mt-8 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-primary)]">
                Explore this use case <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
