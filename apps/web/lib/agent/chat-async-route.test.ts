import { describe, expect, it } from "vitest";
import { getActiveChatTask, getLatestChatTaskForChat, listChatTimelineMessages } from "./chat-task-store";
import fs from "node:fs/promises";
import path from "node:path";

describe("chat api async mode", () => {
  const confirmPayload = (text: string) => `__SHP_CONFIRM_GENERATE__\n${text}`;
  const requirementFormPayload = (overrides: Record<string, any> = {}) =>
    [
      "需求表单已提交：",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "company",
          contentSources: ["new_site"],
          customNotes: "Industrial manufacturer website with products, cases, inquiry goals, and bilingual content needs.",
          targetAudience: ["enterprise_buyers", "overseas_customers"],
          designTheme: ["professional", "industrial"],
          pageStructure: { mode: "multi", pages: ["home", "products", "cases", "contact"] },
          functionalRequirements: ["customer_inquiry_form"],
          primaryGoal: ["lead_generation"],
          language: "zh-CN",
          brandLogo: { mode: "text_mark" },
          ...overrides,
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

  it("queues task and returns task id immediately", async () => {
    const chatId = `chat-queue-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload("Generate site") }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeTruthy();
    expect(task?.status).toBe("queued");
    expect(task?.result?.progress?.stage).toBe("queued");
    expect(task?.result?.progress?.skillId).toBe("website-generation-workflow");
    expect(task?.result?.internal?.inputState).toBeTruthy();
  });

  it("returns existing active task instead of creating duplicate", async () => {
    const chatId = `chat-active-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const buildReq = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload("Generate site once") }] }],
        }),
      });

    const first = await POST(buildReq());
    expect(first.status).toBe(202);
    const second = await POST(buildReq());
    expect(second.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeTruthy();
    expect(task?.status === "queued" || task?.status === "running").toBe(true);
  });

  it("queues pending edits on active generation tasks", async () => {
    const chatId = `chat-pending-edit-${Date.now()}`;
    const { createChatTask } = await import("./chat-task-store");
    const active = await createChatTask(chatId, undefined, {
      assistantText: "queued generation",
      phase: "queued",
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            executionMode: "generate",
            skillId: "website-generation-workflow",
          },
        },
      },
      progress: { stage: "queued" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "不要英文，改成中文，主色换成绿色" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getActiveChatTask(chatId);
    expect(task?.id).toBe(active.id);
    const pendingEdits = task?.result?.internal?.pendingEdits || [];
    expect(pendingEdits).toHaveLength(1);
    expect(pendingEdits[0]?.text).toContain("改成中文");
    expect((pendingEdits[0]?.patchPlan as any)?.operations?.some((op: any) => op.target === "locale")).toBe(true);
  });

  it("does not queue pending edits when user explicitly asks to continue generation", async () => {
    const chatId = `chat-continue-active-${Date.now()}`;
    const { createChatTask } = await import("./chat-task-store");
    const active = await createChatTask(chatId, undefined, {
      assistantText: "queued generation",
      phase: "queued",
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            executionMode: "generate",
            skillId: "website-generation-workflow",
          },
        },
      },
      progress: { stage: "queued" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "\u7ee7\u7eed\u751f\u6210" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getActiveChatTask(chatId);
    expect(task?.id).toBe(active.id);
    expect(task?.result?.internal?.pendingEdits || []).toHaveLength(0);
  });

  it("uses latest confirmed canonical prompt when user asks to continue generation", async () => {
    const chatId = `chat-continue-confirmed-${Date.now()}`;
    const canonicalPrompt = "# Canonical Website Generation Prompt\n\nGenerate the previously confirmed CASUX site.";
    const { appendChatTimelineMessage, createChatTask, failChatTask } = await import("./chat-task-store");
    const failed = await createChatTask(chatId, undefined, {
      assistantText: "failed",
      phase: "skeleton",
      progress: { stage: "failed" } as any,
    });
    await failChatTask(failed.id, "previous generation failed");
    await appendChatTimelineMessage({
      chatId,
      role: "user",
      text: canonicalPrompt,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "\u7ee7\u7eed\u751f\u6210" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task?.id).not.toBe(failed.id);
    expect(task?.status).toBe("queued");
    expect((task?.result?.internal?.inputState as any)?.workflow_context?.sourceRequirement).toBe(canonicalPrompt);
  });

  it("uses latest task sourceRequirement when user asks to continue generation", async () => {
    const chatId = `chat-continue-task-source-${Date.now()}`;
    const canonicalPrompt = "# Canonical Website Generation Prompt\n\nGenerate from task sourceRequirement.";
    const { createChatTask, failChatTask } = await import("./chat-task-store");
    const failed = await createChatTask(chatId, undefined, {
      assistantText: "failed",
      phase: "skeleton",
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
            sourceRequirement: canonicalPrompt,
          },
        },
      },
      progress: { stage: "failed" } as any,
    });
    await failChatTask(failed.id, "previous generation failed");

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "continue generation" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task?.id).not.toBe(failed.id);
    expect((task?.result?.internal?.inputState as any)?.workflow_context?.sourceRequirement).toBe(canonicalPrompt);
  });

  it("uses local checkpoint findings when user asks to continue generation after storage history is unavailable", async () => {
    const chatId = `chat-continue-local-${Date.now()}`;
    const taskId = crypto.randomUUID();
    const canonicalPrompt = "# Canonical Website Generation Prompt\n\nGenerate the locally recovered CASUX site.";
    const findingsPath = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId, "latest", "workflow", "findings.md");
    await fs.mkdir(path.dirname(findingsPath), { recursive: true });
    await fs.writeFile(
      findingsPath,
      ["# Findings", "", "## Input Prompt", canonicalPrompt, "", "## Derived Route Plan", "- Routes: /"].join("\n"),
      "utf8",
    );

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "\u7ee7\u7eed\u751f\u6210" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task?.status).toBe("queued");
    expect((task?.result?.internal?.inputState as any)?.workflow_context?.sourceRequirement).toBe(canonicalPrompt);
  });

  it("locks user input while deploy task is active", async () => {
    const chatId = `chat-deploy-lock-${Date.now()}`;
    const { createChatTask } = await import("./chat-task-store");
    const active = await createChatTask(chatId, undefined, {
      assistantText: "queued deploy",
      phase: "queued",
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            executionMode: "deploy",
            skillId: "website-generation-workflow",
          },
        },
      },
      progress: { stage: "deploying", nextStep: "deploy" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "把主色改成绿色" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(423);

    const task = await getActiveChatTask(chatId);
    expect(task?.id).toBe(active.id);
    expect(task?.result?.internal?.pendingEdits || []).toHaveLength(0);
    const timeline = await listChatTimelineMessages(chatId, 20);
    expect(timeline.some((message) => String(message.text || "").includes("主色改成绿色"))).toBe(false);
  });

  it("returns requirement-clarification response before confirmed generation", async () => {
    const chatId = `chat-clarify-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "Build a website for CASUX" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeUndefined();
    const timeline = await listChatTimelineMessages(chatId, 20);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "requirement_form")).toBe(true);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "confirm_generate")).toBe(false);
  });

  it("localizes requirement and prompt draft cards to the latest user message language", async () => {
    const chatId = `chat-localized-draft-${Date.now()}`;
    const userText = `${requirementFormPayload()}\n\n\u8bf7\u751f\u6210\u4e00\u4efd\u53ef\u786e\u8ba4\u7684 Prompt Draft`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: userText }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const timeline = await listChatTimelineMessages(chatId, 20);
    const promptDraft = timeline.find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
    const confirm = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
    expect(promptDraft?.metadata?.locale).toBe("zh");
    expect(String(promptDraft?.metadata?.title || "")).toContain("\u7f51\u7ad9\u751f\u6210");
    expect(confirm?.metadata?.locale).toBe("zh");
    expect(String(confirm?.metadata?.label || "")).toContain("\u786e\u8ba4");
    expect(timeline.some((message) => String(message.text || "").includes("\u68c0\u67e5\u9875\u9762\u7ed3\u6784"))).toBe(true);
  });

  it("does not force the required form when uploaded materials are the source of truth", async () => {
    const chatId = `chat-uploaded-materials-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const userText = [
      "Generate a website based on the attached PDF document.",
      "[Referenced Assets]",
      '- Asset "CASUX_.md.pdf" path: uploads/CASUX_.md.pdf (version 1.0.0) URL: https://s.shpitto.com/project-assets/user-1/' +
        `${chatId}/preview/1.0.0/files/uploads/CASUX_.md.pdf`,
    ].join("\n");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        user_id: "user-1",
        messages: [{ role: "user", parts: [{ type: "text", text: userText }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(await getLatestChatTaskForChat(chatId)).toBeUndefined();
    const timeline = await listChatTimelineMessages(chatId, 30);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "requirement_form")).toBe(false);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "prompt_draft")).toBe(true);
    const progress = timeline.find((message) => String(message.metadata?.cardType || "") === "requirement_progress");
    expect((progress?.metadata as any)?.required?.passed ?? true).toBe(true);
  });

  it("requires prompt draft confirmation before website generation from drafting", async () => {
    const chatId = `chat-draft-gate-${Date.now()}`;
    const userText = requirementFormPayload();
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: userText }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeUndefined();
    const timeline = await listChatTimelineMessages(chatId, 20);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "prompt_draft")).toBe(true);
    const confirm = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
    expect(confirm).toBeTruthy();
    expect(String(confirm?.metadata?.payload || "")).toContain("__SHP_CONFIRM_GENERATE__");
  });

  it("carries prompt draft routing contract into confirmed generation without rebuilding the draft", async () => {
    const chatId = `chat-draft-contract-${Date.now()}`;
    const userText = requirementFormPayload();
    const { POST } = await import("../../app/api/chat/route");

    const draftRes = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: userText }] }],
        }),
      }),
    );
    expect(draftRes.status).toBe(200);

    const timeline = await listChatTimelineMessages(chatId, 30);
    const promptDraftCard = timeline.find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
    const confirm = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
    const promptDraftText = String((promptDraftCard?.metadata as any)?.canonicalPrompt || "");
    const promptDraftContract = (promptDraftCard?.metadata as any)?.promptControlManifest;
    expect(promptDraftContract?.routes).toEqual(["/", "/products", "/cases", "/contact"]);
    expect((promptDraftCard?.metadata as any)?.promptDraft).toBeUndefined();
    expect((promptDraftCard?.metadata as any)?.generationRoutingContract).toBeUndefined();

    const confirmRes = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: String(confirm?.metadata?.payload || "") }] }],
        }),
      }),
    );
    expect(confirmRes.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.canonicalPrompt).toBe(promptDraftText);
    expect(workflow.requirementDraft).toBeUndefined();
    expect(workflow.promptControlManifest).toEqual(promptDraftContract);
    expect(workflow.generationRoutingContract).toBeUndefined();
  });

  it("does not allow uploaded-logo strategy through until a logo asset is present", async () => {
    const chatId = `chat-logo-gate-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: requirementFormPayload({ brandLogo: { mode: "uploaded" } }) }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await getLatestChatTaskForChat(chatId)).toBeUndefined();
    const timeline = await listChatTimelineMessages(chatId, 20);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "requirement_form")).toBe(true);
    expect(timeline.some((message) => String(message.metadata?.cardType || "") === "prompt_draft")).toBe(false);
  });

  it("rejects unknown skill_id not found under apps/web/skills", async () => {
    const chatId = `chat-skill-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        skill_id: "non-existent-skill",
        messages: [{ role: "user", parts: [{ type: "text", text: "Generate site" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const task = await getLatestChatTaskForChat(chatId);
    expect(task).toBeUndefined();
  });

  it("exposes task status endpoint with sanitized result", async () => {
    const chatId = `chat-status-${Date.now()}`;
    const { createChatTask, markChatTaskRunning, completeChatTask } = await import("./chat-task-store");
    const task = await createChatTask(chatId, undefined, {
      assistantText: "done",
      internal: { inputState: { secret: true } },
      progress: { stage: "done" },
    });
    await markChatTaskRunning(task.id);
    await completeChatTask(task.id, { assistantText: "done", progress: { stage: "done" } });

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: task.id }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.ok).toBe(true);
    expect(json?.task?.id).toBe(task.id);
    expect(json?.task?.status).toBe("succeeded");
    expect(json?.task?.result?.assistantText).toBe("done");
    expect(json?.task?.result?.internal).toBeUndefined();
  });

  it("keeps an in-progress local checkpoint running when planned route files are missing", async () => {
    const chatId = `chat-local-status-${Date.now()}`;
    const taskId = `local-status-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId, "latest");
    const siteDir = path.join(root, "site");
    const workflowDir = path.join(root, "workflow");
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(path.join(siteDir, "index.html"), "<!doctype html><html><body>ok</body></html>", "utf8");
    await fs.writeFile(path.join(siteDir, "styles.css"), "body{margin:0}", "utf8");
    await fs.writeFile(path.join(siteDir, "script.js"), "console.log('ok')", "utf8");
    await fs.writeFile(
      path.join(workflowDir, "task_plan.md"),
      ["# Task Plan", "", "- Routes: /, /contact"].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({
        savedAt: "2026-04-26T15:10:22.291Z",
        latestUpdatedAt: "2026-04-26T15:10:22.291Z",
        status: "generating:tool-round-10:/contact/index.html",
      }),
      "utf8",
    );

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ taskId }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.recoveredFromLocalCheckpoint).toBe(true);
    expect(json?.task?.id).toBe(taskId);
    expect(json?.task?.chatId).toBe(chatId);
    expect(json?.task?.status).toBe("running");
    expect(json?.task?.result?.progress?.stage).toBe("generating:tool-round-10:/contact/index.html");
    expect(json?.task?.result?.progress?.missingFiles).toEqual(["/contact/index.html"]);
    expect(json?.task?.result?.progress?.generatedFiles).toEqual(
      expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]),
    );
  });

  it("marks deploy confirmation requests and carries latest checkpoint path", async () => {
    const chatId = `chat-deploy-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", `chat-deploy-${Date.now()}.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify({ projectId: "deploy-test", pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }] }), "utf8");

    const { createChatTask, completeChatTask } = await import("./chat-task-store");
    const previous = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {},
        },
      },
      progress: { checkpointProjectPath: projectPath } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: projectPath } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getActiveChatTask(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.deploySourceProjectPath).toBe(projectPath);
    expect(workflow.requirementSpec?.deployment?.provider).toBe("cloudflare");
    expect(workflow.canonicalPrompt).toBe("deploy to cloudflare");
    expect(workflow.requirementDraft).toBeUndefined();
  });

  it("preserves restored site artifacts and marks Chinese deploy requests", async () => {
    const chatId = `chat-deploy-zh-${Date.now()}`;
    const remoteOnlyProjectPath = `/app/apps/web/.tmp/chat-tasks/${chatId}/task/project.json`;
    const siteArtifacts = {
      projectId: "deploy-zh-test",
      pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><head></head><body>ok</body></html>",
          },
        ],
      },
    };

    const { createChatTask, completeChatTask } = await import("./chat-task-store");
    const previous = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {},
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: remoteOnlyProjectPath } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: remoteOnlyProjectPath } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "部署到 Cloudflare" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getActiveChatTask(chatId);
    const inputState = (latest?.result?.internal?.inputState as any) || {};
    const workflow = inputState.workflow_context || {};
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.deploySourceProjectPath).toBe(remoteOnlyProjectPath);
    expect(inputState.site_artifacts?.projectId).toBe("deploy-zh-test");
    expect(workflow.canonicalPrompt).toBe("部署到 Cloudflare");
  });

  it("routes real Chinese Cloudflare deploy requests to deploy mode", async () => {
    const chatId = `chat-deploy-real-zh-${Date.now()}`;
    const siteArtifacts = {
      projectId: "deploy-real-zh-test",
      pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><head></head><body>ok</body></html>",
          },
        ],
      },
    };

    const { createChatTask, completeChatTask } = await import("./chat-task-store");
    const previous = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {},
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: `/remote/${chatId}/project.json` } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: previous.result?.progress as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "\u90e8\u7f72\u5230 Cloudflare" }] }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getActiveChatTask(chatId);
    const workflow = ((latest?.result?.internal?.inputState as any) || {}).workflow_context || {};
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.executionMode).toBe("deploy");
    expect(workflow.canonicalPrompt).toBe("\u90e8\u7f72\u5230 Cloudflare");
  });

  it("recovers deploy artifacts from preview files when only a remote checkpoint path remains", async () => {
    const prevFetch = globalThis.fetch;
    const chatId = `chat-deploy-preview-recovery-${Date.now()}`;
    const remoteOnlyProjectPath = `/app/apps/web/.tmp/chat-tasks/${chatId}/task/project.json`;
    let sourceTaskId = "";

    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const responses: Record<string, string> = {
          "index.html": [
            "<!doctype html><html><head>",
            `<link rel="stylesheet" href="/api/chat/tasks/${encodeURIComponent(sourceTaskId)}/preview/styles.css">`,
            "</head><body>",
            `<a href="/api/chat/tasks/${encodeURIComponent(sourceTaskId)}/preview/products/">Products</a>`,
            `ok<script src="/api/chat/tasks/${encodeURIComponent(sourceTaskId)}/preview/script.js"></script>`,
            "</body></html>",
          ].join(""),
          "styles.css": "body{color:#111}",
          "script.js": "console.log('ok')",
        };
        const key = Object.keys(responses).find((item) => url.endsWith(`/preview/${item}`));
        if (!key) return new Response("missing", { status: 404 });
        const type = key.endsWith(".html") ? "text/html" : key.endsWith(".css") ? "text/css" : "application/javascript";
        return new Response(responses[key], { status: 200, headers: { "content-type": type } });
      }) as typeof fetch;

      const { createChatTask, completeChatTask, failChatTask } = await import("./chat-task-store");
      const previous = await createChatTask(chatId, undefined, {
        assistantText: "generated",
        phase: "end",
        internal: {
          sessionState: {
            messages: [],
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            workflow_context: {},
          },
        },
        progress: {
          checkpointProjectPath: remoteOnlyProjectPath,
          generatedFiles: ["/index.html", "/styles.css", "/script.js"],
        } as any,
      });
      await completeChatTask(previous.id, {
        assistantText: "generated",
        phase: "end",
        internal: previous.result?.internal,
        progress: {
          checkpointProjectPath: remoteOnlyProjectPath,
          generatedFiles: ["/index.html", "/styles.css", "/script.js"],
        } as any,
      });
      sourceTaskId = previous.id;
      const failed = await createChatTask(chatId, undefined, {
        assistantText: "bad refine",
        phase: "refine",
        internal: {
          sessionState: {
            messages: [],
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            workflow_context: {},
          },
        },
        progress: { stage: "refining:prepare" } as any,
      });
      await failChatTask(failed.id, "No preview/deployed baseline found for refine.");

      const { POST } = await import("../../app/api/chat/route");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "部署到 Cloudflare" }] }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(202);

      const latest = await getActiveChatTask(chatId);
      const inputState = (latest?.result?.internal?.inputState as any) || {};
      const files = inputState.site_artifacts?.staticSite?.files || [];
      expect(files.map((file: any) => file.path)).toEqual(["/index.html", "/styles.css", "/script.js"]);
      const indexHtml = String(files.find((file: any) => file.path === "/index.html")?.content || "");
      expect(indexHtml).toContain('href="/styles.css"');
      expect(indexHtml).toContain('src="/script.js"');
      expect(indexHtml).toContain('href="/products/"');
      expect(indexHtml).not.toContain("/api/chat/tasks/");
      expect(inputState.site_artifacts?.staticSite?.generation?.source).toBe("preview-recovery");
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
