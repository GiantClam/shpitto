import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { completeChatTask, createChatTask, getChatTask, getLatestChatTaskForChat } from "./chat-task-store";

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
      messages: [new HumanMessage({ content: "\u628a\u6807\u9898\u6539\u6210 New Demo \u5e76\u628a\u4e3b\u8272\u6539\u6210\u84dd\u8272" })],
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
      messages: [new HumanMessage({ content: "\u628a Old \u6539\u6210 New Brand\uff0c\u4e3b\u8272\u6539\u6210 #ff5500" })],
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
      messages: [new HumanMessage({ content: "\u628a Old \u6539\u6210 First Pass" })],
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
            text: "\u4e3b\u8272\u6362\u6210\u7eff\u8272",
            createdAt: new Date().toISOString(),
            patchPlan: {
              revision: 1,
              instructionText: "\u4e3b\u8272\u6362\u6210\u7eff\u8272",
              operations: [{ op: "set", target: "visualStyle", value: ["\u7eff\u8272"], sourceText: "\u4e3b\u8272\u6362\u6210\u7eff\u8272" }],
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
    expect(workflow.latestUserText).toContain("\u7eff\u8272");
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
        content: "\u5220\u9664 For enterprise and SaaS teams \u548c\u5bfc\u822a\u680f\u4e2d\u7684 menu \u6309\u94ae",
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
        latestUserText: "\u5220\u9664 For enterprise and SaaS teams \u548c\u5bfc\u822a\u680f\u4e2d\u7684 menu \u6309\u94ae",
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
      messages: [new HumanMessage({ content: "\u628a\u4e3b\u8272\u6539\u6210\u84dd\u8272" })],
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

  it("recovers refine baseline from the latest succeeded preview task when current input state lacks direct paths", async () => {
    const chatId = `chat-refine-worker-recover-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-recover",
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

    const baselineTask = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: sourceProjectPath,
        generatedFiles: ["/index.html", "/styles.css", "/script.js"],
      } as any,
    });
    await completeChatTask(baselineTask.id, {
      assistantText: "generated",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: sourceProjectPath,
        generatedFiles: ["/index.html", "/styles.css", "/script.js"],
      } as any,
    });

    const inputState: any = {
      messages: [new HumanMessage({ content: "\u628a Old \u6539\u6210 Recovered Title" })],
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
    expect(updated?.status).toBe("succeeded");
    const refinedProjectPath = String(updated?.result?.progress?.checkpointProjectPath || "").trim();
    const refinedProjectRaw = await fs.readFile(refinedProjectPath, "utf8");
    expect(refinedProjectRaw).toContain("Recovered Title");
  });

  it("maps remote checkpoint paths back to local chat-task checkpoints during refine recovery", async () => {
    const chatId = `chat-refine-worker-remote-${Date.now()}`;
    const baselineTaskId = `baseline-${Date.now()}`;
    const localTaskRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, baselineTaskId);
    const localProjectPath = path.join(localTaskRoot, "project.json");
    await fs.mkdir(localTaskRoot, { recursive: true });
    await fs.writeFile(
      localProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-remote",
          pages: [{ path: "/", html: "<!doctype html><html><head><title>Remote</title></head><body><h1>Remote</h1></body></html>" }],
          staticSite: {
            mode: "skill-direct",
            files: [
              { path: "/index.html", type: "text/html", content: "<!doctype html><html><head><title>Remote</title></head><body><h1>Remote</h1></body></html>" },
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
    const remoteProjectPath = `/app/apps/web/.tmp/chat-tasks/${chatId}/${baselineTaskId}/project.json`;

    const baselineTask = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: remoteProjectPath,
        generatedFiles: ["/index.html", "/styles.css", "/script.js"],
      } as any,
    });
    await completeChatTask(baselineTask.id, {
      assistantText: "generated",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: remoteProjectPath,
        generatedFiles: ["/index.html", "/styles.css", "/script.js"],
      } as any,
    });

    const inputState: any = {
      messages: [new HumanMessage({ content: "\u628a Remote \u6539\u6210 Local Recovery" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        refineSourceTaskId: baselineTask.id,
        deploySourceTaskId: baselineTask.id,
        checkpointProjectPath: remoteProjectPath,
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
    expect(refinedProjectRaw).toContain("Local Recovery");
  });

  it("applies deterministic spacing fixups to homepage timeline cards", async () => {
    const chatId = `chat-refine-worker-spacing-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-spacing",
          pages: [
            {
              path: "/",
              html:
                '<!doctype html><html><head><title>Demo</title></head><body><div class="timeline-grid"><div class="panel timeline-step" data-step="01"><h3>AI 观察</h3><p>One</p></div><div class="panel timeline-step" data-step="02"><h3>工程实践</h3><p>Two</p></div><div class="panel timeline-step" data-step="03"><h3>全球化视角</h3><p>Three</p></div></div></body></html>',
            },
          ],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content:
                  '<!doctype html><html><head><title>Demo</title></head><body><div class="timeline-grid"><div class="panel timeline-step" data-step="01"><h3>AI 观察</h3><p>One</p></div><div class="panel timeline-step" data-step="02"><h3>工程实践</h3><p>Two</p></div><div class="panel timeline-step" data-step="03"><h3>全球化视角</h3><p>Three</p></div></div></body></html>',
              },
              {
                path: "/styles.css",
                type: "text/css",
                content:
                  ".timeline-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }\n.timeline-step { position: relative; overflow: hidden; }\n.timeline-step::before { content: attr(data-step); position: absolute; right: 1rem; top: 1rem; font-size: 2.7rem; }",
              },
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
      messages: [new HumanMessage({ content: "\u628a\u9996\u9875 AI \u89c2\u5bdf\u3001\u5de5\u7a0b\u5b9e\u8df5\u3001\u5168\u7403\u5316\u89c6\u89d2 \u8fd9\u4e09\u5f20\u5361\u7247\u7684\u5185\u8fb9\u8ddd\u589e\u5927" })],
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
    const refinedProject = JSON.parse(await fs.readFile(refinedProjectPath, "utf8"));
    const refinedCss = String(
      (refinedProject?.staticSite?.files || []).find((file: any) => String(file?.path || "") === "/styles.css")
        ?.content || "",
    );
    expect(refinedCss).toContain("padding: clamp(1.35rem, 2.6vw, 1.85rem);");
    expect(refinedCss).toContain(".timeline-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1.25rem;\n}");
    expect(refinedCss).toContain(".timeline-step h3");
    expect(refinedCss).toContain(".timeline-step p");
    expect(refinedCss).not.toContain("\\n.timeline-step");
    expect(refinedCss).not.toContain(".timeline-step {\\n");
  });

  it("prefers workflow latest user text for timeline card spacing refine when message content is degraded", async () => {
    const chatId = `chat-refine-worker-spacing-fallback-${Date.now()}`;
    const sourceProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-source.json`);
    await fs.mkdir(path.dirname(sourceProjectPath), { recursive: true });
    await fs.writeFile(
      sourceProjectPath,
      JSON.stringify(
        {
          projectId: "refine-worker-spacing-fallback",
          pages: [
            {
              path: "/",
              html:
                '<!doctype html><html><head><title>Demo</title></head><body><div class="value-grid"><div class="value-card"><h3>Value A</h3><p>Alpha</p></div><div class="value-card"><h3>Value B</h3><p>Beta</p></div><div class="value-card"><h3>Value C</h3><p>Gamma</p></div></div><div class="timeline-grid"><div class="panel timeline-step" data-step="01"><h3>AI 观察</h3><p>One</p></div><div class="panel timeline-step" data-step="02"><h3>工程实践</h3><p>Two</p></div><div class="panel timeline-step" data-step="03"><h3>全球化视角</h3><p>Three</p></div></div></body></html>',
            },
          ],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content:
                  '<!doctype html><html><head><title>Demo</title></head><body><div class="value-grid"><div class="value-card"><h3>Value A</h3><p>Alpha</p></div><div class="value-card"><h3>Value B</h3><p>Beta</p></div><div class="value-card"><h3>Value C</h3><p>Gamma</p></div></div><div class="timeline-grid"><div class="panel timeline-step" data-step="01"><h3>AI 观察</h3><p>One</p></div><div class="panel timeline-step" data-step="02"><h3>工程实践</h3><p>Two</p></div><div class="panel timeline-step" data-step="03"><h3>全球化视角</h3><p>Three</p></div></div></body></html>',
              },
              {
                path: "/styles.css",
                type: "text/css",
                content: [
                  ".value-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }",
                  ".value-card { padding: 1rem; border: 1px solid #ddd; }",
                  ".timeline-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }",
                  ".timeline-step { position: relative; overflow: hidden; }",
                  ".timeline-step::before { content: attr(data-step); position: absolute; right: 1rem; top: 1rem; font-size: 2.7rem; }",
                ].join("\n"),
              },
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
      messages: [new HumanMessage({ content: "??? ai????????????? ?????????????????" })],
      phase: "end",
      current_page_index: 0,
      attempt_count: 0,
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        checkpointProjectPath: sourceProjectPath,
        deploySourceProjectPath: sourceProjectPath,
        latestUserText: "\u628a\u9996\u9875 AI \u89c2\u5bdf\u3001\u5de5\u7a0b\u5b9e\u8df5\u3001\u5168\u7403\u5316\u89c6\u89d2 \u8fd9\u4e09\u5f20\u5361\u7247\u7684\u5185\u8fb9\u8ddd\u589e\u5927",
        latestUserTextRaw: "\u628a\u9996\u9875 AI \u89c2\u5bdf\u3001\u5de5\u7a0b\u5b9e\u8df5\u3001\u5168\u7403\u5316\u89c6\u89d2 \u8fd9\u4e09\u5f20\u5361\u7247\u7684\u5185\u8fb9\u8ddd\u589e\u5927",
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
    const refinedProject = JSON.parse(await fs.readFile(refinedProjectPath, "utf8"));
    const refinedCss = String(
      (refinedProject?.staticSite?.files || []).find((file: any) => String(file?.path || "") === "/styles.css")
        ?.content || "",
    );
    expect(refinedCss).toContain(".timeline-step {\n  position: relative;\n  overflow: hidden;\n  padding: clamp(1.35rem, 2.6vw, 1.85rem);");
    expect(refinedCss).toContain(".timeline-step h3");
    expect(refinedCss).toContain(".timeline-step p");
    expect(refinedCss).toContain(".timeline-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1.25rem;\n}");
    expect(refinedCss).toContain(".value-card { padding: 1rem; border: 1px solid #ddd; }");
    expect(refinedCss).not.toContain(".value-grid .value-card");
  });
});
