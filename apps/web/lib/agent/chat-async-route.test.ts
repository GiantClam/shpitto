import { describe, expect, it } from "vitest";
import { getLatestChatTaskForChat } from "./chat-task-store";
import fs from "node:fs/promises";
import path from "node:path";

describe("chat api async mode", () => {
  const confirmPayload = (text: string) => `__SHP_CONFIRM_GENERATE__\n${text}`;

  it("queues task and returns task id immediately", async () => {
    const chatId = `chat-queue-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload("Generate site") }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeTruthy();
    expect(task?.status).toBe("queued");
    expect(task?.result?.progress?.stage).toBe("queued");
    expect(task?.result?.progress?.skillId).toBe("website-generation-workflow");
    expect(task?.result?.internal?.inputState).toBeTruthy();
  });

  it("returns existing active task instead of creating duplicate", async () => {
    const chatId = `chat-active-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const buildReq = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload("Generate site once") }] }],
        }),
      });

    const first = await POST(buildReq());
    expect(first.status).toBe(202);
    const second = await POST(buildReq());
    expect(second.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeTruthy();
    expect(task?.status === "queued" || task?.status === "running").toBe(true);
  });

  it("returns requirement-clarification response before confirmed generation", async () => {
    const chatId = `chat-clarify-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "Build a website for CASUX" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeUndefined();
  });

  it("rejects unknown skill_id not found under apps/web/skills", async () => {
    const chatId = `chat-skill-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        skill_id: "non-existent-skill",
        messages: [{ role: "user", parts: [{ type: "text", text: "Generate site" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeUndefined();
  });

  it("exposes task status endpoint with sanitized result", async () => {
    const chatId = `chat-status-${Date.now()}`;
    const { createChatTask, markChatTaskRunning, completeChatTask } = await import("./chat-task-store");
    const task = await createChatTask(chatId, undefined, {
      assistantText: "done",
      internal: { inputState: { secret: true } },
      progress: { stage: "done" },
    });
    await markChatTaskRunning(task.id);
    await completeChatTask(task.id, { assistantText: "done", progress: { stage: "done" } });

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: task.id }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.ok).toBe(true);
    expect(json?.task?.id).toBe(task.id);
    expect(json?.task?.status).toBe("succeeded");
    expect(json?.task?.result?.assistantText).toBe("done");
    expect(json?.task?.result?.internal).toBeUndefined();
  });

  it("marks deploy confirmation requests and carries latest checkpoint path", async () => {
    const chatId = `chat-deploy-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", `chat-deploy-${Date.now()}.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify({ projectId: "deploy-test", pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }] }), "utf8");

    const { createChatTask, completeChatTask } = await import("./chat-task-store");
    const previous = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {},
        },
      },
      progress: { checkpointProjectPath: projectPath } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: projectPath } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.deploySourceProjectPath).toBe(projectPath);
  });
});
