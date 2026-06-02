import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdminConfig } from "../supabase/admin.ts";
import { normalizeWorkflowRuntimeState, type WorkflowRuntimeState } from "./workflow-state.ts";

export type PersistedWorkflowRuntimeSnapshot = {
  version: 1;
  runtime: WorkflowRuntimeState;
  state?: unknown;
  sessionState?: unknown;
  metadata?: Record<string, unknown>;
  savedAt: string;
};

export type WorkflowStoreBackendKind = "file" | "supabase";

type WorkflowStoreBackendPreference = WorkflowStoreBackendKind | "auto";

type WorkflowRunRow = {
  workflow_id: string;
  chat_id: string | null;
  task_id: string | null;
  execution_mode: string;
  status: string;
  contract_hash: string | null;
  generation_lane: string | null;
  website_surface_mode: string | null;
  snapshot: PersistedWorkflowRuntimeSnapshot;
  created_at?: string | null;
  updated_at?: string | null;
};

const WORKFLOW_RUNS_TABLE = "shpitto_workflow_runs";

let cachedSupabaseClient: any;
let cachedSupabaseClientKey = "";

function nowIso() {
  return new Date().toISOString();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveWorkflowStoreBackendPreference(): WorkflowStoreBackendPreference {
  const raw = String(process.env.SHPITTO_WORKFLOW_RUNTIME_BACKEND || process.env.WORKFLOW_RUNTIME_BACKEND || "auto")
    .trim()
    .toLowerCase();
  if (raw === "file") return "file";
  if (raw === "supabase") return "supabase";
  return "auto";
}

function resolveWorkflowStoreBackendKind(): WorkflowStoreBackendKind {
  const preference = resolveWorkflowStoreBackendPreference();
  if (preference === "file" || preference === "supabase") return preference;
  return getSupabaseAdminConfig() ? "supabase" : "file";
}

function mustGetSupabaseClient() {
  const config = getSupabaseAdminConfig();
  if (!config) throw new Error("Supabase is not configured for workflow runtime persistence.");
  const clientKey = `${config.supabaseUrl}|${config.serviceRoleKey}`;
  if (cachedSupabaseClient && cachedSupabaseClientKey === clientKey) {
    return cachedSupabaseClient;
  }
  cachedSupabaseClient = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  cachedSupabaseClientKey = clientKey;
  return cachedSupabaseClient;
}

function normalizeSnapshot(value: unknown): PersistedWorkflowRuntimeSnapshot | null {
  const parsed = value as PersistedWorkflowRuntimeSnapshot | undefined;
  if (Number((parsed as any)?.version || 0) !== 1) return null;
  const runtime = normalizeWorkflowRuntimeState((parsed as any)?.runtime);
  if (!runtime) return null;
  return {
    version: 1,
    runtime,
    ...(parsed?.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed?.sessionState !== undefined ? { sessionState: parsed.sessionState } : {}),
    ...(parsed?.metadata && typeof parsed.metadata === "object" ? { metadata: toRecord(parsed.metadata) } : {}),
    savedAt: String((parsed as any)?.savedAt || "").trim() || nowIso(),
  };
}

function workflowIdFromCheckpointDir(checkpointDir: string) {
  return path.basename(path.resolve(checkpointDir));
}

async function persistWorkflowSnapshotToFile(params: {
  checkpointDir: string;
  snapshot: PersistedWorkflowRuntimeSnapshot;
}) {
  const checkpointDir = path.resolve(params.checkpointDir);
  await fs.mkdir(checkpointDir, { recursive: true });
  const filePath = path.join(checkpointDir, "workflow-runtime.json");
  await fs.writeFile(filePath, JSON.stringify(params.snapshot, null, 2), "utf8");
  return filePath;
}

async function readWorkflowSnapshotFromFile(checkpointDir: string): Promise<PersistedWorkflowRuntimeSnapshot | null> {
  const filePath = path.join(path.resolve(checkpointDir), "workflow-runtime.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeSnapshot(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function persistWorkflowSnapshotToSupabase(params: {
  snapshot: PersistedWorkflowRuntimeSnapshot;
}) {
  const supabase = mustGetSupabaseClient();
  const row: WorkflowRunRow = {
    workflow_id: params.snapshot.runtime.workflowId,
    chat_id: params.snapshot.runtime.chatId || null,
    task_id: params.snapshot.runtime.taskId || null,
    execution_mode: params.snapshot.runtime.executionMode,
    status: params.snapshot.runtime.status,
    contract_hash: params.snapshot.runtime.contractHash || null,
    generation_lane: params.snapshot.runtime.generationLane || null,
    website_surface_mode: params.snapshot.runtime.websiteSurfaceMode || null,
    snapshot: params.snapshot,
  };
  const { error } = await supabase.from(WORKFLOW_RUNS_TABLE).upsert(row, { onConflict: "workflow_id" });
  if (error) {
    throw new Error(
      `Supabase workflow runtime persistence failed. Apply schema file apps/web/supabase/workflow_runs.sql first. (${String(
        error.message || error,
      )})`,
    );
  }
}

async function readWorkflowSnapshotFromSupabase(checkpointDir: string): Promise<PersistedWorkflowRuntimeSnapshot | null> {
  const supabase = mustGetSupabaseClient();
  const workflowId = workflowIdFromCheckpointDir(checkpointDir);
  const { data, error } = await supabase
    .from(WORKFLOW_RUNS_TABLE)
    .select("snapshot")
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase workflow runtime read failed: ${String(error.message || error)}`);
  }
  return normalizeSnapshot((data as { snapshot?: unknown } | null)?.snapshot);
}

export function resolveWorkflowRuntimeCheckpointDir(params: {
  chatId?: string;
  taskId?: string;
  workflowId?: string;
  rootDir?: string;
}) {
  const rootDir = path.resolve(params.rootDir || path.resolve(process.cwd(), ".tmp", "workflows"));
  const chatId = String(params.chatId || "unknown-chat").trim() || "unknown-chat";
  const taskId = String(params.taskId || "").trim();
  const workflowId = String(params.workflowId || "unknown-workflow").trim() || "unknown-workflow";
  return taskId
    ? path.join(rootDir, chatId, taskId, workflowId)
    : path.join(rootDir, chatId, workflowId);
}

export async function persistWorkflowRuntimeSnapshot(params: {
  checkpointDir: string;
  runtime: WorkflowRuntimeState;
  state?: unknown;
  sessionState?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const snapshot: PersistedWorkflowRuntimeSnapshot = {
    version: 1,
    runtime: params.runtime,
    ...(params.state !== undefined ? { state: params.state } : {}),
    ...(params.sessionState !== undefined ? { sessionState: params.sessionState } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
    savedAt: nowIso(),
  };

  const backend = resolveWorkflowStoreBackendKind();
  const filePath = await persistWorkflowSnapshotToFile({
    checkpointDir: params.checkpointDir,
    snapshot,
  });

  if (backend === "supabase") {
    try {
      await persistWorkflowSnapshotToSupabase({ snapshot });
    } catch (error) {
      if (resolveWorkflowStoreBackendPreference() === "supabase") throw error;
      console.warn(
        `[workflow-store] supabase persistence failed; retained local snapshot fallback (${String(
          (error as Error)?.message || error || "unknown error",
        )}).`,
      );
    }
  }

  return filePath;
}

export async function readPersistedWorkflowRuntimeSnapshot(checkpointDir: string): Promise<PersistedWorkflowRuntimeSnapshot | null> {
  const fileSnapshot = await readWorkflowSnapshotFromFile(checkpointDir);
  if (fileSnapshot) return fileSnapshot;
  if (resolveWorkflowStoreBackendKind() !== "supabase") return null;
  try {
    return await readWorkflowSnapshotFromSupabase(checkpointDir);
  } catch (error) {
    if (resolveWorkflowStoreBackendPreference() === "supabase") throw error;
    console.warn(
      `[workflow-store] supabase read failed; no local snapshot available (${String(
        (error as Error)?.message || error || "unknown error",
      )}).`,
    );
    return null;
  }
}

export async function readPersistedWorkflowRuntime(checkpointDir: string): Promise<WorkflowRuntimeState | null> {
  const snapshot = await readPersistedWorkflowRuntimeSnapshot(checkpointDir);
  return snapshot?.runtime || null;
}

export function resetWorkflowStoreForTesting() {
  cachedSupabaseClient = undefined;
  cachedSupabaseClientKey = "";
}
