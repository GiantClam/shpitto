import Link from "next/link";
import { Clock3, FolderKanban, LayoutTemplate, MessageCircle, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getLaunchCenterData } from "@/lib/launch-center/data";
import { createClient } from "@/lib/supabase/server";
import { LaunchCenterComposer } from "@/components/launch-center/LaunchCenterComposer";
import { getLandingCopy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export default async function LaunchCenterPage() {
  const locale = await getServerLocale();
  const copy = getLandingCopy(locale).launch;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = String(user?.id || "").trim();
  const userEmail = String(user?.email || "").trim();
  const draftHref = userEmail ? "/chat" : "/login";
  const { recentProjects, templateCards } = await getLaunchCenterData(userId);

  return (
    <div className="min-h-screen font-sans">
      <SiteHeader userEmail={userEmail} getStartedHref={draftHref} locale={locale} />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32">
        <section className="relative overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--shp-border)_82%,transparent)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--shp-bg-soft)_96%,var(--shp-primary)_4%),color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-border)_8%))] p-8 shadow-[var(--shp-shadow)] lg:p-12">
          <div className="pointer-events-none absolute -top-28 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-primary)_34%,transparent),transparent_70%)] blur-2xl"></div>
          <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--shp-warm)_24%,transparent),transparent_72%)] blur-3xl"></div>

          <div className="relative z-10 space-y-8">
            <div className="space-y-4 text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_12%,transparent)] px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--shp-primary-soft)]">
                <Sparkles className="h-3.5 w-3.5" />
                {copy.badge}
              </p>
              <h1 className="text-4xl font-black tracking-tight text-[var(--shp-text)] lg:text-6xl">{copy.title}</h1>
              <p className="mx-auto max-w-3xl text-base leading-relaxed text-[var(--shp-muted)] lg:text-lg">
                {copy.body}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <LaunchCenterComposer isAuthenticated={Boolean(userId)} locale={locale} />

              <div className="space-y-3">
                {[
                  {
                    ...copy.pillars[0],
                    icon: MessageCircle,
                  },
                  {
                    ...copy.pillars[1],
                    icon: FolderKanban,
                  },
                  {
                    ...copy.pillars[2],
                    icon: LayoutTemplate,
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-border)_6%)] p-4">
                    <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-primary)]">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--shp-text)]">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--shp-muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-6 flex items-center gap-2">
            <h2 className="text-2xl font-bold text-[var(--shp-text)]">{copy.recentProjects}</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{copy.activeDrafts}</span>
          </div>
          {recentProjects.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentProjects.map((project) => (
                <article
                  key={project.id}
                  className="group rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-border)_6%),color-mix(in_oklab,var(--shp-bg-soft)_96%,var(--shp-primary)_4%))] p-5 shadow-[var(--shp-shadow-soft)]"
                >
                  <div className="mb-4 h-36 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[radial-gradient(circle_at_15%_20%,color-mix(in_oklab,var(--shp-primary)_16%,transparent),transparent_52%),linear-gradient(150deg,color-mix(in_oklab,var(--shp-surface-alt)_88%,var(--shp-border)_12%),color-mix(in_oklab,var(--shp-bg)_96%,var(--shp-primary)_4%))]"></div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                    <Clock3 className="h-3.5 w-3.5" />
                    {project.ageLabel}
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--shp-text)] group-hover:text-[var(--shp-primary-soft)]">{project.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--shp-muted)]">{project.summary}</p>
                  <div className="mt-4">
                    <Link
                      href={userId ? `/projects/${encodeURIComponent(project.id)}/chat` : draftHref}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--shp-primary-soft)] hover:text-[var(--shp-primary)]"
                    >
                      {copy.openInStudio}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-border)_4%)] p-6 text-sm text-[var(--shp-muted)]">
              {copy.emptyRecent}
            </div>
          )}
        </section>

        <section className="mt-14">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-[var(--shp-text)]">{copy.recommendedTemplates}</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{copy.curatedStyles}</span>
            </div>
            <Link href={draftHref} className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--shp-primary-soft)] hover:text-[var(--shp-primary)]">
              {copy.browseAll}
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {templateCards.map((template, index) => (
              <article
                key={template.name}
                className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_95%,var(--shp-border)_5%)] p-4"
              >
                <div
                  className={[
                    "mb-4 h-48 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)]",
                    index % 4 === 0 &&
                      "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-text)_28%),color-mix(in_oklab,var(--shp-bg-soft)_94%,var(--shp-border)_6%))]",
                    index % 4 === 1 &&
                      "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--shp-secondary)_24%,var(--shp-text)_24%),color-mix(in_oklab,var(--shp-bg)_96%,var(--shp-border)_4%))]",
                    index % 4 === 2 &&
                      "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--shp-warm)_24%,var(--shp-text)_24%),color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-border)_4%))]",
                    index % 4 === 3 &&
                      "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--shp-primary-soft)_18%,var(--shp-text)_28%),color-mix(in_oklab,var(--shp-bg-soft)_94%,var(--shp-border)_6%))]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">{template.tag}</p>
                <h3 className="mt-1 text-base font-semibold text-[var(--shp-text)]">{template.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--shp-muted)]">{template.tone}</p>
                <div className="mt-4">
                  <a
                    href={template.sourceUrl || draftHref}
                    target={template.sourceUrl ? "_blank" : undefined}
                    rel={template.sourceUrl ? "noreferrer" : undefined}
                    className="inline-flex items-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--shp-primary-soft)] hover:text-[var(--shp-primary)]"
                  >
                    {copy.useTemplate}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
