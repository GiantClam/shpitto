import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { invalidateLaunchCenterRecentProjectsCache } from "../launch-center/cache.ts";

export type ChatTaskStatus = "queued" | "running" | "succeeded" | "failed";

export type ChatTaskResult = {
  assistantText?: string;
  actions?: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  phase?: string;
  deployedUrl?: string;
  error?: string;
  internal?: {
    inputState?: any;
    sessionState?: any;
    workerId?: string;
    queuedAt?: string;
    claimedAt?: string;
    claimAttempts?: number;
    heartbeatAt?: string;
    requeuedAt?: string;
    requeueReason?: string;
    skillId?: string;
    pendingEdits?: ChatTaskPendingEdit[];
  };
  progress?: {
    stage?: string;
    stageMessage?: string;
    filePath?: string;
    skillId?: string;
    provider?: string;
    model?: string;
    attempt?: number;
    startedAt?: string;
    lastTokenAt?: string;
    elapsedMs?: number;
    artifactKey?: string;
    errorCode?: string;
    round?: number;
    maxRounds?: number;
    pageCount?: number;
    fileCount?: number;
    generatedFiles?: string[];
    recentToolCalls?: Array<{ name: string; args?: any }>;
    nativeStatus?: string;
    checkpointSaved?: boolean;
    checkpointDir?: string;
    checkpointStatePath?: string;
    checkpointProjectPath?: string;
    checkpointSiteDir?: string;
    checkpointWorkflowDir?: string;
    checkpointError?: string;
    nextStep?: string;
  };
};

export type ChatTaskPendingEdit = {
  id: string;
  text: string;
  createdAt: string;
  ownerUserId?: string;
  patchPlan?: unknown;
};

export type ChatTaskRecord = {
  id: string;
  chatId: string;
  status: ChatTaskStatus;
  createdAt: number;
  updatedAt: number;
  result?: ChatTaskResult;
  ownerUserId?: string;
};

export type ChatTimelineRole = "user" | "assistant" | "system";

export type ChatTimelineMessage = {
  id: string;
  chatId: string;
  taskId?: string;
  ownerUserId?: string;
  role: ChatTimelineRole;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type ChatSessionSummary = {
  id: string;
  ownerUserId?: string;
  title: string;
  archived: boolean;
  pinned: boolean;
  lastTaskId?: string;
  lastStatus?: ChatTaskStatus;
  lastDeployedUrl?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ChatTaskConsistencySweepResult = {
  scanned: number;
  sessionTouched: number;
  timelineRepaired: number;
};

type SupabaseTaskRow = {
  id: string;
  chat_id: string;
  owner_user_id: string | null;
  status: ChatTaskStatus;
  result: ChatTaskResult | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

type SupabaseTaskEventRow = {
  id: string;
  task_id: string;
  chat_id: string;
  event_type: string;
  stage: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type SupabaseChatMessageRow = {
  id: string;
  chat_id: string;
  task_id: string | null;
  owner_user_id: string | null;
  role: ChatTimelineRole;
  text: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SupabaseChatSessionRow = {
  id: string;
  owner_user_id: string | null;
  title: string;
  archived: boolean;
  pinned: boolean;
  last_task_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

const TASK_TTL_MS = 1000 * 60 * 60 * 2;
const TASK_TABLE = "shpitto_chat_tasks";
const TASK_EVENTS_TABLE = "shpitto_chat_task_events";
const TASK_MESSAGES_TABLE = "shpitto_chat_messages";
const TASK_SESSIONS_TABLE = "shpitto_chat_sessions";

type TaskStore = {
  tasks: Map<string, ChatTaskRecord>;
  activeTaskByChat: Map<string, string>;
  messagesByChat: Map<string, ChatTimelineMessage[]>;
  sessionsByChat: Map<string, ChatSessionSummary>;
};

declare global {
  // eslint-disable-next-line no-var
  var __shpittoChatTaskStore: TaskStore | undefined;
}

function now() {
  return Date.now();
}

async function invalidateLaunchCenterRecentProjectsCacheBestEffort() {
  try {
    await invalidateLaunchCenterRecentProjectsCache();
  } catch {
    // Best-effort cache invalidation should never block task/session writes.
  }
}

function isSupabaseTaskStoreEnabled() {
  if (process.env.NODE_ENV === "test") {
    return String(process.env.CHAT_TASKS_USE_SUPABASE || "0").trim() === "1";
  }
  if (String(process.env.CHAT_TASKS_USE_SUPABASE || "1").trim() === "0") {
    return false;
  }
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key);
}

function mustGetSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase is not configured for chat tasks.");
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asIso(ts: number) {
  return new Date(ts).toISOString();
}

function fromRow(row: SupabaseTaskRow): ChatTaskRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    ownerUserId: row.owner_user_id || undefined,
    status: row.status,
    result: row.result || undefined,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function fromMessageRow(row: SupabaseChatMessageRow): ChatTimelineMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    taskId: row.task_id || undefined,
    ownerUserId: row.owner_user_id || undefined,
    role: row.role,
    text: row.text,
    metadata: row.metadata || undefined,
    createdAt: Date.parse(row.created_at),
  };
}

function normalizeSessionTitle(input?: string, fallbackId = ""): string {
  const title = String(input || "").trim().replace(/\s+/g, " ");
  if (title) return title.slice(0, 80);
  if (fallbackId) return `Session ${fallbackId.slice(-6)}`;
  return "Untitled Session";
}

function summarizeMessage(text?: string, max = 160): string {
  const normalized = String(text || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function deriveSessionTitleFromMessage(text?: string): string | undefined {
  const summary = summarizeMessage(text, 64);
  return summary || undefined;
}

function fromSessionRow(row: SupabaseChatSessionRow): ChatSessionSummary {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id || undefined,
    title: normalizeSessionTitle(row.title, row.id),
    archived: Boolean(row.archived),
    pinned: Boolean(row.pinned),
    lastTaskId: row.last_task_id || undefined,
    lastMessage: row.last_message || undefined,
    lastMessageAt: row.last_message_at ? Date.parse(row.last_message_at) : undefined,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const text = String(error.message || "").trim();
    if (text) return text;
  }
  if (error && typeof error === "object") {
    const anyErr = error as Record<string, unknown>;
    const code = String(anyErr.code || "").trim();
    const message = String(anyErr.message || "").trim();
    const details = String(anyErr.details || "").trim();
    const hint = String(anyErr.hint || "").trim();
    if (message) {
      const parts = [code ? `[${code}] ${message}` : message];
      if (details && details !== "null" && details !== "undefined") {
        parts.push(`details: ${details}`);
      }
      if (hint && hint !== "null" && hint !== "undefined") {
        parts.push(`hint: ${hint}`);
      }
      return parts.join(" | ");
    }
    try {
      return JSON.stringify(error);
    } catch {
      // ignore JSON stringify failures and fall back below
    }
  }
  return String(error);
}

function withTaskStoreErrorContext(error: unknown) {
  const message = formatUnknownError(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("relation") && message.includes(TASK_TABLE)) {
    return new Error(
      `Supabase task table "${TASK_TABLE}" not found. Apply schema file apps/web/supabase/chat_tasks.sql first.`,
    );
  }
  if (normalized.includes("relation") && message.includes(TASK_EVENTS_TABLE)) {
    return new Error(
      `Supabase task events table "${TASK_EVENTS_TABLE}" not found. Apply schema file apps/web/supabase/chat_task_events.sql first.`,
    );
  }
  if (normalized.includes("relation") && message.includes(TASK_MESSAGES_TABLE)) {
    return new Error(
      `Supabase message table "${TASK_MESSAGES_TABLE}" not found. Apply schema file apps/web/supabase/chat_messages.sql first.`,
    );
  }
  if (normalized.includes("relation") && message.includes(TASK_SESSIONS_TABLE)) {
    return new Error(
      `Supabase session table "${TASK_SESSIONS_TABLE}" not found. Apply schema file apps/web/supabase/chat_sessions.sql first.`,
    );
  }
  if (error instanceof Error) {
    if (String(error.message || "").trim()) return error;
    return new Error(message);
  }
  return new Error(message);
}

function toReadableStageLabel(stage?: string): string {
  const normalized = String(stage || "").trim().toLowerCase();
  if (!normalized) return "处理中";
  if (normalized === "queued") return "排队中";
  if (normalized === "running") return "执行中";
  if (normalized === "done") return "已完成";
  if (normalized === "failed") return "失败";
  if (normalized === "deployed") return "已部署";
  if (normalized === "refined") return "已微调";
  if (normalized === "worker:claimed") return "已领取任务";
  if (normalized.startsWith("generating:")) return "生成中";
  if (normalized.startsWith("deploy")) return "部署中";
  if (normalized.startsWith("refine")) return "微调中";
  return "处理中";
}

function normalizeEventPayloadText(payload: Record<string, unknown>): string {
  const text = String((payload as any).message || (payload as any).text || "").trim();
  if (!text) return "";
  if (/^task_[a-z_]+\s*-\s*/i.test(text)) return "";
  return text;
}

export function formatTaskEventSnapshot(params: {
  eventType: string;
  stage?: string;
  payload?: Record<string, unknown>;
}): string {
  const eventType = String(params.eventType || "").trim().toLowerCase();
  const stageLabel = toReadableStageLabel(params.stage);
  const payload = params.payload || {};
  const details: string[] = [];

  const pushIf = (value: unknown) => {
    const text = String(value || "").trim();
    if (text) details.push(text);
  };

  const payloadText = normalizeEventPayloadText(payload);
  const errorText = String((payload as any).error || "").trim();

  if ((payload as any).toolName) pushIf(`工具：${String((payload as any).toolName)}`);
  if ((payload as any).path) pushIf(`路径：${String((payload as any).path)}`);
  if ((payload as any).filePath) pushIf(`文件：${String((payload as any).filePath)}`);
  if ((payload as any).provider) pushIf(`提供商：${String((payload as any).provider)}`);
  if ((payload as any).model) pushIf(`模型：${String((payload as any).model)}`);
  if ((payload as any).fileCount) pushIf(`文件数：${String((payload as any).fileCount)}`);
  if ((payload as any).pageCount) pushIf(`页面数：${String((payload as any).pageCount)}`);
  if ((payload as any).errorCode) pushIf(`错误码：${String((payload as any).errorCode)}`);

  let head = `任务状态更新（${stageLabel}）`;
  if (eventType === "task_created") head = "任务已创建，已进入队列。";
  if (eventType === "task_claimed") head = "后台执行器已接管任务，开始处理。";
  if (eventType === "task_progress") head = `任务进度更新（${stageLabel}）。`;
  if (eventType === "task_succeeded") head = "任务执行完成。";
  if (eventType === "task_failed") head = "任务执行失败。";

  const textParts: string[] = [head];
  if (payloadText) textParts.push(payloadText);
  if (errorText) textParts.push(`错误：${errorText}`);
  if (details.length > 0) textParts.push(`详情：${details.slice(0, 3).join("，")}`);
  return textParts.join(" ");
}

async function writeTaskEventBestEffort(params: {
  taskId: string;
  chatId: string;
  eventType: string;
  stage?: string;
  payload?: Record<string, unknown>;
}) {
  const snapshotText = formatTaskEventSnapshot({
    eventType: params.eventType,
    stage: params.stage,
    payload: params.payload,
  });

  if (!isSupabaseTaskStoreEnabled()) {
    try {
      await appendChatTimelineMessage({
        chatId: params.chatId,
        taskId: params.taskId,
        role: "system",
        text: snapshotText,
        metadata: {
          eventType: params.eventType,
          stage: params.stage || null,
          payload: params.payload || null,
          source: "task_event_snapshot",
        },
      });
    } catch {
      // Best-effort logging; do not block task execution.
    }
    return;
  }

  try {
    const supabase = mustGetSupabaseClient();
    await supabase.from(TASK_EVENTS_TABLE).insert({
      id: crypto.randomUUID(),
      task_id: params.taskId,
      chat_id: params.chatId,
      event_type: params.eventType,
      stage: params.stage || null,
      payload: params.payload || null,
      created_at: asIso(now()),
    });
    await appendChatTimelineMessage({
      chatId: params.chatId,
      taskId: params.taskId,
      role: "system",
      text: snapshotText,
      metadata: {
        eventType: params.eventType,
        stage: params.stage || null,
        payload: params.payload || null,
        source: "task_event_snapshot",
      },
    });
  } catch {
    // Best-effort logging; do not block task execution.
  }
}

function getStore(): TaskStore {
  if (!globalThis.__shpittoChatTaskStore) {
    globalThis.__shpittoChatTaskStore = {
      tasks: new Map<string, ChatTaskRecord>(),
      activeTaskByChat: new Map<string, string>(),
      messagesByChat: new Map<string, ChatTimelineMessage[]>(),
      sessionsByChat: new Map<string, ChatSessionSummary>(),
    };
  }
  return globalThis.__shpittoChatTaskStore;
}

function cleanupTasks() {
  const threshold = now() - TASK_TTL_MS;
  const store = getStore();
  for (const [taskId, record] of store.tasks.entries()) {
    if (record.updatedAt < threshold) {
      store.tasks.delete(taskId);
      if (store.activeTaskByChat.get(record.chatId) === taskId) {
        store.activeTaskByChat.delete(record.chatId);
      }
    }
  }
  for (const [chatId, messages] of store.messagesByChat.entries()) {
    const retained = messages.filter((item) => item.createdAt >= threshold);
    if (retained.length > 0) {
      store.messagesByChat.set(chatId, retained);
    } else {
      store.messagesByChat.delete(chatId);
    }
  }
  for (const [chatId, session] of store.sessionsByChat.entries()) {
    if (session.updatedAt < threshold) {
      store.sessionsByChat.delete(chatId);
    }
  }
}

type ChatSessionUpsertInput = {
  chatId: string;
  ownerUserId?: string;
  title?: string;
  archived?: boolean;
  pinned?: boolean;
  lastTaskId?: string;
  lastMessage?: string;
  lastMessageAt?: number;
};

function upsertMemorySession(input: ChatSessionUpsertInput): ChatSessionSummary {
  cleanupTasks();
  const store = getStore();
  const existing = store.sessionsByChat.get(input.chatId);
  const baseNow = now();
  const title = normalizeSessionTitle(
    input.title ?? existing?.title ?? deriveSessionTitleFromMessage(input.lastMessage),
    input.chatId,
  );
  const next: ChatSessionSummary = {
    id: input.chatId,
    ownerUserId: input.ownerUserId ?? existing?.ownerUserId,
    title,
    archived: typeof input.archived === "boolean" ? input.archived : Boolean(existing?.archived),
    pinned: typeof input.pinned === "boolean" ? input.pinned : Boolean(existing?.pinned),
    lastTaskId: input.lastTaskId ?? existing?.lastTaskId,
    lastMessage: input.lastMessage !== undefined ? summarizeMessage(input.lastMessage) : existing?.lastMessage,
    lastMessageAt: input.lastMessageAt ?? existing?.lastMessageAt,
    createdAt: existing?.createdAt || baseNow,
    updatedAt: baseNow,
  };
  store.sessionsByChat.set(input.chatId, next);
  return next;
}

async function upsertSupabaseSession(input: ChatSessionUpsertInput): Promise<ChatSessionSummary> {
  const supabase = mustGetSupabaseClient();
  const row: Record<string, unknown> = {
    id: input.chatId,
  };
  if (typeof input.ownerUserId === "string" && input.ownerUserId.trim()) {
    row.owner_user_id = input.ownerUserId.trim();
  }
  if (typeof input.title === "string") {
    row.title = normalizeSessionTitle(input.title, input.chatId);
  }
  if (typeof input.archived === "boolean") {
    row.archived = input.archived;
  }
  if (typeof input.pinned === "boolean") {
    row.pinned = input.pinned;
  }
  if (typeof input.lastTaskId === "string" && input.lastTaskId.trim()) {
    row.last_task_id = input.lastTaskId.trim();
  }
  if (typeof input.lastMessage === "string") {
    row.last_message = summarizeMessage(input.lastMessage) || null;
  }
  if (typeof input.lastMessageAt === "number" && Number.isFinite(input.lastMessageAt)) {
    row.last_message_at = asIso(input.lastMessageAt);
  }
  const { data, error } = await supabase
    .from(TASK_SESSIONS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Failed to upsert chat session.");
  return fromSessionRow(data as SupabaseChatSessionRow);
}

async function upsertChatSession(input: ChatSessionUpsertInput): Promise<ChatSessionSummary> {
  if (!isSupabaseTaskStoreEnabled()) {
    const session = upsertMemorySession(input);
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return session;
  }
  try {
    const session = await upsertSupabaseSession(input);
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return session;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

async function upsertChatSessionBestEffort(input: ChatSessionUpsertInput): Promise<void> {
  try {
    await upsertChatSession(input);
  } catch {
    // Best-effort session sync should never block core task flow.
  }
}

function createMemoryTask(chatId: string, ownerUserId?: string, initialResult?: ChatTaskResult): ChatTaskRecord {
  cleanupTasks();
  const store = getStore();
  const task: ChatTaskRecord = {
    id: crypto.randomUUID(),
    chatId,
    ownerUserId,
    status: "queued",
    createdAt: now(),
    updatedAt: now(),
    result: initialResult,
  };
  store.tasks.set(task.id, task);
  store.activeTaskByChat.set(chatId, task.id);
  upsertMemorySession({
    chatId,
    ownerUserId,
    lastTaskId: task.id,
  });
  return task;
}

function updateMemoryTask(taskId: string, patch: Partial<ChatTaskRecord>): ChatTaskRecord | undefined {
  const store = getStore();
  const existing = store.tasks.get(taskId);
  if (!existing) return undefined;
  const updated: ChatTaskRecord = { ...existing, ...patch, updatedAt: now() };
  store.tasks.set(taskId, updated);
  if (updated.status === "succeeded" || updated.status === "failed") {
    if (store.activeTaskByChat.get(existing.chatId) === taskId) {
      store.activeTaskByChat.delete(existing.chatId);
    }
  }
  return updated;
}

export async function createChatTask(
  chatId: string,
  ownerUserId?: string,
  initialResult?: ChatTaskResult,
): Promise<ChatTaskRecord> {
  if (!isSupabaseTaskStoreEnabled()) {
    return createMemoryTask(chatId, ownerUserId, initialResult);
  }

  try {
    const supabase = mustGetSupabaseClient();
    const taskId = crypto.randomUUID();
    const ts = now();
    const expiresAt = asIso(ts + TASK_TTL_MS);
    const { data, error } = await supabase
      .from(TASK_TABLE)
      .insert({
        id: taskId,
        chat_id: chatId,
        owner_user_id: ownerUserId || null,
        status: "queued",
        result: initialResult || null,
        created_at: asIso(ts),
        updated_at: asIso(ts),
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (error || !data) throw error || new Error("Failed to create chat task.");
    const task = fromRow(data as SupabaseTaskRow);
    await upsertChatSessionBestEffort({
      chatId: task.chatId,
      ownerUserId: ownerUserId || undefined,
      lastTaskId: task.id,
    });
    await writeTaskEventBestEffort({
      taskId: task.id,
      chatId: task.chatId,
      eventType: "task_created",
      stage: "queued",
      payload: { ownerUserId: ownerUserId || null },
    });
    return task;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export function sanitizeTaskResultForClient(result?: ChatTaskResult | null): ChatTaskResult | null {
  if (!result) return null;
  const { internal: _internal, ...rest } = result;
  return rest;
}

export async function claimNextQueuedChatTask(workerId: string): Promise<ChatTaskRecord | undefined> {
  const claimedAt = asIso(now());
  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const store = getStore();
    const queued = [...store.tasks.values()]
      .filter((task) => task.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt);
    const candidate = queued[0];
    if (!candidate) return undefined;
    const nextInternal = {
      ...(candidate.result?.internal || {}),
      workerId,
      claimedAt,
      claimAttempts: Number(candidate.result?.internal?.claimAttempts || 0) + 1,
    };
    return updateMemoryTask(candidate.id, {
      status: "running",
      result: {
        ...(candidate.result || {}),
        internal: nextInternal,
      },
    });
  }

  const supabase = mustGetSupabaseClient();
  try {
    const { data: claimedByRpc, error: rpcError } = await supabase.rpc("shpitto_claim_next_chat_task", {
      p_worker_id: workerId,
    });
    if (!rpcError && claimedByRpc) {
      const row = (Array.isArray(claimedByRpc) ? claimedByRpc[0] : claimedByRpc) as SupabaseTaskRow;
      if (row?.id) {
        const task = fromRow(row);
        await writeTaskEventBestEffort({
          taskId: task.id,
          chatId: task.chatId,
          eventType: "task_claimed",
          stage: "worker:claimed",
          payload: { workerId, claimMode: "rpc_skip_locked" },
        });
        return task;
      }
    }
  } catch {
    // fall back to optimistic select+update below when RPC is unavailable.
  }

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const { data: queued, error: queuedError } = await supabase
      .from(TASK_TABLE)
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (queuedError) throw withTaskStoreErrorContext(queuedError);
    if (!queued) return undefined;

    const row = queued as SupabaseTaskRow;
    const nextResult: ChatTaskResult = {
      ...(row.result || {}),
      internal: {
        ...((row.result || {})?.internal || {}),
        workerId,
        claimedAt,
        claimAttempts: Number((row.result || {})?.internal?.claimAttempts || 0) + 1,
      },
    };
    const { data: updated, error: updateError } = await supabase
      .from(TASK_TABLE)
      .update({
        status: "running",
        result: nextResult,
        updated_at: claimedAt,
      })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();
    if (updateError) throw withTaskStoreErrorContext(updateError);
    if (updated) {
      const task = fromRow(updated as SupabaseTaskRow);
      await writeTaskEventBestEffort({
        taskId: task.id,
        chatId: task.chatId,
        eventType: "task_claimed",
        stage: "worker:claimed",
        payload: { workerId, claimMode: "optimistic_update", attempt: attempt + 1 },
      });
      return task;
    }
  }
  return undefined;
}

export async function requeueStaleRunningTasks(maxIdleMs = 1000 * 60 * 10): Promise<number> {
  const cutoffTs = now() - Math.max(1, maxIdleMs);
  const cutoffIso = asIso(cutoffTs);

  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const store = getStore();
    let requeued = 0;
    for (const task of store.tasks.values()) {
      if (task.status !== "running") continue;
      if (task.updatedAt >= cutoffTs) continue;
      const existing = task.result || {};
      updateMemoryTask(task.id, {
        status: "queued",
        result: {
          ...existing,
          assistantText:
            existing.assistantText ||
            "Task was requeued after stale running timeout. Waiting for worker claim.",
          internal: {
            ...(existing.internal || {}),
            requeuedAt: asIso(now()),
            requeueReason: "stale-running-timeout",
          },
        },
      });
      requeued += 1;
    }
    return requeued;
  }

  const supabase = mustGetSupabaseClient();
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select("*")
    .eq("status", "running")
    .lt("updated_at", cutoffIso)
    .limit(200);
  if (error) throw withTaskStoreErrorContext(error);
  if (!Array.isArray(data) || data.length === 0) return 0;

  let requeued = 0;
  for (const row of data as SupabaseTaskRow[]) {
    const existing = row.result || {};
    const nextResult: ChatTaskResult = {
      ...existing,
      assistantText:
        existing.assistantText ||
        "Task was requeued after stale running timeout. Waiting for worker claim.",
      internal: {
        ...(existing.internal || {}),
        requeuedAt: asIso(now()),
        requeueReason: "stale-running-timeout",
      },
    };
    const { data: updated, error: updateError } = await supabase
      .from(TASK_TABLE)
      .update({
        status: "queued",
        result: nextResult,
        updated_at: asIso(now()),
      })
      .eq("id", row.id)
      .eq("status", "running")
      .select("id")
      .maybeSingle();
    if (updateError) throw withTaskStoreErrorContext(updateError);
    if (updated) requeued += 1;
  }

  return requeued;
}

function buildPendingTaskStatusMessage(task: ChatTaskRecord): string {
  const assistantText = String(task.result?.assistantText || "").trim();
  if (assistantText) return assistantText;
  if (task.status === "queued") {
    return "Generation task accepted. Queued for background worker execution.";
  }
  if (task.status === "running") {
    const stageMessage = String(task.result?.progress?.stageMessage || "").trim();
    return stageMessage || "Task is running in background. Please wait for completion.";
  }
  return `Task status synced: ${task.status}`;
}

function hasTaskStatusMessage(messages: ChatTimelineMessage[], task: ChatTaskRecord): boolean {
  const expectedStatus = String(task.status || "").trim();
  if (!expectedStatus) return true;
  return messages.some((message) => {
    if (message.taskId !== task.id) return false;
    if (message.role !== "assistant" && message.role !== "system") return false;
    const metadataStatus = String((message.metadata || ({} as any)).status || "").trim();
    return metadataStatus === expectedStatus;
  });
}

async function listPendingTasksForConsistency(limit: number, maxTaskAgeMs: number): Promise<ChatTaskRecord[]> {
  const safeLimit = Math.max(1, Math.min(300, Number(limit || 60)));
  const cutoffTs = now() - Math.max(60_000, Number(maxTaskAgeMs || 1000 * 60 * 60 * 6));

  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const pending = [...getStore().tasks.values()]
      .filter((task) => (task.status === "queued" || task.status === "running") && task.createdAt >= cutoffTs)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return pending.slice(0, safeLimit);
  }

  const supabase = mustGetSupabaseClient();
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select("*")
    .in("status", ["queued", "running"])
    .gte("created_at", asIso(cutoffTs))
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw withTaskStoreErrorContext(error);
  if (!Array.isArray(data)) return [];
  return (data as SupabaseTaskRow[]).map(fromRow);
}

export async function runChatTaskConsistencySweep(options: {
  limit?: number;
  maxTaskAgeMs?: number;
} = {}): Promise<ChatTaskConsistencySweepResult> {
  const pending = await listPendingTasksForConsistency(
    Number(options.limit || 60),
    Number(options.maxTaskAgeMs || 1000 * 60 * 60 * 6),
  );

  const messagesByChat = new Map<string, ChatTimelineMessage[]>();
  let sessionTouched = 0;
  let timelineRepaired = 0;

  for (const task of pending) {
    await upsertChatSessionBestEffort({
      chatId: task.chatId,
      ownerUserId: task.ownerUserId,
      lastTaskId: task.id,
    });
    sessionTouched += 1;

    let chatMessages = messagesByChat.get(task.chatId);
    if (!chatMessages) {
      chatMessages = await listChatTimelineMessages(task.chatId, 150);
      messagesByChat.set(task.chatId, chatMessages);
    }

    if (!hasTaskStatusMessage(chatMessages, task)) {
      const appended = await appendChatTimelineMessage({
        chatId: task.chatId,
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        role: "assistant",
        text: buildPendingTaskStatusMessage(task),
        metadata: {
          status: task.status,
          source: "consistency_sweep",
          stage: task.result?.progress?.stage || null,
        },
      });
      if (appended) {
        timelineRepaired += 1;
        chatMessages.push(appended);
      }
    }
  }

  return {
    scanned: pending.length,
    sessionTouched,
    timelineRepaired,
  };
}

async function updateSupabaseTask(taskId: string, values: Record<string, unknown>): Promise<ChatTaskRecord | undefined> {
  const supabase = mustGetSupabaseClient();
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .update({ ...values, updated_at: asIso(now()) })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    // PGRST116: no rows found
    if ((error as { code?: string }).code === "PGRST116") return undefined;
    throw error;
  }
  if (!data) return undefined;
  return fromRow(data as SupabaseTaskRow);
}

export async function markChatTaskRunning(taskId: string): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    return updateMemoryTask(taskId, { status: "running" });
  }

  try {
    return await updateSupabaseTask(taskId, { status: "running" });
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function completeChatTask(taskId: string, result: ChatTaskResult): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    const updated = updateMemoryTask(taskId, { status: "succeeded", result });
    if (updated && result.assistantText) {
      await appendChatTimelineMessage({
        chatId: updated.chatId,
        taskId: updated.id,
        ownerUserId: updated.ownerUserId,
        role: "assistant",
        text: result.assistantText,
        metadata: { status: "succeeded" },
      });
    }
    return updated;
  }

  try {
    const updated = await updateSupabaseTask(taskId, { status: "succeeded", result });
    if (updated) {
      await writeTaskEventBestEffort({
        taskId: updated.id,
        chatId: updated.chatId,
        eventType: "task_succeeded",
        stage: result.progress?.stage || "done",
        payload: {
          phase: result.phase || null,
          fileCount: result.progress?.fileCount || null,
          pageCount: result.progress?.pageCount || null,
          provider: result.progress?.provider || null,
          model: result.progress?.model || null,
        },
      });
      if (result.assistantText) {
        await appendChatTimelineMessage({
          chatId: updated.chatId,
          taskId: updated.id,
          ownerUserId: updated.ownerUserId,
          role: "assistant",
          text: result.assistantText,
          metadata: { status: "succeeded" },
        });
      }
    }
    return updated;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function updateChatTaskProgress(
  taskId: string,
  patch: ChatTaskResult,
): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    const existing = getStore().tasks.get(taskId);
    return updateMemoryTask(taskId, {
      status: "running",
      result: { ...(existing?.result || {}), ...patch },
    });
  }

  try {
    const current = await getChatTask(taskId);
    const merged = { ...(current?.result || {}), ...patch };
    const updated = await updateSupabaseTask(taskId, { status: "running", result: merged });
    if (updated) {
      await writeTaskEventBestEffort({
        taskId: updated.id,
        chatId: updated.chatId,
        eventType: "task_progress",
        stage: merged.progress?.stage || merged.phase || "running",
        payload: {
          phase: merged.phase || null,
          stage: merged.progress?.stage || null,
          filePath: merged.progress?.filePath || null,
          provider: merged.progress?.provider || null,
          model: merged.progress?.model || null,
          errorCode: merged.progress?.errorCode || null,
        },
      });
    }
    return updated;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function touchChatTaskHeartbeat(
  taskId: string,
  workerId?: string,
): Promise<ChatTaskRecord | undefined> {
  const heartbeatAt = asIso(now());
  if (!isSupabaseTaskStoreEnabled()) {
    const existing = getStore().tasks.get(taskId);
    return updateMemoryTask(taskId, {
      status: "running",
      result: {
        ...(existing?.result || {}),
        internal: {
          ...(existing?.result?.internal || {}),
          workerId: workerId || existing?.result?.internal?.workerId,
          heartbeatAt,
        },
      },
    });
  }

  try {
    const current = await getChatTask(taskId);
    const merged: ChatTaskResult = {
      ...(current?.result || {}),
      internal: {
        ...((current?.result || {})?.internal || {}),
        workerId: workerId || (current?.result || {})?.internal?.workerId,
        heartbeatAt,
      },
    };
    return await updateSupabaseTask(taskId, { status: "running", result: merged });
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function failChatTask(taskId: string, error: string): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    const existing = getStore().tasks.get(taskId);
    const updated = updateMemoryTask(taskId, {
      status: "failed",
      result: { ...(existing?.result || {}), error },
    });
    if (updated) {
      await appendChatTimelineMessage({
        chatId: updated.chatId,
        taskId: updated.id,
        ownerUserId: updated.ownerUserId,
        role: "assistant",
        text: `Task failed: ${error}`,
        metadata: { status: "failed" },
      });
    }
    return updated;
  }

  try {
    const current = await getChatTask(taskId);
    const merged = { ...(current?.result || {}), error };
    const updated = await updateSupabaseTask(taskId, { status: "failed", result: merged });
    if (updated) {
      await writeTaskEventBestEffort({
        taskId: updated.id,
        chatId: updated.chatId,
        eventType: "task_failed",
        stage: merged.progress?.stage || "failed",
        payload: { error },
      });
      await appendChatTimelineMessage({
        chatId: updated.chatId,
        taskId: updated.id,
        ownerUserId: updated.ownerUserId,
        role: "assistant",
        text: `Task failed: ${error}`,
        metadata: { status: "failed" },
      });
    }
    return updated;
  } catch (err) {
    throw withTaskStoreErrorContext(err);
  }
}

export async function getChatTask(taskId: string): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    return getStore().tasks.get(taskId);
  }

  try {
    const supabase = mustGetSupabaseClient();
    const { data, error } = await supabase.from(TASK_TABLE).select("*").eq("id", taskId).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fromRow(data as SupabaseTaskRow);
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function appendPendingEditToChatTask(
  taskId: string,
  input: {
    text: string;
    ownerUserId?: string;
    patchPlan?: unknown;
  },
): Promise<ChatTaskRecord | undefined> {
  const task = await getChatTask(taskId);
  if (!task) return undefined;
  const text = String(input.text || "").trim();
  if (!text) return task;

  const existing = Array.isArray(task.result?.internal?.pendingEdits)
    ? task.result?.internal?.pendingEdits || []
    : [];
  const pendingEdit: ChatTaskPendingEdit = {
    id: crypto.randomUUID(),
    text,
    createdAt: asIso(now()),
    ownerUserId: input.ownerUserId,
    patchPlan: input.patchPlan,
  };
  const result: ChatTaskResult = {
    ...(task.result || {}),
    internal: {
      ...(task.result?.internal || {}),
      pendingEdits: [...existing, pendingEdit].slice(-20),
    },
    progress: {
      ...(task.result?.progress || {}),
      pendingEditsCount: Math.min(existing.length + 1, 20),
    } as any,
  };

  if (!isSupabaseTaskStoreEnabled()) {
    return updateMemoryTask(taskId, {
      status: task.status,
      result,
    });
  }

  try {
    return await updateSupabaseTask(taskId, { status: task.status, result });
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function getActiveChatTask(chatId: string): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const taskId = getStore().activeTaskByChat.get(chatId);
    if (!taskId) return undefined;
    return getStore().tasks.get(taskId);
  }

  try {
    const supabase = mustGetSupabaseClient();
    const { data, error } = await supabase
      .from(TASK_TABLE)
      .select("*")
      .eq("chat_id", chatId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fromRow(data as SupabaseTaskRow);
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function getLatestChatTaskForChat(chatId: string): Promise<ChatTaskRecord | undefined> {
  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const records = [...getStore().tasks.values()].filter((item) => item.chatId === chatId);
    if (!records.length) return undefined;
    records.sort((a, b) => b.createdAt - a.createdAt);
    return records[0];
  }

  try {
    const supabase = mustGetSupabaseClient();
    const { data, error } = await supabase
      .from(TASK_TABLE)
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fromRow(data as SupabaseTaskRow);
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function getChatTaskEvents(taskId: string, limit = 100): Promise<SupabaseTaskEventRow[]> {
  if (!isSupabaseTaskStoreEnabled()) return [];
  try {
    const supabase = mustGetSupabaseClient();
    const { data, error } = await supabase
      .from(TASK_EVENTS_TABLE)
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
      .limit(Math.max(1, Math.min(500, limit)));
    if (error) return [];
    return Array.isArray(data) ? (data as SupabaseTaskEventRow[]) : [];
  } catch {
    return [];
  }
}

export async function appendChatTimelineMessage(input: {
  chatId: string;
  role: ChatTimelineRole;
  text: string;
  taskId?: string;
  ownerUserId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ChatTimelineMessage | undefined> {
  const chatId = String(input.chatId || "").trim();
  const text = String(input.text || "").trim();
  if (!chatId || !text) return undefined;

  const createdAt = now();
  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const store = getStore();
    const existing = store.messagesByChat.get(chatId) || [];
    const message: ChatTimelineMessage = {
      id: crypto.randomUUID(),
      chatId,
      taskId: input.taskId,
      ownerUserId: input.ownerUserId,
      role: input.role,
      text,
      metadata: input.metadata,
      createdAt,
    };
    store.messagesByChat.set(chatId, [...existing, message]);
    upsertMemorySession({
      chatId,
      ownerUserId: input.ownerUserId,
      lastMessage: message.text,
      lastMessageAt: createdAt,
    });
    return message;
  }

  try {
    const supabase = mustGetSupabaseClient();
    const { data, error } = await supabase
      .from(TASK_MESSAGES_TABLE)
      .insert({
        id: crypto.randomUUID(),
        chat_id: chatId,
        task_id: input.taskId || null,
        owner_user_id: input.ownerUserId || null,
        role: input.role,
        text,
        metadata: input.metadata || null,
        created_at: asIso(createdAt),
      })
      .select("*")
      .single();
    if (error || !data) throw error || new Error("Failed to append chat message.");
    const message = fromMessageRow(data as SupabaseChatMessageRow);
    await upsertChatSessionBestEffort({
      chatId,
      ownerUserId: input.ownerUserId,
      lastMessage: message.text,
      lastMessageAt: message.createdAt,
    });
    return message;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function listChatTimelineMessages(chatId: string, limit = 300): Promise<ChatTimelineMessage[]> {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) return [];

  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const existing = getStore().messagesByChat.get(normalizedChatId) || [];
    return existing.slice(-Math.max(1, Math.min(1000, limit)));
  }

  try {
    const supabase = mustGetSupabaseClient();
    const safeLimit = Math.max(1, Math.min(1000, limit));
    const { data, error } = await supabase
      .from(TASK_MESSAGES_TABLE)
      .select("*")
      .eq("chat_id", normalizedChatId)
      .order("created_at", { ascending: true })
      .limit(safeLimit);
    if (error) return [];
    return Array.isArray(data) ? (data as SupabaseChatMessageRow[]).map(fromMessageRow) : [];
  } catch {
    return [];
  }
}

type ListChatSessionsOptions = {
  includeArchived?: boolean;
  limit?: number;
};

function withTaskMetadataForSessions(sessions: ChatSessionSummary[]): ChatSessionSummary[] {
  if (!sessions.length) return [];
  const store = getStore();
  const tasksById = store.tasks;
  return sessions.map((session) => {
    const task = session.lastTaskId ? tasksById.get(session.lastTaskId) : undefined;
    return {
      ...session,
      lastStatus: task?.status || session.lastStatus,
      lastDeployedUrl: String(task?.result?.deployedUrl || "").trim() || session.lastDeployedUrl,
      updatedAt: Math.max(session.updatedAt, task?.updatedAt || 0, session.lastMessageAt || 0),
    };
  });
}

function sortSessions(items: ChatSessionSummary[]): ChatSessionSummary[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

async function hydrateSessionsWithSupabaseTasks(
  sessions: ChatSessionSummary[],
): Promise<ChatSessionSummary[]> {
  const taskIds = [...new Set(sessions.map((item) => item.lastTaskId).filter(Boolean) as string[])];
  if (!taskIds.length) return sessions;
  const supabase = mustGetSupabaseClient();
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select("id,status,result,updated_at")
    .in("id", taskIds);
  if (error || !Array.isArray(data)) return sessions;
  const metaByTaskId = new Map<string, { status?: ChatTaskStatus; deployedUrl?: string; updatedAt?: number }>();
  for (const row of data as Array<{ id: string; status: ChatTaskStatus; result: ChatTaskResult | null; updated_at: string }>) {
    metaByTaskId.set(row.id, {
      status: row.status,
      deployedUrl: String((row.result || {}).deployedUrl || "").trim() || undefined,
      updatedAt: Date.parse(row.updated_at),
    });
  }
  return sessions.map((session) => {
    const meta = session.lastTaskId ? metaByTaskId.get(session.lastTaskId) : undefined;
    return {
      ...session,
      lastStatus: meta?.status || session.lastStatus,
      lastDeployedUrl: meta?.deployedUrl || session.lastDeployedUrl,
      updatedAt: Math.max(session.updatedAt, meta?.updatedAt || 0, session.lastMessageAt || 0),
    };
  });
}

export async function listChatSessionsForOwner(
  ownerUserId: string,
  options: ListChatSessionsOptions = {},
): Promise<ChatSessionSummary[]> {
  const normalizedOwner = String(ownerUserId || "").trim();
  if (!normalizedOwner) return [];
  const includeArchived = options.includeArchived === true;
  const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));

  if (!isSupabaseTaskStoreEnabled()) {
    cleanupTasks();
    const sessions = [...getStore().sessionsByChat.values()].filter((session) => {
      if (session.ownerUserId !== normalizedOwner) return false;
      if (!includeArchived && session.archived) return false;
      return true;
    });
    return sortSessions(withTaskMetadataForSessions(sessions)).slice(0, limit);
  }

  try {
    const supabase = mustGetSupabaseClient();
    let query = supabase
      .from(TASK_SESSIONS_TABLE)
      .select("*")
      .eq("owner_user_id", normalizedOwner)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (!includeArchived) {
      query = query.eq("archived", false);
    }
    const { data, error } = await query;
    if (error) throw error;

    const baseSessions = Array.isArray(data) ? (data as SupabaseChatSessionRow[]).map(fromSessionRow) : [];
    const sessionsById = new Map(baseSessions.map((session) => [session.id, session] as const));

    // Backfill for old tasks that were created before session indexing existed.
    const { data: legacyTasks, error: legacyError } = await supabase
      .from(TASK_TABLE)
      .select("*")
      .eq("owner_user_id", normalizedOwner)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!legacyError && Array.isArray(legacyTasks)) {
      for (const row of legacyTasks as SupabaseTaskRow[]) {
        if (sessionsById.has(row.chat_id)) continue;
        sessionsById.set(row.chat_id, {
          id: row.chat_id,
          ownerUserId: row.owner_user_id || undefined,
          title: normalizeSessionTitle("", row.chat_id),
          archived: false,
          pinned: false,
          lastTaskId: row.id,
          lastStatus: row.status,
          lastDeployedUrl: String((row.result || {}).deployedUrl || "").trim() || undefined,
          createdAt: Date.parse(row.created_at),
          updatedAt: Date.parse(row.updated_at),
        });
      }
    }

    const hydrated = await hydrateSessionsWithSupabaseTasks([...sessionsById.values()]);
    return sortSessions(hydrated).slice(0, limit);
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}

export async function createChatSessionForOwner(params: {
  ownerUserId: string;
  title?: string;
  chatId?: string;
}): Promise<ChatSessionSummary> {
  const ownerUserId = String(params.ownerUserId || "").trim();
  if (!ownerUserId) throw new Error("ownerUserId is required.");
  const chatId = String(params.chatId || "").trim() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return upsertChatSession({
    chatId,
    ownerUserId,
    title: normalizeSessionTitle(params.title || "New Session", chatId),
    archived: false,
    pinned: false,
  });
}

export async function updateChatSessionForOwner(params: {
  chatId: string;
  ownerUserId: string;
  title?: string;
  archived?: boolean;
  pinned?: boolean;
}): Promise<ChatSessionSummary | undefined> {
  const chatId = String(params.chatId || "").trim();
  const ownerUserId = String(params.ownerUserId || "").trim();
  if (!chatId || !ownerUserId) return undefined;

  if (!isSupabaseTaskStoreEnabled()) {
    const existing = getStore().sessionsByChat.get(chatId);
    if (!existing || existing.ownerUserId !== ownerUserId) return undefined;
    return upsertMemorySession({
      chatId,
      ownerUserId,
      title: params.title ?? existing.title,
      archived: typeof params.archived === "boolean" ? params.archived : existing.archived,
      pinned: typeof params.pinned === "boolean" ? params.pinned : existing.pinned,
      lastTaskId: existing.lastTaskId,
      lastMessage: existing.lastMessage,
      lastMessageAt: existing.lastMessageAt,
    });
  }

  try {
    const supabase = mustGetSupabaseClient();
    const patch: Record<string, unknown> = {};
    if (typeof params.title === "string") {
      patch.title = normalizeSessionTitle(params.title, chatId);
    }
    if (typeof params.archived === "boolean") {
      patch.archived = params.archived;
    }
    if (typeof params.pinned === "boolean") {
      patch.pinned = params.pinned;
    }
    if (Object.keys(patch).length === 0) {
      const sessions = await listChatSessionsForOwner(ownerUserId, { includeArchived: true, limit: 200 });
      return sessions.find((item) => item.id === chatId);
    }
    const { data, error } = await supabase
      .from(TASK_SESSIONS_TABLE)
      .update(patch)
      .eq("id", chatId)
      .eq("owner_user_id", ownerUserId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const updated = fromSessionRow(data as SupabaseChatSessionRow);
    const [hydrated] = await hydrateSessionsWithSupabaseTasks([updated]);
    return hydrated;
  } catch (error) {
    throw withTaskStoreErrorContext(error);
  }
}
