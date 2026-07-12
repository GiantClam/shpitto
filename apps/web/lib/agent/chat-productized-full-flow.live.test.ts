import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import JSZip from "jszip";
import { getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

function confirmPayload(text: string) {
  return `__SHP_CONFIRM_GENERATE__\n${text}`;
}

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const deadline = Date.now() + 12 * 60 * 1000;
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

    await new Promise((resolve) => setTimeout(resolve, 2000));
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

async function fetchTextWithRetry(url: string, predicate: (text: string, status: number) => boolean) {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "shpitto-productized-full-flow/1.0" } });
      lastStatus = res.status;
      lastText = await res.text();
      if (predicate(lastText, res.status)) {
        return { status: res.status, text: lastText };
      }
    } catch (error) {
      lastText = String((error as Error)?.message || error || "fetch failed");
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1500 * attempt)));
  }
  throw new Error(`Timed out fetching ${url} (last status ${lastStatus || "unknown"}): ${lastText.slice(0, 240)}`);
}

describe("productized marketing full flow live", () => {
  it(
    "generates and deploys build-marketing-site through the real worker path",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevPreserveDataHome = process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME;
      const prevExecutionMode = process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevWorkerClaimModes = process.env.CHAT_WORKER_CLAIM_MODES;
      const prevDeployStrategy = process.env.CLOUDFLARE_DEPLOY_STRATEGY;
      const chatId = `chat-productized-live-${Date.now()}`;

      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME = "1";
      process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION = "opencode";
      process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "900000";
      process.env.CHAT_WORKER_CLAIM_MODES = "generate,deploy";
      process.env.CLOUDFLARE_DEPLOY_STRATEGY = process.env.CLOUDFLARE_DEPLOY_STRATEGY || "direct-upload";

      try {
        expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);

        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { GET: getHistory } = await import("../../app/api/chat/history/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { GET: getExport } = await import("../../app/api/chat/tasks/[taskId]/export/route");
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

        const queuedGenerateTask = await getLatestChatTaskForChat(chatId);
        expect(queuedGenerateTask?.status).toBe("queued");
        expect(queuedGenerateTask?.result?.progress?.skillId).toBe("build-marketing-site");

        const generatedTask = await waitForTerminalTask(String(queuedGenerateTask?.id || ""), runChatTaskWorkerOnce);
        expect(generatedTask.status).toBe("succeeded");
        expect(["done:opencode", "done:prepared-baseline"]).toContain(
          String(generatedTask.result?.progress?.stage || ""),
        );

        const generatedStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedGenerateTask?.id || "") }),
        });
        const generatedStatusJson = await generatedStatusRes.json();
        expect(generatedStatusRes.status).toBe(200);
        expect(generatedStatusJson?.task?.status).toBe("succeeded");

        const generateProgress = generatedStatusJson?.task?.result?.progress || {};
        const checkpointProjectPath = String(generateProgress.checkpointProjectPath || "").trim();
        const checkpointWorkflowDir = String(generateProgress.checkpointWorkflowDir || "").trim();
        expect(checkpointProjectPath).toBeTruthy();
        expect(checkpointWorkflowDir).toBeTruthy();
        expect(generateProgress.generatedFiles).toEqual(
          expect.arrayContaining(["/index.html", "/pricing/index.html", "/contact/index.html"]),
        );

        const projectJson = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
        expect(projectJson?.staticSite?.mode).toBe("shpitto-opencode-nextjs-baseline");
        const projectPaths = (projectJson?.staticSite?.files || []).map((file: any) => String(file?.path || "").trim());
        expect(projectPaths).toEqual(
          expect.arrayContaining(["/index.html", "/pricing/index.html", "/contact/index.html"]),
        );

        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: String(queuedGenerateTask?.id || "") }),
        });
        expect(previewRootRes.status).toBe(307);

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedGenerateTask?.id || ""), path: ["index.html"] }),
        });
        expect(previewIndexRes.status).toBe(200);
        const previewIndexHtml = await previewIndexRes.text();
        expect(previewIndexHtml.toLowerCase()).toContain("<!doctype html");

        const previewPricingRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedGenerateTask?.id || ""), path: ["pricing", "index.html"] }),
        });
        expect(previewPricingRes.status).toBe(200);
        const previewPricingHtml = await previewPricingRes.text();
        expect(previewPricingHtml).toContain("Pricing");

        const exportRes = await getExport(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedGenerateTask?.id || "") }),
        });
        expect(exportRes.status).toBe(200);
        expect(String(exportRes.headers.get("content-type") || "")).toContain("application/zip");
        const exportZip = await JSZip.loadAsync(Buffer.from(await exportRes.arrayBuffer()));
        expect(Object.keys(exportZip.files)).toEqual(
          expect.arrayContaining(["package.json", "app/page.tsx", ".shpitto/request.json"]),
        );
        expect(await exportZip.file(".shpitto/request.json")?.async("string")).toContain("build-marketing-site");

        const deployQueueRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
            }),
          }),
        );
        const deployQueueBody = await deployQueueRes.clone().text();
        expect(deployQueueRes.status, deployQueueBody).toBe(202);

        const queuedDeployTask = await getLatestChatTaskForChat(chatId);
        expect(queuedDeployTask?.id).not.toBe(queuedGenerateTask?.id);
        expect(queuedDeployTask?.status).toBe("queued");

        const deployWorkflow = (queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context || {};
        expect(deployWorkflow.executionMode).toBe("deploy");
        expect(deployWorkflow.deployRequested).toBe(true);
        expect(String(deployWorkflow.deploySourceTaskId || "")).toBe(String(queuedGenerateTask?.id || ""));
        expect(String(deployWorkflow.deploySourceProjectPath || "")).toBe(checkpointProjectPath);
        expect(Boolean(deployWorkflow.blogContentConfirmed)).toBe(false);
        expect(Boolean(deployWorkflow.contentPreviewConfirmed)).toBe(false);

        const deployedTask = await waitForTerminalTask(String(queuedDeployTask?.id || ""), runChatTaskWorkerOnce);
        expect(deployedTask.status).toBe("succeeded");
        expect(deployedTask.result?.progress?.stage).toBe("deployed");

        const deployStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: String(queuedDeployTask?.id || "") }),
        });
        const deployStatusJson = await deployStatusRes.json();
        expect(deployStatusRes.status).toBe(200);
        expect(deployStatusJson?.task?.status).toBe("succeeded");
        expect(deployStatusJson?.task?.result?.progress?.stage).toBe("deployed");

        const deployedUrl = String(deployStatusJson?.task?.result?.deployedUrl || "").replace(/\/+$/, "");
        expect(deployedUrl).toContain(".pages.dev");
        expect(deployStatusJson?.task?.result?.actions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "View Live Site",
              type: "url",
            }),
          ]),
        );
        expect(
          ["direct-upload", "wrangler"].includes(String(deployStatusJson?.task?.result?.progress?.deploymentStrategy || "")),
        ).toBe(true);

        const historyRes = await getHistory(
          new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`),
        );
        const historyJson = await historyRes.json();
        expect(historyRes.status).toBe(200);
        expect(historyJson?.ok).toBe(true);
        expect(historyJson?.task?.id).toBe(String(queuedDeployTask?.id || ""));
        expect(historyJson?.task?.status).toBe("succeeded");
        expect(String(historyJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");

        const home = await fetchTextWithRetry(
          deployedUrl,
          (text, status) =>
            status === 200 &&
            text.toLowerCase().includes("<!doctype html") &&
            text.includes('href="/pricing"') &&
            text.includes('href="/contact"'),
        );
        const pricing = await fetchTextWithRetry(
          `${deployedUrl}/pricing/`,
          (text, status) =>
            status === 200 && text.toLowerCase().includes("<!doctype html") && text.includes("Pricing"),
        );
        const contact = await fetchTextWithRetry(
          `${deployedUrl}/contact/`,
          (text, status) =>
            status === 200 && text.toLowerCase().includes("<!doctype html") && text.includes("Contact"),
        );

        const opencodeRunJson = JSON.parse(
          await fs.readFile(path.join(checkpointWorkflowDir, "opencode-run.json"), "utf8"),
        );
        expect(["completed", "failed"]).toContain(String(opencodeRunJson?.status || ""));

        console.log(
          JSON.stringify(
            {
              PRODUCTIZED_FULL_FLOW_RESULT: {
                chatId,
                generatedTaskId: queuedGenerateTask?.id,
                deployTaskId: queuedDeployTask?.id,
                deployedUrl,
                generationStage: generatedTask.result?.progress?.stage,
                deployStage: deployedTask.result?.progress?.stage,
                deploymentStrategy: deployStatusJson?.task?.result?.progress?.deploymentStrategy || null,
                homeStatus: home.status,
                pricingStatus: pricing.status,
                contactStatus: contact.status,
                opencodeStatus: opencodeRunJson?.status || null,
              },
            },
            null,
            2,
          ),
        );
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevPreserveDataHome === undefined) delete process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME;
        else process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME = prevPreserveDataHome;
        if (prevExecutionMode === undefined) delete process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
        else process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION = prevExecutionMode;
        if (prevAsyncTaskTimeoutMs === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
        else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        if (prevWorkerClaimModes === undefined) delete process.env.CHAT_WORKER_CLAIM_MODES;
        else process.env.CHAT_WORKER_CLAIM_MODES = prevWorkerClaimModes;
        if (prevDeployStrategy === undefined) delete process.env.CLOUDFLARE_DEPLOY_STRATEGY;
        else process.env.CLOUDFLARE_DEPLOY_STRATEGY = prevDeployStrategy;
      }
    },
    1_200_000,
  );
});
