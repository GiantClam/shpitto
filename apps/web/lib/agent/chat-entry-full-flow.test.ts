import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getLatestChatTaskForChat } from "./chat-task-store";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

describe("chat entry full website flow", () => {
  const confirmPayload = (text: string) => `__SHP_CONFIRM_GENERATE__\n${text}`;

  it(
    "runs real flow from chat -> generation -> deploy and verifies each stage",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;

      process.env.CHAT_TASKS_USE_SUPABASE = "0";

      try {
        expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);

        const chatId = `chat-full-flow-${Date.now()}`;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { GET: getHistory } = await import("../../app/api/chat/history/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        // 1) Chat request queues generation task
        const generateReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload("Generate full website") }] }],
          }),
        });
        const generateRes = await POST(generateReq);
        expect(generateRes.status).toBe(202);

        const queuedGenerateTask = await getLatestChatTaskForChat(chatId);
        expect(queuedGenerateTask).toBeTruthy();
        expect(queuedGenerateTask?.status).toBe("queued");
        expect(queuedGenerateTask?.result?.progress?.stage).toBe("queued");

        // 2) Poll task endpoint before worker execution
        const queuedGenerateStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        const queuedGenerateStatusJson = await queuedGenerateStatusRes.json();
        expect(queuedGenerateStatusRes.status).toBe(200);
        expect(queuedGenerateStatusJson?.ok).toBe(true);
        expect(queuedGenerateStatusJson?.task?.status).toBe("queued");

        // 3) Run real worker for generation
        const processedGeneration = await runChatTaskWorkerOnce();
        expect(processedGeneration).toBe(true);

        const doneGenerateRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        const doneGenerateJson = await doneGenerateRes.json();
        expect(doneGenerateRes.status).toBe(200);
        expect(doneGenerateJson?.task?.status).toBe("succeeded");
        expect(doneGenerateJson?.task?.result?.progress?.stage).toBe("done");

        const generatedFiles = doneGenerateJson?.task?.result?.progress?.generatedFiles || [];
        expect(generatedFiles).toEqual(expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]));

        const checkpointProjectPath = String(
          doneGenerateJson?.task?.result?.progress?.checkpointProjectPath || "",
        ).trim();
        expect(checkpointProjectPath).toBeTruthy();

        const projectJsonRaw = await fs.readFile(checkpointProjectPath, "utf8");
        const projectJson = JSON.parse(projectJsonRaw);
        expect(projectJson?.staticSite?.mode).toBe("skill-direct");
        expect(Array.isArray(projectJson?.staticSite?.files)).toBe(true);
        expect(
          (projectJson?.staticSite?.files || []).some((f: any) => String(f?.path || "").trim() === "/index.html"),
        ).toBe(true);

        // 4) Verify preview route works for generated checkpoint
        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        expect(previewRootRes.status).toBe(307);
        expect(String(previewRootRes.headers.get("location") || "")).toContain(
          `/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/index.html`,
        );

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id, path: ["index.html"] }),
        });
        expect(previewIndexRes.status).toBe(200);
        const previewHtml = await previewIndexRes.text();
        expect(previewHtml.toLowerCase()).toContain("<!doctype html");
        expect(previewHtml).toContain(`/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/`);

        // 5) Chat request queues deploy task based on generated checkpoint
        const deployReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
          }),
        });
        const deployQueueRes = await POST(deployReq);
        expect(deployQueueRes.status).toBe(202);

        const queuedDeployTask = await getLatestChatTaskForChat(chatId);
        expect(queuedDeployTask).toBeTruthy();
        expect(queuedDeployTask?.id).not.toBe(queuedGenerateTask?.id);
        expect(queuedDeployTask?.status).toBe("queued");
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deployRequested).toBe(true);
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId).toBe(
          queuedGenerateTask?.id,
        );
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceProjectPath).toBe(
          checkpointProjectPath,
        );

        // 6) Run real worker for deploy
        const processedDeploy = await runChatTaskWorkerOnce();
        expect(processedDeploy).toBe(true);

        const doneDeployRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedDeployTask!.id }),
        });
        const doneDeployJson = await doneDeployRes.json();
        expect(doneDeployRes.status).toBe(200);
        expect(doneDeployJson?.task?.status).toBe("succeeded");
        expect(doneDeployJson?.task?.result?.progress?.stage).toBe("deployed");
        expect(String(doneDeployJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");
        expect(doneDeployJson?.task?.result?.actions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "View Live Site",
              type: "url",
            }),
          ]),
        );

        // 7) Verify history points to deploy result and contains completion messages
        const historyRes = await getHistory(
          new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`),
        );
        const historyJson = await historyRes.json();
        expect(historyRes.status).toBe(200);
        expect(historyJson?.ok).toBe(true);
        expect(historyJson?.task?.id).toBe(queuedDeployTask?.id);
        expect(historyJson?.task?.status).toBe("succeeded");
        expect(String(historyJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");
        expect(Array.isArray(historyJson?.messages)).toBe(true);
        expect((historyJson?.messages || []).filter((item: any) => item.role === "user").length).toBeGreaterThanOrEqual(2);
        expect((historyJson?.messages || []).filter((item: any) => item.role === "assistant").length).toBeGreaterThanOrEqual(2);
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
      }
    },
    900_000,
  );
});
