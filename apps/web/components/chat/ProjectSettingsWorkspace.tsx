"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { DomainBindingPromptCard } from "@/components/chat/project-domain-ui";
import { useProjectWorkspaceMeta, type ProjectWorkspaceSessionPayload } from "@/components/chat/project-workspace-context";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  Globe2,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  User2,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { formatWorkspaceAccountLabel, getProjectWorkspaceCopy } from "./project-workspace-copy";

function formatVersionLabel(updatedAt?: number): string {
  if (!updatedAt) return "v1.0.0";
  const d = new Date(updatedAt);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yy}.${mm}.${dd}`;
}

export function ProjectSettingsWorkspace({ projectId, locale = "en" }: { projectId: string; locale?: Locale }) {
  const router = useRouter();
  const workspaceCopy = getProjectWorkspaceCopy(locale);
  const chatId = projectId;
  const {
    userEmail,
    userId,
    projectTitle: sharedProjectTitle,
    projectUpdatedAt,
    projects,
    refreshProjectMeta,
  } = useProjectWorkspaceMeta();
  const projectTitle = sharedProjectTitle || workspaceCopy.currentProject;

  const settingsCopy =
    locale === "zh"
      ? {
          title: "项目设置",
          subtitle: "在这里管理项目绑定域名。支持新增域名、修改已绑定域名，以及删除不再使用的域名。",
          cardTitle: "域名绑定与 DNS 配置",
          cardSummary: "提交域名后，系统会直接展示对应 DNS 记录。你也可以在这里随时修改或删除已有绑定。",
          cardSteps: [
            "先填写你要绑定的域名并提交。",
            "如果要修改已有域名，先点“修改域名”，再保存新值。",
            "如果某个域名不再使用，可以直接删除绑定。",
          ],
        }
      : {
          title: "Project Settings",
          subtitle: "Manage your bound domains here. Add new domains, rename existing bindings, or remove domains you no longer use.",
          cardTitle: "Domain Binding and DNS Setup",
          cardSummary: "Submit a domain to see the exact DNS records right away. You can also update or remove existing bindings here at any time.",
          cardSteps: [
            "Enter the domain you want to bind and submit it first.",
            "To rename an existing domain, choose edit on that row and save the new value.",
            "If a domain is no longer needed, remove the binding directly from the list.",
          ],
        };

  const [creatingProject, setCreatingProject] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState("");
  const accountLabel = formatWorkspaceAccountLabel(userEmail, userId, workspaceCopy.guest);

  async function handleCreateProject() {
    if (creatingProject) return;
    setCreatingProject(true);
    setError("");
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: workspaceCopy.newProject }),
      });
      const data = (await res.json()) as { ok: boolean; session?: ProjectWorkspaceSessionPayload; error?: string };
      if (!res.ok || !data.ok || !data.session?.id) {
        throw new Error(data.error || "Failed to create project.");
      }
      await refreshProjectMeta();
      router.push(`/projects/${encodeURIComponent(data.session.id)}/chat`);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to create project."));
      setCreatingProject(false);
      return;
    }
    setCreatingProject(false);
  }

  function handleBackToPreviousPage() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/launch-center");
  }

  function handleProjectSelect(nextProjectId: string) {
    const normalized = String(nextProjectId || "").trim();
    if (!normalized || normalized === chatId) return;
    router.push(`/projects/${encodeURIComponent(normalized)}/settings`);
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: workspaceCopy.nav.chat, icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: workspaceCopy.nav.analytics, icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: workspaceCopy.nav.assets, icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: workspaceCopy.nav.data, icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: workspaceCopy.nav.settings, icon: Settings, href: `/projects/${encodeURIComponent(chatId)}/settings`, active: true },
  ];

  const cardMetadata = useMemo(
    () => ({
      locale,
      title: settingsCopy.cardTitle,
      summary: settingsCopy.cardSummary,
      steps: settingsCopy.cardSteps,
    }),
    [locale, settingsCopy.cardSteps, settingsCopy.cardSummary, settingsCopy.cardTitle],
  );

  return (
    <main className="chat-ui min-h-screen bg-[radial-gradient(720px_360px_at_10%_-5%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_70%),radial-gradient(760px_340px_at_90%_-15%,color-mix(in_oklab,var(--shp-warm)_14%,transparent),transparent_75%),linear-gradient(180deg,var(--shp-bg),var(--shp-bg-soft))] text-[var(--shp-text)]">
      <div className="mx-auto max-w-[1920px] px-5 py-5 sm:px-6 sm:py-6">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex shrink-0 cursor-default items-center gap-2 rounded-md px-1 py-1">
            <BrandLogo variant="mark" className="shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight text-[var(--shp-text)]">Shpitto Studio</h1>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-2 py-2">
            <button
              type="button"
              onClick={handleBackToPreviousPage}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:text-[var(--shp-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              {workspaceCopy.back}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher locale={locale} compact />
              {projects.length === 0 ? (
                <span className="px-2 text-xs text-[var(--shp-muted)]">{workspaceCopy.noProjects}</span>
              ) : (
                <label className="relative flex items-center">
                  <select
                    value={chatId}
                    onChange={(event) => handleProjectSelect(event.target.value)}
                    className="h-9 w-[220px] max-w-[42vw] appearance-none rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] px-3 pr-8 text-xs font-medium text-[var(--shp-text)] outline-none transition-colors focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] focus:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)]"
                    aria-label={workspaceCopy.selectProject}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                </label>
              )}
            </div>
          </nav>
        </header>

        <section className={`grid gap-4 ${sidebarCollapsed ? "xl:grid-cols-[88px_minmax(0,1fr)]" : "xl:grid-cols-[260px_minmax(0,1fr)]"}`}>
          <aside className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col rounded-xl p-4">
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_16%,var(--shp-surface)_84%)] text-[var(--shp-primary)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                {!sidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-[var(--shp-text)]">{projectTitle}</p>
                    <p className="text-xs text-[var(--shp-muted)]">{formatVersionLabel(projectUpdatedAt)}-stable</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] hover:text-[var(--shp-text)]"
                  title={sidebarCollapsed ? workspaceCopy.expandSidebar : workspaceCopy.collapseSidebar}
                  aria-label={sidebarCollapsed ? workspaceCopy.expandSidebar : workspaceCopy.collapseSidebar}
                >
                  {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {navItems.map((item) => {
                const classes = [
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-base",
                  sidebarCollapsed ? "justify-center px-2" : "",
                  item.active
                    ? "border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] text-[var(--shp-text)]"
                    : "border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] text-[var(--shp-muted)]",
                ].join(" ");
                return (
                  <Link key={item.label} href={item.href || "#"} className={classes} title={sidebarCollapsed ? item.label : undefined}>
                    <item.icon className="h-5 w-5" />
                    {!sidebarCollapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => void handleCreateProject()}
                disabled={creatingProject}
                className={[
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-60",
                  sidebarCollapsed ? "px-2" : "",
                ].join(" ")}
                title={workspaceCopy.newProject}
              >
                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!sidebarCollapsed ? <span>{workspaceCopy.newProject}</span> : null}
              </button>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_35%,transparent)] px-3 py-2",
                  sidebarCollapsed ? "justify-center px-2" : "",
                ].join(" ")}
                title={userEmail || userId || workspaceCopy.guest}
              >
                <User2 className="h-4 w-4 shrink-0 text-[var(--shp-muted)]" />
                {!sidebarCollapsed ? (
                  <span className="max-w-[190px] truncate text-sm text-[var(--shp-text)]">{accountLabel}</span>
                ) : null}
              </div>
              <SignOutButton
                className={[
                  "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:text-[var(--shp-primary)]",
                  sidebarCollapsed ? "px-2" : "",
                ].join(" ")}
              >
                <LogOut className="h-4 w-4" />
                {!sidebarCollapsed ? <span>{workspaceCopy.signOut}</span> : null}
              </SignOutButton>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="shp-shell rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_12%,var(--shp-surface)_88%)] text-[var(--shp-primary)]">
                  <Globe2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--shp-text)]">{settingsCopy.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--shp-muted)]">{settingsCopy.subtitle}</p>
                </div>
              </div>
              {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
            </div>

            <DomainBindingPromptCard projectId={projectId} metadata={cardMetadata} disabled={false} />
          </section>
        </section>
      </div>
    </main>
  );
}
