import { Zap, MessageSquare, LayoutTemplate } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";

export function EfficiencySection({ locale = "en" }: { locale?: Locale }) {
  const copy = getLandingCopy(locale).efficiency;
  return (
    <section id="features" className="overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--shp-bg)_96%,white_4%),color-mix(in_oklab,var(--shp-bg-soft)_92%,white_8%))] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="relative rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-2 shadow-[var(--shp-shadow)] transition-transform duration-500 lg:-rotate-2 lg:hover:rotate-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--shp-bg-soft)_92%,white_8%)]">
                <div className="absolute inset-y-0 left-0 flex w-1/3 flex-col gap-3 border-r border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_76%,transparent)] p-4">
                  <div className="h-2 w-3/4 rounded-full bg-[color-mix(in_oklab,var(--shp-muted)_55%,transparent)]"></div>
                  <div className="h-8 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)]"></div>
                  <div className="mt-auto h-16 w-full rounded-lg bg-[color-mix(in_oklab,var(--shp-surface-alt)_82%,transparent)]"></div>
                </div>

                <div className="absolute inset-y-0 right-0 w-2/3 bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                  <div className="mb-4 h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_12%,var(--shp-surface)_88%)]"></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-20 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface-alt)_88%,transparent)]"></div>
                    <div className="h-20 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface-alt)_88%,transparent)]"></div>
                  </div>
                </div>
              </div>

              <div className="absolute -right-6 bottom-8 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] text-[var(--shp-primary)]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-[var(--shp-muted)]">{copy.metricLabel}</div>
                    <div className="text-lg font-bold text-[var(--shp-text)]">{copy.metricValue}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
              {copy.badge}
            </div>
            <h2 className="mb-6 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
              {copy.title}
              <br />
              <span className="text-[var(--shp-primary)]">{copy.highlight}</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-[var(--shp-muted)]">
              {copy.body}
            </p>

            <div className="space-y-6">
              <div className="flex gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] text-[var(--shp-primary)]">
                <MessageSquare className="h-6 w-6" />
              </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-[var(--shp-text)]">{copy.features[0].title}</h3>
                  <p className="text-[var(--shp-muted)]">
                    {copy.features[0].description}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--shp-primary)_12%,transparent)] text-[var(--shp-primary)]">
                <LayoutTemplate className="h-6 w-6" />
              </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-[var(--shp-text)]">{copy.features[1].title}</h3>
                  <p className="text-[var(--shp-muted)]">
                    {copy.features[1].description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
