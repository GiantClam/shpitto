"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  LifeBuoy,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Search,
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

type ContactSubmissionItem = {
  id: string;
  project_id: string;
  site_key: string;
  submission_json: string;
  visitor_ip: string | null;
  user_agent: string | null;
  origin: string | null;
  referer: string | null;
  created_at: string;
  submission?: unknown;
};

type ContactSubmissionsResponse = {
  ok: boolean;
  items?: ContactSubmissionItem[];
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

type DataTab = "inquiries" | "website_support";

type InquiryStatus = "new" | "pending" | "closed";

type InquiryRow = {
  id: string;
  createdAt: string;
  customerName: string;
  email: string;
  subject: string;
  message: string;
  status: InquiryStatus;
  siteKey: string;
  visitorIp: string;
  userAgent: string;
  referer: string;
  rawSubmission: Record<string, unknown>;
};

function formatVersionLabel(updatedAt?: number): string {
  if (!updatedAt) return "v1.0.0";
  const d = new Date(updatedAt);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yy}.${mm}.${dd}`;
}

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleString();
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

function normalizeSpaces(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toTextValue(value: unknown) {
  if (typeof value === "string") return normalizeSpaces(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function pickRecordValue(record: Record<string, unknown>, keys: string[]): string {
  if (!record || typeof record !== "object") return "";
  for (const key of keys) {
    const value = toTextValue(record[key]);
    if (value) return value;
  }

  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lowered.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const value = toTextValue(lowered.get(key.toLowerCase()));
    if (value) return value;
  }

  return "";
}

function normalizeStatus(value: string): InquiryStatus {
  const status = String(value || "").trim().toLowerCase();
  if (status === "closed" || status === "done" || status === "resolved") return "closed";
  if (status === "pending" || status === "open" || status === "processing") return "pending";
  return "new";
}

function fallbackNameFromEmail(email: string) {
  const local = String(email || "").split("@")[0] || "";
  const cleaned = normalizeSpaces(local.replace(/[._-]+/g, " "));
  return cleaned || "Anonymous";
}

function toInquiryRow(item: ContactSubmissionItem): InquiryRow {
  const submission = toRecord(item.submission);
  const firstName = pickRecordValue(submission, ["firstName", "firstname", "first_name", "givenName"]);
  const lastName = pickRecordValue(submission, ["lastName", "lastname", "last_name", "familyName"]);
  const fullName =
    pickRecordValue(submission, ["name", "fullName", "customerName", "contactName", "username"]) ||
    normalizeSpaces(`${firstName} ${lastName}`);
  const email = pickRecordValue(submission, ["email", "mail", "contactEmail"]);
  const message =
    pickRecordValue(submission, ["message", "content", "details", "description", "inquiry", "requirements"]) ||
    "";
  const subject =
    pickRecordValue(submission, ["subject", "topic", "title", "reason"]) ||
    (message ? message.slice(0, 78) : "Website inquiry");
  const status = normalizeStatus(pickRecordValue(submission, ["status", "state"]));
  const customerName = fullName || fallbackNameFromEmail(email);

  return {
    id: String(item.id || ""),
    createdAt: String(item.created_at || ""),
    customerName,
    email: email || "-",
    subject: normalizeSpaces(subject),
    message: normalizeSpaces(message),
    status,
    siteKey: String(item.site_key || ""),
    visitorIp: String(item.visitor_ip || ""),
    userAgent: String(item.user_agent || ""),
    referer: String(item.referer || ""),
    rawSubmission: submission,
  };
}

function inquiryStatusTone(status: InquiryStatus) {
  if (status === "closed") return "border-slate-400/40 bg-slate-500/14 text-slate-200";
  if (status === "pending") return "border-amber-400/40 bg-amber-500/14 text-amber-200";
  return "border-emerald-400/40 bg-emerald-500/14 text-emerald-200";
}

function inquiryStatusText(status: InquiryStatus) {
  if (status === "closed") return "Closed";
  if (status === "pending") return "Pending";
  return "New";
}

function sanitizeCsvCellValue(text: string): string {
  const trimmedStart = text.trimStart();
  if (!trimmedStart) return text;
  const first = trimmedStart[0];
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `'${text}`;
  }
  return text;
}

function csvCell(value: unknown): string {
  const text = sanitizeCsvCellValue(String(value ?? "")).replace(/"/g, '""');
  return `"${text}"`;
}

function buildInquiryCsv(rows: InquiryRow[]): string {
  const header = [
    "Date",
    "Customer Name",
    "Email Address",
    "Subject",
    "Message",
    "Status",
    "Site Key",
    "Visitor IP",
    "Referer",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        formatDateTimeLabel(row.createdAt),
        row.customerName || "Anonymous",
        row.email || "-",
        row.subject || "Website inquiry",
        row.message || "",
        inquiryStatusText(row.status),
        row.siteKey || "",
        row.visitorIp || "",
        row.referer || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

function inquiryMatchesQuery(row: InquiryRow, keyword: string): boolean {
  const query = String(keyword || "").trim().toLowerCase();
  if (!query) return true;
  const hay = `${row.customerName} ${row.email} ${row.subject} ${row.message}`.toLowerCase();
  return hay.includes(query);
}

export function ProjectDataWorkspace({ projectId }: { projectId: string }) {
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

  const [activeTab, setActiveTab] = useState<DataTab>("inquiries");
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [search, setSearch] = useState("");
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [supportRange, setSupportRange] = useState<"7d" | "30d">("7d");
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportWarning, setSupportWarning] = useState("");
  const [supportAnalytics, setSupportAnalytics] = useState<AnalyticsPayload | null>(null);
  const [supportHost, setSupportHost] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportNotice, setExportNotice] = useState("");

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

  const fetchInquiries = useCallback(async () => {
    if (!chatId.trim()) return;
    setLoadingInquiries(true);
    setInquiryError("");
    try {
      const params = new URLSearchParams({
        limit: "200",
        projectId: chatId,
      });
      const res = await fetch(`/api/contact/submissions?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as ContactSubmissionsResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load inquiry data.");
      }
      const nextRows = Array.isArray(data.items) ? data.items.map((item) => toInquiryRow(item)) : [];
      setInquiries(nextRows);
      setSelectedInquiryId((prev) => {
        if (nextRows.length === 0) return "";
        if (prev && nextRows.some((row) => row.id === prev)) return prev;
        return nextRows[0].id;
      });
    } catch (err: any) {
      setInquiryError(String(err?.message || err || "Failed to load inquiry data."));
      setInquiries([]);
      setSelectedInquiryId("");
    } finally {
      setLoadingInquiries(false);
    }
  }, [chatId]);

  const fetchSupportData = useCallback(async () => {
    if (!chatId.trim()) return;
    setLoadingSupport(true);
    setSupportError("");
    setSupportWarning("");
    try {
      const { startAt, endAt } = rangeToWindow(supportRange);
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
        throw new Error(data.error || "Failed to load website support data.");
      }
      setSupportAnalytics(data.analytics);
      setSupportHost(String(data.project?.deploymentHost || "").trim());
      setSupportUrl(String(data.project?.latestDeploymentUrl || "").trim());
      setSupportWarning(String(data.warning || "").trim());
    } catch (err: any) {
      setSupportError(String(err?.message || err || "Failed to load website support data."));
      setSupportAnalytics(null);
    } finally {
      setLoadingSupport(false);
    }
  }, [chatId, supportRange]);

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
    if (activeTab !== "inquiries") return;
    void fetchInquiries();
  }, [activeTab, fetchInquiries]);

  useEffect(() => {
    if (activeTab !== "website_support") return;
    void fetchSupportData();
  }, [activeTab, fetchSupportData]);

  const filteredInquiries = useMemo(() => {
    const keyword = String(search || "").trim();
    if (!keyword) return inquiries;
    return inquiries.filter((item) => inquiryMatchesQuery(item, keyword));
  }, [inquiries, search]);

  const selectedInquiry = useMemo(() => {
    const found = filteredInquiries.find((item) => item.id === selectedInquiryId);
    if (found) return found;
    return filteredInquiries[0] || null;
  }, [filteredInquiries, selectedInquiryId]);

  const supportTotals = supportAnalytics?.totals || {
    visits: 0,
    pageViews: 0,
    bounceRate: null,
    avgVisitDurationSeconds: null,
  };

  const fetchInquiryBatchForExport = useCallback(
    async (limit: number, offset: number) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        projectId: chatId,
      });
      const res = await fetch(`/api/contact/submissions?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as ContactSubmissionsResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load inquiry export data.");
      }
      const rows = Array.isArray(data.items) ? data.items.map((item) => toInquiryRow(item)) : [];
      return rows;
    },
    [chatId],
  );

  const handleExportInquiriesCsv = useCallback(async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    setExportNotice("");

    const pageSize = 100;
    const maxRows = 2000;
    let offset = 0;
    let fetchedRawCount = 0;
    const exportedRows: InquiryRow[] = [];
    const keyword = String(search || "").trim();

    try {
      for (;;) {
        setExportNotice(`Exporting... fetched ${fetchedRawCount} rows`);
        const batch = await fetchInquiryBatchForExport(pageSize, offset);
        if (batch.length === 0) break;

        fetchedRawCount += batch.length;
        exportedRows.push(...batch.filter((item) => inquiryMatchesQuery(item, keyword)));

        if (batch.length < pageSize) break;
        if (fetchedRawCount >= maxRows) {
          setExportNotice(`Reached ${maxRows}+ rows cap. Exported first ${maxRows} rows scope.`);
          break;
        }
        offset += pageSize;
      }

      if (exportedRows.length === 0) {
        setExportNotice("No rows matched current filter.");
        return;
      }

      const csv = buildInquiryCsv(exportedRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const datePart = new Date().toISOString().slice(0, 10);
      const filename = `${projectTitle.replace(/\s+/g, "-").toLowerCase() || "project"}-inquiries-${datePart}.csv`;

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportNotice(`CSV exported: ${exportedRows.length} rows`);
    } catch (err: any) {
      setExportNotice(String(err?.message || err || "CSV export failed."));
    } finally {
      setExportingCsv(false);
    }
  }, [exportingCsv, fetchInquiryBatchForExport, projectTitle, search]);

  useEffect(() => {
    if (selectedInquiry && selectedInquiry.id !== selectedInquiryId) {
      setSelectedInquiryId(selectedInquiry.id);
      return;
    }
    if (filteredInquiries.length === 0 && selectedInquiryId) {
      setSelectedInquiryId("");
    }
  }, [filteredInquiries, selectedInquiry, selectedInquiryId]);

  async function handleCreateProject() {
    if (creatingProject) return;
    setCreatingProject(true);
    setInquiryError("");
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
      setInquiryError(String(err?.message || err || "Failed to create project."));
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
    router.push(`/projects/${encodeURIComponent(normalized)}/data`);
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: "Chat", icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: "Analytics", icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: "Assets", icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: "Data", icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: true },
    { label: "Settings", icon: Settings, active: false },
  ];

  return (
    <main className="chat-ui min-h-screen bg-[radial-gradient(720px_360px_at_10%_-5%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_70%),radial-gradient(760px_340px_at_90%_-15%,color-mix(in_oklab,var(--shp-warm)_14%,transparent),transparent_75%),linear-gradient(180deg,var(--shp-bg),#050505)] text-[var(--shp-text)]">
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
                <SignOutButton
                  className={[
                    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] hover:text-[var(--shp-primary)]",
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
                <h2 className="text-4xl font-semibold tracking-tight text-[var(--shp-text)]">Project Data Hub</h2>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">
                  Central Repository - {projectTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (activeTab === "inquiries") {
                    void fetchInquiries();
                    return;
                  }
                  void fetchSupportData();
                }}
                disabled={activeTab === "inquiries" ? loadingInquiries : loadingSupport}
                className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {activeTab === "inquiries"
                  ? loadingInquiries
                    ? "Syncing..."
                    : "Sync Now"
                  : loadingSupport
                    ? "Syncing..."
                    : "Sync Now"}
              </button>
            </div>

            <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] p-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("inquiries")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                  activeTab === "inquiries"
                    ? "bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] text-[var(--shp-text)]"
                    : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                ].join(" ")}
              >
                <MessageSquare className="h-4 w-4" />
                Inquiries
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-1.5 text-xs">
                  {inquiries.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("website_support")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                  activeTab === "website_support"
                    ? "bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] text-[var(--shp-text)]"
                    : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                ].join(" ")}
              >
                <LifeBuoy className="h-4 w-4" />
                Website Support
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-1.5 text-xs">
                  {numberText(supportTotals.visits)}
                </span>
              </button>
            </div>

            {activeTab === "inquiries" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-2xl font-semibold text-[var(--shp-text)]">Form Submissions</h3>
                    <div className="flex w-full max-w-[560px] items-center gap-2">
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search inquiries..."
                          className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] pl-9 pr-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleExportInquiriesCsv()}
                        disabled={loadingInquiries || exportingCsv}
                        className="shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {exportingCsv ? "Exporting..." : "Export CSV"}
                      </button>
                    </div>
                  </div>
                  {exportNotice ? (
                    <div className="mt-3 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] px-3 py-2 text-xs text-[var(--shp-muted)]">
                      {exportNotice}
                    </div>
                  ) : null}

                  {inquiryError ? (
                    <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {inquiryError}
                    </div>
                  ) : null}

                  {loadingInquiries ? (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading inquiry data...
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                          <th className="py-2">Date</th>
                          <th className="py-2">Customer Name</th>
                          <th className="py-2">Email Address</th>
                          <th className="py-2">Subject</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInquiries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-sm text-[var(--shp-muted)]">
                              {search ? "No matching inquiries found." : "No inquiry submissions yet."}
                            </td>
                          </tr>
                        ) : (
                          filteredInquiries.map((row) => (
                            <tr key={row.id} className="border-t border-[color-mix(in_oklab,var(--shp-border)_56%,transparent)]">
                              <td className="py-3 text-[var(--shp-muted)]">{formatDateLabel(row.createdAt)}</td>
                              <td className="py-3 text-[var(--shp-text)]">{row.customerName || "Anonymous"}</td>
                              <td className="py-3 text-[var(--shp-text)]">{row.email}</td>
                              <td className="max-w-[420px] py-3 text-[var(--shp-text)]">
                                <p className="line-clamp-1">{row.subject || "Website inquiry"}</p>
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] ${inquiryStatusTone(row.status)}`}>
                                  {inquiryStatusText(row.status)}
                                </span>
                              </td>
                              <td className="py-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedInquiryId(row.id)}
                                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_56%,transparent)]"
                                >
                                  View details
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
                    <h3 className="text-lg font-semibold text-[var(--shp-text)]">Detailed Selection View</h3>
                    {!selectedInquiry ? (
                      <p className="mt-3 text-sm text-[var(--shp-muted)]">
                        Select a row from the table above to inspect full inquiry details.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Customer</p>
                            <p className="mt-1 text-[var(--shp-text)]">{selectedInquiry.customerName || "Anonymous"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Email</p>
                            <p className="mt-1 text-[var(--shp-text)]">{selectedInquiry.email || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Submitted At</p>
                            <p className="mt-1 text-[var(--shp-text)]">{formatDateTimeLabel(selectedInquiry.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Site Key</p>
                            <p className="mt-1 break-all text-[var(--shp-text)]">{selectedInquiry.siteKey || "-"}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Subject</p>
                          <p className="mt-1 text-[var(--shp-text)]">{selectedInquiry.subject || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Message</p>
                          <p className="mt-1 whitespace-pre-wrap text-[var(--shp-text)]">
                            {selectedInquiry.message || "No message content."}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Visitor IP</p>
                            <p className="mt-1 text-[var(--shp-text)]">{selectedInquiry.visitorIp || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Referer</p>
                            <p className="mt-1 break-all text-[var(--shp-text)]">{selectedInquiry.referer || "-"}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>

                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
                    <h3 className="text-base font-semibold text-[var(--shp-text)]">Quick Actions</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--shp-text)]">
                      <li>
                        <button
                          type="button"
                          onClick={() => void handleExportInquiriesCsv()}
                          disabled={loadingInquiries || exportingCsv}
                          className="text-left hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                        >
                          Export inquiries to CSV
                        </button>
                      </li>
                      <li>Route pending leads to CRM</li>
                      <li>Define custom status tags</li>
                    </ul>
                    {selectedInquiry ? (
                      <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_38%,transparent)] p-3 text-xs text-[var(--shp-muted)]">
                        <p className="font-medium text-[var(--shp-text)]">Current Selection</p>
                        <p className="mt-1">{selectedInquiry.customerName}</p>
                        <p>{selectedInquiry.email}</p>
                      </div>
                    ) : null}
                  </article>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-[var(--shp-text)]">Website Support Data</h3>
                      <p className="mt-1 text-xs text-[var(--shp-muted)]">
                        {supportHost ? `Host: ${supportHost}` : "No deployment host yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSupportRange("7d")}
                        className={[
                          "rounded-md border px-3 py-1.5 text-xs",
                          supportRange === "7d"
                            ? "border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                            : "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] text-[var(--shp-muted)]",
                        ].join(" ")}
                      >
                        Last 7 days
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportRange("30d")}
                        className={[
                          "rounded-md border px-3 py-1.5 text-xs",
                          supportRange === "30d"
                            ? "border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                            : "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] text-[var(--shp-muted)]",
                        ].join(" ")}
                      >
                        Last 30 days
                      </button>
                    </div>
                  </div>
                  {supportUrl ? (
                    <a
                      href={supportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--shp-primary)] hover:underline"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      Open Live Site
                    </a>
                  ) : null}
                </div>

                {supportWarning ? (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {supportWarning}
                  </div>
                ) : null}
                {supportError ? (
                  <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {supportError}
                  </div>
                ) : null}
                {loadingSupport ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading website support data...
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Visits</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(supportTotals.visits)}</p>
                  </article>
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Page Views</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{numberText(supportTotals.pageViews)}</p>
                  </article>
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Bounce Rate</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">{percentText(supportTotals.bounceRate)}</p>
                  </article>
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_34%,transparent)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">Avg Duration</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--shp-text)]">
                      {durationText(supportTotals.avgVisitDurationSeconds)}
                    </p>
                  </article>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
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
                          {(supportAnalytics?.pages || []).length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-4 text-xs text-[var(--shp-muted)]">
                                No page-level support data yet.
                              </td>
                            </tr>
                          ) : (
                            (supportAnalytics?.pages || []).map((row) => (
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

                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_30%,transparent)] p-4">
                    <h3 className="text-base font-semibold text-[var(--shp-text)]">Traffic Channels</h3>
                    <div className="mt-3 space-y-2">
                      {(supportAnalytics?.channels || []).length === 0 ? (
                        <p className="text-xs text-[var(--shp-muted)]">No channel data yet.</p>
                      ) : (
                        (supportAnalytics?.channels || []).map((row) => {
                          const total = Math.max(1, supportTotals.visits || 0);
                          const width = Math.max(4, Math.min(100, (row.visits / total) * 100));
                          return (
                            <div key={row.channel}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="capitalize text-[var(--shp-text)]">{row.channel}</span>
                                <span className="text-[var(--shp-muted)]">{numberText(row.visits)} visits</span>
                              </div>
                              <div className="h-2 rounded-full bg-[color-mix(in_oklab,var(--shp-surface)_76%,transparent)]">
                                <div
                                  className="h-2 rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_72%,transparent)]"
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </article>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
