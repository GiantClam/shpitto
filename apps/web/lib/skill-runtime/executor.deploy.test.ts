import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, getChatTask } from "../agent/chat-task-store";
import { runPostDeploySmoke, SkillRuntimeExecutor } from "./executor";

function buildStaticSiteProject() {
  return {
    projectId: "deploy-flow-test",
    pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
    staticSite: {
      mode: "skill-direct",
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content: "<!doctype html><html><head><title>test</title></head><body>ok</body></html>",
        },
      ],
    },
  };
}

describe("SkillRuntimeExecutor deploy-only path", () => {
  it("retries post-deploy smoke after transient remote fetch failures", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevRetryMs = process.env.DEPLOY_SMOKE_RETRY_MS;
    const prevTimeout = process.env.DEPLOY_SMOKE_TIMEOUT_MS;
    let calls = 0;

    try {
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "3";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      process.env.DEPLOY_SMOKE_TIMEOUT_MS = "2000";
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) throw new Error("fetch failed");
        return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
      }) as typeof fetch;

      const result = await runPostDeploySmoke("https://deploy.example.pages.dev");

      expect(result.status).toBe("passed");
      expect(result.url).toBe("https://deploy.example.pages.dev");
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevAttempts;
      if (prevRetryMs === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevRetryMs;
      if (prevTimeout === undefined) delete process.env.DEPLOY_SMOKE_TIMEOUT_MS;
      else process.env.DEPLOY_SMOKE_TIMEOUT_MS = prevTimeout;
    }
  });

  it("uses the production pages.dev URL when the deployment alias is not reachable yet", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevRetryMs = process.env.DEPLOY_SMOKE_RETRY_MS;
    const calls: string[] = [];

    try {
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("hash.project.pages.dev")) throw new Error("fetch failed");
        return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
      }) as typeof fetch;

      const result = await runPostDeploySmoke("https://hash.project.pages.dev", {
        fallbackUrls: ["https://project.pages.dev"],
      });

      expect(result.status).toBe("passed");
      expect(result.url).toBe("https://project.pages.dev");
      expect(calls).toEqual(["https://hash.project.pages.dev", "https://project.pages.dev"]);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevAttempts;
      if (prevRetryMs === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevRetryMs;
    }
  });

  it("runs deploy when confirmation intent is present in workflow context", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    const chatId = `deploy-chat-${Date.now()}`;
    const task = await createChatTask(chatId);
    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: task.id,
      chatId,
      workerId: "test-worker",
      inputState: {
        messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
          deployRequested: true,
        } as any,
        site_artifacts: buildStaticSiteProject() as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
    expect(nextState?.workflow_context?.deployRequested).toBe(false);
    expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
    expect(nextState?.workflow_context?.smoke?.postDeploy?.status).toBe("skipped");
    const lastMessage = String(nextState?.messages?.[nextState.messages.length - 1]?.content || "");
    expect(lastMessage).toContain("Deployment successful:");
    expect(lastMessage).toContain(".pages.dev");
    expect(lastMessage).not.toContain("Domain Configuration Guide");
    expect(lastMessage).not.toContain("Custom domains");
    const completedTask = await getChatTask(task.id);
    expect(completedTask?.result?.timelineMetadata?.cardType).toBe("domain_guidance");
    expect(completedTask?.result?.timelineMetadata?.steps).toEqual(expect.arrayContaining([expect.stringContaining("DNS")]));
    expect(JSON.stringify(completedTask?.result?.timelineMetadata || {})).not.toContain("Cloudflare");
    expect(JSON.stringify(completedTask?.result?.timelineMetadata || {})).not.toContain("CLOUDFLARE");
    expect(completedTask?.result?.timelineMetadata?.analyticsStatus).toBeUndefined();
    expect(completedTask?.result?.timelineMetadata?.smoke).toBeUndefined();
    expect(completedTask?.result?.timelineMetadata?.dnsRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CNAME",
          host: "www",
        }),
      ]),
    );
  });

  it("skips Web Analytics provisioning for pages.dev deployments by default", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevWaPagesDev = process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
    const prevSmokeAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevSmokeRetry = process.env.DEPLOY_SMOKE_RETRY_MS;
    const calls: string[] = [];

    try {
      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/pages/projects/") && url.endsWith("/upload-token")) {
          return new Response(JSON.stringify({ success: true, result: { jwt: "jwt" } }), { status: 200 });
        }
        if (url.includes("/pages/assets/upload") || url.includes("/pages/assets/upsert-hashes")) {
          return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
        }
        if (url.includes("/deployments/deploy-id")) {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: "deploy-id",
                url: "https://deploy.example.pages.dev",
                latest_stage: { name: "deploy", status: "success" },
                stages: [{ name: "deploy", status: "success" }],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/deployments")) {
          return new Response(
            JSON.stringify({ success: true, result: { id: "deploy-id", url: "https://deploy.example.pages.dev" } }),
            { status: 200 },
          );
        }
        if (url.includes("/pages/projects/")) {
          return new Response(JSON.stringify({ success: true, result: { name: "deploy-project" } }), { status: 200 });
        }
        if (url.includes(".pages.dev")) {
          return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }) as typeof fetch;

      let nextState: any;
      await SkillRuntimeExecutor.runTask({
        taskId: `deploy-task-wa-skip-${Date.now()}`,
        chatId: `deploy-chat-wa-skip-${Date.now()}`,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
            deployRequested: true,
          } as any,
          site_artifacts: buildStaticSiteProject() as any,
        } as any,
        setSessionState: (state) => {
          nextState = state;
        },
      });

      expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
      expect(nextState?.workflow_context?.analyticsStatus).toBe("pending");
      expect(calls.some((url) => url.includes("/rum/site_info"))).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevWaPagesDev === undefined) delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      else process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV = prevWaPagesDev;
      if (prevSmokeAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevSmokeAttempts;
      if (prevSmokeRetry === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevSmokeRetry;
    }
  });

  it("redeploys the same chat to one stable Pages project and returns production URL", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevSmokeAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevSmokeRetry = process.env.DEPLOY_SMOKE_RETRY_MS;
    const projectNames: string[] = [];

    try {
      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const match = url.match(/\/pages\/projects\/([^/]+)/);
        if (match?.[1]) projectNames.push(match[1]);
        if (url.includes("/pages/projects/") && url.endsWith("/upload-token")) {
          return new Response(JSON.stringify({ success: true, result: { jwt: "jwt" } }), { status: 200 });
        }
        if (url.includes("/pages/assets/upload") || url.includes("/pages/assets/upsert-hashes")) {
          return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
        }
        if (url.includes("/deployments/deploy-id")) {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: "deploy-id",
                url: "https://hash.should-not-be-returned.pages.dev",
                latest_stage: { name: "deploy", status: "success" },
                stages: [{ name: "deploy", status: "success" }],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/deployments")) {
          return new Response(
            JSON.stringify({ success: true, result: { id: "deploy-id", url: "https://hash.should-not-be-returned.pages.dev" } }),
            { status: 200 },
          );
        }
        if (url.includes("/pages/projects/")) {
          return new Response(JSON.stringify({ success: true, result: { name: "stable-project" } }), { status: 200 });
        }
        if (url.includes(".pages.dev")) {
          return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }) as typeof fetch;

      const chatId = `stable-deploy-chat-${Date.now()}`;
      const firstProject = buildStaticSiteProject();
      const secondProject = {
        ...buildStaticSiteProject(),
        projectId: "changed-source-project",
        branding: { name: "Changed Brand" },
      };
      let firstState: any;
      let secondState: any;

      await SkillRuntimeExecutor.runTask({
        taskId: `stable-deploy-task-1-${Date.now()}`,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: { skillId: "website-generation-workflow", deployRequested: true } as any,
          site_artifacts: firstProject as any,
        } as any,
        setSessionState: (state) => {
          firstState = state;
        },
      });

      await SkillRuntimeExecutor.runTask({
        taskId: `stable-deploy-task-2-${Date.now()}`,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: { skillId: "website-generation-workflow", deployRequested: true } as any,
          site_artifacts: secondProject as any,
        } as any,
        setSessionState: (state) => {
          secondState = state;
        },
      });

      const uniqueProjects = Array.from(new Set(projectNames));
      expect(uniqueProjects).toHaveLength(1);
      expect(uniqueProjects[0]).toContain(chatId.slice(0, 28));
      expect(String(firstState?.deployed_url || "")).toBe(`https://${uniqueProjects[0]}.pages.dev`);
      expect(String(secondState?.deployed_url || "")).toBe(String(firstState?.deployed_url || ""));
      expect(String(secondState?.deployed_url || "")).not.toContain("hash.should-not-be-returned");
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevSmokeAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevSmokeAttempts;
      if (prevSmokeRetry === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevSmokeRetry;
    }
  });

  it("runs deploy for Chinese Cloudflare confirmation text", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: `deploy-task-zh-${Date.now()}`,
      chatId: `deploy-chat-zh-${Date.now()}`,
      workerId: "test-worker",
      inputState: {
        messages: [{ role: "user", content: "部署到 Cloudflare" }] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
        } as any,
        site_artifacts: buildStaticSiteProject() as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
    expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
    const lastMessage = String(nextState?.messages?.[nextState.messages.length - 1]?.content || "");
    expect(lastMessage).toContain("部署成功：");
  });

  it("writes latest checkpoint plus incremental step deltas during generation", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    const prevForceLocal = process.env.SKILL_TOOL_FORCE_LOCAL;
    process.env.SKILL_TOOL_FORCE_LOCAL = "1";
    const chatId = `checkpoint-chat-${Date.now()}`;
    const taskId = `checkpoint-task-${Date.now()}`;

    try {
      await SkillRuntimeExecutor.runTask({
        taskId,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "Generate a website for Northstar Robotics with Home and Contact pages" }] as any,
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
          } as any,
        } as any,
      });

      const taskRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId);
      const latestIndex = path.join(taskRoot, "latest", "site", "index.html");
      const latestStat = await fs.stat(latestIndex);
      expect(latestStat.isFile()).toBe(true);

      const stepRoot = path.join(taskRoot, "steps");
      const stepNames = (await fs.readdir(stepRoot)).sort();
      const lastStep = path.join(stepRoot, stepNames[stepNames.length - 1]);
      const delta = JSON.parse(await fs.readFile(path.join(lastStep, "delta.json"), "utf8"));
      expect(Array.isArray(delta.changedFiles)).toBe(true);
      expect(delta.latestSiteDir).toContain(path.join(taskRoot, "latest", "site"));
    } finally {
      if (prevForceLocal === undefined) delete process.env.SKILL_TOOL_FORCE_LOCAL;
      else process.env.SKILL_TOOL_FORCE_LOCAL = prevForceLocal;
    }
  });
});
