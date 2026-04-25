"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Paperclip,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Upload,
  User2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TaskStatus = "queued" | "running" | "succeeded" | "failed";

type TaskResult = {
  assistantText?: string;
  deployedUrl?: string;
  error?: string;
  actions?: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  progress?: {
    stage?: string;
    stageMessage?: string;
    provider?: string;
    model?: string;
    fileCount?: number;
    pageCount?: number;
    generatedFiles?: string[];
  };
};

type TaskPayload = {
  id: string;
  chatId: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  result: TaskResult | null;
};

type TaskResponse = {
  ok: boolean;
  task?: TaskPayload | null;
  error?: string;
};

type HistoryMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
};

type HistoryResponse = {
  ok: boolean;
  messages?: HistoryMessage[];
  task?: TaskPayload | null;
  error?: string;
};

function isTaskEventTimelineMessage(message: HistoryMessage): boolean {
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  const source = String(metadata.source || "").trim().toLowerCase();
  if (source === "task_event_snapshot") return true;

  const eventType = String(metadata.eventType || "").trim().toLowerCase();
  if (eventType.startsWith("task_")) return true;

  const text = String(message.text || "").trim().toLowerCase();
  if (/^task_[a-z_]+\b/.test(text)) return true;
  if (text.includes("提供商：") || text.includes("模型：")) return true;
  if (text.includes("provider:") || text.includes("model:")) return true;
  return false;
}

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
  contentType: string;
  size: number;
  updatedAt: number;
  url: string;
  referenceText: string;
};

type AssetUploadResponse = {
  ok: boolean;
  uploaded?: ProjectAsset[];
  error?: string;
};

type AssetListResponse = {
  ok: boolean;
  assets?: ProjectAsset[];
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

const DEFAULT_PROMPT =
  "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact. Keep shared styles and script across all pages, and ensure navigation links work.";
const DEFAULT_ASSISTANT_GREETING =
  "Describe your website request and I will submit a generation task with live progress.";

function createUserMessage(prompt: string) {
  return {
    id: crypto.randomUUID(),
    role: "user" as const,
    parts: [{ type: "text" as const, text: prompt }],
  };
}

function toReadableStage(stage?: string) {
  if (!stage) return "-";
  if (stage.startsWith("generating:")) return stage.replace("generating:", "Generating ");
  return stage;
}

function statusTone(status?: TaskStatus | null): string {
  if (status === "succeeded")
    return "text-[var(--shp-primary)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]";
  if (status === "failed") return "text-rose-300 bg-rose-500/15 border-rose-400/35";
  if (status === "running")
    return "text-[var(--shp-secondary)] bg-[color-mix(in_oklab,var(--shp-secondary)_14%,transparent)] border-[color-mix(in_oklab,var(--shp-secondary)_40%,transparent)]";
  return "text-amber-300 bg-amber-500/15 border-amber-400/35";
}

function formatVersionLabel(updatedAt?: number): string {
  if (!updatedAt) return "v1.0.0";
  const d = new Date(updatedAt);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yy}.${mm}.${dd}`;
}

function formatAssetFileSize(value: number): string {
  const size = Math.max(0, Number(value || 0));
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ProjectChatWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const initialPrompt = useMemo(() => String(searchParams.get("prompt") || "").trim(), [searchParams]);
  const initialDraft = useMemo(() => String(searchParams.get("draft") || "").trim(), [searchParams]);

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("Current Project");
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTask, setLoadingTask] = useState(false);
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [draftPreviewText, setDraftPreviewText] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projects, setProjects] = useState<SessionPayload[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [pendingAssetRefs, setPendingAssetRefs] = useState<ProjectAsset[]>([]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerQuery, setAssetPickerQuery] = useState("");
  const [availableAssets, setAvailableAssets] = useState<ProjectAsset[]>([]);

  const pollTimerRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSubmittedInitialPrompt = useRef(false);
  const appliedInitialDraft = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const chatId = projectId;

  const appendMessage = useCallback((role: ChatMessage["role"], text: string, metadata?: Record<string, unknown>) => {
    const normalized = text.trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        text: normalized,
        metadata,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const toTimelineMessage = useCallback((item: HistoryMessage): ChatMessage => {
    const text = String(item.text || "").trim();
    return {
      id: String(item.id || crypto.randomUUID()),
      role: item.role,
      text,
      metadata: item.metadata || undefined,
      timestamp: Number(item.createdAt || Date.now()),
    };
  }, []);

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
      // best-effort project metadata
    }
  }, [chatId, userId]);

  const fetchProjectAssetsForPicker = useCallback(async () => {
    if (!chatId.trim()) return;
    setAssetPickerLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AssetListResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load project assets.");
      }
      setAvailableAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch {
      // best-effort; picker can still upload local files
    } finally {
      setAssetPickerLoading(false);
    }
  }, [chatId]);

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
    if (!assetPickerOpen) return;
    void fetchProjectAssetsForPicker();
  }, [assetPickerOpen, fetchProjectAssetsForPicker]);

  useEffect(() => {
    return () => clearPollTimer();
  }, [clearPollTimer]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "0px";
    const style = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight || "20") || 20;
    const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
    const maxHeight = lineHeight * 5 + paddingTop + paddingBottom + borderTop + borderBottom;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  const fetchHistoryByChatId = useCallback(async (targetChatId: string): Promise<HistoryResponse> => {
    const res = await fetch(`/api/chat/history?chatId=${encodeURIComponent(targetChatId)}`, { cache: "no-store" });
    const data = (await res.json()) as HistoryResponse;
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Failed to get chat history for chatId: ${targetChatId}`);
    }
    return data;
  }, []);

  const fetchTask = useCallback(
    async (taskId: string, retryCount = 0): Promise<void> => {
      try {
        const res = await fetch(`/api/chat/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const data = (await res.json()) as TaskResponse;
        if (!res.ok || !data.ok || !data.task) {
          throw new Error(data.error || `Failed to get task: ${taskId}`);
        }

        setTask(data.task);
        try {
          const history = await fetchHistoryByChatId(data.task.chatId);
          const historyMessages = Array.isArray(history.messages) ? history.messages : [];
          const normalizedMessages = historyMessages
            .filter((item) => !isTaskEventTimelineMessage(item))
            .map((item) => toTimelineMessage(item))
            .filter((item) => item.text);
          if (normalizedMessages.length > 0) {
            setMessages(normalizedMessages);
          }
        } catch {
          // best-effort history refresh
        }
        setLoadingTask(false);

        clearPollTimer();
        if (data.task.status === "queued" || data.task.status === "running") {
          pollTimerRef.current = window.setTimeout(() => {
            void fetchTask(taskId).catch((err) => setError(String(err?.message || err)));
          }, 2500);
        }
      } catch (err: any) {
        if (retryCount < 3) {
          pollTimerRef.current = window.setTimeout(() => {
            void fetchTask(taskId, retryCount + 1).catch((innerErr) => setError(String(innerErr?.message || innerErr)));
          }, 1200);
          return;
        }
        setLoadingTask(false);
        setError(String(err?.message || err || "Failed to poll task status"));
      }
    },
    [clearPollTimer, fetchHistoryByChatId, toTimelineMessage],
  );

  useEffect(() => {
    if (!chatId.trim()) return;
    let cancelled = false;
    setLoadingTask(true);
    setError("");
    setTask(null);
    setHistoryReady(false);

    void (async () => {
      try {
        const history = await fetchHistoryByChatId(chatId);
        if (cancelled) return;
        const historyMessages = Array.isArray(history.messages) ? history.messages : [];
        const normalizedMessages = historyMessages
          .filter((item) => !isTaskEventTimelineMessage(item))
          .map((item) => toTimelineMessage(item))
          .filter((item) => item.text);
        if (normalizedMessages.length > 0) {
          setMessages(normalizedMessages);
        } else {
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: DEFAULT_ASSISTANT_GREETING,
              timestamp: Date.now(),
            },
          ]);
        }

        const latestTask = history.task || null;
        if (!latestTask) {
          setLoadingTask(false);
          setHistoryReady(true);
          return;
        }
        setTask(latestTask);
        await fetchTask(latestTask.id);
        setHistoryReady(true);
      } catch (err: any) {
        if (cancelled) return;
        setLoadingTask(false);
        setMessages((prev) =>
          prev.length > 0
            ? prev
            : [
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text: DEFAULT_ASSISTANT_GREETING,
                  timestamp: Date.now(),
                },
              ],
        );
        setHistoryReady(true);
        setError(String(err?.message || err || "Failed to load chat history"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, fetchHistoryByChatId, fetchTask, toTimelineMessage]);

  const generatedFiles = useMemo(() => {
    return task?.result?.progress?.generatedFiles || [];
  }, [task]);

  const hasGeneratedHtml = useMemo(() => {
    return generatedFiles.some((filePath) => /(^|\/)index\.html$/i.test(String(filePath || "").trim()));
  }, [generatedFiles]);

  const previewUrl = useMemo(() => {
    if (!task?.id) return "";
    const deployedUrl = String(task.result?.deployedUrl || "").trim();
    if (deployedUrl) return deployedUrl;
    if (!hasGeneratedHtml && task.status !== "succeeded") return "";
    return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/index.html`;
  }, [task, hasGeneratedHtml]);

  const stageText = useMemo(() => {
    return task?.result?.progress?.stageMessage || toReadableStage(task?.result?.progress?.stage) || task?.status || "-";
  }, [task]);

  const filteredAvailableAssets = useMemo(() => {
    const query = assetPickerQuery.trim().toLowerCase();
    const pendingKeys = new Set(pendingAssetRefs.map((item) => item.key));
    return availableAssets
      .filter((asset) => {
        if (query) {
          const hay = `${asset.name} ${asset.key} ${asset.source}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      })
      .map((asset) => ({
        ...asset,
        alreadySelected: pendingKeys.has(asset.key),
      }));
  }, [assetPickerQuery, availableAssets, pendingAssetRefs]);

  function toLocalPreviewHref(generatedPath: string): string {
    if (!task?.id) return "#";
    const normalized = String(generatedPath || "").trim();
    if (!normalized || normalized === "/" || normalized === "/index.html" || normalized === "index.html") {
      return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/index.html`;
    }

    let target = normalized.replace(/^\/+/, "");
    if (target.endsWith("index.html")) {
      target = target.slice(0, -("index.html".length));
    }
    return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/${target}`;
  }

  const submitPromptText = useCallback(
    async (nextText: string) => {
      const finalPrompt = String(nextText || "").trim();
      if (!chatId.trim()) return;
      if (!finalPrompt) {
        setError("Please enter a prompt.");
        return;
      }

      setError("");
      setSubmitting(true);
      setLoadingTask(true);
      setAssetPickerOpen(false);
      setPrompt("");
      clearPollTimer();
      const currentAssetRefs = [...pendingAssetRefs];
      const assetReferenceBlock =
        currentAssetRefs.length > 0
          ? [
              "",
              "[Referenced Assets]",
              ...currentAssetRefs.map((asset) => `- ${String(asset.referenceText || `Asset "${asset.name}" key: ${asset.key}`).trim()}`),
            ].join("\n")
          : "";
      const runtimePrompt = `${finalPrompt}${assetReferenceBlock}`.trim();
      setPendingAssetRefs([]);
      appendMessage("user", runtimePrompt);
      appendMessage("assistant", "Message received. Analyzing your intent and current stage...");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              id: chatId,
              user_id: userId || undefined,
              async: true,
              skill_id: "website-generation-workflow",
              messages: [createUserMessage(runtimePrompt)],
            }),
          });

        await res.text();
        if (!res.ok && res.status !== 202 && res.status !== 200) {
          throw new Error(`Chat API request failed with status ${res.status}`);
        }

        const latestHistory = await fetchHistoryByChatId(chatId);
        const historyMessages = Array.isArray(latestHistory.messages) ? latestHistory.messages : [];
        const normalizedMessages = historyMessages.map((item) => toTimelineMessage(item)).filter((item) => item.text);
        if (normalizedMessages.length > 0) {
          setMessages(normalizedMessages);
        }
        const latest = latestHistory.task;
        if (!latest?.id) {
          setLoadingTask(false);
          void fetchProjectMeta();
          return;
        }

        setTask(latest);
        await fetchTask(latest.id);
        void fetchProjectMeta();
      } catch (err: any) {
        setLoadingTask(false);
        const message = String(err?.message || err || "Submit failed");
        setError(message);
        setPendingAssetRefs((prev) => {
          const map = new Map<string, ProjectAsset>();
          for (const item of currentAssetRefs) map.set(item.key, item);
          for (const item of prev) map.set(item.key, item);
          return Array.from(map.values());
        });
        appendMessage("assistant", `Submit failed: ${message}`);
      } finally {
        setSubmitting(false);
      }
    },
    [appendMessage, chatId, clearPollTimer, fetchHistoryByChatId, fetchProjectMeta, fetchTask, pendingAssetRefs, userId],
  );

  useEffect(() => {
    if (!historyReady || !initialPrompt || autoSubmittedInitialPrompt.current) return;
    autoSubmittedInitialPrompt.current = true;
    setPrompt(initialPrompt);
    void submitPromptText(initialPrompt);
    router.replace(`/projects/${encodeURIComponent(projectId)}/chat`);
  }, [historyReady, initialPrompt, projectId, router, submitPromptText]);

  useEffect(() => {
    if (!historyReady || !initialDraft || appliedInitialDraft.current) return;
    appliedInitialDraft.current = true;
    setPrompt(initialDraft);
    router.replace(`/projects/${encodeURIComponent(projectId)}/chat`);
  }, [historyReady, initialDraft, projectId, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPromptText(prompt);
  }

  async function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (submitting) return;
    await submitPromptText(prompt);
  }

  async function handleTimelineAction(payload: string) {
    const normalized = String(payload || "").trim();
    if (!normalized) return;
    if (/^https?:\/\//i.test(normalized)) {
      window.open(normalized, "_blank", "noopener,noreferrer");
      return;
    }
    await submitPromptText(normalized);
  }

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
    router.push(`/projects/${encodeURIComponent(normalized)}/chat`);
  }

  function addPendingAssetRef(asset: ProjectAsset) {
    setPendingAssetRefs((prev) => {
      if (prev.some((item) => item.key === asset.key)) return prev;
      return [...prev, asset];
    });
  }

  function toggleAssetPicker() {
    setAssetPickerOpen((prev) => !prev);
  }

  async function uploadAssetsFromChat(files: FileList | File[]) {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return;
    setAssetPickerOpen(true);
    setError("");
    try {
      const form = new FormData();
      form.append("source", "chat_upload");
      for (const file of selected) {
        form.append("files", file, file.name);
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as AssetUploadResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.uploaded)) {
        throw new Error(data.error || "Failed to upload files to project assets.");
      }
      setAvailableAssets((prev) => {
        const map = new Map<string, ProjectAsset>();
        for (const item of prev) map.set(item.key, item);
        for (const item of data.uploaded || []) map.set(item.key, item);
        return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      });
      for (const item of data.uploaded || []) {
        addPendingAssetRef(item);
      }
      appendMessage("system", `Uploaded ${data.uploaded.length} file(s) and added them to this message.`);
    } catch (err: any) {
      const message = String(err?.message || err || "Failed to upload files.");
      setError(message);
      appendMessage("assistant", `Attachment upload failed: ${message}`);
    } finally {
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: "Chat", icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: true },
    { label: "Analytics", icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: "Assets", icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: "Data", icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: "Settings", icon: Settings, active: false },
  ];

  return (
    <main className="chat-ui min-h-screen bg-[radial-gradient(720px_360px_at_10%_-5%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_70%),radial-gradient(760px_340px_at_90%_-15%,color-mix(in_oklab,var(--shp-warm)_14%,transparent),transparent_75%),linear-gradient(180deg,var(--shp-bg),#050505)] text-[var(--shp-text)]">
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (!event.target.files?.length) return;
          void uploadAssetsFromChat(event.target.files);
        }}
      />
      <div className="mx-auto max-w-[1920px] px-5 py-5 sm:px-6 sm:py-6">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex shrink-0 cursor-default items-center gap-2 rounded-md px-1 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--shp-primary)] text-sm font-black text-black">
              S
            </div>
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

        <section
          className={`grid gap-4 ${sidebarCollapsed ? "xl:grid-cols-[88px_460px_minmax(0,1fr)]" : "xl:grid-cols-[260px_460px_minmax(0,1fr)]"}`}
        >
          <aside className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col rounded-xl p-4">
            <div
              className={[
                "rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_48%,transparent)] p-3.5",
              ].join(" ")}
            >
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
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    className={classes}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
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

          <aside className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col overflow-hidden rounded-xl">
            <div ref={messagesScrollRef} className="no-scrollbar flex-1 space-y-3 overflow-auto px-4 py-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isSystem = message.role === "system";
                const metadata = (message.metadata || {}) as Record<string, unknown>;
                const cardType = String(metadata.cardType || "").trim();
                const previewText = String(metadata.promptDraft || "").trim();
                const confirmPayload = String(metadata.payload || "").trim();
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={[
                        "max-w-[88%] rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                        isUser
                          ? "border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)] text-[color-mix(in_oklab,var(--shp-text)_95%,white_5%)]"
                          : isSystem
                            ? "border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] text-[var(--shp-muted)]"
                            : "border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_56%,transparent)] text-[var(--shp-text)]",
                      ].join(" ")}
                    >
                      <p>{message.text}</p>
                      {cardType === "prompt_draft" && previewText ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftPreviewText(previewText);
                            setDraftPreviewOpen(true);
                          }}
                          className="mt-3 w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_76%,black_24%)] px-3 py-2 text-left text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_72%,transparent)]"
                        >
                          <p className="font-medium">Prompt Draft (click to expand)</p>
                          <p className="mt-1 line-clamp-3 text-[var(--shp-muted)]">{previewText}</p>
                        </button>
                      ) : null}
                      {cardType === "confirm_generate" && confirmPayload ? (
                        <button
                          type="button"
                          onClick={() => void handleTimelineAction(confirmPayload)}
                          disabled={submitting || loadingTask}
                          className="mt-3 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_55%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_30%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {String(metadata.label || "Confirm and Generate")}
                        </button>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[color-mix(in_oklab,var(--shp-muted)_72%,transparent)]">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 border-t border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-3.5">
              {pendingAssetRefs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {pendingAssetRefs.map((asset) => (
                    <span
                      key={asset.key}
                      className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-text)]"
                      title={asset.referenceText}
                    >
                      {asset.name}
                      <button
                        type="button"
                        onClick={() => setPendingAssetRefs((prev) => prev.filter((item) => item.key !== asset.key))}
                        className="rounded-sm px-0.5 text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                        aria-label={`Remove ${asset.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {assetPickerOpen ? (
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--shp-text)]">Add Files To Chat</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)]"
                      >
                        <Upload className="h-3 w-3" />
                        Upload Local
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetPickerOpen(false)}
                        className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--shp-muted)]" />
                    <input
                      value={assetPickerQuery}
                      onChange={(event) => setAssetPickerQuery(event.target.value)}
                      placeholder="Search existing assets..."
                      className="h-8 w-full rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_56%,black_44%)] pl-8 pr-2 text-xs text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)]"
                    />
                  </div>

                  <div className="no-scrollbar mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                    {assetPickerLoading ? (
                      <div className="flex items-center gap-2 px-2 py-2 text-xs text-[var(--shp-muted)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading assets...
                      </div>
                    ) : filteredAvailableAssets.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-[var(--shp-muted)]">
                        No matching assets. Upload local files to continue.
                      </div>
                    ) : (
                      filteredAvailableAssets.map((asset) => (
                        <div
                          key={asset.key}
                          className="flex items-center justify-between gap-2 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_38%,transparent)] px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs text-[var(--shp-text)]">{asset.name}</p>
                            <p className="text-[10px] text-[var(--shp-muted)]">
                              {formatAssetFileSize(asset.size)} • {asset.source}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addPendingAssetRef(asset)}
                            disabled={asset.alreadySelected}
                            className="shrink-0 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)] px-2 py-1 text-[10px] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {asset.alreadySelected ? "Added" : "Add"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={toggleAssetPicker}
                  disabled={submitting}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] p-2 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
                  title="Attach"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => void handlePromptKeyDown(e)}
                  rows={1}
                  className="no-scrollbar w-full resize-none overflow-y-auto rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_60%,black_40%)] px-3 py-2.5 text-sm leading-6 text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_40%,var(--shp-border)_60%)]"
                  placeholder={`Describe changes for ${projectTitle}...`}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shp-btn-primary inline-flex h-11 w-11 items-center justify-center rounded-lg text-black disabled:cursor-not-allowed disabled:opacity-60"
                  title="Send"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-[var(--shp-muted)]">Press Enter to send, Shift+Enter for new line.</p>
              {loadingTask ? <p className="text-xs text-[var(--shp-primary)]">Syncing task progress...</p> : null}
              {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            </form>
          </aside>

          <div className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
                  title="Preview"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--shp-muted)]">
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-[var(--shp-text)]">
                  Latest
                </span>
                <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] ${statusTone(task?.status || null)}`}>
                  {stageText}
                </span>
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_70%,transparent)]"
                  >
                    Open
                  </a>
                ) : null}
              </div>
            </div>

            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {generatedFiles.length === 0 ? (
                    <span className="text-xs text-[var(--shp-muted)]">Waiting for generated files...</span>
                  ) : (
                    generatedFiles.slice(-8).map((filePath) => (
                      <a
                        key={filePath}
                        href={toLocalPreviewHref(filePath)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_58%,transparent)]"
                      >
                        {filePath}
                      </a>
                    ))
                  )}
                </div>
              </div>

              {previewUrl ? (
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  className="h-full w-full bg-white"
                  title="Generated Website Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--shp-muted)]">
                  <p>Your live preview will appear here once the first HTML page is generated.</p>
                  <p className="text-xs">Current stage: {stageText}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {draftPreviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="shp-shell relative flex h-[min(86vh,980px)] w-[min(92vw,980px)] flex-col rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)]">
            <div className="flex items-center justify-between border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--shp-text)]">Prompt Draft</p>
              <button
                type="button"
                onClick={() => setDraftPreviewOpen(false)}
                className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_58%,transparent)] hover:text-[var(--shp-text)]"
                aria-label="Close prompt preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--shp-text)]">{draftPreviewText}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
