import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export type ChatTaskStatus = "queued" | "running" | "succeeded" | "failed";

export type ChatTaskResult = {
  assistantText?: string;
  actions?: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  phase?: string;
  deployedUrl?: string;
  error?: string;
  internal?: {
    inputState?: any;
    workerId?: string;
    queuedAt?: string;
    claimedAt?: string;
    claimAttempts?: number;
    heartbeatAt?: string;
    requeuedAt?: string;
    requeueReason?: string;
    skillId?: string;
  };
  progress?: {
    stage?: string;
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

export type ChatTaskRecord = {
  id: string;
  chatId: string;
  status: ChatTaskStatus;
  createdAt: number;
  updatedAt: number;
  result?: ChatTaskResult;
  ownerUserId?: string;
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

const TASK_TTL_MS = 1000 * 60 * 60 * 2;
const TASK_TABLE = "shpitto_chat_tasks";
const TASK_EVENTS_TABLE = "shpitto_chat_task_events";

type TaskStore = {
  tasks: Map<string, ChatTaskRecord>;
  activeTaskByChat: Map<string, string>;
};

declare global {
  // eslint-disable-next-line no-var
  var __shpittoChatTaskStore: TaskStore | undefined;
}

function now() {
  return Date.now();
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

function withTaskStoreErrorContext(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("relation") && message.includes(TASK_TABLE)) {
    return new Error(
      `Supabase task table "${TASK_TABLE}" not found. Apply schema file apps/web/supabase/chat_tasks.sql first.`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function writeTaskEventBestEffort(params: {
  taskId: string;
  chatId: string;
  eventType: string;
  stage?: string;
  payload?: Record<string, unknown>;
}) {
  if (!isSupabaseTaskStoreEnabled()) return;
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
  } catch {
    // Best-effort logging; do not block task execution.
  }
}

function getStore(): TaskStore {
  if (!globalThis.__shpittoChatTaskStore) {
    globalThis.__shpittoChatTaskStore = {
      tasks: new Map<string, ChatTaskRecord>(),
      activeTaskByChat: new Map<string, string>(),
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
    return updateMemoryTask(taskId, { status: "succeeded", result });
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
    return updateMemoryTask(taskId, {
      status: "failed",
      result: { ...(existing?.result || {}), error },
    });
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
