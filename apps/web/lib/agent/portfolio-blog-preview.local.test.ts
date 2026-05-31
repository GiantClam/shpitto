import { describe, expect, it } from "vitest";
import path from "node:path";
import dotenv from "dotenv";
import { getChatTask, getLatestChatTaskForChat } from "./chat-task-store";
import { captureMobilePreviewScreenshots } from "./chat-replay-live-test-helpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../..", ".env"), override: false, quiet: true });

describe("portfolio blog preview local", () => {
  it(
    "generates an index-first portfolio blog preview and exposes local preview urls",
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

        const chatId = `portfolio-blog-preview-${Date.now().toString(36)}`;
        const requirement = [
          "# Canonical Website Generation Prompt",
          "",
          "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
          "The first pass only needs a strong blog index and a profile-led homepage.",
          "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
        ].join("\n");

        const res = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: `__SHP_CONFIRM_GENERATE__\n${requirement}` }] }],
            }),
          }),
        );

        expect(res.status).toBe(202);
        const task = await getLatestChatTaskForChat(chatId);
        expect(task).toBeTruthy();

        const deadline = Date.now() + 25 * 60 * 1000;
        while (Date.now() < deadline) {
          const latest = await getChatTask(task!.id);
          if (latest?.status === "succeeded") break;
          if (latest?.status === "failed") {
            throw new Error(String(latest.result?.assistantText || latest.result?.error || "generation failed"));
          }
          if (latest?.status === "queued") {
            await runChatTaskWorkerOnce();
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const doneTaskRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: task!.id }),
        });
        const doneTaskJson = await doneTaskRes.json();
        expect(doneTaskJson?.task?.status).toBe("succeeded");

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: task!.id, path: ["index.html"] }),
        });
        expect(previewIndexRes.status).toBe(200);
        const previewIndexHtml = await previewIndexRes.text();
        expect(previewIndexHtml.toLowerCase()).toContain("<!doctype html");

        const previewBlogRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: task!.id, path: ["blog", "index.html"] }),
        });
        expect(previewBlogRes.status).toBe(200);
        const previewBlogHtml = await previewBlogRes.text();
        expect(previewBlogHtml).toContain("data-shpitto-blog-root");
        expect(previewBlogHtml).toContain('data-shpitto-blog-api="/api/blog/posts"');
        expect(previewBlogHtml).toContain("data-shpitto-blog-list");

        const previewBaseUrl = `http://localhost:3000/api/chat/tasks/${task!.id}/preview`;
        const previewRootHttp = await fetch(`${previewBaseUrl}/index.html`);
        expect(previewRootHttp.status).toBe(200);
        const previewBlogHttp = await fetch(`${previewBaseUrl}/blog/index.html`);
        expect(previewBlogHttp.status).toBe(200);
        const generatedFiles = doneTaskJson?.task?.result?.progress?.generatedFiles || [];
        expect(generatedFiles).not.toContain("/blog/ai-opportunity-scan/index.html");

        const previewDetailHttp = await fetch(`${previewBaseUrl}/blog/ai-opportunity-scan/index.html`);
        expect(previewDetailHttp.status).toBe(404);

        const shouldRunMobileScreenshotQa =
          String(process.env.RUN_PREVIEW_MOBILE_SCREENSHOT_QA || "").trim() === "1";
        const mobileScreenshotQa = shouldRunMobileScreenshotQa
          ? await captureMobilePreviewScreenshots({
              previewUrl: `${previewBaseUrl}/index.html`,
              outputDir: path.resolve(process.cwd(), ".tmp", "qa-screenshots", chatId),
            })
          : {
              previewUrl: `${previewBaseUrl}/index.html`,
              artifacts: [],
              executed: false,
              skippedReason: "RUN_PREVIEW_MOBILE_SCREENSHOT_QA != 1",
            };

        if (shouldRunMobileScreenshotQa) {
          expect(mobileScreenshotQa.executed).toBe(true);
          expect(mobileScreenshotQa.artifacts.length).toBeGreaterThanOrEqual(4);
        }

        console.log(
          JSON.stringify(
            {
              PORTFOLIO_BLOG_PREVIEW_RESULT: {
                chatId,
                taskId: task!.id,
                previewUrl: `${previewBaseUrl}/__default__`,
                previewIndexUrl: `${previewBaseUrl}/index.html`,
                previewBlogUrl: `${previewBaseUrl}/blog/index.html`,
                generatedFiles,
                mobileScreenshotQa,
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
    30 * 60 * 1000,
  );
});
