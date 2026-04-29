import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";

type HeroProps = {
  ctaHref?: string;
  locale?: Locale;
};

export function Hero({ ctaHref = "/login", locale = "en" }: HeroProps) {
  const copy = getLandingCopy(locale).hero;
  const isZh = locale === "zh";
  const siteTypes = isZh
    ? ["个人 Blog", "企业官网", "AI 工具站"]
    : ["Personal Blog", "Company Site", "AI Tool Site"];
  const studioSteps = isZh
    ? ["生成", "预览", "部署", "看数据"]
    : ["Generate", "Preview", "Deploy", "Measure"];
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-32 text-[var(--shp-text)] lg:pb-40 lg:pt-48">
      <div className="absolute inset-0 z-0 opacity-25">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fc59531f_1px,transparent_1px),linear-gradient(to_bottom,#fc59531f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_62%_52%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[620px] w-[1040px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-primary)_30%,transparent),transparent_62%)] blur-[110px]"></div>
      <div className="pointer-events-none absolute right-[-180px] top-20 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-warm)_18%,transparent),transparent_70%)] blur-[90px]"></div>

      <div className="relative z-10 mx-auto max-w-7xl text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--shp-primary-soft)] backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--shp-secondary)] opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--shp-secondary)]"></span>
          </span>
          {copy.badge}
        </div>

        <h1 className="mb-8 text-5xl font-black leading-[0.95] tracking-tight lg:text-8xl">
          {copy.headline}
          <br />
          <span className="text-[var(--shp-primary)]">
            {copy.highlight}
          </span>
        </h1>

        <p className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-[var(--shp-muted)]">
          {copy.body}
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={ctaHref} className="shp-btn-primary group flex w-full items-center justify-center gap-2 px-8 py-4 text-lg font-black sm:w-auto">
            {copy.cta}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <button className="shp-btn-secondary flex w-full items-center justify-center gap-2 px-8 py-4 text-lg font-medium sm:w-auto">
            <PlayCircle className="h-5 w-5" />
            {copy.demo}
          </button>
        </div>

        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-8">
          {copy.stats.map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-2xl font-black text-[var(--shp-primary)]">{item.value}</div>
              <div className="text-sm text-[var(--shp-muted)]">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="absolute -inset-1 rounded-2xl bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--shp-primary)_34%,transparent),transparent_72%)] opacity-45 blur-md"></div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] shadow-[var(--shp-shadow)]">
            <div className="flex h-10 items-center gap-2 border-b border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_74%,white_26%)] px-4">
              <div className="h-3 w-3 rounded-full bg-rose-400/70"></div>
              <div className="h-3 w-3 rounded-full bg-amber-300/70"></div>
              <div className="h-3 w-3 rounded-full bg-emerald-300/70"></div>
              <div className="ml-4 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_82%,transparent)] px-3 py-1 font-mono text-[10px] text-[var(--shp-muted)]">
                shpitto-runtime-v3
              </div>
            </div>

            <div className="relative flex h-[calc(100%-2.5rem)]">
              <div className="hidden w-64 border-r border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_88%,white_12%)] p-4 text-left md:block">
                <div className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-[var(--shp-primary)]">
                  {isZh ? "网站类型" : "Site types"}
                </div>
                <div className="space-y-3">
                  {siteTypes.map((item, index) => (
                    <div
                      key={item}
                      className={[
                        "rounded-xl border px-3 py-2 text-xs font-bold",
                        index === 0
                          ? "border-[color-mix(in_oklab,var(--shp-primary)_48%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] text-[var(--shp-text)]"
                          : "border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_76%,transparent)] text-[var(--shp-muted)]",
                      ].join(" ")}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_72%,transparent)] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                    {isZh ? "项目资源" : "Assets"}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="h-10 rounded-lg bg-[color-mix(in_oklab,var(--shp-warm)_18%,var(--shp-surface)_82%)]"></div>
                    <div className="h-10 rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)]"></div>
                    <div className="h-10 rounded-lg bg-[color-mix(in_oklab,var(--shp-secondary)_18%,var(--shp-surface)_82%)]"></div>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[color-mix(in_oklab,var(--shp-bg-soft)_90%,white_10%)] p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_58%)]"></div>

                <div className="relative z-10 w-full max-w-2xl space-y-6">
                  <div className="flex h-12 items-center rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] px-4 font-mono text-sm text-[var(--shp-muted)]">
                    <span className="mr-2 text-[var(--shp-secondary)]">&gt;</span> {copy.promptPlaceholder}
                    <span className="ml-auto h-4 w-2 animate-pulse bg-[var(--shp-primary)]"></span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    {studioSteps.map((step, index) => (
                      <div
                        key={step}
                        className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_78%,transparent)] px-3 py-2 text-xs font-bold text-[var(--shp-text)]"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[10px] text-[var(--shp-primary)]">
                            {index + 1}
                          </span>
                          {step}
                        </div>
                        <div className="h-1.5 rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)]"></div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-4">
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--shp-surface)_86%,transparent),color-mix(in_oklab,var(--shp-warm)_12%,transparent))] p-3 text-left">
                      <div className="h-2 w-16 rounded-full bg-[var(--shp-primary)]"></div>
                      <div className="mt-8 h-3 w-20 rounded-full bg-[color-mix(in_oklab,var(--shp-text)_30%,transparent)]"></div>
                      <div className="mt-2 h-2 w-24 rounded-full bg-[color-mix(in_oklab,var(--shp-muted)_28%,transparent)]"></div>
                    </div>
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--shp-primary)_12%,var(--shp-surface)_88%),color-mix(in_oklab,var(--shp-surface)_92%,transparent))] p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-12 rounded-md bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)]"></div>
                        <div className="h-12 rounded-md bg-[color-mix(in_oklab,var(--shp-secondary)_18%,transparent)]"></div>
                      </div>
                      <div className="mt-3 h-3 rounded-full bg-[color-mix(in_oklab,var(--shp-text)_24%,transparent)]"></div>
                    </div>
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--shp-secondary)_12%,var(--shp-surface)_88%),color-mix(in_oklab,var(--shp-surface)_92%,transparent))] p-3">
                      <div className="ml-auto h-6 w-14 rounded-full bg-[color-mix(in_oklab,var(--shp-secondary)_22%,transparent)]"></div>
                      <div className="mt-8 h-2 rounded-full bg-[color-mix(in_oklab,var(--shp-muted)_30%,transparent)]"></div>
                      <div className="mt-2 h-2 w-2/3 rounded-full bg-[color-mix(in_oklab,var(--shp-muted)_24%,transparent)]"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
