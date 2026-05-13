import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts", ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "..", "..", ".env"), override: false, quiet: true });

process.env.CHAT_TASKS_USE_SUPABASE = "0";
process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "2100000";
process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "600000";
process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE = process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE || "7";
const smokeProvider = String(process.env.SMOKE_LLM_PROVIDER || "pptoken").trim() || "pptoken";
const smokeProviderOrder = Array.from(new Set([smokeProvider, "pptoken", "aiberm", "crazyrouter"])).join(",");
process.env.LLM_PROVIDER = smokeProvider;
process.env.LLM_PROVIDER_ORDER = smokeProviderOrder;
process.env.CHAT_WORKER_CLAIM_MODES = "generate";

(globalThis as any).__shpittoChatTaskStore = undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibleText(html: string) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("codex local Blog validator smoke", () => {
  it(
    "runs generation through local code and proves final validator/provider behavior",
    async () => {
      const startedAt = new Date().toISOString();
      const { POST } = await import("../../app/api/chat/route");
      const { getLatestChatTaskForChat, getChatTask, listChatTimelineMessages } = await import("./chat-task-store");
      const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

      async function waitForTerminalTask(taskId: string) {
        const deadline = Date.now() + 35 * 60 * 1000;
        let last: Awaited<ReturnType<typeof getChatTask>> | undefined;
        while (Date.now() < deadline) {
          const task = await getChatTask(taskId);
          last = task;
          if (task?.status === "succeeded" || task?.status === "failed") return task;
          if (task?.status === "queued") {
            await runChatTaskWorkerOnce();
            continue;
          }
          await sleep(5000);
        }
        throw new Error(`Timed out waiting for ${taskId}; last=${JSON.stringify(last?.result?.progress || {})}`);
      }

      const marker = Date.now().toString(36);
      const chatId = `chat-batch-validator-local-smoke-${marker}`;
      const requirement = `__SHP_CONFIRM_GENERATE__
Generate a personal Blog website.
Requirements:
- Multi-page website with only Home and Blog main navigation entries.
- Chinese and English language switch.
- Blog needs 3 complete articles. Each article must have an independent /blog/{slug}/ detail page.
- No template explanatory wording, no route choreography such as start from home then read blog.
- Do not use same-page anchors, accordion panels, script rendering, or fallback content chains instead of static Blog detail pages.
- Use shared /styles.css and /script.js. Keep navigation and footer consistent.`;

      const res = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: requirement }] }],
          }),
        }),
      );
      const responseText = await res.clone().text();
      const queued = await getLatestChatTaskForChat(chatId);
      expect(res.status, responseText).toBe(202);
      expect(queued?.id).toBeTruthy();

      const terminal = await waitForTerminalTask(queued!.id);
      const progress = terminal?.result?.progress || {};
      const checkpointProjectPath = String(progress.checkpointProjectPath || "");
      let paths: string[] = [];
      let blogIndexChecks: Record<string, unknown> = {};
      if (checkpointProjectPath) {
        try {
          const project = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
          const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
          paths = files.map((file: any) => String(file?.path || "")).filter(Boolean).sort();
          const blogIndex = String(files.find((file: any) => String(file?.path || "") === "/blog/index.html")?.content || "");
          const text = visibleText(blogIndex);
          blogIndexChecks = {
            hasBlogRoot: /data-shpitto-blog-root/i.test(blogIndex),
            hasBlogList: /data-shpitto-blog-list/i.test(blogIndex),
            hasBlogApi: /data-shpitto-blog-api=["']\/api\/blog\/posts["']/i.test(blogIndex),
            detailLinkCount: (blogIndex.match(/href=["']\/blog\/[^"'#?]+\/["']/gi) || []).length,
            hasRouteChoreographyCopy:
              /\u4ece\u9996\u9875\u5f00\u59cb|\u63a5\u4e0b\u6765\u770b\u535a\u5ba2|\u5185\u5bb9\u4f1a\u66f4\u5177\u4f53|start from|begin with|reading path|browsing path/i.test(
                text,
              ),
          };
        } catch (error) {
          blogIndexChecks = { projectReadError: String((error as Error)?.message || error) };
        }
      }

      const timeline = await listChatTimelineMessages(chatId, 300);
      const report = {
        startedAt,
        completedAt: new Date().toISOString(),
        chatId,
        taskId: queued!.id,
        status: terminal?.status,
        workerId: terminal?.result?.internal?.workerId,
        provider: progress.provider,
        model: progress.model,
        stage: progress.stage,
        stageMessage: progress.stageMessage,
        error: terminal?.result?.error,
        assistantText: terminal?.result?.assistantText,
        checkpointProjectPath,
        generatedFiles: progress.generatedFiles,
        paths,
        blogDetailPaths: paths.filter((item) => /^\/blog\/[^/]+\/index\.html$/i.test(item)),
        blogIndexChecks,
        timelineTail: timeline.slice(-12).map((msg) => ({
          role: msg.role,
          text: String(msg.text || "").slice(0, 260),
          metadata: msg.metadata,
        })),
      };
      const outDir = path.resolve(process.cwd(), ".tmp", "codex-smoke-logs");
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, `${chatId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

      const required = ["/index.html", "/styles.css", "/script.js", "/blog/index.html"];
      const missing = required.filter((item) => !paths.includes(item));
      expect({ status: terminal?.status, report }).toMatchObject({ status: "succeeded" });
      expect({ missing, report }).toMatchObject({ missing: [] });
      expect(report.blogDetailPaths).toHaveLength(3);
      expect(blogIndexChecks).toMatchObject({
        hasBlogRoot: true,
        hasBlogList: true,
        hasBlogApi: true,
        hasRouteChoreographyCopy: false,
      });
    },
    40 * 60 * 1000,
  );
});
