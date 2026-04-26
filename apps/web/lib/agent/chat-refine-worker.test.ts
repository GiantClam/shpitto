import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { createChatTask, getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

describe("chat refine worker", () => {
  it("executes refine tasks and writes new checkpoint artifacts", async () => {
    const chatId = `chat-refine-worker-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-demo",
          pages: [{ path: "/", html: "<!doctype html><html><head><title>Old</title></head><body>Demo</body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Old</title></head><body>Demo</body></html>" },
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

    const inputState: any = {
      messages: [new HumanMessage({ content: "把标题改成 New Demo 并把主色改成蓝色" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        checkpointProjectPath: sourceProjectPath,
        deploySourceProjectPath: sourceProjectPath,
      },
    };

    const task = await createChatTask(chatId, undefined, {
      assistantText: "queued refine",
      phase: "queued",
      internal: { inputState, skillId: "website-generation-workflow" },
      progress: { stage: "queued" } as any,
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const updated = await getChatTask(task.id);
    expect(updated?.status).toBe("succeeded");
    expect(updated?.result?.progress?.stage).toBe("refined");
    const refinedProjectPath = String(updated?.result?.progress?.checkpointProjectPath || "").trim();
    expect(refinedProjectPath).toBeTruthy();
    const refinedProjectRaw = await fs.readFile(refinedProjectPath, "utf8");
    expect(refinedProjectRaw).toContain("refine-runtime-accent");
    expect(refinedProjectRaw).toContain("New Demo");
    const refinedProject = JSON.parse(refinedProjectRaw);
    const rootPage = (refinedProject?.pages || []).find((page: any) => String(page?.path || "") === "/");
    expect(String(rootPage?.html || "")).toContain("New Demo");
  });

  it("supports custom hex color and text replacement refinements", async () => {
    const chatId = `chat-refine-worker-custom-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-custom",
          pages: [{ path: "/", html: "<!doctype html><html><head><title>Old</title></head><body><h1>Old</h1></body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Old</title></head><body><h1>Old</h1></body></html>" },
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

    const inputState: any = {
      messages: [new HumanMessage({ content: "把 Old 改成 New Brand，主色改成 #ff5500" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        checkpointProjectPath: sourceProjectPath,
        deploySourceProjectPath: sourceProjectPath,
      },
    };

    const task = await createChatTask(chatId, undefined, {
      assistantText: "queued refine",
      phase: "queued",
      internal: { inputState, skillId: "website-generation-workflow" },
      progress: { stage: "queued" } as any,
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const updated = await getChatTask(task.id);
    expect(updated?.status).toBe("succeeded");
    const refinedProjectPath = String(updated?.result?.progress?.checkpointProjectPath || "").trim();
    const refinedProjectRaw = await fs.readFile(refinedProjectPath, "utf8");
    expect(refinedProjectRaw).toContain("#ff5500");
    expect(refinedProjectRaw).toContain("New Brand");
  });

  it("creates a follow-up refine task from pending edits captured while active", async () => {
    const chatId = `chat-refine-worker-pending-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-pending",
          pages: [{ path: "/", html: "<!doctype html><html><head><title>Old</title></head><body><h1>Old</h1></body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Old</title></head><body><h1>Old</h1></body></html>" },
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

    const inputState: any = {
      messages: [new HumanMessage({ content: "把 Old 改成 First Pass" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        checkpointProjectPath: sourceProjectPath,
        deploySourceProjectPath: sourceProjectPath,
        skillId: "website-generation-workflow",
      },
    };

    const task = await createChatTask(chatId, undefined, {
      assistantText: "queued refine",
      phase: "queued",
      internal: {
        inputState,
        skillId: "website-generation-workflow",
        pendingEdits: [
          {
            id: "pending-1",
            text: "主色换成绿色",
            createdAt: new Date().toISOString(),
            patchPlan: {
              revision: 1,
              instructionText: "主色换成绿色",
              operations: [{ op: "set", target: "visualStyle", value: ["绿色"], sourceText: "主色换成绿色" }],
            },
          },
        ],
      },
      progress: { stage: "queued" } as any,
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const completed = await getChatTask(task.id);
    expect(completed?.status).toBe("succeeded");
    const latest = await getLatestChatTaskForChat(chatId);
    expect(latest?.id).not.toBe(task.id);
    expect(latest?.status).toBe("queued");
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("refine");
    expect(workflow.latestUserText).toContain("绿色");
    expect(workflow.refineSourceProjectPath).toBe(completed?.result?.progress?.checkpointProjectPath);
    expect((workflow.requirementPatchPlan?.operations || []).some((op: any) => op.target === "visualStyle")).toBe(true);

    const followUpProcessed = await runChatTaskWorkerOnce();
    expect(followUpProcessed).toBe(true);
    const followUp = await getChatTask(latest!.id);
    expect(followUp?.status).toBe("succeeded");
  });

  it("handles serialized user messages and removes explicit deletion targets", async () => {
    const chatId = `chat-refine-worker-delete-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-delete",
          pages: [
            {
              path: "/",
              html: "<!doctype html><html><head><title>Demo</title></head><body><button data-nav-toggle>Menu</button><span class=\"eyebrow\">For enterprise and SaaS teams</span></body></html>",
            },
          ],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content:
                  "<!doctype html><html><head><title>Demo</title></head><body><button data-nav-toggle>Menu</button><span class=\"eyebrow\">For enterprise and SaaS teams</span></body></html>",
              },
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

    const serializedHumanMessage = {
      id: ["langchain_core", "messages", "HumanMessage"],
      kwargs: {
        content: "删除For enterprise and SaaS teams和导航栏中的menu按钮",
      },
      type: "constructor",
    };
    const inputState: any = {
      messages: [serializedHumanMessage],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        checkpointProjectPath: sourceProjectPath,
        deploySourceProjectPath: sourceProjectPath,
        latestUserText: "删除For enterprise and SaaS teams和导航栏中的menu按钮",
      },
    };

    const task = await createChatTask(chatId, undefined, {
      assistantText: "queued refine",
      phase: "queued",
      internal: { inputState, skillId: "website-generation-workflow" },
      progress: { stage: "queued" } as any,
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const updated = await getChatTask(task.id);
    expect(updated?.status).toBe("succeeded");
    const refinedProjectPath = String(updated?.result?.progress?.checkpointProjectPath || "").trim();
    const refinedProjectRaw = await fs.readFile(refinedProjectPath, "utf8");
    const refinedProject = JSON.parse(refinedProjectRaw);
    const indexHtml = String(
      (refinedProject?.staticSite?.files || []).find((file: any) => String(file?.path || "") === "/index.html")
        ?.content || "",
    );
    expect(indexHtml).not.toContain("For enterprise and SaaS teams");
    expect(indexHtml).not.toContain("data-nav-toggle");
    expect(indexHtml).not.toContain(">Menu<");
  });

  it("fails refine tasks when baseline is missing", async () => {
    const chatId = `chat-refine-worker-missing-${Date.now()}`;
    const inputState: any = {
      messages: [new HumanMessage({ content: "把主色改成蓝色" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
      },
    };

    const task = await createChatTask(chatId, undefined, {
      assistantText: "queued refine",
      phase: "queued",
      internal: { inputState, skillId: "website-generation-workflow" },
      progress: { stage: "queued" } as any,
    });

    const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");
    const processed = await runChatTaskWorkerOnce();
    expect(processed).toBe(true);

    const updated = await getChatTask(task.id);
    expect(updated?.status).toBe("failed");
    expect(String(updated?.result?.error || "")).toContain("No preview/deployed baseline");
  });
});
