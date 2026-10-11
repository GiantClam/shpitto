import { describe, expect, it } from "vitest";
import { buildPreparedWorkspaceBundle } from "../opencode-cli/nextjs-baseline.ts";
import { applyTranslationLane, resolveTranslationLanePlan } from "./translation-lane.ts";

function buildAiImageToolProjectArtifact() {
  const bundle = buildPreparedWorkspaceBundle({
    workspaceRoot: "D:/tmp/shpitto-ai-image-tool-i18n",
    request: {
      skillId: "build-ai-image-tool",
      taskClass: "baseline_generation",
      projectRoot: "D:/tmp/shpitto-ai-image-tool-i18n",
      userIntentSummary: "Launch the canonical AI image template baseline.",
      executionScope: "full-baseline",
      successCriteria: ["all required routes exist", "shared shell is preserved"],
      structuredInputs: {
        productName: "FluxKrea Free",
        industry: "AI image generation or creative tooling",
        targetAudience: ["creators", "AI makers"],
        primaryGoal: ["launch an AI image tool baseline"],
        locale: "en",
        routes: [
          "/",
          "/pricing",
          "/flux-prompt-generator",
          "/sign-in",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
      },
      templateContext: {
        templateId: "ai-image-tool-starter",
        siteType: "ai-image-tool-site",
        templateFamily: "ai-image-tool-platform",
        foundations: ["ai-tool-product-foundation"],
        seeds: ["fluxkreafree-product-template"],
      },
    },
    templateManifest: {
      templateId: "ai-image-tool-baseline-v1",
      templateVersion: "2026-06-29",
      templateFamily: "ai-image-tool-platform",
      siteType: "ai-image-tool-site",
      templateRoutes: [
        "/",
        "/pricing",
        "/flux-prompt-generator",
        "/sign-in",
        "/app",
        "/app/generate",
        "/app/history",
        "/app/giftcode",
        "/app/order",
        "/privacy-policy",
        "/terms-of-use",
      ],
    },
    routeContract: {
      requiredRoutes: [
        "/",
        "/pricing",
        "/flux-prompt-generator",
        "/sign-in",
        "/app",
        "/app/generate",
        "/app/history",
        "/app/giftcode",
        "/app/order",
        "/privacy-policy",
        "/terms-of-use",
      ],
      optionalRoutes: [],
      sharedShellContract: ["preserve shared nav", "preserve shared footer"],
      routeOwnershipNotes: [],
    },
    selectedFoundations: {
      designSystemName: "AI Tool Product Foundation",
    },
    selectedSeeds: {
      selected: [{ id: "fluxkreafree-product-template", source: "shpitto" }],
    },
    deploymentTarget: {
      target: "vercel",
      staticFirst: true,
      framework: "nextjs-app-router",
    },
  });

  const project = structuredClone(bundle.projectArtifact as Record<string, any>);
  project.staticSite.files.push({
    path: "/i18n/messages.en.json",
    type: "application/json",
    content: JSON.stringify(
      {
        "nav.home": "Home",
        "product.workspace.title": "Generate images",
        "product.history.title": "History",
        "product.billing.title": "Billing",
      },
      null,
      2,
    ),
  });
  return project;
}

describe("ai-image-tool i18n locale smoke", () => {
  it("adds a second locale without changing route coverage or route purpose", async () => {
    const project = buildAiImageToolProjectArtifact();
    const originalRoutes = project.pages.map((page: { path: string }) => page.path);

    const plan = resolveTranslationLanePlan({
      project,
      instructionText: "Generate locale catalogs for English and French.",
      workflowContext: {
        supportedLocales: ["en", "fr"],
        defaultLocale: "en",
        translationTargetLocales: ["fr"],
      },
    });

    expect(plan).not.toBeNull();
    const result = await applyTranslationLane({
      project,
      plan: plan!,
      translateCatalog: async ({ targetLocale, sourceMessages }) => ({
        translated: targetLocale === "fr",
        messages: {
          "nav.home": "Accueil",
          "product.workspace.title": "Generer des images",
          "product.history.title": sourceMessages["product.history.title"] || "History",
          "product.billing.title": sourceMessages["product.billing.title"] || "Billing",
        },
      }),
    });

    expect(result.validationReport.defaultLocale).toBe("en");
    expect(result.validationReport.supportedLocales).toEqual(["en", "fr"]);
    expect(result.validationReport.targetLocales).toEqual(["fr"]);
    expect(result.changedFiles).toEqual(
      expect.arrayContaining(["/i18n/locales.json", "/i18n/messages.fr.json"]),
    );
    expect(result.project.pages.map((page: { path: string }) => page.path)).toEqual(originalRoutes);
  });
});
