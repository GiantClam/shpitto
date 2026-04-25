import { Zap, MessageSquare, LayoutTemplate } from "lucide-react";

export function EfficiencySection() {
  return (
    <section id="features" className="overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--shp-bg)_88%,#070707_12%),color-mix(in_oklab,var(--shp-bg-soft)_86%,#030303_14%))] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="relative rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_70%,transparent)] p-2 shadow-[var(--shp-shadow)] transition-transform duration-500 lg:-rotate-2 lg:hover:rotate-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--shp-bg-soft)_82%,black_18%)]">
                <div className="absolute inset-y-0 left-0 flex w-1/3 flex-col gap-3 border-r border-[color-mix(in_oklab,var(--shp-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] p-4">
                  <div className="h-2 w-3/4 rounded-full bg-[color-mix(in_oklab,var(--shp-muted)_65%,transparent)]"></div>
                  <div className="h-8 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)]"></div>
                  <div className="mt-auto h-16 w-full rounded-lg bg-[color-mix(in_oklab,var(--shp-surface-alt)_70%,transparent)]"></div>
                </div>

                <div className="absolute inset-y-0 right-0 w-2/3 bg-[color-mix(in_oklab,var(--shp-surface)_88%,#181818_12%)] p-4">
                  <div className="mb-4 h-32 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,var(--shp-surface)_84%)]"></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-20 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface-alt)_82%,transparent)]"></div>
                    <div className="h-20 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface-alt)_82%,transparent)]"></div>
                  </div>
                </div>
              </div>

              <div className="absolute -right-6 bottom-8 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,black_6%)] p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] text-[var(--shp-primary)]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-[var(--shp-muted)]">Generation Time</div>
                    <div className="text-lg font-bold text-[var(--shp-text)]">12 Seconds</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
              Efficiency First
            </div>
            <h2 className="mb-6 text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">
              No more blank pages.
              <br />
              <span className="text-[var(--shp-primary)]">Smart generation at your fingertips.</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-[var(--shp-muted)]">
              Traditional web development takes weeks. Shpitto cuts that down to minutes. Describe your business and get
              ready-to-ship structure, copy, imagery guidance, and deployment path.
            </p>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-primary-soft)]">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-[var(--shp-text)]">Understands Your Business Logic</h3>
                  <p className="text-[var(--shp-muted)]">
                    Not just generating text, but capturing industry terminology and business process context for precise,
                    trustworthy output.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] text-[var(--shp-primary)]">
                  <LayoutTemplate className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-[var(--shp-text)]">Automated Content Architecture</h3>
                  <p className="text-[var(--shp-muted)]">
                    Automatically composes Hero, product modules, proof blocks, and contact capture structure using practical SEO conventions.
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
