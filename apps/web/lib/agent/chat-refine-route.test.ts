import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask, getLatestChatTaskForChat } from "./chat-task-store";

describe("chat refine routing", () => {
  it("routes preview-stage modification requests into refine tasks", async () => {
    const chatId = `chat-refine-route-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          projectId: "refine-route-demo",
          pages: [{ path: "/", html: "<!doctype html><html><head><title>Demo</title></head><body>Hello</body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Demo</title></head><body>Hello</body></html>" },
              { path: "/styles.css", type: "text/css", content: "body{color:#111}" },
              { path: "/script.js", type: "text/javascript", content: "console.log('ok');" },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const previous = await createChatTask(chatId, undefined, {
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
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
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
        messages: [{ role: "user", parts: [{ type: "text", text: "把主色改成蓝色并微调按钮样式" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    expect(latest).toBeTruthy();
    expect(latest?.id).not.toBe(previous.id);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("refine");
    expect(Boolean(workflow.refineRequested)).toBe(true);
    expect(Boolean(workflow.deployRequested)).toBe(false);
    expect(String(workflow.refineSourceProjectPath || "")).toBe(projectPath);
  });
});

