import { ArrowUpRight, BarChart3, FolderKanban, MousePointer2, PanelsTopLeft } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";

export function VisualQualitySection({ locale = "en" }: { locale?: Locale }) {
  const copy = getLandingCopy(locale).quality;
  const features = [
    {
      ...copy.features[0],
      icon: <PanelsTopLeft className="h-6 w-6 text-[var(--shp-primary)]" />,
      colSpan: "md:col-span-2",
      bg: "from-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] to-[color-mix(in_oklab,var(--shp-surface)_82%,transparent)]",
    },
    {
      ...copy.features[1],
      icon: <FolderKanban className="h-6 w-6 text-[var(--shp-primary)]" />,
      colSpan: "md:col-span-1",
      bg: "from-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] to-[color-mix(in_oklab,var(--shp-surface)_82%,transparent)]",
    },
    {
      ...copy.features[2],
      icon: <BarChart3 className="h-6 w-6 text-[var(--shp-warm)]" />,
      colSpan: "md:col-span-1",
      bg: "from-[color-mix(in_oklab,var(--shp-warm)_20%,transparent)] to-[color-mix(in_oklab,var(--shp-surface)_82%,transparent)]",
    },
    {
      ...copy.features[3],
      icon: <MousePointer2 className="h-6 w-6 text-[var(--shp-secondary)]" />,
      colSpan: "md:col-span-2",
      bg: "from-[color-mix(in_oklab,var(--shp-secondary)_24%,transparent)] to-[color-mix(in_oklab,var(--shp-surface)_82%,transparent)]",
    },
  ];

  return (
    <section id="showcase" className="relative bg-[color-mix(in_oklab,var(--shp-bg)_95%,white_5%)] py-32">
      <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--shp-primary)_28%,transparent)] to-transparent"></div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-20 max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary-soft)]">
            {copy.badge}
          </div>
          <h2 className="mb-6 text-4xl font-bold tracking-tight text-[var(--shp-text)] lg:text-5xl">{copy.title}</h2>
          <p className="text-lg leading-relaxed text-[var(--shp-muted)]">
            {copy.body}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((item, i) => (
            <div
              key={i}
              className={`${item.colSpan} group relative overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] transition-all duration-500 hover:border-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)]`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${item.bg} opacity-24 transition-opacity group-hover:opacity-38`}></div>
              <div className="absolute inset-0 -z-10 backdrop-blur-3xl"></div>

              <div className="relative flex min-h-[240px] h-full flex-col justify-between p-8">
                <div className="mb-8">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_84%,transparent)] transition-transform duration-500 group-hover:scale-110">
                    {item.icon}
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-[var(--shp-text)]">{item.title}</h3>
                  <p className="text-lg leading-relaxed text-[var(--shp-muted)]">{item.description}</p>
                </div>

                <div className="flex items-center gap-2 text-sm font-bold text-[color-mix(in_oklab,var(--shp-text)_56%,transparent)] transition-colors group-hover:text-[var(--shp-text)]">
                  {copy.learnMore} <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
