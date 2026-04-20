import { describe, expect, it, vi } from "vitest";
import { createChatTask, getChatTask } from "./chat-task-store";

const runTaskMock = vi.fn();

vi.mock("../skill-runtime/executor.ts", () => ({
  SkillRuntimeExecutor: {
    runTask: runTaskMock,
  },
}));

describe("chat-task-worker-run", () => {
  it("claims one queued task and finishes it", async () => {
    const prevTaskTimeout = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
    process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "30000";

    runTaskMock.mockReset();

    const inputState: any = {
      messages: [],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        genMode: "skill_native",
      },
    };

    const task = await createChatTask(`worker-test-${Date.now()}`, undefined, {
      phase: "queued",
      internal: { inputState },
      progress: { stage: "queued", round: 0, maxRounds: 1 },
    });

    runTaskMock.mockImplementation(async ({ taskId }: any) => {
      const { completeChatTask } = await import("./chat-task-store");
      await completeChatTask(taskId, {
        assistantText: "Worker completed.",
        phase: "end",
        progress: { stage: "done" } as any,
      });
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const updated = await getChatTask(task.id);
    expect(updated?.status).toBe("succeeded");
    expect(updated?.result?.assistantText).toContain("Worker completed");
    expect(updated?.result?.progress?.stage).toBe("done");
    expect(runTaskMock).toHaveBeenCalledTimes(1);
    const calledParams = runTaskMock.mock.calls[0]?.[0] as any;
    expect(calledParams?.taskId).toBe(task.id);
    expect(calledParams?.chatId).toBe(task.chatId);
    expect(calledParams?.workerId).toBeTruthy();

    if (prevTaskTimeout === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
    else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevTaskTimeout;
  });
});
