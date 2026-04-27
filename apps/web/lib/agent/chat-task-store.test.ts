import { describe, expect, it } from "vitest";
import {
  claimNextQueuedChatTask,
  completeChatTask,
  createChatSessionForOwner,
  createChatTask,
  failChatTask,
  formatTaskEventSnapshot,
  getActiveChatTask,
  getChatTask,
  listChatTimelineMessages,
  listChatSessionsForOwner,
  markChatTaskRunning,
  requeueStaleRunningTasks,
  runChatTaskConsistencySweep,
  sanitizeTaskResultForClient,
  updateChatSessionForOwner,
  createSupabaseTaskFetch,
} from "./chat-task-store";

describe("chat-task-store", () => {
  it("keeps only canonical prompt fields in task and timeline storage", async () => {
    const chatId = `chat-canonical-only-${Date.now()}`;
    const task = await createChatTask(chatId, undefined, {
      internal: {
        inputState: {
          workflow_context: {
            canonicalPrompt: "canonical prompt",
            promptControlManifest: { routes: ["/"], files: ["/index.html"] },
          },
        },
      },
    });
    const { appendChatTimelineMessage } = await import("./chat-task-store");
    await appendChatTimelineMessage({
      chatId,
      role: "assistant",
      text: "Canonical prompt generated",
      metadata: {
        cardType: "prompt_draft",
        canonicalPrompt: "canonical prompt",
        promptControlManifest: { routes: ["/"], files: ["/index.html"] },
      },
    });

    const messages = await listChatTimelineMessages(chatId, 10);
    const metadata = messages[0]?.metadata || {};
    expect(metadata.canonicalPrompt).toBe("canonical prompt");
    expect(metadata.promptControlManifest).toEqual({ routes: ["/"], files: ["/index.html"] });
    expect((metadata as any).promptDraft).toBeUndefined();
    const workflow = ((await getChatTask(task.id))?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.canonicalPrompt).toBe("canonical prompt");
    expect(workflow.promptControlManifest).toEqual({ routes: ["/"], files: ["/index.html"] });
    expect(workflow.requirementDraft).toBeUndefined();
    expect(workflow.generationRoutingContract).toBeUndefined();
    await completeChatTask(task.id, { assistantText: "done" });
  });

  it("tracks async task lifecycle per chat", async () => {
    const chatId = `chat-${Date.now()}`;
    const task = await createChatTask(chatId);
    expect(task.status).toBe("queued");
    expect((await getActiveChatTask(chatId))?.id).toBe(task.id);

    await markChatTaskRunning(task.id);
    expect((await getChatTask(task.id))?.status).toBe("running");

    await completeChatTask(task.id, { assistantText: "done", phase: "end" });
    const done = await getChatTask(task.id);
    expect(done?.status).toBe("succeeded");
    expect(done?.result?.assistantText).toBe("done");
    expect(await getActiveChatTask(chatId)).toBeUndefined();
  });

  it("records task failures and clears active slot", async () => {
    const chatId = `chat-fail-${Date.now()}`;
    const task = await createChatTask(chatId);
    await markChatTaskRunning(task.id);
    await failChatTask(task.id, "boom");
    const failed = await getChatTask(task.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.result?.error).toContain("boom");
    expect(await getActiveChatTask(chatId)).toBeUndefined();
  });

  it("hides internal payload from client result", async () => {
    const redacted = sanitizeTaskResultForClient({
      assistantText: "ok",
      internal: { inputState: { secret: true }, workerId: "w1" },
    });
    expect(redacted?.assistantText).toBe("ok");
    expect((redacted as any)?.internal).toBeUndefined();
  });

  it("retries transient Supabase task read failures", async () => {
    let calls = 0;
    const fetchWithOneTimeout = async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("TypeError: fetch failed");
        (error as any).cause = { code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" };
        throw error;
      }
      return new Response("ok", { status: 200 });
    };
    const taskFetch = createSupabaseTaskFetch({
      fetchImpl: fetchWithOneTimeout as any,
      timeoutMs: 1_000,
      retries: 1,
      retryBaseMs: 0,
      dispatcher: null,
    });

    const response = await taskFetch("https://example.supabase.co/rest/v1/shpitto_chat_tasks", { method: "GET" });

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries transient Supabase task read responses", async () => {
    let calls = 0;
    const fetchWithOneServiceUnavailable = async () => {
      calls += 1;
      if (calls === 1) return new Response("unavailable", { status: 503 });
      return new Response("ok", { status: 200 });
    };
    const taskFetch = createSupabaseTaskFetch({
      fetchImpl: fetchWithOneServiceUnavailable as any,
      timeoutMs: 1_000,
      retries: 1,
      retryBaseMs: 0,
      dispatcher: null,
    });

    const response = await taskFetch("https://example.supabase.co/rest/v1/shpitto_chat_tasks", { method: "GET" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry Supabase task writes by default", async () => {
    let calls = 0;
    const alwaysTimeout = async () => {
      calls += 1;
      const error = new Error("TypeError: fetch failed");
      (error as any).cause = { code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" };
      throw error;
    };
    const taskFetch = createSupabaseTaskFetch({
      fetchImpl: alwaysTimeout as any,
      timeoutMs: 1_000,
      retries: 3,
      retryBaseMs: 0,
      dispatcher: null,
    });

    await expect(
      taskFetch("https://example.supabase.co/rest/v1/shpitto_chat_tasks", { method: "POST" }),
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(1);
  });

  it("requeues stale running task for worker recovery", async () => {
    const chatId = `chat-stale-${Date.now()}`;
    const task = await createChatTask(chatId, undefined, {
      internal: { inputState: { messages: [], phase: "conversation" } },
    });
    const claimed = await claimNextQueuedChatTask("worker-a");
    expect(claimed?.id).toBe(task.id);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const requeued = await requeueStaleRunningTasks(1);
    expect(requeued).toBeGreaterThan(0);
    const active = await getActiveChatTask(chatId);
    expect(active?.status).toBe("queued");
  });

  it("supports session create, list and archive flow", async () => {
    const ownerUserId = `user-${Date.now()}`;
    const created = await createChatSessionForOwner({
      ownerUserId,
      title: "Landing page revamp",
    });
    expect(created.id).toBeTruthy();
    expect(created.title).toContain("Landing page");

    const task = await createChatTask(created.id, ownerUserId, {
      assistantText: "queued",
    });
    expect(task.chatId).toBe(created.id);

    const listed = await listChatSessionsForOwner(ownerUserId);
    const target = listed.find((item) => item.id === created.id);
    expect(target).toBeTruthy();
    expect(target?.lastTaskId).toBe(task.id);

    const renamed = await updateChatSessionForOwner({
      ownerUserId,
      chatId: created.id,
      title: "Landing page v2",
    });
    expect(renamed?.title).toContain("Landing page v2");

    await updateChatSessionForOwner({
      ownerUserId,
      chatId: created.id,
      archived: true,
    });
    const visible = await listChatSessionsForOwner(ownerUserId);
    expect(visible.some((item) => item.id === created.id)).toBe(false);

    const withArchived = await listChatSessionsForOwner(ownerUserId, { includeArchived: true });
    expect(withArchived.some((item) => item.id === created.id)).toBe(true);
  });

  it("repairs missing pending-task status timeline and avoids duplicates", async () => {
    const chatId = `chat-sweep-${Date.now()}`;
    const task = await createChatTask(chatId, undefined, {
      assistantText: "Generation task accepted. Queued for background worker execution.",
      phase: "queued",
      progress: { stage: "queued" } as any,
    });

    const before = await listChatTimelineMessages(chatId, 50);
    expect(before.length).toBe(0);

    const firstSweep = await runChatTaskConsistencySweep({ limit: 50, maxTaskAgeMs: 1000 * 60 * 10 });
    expect(firstSweep.scanned).toBeGreaterThan(0);
    expect(firstSweep.timelineRepaired).toBeGreaterThan(0);

    const afterFirst = await listChatTimelineMessages(chatId, 50);
    const firstStatusMessages = afterFirst.filter((message) => {
      const metadata = (message.metadata || {}) as Record<string, unknown>;
      return (
        message.taskId === task.id &&
        metadata.status === "queued" &&
        metadata.source === "consistency_sweep" &&
        message.role === "assistant"
      );
    });
    expect(firstStatusMessages.length).toBe(1);

    await runChatTaskConsistencySweep({ limit: 50, maxTaskAgeMs: 1000 * 60 * 10 });
    const afterSecond = await listChatTimelineMessages(chatId, 50);
    const secondStatusMessages = afterSecond.filter((message) => {
      const metadata = (message.metadata || {}) as Record<string, unknown>;
      return (
        message.taskId === task.id &&
        metadata.status === "queued" &&
        metadata.source === "consistency_sweep" &&
        message.role === "assistant"
      );
    });
    expect(secondStatusMessages.length).toBe(1);
  });

  it("formats task events into user-readable timeline text", () => {
    const createdText = formatTaskEventSnapshot({
      eventType: "task_created",
      stage: "queued",
    });
    expect(createdText).toContain("任务已创建");
    expect(createdText).not.toContain("task_created");

    const progressText = formatTaskEventSnapshot({
      eventType: "task_progress",
      stage: "worker:claimed",
      payload: { toolName: "emit_file", filePath: "/index.html", model: "gpt-5.3-codex" },
    });
    expect(progressText).toContain("任务进度更新");
    expect(progressText).toContain("工具：emit_file");
    expect(progressText).toContain("文件：/index.html");

    const failedText = formatTaskEventSnapshot({
      eventType: "task_failed",
      stage: "failed",
      payload: { error: "Connect Timeout Error" },
    });
    expect(failedText).toContain("任务执行失败");
    expect(failedText).toContain("错误：Connect Timeout Error");
  });
});
