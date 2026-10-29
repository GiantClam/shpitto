"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useProjectWorkspaceMeta, type ProjectWorkspaceSessionPayload } from "@/components/chat/project-workspace-context";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
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

const ANALYTICS_CACHE_KEY_PREFIX = "shpitto:project-analytics:";

type AnalyticsPayload = {
  status: "pending" | "active" | "degraded" | "not_configured";
  provider: string;
  siteTag?: string;
  syncedAt?: string | null;
  window: {
    startAt: string;
    endAt: string;
  };
  totals: {
    visits: number;
    pageViews: number;
    bounceRate: number | null;
    avgVisitDurationSeconds: number | null;
  };
  pages: Array<{ requestPath: string; visits: number; pageViews: number }>;
  sources: Array<{
    refererHost: string;
    refererPath: string;
    channel: "direct" | "search" | "social" | "referral";
    visits: number;
    pageViews: number;
  }>;
  channels: Array<{
    channel: "direct" | "search" | "social" | "referral";
    visits: number;
    pageViews: number;
  }>;
  capabilities: {
    hasBounceRate: boolean;
    hasAvgVisitDuration: boolean;
    hasPageViews: boolean;
  };
};

type AnalyticsResponse = {
  ok: boolean;
  project?: {
    id: string;
    name: string;
    latestDeploymentUrl?: string | null;
    deploymentHost?: string | null;
  };
  analytics?: AnalyticsPayload;
  warning?: string;
  error?: string;
};

type AnalyticsCacheEntry = {
  analytics: AnalyticsPayload | null;
  warning: string;
  projectHost: string;
  projectUrl: string;
};

function formatVersionLabel(updatedAt?: number): string {
  if (!updatedAt) return "v1.0.0";
  const d = new Date(updatedAt);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yy}.${mm}.${dd}`;
}

function numberText(value: number): string {
  return Intl.NumberFormat("en-US").format(Math.max(0, Number(value || 0)));
}

function percentText(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

function durationText(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "N/A";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function rangeToWindow(range: "7d" | "30d") {
  const now = new Date();
  const endAt = now.toISOString();
  const days = range === "30d" ? 30 : 7;
  const startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { startAt, endAt };
}

function statusTone(status: AnalyticsPayload["status"]): string {
  if (status === "active") return "text-[var(--shp-primary-pressed)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] border-[color-mix(in_oklab,var(--shp-primary)_34%,transparent)]";
  if (status === "degraded") return "text-amber-700 bg-amber-500/12 border-amber-400/35";
  if (status === "not_configured") return "text-rose-700 bg-rose-500/12 border-rose-400/30";
  return "text-[var(--shp-warm)] bg-[color-mix(in_oklab,var(--shp-secondary)_16%,var(--shp-surface)_84%)] border-[color-mix(in_oklab,var(--shp-secondary)_30%,transparent)]";
}

function analyticsCacheKey(projectId: string, range: "7d" | "30d") {
  return `${ANALYTICS_CACHE_KEY_PREFIX}${projectId}:${range}`;
}

function readAnalyticsCache(projectId: string, range: "7d" | "30d"): AnalyticsCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(analyticsCacheKey(projectId, range));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnalyticsCacheEntry;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      analytics: parsed.analytics || null,
      warning: String(parsed.warning || ""),
      projectHost: String(parsed.projectHost || ""),
      projectUrl: String(parsed.projectUrl || ""),
    };
  } catch {
    return null;
  }
}

function writeAnalyticsCache(projectId: string, range: "7d" | "30d", entry: AnalyticsCacheEntry) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(analyticsCacheKey(projectId, range), JSON.stringify(entry));
  } catch {
    // ignore cache write failures
  }
}

export function ProjectAnalyticsWorkspace({ projectId, locale = "en" }: { projectId: string; locale?: Locale }) {
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

  const [creatingProject, setCreatingProject] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const accountLabel = formatWorkspaceAccountLabel(userEmail, userId, workspaceCopy.guest);

  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState(() => readAnalyticsCache(projectId, "7d")?.warning || "");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(() => readAnalyticsCache(projectId, "7d")?.analytics || null);
  const [projectHost, setProjectHost] = useState(() => readAnalyticsCache(projectId, "7d")?.projectHost || "");
  const [projectUrl, setProjectUrl] = useState(() => readAnalyticsCache(projectId, "7d")?.projectUrl || "");

  useEffect(() => {
    const cached = readAnalyticsCache(projectId, range);
    if (!cached) return;
    setAnalytics(cached.analytics);
    setWarning(cached.warning);
    setProjectHost(cached.projectHost);
    setProjectUrl(cached.projectUrl);
  }, [projectId, range]);

  const fetchAnalytics = useCallback(async (options?: { refreshRemote?: boolean }) => {
    setLoading(true);
    setError("");
    setWarning("");
    const { startAt, endAt } = rangeToWindow(range);
    try {
      const params = new URLSearchParams({
        start: startAt,
        end: endAt,
        limit: "20",
      });
      if (options?.refreshRemote) {
        params.set("refresh", "1");
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/analysis?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AnalyticsResponse;
      if (!res.ok || !data.ok || !data.analytics) {
        throw new Error(data.error || "Failed to load analytics.");
      }
      setAnalytics(data.analytics);
      setProjectHost(String(data.project?.deploymentHost || "").trim());
      setProjectUrl(String(data.project?.latestDeploymentUrl || "").trim());
      const nextWarning = String(data.warning || "").trim();
      setWarning(nextWarning);
      writeAnalyticsCache(chatId, range, {
        analytics: data.analytics,
        warning: nextWarning,
        projectHost: String(data.project?.deploymentHost || "").trim(),
        projectUrl: String(data.project?.latestDeploymentUrl || "").trim(),
      });
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load analytics."));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [chatId, range]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

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
    router.push(`/projects/${encodeURIComponent(normalized)}/analysis`);
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: workspaceCopy.nav.chat, icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: workspaceCopy.nav.analytics, icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: true },
    { label: workspaceCopy.nav.assets, icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: workspaceCopy.nav.data, icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: workspaceCopy.nav.settings, icon: Settings, href: `/projects/${encodeURIComponent(chatId)}/settings`, active: false },
  ];

  const totals = analytics?.totals || {
    visits: 0,
    pageViews: 0,
    bounceRate: null,
    avgVisitDurationSeconds: null,
  };

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
                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} className={classes} title={sidebarCollapsed ? item.label : undefined}>
                      <item.icon className="h-5 w-5" />
                      {!sidebarCollapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                }
                return (
                  <button key={item.label} type="button" disabled className={classes} title={sidebarCollapsed ? item.label : undefined}>
                    <item.icon className="h-5 w-5" />
                    {!sidebarCollapsed ? <span>{item.label}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => void handleCreateProject()}
                disabled={creatingProject}
                className={[
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)] disabled:cursor-not-allowed disabled:opacity-60",
                  sidebarCollapsed ? "px-2" : "",
                ].join(" ")}
                title={workspaceCopy.newProject}
              >
                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!sidebarCollapsed ? <span>{workspaceCopy.newProject}</span> : null}
              </button>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-3 py-2",
                  sidebarCollapsed ? "justify-center px-2" : "",
                ].join(" ")}
                title={userEmail || userId || workspaceCopy.guest}
              >
                <User2 className="h-4 w-4 shrink-0 text-[var(--shp-muted)]" />
                {!sidebarCollapsed ? (
                  <span className="max-w-[190px] truncate text-sm text-[var(--shp-text)]">{accountLabel}</span>
                ) : null}
              </div>
              {userEmail ? (
                <SignOutButton
                  className={[
                    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_8%,var(--shp-surface)_92%)] hover:text-[var(--shp-primary)]",
                    sidebarCollapsed ? "px-2" : "",
                  ].join(" ")}
                  title={workspaceCopy.signOut}
                >
                  <LogOut className="h-4 w-4" />
                  {!sidebarCollapsed ? <span>{workspaceCopy.signOut}</span> : null}
                </SignOutButton>
              ) : null}
            </div>
          </aside>

          <section className="shp-shell h-[calc(100vh-120px)] min-h-[700px] overflow-auto rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] pb-5">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-[var(--shp-text)]">{workspaceCopy.analytics.title}</h2>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">
                  {projectHost ? `Host: ${projectHost}` : "No deployment host yet"}
                </p>
                {projectUrl ? (
                  <a
                    href={projectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--shp-primary)] hover:underline"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {workspaceCopy.analytics.openLiveSite}
                  </a>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRange("7d")}
                  className={[
                    "rounded-md border px-3 py-1.5 text-xs",
                    range === "7d"
                      ? "border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                      : "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] text-[var(--shp-muted)]",
                  ].join(" ")}
                >
                  {workspaceCopy.analytics.last7Days}
                </button>
                <button
                  type="button"
                  onClick={() => setRange("30d")}
                  className={[
                    "rounded-md border px-3 py-1.5 text-xs",
                    range === "30d"
                      ? "border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                      : "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] text-[var(--shp-muted)]",
                  ].join(" ")}
                >
                  {workspaceCopy.analytics.last30Days}
                </button>
                <button
                  type="button"
                  onClick={() => void fetchAnalytics({ refreshRemote: true })}
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-1.5 text-xs text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                >
                  {workspaceCopy.analytics.refresh}
                </button>
              </div>
            </div>

            {analytics ? (
              <div className="mt-4 flex items-center gap-2 text-xs">
                <span className={`inline-flex rounded-md border px-2 py-1 ${statusTone(analytics.status)}`}>
                  {analytics.status}
                </span>
                <span className="text-[var(--shp-muted)]">
                  Window: {new Date(analytics.window.startAt).toLocaleDateString()} - {new Date(analytics.window.endAt).toLocaleDateString()}
                </span>
                {analytics.syncedAt ? (
                  <span className="text-[var(--shp-muted)]">Synced: {new Date(analytics.syncedAt).toLocaleString()}</span>
                ) : null}
              </div>
            ) : null}

            {warning ? (
              <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                {warning}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-4 py-3 text-sm text-[var(--shp-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading analytics data...
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{workspaceCopy.analytics.visits}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(totals.visits)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{workspaceCopy.analytics.pageViews}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(totals.pageViews)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{workspaceCopy.analytics.bounceRate}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{percentText(totals.bounceRate)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">{workspaceCopy.analytics.avgDuration}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{durationText(totals.avgVisitDurationSeconds)}</p>
              </article>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <h3 className="text-base font-semibold text-[var(--shp-text)]">{workspaceCopy.analytics.topPages}</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                        <th className="py-2">Path</th>
                        <th className="py-2">{workspaceCopy.analytics.visits}</th>
                        <th className="py-2">{workspaceCopy.analytics.pageViews}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.pages || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-4 text-xs text-[var(--shp-muted)]">
                            No page-level data yet.
                          </td>
                        </tr>
                      ) : (
                        (analytics?.pages || []).map((row) => (
                          <tr key={row.requestPath} className="border-t border-[color-mix(in_oklab,var(--shp-border)_56%,transparent)]">
                            <td className="py-2 text-[var(--shp-text)]">{row.requestPath || "/"}</td>
                            <td className="py-2 text-[var(--shp-text)]">{numberText(row.visits)}</td>
                            <td className="py-2 text-[var(--shp-text)]">{numberText(row.pageViews)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <h3 className="text-base font-semibold text-[var(--shp-text)]">{workspaceCopy.analytics.trafficChannels}</h3>
                <div className="mt-3 space-y-2">
                  {(analytics?.channels || []).map((row) => {
                    const total = Math.max(1, totals.visits || 0);
                    const width = Math.max(4, Math.min(100, (row.visits / total) * 100));
                    return (
                      <div key={row.channel}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="capitalize text-[var(--shp-text)]">{row.channel}</span>
                          <span className="text-[var(--shp-muted)]">{numberText(row.visits)} visits</span>
                        </div>
                        <div className="h-2 rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)]">
                          <div
                            className="h-2 rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_72%,transparent)]"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </div>

            <article className="mt-6 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
              <h3 className="text-base font-semibold text-[var(--shp-text)]">Top Referrers</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                      <th className="py-2">Host</th>
                      <th className="py-2">Path</th>
                      <th className="py-2">Channel</th>
                      <th className="py-2">{workspaceCopy.analytics.visits}</th>
                      <th className="py-2">{workspaceCopy.analytics.pageViews}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.sources || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-xs text-[var(--shp-muted)]">
                          No source data yet.
                        </td>
                      </tr>
                    ) : (
                      (analytics?.sources || []).map((row, index) => (
                        <tr
                          key={`${row.refererHost || "direct"}-${row.refererPath || "-"}-${index}`}
                          className="border-t border-[color-mix(in_oklab,var(--shp-border)_56%,transparent)]"
                        >
                          <td className="py-2 text-[var(--shp-text)]">{row.refererHost || "(direct)"}</td>
                          <td className="py-2 text-[var(--shp-muted)]">{row.refererPath || "-"}</td>
                          <td className="py-2 capitalize text-[var(--shp-text)]">{row.channel}</td>
                          <td className="py-2 text-[var(--shp-text)]">{numberText(row.visits)}</td>
                          <td className="py-2 text-[var(--shp-text)]">{numberText(row.pageViews)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </section>
      </div>
    </main>
  );
}
