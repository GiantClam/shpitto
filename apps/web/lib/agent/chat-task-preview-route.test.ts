import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask } from "./chat-task-store";

describe("chat task preview routes", () => {
  it("redirects preview root to index.html", async () => {
    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
    const res = await GET(new Request("http://localhost/api/chat/tasks/t1/preview"), {
      params: Promise.resolve({ taskId: "t1" }),
    });
    expect(res.status).toBe(307);
    expect(String(res.headers.get("location") || "")).toContain("/preview/index.html");
  });

  it("serves preview html via checkpoint project fallback site directory", async () => {
    const chatId = `chat-preview-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tests", chatId);
    const projectPath = path.join(root, "project.json");
    const siteDir = path.join(root, "site");
    await fs.mkdir(siteDir, { recursive: true });
    await fs.writeFile(path.join(siteDir, "index.html"), "<!doctype html><html><body>preview-ok</body></html>", "utf8");
    await fs.writeFile(projectPath, JSON.stringify({}), "utf8");

    const task = await createChatTask(chatId, undefined, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });
    await completeChatTask(task.id, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: task.id, path: ["index.html"] }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("preview-ok");
  });

  it("serves local checkpoint preview when the task store record is unavailable", async () => {
    const chatId = `chat-preview-local-${Date.now()}`;
    const taskId = `local-fallback-${Date.now()}`;
    const siteDir = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId, "latest", "site");
    await fs.mkdir(siteDir, { recursive: true });
    await fs.writeFile(path.join(siteDir, "index.html"), "<!doctype html><html><body>local-preview-ok</body></html>", "utf8");

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId, path: ["index.html"] }),
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("local-preview-ok");
  });

  it("does not inject a base tag that breaks nested page relative assets", async () => {
    const chatId = `chat-preview-nested-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tests", chatId);
    const projectPath = path.join(root, "project.json");
    const siteDir = path.join(root, "site");
    await fs.mkdir(path.join(siteDir, "3c-machines"), { recursive: true });
    await fs.writeFile(path.join(siteDir, "index.html"), "<!doctype html><html><body>home</body></html>", "utf8");
    await fs.writeFile(
      path.join(siteDir, "3c-machines", "index.html"),
      '<!doctype html><html><head><link rel="stylesheet" href="../styles.css"></head><body><script src="../script.js"></script></body></html>',
      "utf8",
    );
    await fs.writeFile(projectPath, JSON.stringify({}), "utf8");

    const task = await createChatTask(chatId, undefined, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });
    await completeChatTask(task.id, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: task.id, path: ["3c-machines", "index.html"] }),
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<base ");
    expect(html).toContain(`/api/chat/tasks/${encodeURIComponent(task.id)}/preview/styles.css`);
    expect(html).toContain(`/api/chat/tasks/${encodeURIComponent(task.id)}/preview/script.js`);
    expect(html).not.toContain('href="../styles.css"');
    expect(html).not.toContain('src="../script.js"');
  });
});
