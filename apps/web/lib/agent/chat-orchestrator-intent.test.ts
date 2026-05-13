import { describe, expect, it } from "vitest";
import {
  buildRequirementSlots,
  buildRequirementSpec,
  composeStructuredPrompt,
  decideChatIntent,
  validateRequiredRequirementSlots,
  type ConversationStage,
} from "./chat-orchestrator";

function decide(text: string, stage: ConversationStage) {
  const slots = buildRequirementSlots(
    "LC-CNC industrial manufacturer website with existing domain content source, Home About Products Cases Contact, blue style, English audience, CTA contact, deploy cloudflare",
  );
  return decideChatIntent({
    userText: text,
    stage,
    slots,
    isWebsiteSkill: true,
  });
}

describe("chat orchestrator intent", () => {
  it("routes explicit generate to generate", () => {
    const decision = decide("开始生成网站", "drafting");
    expect(decision.intent).toBe("generate");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes preview refinements to refine_preview", () => {
    const decision = decide("把主色改成蓝色", "previewing");
    expect(decision.intent).toBe("refine_preview");
    expect(decision.refineScope).toBe("patch");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("treats missing blog detail page requests as structural refine on preview", () => {
    const decision = decide("三篇blog缺少内容页面，请补充", "previewing");
    expect(decision.intent).toBe("refine_preview");
    expect(decision.reason).toBe("explicit-structural-refine-on-preview");
    expect(decision.refineScope).toBe("structural");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("treats add-page requests as structural refine on preview", () => {
    const decision = decide("新增一个 pricing 页面，其他页面不动", "previewing");
    expect(decision.intent).toBe("refine_preview");
    expect(decision.reason).toBe("explicit-structural-refine-on-preview");
    expect(decision.refineScope).toBe("structural");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("treats single-route rewrite requests as route regenerate refine", () => {
    const decision = decide("重写 /about 页面，其他页面不动", "previewing");
    expect(decision.intent).toBe("refine_preview");
    expect(decision.reason).toBe("explicit-route-regenerate-on-preview");
    expect(decision.refineScope).toBe("route_regenerate");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes deployed refinements to refine_deployed", () => {
    const decision = decide("上线版本标题改成 LC-CNC Global", "deployed");
    expect(decision.intent).toBe("refine_deployed");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes deploy intent to deploy when baseline exists", () => {
    const decision = decide("deploy to cloudflare", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes real Chinese Cloudflare deploy intent to deploy when baseline exists", () => {
    const decision = decide("\u90e8\u7f72\u5230 Cloudflare", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes Chinese deploy and online verification phrasing to deploy", () => {
    const decision = decide("\u90e8\u7f72\u5230 Cloudflare\uff0c\u9a8c\u8bc1\u7ebf\u4e0a\u7f51\u7ad9\u53ef\u7528", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.reason).toBe("explicit-deploy-intent");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes natural English deploy phrasing to deploy", () => {
    const decision = decide("deploy the latest generated website to Cloudflare", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.reason).toBe("explicit-deploy-intent");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes Chinese Cloudflare deploy intent to deploy when baseline exists", () => {
    const decision = decide("部署到 Cloudflare", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes concrete English multi-page website requests to generate", () => {
    const userText =
      "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact. Keep shared styles and script across all pages, and ensure navigation links work.";
    const slots = buildRequirementSlots(userText);
    const decision = decideChatIntent({
      userText,
      stage: "drafting",
      slots,
      isWebsiteSkill: true,
    });

    expect(decision.intent).toBe("generate");
    expect(decision.reason).toBe("explicit-concrete-website-generation-request");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("returns clarify for deploy request without baseline", () => {
    const decision = decide("deploy now", "drafting");
    expect(decision.intent).toBe("clarify");
    expect(decision.shouldCreateTask).toBe(false);
  });

  it("extracts structured requirements to fill slots beyond simple keyword checks", () => {
    const text = [
      "Brand: Northstar Robotics",
      "Pages: Home | Products | Case Studies | Contact",
      "Audience: procurement teams, engineers",
      "Style: professional, high contrast",
      "CTA: request a quote",
      "Language: English",
    ].join("\n");
    const spec = buildRequirementSpec(text);
    const slots = buildRequirementSlots(text);

    expect(spec.brand).toBe("Northstar Robotics");
    expect(spec.pages).toContain("Case Studies");
    expect(spec.targetAudience).toContain("procurement teams");
    expect(slots.find((slot) => slot.key === "sitemap-pages")?.filled).toBe(true);
    expect(slots.find((slot) => slot.key === "target-audience")?.filled).toBe(true);
  });

  it("does not treat 解决方案 prose as an explicit 方案 page", () => {
    const text = [
      "为 K12 学校提供全场景解决方案。",
      "需要 3 篇 blog 文章。",
      "网站页面保留 Home、Blog、Contact。",
    ].join("");
    const spec = buildRequirementSpec(text);

    expect(spec.pages).toContain("blog");
    expect(spec.pages).not.toContain("方案");
    expect(spec.pageStructure?.pages || []).not.toContain("方案");
  });

  it("filters function options to currently supported website capabilities", () => {
    const text = "Features: login, payment, inquiry form, language switch";
    const spec = buildRequirementSpec(text);
    const slots = buildRequirementSlots(text);
    const functionSlot = slots.find((slot) => slot.key === "functional-requirements");

    expect(spec.functionalRequirements).toEqual(["customer_inquiry_form"]);
    expect(functionSlot?.options?.map((option) => option.value)).toEqual([
      "customer_inquiry_form",
      "contact_form",
      "search_filter",
      "downloads",
      "none",
    ]);
  });

  it("requires a content source strategy before prompt draft generation", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        secondaryVisualTags: ["professional"],
        pageStructure: { mode: "multi", planning: "auto" },
        functionalRequirements: ["contact_form"],
        primaryGoal: ["lead_generation"],
        language: "en",
        brandLogo: { mode: "text_mark" },
      }),
      "```",
    ].join("\n");
    const validation = validateRequiredRequirementSlots(buildRequirementSlots(text));

    expect(validation.passed).toBe(false);
    expect(validation.missingRequiredSlots).toContain("内容来源");
  });

  it("normalizes domain and upload signals as content sources", () => {
    const spec = buildRequirementSpec("Build a company website for example.com with uploaded files and industry research.");

    expect(spec.contentSources).toEqual(["existing_domain", "uploaded_files", "industry_research"]);
  });

  it("provides localized option labels without combined bilingual display text", () => {
    const slots = buildRequirementSlots("Build a company website with Home and Contact pages.");
    const pageSlot = slots.find((slot) => slot.key === "sitemap-pages");
    const homeOption = pageSlot?.options?.find((option) => option.value === "home");

    expect(homeOption?.label).toBe("首页");
    expect(homeOption?.i18n?.zh).toBe("首页");
    expect(homeOption?.i18n?.en).toBe("Home");
    expect(homeOption?.label).not.toContain("/");
  });

  it("accepts auto page planning inside multi-page mode as a completed required page slot", () => {
    const text = [
      "需求表单已提交：",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        contentSources: ["new_site"],
        customNotes: "Industrial company website with enough business details for draft planning.",
        targetAudience: ["enterprise_buyers"],
        secondaryVisualTags: ["professional"],
        pageStructure: { mode: "multi", planning: "auto" },
        functionalRequirements: ["contact_form"],
        primaryGoal: ["lead_generation"],
        language: "zh-CN",
        brandLogo: { mode: "text_mark" },
      }),
      "```",
    ].join("\n");
    const spec = buildRequirementSpec(text);
    const slots = buildRequirementSlots(text);
    const validation = validateRequiredRequirementSlots(slots);

    expect(spec.pageStructure?.mode).toBe("multi");
    expect(spec.pageStructure?.planning).toBe("auto");
    expect(slots.find((slot) => slot.key === "sitemap-pages")?.filled).toBe(true);
    expect(validation.passed).toBe(true);
  });

  it("keeps an explicit user-selected visual direction above recommendations", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        primaryVisualDirection: "heritage-manufacturing",
        secondaryVisualTags: ["minimal"],
        primaryGoal: ["brand_trust"],
        contentSources: ["existing_domain"],
        customNotes: "Precision CNC manufacturing website with certifications and process storytelling.",
      }),
      "```",
    ].join("\n");
    const spec = buildRequirementSpec(text);
    const prompt = composeStructuredPrompt(text, buildRequirementSlots(text));

    expect(spec.primaryVisualDirection).toBe("heritage-manufacturing");
    expect(spec.visualDecisionSource).toBe("user_explicit");
    expect(spec.secondaryVisualTags).toContain("minimal");
    expect(prompt).toContain("Primary visual direction: Heritage manufacturing / craft");
    expect(prompt).not.toContain("Default Visual Inclination (System Recommended)");
  });

  it("includes the selected design system inspiration and preflight checklist in the canonical prompt", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        primaryVisualDirection: "modern-minimal",
        designSystemInspiration: {
          id: "linear-like",
          title: "Linear-like workspace",
          category: "Product design system",
          summary: "Precise software-native surfaces with tight spacing and a restrained palette.",
          swatches: ["#0f172a", "#f8fafc", "#2563eb"],
          sourcePath: "skills/design-systems/design-md/linear-like.md",
          source: "workflow-skill",
        },
        secondaryVisualTags: ["minimal"],
        primaryGoal: ["brand_trust"],
        contentSources: ["existing_domain"],
        customNotes: "Precision CNC manufacturing website with certifications and process storytelling.",
      }),
      "```",
    ].join("\n");
    const prompt = composeStructuredPrompt(text, buildRequirementSlots(text));

    expect(prompt).toContain("Design system inspiration");
    expect(prompt).toContain("Linear-like workspace (Product design system)");
    expect(prompt).toContain("Generation Preflight Checklist");
    expect(prompt).toContain("Use the selected design system inspiration as the visual source of truth");
  });

  it("injects a recommended visual inclination only when the user did not explicitly choose a theme", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        primaryGoal: ["lead_generation"],
        contentSources: ["existing_domain"],
        customNotes: "Precision CNC manufacturing website with machine specs and certifications.",
      }),
      "```",
    ].join("\n");
    const spec = buildRequirementSpec(text);
    const prompt = composeStructuredPrompt(text, buildRequirementSlots(text));

    expect(spec.primaryVisualDirection).toBe("industrial-b2b");
    expect(spec.secondaryVisualTags).toEqual([]);
    expect(spec.visualDecisionSource).toBe("user_recommended_default");
    expect(prompt).toContain("Default Visual Inclination (System Recommended)");
    expect(prompt).toContain("Recommended direction: Industrial B2B / precision (industrial-b2b)");
    expect(prompt).toContain("Confirmed Visual Direction Contract");
    expect(prompt).toContain("### Industrial B2B / precision (industrial-b2b)");
    expect(prompt).toContain(
      "Apply this system-recommended direction as the active visual contract for this generation unless a later explicit user theme selection overrides it.",
    );
    expect(prompt).toContain("system-recommended default");
  });

  it("uses structured primary visual direction fields as the only explicit theme decision input", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        primaryVisualDirection: "industrial-b2b",
        secondaryVisualTags: ["minimal", "trustworthy"],
        primaryGoal: ["lead_generation"],
        contentSources: ["existing_domain"],
      }),
      "```",
    ].join("\n");
    const spec = buildRequirementSpec(text);

    expect(spec.primaryVisualDirection).toBe("industrial-b2b");
    expect(spec.secondaryVisualTags).toEqual(expect.arrayContaining(["minimal", "trustworthy"]));
    expect(spec.secondaryVisualTags).not.toContain("warm-soft");
    expect(spec.visualDecisionSource).toBe("user_explicit");
  });

  it("filters direction ids out of structured secondary visual tags", () => {
    const text = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        primaryVisualDirection: "heritage-manufacturing",
        secondaryVisualTags: ["industrial-b2b", "minimal", "trustworthy"],
        primaryGoal: ["brand_trust"],
        contentSources: ["existing_domain"],
      }),
      "```",
    ].join("\n");
    const spec = buildRequirementSpec(text);

    expect(spec.primaryVisualDirection).toBe("heritage-manufacturing");
    expect(spec.secondaryVisualTags).toEqual(expect.arrayContaining(["minimal", "trustworthy"]));
    expect(spec.secondaryVisualTags).not.toContain("industrial-b2b");
    expect(spec.visualDecisionSource).toBe("user_explicit");
  });

  it("preserves substantive freeform profile context when a later form submission is generic", () => {
    const freeformProfile = [
      "我做过华为、微信、HelloTalk 等产品与增长相关工作，过去长期服务 K12 和教育信息化场景。",
      "近年主要做 DevOps、AI 数字人 SaaS、学校增长与运营体系，服务过 5000+ 学校。",
      "我希望网站把这些经历、方法论、代表项目和结果讲清楚，例如 300% 到 800% 的增长价值提升。",
      "站点方向是个人 portfolio，兼顾 blog 内容沉淀。",
    ].join("");
    const requirementForm = [
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
    const aggregated = [freeformProfile, requirementForm].join("\n");

    const spec = buildRequirementSpec(aggregated, [freeformProfile, requirementForm]);

    expect(spec.businessContext).toContain("华为");
    expect(spec.businessContext).toContain("HelloTalk");
    expect(spec.businessContext).toContain("5000+");
    expect(spec.customNotes).toContain("DevOps");
    expect(spec.customNotes).toContain("300%");
    expect(spec.siteType).toBe("portfolio");
    expect(spec.locale).toBe("bilingual");
  });
});
