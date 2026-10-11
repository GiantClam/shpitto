import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, FileStack, Globe2, MessageSquareMore } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";
import { getAllUseCases, getUseCaseBySlug } from "@/lib/use-cases";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return getAllUseCases().map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolvedParams = await params;
  const useCase = getUseCaseBySlug(resolvedParams.slug);
  if (!useCase) {
    return {
      title: "Use case not found | Shpitto",
      description: "The requested use case page could not be found.",
    };
  }

  return {
    title: useCase.seoTitle,
    description: useCase.seoDescription,
    alternates: {
      canonical: useCase.href,
    },
    openGraph: {
      title: useCase.seoTitle,
      description: useCase.seoDescription,
      url: useCase.href,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: useCase.seoTitle,
      description: useCase.seoDescription,
    },
  };
}

export default async function UseCaseDetailPage({ params }: { params: Params }) {
  const resolvedParams = await params;
  const useCase = getUseCaseBySlug(resolvedParams.slug);
  if (!useCase) notFound();

  const locale = await getServerLocale();
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHPITTO_SITE_URL || "https://shpitto.com").replace(
    /\/+$/,
    "",
  );
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Use Cases",
        item: `${siteUrl}/use-cases`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: useCase.label,
        item: `${siteUrl}${useCase.href}`,
      },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: useCase.faq.map((item) => ({
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
          <Link href="/use-cases" className="transition-colors hover:text-[var(--shp-primary)]">
            Use Cases
          </Link>
          <span>/</span>
          <span className="text-[var(--shp-primary)]">{useCase.shortLabel}</span>
        </nav>

        <Link href="/use-cases" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--shp-primary)]">
          <ArrowLeft className="h-4 w-4" />
          Back to use cases
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] bg-white/70 px-4 py-2 text-sm font-bold text-[var(--shp-primary)] shadow-sm">
              <Globe2 className="h-4 w-4" />
              {useCase.eyebrow}
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-black tracking-tight lg:text-7xl">{useCase.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--shp-muted)]">{useCase.description}</p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/launch-center" className="shp-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.14em]">
                Start with a sample website <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/blog/${useCase.relatedGuide.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-white/70 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-text)]"
              >
                Read the related guide
              </Link>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/78 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">Best fit</div>
            <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">{useCase.audience}</p>

            <div className="mt-8 space-y-4">
              {useCase.outcomes.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-4 text-sm leading-6 text-[var(--shp-muted)]">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
            <div className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">
              <FileStack className="h-4 w-4" />
              Pages that matter
            </div>
            <ul className="space-y-3 text-sm leading-7 text-[var(--shp-muted)]">
              {useCase.keyPages.map((item) => (
                <li key={item} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
            <div className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">
              <BadgeCheck className="h-4 w-4" />
              Why Shpitto fits
            </div>
            <div className="space-y-4">
              {useCase.benefits.map((item) => (
                <div key={item.title} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-5 py-4">
                  <h2 className="text-lg font-bold text-[var(--shp-text)]">{item.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--shp-muted)]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-14 rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/76 p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
          <div className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">
            <MessageSquareMore className="h-4 w-4" />
            Common questions
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {useCase.faq.map((item) => (
              <div key={item.question} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-5 py-5">
                <h2 className="text-base font-bold text-[var(--shp-text)]">{item.question}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--shp-muted)]">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,240,237,0.96))] p-7 shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">Related guide</div>
          <h2 className="mt-3 text-2xl font-black text-[var(--shp-text)]">{useCase.relatedGuide.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--shp-muted)]">
            Read the matching article if you want a more tactical walkthrough for this export website scenario.
          </p>
          <Link href={`/blog/${useCase.relatedGuide.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--shp-primary)]">
            Open guide <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </section>
    </main>
  );
}
