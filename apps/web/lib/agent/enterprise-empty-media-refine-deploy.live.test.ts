import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  fileContent,
  loadGeneratedProject,
  normalizePagesUrl,
} from "./chat-replay-live-test-helpers";
import { findCorporateB2BHomepageContractIssuesForTesting } from "../skill-runtime/skill-tool-executor";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const shouldRun = String(process.env.RUN_ENTERPRISE_EMPTY_MEDIA_REPLAY || "").trim() === "1";
const replayChatId = "chat-1780075661714-ju2ujr";
const knownOwnerUserId = "4978c369-d99b-46ca-b9d8-42fd73fb19c0";

const refineInstruction = [
  "Refine the current enterprise B2B site.",
  "Replace placeholder blank media blocks on the homepage hero and the Cases page with real image-backed media.",
  "Do not use placeholder scaffolding such as media-frame or ph-img.",
  "The homepage opening hero must satisfy the enterprise corporate homepage contract with real media.",
  "Keep the existing blue industrial B2B positioning and current page set.",
].join(" ");

function hasPlaceholderMedia(html: string) {
  return /\bmedia-frame\b|\bph-img\b/i.test(String(html || ""));
}

async function fetchTextWithRetry(url: string, attempts = 6, delayMs = 4_000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      }
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || "fetch failed"));
}

describe.skipIf(!shouldRun)("enterprise empty media refine deploy replay", () => {
  it(
    "refines the real enterprise chat, deploys it, and keeps domain-binding guidance visible",
    async () => {
      process.env.CHAT_TASKS_USE_SUPABASE = "1";
      process.env.CLOUDFLARE_REQUIRE_REAL = "1";
      process.env.CLOUDFLARE_DEPLOY_STRATEGY ||= "wrangler";

      const { POST } = await import("../../app/api/chat/route");
      const { GET: getHistory } = await import("../../app/api/chat/history/route");
      const { getLatestChatTaskForChat } = await import("./chat-task-store");
      const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

      const beforeTask = await getLatestChatTaskForChat(replayChatId);
      expect(beforeTask?.id).toBeTruthy();

      const refineResponse = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: replayChatId,
            user_id: knownOwnerUserId,
            messages: [{ role: "user", parts: [{ type: "text", text: refineInstruction }] }],
          }),
        }),
      );
      const refineResponseText = await refineResponse.clone().text();
      expect(refineResponse.status, refineResponseText).toBe(202);

      const queuedRefineTask = await getLatestChatTaskForChat(replayChatId);
      expect(queuedRefineTask?.id).toBeTruthy();
      expect(queuedRefineTask?.id).not.toBe(beforeTask?.id);
      expect(String((queuedRefineTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode || "")).toBe(
        "refine",
      );

      await SkillRuntimeExecutor.runTask({
        taskId: queuedRefineTask!.id,
        chatId: replayChatId,
        workerId: "enterprise-empty-media-refine-live-test",
        inputState: (queuedRefineTask?.result?.internal?.inputState || {}) as any,
      });

      const refinedTask = await getLatestChatTaskForChat(replayChatId);
      expect(refinedTask?.id).toBe(queuedRefineTask?.id);
      expect(refinedTask?.status).toBe("succeeded");
      expect(String(refinedTask?.result?.progress?.stage || "")).toBe("refined");

      const refinedProject = await loadGeneratedProject(refinedTask);
      const refinedFiles = (refinedProject.project?.staticSite?.files || []) as Array<{ path?: string; content?: string }>;
      const refinedIndexHtml = fileContent(refinedFiles, "/index.html");
      const refinedCasesHtml = fileContent(refinedFiles, "/cases/index.html");
      const refinedStyles = fileContent(refinedFiles, "/styles.css");

      expect(refinedIndexHtml).toContain("enterprise-hero");
      expect(hasPlaceholderMedia(refinedIndexHtml)).toBe(false);
      expect(hasPlaceholderMedia(refinedCasesHtml)).toBe(false);
      expect(refinedIndexHtml).toMatch(/<(?:img|picture)\b/i);

      const homepageContractIssues = findCorporateB2BHomepageContractIssuesForTesting(
        refinedIndexHtml,
        refinedStyles,
        refineInstruction,
        "corporate-b2b-site",
      );
      expect(homepageContractIssues).toEqual([]);

      const deployResponse = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: replayChatId,
            user_id: knownOwnerUserId,
            messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
          }),
        }),
      );
      const deployResponseText = await deployResponse.clone().text();
      expect(deployResponse.status, deployResponseText).toBe(202);

      const queuedDeployTask = await getLatestChatTaskForChat(replayChatId);
      expect(queuedDeployTask?.id).toBeTruthy();
      expect(queuedDeployTask?.id).not.toBe(refinedTask?.id);
      expect(String((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode || "")).toBe(
        "deploy",
      );
      expect(
        String((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId || ""),
      ).toBe(refinedTask?.id);

      await SkillRuntimeExecutor.runTask({
        taskId: queuedDeployTask!.id,
        chatId: replayChatId,
        workerId: "enterprise-empty-media-deploy-live-test",
        inputState: (queuedDeployTask?.result?.internal?.inputState || {}) as any,
      });

      const deployedTask = await getLatestChatTaskForChat(replayChatId);
      expect(deployedTask?.id).toBe(queuedDeployTask?.id);
      expect(deployedTask?.status).toBe("succeeded");
      expect(String(deployedTask?.result?.progress?.stage || "")).toBe("deployed");

      const deployedUrl = normalizePagesUrl(String(deployedTask?.result?.deployedUrl || ""));
      expect(deployedUrl).toContain(".pages.dev");

      const liveHomepageHtml = await fetchTextWithRetry(`${deployedUrl}/`);
      const liveCasesHtml = await fetchTextWithRetry(`${deployedUrl}/cases/`);
      expect(hasPlaceholderMedia(liveHomepageHtml)).toBe(false);
      expect(hasPlaceholderMedia(liveCasesHtml)).toBe(false);
      expect(liveHomepageHtml).toContain("enterprise-hero");
      expect(liveHomepageHtml).toMatch(/<(?:img|picture)\b/i);

      const historyResponse = await getHistory(new Request(`http://localhost/api/chat/history?chatId=${replayChatId}`));
      const historyJson = await historyResponse.json();
      expect(historyResponse.status).toBe(200);
      const deployResultMessage = Array.isArray(historyJson?.messages)
        ? [...historyJson.messages]
            .reverse()
            .find(
              (message: any) =>
                String(message?.taskId || "") === deployedTask?.id && String(message?.role || "") === "assistant",
            )
        : null;
      expect(String(deployResultMessage?.metadata?.cardType || "")).toBe("domain_binding_required");
    },
    900_000,
  );
});
