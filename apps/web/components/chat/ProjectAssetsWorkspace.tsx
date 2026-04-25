"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
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

type ProjectAsset = {
  id: string;
  key: string;
  name: string;
  source: "upload" | "chat_upload" | "generated";
  category: "image" | "code" | "document" | "other";
  status?: "published" | "modified" | "new";
  version?: string;
  path?: string;
  contentType: string;
  size: number;
  updatedAt: number;
  url: string;
  referenceText: string;
};

type AssetVersionInfo = {
  currentVersion?: string;
  publishedVersion?: string;
  versionCount?: number;
  updatedAt?: number;
  nextVersion?: string;
  hasUnpublishedChanges?: boolean;
};

type AssetResponse = {
  ok: boolean;
  assets?: ProjectAsset[];
  stats?: { totalFiles: number; totalBytes: number };
  versions?: AssetVersionInfo;
  r2Configured?: boolean;
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

function formatBytes(value: number): string {
  const size = Math.max(0, Number(value || 0));
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function sourceLabel(source: ProjectAsset["source"]) {
  if (source === "generated") return "Generated";
  if (source === "chat_upload") return "Chat Upload";
  return "Upload";
}

function categoryLabel(category: ProjectAsset["category"]) {
  if (category === "image") return "Image";
  if (category === "code") return "Code";
  if (category === "document") return "Document";
  return "Other";
}

function assetStatusLabel(status?: ProjectAsset["status"]) {
  if (status === "published") return "Published";
  if (status === "modified") return "Updated";
  return "New";
}

function assetStatusTone(status?: ProjectAsset["status"]) {
  if (status === "published") {
    return "border-emerald-400/45 bg-emerald-500/14 text-emerald-200";
  }
  if (status === "modified") {
    return "border-amber-400/45 bg-amber-500/14 text-amber-200";
  }
  return "border-sky-400/45 bg-sky-500/14 text-sky-200";
}

export function ProjectAssetsWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("Current Project");
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>(undefined);
  const [projects, setProjects] = useState<SessionPayload[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "image" | "code" | "document" | "other">("all");
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [r2Configured, setR2Configured] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ totalFiles: number; totalBytes: number }>({ totalFiles: 0, totalBytes: 0 });
  const [versionInfo, setVersionInfo] = useState<AssetVersionInfo>({});
  const [deletingKey, setDeletingKey] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropInputRef = useRef<HTMLInputElement | null>(null);

  const chatId = projectId;

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

  const fetchAssets = useCallback(async () => {
    if (!chatId.trim()) return;
    setLoadingAssets(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AssetResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load project assets.");
      }
      setAssets(Array.isArray(data.assets) ? data.assets : []);
      setStats(data.stats || { totalFiles: 0, totalBytes: 0 });
      setVersionInfo(data.versions || {});
      setR2Configured(data.r2Configured !== false);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load project assets."));
    } finally {
      setLoadingAssets(false);
    }
  }, [category, chatId, query]);

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
    void fetchAssets();
  }, [fetchAssets]);

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
    router.push(`/projects/${encodeURIComponent(normalized)}/assets`);
  }

  async function uploadFiles(fileList: FileList | File[], source: "upload" | "chat_upload" = "upload") {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("source", source);
      for (const file of files) {
        form.append("files", file, file.name);
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Upload failed.");
      }
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || "Upload failed."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (dropInputRef.current) dropInputRef.current.value = "";
    }
  }

  async function handleDeleteAsset(key: string) {
    const normalized = String(key || "").trim();
    if (!normalized) return;
    setDeletingKey(normalized);
    setError("");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: normalized }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Delete failed.");
      }
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || "Delete failed."));
    } finally {
      setDeletingKey("");
    }
  }

  function onDropZoneDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function onDropZoneDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  function onDropZoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    void uploadFiles(files, "upload");
  }

  async function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    await fetchAssets();
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: "Chat", icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: "Analytics", icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: "Assets", icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: true },
    { label: "Data", icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: "Settings", icon: Settings, active: false },
  ];

  return (
    <main className="chat-ui min-h-screen bg-[radial-gradient(720px_360px_at_10%_-5%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_70%),radial-gradient(760px_340px_at_90%_-15%,color-mix(in_oklab,var(--shp-warm)_14%,transparent),transparent_75%),linear-gradient(180deg,var(--shp-bg),#050505)] text-[var(--shp-text)]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            void uploadFiles(event.target.files, "upload");
          }
        }}
      />
      <input
        ref={dropInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            void uploadFiles(event.target.files, "upload");
          }
        }}
      />

      <div className="mx-auto max-w-[1920px] px-5 py-5 sm:px-6 sm:py-6">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex shrink-0 cursor-default items-center gap-2 rounded-md px-1 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--shp-primary)] text-sm font-black text-black">S</div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--shp-text)]">Shpitto Studio</h1>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] px-2 py-2">
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
                    className="h-9 w-[220px] max-w-[42vw] appearance-none rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_54%,black_46%)] px-3 pr-8 text-xs font-medium text-[var(--shp-text)] outline-none transition-colors focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] focus:bg-[color-mix(in_oklab,var(--shp-surface)_62%,black_38%)]"
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
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_48%,transparent)] p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] text-[var(--shp-primary)]">
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
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
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
                    ? "border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                    : "border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] text-[var(--shp-muted)]",
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
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-60",
                  sidebarCollapsed ? "px-2" : "",
                ].join(" ")}
                title="New project"
              >
                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!sidebarCollapsed ? <span>New Project</span> : null}
              </button>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_35%,transparent)] px-3 py-2",
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
                <Link
                  href="/auth/signout"
                  className={[
                    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] hover:text-[var(--shp-primary)]",
                    sidebarCollapsed ? "px-2" : "",
                  ].join(" ")}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  {!sidebarCollapsed ? <span>Sign out</span> : null}
                </Link>
              ) : null}
            </div>
          </aside>

          <section className="shp-shell h-[calc(100vh-120px)] min-h-[700px] overflow-auto rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] pb-5">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-[var(--shp-text)]">Project Assets</h2>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !r2Configured}
                className="shp-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload Files
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] p-1.5">
                {(["all", "image", "code", "document"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCategory(tab)}
                    className={[
                      "rounded-lg px-3 py-1.5 text-sm capitalize",
                      category === tab
                        ? "bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] text-[var(--shp-text)]"
                        : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                    ].join(" ")}
                  >
                    {tab === "all" ? "All" : tab === "image" ? "Images" : tab === "code" ? "Code" : "Documents"}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSearchSubmit} className="relative w-full max-w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search assets..."
                  className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_38%,transparent)] pl-9 pr-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                />
              </form>
            </div>

            {!r2Configured ? (
              <div className="mt-5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Cloudflare R2 is not configured. Set `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` before using assets.
              </div>
            ) : null}
            {error ? (
              <div className="mt-5 rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {loadingAssets ? (
                <div className="col-span-full flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] px-4 py-3 text-sm text-[var(--shp-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading assets...
                </div>
              ) : assets.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-8 text-center text-sm text-[var(--shp-muted)]">
                  No assets yet. Upload files or generate website files from chat.
                </div>
              ) : (
                assets.map((asset) => (
                  <article
                    key={asset.id}
                    className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-0.5 text-[11px] text-[var(--shp-muted)]">
                          {categoryLabel(asset.category)}
                        </div>
                        <div className={`rounded-md border px-2 py-0.5 text-[11px] ${assetStatusTone(asset.status)}`}>
                          {assetStatusLabel(asset.status)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAsset(asset.key)}
                        disabled={deletingKey === asset.key}
                        className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] p-1 text-[var(--shp-muted)] hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-60"
                        title="Delete asset"
                      >
                        {deletingKey === asset.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm font-medium text-[var(--shp-text)]">{asset.name}</p>
                    <p className="mt-1 text-xs text-[var(--shp-muted)]">
                      {formatBytes(asset.size)} • {sourceLabel(asset.source)}
                    </p>
                    {asset.version ? (
                      <p className="mt-1 text-[11px] text-[var(--shp-muted)]">Version {asset.version}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-[var(--shp-muted)]">
                      {new Date(asset.updatedAt).toLocaleString()}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)]"
                      >
                        Open
                      </a>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div
              onDragOver={onDropZoneDragOver}
              onDragLeave={onDropZoneDragLeave}
              onDrop={onDropZoneDrop}
              className={[
                "mt-8 rounded-2xl border border-dashed p-10 text-center transition-colors",
                dragActive
                  ? "border-[color-mix(in_oklab,var(--shp-primary)_52%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_24%,transparent)]",
              ].join(" ")}
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_45%,transparent)]">
                <Upload className="h-6 w-6 text-[var(--shp-primary)]" />
              </div>
              <p className="text-xl font-medium text-[var(--shp-text)]">Drop files to upload</p>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--shp-muted)]">
                Files are stored in Cloudflare R2 with automatic version snapshots. Chat always references your current editing version.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => dropInputRef.current?.click()}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_26%,transparent)]"
                >
                  Browse Files
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/projects/${encodeURIComponent(chatId)}/chat`)}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                >
                  Open Chat
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
