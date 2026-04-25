import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask, getLatestChatTaskForChat } from "./chat-task-store";

describe("chat history memory", () => {
  it("carries checkpoint/task pointers into refine task workflow context", async () => {
    const chatId = `chat-memory-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify({
        projectId: "memory-demo",
        staticSite: {
          mode: "skill-direct",
          files: [{ path: "/index.html", type: "text/html", content: "<!doctype html><html><body>ok</body></html>" }],
        },
        pages: [{ path: "/", html: "<!doctype html><html><body>ok</body></html>" }],
      }),
      "utf8",
    );

    const generated = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            checkpointProjectPath: projectPath,
            deploySourceProjectPath: projectPath,
          },
        },
      },
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });
    await completeChatTask(generated.id, {
      assistantText: "generated",
      phase: "end",
      internal: generated.result?.internal,
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "把主色改成蓝色" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(String(workflow.checkpointProjectPath || "")).toBe(projectPath);
    expect(String(workflow.refineSourceProjectPath || "")).toBe(projectPath);
    expect(String(workflow.refineSourceTaskId || "")).toBe(generated.id);
  });
});

