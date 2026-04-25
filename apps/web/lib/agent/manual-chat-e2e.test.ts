import { describe, expect, it } from "vitest";
import path from "node:path";
import dotenv from "dotenv";
import { getLatestChatTaskForChat } from "./chat-task-store";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

describe("manual real chat e2e", () => {
  it(
    "runs chat -> generate -> preview -> deploy with a real user prompt",
    async () => {
      process.env.CHAT_TASKS_USE_SUPABASE = "0";

      expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);

      const chatId = `manual-real-chat-${Date.now()}`;
      const userPrompt =
        "Generate an industrial manufacturer website for LC-CNC with Home/About/Products/Cases/Contact, blue-gray tech style, English copy, and a strong Contact Us CTA emphasizing precision, customization, and global delivery.";
      const confirmPayload = `__SHP_CONFIRM_GENERATE__\n${userPrompt}`;

      const { POST } = await import("../../app/api/chat/route");
      const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
      const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
      const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
      const { GET: getHistory } = await import("../../app/api/chat/history/route");
      const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

      const generateRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload }] }],
          }),
        }),
      );
      expect(generateRes.status).toBe(202);

      const queuedGenerateTask = await getLatestChatTaskForChat(chatId);
      expect(queuedGenerateTask?.id).toBeTruthy();

      await runChatTaskWorkerOnce();

      const generatedTaskRes = await getTaskStatus(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
      });
      const generatedTaskJson = await generatedTaskRes.json();
      expect(generatedTaskRes.status).toBe(200);
      expect(generatedTaskJson?.task?.status).toBe("succeeded");
      expect(generatedTaskJson?.task?.result?.progress?.stage).toBe("done");

      const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
        params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
      });
      const previewLocation = String(previewRootRes.headers.get("location") || "");
      expect(previewRootRes.status).toBe(307);
      expect(previewLocation).toContain(`/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/index.html`);

      const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: queuedGenerateTask!.id, path: ["index.html"] }),
      });
      const previewHtml = await previewIndexRes.text();
      expect(previewIndexRes.status).toBe(200);
      expect(previewHtml.toLowerCase()).toContain("<!doctype html");

      const deployRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
          }),
        }),
      );
      expect(deployRes.status).toBe(202);

      const queuedDeployTask = await getLatestChatTaskForChat(chatId);
      expect(queuedDeployTask?.id).toBeTruthy();
      expect(queuedDeployTask?.id).not.toBe(queuedGenerateTask?.id);

      await runChatTaskWorkerOnce();

      const deployedTaskRes = await getTaskStatus(new Request("http://localhost"), {
        params: Promise.resolve({ taskId: queuedDeployTask!.id }),
      });
      const deployedTaskJson = await deployedTaskRes.json();
      expect(deployedTaskRes.status).toBe(200);
      expect(deployedTaskJson?.task?.status).toBe("succeeded");
      expect(deployedTaskJson?.task?.result?.progress?.stage).toBe("deployed");
      expect(String(deployedTaskJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");

      const historyRes = await getHistory(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const historyJson = await historyRes.json();
      expect(historyRes.status).toBe(200);
      expect(historyJson?.task?.id).toBe(queuedDeployTask?.id);

      const report = {
        generatedAt: new Date().toISOString(),
        chatId,
        userPrompt,
        generateTaskId: queuedGenerateTask!.id,
        generateStage: generatedTaskJson?.task?.result?.progress?.stage,
        previewUrlPath: previewLocation,
        deployTaskId: queuedDeployTask!.id,
        deployStage: deployedTaskJson?.task?.result?.progress?.stage,
        deployedUrl: deployedTaskJson?.task?.result?.deployedUrl,
        historyMessages: Array.isArray(historyJson?.messages) ? historyJson.messages.length : 0,
      };

      console.log("MANUAL_CHAT_E2E_REPORT=" + JSON.stringify(report));
    },
    900_000,
  );
});

