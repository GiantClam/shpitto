import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  buildShpittoOpenCodeBundle,
  isProductizedBaselineSkillId,
  shouldUseOpenCodeForSkill,
} from "./website-contract";
import { selectAiImageToolBaselineSelection } from "../skill-runtime/product-baseline-contract.ts";

describe("opencode website contract", () => {
  it("recognizes productized baseline website skills", () => {
    expect(isProductizedBaselineSkillId("build-marketing-site")).toBe(true);
    expect(isProductizedBaselineSkillId("build-b2b-site")).toBe(true);
    expect(isProductizedBaselineSkillId("build-ai-image-tool")).toBe(true);
    expect(isProductizedBaselineSkillId("website-generation-workflow")).toBe(false);
  });

  it("defaults productized website skills to the opencode execution lane", () => {
    const previous = process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
    delete process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;

    expect(shouldUseOpenCodeForSkill("build-marketing-site")).toBe(true);
    expect(shouldUseOpenCodeForSkill("build-ai-image-tool")).toBe(true);
    expect(shouldUseOpenCodeForSkill("website-generation-workflow")).toBe(false);

    if (previous === undefined) delete process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION;
    else process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION = previous;
  });

  it("builds a normalized request and contract bundle from workflow state", () => {
    const bundle = buildShpittoOpenCodeBundle({
      skillId: "build-b2b-site",
      projectRoot: "D:/tmp/shpitto-opencode-job",
      state: {
        messages: [new HumanMessage("Build a B2B site for Meridian Supply with products, cases, and contact routes.")],
        workflow_context: {
          sourceRequirement:
            "Build a B2B site for Meridian Supply with Home, Products, Cases, About, and Contact.",
          promptControlManifest: {
            routes: ["/", "/products", "/cases", "/about", "/contact"],
          },
          preferredLocale: "en",
          requirementSpec: {
            companyName: "Meridian Supply",
            industry: "industrial components",
            targetAudience: ["procurement teams", "distributors"],
            primaryGoal: ["lead generation"],
            customNotes: "Focus on supply readiness and response speed.",
          },
          selectedSeedSkillIds: ["industrial-b2b-foundation", "precision-catalog-template"],
          selectedSeedSkillManifest: {
            selected: [
              { id: "industrial-b2b-foundation", source: "imported-open-design", reason: "procurement proof system" },
            ],
          },
          designSystemId: "studio-editorial",
          designSystemName: "Studio Editorial",
          stylePreset: {
            primaryColor: "#0f766e",
          },
          generationContract: {
            routeUnitContracts: [
              { route: "/", navLabel: "Home", pageKind: "home", routeContract: ["route=/"] },
              { route: "/products", navLabel: "Products", pageKind: "intent", routeContract: ["route=/products"] },
            ],
          },
        },
        sitemap: ["/", "/products", "/cases", "/about", "/contact"],
      } as any,
    });

    expect(bundle.request.skillId).toBe("build-b2b-site");
    expect(bundle.request.taskClass).toBe("baseline_generation");
    expect(bundle.request.templateContext.templateId).toBe("b2b-lead-gen-site");
    expect(bundle.request.structuredInputs.companyName).toBe("Meridian Supply");
    expect(bundle.request.structuredInputs.routes).toEqual(["/", "/products", "/cases", "/about", "/contact"]);
    expect(bundle.routeContract.requiredRoutes).toEqual(["/", "/products", "/cases", "/about", "/contact"]);
    expect(bundle.selectedFoundations.designSystemName).toBe("Studio Editorial");
    expect(bundle.selectedSeeds.selected[0]?.id).toBe("industrial-b2b-foundation");
    expect(bundle.deploymentTarget.framework).toBe("nextjs-app-router");
  });

  it("builds an AI image tool product baseline with default product routes", () => {
    const bundle = buildShpittoOpenCodeBundle({
      skillId: "build-ai-image-tool",
      projectRoot: "D:/tmp/shpitto-opencode-ai-tool",
      state: {
        messages: [new HumanMessage("Build an AI image tool product with a generator, examples, pricing, and plugin-ready workflow.")],
        workflow_context: {
          sourceRequirement: "Build an AI image tool baseline with generator, gallery, pricing, and FAQ routes.",
          preferredLocale: "en",
          productBaselineSelection: selectAiImageToolBaselineSelection(),
          requirementSpec: {
            productName: "FluxKrea Free",
            primaryGoal: ["launch an AI image tool baseline"],
          },
          selectedSeedSkillIds: ["ai-tool-product-foundation", "fluxkreafree-product-template"],
          selectedSeedSkillManifest: {
            selected: [{ id: "fluxkreafree-product-template", source: "imported-open-design", reason: "AI image product baseline" }],
          },
        },
        sitemap: [],
      } as any,
    });

    expect(bundle.request.skillId).toBe("build-ai-image-tool");
    expect(bundle.request.templateContext.templateFamily).toBe("ai-image-tool-platform");
    expect(bundle.request.structuredInputs.productName).toBe("FluxKrea Free");
    expect(bundle.request.structuredInputs.industry).toBe("AI image generation or creative tooling");
    expect(bundle.request.structuredInputs.routes).toEqual([
      "/",
      "/flux-ai",
      "/flux-schnell",
      "/krea-alternative",
      "/pricing",
      "/flux-prompt-generator",
      "/blog",
      "/sign-in",
      "/sign-up",
      "/app",
      "/app/generate",
      "/app/history",
      "/app/giftcode",
      "/app/order",
      "/privacy-policy",
      "/terms-of-use",
    ]);
    expect(bundle.templateManifest.templateId).toBe("ai-image-tool-starter");
    expect(bundle.routeContract.requiredRoutes).toEqual([
      "/",
      "/flux-ai",
      "/flux-schnell",
      "/krea-alternative",
      "/pricing",
      "/flux-prompt-generator",
      "/blog",
      "/sign-in",
      "/sign-up",
      "/app",
      "/app/generate",
      "/app/history",
      "/app/giftcode",
      "/app/order",
      "/privacy-policy",
      "/terms-of-use",
    ]);
    expect(bundle.request.structuredInputs.routes).not.toContain("/products");
    expect(bundle.request.structuredInputs.routes).not.toContain("/gallery");
    expect(bundle.selectedSeeds.selected).toEqual([
      expect.objectContaining({
        id: "fluxkreafree-product-template",
        source: "shpitto",
      }),
    ]);
    expect(bundle.routeContract.sharedShellContract).toEqual(
      expect.arrayContaining([
        "Marketing header must follow config/marketing.ts instead of exposing every declared route.",
        "App shell navigation must follow config/dashboard.ts and stay separate from visitor-facing marketing navigation.",
      ]),
    );
  });

  it("keeps the ai-image baseline seed locked even if the workflow manifest is polluted by imported website seeds", () => {
    const bundle = buildShpittoOpenCodeBundle({
      skillId: "build-ai-image-tool",
      projectRoot: "D:/tmp/shpitto-opencode-ai-tool-polluted",
      state: {
        messages: [new HumanMessage("Build an AI image tool baseline.")],
        workflow_context: {
          sourceRequirement: "Build an AI image tool baseline.",
          productBaselineSelection: selectAiImageToolBaselineSelection(),
          selectedSeedSkillManifest: {
            selected: [
              { id: "content-resource-template", source: "imported-html-anything", reason: "incorrect carry-over" },
              { id: "content-hub-foundation", source: "imported-open-design", reason: "incorrect carry-over" },
            ],
          },
        },
        sitemap: [],
      } as any,
    });

    expect(bundle.request.templateContext.seeds).toContain("fluxkreafree-product-template");
    expect(bundle.selectedSeeds.selected).toEqual([
      expect.objectContaining({
        id: "fluxkreafree-product-template",
        source: "shpitto",
      }),
    ]);
  });
});
