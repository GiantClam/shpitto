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

export default async function LandingPage() {
  const locale = await getServerLocale();
  const copy = getLandingCopy(locale);
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const isZh = locale === "zh";

  const audienceItems = isZh
    ? [
        {
          title: "开发者与 AI maker",
          body: "适合希望直接拿到完整 Next.js 代码、继续在自己的仓库里迭代的人。",
          href: "/launch-center?template=agent-launch-site",
        },
        {
          title: "独立创业者",
          body: "适合需要尽快上线营销站、等待名单页、定价页和产品说明页的个人创业者。",
          href: "/launch-center?template=indie-saas-starter",
        },
        {
          title: "小型 SaaS 与 B2B 团队",
          body: "适合需要模板化工作流、清晰交付边界和可部署基线的网站团队。",
          href: "/launch-center?template=b2b-lead-engine",
        },
      ]
    : [
        {
          title: "Developers and AI makers",
          body: "Best for teams that want the full Next.js codebase and plan to keep iterating in their own repo after launch.",
          href: "/launch-center?template=agent-launch-site",
        },
        {
          title: "Indie founders",
          body: "Best for solo builders shipping launch pages, waitlists, pricing, and product proof without rebuilding the stack.",
          href: "/launch-center?template=indie-saas-starter",
        },
        {
          title: "Small SaaS and B2B teams",
          body: "Best for teams that need template-driven workflows, stable delivery boundaries, and deployable website baselines.",
          href: "/launch-center?template=b2b-lead-engine",
        },
      ];

  const baselineItems = isZh
    ? ["首页 + 定价 + CTA", "共享导航与页脚", "内页与内容结构", "导出/部署就绪代码"]
    : ["Homepage + pricing + CTAs", "Shared navigation and footer", "Supporting routes and content structure", "Export and deploy-ready code"];

  const faqItems = isZh
    ? [
        {
          question: "这是一个通用聊天建站器吗？",
          answer: "不是。V1 的主路径是模板 + 结果型 Skill，而不是从空白 prompt 即兴生成整站。",
        },
        {
          question: "生成后能拿到完整代码吗？",
          answer: "可以。Shpitto V1 主打代码所有权，默认交付的是可运行、可导出、可部署的 Next.js 网站基线。",
        },
        {
          question: "默认执行链路是什么？",
          answer: "默认执行链路会走 OpenCode CLI，由 Shpitto 负责模板、工作流和交付边界。",
        },
        {
          question: "会默认带 CMS、鉴权和目录系统吗？",
          answer: "不会。这些复杂模块不属于 V1 的最小闭环，V1 先保证完整营销站基线跑通。",
        },
      ]
    : [
        {
          question: "Is this a generic chat-to-website builder?",
          answer: "No. The V1 path is template plus result-driven skill, not an improvisational blank-prompt site generator.",
        },
        {
          question: "Do I get the full codebase after generation?",
          answer: "Yes. Shpitto V1 is built around code ownership and delivers a runnable, exportable, deployable Next.js website baseline.",
        },
        {
          question: "What runs the default execution path?",
          answer: "The default execution path is OpenCode CLI, while Shpitto owns template selection, workflow contracts, and delivery boundaries.",
        },
        {
          question: "Does V1 include CMS, auth, or heavy catalog modules by default?",
          answer: "No. Those modules are outside the V1 minimal loop. V1 focuses on shipping a complete marketing website baseline first.",
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
              "Agent-native marketing website template platform with owned Next.js code, result-driven workflows, and an OpenCode CLI execution path.",
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
                {isZh ? "面向想更快交付可拥有代码的网站团队" : "Built for teams that want owned code and a faster launch path"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "V1 不再试图服务所有站型，而是聚焦营销站模板、结果型工作流和可部署交付。"
                  : "V1 stays focused on marketing-site templates, result-driven workflows, and deployable delivery instead of pretending to generate every website type from scratch."}
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
                    {isZh ? "进入模板入口" : "Open template path"} <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-10 rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] p-8 shadow-[var(--shp-shadow)]">
              <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                {isZh ? "V1 默认交付" : "What V1 Delivers"}
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                {baselineItems.map((item) => (
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
                {isZh ? "产品路径" : "Product Path"}
              </div>
              <h2 className="mb-5 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
                {isZh ? "先跑通最小闭环，再扩展后续能力" : "Run the minimal loop first, then expand from a real baseline"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "Shpitto 先解决模板选择、工作流执行、代码交付和部署闭环，再逐步扩展内容、SEO 和后续模块。"
                  : "Shpitto first solves template selection, workflow execution, code delivery, and deployability before expanding into content, SEO, and later modules."}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Link
                href="/launch-center"
                className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-8 shadow-[var(--shp-shadow)]"
              >
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                  {isZh ? "模板入口" : "Template Entry"}
                </div>
                <h3 className="text-2xl font-bold text-[var(--shp-text)]">
                  {isZh ? "从模板和工作流开始，而不是从空白输入开始" : "Start from template plus workflow, not a blank input box"}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">
                  {isZh
                    ? "选择官方模板基线，再交给匹配的 Skill 生成完整站点结构，这比重新生成 shared shell 更稳定。"
                    : "Choose an official template baseline and route it through the matching skill so the system generates a complete site structure instead of reinventing the shared shell every time."}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)]">
                  {isZh ? "打开 Launch Center" : "Open Launch Center"} <ArrowRight className="h-4 w-4" />
                </div>
              </Link>

              <Link
                href="/pricing"
                className="rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-8 shadow-[var(--shp-shadow)]"
              >
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--shp-primary)]">
                  {isZh ? "交付模式" : "Delivery Model"}
                </div>
                <h3 className="text-2xl font-bold text-[var(--shp-text)]">
                  {isZh ? "卖的是代码所有权和交付闭环，不是平台锁定" : "Sell code ownership and delivery, not hosted lock-in"}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--shp-muted)]">
                  {isZh
                    ? "V1 的核心价值是模板代码、结果型工作流和部署能力统一，而不是把用户继续锁在托管式 AI 建站叙事里。"
                    : "The V1 value is the alignment between template code, result-driven workflows, and deployment readiness instead of keeping users inside a hosted AI website-builder story."}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)]">
                  {isZh ? "查看产品模式" : "View the product model"} <ArrowRight className="h-4 w-4" />
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
                {isZh ? "关于 Shpitto V1 的常见问题" : "Common questions about Shpitto V1"}
              </h2>
              <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
                {isZh
                  ? "先把执行链路、模板交付和产品叙事说清楚，才能开始真实用户试用和销售验证。"
                  : "The V1 goal is to make the execution path, template delivery, and product narrative concrete enough for real trials and selling conversations."}
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
              <li><a href="#features" className="hover:text-[var(--shp-primary)]">{copy.footer.links.features}</a></li>
              <li><Link href="/pricing" className="hover:text-[var(--shp-primary)]">{copy.footer.links.pricing}</Link></li>
              <li><Link href="/launch-center" className="hover:text-[var(--shp-primary)]">Launch Center</Link></li>
              <li><Link href="/example-websites" className="hover:text-[var(--shp-primary)]">Template Directions</Link></li>
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
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.privacy}</a></li>
              <li><a href="#" className="hover:text-[var(--shp-primary)]">{copy.footer.links.terms}</a></li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-6 pt-6 md:flex-row md:items-center md:justify-between">
          <p>{copy.footer.copyright}</p>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--shp-muted)]">
            {isZh ? "模板代码 + Agent Skills + 可部署交付" : "Template code + agent skills + deployable delivery"}
          </p>
        </div>
      </footer>
    </div>
  );
}
