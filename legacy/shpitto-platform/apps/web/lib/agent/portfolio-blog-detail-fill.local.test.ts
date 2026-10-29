import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import dotenv from "dotenv";
import { getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../..", ".env"), override: false, quiet: true });

describe("portfolio blog detail fill local", () => {
  it(
    "fills deferred blog details and aligns archive slugs with detail routes",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;

      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
      process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "300000";
      process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";

      try {
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        const chatId = `portfolio-blog-detail-fill-${Date.now().toString(36)}`;
        const initialRequirement = [
          "# Canonical Website Generation Prompt",
          "",
          "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
          "The first pass only needs a strong blog index and a profile-led homepage.",
          "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
        ].join("\n");

        const initialRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: `__SHP_CONFIRM_GENERATE__\n${initialRequirement}` }] }],
            }),
          }),
        );

        expect(initialRes.status).toBe(202);
        const initialTask = await getLatestChatTaskForChat(chatId);
        expect(initialTask).toBeTruthy();

        const waitForTask = async (taskId: string) => {
          const deadline = Date.now() + 25 * 60 * 1000;
          while (Date.now() < deadline) {
            const latest = await getChatTask(taskId);
            if (latest?.status === "succeeded") return latest;
            if (latest?.status === "failed") {
              throw new Error(String(latest.result?.assistantText || latest.result?.error || "task failed"));
            }
            if (latest?.status === "queued") {
              await runChatTaskWorkerOnce();
              continue;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
          throw new Error(`task timeout: ${taskId}`);
        };

        await waitForTask(initialTask!.id);

        const fillRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: "fill blog detail pages now and align the slugs" }] }],
            }),
          }),
        );
        expect(fillRes.status).toBe(202);

        const fillTask = await getLatestChatTaskForChat(chatId);
        expect(fillTask).toBeTruthy();
        expect(fillTask?.id).not.toBe(initialTask?.id);

        await waitForTask(fillTask!.id);

        const doneTaskRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: fillTask!.id }),
        });
        const doneTaskJson = await doneTaskRes.json();
        expect(doneTaskJson?.task?.status).toBe("succeeded");

        const doneTaskRecord = await getChatTask(fillTask!.id);
        const workflow =
          doneTaskRecord?.result?.internal?.sessionState?.workflow_context ||
          doneTaskRecord?.result?.internal?.inputState?.workflow_context ||
          {};
        expect(workflow.blogDetailFillStatus).toBe("completed");
        expect(workflow.blogDetailFillCompleted).toBe(true);

        const previewBaseUrl = `http://localhost:3000/api/chat/tasks/${fillTask!.id}/preview`;
        const previewBlogRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: fillTask!.id, path: ["blog", "index.html"] }),
        });
        expect(previewBlogRes.status).toBe(200);
        await previewBlogRes.text();
        const checkpointSiteDir = String(doneTaskRecord?.result?.progress?.checkpointSiteDir || "").trim();
        const previewBlogHtml = checkpointSiteDir
          ? await fs.readFile(path.join(checkpointSiteDir, "blog", "index.html"), "utf8")
          : "";

        const archiveSlugs = Array.from(
          new Set(
            Array.from(previewBlogHtml.matchAll(/href=["']\/blog\/([^"'#?\/]+)\/?["']/gi)).map((match) => match[1]),
          ),
        );
        expect(archiveSlugs.length).toBeGreaterThan(0);

        const detailChecks: Array<{ slug: string; status: number; hasH1: boolean; h2Count: number }> = [];
        for (const slug of archiveSlugs) {
          const detailRes = await getPreviewFile(new Request("http://localhost"), {
            params: Promise.resolve({ taskId: fillTask!.id, path: ["blog", slug, "index.html"] }),
          });
          const detailHtml = await detailRes.text();
          detailChecks.push({
            slug,
            status: detailRes.status,
            hasH1: /<h1\b/i.test(detailHtml),
            h2Count: (detailHtml.match(/<h2\b/gi) || []).length,
          });
        }

        expect(detailChecks.every((item) => item.status === 200)).toBe(true);
        expect(detailChecks.every((item) => item.hasH1)).toBe(true);
        expect(detailChecks.every((item) => item.h2Count >= 2)).toBe(true);

        console.log(
          JSON.stringify(
            {
              PORTFOLIO_BLOG_DETAIL_FILL_RESULT: {
                chatId,
                taskId: fillTask!.id,
                previewUrl: `${previewBaseUrl}/__default__`,
                previewBlogUrl: `${previewBaseUrl}/blog/index.html`,
                archiveSlugs,
                detailChecks,
                generatedFiles: doneTaskJson?.task?.result?.progress?.generatedFiles || [],
                blogDetailFillStatus: workflow.blogDetailFillStatus,
                blogDetailFillCompleted: workflow.blogDetailFillCompleted,
              },
            },
            null,
            2,
          ),
        );
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevAsyncTaskTimeoutMs === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
        else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        if (prevStageBudgetPerFileMs === undefined) delete process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
        else process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundAbsoluteTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
      }
    },
    45 * 60 * 1000,
  );
});
