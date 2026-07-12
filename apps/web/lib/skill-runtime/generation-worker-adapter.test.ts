import { describe, expect, it } from "vitest";

import {
  buildGenerationUnitInputFromRouteContract,
  createSkillExecutionGenerationWorkerAdapter,
  createRouteUnitSmokeAdapter,
  createStaticGenerationWorkerAdapter,
  runGenerationUnitsWithAdapter,
} from "./generation-worker-adapter";
import type { SkillExecutionAdapter } from "./skill-execution-adapter";
import type { RouteUnitContractSummary } from "./website-design-spec";
import type { LocalDecisionPlan } from "./decision-layer";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset";

describe("generation-worker-adapter", () => {
  it("defines a bounded internal adapter surface for route-unit execution", async () => {
    const adapter = createStaticGenerationWorkerAdapter({
      id: "shpitto-tool-skill-runtime",
      capabilities: ["route-unit", "route-unit", "html"],
      runUnit: async (input) => ({
        unitId: input.unitId,
        status: "passed",
        files: [{ path: "/index.html", content: "<!doctype html><html><body></body></html>", type: "text/html" }],
        summary: `generated ${input.targetFiles.join(", ")}`,
      }),
    });

    const result = await adapter.runUnit({
      unitId: "homepage",
      route: "/",
      targetFiles: ["/index.html"],
      prompt: "Generate the homepage.",
      context: { websiteSurfaceMode: "docs-knowledge-site" },
    });

    expect(adapter.capabilities).toEqual(["route-unit", "html"]);
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("/index.html");
  });

  it("builds adapter-ready route-unit input from the route contract summary", () => {
    const summary: RouteUnitContractSummary = {
      route: "/products",
      navLabel: "Products",
      pageKind: "intent",
      owner: "brand",
      routeContract: ["route=/products", "navLabel=Products", "purpose=Show product range"],
      inheritedTerminology: ["corporate-b2b-site", "procurement"],
      inheritedTokens: ["#2563EB", "Inter"],
      inheritedSeedSkillIds: ["open-design-web-prototype"],
      openingFamily: "catalog",
      openingTopology: "catalog lead band -> assortment navigator -> comparison/specification row",
      mediaPlan: ["- slot_owner: catalog-lead proof slot"],
      mediaResources: [
        {
          resourceId: "products-media-01",
          route: "/products",
          slotOwner: "catalog-lead proof slot",
          imagePurpose: "product-family proof",
          placementBand: "inside the opening catalog lead",
          preferredRatio: "4:3, 5:4, or square",
        },
      ],
    };

    const input = buildGenerationUnitInputFromRouteContract({
      summary,
      context: { websiteSurfaceMode: "corporate-b2b-site" },
    });

    expect(input).toMatchObject({
      unitId: "route-products",
      route: "/products",
      targetFiles: ["/products/index.html", "/styles.css", "/script.js"],
    });
    expect(input.prompt).toContain("Generate the /products route unit.");
    expect(input.context).toMatchObject({
      openingFamily: "catalog",
      websiteSurfaceMode: "corporate-b2b-site",
      mediaResources: [
        expect.objectContaining({
          resourceId: "products-media-01",
          slotOwner: "catalog-lead proof slot",
        }),
      ],
    });
  });

  it("dispatches route units through the static smoke adapter", async () => {
    const summary: RouteUnitContractSummary = {
      route: "/",
      navLabel: "Home",
      pageKind: "home",
      owner: "brand",
      routeContract: ["route=/", "navLabel=Home", "purpose=Home"],
      inheritedTerminology: ["docs-knowledge-site"],
      inheritedTokens: ["#111827"],
      inheritedSeedSkillIds: ["docs-knowledge-foundation"],
      openingFamily: "homepage",
      openingTopology: "docs workspace masthead -> search/index rail",
      mediaPlan: ["- slot_owner: docs-reference-workspace"],
      mediaResources: [
        {
          resourceId: "home-hero-01",
          route: "/",
          slotOwner: "docs-reference-workspace",
          imagePurpose: "reference context",
          placementBand: "inside a docs workspace panel",
          preferredRatio: "16:10",
        },
      ],
    };

    const report = await runGenerationUnitsWithAdapter(createRouteUnitSmokeAdapter(), [
      buildGenerationUnitInputFromRouteContract({ summary, targetFiles: ["/index.html", "/styles.css"] }),
    ]);

    expect(report).toMatchObject({
      adapterId: "shpitto-route-unit-smoke",
      passed: true,
      issues: [],
    });
    expect(report.results[0]?.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
    expect(report.results[0]?.files[0]?.content).toContain("Static route-unit smoke output");
  });

  it("bridges route-unit execution through an existing skill execution adapter", async () => {
    const decision = {
      routes: ["/products"],
      navLabels: ["Products"],
      pageBlueprints: [],
    } as unknown as LocalDecisionPlan;
    const skillAdapter: SkillExecutionAdapter = {
      skillId: "website-generation-workflow",
      buildRequiredFileChecklist: () => ["/products/index.html"],
      resolveMaxToolRounds: () => 1,
      planRoundObjective: (_round, missingFiles) => ({
        targetFiles: missingFiles,
        instruction: "Generate the target route.",
        strictSingleTarget: true,
      }),
      formatTargetPageContract: () => "Route contract",
      buildToolRoundPrompt: (params) =>
        [
          `adapter:${params.objective.targetFiles.join(",")}`,
          `style:${params.styleName}`,
          `requirement:${params.requirementText}`,
        ].join("\n"),
      validateAndNormalizeRequiredFilesWithQa: () => ({
        files: [],
        qaSummary: {
          totalRoutes: 0,
          passedRoutes: 0,
          averageScore: 0,
          totalRetries: 0,
          retriesAllowed: 0,
          antiSlopIssueCount: 0,
          categories: [],
        },
        qaRecords: [],
      }),
    };
    const adapter = createSkillExecutionGenerationWorkerAdapter({
      skillAdapter,
      decision,
      stylePreset: DEFAULT_STYLE_PRESET,
      styleName: "Bridge Smoke",
      styleReason: "Adapter bridge test.",
      requirementText: "Generate Products.",
      totalRounds: 1,
      invokeRound: async ({ input, prompt, objective }) => ({
        unitId: input.unitId,
        status: "passed",
        files: objective.targetFiles.map((targetFile) => ({
          path: targetFile,
          content: prompt,
          type: "text/html",
        })),
        summary: `bridge generated ${objective.targetFiles.join(", ")}`,
      }),
    });
    const result = await adapter.runUnit({
      unitId: "route-products",
      route: "/products",
      targetFiles: ["/products/index.html"],
      prompt: "Generate Products.",
      context: {},
    });

    expect(adapter.capabilities).toEqual(["route-unit", "skill-execution-adapter", "website-generation-workflow"]);
    expect(result.status).toBe("passed");
    expect(result.files[0]).toMatchObject({ path: "/products/index.html" });
    expect(result.files[0]?.content).toContain("adapter:/products/index.html");
    expect(result.files[0]?.content).toContain("style:Bridge Smoke");
  });
});
