import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask, getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const task = await getChatTask(taskId);
    if (task?.status === "succeeded") return task;
    if (task?.status === "failed") {
      throw new Error(String(task.result?.assistantText || task.result?.error || "task failed"));
    }
    await runWorkerOnce();
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

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

  it("routes missing blog detail completion requests into structural refine tasks", async () => {
    const chatId = `chat-refine-blog-structural-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          projectId: "refine-blog-structural-demo",
          pages: [{ path: "/blog", html: '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/alpha/">Alpha</a></article><article><a href="/blog/beta/">Beta</a></article></div></section></body></html>' }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/blog/index.html", type: "text/html", content: '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/alpha/">Alpha</a></article><article><a href="/blog/beta/">Beta</a></article></div></section></body></html>' },
              { path: "/styles.css", type: "text/css", content: "body{color:#111}" },
              { path: "/script.js", type: "text/javascript", content: "console.log('ok');" }
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
        messages: [{ role: "user", parts: [{ type: "text", text: "三篇blog缺少内容页面，请补充" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("refine");
    expect(workflow.refineScope).toBe("structural");
    expect(Boolean(workflow.refineRequested)).toBe(true);
  });

  it("routes add-page requests into structural refine tasks", async () => {
    const chatId = `chat-refine-add-page-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          projectId: "refine-add-page-demo",
          pages: [{ path: "/", html: "<!doctype html><html><body><h1>Home</h1></body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Home</h1></body></html>" },
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
        messages: [{ role: "user", parts: [{ type: "text", text: "新增一个 pricing 页面，其他页面不动" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("refine");
    expect(workflow.refineScope).toBe("structural");
    expect(Boolean(workflow.refineRequested)).toBe(true);
  });

  it("runs structural refine for a new page and preserves the shared shell", async () => {
    const chatId = `chat-refine-add-page-shell-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          projectId: "refine-add-page-shell-demo",
          pages: [
            {
              path: "/",
              html: [
                "<!doctype html><html><head><title>Home</title></head><body>",
                "<header><nav><a href=\"/\">Home</a><a href=\"/about/\">About</a><a href=\"/pricing/\">Pricing</a><a href=\"/contact/\">Contact</a></nav></header>",
                "<main><h1>Home</h1><p>Baseline shell.</p></main>",
                "<footer><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a><p>Footer context</p></footer>",
                "</body></html>",
              ].join(""),
            },
            {
              path: "/about",
              html: [
                "<!doctype html><html><head><title>About</title></head><body>",
                "<header><nav><a href=\"/\">Home</a><a href=\"/about/\">About</a><a href=\"/pricing/\">Pricing</a><a href=\"/contact/\">Contact</a></nav></header>",
                "<main><h1>About</h1><p>About page.</p></main>",
                "<footer><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a><p>Footer context</p></footer>",
                "</body></html>",
              ].join(""),
            },
          ],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content: [
                  "<!doctype html><html><head><title>Home</title></head><body>",
                  "<header><nav><a href=\"/\">Home</a><a href=\"/about/\">About</a><a href=\"/pricing/\">Pricing</a><a href=\"/contact/\">Contact</a></nav></header>",
                  "<main><h1>Home</h1><p>Baseline shell.</p></main>",
                  "<footer><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a><p>Footer context</p></footer>",
                  "</body></html>",
                ].join(""),
              },
              {
                path: "/about/index.html",
                type: "text/html",
                content: [
                  "<!doctype html><html><head><title>About</title></head><body>",
                  "<header><nav><a href=\"/\">Home</a><a href=\"/about/\">About</a><a href=\"/pricing/\">Pricing</a><a href=\"/contact/\">Contact</a></nav></header>",
                  "<main><h1>About</h1><p>About page.</p></main>",
                  "<footer><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a><p>Footer context</p></footer>",
                  "</body></html>",
                ].join(""),
              },
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
    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "新增一个 pricing 页面，其他页面不动" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const queued = await getLatestChatTaskForChat(chatId);
    expect((queued?.result?.internal?.inputState as any)?.workflow_context?.refineScope).toBe("structural");

    const completed = await waitForTerminalTask(String(queued?.id || ""), runChatTaskWorkerOnce);
    expect(completed?.status).toBe("succeeded");
    const checkpointProjectPath = String(completed?.result?.progress?.checkpointProjectPath || "");
    expect(checkpointProjectPath).toBeTruthy();
    const project = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
    const pricingFile = ((project?.staticSite?.files || []) as any[]).find((file) => String(file?.path || "") === "/pricing/index.html");
    expect(pricingFile).toBeTruthy();
    const pricingHtml = String(pricingFile?.content || "");
    expect(pricingHtml).toMatch(/<nav\b/i);
    expect(pricingHtml).toContain('href="/pricing/"');
    expect(pricingHtml).toContain('href="/about/"');
    expect(pricingHtml).toMatch(/<footer\b/i);
  });

  it("runs structural refine for missing blog detail pages and materializes previewable detail routes", async () => {
    const chatId = `chat-refine-blog-detail-chain-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          projectId: "refine-blog-detail-chain-demo",
          pages: [
            {
              path: "/",
              html: [
                "<!doctype html><html><head><title>Home</title></head><body>",
                "<header><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><a href=\"/about/\">About</a></nav></header>",
                "<main><h1>Home</h1><p>Baseline shell.</p></main>",
                "<footer><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><p>Footer context</p></footer>",
                "</body></html>",
              ].join(""),
            },
            {
              path: "/blog",
              html: [
                "<!doctype html><html><head><title>Blog</title></head><body>",
                "<header><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><a href=\"/about/\">About</a></nav></header>",
                "<main><section data-shpitto-blog-root data-shpitto-blog-api=\"/api/blog/posts\">",
                "<div data-shpitto-blog-list>",
                "<article><a href=\"/blog/alpha/\">Alpha</a><p>Alpha summary</p></article>",
                "<article><a href=\"/blog/beta/\">Beta</a><p>Beta summary</p></article>",
                "</div></section></main>",
                "<footer><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><p>Footer context</p></footer>",
                "</body></html>",
              ].join(""),
            },
          ],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content: [
                  "<!doctype html><html><head><title>Home</title></head><body>",
                  "<header><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><a href=\"/about/\">About</a></nav></header>",
                  "<main><h1>Home</h1><p>Baseline shell.</p></main>",
                  "<footer><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><p>Footer context</p></footer>",
                  "</body></html>",
                ].join(""),
              },
              {
                path: "/blog/index.html",
                type: "text/html",
                content: [
                  "<!doctype html><html><head><title>Blog</title></head><body>",
                  "<header><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><a href=\"/about/\">About</a></nav></header>",
                  "<main><section data-shpitto-blog-root data-shpitto-blog-api=\"/api/blog/posts\">",
                  "<div data-shpitto-blog-list>",
                  "<article><a href=\"/blog/alpha/\">Alpha</a><p>Alpha summary</p></article>",
                  "<article><a href=\"/blog/beta/\">Beta</a><p>Beta summary</p></article>",
                  "</div></section></main>",
                  "<footer><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a><p>Footer context</p></footer>",
                  "</body></html>",
                ].join(""),
              },
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
    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "三篇blog缺少内容页面，请补充" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const queued = await getLatestChatTaskForChat(chatId);
    expect((queued?.result?.internal?.inputState as any)?.workflow_context?.refineScope).toBe("structural");

    const completed = await waitForTerminalTask(String(queued?.id || ""), runChatTaskWorkerOnce);
    expect(completed?.status).toBe("succeeded");
    const checkpointProjectPath = String(completed?.result?.progress?.checkpointProjectPath || "");
    expect(checkpointProjectPath).toBeTruthy();
    const project = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
    const detailFiles = ((project?.staticSite?.files || []) as any[]).filter((file) =>
      /^\/blog\/(?:alpha|beta)\/index\.html$/i.test(String(file?.path || "")),
    );
    expect(detailFiles).toHaveLength(2);
    const alphaHtml = String(detailFiles.find((file) => String(file?.path || "") === "/blog/alpha/index.html")?.content || "");
    expect(alphaHtml).toMatch(/<nav\b/i);
    expect(alphaHtml).toContain('href="/blog"');
    expect(alphaHtml).toContain('href="/"');
    expect(alphaHtml).toMatch(/<article\b/i);
  });
});
