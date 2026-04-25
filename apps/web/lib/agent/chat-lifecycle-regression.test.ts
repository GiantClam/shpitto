import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  completeChatTask,
  createChatTask,
  failChatTask,
  getChatTask,
  getLatestChatTaskForChat,
} from "./chat-task-store";

async function sendChat(chatId: string, text: string) {
  const { POST } = await import("../../app/api/chat/route");
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text }] }],
      }),
    }),
  );
}

async function seedPreviewBaseline(chatId: string, fileSuffix = "project") {
  const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-${fileSuffix}.json`);
  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(
    projectPath,
    JSON.stringify(
      {
        projectId: chatId,
        pages: [{ path: "/", html: "<!doctype html><html><head><title>Demo</title></head><body>Demo</body></html>" }],
        staticSite: {
          mode: "skill-direct",
          files: [
            { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Demo</title></head><body>Demo</body></html>" },
            { path: "/styles.css", type: "text/css", content: "body{color:#111}" },
            { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const task = await createChatTask(chatId, undefined, {
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
  await completeChatTask(task.id, {
    assistantText: "generated",
    phase: "end",
    internal: task.result?.internal,
    progress: {
      stage: "done",
      checkpointProjectPath: projectPath,
    } as any,
  });
  return { taskId: task.id, projectPath };
}

describe("chat lifecycle regression", () => {
  it(
    "covers all major lifecycle branches with simulated user inputs",
    async () => {
      // 1) drafting -> clarify -> generate
      const chatClarify = `chat-reg-clarify-${Date.now()}`;
      const clarifyRes = await sendChat(chatClarify, "做一个企业网站");
      expect(clarifyRes.status).toBe(200);
      expect(await getLatestChatTaskForChat(chatClarify)).toBeUndefined();
      const generateAfterClarifyRes = await sendChat(chatClarify, "开始生成");
      expect(generateAfterClarifyRes.status).toBe(202);
      const clarifyGenerateTask = await getLatestChatTaskForChat(chatClarify);
      expect((clarifyGenerateTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

      // 2) drafting -> generate (direct explicit)
      const chatDirectGenerate = `chat-reg-direct-${Date.now()}`;
      const directGenerateRes = await sendChat(
        chatDirectGenerate,
        "开始生成：LC-CNC 官网，Home/About/Products/Cases/Contact，蓝色科技风，部署 cloudflare",
      );
      expect(directGenerateRes.status).toBe(202);
      const directGenerateTask = await getLatestChatTaskForChat(chatDirectGenerate);
      expect((directGenerateTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

      // 3) previewing -> refine_preview
      const chatRefinePreview = `chat-reg-refine-preview-${Date.now()}`;
      await seedPreviewBaseline(chatRefinePreview, "preview");
      const refinePreviewRes = await sendChat(chatRefinePreview, "把主色改成蓝色");
      expect(refinePreviewRes.status).toBe(202);
      const refinePreviewTask = await getLatestChatTaskForChat(chatRefinePreview);
      expect((refinePreviewTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("refine");

      // 4) previewing -> deploy
      const chatDeployPreview = `chat-reg-deploy-preview-${Date.now()}`;
      await seedPreviewBaseline(chatDeployPreview, "deploy-preview");
      const deployFromPreviewRes = await sendChat(chatDeployPreview, "deploy to cloudflare");
      expect(deployFromPreviewRes.status).toBe(202);
      const deployFromPreviewTask = await getLatestChatTaskForChat(chatDeployPreview);
      expect((deployFromPreviewTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("deploy");

      // 5) deployed -> refine_deployed -> deploy
      const chatDeployedFlow = `chat-reg-deployed-flow-${Date.now()}`;
      const baseline = await seedPreviewBaseline(chatDeployedFlow, "deployed");
      const deployedTask = await createChatTask(chatDeployedFlow, undefined, {
        assistantText: "deployed",
        phase: "end",
        internal: {
          sessionState: {
            messages: [],
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            deployed_url: "https://demo.pages.dev",
            workflow_context: {
              checkpointProjectPath: baseline.projectPath,
              deploySourceProjectPath: baseline.projectPath,
            },
          },
        },
        progress: {
          stage: "deployed",
          checkpointProjectPath: baseline.projectPath,
        } as any,
        deployedUrl: "https://demo.pages.dev",
      });
      await completeChatTask(deployedTask.id, {
        assistantText: "deployed",
        phase: "end",
        internal: deployedTask.result?.internal,
        progress: {
          stage: "deployed",
          checkpointProjectPath: baseline.projectPath,
        } as any,
        deployedUrl: "https://demo.pages.dev",
      });

      const refineDeployedRes = await sendChat(chatDeployedFlow, "把上线版本标题改成 LC-CNC Global");
      expect(refineDeployedRes.status).toBe(202);
      const refineDeployedTask = await getLatestChatTaskForChat(chatDeployedFlow);
      expect((refineDeployedTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("refine");
      await completeChatTask(refineDeployedTask!.id, {
        ...(refineDeployedTask!.result || {}),
        assistantText: "refined",
        phase: "end",
        progress: {
          stage: "refined",
          checkpointProjectPath: baseline.projectPath,
        } as any,
      });
      const redeployRes = await sendChat(chatDeployedFlow, "deploy now");
      expect(redeployRes.status).toBe(202);
      const redeployTask = await getLatestChatTaskForChat(chatDeployedFlow);
      expect((redeployTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("deploy");

      // 6) low-confidence -> clarify
      const chatLowConfidence = `chat-reg-low-confidence-${Date.now()}`;
      const lowConfidenceRes = await sendChat(chatLowConfidence, "随便搞搞看");
      expect(lowConfidenceRes.status).toBe(200);
      expect(await getLatestChatTaskForChat(chatLowConfidence)).toBeUndefined();

      // 7) active-task -> dedupe
      const chatDedupe = `chat-reg-dedupe-${Date.now()}`;
      const firstRes = await sendChat(chatDedupe, "开始生成网站");
      expect(firstRes.status).toBe(202);
      const firstTask = await getLatestChatTaskForChat(chatDedupe);
      const secondRes = await sendChat(chatDedupe, "继续生成");
      expect(secondRes.status).toBe(202);
      const secondTask = await getLatestChatTaskForChat(chatDedupe);
      expect(secondTask?.id).toBe(firstTask?.id);

      // 8) refine-failed -> rollback/error surfaced
      const chatRefineFail = `chat-reg-refine-fail-${Date.now()}`;
      const missingProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatRefineFail}-missing.json`);
      const missingBaselineTask = await createChatTask(chatRefineFail, undefined, {
        assistantText: "generated",
        phase: "end",
        internal: {
          sessionState: {
            messages: [],
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            workflow_context: {
              checkpointProjectPath: missingProjectPath,
              deploySourceProjectPath: missingProjectPath,
            },
          },
        },
        progress: {
          stage: "done",
          checkpointProjectPath: missingProjectPath,
        } as any,
      });
      await completeChatTask(missingBaselineTask.id, {
        assistantText: "generated",
        phase: "end",
        internal: missingBaselineTask.result?.internal,
        progress: {
          stage: "done",
          checkpointProjectPath: missingProjectPath,
        } as any,
      });
      const refineFailQueueRes = await sendChat(chatRefineFail, "把主色改成蓝色");
      expect(refineFailQueueRes.status).toBe(202);
      const queuedRefineFailTask = await getLatestChatTaskForChat(chatRefineFail);
      await failChatTask(
        queuedRefineFailTask!.id,
        "No preview/deployed baseline found for refine. Please generate a site first, then request refinement.",
      );
      const failedTask = await getChatTask(queuedRefineFailTask!.id);
      expect(failedTask?.status).toBe("failed");
      expect(String(failedTask?.result?.error || "")).toContain("No preview/deployed baseline");
    },
    240_000,
  );
});
