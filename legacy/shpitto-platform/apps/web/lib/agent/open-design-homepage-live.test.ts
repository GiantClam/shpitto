import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler";
import { buildPromptDraftWithResearch, type PromptControlManifest } from "./prompt-draft-research";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";
import { selectWebsiteGenerationTypeSkill } from "../skill-runtime/website-type-selector";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

process.env.SHPITTO_OD_SURFACE_MODE ||= "1";
process.env.SHPITTO_OD_DISCOVERY_BRIEF ||= "1";
process.env.SHPITTO_OD_ROUTE_UNITS ||= "1";
process.env.SKILL_TOOL_MAX_SEED_SKILLS ||= "4";
process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED ||= "0";
process.env.CHAT_DRAFT_LLM_ENABLED ||= "0";

const shouldRun =
  String(process.env.RUN_OPEN_DESIGN_HOMEPAGE_LIVE || "").trim() === "1" ||
  String(process.env.npm_lifecycle_event || "").trim() === "smoke:open-design-homepage:live";

const scenario = String(process.env.SHPITTO_OD_HOMEPAGE_SCENARIO || "docs").trim().toLowerCase();

const requirements: Record<string, string> = {
  corporate:
    "Build a premium B2B corporate homepage for AsterFlow Industrial AI. Audience: enterprise operations leaders evaluating automation partners. Homepage only. Keep the visual system polished, procurement-ready, content-specific, and consistent. Use proof, capabilities, customer evidence, and a strong contact CTA. Do not generate interior routes in this run.",
  docs:
    "Build a documentation and knowledge homepage for Meridian API Platform. Audience: developers and technical leads. Homepage only. Prioritize structured docs wayfinding, clear technical value, route-owned documentation opening, reference clarity, and a polished responsive design system. Do not add blog or archive behavior.",
  hub:
    "Build a resource and research hub homepage for Civic Standards Lab. Audience: policy researchers and implementation teams. Homepage only. Use a collection-first homepage with research, standards, resource navigation, consistent terminology, varied visual modules, and no blog or archive behavior.",
};

const expectedBrandSignals: Record<string, string> = {
  corporate: "AsterFlow Industrial AI",
  docs: "Meridian API Platform",
  hub: "Civic Standards Lab",
};

const homepagePurposes: Record<string, string> = {
  corporate:
    "Corporate B2B homepage smoke. Use an image-backed enterprise masthead, compact procurement proof row, unified capability/process band, customer evidence, and concise contact CTA. Avoid docs workspace chrome and content-hub archive shelves.",
  docs:
    "Docs/knowledge homepage smoke. Use a docs workspace/reference-index archetype: docs masthead, search or index rail, quickstart strip, guide stack, reference matrix, and compact support CTA. Avoid generic marketing hero/card/CTA rhythm, enterprise proof bands, and content-hub archive shelves.",
  hub:
    "Content-hub homepage smoke. Use an editorial/institutional collection-index archetype: institutional collection masthead, topic or collection shelves, standards/research ledger, resource index rows, and institutional CTA. Avoid generic marketing hero/card/CTA rhythm, docs workspace chrome, enterprise proof bands, and blog/archive behavior.",
};

function homepageOnlyManifest(scenarioKey: string): PromptControlManifest {
  return {
    schemaVersion: 1,
    promptKind: "canonical_website_prompt",
    routeSource: "prompt_draft_page_plan",
    routes: ["/"],
    navLabels: ["Home"],
    files: ["/styles.css", "/script.js", "/index.html"],
    pageIntents: [
      {
        route: "/",
        navLabel: "Home",
        purpose: homepagePurposes[scenarioKey] || homepagePurposes.docs!,
        source: "homepage_live_smoke",
      },
    ],
  };
}

function replaceFirstJsonBlock(prompt: string, manifest: PromptControlManifest): string {
  const text = String(prompt || "").trim();
  const block = `\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``;
  if (/```json\s*[\s\S]*?```/i.test(text)) {
    return text.replace(/```json\s*[\s\S]*?```/i, block);
  }
  return `${text}\n\n## Prompt Control Manifest\n${block}`;
}

function rewriteHomepageOnlyPromptSections(prompt: string, manifest: PromptControlManifest, scenarioKey: string): string {
  const fixedFiles = manifest.files.map((file) => `- ${file}`).join("\n");
  const purpose = manifest.pageIntents[0]?.purpose || "Homepage-only live smoke.";
  const surfaceOpening =
    scenarioKey === "hub"
      ? [
          "- Constraint: This is a homepage-only content-hub smoke. Do not create or link Archive, Blog, Research, Standards, Downloads, or any other interior route.",
          "- Required module: Institutional collection masthead using collection-owned classes, not `hero`, `hero-wrap`, `hero-grid`, `hero__body`, or `hero-aside` utilities.",
          "- Required module: Topic or collection shelves surfaced directly on the homepage.",
          "- Required module: Standards/research ledger and resource index rows with in-page anchors only.",
          "- Required module: Institutional CTA that links to `#contact`, `#resources`, or `/` only.",
        ]
      : scenarioKey === "docs"
        ? [
            "- Constraint: This is a homepage-only docs smoke. Do not create or link Archive, Blog, Research, Standards, Downloads, or any other interior route.",
            "- Required module: Docs workspace/reference-index opening using docs-owned classes, not `hero`, `hero-wrap`, `hero-grid`, `hero-copy`, or `hero-panel` utilities.",
            "- Required module: Search or index rail surfaced directly on the homepage.",
            "- Required module: Quickstart strip, guide stack, and reference matrix with in-page anchors only.",
            "- Required module: Compact support CTA that links to `#support`, `#reference`, or `/` only.",
          ]
      : [
            "- Constraint: This is a homepage-only corporate smoke. Do not create or link interior routes.",
            "- Required module: Enterprise masthead with a real image-backed hero, a compact procurement proof row, and one decisive buyer-facing value proposition.",
            "- Required module: Capability/process band and concise contact CTA with in-page anchors only.",
            "- Required module: A distinct top-level footer band with brand summary, buyer-relevant navigation, contact CTA, and copyright.",
            "- Footer copy rule: do not label footer groups with route-choreography or shell terms such as `site browsing path`, `where to start`, `shared shell`, `responsive layout`, or similar implementation labels.",
            "- Copy rule: visible homepage copy must speak about capabilities, outcomes, proof, or contact paths. It must not explain how to browse the site or describe the page's implementation mechanics.",
          ];
  const pageIntent = [
    "### Page-Level Intent Contract",
    "1. Home (/ -> /index.html)",
    `   - Page intent: ${purpose}`,
    "   - Route source: homepage_live_smoke",
    "   - Page kind: home",
    "   - Constraint: The Prompt Control Manifest route list is authoritative.",
    "   - Constraint: Navigation, footer, buttons, and CTAs must link only to `/` or in-page anchors in this run.",
    ...surfaceOpening.map((line) => `   ${line}`),
    "   - Derive page-specific sections, content depth, and interactions from the Canonical Website Prompt and source material.",
    "",
  ].join("\n");
  const discoveryLock = [
    "### Discovery Brief Lock",
    `- websiteSurfaceMode: ${scenarioKey === "hub" ? "content-hub-site" : scenarioKey === "docs" ? "docs-knowledge-site" : "corporate-b2b-site"}`,
    "- audience: prompt-adaptive",
    `- primaryGoal: ${purpose}`,
    "- routes: /",
    "- sourcePriority: user",
    "- localeMode: en",
    "- visualDirectionId: prompt-adaptive",
    "- immutableConstraints: homepage-only live smoke",
    "- confirmationStatus: confirmed",
    "",
  ].join("\n");
  const sharedShell = [
    "### Shared Shell Destination Contract",
    "- This homepage-only smoke has no interior shared-shell destinations.",
    "- Header, footer, buttons, and CTAs must link only to `/` or in-page anchors.",
    "- Do not expose Archive, Blog, Downloads, Research, Standards, or other unlisted destinations in nav, body CTAs, or footer.",
    "- The footer must render as a visually distinct top-level site footer band, not as a flat row of pills or a minimal legal line.",
    "- Do not use footer labels or helper copy such as `site browsing path`, `reading path`, `where to start`, `shared shell`, `responsive layout`, or other implementation-review wording.",
    "",
  ].join("\n");
  const layoutSafety = [
    "### Home Opening Layout Safety",
    "- The homepage opening must follow the surface-owned archetype from the Website Design Specification.",
    "- Docs and content-hub scenarios must not use generic marketing hero utility geometry such as `hero`, `hero-wrap`, `hero-grid`, `hero__body`, `hero-copy`, `hero-panel`, or `hero-aside`.",
    "- Text, cards, CTAs, and media must not overlap. Use responsive class-owned CSS rather than inline sizing fixes.",
    "",
  ].join("\n");

  return prompt
    .replace(
      /### Fixed Pages And File Output[\s\S]*?(?=### Prompt Control Manifest \(Machine Readable\))/i,
      `### Fixed Pages And File Output\n${fixedFiles}\n\n`,
    )
    .replace(/### Discovery Brief Lock[\s\S]*?(?=### Workflow Skill Contract)/i, discoveryLock)
    .replace(/### Page-Level Intent Contract[\s\S]*?(?=### Shared Shell Destination Contract)/i, pageIntent)
    .replace(/### Shared Shell Destination Contract[\s\S]*?(?=### Home Hero Layout Safety)/i, sharedShell)
    .replace(/### Home Hero Layout Safety[\s\S]*?(?=### Page Repetition Constraints)/i, layoutSafety);
}

function appendHomepageOnlyRouteOverride(prompt: string, scenarioKey: string): string {
  const archetype =
    scenarioKey === "hub"
      ? "Use editorial collection-index geometry with institutional collection masthead, shelves, ledgers, and resource rows. Do not use blog/archive behavior, `/archive` links, `/blog` links, or a right-side hero panel."
      : scenarioKey === "docs"
        ? "Use docs workspace/reference-index geometry with search/index rail, quickstart strip, guide stack, and reference matrix. Do not use blog/archive behavior, `/archive` links, `/blog` links, or a right-side hero panel."
        : "Use corporate enterprise masthead geometry with a real image-backed hero, procurement proof, a capability band, and a concise contact path. Keep the footer as a distinct site-footer band, and never use route-choreography or implementation labels such as `site browsing path`, `where to start`, `shared shell`, or `responsive layout`.";
  return `${prompt.trim()}

## Homepage-Only Route Override

The Prompt Control Manifest is authoritative for this live smoke. Generate exactly one route and exactly these files: \`/index.html\`, \`/styles.css\`, and \`/script.js\`. Ignore any earlier page briefs, route plans, blog/archive hints, or stale route lists that conflict with this manifest.

Homepage links must stay on \`/\` or in-page anchors unless the manifest adds another route. Do not link to \`/archive\`, \`/blog\`, \`/downloads\`, \`/research\`, \`/standards\`, or any other interior route in this homepage-only run.

${archetype}`;
}

async function materializeProject(project: any, siteDir: string) {
  await fs.rm(siteDir, { recursive: true, force: true });
  await fs.mkdir(siteDir, { recursive: true });
  const bundle = await Bundler.createBundle(project);
  for (const file of bundle.fileEntries) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const target = path.join(siteDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file.content || ""), "utf8");
  }
}

async function writeHomepageLiveOutputs(params: {
  scenario: string;
  project: any;
  canonicalPrompt: string;
  report: Record<string, unknown>;
}) {
  const scenarioRoot = path.resolve(process.cwd(), ".tmp", "open-design-homepage-live", params.scenario);
  const latestRoot = path.resolve(process.cwd(), ".tmp", "open-design-homepage-live", "latest");
  const roots = [scenarioRoot, latestRoot];

  for (const root of roots) {
    const siteDir = path.join(root, "site");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });
    await materializeProject(params.project, siteDir);
    const report = {
      ...params.report,
      output: {
        ...(params.report.output as Record<string, unknown>),
        projectJson: path.join(root, "project.json"),
        canonicalPrompt: path.join(root, "canonical-prompt.md"),
        siteDir,
        indexHtml: path.join(siteDir, "index.html"),
      },
    };
    await Promise.all([
      fs.writeFile(path.join(root, "project.json"), JSON.stringify(params.project, null, 2), "utf8"),
      fs.writeFile(path.join(root, "canonical-prompt.md"), params.canonicalPrompt, "utf8"),
      fs.writeFile(path.join(root, "report.json"), JSON.stringify(report, null, 2), "utf8"),
    ]);
  }
}

describe.skipIf(!shouldRun)("Open Design homepage live generation", () => {
  it("generates and materializes a provider-backed homepage", async () => {
    const requirementText = requirements[scenario] || requirements.docs!;

    const draft = await buildPromptDraftWithResearch({
      requirementText,
      slots: [],
      timeoutMs: 1_000,
    });
    const manifest = homepageOnlyManifest(scenario);
    const canonicalPrompt = appendHomepageOnlyRouteOverride(
      rewriteHomepageOnlyPromptSections(replaceFirstJsonBlock(draft.canonicalPrompt, manifest), manifest, scenario),
      scenario,
    );
    const selection = selectWebsiteGenerationTypeSkill({
      requirementText,
      routes: manifest.routes,
    });
    const discoveryBrief = {
      ...draft.discoveryBrief,
      surfaceMode: selection.surfaceMode,
      routes: manifest.routes,
    };

    const startedAt = Date.now();
    const summary = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage({ content: canonicalPrompt })],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          canonicalPrompt,
          sourceRequirement: canonicalPrompt,
          latestUserText: requirementText,
          latestUserTextRaw: requirementText,
          promptControlManifest: manifest,
          websiteSurfaceMode: selection.surfaceMode,
          websiteTypeSkillId: selection.skillId,
          websiteSiteType: selection.siteType,
          websiteDiscoveryBrief: discoveryBrief,
        },
        sitemap: {
          routes: manifest.routes,
          navLabels: manifest.navLabels,
        },
      } as any,
      timeoutMs: Math.max(240_000, Number(process.env.SHPITTO_OD_HOMEPAGE_TIMEOUT_MS || 600_000)),
      onStep: async (snapshot) => {
        console.log(
          `[open-design-homepage-live] step ${snapshot.stepIndex}/${snapshot.totalSteps} ${snapshot.stepKey} ${snapshot.status}`,
        );
      },
    });

    const project = (summary.state as any)?.site_artifacts;
    expect(project?.staticSite?.files?.length).toBeGreaterThan(0);
    const staticFiles = project?.staticSite?.files || [];
    const html = String(staticFiles.find((file: any) => String(file?.path || "") === "/index.html")?.content || "");
    const css = String(staticFiles.find((file: any) => String(file?.path || "") === "/styles.css")?.content || "");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain(expectedBrandSignals[scenario] || expectedBrandSignals.docs);
    expect(html).not.toMatch(/\bLorem ipsum\b|TODO|<template\b/i);
    expect(html).not.toMatch(/<a\b[^>]*\bhref=["']\/(?!["'#]|$)[^"']+/i);
    expect(css.length).toBeGreaterThan(1000);

    const report = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      scenario,
      surfaceMode: selection.surfaceMode,
      phase: summary.phase,
      provider: summary.provider || (summary.state as any)?.workflow_context?.lockedProvider || "unknown",
      model: summary.model || (summary.state as any)?.workflow_context?.lockedModel || "unknown",
      pageCount: summary.pageCount,
      fileCount: summary.fileCount,
      generatedFiles: summary.generatedFiles,
      qaSummary: summary.qaSummary || null,
      output: {
        projectJson: null,
        canonicalPrompt: null,
        siteDir: null,
        indexHtml: null,
      },
    };
    await writeHomepageLiveOutputs({
      scenario,
      project,
      canonicalPrompt,
      report,
    });

    expect(summary.phase).toBe("end");
    expect(summary.pageCount).toBe(1);
    expect(summary.generatedFiles).toEqual(expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]));
  }, 900_000);
});
