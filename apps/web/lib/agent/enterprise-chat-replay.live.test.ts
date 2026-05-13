import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  confirmGenerate,
  fileContent,
  htmlToVisibleText,
  loadGeneratedProject,
  parsePromptControlManifest,
  pickReplayPrompt,
  routeToHtmlPath,
} from "./chat-replay-live-test-helpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const runEnterpriseReplay = String(process.env.RUN_ENTERPRISE_CHAT_REPLAY || "").trim() === "1";
const replayChatId = String(process.env.ENTERPRISE_CHAT_REPLAY_ID || "").trim();

process.env.CHAT_TASKS_USE_SUPABASE = "1";
process.env.CHAT_WORKER_CLAIM_MODES = process.env.CHAT_WORKER_CLAIM_MODES || "generate,deploy";

describe.skipIf(!runEnterpriseReplay)("enterprise existing chat live replay", () => {
  it(
    "replays generation for the existing enterprise chat and prints a preview link",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevRoundIdleTimeoutMs = process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;

      try {
        expect(replayChatId).toBeTruthy();

        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
        process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";
        process.env.LLM_PROVIDER = "pptoken";
        process.env.LLM_PROVIDER_ORDER = "pptoken";

        const { getLatestChatTaskForChat, listChatTimelineMessages } = await import("./chat-task-store");
        const beforeLatest = await getLatestChatTaskForChat(replayChatId);
        const ownerUserId = String(beforeLatest?.ownerUserId || "").trim() || undefined;
        const existingTimeline = await listChatTimelineMessages(replayChatId, 500);
        const replayPrompt = pickReplayPrompt(existingTimeline);
        const promptManifest = parsePromptControlManifest(replayPrompt);
        expect(replayPrompt.length).toBeGreaterThan(40);

        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        (globalThis as any).__shpittoChatTaskStore = undefined;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: confirmGenerate(replayPrompt) }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerate = await getLatestChatTaskForChat(replayChatId);
        expect(queuedGenerate?.id).toBeTruthy();
        expect(queuedGenerate?.id).not.toBe(beforeLatest?.id);
        expect((queuedGenerate?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

        await SkillRuntimeExecutor.runTask({
          taskId: queuedGenerate!.id,
          chatId: replayChatId,
          workerId: "enterprise-replay-generate-test",
          inputState: (queuedGenerate?.result?.internal?.inputState || {}) as any,
        });
        const generated = await getLatestChatTaskForChat(replayChatId);
        expect(generated.status).toBe("succeeded");
        expect(generated.result?.progress?.stage).toBe("done");

        const generatedProject = await loadGeneratedProject(generated);
        const projectJson = generatedProject.project;
        const files = (projectJson?.staticSite?.files || []) as Array<{ path?: string; content?: string; type?: string }>;
        const paths = files.map((file) => String(file.path || ""));
        const indexHtml = fileContent(files, "/index.html");
        const htmlFiles = files.filter((file) => String(file.path || "").endsWith(".html"));
        const combinedVisibleText = htmlToVisibleText(htmlFiles.map((file) => String(file.content || "")).join("\n"));
        const expectedManifestFiles = Array.from(
          new Set((promptManifest?.files || []).map((item) => String(item || "").trim()).filter(Boolean)),
        );
        const expectedManifestHtmlPaths = Array.from(
          new Set((promptManifest?.routes || []).map((route) => routeToHtmlPath(route)).filter(Boolean)),
        );

        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: generated.id }),
        });
        const previewUrlPath = String(previewRootRes.headers.get("location") || "");
        const previewBaseUrl = String(process.env.SHPITTO_PREVIEW_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
        const previewUrl = previewUrlPath ? `${previewBaseUrl}${previewUrlPath}` : "";
        expect(previewRootRes.status).toBe(307);
        expect(previewUrlPath).toContain(`/api/chat/tasks/${encodeURIComponent(generated.id)}/preview/index.html`);

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: generated.id, path: ["index.html"] }),
        });
        const previewIndexHtml = await previewIndexRes.text();
        expect(previewIndexRes.status).toBe(200);
        expect(previewIndexHtml.toLowerCase()).toContain("<!doctype html");

        expect(paths).toEqual(expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]));
        if (expectedManifestFiles.length > 0) {
          expect(paths).toEqual(expect.arrayContaining(expectedManifestFiles));
        }
        if (expectedManifestHtmlPaths.length > 0) {
          expect(paths).toEqual(expect.arrayContaining(expectedManifestHtmlPaths));
        }
        expect(indexHtml.length).toBeGreaterThan(500);
        expect(combinedVisibleText.length).toBeGreaterThan(300);

        console.log(
          "ENTERPRISE_CHAT_REPLAY_PREVIEW=" +
            JSON.stringify(
              {
                chatId: replayChatId,
                taskId: generated.id,
                generatedProjectSource: generatedProject.source,
                promptManifest,
                generatedPaths: paths,
                previewUrlPath,
                previewUrl,
              },
              null,
              2,
            ),
        );
      } finally {
        process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundIdleTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = prevRoundIdleTimeoutMs;
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
        else process.env.LLM_PROVIDER = prevProvider;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
      }
    },
    20 * 60 * 1000,
  );
});
