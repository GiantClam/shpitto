import { describe, expect, it } from "vitest";
import {
  claimNextQueuedChatTask,
  completeChatTask,
  createChatTask,
  failChatTask,
  getActiveChatTask,
  getChatTask,
  markChatTaskRunning,
  requeueStaleRunningTasks,
  sanitizeTaskResultForClient,
} from "./chat-task-store";

describe("chat-task-store", () => {
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
});
