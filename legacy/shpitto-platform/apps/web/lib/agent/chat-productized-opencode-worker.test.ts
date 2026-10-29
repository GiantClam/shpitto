import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

function confirmPayload(text: string) {
  return `__SHP_CONFIRM_GENERATE__\n${text}`;
}

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const deadline = Date.now() + 4 * 60 * 1000;
  let lastStatus = "";
  let lastStage = "";

  while (Date.now() < deadline) {
    const task = await getChatTask(taskId);
    lastStatus = String(task?.status || "");
    lastStage = String(task?.result?.progress?.stage || "");

    if (task?.status === "succeeded") return task;
    if (task?.status === "failed") {
      throw new Error(
        `Task ${taskId} failed: ${String(task.result?.assistantText || (task.result as any)?.error || lastStage)}`,
      );
    }

    if (task?.status === "queued") {
      await runWorkerOnce();
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const finalTask = await getChatTask(taskId);
  if (finalTask?.status === "succeeded") return finalTask;
  if (finalTask?.status === "failed") {
    throw new Error(
      `Task ${taskId} failed: ${String(finalTask.result?.assistantText || (finalTask.result as any)?.error || lastStage)}`,
    );
  }
  throw new Error(`Timed out waiting for task ${taskId}; lastStatus=${lastStatus}, lastStage=${lastStage}`);
}

describe("productized OpenCode worker path", () => {
  it(
    "runs build-marketing-site through the worker and materializes a complete baseline checkpoint",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevPreserveDataHome = process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME;
      const prevExecutionMode = process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
      const prevBaselineFallback = process.env.SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK;
      const prevOpenCodeTimeout = process.env.SHPITTO_OPENCODE_TIMEOUT_MS;
      const chatId = `chat-productized-opencode-${Date.now()}`;

      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME = "1";
      process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION = "opencode";
      process.env.SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK = "1";
      process.env.SHPITTO_OPENCODE_TIMEOUT_MS = "10000";

      try {
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              skill_id: "build-marketing-site",
              messages: [
                {
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: confirmPayload(
                        "Build a launch-ready marketing website for an AI developer tool with home, pricing, and contact routes.",
                      ),
                    },
                  ],
                },
              ],
            }),
          }),
        );
        expect(generateRes.status).toBe(202);

        const queuedTask = await getLatestChatTaskForChat(chatId);
        expect(queuedTask?.status).toBe("queued");
        expect(queuedTask?.result?.progress?.skillId).toBe("build-marketing-site");

        const generatedTask = await waitForTerminalTask(String(queuedTask?.id || ""), runChatTaskWorkerOnce);
        expect(generatedTask.status).toBe("succeeded");
        expect(["done:opencode", "done:prepared-baseline"]).toContain(
          String(generatedTask.result?.progress?.stage || ""),
        );

        const taskStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedTask?.id || "") }),
        });
        const taskStatusJson = await taskStatusRes.json();
        expect(taskStatusRes.status).toBe(200);
        expect(taskStatusJson?.task?.status).toBe("succeeded");

        const progress = taskStatusJson?.task?.result?.progress || {};
        const checkpointProjectPath = String(progress.checkpointProjectPath || "").trim();
        const checkpointWorkflowDir = String(progress.checkpointWorkflowDir || "").trim();
        expect(checkpointProjectPath).toBeTruthy();
        expect(checkpointWorkflowDir).toBeTruthy();
        expect(progress.generatedFiles).toEqual(
          expect.arrayContaining(["/index.html", "/pricing/index.html", "/contact/index.html"]),
        );

        const projectJson = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
        expect(projectJson?.staticSite?.mode).toBe("shpitto-opencode-nextjs-baseline");
        const staticPaths = (projectJson?.staticSite?.files || []).map((file: any) => String(file?.path || "").trim());
        expect(staticPaths).toEqual(
          expect.arrayContaining(["/index.html", "/pricing/index.html", "/contact/index.html"]),
        );

        const opencodeRunJson = JSON.parse(
          await fs.readFile(path.join(checkpointWorkflowDir, "opencode-run.json"), "utf8"),
        );
        expect(["completed", "failed"]).toContain(String(opencodeRunJson?.status || ""));

        const contractBundleJson = JSON.parse(
          await fs.readFile(path.join(checkpointWorkflowDir, "opencode-contract-bundle.json"), "utf8"),
        );
        expect(contractBundleJson?.request?.skillId).toBe("build-marketing-site");
        expect(contractBundleJson?.request?.executionScope).toBe("full-baseline");
        expect(contractBundleJson?.request?.successCriteria).toEqual(
          expect.arrayContaining([
            "all required routes exist",
            "result includes a complete website baseline, not only a homepage",
          ]),
        );
        expect(String(opencodeRunJson?.status || "")).toMatch(/^(completed|failed)$/);

        const deployRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [
                {
                  role: "user",
                  parts: [{ type: "text", text: "deploy to cloudflare" }],
                },
              ],
            }),
          }),
        );
        expect([200, 202]).toContain(deployRes.status);

        const deployTask = await getLatestChatTaskForChat(chatId);
        expect(deployTask?.id).not.toBe(queuedTask?.id);
        expect(deployTask?.status).toBe("queued");
        const deployWorkflow = (deployTask?.result?.internal?.inputState as any)?.workflow_context || {};
        expect(deployWorkflow.executionMode).toBe("deploy");
        expect(deployWorkflow.deployRequested).toBe(true);
        expect(String(deployWorkflow.deploySourceTaskId || "")).toBe(String(queuedTask?.id || ""));
        expect(String(deployWorkflow.deploySourceProjectPath || "")).toBe(checkpointProjectPath);
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevPreserveDataHome === undefined) delete process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME;
        else process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME = prevPreserveDataHome;
        if (prevExecutionMode === undefined) delete process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
        else process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION = prevExecutionMode;
        if (prevBaselineFallback === undefined) delete process.env.SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK;
        else process.env.SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK = prevBaselineFallback;
        if (prevOpenCodeTimeout === undefined) delete process.env.SHPITTO_OPENCODE_TIMEOUT_MS;
        else process.env.SHPITTO_OPENCODE_TIMEOUT_MS = prevOpenCodeTimeout;
      }
    },
    240_000,
  );
});
