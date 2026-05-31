import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { Hero } from "@/components/landing/Hero";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { EfficiencySection } from "@/components/landing/EfficiencySection";
import { VisualQualitySection } from "@/components/landing/VisualQualitySection";
import { BlogSection } from "@/components/landing/BlogSection";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getLandingCopy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";
import { getFeaturedUseCases } from "@/lib/use-cases";

export default async function LandingPage() {
  const locale = await getServerLocale();
  const copy = getLandingCopy(locale);
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const isZh = locale === "zh";
  const featuredUseCases = getFeaturedUseCases();

  const audienceItems = isZh
    ? [
        {
          title: "制造企业",
          body: "适合需要更专业英文官网、产品展示和询盘入口的出海制造企业。",
          href: "/use-cases/manufacturers",
        },
        {
          title: "贸易公司",
          body: "适合需要清晰展示产品范围、供应能力和响应效率的外贸团队。",
          href: "/use-cases/trading-companies",
        },
        {
          title: "工业供应商",
          body: "适合需要按行业应用、材料能力和交付经验组织内容的供应商。",
          href: "/use-cases/industrial-suppliers",
        },
      ]
    : featuredUseCases.map((item) => ({
        title: item.shortLabel,
        body: item.audience,
        href: item.href,
      }));

  const pageItems = isZh
    ? ["首页与公司定位", "公司介绍与实力页", "产品与应用页面", "FAQ 与联系询盘页"]
    : ["Homepage and positioning", "About and company profile", "Product and application pages", "FAQ and contact pages"];

  const faqItems = isZh
    ? [
        {
          question: "适合做电商独立站吗？",
          answer: "当前首页定位更适合制造业、贸易公司和工业供应商的品牌官网与询盘型网站。",
        },
        {
          question: "生成后还可以继续修改吗？",
          answer: "可以。Shpitto 更适合持续迭代公司介绍、产品页面和行业内容，而不是一次性生成后就结束。",
        },
        {
          question: "支持多语言网站吗？",
          answer: "支持。你可以先用英文建立出口站内容，再逐步扩展到更多语言版本。",
        },
        {
          question: "对 SEO 有帮助吗？",
          answer: "首页与页面结构会更强调标题层级、产品内容、行业内容和询盘路径，帮助后续 SEO 优化。",
        },
      ]
    : [
        {
          question: "Is this built for ecommerce stores?",
          answer:
            "The current homepage positioning is stronger for manufacturers, trading companies, and industrial suppliers that need lead-generation and inquiry-focused websites.",
        },
        {
          question: "Can I keep editing pages after generation?",
          answer:
            "Yes. Shpitto is designed to help teams keep refining company pages, product pages, and industry content as the business evolves.",
        },
        {
          question: "Does it support multilingual websites?",
          answer: "Yes. You can start with English export content and expand into additional languages as you enter new markets.",
        },
        {
          question: "Does it help with SEO?",
          answer:
            "The positioning and page structure are designed to support clearer headings, product content, industry pages, and inquiry paths for ongoing SEO work.",
        },
      ];

  const homepageSchema = isZh
    ? null
    : {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "Shpitto",
            url: "https://shpitto.com/",
            description:
              "AI website builder for export B2B companies, built for manufacturers, trading companies, and industrial suppliers creating SEO-friendly company websites.",
          },
          {
            "@type": "FAQPage",
            mainEntity: faqItems.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
              },
            })),
          },
        ],
      };

  return (
    <div className="min-h-screen font-sans selection:bg-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)]">
      {homepageSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }} />
      ) : null}
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" locale={locale} />

      <main>
        <Hero ctaHref="/launch-center" locale={locale} />

        <section className="border-y border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_94%,white_6%)] py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
                {isZh ? "适合谁" : "Who It's For"}
              </div>
              <h2 className="mb-5 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
                {isZh ? "面向出海传统 B2B 企业的官网场景" : "Built for traditional B2B companies going global"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "首页叙事围绕海外买家、公司实力、产品能力和后续内容维护展开，而不是面向所有站型。"
                  : "The homepage narrative stays focused on overseas buyers, company credibility, product content, and ongoing website maintenance instead of trying to serve every site type."}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {audienceItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-7 shadow-[var(--shp-shadow)]"
                >
                  <h3 className="mb-3 text-xl font-bold text-[var(--shp-text)]">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--shp-muted)]">{item.body}</p>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)]">
                    {isZh ? "查看场景" : "Explore use case"} <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-10 rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] p-8 shadow-[var(--shp-shadow)]">
              <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                {isZh ? "可生成页面" : "Pages You Can Create"}
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                {pageItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-5 text-sm font-semibold text-[var(--shp-text)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <EfficiencySection locale={locale} />
        <VisualQualitySection locale={locale} />
        <BlogSection locale={locale} />

        <section className="border-t border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_95%,white_5%)] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
                {isZh ? "内容资源" : "Content Resources"}
              </div>
              <h2 className="mb-5 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
                {isZh ? "用样站和 AI 可读性说明补强首页定位" : "Support your positioning with examples and AI-readable structure"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "传统 B2B 企业通常会先看样站和内容结构逻辑，再决定是否进入生成流程。"
                  : "Traditional B2B teams often want sample website directions and clear content logic before they jump into generation."}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Link
                href="/example-websites"
                className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-8 shadow-[var(--shp-shadow)]"
              >
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                  {isZh ? "样站方向" : "Example Websites"}
                </div>
                <h3 className="text-2xl font-bold text-[var(--shp-text)]">
                  {isZh ? "按业务模型查看样站方向" : "See sample website directions by export business model"}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">
                  {isZh
                    ? "对照制造业、贸易公司和工业供应商的首页定位、产品页结构、应用页和询盘路径。"
                    : "Review homepage positioning, product page structure, application pages, and inquiry routes for manufacturers, trading companies, and industrial suppliers."}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)]">
                  {isZh ? "查看样站" : "View examples"} <ArrowRight className="h-4 w-4" />
                </div>
              </Link>

              <Link
                href="/ai-ready"
                className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-8 shadow-[var(--shp-shadow)]"
              >
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                  {isZh ? "AI 可读内容" : "AI-Ready Content"}
                </div>
                <h3 className="text-2xl font-bold text-[var(--shp-text)]">
                  {isZh ? "理解内容结构如何影响 SEO 和 AI 发现" : "Understand how content structure affects SEO and AI discovery"}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">
                  {isZh
                    ? "从公司页、产品页、应用页到 FAQ 和面包屑，查看哪些结构更容易被搜索引擎和 AI 系统理解。"
                    : "See how company pages, product pages, application pages, FAQs, and breadcrumb paths help search engines and AI systems understand your business."}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)]">
                  {isZh ? "查看说明" : "Read the guide"} <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_95%,white_5%)] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
                FAQ
              </div>
              <h2 className="mb-5 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
                {isZh ? "出海 B2B 官网常见问题" : "Common questions about export B2B websites"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "在传统企业决策路径里，先理解是否适合自己，再决定是否开始生成，比直接推自助建站更自然。"
                  : "Traditional B2B buyers usually want fit, clarity, and maintenance confidence before they commit to building. The homepage should answer those questions early."}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {faqItems.map((item) => (
                <div
                  key={item.question}
                  className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-8 shadow-[var(--shp-shadow)]"
                >
                  <h3 className="mb-3 text-xl font-bold text-[var(--shp-text)]">{item.question}</h3>
                  <p className="text-[var(--shp-muted)]">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_90%,white_10%)] py-32">
          <div className="absolute inset-0 bg-[radial-gradient(680px_320px_at_50%_20%,color-mix(in_oklab,var(--shp-primary)_16%,transparent),transparent_70%)]"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--shp-bg-soft)_96%,white_4%)] via-transparent to-transparent"></div>

          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
            <h2 className="mb-8 text-4xl font-bold tracking-tight text-[var(--shp-text)] lg:text-6xl">{copy.finalCta.title}</h2>
            <p className="mx-auto mb-12 max-w-2xl text-xl text-[var(--shp-muted)]">{copy.finalCta.body}</p>
            <Link href="/launch-center" className="shp-btn-primary inline-flex items-center gap-2 px-10 py-5 text-lg font-black">
              <Zap className="h-5 w-5 fill-current" />
              {copy.finalCta.button}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_92%,white_8%)] py-16 text-sm text-[var(--shp-muted)]">
        <div className="mx-auto mb-12 grid max-w-7xl gap-12 px-6 md:grid-cols-4">
          <div className="col-span-1">
            <BrandLogo variant="full" className="mb-6 shrink-0" />
            <p className="mb-6 leading-relaxed">{copy.footer.description}</p>
            <p className="mb-6 text-xs uppercase tracking-[0.16em] text-[var(--shp-muted)]">Operated by huangbei</p>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_86%,transparent)] hover:bg-[var(--shp-primary)] hover:text-white">
                X
              </div>
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_86%,transparent)] hover:bg-[var(--shp-primary)] hover:text-white">
                In
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">{copy.footer.product}</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.features}</a></li>
              <li><Link href="/pricing" className="hover:text-[var(--shp-primary)]">{copy.footer.links.pricing}</Link></li>
              <li><Link href="/example-websites" className="hover:text-[var(--shp-primary)]">Example Websites</Link></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.integrations}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">{copy.footer.resources}</h4>
            <ul className="space-y-4">
              <li><Link href="/blog" className="hover:text-[var(--shp-primary)]">{copy.footer.links.blog}</Link></li>
              <li><Link href="/use-cases" className="hover:text-[var(--shp-primary)]">Use Cases</Link></li>
              <li><Link href="/ai-ready" className="hover:text-[var(--shp-primary)]">AI-Ready Content</Link></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.helpCenter}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-6 font-bold text-[var(--shp-text)]">{copy.footer.company}</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.about}</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.careers}</a></li>
              <li><Link href="/legal/terms" className="hover:text-[var(--shp-primary)]">{copy.footer.links.legal}</Link></li>
              <li><a href="mailto:support@shpitto.com" className="hover:text-[var(--shp-primary)]">support@shpitto.com</a></li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-6 pt-8 md:flex-row">
          <div>{copy.footer.copyright}</div>
          <div className="flex gap-8">
            <Link href="/legal/privacy" className="hover:text-[var(--shp-text)]">{copy.footer.links.privacy}</Link>
            <Link href="/legal/terms" className="hover:text-[var(--shp-text)]">{copy.footer.links.terms}</Link>
            <Link href="/legal/acceptable-use" className="hover:text-[var(--shp-text)]">{copy.footer.links.acceptableUse}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
