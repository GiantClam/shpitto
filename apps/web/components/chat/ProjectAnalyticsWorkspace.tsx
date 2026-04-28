"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
import { createClient } from "@/lib/supabase/client";

type SessionPayload = {
  id: string;
  title: string;
  updatedAt: number;
  archived?: boolean;
};

type SessionsResponse = {
  ok: boolean;
  sessions?: SessionPayload[];
  error?: string;
};

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

export function ProjectAnalyticsWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const chatId = projectId;

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("Current Project");
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>(undefined);
  const [projects, setProjects] = useState<SessionPayload[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [projectHost, setProjectHost] = useState("");
  const [projectUrl, setProjectUrl] = useState("");

  const fetchProjectMeta = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/chat/sessions?limit=200", { cache: "no-store" });
      const data = (await res.json()) as SessionsResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.sessions)) return;
      setProjects(data.sessions.filter((session) => !session.archived));
      const hit = data.sessions.find((session) => session.id === chatId);
      if (!hit) return;
      setProjectTitle(String(hit.title || "Current Project"));
      setProjectUpdatedAt(Number(hit.updatedAt || Date.now()));
    } catch {
      // best-effort metadata
    }
  }, [chatId, userId]);

  const fetchAnalytics = useCallback(async () => {
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
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/analysis?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AnalyticsResponse;
      if (!res.ok || !data.ok || !data.analytics) {
        throw new Error(data.error || "Failed to load analytics.");
      }
      setAnalytics(data.analytics);
      setProjectTitle(String(data.project?.name || projectTitle || "Current Project"));
      setProjectHost(String(data.project?.deploymentHost || "").trim());
      setProjectUrl(String(data.project?.latestDeploymentUrl || "").trim());
      setWarning(String(data.warning || "").trim());
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load analytics."));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [chatId, range, projectTitle]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(String(data.user?.email || "").trim());
      setUserId(String(data.user?.id || "").trim());
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(String(session?.user?.email || "").trim());
      setUserId(String(session?.user?.id || "").trim());
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    void fetchProjectMeta();
  }, [fetchProjectMeta]);

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
        body: JSON.stringify({ title: "New Project" }),
      });
      const data = (await res.json()) as { ok: boolean; session?: SessionPayload; error?: string };
      if (!res.ok || !data.ok || !data.session?.id) {
        throw new Error(data.error || "Failed to create project.");
      }
      await fetchProjectMeta();
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
    { label: "Chat", icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: "Analytics", icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: true },
    { label: "Assets", icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: "Data", icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: "Settings", icon: Settings, active: false },
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
              Back
            </button>
            <div className="ml-auto flex items-center">
              {projects.length === 0 ? (
                <span className="px-2 text-xs text-[var(--shp-muted)]">No projects</span>
              ) : (
                <label className="relative flex items-center">
                  <select
                    value={chatId}
                    onChange={(event) => handleProjectSelect(event.target.value)}
                    className="h-9 w-[220px] max-w-[42vw] appearance-none rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] px-3 pr-8 text-xs font-medium text-[var(--shp-text)] outline-none transition-colors focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] focus:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)]"
                    aria-label="Select project"
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
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                title="New project"
              >
                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!sidebarCollapsed ? <span>New Project</span> : null}
              </button>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-3 py-2",
                  sidebarCollapsed ? "justify-center px-2" : "",
                ].join(" ")}
                title={userEmail || "Guest"}
              >
                <User2 className="h-4 w-4 shrink-0 text-[var(--shp-muted)]" />
                {!sidebarCollapsed ? (
                  <span className="max-w-[190px] truncate text-sm text-[var(--shp-text)]">{userEmail || "Guest"}</span>
                ) : null}
              </div>
              {userEmail ? (
                <SignOutButton
                  className={[
                    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_8%,var(--shp-surface)_92%)] hover:text-[var(--shp-primary)]",
                    sidebarCollapsed ? "px-2" : "",
                  ].join(" ")}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  {!sidebarCollapsed ? <span>Sign out</span> : null}
                </SignOutButton>
              ) : null}
            </div>
          </aside>

          <section className="shp-shell h-[calc(100vh-120px)] min-h-[700px] overflow-auto rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] pb-5">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-[var(--shp-text)]">Project Analysis</h2>
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
                    Open Live Site
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
                  Last 7 days
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
                  Last 30 days
                </button>
                <button
                  type="button"
                  onClick={() => void fetchAnalytics()}
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-1.5 text-xs text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                >
                  Refresh
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
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Visits</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(totals.visits)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Page Views</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(totals.pageViews)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Bounce Rate</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{percentText(totals.bounceRate)}</p>
              </article>
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Avg Duration</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{durationText(totals.avgVisitDurationSeconds)}</p>
              </article>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                <h3 className="text-base font-semibold text-[var(--shp-text)]">Top Pages</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                        <th className="py-2">Path</th>
                        <th className="py-2">Visits</th>
                        <th className="py-2">Page Views</th>
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
                <h3 className="text-base font-semibold text-[var(--shp-text)]">Traffic Channels</h3>
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
                      <th className="py-2">Visits</th>
                      <th className="py-2">Page Views</th>
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
