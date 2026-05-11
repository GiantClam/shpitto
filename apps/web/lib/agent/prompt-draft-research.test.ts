import { describe, expect, it } from "vitest";
import { buildRequirementSlots } from "./chat-orchestrator";
import { afterEach, vi } from "vitest";
import {
  buildPromptControlManifestFromKnowledgeProfileForTesting,
  buildPromptControlManifestForTesting,
  buildPromptDraftWithResearch,
  buildSerperQueriesForTesting,
  ensureCanonicalPromptHasBilingualContractForTesting,
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

  it("keeps generic uploaded-source multi-page IA in the prompt control manifest", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting(
      "Generate the website from the uploaded planning document.",
      {
        sourceMode: "uploaded_files",
        domains: [],
        sources: [],
        brand: { name: "Example Co" },
        audience: [],
        offerings: [],
        differentiators: [],
        proofPoints: [],
        suggestedPages: [
          { route: "/", title: "Home", purpose: "Home page", contentInputs: [] },
          { route: "/about-us", title: "About Us", purpose: "Company overview", contentInputs: [] },
          { route: "/solutions", title: "Solutions", purpose: "Solutions overview", contentInputs: [] },
          { route: "/solutions-for-schools", title: "Solutions for Schools", purpose: "Education segment page", contentInputs: [] },
          { route: "/case-studies", title: "Case Studies", purpose: "Proof page", contentInputs: [] },
          { route: "/resources", title: "Resources", purpose: "Downloads and guides", contentInputs: [] },
          { route: "/contact", title: "Contact Us", purpose: "Contact page", contentInputs: [] },
        ],
        contentGaps: [],
        summary: "",
      },
    );

    expect(contract.routeSource).toBe("uploaded_source_page_plan");
    expect(contract.routes).toEqual([
      "/",
      "/about-us",
      "/solutions",
      "/solutions-for-schools",
      "/case-studies",
      "/resources",
      "/contact",
    ]);
    expect(contract.files).toEqual(
      expect.arrayContaining([
        "/index.html",
        "/about-us/index.html",
        "/solutions/index.html",
        "/solutions-for-schools/index.html",
        "/case-studies/index.html",
        "/resources/index.html",
        "/contact/index.html",
      ]),
    );
  });

  it("keeps source-derived deduped sibling routes in the prompt control manifest", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting(
      "Generate the website from the uploaded CASUX planning document.",
      {
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
      },
    );

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
    expect(result.promptControlManifest.routes).toEqual([
      "/",
      "/casux-creation",
      "/casux-construction",
      "/casux-certification",
      "/casux-advocacy",
      "/casux-research-center",
      "/casux-information-platform",
    ]);
    expect(result.canonicalPrompt).toContain("## 7.25 Source Material Appendix");
    expect(result.canonicalPrompt).toContain("CASUX");
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

  it("injects a bilingual site contract into the prompt draft when the requested locale is bilingual", async () => {
    const requirement = [
      "生成前必填信息已提交：",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "portfolio",
          pageStructure: { mode: "multi", pages: ["blog"] },
          functionalRequirements: ["none"],
          primaryGoal: ["brand_trust"],
          language: "bilingual",
          brandLogo: { mode: "text_mark" },
        },
        null,
        2,
      ),
      "```",
      "做一个中英双语 blog，默认中文，并且需要语言切换。",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.canonicalPrompt).toContain("## 7.35 Bilingual Experience Contract");
    expect(result.canonicalPrompt).toContain("Requested site locale: bilingual EN/ZH");
    expect(result.canonicalPrompt).toContain("Default visible language: Chinese (zh-CN)");
    expect(result.canonicalPrompt).toContain("`data-i18n-*`");
    expect(result.canonicalPrompt).toContain("language switch");
    expect(result.canonicalPrompt).toContain("Blog/content workflows stay single-language");
  });

  it("can inject a bilingual contract into an existing English workflow draft", () => {
    const draft = ["# Canonical Website Generation Prompt", "## 1. Overview", "Build a bilingual site."].join("\n");
    const enriched = ensureCanonicalPromptHasBilingualContractForTesting(draft, "bilingual", "zh");

    expect(enriched).toContain("## 7.35 Bilingual Experience Contract");
    expect(enriched).toContain("Default visible language: Chinese (zh-CN)");
    expect(enriched).toContain("exactly one active language at a time");
    expect(containsWorkflowCjk(enriched)).toBe(false);
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

  it("keeps freeform profile facts in template draft fallback instead of collapsing to a generic portfolio shell", async () => {
    const requirement = [
      "我做过华为、微信、HelloTalk 等产品与增长相关工作，过去长期服务 K12 和教育信息化场景。",
      "近年主要做 DevOps、AI 数字人 SaaS、学校增长与运营体系，服务过 5000+ 学校，并带来 300% 到 800% 的价值提升。",
      "希望站点以个人 portfolio + blog 形式呈现这些经历、方法论、代表项目和结果。",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "portfolio",
        targetAudience: ["consumers"],
        primaryVisualDirection: "warm-soft",
        pageStructure: { mode: "multi", planning: "auto" },
        functionalRequirements: ["none"],
        primaryGoal: ["brand_trust"],
        language: "bilingual",
        brandLogo: { mode: "text_mark" },
        contentSources: ["new_site"],
        customNotes: "",
      }),
      "```",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.draftMode).toBe("template");
    expect(result.canonicalPrompt).toContain("Business/content details");
    expect(result.canonicalPrompt).toContain("HelloTalk");
    expect(result.canonicalPrompt).toContain("DevOps");
    expect(result.canonicalPrompt).toContain("SaaS");
    expect(result.canonicalPrompt).toContain("K12");
    expect(result.canonicalPrompt).toContain("5000");
    expect(result.canonicalPrompt).toContain("300");
    expect(result.canonicalPrompt).toContain("800");
    expect(result.canonicalPrompt).toContain("Bilingual Experience Contract");
    expect(result.canonicalPrompt).not.toContain("Brand: Logo");
  });

  it("keeps chinese resume facts and confirmed blog IA instead of falling back to generic company pages", async () => {
    const requirement = [
      "生成前必填信息已提交：",
      "- 网站类型: 作品集",
      "- 内容来源: 新建站，无现成内容",
      "- 业务/内容补充: 我想做个个人简历网站，我的个人经历如下，做AI方向，需要3篇blog体现我的价值 beihuang 职业履历亮点 华为研发体系变革专家 微信全球化进程奠基者 云领天下 来画科技 HelloTalk K12 5000+学校 AI数字人SaaS 300%-800%的商业价值跃升。",
      "- 页面数与页面结构: 多页网站: 博客",
      "- 核心转化目标: 建立品牌信任",
      "- 网站语言: 中英双语",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "portfolio",
          targetAudience: ["consumers"],
          contentSources: ["new_site"],
          primaryVisualDirection: "warm-soft",
          pageStructure: { mode: "multi", planning: "manual", pages: ["blog"] },
          functionalRequirements: ["none"],
          primaryGoal: ["brand_trust"],
          language: "bilingual",
          brandLogo: { mode: "text_mark" },
          customNotes:
            "我想做个个人简历网站，我的个人经历如下，做AI方向，需要3篇blog体现我的价值 beihuang 职业履历亮点 华为研发体系变革专家 微信全球化进程奠基者 云领天下 来画科技 HelloTalk K12 5000+学校 AI数字人SaaS 300%-800%的商业价值跃升。",
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.promptControlManifest.routes).toEqual(["/", "/blog"]);
    if (result.knowledgeProfile) {
      expect(result.knowledgeProfile.suggestedPages.map((page) => page.route)).toEqual(["/", "/blog"]);
      expect(result.knowledgeProfile.offerings.join(" ")).toMatch(/AI|DevOps|SaaS|HelloTalk|K12/i);
      expect(result.knowledgeProfile.proofPoints.join(" ")).toMatch(/5000|300|800/i);
    }
    expect(result.canonicalPrompt).toContain("HelloTalk");
    expect(result.canonicalPrompt).toContain("Bilingual Experience Contract");
    expect(result.canonicalPrompt).not.toContain("/about/index.html");
    expect(result.canonicalPrompt).not.toContain("/products/index.html");
    expect(result.canonicalPrompt).not.toContain("/cases/index.html");
    expect(result.canonicalPrompt).not.toContain("/contact/index.html");
  });

  it("keeps /blog in the prompt plan when natural-language requirement asks for three blog posts without a requirement form", async () => {
    const requirement =
      "我想做个个人简历网站，我的个人经历如下，做AI方向，需要3篇blog体现我的价值。beihuang，华为研发体系变革专家，微信全球化进程奠基者，HelloTalk CTO，来画科技 CTO，云领天下 CTO。";

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.promptControlManifest.routes).toEqual(["/", "/blog"]);
    expect(result.promptControlManifest.files).toEqual(
      expect.arrayContaining(["/index.html", "/blog/index.html", "/styles.css", "/script.js"]),
    );
    expect(result.canonicalPrompt).toContain("/blog/index.html");
  });
});
