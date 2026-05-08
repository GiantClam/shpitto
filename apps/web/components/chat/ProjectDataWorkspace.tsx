"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ProjectBlogWorkspace } from "@/components/chat/ProjectBlogWorkspace";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
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
  User2,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { getProjectWorkspaceCopy } from "./project-workspace-copy";

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

type ProjectAuthUserItem = {
  id: string;
  projectId: string;
  siteKey: string | null;
  authUserId: string | null;
  email: string;
  emailVerified: boolean;
  lastEvent: string;
  signupCount: number;
  loginCount: number;
  verificationCount: number;
  passwordResetCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectAuthUsersResponse = {
  ok: boolean;
  items?: ProjectAuthUserItem[];
  error?: string;
};

type DataTab = "inquiries" | "auth_users" | "blog";

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

type AuthUserRow = ProjectAuthUserItem;

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
  if (status === "closed") return "border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] text-[var(--shp-muted)]";
  if (status === "pending") return "border-amber-400/35 bg-amber-500/12 text-amber-700";
  return "border-[color-mix(in_oklab,var(--shp-primary)_36%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] text-[var(--shp-primary-pressed)]";
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

function authUserStatusTone(verified: boolean) {
  return verified
    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700"
    : "border-amber-400/35 bg-amber-500/10 text-amber-700";
}

function authUserEventLabel(event: string) {
  const value = String(event || "").trim().toLowerCase();
  if (value === "signup") return "Signup";
  if (value === "login") return "Login";
  if (value === "oauth_login") return "OAuth Login";
  if (value === "email_verified") return "Email Verified";
  if (value === "verification_resend") return "Verification Resent";
  if (value === "password_reset_requested") return "Password Reset Requested";
  if (value === "password_reset_completed") return "Password Reset Completed";
  return value || "-";
}

function authUserStatusText(verified: boolean) {
  return verified ? "Verified" : "Unverified";
}

export function ProjectDataWorkspace({ projectId, locale = "en" }: { projectId: string; locale?: Locale }) {
  const router = useRouter();
  const workspaceCopy = getProjectWorkspaceCopy(locale);
  const chatId = projectId;

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState(workspaceCopy.currentProject);
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
  const [loadingAuthUsers, setLoadingAuthUsers] = useState(false);
  const [authUsersError, setAuthUsersError] = useState("");
  const [authUserSearch, setAuthUserSearch] = useState("");
  const [authUsers, setAuthUsers] = useState<AuthUserRow[]>([]);
  const [selectedAuthUserId, setSelectedAuthUserId] = useState("");
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
      setProjectTitle(String(hit.title || workspaceCopy.currentProject));
      setProjectUpdatedAt(Number(hit.updatedAt || Date.now()));
    } catch {
      // best-effort metadata
    }
  }, [chatId, userId, workspaceCopy.currentProject]);

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

  const fetchAuthUsers = useCallback(async () => {
    if (!chatId.trim()) return;
    setLoadingAuthUsers(true);
    setAuthUsersError("");
    try {
      const params = new URLSearchParams({
        limit: "200",
        projectId: chatId,
      });
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/auth-users?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ProjectAuthUsersResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load auth user data.");
      }
      const nextRows = Array.isArray(data.items) ? data.items.map((item) => ({ ...item })) : [];
      setAuthUsers(nextRows);
      setSelectedAuthUserId((prev) => {
        if (nextRows.length === 0) return "";
        if (prev && nextRows.some((row) => row.id === prev)) return prev;
        return nextRows[0].id;
      });
    } catch (err: any) {
      setAuthUsersError(String(err?.message || err || "Failed to load auth user data."));
      setAuthUsers([]);
      setSelectedAuthUserId("");
    } finally {
      setLoadingAuthUsers(false);
    }
  }, [chatId]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as any) : {};
      if (!mounted) return;
      setUserEmail(String(data.user?.email || "").trim());
      setUserId(String(data.user?.id || "").trim());
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void fetchProjectMeta();
  }, [fetchProjectMeta]);

  useEffect(() => {
    if (activeTab !== "inquiries") return;
    void fetchInquiries();
  }, [activeTab, fetchInquiries]);

  useEffect(() => {
    if (activeTab !== "auth_users") return;
    void fetchAuthUsers();
  }, [activeTab, fetchAuthUsers]);

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

  const filteredAuthUsers = useMemo(() => {
    const keyword = String(authUserSearch || "").trim().toLowerCase();
    if (!keyword) return authUsers;
    return authUsers.filter((item) => {
      const hay = [
        item.email,
        item.authUserId,
        item.siteKey || "",
        item.lastEvent,
        item.firstSeenAt,
        item.lastSeenAt,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(keyword);
    });
  }, [authUserSearch, authUsers]);

  const selectedAuthUser = useMemo(() => {
    const found = filteredAuthUsers.find((item) => item.id === selectedAuthUserId);
    if (found) return found;
    return filteredAuthUsers[0] || null;
  }, [filteredAuthUsers, selectedAuthUserId]);

  const authUsersCopy = {
    loading: workspaceCopy.data.loadingUsers || "Loading auth user data...",
    noMatching: workspaceCopy.data.noMatchingUsers || "No matching auth users found.",
    noRows: workspaceCopy.data.noUsers || "No auth users yet.",
    detailsTitle: workspaceCopy.data.detailsTitleUsers || "Auth User Details",
    selectUser: workspaceCopy.data.selectUser || "Select an auth user row to inspect the account record.",
    verified: workspaceCopy.data.verified || "Verified",
    firstSeen: workspaceCopy.data.firstSeen || "First Seen",
    lastSeen: workspaceCopy.data.lastSeen || "Last Seen",
    lastEvent: workspaceCopy.data.lastEvent || "Last Event",
    authUserId: workspaceCopy.data.authUserId || "Auth User ID",
    siteKey: workspaceCopy.data.siteKey || "Site Key",
    signupCount: workspaceCopy.data.signupCount || "Signups",
    loginCount: workspaceCopy.data.loginCount || "Logins",
    verificationCount: workspaceCopy.data.verificationCount || "Verifications",
    passwordResetCount: workspaceCopy.data.passwordResetCount || "Password Resets",
    searchUsers: workspaceCopy.data.searchUsers || "Search auth users...",
    viewDetails: workspaceCopy.data.viewDetails || "View details",
    quickActions: workspaceCopy.data.quickActions || "Quick Actions",
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

  useEffect(() => {
    if (selectedAuthUser && selectedAuthUser.id !== selectedAuthUserId) {
      setSelectedAuthUserId(selectedAuthUser.id);
      return;
    }
    if (filteredAuthUsers.length === 0 && selectedAuthUserId) {
      setSelectedAuthUserId("");
    }
  }, [filteredAuthUsers, selectedAuthUser, selectedAuthUserId]);

  async function handleCreateProject() {
    if (creatingProject) return;
    setCreatingProject(true);
    setInquiryError("");
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: workspaceCopy.newProject }),
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
    { label: workspaceCopy.nav.chat, icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: false },
    { label: workspaceCopy.nav.analytics, icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: workspaceCopy.nav.assets, icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: workspaceCopy.nav.data, icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: true },
    { label: workspaceCopy.nav.settings, icon: Settings, active: false },
  ];

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
                title={userEmail || workspaceCopy.guest}
              >
                <User2 className="h-4 w-4 shrink-0 text-[var(--shp-muted)]" />
                {!sidebarCollapsed ? (
                  <span className="max-w-[190px] truncate text-sm text-[var(--shp-text)]">{userEmail || workspaceCopy.guest}</span>
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
                <h2 className="text-4xl font-semibold tracking-tight text-[var(--shp-text)]">{workspaceCopy.data.title}</h2>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--shp-muted)]">
                  Central Repository - {projectTitle}
                </p>
              </div>
              {activeTab === "blog" ? null : (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === "inquiries") {
                      void fetchInquiries();
                      return;
                    }
                    void fetchAuthUsers();
                  }}
                  disabled={activeTab === "inquiries" ? loadingInquiries : loadingAuthUsers}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activeTab === "inquiries"
                    ? loadingInquiries
                      ? "Syncing..."
                      : "Sync Now"
                    : loadingAuthUsers
                      ? "Syncing..."
                      : "Sync Now"}
                </button>
              )}
            </div>

            <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-1.5">
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
                {workspaceCopy.data.inquiries}
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-1.5 text-xs">
                  {inquiries.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("auth_users")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                  activeTab === "auth_users"
                    ? "bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] text-[var(--shp-text)]"
                    : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                ].join(" ")}
              >
                <User2 className="h-4 w-4" />
                {workspaceCopy.data.authUsers || "Auth Users"}
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-1.5 text-xs">
                  {authUsers.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("blog")}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                  activeTab === "blog"
                    ? "bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] text-[var(--shp-text)]"
                    : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                ].join(" ")}
              >
                <BookOpen className="h-4 w-4" />
                {workspaceCopy.data.blog || "Blog"}
              </button>
            </div>

            {activeTab === "inquiries" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-2xl font-semibold text-[var(--shp-text)]">Form Submissions</h3>
                    <div className="flex w-full max-w-[560px] items-center gap-2">
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={workspaceCopy.data.searchInquiries}
                          className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] pl-9 pr-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleExportInquiriesCsv()}
                        disabled={loadingInquiries || exportingCsv}
                        className="shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {exportingCsv ? workspaceCopy.data.exporting : workspaceCopy.data.exportCsv}
                      </button>
                    </div>
                  </div>
                  {exportNotice ? (
                    <div className="mt-3 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-3 py-2 text-xs text-[var(--shp-muted)]">
                      {exportNotice}
                    </div>
                  ) : null}

                  {inquiryError ? (
                    <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                      {inquiryError}
                    </div>
                  ) : null}

                  {loadingInquiries ? (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-3 py-2 text-sm text-[var(--shp-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {workspaceCopy.data.loadingInquiries}
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                          <th className="py-2">{workspaceCopy.data.date}</th>
                          <th className="py-2">{workspaceCopy.data.customerName}</th>
                          <th className="py-2">{workspaceCopy.data.emailAddress}</th>
                          <th className="py-2">{workspaceCopy.data.subject}</th>
                          <th className="py-2">{workspaceCopy.data.status}</th>
                          <th className="py-2">{workspaceCopy.data.action}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInquiries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-sm text-[var(--shp-muted)]">
                              {search ? workspaceCopy.data.noMatchingInquiries : workspaceCopy.data.noInquiries}
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
                                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)]"
                                >
                                  {workspaceCopy.data.viewDetails}
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
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                    <h3 className="text-lg font-semibold text-[var(--shp-text)]">{workspaceCopy.data.detailsTitle}</h3>
                    {!selectedInquiry ? (
                      <p className="mt-3 text-sm text-[var(--shp-muted)]">
                        {workspaceCopy.data.selectInquiry}
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
                          <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{workspaceCopy.data.subject}</p>
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

                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                    <h3 className="text-base font-semibold text-[var(--shp-text)]">{workspaceCopy.data.quickActions}</h3>
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
                      <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3 text-xs text-[var(--shp-muted)]">
                        <p className="font-medium text-[var(--shp-text)]">Current Selection</p>
                        <p className="mt-1">{selectedInquiry.customerName}</p>
                        <p>{selectedInquiry.email}</p>
                      </div>
                    ) : null}
                  </article>
                </div>
              </div>
            ) : activeTab === "auth_users" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-2xl font-semibold text-[var(--shp-text)]">Auth User Records</h3>
                    <div className="flex w-full max-w-[560px] items-center gap-2">
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                        <input
                          value={authUserSearch}
                          onChange={(event) => setAuthUserSearch(event.target.value)}
                          placeholder={authUsersCopy.searchUsers}
                          className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] pl-9 pr-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void fetchAuthUsers()}
                        disabled={loadingAuthUsers}
                        className="shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingAuthUsers ? "Syncing..." : "Sync Now"}
                      </button>
                    </div>
                  </div>

                  {authUsersError ? (
                    <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                      {authUsersError}
                    </div>
                  ) : null}

                  {loadingAuthUsers ? (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] px-3 py-2 text-sm text-[var(--shp-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {authUsersCopy.loading}
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[1180px] text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">
                          <th className="py-2">{authUsersCopy.firstSeen}</th>
                          <th className="py-2">{workspaceCopy.data.emailAddress}</th>
                          <th className="py-2">{authUsersCopy.verified}</th>
                          <th className="py-2">{authUsersCopy.lastEvent}</th>
                          <th className="py-2">{authUsersCopy.lastSeen}</th>
                          <th className="py-2">{authUsersCopy.signupCount}</th>
                          <th className="py-2">{authUsersCopy.loginCount}</th>
                          <th className="py-2">{workspaceCopy.data.action}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAuthUsers.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-sm text-[var(--shp-muted)]">
                              {authUserSearch ? authUsersCopy.noMatching : authUsersCopy.noRows}
                            </td>
                          </tr>
                        ) : (
                          filteredAuthUsers.map((row) => (
                            <tr key={row.id} className="border-t border-[color-mix(in_oklab,var(--shp-border)_56%,transparent)]">
                              <td className="py-3 text-[var(--shp-muted)]">{formatDateLabel(row.firstSeenAt)}</td>
                              <td className="py-3 text-[var(--shp-text)]">{row.email || "-"}</td>
                              <td className="py-3">
                                <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] ${authUserStatusTone(row.emailVerified)}`}>
                                  {authUserStatusText(row.emailVerified)}
                                </span>
                              </td>
                              <td className="py-3 text-[var(--shp-text)]">{authUserEventLabel(row.lastEvent)}</td>
                              <td className="py-3 text-[var(--shp-muted)]">{formatDateTimeLabel(row.lastSeenAt)}</td>
                              <td className="py-3 text-[var(--shp-text)]">{numberText(row.signupCount)}</td>
                              <td className="py-3 text-[var(--shp-text)]">{numberText(row.loginCount)}</td>
                              <td className="py-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAuthUserId(row.id)}
                                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)]"
                                >
                                  {authUsersCopy.viewDetails}
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
                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                    <h3 className="text-lg font-semibold text-[var(--shp-text)]">{authUsersCopy.detailsTitle}</h3>
                    {!selectedAuthUser ? (
                      <p className="mt-3 text-sm text-[var(--shp-muted)]">{authUsersCopy.selectUser}</p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">Email</p>
                            <p className="mt-1 break-all text-[var(--shp-text)]">{selectedAuthUser.email || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.verified}</p>
                            <p className="mt-1 text-[var(--shp-text)]">{authUserStatusText(selectedAuthUser.emailVerified)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.authUserId}</p>
                            <p className="mt-1 break-all text-[var(--shp-text)]">{selectedAuthUser.authUserId || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.siteKey}</p>
                            <p className="mt-1 break-all text-[var(--shp-text)]">{selectedAuthUser.siteKey || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.firstSeen}</p>
                            <p className="mt-1 text-[var(--shp-text)]">{formatDateTimeLabel(selectedAuthUser.firstSeenAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.lastSeen}</p>
                            <p className="mt-1 text-[var(--shp-text)]">{formatDateTimeLabel(selectedAuthUser.lastSeenAt)}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.lastEvent}</p>
                            <p className="mt-1 text-[var(--shp-text)]">{authUserEventLabel(selectedAuthUser.lastEvent)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{workspaceCopy.data.status}</p>
                            <p className="mt-1 text-[var(--shp-text)]">
                              {selectedAuthUser.emailVerified ? authUsersCopy.verified : "Unverified"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.signupCount}</p>
                            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{numberText(selectedAuthUser.signupCount)}</p>
                          </div>
                          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.loginCount}</p>
                            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{numberText(selectedAuthUser.loginCount)}</p>
                          </div>
                          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.verificationCount}</p>
                            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{numberText(selectedAuthUser.verificationCount)}</p>
                          </div>
                          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,var(--shp-bg)_10%)] p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--shp-muted)]">{authUsersCopy.passwordResetCount}</p>
                            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{numberText(selectedAuthUser.passwordResetCount)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>

                  <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
                    <h3 className="text-base font-semibold text-[var(--shp-text)]">{authUsersCopy.quickActions}</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--shp-text)]">
                      <li>
                        <button
                          type="button"
                          onClick={() => void fetchAuthUsers()}
                          disabled={loadingAuthUsers}
                          className="text-left hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                        >
                          Sync auth users
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setAuthUserSearch("")}
                          className="text-left hover:underline"
                        >
                          Clear search filter
                        </button>
                      </li>
                      <li>Review sign-up, login, and verification activity.</li>
                    </ul>
                    {selectedAuthUser ? (
                      <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3 text-xs text-[var(--shp-muted)]">
                        <p className="font-medium text-[var(--shp-text)]">Current Selection</p>
                        <p className="mt-1 break-all">{selectedAuthUser.email}</p>
                        <p className="break-all">{selectedAuthUser.siteKey || "-"}</p>
                      </div>
                    ) : null}
                  </article>
                </div>
              </div>
            ) : (
              <ProjectBlogWorkspace projectId={chatId} projectTitle={projectTitle} locale={locale} />
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
