import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  applyStateSitemapToDecisionForTesting,
  buildQaRepairMessageForTesting,
  buildSkeletonPromptRequirementContextForTesting,
  buildProviderOperationErrorForTesting,
  buildShadowVisualEvaluationForTesting,
  buildQaRepairGuidanceForTesting,
  buildWebsiteSkillToolRoundPromptForAdapter,
  collapseVisibleBilingualPairsForTesting,
  didRoundMateriallyChangeFilesForTesting,
  extractQaRepairTargetsForTesting,
  findCorporateB2BHomepageContractIssuesForTesting,
  findSurfaceHomepageArchetypeIssuesForTesting,
  findVisiblePageMechanicsScaffoldForTesting,
  formatTargetPageContract,
  enforceNavigationOrder,
  ensureEnglishFirstI18nResourceFilesForTesting,
  hasExplicitBlogDetailFillRequestForTesting,
  findVisibleSimultaneousBilingualCopyForTesting,
  htmlPathToRoute,
  injectCuratedMediaIntoHtmlForTesting,
  invokeWebsiteSkillRoundWithProviderFallbackForTesting,
  invokeModelWithRetry,
  isRetryableProviderError,
  normalizeToolChoiceForProvider,
  normalizeGeneratedJsForTesting,
  normalizeGeneratedCssForTesting,
  normalizeWebsiteStaticFilesForPreview,
  planRoundObjectiveForTesting,
  requiredFileChecklistForTesting,
  normalizeEnterpriseHomepageInlineStylesForTesting,
  normalizeCorporateHomepageOpeningRuntimePassThroughForTesting,
  normalizeEnterpriseTechLegacyDirectionCopyForTesting,
  normalizeEnterpriseTechTextWordmarkShellForTesting,
  resolveExpectedRequiredFileCountForTesting,
  resolveRoundTimeoutsForTesting,
  resolveWorkflowSurfaceSelectionForTesting,
  resolveWebsiteSkillRoundProviderConfigForTesting,
  resolveWebsiteSkillMaxToolRoundsForAdapter,
  resolveToolProtocolForProvider,
  renderWebsiteSeedSkillSidecarGuidance,
  runSkillToolExecutor,
  sanitizeWebsiteSkillHtmlOutputForAdapter,
  sanitizeRequirementForGenerationForTesting,
  shouldBypassProviderPreflightErrorForTesting,
  shouldUseRouteUnitProviderBridgeForTesting,
  syncSharedCssVariablesToStylePresetForTesting,
  stripEmptyBrandMarkPlaceholdersForTesting,
  stripEmptyLocaleGroupPlaceholdersForTesting,
  validateAndNormalizeRequiredFiles,
  validateAndNormalizeRequiredFilesWithQa,
  validateWebsiteRequiredFilesWithQaForAdapter,
} from "./skill-tool-executor";
import { renderWebsiteQualityContract } from "./website-quality-contract";
import { buildLocalDecisionPlan } from "./decision-layer";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset";
import {
  buildGenerationUnitInputFromRouteContract,
  createStaticGenerationWorkerAdapter,
  createSkillExecutionGenerationWorkerAdapter,
} from "./generation-worker-adapter";
import { createWebsiteGenerationSkillAdapter } from "./website-generation-skill-adapter";
import type { RouteUnitContractSummary } from "./website-design-spec";

async function* streamFrom(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function injectChineseMainFixture(html: string, title = "首页") {
  return String(html)
    .replace('<html lang="en">', '<html lang="zh-CN">')
    .replace(
      /<main>[\s\S]*?<\/main>/,
      `<main>
  <section>
    <h1>${title}</h1>
    <p>这是用于验证单语中文站点的页面内容，所有可见文案都应保持中文，不应残留语言切换控件或英文主体说明。</p>
  </section>
  <section>
    <h2>页面说明</h2>
    <p>页面应直接呈现中文标题、正文、操作引导和补充说明，而不是依赖未生效的双语壳层。</p>
  </section>
</main>`,
    );
}

function validGeneratedFiles(routes: string[]) {
  const navLinks = routes
    .map((route) => {
      const href = route === "/" ? "/" : `${route}/`;
      const label = route === "/" ? "Home" : route.replace(/^\//, "").replace(/[-/]+/g, " ") || "Home";
      return `    <a href="${href}">${label}</a>`;
    })
    .join("\n");
  const richHomeSections = [
    "CASUX organizes standards, research, practice, and certification materials into one clear entry point.",
    "The home page is the gateway for site identity, navigation, downloads, and service paths.",
    "The right-side hero area needs real media or chart content instead of empty visual shells.",
    "Search and directory results should span the full content width so cards remain readable and aligned.",
  ].join(" ");

  const pageStyle = `
body { color: #111; background: linear-gradient(180deg, #fff, #f6f7fb); }
main { display: grid; gap: 24px; }
.card { border: 1px solid #ddd; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
.hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, .9fr); gap: 28px; align-items: start; }
.hero__media { min-height: 320px; border-radius: 28px; background: radial-gradient(circle at top left, #eef5ff, #dfe8f7 56%, #c7d6ea); }
.card-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }
.search-result { grid-column: 1 / -1; }
@media (max-width: 768px) { main { gap: 16px; } .hero { grid-template-columns: 1fr; } }
`;

  const pageHead = `<style>${pageStyle}</style>`;

  const files = [
    {
      path: "/styles.css",
      content: pageStyle,
      type: "text/css",
    },
    { path: "/script.js", content: "document.documentElement.dataset.ready = 'true';", type: "text/javascript" },
    ...routes.map((route) => {
    const path = route === "/" ? "/index.html" : `${route}/index.html`;
    const title = route === "/" ? "Home" : route === "/blog" ? "Blog" : "Generated page";
    let main: string;

    if (route === "/blog") {
      main = '<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/demo/">Demo</a></article></div></section></main>';
    } else if (route === "/") {
      main = `
<main>
  <section class="hero">
    <div>
      <h1>Home</h1>
      <p>${richHomeSections}</p>
      <p>This fixture is intentionally verbose so the quality gate sees a realistic homepage rather than an empty landing shell.</p>
    </div>
    <div class="hero__media">
      <svg viewBox="0 0 640 360" role="img" aria-label="Preview chart">
        <rect width="640" height="360" rx="28" fill="#eef4ff"/>
        <path d="M42 278 C110 228, 154 208, 220 166 S346 128, 406 158 S520 106, 598 78" fill="none" stroke="#2563eb" stroke-width="12" stroke-linecap="round"/>
        <rect x="54" y="48" width="138" height="22" rx="11" fill="#c7d2fe"/>
        <rect x="54" y="84" width="220" height="16" rx="8" fill="#dbeafe"/>
        <rect x="54" y="116" width="188" height="16" rx="8" fill="#dbeafe"/>
        <rect x="54" y="176" width="112" height="112" rx="20" fill="#dbeafe"/>
      </svg>
    </div>
  </section>
  <section><h2>Content model</h2><p>Home is the unified entry point and should not be mislabeled as a downloads hub, a certification portal, or a generic product sheet.</p></section>
  <section><h2>Layout contract</h2><p>The hero visual must contain actual media or data-viz content so the right rail reads as a designed area instead of a large empty block.</p></section>
  <section><h2>Search surfaces</h2><p>Directory pages must allow result cards to span the full content width; narrow 12-column fragments make the listing hard to scan.</p></section>
</main>`;
    } else {
      main = `
<main>
  <h1>Generated page</h1>
  <section><p>This fixture carries enough real content, a decorative visual, and responsive hooks so route-level QA can validate actual contract behavior.</p></section>
  <section><h2>Details</h2><p>It includes structured article content and enough copy to avoid thin-content warnings during validation.</p></section>
  <figure>
    <svg viewBox="0 0 400 220" role="img" aria-label="Decorative chart">
      <rect width="400" height="220" rx="24" fill="#eef2ff"/>
      <path d="M32 170 L92 126 L146 140 L210 90 L272 114 L334 64" fill="none" stroke="#4f46e5" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="92" cy="126" r="8" fill="#4f46e5"/>
      <circle cx="210" cy="90" r="8" fill="#4f46e5"/>
      <circle cx="334" cy="64" r="8" fill="#4f46e5"/>
    </svg>
  </figure>
</main>`;
    }

      return {
        path,
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en">',
          "<head>",
          `  <title>${title}</title>`,
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          pageHead,
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <nav>",
          navLinks,
          "  </nav>",
          `  ${main}`,
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      };
    }),
  ];

  const buildDetailPage = (slug: string, title: string) =>
    [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      `  <title>${title}</title>`,
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      pageHead,
      '  <link rel="stylesheet" href="/styles.css" />',
      "</head>",
      "<body>",
      "  <nav>",
      '    <a href="/">Home</a>',
      '    <a href="/blog/">Blog</a>',
      "  </nav>",
      "  <main>",
      "    <article>",
      `      <h1>${title}</h1>`,
      `      <p>${title} is treated here as a real subject rather than a generic placeholder. The article opens by naming ${slug} directly, then explains the surrounding business context, the operational tension, and the reason this topic deserves a full detail destination instead of a shallow archive mention.</p>`,
      `      <p>The body keeps returning to ${title} so readers understand what changed, why ${slug} matters, and which tradeoffs shape the final implementation. Instead of drifting into generic website commentary, the prose stays anchored to the visible card topic and expands it with concrete reasoning.</p>`,
      `      <p>Readers get enough depth here for SEO, no-JS browsing, and preview environments where runtime hydration may never run. That means ${title} preserves meaning even outside the dynamic blog runtime instead of collapsing into a thin shell.</p>`,
      `      <section><h2>${title} context</h2><p>The surrounding shell, typography, and navigation stay consistent so readers move from the archive into a fully readable destination without losing orientation. That shell continuity matters because ${slug} is meant to feel native to the same site rather than like a detached runtime fallback template.</p></section>`,
      `      <section><h2>${title} decision</h2><p>The article explains why ${slug} becomes its own route, which constraints shaped the page, and how the chosen detail structure supports both editorial clarity and operational realism. A route that only shows a title, date, or metadata line would not satisfy the promise made by the visible archive card.</p></section>`,
      `      <section><h2>${title} impact</h2><p>That combination protects addressability, keeps cards honest about what they lead to, and avoids the common failure mode where a polished archive page collapses into placeholders once a visitor clicks through. It also gives the deployment layer a trustworthy static fallback if the dynamic blog runtime is unavailable, slow, or intentionally disabled during preview.</p></section>`,
      "    </article>",
      "  </main>",
      '  <script src="/script.js"></script>',
      "</body>",
      "</html>",
    ].join("\n");

  const detailFixtures = [
    ["demo", "Demo detail"],
    ["insight", "Insight detail"],
    ["standards", "Standards detail"],
    ["devops", "DevOps delivery detail"],
    ["ai-one", "AI article one"],
    ["ai-two", "AI article two"],
    ["ai-three", "AI article three"],
    ["a", "Article A"],
    ["b", "Article B"],
    ["c", "Article C"],
    ["agile-devops-system-design", "Agile DevOps system design"],
  ] as const;

  for (const [slug, title] of detailFixtures) {
    files.push({
      path: `/blog/${slug}/index.html`,
      type: "text/html",
      content: buildDetailPage(slug, title),
    });
  }

  return files;
}

describe("skill-tool-executor", () => {
  it("downgrades named tool choice for providers that reject named tool_choice objects", () => {
    const namedFinishChoice = { type: "function", function: { name: "finish" } };

    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, namedFinishChoice)).toBe("required");
    expect(normalizeToolChoiceForProvider({ provider: "pptoken" }, namedFinishChoice)).toBe("required");
    expect(normalizeToolChoiceForProvider({ provider: "crazyroute" }, namedFinishChoice)).toEqual(namedFinishChoice);
    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, "required")).toBe("required");
    expect(normalizeToolChoiceForProvider({ provider: "pptoken" }, "required")).toBe("required");
  });

  it("treats undefined-message provider envelopes as retryable", () => {
    expect(isRetryableProviderError(new TypeError("Cannot read properties of undefined (reading 'message')"))).toBe(true);
  });

  it("only bypasses preflight malformed envelopes for pptoken", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'message')");

    expect(
      shouldBypassProviderPreflightErrorForTesting({
        config: { provider: "pptoken" },
        error,
      }),
    ).toBe(true);

    expect(
      shouldBypassProviderPreflightErrorForTesting({
        config: { provider: "aiberm" },
        error,
      }),
    ).toBe(false);
  });

  it("adds provider and phase context to malformed openai-compatible provider errors", () => {
    const message = buildProviderOperationErrorForTesting({
      label: "provider_openai_compat_request_failed",
      config: {
        provider: "pptoken",
        modelName: "gpt-5.4-mini",
      },
      phase: "tool_protocol.request",
      error: {
        name: "TypeError",
        message: "Cannot read properties of undefined (reading 'message')",
        request_id: "req_123",
        error: {
          type: "server_error",
          message: "gateway returned malformed envelope",
        },
      },
      response: {
        id: "resp_1",
        choices: [],
      },
    });

    expect(message).toContain("provider_openai_compat_request_failed: provider=pptoken model=gpt-5.4-mini phase=tool_protocol.request");
    expect(message).toContain("request_id=req_123");
    expect(message).toContain("detail=TypeError | Cannot read properties of undefined (reading 'message')");
    expect(message).toContain('upstream={"keys":["type","message"]');
    expect(message).toContain('response={"keys":["id","choices"]');
  });

  it("restricts Aiberm tools when named tool choice is downgraded", () => {
    const namedEmitChoice = { type: "function", function: { name: "emit_file" } };

    expect(resolveToolProtocolForProvider({ provider: "aiberm" }, namedEmitChoice)).toEqual({
      toolChoice: "required",
      toolNames: ["emit_file"],
    });
    expect(resolveToolProtocolForProvider({ provider: "pptoken" }, namedEmitChoice)).toEqual({
      toolChoice: "required",
      toolNames: ["emit_file"],
    });
    expect(resolveToolProtocolForProvider({ provider: "crazyroute" }, namedEmitChoice)).toEqual({
      toolChoice: namedEmitChoice,
      toolNames: ["load_skill", "emit_file", "web_search", "finish"],
    });
  });

  it("normalizes generated navigation order with contact before about", () => {
    const state: any = {
      messages: [new HumanMessage("Build site. Nav: Home | About | Products | Cases | Contact")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<nav>",
      '<a href="/products">Products</a>',
      '<a href="/about">About</a>',
      '<a href="/cases">Cases</a>',
      '<a href="/contact">Contact</a>',
      "</nav>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized.indexOf('href="/contact"')).toBeLessThan(normalized.indexOf('href="/about"'));
    expect(normalized.indexOf('href="/about"')).toBeGreaterThan(normalized.indexOf('href="/cases"'));
  });

  it("uses the requested bilingual default visible language when normalizing navigation labels", () => {
    const state: any = {
      messages: [new HumanMessage("Build a bilingual Chinese and English CASUX site. Default visible language is Chinese. Nav: Home | CASUX Research Center | CASUX Information Platform")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<nav>",
      '<a href="/casux-information-platform">CASUX Information Platform</a>',
      '<a href="/casux-research-center">CASUX Research Center</a>',
      '<a href="/">Home</a>',
      "</nav>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(
      html,
      decision,
      "Build a bilingual Chinese and English CASUX site. Default visible language is Chinese.",
    );
    expect(normalized).toContain(">首页</a>");
    expect(normalized).toContain(">研究</a>");
    expect(normalized).toContain(">信息</a>");
    expect(normalized).toContain('data-i18n-zh="首页"');
    expect(normalized).toContain('data-i18n-en="Home"');
  });

  it("does not let state sitemap override an authoritative prompt manifest route plan", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              routes: ["/"],
              navLabels: ["Home"],
              files: ["/styles.css", "/script.js", "/index.html"],
            }),
            "```",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      sitemap: ["/accessibility", "/file", "/source", "/english", "/zh", "/blog"],
    };

    const decision = buildLocalDecisionPlan(state);
    const merged = applyStateSitemapToDecisionForTesting(decision, state.sitemap);

    expect(decision.routeAuthorityMode).toBe("prompt_manifest");
    expect(merged.routes).toEqual(["/"]);
    expect(merged.navLabels).toEqual(["Home"]);
  });

  it("skips corporate homepage contract enforcement for the generic website adapter", () => {
    const state: any = {
      messages: [new HumanMessage("Generate a company website from uploaded materials with Home, Casux Information Platform, and Case Studies.")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const files = validGeneratedFiles(["/", "/casux-information-platform", "/case-studies"]);

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/casux-information-platform", "/case-studies"],
          navLabels: ["Home", "Casux Information Platform", "Case Studies"],
          pageBlueprints: [],
        },
        files,
        requirementText:
          "Company website from uploaded materials focused on standards, research, information platform, and case studies.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("removes locale-switch chrome from single-language sites", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a Chinese-only company website with only a homepage. Keep the site in Chinese.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: injectChineseMainFixture(
              String(file.content).replace(
              "</nav></header>",
              '</nav><div class="utility-shell" data-locale-switch><div class="lang-switch" role="group" aria-label="Select language"><button type="button" data-lang="zh-CN">ZH</button><button type="button" data-lang="en">EN</button></div></div></header>',
            ),
              "首页",
            ),
          }
        : file,
    );

    const result = validateWebsiteRequiredFilesWithQaForAdapter({
      decision,
      files,
      requirementText: "Chinese-only company website. Keep all visible copy in Chinese.",
      enforceCorporateHomepageContract: false,
    });

    const normalized = String(result.files.find((file) => file.path === "/index.html")?.content || "");
    expect(normalized).not.toContain("data-locale-toggle");
    expect(normalized).not.toContain("data-locale-switch");
    expect(normalized).not.toContain("lang-switch");
    expect(normalized).not.toContain("header-utility");
    expect(normalized).not.toContain("utility-shell");
  });

  it("removes locale-switch chrome when bilingual wording leaks into the prompt but no i18n dictionaries exist", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a Chinese company website from uploaded materials.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: injectChineseMainFixture(
              String(file.content).replace(
              "</nav></header>",
              '</nav><div class="locale-switch"><button type="button" data-locale-toggle data-locale="en">EN</button><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button></div></header>',
            ),
              "首页",
            ),
          }
        : file,
    );

    const result = validateWebsiteRequiredFilesWithQaForAdapter({
      decision,
      files,
      requirementText:
        "Chinese-first site. Do not emit an EN/ZH switch, bilingual resource files, or hidden alternate-language shell payloads.",
      enforceCorporateHomepageContract: false,
    });

    expect(String(result.files.find((file) => file.path === "/index.html")?.content || "")).not.toContain("data-locale-toggle");
  });

  it("treats explicit Chinese locale contracts as single-language even when workflow text mentions i18n machinery", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a Chinese company website from uploaded materials.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: injectChineseMainFixture(
              String(file.content).replace(
              "</nav></header>",
              '</nav><div class="header-utility" aria-label="Language switch"><div class="locale-switch"><button type="button" data-locale-toggle data-locale="en">EN</button><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button></div><button class="utility-chip" type="button" data-locale="en">EN</button><button class="utility-chip" type="button" data-locale="zh">ZH</button></div></header>',
            ),
              "首页",
            ),
          }
        : file,
    );

    const result = validateWebsiteRequiredFilesWithQaForAdapter({
      decision,
      files,
      requirementText: [
        "# Findings",
        "- Language: Chinese",
        "- Locale: zh-CN",
        "- i18n contract: keep alternate-language strings in JSON dictionaries when bilingual sites are requested.",
      ].join("\n"),
      enforceCorporateHomepageContract: false,
    });

    const normalized = String(result.files.find((file) => file.path === "/index.html")?.content || "");
    expect(normalized).not.toContain("data-locale-toggle");
    expect(normalized).not.toContain("header-utility");
    expect(normalized).not.toContain("utility-chip");
  });

  it("rejects English-heavy main content for zh-CN single-language pages", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a Chinese company website with only a homepage.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace('<html lang="en">', '<html lang="zh-CN">'),
          }
        : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Chinese-only company website. Keep all visible copy in Chinese.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow(/tagged zh-CN but still renders mostly English/i);
  });

  it("still allows sitemap seeding when route planning is heuristic", () => {
    const state: any = {
      messages: [new HumanMessage("Build a simple site for a company.")],
      phase: "conversation",
      sitemap: ["/products", "/contact"],
    };

    const decision = buildLocalDecisionPlan(state);
    const merged = applyStateSitemapToDecisionForTesting(decision, state.sitemap);

    expect(decision.routeAuthorityMode).toBe("heuristic");
    expect(merged.routes).toEqual(["/", "/products", "/contact"]);
  });

  it("restores missing footer destinations from the confirmed route plan", () => {
    const state: any = {
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact | About")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<footer>",
      '<a href="/contact">Contact</a>',
      '<a href="/about">About</a>',
      "</footer>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized).toContain('href="/products"');
    expect(normalized).toContain('href="/cases"');
  });

  it("preserves the brand anchor and dedupes duplicated footer routes", () => {
    const state: any = {
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact | About")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<footer>",
      '<a class="brand" href="/" aria-label="Vbuy Textile home">Vbuy Textile</a>',
      '<a href="/products">Products</a>',
      '<a href="/products/">Products</a>',
      '<a href="/contact">Contact</a>',
      "</footer>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized).toContain('class="brand"');
    expect(normalized).toContain(">Vbuy Textile</a>");
    expect((normalized.match(/href="\/products\/?"/g) || []).length).toBe(1);
  });

  it("does not expand each footer navigation group into the full route set", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build site. Nav: Home | Creation | Construction | Certification | Advocacy | Research Center | Information Platform",
        ),
      ],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      '<footer class="site-footer">',
      '  <div class="footer-group"><h2>Primary</h2><nav class="footer-nav"><a href="/casux-creation">Creation</a><a href="/casux-construction">Construction</a><a href="/casux-certification">Certification</a></nav></div>',
      '  <div class="footer-group"><h2>Secondary</h2><nav class="footer-nav"><a href="/casux-advocacy">Advocacy</a><a href="/casux-research-center">Research Center</a><a href="/casux-information-platform">Information Platform</a></nav></div>',
      "</footer>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision, "Build a bilingual CASUX full-site.");
    const footerNavMatches = Array.from(
      normalized.matchAll(/<nav\b[^>]*class=(["'])[^"']*\bfooter-nav\b[^"']*\1[^>]*>([\s\S]*?)<\/nav>/gi),
    );

    expect(footerNavMatches).toHaveLength(2);
    expect(footerNavMatches[0]?.[2] || "").toContain('href="/casux-creation"');
    expect(footerNavMatches[0]?.[2] || "").not.toContain('href="/casux-advocacy"');
    expect(footerNavMatches[1]?.[2] || "").toContain('href="/casux-advocacy"');
    expect(footerNavMatches[1]?.[2] || "").not.toContain('href="/casux-creation"');
  });

  it("dedupes repeated footer route groups while preserving distinct footer jobs", () => {
    const state: any = {
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact | About")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const duplicateLinks =
      '<a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a>';
    const html = [
      "<!doctype html><html><body>",
      '<footer class="site-footer"><div class="footer-grid">',
      '<div class="footer-brand"><a class="brand" href="/">Brand</a><p>Summary.</p></div>',
      `<div><h3>Routes</h3><div class="footer-links">${duplicateLinks}</div></div>`,
      `<div><h3>Resources</h3><div class="footer-links">${duplicateLinks}<a href="mailto:team@example.org">Email</a></div></div>`,
      '<div class="footer-meta"><a href="/about">About</a></div>',
      "</div></footer>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    const footerLinkGroups = Array.from(
      normalized.matchAll(/<div\b[^>]*class=(["'])[^"']*\bfooter-links\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi),
    );

    expect(footerLinkGroups).toHaveLength(2);
    expect((footerLinkGroups[0]?.[2] || "").match(/href="\/products"/g)?.length || 0).toBe(1);
    expect(footerLinkGroups[1]?.[2] || "").not.toContain('href="/products"');
    expect(footerLinkGroups[1]?.[2] || "").toContain('href="mailto:team@example.org"');
  });

  it("prefers decision nav labels over route-derived multi-word labels in shared navigation", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build site. Nav: Home | Creation | Construction | Certification | Advocacy | Research | Information | Standards | Cases",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          routes: [
            "/",
            "/casux-creation",
            "/casux-construction",
            "/casux-certification",
            "/casux-advocacy",
            "/casux-research-center",
            "/casux-information-platform",
            "/standards-system",
            "/case-studies",
          ],
          navLabels: ["Home", "Creation", "Construction", "Certification", "Advocacy", "Research", "Information", "Standards", "Cases"],
          files: [],
        },
      },
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      '<nav class="shell-nav">',
      '<a href="/casux-research-center/">Casux Research Center</a>',
      '<a href="/casux-information-platform/">Casux Information Platform</a>',
      '<a href="/case-studies/">Case Studies</a>',
      "</nav>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized).toContain(">Research</a>");
    expect(normalized).toContain(">Information</a>");
    expect(normalized).toContain(">Cases</a>");
    expect(normalized).not.toContain(">Casux Research Center</a>");
    expect(normalized).not.toContain(">Casux Information Platform</a>");
  });

  it("keeps single-language navigation free of bilingual data payloads", () => {
    const state: any = {
      messages: [new HumanMessage("Build a Chinese company website with Home, Products, Cases, and Contact only.")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<nav>",
      '<a href="/products">Products</a>',
      '<a href="/cases">Cases</a>',
      '<a href="/contact">Contact</a>',
      "</nav>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision, "Chinese-only company website. Keep all visible copy in Chinese.");
    expect(normalized).not.toContain("data-i18n-zh=");
    expect(normalized).not.toContain("data-i18n-en=");
  });

  it("preserves BEM footer link wrappers when reordering known routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build site. Nav: Home | Creation | Construction | Certification | Advocacy | Research | Information | Standards | Cases",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          routes: [
            "/",
            "/casux-creation",
            "/casux-construction",
            "/casux-certification",
            "/casux-advocacy",
            "/casux-research-center",
            "/casux-information-platform",
            "/standards-system",
            "/case-studies",
          ],
          navLabels: ["Home", "Creation", "Construction", "Certification", "Advocacy", "Research", "Information", "Standards", "Cases"],
          files: [],
        },
      },
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      '<footer class="footer"><div class="footer__inner"><div class="footer__top"><div class="footer__brand"><a class="brand" href="/">Brand</a></div><div class="footer__grid"><section class="footer__section"><div class="footer__links"><a href="/case-studies/">Case Studies</a><a href="/casux-research-center/">Casux Research Center</a></div></section></div></div><div class="footer__bottom"><div class="footer__meta"><a href="/casux-information-platform/">Casux Information Platform</a></div></div></div></footer>',
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized).toContain('class="footer__links"');
    expect(normalized).toContain('class="footer__meta"');
    expect(normalized).toContain(">Research</a>");
    expect(normalized).toContain(">Information</a>");
    expect(normalized).not.toContain(">Casux Research Center</a>");
    expect(normalized).not.toContain(">Casux Information Platform</a>");
  });

  it("rejects flat footers when the shared CSS defines a structured footer shell", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact")],
      phase: "conversation",
    } as any);
    const footerLinks = [
      '<a class="brand" href="/">Brand</a>',
      '<a href="/products">Products</a>',
      '<a href="/cases">Cases</a>',
      '<a href="/contact">Contact</a>',
    ].join("");
    const files = [
      {
        path: "/styles.css",
        content:
          ".site-footer{padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.footer-grid{display:grid}.footer-brand{display:grid}.footer-links{display:grid}.footer-meta{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></header>',
          `  <main><section><h1>${route === "/" ? "Home" : route}</h1><p>Route specific content.</p></section></main>`,
          `  <footer class="site-footer">${footerLinks}</footer>`,
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Company site with shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("flat link row instead of a structured footer shell");
  });

  it("rejects undeclared internal routes leaked into the shared shell", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a CASUX institutional site with Home, Creation, Research, and Information only.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/", "/casux-creation", "/casux-research-center", "/casux-information-platform"]).map(
      (file) =>
        file.path === "/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                "</nav>",
                '<a href="/blog/">Blog</a></nav>',
              ),
            }
          : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/casux-creation", "/casux-research-center", "/casux-information-platform"],
          navLabels: ["Home", "Creation", "Research", "Information"],
          pageBlueprints: [],
        },
        files,
        requirementText:
          "Institutional site. Do not create blog or archive routes. Treat the information platform as a route-owned public resource directory.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("navigation exposes undeclared internal routes outside the confirmed route plan: /blog");
  });

  it("rejects reserved placeholder public contact details in publishable HTML", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a CASUX institutional site with Home and Information.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/", "/casux-information-platform"]).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              "</main>",
              '<section><h2>Contact</h2><p>Email: hello@casux.example</p></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "Information"],
          pageBlueprints: [],
        },
        files,
        requirementText: "Institutional site with a public information route and publishable contact details.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("exposes reserved placeholder contact or URL tokens instead of publishable public details");
  });

  it("rejects missing consultation intake forms when the source contract requires one", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a CASUX information website with Home and CASUX Information Platform.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/", "/casux-information-platform"]);

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "CASUX Information Platform"],
          pageBlueprints: [],
        },
        files,
        requirementText:
          "Information platform route source notes: include consultation intake for institutions that need document clarification. Consultation form requirement: include a real form with name, organization, email, topic, and message fields.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("missing a required consultation/intake form");
  });

  it("rejects blog detail pages that do not inherit the shared stylesheet", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a site with Home and Blog.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/", "/blog"]).map((file) =>
      file.path === "/blog/demo/index.html"
        ? { ...file, content: String(file.content).replace(/\s*<link rel="stylesheet" href="\/styles\.css" \/>\n/, "") }
        : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          pageBlueprints: [
            {
              route: "/",
              navLabel: "Home",
              purpose: "Home page.",
              source: "default",
              constraints: [],
              pageKind: "home",
              responsibility: "Home page.",
              contentSkeleton: [],
              componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 0, cta: 20 },
            },
            {
              route: "/blog",
              navLabel: "Blog",
              purpose: "Publishable article archive.",
              source: "explicit_route",
              constraints: [],
              pageKind: "blog-data-index",
              responsibility: "Publishable article archive.",
              contentSkeleton: [],
              componentMix: { hero: 12, feature: 18, grid: 34, proof: 12, form: 0, cta: 24 },
            },
          ],
        },
        files,
        requirementText: "Build a site with Home and Blog.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("/blog/demo/index.html does not reference /styles.css");
  });

  it("rejects card-only footers without a visible top-level footer band", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".footer-grid{display:grid}.footer-card{background:#fff;border:1px solid #d8dee8;border-radius:8px;padding:1rem}.footer-links{display:grid}.footer-actions{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></header>',
          `  <main>
            <section><h1>${route === "/" ? "Home" : route}</h1><p>This route has enough finished content to keep the footer assertion focused on shell chrome.</p></section>
            <section><h2>Capability focus</h2><p>Visitors can understand the company, compare relevant services, and choose a next route without relying on placeholder explanations.</p></section>
            <section><h2>Proof</h2><p>The body carries normal page content so a missing footer band remains the only shared-shell defect being checked here.</p></section>
          </main>`,
          '  <footer class="site-footer footer"><div class="container site-footer__inner footer-grid"><div class="footer-card site-footer__brand"><a class="brand" href="/">Brand</a><p>Trusted company summary.</p></div><div class="footer-card footer-links"><a href="/products">Products</a><a href="/cases">Cases</a></div><div class="footer-card footer-actions"><a href="/contact">Contact</a></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Company site with shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("flat link row instead of a structured footer shell");
  });

  it("accepts structured footers that use footer-nav/footer-actions instead of footer-links/footer-meta", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".site-footer{padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.footer-inner{display:grid}.footer-top{display:flex}.footer-grid{display:grid}.footer-brand{display:grid}.footer-nav{display:flex}.footer-actions{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></header>',
          `  <main>
            <section><h1>${route === "/" ? "Home" : route}</h1><p>This route keeps a real visitor-facing introduction so the QA layer sees a finished page rather than a skeletal fixture.</p></section>
            <section><h2>Capability focus</h2><p>Each route carries enough descriptive copy to explain why a visitor should care, what the page covers, and how it connects to the broader site narrative.</p></section>
            <section><h2>Proof and context</h2><p>The page includes supporting context, proof-oriented language, and a stable shell so structural footer validation can run without thin-content noise.</p></section>
            <section><h2>Next action</h2><p>Visitors can move into the relevant route or contact path after reviewing the page-specific content and supporting proof.</p></section>
          </main>`,
          '  <footer class="site-footer"><div class="footer-inner"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/">Brand</a><p>Trusted company summary.</p></div><div class="footer-actions"><a href="/contact">Contact</a></div></div><div class="footer-grid"><nav class="footer-nav"><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Company site with shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("accepts structured footers that use BEM footer__ zones", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          "footer.site-footer{padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.footer__top{display:flex}.footer__brand{display:grid}.footer__nav{display:flex}.footer__bottom{display:flex}.footer-actions{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></header>',
          `  <main>
            <section><h1>${route === "/" ? "Home" : route}</h1><p>This route keeps enough route-owned content to avoid thin-template false positives during page validation.</p></section>
            <section><h2>Context</h2><p>The page explains what visitors can learn here and why the route matters inside the larger institutional site map.</p></section>
            <section><h2>Proof</h2><p>Supporting evidence and next-step guidance remain visible so visitors can trust the page and choose a relevant route.</p></section>
          </main>`,
          '  <footer class="site-footer"><div class="footer"><div class="footer__top"><div class="footer__brand"><a class="brand" href="/">Brand</a><p>Institutional summary.</p></div><nav class="footer__nav"><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></div><div class="footer__bottom"><p>Shared proof copy.</p><div class="footer-actions"><a href="/cases">Cases</a></div></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Institutional site with a structured shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("normalizes structured footer shells to include footer-band when shared CSS defines that utility", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a polished personal technical site with Home and About only. Nav: Home | About.")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".site-footer{padding:2.5rem 0;border-top:1px solid #d8dee8;background:#f8fafc}.footer-band{margin-top:4rem;background:#f8fafc}.footer-inner{display:grid}.footer-brand{display:grid}.footer-links{display:flex}.footer-meta{display:grid}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>',
          `  <main><section><h1>${route === "/" ? "Home" : "About"}</h1><p>Finished visitor-facing content for this route with enough depth for QA.</p></section></main>`,
          '  <footer class="site-footer"><div class="footer-inner"><div class="footer-brand"><a class="brand" href="/">Brand</a><p class="footer-note">Independent technical practice with clear service and writing context.</p></div><div class="footer-links"><a href="/">Home</a><a href="/about">About</a></div><div class="footer-meta"><p>Support copy.</p></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      })),
    ];

    const result = validateWebsiteRequiredFilesWithQaForAdapter({
      decision,
      files,
      requirementText: "Personal technical site with a structured shared footer shell.",
      enforceCorporateHomepageContract: false,
    });

    const byPath = new Map(result.files.map((file) => [file.path, String(file.content || "")]));
    expect(byPath.get("/index.html")).toContain('class="site-footer footer-band"');
    expect(byPath.get("/about/index.html")).toContain('class="site-footer footer-band"');
  });

  it("accepts structured footers that use footer-panel/footer-col/footer-notes columns", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Products | Cases | Contact")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".footer{padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.footer-panel{display:grid}.footer-grid{display:grid}.footer-col{display:grid}.footer-links{display:grid}.footer-notes{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      ...decision.routes.map((route) => ({
        path: route === "/" ? "/index.html" : `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/cases">Cases</a><a href="/contact">Contact</a></nav></header>',
          `  <main>
            <section><h1>${route === "/" ? "Home" : route}</h1><p>This route keeps enough route-owned content to avoid thin-template false positives during page validation.</p></section>
            <section><h2>Context</h2><p>The page explains what visitors can learn here and why the route matters inside the broader site map.</p></section>
            <section><h2>Proof</h2><p>Supporting evidence and next-step guidance remain visible so visitors can trust the page and choose a relevant route.</p></section>
          </main>`,
          '  <footer class="site-footer"><div class="footer-panel"><div class="footer-grid"><div class="footer-col"><a class="brand" href="/">Brand</a><p class="footer-title">Structured summary.</p></div><div class="footer-col"><h3>Routes</h3><div class="footer-links"><a href="/products">Products</a><a href="/cases">Cases</a></div></div><div class="footer-col"><h3>Connect</h3><div class="footer-links"><a href="/contact">Contact</a></div></div></div><div class="footer-notes"><p class="fineprint">Shared proof copy.</p></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Institutional site with a structured shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("accepts compact structured editorial footers with footer-inner plus nav and note zones", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a portfolio blog site with Home and Blog.")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".site-footer{padding:2.5rem 0;margin-top:4rem;border-top:1px solid #d8dee8;background:#f8fafc}.footer-inner{display:flex;justify-content:space-between;gap:1rem}.footer-nav{display:flex;gap:1rem}.footer-note{color:#475569}.entry-card{padding:1rem;border:1px solid #e2e8f0}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/" aria-current="page">Home</a><a href="/blog">Blog</a></nav></header>',
          `  <main>
            <section><h1>Deep Notes</h1><p>A portfolio-style editorial homepage with enough route-owned copy to keep shell validation focused on the footer shape.</p></section>
            <section><h2>Writing focus</h2><p>The homepage introduces the publication viewpoint, current AI themes, and why readers should trust the ongoing archive.</p></section>
            <section><h2>Proof</h2><p>Selected essays, practical notes, and durable documentation habits reinforce the homepage before visitors move into the archive.</p></section>
          </main>`,
          '  <footer class="site-footer"><div class="footer-inner"><nav class="footer-nav"><a href="/">Home</a><a href="/blog">Blog</a></nav><p class="footer-note">Deep Notes · Practical AI writing and documentation-focused updates.</p></div></footer>',
          "</body></html>",
        ].join("\n"),
      },
      {
        path: "/blog/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog" aria-current="page">Blog</a></nav></header>',
          `  <main>
            <section><h1>Blog</h1><p>The archive route keeps a route-owned editorial opening with enough visible depth to avoid thin-content fallback noise.</p></section>
            <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="entry-card"><h2>Recent entries</h2><p>Visitors can move from the homepage into a compact archive surface with a clear reading path and stable navigation.</p></article></div></section>
            <section><h2>Continue reading</h2><p>The archive keeps a concise footer summary and route links so readers can continue browsing without losing context.</p></section>
          </main>`,
          '  <footer class="site-footer"><div class="footer-inner"><nav class="footer-nav"><a href="/">Home</a><a href="/blog" aria-current="page">Blog</a></nav><p class="footer-note">Deep Notes · Practical AI writing and documentation-focused updates.</p></div></footer>',
          "</body></html>",
        ].join("\n"),
      },
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          pageBlueprints: [],
        },
        files,
        requirementText: "Portfolio blog site with a compact shared footer shell.",
        websiteSurfaceMode: "portfolio-blog-site",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("accepts structured footers when the visible footer band chrome is defined on .footer-band", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a portfolio blog site with Home and Blog.")],
      phase: "conversation",
    } as any);
    const files = [
      {
        path: "/styles.css",
        content:
          ".footer-band{margin-top:auto;border-top:1px solid #d8dee8;background:#f8fafc}.footer-inner{padding:28px 0 20px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:22px}.footer-brand{display:grid;gap:10px}.footer-links{display:grid;gap:10px}.footer-meta{color:#475569}.entry-card{padding:1rem;border:1px solid #e2e8f0}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/" aria-current="page">Home</a><a href="/blog">Blog</a></nav></header>',
          `  <main>
            <section><h1>Northline Journal</h1><p>A bilingual AI publication homepage with enough finished content to keep shared-shell verification focused on the footer shape.</p></section>
            <section><h2>Editorial focus</h2><p>The homepage explains the writing themes, practical AI experiments, and research observations that make the publication worth returning to.</p></section>
            <section><h2>Trust signal</h2><p>Visitors can see the archive direction, the publication voice, and the next reading path without relying on generic shell copy.</p></section>
          </main>`,
          '  <footer class="site-footer footer-band"><div class="footer-inner"><div class="footer-brand"><strong>Northline Journal</strong><p>Focused AI articles and knowledge publishing.</p></div><div class="footer-links"><nav aria-label="Footer"><a href="/">Home</a><a href="/blog">Blog</a></nav></div><div class="footer-meta"><p>Calm, reliable, continuously updated writing.</p></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      },
      {
        path: "/blog/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog" aria-current="page">Blog</a></nav></header>',
          `  <main>
            <section><h1>Blog</h1><p>The archive route keeps a route-owned editorial opening with enough visible depth to avoid thin-content fallback noise.</p></section>
            <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="entry-card"><h2>Recent entries</h2><p>Visitors can move from the homepage into a compact archive surface with a clear reading path and stable navigation.</p></article></div></section>
            <section><h2>Reading context</h2><p>The archive keeps a concise footer summary and route links so readers can continue browsing without losing context.</p></section>
          </main>`,
          '  <footer class="site-footer footer-band"><div class="footer-inner"><div class="footer-brand"><strong>Northline Journal</strong><p>Focused AI articles and knowledge publishing.</p></div><div class="footer-links"><nav aria-label="Footer"><a href="/">Home</a><a href="/blog" aria-current="page">Blog</a></nav></div><div class="footer-meta"><p>Calm, reliable, continuously updated writing.</p></div></div></footer>',
          "</body></html>",
        ].join("\n"),
      },
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          pageBlueprints: [],
        },
        files,
        requirementText: "Portfolio blog site with a structured shared footer shell.",
        websiteSurfaceMode: "portfolio-blog-site",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("accepts structured page footers even when blog cards contain nested article footers", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Blog | About | Contact")],
      phase: "conversation",
    } as any);
    const sharedFooter = [
      '<footer class="site-footer">',
      '  <div class="site-footer__inner footer-band">',
      '    <div class="footer-brand"><a class="brand" href="/">Brand</a><p>Independent advisory practice.</p></div>',
      '    <div class="footer-links"><p class="footer-heading">Primary navigation</p><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></div>',
      '    <div class="footer-meta"><p class="footer-heading">Contact</p><a href="/contact">Project inquiry</a></div>',
      "  </div>",
      "</footer>",
    ].join("");
    const files = [
      {
        path: "/styles.css",
        content:
          ".site-footer{padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.site-footer__inner{display:grid}.footer-band{display:grid}.footer-brand{display:grid}.footer-links{display:grid}.footer-meta{display:grid}.card{padding:1rem}.card footer{display:flex}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>',
          "  <main><section><h1>Home</h1><p>Route specific content.</p></section></main>",
          `  ${sharedFooter}`,
          "</body></html>",
        ].join("\n"),
      },
      {
        path: "/blog/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="../styles.css" />',
          '  <script src="../script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>',
          '  <main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div class="article-ledger" data-shpitto-blog-list>',
          '    <article class="card article-card"><h2>Post A</h2><p>Archive summary.</p><footer><span>Tag A</span><span>Tag B</span></footer></article>',
          '    <article class="card article-card"><h2>Post B</h2><p>Archive summary.</p><footer><span>Tag C</span><span>Tag D</span></footer></article>',
          "  </div></section></main>",
          `  ${sharedFooter}`,
          "</body></html>",
        ].join("\n"),
      },
      {
        path: "/about/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="../styles.css" />',
          '  <script src="../script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>',
          "  <main><section><h1>About</h1><p>Route specific content.</p></section></main>",
          `  ${sharedFooter}`,
          "</body></html>",
        ].join("\n"),
      },
      {
        path: "/contact/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="../styles.css" />',
          '  <script src="../script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>',
          "  <main><section><h1>Contact</h1><p>Route specific content.</p></section></main>",
          `  ${sharedFooter}`,
          "</body></html>",
        ].join("\n"),
      },
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Institutional site with a structured shared footer shell.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("localizes known route anchors into switchable locale labels", () => {
    const html = [
      "<!doctype html><html><body>",
      "<footer>",
      '<p><a href="/products/">Products</a></p>',
      '<p><a href="/contact/">Contact</a></p>',
      "</footer>",
      "</body></html>",
    ].join("");

    const normalized = collapseVisibleBilingualPairsForTesting(html, "zh-CN");
    expect(normalized).toContain('data-i18n-zh="产品"');
    expect(normalized).toContain('data-i18n-en="Products"');
    expect(normalized).toContain(">产品</a>");
    expect(normalized).toContain('data-i18n-zh="联系"');
  });

  it("classifies wrapped upstream body timeout errors as retryable", () => {
    const error = new TypeError("terminated") as TypeError & { cause?: Error & { code?: string } };
    error.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });

    expect(isRetryableProviderError(error)).toBe(true);
  });

  it("retries an upstream timeout with the same message context", async () => {
    const messages = [new HumanMessage("generate current target")];
    const seenMessages: unknown[] = [];
    let calls = 0;
    const timeoutError = new TypeError("terminated") as TypeError & { cause?: Error & { code?: string } };
    timeoutError.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });
    const model = {
      invoke: async () => ({ content: "" }),
      stream: async (inputMessages: any) => {
        seenMessages.push(inputMessages);
        calls += 1;
        if (calls === 1) throw timeoutError;
        return streamFrom([{ content: "ok" }]);
      },
    };

    const message = await invokeModelWithRetry({
      model,
      messages,
      idleTimeoutMs: 5000,
      absoluteTimeoutMs: 10_000,
      operation: "unit-retry",
      retries: 1,
    });

    expect(String(message.content || "")).toBe("ok");
    expect(calls).toBe(2);
    expect(seenMessages).toEqual([messages, messages]);
  });

  it("falls back to the next provider when a round exhausts retryable timeouts", async () => {
    const timeoutError = Object.assign(new Error("terminated"), {
      name: "TypeError",
    }) as Error & { cause?: Error & { code?: string } };
    timeoutError.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });
    const seenProviders: string[] = [];
    const seenToolChoices: any[] = [];

    const result = await invokeWebsiteSkillRoundWithProviderFallbackForTesting({
      preferredProvider: "pptoken",
      attempts: [
        {
          config: {
            provider: "pptoken",
            apiKey: "pptoken-key",
            baseURL: "https://pptoken.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
        {
          config: {
            provider: "aiberm",
            apiKey: "aiberm-key",
            baseURL: "https://aiberm.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
      ],
      objective: {
        targetFiles: ["/products/index.html"],
        instruction: "Emit the products page.",
        strictSingleTarget: true,
      },
      invokeRound: async ({ config, toolChoice }) => {
        seenProviders.push(`${config.provider}/${config.modelName}`);
        seenToolChoices.push(toolChoice);
        if (config.provider === "pptoken") {
          throw timeoutError;
        }
        return {
          assistant: "ok",
          tool_calls: [{ name: "finish", args: {} }],
        };
      },
    });

    expect(seenProviders).toEqual(["pptoken/gpt-5.4-mini", "aiberm/gpt-5.4-mini"]);
    expect(seenToolChoices).toEqual(["required", "required"]);
    expect(result.provider).toBe("aiberm");
    expect(result.model).toBe("gpt-5.4-mini");
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("provider_round_fallback:pptoken/gpt-5.4-mini");
  });

  it("falls back to the next provider when a round fails with provider access errors", async () => {
    const seenProviders: string[] = [];

    const result = await invokeWebsiteSkillRoundWithProviderFallbackForTesting({
      preferredProvider: "pptoken",
      attempts: [
        {
          config: {
            provider: "pptoken",
            apiKey: "pptoken-key",
            baseURL: "https://pptoken.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
        {
          config: {
            provider: "aiberm",
            apiKey: "aiberm-key",
            baseURL: "https://aiberm.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
      ],
      objective: {
        targetFiles: ["/index.html"],
        instruction: "Emit the homepage.",
        strictSingleTarget: true,
      },
      invokeRound: async ({ config }) => {
        seenProviders.push(`${config.provider}/${config.modelName}`);
        if (config.provider === "pptoken") {
          throw new Error("403 status code (no body)");
        }
        return {
          assistant: "ok",
          tool_calls: [{ name: "finish", args: {} }],
        };
      },
    });

    expect(seenProviders).toEqual(["pptoken/gpt-5.4-mini", "aiberm/gpt-5.4-mini"]);
    expect(result.provider).toBe("aiberm");
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("provider_round_fallback:pptoken/gpt-5.4-mini");
    expect(result.notes[0]).toContain("403 status code");
  });

  it("normalizes openai-prefixed lightweight round overrides for crazyroute", () => {
    const previousHomeRoundModel = process.env.LLM_MODEL_HOME_ROUND;
    try {
      process.env.LLM_MODEL_HOME_ROUND = "openai/gpt-5.4-mini";

      const resolved = resolveWebsiteSkillRoundProviderConfigForTesting(
        {
          provider: "crazyroute",
          apiKey: "mock",
          baseURL: "https://crazyrouter.example/v1",
          defaultHeaders: {},
          modelName: "gpt-5.4",
        },
        {
          targetFiles: ["/index.html"],
          instruction: "Emit the homepage.",
          strictSingleTarget: true,
        },
      );

      expect(resolved.modelName).toBe("gpt-5.4-mini");
    } finally {
      if (previousHomeRoundModel === undefined) delete process.env.LLM_MODEL_HOME_ROUND;
      else process.env.LLM_MODEL_HOME_ROUND = previousHomeRoundModel;
    }
  });

  it("routes a generation unit bridge through provider fallback", async () => {
    const state: any = {
      messages: [new HumanMessage("Build a website with Home and Products routes.")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const routeSummary: RouteUnitContractSummary = {
      route: "/products",
      navLabel: "Products",
      pageKind: "intent",
      owner: "brand",
      routeContract: ["route=/products", "navLabel=Products", "purpose=Products route"],
      inheritedTerminology: ["corporate-b2b-site"],
      inheritedTokens: ["#2563EB"],
      inheritedSeedSkillIds: ["open-design-web-prototype"],
      openingFamily: "catalog",
      openingTopology: "catalog lead band -> assortment navigator",
      mediaPlan: ["- slot_owner: catalog-lead proof slot"],
      mediaResources: [
        {
          resourceId: "products-media-01",
          route: "/products",
          slotOwner: "catalog-lead proof slot",
          imagePurpose: "product proof",
          placementBand: "inside the opening catalog lead",
          preferredRatio: "4:3",
        },
      ],
    };
    const timeoutError = Object.assign(new Error("terminated"), {
      name: "TypeError",
    }) as Error & { cause?: Error & { code?: string } };
    timeoutError.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });
    const seenProviders: string[] = [];
    const adapter = createSkillExecutionGenerationWorkerAdapter({
      skillAdapter: createWebsiteGenerationSkillAdapter("website-generation-workflow"),
      decision,
      stylePreset: DEFAULT_STYLE_PRESET,
      styleName: "Provider Bridge Smoke",
      styleReason: "Route-unit provider fallback bridge test.",
      requirementText: "Build Products.",
      totalRounds: 1,
      invokeRound: async ({ input, prompt, objective }) => {
        const fallbackResult = await invokeWebsiteSkillRoundWithProviderFallbackForTesting({
          preferredProvider: "pptoken",
          attempts: [
            {
              config: {
                provider: "pptoken",
                apiKey: "pptoken-key",
                baseURL: "https://pptoken.example/v1",
                defaultHeaders: {},
                modelName: "gpt-5.4",
              },
            },
            {
              config: {
                provider: "aiberm",
                apiKey: "aiberm-key",
                baseURL: "https://aiberm.example/v1",
                defaultHeaders: {},
                modelName: "gpt-5.4",
              },
            },
          ],
          objective,
          invokeRound: async ({ config, messages }) => {
            seenProviders.push(`${config.provider}/${config.modelName}`);
            expect(String(messages[0]?.content || "")).toContain("test");
            expect(prompt).toContain("Round objective:");
            expect(prompt).toContain("/products/index.html");
            if (config.provider === "pptoken") throw timeoutError;
            return {
              assistant: "ok",
              tool_calls: [{ name: "finish", args: {} }],
            };
          },
        });
        return {
          unitId: input.unitId,
          status: "passed",
          files: objective.targetFiles.map((targetFile) => ({
            path: targetFile,
            content: `provider=${fallbackResult.provider}; model=${fallbackResult.model}`,
            type: "text/html",
          })),
          summary: fallbackResult.notes.join("\n"),
        };
      },
    });
    const result = await adapter.runUnit(
      buildGenerationUnitInputFromRouteContract({
        summary: routeSummary,
        targetFiles: ["/products/index.html"],
      }),
    );

    expect(seenProviders).toEqual(["pptoken/gpt-5.4-mini", "aiberm/gpt-5.4-mini"]);
    expect(result.status).toBe("passed");
    expect(result.files[0]?.content).toContain("provider=aiberm");
    expect(result.summary).toContain("provider_round_fallback:pptoken/gpt-5.4-mini");
  });

  it("preserves provider metadata when a route-unit bridge worker recovers on fallback", async () => {
    const adapter = createStaticGenerationWorkerAdapter({
      id: "bridge-worker-test",
      capabilities: ["route-unit"],
      runUnit: async (input) => ({
        unitId: input.unitId,
        status: "passed",
        provider: "aiberm",
        model: "gpt-5.4-mini",
        files: [
          {
            path: "/products/index.html",
            content: "<!doctype html><html><body><main><h1>Products</h1></main></body></html>",
            type: "text/html",
          },
        ],
        summary: "Recovered on fallback provider.",
        notes: ["provider_round_fallback:pptoken/gpt-5.4-mini"],
      }),
    });

    const result = await adapter.runUnit({
      unitId: "route-products",
      route: "/products",
      targetFiles: ["/products/index.html"],
      prompt: "Generate products route.",
      context: {},
    });

    expect(result.status).toBe("passed");
    expect(result.provider).toBe("aiberm");
    expect(result.model).toBe("gpt-5.4-mini");
    expect(result.notes).toContain("provider_round_fallback:pptoken/gpt-5.4-mini");
  });

  it("gates provider route-unit bridge to hybrid isolated interior HTML rounds with explicit opt-out", () => {
    const previousBridge = process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE;
    const previousGenerator = process.env.SHPITTO_SITE_GENERATOR;
    try {
      delete process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE;
      delete process.env.SHPITTO_SITE_GENERATOR;
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/products/index.html"],
          instruction: "Products",
          strictSingleTarget: true,
        }),
      ).toBe(true);
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/index.html"],
          instruction: "Home",
          strictSingleTarget: true,
        }),
      ).toBe(true);

      process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE = "0";
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/products/index.html"],
          instruction: "Products",
          strictSingleTarget: true,
        }),
      ).toBe(false);

      process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE = "1";
      process.env.SHPITTO_SITE_GENERATOR = "native";
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/products/index.html"],
          instruction: "Products",
          strictSingleTarget: true,
        }),
      ).toBe(true);
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/index.html"],
          instruction: "Home",
          strictSingleTarget: true,
        }),
      ).toBe(true);
      expect(
        shouldUseRouteUnitProviderBridgeForTesting({
          targetFiles: ["/products/index.html", "/styles.css"],
          instruction: "Mixed",
          strictSingleTarget: false,
        }),
      ).toBe(false);
    } finally {
      if (previousBridge === undefined) delete process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE;
      else process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE = previousBridge;
      if (previousGenerator === undefined) delete process.env.SHPITTO_SITE_GENERATOR;
      else process.env.SHPITTO_SITE_GENERATOR = previousGenerator;
    }
  });

  it("does not retry malformed provider URL errors before surfacing the failure", async () => {
    let invokeCount = 0;

    await expect(
      invokeModelWithRetry({
        model: {
          invoke: async () => {
            invokeCount += 1;
            throw new Error("TypeError: fetch failed | Error: bad port");
          },
        },
        messages: [new HumanMessage("test")],
        idleTimeoutMs: 5_000,
        absoluteTimeoutMs: 10_000,
        operation: "unit-test-bad-port",
        retries: 2,
      }),
    ).rejects.toThrow(/bad port/i);

    expect(invokeCount).toBe(1);
  });

  it("skips providers that already failed preflight for the current stage", async () => {
    const seenProviders: string[] = [];

    const result = await invokeWebsiteSkillRoundWithProviderFallbackForTesting({
      preferredProvider: "aiberm",
      excludedProviders: ["pptoken"],
      attempts: [
        {
          config: {
            provider: "pptoken",
            apiKey: "pptoken-key",
            baseURL: "https://pptoken.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
        {
          config: {
            provider: "aiberm",
            apiKey: "aiberm-key",
            baseURL: "https://aiberm.example/v1",
            defaultHeaders: {},
            modelName: "gpt-5.4",
          },
        },
      ],
      objective: {
        targetFiles: ["/casux-information-platform/index.html"],
        instruction: "Emit the information platform page.",
        strictSingleTarget: true,
      },
      invokeRound: async ({ config }) => {
        seenProviders.push(`${config.provider}/${config.modelName}`);
        return {
          assistant: "ok",
          tool_calls: [{ name: "finish", args: {} }],
        };
      },
    });

    expect(seenProviders).toEqual(["aiberm/gpt-5.4-mini"]);
    expect(result.provider).toBe("aiberm");
    expect(result.model).toBe("gpt-5.4-mini");
  });

  it("builds page-specific contracts for distinct HTML generation", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
        ),
      ],
      phase: "conversation",
    } as any);

    expect(htmlPathToRoute("/3c-machines/index.html")).toBe("/3c-machines");
    const machinesContract = formatTargetPageContract(plan, "/3c-machines/index.html");
    expect(machinesContract).toContain("Target page contract:");
    expect(machinesContract).toContain("Page intent:");
    expect(machinesContract).toContain("Canonical Website Prompt is authoritative");
    expect(machinesContract).toContain("Do not apply a hardcoded industry skeleton");
    expect(machinesContract).toContain("Shared Shell/Footer Contract");

    const contactContract = formatTargetPageContract(plan, "/contact/index.html");
    expect(contactContract).toContain('Dedicated page for "Contact"');
    expect(contactContract).toContain("Sibling page intents");
  });

  it("adds page-type-specific guidance for focused product rounds", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a 6-page industrial-style English website for LC-CNC: Home, Products, Custom Solutions, Cases, About, Contact.",
        ),
      ],
      phase: "conversation",
    } as any);

    const productsContract = formatTargetPageContract(plan, "/products/index.html", "", { focused: true });
    expect(productsContract).toContain("Product page gate");
    expect(productsContract).toContain("grouped offers");
    expect(productsContract).toContain("Primary sibling contrast routes:");
    expect(productsContract).not.toContain("Sibling page intents to stay visually distinct from:");
  });

  it("keeps the website quality contract aligned with concrete anti-slop rules", () => {
    const contract = renderWebsiteQualityContract();

    expect(contract).toContain("Navigation must use meaningful route labels");
    expect(contract).toContain("Footer must contribute real site content");
    expect(contract).toContain("Mobile nav may collapse visually");
    expect(contract).toContain("new page");
    expect(contract).toContain("External imagery must come from source-backed or project-owned assets");
    expect(contract).toContain("Metrics must be source-backed");
    expect(contract).toContain("non-negative letter-spacing");
    expect(contract).toContain("raw hex colors are allowed only inside the `:root` token block");
  });

  it("fails qa when a route page drops the shared shell defined on home", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a website with Home and Pricing pages.")],
      phase: "conversation",
      sitemap: ["/", "/pricing"],
    } as any);

    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: "body{font-family:system-ui;} header,footer{padding:16px;} nav{display:flex;gap:12px;}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          "<header><nav><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a></nav></header>",
          "<main><h1>Home</h1><p>Home content with a coherent shell.</p></main>",
          "<footer><a href=\"/\">Home</a><a href=\"/pricing/\">Pricing</a><p>Footer summary</p></footer>",
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
      {
        path: "/pricing/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          "<main><h1>Pricing</h1><p>This page incorrectly drops the shared header and footer shell.</p></main>",
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
    ];

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build a website with Home and Pricing pages.",
      }),
    ).toThrow(/shared navigation shell/i);
  });

  it("returns structured qa summary for validated files", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /contact.")],
      phase: "conversation",
    } as any);

    const validated = validateAndNormalizeRequiredFilesWithQa({
      decision,
      files: validGeneratedFiles(decision.routes),
      requirementText: "Build routes / and /contact.",
    });

    expect(validated.files.length).toBeGreaterThan(0);
    expect(validated.qaSummary.totalRoutes).toBe(decision.routes.length);
    expect(validated.qaSummary.passedRoutes).toBe(decision.routes.length);
    expect(validated.qaSummary.averageScore).toBeGreaterThan(0);
    expect(Array.isArray(validated.qaRecords)).toBe(true);
  });

  it("workflow adapter enforces the corporate homepage contract when surface mode is corporate-b2b-site", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a company website for enterprise buyers with cases.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          websiteSurfaceMode: "corporate-b2b-site",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/cases"],
          navLabels: ["Home", "Cases"],
          files: ["/styles.css", "/script.js", "/index.html", "/cases/index.html"],
        },
      },
    } as any);

    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: ".media-frame{border:1px solid #ddd}.ph-img{min-height:280px;background:#eee}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          "<header><nav><a href=\"/\">Home</a><a href=\"/cases/\">Cases</a></nav></header>",
          "<main>",
          '  <section class="hero"><div class="hero__grid"><div class="hero__content"><h1>Technical proof above the fold</h1></div><div class="media-frame"><div class="ph-img" role="img" aria-label="Placeholder visual"></div></div></div></section>',
          "</main>",
          "<footer><a href=\"/\">Home</a><a href=\"/cases/\">Cases</a><p>Footer summary</p></footer>",
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
      {
        path: "/cases/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          "<header><nav><a href=\"/\">Home</a><a href=\"/cases/\">Cases</a></nav></header>",
          "<main><h1>Cases</h1><p>Evidence-led case studies.</p></main>",
          "<footer><a href=\"/\">Home</a><a href=\"/cases/\">Cases</a><p>Footer summary</p></footer>",
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
    ];

    expect(() =>
      createWebsiteGenerationSkillAdapter("website-generation-workflow").validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build homepage",
        websiteSurfaceMode: "corporate-b2b-site",
      }),
    ).toThrow(/corporate-b2b homepage contract|placeholder media scaffolding|enterprise-hero markup/i);
  });

  it("blocks surface-specific sites that fall back to the shared green-white token family", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a resource and research hub homepage for policy researchers.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["Home"],
          files: ["/styles.css", "/script.js", "/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content:
              ":root{--bg:#fff;--surface:#f5fbf7;--text:#12312a;--primary:#2e8b57;--accent:#8bc34a;} body{background:var(--bg);color:var(--text)} .card{background:var(--surface)}",
          }
        : file,
    );

  expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build a resource and research hub homepage for policy researchers.",
      }),
    ).toThrow(/violates surface visual token contract/i);
  });

  it("allows content-hub green tokens when the requirement explicitly calls for a child-friendly institutional palette", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a child-friendly standards and research hub for educational institutions.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["Home"],
          files: ["/styles.css", "/script.js", "/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content:
              ":root{--bg:#fff;--surface:#f5fbf7;--panel:#fff;--text:#12312a;--muted:#51635c;--border:#d7e7dd;--primary:#2e8b57;--accent:#f59e0b;} body{background:var(--bg);color:var(--text)} .card{background:var(--surface)}",
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText:
          "Build a child-friendly institutional standards and research hub. The ecological green #2E8B57 plus white palette with warm orange accents is authoritative.",
      }),
    ).not.toThrow();
  });

  it("flags docs and content-hub homepages that miss their surface-owned archetype classes", () => {
    const docsDecision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a documentation and API reference homepage.")],
      phase: "conversation",
      workflow_context: { promptControlManifest: { routes: ["/"], navLabels: ["Home"], files: ["/index.html"] } },
    } as any);
    const hubDecision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a resource and research hub homepage for policy researchers.")],
      phase: "conversation",
      workflow_context: { promptControlManifest: { routes: ["/"], navLabels: ["Home"], files: ["/index.html"] } },
    } as any);

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="hero"><div class="hero-grid"><article class="card">Reference material</article></div></section></main>',
        pagePath: "/index.html",
        decision: docsDecision,
        requirementText: "Build a documentation and API reference homepage.",
      }).join(" | "),
    ).toContain("docs-knowledge-site homepage lacks route-owned docs workspace");

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="hero"><div class="card-grid"><article class="card">Research</article></div></section></main>',
        pagePath: "/index.html",
        decision: hubDecision,
        requirementText: "Build a resource and research hub homepage for policy researchers.",
      }).join(" | "),
    ).toContain("content-hub-site homepage lacks route-owned collection/index");

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="docs-workspace"><div class="docs-index-rail"></div><div class="reference-matrix"></div></section></main>',
        pagePath: "/index.html",
        decision: docsDecision,
        requirementText: "Build a documentation and API reference homepage.",
      }),
    ).toEqual([]);

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="hero docs-home"><div class="hero__grid docs-workspace"><div class="hero__copy"><h1>Meridian reference</h1></div><aside class="hero__panel docs-index-rail">Guides</aside></div></section></main>',
        pagePath: "/index.html",
        decision: docsDecision,
        requirementText: "Build a documentation and API reference homepage.",
      }).join(" | "),
    ).toContain("docs-knowledge-site homepage still uses generic marketing hero utility geometry");

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="collection-home"><div class="hero-grid"><div class="hero-copy archive-masthead"><h1>Research hub</h1></div><aside class="hero-visual institutional-context">Ledger</aside></div></section></main>',
        pagePath: "/index.html",
        decision: hubDecision,
        requirementText: "Build a resource and research hub homepage for policy researchers.",
      }).join(" | "),
    ).toContain("content-hub-site homepage still uses generic marketing hero utility geometry");

    expect(
      findSurfaceHomepageArchetypeIssuesForTesting({
        html: '<main><section class="hero-wrap"><div class="container hero"><div class="hero__body collection-home archive-masthead"><h1>Research hub</h1></div><div class="hero-aside institutional-context">Ledger</div></div></section></main>',
        pagePath: "/index.html",
        decision: hubDecision,
        requirementText: "Build a resource and research hub homepage for policy researchers.",
      }).join(" | "),
    ).toContain("content-hub-site homepage still uses generic marketing hero utility geometry");
  });

  it("blocks reveal CSS that hides route content before static preview interaction", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a corporate B2B homepage.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content: `${file.content}\n[data-reveal] { opacity: 0; transform: translateY(12px); transition: opacity .4s ease; }\n[data-reveal].is-visible { opacity: 1; }`,
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build a corporate B2B homepage.",
      }),
    ).toThrow(/hides route content before preview interaction/i);
  });

  it("blocks placeholder or partial CSS that leaves the preview unstyled", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a corporate B2B homepage.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content: "/* placeholder */\n.enterprise-hero { min-height: 40rem; }",
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build a corporate B2B homepage.",
      }),
    ).toThrow(/incomplete shared site CSS/i);
  });

  it("blocks CSS that does not cover the generated HTML class structure", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a resource and research hub homepage for policy researchers.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["Home"],
          files: ["/styles.css", "/script.js", "/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(["/"]).map((file) => {
      if (file.path === "/styles.css") {
        return {
          ...file,
          content: [
            "body{margin:0;color:#261A13;background:#F5EFE6}",
            ".shpitto-stock-media{display:grid}",
            ".enterprise-hero{min-height:40rem}",
            ".enterprise-hero__media img{object-fit:cover}",
          ].join("\n"),
        };
      }
      if (file.path === "/index.html") {
        return {
          ...file,
          content: [
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><link rel=\"stylesheet\" href=\"/styles.css\"><script src=\"/script.js\"></script></head><body>",
            "<header class=\"site-header\"><div class=\"site-header__inner container\"><a class=\"brand\" href=\"/\">Civic Standards Lab</a></div></header>",
            "<main><section class=\"collection-home archive-masthead section\"><div class=\"container collection-home__grid\"><div class=\"collection-home__intro\"><h1>Practical standards intelligence for policy teams.</h1><p class=\"lead\">A curated resource home for standards, research notes, and implementation guidance.</p><div class=\"action-row\"><a class=\"btn btn--primary\" href=\"#resources\">Browse resources</a></div></div></div></section><section id=\"resources\" class=\"resource-shelf section\"><div class=\"shelf-grid\"><article class=\"feature-card\"><h2>Resource shelf</h2><p>Find standards and methods.</p></article></div></section></main>",
            "<footer class=\"site-footer\"><div class=\"site-footer__inner container\">Footer</div></footer></body></html>",
          ].join(""),
        };
      }
      return file;
    });

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision,
        files,
        requirementText: "Build a resource and research hub homepage for policy researchers.",
      }),
    ).toThrow(/CSS styles only .* emitted HTML classes/i);
  });

  it("ignores locale mirror routes from state sitemap when bilingual support is toggle-based", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English personal blog with Home, Blog, About, Contact.")],
      phase: "conversation",
      sitemap: ["/", "/blog", "/about", "/contact", "/zh"],
    } as any);

    const required = requiredFileChecklistForTesting(decision as any, {
      requirementText: "Build a bilingual Chinese and English personal blog with Home, Blog, About, Contact.",
    });

    expect(required).not.toContain("/zh/index.html");
  });

  it("filters implementation-mechanics routes from sitemap-derived required files", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English personal blog with Home and Blog.")],
      phase: "conversation",
      sitemap: ["/", "/blog", "/storage/runtime/hydration/fallback"],
    } as any);

    const required = requiredFileChecklistForTesting(decision, {
      requirementText: "Build a bilingual Chinese and English personal blog with Home and Blog.",
    });

    expect(required).not.toContain("/storage/runtime/hydration/fallback/index.html");
  });

  it("keeps the default portfolio-blog first pass index-first without requiring blog detail files", () => {
    const requirement =
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. The first pass only needs a strong blog index and profile-led homepage.";
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      sitemap: ["/", "/blog", "/about", "/contact"],
    } as any);

    const required = requiredFileChecklistForTesting(decision, {
      requirementText: requirement,
    });

    expect(required).toEqual(
      expect.arrayContaining([
        "/styles.css",
        "/script.js",
        "/index.html",
        "/blog/index.html",
        "/about/index.html",
        "/contact/index.html",
      ]),
    );
    expect(required.filter((file) => file.startsWith("/blog/") && file !== "/blog/index.html")).toEqual([]);
  });

  it("strips live blog detail anchors from /blog/index.html during index-first portfolio-blog preview normalization", () => {
    const requirement =
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. The first pass only needs a strong blog index and profile-led homepage. Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.";
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      sitemap: ["/", "/blog", "/about", "/contact"],
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          websiteSurfaceMode: "portfolio-blog-site",
          routes: ["/", "/blog", "/about", "/contact"],
          navLabels: ["Home", "Blog", "About", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/about/index.html", "/contact/index.html"],
        },
      },
    } as any);

    const normalized = normalizeWebsiteStaticFilesForPreview({
      decision,
      requirementText: requirement,
      files: validGeneratedFiles(decision.routes).map((file) =>
        file.path === "/blog/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                /<main>[\s\S]*<\/main>/,
                `<main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card"><h2><a href="/blog/ai-opportunity-scan/">AI opportunity scan</a></h2><p>Summary.</p></article></div></section></main>`,
              ),
            }
          : file,
      ),
    });

    const blogHtml = String(normalized.find((file) => file.path === "/blog/index.html")?.content || "");
    expect(blogHtml).not.toContain('href="/blog/ai-opportunity-scan/"');
    expect(blogHtml).toContain("<span");
    expect(blogHtml).toContain("AI opportunity scan");
  });

  it("counts mixed-language Chinese blog requests when resolving round budgets", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("我想做个个人简历网站，需要3篇blog体现我的价值。")],
      phase: "conversation",
      sitemap: ["/", "/blog"],
    } as any);

    expect(resolveWebsiteSkillMaxToolRoundsForAdapter(decision, "我想做个个人简历网站，需要3篇blog体现我的价值。")).toBe(13);
  });

  it("adds repair slack for route-heavy sites with a homepage and multiple collection surfaces", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a multi-page company website from uploaded materials.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          routes: [
            "/",
            "/casux-creation",
            "/casux-construction",
            "/casux-certification",
            "/casux-advocacy",
            "/casux-research-center",
            "/casux-information-platform",
            "/standards-system",
            "/case-studies",
          ],
          navLabels: [
            "Home",
            "Creation",
            "Construction",
            "Certification",
            "Advocacy",
            "Research",
            "Information",
            "Standards",
            "Cases",
          ],
        },
      },
    } as any);
    decision.pageBlueprints = [
      {
        route: "/casux-certification",
        navLabel: "Certification",
        purpose: "Directory route.",
        source: "explicit_route",
        constraints: [],
        pageKind: "search-directory",
        responsibility: "Directory",
        contentSkeleton: ["lead", "filters", "results", "cta"],
        componentMix: { hero: 15, feature: 10, grid: 35, proof: 20, form: 10, cta: 10 },
      },
      {
        route: "/casux-research-center",
        navLabel: "Research",
        purpose: "Research collection.",
        source: "explicit_route",
        constraints: [],
        pageKind: "content-collection-index",
        responsibility: "Collection",
        contentSkeleton: ["lead", "collection", "results", "cta"],
        componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information",
        purpose: "Information collection.",
        source: "explicit_route",
        constraints: [],
        pageKind: "content-collection-index",
        responsibility: "Collection",
        contentSkeleton: ["lead", "collection", "results", "cta"],
        componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
      },
    ] as any;

    expect(resolveWebsiteSkillMaxToolRoundsForAdapter(decision, "Chinese company website with collection surfaces.")).toBe(20);
  });

  it("prefers prompt-control surface mode over stale workflow skill ids", () => {
    const selection = resolveWorkflowSurfaceSelectionForTesting({
      websiteTypeSkillId: "docs-knowledge-site",
      websiteDiscoveryBrief: {
        surfaceMode: "docs-knowledge-site",
        audience: ["developers"],
      },
      promptControlManifest: {
        websiteSurfaceMode: "content-hub-site",
        discoveryBrief: {
          surfaceMode: "content-hub-site",
          audience: ["institutional_buyers"],
          primaryGoal: "institutional_trust, resource_discovery, program_introduction",
          routes: ["/", "/casux-information-platform"],
          sourcePriority: "uploaded_files",
          localeMode: "bilingual",
          visualDirectionId: "institutional-child-friendly",
          immutableConstraints: ["brand:CASUX"],
        },
      },
    } as any);

    expect(selection.websiteSurfaceMode).toBe("content-hub-site");
    expect(selection.discoveryBrief?.surfaceMode).toBe("content-hub-site");
  });

  it("routes flat footer shell repairs back through shared css", () => {
    const targets = extractQaRepairTargetsForTesting(
      "skill_tool_invalid_required_file: /index.html collapses the shared footer into a flat link row instead of a structured footer shell",
    );

    expect(targets).toEqual(expect.arrayContaining(["/index.html", "/styles.css"]));
  });

  it("extracts all repeated split-hero route pages as repair targets", () => {
    const targets = extractQaRepairTargetsForTesting(
      "skill_tool_invalid_required_file: repeated primary routes fell back to the same legacy split-hero opening template (/casux-creation, /casux-research-center, /casux-information-platform); give sibling routes distinct opening structures",
    );

    expect(targets).toEqual(
      expect.arrayContaining([
        "/casux-creation/index.html",
        "/casux-research-center/index.html",
        "/casux-information-platform/index.html",
      ]),
    );
  });

  it("derives expected required file count from actual requested content count before detail slugs exist", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("我想做个个人简历网站，需要3篇blog体现我的价值。")],
      phase: "conversation",
      sitemap: ["/", "/blog"],
    } as any);

    expect(
      resolveExpectedRequiredFileCountForTesting({
        decision,
        adapter: {
          buildRequiredFileChecklist: requiredFileChecklistForTesting,
        } as any,
        requirementText: "我想做个个人简历网站，需要3篇blog体现我的价值。",
      }),
    ).toBe(7);
  });

  it("scales round timeout budget with the number of target files", () => {
    const singleFile = resolveRoundTimeoutsForTesting({
      taskTimeoutMs: 10_000_000,
      targetFileCount: 1,
    });
    const fourFiles = resolveRoundTimeoutsForTesting({
      taskTimeoutMs: 10_000_000,
      targetFileCount: 4,
    });

    expect(fourFiles.idleTimeoutMs).toBeGreaterThan(singleFile.idleTimeoutMs);
    expect(fourFiles.absoluteTimeoutMs).toBeGreaterThan(singleFile.absoluteTimeoutMs);
    expect(fourFiles.absoluteTimeoutMs).toBe(singleFile.absoluteTimeoutMs * 4);
  });

  it("locks the website quality contract wording with a snapshot", () => {
    expect(renderWebsiteQualityContract()).toMatchInlineSnapshot(`
      "## Website Quality Contract
      - Runtime scope is website generation only; do not generate mobile apps, slide decks, native app screens, or external coding-agent instructions.
      - One generated website must render correctly in desktop browser, MacBook, iPad, iPhone, and Android preview shells.
      - Treat preview as WYSIWYG: navigation, layout, media, forms, and responsive breakpoints must work inside iframe preview.
      - Use the selected local design system as the visual source of truth for color, typography, spacing, radius, shadows, motion, and component rhythm.
      - Avoid AI-slop defaults: no placeholder copy, no generic Feature 1/2/3 grids, no anonymous testimonials, no fake metrics, no repeated card modules across pages.
      - Navigation must use meaningful route labels; do not leave desktop or mobile nav shells as generic menu/navigation/quick links scaffolds.
      - Navigation and footer must not expose undeclared internal routes; every visitor-facing site link in the shared shell must belong to the confirmed route plan unless it is an approved external destination or asset.
      - Footer must contribute real site content; avoid copyright-only placeholders, label-only footers, or generic legal shells that add no value.
      - Footer must use a structured shell with a distinct footer band plus separate identity, navigation, and support/meta zones when the shared CSS defines footer-shell utilities; do not collapse the footer into a flat row of links.
      - Mobile nav may collapse visually, but it still needs the same meaningful destinations as desktop rather than a menu-only placeholder shell.
      - Homepage first screen must identify the brand, object, institution, person, product, or business category before broad value propositions; the first viewport must not read as an interchangeable SaaS or agency template.
      - Every route must include concrete nouns from the confirmed brief, uploaded/domain/source material, selected surface mode, or route role. Do not rely on abstract filler such as solutions, innovation, excellence, seamless, powerful, or future-ready without subject-specific details.
      - Page archetypes must stay distinct: home establishes identity and visitor path, products/catalog supports comparison, solutions/services explains process or scenario fit, cases/proof shows evidence, about builds trust, contact clarifies conversion expectations, docs/reference supports wayfinding, content hubs organize resources, and blogs/editorial surfaces foreground writing.
      - CTA labels must describe the route-specific next action. Do not repeat generic labels such as Learn More, Get Started, Read More, or Submit as the dominant action system across the site.
      - Mobile composition must be readable without text collisions: headings, CTA groups, cards, stats, and nav labels must fit their containers and must not push the first meaningful content below decorative empty space.
      - When refine or generation creates a new page, that page must reuse the current site's active theme and the same shared navigation/footer shell unless the brief explicitly requests a shell redesign.
      - External imagery must come from source-backed or project-owned assets; do not ship example.com, placeholder.com, or other demo/stock placeholder URLs.
      - Public contact details and outbound URLs must be publishable; do not ship reserved placeholder domains such as \`.example\`, \`.test\`, \`.invalid\`, \`localhost\`, or \`example.com\` in visible copy or href/src attributes.
      - Metrics must be source-backed; do not invent percentages, multipliers, "hours saved", growth, or conversion-lift claims without brief or citation support.
      - Visual direction must be distinctive: expressive type pairing, intentional background system, layered sections, strong hero composition, and mobile-specific composition.
      - CSS must include responsive strategy using media queries, container queries, or clamp-based fluid sizing.
      - Typography safety: keep generated UI text at non-negative letter-spacing by default. Use \`letter-spacing: 0\` for body text, headings, buttons, and links unless a small uppercase label explicitly needs positive tracking.
      - CSS color discipline: raw hex colors are allowed only inside the \`:root\` token block. Outside \`:root\`, use \`var(...)\`, \`rgba(...)\`, or \`color-mix(...)\` from tokens; do not put hex fallbacks inside component selectors.
      - Every page must contain enough route-specific content depth to stand alone; sibling pages must not be superficial copies.
      - When the workflow explicitly requires Blog detail pages, each detail route must be a complete publishable article with a real body, meaningful section structure, and enough route-specific substance to read as finished content rather than a shell, stub, or metadata-only placeholder.
      - Route / must always read as the official homepage and institutional overview, not as a downloads hub, certification portal, or login page.
      - If a hero visual rail is tall, it must contain real media, chart, or data-viz content; do not leave a large empty visual card with only bottom-aligned text.
      - Result cards rendered inside a 12-column grid must span the full available row unless the design explicitly calls for a narrower card layout.
      - Final HTML must include viewport meta, semantic landmarks, accessible labels, keyboard-safe interactions, and shared stylesheet/script references."
    `);
  });

  it("keeps person-led homepages distinct from downstream blog archives", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          [
            "Build a personal bilingual blog for Bays Wong with pages Home, Blog, About, Contact.",
            "The homepage should introduce Bays Wong, his career highlights, and why his writing matters.",
            "The blog page is the article archive and should not replace the homepage introduction.",
          ].join(" "),
        ),
      ],
      phase: "conversation",
    } as any);

    const homeContract = formatTargetPageContract(plan, "/index.html");
    expect(homeContract).toContain("the home hero and first substantive section must introduce that person");
    expect(homeContract).toContain("The blog/content index is downstream distribution, not the homepage identity.");
  });

  it("forbids official homepages from enumerating sibling route families in the title or first lead", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build the official CASUX website with Home, Creation, Construction, Certification, Advocacy, Research Center, and Information Platform. Route / must be the institutional overview rather than a route directory.",
        ),
      ],
      phase: "conversation",
    } as any);

    const homeContract = formatTargetPageContract(plan, "/index.html");
    expect(homeContract).toContain("must not enumerate sibling route families");
    expect(homeContract).toContain("Creation, Construction, Certification, Advocacy, Research Center, Information Platform");
    expect(homeContract).toContain("Summarize the institutional mission at a higher level");
  });

  it("forbids institution-led homepages from drifting into support-entry identity", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build the official CASUX website with Home, Creation, Construction, Certification, Advocacy, Research Center, and Information Platform. Route / must be the institutional overview rather than a route directory.",
        ),
      ],
      phase: "conversation",
    } as any);

    const homeContract = formatTargetPageContract(plan, "/index.html");
    expect(homeContract).toContain("must still read like an umbrella-institution overview");
    expect(homeContract).toContain("support-entry, consultation-entry, information-entry, certification-explainer, or contact-intake framing");
    expect(homeContract).toContain("Do not compress the homepage into a thin overview followed immediately by support routing");
  });

  it("adds explicit home feature-card spacing guidance for three-up info rows", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a personal site homepage with three thematic cards for AI, engineering practice, and global perspective.",
        ),
      ],
      phase: "conversation",
    } as any);

    const homeContract = formatTargetPageContract(plan, "/index.html");
    expect(homeContract).toContain("Home page feature-card gate");
    expect(homeContract).toContain("roomy feature card");
    expect(homeContract).toContain("decorative numerals, step numbers, watermarks, or corner badges");
  });

  it("forces bilingual blog detail routes to render one visible language body at a time", () => {
    const requirement = [
      "Build a bilingual personal blog for Bays Wong with Home, Blog, About, Contact.",
      "Generate 3 complete articles.",
      "Default language is zh-CN with an EN/ZH switch.",
    ].join(" ");
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
    } as any);

    const detailContract = formatTargetPageContract(plan, "/blog/agile-devops-system-design/index.html", requirement);
    expect(detailContract).toContain("initial visible article language should stay `zh-CN`");
    expect(detailContract).toContain("alternating zh/en paragraphs in the initial HTML");
  });

  it("forbids live blog detail links in index-first portfolio-blog route contracts", () => {
    const requirement = [
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join(" ");
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      sitemap: ["/", "/blog", "/about", "/contact"],
    } as any);

    const contract = formatTargetPageContract(plan, "/blog/index.html", requirement);

    expect(contract).toContain("starter cards must remain non-routing archive cards");
    expect(contract).toContain("must not link to /blog/{slug}/ detail routes in this run");
  });

  it("forces non-blog destination pages to lead with visitor-facing value instead of page mechanics", () => {
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a manufacturing company website with Home, Custom Solutions, About, and Contact.")],
      phase: "conversation",
    } as any);

    const contract = formatTargetPageContract(plan, "/custom-solutions/index.html");
    expect(contract).toContain("Destination page gate");
    expect(contract).toContain("this page provides");
    expect(contract).toContain("the next step is");
    expect(contract).toContain("visitor benefit, capability, proof point, or concrete CTA");
  });

  it("bans route-mechanics pathway phrasing on destination pages", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a construction implementation page for an institutional standards website with Home, Construction, Research, and Contact.",
        ),
      ],
      phase: "conversation",
    } as any);

    const contract = formatTargetPageContract(plan, "/construction/index.html");
    expect(contract).toContain("Ban route-mechanics phrasing");
    expect(contract).toContain("从前期到落地形成清晰路径");
    expect(contract).toContain("pathway explanation");
    expect(contract).toContain("Rewrite them as concrete capabilities, deliverables, operational support, proof, or consultation outcomes.");
  });

  it("forces search-directory openings to avoid promo split-hero compositions", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build the official CASUX website with routes Home, CASUX Certification, CASUX Research Center, and CASUX Information Platform. The CASUX Certification route is a directory page with filters, result rows, standards criteria, and consultation support.",
        ),
      ],
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-certification", "/casux-research-center", "/casux-information-platform"],
          navLabels: ["Home", "Certification", "Research Center", "Information Platform"],
          files: [
            "/styles.css",
            "/script.js",
            "/index.html",
            "/casux-certification/index.html",
            "/casux-research-center/index.html",
            "/casux-information-platform/index.html",
          ],
        },
      },
      phase: "conversation",
    } as any);

    const contract = formatTargetPageContract(plan, "/casux-certification/index.html");
    expect(contract).toContain("Directory opening gate");
    expect(contract).toContain("hero-panel");
    expect(contract).toContain("media-frame");
    expect(contract).toContain("lead-stack");
    expect(contract).toContain("query controls, result framing, criteria, or standards scope");
  });

  it("forces certification directory contracts to mention scoring and review substance", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build the official CASUX website with routes Home and CASUX Certification. The CASUX Certification route must cover five-dimension scoring model, total score thresholds, assessor packet, quality-mark workflow, certification badge criteria, filters, result rows, and consultation support.",
        ),
      ],
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-certification"],
          navLabels: ["Home", "Certification"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-certification/index.html"],
        },
      },
      phase: "conversation",
    } as any);

    const contract = formatTargetPageContract(
      plan,
      "/casux-certification/index.html",
      "Certification route source notes: cover five-dimension scoring model, total score thresholds, assessor packet, quality-mark workflow, and certification badge criteria.",
    );
    expect(contract).toContain("Directory opening gate");
    expect(contract).toContain("criteria");
    expect(contract).toContain("standards scope");
  });

  it("preserves distinct bilingual catalogs instead of collapsing zh content to en fallback", () => {
    const files = ensureEnglishFirstI18nResourceFilesForTesting(
      [
        {
          path: "/index.html",
          type: "text/html",
          content: [
            "<!doctype html>",
            '<html lang="zh-CN">',
            "<body>",
            '<h1 data-i18n="home.title" data-i18n-zh="儿童友好标准与研究入口" data-i18n-en="Child-friendly standards and research hub">儿童友好标准与研究入口</h1>',
            '<p data-i18n="home.lead" data-i18n-zh="为教育运营者、研究伙伴与机构采购方提供统一入口。">为教育运营者、研究伙伴与机构采购方提供统一入口。</p>',
            "</body>",
            "</html>",
          ].join("\n"),
        },
        {
          path: "/i18n/messages.en.json",
          type: "application/json",
          content: JSON.stringify(
            {
              "home.title": "Child-friendly standards and research hub",
              "home.lead": "A unified entry point for education operators, research partners, and institutional buyers.",
            },
            null,
            2,
          ),
        },
        {
          path: "/i18n/messages.zh-CN.json",
          type: "application/json",
          content: JSON.stringify(
            {
              "home.title": "儿童友好标准与研究入口",
              "home.lead": "为教育运营者、研究伙伴与机构采购方提供统一入口。",
            },
            null,
            2,
          ),
        },
      ],
      "Build a bilingual Chinese and English institutional CASUX website. Default visible language is Chinese.",
      "zh-CN",
    );

    const fileMap = new Map(files.map((file) => [file.path, file.content] as const));
    const enMessages = JSON.parse(String(fileMap.get("/i18n/messages.en.json") || "{}"));
    const zhMessages = JSON.parse(String(fileMap.get("/i18n/messages.zh-CN.json") || "{}"));

    expect(enMessages["home.title"]).toBe("Child-friendly standards and research hub");
    expect(enMessages["home.lead"]).toBe("A unified entry point for education operators, research partners, and institutional buyers.");
    expect(zhMessages["home.title"]).toBe("儿童友好标准与研究入口");
    expect(zhMessages["home.lead"]).toBe("为教育运营者、研究伙伴与机构采购方提供统一入口。");
    expect(enMessages["home.title"]).not.toBe(zhMessages["home.title"]);
    expect(enMessages["home.lead"]).not.toBe(zhMessages["home.lead"]);
  });

  it("forces generated blog detail routes to be structure-correct shells during the first website pass", () => {
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog and generate 3 complete articles.")],
      phase: "conversation",
    } as any);

    const contract = formatTargetPageContract(plan, "/blog/gift-box-structure/index.html");
    expect(contract).toContain("structure-correct article shell");
    expect(contract).toContain('data-shpitto-blog-detail-shell="true"');
    expect(contract).toContain("at least two substantive <h2> sections");
    expect(contract).toContain("topic map");
  });

  it("keeps requested bilingual blog detail pages in the dedicated fill lane instead of auto-expanding first-pass required files", () => {
    const requirement = [
      "Build a bilingual personal blog for Bays Wong with Home, Blog, About, Contact.",
      "Generate 3 complete articles.",
      "Default language is zh-CN with an EN/ZH switch.",
    ].join(" ");
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
    } as any);
    const files = [
      { path: "/styles.css", content: "body{}", type: "text/css" },
      { path: "/script.js", content: "console.log('ok')", type: "text/javascript" },
      { path: "/index.html", content: "<!doctype html><html></html>", type: "text/html" },
      {
        path: "/blog/index.html",
        content:
          '<!doctype html><html><body><a href="/blog/agile-devops-system-design/">A</a><a href="/blog/wechat-real-time-media-global/">B</a><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></body></html>',
        type: "text/html",
      },
      { path: "/about/index.html", content: "<!doctype html><html></html>", type: "text/html" },
      { path: "/contact/index.html", content: "<!doctype html><html></html>", type: "text/html" },
    ];

    const required = requiredFileChecklistForTesting(plan, { files, requirementText: requirement });
    expect(required).toEqual(
      expect.arrayContaining([
        "/styles.css",
        "/script.js",
        "/i18n/messages.en.json",
        "/i18n/messages.zh-CN.json",
        "/index.html",
        "/blog/index.html",
      ]),
    );
    expect(required.filter((file) => file.startsWith("/blog/") && file !== "/blog/index.html")).toEqual([]);

    const objective = planRoundObjectiveForTesting(0, [
      "/blog/agile-devops-system-design/index.html",
      "/blog/wechat-real-time-media-global/index.html",
    ]);
    expect(objective.targetFiles).toEqual([
      "/blog/agile-devops-system-design/index.html",
    ]);
    expect(objective.strictSingleTarget).toBe(true);
    expect(objective.instruction).toContain("Emit this complete Blog/detail page in this round");
    expect(objective.instruction).toContain("Focus on finishing this one detail completely before moving to the next");
    expect(objective.instruction).toContain("full readable body");
  });

  it("serializes missing Blog detail pages one file per round by default", () => {
    const objective = planRoundObjectiveForTesting(0, [
      "/blog/ai-product-practice/index.html",
      "/blog/saas-commercialization/index.html",
      "/blog/global-messaging-products/index.html",
    ]);

    expect(objective.targetFiles).toEqual([
      "/blog/ai-product-practice/index.html",
    ]);
    expect(objective.strictSingleTarget).toBe(true);
    expect(objective.instruction).toContain("Emit this complete Blog/detail page in this round");
  });

  it("serializes shared asset generation before any HTML work", () => {
    const objective = planRoundObjectiveForTesting(0, [
      "/styles.css",
      "/script.js",
      "/index.html",
      "/about/index.html",
    ]);

    expect(objective.targetFiles).toEqual(["/styles.css"]);
    expect(objective.strictSingleTarget).toBe(true);
    expect(objective.instruction).toContain("/styles.css shared design tokens");
  });

  it("routes shared-asset rounds to a lighter model by default", () => {
    const resolved = resolveWebsiteSkillRoundProviderConfigForTesting(
      {
        provider: "pptoken",
        apiKey: "test-key",
        baseURL: "https://example.test/v1",
        defaultHeaders: {},
        modelName: "gpt-5.4",
      },
      {
        targetFiles: ["/styles.css"],
        instruction: "Emit shared CSS.",
        strictSingleTarget: true,
      },
    );

    expect(resolved.modelName).toBe("gpt-5.4-mini");
  });

  it("routes an isolated homepage round to a lighter model by default", () => {
    const resolved = resolveWebsiteSkillRoundProviderConfigForTesting(
      {
        provider: "pptoken",
        apiKey: "test-key",
        baseURL: "https://example.test/v1",
        defaultHeaders: {},
        modelName: "gpt-5.4",
      },
      {
        targetFiles: ["/index.html"],
        instruction: "Emit the homepage first.",
        strictSingleTarget: false,
      },
    );

    expect(resolved.modelName).toBe("gpt-5.4-mini");
  });

  it("routes an isolated interior HTML round to a lighter model by default", () => {
    const resolved = resolveWebsiteSkillRoundProviderConfigForTesting(
      {
        provider: "pptoken",
        apiKey: "test-key",
        baseURL: "https://example.test/v1",
        defaultHeaders: {},
        modelName: "gpt-5.4",
      },
      {
        targetFiles: ["/products/index.html"],
        instruction: "Emit the products page.",
        strictSingleTarget: true,
      },
    );

    expect(resolved.modelName).toBe("gpt-5.4-mini");
  });

  it("uses a smaller route batch when a blog index is part of the current round", () => {
    const objective = planRoundObjectiveForTesting(0, [
      "/index.html",
      "/blog/index.html",
      "/about/index.html",
      "/contact/index.html",
      "/products/index.html",
      "/custom-solutions/index.html",
    ]);

    expect(objective.targetFiles).toEqual(["/index.html"]);
    expect(objective.instruction).toContain("Emit the homepage first in this round");
    expect(objective.strictSingleTarget).toBe(true);
  });

  it("splits non-home interior HTML routes into smaller batches after the homepage", () => {
    const objective = planRoundObjectiveForTesting(1, [
      "/blog/index.html",
      "/about/index.html",
      "/contact/index.html",
      "/products/index.html",
      "/custom-solutions/index.html",
    ]);

    expect(objective.targetFiles).toEqual([
      "/blog/index.html",
    ]);
    expect(objective.strictSingleTarget).toBe(true);
  });

  it("skips bilingual body-copy guard for blog detail pages while keeping detail completeness checks", () => {
    const requirement = [
      "Build a bilingual Chinese and English personal blog with a language switch.",
      "Generate 3 complete articles.",
    ].join(" ");
    const plan = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
    } as any);
    const invalidDetailPaths = new Set([
      "/blog/agile-devops-system-design/index.html",
      "/blog/wechat-real-time-media-global/index.html",
      "/blog/ai-saas-commercialization-cto-practice/index.html",
    ]);
    const files = [
      ...validGeneratedFiles(["/", "/blog", "/about", "/contact"]).filter(
        (file) =>
          file.path !== "/blog/index.html" &&
          !invalidDetailPaths.has(file.path),
      ),
      {
        path: "/blog/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="zh-CN">',
          "<head>",
          "  <title>博客</title>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <main>",
          '    <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
          '      <h1>博客</h1>',
          '      <p>文章索引页保留站点级双语框架，具体文章正文不参与双语守卫。</p>',
          '      <div data-shpitto-blog-list>',
          '        <article><a href="/blog/agile-devops-system-design/">Article A</a></article>',
          '        <article><a href="/blog/wechat-real-time-media-global/">Article B</a></article>',
          '        <article><a href="/blog/ai-saas-commercialization-cto-practice/">Article C</a></article>',
          "      </div>",
          "    </section>",
          "  </main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
      ...Array.from(invalidDetailPaths).map((detailPath, index) => {
        const title = ["Article A", "Article B", "Article C"][index] || `Article ${index + 1}`;
        return {
          path: detailPath,
          type: "text/html",
          content: [
            "<!doctype html>",
            '<html lang="zh-CN">',
            "<head>",
            `  <title>${title}</title>`,
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            '  <link rel="stylesheet" href="/styles.css" />',
            "</head>",
            "<body>",
            "  <main>",
            "    <article>",
            `      <h1>${title}</h1>`,
            '      <p><span class="lang-zh">这是一篇中文正文，说明作者如何把长期内容策略、技术判断、产品叙事与博客详情页的真实阅读体验绑定在一起，并强调页面必须在静态预览阶段就足够完整、可信、可阅读。</span><span class="lang-en">This English paragraph intentionally mirrors the same visible body slot so the skill-side bilingual validator can detect duplicated zh and en DOM copy in one rendered reading path.</span></p>',
            "      <p>This article keeps expanding the same topic with concrete reasoning about content depth, route ownership, audience trust, preview fidelity, and why a polished archive card must resolve to a full article rather than a metadata shell or a runtime-only placeholder.</p>",
            "      <section><h2>Context</h2><p>The detail route still carries a realistic amount of structure, body copy, and contextual explanation so the article-quality gates pass before the bilingual validation runs. It talks about editorial accountability, production constraints, and how static previews must remain understandable even when no dynamic blog runtime is active.</p></section>",
            "      <section><h2>Impact</h2><p>The page remains a substantial article fixture with enough text for route-level QA, enough headings for article structure checks, and enough narrative continuity to read like a finished destination. The only intentional defect is that one visible paragraph exposes both Chinese and English body copy at the same time inside duplicated DOM spans.</p></section>",
            "      <p>That makes this fixture useful for a boundary test: if the skill-side validator is active, it should reject the page for simultaneous bilingual body content or duplicated zh/en DOM copy; if validation were still relying on executor fallbacks, this malformed output could slip through after generation.</p>",
            "    </article>",
            "  </main>",
            '  <script src="/script.js"></script>',
            "</body>",
            "</html>",
          ].join("\n"),
        };
      }),
    ].map((file) => {
      if (file.path === "/index.html") {
        return {
          ...file,
          content: [
            "<!doctype html>",
            '<html lang="zh-CN">',
            "<head>",
            "  <title>Home</title>",
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            '  <link rel="stylesheet" href="/styles.css" />',
            "</head>",
            "<body>",
            "  <main>",
            '    <section aria-label="Language switch"><button data-locale-toggle type="button">ZH</button><button type="button">EN</button></section>',
            '    <section class="hero"><h1 data-i18n="home.title" data-i18n-zh="首页" data-i18n-en="Home">首页</h1><p data-i18n="home.lead" data-i18n-zh="这是具备真实双语框架的首页外壳。" data-i18n-en="This homepage includes a real bilingual shell.">这是具备真实双语框架的首页外壳。</p></section>',
            "  </main>",
            '  <script src="/script.js"></script>',
            "</body>",
            "</html>",
          ].join("\n"),
        };
      }
      if (file.path === "/about/index.html" || file.path === "/contact/index.html") {
        const title = file.path === "/about/index.html" ? "关于" : "联系";
        const enTitle = file.path === "/about/index.html" ? "About" : "Contact";
        return {
          ...file,
          content: [
            "<!doctype html>",
            '<html lang="zh-CN">',
            "<head>",
            `  <title>${title}</title>`,
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            '  <link rel="stylesheet" href="/styles.css" />',
            "</head>",
            "<body>",
            "  <main>",
            '    <section aria-label="Language switch"><button data-locale-toggle type="button">ZH</button><button type="button">EN</button></section>',
            `    <h1 data-i18n="page.title" data-i18n-zh="${title}" data-i18n-en="${enTitle}">${title}</h1>`,
            `    <p data-i18n="page.lead" data-i18n-zh="该页面保留最小双语框架校验能力。" data-i18n-en="This page keeps the minimal bilingual shell for validation.">该页面保留最小双语框架校验能力。</p>`,
            "  </main>",
            '  <script src="/script.js"></script>',
            "</body>",
            "</html>",
          ].join("\n"),
        };
      }
      if (file.path !== "/blog/demo/index.html") return file;
      return {
        ...file,
        content: [
          "<!doctype html>",
          '<html lang="zh-CN">',
          "<head>",
          "  <title>Demo detail</title>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <main>",
          "    <article>",
          "      <h1>Demo detail</h1>",
          '      <p><span class="lang-zh">这是一篇中文正文。</span><span class="lang-en">This is an English body paragraph.</span></p>',
          "    </article>",
          "  </main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      };
    });

    expect(() =>
      validateAndNormalizeRequiredFilesWithQa({
        decision: plan,
        files,
        requirementText: requirement,
      }),
    ).not.toThrow();
  });

  it("locks a representative target page contract with a snapshot", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
        ),
      ],
      phase: "conversation",
    } as any);

    expect(formatTargetPageContract(plan, "/3c-machines/index.html")).toMatchInlineSnapshot(`
      "Target page contract:
      - File: /3c-machines/index.html
      - Route: /3c-machines
      - Nav label: 3C Machines
      - Page intent: Dedicated page for "3C Machines". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.
      - Intent source: nav_label
      - Page kind: intent
      - Locale contract: keep the visible reading path in English only unless this route is explicitly marked bilingual.
      - The confirmed Canonical Website Prompt is authoritative for page structure, content depth, audience, and design direction.
      - Page constraints:
        - Canonical Website Prompt is the authoritative source for website type, audience, content scope, page structure, and design direction.
        - Do not use hardcoded industry templates, product assumptions, or generic replacement text when the Canonical Website Prompt provides source content.
        - The page must be meaningfully distinct from sibling pages in section purpose, headings, content, and layout.
        - Navigation links must stay within the fixed route list and preserve the configured navigation order.
        - This route must not reuse a sibling page's section order or module rhythm without a clear content reason.
        - Seed-authoritative mode is active: imported seed cadence and route-owned opening structure outrank generic local hero/grid/card defaults.
      - Required page skeleton:
        - Route-specific hero introducing the page's visitor purpose
        - Primary content section unique to the route
        - Supporting proof, detail, or framework section
        - CTA or transition section aligned to the route's job
      - Skeleton mapping gate: each skeleton bullet must become its own visible major section or clearly distinct zone. Do not collapse multiple bullets into one generic card grid or one catch-all detail section.
      - No route-specific source excerpt was found; derive a unique page architecture from the complete Canonical Website Prompt.
      - Derive route-specific sections, headings, card types, and interactions from the Canonical Website Prompt and source content.
      - Use a page-specific body architecture. Shared header/footer/design tokens are allowed; the main content section order, visual modules, and primary components must differ from sibling routes.
      - Do not apply a hardcoded industry skeleton or copy the previous page layout and only swap text.
      - Visitor-facing copy must be substantive content for the audience, not a description of site mechanics. Do not tell visitors what the page's task is, where to start browsing, which route comes next, or that one page leads into deeper content.
      - Ban visible scaffold phrases and equivalents such as 从首页开始, 接下来看博客, 循序进入深内容, 阅读入口, 站点入口, 首页路径, 继续了解, 下一步, this page provides, homepage job, where to start, start from home, or next step when they explain navigation order rather than a concrete offer or action.
      - Ban route-mechanics phrasing such as 从前期到落地形成清晰路径, 从A到B形成浏览路径, 判断路径, 实施路径说明, 路径指引, 路线说明, or English equivalents like pathway explanation, browsing path, route path, or journey explanation when they merely narrate process choreography. Rewrite them as concrete capabilities, deliverables, operational support, proof, or consultation outcomes.
      - Destination page gate: the first visible section must immediately communicate a visitor benefit, capability, proof point, or concrete CTA. Do not open with page-purpose notes like 'this page provides', 'the next step is', 'continue to', 'what this page is for', or any explanation of route order.
      - Destination page gate: headings such as 继续了解, 下一步, Start here, Where to start, or similar are only acceptable when they introduce a real offer/action for the visitor. They are invalid if they merely choreograph browsing between pages.
      - Interior page gate: make the first visible modules specific to the route's purpose and audience. Avoid generic hero plus filler-card repetition from sibling pages.
      - Interior page gate: do not open with a repeated split-hero shell such as \`route-hero\` + \`hero-grid\` + \`hero-copy\` + \`aside.panel\` / \`detail-card\`. Use a route-owned intro band, masthead, framework slab, or evidence header instead.
      - Interior page topology: the post-hero structure must contain at least three distinct major zones with different jobs. Do not compress the page into the same repeated section pattern used elsewhere.
      - Follow the workflow skill's Shared Shell/Footer Contract for header, main, and footer requirements.
      Sibling page intents to stay visually distinct from:
      /: Homepage. Establish the brand overview, core value, institutional scope, and next action while preserving a clear official-homepage identity.
      /custom-solutions: Dedicated page for "Custom Solutions". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.
      /cases: Dedicated page for "Cases". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.
      /contact: Dedicated page for "Contact". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.
      /about: Dedicated page for "About". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent."
    `);
  });

  it("strips legacy localized 3.5 module blueprints before generation", () => {
    const sanitized = sanitizeRequirementForGenerationForTesting(
      [
        "# full website generation prompt",
        "## 1. original requirements",
        "personal AI practice blog",
        "## 3.5 page differentiation blueprint (required)",
        "### generation route contract (machine-readable)",
        "```json",
        JSON.stringify({ routes: ["/", "/blog"], files: ["/index.html", "/blog/index.html"] }),
        "```",
        "- Blog page must include quote-form",
        "## 4. design direction",
        "technology and minimal modern",
      ].join("\n"),
    );

    expect(sanitized).toContain("## 1. original requirements");
    expect(sanitized).toContain("## 4. design direction");
    expect(sanitized).not.toContain("page differentiation blueprint");
    expect(sanitized).not.toContain("quote-form");
  });

  it("builds a compact skeleton execution context while preserving manifest and evidence sections", () => {
    const verbosePrompt = [
      "# Canonical Website Generation Prompt",
      "## 0. Confirmed Generation Parameters",
      "- Website type: Company website",
      "- Language: Chinese and English",
      "## 0.5 Brand Assets",
      "- Logo source: Text wordmark",
      "## 1.5 Explicit User Constraints",
      "- Keep the site bilingual and trust-led.",
      "## 1.6 Content Source Instructions",
      "- Prioritize same-domain research before generic web search.",
      "## 2. Website Overall Positioning Prompt",
      "FILLER ".repeat(1400),
      "## 3.5 Prompt Control Manifest (Mandatory)",
      "```json",
      JSON.stringify({
        routes: ["/", "/products", "/contact"],
        files: ["/styles.css", "/script.js", "/index.html", "/products/index.html", "/contact/index.html"],
      }),
      "```",
      "## 4. General Design Specification Prompt",
      "DESIGN ".repeat(1800),
      "## 7. Evidence Brief",
      "- Priority Facts: VBUY Textile is a B2B towel manufacturer.",
      "- Page Briefs: Products page should emphasize MOQ, materials, and certification proof.",
      "SOURCE ".repeat(1200),
    ].join("\n");

    const compact = buildSkeletonPromptRequirementContextForTesting(verbosePrompt);

    expect(compact.length).toBeLessThan(verbosePrompt.length);
    expect(compact).toContain("## 0. Confirmed Generation Parameters");
    expect(compact).toContain("## 3.5 Prompt Control Manifest");
    expect(compact).toContain("## 7. Evidence Brief");
    expect(compact).not.toContain("## 4. General Design Specification Prompt");
  });

  it("fails fast without a configured provider key instead of generating local files", async () => {
    const keys = [
      "PPTOKEN_API_KEY",
      "AIBERM_API_KEY",
      "CRAZYROUTE_API_KEY",
      "CRAZYROUTER_API_KEY",
      "CRAZYREOUTE_API_KEY",
    ] as const;
    const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));
    try {
      for (const key of keys) delete process.env[key];
      await expect(runSkillToolExecutor({
        state: {
          messages: [new HumanMessage("Generate website routes / and /contact with industrial style.")],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
        } as any,
        timeoutMs: 60_000,
      })).rejects.toThrow("skill_tool_provider_api_key_missing");
    } finally {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("does not repair missing pages during final validation", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /blog.")],
      phase: "conversation",
    } as any);

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: validGeneratedFiles(["/"]).filter((file) => file.path !== "/blog/index.html"),
      }),
    ).toThrow("skill_tool_missing_required_files: /blog/index.html");
  });

  it("requires generated pages to reference shared CSS and JS instead of patching them", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /contact.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/contact/index.html"
        ? { ...file, content: String(file.content).replace('  <script src="/script.js"></script>\n', "") }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("does not reference /script.js");
  });

  it("fails the manifest gate when generated html pages fall outside the confirmed prompt control manifest", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /contact.")],
      phase: "conversation",
    } as any);
    const files = [
      ...validGeneratedFiles(decision.routes),
      {
        path: "/unexpected/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          "<main><h1>Unexpected</h1><p>This page should not exist.</p></main>",
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision: {
          ...decision,
          routeAuthorityMode: "prompt_manifest",
        },
        files,
        requirementText: "Build routes / and /contact.",
      }),
    ).toThrow(/skill_tool_manifest_gate_failed: generated unrequested page files/i);
  });

  it("fails the manifest gate for unrequested nested blog detail pages when no blog route was declared", () => {
    const decision = {
      ...buildLocalDecisionPlan({
        messages: [new HumanMessage("Build a resource hub with Home, Research, Standards, Resources, and About.")],
        phase: "conversation",
        workflow_context: {
          promptControlManifest: {
            schemaVersion: 1,
            promptKind: "canonical_website_prompt",
            routeSource: "prompt_draft_page_plan",
            routes: ["/", "/research", "/standards", "/resources", "/about"],
            navLabels: ["Home", "Research", "Standards", "Resources", "About"],
            files: [
              "/styles.css",
              "/script.js",
              "/index.html",
              "/research/index.html",
              "/standards/index.html",
              "/resources/index.html",
              "/about/index.html",
            ],
          },
        },
      } as any),
      routeAuthorityMode: "prompt_manifest" as const,
    };
    const files = [
      ...validGeneratedFiles(decision.routes).map((file) =>
        file.path === "/resources/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                "</main>",
                '<p><a href="/blog/implementation-brief-template/">Implementation brief template</a></p></main>',
              ),
            }
          : file,
      ),
      {
        path: "/blog/implementation-brief-template/index.html",
        type: "text/html",
        content:
          '<!doctype html><html><head><link rel="stylesheet" href="/styles.css" /></head><body><main><h1>Implementation brief template</h1></main><script src="/script.js"></script></body></html>',
      },
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a resource hub. Do not generate blog or archive routes.",
      }),
    ).toThrow(/links to unrequested route\(s\) outside the Prompt Control Manifest/i);
  });

  it("reports repeated route openings as observation-only QA findings", () => {
    const decision = {
      ...buildLocalDecisionPlan({
        messages: [new HumanMessage("Build routes /, /alpha, /beta, and /gamma.")],
        phase: "conversation",
      } as any),
      routes: ["/", "/alpha", "/beta", "/gamma"],
      navLabels: ["Home", "Alpha", "Beta", "Gamma"],
      routeAuthorityMode: "prompt_manifest" as const,
    };
    const files = validGeneratedFiles(decision.routes).map((file) => {
      if (!file.path.endsWith(".html") || file.path === "/index.html") return file;
      return {
        ...file,
        content: String(file.content).replace("<main>", '<main><section class="route-hero repeated"><h1>Repeated</h1><p>Repeated opening family.</p></section>'),
      };
    });

    const result = validateAndNormalizeRequiredFilesWithQa({
      decision,
      files,
      requirementText: "Build routes /, /alpha, /beta, and /gamma.",
    });

    expect(result.qaSummary.observations?.[0]).toMatchObject({
      code: "repeated-opening-family",
      severity: "observation",
      routes: ["/alpha", "/beta", "/gamma"],
    });
  });

  it("requires the semantic Blog data-source route to include the Blog backend mount", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site. The information platform publishes updates, insights, and article content.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/information-platform"],
          navLabels: ["Home", "Information Platform"],
          files: ["/styles.css", "/script.js", "/index.html", "/information-platform/index.html"],
        },
      },
    } as any);
    const contentRoute = decision.pageBlueprints.find((page) => ["blog-data-index", "content-collection-index"].includes(page.pageKind))?.route;
    expect(contentRoute).toBe("/information-platform");

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: validGeneratedFiles(decision.routes),
      }),
    ).toThrow("does not include the Blog data-source contract");

    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/information-platform/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>Information Platform</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/insight/">Insight</a></article></div></section><section><h2>Context</h2><p>Updates and resource cards are organized by platform category.</p></section><section><h2>Editorial rhythm</h2><p>Published content remains addressable through stable detail links.</p></section><section><h2>Next step</h2><p>Readers can continue into related site actions.</p></section></main>',
            ),
          }
        : file.path === "/blog/demo/index.html"
          ? {
              ...file,
              content: [
                "<!doctype html>",
                '<html lang="zh-CN">',
                "<head>",
                "  <title>示例文章</title>",
                '  <meta charset="utf-8" />',
                '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
                '  <link rel="stylesheet" href="/styles.css" />',
                "</head>",
                "<body>",
                '  <nav><a href="/">Home</a><a href="/blog/">Blog</a></nav>',
                "  <main>",
                "    <article>",
                "      <h1>示例文章</h1>",
                "      <p>这篇示例文章保持中文为默认可见语言，只保留 Bays Wong 作为英文品牌名，并把语言切换按钮严格限制在界面层，不把中英文正文同时放进首屏可见内容。</p>",
                "      <p>正文继续围绕个人技术写作、组织实践复盘与产品判断展开，让访客先读到完整中文内容，再通过明确的语言开关切换到英文版本，而不是把两种语言直接堆叠在一个段落里。</p>",
                "      <p>这种写法可以兼容 HelloTalk、SaaS、DevOps、AI 等英文专名，同时保证整页默认阅读路径只有一种可见语言，不会被 bilingual DOM copy 规则误判。</p>",
                "      <p>因此 detail 页面既保留品牌和技术专名的真实性，也遵守单一可见语言的正文契约。</p>",
                "      <section><h2>语言切换</h2><p>语言切换仍然是控件能力，不是正文叙事；默认中文正文保持完整，英文版本只在切换后出现。</p></section>",
                "      <section><h2>品牌专名</h2><p>Bays Wong、HelloTalk、SaaS、DevOps、AI 作为专名或技术缩写出现在正文中，但不构成双语并排展示。</p></section>",
                "    </article>",
                "  </main>",
                '  <script src="/script.js"></script>',
                "</body>",
                "</html>",
              ].join("\n"),
            }
          : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText:
          "Build an information platform with a publishable article archive and stable /blog/{slug}/ detail routes.",
      }),
    ).not.toThrow();
  });

  it("still allows portfolio blog detail output when the brief explicitly asks for publishable detail routes", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal AI consultant blog with Home and Blog.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
          websiteSurfaceMode: "portfolio-blog-site",
        },
      },
    } as any);

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files: validGeneratedFiles(decision.routes),
        requirementText: "Build a personal AI consultant blog with a publishable article archive and stable /blog/{slug}/ detail routes.",
        websiteSurfaceMode: "portfolio-blog-site",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("rejects repeated legacy split-hero openings across sibling routes", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build site. Nav: Home | Alpha | Beta | Gamma")],
      phase: "conversation",
    } as any);
    const structuredFooter = [
      '<footer class="site-footer">',
      '  <div class="footer-grid">',
      '    <div class="footer-brand"><p>Brand</p></div>',
      '    <div class="footer-links"><a href="/alpha">Alpha</a><a href="/beta">Beta</a><a href="/gamma">Gamma</a></div>',
      "  </div>",
      "</footer>",
    ].join("\n");
    const files = [
      {
        path: "/styles.css",
        content: "body{font-family:system-ui;}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/alpha">Alpha</a><a href="/beta">Beta</a><a href="/gamma">Gamma</a></nav></header>',
          "  <main><section><h1>Home</h1><p>Distinct homepage opening.</p></section></main>",
          structuredFooter,
          "</body></html>",
        ].join("\n"),
      },
      ...["/alpha", "/beta", "/gamma"].map((route) => ({
        path: `${route}/index.html`,
        type: "text/html",
        content: [
          "<!doctype html>",
          "<html><head>",
          '  <link rel="stylesheet" href="/styles.css" />',
          '  <script src="/script.js"></script>',
          "</head><body>",
          '  <header><nav><a href="/">Home</a><a href="/alpha">Alpha</a><a href="/beta">Beta</a><a href="/gamma">Gamma</a></nav></header>',
          `  <main><section class="hero"><div class="hero-grid"><div class="hero-copy"><h1>${route.slice(1)}</h1><p>Unique copy for ${route.slice(1)}</p></div><aside class="hero-panel"><p>Proof</p></aside></div></section><section><p>Follow-up content for ${route.slice(1)}</p></section></main>`,
          structuredFooter,
          "</body></html>",
        ].join("\n"),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Company site with multiple sibling routes.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("repeated primary routes fell back to the same legacy split-hero opening template");
  });

  it("rejects route-heavy sites when four sibling primary routes still reuse the split-hero opening", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build site. Nav: Home | Creation | Construction | Certification | Advocacy | Research | Information | Standards | Cases",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          routes: [
            "/",
            "/casux-creation",
            "/casux-construction",
            "/casux-certification",
            "/casux-advocacy",
            "/casux-research-center",
            "/casux-information-platform",
            "/standards-system",
            "/case-studies",
          ],
          navLabels: ["Home", "Creation", "Construction", "Certification", "Advocacy", "Research", "Information", "Standards", "Cases"],
          files: [],
        },
      },
    } as any);
    const structuredFooter =
      '<footer class="footer"><div class="container footer-top"><div class="footer-grid"><div class="footer-brand"><a class="brand" href="/">Brand</a><p>Summary</p></div><div><ul class="footer-links"><a href="/casux-creation">Creation</a><a href="/casux-construction">Construction</a><a href="/casux-certification">Certification</a><a href="/casux-advocacy">Advocacy</a><a href="/casux-research-center">Research</a><a href="/casux-information-platform">Information</a><a href="/standards-system">Standards</a><a href="/case-studies">Cases</a></ul></div><div class="footer-contact"><span>Contact</span></div></div></div><div class="container footer-bottom"><div class="footer-bottom-row"><span>Note</span><span>Brand</span></div></div></footer>';
    const files = [
      {
        path: "/styles.css",
        content:
          ".footer{display:block;padding:3rem 0;background:#f8fafc;border-top:1px solid #d8dee8}.footer-top{display:block}.footer-grid{display:grid}.footer-brand{display:grid}.footer-links{display:grid}.footer-contact{display:grid}.footer-bottom{display:block}",
        type: "text/css",
      },
      { path: "/script.js", content: "(() => {})();", type: "text/javascript" },
      {
        path: "/index.html",
        type: "text/html",
        content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css" /><script src="/script.js"></script></head><body><header><nav><a href="/">Home</a></nav></header><main><section><h1>Home</h1><p>Distinct homepage opening.</p></section></main>${structuredFooter}</body></html>`,
      },
      ...[
        "/casux-creation",
        "/casux-construction",
        "/casux-advocacy",
        "/standards-system",
      ].map((route) => ({
        path: `${route}/index.html`,
        type: "text/html",
        content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css" /><script src="/script.js"></script></head><body><header><nav><a href="/">Home</a></nav></header><main><section class="hero"><div class="hero-grid"><div class="hero-copy"><h1>${route}</h1><p>Unique copy for ${route}.</p></div><aside class="hero-panel"><p>Proof</p></aside></div></section><section><p>Follow-up content.</p></section></main>${structuredFooter}</body></html>`,
      })),
      ...[
        "/casux-certification",
        "/casux-research-center",
        "/casux-information-platform",
        "/case-studies",
      ].map((route) => ({
        path: `${route}/index.html`,
        type: "text/html",
        content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css" /><script src="/script.js"></script></head><body><header><nav><a href="/">Home</a></nav></header><main><section><h1>${route}</h1><p>Distinct route-owned opening.</p></section><section><p>Support content for ${route}.</p></section></main>${structuredFooter}</body></html>`,
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Institutional route-heavy site with multiple sibling routes.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("repeated primary routes fell back to the same legacy split-hero opening template");
  });

  it("rejects content-collection openings that still mix route-owned leads with legacy hero utility classes", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage("Build a CASUX company website with Home, Research, and Information routes."),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          routes: ["/", "/casux-research-center", "/casux-information-platform"],
          navLabels: ["Home", "Research", "Information"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-research-center/index.html", "/casux-information-platform/index.html"],
        },
      },
    } as any);
    decision.pageBlueprints = [
      {
        route: "/casux-research-center",
        navLabel: "Research",
        purpose: "Research collection.",
        source: "explicit_route",
        constraints: [],
        pageKind: "content-collection-index",
        responsibility: "Collection",
        contentSkeleton: ["lead", "collection", "results", "cta"],
        componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information",
        purpose: "Information collection.",
        source: "explicit_route",
        constraints: [],
        pageKind: "content-collection-index",
        responsibility: "Collection",
        contentSkeleton: ["lead", "collection", "results", "cta"],
        componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
      },
    ] as any;

    const files = validGeneratedFiles(["/", "/casux-research-center", "/casux-information-platform"]).map((file) =>
      file.path === "/casux-research-center/index.html"
        ? {
            ...file,
            content: [
              "<!doctype html>",
              "<html><head><link rel=\"stylesheet\" href=\"/styles.css\" /><script src=\"/script.js\"></script></head><body>",
              "<header><nav><a href=\"/\">Home</a><a href=\"/casux-research-center\">Research</a><a href=\"/casux-information-platform\">Information</a></nav></header>",
              "<main>",
              '  <section class="section"><div class="shell hero hero--split"><div class="hero__content knowledge-hub-lead research-index-lead"><p class="kicker">Research center</p><h1>Research</h1><p class="hero-lead">Legacy hero utilities should fail even when route-owned collection classes are present.</p><div class="hero__actions"><a href="/casux-information-platform">Open information</a></div></div><div class="media-frame"><img src="https://example.com/research.jpg" alt="Research" /></div></div></section>',
              '  <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="panel article-card"><h2>Research item</h2><p>Fallback entry.</p></article></div></section>',
              "</main>",
              '<footer class="site-footer"><div class="footer-grid"><div class="footer-brand"><a class="brand" href="/">Brand</a></div><div class="footer-links"><a href="/casux-research-center">Research</a><a href="/casux-information-platform">Information</a></div><div class="footer-meta"><a href="/">Home</a></div></div></footer>',
              "</body></html>",
            ].join(""),
          }
        : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Chinese company website with collection surfaces.",
        enforceCorporateHomepageContract: false,
      }),
    ).toThrow("reuses the legacy split-hero template instead of a route-owned content collection opening");
  });

  it("accepts a generic information-platform collection without synthetic blog detail pages when no publishable archive was requested", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site. CASUX information platform is a standards, research, and download hub.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-information-platform", "/downloads"],
          navLabels: ["Home", "CASUX Information Platform", "Downloads"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-information-platform/index.html", "/downloads/index.html"],
        },
      },
    } as any);

    const files = validGeneratedFiles(decision.routes)
      .filter((file) => !file.path.startsWith("/blog/"))
      .map((file) =>
        file.path === "/casux-information-platform/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                /<main>[\s\S]*<\/main>/,
                [
                  "<main>",
                  "<h1>CASUX Information Platform</h1>",
                  '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
                  "<h2>Standards and research index</h2>",
                  "<p>Browse standards, research briefs, and source-backed download entries without leaving the platform hub.</p>",
                  '<div data-shpitto-blog-list><article class="blog-card"><h3>Standards briefing</h3><p>Certification references and standards updates are organized as collection cards in the first pass.</p></article></div>',
                  "</section>",
                  "<section><h2>Research context</h2><p>Use the platform to compare reports, review criteria, and move into the right download or inquiry path.</p></section>",
                  "<section><h2>Downloads</h2><p>Continue into the standards downloads area when you need the full files or application materials.</p></section>",
                  "</main>",
                ].join(""),
              ),
            }
          : file.path === "/styles.css"
            ? { ...file, content: `${String(file.content || "")}\n.blog-card { padding: 24px; }` }
            : file,
      );

    expect(
      requiredFileChecklistForTesting(decision, {
        files,
        requirementText: "Build a site. CASUX information platform is a standards, research, and download hub.",
      }).filter((path) => path.startsWith("/blog/")),
    ).toEqual([]);

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a site. CASUX information platform is a standards, research, and download hub.",
      }),
    ).not.toThrow();
  });

  it("rejects Blog runtime hooks when the closed manifest explicitly forbids blog/archive behavior", () => {
    const requirementText =
      "Build a multi-page resource and research hub for Civic Standards Lab. Generate Home, Research, Standards, Resources, and About with no blog or archive behavior.";
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/research", "/standards", "/resources", "/about"],
          navLabels: ["Home", "Research", "Standards", "Resources", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/research/index.html", "/standards/index.html", "/resources/index.html", "/about/index.html"],
        },
      },
    } as any);

    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/resources/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              [
                "<main>",
                "<h1>Resources</h1>",
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
                "<h2>Resource index</h2>",
                '<div data-shpitto-blog-list><article class="resource-card"><h3>Research memo template</h3><p>Static preview item.</p></article></div>',
                "</section>",
                "</main>",
              ].join(""),
            ),
          }
        : file.path === "/styles.css"
          ? { ...file, content: `${String(file.content || "")}\n.resource-card { padding: 24px; }` }
          : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText,
      }),
    ).toThrow("applies the Blog/content collection data-source contract despite explicit no blog/archive behavior");
  });

  it("accepts route-owned collection openings that use neutral lead-copy helpers instead of legacy split-hero utilities", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a Chinese research and information platform site.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-research-center"],
          navLabels: ["Home", "Research"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-research-center/index.html"],
        },
      },
    } as any);

    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/casux-research-center/index.html"
        ? {
            ...file,
            content: [
              "<!doctype html>",
              "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><link rel=\"stylesheet\" href=\"/styles.css\" /><script src=\"/script.js\"></script></head><body>",
              "<header><nav><a href=\"/\">Home</a><a href=\"/casux-research-center\">Research</a></nav></header>",
              "<main>",
              '  <section class=\"section\"><div class=\"shell\"><div class=\"knowledge-hub-lead research-index-lead\"><p class=\"section-kicker\">Research center</p><h1 class=\"lead-title\">Research</h1><p class=\"hero-copy\">Route-owned collection openings may still use a neutral lead-copy helper without becoming a split hero. This opening explains how the library supports brand planning, standards review, and evidence-led collaboration decisions with durable, reusable summaries.</p><div class=\"action-row\"><a href=\"#collection\">Browse research</a></div></div></div></section>',
              '  <section class=\"section\" id=\"focus\"><div class=\"shell\"><h2>Research directions</h2><p>Track structured observations about messaging, standards adoption, and collaboration signals so teams can compare patterns before shaping a new initiative.</p></div></section>',
              '  <section class=\"section\" id=\"collection\" data-shpitto-blog-root data-shpitto-blog-api=\"/api/blog/posts\"><div data-shpitto-blog-list><article class=\"research-card article-card\"><h2>Research item</h2><p>Fallback entry with enough detail to show how collection summaries help teams connect standards, evidence, and editorial framing without slipping into a marketing hero shell.</p></article></div></section>',
              '  <section class=\"section\" id=\"next-step\"><div class=\"shell\"><h2>Next step</h2><p>Move into standards or information routes when the team is ready to turn research signals into structured guidance, destination copy, or program-facing decisions.</p></div></section>',
              "</main>",
              '<footer class=\"site-footer\"><div class=\"footer-grid\"><div class=\"footer-brand\"><a class=\"brand\" href=\"/\">Brand</a></div><div class=\"footer-links\"><a href=\"/casux-research-center\">Research</a></div><div class=\"footer-meta\"><a href=\"/\">Home</a></div></div></footer>',
              "</body></html>",
            ].join(""),
          }
        : file.path === "/styles.css"
          ? { ...file, content: `${String(file.content || "")}\n.research-card { padding: 24px; }` }
          : file,
    );

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision,
        files,
        requirementText: "Chinese research information platform.",
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("rejects accidental content-backend mounts on non-content routes before demanding blog detail pages", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site with routes /casux-certification and /casux-information-platform for certification guidance and standards resources.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/casux-certification", "/casux-information-platform"],
          navLabels: ["Casux Certification", "Casux Information Platform"],
          files: [
            "/styles.css",
            "/script.js",
            "/casux-certification/index.html",
            "/casux-information-platform/index.html",
          ],
        },
      },
    } as any);

    expect(
      ["intent", "search-directory"].includes(
        String(decision.pageBlueprints.find((page) => page.route === "/casux-certification")?.pageKind || ""),
      ),
    ).toBe(true);
    expect(decision.pageBlueprints.find((page) => page.route === "/casux-information-platform")?.pageKind).toBe(
      "content-collection-index",
    );

    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/casux-certification/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>Casux Certification</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="card result-card"><h2>Certification Pack</h2><p>Support documents, project review records, and compliance notes.</p></article></div></section><section><h2>Support</h2><p>Certification support remains route-specific and should not become a publishable archive.</p></section></main>',
            ),
          }
        : file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.card, .result-card { padding: 1.25rem; }`,
            }
          : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("applies the Blog/content collection data-source contract on a non-content route");
  });

  it("does not require synthetic blog detail pages when a knowledge hub only mentions articles as source material", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site. CASUX information platform collects standards articles, research materials, and policy updates in one searchable hub.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "CASUX Information Platform"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-information-platform/index.html"],
        },
      },
    } as any);

    expect(
      requiredFileChecklistForTesting(decision, {
        requirementText:
          "Build a site. CASUX information platform collects standards articles, research materials, and policy updates in one searchable hub.",
      }).filter((path) => path.startsWith("/blog/")),
    ).toEqual([]);
  });

  it("does not require blog detail links for content-collection routes when the prompt only carries negative detail-page contract wording", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site. CASUX research center collects standards notes, reports, and analysis in one searchable hub.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-research-center"],
          navLabels: ["Home", "Research"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-research-center/index.html"],
        },
      },
    } as any);

    expect(decision.pageBlueprints.find((page) => page.route === "/casux-research-center")?.pageKind).toBe(
      "content-collection-index",
    );

    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/casux-research-center/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              [
                "<main>",
                "<section><h1>Research</h1><p>Notes, reports, and analysis stay organized in one route-owned collection for serious review.</p></section>",
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>Research index</h2><p>Browse the current records without leaving the collection surface.</p><div data-shpitto-blog-list><article class="detail-card article-card"><h3>Standards alignment note</h3><p>Collection-first record for standards context, review cadence, and supporting references.</p><a href="/standards-system/">Open standards system</a></article></div></section>',
                "<section><h2>Context</h2><p>Use the surrounding routes when the research question becomes a standards review, certification discussion, or case comparison.</p></section>",
                "<section><h2>Next step</h2><p>The collection remains index-first unless the brief explicitly asks for publishable article detail pages.</p></section>",
                "</main>",
              ].join(""),
            ),
          }
        : file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.detail-card, .article-card { padding: 1.25rem; }`,
            }
          : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText:
          "Build a research center hub. Do not invent publishable article detail pages unless the prompt explicitly asks for them.",
      }),
    ).not.toThrow();
  });

  it("normalizes portfolio-blog first-pass detail links into index-only cards when the brief explicitly defers detail generation", () => {
    const requirementText = [
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join(" ");
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          websiteSurfaceMode: "portfolio-blog-site",
          routes: ["/", "/blog", "/about", "/contact"],
          navLabels: ["Home", "Blog", "About", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/about/index.html", "/contact/index.html"],
        },
      },
    } as any);

    const files = validGeneratedFiles(decision.routes)
      .filter((file) => !/^\/blog\/[^/]+\/index\.html$/i.test(String(file.path || "")))
      .map((file) =>
        file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.blog-card { padding: 24px; }`,
            }
          : file.path === "/blog/index.html"
            ? {
                ...file,
                content: String(file.content).replace(
                  /<main>[\s\S]*<\/main>/,
                  `<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card"><h2><a href="/blog/ai-opportunity-scan/">AI opportunity scan</a></h2><p>Archive-ready summary.</p></article><article class="blog-card"><h2><a href="/blog/devops-operating-system/">DevOps operating system</a></h2><p>Archive-ready summary.</p></article><article class="blog-card"><h2><a href="/blog/ai-saas-commercialization/">AI SaaS commercialization</a></h2><p>Archive-ready summary.</p></article></div></section></main>`,
                ),
              }
            : file,
      );

    const validated = validateAndNormalizeRequiredFilesWithQa({
      decision,
      files,
      requirementText,
      websiteSurfaceMode: "portfolio-blog-site",
    });

    const blogHtml = String(validated.files.find((file) => file.path === "/blog/index.html")?.content || "");
    expect(blogHtml).not.toContain('href="/blog/ai-opportunity-scan/"');
    expect(blogHtml).not.toContain('href="/blog/devops-operating-system/"');
    expect(blogHtml).not.toContain('href="/blog/ai-saas-commercialization/"');
    expect(blogHtml).toContain("<span");
    expect(validated.files.some((file) => /^\/blog\/[^/]+\/index\.html$/i.test(file.path))).toBe(false);
  });

  it("normalizes portfolio-blog first-pass detail links when surface mode is passed explicitly without workflow context", () => {
    const requirementText = [
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join(" ");
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
    } as any);

    const files = validGeneratedFiles(["/", "/blog", "/about", "/contact"])
      .filter((file) => !/^\/blog\/[^/]+\/index\.html$/i.test(String(file.path || "")))
      .map((file) =>
        file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.blog-card { padding: 24px; }`,
            }
          : file.path === "/blog/index.html"
            ? {
                ...file,
                content: String(file.content).replace(
                  /<main>[\s\S]*<\/main>/,
                  `<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card"><h2><a href="/blog/ai-opportunity-scan/">AI opportunity scan</a></h2><p>Archive-ready summary.</p></article><article class="blog-card"><h2><a href="/blog/devops-operating-system/">DevOps operating system</a></h2><p>Archive-ready summary.</p></article><article class="blog-card"><h2><a href="/blog/ai-saas-commercialization/">AI SaaS commercialization</a></h2><p>Archive-ready summary.</p></article></div></section></main>`,
                ),
              }
            : file,
      );

    const validated = validateAndNormalizeRequiredFilesWithQa({
      decision,
      files,
      requirementText,
      websiteSurfaceMode: "portfolio-blog-site",
    });

    const blogHtml = String(validated.files.find((file) => file.path === "/blog/index.html")?.content || "");
    expect(blogHtml).not.toContain('href="/blog/ai-opportunity-scan/"');
    expect(blogHtml).not.toContain('href="/blog/devops-operating-system/"');
    expect(blogHtml).not.toContain('href="/blog/ai-saas-commercialization/"');
    expect(blogHtml).toContain("<span");
    expect(validated.files.some((file) => /^\/blog\/[^/]+\/index\.html$/i.test(file.path))).toBe(false);
  });

  it("sanitizes blog index page-mechanics entry wording during portfolio-blog first-pass normalization", () => {
    const requirementText = [
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join(" ");
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
    } as any);

    const files = validGeneratedFiles(["/", "/blog", "/about", "/contact"])
      .filter((file) => !/^\/blog\/[^/]+\/index\.html$/i.test(String(file.path || "")))
      .map((file) =>
        file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.blog-card { padding: 24px; }`,
            }
          : file.path === "/blog/index.html"
            ? {
                ...file,
                content: String(file.content).replace(
                  /<main>[\s\S]*<\/main>/,
                  `<main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div class="collection-section-head"><p class="section-copy">每篇文章都以清晰标题、简要摘要和明确阅读入口呈现，便于快速检索主题与内容方向。</p></div><div data-shpitto-blog-list><article class="blog-card"><h2><a href="/blog/ai-opportunity-scan/">AI opportunity scan</a></h2><p>Archive-ready summary.</p></article></div></section></main>`,
                ),
              }
            : file,
      );

    const validated = validateAndNormalizeRequiredFilesWithQa({
      decision,
      files,
      requirementText,
      websiteSurfaceMode: "portfolio-blog-site",
    });

    const blogHtml = String(validated.files.find((file) => file.path === "/blog/index.html")?.content || "");
    expect(blogHtml).not.toContain("明确阅读入口");
    expect(blogHtml).not.toContain("阅读入口");
    expect(() => findVisiblePageMechanicsScaffoldForTesting(blogHtml)).not.toThrow();
    expect(findVisiblePageMechanicsScaffoldForTesting(blogHtml)).toEqual([]);
  });

  it("does not treat deferred blog-detail wording as an immediate detail-fill request", () => {
    const requirementText = [
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
    ].join(" ");
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      sitemap: ["/", "/blog", "/about", "/contact"],
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          websiteSurfaceMode: "portfolio-blog-site",
          routes: ["/", "/blog", "/about", "/contact"],
          navLabels: ["Home", "Blog", "About", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/about/index.html", "/contact/index.html"],
        },
      },
    } as any);

    const files = [
      { path: "/styles.css", content: "body{}", type: "text/css" },
      { path: "/script.js", content: "console.log('ok')", type: "text/javascript" },
      { path: "/index.html", content: "<!doctype html><html></html>", type: "text/html" },
      {
        path: "/blog/index.html",
        content:
          '<!doctype html><html><body><a href="/blog/ai-opportunity-scan/">A</a><a href="/blog/devops-operating-system/">B</a><a href="/blog/ai-saas-commercialization/">C</a></body></html>',
        type: "text/html",
      },
      { path: "/about/index.html", content: "<!doctype html><html></html>", type: "text/html" },
      { path: "/contact/index.html", content: "<!doctype html><html></html>", type: "text/html" },
    ];

    const required = requiredFileChecklistForTesting(decision, { files, requirementText });

    expect(required.filter((file) => file.startsWith("/blog/") && file !== "/blog/index.html")).toEqual([]);
  });

  it("instructs semantic Blog-backed routes to render native content models instead of visible backend labels", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a site. The information platform publishes policy updates, standards, research reports, case library entries, and product database records.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/information-platform"],
          navLabels: ["Home", "Information Platform"],
          files: ["/styles.css", "/script.js", "/index.html", "/information-platform/index.html"],
        },
      },
    } as any);

    const contract = formatTargetPageContract(decision, "/information-platform/index.html");

    expect(contract).toContain("Semantic content binding gate");
    expect(contract).toContain("case library");
    expect(contract).toContain("standards/documents");
    expect(contract).toContain("research reports");
    expect(contract).toContain("product database");
    expect(contract).toContain("must not title or describe the section using backend names");
  });

  it("blocks semantic Blog-backed pages that expose runtime or fallback mechanics as visible copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage("Build a site. The information platform publishes standards, reports, and case library content."),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/information-platform"],
          navLabels: ["Home", "Information Platform"],
          files: ["/styles.css", "/script.js", "/index.html", "/information-platform/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/information-platform/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>Information Platform</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>Resources</h2><p>These cards can be refreshed at runtime.</p><div data-shpitto-blog-list><article><a href="/blog/standards/">Standards</a></article></div></section><section><h2>Context</h2><p>Standards and reports.</p></section><section><h2>Next</h2><p>Downloads.</p></section></main>',
            ),
          }
        : file.path === "/blog/demo/index.html"
          ? {
              ...file,
              content: [
                "<!doctype html>",
                '<html lang="zh-CN">',
                "<head>",
                "  <title>示例文章</title>",
                '  <meta charset="utf-8" />',
                '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
                '  <link rel="stylesheet" href="/styles.css" />',
                "</head>",
                "<body>",
                '  <nav><a href="/">Home</a><a href="/blog/">Blog</a></nav>',
                "  <main>",
                "    <article>",
                "      <h1>示例文章</h1>",
                "      <p>这篇示例文章保持中文为默认可见语言，只保留 Bays Wong 作为英文品牌名，并把语言切换按钮严格限制在界面层，不把中英文正文同时放进首屏可见内容。</p>",
                "      <p>正文继续围绕个人技术写作、组织实践复盘与产品判断展开，让访客先读到完整中文内容，再通过明确的语言开关切换到英文版本，而不是把两种语言直接堆叠在一个段落里。</p>",
                "      <p>这种写法可以兼容 HelloTalk、SaaS、DevOps、AI 等英文专名，同时保证整页默认阅读路径只有一种可见语言，不会被 bilingual DOM copy 规则误判。</p>",
                "      <p>因此 detail 页面既保留品牌和技术专名的真实性，也遵守单一可见语言的正文契约。</p>",
                "      <section><h2>语言切换</h2><p>语言切换仍然是控件能力，不是正文叙事；默认中文正文保持完整，英文版本只在切换后出现。</p></section>",
                "      <section><h2>品牌专名</h2><p>Bays Wong、HelloTalk、SaaS、DevOps、AI 作为专名或技术缩写出现在正文中，但不构成双语并排展示。</p></section>",
                "    </article>",
                "  </main>",
                '  <script src="/script.js"></script>',
                "</body>",
                "</html>",
              ].join("\n"),
            }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText:
          "Build an information platform with a publishable article archive and stable /blog/{slug}/ detail routes.",
      }),
    ).toThrow(
      "exposes internal Blog/content backend implementation wording",
    );
  });

  it("blocks Blog-backed pages that expose explanatory article-list scaffolding as visitor copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("我要一个个人blog，主要是ai blog，帮我生成3篇文章")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>三篇文章，带你更轻松地进入 AI 世界。</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>文章集合 / Article collection</h2><p>以下是博客的三篇首发文章。每篇文章都配有日期、阅读时长与标签。</p><div data-shpitto-blog-list><article><a href="/blog/ai-one/">AI one</a></article><article><a href="/blog/ai-two/">AI two</a></article><article><a href="/blog/ai-three/">AI three</a></article></div></section></main>',
            ),
          }
        : file.path === "/blog/demo/index.html"
          ? {
              ...file,
              content: [
                "<!doctype html>",
                '<html lang="zh-CN">',
                "<head>",
                "  <title>示例文章</title>",
                '  <meta charset="utf-8" />',
                '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
                '  <link rel="stylesheet" href="/styles.css" />',
                "</head>",
                "<body>",
                '  <nav><a href="/">Home</a><a href="/blog/">Blog</a></nav>',
                "  <main>",
                "    <article>",
                "      <h1>示例文章</h1>",
                "      <p>这篇示例文章保持中文为默认可见语言，只保留 Bays Wong 作为英文品牌名，并把语言切换按钮严格限制在界面层，不把中英文正文同时放进首屏可见内容。</p>",
                "      <p>正文继续围绕个人技术写作、组织实践复盘与产品判断展开，让访客先读到完整中文内容，再通过明确的语言开关切换到英文版本，而不是把两种语言直接堆叠在一个段落里。</p>",
                "      <p>这种写法可以兼容 HelloTalk、SaaS、DevOps、AI 等英文专名，同时保证整页默认阅读路径只有一种可见语言，不会被 bilingual DOM copy 规则误判。</p>",
                "      <p>因此 detail 页面既保留品牌和技术专名的真实性，也遵守单一可见语言的正文契约。</p>",
                "      <section><h2>语言切换</h2><p>语言切换仍然是控件能力，不是正文叙事；默认中文正文保持完整，英文版本只在切换后出现。</p></section>",
                "      <section><h2>品牌专名</h2><p>Bays Wong、HelloTalk、SaaS、DevOps、AI 作为专名或技术缩写出现在正文中，但不构成双语并排展示。</p></section>",
                "    </article>",
                "  </main>",
                '  <script src="/script.js"></script>',
                "</body>",
                "</html>",
              ].join("\n"),
            }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("exposes editorial scaffold/explanatory wording");
  });

  it("normalizes Blog-backed list cards whose outer runtime item has zero padding", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with three posts.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) => {
      if (file.path === "/styles.css") {
        return {
          ...file,
          content: `${file.content}
.blog-card { display: grid; border: 1px solid #d8d8d8; border-radius: 24px; padding: 0; overflow: hidden; }
.blog-card__copy { padding: 28px; display: grid; gap: 14px; }
`,
        };
      }
      if (file.path === "/blog/index.html") {
        return {
          ...file,
          content: String(file.content).replace(
            /<main>[\s\S]*<\/main>/,
            '<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>Selected notes</h2><p>Thoughtful essays presented as complete reading cards.</p><div data-shpitto-blog-list><a class="blog-card" href="/blog/demo/"><div class="blog-card__copy"><p>2026</p><h3>Demo</h3><p>A concise fallback summary for the generated post.</p></div></a></div></section><section><h2>Archive</h2><p>All posts remain available through stable detail links and category pages.</p></section></main>',
          ),
        };
      }
      return file;
    });

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).not.toThrow();
  });

  it("blocks bilingual output that shows Chinese and English simultaneously", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English AI blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content)
              .replace("<h1>Home</h1>", "<h1>写给每个人的 AI 小笔记。 Thoughtful AI notes for everyday readers.</h1>")
              .replace(
                "<p>This fixture is intentionally verbose so the quality gate sees a realistic homepage rather than an empty landing shell.</p>",
                "<p>这里用轻松的中文解释 AI 如何进入生活。 English readers get the same explanation in a calmer editorial voice.</p>",
              ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: [
          ...files,
          {
            path: "/i18n/messages.en.json",
            type: "application/json",
            content: JSON.stringify({ "home.hero.title": "Thoughtful AI notes for everyday readers." }),
          },
          {
            path: "/i18n/messages.zh-CN.json",
            type: "application/json",
            content: JSON.stringify({ "home.hero.title": "写给每个人的 AI 小笔记。" }),
          },
        ],
        requirementText: "Build a bilingual Chinese and English AI blog with a language switch.",
      }),
    ).toThrow("simultaneous bilingual visible copy");
  });

  it("does not treat English product names and technical acronyms as bilingual copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("生成单语言中文个人 Blog，不要实现中英双语，允许 SaaS、DevOps、AI、HelloTalk 等专名。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>Bays Wong 博客</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>技术实践</h2><p>文章围绕 SaaS 产品化、DevOps 组织落地、AI 创作平台与 HelloTalk 全球化社交经验展开。</p><div data-shpitto-blog-list><article><a href="/blog/devops/">DevOps 组织落地</a></article></div></section><section><h2>专题</h2><p>所有内容以中文叙述，英文只保留必要专名。</p></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "生成单语言中文个人 Blog，不要实现中英双语，允许 SaaS、DevOps、AI、HelloTalk 等专名。",
      }),
    ).not.toThrow();
  });

  it("does not treat language-switch labels and English brand names as simultaneous bilingual body copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English personal blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) => {
      if (file.path === "/index.html") {
        return {
          ...file,
          content: String(file.content).replace(
            /<main>[\s\S]*<\/main>/,
            [
              "<main>",
              '<section aria-label="Language switch"><button data-locale-toggle type="button">ZH</button></section>',
              '<section class="hero">',
              '  <div>',
              '    <h1 data-i18n="home.hero.title" data-i18n-zh="写给每个人的 AI 小笔记。" data-i18n-en="Thoughtful AI notes for everyday readers.">写给每个人的 AI 小笔记。</h1>',
              '    <p data-i18n="home.hero.lead" data-i18n-zh="这里用轻松的中文解释 AI 如何进入生活。" data-i18n-en="This page explains how AI enters everyday life in a calm editorial voice.">这里用轻松的中文解释 AI 如何进入生活。</p>',
              "  </div>",
              '  <div class="hero__media"><svg viewBox="0 0 200 120" role="img" aria-label="Preview chart"><rect width="200" height="120" rx="24" fill="#eef4ff"/></svg></div>',
              "</section>",
              "</main>",
            ].join(""),
          ),
        };
      }
      if (file.path === "/blog/index.html") {
        return {
          ...file,
          content: String(file.content).replace(
            /<main>[\s\S]*<\/main>/,
            '<main><a href="#content">跳到主要内容</a><h1>博客｜Bays Wong</h1><section aria-label="语言切换"><button type="button">中文</button><button type="button">English</button></section><section id="content" data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>技术与组织实践博客</h2><p>这里记录的是我在研发体系变革、实时音视频基础设施和创业商业化中的判断、取舍与复盘。</p><div data-shpitto-blog-list><article><a href="/blog/demo/">示例文章</a></article></div></section><section><h2>继续阅读</h2><p>从下方条目进入完整正文，默认显示中文，切换后再显示英文版本。</p></section></main>',
          ),
        };
      }
      return file;
    });

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a bilingual Chinese and English personal blog with a language switch.",
      }),
    ).not.toThrow();
  });

  it("normalizes blog-card outer padding in generated css for runtime-safe hydration", () => {
    const css = `
.blog-card { display: grid; border: 1px solid #d8d8d8; border-radius: 24px; padding: 0; overflow: hidden; }
.blog-card__copy { padding: 28px; display: grid; gap: 14px; }
`;

    const patched = normalizeGeneratedCssForTesting(css);
    expect(patched).toContain("runtime-blog-card-padding-fix");
    expect(patched).toContain("padding: max(1.25rem, 20px);");
    expect(patched).toContain("gap: 0.875rem;");
  });

  it("injects a desktop single-row nav fix when generated nav css wraps", () => {
    const css = ".site-nav{display:flex;flex-wrap:wrap;gap:.25rem}.header-utility{display:flex;gap:.5rem}";
    const normalized = normalizeGeneratedCssForTesting(css);

    expect(normalized).toContain("runtime-nav-single-row-fix");
    expect(normalized).toContain("flex-wrap: nowrap;");
    expect(normalized).toContain("overflow-x: auto;");
  });

  it("normalizes negative heading letter-spacing and hoists repeated raw hex colors into root tokens", () => {
    const css = [
      ":root{--accent:#1f5eff;}",
      "h1{letter-spacing:-.04em;color:#132033}",
      ".button-primary{background:#fff;color:#132033;border-color:#d9e0ea}",
      ".locale-switcher{background:#edf2fb}",
      "body{background:linear-gradient(180deg,#f8faff 0%,#fff 100%)}",
    ].join("");

    const normalized = normalizeGeneratedCssForTesting(css);

    expect(normalized).toContain("letter-spacing: 0");
    expect(normalized).toContain("--runtime-color-white: #ffffff;");
    expect(normalized).toContain("--runtime-color-bg-soft: #f8faff;");
    expect(normalized).toContain("--runtime-color-surface-muted: #edf2fb;");
    expect(normalized).toContain("--runtime-color-line-soft: #d9e0ea;");
    expect(normalized).toContain("--runtime-color-ink-strong: #132033;");
    expect(normalized).toContain("background:var(--runtime-color-white)");
    expect(normalized).toContain("color:var(--runtime-color-ink-strong)");
    expect(normalized).toContain("border-color:var(--runtime-color-line-soft)");
  });

  it("removes real consultation forms from routes outside the explicit host allowlist", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section id="consultation-form" class="form-band form-card">',
      "  <h2>咨询表单</h2>",
      '  <form><input name="name" /><textarea name="message"></textarea></form>',
      "</section>",
      "</body></html>",
    ].join("");
    const requirementText =
      "Only route / or /casux-information-platform may host the real consultation form with name, organization, email, topic, and message fields.";

    const sanitized = sanitizeWebsiteSkillHtmlOutputForAdapter(
      "/casux-research-center/index.html",
      html,
      requirementText,
    );

    expect(sanitized).not.toContain("<form");
    expect(sanitized).not.toContain('id="consultation-form"');
  });

  it("injects a consultation form onto allowed host routes when the host is missing one", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual CASUX institutional hub.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "Information"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-information-platform/index.html"],
        },
      },
    } as any);
    const requirementText =
      "Only route / or /casux-information-platform may host the real consultation form with name, organization, email, topic, and message fields.";
    const files = [
      { path: "/styles.css", type: "text/css", content: ".site-nav{display:flex}" },
      { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
      { path: "/index.html", type: "text/html", content: "<!doctype html><html><body><main><section><h1>Home</h1></section></main></body></html>" },
      { path: "/casux-information-platform/index.html", type: "text/html", content: "<!doctype html><html><body><main><section><h1>Info</h1></section></main></body></html>" },
    ];

    const normalized = normalizeWebsiteStaticFilesForPreview({
      decision,
      files,
      requirementText,
    });
    const byPath = new Map(normalized.map((file) => [file.path, String(file.content || "")]));

    expect(byPath.get("/index.html")).toContain("<form");
    expect(byPath.get("/index.html")).toContain('id="consultation-form"');
    expect(byPath.get("/casux-information-platform/index.html")).toContain("<form");
  });

  it("appends style-preset root variables so shared css honors the selected theme", () => {
    const css = ":root { --bg: #f5efe6; --surface:#fff9ef; --primary: #7a3524; --accent: #b6813b; }";
    const synced = syncSharedCssVariablesToStylePresetForTesting(css, {
      ...DEFAULT_STYLE_PRESET,
      colors: {
        primary: "#2E8B57",
        accent: "#F59E0B",
        background: "#FFFFFF",
        surface: "#F5FBF7",
        panel: "#FFFFFF",
        text: "#12312A",
        muted: "#51635C",
        border: "#D7E7DD",
      },
    });

    expect(synced).toContain("runtime-style-preset-sync");
    expect(synced).toContain("--primary: #2E8B57;");
    expect(synced).toContain("--accent: #F59E0B;");
    expect(synced).toContain("--surface: #F5FBF7;");
    expect(synced).not.toContain("#7a3524");
    expect(synced).not.toContain("#b6813b");
  });

  it("does not treat design-direction labels and Mercury-style brand references as simultaneous bilingual copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English personal blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content: [
              ".enterprise-hero { position: relative; overflow: hidden; min-height: 42rem; }",
              ".enterprise-hero__media { position: absolute; inset: 0; }",
              ".enterprise-hero__media img { width: 100%; height: 100%; object-fit: cover; }",
              ".enterprise-hero__content { position: relative; z-index: 2; max-width: 44rem; }",
            ].join("\n"),
          }
        : file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              [
                "<main>",
                '<section aria-label="Language switch"><button data-locale-toggle type="button">EN</button></section>',
                '<section class="hero">',
                '  <span class="eyebrow" data-i18n="theme.label" data-i18n-zh="温暖柔和 · Mercury" data-i18n-en="Warm soft · Mercury">温暖柔和 · Mercury</span>',
                '  <h1 data-i18n="home.hero.title" data-i18n-zh="让 AI 落地到组织、架构与商业结果。" data-i18n-en="Bring AI into organizations, architecture, and business outcomes.">让 AI 落地到组织、架构与商业结果。</h1>',
                '  <p data-i18n="home.hero.lead" data-i18n-zh="我是 beihuang，长期在研发体系、实时音视频与 AI 商业化之间工作。" data-i18n-en="I am beihuang, working across engineering systems, real-time media, and AI commercialization.">我是 beihuang，长期在研发体系、实时音视频与 AI 商业化之间工作。</p>',
                '  <a class="button" href="/blog/" data-i18n="home.hero.cta" data-i18n-zh="进入博客" data-i18n-en="Read the blog">进入博客</a>',
                "</section>",
                "</main>",
              ].join(""),
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a bilingual Chinese and English personal blog with a language switch.",
      }),
    ).not.toThrow();
  });

  it("blocks duplicated lang-zh/lang-en body content even when only one language is visible at a time", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English company site with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/about"],
          navLabels: ["Home", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/about/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content: [
              ".enterprise-hero { position: relative; overflow: hidden; min-height: 42rem; }",
              ".enterprise-hero__media { position: absolute; inset: 0; }",
              ".enterprise-hero__media img { width: 100%; height: 100%; object-fit: cover; }",
              ".enterprise-hero__content { position: relative; z-index: 2; max-width: 44rem; }",
            ].join("\n"),
          }
        : file.path === "/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                /<main>[\s\S]*<\/main>/,
                [
                  "<main>",
                  '<section class="enterprise-hero" aria-labelledby="home-title">',
                  '  <div class="enterprise-hero__content">',
                  '    <h1 id="home-title"><span class="lang-zh">工业自动化合作伙伴</span><span class="lang-en">Industrial automation partner</span></h1>',
                  '    <p><span class="lang-zh">我们为学校和机构提供完整的部署支持与内容服务。</span><span class="lang-en">We provide full deployment support and editorial services for schools and institutions.</span></p>',
                  "  </div>",
                  '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Factory process" /></div>',
                  "</section>",
                  '<section class="section"><div class="feature-card"><h2><span class="lang-zh">实施路径</span><span class="lang-en">Implementation roadmap</span></h2><p><span class="lang-zh">每个阶段都有明确负责人和交付物。</span><span class="lang-en">Each phase has a named owner and explicit deliverables.</span></p></div></section>',
                  "</main>",
                ].join(""),
              ),
            }
          : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: [
          ...files,
          {
            path: "/i18n/messages.en.json",
            type: "application/json",
            content: JSON.stringify({ "home.title": "Industrial automation partner" }),
          },
          {
            path: "/i18n/messages.zh-CN.json",
            type: "application/json",
            content: JSON.stringify({ "home.title": "工业自动化合作伙伴" }),
          },
        ],
        requirementText: "Build a bilingual Chinese and English company site with a language switch.",
      }),
    ).toThrow("duplicated bilingual DOM copy");
  });

  it("requires an explicit /blog route to include the Blog data-source contract", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("生成个人网站，导航包含 Blog，Blog 要承载正式文章。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>Blog</h1><section><article><a href="/blog/devops/">DevOps 组织落地</a></article></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "生成个人网站，导航包含 Blog，Blog 要承载正式文章。",
      }),
    ).toThrow("does not include the Blog data-source contract");
  });

  it("blocks Chinese article-list reading path explainers", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("生成个人 Blog。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><h1>博客</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>文章</h2><p>阅读路径：三篇文章对应组织提效、全球化架构与创业技术落地。</p><div data-shpitto-blog-list><article><a href="/blog/a/">A</a></article><article><a href="/blog/b/">B</a></article><article><a href="/blog/c/">C</a></article></div></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "生成个人 Blog。",
      }),
    ).toThrow("reading path");
  });

  it("blocks homepage page-mechanics scaffold copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("生成个人网站，包含首页和博客。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><section class="hero"><h1>个人站首页</h1><p>阅读入口</p><p>从首页开始，循序进入深内容。接下来看博客，内容会更具体。</p></section><section><h2>继续了解</h2><p>每个入口都对应独立页面与清晰任务，方便用户按角色和目标快速进入下一步。</p></section><section><h2>真实介绍</h2><p>这里介绍作者的工程经验、研究方向、咨询边界和可验证案例，帮助访客判断是否继续阅读。</p></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "生成个人网站，包含首页和博客。",
      }),
    ).toThrow("exposes page mechanics/scaffold wording");
  });

  it("allows concrete homepage CTAs that are not route choreography", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("生成咨询顾问个人网站，首页包含案例和联系入口。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/cases", "/contact"],
          navLabels: ["首页", "案例", "联系"],
          files: ["/styles.css", "/script.js", "/index.html", "/cases/index.html", "/contact/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><section class="hero"><h1>增长与系统咨询</h1><p>为 SaaS 团队梳理获客、交付和数据闭环，把分散的增长实验变成可复用的经营系统。</p><a href="/cases/">查看案例</a><a href="/contact/">预约诊断</a></section><section><h2>服务边界</h2><p>咨询覆盖定位复盘、漏斗诊断、销售流程和上线后的数据看板，交付物直接对应团队当前的营收瓶颈。</p></section><section><h2>适合团队</h2><p>已经有基础客户和销售线索，但转化周期拉长、产品价值表达不稳定，或者交付过程依赖少数关键成员的团队。</p></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "生成咨询顾问个人网站，首页包含案例和联系入口。",
      }),
    ).not.toThrow();
  });

  it("fails the visitor copy leak gate when visible copy exposes workflow meta wording", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /contact.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/contact"],
          navLabels: ["Home", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/contact/index.html"],
        },
      },
    } as any);
    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: "body{font-family:system-ui;} header,footer{padding:16px;} nav{display:flex;gap:12px;}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          '<header><nav><a href="/">Home</a><a href="/contact/">Contact</a></nav></header>',
          [
            "<main>",
            "<section><h1>Operational publishing systems for regulated documentation teams</h1><p>Prompt Control Manifest, content gap, and assumption notes should never be visitor-facing.</p></section>",
            "<section><h2>Documentation governance model</h2><p>The team helps operations leaders turn fragmented review rules, approval checkpoints, and delivery expectations into one publishable documentation system that internal writers and external readers can actually follow.</p></section>",
            "<section><h2>Editorial review operations</h2><p>Recent programs consolidated stakeholder updates, working standards, escalation paths, and field case notes into one destination that reduced coordination drift across legal, policy, and delivery teams.</p></section>",
            "<section><h2>Evidence and distribution workflow</h2><p>Each route explains how announcements, reference updates, support notices, and implementation guidance move from internal review into reader-safe pages without leaking planning jargon into the finished site.</p></section>",
            "</main>",
          ].join(""),
          '<footer><a href="/">Home</a><a href="/contact/">Contact</a><p>Direct contact and delivery support.</p></footer>',
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
      {
        path: "/contact/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" /></head><body>',
          '<header><nav><a href="/">Home</a><a href="/contact/">Contact</a></nav></header>',
          "<main><section><h1>Contact</h1><p>Reach the team directly for operational alignment, communication structure, and implementation planning.</p></section><section><h2>Response path</h2><p>Share the current operating challenge, existing materials, and the key decision that needs to move forward.</p></section></main>",
          '<footer><a href="/">Home</a><a href="/contact/">Contact</a><p>Direct contact and delivery support.</p></footer>',
          '<script src="/script.js"></script></body></html>',
        ].join(""),
      },
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build routes / and /contact.",
      }),
    ).toThrow(/exposes workflow\/process\/meta wording instead of visitor-facing content/i);
    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build routes / and /contact.",
      }),
    ).toThrow(/prompt control manifest/i);
    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build routes / and /contact.",
      }),
    ).toThrow(/content gap/i);
    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build routes / and /contact.",
      }),
    ).toThrow(/assumption/i);
  });

  it("allows substantive blog framing that mentions three essays without turning it into scaffold copy", () => {
    const requirement =
      "Generate a personal blog with three articles that reflect the author's methods and judgment. Generate 3 complete articles.";
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>Blog</h1><p>These three essays examine engineering systems, global real-time architecture, and AI commercialization as reusable judgment frameworks rather than launch announcements or reading instructions.</p><div data-shpitto-blog-list><article><a href="/blog/a/">A</a></article><article><a href="/blog/b/">B</a></article><article><a href="/blog/c/">C</a></article></div></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: requirement,
      }),
    ).not.toThrow();
  });

  it("does not misclassify topical prose about reading signals as a blog reading-method explainer", () => {
    const requirement =
      "Generate a practical editorial blog for engineering teams. Generate 3 complete articles.";
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>Blog</h1><p>This blog focuses on working guidance: how to read signals, how to verify a route, and how to keep a dense interface disciplined when the surface becomes noisy.</p><div data-shpitto-blog-list><article><a href="/blog/a/">A</a></article><article><a href="/blog/b/">B</a></article><article><a href="/blog/c/">C</a></article></div></section></main>',
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: requirement,
      }),
    ).not.toThrow();
  });

  it("auto-normalizes bilingual non-blog pages with a real language switch and i18n resource files", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English AI blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);

    const files = [
      ...validGeneratedFiles(decision.routes),
      {
        path: "/i18n/messages.en.json",
        type: "application/json",
        content: JSON.stringify({
          "nav.home": "Home",
          "nav.blog": "Blog",
          "locale.en": "EN",
          "locale.zh": "ZH",
          "home.hero.title": "Thoughtful AI notes for everyday readers.",
          "home.hero.lead": "This page explains how AI enters everyday life in a calm editorial voice.",
        }),
      },
      {
        path: "/i18n/messages.zh-CN.json",
        type: "application/json",
        content: JSON.stringify({
          "nav.home": "首页",
          "nav.blog": "博客",
          "locale.en": "EN",
          "locale.zh": "ZH",
          "home.hero.title": "写给每个人的 AI 小笔记。",
          "home.hero.lead": "这里用轻松的中文解释 AI 如何进入生活。",
        }),
      },
    ];

    const validated = validateAndNormalizeRequiredFiles({
      decision,
      files,
      requirementText: "Build a bilingual Chinese and English AI blog with a language switch.",
    });

    const byPath = new Map(validated.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    expect(byPath.get("/index.html")).toContain("data-locale-toggle");
    expect(byPath.get("/script.js")).toContain("LOCALE_REGISTRY_PATH");
    expect(byPath.get("/script.js")).toContain("`/i18n/messages.${lang}.json`");
    expect(byPath.get("/i18n/messages.en.json")).toContain('"locale.zh"');
    expect(byPath.get("/i18n/messages.zh-CN.json")).toContain('"locale.en"');
  });

  it("accepts bilingual site output when the homepage includes a real i18n mapping and toggle", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English AI blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              [
                "<main>",
                '<section aria-label="Language switch"><button data-locale-toggle type="button">ZH</button></section>',
                '<section class="hero">',
                '  <div>',
                '    <h1 data-i18n="home.hero.title" data-i18n-zh="写给每个人的 AI 小笔记。" data-i18n-en="Thoughtful AI notes for everyday readers.">写给每个人的 AI 小笔记。</h1>',
                '    <p data-i18n="home.hero.lead" data-i18n-zh="这里用轻松的中文解释 AI 如何进入生活。" data-i18n-en="This page explains how AI enters everyday life in a calm editorial voice.">这里用轻松的中文解释 AI 如何进入生活。</p>',
                "  </div>",
                '  <div class="hero__media"><svg viewBox="0 0 200 120" role="img" aria-label="Preview chart"><rect width="200" height="120" rx="24" fill="#eef4ff"/></svg></div>',
                "</section>",
                '<section><h2 data-i18n="home.section.title" data-i18n-zh="AI 观察" data-i18n-en="AI observations">AI 观察</h2><p data-i18n="home.section.body" data-i18n-zh="博客承接持续更新的中文文章。" data-i18n-en="The blog continues with regularly updated articles.">博客承接持续更新的中文文章。</p></section>',
                "</main>",
              ].join(""),
            ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a bilingual Chinese and English AI blog with a language switch.",
      }),
    ).not.toThrow();
  });

  it("removes the bilingual toggle when locale resource files mirror the same language and no recoverable alternate copy exists", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("做一个中英双语机构网站，默认中文，并且需要语言切换。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["首页"],
          files: ["/styles.css", "/script.js", "/index.html", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
        },
      },
    } as any);

    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: "body{font-family:system-ui,sans-serif;} .locale-switch{display:flex;gap:.5rem;}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="zh-CN" data-lang="zh-CN">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          '  <header><nav><a href="/">首页</a><div class="locale-switch"><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button><button type="button" data-locale-toggle data-locale="en">EN</button></div></nav></header>',
          "  <main>",
          '    <section class="hero"><h1>儿童友好空间标准体系</h1><p>面向机构合作的标准、研究与实施平台。</p></section>',
          "  </main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
      {
        path: "/i18n/messages.en.json",
        type: "application/json",
        content: JSON.stringify({
          "nav.home": "Home",
          "home.hero.title": "Child-friendly space standards system",
          "home.hero.lead": "A standards, research, and implementation platform for institutional partners.",
        }),
      },
      {
        path: "/i18n/messages.zh-CN.json",
        type: "application/json",
        content: JSON.stringify({
          "nav.home": "Home",
          "home.hero.title": "Child-friendly space standards system",
          "home.hero.lead": "A standards, research, and implementation platform for institutional partners.",
        }),
      },
    ];

    const validated = validateAndNormalizeRequiredFiles({
      decision,
      files,
      requirementText: "做一个中英双语机构网站，默认中文，并且需要语言切换。",
    });
    const byPath = new Map(validated.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    expect(byPath.get("/index.html")).not.toContain("data-locale-toggle");
  });

  it("harvests real zh/en alternates from valueless data-i18n markup into distinct locale catalogs", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("做一个中英双语机构网站，默认中文，并且需要语言切换。")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["首页"],
          files: ["/styles.css", "/script.js", "/index.html", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
        },
      },
    } as any);

    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: "body{font-family:system-ui,sans-serif;} .locale-switch{display:flex;gap:.5rem;}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="zh-CN" data-lang="zh-CN">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          '  <header><nav><a href="/" id="nav.home" data-i18n data-i18n-zh="首页" data-i18n-en="Home">首页</a><div class="locale-switch"><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button><button type="button" data-locale-toggle data-locale="en">EN</button></div></nav></header>',
          "  <main>",
          '    <section class="hero"><h1 id="home.hero.title" data-i18n data-i18n-zh="儿童友好空间标准体系" data-i18n-en="Child-friendly space standards system">儿童友好空间标准体系</h1><p id="home.hero.lead" data-i18n data-i18n-zh="面向机构合作的标准、研究与实施平台。" data-i18n-en="A standards, research, and implementation platform for institutional partners.">面向机构合作的标准、研究与实施平台。</p></section>',
          "  </main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
      {
        path: "/i18n/messages.en.json",
        type: "application/json",
        content: "{}",
      },
      {
        path: "/i18n/messages.zh-CN.json",
        type: "application/json",
        content: "{}",
      },
    ];

    const validated = validateAndNormalizeRequiredFiles({
      decision,
      files,
      requirementText: "做一个中英双语机构网站，默认中文，并且需要语言切换。",
    });
    const byPath = new Map(validated.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    const en = JSON.parse(byPath.get("/i18n/messages.en.json") || "{}");
    const zh = JSON.parse(byPath.get("/i18n/messages.zh-CN.json") || "{}");

    expect(en["nav.home"]).toBe("Home");
    expect(zh["nav.home"]).toBe("首页");
    expect(en["home.hero.title"]).toBe("Child-friendly space standards system");
    expect(zh["home.hero.title"]).toBe("儿童友好空间标准体系");
  });

  it("repairs mirrored bilingual dictionaries by restoring distinct English values from HTML i18n attributes", () => {
    const files = ensureEnglishFirstI18nResourceFilesForTesting(
      [
        {
          path: "/index.html",
          type: "text/html",
          content: [
            "<!doctype html>",
            '<html lang="zh-CN" data-lang="zh-CN">',
            "<head>",
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            "</head>",
            "<body>",
            '  <nav><a href="/" id="nav.home" data-i18n data-i18n-zh="首页" data-i18n-en="Home">首页</a></nav>',
            '  <main><h1 id="home.hero.title" data-i18n data-i18n-zh="儿童友好空间标准体系" data-i18n-en="Child-friendly space standards system">儿童友好空间标准体系</h1></main>',
            '  <p id="home.hero.lead" data-i18n data-i18n-zh="面向机构合作的标准、研究与实施平台。" data-i18n-en="A standards, research, and implementation platform for institutional partners.">面向机构合作的标准、研究与实施平台。</p>',
            "</body>",
            "</html>",
          ].join("\n"),
        },
        {
          path: "/i18n/messages.en.json",
          type: "application/json",
          content: JSON.stringify({
            "nav.home": "首页",
            "home.hero.title": "儿童友好空间标准体系",
            "home.hero.lead": "面向机构合作的标准、研究与实施平台。",
          }),
        },
        {
          path: "/i18n/messages.zh-CN.json",
          type: "application/json",
          content: JSON.stringify({
            "nav.home": "首页",
            "home.hero.title": "儿童友好空间标准体系",
            "home.hero.lead": "面向机构合作的标准、研究与实施平台。",
          }),
        },
      ] as any,
      "做一个中英双语机构网站，默认中文，并且需要语言切换。",
      "zh-CN",
    );

    const byPath = new Map(files.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    const en = JSON.parse(byPath.get("/i18n/messages.en.json") || "{}");
    const zh = JSON.parse(byPath.get("/i18n/messages.zh-CN.json") || "{}");

    expect(en["nav.home"]).toBe("Home");
    expect(en["home.hero.title"]).toBe("Child-friendly space standards system");
    expect(en["home.hero.lead"]).toBe("A standards, research, and implementation platform for institutional partners.");
    expect(zh["nav.home"]).toBe("首页");
    expect(zh["home.hero.title"]).toBe("儿童友好空间标准体系");
    expect(zh["home.hero.lead"]).toBe("面向机构合作的标准、研究与实施平台。");
  });

  it("accepts structure-correct Blog detail shells during the first generation pass", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("我要一个个人blog，主要是ai blog，帮我生成3篇文章")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const blogMain =
      '<main><h1>AI Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>AI reading desk</h2><p>Practical essays for everyday readers who want to understand AI with concrete decisions and calm examples.</p><div data-shpitto-blog-list><article><a href="/blog/ai-one/">AI one</a></article><article><a href="/blog/ai-two/">AI two</a></article><article><a href="/blog/ai-three/">AI three</a></article></div></section><section><h2>Reader path</h2><p>Start with concepts, move into daily tools, then evaluate trust and safety.</p></section></main>';
    const shellDetail = (path: string, title: string) => ({
      path,
      type: "text/html",
      content: [
        "<!doctype html>",
        "<html><head>",
        `<title>${title}</title>`,
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<link rel="stylesheet" href="/styles.css" />',
        "</head><body><main>",
        `<article data-shpitto-blog-detail-shell="true"><h1>${title}</h1>`,
        "<p>This route-complete article shell fixes the topic, summary, and reading intent before the full Blog body is generated later.</p>",
        "<section><h2>What this article will cover</h2><p>The later article pass will expand the main argument, examples, and operational detail tied to the route topic.</p></section>",
        "<section><h2>Why this topic matters</h2><p>The shell already gives the reader a stable destination with clear scope instead of a broken link or title-only placeholder.</p></section>",
        "</article></main><script src=\"/script.js\"></script></body></html>",
      ].join(""),
    });
    const files = [
      ...validGeneratedFiles(decision.routes).map((file) =>
        file.path === "/blog/index.html"
          ? {
              ...file,
              content: String(file.content).replace(/<main>[\s\S]*<\/main>/, blogMain),
            }
          : file.path === "/blog/demo/index.html"
            ? {
                ...file,
                content: [
                  "<!doctype html>",
                  '<html lang="zh-CN">',
                  "<head>",
                  "  <title>示例文章</title>",
                  '  <meta charset="utf-8" />',
                  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
                  '  <link rel="stylesheet" href="/styles.css" />',
                  "</head>",
                  "<body>",
                  '  <nav><a href="/">Home</a><a href="/blog/">Blog</a></nav>',
                  "  <main>",
                  "    <article>",
                  "      <h1>示例文章</h1>",
                  "      <p>这篇示例文章保持中文为默认可见语言，只保留 Bays Wong 作为英文品牌名，并把语言切换按钮严格限制在界面层，不把中英文正文同时放进首屏可见内容。</p>",
                  "      <p>正文继续围绕个人技术写作、组织实践复盘与产品判断展开，让访客先读到完整中文内容，再通过明确的语言开关切换到英文版本，而不是把两种语言直接堆叠在一个段落里。</p>",
                  "      <p>这种写法可以兼容 HelloTalk、SaaS、DevOps、AI 等英文专名，同时保证整页默认阅读路径只有一种可见语言，不会被 bilingual DOM copy 规则误判。</p>",
                  "      <p>因此 detail 页面既保留品牌和技术专名的真实性，也遵守单一可见语言的正文契约。</p>",
                  "      <section><h2>语言切换</h2><p>语言切换仍然是控件能力，不是正文叙事；默认中文正文保持完整，英文版本只在切换后出现。</p></section>",
                  "      <section><h2>品牌专名</h2><p>Bays Wong、HelloTalk、SaaS、DevOps、AI 作为专名或技术缩写出现在正文中，但不构成双语并排展示。</p></section>",
                  "    </article>",
                  "  </main>",
                  '  <script src="/script.js"></script>',
                  "</body>",
                  "</html>",
                ].join("\n"),
              }
            : file,
      ),
      shellDetail("/blog/ai-one/index.html", "AI one"),
      shellDetail("/blog/ai-two/index.html", "AI two"),
      shellDetail("/blog/ai-three/index.html", "AI three"),
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "我要一个个人blog，主要是ai blog，帮我生成3篇文章",
      }),
    ).not.toThrow();
  });

  it("keeps blog-detail validation focused on completeness instead of semantic topic matching", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a personal blog for Bays Wong. Generate 3 complete articles about WeChat real-time media architecture, DevOps operating systems, and AI SaaS commercialization.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = [
      ...validGeneratedFiles(decision.routes).map((file) =>
        file.path === "/blog/index.html"
          ? {
              ...file,
              content: String(file.content).replace(
                /<main>[\s\S]*<\/main>/,
                '<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article><a href="/blog/wechat-real-time-media/">WeChat real-time media architecture</a><p>How global real-time media infrastructure shapes product reliability.</p></article><article><a href="/blog/devops-operating-system/">DevOps operating system</a><p>Why delivery systems become management systems at scale.</p></article><article><a href="/blog/ai-saas-commercialization/">AI SaaS commercialization</a><p>Turning model capability into repeatable business outcomes.</p></article></div></section></main>',
              ),
            }
          : file,
      ).filter(
        (file) =>
          ![
            "/blog/wechat-real-time-media/index.html",
            "/blog/devops-operating-system/index.html",
            "/blog/ai-saas-commercialization/index.html",
          ].includes(file.path),
      ),
        {
          path: "/blog/wechat-real-time-media/index.html",
          type: "text/html",
          content: [
            "<!doctype html>",
            '<html lang="en">',
            "<head><title>Archive note</title><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><link rel=\"stylesheet\" href=\"/styles.css\" /></head>",
            "<body><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a></nav><main><article>",
            "<h1>Archive note</h1>",
            "<p>This long article talks about generic website delivery process improvements and broad product communication habits without entering the stated technical domain.</p>",
            "<p>It continues with broad observations about how modern teams write landing pages, iterate on marketing ideas, and coordinate previews before deployment across an ordinary static site workflow.</p>",
            "<p>Another paragraph explains shell continuity, route stability, and how archive pages should point into detail destinations, but it still avoids the topic promised in the card.</p>",
            "<p>The final paragraph stays abstract, talking about clean implementation and editorial structure rather than the concrete systems, constraints, or domain decisions the brief asked for.</p>",
          "<section><h2>Context</h2><p>More generic discussion about process quality, alignment, and publishing mechanics.</p></section>",
          "<section><h2>Decision</h2><p>More generic discussion about consistency, polish, and content workflow.</p></section>",
          "</article></main><script src=\"/script.js\"></script></body></html>",
        ].join(""),
      },
      {
        path: "/blog/devops-operating-system/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en">',
          "<head><title>DevOps operating system</title><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><link rel=\"stylesheet\" href=\"/styles.css\" /></head>",
          "<body><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a></nav><main><article>",
          "<h1>DevOps operating system</h1>",
          "<p>DevOps operating system becomes a management system once delivery, observability, incident response, and release confidence stop being separate conversations. The article opens on that operating-system framing and keeps the terminology visible instead of retreating into generic website prose.</p>",
          "<p>For Bays Wong, the topic matters because DevOps is not only a deployment pipeline. It is the practical layer where engineering judgment, release rhythm, and cross-team feedback loops become repeatable enough to support product growth.</p>",
          "<p>The body keeps the DevOps operating system idea anchored in delivery systems, governance, and platform choices so the detail page clearly expands the archive card rather than sounding like a random editorial filler piece.</p>",
          "<p>That framing also makes it easier to connect architecture, organizational design, and execution policy without pretending that one dashboard or one automation step solves the entire problem.</p>",
          "<section><h2>Delivery systems</h2><p>The delivery system is described as infrastructure for trust: release safety, rollback clarity, and feedback timing all reinforce the operating-system metaphor.</p></section>",
          "<section><h2>Management systems</h2><p>The management-system layer explains how DevOps operating system choices affect prioritization, accountability, and the real cadence of shipping.</p></section>",
          "</article></main><script src=\"/script.js\"></script></body></html>",
        ].join(""),
      },
      {
        path: "/blog/ai-saas-commercialization/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en">',
          "<head><title>AI SaaS commercialization</title><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><link rel=\"stylesheet\" href=\"/styles.css\" /></head>",
          "<body><nav><a href=\"/\">Home</a><a href=\"/blog/\">Blog</a></nav><main><article>",
          "<h1>AI SaaS commercialization</h1>",
          "<p>AI SaaS commercialization only becomes real when model capability survives pricing pressure, onboarding friction, and operational support. This article starts from that commercialization constraint instead of talking about AI in the abstract.</p>",
          "<p>For Bays Wong, the commercialization question is product-shaping work: which workflow gets automated, what business result becomes visible, and how the SaaS layer keeps delivering value after the first demo.</p>",
          "<p>The detail page therefore keeps AI SaaS commercialization tied to packaging, adoption, and measurable outcome design so the reader can see how product strategy and technical delivery stay connected.</p>",
          "<p>That topic direction avoids generic website filler and gives the route enough substance to read like a publishable commercialization article rather than a placeholder archive destination.</p>",
          "<section><h2>Packaging</h2><p>Commercialization starts with packaging the AI capability into a repeatable SaaS offer, not with shipping a disconnected experiment.</p></section>",
          "<section><h2>Outcome design</h2><p>The article closes on outcome design: the SaaS motion only holds when commercialization logic, operator workflow, and model behavior remain aligned.</p></section>",
          "</article></main><script src=\"/script.js\"></script></body></html>",
        ].join(""),
      },
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText:
          "Build a personal blog for Bays Wong. Generate 3 complete articles about WeChat real-time media architecture, DevOps operating systems, and AI SaaS commercialization.",
      }),
    ).not.toThrow();
  });

  it("allows first-pass /blog routes to stay index-first when detail pages were not explicitly requested", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with Home and Blog.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes)
      .filter((file) => file.path !== "/blog/demo/index.html")
      .map((file) =>
        file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.blog-card { padding: 24px; }`,
            }
          : file.path === "/blog/index.html"
            ? {
                ...file,
                content: String(file.content).replace(
                  /<main>[\s\S]*<\/main>/,
                  '<main><h1>Blog</h1><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card"><h2>Entry one</h2><p>A polished summary without a detail link.</p></article></div></section></main>',
                ),
              }
            : file,
      );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a personal blog with Home and Blog.",
      }),
    ).not.toThrow();
  });

  it("rejects requested Blog articles implemented as same-page anchors instead of /blog/{slug}/ details", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with Home and Blog. Generate 3 complete articles.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes)
      .filter((file) => file.path !== "/blog/demo/index.html")
      .map((file) =>
        file.path === "/styles.css"
          ? {
              ...file,
              content: `${String(file.content || "")}\n.article-card { padding: 24px; }`,
            }
          : file.path === "/blog/index.html"
            ? {
                ...file,
                content: String(file.content).replace(
                  /<main>[\s\S]*<\/main>/,
                  [
                    "<main><h1>Blog</h1>",
                    '<section><article class="article-card"><h2>AI product practice</h2><p>Substantial card copy.</p><a href="#ai-product-practice-detail">Open detail</a></article>',
                    '<article class="article-card"><h2>SaaS commercialization</h2><p>Substantial card copy.</p><a href="#saas-commercialization-detail">Open detail</a></article>',
                    '<article class="article-card"><h2>Global messaging</h2><p>Substantial card copy.</p><a href="#global-messaging-detail">Open detail</a></article>',
                    '<article id="ai-product-practice-detail"><h2>AI product practice detail</h2><p>Long body.</p></article></section>',
                    "</main>",
                  ].join(""),
                ),
              }
            : file,
      );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "Build a personal blog with Home and Blog. Generate 3 complete articles.",
      }),
    ).toThrow("does not include the Blog data-source contract");
  });

  it("treats discovered /blog/{slug}/ links as missing required files before final validation", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with Home and Blog. Publish 1 complete article detail page.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = validGeneratedFiles(decision.routes).filter(
      (file) => file.path !== "/blog/demo/index.html",
    );

    expect(
      requiredFileChecklistForTesting(decision, {
        files,
        requirementText: "Build a personal blog with Home and Blog. Publish 1 complete article detail page.",
      }),
    ).toContain("/blog/demo/index.html");
  });

  it("keeps the default first pass index-first even if the archive contains multiple starter blog links", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with Home and Blog.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const blogLinks = [
      "/blog/ai-as-a-system/",
      "/blog/ai-is-not-the-answer-process-is/",
      "/blog/devops-for-long-running-teams/",
      "/blog/devops-value-is-fewer-errors/",
      "/blog/k12-needs-boundaries/",
      "/blog/k12-product-needs-rhythm/",
    ];
    const detailFiles = blogLinks.slice(0, 3).map((href, index) => ({
      path: `${href.replace(/^\/+/, "")}index.html`,
      type: "text/html",
      content: [
        "<!doctype html><html><head><link rel=\"stylesheet\" href=\"/styles.css\"></head><body>",
        "<main><article>",
        `<h1>Entry ${index + 1}</h1>`,
        "<p>This complete article explains the personal blog topic with enough context, background, and practical framing to read as a finished detail page rather than a placeholder shell.</p>",
        "<p>The body connects the visible archive card to a concrete argument, names the operating tension, and keeps the prose anchored to the selected personal blog theme.</p>",
        "<p>Readers get a coherent explanation of why this topic matters, how it relates to the author, and what tradeoffs shape the final point of view.</p>",
        "<p>The closing paragraph adds enough substance for static browsing, no-JS previews, and generated-site validation without leaning on runtime hydration.</p>",
        "<section><h2>Context</h2><p>The article context section gives a specific frame for the topic and avoids generic archive filler.</p></section>",
        "<section><h2>Decision</h2><p>The article decision section explains the judgment behind the topic and why it deserves a separate detail route.</p></section>",
        "</article></main><script src=\"/script.js\"></script></body></html>",
      ].join(""),
    }));
    const files = [
      ...validGeneratedFiles(decision.routes)
        .filter((file) => !file.path.startsWith("/blog/"))
        .map((file) =>
          file.path === "/styles.css"
            ? { ...file, content: `${String(file.content || "")}\n.blog-card { padding: 24px; }` }
            : file,
        ),
      {
        path: "/blog/index.html",
        type: "text/html",
        content: String(validGeneratedFiles(decision.routes).find((file) => file.path === "/blog/index.html")?.content || "").replace(
          /<main>[\s\S]*<\/main>/,
          `<main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>${blogLinks
            .map((href, index) => `<article class="blog-card"><h2><a href="${href}">Entry ${index + 1}</a></h2><p>Substantial preview ${index + 1}</p></article>`)
            .join("")}</div></section></main>`,
        ),
      },
      ...detailFiles,
    ];

    const required = requiredFileChecklistForTesting(decision, {
      files,
      requirementText: "Build a personal blog with Home and Blog.",
    });
    expect(required.filter((file) => file.startsWith("/blog/") && file !== "/blog/index.html")).toEqual([]);
  });

  it("keeps first-pass required files index-first even when non-primary html contains extra blog detail links", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a personal blog with Home and Blog.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);
    const files = [
      { path: "/styles.css", type: "text/css", content: "body{}" },
      { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
      { path: "/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Home</h1></body></html>" },
      { path: "/blog/index.html", type: "text/html", content: '<!doctype html><html><body><main><a href="/blog/primary-post/">Primary</a></main></body></html>' },
      {
        path: "/list/database/index.html",
        type: "text/html",
        content:
          '<!doctype html><html><body><main><a href="/blog/secondary-post/">Secondary</a><a href="/blog/third-post/">Third</a></main></body></html>',
      },
    ];

    const required = requiredFileChecklistForTesting(decision, {
      files,
      requirementText: "Build a personal blog with Home and Blog. Generate 1 complete article.",
    });

    expect(required).toEqual(
      expect.arrayContaining([
        "/styles.css",
        "/script.js",
        "/index.html",
        "/blog/index.html",
      ]),
    );
    expect(required).not.toContain("/blog/primary-post/index.html");
    expect(required).not.toContain("/blog/secondary-post/index.html");
    expect(required).not.toContain("/blog/third-post/index.html");
  });

  it("does not expand blog detail pages from /blog/index.html when the confirmed manifest does not include a blog data-source route", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a company website with Home, Products, Cases, Contact, About.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/products", "/custom-solutions", "/cases", "/contact", "/about"],
          navLabels: ["Home", "Products", "Custom Solutions", "Cases", "Contact", "About"],
          files: [
            "/styles.css",
            "/script.js",
            "/index.html",
            "/products/index.html",
            "/custom-solutions/index.html",
            "/cases/index.html",
            "/contact/index.html",
            "/about/index.html",
          ],
        },
      },
    } as any);
    const files = [
      { path: "/styles.css", type: "text/css", content: "body{}" },
      { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
      { path: "/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Home</h1></body></html>" },
      { path: "/products/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Products</h1></body></html>" },
      { path: "/custom-solutions/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Solutions</h1></body></html>" },
      { path: "/cases/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Cases</h1></body></html>" },
      { path: "/contact/index.html", type: "text/html", content: "<!doctype html><html><body><h1>Contact</h1></body></html>" },
      { path: "/about/index.html", type: "text/html", content: "<!doctype html><html><body><h1>About</h1></body></html>" },
      {
        path: "/blog/index.html",
        type: "text/html",
        content:
          '<!doctype html><html><body><main><a href="/blog/gift-box-material-balance/">A</a><a href="/blog/towel-handfeel-checklist/">B</a><a href="/blog/sports-textile-color-consistency/">C</a></main></body></html>',
      },
    ];

    const required = requiredFileChecklistForTesting(decision, {
      files,
      requirementText: "Build a bilingual company website for a textile manufacturer.",
    });

    expect(required).not.toContain("/blog/index.html");
    expect(required).not.toContain("/blog/gift-box-material-balance/index.html");
    expect(required).not.toContain("/blog/towel-handfeel-checklist/index.html");
    expect(required).not.toContain("/blog/sports-textile-color-consistency/index.html");
    expect(required).toEqual(
      expect.arrayContaining([
        "/styles.css",
        "/script.js",
        "/i18n/messages.en.json",
        "/i18n/messages.zh-CN.json",
        "/index.html",
        "/products/index.html",
        "/custom-solutions/index.html",
        "/cases/index.html",
        "/contact/index.html",
        "/about/index.html",
      ]),
    );
  });

  it("allows shared footer links to manifest-declared publishable blog detail routes", () => {
    const detailRoutes = [
      "/blog/wechat-real-time-media-architecture",
      "/blog/devops-operating-systems",
      "/blog/ai-saas-commercialization",
    ];
    const promptControlManifest = {
      schemaVersion: 1,
      promptKind: "canonical_website_prompt",
      routeSource: "prompt_draft_page_plan",
      websiteSurfaceMode: "portfolio-blog-site",
      routes: ["/", "/blog", "/about", "/contact"],
      navLabels: ["Home", "Blog", "About", "Contact"],
      files: [
        "/styles.css",
        "/script.js",
        "/index.html",
        "/blog/index.html",
        "/about/index.html",
        "/contact/index.html",
        ...detailRoutes.map((route) => `${route}/index.html`),
      ],
    };
    const requirementText = [
      "Build a polished personal technical blog for Bays Wong.",
      "Generate Home, Blog, About, and Contact.",
      "The Blog route must publish 3 complete article detail pages with stable /blog/{slug}/ URLs.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(promptControlManifest, null, 2),
      "```",
    ].join("\n");
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest,
      },
    } as any);
    const footerLinks = [
      '<a href="/">Home</a>',
      '<a href="/blog/">Blog</a>',
      '<a href="/about/">About</a>',
      '<a href="/contact/">Contact</a>',
      ...detailRoutes.map((route) => `<a href="${route}/">${route.split("/").pop()}</a>`),
    ].join("");
    const footer =
      `<footer class="site-footer"><div class="site-footer__inner"><div class="footer-brand"><a class="brand" href="/">Bays Wong</a><p>Concrete technical writing and operator notes.</p></div><div class="footer-grid"><div class="footer-col"><h2>Navigate</h2><ul>${[
        '<li><a href="/">Home</a></li>',
        '<li><a href="/blog/">Blog</a></li>',
        '<li><a href="/about/">About</a></li>',
        '<li><a href="/contact/">Contact</a></li>',
      ].join("")}</ul></div><div class="footer-col"><h2>Articles</h2><ul>${detailRoutes.map((route) => `<li><a href="${route}/">${route.split("/").pop()}</a></li>`).join("")}</ul></div></div><div class="footer-meta"><p>Operator notes for engineers, founders, and product teams.</p></div></div></footer>`;
    const nav = '<nav><a href="/">Home</a><a href="/blog/">Blog</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav>';
    const pageHtml = (title: string, body: string) =>
      [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        `  <title>${title}</title>`,
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <link rel="stylesheet" href="/styles.css" />',
        "</head>",
        "<body>",
        `  ${nav}`,
        `  <main>${body}</main>`,
        `  ${footer}`,
        '  <script src="/script.js"></script>',
        "</body>",
        "</html>",
      ].join("\n");
    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content:
          ".site-footer{padding:24px;background:#0f172a;color:#e2e8f0}.site-footer__inner{display:grid;gap:16px}.footer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.footer-col,.footer-brand,.footer-meta{display:block}.article-card{padding:20px;border:1px solid rgba(148,163,184,.35)}main{display:block;padding:24px}",
      },
      { path: "/script.js", type: "text/javascript", content: "document.documentElement.dataset.ready='true';" },
      {
        path: "/index.html",
        type: "text/html",
        content: pageHtml(
          "Home",
          "<section><h1>Bays Wong</h1><p>Technical writing, product judgment, and operator notes for engineers and founders.</p><p>Visitors can move from the front page into concrete essays, background context, and collaboration paths without wandering into invented archive sections.</p></section>",
        ),
      },
      {
        path: "/blog/index.html",
        type: "text/html",
        content: pageHtml(
          "Blog",
          [
            "<section>",
            "<h1>Blog</h1>",
            "<p>Three concrete essays are available as stable publishable detail pages.</p>",
            "<section data-shpitto-blog-root data-shpitto-blog-api=\"/api/blog/posts\"><div data-shpitto-blog-list>",
            "<article class=\"article-card\"><h2>WeChat real-time media architecture</h2><p>Operational notes on latency, fan-out, and media transport.</p><a href=\"/blog/wechat-real-time-media-architecture/\">Read article</a></article>",
            "<article class=\"article-card\"><h2>DevOps operating systems</h2><p>Why delivery organizations need durable working agreements.</p><a href=\"/blog/devops-operating-systems/\">Read article</a></article>",
            "<article class=\"article-card\"><h2>AI SaaS commercialization</h2><p>How packaging, trust, and operations shape AI revenue.</p><a href=\"/blog/ai-saas-commercialization/\">Read article</a></article>",
            "</div></section>",
            "</section>",
          ].join(""),
        ),
      },
      {
        path: "/about/index.html",
        type: "text/html",
        content: pageHtml(
          "About",
          "<section><h1>About</h1><p>Bays Wong writes about systems design, delivery practice, and commercialization with an operator lens.</p><p>This page explains background, working style, and the practical domains that shape the writing.</p></section>",
        ),
      },
      {
        path: "/contact/index.html",
        type: "text/html",
        content: pageHtml(
          "Contact",
          "<section><h1>Contact</h1><p>Use this route for collaborations, product advisory work, and writing inquiries.</p><p>It gives readers a direct path to start a conversation about products, systems, or editorial work.</p></section>",
        ),
      },
      ...detailRoutes.map((route) => ({
        path: `${route}/index.html`,
        type: "text/html",
        content: pageHtml(
          route.split("/").pop() || "Article",
          [
            "<article>",
            `<h1>${route.split("/").pop()}</h1>`,
            "<p>This detail page expands the archive promise into a complete readable article with concrete technical argument, context, and implications for operators.</p>",
            "<p>Readers can follow the argument from framing through tradeoffs and practical impact without dropping into placeholder summary copy.</p>",
            "<section><h2>Context</h2><p>The article explains the specific operating environment, the constraint that mattered, and the tradeoff that shaped the final approach.</p></section>",
            "<section><h2>Decision</h2><p>Readers should understand what was chosen, why alternatives were weaker, and how the decision holds up under production pressure.</p></section>",
            "</article>",
          ].join(""),
        ),
      })),
    ];

    expect(() =>
      validateWebsiteRequiredFilesWithQaForAdapter({
        decision: {
          ...decision,
          routeAuthorityMode: "prompt_manifest",
        },
        files,
        requirementText,
        enforceCorporateHomepageContract: false,
      }),
    ).not.toThrow();
  });

  it("requires bilingual locale dictionaries for bilingual website contracts", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual company website with Home, Products, Cases, Contact, About.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/products", "/cases", "/contact", "/about"],
          navLabels: ["Home", "Products", "Cases", "Contact", "About"],
          files: [
            "/styles.css",
            "/script.js",
            "/index.html",
            "/products/index.html",
            "/cases/index.html",
            "/contact/index.html",
            "/about/index.html",
          ],
        },
      },
    } as any);

    const required = requiredFileChecklistForTesting(decision, {
      requirementText: "Build a bilingual company website with Home, Products, Cases, Contact, About.",
    });

    expect(required).toEqual(
      expect.arrayContaining([
        "/i18n/messages.en.json",
        "/i18n/messages.zh-CN.json",
      ]),
    );
  });

  it("prefers manifest localeConfig bilingual mode over multilingual wording in requirement text", () => {
    const requirement = [
      "# Canonical Website Generation Prompt",
      "",
      "Build a Chinese-first bilingual editorial website.",
      "Keep a locale registry and stable translation resource structure for the shared shell.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/i18n/locales.json", "/index.html", "/blog/index.html"],
          localeConfig: {
            mode: "bilingual",
            defaultLocale: "zh-CN",
            locales: ["zh-CN", "en"],
            translationDriven: false,
            sourceCatalogPath: "/i18n/messages.zh-CN.json",
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["Home", "Blog"],
          files: ["/styles.css", "/script.js", "/i18n/locales.json", "/index.html", "/blog/index.html"],
          localeConfig: {
            mode: "bilingual",
            defaultLocale: "zh-CN",
            locales: ["zh-CN", "en"],
          },
        },
      },
    } as any);

    const required = requiredFileChecklistForTesting(decision, { requirementText: requirement });
    expect(required).toEqual(
      expect.arrayContaining([
        "/i18n/messages.en.json",
        "/i18n/messages.zh-CN.json",
      ]),
    );
    expect(required).not.toContain("/i18n/locales.json");
  });

  it("keeps manifest-declared English-only sites out of locale scaffolding even when the prompt mentions shared locale mechanics", () => {
    const requirement = [
      "# Canonical Website Generation Prompt",
      "",
      "- Language: English",
      "- Locale contract: this site is single-language English-first. Do not emit an EN/ZH switch, bilingual resource files, or hidden alternate-language shell payloads.",
      "- Shared-shell validation may mention locale switch consistency and i18n mechanics as generic workflow guidance.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/cases"],
          navLabels: ["Home", "Cases"],
          files: ["/styles.css", "/script.js", "/index.html", "/cases/index.html"],
          discoveryBrief: {
            localeMode: "en",
            defaultLocale: "en",
            routes: ["/", "/cases"],
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirement)],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/cases"],
          navLabels: ["Home", "Cases"],
          files: ["/styles.css", "/script.js", "/index.html", "/cases/index.html"],
          discoveryBrief: {
            localeMode: "en",
            defaultLocale: "en",
          },
        },
      },
    } as any);

    const required = requiredFileChecklistForTesting(decision, { requirementText: requirement });
    expect(required).not.toContain("/i18n/locales.json");
    expect(required).not.toContain("/i18n/messages.en.json");
    expect(required).not.toContain("/i18n/messages.zh-CN.json");

    const normalizedJs = normalizeGeneratedJsForTesting("document.documentElement.dataset.ready = 'true';", requirement);
    expect(normalizedJs).not.toContain("LOCALE_REGISTRY_PATH");
    expect(normalizedJs).not.toContain("data-locale-select");

    const files = [
      { path: "/styles.css", type: "text/css", content: "body{font-family:system-ui,sans-serif;}" },
      { path: "/script.js", type: "text/javascript", content: "document.documentElement.dataset.ready='true';" },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en" data-lang="en">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          '  <header><nav><a href="/">Home</a><a href="/cases/">Cases</a></nav><label class="locale-switch"><select data-locale-select><option value="en" selected>en</option><option value="zh-CN">zh-CN</option></select></label></header>',
          "  <main><section><h1>Precision components for production lines</h1><p>English-only conversion copy for buyers.</p></section></main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
      {
        path: "/cases/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <header><nav><a href=\"/\">Home</a><a href=\"/cases/\">Cases</a></nav></header>",
          "  <main><section><h1>Case proof</h1><p>Production examples and measurable delivery evidence.</p></section></main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
      { path: "/i18n/locales.json", type: "application/json", content: '{"defaultLocale":"en","locales":["en","zh-CN"],"translationDriven":true,"sourceCatalog":"/i18n/messages.en.json"}' },
      { path: "/i18n/messages.en.json", type: "application/json", content: '{"nav.home":"Home"}' },
    ];

    const validated = validateAndNormalizeRequiredFiles({
      decision,
      files,
      requirementText: requirement,
    });
    const byPath = new Map(validated.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    expect(byPath.has("/i18n/locales.json")).toBe(false);
    expect(byPath.has("/i18n/messages.en.json")).toBe(false);
    expect(String(byPath.get("/index.html") || "")).not.toContain("locale-switch");
    expect(String(byPath.get("/index.html") || "")).not.toContain("data-locale-select");
  });

  it("requires locale registry and source catalog for multilingual translation-driven contracts", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese. Translation should come from catalogs instead of rebuilding pages.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/about"],
          navLabels: ["Home", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/about/index.html"],
        },
      },
    } as any);

    const required = requiredFileChecklistForTesting(decision, {
      requirementText:
        "Build a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese. Translation should come from catalogs instead of rebuilding pages.",
    });

    expect(required).toEqual(
      expect.arrayContaining([
        "/i18n/locales.json",
        "/i18n/messages.zh-CN.json",
      ]),
    );
    expect(required).not.toContain("/i18n/messages.en.json");
  });

  it("does not treat identical re-emits for the same target file as material progress", () => {
    const previousFiles = [
      { path: "/index.html", content: "<html><body><h1>Home</h1></body></html>", type: "text/html" },
      { path: "/styles.css", content: "body{color:#111;}", type: "text/css" },
    ];
    const currentFiles = [
      ...previousFiles,
      { path: "/index.html", content: "<html><body><h1>Home</h1></body></html>", type: "text/html" },
    ];

    expect(didRoundMateriallyChangeFilesForTesting(previousFiles, currentFiles, ["/index.html"])).toBe(false);
  });

  it("treats changed target file content as material progress", () => {
    const previousFiles = [
      { path: "/index.html", content: "<html><body><h1>Home</h1></body></html>", type: "text/html" },
      { path: "/styles.css", content: "body{color:#111;}", type: "text/css" },
    ];
    const currentFiles = [
      ...previousFiles,
      {
        path: "/index.html",
        content: "<html><body><h1>Home</h1><p>Updated hero copy.</p></body></html>",
        type: "text/html",
      },
    ];

    expect(didRoundMateriallyChangeFilesForTesting(previousFiles, currentFiles, ["/index.html"])).toBe(true);
  });

  it("extracts exact QA repair targets from invalid required file feedback", () => {
    const feedback = [
      "skill_tool_invalid_required_file: /blog/ai-from-lab-to-commercial-scale/index.html renders obvious simultaneous bilingual visible copy instead of language-switched content",
      "skill_tool_invalid_required_file: /index.html failed route QA",
    ].join("\n");

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual([
      "/blog/ai-from-lab-to-commercial-scale/index.html",
      "/index.html",
    ]);
  });

  it("adds shared CSS to QA repair targets when the failure is a content-list padding contract gap", () => {
    const feedback =
      "skill_tool_invalid_required_file: /casux-information-platform/index.html Blog list item outer class lacks runtime-safe padding: download-card: missing padding";

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual([
      "/casux-information-platform/index.html",
      "/styles.css",
    ]);
  });

  it("adds /index.html as a repair target for homepage semantic mismatch findings", () => {
    const feedback =
      "skill_tool_invalid_required_file: /index.html failed route QA\nanti-slop/root-route-semantic-mismatch: Homepage route / is using downstream download or certification semantics; reframe it as the official homepage and institutional overview.";

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual(["/index.html"]);
  });

  it("adds leaked blog detail pages to QA repair targets for shared-shell route drift", () => {
    const feedback =
      "skill_tool_invalid_required_file: /index.html footer exposes undeclared internal routes outside the confirmed route plan: /blog/ai-notes-for-everyday-judgment, /blog/devops-as-team-rhythm";

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual([
      "/index.html",
      "/blog/ai-notes-for-everyday-judgment/index.html",
      "/blog/devops-as-team-rhythm/index.html",
    ]);
  });

  it("builds targeted QA repair guidance for bilingual leaks and thin blog detail pages", () => {
    const feedback = [
      "skill_tool_invalid_required_file: /index.html renders obvious simultaneous bilingual visible copy instead of language-switched content",
      "skill_tool_invalid_required_file: /blog/custom-towel-brief/index.html must contain a structure-correct Blog detail shell or a complete article/detail body",
      "skill_tool_invalid_required_file: /blog/certification-logic/index.html body depth too thin (3 substantial paragraphs)",
    ].join("\n");

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a bilingual Chinese and English manufacturing site with a language switch.", [
        "/index.html",
        "/blog/custom-towel-brief/index.html",
        "/blog/certification-logic/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("show exactly one visible language at a time"),
        expect.stringContaining("data-i18n"),
        expect.stringContaining("data-locale-toggle"),
        expect.stringContaining("hero title, lead, badges, and proof rows"),
        expect.stringContaining("/blog/custom-towel-brief/index.html"),
        expect.stringContaining("at least four substantial body paragraphs"),
        expect.stringContaining("exact visible list-card topic"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for homepage semantic mismatch failures", () => {
    const feedback = [
      "skill_tool_invalid_required_file: /index.html failed route QA",
      "anti-slop/root-route-semantic-mismatch: Homepage route / is using downstream download or certification semantics; reframe it as the official homepage and institutional overview.",
    ].join("\n");

    expect(
      buildQaRepairGuidanceForTesting(
        feedback,
        "Build the official CASUX homepage and institutional overview.",
        ["/index.html"],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("re-emit `/index.html`"),
        expect.stringContaining("title, meta description, H1, opening lead"),
        expect.stringContaining("remove support-entry, consultation-entry, contact-entry"),
        expect.stringContaining("secondary modules or later CTA bands"),
      ]),
    );
  });

  it("includes homepage semantic repair guidance in the QA repair message payload", () => {
    const feedback = [
      "skill_tool_invalid_required_file: /index.html failed route QA",
      "anti-slop/root-route-semantic-mismatch: Homepage route / is using downstream download or certification semantics; reframe it as the official homepage and institutional overview.",
    ].join("\n");

    const repair = buildQaRepairMessageForTesting(
      feedback,
      "Build the official CASUX homepage and institutional overview.",
    );

    expect(repair.targets).toEqual(["/index.html"]);
    expect(repair.guidance).toEqual(
      expect.arrayContaining([expect.stringContaining("official homepage and institutional overview first")]),
    );
    expect(repair.message).toContain("QA repair targets: /index.html");
    expect(repair.message).toContain("QA repair guidance:");
    expect(repair.message).toContain("remove support-entry, consultation-entry, contact-entry");
  });

  it("builds targeted QA repair guidance for page-mechanics and blog editorial scaffold failures", () => {
    const feedback = [
      "skill_tool_invalid_required_file: /custom-solutions/index.html exposes page mechanics/scaffold wording instead of visitor-facing content: mechanical next step",
      "skill_tool_invalid_required_file: /blog/gift-box-structure/index.html exposes editorial scaffold/explanatory wording instead of final article content: page contents explainer",
    ].join("\n");

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a manufacturing site with blog.", [
        "/custom-solutions/index.html",
        "/blog/gift-box-structure/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("delete route-choreography copy"),
        expect.stringContaining("audience problem, concrete offer, proof, capability, or direct CTA"),
        expect.stringContaining("browser previews, internal reviews, working sessions"),
        expect.stringContaining("footer group labels must not read like route guidance"),
        expect.stringContaining("/blog/gift-box-structure/index.html"),
        expect.stringContaining("remove editorial explainer phrases"),
        expect.stringContaining("Replace that scaffolding with article-specific analysis"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for visible workflow/meta wording leaks", () => {
    const feedback =
      "skill_tool_invalid_required_file: /index.html exposes workflow/process/meta wording instead of visitor-facing content: assumption";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a documentation homepage with no blog/archive behavior.", [
        "/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("remove workflow/process/meta vocabulary"),
        expect.stringContaining("assumption notes, content gap"),
        expect.stringContaining("documentation scope, reference coverage"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for shared footer destination drift", () => {
    const feedback =
      "skill_tool_invalid_required_file: /products/index.html must preserve the shared footer destinations from /index.html; missing /products";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a bilingual manufacturing site.", [
        "/products/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("same footer destination set as `/index.html`"),
        expect.stringContaining("copy the active shared footer shell first"),
      ]),
    );
  });

  it("targets /index.html and route-distinct footer guidance for duplicate footer groups", () => {
    const feedback =
      "skill_tool_invalid_required_file: /index.html duplicates the same footer link set across multiple groups";

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual(
      expect.arrayContaining(["/index.html", "/styles.css"]),
    );
    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a polished personal technical blog with Home, Blog, About, and Contact.", [
        "/index.html",
        "/styles.css",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("rewrite `/index.html` first"),
        expect.stringContaining("one canonical route-navigation group"),
        expect.stringContaining("contact methods, service actions, proof, or support links"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for shared content-list card padding gaps", () => {
    const feedback =
      "skill_tool_invalid_required_file: /casux-information-platform/index.html Blog list item outer class lacks runtime-safe padding: download-card: missing padding";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a standards and research information platform.", [
        "/casux-information-platform/index.html",
        "/styles.css",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("`/styles.css` contract issue first"),
        expect.stringContaining("direct child card/row class under `[data-shpitto-blog-list]`"),
        expect.stringContaining(".download-card"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for unexpected content-backend mounts on non-content routes", () => {
    const feedback =
      "skill_tool_invalid_required_file: /casux-certification/index.html applies the Blog/content collection data-source contract on a non-content route";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a standards and certification site.", [
        "/casux-certification/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Remove `data-shpitto-blog-root`, `data-shpitto-blog-list`"),
        expect.stringContaining("instead of inventing `/blog/{slug}/` detail links"),
        expect.stringContaining("normal route-owned destination"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for explicit /blog routes missing the data-source contract", () => {
    const feedback =
      "skill_tool_invalid_required_file: /blog/index.html does not include the Blog data-source contract";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a polished personal technical blog with a real /blog archive.", [
        "/blog/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("affected route is `/blog`"),
        expect.stringContaining("data-shpitto-blog-root"),
        expect.stringContaining('data-shpitto-blog-api="/api/blog/posts"'),
        expect.stringContaining("data-shpitto-blog-list"),
      ]),
    );
  });

  it("builds targeted QA repair guidance for explicit /blog routes missing publishable detail links", () => {
    const feedback =
      "skill_tool_invalid_required_file: /blog/index.html must expose 3 /blog/{slug}/ detail links for the requested publishable content items; found 0";

    expect(
      buildQaRepairGuidanceForTesting(
        feedback,
        "Build a polished personal technical blog with 3 publishable article detail pages.",
        ["/blog/index.html"],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("every visible archive card"),
        expect.stringContaining("/blog/{slug}/` detail link"),
        expect.stringContaining("matching `/blog/{slug}/index.html` files"),
        expect.stringContaining("Do not replace them with generic launch notes"),
      ]),
    );
  });

  it("routes index-first unexpected blog detail links back to /blog/index.html", () => {
    const feedback =
      "skill_tool_invalid_required_file: Blog/content fallback exposes 3 detail links without an explicit requested content count; do not expose any /blog/{slug}/ detail links or static detail pages in the initial pass unless the brief explicitly asks for them";

    expect(extractQaRepairTargetsForTesting(feedback)).toEqual(
      expect.arrayContaining(["/blog/index.html"]),
    );
    expect(
      buildQaRepairGuidanceForTesting(
        feedback,
        "Build a polished personal technical blog for an AI consultant. The first pass only needs a strong blog index. Do not generate blog detail pages yet.",
        ["/blog/index.html"],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("re-emit `/blog/index.html` only"),
        expect.stringContaining("remove all live `/blog/{slug}/` anchors"),
        expect.stringContaining("keep exactly three substantial archive cards"),
        expect.stringContaining("blog-detail-fill workflow"),
      ]),
    );
  });

  it("treats an explicit blog-detail fill instruction as active even when earlier history said details would be filled later", () => {
    const requirementText = [
      "# Canonical Website Generation Prompt",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      "The first pass only needs a strong blog index and a profile-led homepage.",
      "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
      "",
      "fill blog detail pages now and align the slugs",
    ].join("\n");

    expect(hasExplicitBlogDetailFillRequestForTesting(requirementText)).toBe(true);
  });

  it("builds targeted QA repair guidance for collection openings that still use legacy hero utilities", () => {
    const feedback =
      "skill_tool_invalid_required_file: /casux-research-center/index.html reuses the legacy split-hero template instead of a route-owned content collection opening";

    expect(
      buildQaRepairGuidanceForTesting(feedback, "Build a standards and research information platform.", [
        "/casux-research-center/index.html",
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("content collection openings must replace legacy `hero-title`, `hero-lead`, `hero__actions`, and `hero__content`"),
        expect.stringContaining("`collection-title`, `collection-lead`, `collection-actions`"),
        expect.stringContaining("resource-index-header"),
        expect.stringContaining("delete the split opening scaffold entirely"),
      ]),
    );
  });

  it("collapses duplicated visible zh/en sibling nodes into one i18n-aware node", () => {
    const html = [
      '<h2 class="module-title" data-i18n-zh>继续阅读</h2>',
      '<h2 class="module-title" data-i18n-en>Continue reading</h2>',
    ].join("\n");

    expect(collapseVisibleBilingualPairsForTesting(html, "zh")).toContain(
      '<h2 class="module-title" data-i18n data-i18n-zh="继续阅读" data-i18n-en="Continue reading">继续阅读</h2>',
    );
  });

  it("collapses plain zh/en sibling nodes into one i18n-aware node", () => {
    const html = [
      '<p class="hero-lead">用克制、实用的方式解释 AI 如何进入日常判断。</p>',
      '<p class="hero-lead">Calm editorial guidance for people who want practical AI judgment.</p>',
    ].join("\n");

    expect(collapseVisibleBilingualPairsForTesting(html, "zh-CN")).toContain(
      '<p class="hero-lead" data-i18n data-i18n-zh="用克制、实用的方式解释 AI 如何进入日常判断。" data-i18n-en="Calm editorial guidance for people who want practical AI judgment.">用克制、实用的方式解释 AI 如何进入日常判断。</p>',
    );
  });

  it("normalizes inline bilingual form labels to a single visible locale", () => {
    const html = [
      '<label for="name" data-i18n="contact.form.name" data-i18n-zh="姓名 / Name" data-i18n-en="Name">姓名 / Name</label>',
      '<option value="gift" data-i18n="contact.form.topic.gift" data-i18n-zh="礼品 / Gift" data-i18n-en="Gift">礼品 / Gift</option>',
    ].join("\n");

    const normalized = collapseVisibleBilingualPairsForTesting(html, "zh-CN");
    expect(normalized).toContain(
      '<label for="name" data-i18n="contact.form.name" data-i18n-zh="姓名" data-i18n-en="Name">姓名</label>',
    );
    expect(normalized).toContain(
      '<option value="gift" data-i18n="contact.form.topic.gift" data-i18n-zh="礼品" data-i18n-en="Gift">礼品</option>',
    );
  });

  it("normalizes known shared-shell English snippets into switchable locale copy", () => {
    const html = [
      "<footer>",
      '<small>Textile manufacturing</small>',
      '<p data-i18n="footer.focus.copy" data-i18n-zh="B2B textile, OEM/ODM, certified sourcing, gift packaging, and brand-ready merchandising." data-i18n-en="B2B textile, OEM/ODM, certified sourcing, gift packaging, and brand-ready merchandising.">B2B textile, OEM/ODM, certified sourcing, gift packaging, and brand-ready merchandising.</p>',
      '<span>Text wordmark brand system · warm editorial presentation</span>',
      "</footer>",
    ].join("");

    const normalized = collapseVisibleBilingualPairsForTesting(html, "zh-CN");
    expect(normalized).toContain('data-i18n-zh="纺织制造"');
    expect(normalized).toContain(">纺织制造</small>");
    expect(normalized).toContain('data-i18n-zh="B2B 制造、OEM/ODM、认证采购、包装支持与品牌交付协同。"');
    expect(normalized).toContain(">B2B 制造、OEM/ODM、认证采购、包装支持与品牌交付协同。</p>");
    expect(normalized).toContain('data-i18n-zh="文字标识品牌系统 · 温暖编辑感呈现"');
  });

  it("normalizes footer implementation wording into visitor-facing enterprise support copy", () => {
    const html = [
      "<footer>",
      "<span>Text wordmark brand presentation</span>",
      "<span>English / Chinese site experience</span>",
      "</footer>",
    ].join("");

    const normalized = collapseVisibleBilingualPairsForTesting(html, "en");
    expect(normalized).toContain('data-i18n-en="Buyer-ready company presentation"');
    expect(normalized).toContain(">Buyer-ready company presentation</span>");
    expect(normalized).toContain('data-i18n-en="Global sourcing communication support"');
    expect(normalized).toContain(">Global sourcing communication support</span>");
  });

  it("normalizes mixed English business terms inside Chinese-default visible text", () => {
    const html = [
      "<section>",
      "<span>Operating model</span>",
      "<span>Scenario / Intervention / Evidence</span>",
      "<span>Case Library</span>",
      "<span>Repeatability</span>",
      "<span>Comparable brief</span>",
      "<span>Heritage manufacturing / craft</span>",
      "<span>Shpitto Manufacturing</span>",
      "<span>Manufacturing · B2B · Heritage Craft</span>",
      "<strong>1. Understand</strong>",
      "<strong>Gifting</strong>",
      "<strong>Retail</strong>",
      "<strong>Gift box and product pairing</strong>",
      "<p>Products、Custom Solutions、Cases 和 Contact 页面共同构成品牌入口。</p>",
      "<p>适用对象包括 manufacturer 与 enterprise buyers。</p>",
      "</section>",
    ].join("");

    const normalized = collapseVisibleBilingualPairsForTesting(html, "zh-CN");
    expect(normalized).toContain(">工作方式</span>");
    expect(normalized).toContain(">场景 / 介入 / 证据</span>");
    expect(normalized).toContain(">案例库</span>");
    expect(normalized).toContain(">可复用性</span>");
    expect(normalized).toContain(">相似项目咨询</span>");
    expect(normalized).toContain(">传承工艺制造</span>");
    expect(normalized).toContain(">Shpitto 制造</span>");
    expect(normalized).toContain(">制造 · B2B · 传承工艺</span>");
    expect(normalized).toContain(">1. 理解需求</strong>");
    expect(normalized).toContain(">礼赠</strong>");
    expect(normalized).toContain(">零售</strong>");
    expect(normalized).toContain(">礼盒与产品组合</strong>");
    expect(normalized).toContain("产品、定制方案、案例 和 联系 页面共同构成品牌入口。");
    expect(normalized).toContain("适用对象包括 制造伙伴 与 企业买家。");
  });

  it("rewrites known mechanical next-step phrasing into visitor-facing copy", () => {
    const html = '<p>我们会围绕产品、定制和工厂协同，提供清晰的回复路径与下一步信息。</p>';
    const normalized = collapseVisibleBilingualPairsForTesting(html, "zh-CN");
    expect(normalized).toContain("合作回应与后续安排");
    expect(normalized).not.toContain("下一步信息");
  });

  it("strips empty decorative brand-mark placeholders from shared brand shells", () => {
    const html = [
      '<a class="brand" href="/" aria-label="Vbuy Textile home">',
      '  <span class="brand-mark" aria-hidden="true"></span>',
      "  <span>Vbuy Textile</span>",
      "</a>",
    ].join("\n");

    const normalized = stripEmptyBrandMarkPlaceholdersForTesting(html);
    expect(normalized).not.toContain("brand-mark");
    expect(normalized).toContain("Vbuy Textile");
  });

  it("normalizes text-only brand shells under enterprise-tech visual overrides", () => {
    const html = '<a class="brand" href="/"><span class="brand-mark">VBUY <strong>Textile</strong></span></a>';

    const normalized = normalizeEnterpriseTechTextWordmarkShellForTesting(
      html,
      "Use the IBM Carbon enterprise design system homepage.",
    );

    expect(normalized).toContain("brand__wordmark");
    expect(normalized).not.toContain("brand-mark");
  });

  it("removes legacy heritage/warm direction copy under enterprise-tech visual overrides", () => {
    const html = [
      "<div>Heritage textile manufacturing</div>",
      "<div>Heritage manufacturing · warm, structured presentation</div>",
    ].join("\n");

    const normalized = normalizeEnterpriseTechLegacyDirectionCopyForTesting(
      html,
      "Use IBM Carbon with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).not.toContain("Heritage");
    expect(normalized).not.toContain("warm, structured presentation");
    expect(normalized).toContain("Enterprise manufacturing");
    expect(normalized).toContain("structured enterprise presentation");
  });

  it("does not rewrite corporate-b2b homepage openings at runtime", () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="hero">',
      '  <div class="hero__grid">',
      '    <div class="hero-copy"><h1>Enterprise sourcing</h1></div>',
      '    <aside class="hero-panel">',
      '      <figure class="shpitto-stock-media"><img src="https://example.com/a.jpg" alt="demo" /></figure>',
      '      <div class="panel">Proof content</div>',
      '    </aside>',
      '  </div>',
      '</section>',
      '<section class="section"><div class="shell-inner"><p>Second section</p></div></section>',
      '</body></html>',
    ].join("\n");

    const normalized = normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("does not mutate corporate-b2b homepage attributes at runtime", () => {
    const html = [
      '<section class="hero is-split">',
      '  <div class="hero__grid">',
      '    <div class="hero-copy">',
      '      <h1 data-i18n="home.hero.title">Title</h1>',
      "    </div>",
      "  </div>",
      "</section>",
    ].join("\n");

    const normalized = normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("leaves inner hero-grid homepage markup unchanged at runtime", () => {
    const html = [
      '<section class="section">',
      '  <div class="hero reveal">',
      '    <div class="hero-grid">',
      '      <div><h1>Title</h1></div>',
      '      <aside class="hero-aside"><p>Aside</p></aside>',
      "    </div>",
      "  </div>",
      "</section>",
    ].join("\n");

    const normalized = normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("does not convert homepage media panels at runtime", () => {
    const html = [
      '<section class="hero is-split">',
      '  <div class="hero__grid">',
      '    <div class="hero-copy"><h1>Title</h1><p>Lead</p></div>',
      '    <div class="media-panel" aria-label="Procurement-focused textile overview">',
      '      <div class="media-cover">',
      '        <img src="https://images.unsplash.com/photo-1520903074185-8eca362b3d73?auto=format&fit=crop&w=1400&q=80" alt="Towels" loading="eager">',
      '        <div class="media-overlay"><p class="caption">Overlay note</p></div>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</section>",
    ].join("\n");

    const normalized = normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("does not convert enterprise hero media frames at runtime", () => {
    const html = [
      '<section class="section"><div class="shell-inner hero">',
      '  <div class="hero-copy"><h1>Title</h1><p>Lead</p></div>',
      '  <div class="enterprise-hero-media media-frame">',
      '    <img src="https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1400&q=80" alt="Towels">',
      '    <div class="media-caption"><strong>Procurement-ready presentation</strong></div>',
      "  </div>",
      "</div></section>",
    ].join("\n");

    const normalized = normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("does not flag locale utility attributes as implementation wording in a valid corporate homepage hero", () => {
    const html = [
      '<!doctype html><html lang="en" data-locale="en"><body>',
      '<header class="site-header">',
      '  <nav class="site-nav"><div class="utility-shell" aria-label="Language switch">',
      '    <button data-locale-toggle data-locale="en">EN</button>',
      '    <button data-locale-toggle data-locale="zh-CN">ZH</button>',
      "  </div></nav>",
      "</header>",
      '<main><section class="hero"><article class="enterprise-hero">',
      '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Towels by a pool"></div>',
      '  <div class="enterprise-hero__content">',
      '    <span class="kicker">Textile export partner</span>',
      '    <h1>Dependable textile supply for buyers who value clarity, consistency, and service.</h1>',
      '    <p>Vbuy Textile helps sourcing teams compare product options, request samples, and move orders forward with practical support.</p>',
      "  </div>",
      "</article></section></main>",
      "</body></html>",
    ].join("\n");

    expect(
      findCorporateB2BHomepageContractIssuesForTesting(
        html,
        "/index.html",
        "Build a bilingual corporate homepage for enterprise buyers.",
      ),
    ).toEqual([]);
  });

  it("does not inject hardcoded scenario-specific curated imagery into generic page shells", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="hero section">',
      '  <aside class="hero-panel panel" aria-label="Product and manufacturing summary">',
      '    <div class="media-frame">',
      '      <div class="media-top"><span>Manufacturing focus</span></div>',
      "    </div>",
      "  </aside>",
      "</section>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/products/index.html",
      "Build a bilingual towel and textile export company site with pool, beach, and hospitality references.",
    );

    expect(normalized).toBe(html);
  });

  it("does not replace explicit IBM homepage media at runtime", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="section" aria-labelledby="proof-title">',
      '  <div class="section-inner proof-strip">',
      '    <div class="proof-copy"><h2 id="proof-title">Built for sourcing confidence</h2></div>',
      '    <figure class="proof-media">',
      '      <img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" alt="Stylized enterprise textile presentation" />',
      "      <figcaption>Contained visual cue for procurement confidence and product clarity.</figcaption>",
      "    </figure>",
      "  </div>",
      "</section>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/index.html",
      "Build a bilingual towel and textile export company site with pool, beach, and hospitality references. Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("does not normalize IBM enterprise homepage inline styles at runtime", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="section" aria-labelledby="hero-title">',
      '  <div class="section-inner masthead masthead--single-column">',
      '    <div class="section-row" style="align-items:end; margin-bottom:1rem;"><h2 class="page-title" style="font-size:clamp(2.5rem, 4vw, 4.5rem); max-width: 18ch;">Export-ready textile manufacturing</h2></div>',
      '    <div style="display:flex; flex-wrap:wrap; gap:0.75rem; margin-top:1.25rem;"><span class="badge">Hospitality</span><span class="badge">Pool</span></div>',
      '    <figure class="surface-card" style="margin:0; overflow:hidden;">',
      '      <img src="https://images.unsplash.com/photo-1582582494700-7c6b6b2d7d6f?auto=format&fit=crop&w=1200&q=80" alt="Folded beach towels beside a bright pool" style="width:100%; height:100%; aspect-ratio:16/9; object-fit:cover;">',
      "      <figcaption style=\"padding:var(--space-4); color:var(--text-subtle); font-size:0.95rem;\">Poolside and resort use contexts.</figcaption>",
      "    </figure>",
      '    <div class="stack" style="max-width: 760px;"><p>Measured copy band.</p></div>',
      '    <div class="stack" style="margin-bottom:var(--space-5);"><p>Section intro.</p></div>',
      '    <div class="section-row" style="flex-wrap:wrap; align-items:center;"><a class="button" href="/contact/">Contact sales</a></div>',
      '    <div class="card stack" style="background: var(--surface);"><p>CTA surface.</p></div>',
      "  </div>",
      "</section>",
      "</body></html>",
    ].join("\n");

    const normalized = normalizeEnterpriseHomepageInlineStylesForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    expect(normalized).toBe(html);
  });

  it("flags IBM homepage opening placeholder media and split-hero fallback as invalid", () => {
    const html = [
      '<section class="hero">',
      '  <div class="hero-grid">',
      '    <div class="hero-copy"><h1>Export-ready textile manufacturing</h1></div>',
      '    <div class="media-frame" role="img" aria-label="Procurement confidence visual placeholder"></div>',
      "  </div>",
      "</section>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("opening hero must include a real image node or background image");
    expect(issueText).toContain("opening hero must use enterprise-hero markup");
    expect(issueText).toContain("enterprise-hero__content");
    expect(issueText).toContain("placeholder media scaffolding");
    expect(issueText).toContain("legacy split-hero markup");
  });

  it("applies the corporate homepage contract from surface mode even when requirement text is weak", () => {
    const html = [
      '<section class="hero">',
      '  <div class="hero__grid">',
      '    <div class="hero__content"><h1>Technical proof above the fold</h1></div>',
      '    <div class="media-frame"><div class="ph-img" role="img" aria-label="Placeholder visual"></div></div>',
      "  </div>",
      "</section>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build homepage",
      "",
      "corporate-b2b-site",
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("opening hero must use enterprise-hero markup");
    expect(issueText).toContain("placeholder media scaffolding");
    expect(issueText).toContain("legacy split-hero markup");
  });

  it("does not apply the corporate homepage contract to docs homepages just because the prompt negates enterprise/corporate patterns", () => {
    const html = [
      '<section class="hero-grid">',
      '  <div class="hero-copy"><h1>Reference docs for platform teams</h1></div>',
      '  <aside class="hero-panel"><p>Generic split opening</p></aside>',
      "</section>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a docs homepage. Avoid enterprise proof bands and corporate marketing hero rhythm.",
      "",
      "docs-knowledge-site",
    );

    expect(issues).toEqual([]);
  });

  it("does not apply the corporate homepage contract to content-hub homepages just because the prompt negates enterprise/corporate patterns", () => {
    const html = [
      '<section class="hero-grid">',
      '  <div class="hero-copy"><h1>Research collections and standards briefings</h1></div>',
      '  <aside class="hero-panel"><p>Generic split opening</p></aside>',
      "</section>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a research hub homepage. Avoid enterprise proof bands and corporate buyer framing.",
      "",
      "content-hub-site",
    );

    expect(issues).toEqual([]);
  });

  it("flags corporate homepage CSS when the hero is styled as split panels instead of one overlay surface", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="enterprise-hero">',
      '  <div class="enterprise-hero__content"><h1>Reliable textile supply</h1><p>Overlay copy</p></div>',
      '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Towels by a resort pool" /></div>',
      "</section>",
      "</body></html>",
    ].join("\n");
    const css = [
      ".enterprise-hero {",
      "  display: grid;",
      "  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);",
      "}",
      ".enterprise-hero__content {",
      "  background: linear-gradient(120deg, #647c96 0%, #31465f 48%, #1f2a36 100%);",
      "  box-shadow: 0 18px 50px rgba(31,42,54,0.08);",
      "}",
      ".enterprise-hero__media {",
      "  position: relative;",
      "}",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a company website for enterprise buyers with products, custom solutions, cases, about, and contact.",
      css,
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("split-panel grid-template-columns");
    expect(issueText).toContain("background surface instead of transparent overlay text");
    expect(issueText).toContain("card shadow/panel styling");
    expect(issueText).toContain("underlying media layer");
  });

  it("does not flag transparent or none-valued enterprise hero overlay styles as panel surfaces", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="enterprise-hero">',
      '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Towels by a resort pool" /></div>',
      '  <div class="enterprise-hero__content"><h1>Reliable textile supply</h1><p>Overlay copy</p></div>',
      "</section>",
      "</body></html>",
    ].join("\n");
    const css = [
      ".enterprise-hero__content {",
      "  position: absolute;",
      "  inset: auto 2rem 2rem 2rem;",
      "  color: white;",
      "  background: transparent;",
      "  border: 0;",
      "  box-shadow: none;",
      "  backdrop-filter: none;",
      "}",
      ".enterprise-hero__media {",
      "  position: absolute;",
      "  inset: 0;",
      "}",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a company website for enterprise buyers with products, custom solutions, cases, about, and contact.",
      css,
    );

    expect(issues.join(" | ")).not.toContain("background surface instead of transparent overlay text");
    expect(issues.join(" | ")).not.toContain("card shadow/panel styling");
  });

  it("flags IBM homepage capability split layouts and malformed locale utility structure", () => {
    const html = [
      "<!doctype html><html><body>",
      '<header class="site-header">',
      '  <div class="nav-row">',
      '    <nav class="nav"><a href="/">Home</a><div class="locale-switch"><button>EN</button></div></nav>',
      '    <div class="utility language-switch"></div>',
      "  </div>",
      "</header>",
      '<section class="enterprise-hero">',
      '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Towels" /></div>',
      '  <div class="enterprise-hero__content"><h1>Enterprise textiles</h1></div>',
      "</section>",
      '<section class="section">',
      '  <div class="shell-inner content-band content-band--split">',
      '    <div class="stack"><h2>Capabilities</h2></div>',
      '    <aside class="detail"><p>Sidebar help</p></aside>',
      "  </div>",
      "</section>",
      "</body></html>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("homepage capability zone fell back to split content + sidebar");
    expect(issueText).toContain("header locale controls leaked into the primary nav");
    expect(issueText).toContain("empty locale utility shell");
  });

  it("flags IBM homepage when the opening hero has no real img media and the capability band adds a second H1", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="enterprise-hero hero-panel">',
      '  <div class="enterprise-hero__media" style="background-image:url(https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600)">',
      '    <div class="hero-media__overlay"><p>Lead</p></div>',
      "  </div>",
      "</section>",
      '<section class="band"><div class="section-heading"><h1 class="hero-title">Second hero headline</h1></div></section>',
      "</body></html>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("opening hero must place a real img/picture node inside enterprise-hero__media");
    expect(issueText).toContain("opening hero must contain the homepage H1 inside enterprise-hero__content");
    expect(issueText).toContain("second hero-scale H1");
  });

  it("does not flag a valid corporate homepage that keeps a single H1 in the opening hero and H2 in the capability band", () => {
    const html = [
      "<!doctype html><html><body>",
      "<main>",
      '<section class="enterprise-hero">',
      '  <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600" alt="Towels by a resort pool" /></div>',
      '  <div class="enterprise-hero__content"><h1 class="hero-title">Reliable textile supply</h1></div>',
      "</section>",
      '<section class="section band">',
      '  <header class="band__header"><h2 class="section-title">Capability overview</h2></header>',
      "  <div class=\"band__body\"><p>Proof and product selection guidance.</p></div>",
      "</section>",
      "</main>",
      "</body></html>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a company website for enterprise buyers with products, custom solutions, cases, about, and contact.",
      [
        ".enterprise-hero { position: relative; overflow: hidden; min-height: 42rem; }",
        ".enterprise-hero__media { position: absolute; inset: 0; }",
        ".enterprise-hero__content { position: relative; z-index: 2; max-width: 44rem; }",
      ].join("\n"),
    );

    expect(issues.join(" | ")).not.toContain("second hero-scale H1");
  });

  it("applies the enterprise homepage validator to generic corporate-b2b homepages even without explicit IBM wording", () => {
    const html = [
      "<!doctype html><html><body>",
      '<section class="hero-grid">',
      '  <div class="hero-copy"><h1>Export-ready textile manufacturing</h1></div>',
      '  <div class="media-frame" role="img" aria-label="Procurement confidence visual placeholder"></div>',
      "</section>",
      "</body></html>",
    ].join("\n");

    const issues = findCorporateB2BHomepageContractIssuesForTesting(
      html,
      "/index.html",
      "Build a company website for enterprise buyers with products, custom solutions, cases, about, and contact.",
    );

    const issueText = issues.join(" | ");
    expect(issueText).toContain("opening hero must use enterprise-hero markup");
    expect(issueText).toContain("opening hero must place a real img/picture node inside enterprise-hero__media");
  });

  it("strips empty locale-group placeholders so the header only keeps the real locale switch", () => {
    const html = [
      "<header>",
      '  <nav class="nav">',
      '    <div class="locale-group" aria-label="Language switcher"></div>',
      '    <div class="locale-switch" aria-label="Language switch"><button type="button">ZH</button></div>',
      "  </nav>",
      "</header>",
    ].join("\n");

    const normalized = stripEmptyLocaleGroupPlaceholdersForTesting(html);

    expect(normalized).not.toContain('class="locale-group"');
    expect(normalized).toContain('class="locale-switch"');
  });

  it("does not inject hardcoded curated imagery into detail-layout enterprise shells", () => {
    const html = [
      "<!doctype html><html><body>",
      '<main id="main" class="page">',
      '  <section class="section shell">',
      '    <div class="detail-layout">',
      '      <article class="detail-card">',
      "        <h1>Textile families organized for fast shortlist and comparison.</h1>",
      "      </article>",
      '      <aside class="proof-rail">',
      "        <p>Source-fit clues</p>",
      "      </aside>",
      "    </div>",
      "  </section>",
      "</main>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/products/index.html",
      "Build an English-first textile export company site with pool, beach, and hospitality cues.",
    );

    expect(normalized).toBe(html);
  });

  it("does not place hardcoded curated proof imagery after the homepage masthead", () => {
    const html = [
      "<!doctype html><html><body>",
      '<main id="main" class="main">',
      '  <section class="masthead masthead--single-column">',
      "    <div><h1>Enterprise textiles for procurement teams.</h1></div>",
      "  </section>",
      '  <section class="section"><div class="container"><p>Capability content.</p></div></section>',
      "</main>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/index.html",
      "Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage for a towel and textile exporter.",
    );

    expect(normalized).toBe(html);
  });

  it("injects curated editorial imagery into a portfolio blog homepage rail", () => {
    const html = [
      "<!doctype html><html><body>",
      '<main class="page">',
      '  <section class="section">',
      '    <div class="profile-masthead">',
      '      <div class="stack"><h1>Practical AI systems advice.</h1></div>',
      '      <aside class="profile-rail" aria-label="Profile summary and visual context">',
      '        <div class="panel stack"><p>Profile copy.</p></div>',
      "      </aside>",
      "    </div>",
      "  </section>",
      "</main>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/index.html",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
    );

    expect(normalized).toContain('data-stock-source="curated-library"');
    expect(normalized).toContain("Working notes, implementation trade-offs, and product thinking in view.");
    expect(normalized).toContain("profile-rail");
  });

  it("injects curated editorial imagery into a blog archive panel", () => {
    const html = [
      "<!doctype html><html><body>",
      '<main class="page">',
      '  <section data-shpitto-blog-root class="panel stack" aria-label="Blog collection">',
      '    <div class="stack"><h1>Archive</h1><p>Recent essays and field notes.</p></div>',
      '    <div data-shpitto-blog-list class="article-ledger"></div>',
      "  </section>",
      "</main>",
      "</body></html>",
    ].join("\n");

    const normalized = injectCuratedMediaIntoHtmlForTesting(
      html,
      "/blog/index.html",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
    );

    expect(normalized).toContain('data-stock-source="curated-library"');
    expect(normalized).toContain("Field notes, drafts, and practical writing in progress.");
  });

  it("removes non-functional nav toggles when preview CSS does not implement responsive disclosure behavior", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a polished personal technical blog for an AI consultant.")],
      phase: "conversation",
    } as any);

    const files = normalizeWebsiteStaticFilesForPreview({
      decision,
      requirementText: "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
      files: [
        {
          path: "/styles.css",
          type: "text/css",
          content: ".site-nav{display:flex;gap:0.5rem}.header-shell{display:flex;align-items:center}",
        },
        {
          path: "/script.js",
          type: "text/javascript",
          content:
            "(() => { const nav = document.querySelector('[data-site-nav]'); const navToggle = document.querySelector('[data-nav-toggle]'); if (navToggle) navToggle.addEventListener('click', () => nav.hidden = !nav.hidden); })();",
        },
        {
          path: "/index.html",
          type: "text/html",
          content: [
            "<!doctype html>",
            "<html><body>",
            '<header class="site-header"><div class="header-shell">',
            '<button class="btn nav-toggle" type="button" data-nav-toggle aria-expanded="true">Menu</button>',
            '<nav class="site-nav" data-site-nav><a href="/">Home</a><a href="/blog">Blog</a></nav>',
            "</div></header>",
            "</body></html>",
          ].join("\n"),
        },
      ],
    });

    const indexHtml = String(files.find((file) => file.path === "/index.html")?.content || "");
    expect(indexHtml).not.toContain("data-nav-toggle");
    expect(indexHtml).not.toContain(">Menu<");
  });

  it("normalizes paired portfolio/blog media layouts so split bands align and media uses paired framing", () => {
    const normalized = injectCuratedMediaIntoHtmlForTesting(
      [
        "<!doctype html><html><body>",
        '<section class="section"><div class="split-grid">',
        '<div class="story-band operator-proof"><h2>Essay context</h2><p>Longer editorial proof copy.</p></div>',
        '<figure class="media-frame ph-img" aria-label="Editorial desk context"></figure>',
        "</div></section>",
        "</body></html>",
      ].join("\n"),
      "/blog/index.html",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
    );

    expect(normalized).toContain("split-grid split-grid--aligned");
    expect(normalized).toContain("media-frame media-frame--paired ph-img");
  });

  it("injects aligned paired-media runtime CSS for portfolio/blog layouts", () => {
    const normalized = normalizeGeneratedCssForTesting(".split-grid{display:grid}.media-frame{position:relative}.article-ledger .article-item{display:grid}");
    expect(normalized).toContain(".split-grid--aligned");
    expect(normalized).toContain(".media-frame--paired");
    expect(normalized).toContain(".article-item--with-media");
  });

  it("does not flag Chinese standards lists as simultaneous bilingual leakage", () => {
    const html = [
      "<section>",
      "  <h2>质量与责任</h2>",
      "  <p>把常见采购标准变成可执行的日常动作。</p>",
      "  <p>ISO9001、ISO14001、SMETA、BSCI、OEKO-TEX、GRS 等要求不仅是证书，也是流程、材料与沟通方式的参照。</p>",
      "</section>",
    ].join("\n");

    expect(findVisibleSimultaneousBilingualCopyForTesting(html)).toEqual([]);
  });

  it("injects data-i18n toggle support into bilingual runtime scripts", () => {
    const script = [
      "(() => {",
      "  const root = document.documentElement;",
      "  root.dataset.lang = 'zh';",
      "})();",
    ].join("\n");

    const normalized = normalizeGeneratedJsForTesting(script, "Chinese and English bilingual site");
    expect(normalized).toContain("document.querySelectorAll('[data-i18n]')");
    expect(normalized).toContain("document.querySelectorAll('[data-locale-toggle]')");
    expect(normalized).toContain("localStorage.getItem(STORAGE_KEY)");
    expect(normalized).toContain("attributeFilter: ['data-lang']");
    expect(normalized).toContain("window.__shpittoPreviewBase");
    expect(normalized).toContain("const path = resolveMessagePath(normalizedLang);");
  });

  it("does not append duplicate locale runtime blocks when the bilingual helper is already present", () => {
    const script = [
      "console.log('ready');",
      "/* __shpitto_locale_runtime__ */",
      "(() => { window.__alreadyPatched = true; })();",
    ].join("\n");

    const normalized = normalizeGeneratedJsForTesting(script, "Chinese and English bilingual site");
    expect(normalized).toBe(script);
  });

  it("injects locale-registry runtime support for multilingual translation-driven sites", () => {
    const script = [
      "(() => {",
      "  const root = document.documentElement;",
      "  root.dataset.lang = 'zh-CN';",
      "})();",
    ].join("\n");

    const normalized = normalizeGeneratedJsForTesting(
      script,
      'Build a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese. Translation should come from catalogs instead of rebuilding pages.',
    );
    expect(normalized).toContain("FALLBACK_LOCALE_REGISTRY");
    expect(normalized).toContain("LOCALE_REGISTRY_PATH");
    expect(normalized).toContain("document.querySelectorAll('[data-locale-select]')");
    expect(normalized).toContain("resolveRegistryPath()");
    expect(normalized).toContain("`/i18n/messages.${lang}.json`");
  });

  it("auto-materializes a locale registry and source catalog for multilingual sites", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese. Translation should come from catalogs instead of rebuilding pages.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/"],
          navLabels: ["首页"],
          files: ["/styles.css", "/script.js", "/index.html", "/i18n/locales.json", "/i18n/messages.zh-CN.json"],
        },
      },
    } as any);

    const files = [
      {
        path: "/styles.css",
        type: "text/css",
        content: "body{font-family:system-ui,sans-serif;} .locale-switch{display:flex;gap:.5rem;}",
      },
      {
        path: "/script.js",
        type: "text/javascript",
        content: "document.documentElement.dataset.ready='true';",
      },
      {
        path: "/index.html",
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="zh-CN">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <header><nav><a href=\"/\" data-i18n=\"nav.home\">首页</a></nav></header>",
          "  <main>",
          '    <section class="enterprise-hero">',
          '      <div class="enterprise-hero__media"><img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80" alt="Institutional planning workshop" /></div>',
          '      <div class="enterprise-hero__content"><h1 data-i18n="home.hero.title">儿童友好空间标准体系</h1><p data-i18n="home.hero.lead">面向机构合作的标准、研究与实施平台。</p></div>',
          "    </section>",
          "  </main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      },
    ];

    const validated = validateAndNormalizeRequiredFiles({
      decision,
      files,
      requirementText:
        "Build a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese. Translation should come from catalogs instead of rebuilding pages.",
    });
    const byPath = new Map(validated.map((file) => [String(file.path || ""), String(file.content || "")] as const));
    expect(byPath.get("/script.js")).toContain("LOCALE_REGISTRY_PATH");
    expect(byPath.get("/i18n/locales.json")).toContain('"defaultLocale": "zh-CN"');
    expect(byPath.get("/i18n/locales.json")).toContain('"ja"');
    expect(byPath.get("/i18n/messages.zh-CN.json")).toContain('"home.hero.title"');
  });

  it("adds a concrete bilingual protocol scaffold to round prompts", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English personal blog with a language switch.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "博客"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    } as any);

    const prompt = buildWebsiteSkillToolRoundPromptForAdapter({
      round: 0,
      totalRounds: 8,
      decision,
      stylePreset: { id: "editorial", label: "Editorial", rationale: "test" } as any,
      styleName: "Editorial",
      styleReason: "Test rationale",
      loadedSkillIds: [],
      emittedFiles: [],
      requiredMissing: ["/styles.css", "/script.js"],
      objective: {
        targetFiles: ["/styles.css", "/script.js"],
        instruction: "Emit the initial shared assets for the bilingual shell.",
        strictSingleTarget: false,
      },
      requirementText: "Build a bilingual Chinese and English personal blog with a language switch.",
    });

    expect(prompt).toContain("English-first i18n-ready reference scaffold");
    expect(prompt).toContain('data-locale-toggle data-locale="zh-CN"');
    expect(prompt).toContain('data-i18n="home.hero.title"');
    expect(prompt).toContain("/i18n/messages.en.json");
    expect(prompt).toContain("/i18n/messages.zh-CN.json");
    expect(prompt).toContain("Shared asset contract:");
    expect(prompt).toContain("Responsive data/table contract:");
    expect(prompt).toContain(".table-wrap");
    expect(prompt).toContain("Color token contract:");
    expect(prompt).not.toContain("Target page contracts:");
    expect(prompt).not.toContain("Requested publishable content gate:");
    expect(prompt).toContain("prioritize the common CSS/JS layer only");
    expect(prompt).toContain("CSS surface-token rule:");
    expect(prompt).toContain("surface_css_tokens");
    expect(prompt).toContain("Shared-asset completeness rule:");
    expect(prompt).toContain("not a placeholder, bootstrap comment, partial patch");
  });

  it("keeps confirmed CASUX bilingual prompts on the EN/ZH scaffold instead of the translation-driven multilingual scaffold", () => {
    const requirementText = [
      "# Canonical Website Generation Prompt",
      "",
      "Generate the official CASUX website as an institutional standards and research hub.",
      "- Language: Chinese-first bilingual Chinese and English",
      "- Keep one locale visible at a time. Chinese is the default visible language for the first render on every route.",
      "- If bilingual support is implemented with data attributes or resource files, do not duplicate both languages visibly in the same section.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          websiteSurfaceMode: "content-hub-site",
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "Information"],
          files: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json", "/index.html", "/casux-information-platform/index.html"],
          discoveryBrief: {
            surfaceMode: "content-hub-site",
            localeMode: "bilingual",
            supportedLocales: ["zh-CN", "en"],
            defaultLocale: "zh-CN",
            routes: ["/", "/casux-information-platform"],
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      workflow_context: {
        websiteSurfaceMode: "content-hub-site",
        websiteDiscoveryBrief: {
          surfaceMode: "content-hub-site",
          localeMode: "bilingual",
          supportedLocales: ["zh-CN", "en"],
          defaultLocale: "zh-CN",
          routes: ["/", "/casux-information-platform"],
        },
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "uploaded_source_page_plan",
          websiteSurfaceMode: "content-hub-site",
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "Information"],
          files: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json", "/index.html", "/casux-information-platform/index.html"],
          discoveryBrief: {
            surfaceMode: "content-hub-site",
            localeMode: "bilingual",
            supportedLocales: ["zh-CN", "en"],
            defaultLocale: "zh-CN",
            routes: ["/", "/casux-information-platform"],
          },
        },
      },
    } as any);

    const prompt = buildWebsiteSkillToolRoundPromptForAdapter({
      round: 0,
      totalRounds: 10,
      decision,
      stylePreset: { id: "institutional", label: "Institutional", rationale: "test" } as any,
      styleName: "Institutional",
      styleReason: "CASUX bilingual regression",
      loadedSkillIds: [],
      emittedFiles: [],
      requiredMissing: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
      objective: {
        targetFiles: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
        instruction: "Emit the bilingual shared assets and locale resources.",
        strictSingleTarget: false,
      },
      requirementText,
    });

    expect(prompt).toContain("English-first i18n-ready reference scaffold");
    expect(prompt).toContain("/i18n/messages.en.json");
    expect(prompt).toContain("/i18n/messages.zh-CN.json");
    expect(prompt).not.toContain("Translation-driven locale reference scaffold");
    expect(prompt).not.toContain("/i18n/locales.json");
    expect(prompt).not.toContain('"locales":["zh-CN","en","it"]');
  });

  it("renders selected imported primary seed guidance before the model asks to load a skill", async () => {
    const guidance = await renderWebsiteSeedSkillSidecarGuidance([
      {
        id: "docs-knowledge-foundation",
        score: 24,
        reason: "surface:docs-knowledge-site",
      },
    ]);

    expect(guidance).toContain("# Recommended Website Primary Seed Guidance");
    expect(guidance).toContain("## seed:docs-knowledge-foundation");
    expect(guidance).toContain("example.html: example-backed HTML contract");
    expect(guidance).toContain("## Seed Structural Contract");
    expect(guidance).toContain("Preserve this seed's opening discipline");
    expect(guidance).toContain("route-owned documentation openings");
    expect(guidance).toContain("Call load_skill for the full skill");
  });

  it("injects route-relevant contract excerpts into selected seed guidance", async () => {
    const guidance = await renderWebsiteSeedSkillSidecarGuidance(
      [
        {
          id: "industrial-b2b-foundation",
          score: 32,
          reason: "surface:corporate-b2b-site",
        },
      ],
      {
        routes: ["/", "/products"],
        websiteSurfaceMode: "corporate-b2b-site",
      },
    );

    expect(guidance).toContain("### home contract excerpt");
    expect(guidance).toContain("### products contract excerpt");
    expect(guidance).toContain("### assets/template.html home excerpt");
  });

  it("builds a non-blocking shadow visual evaluation summary", () => {
    const evaluation = buildShadowVisualEvaluationForTesting({
      routeUnits: [
        {
          route: "/",
          navLabel: "Home",
          pageKind: "home",
          owner: "brand",
          routeContract: ["seedContract=industrial-b2b-foundation"],
          inheritedTerminology: [],
          inheritedTokens: [],
          inheritedSeedSkillIds: ["industrial-b2b-foundation"],
          openingFamily: "enterprise-industrial",
          openingTopology: "image-backed procurement masthead -> proof row -> capability band",
          mediaPlan: [],
          mediaResources: [],
          generatedFiles: ["/index.html", "/styles.css"],
          generationUnit: { unitId: "route-home", route: "/", targetFiles: ["/index.html"] },
          validationStatus: "passed",
          validationResult: { status: "passed", checkedFiles: ["/index.html"], issues: [] },
        },
        {
          route: "/products",
          navLabel: "Products",
          pageKind: "intent",
          owner: "brand",
          routeContract: ["seedContract=precision-catalog-template"],
          inheritedTerminology: [],
          inheritedTokens: [],
          inheritedSeedSkillIds: ["precision-catalog-template"],
          openingFamily: "catalog-proof",
          openingTopology: "catalog lead -> spec comparison row -> buyer inquiry strip",
          mediaPlan: [],
          mediaResources: [],
          generatedFiles: ["/products/index.html", "/styles.css"],
          generationUnit: { unitId: "route-products", route: "/products", targetFiles: ["/products/index.html"] },
          validationStatus: "passed",
          validationResult: { status: "passed", checkedFiles: ["/products/index.html"], issues: [] },
        },
      ],
      files: [
        {
          path: "/styles.css",
          type: "text/css",
          content: ":root{--bg:#fff;--surface:#f7f8fb;--text:#182433;--accent:#2e6cf6;--signal:#f59e0b;--muted:#4f6076;}",
        },
      ],
      selectedSeedSkillIds: ["industrial-b2b-foundation", "precision-catalog-template"],
      seedAuthorityMode: "seed-authoritative",
    });

    expect(evaluation?.score).toBeGreaterThanOrEqual(80);
    expect(evaluation?.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining([
        "authoredness",
        "section-differentiation",
        "seed-faithfulness",
        "typography-palette-discipline",
        "opening-non-generic-quality",
      ]),
    );
  });

  it("uses a focused contract for single interior-page rounds without unrelated blog/home prompt bloat", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build a bilingual Chinese and English company website with Home, Products, Cases, Contact, About.")],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/products", "/cases", "/contact", "/about"],
          navLabels: ["首页", "产品", "案例", "联系", "关于"],
          files: ["/styles.css", "/script.js", "/index.html", "/products/index.html", "/cases/index.html", "/contact/index.html", "/about/index.html"],
        },
      },
    } as any);

    const prompt = buildWebsiteSkillToolRoundPromptForAdapter({
      round: 5,
      totalRounds: 12,
      decision,
      stylePreset: { id: "industrial", label: "Industrial", rationale: "test" } as any,
      styleName: "Industrial",
      styleReason: "Focused interior route test",
      loadedSkillIds: [],
      emittedFiles: [
        { path: "/styles.css", type: "text/css", content: "body{}" },
        { path: "/script.js", type: "text/javascript", content: "console.log('ok')" },
        { path: "/index.html", type: "text/html", content: "<!doctype html><html></html>" },
      ],
      requiredMissing: ["/products/index.html"],
      objective: {
        targetFiles: ["/products/index.html"],
        instruction: "Emit the products page.",
        strictSingleTarget: true,
      },
      requirementText: "Build a bilingual Chinese and English company website with Home, Products, Cases, Contact, About.",
    });

    expect(prompt).toContain("Focused page contract:");
    expect(prompt).toContain("Target page contracts:");
    expect(prompt).toContain("Structured footer shell minimum:");
    expect(prompt).toContain("Follow Open Design copy discipline:");
    expect(prompt).toContain("site-footer__inner");
    expect(prompt).toContain("top-level `footer`, `.site-footer`, or `.footer` selector");
    expect(prompt).toContain("Never render phrases such as assumption notes");
    expect(prompt).toContain("footer-brand");
    expect(prompt).toContain("footer-nav");
    expect(prompt).toContain("footer-meta");
    expect(prompt).not.toContain("Content-binding route(s):");
    expect(prompt).not.toContain("Requested publishable content gate:");
    expect(prompt).not.toContain("English-first i18n-ready reference scaffold");
    expect(prompt).not.toContain("the blog currently has three recent articles");
  });

  it("blocks a homepage that reads like a downloads or certification portal", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /casux-certification.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content)
              .replace("<title>Home</title>", "<title>CASUX | login and certification entry</title>")
              .replace("<h1>Home</h1>", "<h1>Login and register entry for standards, research, and practice materials</h1>"),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("failed route QA");
  });

  it("blocks a homepage that presents support-entry identity instead of institutional overview", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build the official CASUX homepage and institutional overview.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content)
              .replace("<title>Home</title>", "<title>CASUX｜机构标准、研究发现与项目支持</title>")
              .replace(
                "<h1>Home</h1>",
                "<h1>CASUX 连接可信标准、研究发现与机构支持。</h1>",
              )
              .replace(
                "CASUX organizes standards, research, practice, and certification materials into one clear entry point. The home page is the gateway for site identity, navigation, downloads, and service paths. The right-side hero area needs real media or chart content instead of empty visual shells. Search and directory results should span the full content width so cards remain readable and aligned.",
                "面向教育运营者、研究合作方与机构采购方，整合项目参考、方法说明与咨询入口，帮助团队做出更稳妥的判断。",
              ),
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("failed route QA");
  });
  it("blocks stylesheet layouts that leave hero visuals empty or shrink search results to narrow cards", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /casux-certification.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/styles.css"
        ? {
            ...file,
            content: `
.page-visual { min-height: 520px; }
.visual-card--main { min-height: 330px; align-content: end; }
.card-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }
.search-result { padding: 16px; }
`,
          }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("failed layout QA");
  });

  it("plans CASUX prompt routes dynamically instead of fixed industrial defaults", async () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Generate CASUX website. Main nav: Home | CASUX Creation | CASUX Construction | CASUX Certification | CASUX Advocacy | CASUX Research Center | CASUX Information Platform | Downloads",
        ),
      ],
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(
      expect.arrayContaining([
        "/",
        "/casux-creation",
        "/casux-construction",
        "/casux-certification",
        "/casux-advocacy",
        "/casux-research-center",
        "/casux-information-platform",
        "/downloads",
      ]),
    );
    expect(decision.routes).not.toContain("/blog");
    expect(decision.pageBlueprints.find((page) => page.route === "/casux-information-platform")?.pageKind).toBe("content-collection-index");
    expect(decision.routes).not.toEqual(expect.arrayContaining(["/3c-machines", "/custom-solutions"]));
  });

  it("does not treat visitor-facing next-step collaboration copy as page-mechanics scaffold", () => {
    const html = `
      <section>
        <h2>Continue the collaboration with clearer project inputs.</h2>
        <p>Share the target market, operating constraints, and review context, and the team will turn the next step conversation into a clearer proposal.</p>
      </section>
    `;

    expect(findVisiblePageMechanicsScaffoldForTesting(html)).toEqual([]);
  });

  it("does not treat resource-entry or access-path language on content platforms as page-mechanics scaffold", () => {
    const html = `
      <section>
        <h1>标准、研究与案例，全部放在一个清晰的资源入口里。</h1>
        <p>围绕内容组织、访问路径和判断效率的观察记录，适合用于内部讨论与方案修订。</p>
        <p>信息平台将标准、研究、案例与咨询入口放在同一结构中，帮助用户更快找到需要的内容。</p>
      </section>
    `;

    expect(findVisiblePageMechanicsScaffoldForTesting(html)).toEqual([]);
  });

  it("flags docs homepage copy that explains page mechanics instead of subject content", () => {
    const html = `
      <section>
        <h1>API reference clarity for teams that build and ship quickly.</h1>
        <p>The page groups the platform around the three kinds of questions technical teams ask most: what Meridian offers, how the reference material is organized, and which standards govern implementation quality.</p>
        <p>The homepage frames the platform around practical usage, disciplined navigation, and the confidence to move from overview to implementation.</p>
        <p>The homepage foregrounds the kinds of proof buyers need: operational fit, deployment discipline, and a clear next conversation with the team.</p>
        <p>The homepage reflects that reality with clear, buyer-facing proof points.</p>
        <p>Responsive layout for desktop and mobile review.</p>
        <span>Shared shell</span>
        <p>The layout stays calm and responsive for browser previews, internal reviews, and working sessions.</p>
        <h2>A homepage built for careful navigation, not casual browsing.</h2>
      </section>
    `;

    expect(findVisiblePageMechanicsScaffoldForTesting(html)).toEqual(
      expect.arrayContaining([
        "page grouping explainer",
        "homepage framing explainer",
        "responsive-layout explainer",
        "implementation-mechanics label",
        "responsive-page mechanics",
        "homepage-construction explainer",
      ]),
    );
  });

  it("extracts requirement from serialized HumanMessage payload", () => {
    const serializedHumanMessage = {
      id: ["langchain_core", "messages", "HumanMessage"],
      kwargs: { content: "Generate routes / and /pricing with a fintech positioning." },
      type: "human",
    };
    const decision = buildLocalDecisionPlan({
      messages: [serializedHumanMessage as any],
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(expect.arrayContaining(["/pricing"]));
    expect(decision.requirementText).toContain("Generate routes / and /pricing");
  });

  it("uses workflow canonicalPrompt when user message is missing", () => {
    const canonicalPrompt = "Create website routes /, /about, /contact with premium consulting tone.";
    const decision = buildLocalDecisionPlan({
      messages: [{ type: "ai", content: "assistant-only message" } as any],
      workflow_context: {
        canonicalPrompt,
      },
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(expect.arrayContaining(["/", "/about", "/contact"]));
    expect(decision.requirementText).toContain("/about, /contact");
  });

  it("does not convert control phrases into bogus routes", () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          [
            "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
            "__SHP_CONFIRM_GENERATE__ please generate from prompt draft",
            "Keep the confirm token for generation, but do not treat it as a route.",
            "Cases page tags: 3C, Aluminum, High Precision, Automation.",
            "Tags must be available as: 3C / Aluminum / High Precision / Automation.",
            "Each page should contain header/nav/main/footer.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
    expect(decision.routes).not.toEqual(
      expect.arrayContaining([
        "/prompt-draft",
        "/shp-confirm-generate",
        "/6",
        "/3c",
        "/aluminum",
        "/high-precision",
        "/automation",
        "/aluminum/high",
        "/nav/main/footer",
      ]),
    );
  });
});
