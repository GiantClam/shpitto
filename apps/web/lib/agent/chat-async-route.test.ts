import { describe, expect, it } from "vitest";
import { getActiveChatTask, getLatestChatTaskForChat, listChatTimelineMessages } from "./chat-task-store";
import fs from "node:fs/promises";
import path from "node:path";
import { buildLocalDecisionPlan } from "../skill-runtime/decision-layer";

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
          primaryVisualDirection: "industrial-b2b",
          secondaryVisualTags: ["professional"],
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

  it("carries auto contact-email settings into queued generation workflow context", async () => {
    const chatId = `chat-contact-settings-${Date.now()}`;
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "Generate a company website with a contact form and lead CTA.",
      "",
      "Forward submissions to official@casux.org.cn.",
    ].join("\n");
    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(canonicalPrompt) }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.requirementSpec?.contactSettings?.forwardTo).toEqual(["official@casux.org.cn"]);
  });

  it("persists website surface mode and discovery brief in queued workflow context", async () => {
    const chatId = `chat-surface-mode-${Date.now()}`;
    const requirement =
      "# Canonical Website Generation Prompt\n\nBuild a developer documentation portal with guides, API reference, onboarding tutorials, and searchable technical reference pages.";
    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(requirement) }] }],
        }),
      }),
    );

    if (res.status !== 202) {
      const body = await res.text();
      throw new Error(`unexpected status ${res.status}: ${body}`);
    }
    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.websiteSurfaceMode).toBe("docs-knowledge-site");
    expect(workflow.websiteTypeSkillId).toBe("docs-knowledge-site");
    expect(workflow.websiteDiscoveryBrief?.surfaceMode).toBe("docs-knowledge-site");
  });

  it("persists discovery brief locale and design-system contract fields in queued workflow context", async () => {
    const chatId = `chat-discovery-brief-contract-${Date.now()}`;
    const requirement =
      "# Canonical Website Generation Prompt\n\nBuild a multilingual documentation portal using IBM Carbon, with English default plus French and Japanese reference support.";
    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(requirement) }] }],
        }),
      }),
    );

    if (res.status !== 202) {
      const body = await res.text();
      throw new Error(`unexpected status ${res.status}: ${body}`);
    }
    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.websiteDiscoveryBrief?.supportedLocales || []).toEqual(
      expect.arrayContaining(["en", "fr", "ja"]),
    );
    expect(workflow.websiteDiscoveryBrief?.defaultLocale).toBe("en");
    expect(workflow.supportedLocales || []).toEqual(expect.arrayContaining(["en", "fr", "ja"]));
  });

  it("defaults website prompt drafts to the website-generation-mvp lane", async () => {
    const previousLane = process.env.SHPITTO_WEBSITE_GENERATION_LANE;
    const previousMvp = process.env.SHPITTO_WEBSITE_GENERATION_MVP;
    delete process.env.SHPITTO_WEBSITE_GENERATION_LANE;
    delete process.env.SHPITTO_WEBSITE_GENERATION_MVP;

    try {
      const chatId = `chat-default-mvp-lane-${Date.now()}`;
      const requirement =
        "# Canonical Website Generation Prompt\n\nBuild a company website for an AI studio with Home, Services, Cases, and Contact.";
      const { POST } = await import("../../app/api/chat/route");
      const res = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(requirement) }] }],
          }),
        }),
      );

      expect(res.status).toBe(202);
      const task = await getLatestChatTaskForChat(chatId);
      const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
      expect(workflow.generationLane).toBe("website-generation-mvp");
      expect(workflow.generationLaneConfig?.disableWebSearch).toBe(true);
      expect(workflow.generationLaneConfig?.routePolicy).toBe("default");
      expect(String(workflow.contractHash || "")).toMatch(/^[a-f0-9]{64}$/);
      expect(workflow.generationContract?.contractHash).toBe(workflow.contractHash);
    } finally {
      if (previousLane === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_LANE;
      else process.env.SHPITTO_WEBSITE_GENERATION_LANE = previousLane;
      if (previousMvp === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_MVP;
      else process.env.SHPITTO_WEBSITE_GENERATION_MVP = previousMvp;
    }
  });

  it("keeps default portfolio-blog first pass on generate without activating deferred blog detail fill", async () => {
    const chatId = `chat-portfolio-blog-first-pass-${Date.now()}`;
    const requirement = [
      "# Canonical Website Generation Prompt",
      "",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join("\n");
    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(requirement) }] }],
        }),
      }),
    );

    if (res.status !== 202) {
      const body = await res.text();
      throw new Error(`unexpected status ${res.status}: ${body}`);
    }
    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("generate");
    expect(workflow.websiteSurfaceMode).toBe("portfolio-blog-site");
    expect(workflow.websiteTypeSkillId).toBe("portfolio-blog-site");
    expect(workflow.skillActionDomain).toBeUndefined();
    expect(workflow.skillAction).toBeUndefined();
    expect(workflow.blogDetailFillRequested).toBeUndefined();
    expect(workflow.refineSkillId).not.toBe("blog-detail-fill-workflow");
    const plan = buildLocalDecisionPlan(task?.result?.internal?.inputState as any);
    expect(plan.routes).toEqual(["/", "/blog", "/contact", "/about"]);
    expect(plan.pageBlueprints.find((page) => page.route === "/blog")?.pageKind).toBe("blog-data-index");
  });

  it("keeps confirmed content-hub surface and bilingual locale from the canonical prompt", async () => {
    const chatId = `chat-confirmed-content-hub-bilingual-${Date.now()}`;
    const requirement = [
      "# Canonical Website Generation Prompt",
      "",
      "Generate the official CASUX website as an institutional standards and research hub.",
      "",
      "Language: Chinese-first bilingual Chinese and English.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          websiteSurfaceMode: "content-hub-site",
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "Information"],
          files: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json", "/index.html", "/casux-information-platform/index.html"],
          discoveryBrief: {
            surfaceMode: "content-hub-site",
            localeMode: "bilingual",
            supportedLocales: ["zh-CN", "en"],
            defaultLocale: "zh-CN",
            routes: ["/", "/casux-information-platform"],
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");
    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(requirement) }] }],
        }),
      }),
    );

    if (res.status !== 202) {
      const body = await res.text();
      throw new Error(`unexpected status ${res.status}: ${body}`);
    }
    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.websiteSurfaceMode).toBe("content-hub-site");
    expect(workflow.websiteDiscoveryBrief?.surfaceMode).toBe("content-hub-site");
    expect(workflow.websiteDiscoveryBrief?.localeMode).toBe("bilingual");
    expect(workflow.websiteDiscoveryBrief?.supportedLocales || []).toEqual(["zh-CN", "en"]);
    expect(workflow.websiteDiscoveryBrief?.defaultLocale).toBe("zh-CN");
    expect(workflow.supportedLocales || []).toEqual(["zh-CN", "en"]);
    expect(workflow.defaultLocale).toBe("zh-CN");
  });

  it("queues website-generation-mvp lane metadata and structured evidence through confirm flow", async () => {
    const previousLane = process.env.SHPITTO_WEBSITE_GENERATION_LANE;
    const previousMvp = process.env.SHPITTO_WEBSITE_GENERATION_MVP;
    const previousWebSearch = process.env.SHPITTO_WEBSITE_GENERATION_WEB_SEARCH;
    const previousRoutePolicy = process.env.SHPITTO_WEBSITE_GENERATION_ROUTE_POLICY;
    process.env.SHPITTO_WEBSITE_GENERATION_LANE = "mvp";
    process.env.SHPITTO_WEBSITE_GENERATION_MVP = "1";
    process.env.SHPITTO_WEBSITE_GENERATION_WEB_SEARCH = "0";
    process.env.SHPITTO_WEBSITE_GENERATION_ROUTE_POLICY = "default";

    try {
      const chatId = `chat-mvp-lane-${Date.now()}`;
      const localFixturePath = path.resolve(process.cwd(), "test-fixtures", "casux-source.txt");
      const requirement = [
        "Build the official CASUX website as an institutional standards and research hub.",
        "Generate a bilingual Chinese and English research and standards site.",
      ].join("\n");
      const requirementFormText = [
        requirementFormPayload({
          siteType: "company",
          contentSources: ["uploaded_files"],
          customNotes:
            "CASUX institutional standards and research hub with public information, creation, construction, certification, advocacy, research center, and information platform sections.",
          targetAudience: ["enterprise_buyers", "overseas_customers"],
          primaryVisualDirection: "institutional-editorial",
          secondaryVisualTags: ["professional", "research-driven"],
          pageStructure: {
            mode: "multi",
            pages: ["home", "information", "creation", "construction", "certification", "advocacy", "research"],
          },
          functionalRequirements: ["multilingual_switch"],
          primaryGoal: ["public_information"],
          language: "bilingual",
        }),
        "",
        "[Referenced Assets]",
        `- Asset "casux-source.txt" path: ${localFixturePath}`,
      ].join("\n");
      const { POST } = await import("../../app/api/chat/route");
      const initialRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: requirement }] }],
          }),
        }),
      );
      expect(initialRes.status).toBe(200);

      const draftRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: requirementFormText }] }],
          }),
        }),
      );

      expect(draftRes.status).toBe(200);
      const timeline = await listChatTimelineMessages(chatId, 100);
      const promptCard = timeline.find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
      const confirmCard = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
      const metadata = (promptCard?.metadata || {}) as Record<string, any>;
      expect(metadata.generationLane).toBe("website-generation-mvp");
      expect(metadata.generationLaneConfig).toEqual({
        disableWebSearch: true,
        routePolicy: "default",
      });
      expect(String(metadata.contractHash || "")).toMatch(/^[a-f0-9]{64}$/);
      expect(metadata.generationContract?.contractHash).toBe(metadata.contractHash);
      expect(metadata.usedWebSearch).toBe(false);
      expect(metadata.promptBudgetEnvelope?.truncationPolicy).toBe("page_scoped_drop");
      expect(metadata.structuredSourceFacts?.pageCandidates?.length).toBeGreaterThan(0);

      const confirmRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: String(confirmCard?.metadata?.payload || "") }] }],
          }),
        }),
      );

      expect(confirmRes.status).toBe(202);
      const task = await getLatestChatTaskForChat(chatId);
      const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
      expect(workflow.generationLane).toBe("website-generation-mvp");
      expect(workflow.generationLaneConfig).toEqual({
        disableWebSearch: true,
        routePolicy: "default",
      });
      expect(String(workflow.contractHash || "")).toMatch(/^[a-f0-9]{64}$/);
      expect(workflow.generationContract?.contractHash).toBe(workflow.contractHash);
      expect(Array.isArray(workflow.routeUnitContracts)).toBe(true);
      expect(Array.isArray(workflow.selectedSeedSkillManifest?.selected)).toBe(true);
      expect(Array.isArray(workflow.selectedSeedContracts)).toBe(true);
      expect(Array.isArray(workflow.generationContract?.selectedSeedContracts)).toBe(true);
      expect(workflow.promptBudgetEnvelope?.truncationPolicy).toBe("page_scoped_drop");
      expect(workflow.structuredSourceFacts?.pageCandidates?.length).toBeGreaterThan(0);
      expect(workflow.referencedAssets).toEqual([`Asset "casux-source.txt" path: ${localFixturePath}`]);
      expect(workflow.websiteSurfaceMode).toBe("content-hub-site");
      expect(workflow.promptControlManifest?.routes).toEqual(
        expect.arrayContaining(["/", "/casux-creation", "/casux-information-platform"]),
      );
    } finally {
      if (previousLane === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_LANE;
      else process.env.SHPITTO_WEBSITE_GENERATION_LANE = previousLane;
      if (previousMvp === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_MVP;
      else process.env.SHPITTO_WEBSITE_GENERATION_MVP = previousMvp;
      if (previousWebSearch === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_WEB_SEARCH;
      else process.env.SHPITTO_WEBSITE_GENERATION_WEB_SEARCH = previousWebSearch;
      if (previousRoutePolicy === undefined) delete process.env.SHPITTO_WEBSITE_GENERATION_ROUTE_POLICY;
      else process.env.SHPITTO_WEBSITE_GENERATION_ROUTE_POLICY = previousRoutePolicy;
    }
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

  it("does not inherit locked provider state from a previous task into a new generation task", async () => {
    const chatId = `chat-provider-lock-reset-${Date.now()}`;
    const canonicalPrompt = "# Canonical Website Generation Prompt\n\nGenerate a personal AI site with a blog.";
    const { createChatTask, completeChatTask } = await import("./chat-task-store");
    const previous = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        inputState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            executionMode: "generate",
            skillId: "website-generation-workflow",
            lockedProvider: "pptoken",
            lockedModel: "gpt-5.4-mini",
            canonicalPrompt,
            sourceRequirement: canonicalPrompt,
          },
        },
      },
      progress: { stage: "done" } as any,
    });
    await completeChatTask(previous.id, previous.result as any);

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(canonicalPrompt) }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.lockedProvider).toBeUndefined();
    expect(workflow.lockedModel).toBeUndefined();
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

  it("skips polluted canonical prompt snapshots and falls back to clean task sourceRequirement when continuing generation", async () => {
    const chatId = `chat-continue-skip-polluted-${Date.now()}`;
    const pollutedPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "## 7. Evidence Brief",
      "- [brand] Brand or organization: Logo",
      "- [offering] AI",
    ].join("\n");
    const cleanSourceRequirement = "beihuang 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS";
    const { appendChatTimelineMessage, createChatTask, failChatTask } = await import("./chat-task-store");
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
            sourceRequirement: cleanSourceRequirement,
            canonicalPrompt: pollutedPrompt,
          },
        },
      },
      progress: { stage: "failed" } as any,
    });
    await failChatTask(failed.id, "previous generation failed");
    await appendChatTimelineMessage({
      chatId,
      role: "user",
      text: pollutedPrompt,
    });

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
    expect((task?.result?.internal?.inputState as any)?.workflow_context?.sourceRequirement).toBe(cleanSourceRequirement);
  });

  it("keeps canonical prompt drafts whose knowledge profile contains placeholder brand text", async () => {
    const chatId = `chat-continue-knowledge-profile-brand-${Date.now()}`;
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "> Requirement completion: 12/12",
      "",
      "## 0. Confirmed Generation Parameters",
      "- Language: Chinese and English",
      "- Final website locale requirement: Chinese and English",
      "- Business/content details: HelloTalk, DevOps, SaaS, K12, AI.",
      "",
      "## 7. Evidence Brief",
      "- [brand] Brand or organization: Logo",
      "- Preserve the user's named experience and personal attributes.",
      "",
      "## 7.35 Bilingual Experience Contract",
      "- Requested site locale: bilingual EN/ZH",
      "",
      "## Website Knowledge Profile",
      "- Brand: Logo",
      "- Source: user-provided knowledge profile",
    ].join("\n");
    const { POST } = await import("../../app/api/chat/route");
    const { appendChatTimelineMessage } = await import("./chat-task-store");
    await appendChatTimelineMessage({
      chatId,
      role: "assistant",
      text: "Prompt draft ready.",
      metadata: {
        cardType: "prompt_draft",
        canonicalPrompt,
      },
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "continue generation" }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.sourceRequirement).toBe(canonicalPrompt);
    expect(workflow.canonicalPrompt).toBe(canonicalPrompt);
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
  }, 15000);

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
    const userText = requirementFormPayload({
      primaryVisualDirection: "heritage-manufacturing",
      secondaryVisualTags: [],
    });
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
    expect(workflow.primaryVisualDirection).toBe("heritage-manufacturing");
    expect(workflow.secondaryVisualTags || []).toEqual([]);
    expect(workflow.visualDecisionSource).toBe("user_explicit");
    expect(workflow.lockPrimaryVisualDirection).toBe(true);
    expect(workflow.requirementDraft).toBeUndefined();
    expect(workflow.promptControlManifest).toEqual(promptDraftContract);
    expect(workflow.generationRoutingContract).toBeUndefined();
  });

  it("keeps confirmed canonical prompts in generation mode even when they mention deployment defaults", async () => {
    const chatId = `chat-confirm-generate-deploy-words-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "Generate a personal AI blog with three articles.",
      "",
      "Default deployment: shpitto server.",
      "缺失项：部署域名与交付要求",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routes: ["/", "/blog"],
        navLabels: ["首页", "博客"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
    ].join("\n");

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: `__SHP_CONFIRM_GENERATE__\n${canonicalPrompt}` }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("generate");
    expect(workflow.deployRequested).toBe(false);
    const timeline = await listChatTimelineMessages(chatId, 30);
    expect(timeline.some((message) => String(message.text || "").includes("__SHP_CONFIRM_GENERATE__"))).toBe(false);
  });

  it("rebuilds a canonical prompt before confirmed generation when the confirm payload carries only raw requirement text", async () => {
    const chatId = `chat-confirm-raw-rebuild-${Date.now()}`;
    const rawRequirement =
      "我想做个个人简历网站，做AI方向，需要3篇blog体现我的价值，并且首页支持中英双语切换。beihuang，华为，微信全球化，HelloTalk。";
    const { POST } = await import("../../app/api/chat/route");

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: `__SHP_CONFIRM_GENERATE__\n${rawRequirement}` }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(String(workflow.canonicalPrompt || "")).toContain("# Canonical Website Generation Prompt");
    expect(String(workflow.canonicalPrompt || "")).toContain("Bilingual Experience Contract");
    expect(workflow.promptControlManifest?.routes).toEqual(["/", "/blog"]);
    expect(String(workflow.sourceRequirement || "")).toContain("# Canonical Website Generation Prompt");
  });

  it("preserves confirmed canonical prompt as sourceRequirement during async generation handoff", async () => {
    const chatId = `chat-confirm-preserve-canonical-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "> Requirement completion: 12/12",
      "",
      "## 0. Confirmed Generation Parameters",
      "- Language: Chinese and English",
      "- Business/content details: HelloTalk, DevOps, SaaS, K12, AI.",
      "",
      "## 7.35 Bilingual Experience Contract",
      "- Requested site locale: bilingual EN/ZH",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routes: ["/", "/blog"],
        navLabels: ["Home", "Blog"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
    ].join("\n");

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: `__SHP_CONFIRM_GENERATE__\n${canonicalPrompt}` }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(String(workflow.canonicalPrompt || "")).toBe(canonicalPrompt);
    expect(String(workflow.sourceRequirement || "")).toBe(canonicalPrompt);
  });

  it("blocks deploy mode by task lifecycle when no completed generation baseline exists", async () => {
    const chatId = `chat-deploy-lifecycle-gate-${Date.now()}`;
    const { createChatTask, failChatTask } = await import("./chat-task-store");
    const failedDeploy = await createChatTask(chatId, undefined, {
      assistantText: "Deploy request confirmed. Preparing deployment to shpitto server.",
      phase: "deploy",
      internal: {
        inputState: {
          messages: [],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            executionMode: "deploy",
            deployRequested: true,
          },
        },
      },
      progress: { stage: "deploying:prepare" },
    });
    await failChatTask(failedDeploy.id, "No generated site artifacts found for deployment.");

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "部署到 Cloudflare，验证线上网站可用" }] }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const latest = await getLatestChatTaskForChat(chatId);
    expect(latest?.id).toBe(failedDeploy.id);
    const timeline = await listChatTimelineMessages(chatId, 30);
    const gate = timeline.find((message) => String(message.metadata?.cardType || "") === "lifecycle_gate");
    expect(gate?.metadata?.requestedIntent).toBe("deploy");
    expect(gate?.metadata?.requiredTaskStatus).toBe("succeeded");
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

  it("treats a no-home local checkpoint as complete when all planned route files exist", async () => {
    const chatId = `chat-local-no-home-${Date.now()}`;
    const taskId = `local-no-home-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId, "latest");
    const siteDir = path.join(root, "site");
    const workflowDir = path.join(root, "workflow");
    await fs.mkdir(path.join(siteDir, "casux-creation"), { recursive: true });
    await fs.mkdir(path.join(siteDir, "standards-system"), { recursive: true });
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "casux-creation", "index.html"),
      "<!doctype html><html><body>CASUX creation</body></html>",
      "utf8",
    );
    await fs.writeFile(
      path.join(siteDir, "standards-system", "index.html"),
      "<!doctype html><html><body>Standards</body></html>",
      "utf8",
    );
    await fs.writeFile(path.join(siteDir, "styles.css"), "body{margin:0}", "utf8");
    await fs.writeFile(path.join(siteDir, "script.js"), "console.log('ok')", "utf8");
    await fs.writeFile(
      path.join(workflowDir, "task_plan.md"),
      ["# Task Plan", "", "- Routes: /casux-creation, /standards-system"].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({
        savedAt: "2026-05-25T15:10:22.291Z",
        latestUpdatedAt: "2026-05-25T15:10:22.291Z",
        status: "done",
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
    expect(json?.task?.status).toBe("succeeded");
    expect(json?.task?.result?.progress?.missingFiles).toEqual([]);
    expect(json?.task?.result?.progress?.generatedFiles).toEqual(
      expect.arrayContaining([
        "/casux-creation/index.html",
        "/standards-system/index.html",
        "/styles.css",
        "/script.js",
      ]),
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

  it("lets the website skill route blog topic/count requests into structural Blog content refine", async () => {
    const chatId = `chat-blog-route-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", `chat-blog-route-${Date.now()}.json`);
    const siteArtifacts = {
      projectId: "blog-route-test",
      pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><head></head><body>ok</body></html>",
          },
          {
            path: "/blog/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list></div></section></body></html>',
          },
          { path: "/styles.css", type: "text/css", content: "body{color:#111}" },
          { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
        ],
      },
    };
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify(siteArtifacts), "utf8");

    const { setWebsiteChatRouteClassifierForTesting } = await import("../../skills/website-generation-workflow/routing-policy.ts");
    setWebsiteChatRouteClassifierForTesting(async () => ({
      actionDomain: "blog_content",
      action: "regenerate_posts",
      intent: "refine_preview",
      confidence: 0.94,
      reason: "semantic_blog_topic_and_count_update",
      evidence: ["blog content", "AI/global expansion", "three articles"],
    }));

    try {
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
            workflow_context: {
              checkpointProjectPath: projectPath,
              deploySourceProjectPath: projectPath,
            },
            site_artifacts: siteArtifacts,
          },
        },
        progress: { stage: "done", checkpointProjectPath: projectPath } as any,
      });
      await completeChatTask(previous.id, {
        assistantText: "generated",
        phase: "end",
        internal: previous.result?.internal,
        progress: { stage: "done", checkpointProjectPath: projectPath } as any,
      });

      const { POST } = await import("../../app/api/chat/route");
      const res = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: "blog文章内容主要是与ai、出海相关的内容，准备3篇" }] }],
          }),
        }),
      );

      expect(res.status).toBe(202);
      const latest = await getLatestChatTaskForChat(chatId);
      expect(latest?.id).not.toBe(previous.id);
      const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
      expect(workflow.executionMode).toBe("refine");
      expect(workflow.refineScope).toBe("structural");
      expect(workflow.skillActionDomain).toBe("blog_content");
      expect(workflow.skillAction).toBe("regenerate_posts");
      expect(workflow.intent).toBe("refine_preview");
      expect(workflow.requirementPatchPlan?.operations || []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target: "pages",
            value: expect.arrayContaining(["blog"]),
          }),
        ]),
      );
    } finally {
      setWebsiteChatRouteClassifierForTesting(undefined);
    }
  });

  it("gates deploy behind Blog article confirmation when preview posts are pending", async () => {
    const chatId = `chat-blog-confirm-${Date.now()}`;
    const siteArtifacts = {
      projectId: "blog-confirm-test",
      pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/blog/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card">preview</article></div></section></body></html>',
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
          workflow_context: {
            blogContentPreviewStatus: "pending_confirmation",
            blogNavLabel: "博客",
            blogContentPreviewPosts: [
              {
                slug: "ai-one",
                title: "AI One",
                excerpt: "preview article",
                category: "AI",
                tags: ["AI"],
              },
            ],
          },
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await getActiveChatTask(chatId)).toBeUndefined();
    const timeline = await listChatTimelineMessages(chatId, 30);
    const confirm = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_blog_content_deploy");
    expect(confirm).toBeTruthy();
    expect(String(confirm?.metadata?.payload || "")).toBe("__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__");
    expect(Array.isArray((confirm?.metadata as any)?.posts)).toBe(true);
  });

  it("queues deploy after Blog article confirmation", async () => {
    const chatId = `chat-blog-confirm-deploy-${Date.now()}`;
    const siteArtifacts = {
      projectId: "blog-confirm-deploy-test",
      pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/blog/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card">preview</article></div></section></body></html>',
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
          workflow_context: {
            blogContentPreviewStatus: "pending_confirmation",
            blogNavLabel: "博客",
            blogContentPreviewPosts: [
              {
                slug: "ai-one",
                title: "AI One",
                excerpt: "preview article",
                category: "AI",
                tags: ["AI"],
              },
            ],
          },
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__" }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const latest = await getActiveChatTask(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("deploy");
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.blogContentConfirmed).toBe(true);
    expect(Array.isArray(workflow.blogContentPreviewPosts)).toBe(true);
    const timeline = await listChatTimelineMessages(chatId, 30);
    expect(timeline.some((message) => String(message.text || "").includes("__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__"))).toBe(false);
  });

  it("preserves generic content-preview workflow aliases for non-blog content-backed routes", async () => {
    const chatId = `chat-content-confirm-deploy-${Date.now()}`;
    const siteArtifacts = {
      projectId: "content-confirm-deploy-test",
      pages: [
        { path: "/", html: "<!doctype html><html><head></head><body>home</body></html>" },
        { path: "/casux-information-platform", html: "<!doctype html><html><head></head><body>ok</body></html>" },
      ],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><body><main><a href=\"/casux-information-platform/\">CASUX Information Platform</a></main></body></html>",
          },
          {
            path: "/casux-information-platform/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>CASUX Information Platform</h1><div data-shpitto-blog-list><article class="resource-card">preview</article></div></section></body></html>',
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
          workflow_context: {
            contentPreviewStatus: "pending_confirmation",
            contentPreviewPosts: [
              { slug: "casux-one", title: "CASUX One", excerpt: "preview entry", category: "CASUX", tags: ["CASUX"] },
            ],
          },
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "deploy to shpitto server" }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const latest = await getActiveChatTask(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(typeof workflow.executionMode).toBe("string");
    expect(Array.isArray(workflow.contentPreviewPosts)).toBe(true);
    expect(Array.isArray(workflow.blogContentPreviewPosts)).toBe(true);
    expect(workflow.contentPreviewStatus || workflow.blogContentPreviewStatus).toBeTruthy();
  });

  it("queues deploy after generic content confirmation", async () => {
    const chatId = `chat-content-confirm-deploy-queue-${Date.now()}`;
    const siteArtifacts = {
      projectId: "content-confirm-deploy-queue-test",
      pages: [
        { path: "/", html: "<!doctype html><html><head></head><body>home</body></html>" },
        { path: "/casux-information-platform", html: "<!doctype html><html><head></head><body>ok</body></html>" },
      ],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><body><main><a href=\"/casux-information-platform/\">CASUX Information Platform</a></main></body></html>",
          },
          {
            path: "/casux-information-platform/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>CASUX Information Platform</h1><div data-shpitto-blog-list><article class="resource-card">preview</article></div></section></body></html>',
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
          workflow_context: {
            contentPreviewStatus: "pending_confirmation",
            contentPreviewPosts: [
              { slug: "casux-one", title: "CASUX One", excerpt: "preview entry", category: "CASUX", tags: ["CASUX"] },
            ],
          },
          site_artifacts: siteArtifacts,
        },
      },
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });
    await completeChatTask(previous.id, {
      assistantText: "generated",
      phase: "end",
      internal: previous.result?.internal,
      progress: { checkpointProjectPath: "/remote/project.json" } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "__SHP_CONFIRM_CONTENT_DEPLOY__" }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const latest = await getActiveChatTask(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("deploy");
    expect(workflow.deployRequested).toBe(true);
    expect(workflow.contentPreviewConfirmed).toBe(true);
    expect(workflow.blogContentConfirmed).toBe(true);
    expect(Array.isArray(workflow.contentPreviewPosts)).toBe(true);
    expect(Array.isArray(workflow.blogContentPreviewPosts)).toBe(true);
    expect(workflow.contentPreviewStatus || workflow.blogContentPreviewStatus).toBeTruthy();
    const timeline = await listChatTimelineMessages(chatId, 30);
    expect(timeline.some((message) => String(message.text || "").includes("__SHP_CONFIRM_CONTENT_DEPLOY__"))).toBe(false);
  });

  it("routes manual blog detail fill requests into the deferred detail workflow", async () => {
    const chatId = `chat-blog-detail-fill-${Date.now()}`;
    const projectPath = "/remote/project.json";
    const siteArtifacts = {
      projectId: "blog-detail-fill-test",
      pages: [{ path: "/blog", html: "<!doctype html><html><body><main>blog</main></body></html>" }],
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/blog/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/alpha/">Alpha</a></article></div></section></body></html>',
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
          workflow_context: {
            checkpointProjectPath: projectPath,
            deploySourceProjectPath: projectPath,
          },
          site_artifacts: siteArtifacts,
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
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: "fill blog detail pages now" }] }],
        }),
      }),
    );

    expect(res.status).toBe(202);
    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.executionMode).toBe("refine");
    expect(workflow.refineScope).toBe("structural");
    expect(workflow.skillActionDomain).toBe("blog_detail");
    expect(workflow.skillAction).toBe("fill_details");
    expect(workflow.blogDetailFillRequested).toBe(true);
    expect(workflow.refineSkillId).toBe("blog-detail-fill-workflow");
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

  it("routes natural deploy verification messages to deploy mode", async () => {
    const cases = [
      "\u90e8\u7f72\u5230 Cloudflare\uff0c\u9a8c\u8bc1\u7ebf\u4e0a\u7f51\u7ad9\u53ef\u7528",
      "deploy the latest generated website to Cloudflare",
    ];

    for (const text of cases) {
      const chatId = `chat-deploy-natural-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const siteArtifacts = {
        projectId: "deploy-natural-test",
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
          messages: [{ role: "user", parts: [{ type: "text", text }] }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(202);

      const latest = await getActiveChatTask(chatId);
      const workflow = ((latest?.result?.internal?.inputState as any) || {}).workflow_context || {};
      expect(workflow.deployRequested).toBe(true);
      expect(workflow.executionMode).toBe("deploy");
      expect(workflow.canonicalPrompt).toBe(text);
    }
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
