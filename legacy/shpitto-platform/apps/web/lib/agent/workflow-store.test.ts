import fs from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildExecutionWorkflowRuntime } from "./workflow-runtime-adapter.ts";

const upsertMock = vi.fn();
const maybeSingleMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe("workflow store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SHPITTO_WORKFLOW_RUNTIME_BACKEND;
    delete process.env.WORKFLOW_RUNTIME_BACKEND;
  });

  it("persists and reloads a workflow runtime snapshot", async () => {
    const {
      persistWorkflowRuntimeSnapshot,
      readPersistedWorkflowRuntime,
      readPersistedWorkflowRuntimeSnapshot,
      resolveWorkflowRuntimeCheckpointDir,
    } = await import("./workflow-store.ts");
    const runtime = buildExecutionWorkflowRuntime({
      chatId: "chat-42",
      executionMode: "deploy",
      contractHash: "a".repeat(64),
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      sourceTaskId: "preview-task",
    });
    const checkpointDir = resolveWorkflowRuntimeCheckpointDir({
      chatId: "chat-42",
      taskId: "task-42",
      workflowId: runtime.workflowId,
      rootDir: path.resolve(process.cwd(), ".tmp", "workflow-store-vitest"),
    });
    await fs.rm(path.dirname(path.dirname(checkpointDir)), { recursive: true, force: true });

    await persistWorkflowRuntimeSnapshot({
      checkpointDir,
      runtime,
      state: { workflow_context: { workflowRuntime: runtime } },
      metadata: { source: "vitest" },
    });

    const snapshot = await readPersistedWorkflowRuntimeSnapshot(checkpointDir);
    const reloadedRuntime = await readPersistedWorkflowRuntime(checkpointDir);
    expect(snapshot?.runtime.workflowId).toBe(runtime.workflowId);
    expect(snapshot?.metadata?.source).toBe("vitest");
    expect(reloadedRuntime?.workflowId).toBe(runtime.workflowId);
    expect(reloadedRuntime?.approval.status).toBe("approved");
  });

  it("persists workflow snapshots to Supabase when the supabase backend is enabled", async () => {
    process.env.SHPITTO_WORKFLOW_RUNTIME_BACKEND = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    fromMock.mockReturnValue({
      upsert: upsertMock,
      select: selectMock,
    });
    createClientMock.mockReturnValue({
      from: fromMock,
    });
    upsertMock.mockResolvedValue({ error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    maybeSingleMock.mockResolvedValue({
      data: {
        snapshot: {
          version: 1,
          runtime: buildExecutionWorkflowRuntime({
            chatId: "chat-supabase",
            executionMode: "generate",
            contractHash: "b".repeat(64),
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "content-hub-site",
          }),
          savedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });

    const {
      persistWorkflowRuntimeSnapshot,
      readPersistedWorkflowRuntimeSnapshot,
      resolveWorkflowRuntimeCheckpointDir,
      resetWorkflowStoreForTesting,
    } = await import("./workflow-store.ts");
    resetWorkflowStoreForTesting();

    const runtime = buildExecutionWorkflowRuntime({
      chatId: "chat-supabase",
      executionMode: "generate",
      contractHash: "b".repeat(64),
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
    });
    const checkpointDir = resolveWorkflowRuntimeCheckpointDir({
      chatId: "chat-supabase",
      taskId: "task-supabase",
      workflowId: runtime.workflowId,
      rootDir: path.resolve(process.cwd(), ".tmp", "workflow-store-supabase-vitest"),
    });
    await fs.rm(path.dirname(path.dirname(checkpointDir)), { recursive: true, force: true });

    await persistWorkflowRuntimeSnapshot({
      checkpointDir,
      runtime,
      metadata: { source: "supabase-vitest" },
    });

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("shpitto_workflow_runs");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: runtime.workflowId,
        chat_id: "chat-supabase",
        task_id: null,
        generation_lane: "website-generation-mvp",
      }),
      expect.objectContaining({ onConflict: "workflow_id" }),
    );

    const snapshot = await readPersistedWorkflowRuntimeSnapshot(checkpointDir);
    expect(snapshot?.runtime.workflowId).toBe(runtime.workflowId);
  });
});
