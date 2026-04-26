import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { SkillRuntimeExecutor } from "./executor";

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
