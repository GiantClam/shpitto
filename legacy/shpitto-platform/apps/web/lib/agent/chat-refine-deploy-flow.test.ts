import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { completeChatTask, createChatTask, getLatestChatTaskForChat } from "./chat-task-store";

describe("chat refine -> deploy full flow", () => {
  it(
    "preserves contract continuity from preview refine into deploy",
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
        const contractHash = "b".repeat(64);
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
                generationLane: "website-generation-mvp",
                generationLaneConfig: { disableWebSearch: true, routePolicy: "default" },
                contractHash,
                generationContract: {
                  contractVersion: 1,
                  contractHash,
                  generationLane: "website-generation-mvp",
                  websiteSurfaceMode: "portfolio-blog-site",
                  promptControlManifest: null,
                  discoveryBrief: null,
                  selectedSeedSkillManifest: {
                    selected: [{ id: "content-hub-site", source: "shpitto", reason: "seeded baseline" }],
                  },
                  routeUnitContracts: [
                    {
                      route: "/",
                      navLabel: "Home",
                      pageKind: "intent",
                      routeContract: ["route=/", "navLabel=Home", "pageKind=intent"],
                      inheritedSeedSkillIds: ["content-hub-site"],
                    },
                  ],
                },
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
        expect((queuedRefineTask?.result?.internal?.inputState as any)?.workflow_context?.contractHash).toBe(contractHash);
        const refinedProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-refined-project.json`);
        await fs.writeFile(
          refinedProjectPath,
          JSON.stringify(
            {
              projectId: "refine-deploy-demo",
              pages: [{ path: "/", html: "<!doctype html><html><head><title>Refined Title</title></head><body>Demo</body></html>" }],
              staticSite: {
                mode: "skill-direct",
                files: [
                  {
                    path: "/index.html",
                    type: "text/html",
                    content: "<!doctype html><html><head><title>Refined Title</title></head><body>Demo</body></html>",
                  },
                  { path: "/styles.css", type: "text/css", content: "body{color:#22c55e}" },
                  { path: "/script.js", type: "text/javascript", content: "console.log('ok');" },
                ],
              },
            },
            null,
            2,
          ),
          "utf8",
        );
        await completeChatTask(queuedRefineTask!.id, {
          ...(queuedRefineTask!.result || {}),
          assistantText: "refined",
          phase: "end",
          internal: {
            ...(queuedRefineTask!.result?.internal || {}),
            sessionState: {
              ...((queuedRefineTask!.result?.internal as any)?.inputState || {}),
              workflow_context: {
                ...(((queuedRefineTask!.result?.internal as any)?.inputState?.workflow_context || {}) as Record<string, unknown>),
                checkpointProjectPath: refinedProjectPath,
                deploySourceProjectPath: refinedProjectPath,
              },
            },
          },
          progress: {
            stage: "refined",
            checkpointProjectPath: refinedProjectPath,
          } as any,
        });

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
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.contractHash).toBe(contractHash);
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.generationContract?.contractHash).toBe(
          contractHash,
        );
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
