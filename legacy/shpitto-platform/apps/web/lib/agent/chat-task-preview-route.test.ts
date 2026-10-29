import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask } from "./chat-task-store";

describe("chat task preview routes", () => {
  it("redirects preview root to the default preview sentinel", async () => {
    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
    const res = await GET(new Request("http://localhost/api/chat/tasks/t1/preview"), {
      params: Promise.resolve({ taskId: "t1" }),
    });
    expect(res.status).toBe(307);
    expect(String(res.headers.get("location") || "")).toContain("/preview/__default__");
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

  it("redirects the default preview request to the first available route when a site has no root index", async () => {
    const chatId = `chat-preview-no-home-${Date.now()}`;
    const taskId = `local-no-home-${Date.now()}`;
    const latestRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId, "latest");
    const siteDir = path.join(latestRoot, "site");
    const workflowDir = path.join(latestRoot, "workflow");
    await fs.mkdir(path.join(siteDir, "casux-creation"), { recursive: true });
    await fs.mkdir(path.join(siteDir, "standards-system"), { recursive: true });
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "casux-creation", "index.html"),
      "<!doctype html><html><body>CASUX creation</body></html>",
      "utf8",
    );
    await fs.writeFile(
      path.join(siteDir, "standards-system", "index.html"),
      "<!doctype html><html><body>Standards</body></html>",
      "utf8",
    );
    await fs.writeFile(path.join(siteDir, "styles.css"), "body{margin:0}", "utf8");
    await fs.writeFile(path.join(siteDir, "script.js"), "console.log('ok')", "utf8");
    await fs.writeFile(
      path.join(workflowDir, "task_plan.md"),
      ["# Task Plan", "", "- Routes: /casux-creation, /standards-system"].join("\n"),
      "utf8",
    );

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
    const redirectRes = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId, path: ["__default__"] }),
    });

    expect(redirectRes.status).toBe(307);
    expect(String(redirectRes.headers.get("location") || "")).toContain(
      `/api/chat/tasks/${encodeURIComponent(taskId)}/preview/casux-creation/index.html`,
    );

    const htmlRes = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId, path: ["casux-creation", "index.html"] }),
    });
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toContain("CASUX creation");
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

  it("injects a preview navigation bridge so runtime-rendered blog links stay inside the task preview", async () => {
    const chatId = `chat-preview-blog-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tests", chatId);
    const projectPath = path.join(root, "project.json");
    const siteDir = path.join(root, "site");
    await fs.mkdir(path.join(siteDir, "blog"), { recursive: true });
    await fs.writeFile(path.join(siteDir, "index.html"), "<!doctype html><html><body>home</body></html>", "utf8");
    await fs.writeFile(path.join(siteDir, "script.js"), "console.log('preview bridge');", "utf8");
    await fs.writeFile(
      path.join(siteDir, "blog", "index.html"),
      '<!doctype html><html><head><script src="../script.js" defer></script></head><body><section data-shpitto-blog-list><a href="/blog/runtime-post/">Open article</a></section></body></html>',
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
      params: Promise.resolve({ taskId: task.id, path: ["blog", "index.html"] }),
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`/api/chat/tasks/${encodeURIComponent(task.id)}/preview/script.js`);
    expect(html).toContain(`const previewBase = "/api/chat/tasks/${encodeURIComponent(task.id)}/preview"`);
    expect(html).toContain("window.__shpittoPreviewBase = previewBase;");
    expect(html).toContain("MutationObserver");
    expect(html).toContain(`href="/api/chat/tasks/${encodeURIComponent(task.id)}/preview/blog/runtime-post/"`);
  });
});
