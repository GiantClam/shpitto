import { describe, expect, it } from "vitest";
import {
  buildRequirementSlots,
  buildRequirementSpec,
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
        designTheme: ["professional"],
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
        designTheme: ["professional"],
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
});
