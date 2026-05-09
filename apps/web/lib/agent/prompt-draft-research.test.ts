import { describe, expect, it } from "vitest";
import { buildRequirementSlots } from "./chat-orchestrator";
import { afterEach, vi } from "vitest";
import {
  buildPromptControlManifestFromKnowledgeProfileForTesting,
  buildPromptControlManifestForTesting,
  buildPromptDraftWithResearch,
  buildSerperQueriesForTesting,
  enrichCanonicalPromptWithControlManifestForTesting,
  mergeTemplateWithKnowledgeProfileForTesting,
} from "./prompt-draft-research";
import { containsWorkflowCjk, isWorkflowArtifactEnglishSafe } from "../workflow-artifact-language.ts";

describe("prompt draft research", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back in test env and still keeps user constraints in draft", async () => {
    const requirement =
      "给我做 LC-CNC 英文官网，包含 Home/About/Products/Cases/Contact，主色 #22c55e，部署到 cloudflare";
    const slots = buildRequirementSlots(requirement);
    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots,
    });

    expect(result.usedWebSearch).toBe(false);
    expect(String(result.fallbackReason || "")).toContain("test_environment_skip_network");
    expect(result.canonicalPrompt).toContain("Explicit User Constraints");
    expect(result.draftMode).toBe("template");
    expect(result.canonicalPrompt).toContain("LC-CNC");
    expect(result.canonicalPrompt).toContain("#22c55e");
    expect(result.canonicalPrompt).toContain("cloudflare");
    expect(result.canonicalPrompt).toContain("Internal prompt language: English only.");
    expect(result.canonicalPrompt).not.toContain("给我做");
    expect(containsWorkflowCjk(result.canonicalPrompt)).toBe(false);
    expect(isWorkflowArtifactEnglishSafe(result.canonicalPrompt)).toBe(true);
  });

  it("adds a thin generation contract before generation", async () => {
    const requirement =
      "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact. Keep shared styles and script across all pages, and ensure navigation links work.";

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
    });

    expect(result.canonicalPrompt).toContain("Prompt Control Manifest");
    expect(result.canonicalPrompt).toContain("Prompt Control Manifest (Machine Readable)");
    expect(result.canonicalPrompt).toContain('"routeSource": "prompt_draft_page_plan"');
    expect(result.canonicalPrompt).toContain('"pageIntents":');
    expect(result.canonicalPrompt).toContain('"routes":');
    expect(result.promptControlManifest.routes).toEqual([
      "/",
      "/3c-machines",
      "/custom-solutions",
      "/cases",
      "/contact",
      "/about",
    ]);
    expect(result.promptControlManifest.files).toEqual(
      expect.arrayContaining(["/styles.css", "/script.js", "/3c-machines/index.html", "/contact/index.html"]),
    );
    expect(result.canonicalPrompt).toContain("/styles.css");
    expect(result.canonicalPrompt).toContain("/script.js");
    expect(result.canonicalPrompt).toContain("/3c-machines/index.html");
    expect(result.canonicalPrompt).toContain("Page-Level Intent Contract");
    expect(result.canonicalPrompt).not.toContain("product-grid -> spec-cards");
    expect(result.canonicalPrompt).toContain("/contact/index.html");
    expect(result.canonicalPrompt).not.toContain("quote-form");
    expect(result.canonicalPrompt).toContain("Do not add unlisted pages");
    expect(result.canonicalPrompt).toContain("Workflow Skill Contract");
    expect(result.canonicalPrompt).toContain("Evidence Brief Contract");
    expect(result.canonicalPrompt).toContain("Shared Shell/Footer Contract");
    expect(result.canonicalPrompt).toContain("Do not reduce inner-page footers to a single copyright line");
    expect(result.canonicalPrompt).toContain("overflow-wrap: anywhere");
    expect(result.canonicalPrompt).not.toContain("/downloads/index.html");
  });

  it("builds a structured routing contract separately from the markdown draft", () => {
    const contract = buildPromptControlManifestForTesting(
      "Build a site. Pages: Home, Products, Cases, Contact. Contact form fields include Email and Phone.",
    );

    expect(contract.routes).toEqual(["/", "/products", "/cases", "/contact"]);
    expect(contract.files).toEqual(
      expect.arrayContaining(["/index.html", "/products/index.html", "/cases/index.html", "/contact/index.html"]),
    );
    expect(contract.routes).not.toEqual(expect.arrayContaining(["/email", "/phone"]));
  });

  it("replaces legacy page module blueprints with thin generation contracts", () => {
    const legacyDraft = [
      "# Complete Website Generation Prompt",
      "## 1. Overview",
      "Build a personal AI practice blog.",
      "## 3.5 Page Differentiation Blueprint",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        routeSource: "prompt_draft_page_plan",
        routes: ["/", "/blog"],
        navLabels: ["Home", "Blog"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
      "### Page-Level Module Blueprint",
      "- Products page must include product-grid, spec-cards, quote-form.",
      "## 4. Design Direction",
      "Minimal writing-focused blog.",
    ].join("\n");

    const enriched = enrichCanonicalPromptWithControlManifestForTesting(
      legacyDraft,
      "Build a personal AI practice blog. Pages: Home, Blog.",
    );

    expect(enriched).toContain("## 3.5 Prompt Control Manifest");
    expect(enriched).toContain("Page-Level Intent Contract");
    expect(enriched).not.toContain("Page-Level Module Blueprint");
    expect(enriched).not.toContain("product-grid");
    expect(enriched).not.toContain("quote-form");
  });

  it("replaces localized legacy 3.5 blueprint sections during replay", () => {
    const legacyDraft = [
      "# 完整网站生成提示词",
      "## 1. 原始需求",
      "个人 AI 实践 blog。",
      "## 3.5 页面差异化蓝图（必填）",
      "### 生成路由契约（机器可读）",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        routeSource: "prompt_draft_page_plan",
        routes: ["/", "/blog"],
        navLabels: ["首页", "Blog"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
      "- 首页必须包含 product-grid。",
      "- Blog 页必须包含 quote-form。",
      "## 4. 设计方向",
      "科技感与极简现代。",
    ].join("\n");

    const enriched = enrichCanonicalPromptWithControlManifestForTesting(
      legacyDraft,
      "我想做个人 blog，主要介绍 AI 实践经验。页面：Home, Blog。",
    );

    expect(enriched).toContain("## 3.5 Prompt Control Manifest");
    expect(enriched).toContain("Page-Level Intent Contract");
    expect(enriched).not.toContain("页面差异化蓝图");
    expect(enriched).not.toContain("product-grid");
    expect(enriched).not.toContain("quote-form");
  });

  it("uses uploaded source suggested pages as the generation routing contract", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("根据上传 PDF 生成 CASUX 官网。", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "首页", purpose: "首页", contentInputs: [] },
        { route: "/casux-creation", title: "CASUX创设", purpose: "创设", contentInputs: [] },
        { route: "/casux-construction", title: "CASUX建设", purpose: "建设", contentInputs: [] },
        { route: "/casux-certification", title: "CASUX优标", purpose: "优标", contentInputs: [] },
        { route: "/casux-advocacy", title: "CASUX倡导", purpose: "倡导", contentInputs: [] },
        { route: "/casux-research-center", title: "CASUX研究中心", purpose: "研究中心", contentInputs: [] },
        { route: "/casux-information-platform", title: "CASUX信息平台", purpose: "信息平台", contentInputs: [] },
        { route: "/downloads", title: "资料下载", purpose: "资料下载", contentInputs: [] },
      ],
      contentGaps: [],
      summary: "",
    });

    expect(contract.routeSource).toBe("uploaded_source_page_plan");
    expect(contract.routes).toEqual([
      "/",
      "/casux-creation",
      "/casux-construction",
      "/casux-certification",
      "/casux-advocacy",
      "/casux-research-center",
      "/casux-information-platform",
      "/downloads",
    ]);
    expect(contract.routes).not.toContain("/custom-solutions");
  });

  it("adds an evidence brief that preserves source-backed content priorities", () => {
    const prompt = mergeTemplateWithKnowledgeProfileForTesting("# Canonical Website Generation Prompt", {
      sourceMode: "domain",
      domains: ["example.com"],
      sources: [
        {
          type: "domain",
          title: "Example Research Center",
          url: "https://example.com/",
          snippet:
            "Example Research Center provides pediatric environment assessment services, certification programs, and family guidance resources.",
          confidence: 0.92,
        },
      ],
      brand: {
        name: "Example Research Center",
        description: "A pediatric environment research organization focused on assessment and certification.",
      },
      audience: ["Parents evaluating spaces for children aged 0-12"],
      offerings: ["Pediatric environment assessment services", "Certification programs"],
      differentiators: ["Research-backed standards"],
      proofPoints: ["Certification program evidence from the source site"],
      suggestedPages: [
        {
          route: "/assessment",
          title: "Assessment",
          purpose: "Explain assessment service scope and route parents to inquiry.",
          contentInputs: ["Pediatric environment assessment services", "Parents evaluating spaces for children aged 0-12"],
        },
      ],
      contentGaps: ["Client case studies are not available in the source material."],
      summary: "Example Research Center provides pediatric environment assessment services and certification programs.",
    });

    expect(prompt).toContain("## 7. Evidence Brief");
    expect(prompt).toContain("[brand] Brand or organization: Example Research Center");
    expect(prompt).toContain("[offering] Pediatric environment assessment services");
    expect(prompt).toContain("Assessment (/assessment)");
    expect(prompt).toContain("Content inputs: Pediatric environment assessment services");
    expect(prompt).toContain("Gap: Client case studies are not available in the source material.");
    expect(prompt).toContain("Example Research Center provides pediatric environment assessment services");
    expect(prompt).toContain("## 7.5 External Research Addendum");
    expect(prompt).toContain("## Website Knowledge Profile");
  });

  it("keeps high-confidence uploaded source excerpts as an internal appendix", () => {
    const sourceExcerpt = [
      "CASUX 网站完整页面生成提示词",
      "生成标准文件展示卡片组件：左侧 PDF 图标，中间标准名称、标准编号、发布机构、发布日期，右侧下载按钮。",
      "生成适儿空间CASUX评分可视化组件：总分、圆形进度条、五维度雷达图、认证等级徽章。",
    ].join("\n");
    const prompt = mergeTemplateWithKnowledgeProfileForTesting("# Canonical Website Generation Prompt", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [
        {
          type: "uploaded_file",
          title: "CASUX_.md.pdf",
          fileName: "CASUX_.md.pdf",
          snippet: sourceExcerpt,
          confidence: 0.9,
        },
      ],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        {
          route: "/downloads",
          title: "资料下载",
          purpose: "Present source-defined downloads.",
          contentInputs: ["资料下载"],
        },
      ],
      contentGaps: [],
      summary: sourceExcerpt,
    });

    expect(prompt).toContain("## 7.25 Source Material Appendix");
    expect(prompt).toContain("Internal Generation Input");
    expect(prompt).toContain("multilingual source excerpt available");
    expect(prompt).toContain("multilingual source text stored in extracted source artifacts");
    expect(containsWorkflowCjk(prompt)).toBe(false);
    expect(isWorkflowArtifactEnglishSafe(prompt)).toBe(true);
    expect(prompt.indexOf("## 7.25 Source Material Appendix")).toBeLessThan(
      prompt.indexOf("## 7.5 External Research Addendum"),
    );
  });

  it("still injects uploaded source material when the test environment skips network search", async () => {
    const sourceExcerpt = [
      "CASUX 网站完整页面生成提示词",
      "主导航菜单： 首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载",
      "网站定位：专业标准制定机构 + 研究中心 + 信息平台三合一。",
      "视觉风格：以生态绿色 #2E8B57 和白色为主色调，搭配暖橙色作为 CTA 点缀。",
      "生成标准文件展示卡片组件：左侧 PDF 图标，中间标准名称、标准编号、发布机构、发布日期，右侧下载按钮。",
      "生成适儿空间 CASUX 评分可视化组件：总分、圆形进度条、五维度雷达图、认证等级徽章。",
    ].join("\n");
    const fetchMock = vi.fn(async () => new Response(sourceExcerpt, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const requirement = "根据附件 PDF 文档内容生成 CASUX 官网。";
    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      referencedAssets: ['Asset "CASUX_.md.pdf" URL: https://example.test/CASUX_.md.pdf'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fallbackReason).toContain("test_environment_skip_network");
    expect(result.knowledgeProfile?.sourceMode).toBe("uploaded_files");
    expect(result.promptControlManifest.routeSource).toBe("uploaded_source_page_plan");
    expect(result.promptControlManifest.routes).toEqual(
      expect.arrayContaining([
        "/",
        "/casux-creation",
        "/casux-construction",
        "/casux-certification",
        "/casux-advocacy",
        "/casux-research-center",
        "/casux-information-platform",
      ]),
    );
    expect(result.canonicalPrompt).toContain("## 7.25 Source Material Appendix");
    expect(result.canonicalPrompt).toContain("CASUX Construction");
    expect(result.canonicalPrompt).toContain("multilingual source excerpt available");
    expect(containsWorkflowCjk(result.canonicalPrompt)).toBe(false);
    expect(isWorkflowArtifactEnglishSafe(result.canonicalPrompt)).toBe(true);
    expect(result.canonicalPrompt).not.toContain("/custom-solutions/index.html");
  });

  it("includes confirmed functional requirements in the prompt draft", async () => {
    const requirement = [
      "需求表单已提交：",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "company",
          targetAudience: ["enterprise_buyers"],
          secondaryVisualTags: ["professional"],
          pageStructure: { mode: "multi", pages: ["home", "contact"] },
          functionalRequirements: ["customer_inquiry_form"],
          primaryGoal: ["lead_generation"],
          language: "zh-CN",
          brandLogo: { mode: "text_mark" },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
    });

    expect(result.canonicalPrompt).toContain("Functional requirements");
    expect(result.canonicalPrompt).toContain("Customer inquiry form");
    expect(result.canonicalPrompt).not.toContain("Language switch");
  });

  it("prioritizes explicit domains over long requirement-form search text", () => {
    const requirement = [
      "我要做个育儿环境研究中心的网站，域名是casux.org.cn",
      "需求表单已提交：",
      "- 网站类型：企业官网",
      "- 目标受众：面向0到12岁孩子的家长",
      "- 设计主题：温暖亲和",
      "- 页面结构：多页网站：Home / 首页、About / 关于、Products / 产品、Cases / 案例、Services / 服务、Blog / 博客、Contact / 联系",
      "- 功能需求：联系表单、资料下载",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({ pageStructure: { mode: "multi", pages: ["home", "about", "products"] } }),
      "```",
    ].join("\n");

    const queries = buildSerperQueriesForTesting(requirement, buildRequirementSlots(requirement), 2);

    expect(queries).toEqual(["site:casux.org.cn", "casux.org.cn"]);
  });

  it("uses provider-gated fallback reason instead of openai-only key check", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAibermKey = process.env.AIBERM_API_KEY;
    const prevCrazyrouteKey = process.env.CRAZYROUTE_API_KEY;
    try {
      (process.env as any).NODE_ENV = "development";
      delete process.env.AIBERM_API_KEY;
      delete process.env.CRAZYROUTE_API_KEY;

      const result = await buildPromptDraftWithResearch({
        requirementText: "build a product website",
        slots: buildRequirementSlots("build a product website"),
      });

      expect(result.usedWebSearch).toBe(false);
      expect(String(result.fallbackReason || "")).toContain("missing_provider_api_key");
      expect(String(result.fallbackReason || "")).not.toContain("openai");
      expect(result.draftMode).toBe("template");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevAibermKey === undefined) {
        delete process.env.AIBERM_API_KEY;
      } else {
        process.env.AIBERM_API_KEY = prevAibermKey;
      }
      if (prevCrazyrouteKey === undefined) {
        delete process.env.CRAZYROUTE_API_KEY;
      } else {
        process.env.CRAZYROUTE_API_KEY = prevCrazyrouteKey;
      }
    }
  });

  it("returns missing_serper_api_key when web search enabled without serper key", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAibermKey = process.env.AIBERM_API_KEY;
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevLlmEnabled = process.env.CHAT_DRAFT_LLM_ENABLED;
    try {
      (process.env as any).NODE_ENV = "development";
      process.env.AIBERM_API_KEY = "test-aiberm-key";
      delete process.env.SERPER_API_KEY;
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";

      const result = await buildPromptDraftWithResearch({
        requirementText: "build a product website",
        slots: buildRequirementSlots("build a product website"),
      });

      expect(result.usedWebSearch).toBe(false);
      expect(String(result.fallbackReason || "")).toContain("missing_serper_api_key");
      expect(result.draftMode).toBe("template");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevAibermKey === undefined) {
        delete process.env.AIBERM_API_KEY;
      } else {
        process.env.AIBERM_API_KEY = prevAibermKey;
      }
      if (prevSerperKey === undefined) {
        delete process.env.SERPER_API_KEY;
      } else {
        process.env.SERPER_API_KEY = prevSerperKey;
      }
      if (prevLlmEnabled === undefined) {
        delete process.env.CHAT_DRAFT_LLM_ENABLED;
      } else {
        process.env.CHAT_DRAFT_LLM_ENABLED = prevLlmEnabled;
      }
    }
  });
});
