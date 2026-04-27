import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
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

    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: `deploy-task-${Date.now()}`,
      chatId: `deploy-chat-${Date.now()}`,
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
    expect(lastMessage).toContain("Domain Configuration Guide");
    expect(lastMessage).toContain("Custom domains");
    expect(lastMessage).toContain(".pages.dev");
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
