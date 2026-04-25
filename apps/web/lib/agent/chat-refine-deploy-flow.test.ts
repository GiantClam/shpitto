import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { completeChatTask, createChatTask, getLatestChatTaskForChat } from "./chat-task-store";

describe("chat refine -> deploy full flow", () => {
  it(
    "runs preview refine then deploy from refined checkpoint",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevCfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const prevCfApiToken = process.env.CLOUDFLARE_API_TOKEN;
      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CLOUDFLARE_ACCOUNT_ID = "";
      process.env.CLOUDFLARE_API_TOKEN = "";

      try {
        const chatId = `chat-refine-deploy-${Date.now()}`;
        const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
        await fs.mkdir(path.dirname(projectPath), { recursive: true });
        await fs.writeFile(
          projectPath,
          JSON.stringify(
            {
              projectId: "refine-deploy-demo",
              pages: [{ path: "/", html: "<!doctype html><html><head><title>Old Title</title></head><body>Demo</body></html>" }],
              staticSite: {
                mode: "skill-direct",
                files: [
                  { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Old Title</title></head><body>Demo</body></html>" },
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

        const generated = await createChatTask(chatId, undefined, {
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
        await completeChatTask(generated.id, {
          assistantText: "generated",
          phase: "end",
          internal: generated.result?.internal,
          progress: {
            stage: "done",
            checkpointProjectPath: projectPath,
          } as any,
        });

        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        const refineReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: "把标题改成 Refined Title，主色改成#22c55e" }] }],
          }),
        });
        const refineQueueRes = await POST(refineReq);
        expect(refineQueueRes.status).toBe(202);

        const queuedRefineTask = await getLatestChatTaskForChat(chatId);
        expect((queuedRefineTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("refine");

        const refineProcessed = await runChatTaskWorkerOnce();
        expect(refineProcessed).toBe(true);

        const refinedStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedRefineTask!.id }),
        });
        const refinedJson = await refinedStatusRes.json();
        expect(refinedStatusRes.status).toBe(200);
        expect(refinedJson?.task?.status).toBe("succeeded");
        expect(refinedJson?.task?.result?.progress?.stage).toBe("refined");
        const refinedProjectPath = String(refinedJson?.task?.result?.progress?.checkpointProjectPath || "");
        expect(refinedProjectPath).toBeTruthy();
        const refinedProjectRaw = await fs.readFile(refinedProjectPath, "utf8");
        expect(refinedProjectRaw).toContain("Refined Title");
        expect(refinedProjectRaw).toContain("#22c55e");

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
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("deploy");
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId).toBe(
          queuedRefineTask?.id,
        );
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceProjectPath).toBe(
          refinedProjectPath,
        );

        const deployProcessed = await runChatTaskWorkerOnce();
        expect(deployProcessed).toBe(true);

        const deployedStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedDeployTask!.id }),
        });
        const deployedJson = await deployedStatusRes.json();
        expect(deployedStatusRes.status).toBe(200);
        expect(deployedJson?.task?.status).toBe("succeeded");
        expect(deployedJson?.task?.result?.progress?.stage).toBe("deployed");
        expect(String(deployedJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;

        if (prevCfAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
        else process.env.CLOUDFLARE_ACCOUNT_ID = prevCfAccountId;

        if (prevCfApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
        else process.env.CLOUDFLARE_API_TOKEN = prevCfApiToken;
      }
    },
    240_000,
  );
});

