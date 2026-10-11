import { describe, expect, it } from "vitest";
import { completeChatTask, createChatTask } from "./chat-task-store";

describe("chat task preview virtual artifacts", () => {
  it("serves preview files from persisted task artifacts when local checkpoint is unavailable", { timeout: 15_000 }, async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `preview-virtual-${Date.now()}`;
      const task = await createChatTask(chatId, undefined, {
        phase: "queued",
        progress: { stage: "queued" },
      });
      await completeChatTask(task.id, {
        assistantText: "done",
        phase: "end",
        internal: {
          artifactSnapshot: {
            staticSite: {
              mode: "skill-direct",
              files: [
                {
                  path: "/index.html",
                  type: "text/html; charset=utf-8",
                  content: '<!doctype html><html><head><link href="/styles.css"></head><body><a href="/products/">Products</a><script src="/script.js"></script></body></html>',
                },
                {
                  path: "/products/index.html",
                  type: "text/html; charset=utf-8",
                  content: "<!doctype html><html><body>Products</body></html>",
                },
                { path: "/styles.css", type: "text/css; charset=utf-8", content: "body{color:#111}" },
                { path: "/script.js", type: "application/javascript; charset=utf-8", content: "console.log('ok')" },
              ],
            },
          },
        } as any,
        progress: {
          stage: "done",
          checkpointSaved: true,
          checkpointSiteDir: "D:/path/that/does/not/exist",
          generatedFiles: ["/index.html", "/products/index.html", "/styles.css", "/script.js"],
        } as any,
      });

      const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
      const indexRes = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: task.id, path: ["index.html"] }),
      });
      const indexHtml = await indexRes.text();

      expect(indexRes.status).toBe(200);
      expect(indexHtml).toContain(`/api/chat/tasks/${encodeURIComponent(task.id)}/preview/styles.css`);
      expect(indexHtml).toContain(`/api/chat/tasks/${encodeURIComponent(task.id)}/preview/products/`);

      const cssRes = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: task.id, path: ["styles.css"] }),
      });
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers.get("content-type")).toContain("text/css");
      expect(await cssRes.text()).toContain("color:#111");

      const nestedRes = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: task.id, path: ["products"] }),
      });
      expect(nestedRes.status).toBe(200);
      expect(await nestedRes.text()).toContain("Products");
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });

  it("redirects default virtual preview requests to the first available route when no root index exists", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `preview-virtual-no-home-${Date.now()}`;
      const task = await createChatTask(chatId, undefined, {
        phase: "queued",
        progress: { stage: "queued" },
      });
      await completeChatTask(task.id, {
        assistantText: "done",
        phase: "end",
        internal: {
          artifactSnapshot: {
            staticSite: {
              mode: "skill-direct",
              files: [
                {
                  path: "/casux-creation/index.html",
                  type: "text/html; charset=utf-8",
                  content: "<!doctype html><html><body>CASUX creation</body></html>",
                },
                {
                  path: "/standards-system/index.html",
                  type: "text/html; charset=utf-8",
                  content: "<!doctype html><html><body>Standards</body></html>",
                },
                { path: "/styles.css", type: "text/css; charset=utf-8", content: "body{color:#111}" },
                { path: "/script.js", type: "application/javascript; charset=utf-8", content: "console.log('ok')" },
              ],
            },
          },
        } as any,
        progress: {
          stage: "done",
          checkpointSaved: true,
          checkpointSiteDir: "D:/path/that/does/not/exist",
          generatedFiles: ["/casux-creation/index.html", "/standards-system/index.html", "/styles.css", "/script.js"],
        } as any,
      });

      const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
      const redirectRes = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: task.id, path: ["__default__"] }),
      });

      expect(redirectRes.status).toBe(307);
      expect(String(redirectRes.headers.get("location") || "")).toContain(
        `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/casux-creation/index.html`,
      );
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });
});
