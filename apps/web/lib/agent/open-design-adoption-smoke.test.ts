import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPromptDraftWithResearch } from "./prompt-draft-research";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset";
import { buildLocalDecisionPlan } from "../skill-runtime/decision-layer";
import { selectWebsiteSeedSkillsForIntent } from "../skill-runtime/project-skill-loader";
import {
  buildWebsiteSkillToolRoundPromptForAdapter,
  renderWebsiteSeedSkillSidecarGuidance,
} from "../skill-runtime/skill-tool-executor";
import {
  buildRouteUnitContractSummary,
  buildWebsiteDesignSpecMarkdown,
  type RouteUnitContractSummary,
} from "../skill-runtime/website-design-spec";
import {
  buildGenerationUnitInputFromRouteContract,
  createRouteUnitSmokeAdapter,
  runGenerationUnitsWithAdapter,
} from "../skill-runtime/generation-worker-adapter";

process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED ||= "0";
process.env.CHAT_DRAFT_LLM_ENABLED ||= "0";
process.env.SHPITTO_OD_SURFACE_MODE ||= "1";
process.env.SHPITTO_OD_DISCOVERY_BRIEF ||= "1";
process.env.SHPITTO_OD_ROUTE_UNITS ||= "1";
process.env.SKILL_TOOL_MAX_SEED_SKILLS ||= "4";

type SmokeScenario = {
  id: string;
  expectedSurfaceMode: string;
  expectedSeedId?: string;
  forbiddenRoutes?: string[];
  requirementText: string;
};

const scenarios: SmokeScenario[] = [
  {
    id: "corporate-b2b",
    expectedSurfaceMode: "corporate-b2b-site",
    requirementText:
      "Build a premium B2B corporate website for AsterFlow Industrial AI. Audience: enterprise operations leaders. Routes: /, /solutions, /products, /cases, /contact. The site must keep visual consistency, factual copy, strong proof sections, and a polished responsive system.",
  },
  {
    id: "docs-knowledge",
    expectedSurfaceMode: "docs-knowledge-site",
    expectedSeedId: "docs-knowledge-foundation",
    forbiddenRoutes: ["/blog", "/archive"],
    requirementText:
      "Build a documentation and knowledge site for Meridian API Platform. Audience: developers and technical leads. Routes: /, /docs, /guides, /api-reference, /support. Prioritize structured docs navigation, route-owned openings, reference clarity, and no blog/archive assumptions.",
  },
  {
    id: "content-hub",
    expectedSurfaceMode: "content-hub-site",
    expectedSeedId: "content-hub-foundation",
    requirementText:
      "Build a resource and research hub for Civic Standards Lab. Audience: policy researchers and implementation teams. Routes: /, /research, /standards, /resources, /contact. Use collection-first homepage and interior route contracts with consistent terminology and varied openings.",
  },
];

function routeToHtmlPath(route: string): string {
  const normalized = String(route || "/").trim() || "/";
  if (normalized === "/") return "/index.html";
  return `${normalized.replace(/\/+$/g, "")}/index.html`;
}

function safeFileName(value: string): string {
  return String(value || "scenario")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

describe("Open Design adoption smoke", () => {
  it("builds locked prompts, design specs, route units, and sidecar guidance for the first rollout surfaces", async () => {
    const outputRoot = path.resolve(process.cwd(), ".tmp", "open-design-adoption-smoke", "latest");
    await fs.mkdir(outputRoot, { recursive: true });
    const report = [];

    for (const scenario of scenarios) {
      const draft = await buildPromptDraftWithResearch({
        requirementText: scenario.requirementText,
        slots: [],
        timeoutMs: 1_000,
      });
      const routes = draft.promptControlManifest.routes || [];
      const files = draft.promptControlManifest.files || [];
      const decision = buildLocalDecisionPlan({
        messages: [{ role: "user", content: draft.canonicalPrompt }],
        phase: "conversation",
        workflow_context: {
          canonicalPrompt: draft.canonicalPrompt,
          sourceRequirement: draft.canonicalPrompt,
          promptControlManifest: draft.promptControlManifest,
          websiteSurfaceMode: draft.websiteSurfaceMode,
          websiteDiscoveryBrief: draft.discoveryBrief,
        },
      } as any);
      const selectedSeedSkills = await selectWebsiteSeedSkillsForIntent({
        requirementText: scenario.requirementText,
        routes,
        maxSkills: 4,
      });
      const sidecarGuidance = await renderWebsiteSeedSkillSidecarGuidance(selectedSeedSkills);
      const designSpec = buildWebsiteDesignSpecMarkdown({
        decision,
        requirementText: draft.canonicalPrompt,
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: draft.websiteSurfaceMode,
        discoveryBrief: draft.discoveryBrief,
        selectedSeedSkillIds: selectedSeedSkills.map((item) => item.id),
        designHit: {
          id: "open-design-adoption-smoke",
          name: "Open Design Adoption Smoke",
          design_desc: "Deterministic smoke preset for route contracts and sidecar guidance.",
        } as any,
      });
      const routeUnits = routes
        .map((route) =>
          buildRouteUnitContractSummary(
            {
              decision,
              requirementText: draft.canonicalPrompt,
              stylePreset: DEFAULT_STYLE_PRESET,
              websiteSurfaceMode: draft.websiteSurfaceMode,
              discoveryBrief: draft.discoveryBrief,
            },
            route,
          ),
        )
        .filter((unit): unit is RouteUnitContractSummary => Boolean(unit));
      const routeUnitDispatch = await runGenerationUnitsWithAdapter(
        createRouteUnitSmokeAdapter(),
        routeUnits.map((summary) =>
          buildGenerationUnitInputFromRouteContract({
            summary,
            context: { websiteSurfaceMode: draft.websiteSurfaceMode },
          }),
        ),
      );
      const roundPrompt = buildWebsiteSkillToolRoundPromptForAdapter({
        round: 0,
        totalRounds: Math.max(4, routes.length + 2),
        decision,
        stylePreset: DEFAULT_STYLE_PRESET,
        styleName: "Open Design Adoption Smoke",
        styleReason: "Deterministic replay preset.",
        loadedSkillIds: [],
        emittedFiles: [],
        requiredMissing: files,
        objective: {
          targetFiles: ["/styles.css", "/script.js"],
          instruction: "Emit shared assets for the locked route-unit contract.",
          strictSingleTarget: false,
        },
        requirementText: draft.canonicalPrompt,
      });

      const scenarioDir = path.join(outputRoot, safeFileName(scenario.id));
      await fs.mkdir(scenarioDir, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(scenarioDir, "canonical-prompt.md"), draft.canonicalPrompt, "utf8"),
        fs.writeFile(path.join(scenarioDir, "website_design_spec.md"), designSpec, "utf8"),
        fs.writeFile(path.join(scenarioDir, "sidecar-guidance.md"), sidecarGuidance || "(none)\n", "utf8"),
        fs.writeFile(path.join(scenarioDir, "round-01-prompt.md"), roundPrompt, "utf8"),
        fs.writeFile(path.join(scenarioDir, "route-units.json"), JSON.stringify(routeUnits, null, 2), "utf8"),
        fs.writeFile(path.join(scenarioDir, "route-unit-dispatch.json"), JSON.stringify(routeUnitDispatch, null, 2), "utf8"),
      ]);

      const requiredHtmlFiles = routes.map(routeToHtmlPath);
      const selectedIds = selectedSeedSkills.map((item) => item.id);
      const checks = {
        surfaceMode: draft.websiteSurfaceMode === scenario.expectedSurfaceMode,
        manifestFiles: ["/styles.css", "/script.js", ...requiredHtmlFiles].every((file) => files.includes(file)),
        discoveryBrief:
          draft.discoveryBrief?.surfaceMode === scenario.expectedSurfaceMode &&
          Array.isArray(draft.discoveryBrief.routes) &&
          draft.discoveryBrief.routes.length > 0,
        designSpec:
          designSpec.includes(`website_surface_mode: ${scenario.expectedSurfaceMode}`) &&
          designSpec.includes("site_generator_mode: hybrid") &&
          designSpec.includes("Open Design owns visual direction and module rhythm") &&
          designSpec.includes("HTML Anything owns concrete HTML/CSS template discipline") &&
          designSpec.includes("shpitto_ui_theme_boundary: Shpitto Studio and platform UI keep the app theme") &&
          designSpec.includes(`selected_frontend_seed_skills: ${selectedIds.join(", ")}`) &&
          designSpec.includes("## 6. Route Specifications"),
        routeUnits: routeUnits.length === routes.length && routeUnits.every((unit: any) => unit.routeContract?.length > 0),
        routeUnitDispatch:
          routeUnitDispatch.passed &&
          routeUnitDispatch.results.length === routes.length &&
          routeUnitDispatch.results.every((result, index) => result.unitId === `route-${routes[index] === "/" ? "home" : routes[index].replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-")}`),
        noForbiddenRoutes: (scenario.forbiddenRoutes || []).every((route) => !routes.includes(route)),
        sidecarGuidance: scenario.expectedSeedId
          ? selectedIds.includes(scenario.expectedSeedId) && sidecarGuidance.includes("example-backed HTML contract")
          : sidecarGuidance.length > 0,
        hybridSeedCoverage:
          scenario.expectedSeedId === "docs-knowledge-foundation"
            ? selectedIds.includes("docs-reference-template")
            : scenario.expectedSeedId === "content-hub-foundation"
              ? selectedIds.includes("content-resource-template")
              : true,
      };

      report.push({
        id: scenario.id,
        passed: Object.values(checks).every(Boolean),
        surfaceMode: draft.websiteSurfaceMode,
        routes,
        files,
        selectedSeedSkills: selectedIds,
        routeUnitDispatch: {
          adapterId: routeUnitDispatch.adapterId,
          passed: routeUnitDispatch.passed,
          unitCount: routeUnitDispatch.results.length,
          issues: routeUnitDispatch.issues,
        },
        outputDir: scenarioDir,
        checks,
      });

      expect(checks, scenario.id).toEqual({
        surfaceMode: true,
        manifestFiles: true,
        discoveryBrief: true,
        designSpec: true,
        routeUnits: true,
        routeUnitDispatch: true,
        noForbiddenRoutes: true,
        sidecarGuidance: true,
        hybridSeedCoverage: true,
      });
    }

    await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  }, 30_000);
});
