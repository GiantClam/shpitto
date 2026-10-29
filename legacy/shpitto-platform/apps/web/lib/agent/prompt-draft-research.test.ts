import { describe, expect, it } from "vitest";
import { buildRequirementSlots } from "./chat-orchestrator";
import { afterEach, vi } from "vitest";
import {
  buildSourceEnrichmentPlanForTesting,
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
    expect(result.canonicalPrompt).toContain("Discovery Brief Lock");
    expect(result.promptControlManifest.websiteSurfaceMode).toBe("corporate-b2b-site");
    expect(result.discoveryBrief.surfaceMode).toBe("corporate-b2b-site");
    expect(result.canonicalPrompt).toContain("Evidence Brief Contract");
    expect(result.canonicalPrompt).toContain("Prompt Budget Envelope");
    expect(result.canonicalPrompt).toContain("Shared Shell/Footer Contract");
    expect(result.canonicalPrompt).toContain("Do not reduce inner-page footers to a single copyright line");
    expect(result.canonicalPrompt).toContain("overflow-wrap: anywhere");
    expect(result.canonicalPrompt).not.toContain("/downloads/index.html");
  });

  it("preserves explicit required pages and corporate surface selection for manufacturer requirement forms", async () => {
    const requirement = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        contentSources: ["existing_domain", "industry_research"],
        targetAudience: ["enterprise_buyers", "overseas_customers"],
        primaryVisualDirection: "industrial-b2b",
        pageStructure: {
          mode: "multi",
          planning: "manual",
          pages: [
            "Home",
            "Product Families",
            "Factory Capability",
            "Quality and Certifications",
            "Customized Services",
            "Contact",
          ],
        },
        functionalRequirements: ["customer_inquiry_form", "contact_form"],
        primaryGoal: ["lead_generation"],
        language: "en",
        brandLogo: { mode: "uploaded", referenceText: "Use the uploaded VBUY logo lockup." },
        customNotes:
          "Build an English website for VBUY Textile, a custom towel manufacturer and export supplier. Required pages: Home, Product Families, Factory Capability, Quality and Certifications, Customized Services, Contact. The primary goal is lead generation and contact inquiries.",
      }),
      "```",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
    });

    expect(result.websiteSurfaceMode).toBe("corporate-b2b-site");
    expect(result.discoveryBrief.surfaceMode).toBe("corporate-b2b-site");
    expect(result.promptControlManifest.routes).toEqual([
      "/",
      "/product-families",
      "/factory-capability",
      "/quality-and-certifications",
      "/customized-services",
      "/contact",
    ]);
    expect(result.promptControlManifest.navLabels).toEqual([
      "Home",
      "Product Families",
      "Factory Capability",
      "Quality and Certifications",
      "Customized Services",
      "Contact",
    ]);
    expect(result.promptControlManifest.routes).not.toContain("/products");
    expect(result.promptControlManifest.routes).not.toContain("/custom-solutions");
    expect(result.promptControlManifest.routes).not.toContain("/contact-the-primary-goal-is-lead-generation-and-contact-inquiries");
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
    expect(contract.navLabels).toEqual([
      "Home",
      "Creation",
      "Construction",
      "Certification",
      "Advocacy",
      "Research",
      "Information",
      "Downloads",
    ]);
    expect(contract.routes).not.toContain("/custom-solutions");
    expect(
      contract.pageIntents.find((page) => page.route === "/casux-research-center")?.purpose,
    ).toContain("research, standards, or evidence collection route");
    expect(
      contract.pageIntents.find((page) => page.route === "/casux-information-platform")?.purpose,
    ).toContain("public information library or institutional materials directory");
    expect(
      contract.pageIntents.find((page) => page.route === "/downloads")?.purpose,
    ).toContain("Do not stage the first screen as a generic split hero");
    expect(contract.websiteSurfaceMode).toBe("content-hub-site");
    expect(contract.discoveryBrief?.surfaceMode).toBe("content-hub-site");
  });

  it("specializes source-derived primary route intents so sibling pages do not collapse into one split-hero family", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded planning materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Homepage", contentInputs: [] },
        { route: "/casux-creation", title: "CASUX Creation", purpose: "Creation", contentInputs: [] },
        { route: "/casux-construction", title: "CASUX Construction", purpose: "Construction", contentInputs: [] },
        { route: "/casux-advocacy", title: "CASUX Advocacy", purpose: "Advocacy", contentInputs: [] },
        { route: "/case-studies", title: "Case Studies", purpose: "Case Studies", contentInputs: [] },
      ],
      contentGaps: [],
      summary: "",
    });

    expect(contract.pageIntents.find((page) => page.route === "/casux-creation")?.purpose).toContain(
      "narrative and content-architecture route",
    );
    expect(contract.pageIntents.find((page) => page.route === "/casux-construction")?.purpose).toContain(
      "implementation and execution route",
    );
    expect(contract.pageIntents.find((page) => page.route === "/casux-advocacy")?.purpose).toContain(
      "coalition, participation, or action-framework route",
    );
    expect(contract.pageIntents.find((page) => page.route === "/case-studies")?.purpose).toContain(
      "evidence-led case route",
    );
  });

  it("keeps source-derived homepage intents away from entry-point wording", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded planning materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Institutional overview.", contentInputs: [] },
        { route: "/casux-information-platform", title: "CASUX Information Platform", purpose: "Information platform.", contentInputs: [] },
      ],
      contentGaps: [],
      summary: "",
    });

    const homeIntent = contract.pageIntents.find((page) => page.route === "/")?.purpose || "";
    expect(homeIntent).not.toContain("routes visitors into the source-defined sections");
    expect(homeIntent).not.toContain("primary landing page");
    expect(homeIntent).toMatch(/institutional overview|official homepage|brand overview/i);
    expect(homeIntent).toMatch(/mission|trust scope|primary capabilities|proof/i);
    expect(homeIntent).toMatch(/split hero|right-side media panel|equal-column copy\/media/i);
  });

  it("persists docs-knowledge discovery brief data for documentation-style prompts", async () => {
    const requirement = "Create a developer documentation portal with guides, API reference, tutorials, and FAQs.";
    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
    });

    expect(result.websiteSurfaceMode).toBe("docs-knowledge-site");
    expect(result.discoveryBrief.surfaceMode).toBe("docs-knowledge-site");
    expect(result.discoveryBrief.routes).toContain("/");
    expect(result.discoveryBrief.confirmationStatus).toBe("needs_confirmation");
    expect(result.discoveryBrief.missingFields).toContain("visualDirectionId");
    expect(result.discoveryBrief.assumptions?.join("\n")).toContain("prompt-adaptive");
    expect(result.canonicalPrompt).toContain("websiteSurfaceMode: docs-knowledge-site");
    expect(result.canonicalPrompt).toContain("confirmationStatus: needs_confirmation");
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
    expect(contract.pageIntents.find((page) => page.route === "/resources")?.purpose).toContain(
      "public information library or institutional materials directory",
    );
  });

  it("keeps collection route purposes stable without nested legacy wording", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Homepage", contentInputs: [] },
        {
          route: "/casux-research-center",
          title: "CASUX Research Center",
          purpose:
            "Treat Research as a source-backed content collection route with a route-owned collection opening, curated summaries or entries, and clear onward paths. Do not default to a legacy split-hero template or invent /blog/{slug}/ detail pages unless the source material explicitly requires them.",
          contentInputs: [],
        },
      ],
      contentGaps: [],
      summary: "",
    });

    const purpose = contract.pageIntents.find((page) => page.route === "/casux-research-center")?.purpose || "";
    expect(purpose).toContain("research, standards, or evidence collection route");
    expect(purpose).not.toContain("Treat Treat");
    expect(purpose).not.toContain("Deliver a route-specific page for Deliver");
  });

  it("adds route-owned collection copy classes when generating a fresh collection purpose", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Homepage", contentInputs: [] },
        { route: "/casux-information-platform", title: "CASUX Information Platform", purpose: "Information hub", contentInputs: [] },
      ],
      contentGaps: [],
      summary: "",
    });

    const purpose = contract.pageIntents.find((page) => page.route === "/casux-information-platform")?.purpose || "";
    expect(purpose).toContain("public information library or institutional materials directory");
    expect(purpose).toContain("information-platform-lead");
    expect(purpose).toContain("collection-title");
    expect(purpose).toContain("hero-aside");
  });

  it("specializes research collections as single-surface index routes instead of generic collection pages", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Homepage", contentInputs: [] },
        { route: "/casux-research-center", title: "CASUX Research Center", purpose: "Research hub", contentInputs: [] },
      ],
      contentGaps: [],
      summary: "",
    });

    const purpose = contract.pageIntents.find((page) => page.route === "/casux-research-center")?.purpose || "";
    expect(purpose).toContain("research, standards, or evidence collection route");
    expect(purpose).toContain("research-index-lead");
    expect(purpose).toContain("hero-aside");
  });

  it("keeps specialized route purposes stable without duplicated Treat prefixes", () => {
    const contract = buildPromptControlManifestFromKnowledgeProfileForTesting("Generate from uploaded materials.", {
      sourceMode: "uploaded_files",
      domains: [],
      sources: [],
      brand: { name: "CASUX" },
      audience: [],
      offerings: [],
      differentiators: [],
      proofPoints: [],
      suggestedPages: [
        { route: "/", title: "Home", purpose: "Homepage", contentInputs: [] },
        {
          route: "/casux-creation",
          title: "CASUX Creation",
          purpose:
            "Treat Casux Creation as a narrative and content-architecture route. Open with a route-owned creation masthead, explain how messaging or content structure is shaped, then move into reusable frameworks, proof, and a clear next action. Do not fall back to a generic split hero with an aside panel.",
          contentInputs: [],
        },
      ],
      contentGaps: [],
      summary: "",
    });

    const purpose = contract.pageIntents.find((page) => page.route === "/casux-creation")?.purpose || "";
    expect(purpose).toContain("Treat Casux Creation as a narrative and content-architecture route.");
    expect(purpose).not.toContain("Treat Treat");
    expect((purpose.match(/Treat Casux Creation/gi) || []).length).toBe(1);
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
    expect(prompt).toContain("## 7.2 Structured Source Facts");
    expect(prompt).toContain("Internal Generation Input");
    expect(prompt).toContain("standards document card component");
    expect(prompt).toContain("scoring visualization component");
    expect(prompt).not.toContain("multilingual source excerpt available");
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
    expect(result.structuredSourceFacts?.pageCandidates.map((page) => page.route)).toEqual([
      "/",
      "/casux-creation",
      "/casux-construction",
      "/casux-certification",
      "/casux-advocacy",
      "/casux-research-center",
      "/casux-information-platform",
    ]);
    expect(result.promptBudgetEnvelope?.truncationPolicy).toBe("page_scoped_drop");
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
    expect(result.promptControlManifest.navLabels.every((label) => !/\s/.test(label))).toBe(true);
    expect(result.canonicalPrompt).toContain("## 7.25 Source Material Appendix");
    expect(result.canonicalPrompt).toContain("## 7.1 Prompt Budget Envelope");
    expect(result.canonicalPrompt).toContain("## 7.2 Structured Source Facts");
    expect(result.canonicalPrompt).toContain("### Homepage Opening Contract");
    expect(result.canonicalPrompt).toContain("Route / is the official homepage and umbrella brand or institutional overview");
    expect(result.canonicalPrompt).toContain("Do not describe the homepage as a gateway, entry point, route map");
    expect(result.canonicalPrompt).toContain("keep the first screen institution-led");
    expect(result.canonicalPrompt).toContain("Do not implement the first screen as a split hero");
    expect(result.canonicalPrompt).toContain("Prefer a stacked or asymmetrical institutional masthead");
    expect(result.canonicalPrompt).toContain("CASUX");
    expect(result.canonicalPrompt).toContain("Main navigation");
    expect(result.canonicalPrompt).toContain("scoring visualization component");
    expect(result.canonicalPrompt).not.toContain("multilingual source excerpt available");
    expect(containsWorkflowCjk(result.canonicalPrompt)).toBe(false);
    expect(isWorkflowArtifactEnglishSafe(result.canonicalPrompt)).toBe(true);
    expect(result.canonicalPrompt).not.toContain("/custom-solutions/index.html");
  });

  it("clips oversized requirement text deterministically instead of dumping the full raw source into the prompt", async () => {
    const rawRequirement = [
      "Build an English website for Northstar Labs with Home, Solutions, Research, Contact.",
      "Primary audience: enterprise platform teams evaluating AI workflow governance.",
      "The following imported planning dump is intentionally oversized and should not be copied wholesale into the internal prompt artifact.",
      "BEGIN_OVERSIZED_SOURCE",
      "ALPHA-001".repeat(500),
      "MIDDLE-SOURCE-BLOCK-SHOULD-BE-CLIPPED",
      "BETA-002".repeat(500),
      "KEEP-TAIL-CONTEXT enterprise rollout contact northstar@example.com",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: rawRequirement,
      slots: buildRequirementSlots(rawRequirement),
    });

    expect(result.canonicalPrompt).toContain("[requirement clipped");
    expect(result.canonicalPrompt).toContain("Requirement budget:");
    expect(result.canonicalPrompt).toContain("KEEP-TAIL-CONTEXT enterprise rollout contact northstar@example.com");
    expect(result.promptBudgetEnvelope?.canonicalRequirementChars).toBeGreaterThanOrEqual(2200);
  });

  it("replays the vbuy session input and uses the explicit URL as a source without inventing a /www route", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevLlmEnabled = process.env.CHAT_DRAFT_LLM_ENABLED;
    const requirement = "提取https://www.vbuytextile.com/网站的信息、页面结构和图片，做一个毛巾的渠道外贸电商公司的官网";
    const pageHtml = [
      "<!doctype html>",
      "<html><body>",
      "<nav>",
      '<a href="/">Home</a>',
      '<a href="/about-us">About Us</a>',
      '<a href="/products">Products</a>',
      '<a href="/contact-us">Contact Us</a>',
      "</nav>",
      "<main>",
      "<h1>VBuy Textile</h1>",
      "<h2>Wholesale Towels for Global Distribution</h2>",
      "<p>Channel-focused foreign trade textile supplier for hotel, retail, and promotional towel programs.</p>",
      "</main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("google.serper.dev/search")) {
        return new Response(JSON.stringify({ organic: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://www.vbuytextile.com/") {
        return new Response(pageHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      (process.env as any).NODE_ENV = "development";
      process.env.SERPER_API_KEY = "test-serper-key";
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";

      const result = await buildPromptDraftWithResearch({
        requirementText: requirement,
        slots: buildRequirementSlots(requirement),
      });

      expect(result.usedWebSearch).toBe(true);
      expect(result.promptControlManifest.routeSource).toBe("uploaded_source_page_plan");
      expect(result.promptControlManifest.routes).toEqual(["/", "/about-us", "/products", "/contact-us"]);
      expect(result.promptControlManifest.routes).not.toContain("/www");
      expect(result.promptControlManifest.navLabels).toEqual(["Home", "About Us", "Products", "Contact Us"]);
      expect(result.knowledgeProfile?.sources.some((source) => source.type === "url_page")).toBe(true);
      expect(result.knowledgeProfile?.sources.some((source) => source.type === "domain")).toBe(true);
      expect(result.knowledgeProfile?.suggestedPages.map((page) => page.route)).toEqual([
        "/",
        "/about-us",
        "/products",
        "/contact-us",
      ]);
      expect(result.canonicalPrompt).toContain("/about-us/index.html");
      expect(result.canonicalPrompt).toContain("/contact-us/index.html");
      expect(result.canonicalPrompt).not.toContain("/www/index.html");
      expect(result.canonicalPrompt).not.toContain('"navLabel": "Www"');
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
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

  it("uses only high-confidence source-defined pages when url navigation contains utility tokens", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevLlmEnabled = process.env.CHAT_DRAFT_LLM_ENABLED;
    const requirement = "Use https://www.vbuytextile.com/ as the main source to generate the company website.";
    const pageHtml = [
      "<!doctype html>",
      "<html><body>",
      "<nav>",
      '<a href="/">Home</a>',
      '<a href="/products">Products</a>',
      '<a href="/whatsapp">WhatsApp</a>',
      '<a href="/odm">ODM</a>',
      '<a href="/contact-us">Contact Us</a>',
      "</nav>",
      "<main>",
      "<h1>VBuy Textile</h1>",
      "<p>Channel-focused foreign trade textile supplier.</p>",
      "</main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("google.serper.dev/search")) {
        return new Response(JSON.stringify({ organic: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://www.vbuytextile.com/") {
        return new Response(pageHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      (process.env as any).NODE_ENV = "development";
      process.env.SERPER_API_KEY = "test-serper-key";
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";

      const result = await buildPromptDraftWithResearch({
        requirementText: requirement,
        slots: buildRequirementSlots(requirement),
      });

      expect(result.promptControlManifest.routeSource).toBe("uploaded_source_page_plan");
      expect(result.promptControlManifest.routes).toEqual(["/", "/products", "/contact-us"]);
      expect(result.promptControlManifest.routes).not.toContain("/whatsapp");
      expect(result.promptControlManifest.routes).not.toContain("/odm");
      expect(result.knowledgeProfile?.suggestedPages.some((page) => page.route === "/whatsapp")).toBe(false);
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevSerperKey === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = prevSerperKey;
      if (prevLlmEnabled === undefined) delete process.env.CHAT_DRAFT_LLM_ENABLED;
      else process.env.CHAT_DRAFT_LLM_ENABLED = prevLlmEnabled;
    }
  });

  it("does not auto-extract URL or web-search when user input is already sufficient", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevLlmEnabled = process.env.CHAT_DRAFT_LLM_ENABLED;
    const requirement = [
      "Brand: Northstar Robotics",
      "Audience: procurement teams, factory buyers",
      "Pages: Home | Products | Case Studies | Contact",
      "Primary goal: lead generation",
      "Style: industrial, blue-gray, trustworthy",
      "Language: English",
      "Content source: existing domain",
      "Reference URL: https://example.com",
    ].join("\n");
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch should not be called when input is sufficient");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      (process.env as any).NODE_ENV = "development";
      process.env.SERPER_API_KEY = "test-serper-key";
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";

      const result = await buildPromptDraftWithResearch({
        requirementText: requirement,
        slots: buildRequirementSlots(requirement),
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.knowledgeProfile).toBeUndefined();
      expect(result.promptControlManifest.routeSource).toBe("prompt_draft_page_plan");
      expect(result.promptControlManifest.routes).not.toContain("/www");
      expect(result.canonicalPrompt).not.toContain("/www/index.html");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevSerperKey === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = prevSerperKey;
      if (prevLlmEnabled === undefined) delete process.env.CHAT_DRAFT_LLM_ENABLED;
      else process.env.CHAT_DRAFT_LLM_ENABLED = prevLlmEnabled;
    }
  });

  it("builds a source enrichment plan that defers URL/search when input is sufficient", () => {
    const requirement = [
      "Brand: Northstar Robotics",
      "Audience: procurement teams, factory buyers",
      "Pages: Home | Products | Case Studies | Contact",
      "Primary goal: lead generation",
      "Style: industrial, blue-gray, trustworthy",
      "Language: English",
      "Content source: existing domain",
      "Reference URL: https://example.com",
    ].join("\n");

    const plan = buildSourceEnrichmentPlanForTesting({ requirementText: requirement });

    expect(plan.shouldUseUrlExtraction).toBe(false);
    expect(plan.shouldUseDomainSources).toBe(false);
    expect(plan.shouldUseWebSearch).toBe(false);
  });

  it("allows the caller to hard-disable web search for a clean source-bounded lane", () => {
    const requirement = "Build a premium AI studio website with strong process, proof, and contact sections.";

    const plan = buildSourceEnrichmentPlanForTesting({
      requirementText: requirement,
      allowWebSearch: false,
    });

    expect(plan.shouldUseWebSearch).toBe(false);
  });

  it("supports forcing a clean single-page route contract for the MVP lane", async () => {
    const requirement =
      "Create a clean one-page website for Northstar Labs. The homepage should include hero, services, selected work, process, testimonials, and contact. Use English only.";

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      disableWebSearch: true,
      routePolicy: "force_root_single_page",
    });

    expect(result.usedWebSearch).toBe(false);
    expect(result.promptControlManifest.routes).toEqual(["/"]);
    expect(result.promptControlManifest.files).toEqual(["/styles.css", "/script.js", "/index.html"]);
    expect(result.discoveryBrief.routes).toEqual(["/"]);
    expect(result.canonicalPrompt).toContain('"/index.html"');
    expect(result.canonicalPrompt).not.toContain('"/contact/index.html"');
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

  it("injects consultation capture and full footer destination contracts when inquiry capture is required", async () => {
    const requirement = [
      "需求表单已提交：",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "company",
          pageStructure: { mode: "multi", pages: ["home", "information-platform", "about"] },
          functionalRequirements: ["contact_form"],
          primaryGoal: ["lead_generation"],
          language: "zh-CN",
          brandLogo: { mode: "text_mark" },
        },
        null,
        2,
      ),
      "```",
      "Include a real consultation form with name, organization, email, topic, and message fields.",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
    });

    expect(result.canonicalPrompt).toContain("### Shared Shell Destination Contract");
    expect(result.canonicalPrompt).toContain("homepage footer must enumerate the full confirmed shared destination set");
    expect(result.canonicalPrompt).toContain("### Consultation Capture Contract");
    expect(result.canonicalPrompt).toContain("This route is an approved host for the required consultation intake");
    expect(result.canonicalPrompt).toContain("Search/filter controls, CTA buttons, and mailto links do not satisfy this requirement");
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
    expect(result.canonicalPrompt).toContain("Chinese-first i18n-ready generation strategy");
    expect(result.canonicalPrompt).toContain("/i18n/messages.en.json");
    expect(result.canonicalPrompt).toContain("/i18n/messages.zh-CN.json");
    expect(result.canonicalPrompt).toContain("Chinese visible copy only");
    expect(result.canonicalPrompt).toContain("Blog/content workflows stay single-language");
    expect(result.promptControlManifest.files).toEqual(
      expect.arrayContaining(["/i18n/messages.en.json", "/i18n/messages.zh-CN.json"]),
    );
  });

  it("switches to a translation-driven locale registry contract for multilingual websites", async () => {
    const requirement = [
      "生成前必填信息已提交：",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "company",
          pageStructure: { mode: "multi", pages: ["home", "about", "contact"] },
          functionalRequirements: ["contact_form"],
          primaryGoal: ["brand_trust"],
          language: "multilingual",
          supportedLocales: ["zh-CN", "en", "ja", "fr"],
          defaultLocale: "zh-CN",
        },
        null,
        2,
      ),
      "```",
      "做一个多语言官网，支持 zh-CN、en、ja、fr，默认中文，后续翻译走 catalog，不要为每种语言重建页面。",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.canonicalPrompt).toContain("## 7.35 Locale & Translation Contract");
    expect(result.canonicalPrompt).toContain("/i18n/locales.json");
    expect(result.canonicalPrompt).toContain("/i18n/messages.zh-CN.json");
    expect(result.canonicalPrompt).toContain("do not generate one route tree per locale");
    expect(result.promptControlManifest.files).toEqual(
      expect.arrayContaining(["/i18n/locales.json", "/i18n/messages.zh-CN.json"]),
    );
    expect(result.promptControlManifest.localeConfig).toMatchObject({
      mode: "multilingual",
      defaultLocale: "zh-CN",
      locales: ["zh-CN", "en", "ja", "fr"],
      translationDriven: true,
    });
  });

  it("keeps Chinese-first single-language sites free of bilingual shell requirements", async () => {
    const requirement = [
      "生成前必填信息已提交：",
      "[Requirement Form]",
      "```json",
      JSON.stringify(
        {
          siteType: "company",
          pageStructure: { mode: "multi", pages: ["home", "contact"] },
          functionalRequirements: ["contact_form"],
          primaryGoal: ["brand_trust"],
          language: "zh-CN",
        },
        null,
        2,
      ),
      "```",
      "做一个中文官网，不要双语，不要语言切换。",
    ].join("\n");

    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots: buildRequirementSlots(requirement),
      displayLocale: "zh",
    });

    expect(result.promptControlManifest.files).not.toContain("/i18n/messages.en.json");
    expect(result.promptControlManifest.files).not.toContain("/i18n/messages.zh-CN.json");
    expect(result.canonicalPrompt).toContain("single-language Chinese-first");
    expect(result.canonicalPrompt).toContain("Do not emit an EN/ZH switch");
  });

  it("can inject a bilingual contract into an existing English workflow draft", () => {
    const draft = ["# Canonical Website Generation Prompt", "## 1. Overview", "Build a bilingual site."].join("\n");
    const enriched = ensureCanonicalPromptHasBilingualContractForTesting(draft, "bilingual", "zh");

    expect(enriched).toContain("## 7.35 Bilingual Experience Contract");
    expect(enriched).toContain("Chinese-first i18n-ready generation strategy");
    expect(enriched).toContain("render Chinese visible copy only");
    expect(enriched).toContain("/i18n/messages.zh-CN.json");
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

  it("normalizes crazyroute draft model aliases before template fallback", async () => {
    const snapshot = {
      NODE_ENV: process.env.NODE_ENV,
      CHAT_DRAFT_PROVIDER: process.env.CHAT_DRAFT_PROVIDER,
      CHAT_DRAFT_MODEL: process.env.CHAT_DRAFT_MODEL,
      CHAT_DRAFT_LLM_ENABLED: process.env.CHAT_DRAFT_LLM_ENABLED,
      PPTOKEN_API_KEY: process.env.PPTOKEN_API_KEY,
      AIBERM_API_KEY: process.env.AIBERM_API_KEY,
      CRAZYROUTE_API_KEY: process.env.CRAZYROUTE_API_KEY,
    };

    try {
      (process.env as any).NODE_ENV = "development";
      process.env.CHAT_DRAFT_PROVIDER = "crazyrouter";
      process.env.CHAT_DRAFT_MODEL = "openai/gpt-5.4-mini";
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";
      delete process.env.PPTOKEN_API_KEY;
      delete process.env.AIBERM_API_KEY;
      process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

      const result = await buildPromptDraftWithResearch({
        requirementText: "build a product website",
        slots: buildRequirementSlots("build a product website"),
      });

      expect(result.provider).toBe("crazyroute");
      expect(result.model).toBe("gpt-5.4-mini");
      expect(result.draftMode).toBe("template");
      expect(String(result.fallbackReason || "")).not.toContain("openai/");
    } finally {
      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
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
