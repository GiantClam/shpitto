import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler";
import { buildPromptDraftWithResearch, type PromptControlManifest } from "./prompt-draft-research";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";
import { selectWebsiteGenerationTypeSkill } from "../skill-runtime/website-type-selector";
import { lintGeneratedWebsiteRouteHtml, lintGeneratedWebsiteStyles } from "../visual-qa/anti-slop-linter";
import {
  buildGenerationUnitInputFromRouteContract,
  createRouteUnitSmokeAdapter,
  runGenerationUnitsWithAdapter,
} from "../skill-runtime/generation-worker-adapter";
import {
  collectSharedDistinctLocaleKeys,
  hasBlogNavLink,
  hasDuplicateFooterLinkGroups,
} from "./institutional-live-quality";

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
  String(process.env.RUN_OPEN_DESIGN_FULLSITE_LIVE || "").trim() === "1" ||
  String(process.env.npm_lifecycle_event || "").trim() === "smoke:open-design-fullsite:live";

const scenario = String(process.env.SHPITTO_OD_FULLSITE_SCENARIO || "docs").trim().toLowerCase();

function envFlagEnabled(value: string | undefined): boolean | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isRouteUnitProviderBridgeEnabledForReport(siteGeneratorMode?: string | null): boolean {
  const envOverride = envFlagEnabled(process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE);
  if (envOverride !== null) return envOverride;
  return siteGeneratorMode !== "native";
}

const scenarioConfig: Record<
  string,
  {
    requirement: string;
    brand: string;
    routes: string[];
    navLabels: string[];
    purposes: string[];
    expectedBlogDetailCount?: number;
  }
> = {
  corporate: {
    brand: "AsterFlow Industrial AI",
    routes: ["/", "/solutions", "/cases", "/about", "/contact"],
    navLabels: ["Home", "Solutions", "Cases", "About", "Contact"],
    purposes: [
      "Enterprise B2B homepage with image-backed masthead, procurement proof, capabilities, evidence, and contact path.",
      "Solutions route for operations leaders comparing automation use cases and implementation paths.",
      "Customer evidence and case-study route with measurable outcomes and buyer-relevant proof.",
      "Company route covering delivery model, controls, team credibility, and operating standards.",
      "Contact route with concise qualification path and enterprise inquiry CTA.",
    ],
    requirement:
      "Build a polished multi-page B2B corporate website for AsterFlow Industrial AI. Audience: enterprise operations leaders evaluating automation partners. Generate Home, Solutions, Cases, About, and Contact. Use a procurement-ready visual system, concrete capabilities, customer evidence, and a strong contact path. Do not generate blog, archive, docs, or download routes.",
  },
  docs: {
    brand: "Meridian API Platform",
    routes: ["/", "/docs", "/guides", "/api-reference", "/support"],
    navLabels: ["Home", "Docs", "Guides", "API Reference", "Support"],
    purposes: [
      "Docs/knowledge homepage with workspace masthead, search/index rail, quickstart strip, guide stack, and reference matrix.",
      "Documentation index route organizing concepts, SDK setup, authentication, and integration topics.",
      "Guides route with task-based implementation paths and technical learning progression.",
      "API reference route with endpoint groups, parameter conventions, examples, and version clarity.",
      "Support route with troubleshooting paths, status signals, escalation channels, and compact CTA.",
    ],
    requirement:
      "Build a multi-page documentation and knowledge website for Meridian API Platform. Audience: developers and technical leads. Generate Home, Docs, Guides, API Reference, and Support. Prioritize structured wayfinding, clear technical value, route-owned documentation openings, reference clarity, and responsive design. Do not add blog, archive, research, standards, or marketing-only routes.",
  },
  hub: {
    brand: "Civic Standards Lab",
    routes: ["/", "/research", "/standards", "/resources", "/about"],
    navLabels: ["Home", "Research", "Standards", "Resources", "About"],
    purposes: [
      "Content-hub homepage with institutional collection masthead, shelves, ledger, resource index rows, and institutional CTA.",
      "Research route for reports, field notes, implementation evidence, and current investigation themes.",
      "Standards route organizing methods, compliance references, evaluation rubrics, and adoption paths.",
      "Resources route with templates, checklists, primers, and implementation materials.",
      "About route explaining institutional mission, collaborators, governance, and contact path.",
    ],
    requirement:
      "Build a multi-page resource and research hub for Civic Standards Lab. Audience: policy researchers and implementation teams. Generate Home, Research, Standards, Resources, and About. Use collection-first IA, consistent terminology, varied editorial modules, research/standards/resource navigation, and no blog or archive behavior.",
  },
  publishable: {
    brand: "Bays Wong",
    routes: ["/", "/blog", "/about", "/contact"],
    navLabels: ["Home", "Blog", "About", "Contact"],
    expectedBlogDetailCount: 3,
    purposes: [
      "Personal homepage introducing Bays Wong's technical judgment, writing themes, and article paths.",
      "Blog index with three complete publishable article cards and stable detail links.",
      "About route covering operator background, technical domains, and writing context.",
      "Contact route with concise collaboration and inquiry path.",
    ],
    requirement:
      "Build a polished personal technical blog for Bays Wong. Audience: engineers, founders, and product leaders. Generate Home, Blog, About, and Contact. The Blog route must publish 3 complete article detail pages with stable /blog/{slug}/ URLs. Article topics: WeChat real-time media architecture, DevOps operating systems, and AI SaaS commercialization. Keep the writing concrete and substantial. Do not invent archive category routes beyond the Blog route and its three requested detail pages.",
  },
};

function manifestForScenario(key: string): PromptControlManifest {
  const config = scenarioConfig[key] || scenarioConfig.docs!;
  return {
    schemaVersion: 1,
    promptKind: "canonical_website_prompt",
    routeSource: "prompt_draft_page_plan",
    routes: config.routes,
    navLabels: config.navLabels,
    files: ["/styles.css", "/script.js", ...config.routes.map((route) => (route === "/" ? "/index.html" : `${route}/index.html`))],
    pageIntents: config.routes.map((route, index) => ({
      route,
      navLabel: config.navLabels[index] || route,
      purpose: config.purposes[index] || `${config.navLabels[index] || route} route.`,
      source: "fullsite_live_smoke",
    })),
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

function rewriteFullSitePromptSections(prompt: string, manifest: PromptControlManifest, key: string): string {
  const config = scenarioConfig[key] || scenarioConfig.docs!;
  const fixedFiles = manifest.files.map((file) => `- ${file}`).join("\n");
  const surfaceMode =
    key === "hub"
      ? "content-hub-site"
      : key === "docs"
        ? "docs-knowledge-site"
        : key === "corporate"
          ? "corporate-b2b-site"
          : "portfolio-blog-site";
  const pageIntent = [
    "### Page-Level Intent Contract",
    ...manifest.routes.map((route, index) => {
      const htmlPath = route === "/" ? "/index.html" : `${route}/index.html`;
      const routeSpecificLines =
        route === "/"
          ? key === "hub"
            ? [
                "   - Homepage archetype: institutional collection masthead, topic shelves, standards/research ledger, and resource rows.",
                "   - Do not use generic marketing hero utilities such as `hero`, `hero-wrap`, `hero-grid`, `hero__body`, `hero-copy`, `hero-panel`, or `hero-aside`.",
                "   - Visitor-facing homepage copy must deliver institutional subject matter, not implementation review wording such as `shared shell`, `responsive layout`, or reading-order guidance.",
              ]
            : key === "docs"
              ? [
                  "   - Homepage archetype: docs workspace/reference-index opening, search/index rail, quickstart strip, guide stack, and reference matrix.",
                  "   - Do not use corporate procurement hero language or content-hub collection shelves on the homepage.",
                  "   - Visitor-facing homepage copy must deliver technical value and wayfinding, not implementation review wording such as `shared shell`, `responsive layout`, or route choreography.",
                ]
              : key === "corporate"
                ? [
                    "   - Homepage archetype: enterprise image-backed masthead, proof row, capability band, and concise contact path.",
                    "   - Locale controls belong in a dedicated utility wrapper adjacent to nav, never appended into the primary nav link stream.",
                    "   - Footer copy must not expose shell/mechanics labels such as `site browsing path`, `where to start`, `shared shell`, `responsive layout`, or similar implementation wording.",
                  ]
                : [
                    "   - Homepage archetype: profile-led technical homepage with direct Blog, About, and Contact paths.",
                    "   - Blog detail deliverables are explicit and may appear in shared footer/navigation when promised by the manifest.",
                  ]
          : [];
      return [
        `${index + 1}. ${config.navLabels[index] || route} (${route} -> ${htmlPath})`,
        `   - Page intent: ${config.purposes[index] || `${config.navLabels[index] || route} route.`}`,
        "   - Route source: fullsite_live_smoke",
        "   - Constraint: The Prompt Control Manifest route list is authoritative.",
        "   - Constraint: Navigation, footer, buttons, and CTAs may link only to manifest routes or in-page anchors.",
        ...routeSpecificLines,
        "   - Derive route-specific sections, content depth, and interactions from the Canonical Website Prompt and source material.",
        "",
      ].join("\n");
    }),
  ].join("\n");
  const discoveryLock = [
    "### Discovery Brief Lock",
    `- websiteSurfaceMode: ${surfaceMode}`,
    "- audience: prompt-adaptive",
    `- primaryGoal: ${config.purposes[0] || "Full-site live smoke."}`,
    `- routes: ${manifest.routes.join(", ")}`,
    "- sourcePriority: user",
    key === "publishable" ? "- localeMode: bilingual-allowed" : "- localeMode: en",
    "- visualDirectionId: prompt-adaptive",
    "- immutableConstraints: full-site live smoke",
    "- confirmationStatus: confirmed",
    "",
  ].join("\n");
  const sharedShell = [
    "### Shared Shell Destination Contract",
    `- Shared shell destinations are exactly: ${manifest.routes.join(", ")}.`,
    "- Navigation, footer, buttons, and CTAs may link only to manifest routes or in-page anchors.",
    "- Do not expose Archive, Downloads, Research, Standards, Docs, Support, or Blog destinations unless that exact route is present in the manifest.",
    "- Treat nav and footer as one authoritative shared shell across every route; do not emit page-specific destination drift.",
    "- Locale controls belong in a dedicated utility wrapper adjacent to the nav, not appended directly into the nav link stream.",
    "- Do not use footer labels or helper copy such as `site browsing path`, `reading path`, `where to start`, `shared shell`, `responsive layout`, `language strategy`, or other implementation-review wording.",
    "",
  ].join("\n");
  const layoutSafety = [
    "### Home Hero Layout Safety",
    "- The homepage opening must follow the surface-owned archetype from the Website Design Specification.",
    "- Docs and content-hub homepages must not reuse generic marketing/corporate hero utility geometry unless the surface contract explicitly calls for it.",
    "- Corporate homepages must use an enterprise masthead with a real image-backed hero and a distinct top-level footer band.",
    "- Visitor-facing copy must stay subject-matter-first. Do not explain route choreography, page structure, shell mechanics, or responsive implementation in visible text.",
    "",
  ].join("\n");

  return String(prompt || "")
    .replace(
      /### Fixed Pages And File Output[\s\S]*?(?=### Prompt Control Manifest \(Machine Readable\))/i,
      `### Fixed Pages And File Output\n${fixedFiles}\n\n`,
    )
    .replace(/### Discovery Brief Lock[\s\S]*?(?=### Workflow Skill Contract)/i, discoveryLock)
    .replace(/### Page-Level Intent Contract[\s\S]*?(?=### Shared Shell Destination Contract)/i, pageIntent)
    .replace(/### Shared Shell Destination Contract[\s\S]*?(?=### Home Hero Layout Safety)/i, sharedShell)
    .replace(/### Home Hero Layout Safety[\s\S]*?(?=### Page Repetition Constraints)/i, layoutSafety);
}

function appendFullSiteRouteOverride(prompt: string, manifest: PromptControlManifest, key: string): string {
  const config = scenarioConfig[key] || scenarioConfig.docs!;
  const archetype =
    key === "hub"
      ? "Homepage must use institutional collection-index geometry with collection masthead, shelves, ledgers, and resource rows. Do not use blog/archive behavior or implementation-review wording in visible copy."
      : key === "docs"
        ? "Homepage must use docs workspace/reference-index geometry with search/index rail, quickstart strip, guide stack, and reference matrix. Do not use corporate procurement hero language, content-hub collection shelves, or implementation-review wording in visible copy."
        : key === "corporate"
          ? "Homepage must use an enterprise image-backed masthead, proof row, capability band, and concise contact path. Locale controls must sit in a dedicated utility wrapper beside nav, and the footer must render as a distinct top-level site-footer band."
          : "Blog/detail routes are explicit deliverables in this run. Shared nav/footer may include manifest-declared /blog/{slug}/ detail routes, but must not invent archive/category routes beyond the confirmed set.";
  return `${prompt.trim()}

## Full-Site Route Unit Override

The Prompt Control Manifest is authoritative for this full-site smoke. Generate exactly these routes:
${manifest.routes.map((route, index) => `- ${route}: ${config.purposes[index] || config.navLabels[index] || route}`).join("\n")}

Generate the matching HTML files, shared /styles.css, and shared /script.js. Navigation, footer, buttons, and CTAs may link only to manifest routes or in-page anchors. Do not invent blog, archive, downloads, research, standards, docs, or support routes unless they are explicitly listed in the manifest above.

Each route is a route unit. Keep the shared shell consistent, but give every route its own opening, module vocabulary, media plan, and visitor-facing purpose.

${archetype}`;
}

function normalizeRoutePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "") || "/";
}

function routeToHtmlPath(route: string): string {
  const normalized = normalizeRoutePath(route);
  return normalized === "/" ? "/index.html" : `${normalized}/index.html`;
}

function htmlToVisibleText(html: string): string {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function collectInternalRoutes(html: string): string[] {
  const routes = new Set<string>();
  for (const match of String(html || "").matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const withoutHash = href.split(/[?#]/)[0] || "/";
    if (/\.[a-z0-9]{2,8}$/i.test(withoutHash)) continue;
    routes.add(normalizeRoutePath(withoutHash));
  }
  return Array.from(routes).sort();
}

async function collectFullSiteStaticVisualChecks(params: {
  siteDir: string;
  manifest: PromptControlManifest;
  css: string;
  allowedExtraRoutes?: string[];
  blogDetailRoutes?: string[];
}): Promise<Array<{ route: string; htmlPath: string; passed: boolean; issues: string[]; internalRoutes: string[]; textLength: number }>> {
  const allowedRoutes = new Set((params.manifest.routes || []).map((route) => normalizeRoutePath(route)));
  for (const route of params.allowedExtraRoutes || []) {
    allowedRoutes.add(normalizeRoutePath(route));
  }
  const checks = [];
  for (const route of params.manifest.routes || []) {
    const normalizedRoute = normalizeRoutePath(route);
    const htmlPath = routeToHtmlPath(normalizedRoute);
    const absolutePath = path.join(params.siteDir, htmlPath.replace(/^\/+/, ""));
    const html = await fs.readFile(absolutePath, "utf8");
    const visibleText = htmlToVisibleText(html);
    const internalRoutes = collectInternalRoutes(html);
    const issues: string[] = [];

    if (!/<!doctype html>/i.test(html)) issues.push("missing-doctype");
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) issues.push("missing-viewport");
    if (!/<link\b[^>]*href=["'][^"']*styles\.css["']/i.test(html)) issues.push("missing-shared-css");
    if (!/<script\b[^>]*src=["'][^"']*script\.js["']/i.test(html)) issues.push("missing-shared-script");
    if (!/<main\b/i.test(html)) issues.push("missing-main");
    if (!/<h1\b/i.test(html)) issues.push("missing-h1");
    if (!/<nav\b/i.test(html)) issues.push("missing-nav");
    if (!/<footer\b|class=["'][^"']*(?:site-footer|footer)/i.test(html)) issues.push("missing-footer-shell");
    if (visibleText.length < 260) issues.push("thin-visible-copy");
    for (const linkedRoute of internalRoutes) {
      if (!allowedRoutes.has(linkedRoute)) issues.push(`unexpected-link:${linkedRoute}`);
    }
    if (/\b(?:lorem ipsum|todo|placeholder image|coming soon)\b/i.test(visibleText)) issues.push("placeholder-visible-copy");
    if (/\b(?:the page groups|the homepage frames|visual system keeps|responsive layout|shared shell)\b/i.test(visibleText)) {
      issues.push("page-mechanics-copy");
    }
    const lint = lintGeneratedWebsiteRouteHtml(html, {
      route: normalizedRoute,
      navLabel: params.manifest.navLabels?.[(params.manifest.routes || []).indexOf(route)] || normalizedRoute,
    });
    for (const issue of lint.issues.filter((issue) => issue.severity === "error")) {
      issues.push(issue.code);
    }
    if (hasDuplicateFooterLinkGroups(html)) issues.push("duplicate-footer-link-groups");
    if (!allowedRoutes.has("/blog") && hasBlogNavLink(html)) issues.push("unexpected-blog-nav-link");
    if (!allowedRoutes.has("/blog") && /data-shpitto-blog-|\/api\/blog\/posts|href=["'][^"']*\/(?:blog|archive)(?:\/|["'#?])/i.test(html)) {
      issues.push("blog-archive-behavior-without-manifest-route");
    }

    checks.push({
      route: normalizedRoute,
      htmlPath,
      passed: issues.length === 0,
      issues,
      internalRoutes,
      textLength: visibleText.length,
    });
  }

  for (const route of params.blogDetailRoutes || []) {
    const normalizedRoute = normalizeRoutePath(route);
    const htmlPath = routeToHtmlPath(normalizedRoute);
    const absolutePath = path.join(params.siteDir, htmlPath.replace(/^\/+/, ""));
    const html = await fs.readFile(absolutePath, "utf8");
    const visibleText = htmlToVisibleText(html);
    const internalRoutes = collectInternalRoutes(html);
    const issues: string[] = [];

    if (!/<!doctype html>/i.test(html)) issues.push("missing-doctype");
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) issues.push("missing-viewport");
    if (!/<link\b[^>]*href=["'][^"']*styles\.css["']/i.test(html)) issues.push("missing-shared-css");
    if (!/<main\b/i.test(html)) issues.push("missing-main");
    if (!/<h1\b/i.test(html)) issues.push("missing-h1");
    if (!/<article\b|<section\b/i.test(html)) issues.push("missing-article-body");
    if ((html.match(/<h2\b/gi) || []).length < 2) issues.push("thin-detail-heading-structure");
    if (visibleText.length < 900) issues.push("thin-detail-visible-copy");
    for (const linkedRoute of internalRoutes) {
      if (!allowedRoutes.has(linkedRoute)) issues.push(`unexpected-link:${linkedRoute}`);
    }
    if (/\b(?:lorem ipsum|todo|placeholder image|coming soon)\b/i.test(visibleText)) issues.push("placeholder-visible-copy");

    checks.push({
      route: normalizedRoute,
      htmlPath,
      passed: issues.length === 0,
      issues,
      internalRoutes,
      textLength: visibleText.length,
    });
  }

  const css = String(params.css || "");
  const cssIssues: string[] = [];
  if (/\b(?:TODO|placeholder css|style placeholder)\b/i.test(css)) cssIssues.push("placeholder-css");
  if (/(?:\[data-reveal\]|\.reveal)\s*\{[^}]*opacity\s*:\s*0\b/i.test(css)) cssIssues.push("hidden-reveal-css");
  if (/\b(?:word-break\s*:\s*break-all|overflow-wrap\s*:\s*anywhere)\b/i.test(css)) cssIssues.push("fragile-heading-wrap-css");
  const cssLint = lintGeneratedWebsiteStyles(css);
  for (const issue of cssLint.issues.filter((issue) => issue.severity === "error")) {
    cssIssues.push(issue.code);
  }
  if (cssIssues.length > 0) {
    checks.push({
      route: "(shared-css)",
      htmlPath: "/styles.css",
      passed: false,
      issues: cssIssues,
      internalRoutes: [],
      textLength: css.length,
    });
  }

  return checks;
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

function collectBlogLikeHtmlPaths(files: Iterable<string>): string[] {
  return Array.from(files)
    .filter((file) => /^\/(?:blog|archive)(?:\/.*)?\/index\.html$/i.test(file))
    .sort();
}

describe.skipIf(!shouldRun)("Open Design full-site live generation", () => {
  it("generates all planned routes with route-unit metadata", async () => {
    const config = scenarioConfig[scenario] || scenarioConfig.docs!;
    const outputRoot = path.resolve(process.cwd(), ".tmp", "open-design-fullsite-live", scenario);
    const siteDir = path.join(outputRoot, "site");
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });

    const draft = await buildPromptDraftWithResearch({
      requirementText: config.requirement,
      slots: [],
      timeoutMs: 1_000,
    });
    const manifest = manifestForScenario(scenario);
    const canonicalPrompt = appendFullSiteRouteOverride(
      rewriteFullSitePromptSections(replaceFirstJsonBlock(draft.canonicalPrompt, manifest), manifest, scenario),
      manifest,
      scenario,
    );
    const selection = selectWebsiteGenerationTypeSkill({
      requirementText: config.requirement,
      routes: manifest.routes,
    });
    const discoveryBrief = {
      ...draft.discoveryBrief,
      surfaceMode: selection.surfaceMode,
      routes: manifest.routes,
      confirmationStatus: "confirmed" as const,
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
          latestUserText: config.requirement,
          latestUserTextRaw: config.requirement,
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
      timeoutMs: Math.max(360_000, Number(process.env.SHPITTO_OD_FULLSITE_TIMEOUT_MS || 900_000)),
      onStep: async (snapshot) => {
        console.log(
          `[open-design-fullsite-live] step ${snapshot.stepIndex}/${snapshot.totalSteps} ${snapshot.stepKey} ${snapshot.status}`,
        );
      },
    });

    const project = (summary.state as any)?.site_artifacts;
    expect(project?.staticSite?.files?.length).toBeGreaterThan(0);
    await materializeProject(project, siteDir);

    const generatedFiles = new Set(summary.generatedFiles.map((file) => file.replace(/\\/g, "/")));
    for (const file of manifest.files) {
      expect(generatedFiles.has(file)).toBe(true);
    }
    const blogLikeHtmlPaths = collectBlogLikeHtmlPaths(generatedFiles);
    const blogDetailRoutes = Array.from(generatedFiles)
      .filter((file) => /^\/blog\/[^/]+\/index\.html$/i.test(file))
      .map((file) => normalizeRoutePath(file.replace(/\/index\.html$/i, "")))
      .sort();
    const unexpectedArchiveLikePaths = blogLikeHtmlPaths.filter(
      (file) => file !== "/blog/index.html" && !/^\/blog\/[^/]+\/index\.html$/i.test(file),
    );
    if (config.expectedBlogDetailCount) {
      expect(generatedFiles.has("/blog/index.html")).toBe(true);
      expect(blogDetailRoutes.length).toBe(config.expectedBlogDetailCount);
      expect(unexpectedArchiveLikePaths).toEqual([]);
    } else {
      expect(blogLikeHtmlPaths).toEqual([]);
      expect(blogDetailRoutes).toEqual([]);
    }
    const routeUnits = summary.routeUnits || (summary.state as any)?.workflow_context?.routeUnits || [];
    expect(routeUnits).toHaveLength(manifest.routes.length);
    expect(routeUnits.every((unit: any) => unit.generatedFiles?.length >= 1)).toBe(true);
    expect(routeUnits.every((unit: any) => unit.generationUnit?.unitId && unit.generationUnit?.targetFiles?.length >= 1)).toBe(
      true,
    );
    const routeUnitDispatch = await runGenerationUnitsWithAdapter(
      createRouteUnitSmokeAdapter(),
      routeUnits.map((unit: any) =>
        buildGenerationUnitInputFromRouteContract({
          summary: unit,
          targetFiles: unit.generationUnit?.targetFiles || unit.generatedFiles,
          context: {
            websiteSurfaceMode: selection.surfaceMode,
            providerBackedSmokeSource: true,
          },
        }),
      ),
    );
    expect(routeUnitDispatch.passed).toBe(true);
    expect(routeUnitDispatch.results).toHaveLength(routeUnits.length);
    const routeUnitProviderBridgeNotes = summary.routeUnitProviderBridgeNotes || [];
    const siteGeneratorMode = summary.siteGeneratorMode || (summary.state as any)?.workflow_context?.siteGeneratorMode || null;
    const routeUnitProviderBridge = {
      enabled: isRouteUnitProviderBridgeEnabledForReport(siteGeneratorMode),
      attempted: routeUnitProviderBridgeNotes.some((note) => note.startsWith("route_unit_provider_bridge:")),
      legacyFallbackCount: routeUnitProviderBridgeNotes.filter((note) =>
        note.startsWith("route_unit_provider_bridge_legacy_fallback:"),
      ).length,
      notes: routeUnitProviderBridgeNotes,
    };
    if (routeUnitProviderBridge.enabled) {
      expect(routeUnitProviderBridge.notes.some((note) => note.startsWith("route_unit_provider_bridge"))).toBe(true);
    }
    expect(summary.phase).toBe("end");
    expect(summary.pageCount).toBeGreaterThanOrEqual(manifest.routes.length);
    expect(summary.qaSummary?.totalRoutes || manifest.routes.length).toBeGreaterThanOrEqual(manifest.routes.length);
    const css = await fs.readFile(path.join(siteDir, "styles.css"), "utf8");
    const hasBilingualResourceFiles =
      generatedFiles.has("/i18n/messages.en.json") && generatedFiles.has("/i18n/messages.zh-CN.json");
    let distinctLocaleKeys: string[] = [];
    if (hasBilingualResourceFiles) {
      const [enMessages, zhMessages] = await Promise.all([
        fs.readFile(path.join(siteDir, "i18n", "messages.en.json"), "utf8"),
        fs.readFile(path.join(siteDir, "i18n", "messages.zh-CN.json"), "utf8"),
      ]);
      distinctLocaleKeys = collectSharedDistinctLocaleKeys(enMessages, zhMessages);
      expect(distinctLocaleKeys.length).toBeGreaterThan(0);
    }
    const routeVisualChecks = await collectFullSiteStaticVisualChecks({
      siteDir,
      manifest,
      css,
      allowedExtraRoutes: blogDetailRoutes,
      blogDetailRoutes,
    });

    await Promise.all([
      fs.writeFile(path.join(outputRoot, "project.json"), JSON.stringify(project, null, 2), "utf8"),
      fs.writeFile(path.join(outputRoot, "canonical-prompt.md"), canonicalPrompt, "utf8"),
      fs.writeFile(path.join(outputRoot, "route-visual-checks.json"), JSON.stringify(routeVisualChecks, null, 2), "utf8"),
      fs.writeFile(path.join(outputRoot, "route-unit-dispatch.json"), JSON.stringify(routeUnitDispatch, null, 2), "utf8"),
      fs.writeFile(
        path.join(outputRoot, "route-unit-provider-bridge.json"),
        JSON.stringify(routeUnitProviderBridge, null, 2),
        "utf8",
      ),
      fs.writeFile(
        path.join(outputRoot, "report.json"),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            scenario,
            surfaceMode: selection.surfaceMode,
            siteGeneratorMode,
            provider: summary.provider,
            model: summary.model,
            pageCount: summary.pageCount,
            fileCount: summary.fileCount,
            generatedFiles: summary.generatedFiles,
            blogLikeHtmlPaths,
            blogDetailRoutes,
            unexpectedArchiveLikePaths,
            liveQuality: {
              distinctLocaleKeyCount: distinctLocaleKeys.length,
              hasBilingualResourceFiles,
            },
            routeUnits,
            routeUnitDispatch: {
              adapterId: routeUnitDispatch.adapterId,
              passed: routeUnitDispatch.passed,
              unitCount: routeUnitDispatch.results.length,
              issues: routeUnitDispatch.issues,
            },
            routeUnitProviderBridge,
            routeVisualChecks,
            routeRepairEvidence: summary.routeRepairEvidence || null,
            qaSummary: summary.qaSummary || null,
            output: { projectJson: path.join(outputRoot, "project.json"), siteDir },
          },
          null,
          2,
        ),
        "utf8",
      ),
    ]);
    expect(routeVisualChecks.every((check) => check.passed)).toBe(true);
  }, 1_200_000);
});
