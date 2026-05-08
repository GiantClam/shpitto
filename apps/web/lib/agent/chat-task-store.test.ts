import { describe, expect, it } from "vitest";
import {
  claimNextQueuedChatTask,
  completeChatTask,
  createChatSessionForOwner,
  createChatTask,
  failChatTask,
  formatTaskEventSnapshot,
  formatUnknownError,
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

  it("retries Cloudflare 521 responses for Supabase task reads", async () => {
    let calls = 0;
    const fetchWithOne521 = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          "<!DOCTYPE html><html><head><title>supabase.co | 521: Web server is down</title></head><body>Error code 521</body></html>",
          { status: 521 },
        );
      }
      return new Response("ok", { status: 200 });
    };
    const taskFetch = createSupabaseTaskFetch({
      fetchImpl: fetchWithOne521 as any,
      timeoutMs: 1_000,
      retries: 1,
      retryBaseMs: 0,
      dispatcher: null,
    });

    const response = await taskFetch("https://example.supabase.co/rest/v1/shpitto_chat_tasks", { method: "GET" });

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("summarizes Cloudflare HTML upstream errors instead of returning the full page", () => {
    const summary = formatUnknownError({
      message:
        '<!DOCTYPE html><html><head><title>supabase.co | 521: Web server is down</title></head><body><span class="md:block w-full truncate">ofmwvapsmsokwvqhwhtf.supabase.co</span><span class="code-label">Error code 521</span></body></html>',
    });

    expect(summary).toContain("Supabase upstream error");
    expect(summary).toContain("status 521");
    expect(summary).toContain("Web server is down");
    expect(summary).toContain("host=ofmwvapsmsokwvqhwhtf.supabase.co");
    expect(summary).not.toContain("<!DOCTYPE html>");
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

  it("claims only tasks matching requested execution modes", async () => {
    const chatId = `chat-claim-modes-${Date.now()}`;
    const generateTask = await createChatTask(`${chatId}-generate`, undefined, {
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          workflow_context: { executionMode: "generate" },
        },
      },
    });
    const deployTask = await createChatTask(`${chatId}-deploy`, undefined, {
      internal: {
        inputState: {
          messages: [],
          phase: "end",
          workflow_context: { executionMode: "deploy", deployRequested: true },
        },
      },
    });

    const claimedDeploy = await claimNextQueuedChatTask("deploy-worker", { modes: ["deploy"] });
    expect(claimedDeploy?.id).toBe(deployTask.id);
    expect((await getChatTask(generateTask.id))?.status).toBe("queued");
    await completeChatTask(deployTask.id, { assistantText: "deployed" });
    await completeChatTask(generateTask.id, { assistantText: "done" });
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

  it("includes completed tasks in consistency sweep and avoids duplicate terminal messages", async () => {
    const chatId = `chat-sweep-complete-${Date.now()}`;
    const task = await createChatTask(chatId, undefined, {
      phase: "queued",
      progress: { stage: "queued" } as any,
    });
    await completeChatTask(task.id, { assistantText: "Refinement completed. Updated 9 files.", phase: "end" });

    const before = await listChatTimelineMessages(chatId, 50);
    const completionMessagesBefore = before.filter((message) => {
      const metadata = (message.metadata || {}) as Record<string, unknown>;
      return message.taskId === task.id && metadata.status === "succeeded" && message.role === "assistant";
    });
    expect(completionMessagesBefore.length).toBe(1);

    const { appendChatTimelineMessage } = await import("./chat-task-store");
    await appendChatTimelineMessage({
      chatId,
      taskId: task.id,
      role: "assistant",
      text: "running update",
      metadata: { status: "running" },
    });

    const firstSweep = await runChatTaskConsistencySweep({ limit: 50, maxTaskAgeMs: 1000 * 60 * 10 });
    expect(firstSweep.scanned).toBeGreaterThan(0);

    const afterFirst = await listChatTimelineMessages(chatId, 50);
    const completionMessagesAfterFirst = afterFirst.filter((message) => {
      const metadata = (message.metadata || {}) as Record<string, unknown>;
      return message.taskId === task.id && metadata.status === "succeeded" && message.role === "assistant";
    });
    expect(completionMessagesAfterFirst.length).toBe(1);

    await runChatTaskConsistencySweep({ limit: 50, maxTaskAgeMs: 1000 * 60 * 10 });
    const afterSecond = await listChatTimelineMessages(chatId, 50);
    const completionMessagesAfterSecond = afterSecond.filter((message) => {
      const metadata = (message.metadata || {}) as Record<string, unknown>;
      return message.taskId === task.id && metadata.status === "succeeded" && message.role === "assistant";
    });
    expect(completionMessagesAfterSecond.length).toBe(1);
  });

  it("formats task events into user-readable timeline text", () => {
    const createdText = formatTaskEventSnapshot({
      eventType: "task_created",
      stage: "queued",
    });
    expect(createdText).toContain("Task created and queued.");
    expect(createdText).not.toContain("task_created");

    const progressText = formatTaskEventSnapshot({
      eventType: "task_progress",
      stage: "worker:claimed",
      payload: { toolName: "emit_file", filePath: "/index.html", model: "gpt-5.3-codex" },
    });
    expect(progressText).toContain("Task progress updated");
    expect(progressText).toContain("Tool: emit_file");
    expect(progressText).toContain("File: /index.html");

    const qaText = formatTaskEventSnapshot({
      eventType: "task_progress",
      stage: "generating:qa_report",
      payload: {
        qaSummary: {
          averageScore: 92,
          totalRoutes: 6,
          passedRoutes: 6,
          totalRetries: 2,
          retriesAllowed: 2,
          antiSlopIssueCount: 3,
          categories: [
            { code: "nav-scaffold-copy", count: 2, severity: "warning" },
            { code: "footer-scaffold-copy", count: 1, severity: "warning" },
          ],
        },
      },
    });
    expect(qaText).toContain("QA score: 92");
    expect(qaText).toContain("QA retries: 2");
    expect(qaText).toContain("Anti-slop: nav-scaffold-copy x2, footer-scaffold-copy x1");

    const failedText = formatTaskEventSnapshot({
      eventType: "task_failed",
      stage: "failed",
      payload: { error: "Connect Timeout Error" },
    });
    expect(failedText).toContain("Task failed.");
    expect(failedText).toContain("Error: Connect Timeout Error");
  });
});
