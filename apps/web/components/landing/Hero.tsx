import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";

type HeroProps = {
  ctaHref?: string;
};

export function Hero({ ctaHref = "/login" }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-32 text-[var(--shp-text)] lg:pb-40 lg:pt-48">
      <div className="absolute inset-0 z-0 opacity-25">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1ed76026_1px,transparent_1px),linear-gradient(to_bottom,#1ed76026_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_62%_52%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[620px] w-[1040px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-primary)_30%,transparent),transparent_62%)] blur-[110px]"></div>
      <div className="pointer-events-none absolute right-[-180px] top-20 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-warm)_18%,transparent),transparent_70%)] blur-[90px]"></div>

      <div className="relative z-10 mx-auto max-w-7xl text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--shp-primary-soft)] backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--shp-secondary)] opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--shp-secondary)]"></span>
          </span>
          12-Second Generation Engine
        </div>

        <h1 className="mb-8 text-5xl font-black leading-[0.95] tracking-tight lg:text-8xl">
          Build websites
          <br />
          <span className="text-[var(--shp-primary)]">
            at the speed of thought.
          </span>
        </h1>

        <p className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-[var(--shp-muted)]">
          Shpitto turns natural language into production-grade industrial websites with clean structure, conversion-focused copy,
          and deploy-ready pages.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={ctaHref} className="shp-btn-primary group flex w-full items-center justify-center gap-2 px-8 py-4 text-lg font-black sm:w-auto">
            Start Building Free
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <button className="shp-btn-secondary flex w-full items-center justify-center gap-2 px-8 py-4 text-lg font-medium sm:w-auto">
            <PlayCircle className="h-5 w-5" />
            Watch Demo
          </button>
        </div>

        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-8">
          {[
            { value: "10,000+", label: "Sites generated" },
            { value: "12s", label: "Avg build time" },
            { value: "4.9/5", label: "User rating" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-2xl font-black text-[var(--shp-primary)]">{item.value}</div>
              <div className="text-sm text-[var(--shp-muted)]">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="absolute -inset-1 rounded-2xl bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--shp-primary)_40%,transparent),transparent_70%)] opacity-50 blur-md"></div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_86%,black_14%)] shadow-[var(--shp-shadow)]">
            <div className="flex h-10 items-center gap-2 border-b border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_72%,transparent)] px-4">
              <div className="h-3 w-3 rounded-full bg-rose-400/70"></div>
              <div className="h-3 w-3 rounded-full bg-amber-300/70"></div>
              <div className="h-3 w-3 rounded-full bg-emerald-300/70"></div>
              <div className="ml-4 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_64%,transparent)] px-3 py-1 font-mono text-[10px] text-[var(--shp-muted)]">
                shpitto-runtime-v3
              </div>
            </div>

            <div className="relative flex h-[calc(100%-2.5rem)]">
              <div className="hidden w-64 border-r border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_75%,transparent)] p-4 md:block">
                <div className="mb-6 h-8 w-24 animate-pulse rounded bg-[color-mix(in_oklab,var(--shp-surface)_70%,transparent)]"></div>
                <div className="space-y-3">
                  <div className="h-4 w-full rounded bg-[color-mix(in_oklab,var(--shp-surface)_68%,transparent)]"></div>
                  <div className="h-4 w-3/4 rounded bg-[color-mix(in_oklab,var(--shp-surface)_68%,transparent)]"></div>
                  <div className="h-4 w-5/6 rounded bg-[color-mix(in_oklab,var(--shp-surface)_68%,transparent)]"></div>
                </div>
              </div>

              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[color-mix(in_oklab,var(--shp-bg-soft)_92%,#050505_8%)] p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklab,var(--shp-primary)_18%,transparent),transparent_55%)]"></div>

                <div className="relative z-10 w-full max-w-2xl space-y-6">
                  <div className="flex h-12 items-center rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_68%,transparent)] px-4 font-mono text-sm text-[var(--shp-muted)]">
                    <span className="mr-2 text-[var(--shp-secondary)]">&gt;</span> Describe your industrial website...
                    <span className="ml-auto h-4 w-2 animate-pulse bg-[var(--shp-primary)]"></span>
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-4 opacity-70">
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_62%,transparent)]"></div>
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)]"></div>
                    <div className="h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_62%,transparent)]"></div>
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
