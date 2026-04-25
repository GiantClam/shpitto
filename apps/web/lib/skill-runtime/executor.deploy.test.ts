import { describe, expect, it } from "vitest";
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
    expect(Boolean(nextState?.workflow_context?.deployRequested)).toBe(false);
  });
});

