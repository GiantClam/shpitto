import fs from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { InMemoryStore, MemorySaver, emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "../supabase/admin.ts";
import type { ChatIntent, ConversationStage, RequirementSlot, RequirementSpec } from "./chat-orchestrator.ts";

export type ChatRevisionPointer = {
  revisionId: string;
  baseRevisionId?: string;
  mode: "generate" | "refine" | "deploy";
  taskId?: string;
  checkpointProjectPath?: string;
  deployedUrl?: string;
  requirementRevision?: number;
  updatedAt: string;
};

export type ChatRequirementState = {
  slots: RequirementSlot[];
  conflicts: string[];
  missingCriticalSlots: string[];
  readyScore: number;
  activeScope?: string;
  assumptions: string[];
  currentValues: RequirementSpec;
};

export type ChatShortTermMemorySnapshot = {
  threadId: string;
  stage: ConversationStage;
  intent?: ChatIntent;
  intentConfidence?: number;
  recentSummary?: string;
  activeScope?: string;
  revisionPointer: ChatRevisionPointer;
  requirementState: ChatRequirementState;
  workflowContext?: Record<string, unknown>;
  updatedAt: string;
};

export type ChatLongTermPreferenceSnapshot = {
  ownerUserId: string;
  preferredLocale?: RequirementSpec["locale"];
  primaryVisualDirection?: string;
  secondaryVisualTags?: string[];
  deploymentProvider?: string;
  deploymentDomain?: string;
  targetAudience?: string[];
  tone?: string;
  updatedAt: string;
};

type ChatMemoryDiskState = {
  threads: Record<string, ChatShortTermMemorySnapshot>;
  preferences: Record<string, ChatLongTermPreferenceSnapshot>;
};

type ChatMemoryBackendKind = "file" | "supabase";

type ChatMemoryBackend = {
  kind: ChatMemoryBackendKind;
  readShortTerm(threadId: string): Promise<ChatShortTermMemorySnapshot | undefined>;
  writeShortTerm(snapshot: ChatShortTermMemorySnapshot): Promise<void>;
  readLongTerm(ownerUserId: string): Promise<ChatLongTermPreferenceSnapshot | undefined>;
  writeLongTerm(snapshot: ChatLongTermPreferenceSnapshot): Promise<void>;
  resetForTests(): Promise<void>;
};

type SupabaseThreadMemoryRow = {
  thread_id: string;
  stage: ConversationStage;
  intent: ChatIntent | null;
  intent_confidence: number | null;
  recent_summary: string | null;
  active_scope: string | null;
  revision_pointer: ChatRevisionPointer;
  requirement_state: ChatRequirementState;
  workflow_context: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type SupabaseLongTermPreferenceRow = {
  owner_user_id: string;
  preferred_locale: string | null;
  primary_visual_direction: string | null;
  secondary_visual_tags: string[] | null;
  deployment_provider: string | null;
  deployment_domain: string | null;
  target_audience: string[] | null;
  tone: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

const THREAD_NAMESPACE = "chat-orchestrator-memory";
const PREFERENCE_NAMESPACE = ["chat", "preferences"];
const MEMORY_DIR = path.resolve(process.cwd(), ".tmp", "chat-memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "langgraph-chat-memory.json");
const THREAD_MEMORY_TABLE = "shpitto_chat_thread_memory";
const USER_PREFERENCE_TABLE = "shpitto_chat_user_preferences";

let memorySaver = new MemorySaver();
let preferenceStore = new InMemoryStore();

let hydrated = false;
let hydratePromise: Promise<void> | undefined;
let persistQueue: Promise<void> = Promise.resolve();
let diskState: ChatMemoryDiskState = {
  threads: {},
  preferences: {},
};

let cachedBackendKind: ChatMemoryBackendKind | undefined;
let cachedBackend: ChatMemoryBackend | undefined;
let supabaseClient: any;
let supabaseClientKey = "";

function checkpointConfig(threadId: string): RunnableConfig {
  return {
    configurable: {
      thread_id: threadId,
      checkpoint_ns: THREAD_NAMESPACE,
    },
  };
}

function summarizeText(value: string, max = 500): string {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function normalizeLocale(value: unknown): RequirementSpec["locale"] | undefined {
  const normalized = cleanText(value);
  if (normalized === "zh-CN" || normalized === "en" || normalized === "bilingual") return normalized;
  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function cloneRequirementState(state: ChatRequirementState): ChatRequirementState {
  return JSON.parse(JSON.stringify(state)) as ChatRequirementState;
}

function cloneShortTermSnapshot(snapshot: ChatShortTermMemorySnapshot): ChatShortTermMemorySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ChatShortTermMemorySnapshot;
}

function cloneLongTermSnapshot(snapshot: ChatLongTermPreferenceSnapshot): ChatLongTermPreferenceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ChatLongTermPreferenceSnapshot;
}

function normalizeShortTermSnapshot(snapshot: ChatShortTermMemorySnapshot): ChatShortTermMemorySnapshot {
  return {
    ...cloneShortTermSnapshot(snapshot),
    threadId: String(snapshot.threadId || "").trim(),
    stage: snapshot.stage,
    intent: snapshot.intent,
    intentConfidence:
      Number.isFinite(Number(snapshot.intentConfidence)) ? Number(snapshot.intentConfidence) : undefined,
    recentSummary: summarizeText(snapshot.recentSummary || ""),
    activeScope: cleanText(snapshot.activeScope),
    revisionPointer: {
      ...snapshot.revisionPointer,
      revisionId: String(snapshot.revisionPointer?.revisionId || "").trim(),
      baseRevisionId: cleanText(snapshot.revisionPointer?.baseRevisionId),
      taskId: cleanText(snapshot.revisionPointer?.taskId),
      checkpointProjectPath: cleanText(snapshot.revisionPointer?.checkpointProjectPath),
      deployedUrl: cleanText(snapshot.revisionPointer?.deployedUrl),
      requirementRevision:
        Number.isFinite(Number(snapshot.revisionPointer?.requirementRevision))
          ? Number(snapshot.revisionPointer?.requirementRevision)
          : undefined,
      updatedAt: cleanText(snapshot.revisionPointer?.updatedAt) || new Date().toISOString(),
    },
    requirementState: cloneRequirementState(snapshot.requirementState),
    workflowContext: isRecord(snapshot.workflowContext)
      ? (JSON.parse(JSON.stringify(snapshot.workflowContext)) as Record<string, unknown>)
      : undefined,
    updatedAt: cleanText(snapshot.updatedAt) || new Date().toISOString(),
  };
}

function mergeLongTermPreferenceSnapshots(
  existing: ChatLongTermPreferenceSnapshot | undefined,
  incoming: ChatLongTermPreferenceSnapshot,
): ChatLongTermPreferenceSnapshot {
  const ownerUserId = String(incoming.ownerUserId || existing?.ownerUserId || "").trim();
  const merged: ChatLongTermPreferenceSnapshot = {
    ownerUserId,
    preferredLocale: normalizeLocale(incoming.preferredLocale) || normalizeLocale(existing?.preferredLocale),
    primaryVisualDirection:
      cleanText(incoming.primaryVisualDirection) || cleanText(existing?.primaryVisualDirection),
    secondaryVisualTags: normalizeStringArray(incoming.secondaryVisualTags) || normalizeStringArray(existing?.secondaryVisualTags),
    deploymentProvider:
      cleanText(incoming.deploymentProvider) || cleanText(existing?.deploymentProvider),
    deploymentDomain: cleanText(incoming.deploymentDomain) || cleanText(existing?.deploymentDomain),
    targetAudience: normalizeStringArray(incoming.targetAudience) || normalizeStringArray(existing?.targetAudience),
    tone: cleanText(incoming.tone) || cleanText(existing?.tone),
    updatedAt: cleanText(incoming.updatedAt) || new Date().toISOString(),
  };
  return merged;
}

function normalizeLongTermSnapshot(
  snapshot: ChatLongTermPreferenceSnapshot,
  existing?: ChatLongTermPreferenceSnapshot,
): ChatLongTermPreferenceSnapshot {
  return mergeLongTermPreferenceSnapshots(existing, cloneLongTermSnapshot(snapshot));
}

function cloneDiskState(): ChatMemoryDiskState {
  return JSON.parse(JSON.stringify(diskState)) as ChatMemoryDiskState;
}

async function persistDiskState(): Promise<void> {
  const snapshot = cloneDiskState();
  persistQueue = persistQueue.then(async () => {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    try {
      await fs.writeFile(MEMORY_FILE, JSON.stringify(snapshot, null, 2), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      await fs.writeFile(MEMORY_FILE, JSON.stringify(snapshot, null, 2), "utf8");
    }
  });
  await persistQueue;
}

async function ensureFileHydrated(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await fs.readFile(MEMORY_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (isRecord(parsed)) {
          diskState = {
            threads: isRecord(parsed.threads) ? (parsed.threads as Record<string, ChatShortTermMemorySnapshot>) : {},
            preferences: isRecord(parsed.preferences)
              ? (parsed.preferences as Record<string, ChatLongTermPreferenceSnapshot>)
              : {},
          };
        }
      } catch {
        diskState = { threads: {}, preferences: {} };
      }

      for (const [threadId, snapshot] of Object.entries(diskState.threads || {})) {
        const checkpoint = emptyCheckpoint();
        checkpoint.channel_values.short_term_memory = normalizeShortTermSnapshot(snapshot);
        await memorySaver.put(
          checkpointConfig(threadId),
          checkpoint,
          { source: "update", step: 0, parents: {}, updatedAt: snapshot.updatedAt } as any,
        );
      }

      for (const [ownerUserId, snapshot] of Object.entries(diskState.preferences || {})) {
        await preferenceStore.put(
          PREFERENCE_NAMESPACE,
          ownerUserId,
          normalizeLongTermSnapshot(snapshot) as unknown as Record<string, any>,
        );
      }

      hydrated = true;
    })();
  }
  await hydratePromise;
}

function getSupabaseClient() {
  const config = getSupabaseAdminConfig();
  if (!config) {
    throw new Error("Supabase is not configured for chat memory.");
  }
  const clientKey = `${config.supabaseUrl}|${config.serviceRoleKey}`;
  if (supabaseClient && supabaseClientKey === clientKey) return supabaseClient;
  supabaseClient = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  supabaseClientKey = clientKey;
  return supabaseClient;
}

function resolveBackendKind(): ChatMemoryBackendKind {
  const raw = String(process.env.CHAT_MEMORY_BACKEND || "file").trim().toLowerCase();
  return raw === "supabase" ? "supabase" : "file";
}

function isUniqueViolation(error: unknown): boolean {
  const anyError = (error || {}) as { code?: string; status?: number; message?: string };
  return anyError.code === "23505" || anyError.status === 409;
}

function fromThreadRow(row: SupabaseThreadMemoryRow): ChatShortTermMemorySnapshot {
  return normalizeShortTermSnapshot({
    threadId: row.thread_id,
    stage: row.stage,
    intent: row.intent || undefined,
    intentConfidence: Number.isFinite(Number(row.intent_confidence)) ? Number(row.intent_confidence) : undefined,
    recentSummary: row.recent_summary || undefined,
    activeScope: row.active_scope || undefined,
    revisionPointer: row.revision_pointer,
    requirementState: row.requirement_state,
    workflowContext: row.workflow_context || undefined,
    updatedAt: row.updated_at,
  });
}

function toThreadInsertRow(snapshot: ChatShortTermMemorySnapshot, version: number): Record<string, unknown> {
  return {
    thread_id: snapshot.threadId,
    stage: snapshot.stage,
    intent: snapshot.intent || null,
    intent_confidence: snapshot.intentConfidence ?? null,
    recent_summary: snapshot.recentSummary || null,
    active_scope: snapshot.activeScope || null,
    revision_pointer: snapshot.revisionPointer,
    requirement_state: snapshot.requirementState,
    workflow_context: snapshot.workflowContext || null,
    version,
    updated_at: snapshot.updatedAt,
  };
}

function toThreadUpdateRow(snapshot: ChatShortTermMemorySnapshot, version: number): Record<string, unknown> {
  const row = toThreadInsertRow(snapshot, version);
  delete row.thread_id;
  return row;
}

function fromPreferenceRow(row: SupabaseLongTermPreferenceRow): ChatLongTermPreferenceSnapshot {
  return normalizeLongTermSnapshot({
    ownerUserId: row.owner_user_id,
    preferredLocale: normalizeLocale(row.preferred_locale),
    primaryVisualDirection: row.primary_visual_direction || undefined,
    secondaryVisualTags: row.secondary_visual_tags || undefined,
    deploymentProvider: row.deployment_provider || undefined,
    deploymentDomain: row.deployment_domain || undefined,
    targetAudience: row.target_audience || undefined,
    tone: row.tone || undefined,
    updatedAt: row.updated_at,
  });
}

function toPreferenceInsertRow(snapshot: ChatLongTermPreferenceSnapshot, version: number): Record<string, unknown> {
  return {
    owner_user_id: snapshot.ownerUserId,
    preferred_locale: snapshot.preferredLocale || null,
    primary_visual_direction: snapshot.primaryVisualDirection || null,
    secondary_visual_tags: snapshot.secondaryVisualTags || [],
    deployment_provider: snapshot.deploymentProvider || null,
    deployment_domain: snapshot.deploymentDomain || null,
    target_audience: snapshot.targetAudience || [],
    tone: snapshot.tone || null,
    version,
    updated_at: snapshot.updatedAt,
  };
}

function toPreferenceUpdateRow(snapshot: ChatLongTermPreferenceSnapshot, version: number): Record<string, unknown> {
  const row = toPreferenceInsertRow(snapshot, version);
  delete row.owner_user_id;
  return row;
}

async function readSupabaseThreadMemory(threadId: string): Promise<{ snapshot?: ChatShortTermMemorySnapshot; version?: number }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(THREAD_MEMORY_TABLE)
    .select("*")
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return {};
  const row = data as SupabaseThreadMemoryRow;
  return { snapshot: fromThreadRow(row), version: Number(row.version || 0) };
}

async function readSupabaseLongTermPreferences(
  ownerUserId: string,
): Promise<{ snapshot?: ChatLongTermPreferenceSnapshot; version?: number }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(USER_PREFERENCE_TABLE)
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return {};
  const row = data as SupabaseLongTermPreferenceRow;
  return { snapshot: fromPreferenceRow(row), version: Number(row.version || 0) };
}

const fileBackend: ChatMemoryBackend = {
  kind: "file",
  async readShortTerm(threadId) {
    const normalized = String(threadId || "").trim();
    if (!normalized) return undefined;
    await ensureFileHydrated();
    const checkpoint = await memorySaver.get(checkpointConfig(normalized));
    const fromCheckpoint = checkpoint?.channel_values?.short_term_memory;
    if (isRecord(fromCheckpoint)) {
      return fromCheckpoint as ChatShortTermMemorySnapshot;
    }
    const snapshot = diskState.threads[normalized];
    return snapshot ? normalizeShortTermSnapshot(snapshot) : undefined;
  },
  async writeShortTerm(snapshot) {
    const normalizedSnapshot = normalizeShortTermSnapshot(snapshot);
    if (!normalizedSnapshot.threadId) return;
    await ensureFileHydrated();
    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values.short_term_memory = normalizedSnapshot;
    await memorySaver.put(
      checkpointConfig(normalizedSnapshot.threadId),
      checkpoint,
      {
        source: "update",
        step: 0,
        parents: {},
        stage: normalizedSnapshot.stage,
        intent: normalizedSnapshot.intent,
        updatedAt: normalizedSnapshot.updatedAt,
      } as any,
    );
    diskState.threads[normalizedSnapshot.threadId] = normalizedSnapshot;
    await persistDiskState();
  },
  async readLongTerm(ownerUserId) {
    const normalized = String(ownerUserId || "").trim();
    if (!normalized) return undefined;
    await ensureFileHydrated();
    const item = await preferenceStore.get(PREFERENCE_NAMESPACE, normalized);
    if (item?.value && isRecord(item.value)) {
      return normalizeLongTermSnapshot(item.value as ChatLongTermPreferenceSnapshot);
    }
    const snapshot = diskState.preferences[normalized];
    return snapshot ? normalizeLongTermSnapshot(snapshot) : undefined;
  },
  async writeLongTerm(snapshot) {
    const ownerUserId = String(snapshot.ownerUserId || "").trim();
    if (!ownerUserId) return;
    await ensureFileHydrated();
    const existing = diskState.preferences[ownerUserId];
    const normalizedSnapshot = normalizeLongTermSnapshot(snapshot, existing);
    await preferenceStore.put(
      PREFERENCE_NAMESPACE,
      ownerUserId,
      normalizedSnapshot as unknown as Record<string, any>,
    );
    diskState.preferences[ownerUserId] = normalizedSnapshot;
    await persistDiskState();
  },
  async resetForTests() {
    hydrated = false;
    hydratePromise = undefined;
    diskState = { threads: {}, preferences: {} };
    memorySaver = new MemorySaver();
    preferenceStore = new InMemoryStore();
    await persistQueue.catch(() => undefined);
    persistQueue = Promise.resolve();
    await fs.rm(MEMORY_DIR, { recursive: true, force: true }).catch(() => undefined);
  },
};

const supabaseBackend: ChatMemoryBackend = {
  kind: "supabase",
  async readShortTerm(threadId) {
    const normalized = String(threadId || "").trim();
    if (!normalized) return undefined;
    const { snapshot } = await readSupabaseThreadMemory(normalized);
    return snapshot;
  },
  async writeShortTerm(snapshot) {
    const normalizedSnapshot = normalizeShortTermSnapshot(snapshot);
    if (!normalizedSnapshot.threadId) return;
    const client = getSupabaseClient();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await readSupabaseThreadMemory(normalizedSnapshot.threadId);
      if (!current.snapshot) {
        const { error } = await client
          .from(THREAD_MEMORY_TABLE)
          .insert(toThreadInsertRow(normalizedSnapshot, 1))
          .select("*")
          .single();
        if (!error) return;
        if (isUniqueViolation(error)) continue;
        throw error;
      }

      const { data, error } = await client
        .from(THREAD_MEMORY_TABLE)
        .update(toThreadUpdateRow(normalizedSnapshot, (current.version || 0) + 1))
        .eq("thread_id", normalizedSnapshot.threadId)
        .eq("version", current.version || 0)
        .select("*");
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) return;
    }
    throw new Error(`Failed to write shared chat thread memory for ${normalizedSnapshot.threadId} after retries.`);
  },
  async readLongTerm(ownerUserId) {
    const normalized = String(ownerUserId || "").trim();
    if (!normalized) return undefined;
    const { snapshot } = await readSupabaseLongTermPreferences(normalized);
    return snapshot;
  },
  async writeLongTerm(snapshot) {
    const ownerUserId = String(snapshot.ownerUserId || "").trim();
    if (!ownerUserId) return;
    const client = getSupabaseClient();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await readSupabaseLongTermPreferences(ownerUserId);
      const merged = normalizeLongTermSnapshot(snapshot, current.snapshot);
      if (!current.snapshot) {
        const { error } = await client
          .from(USER_PREFERENCE_TABLE)
          .insert(toPreferenceInsertRow(merged, 1))
          .select("*")
          .single();
        if (!error) return;
        if (isUniqueViolation(error)) continue;
        throw error;
      }

      const { data, error } = await client
        .from(USER_PREFERENCE_TABLE)
        .update(toPreferenceUpdateRow(merged, (current.version || 0) + 1))
        .eq("owner_user_id", ownerUserId)
        .eq("version", current.version || 0)
        .select("*");
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) return;
    }
    throw new Error(`Failed to write shared chat preferences for ${ownerUserId} after retries.`);
  },
  async resetForTests() {
    supabaseClient = undefined;
    supabaseClientKey = "";
    memorySaver = new MemorySaver();
    preferenceStore = new InMemoryStore();
    hydrated = false;
    hydratePromise = undefined;
    diskState = { threads: {}, preferences: {} };
    await persistQueue.catch(() => undefined);
    persistQueue = Promise.resolve();
  },
};

function getBackend(): ChatMemoryBackend {
  const kind = resolveBackendKind();
  if (cachedBackend && cachedBackendKind === kind) return cachedBackend;
  cachedBackendKind = kind;
  cachedBackend = kind === "supabase" ? supabaseBackend : fileBackend;
  return cachedBackend;
}

export async function readChatShortTermMemory(threadId: string): Promise<ChatShortTermMemorySnapshot | undefined> {
  return getBackend().readShortTerm(threadId);
}

export async function writeChatShortTermMemory(snapshot: ChatShortTermMemorySnapshot): Promise<void> {
  await getBackend().writeShortTerm(snapshot);
}

export async function readChatLongTermPreferences(
  ownerUserId: string,
): Promise<ChatLongTermPreferenceSnapshot | undefined> {
  return getBackend().readLongTerm(ownerUserId);
}

export async function writeChatLongTermPreferences(snapshot: ChatLongTermPreferenceSnapshot): Promise<void> {
  await getBackend().writeLongTerm(snapshot);
}

export async function resetChatLangGraphMemoryForTests(): Promise<void> {
  cachedBackend = undefined;
  cachedBackendKind = undefined;
  await fileBackend.resetForTests();
  await supabaseBackend.resetForTests();
}
