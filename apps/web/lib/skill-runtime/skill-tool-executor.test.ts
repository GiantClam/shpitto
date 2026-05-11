import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  collapseVisibleBilingualPairsForTesting,
  didRoundMateriallyChangeFilesForTesting,
  extractQaRepairTargetsForTesting,
  formatTargetPageContract,
  enforceNavigationOrder,
  htmlPathToRoute,
  invokeModelWithRetry,
  isRetryableProviderError,
  normalizeToolChoiceForProvider,
  normalizeGeneratedJsForTesting,
  normalizeGeneratedCssForTesting,
  planRoundObjectiveForTesting,
  requiredFileChecklistForTesting,
  resolveToolProtocolForProvider,
  runSkillToolExecutor,
  sanitizeRequirementForGenerationForTesting,
  validateAndNormalizeRequiredFiles,
  validateAndNormalizeRequiredFilesWithQa,
} from "./skill-tool-executor";
import { renderWebsiteQualityContract } from "./website-quality-contract";
import { buildLocalDecisionPlan } from "./decision-layer";

async function* streamFrom(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function validGeneratedFiles(routes: string[]) {
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
          '    <a href="/">Home</a>',
          '    <a href="/contact/">Contact</a>',
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
  it("downgrades named tool choice for Aiberm compatibility", () => {
    const namedFinishChoice = { type: "function", function: { name: "finish" } };

    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, namedFinishChoice)).toBe("required");
    expect(normalizeToolChoiceForProvider({ provider: "pptoken" }, namedFinishChoice)).toEqual(namedFinishChoice);
    expect(normalizeToolChoiceForProvider({ provider: "crazyroute" }, namedFinishChoice)).toEqual(namedFinishChoice);
    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, "required")).toBe("required");
  });

  it("restricts Aiberm tools when named tool choice is downgraded", () => {
    const namedEmitChoice = { type: "function", function: { name: "emit_file" } };

    expect(resolveToolProtocolForProvider({ provider: "aiberm" }, namedEmitChoice)).toEqual({
      toolChoice: "required",
      toolNames: ["emit_file"],
    });
    expect(resolveToolProtocolForProvider({ provider: "pptoken" }, namedEmitChoice)).toEqual({
      toolChoice: namedEmitChoice,
      toolNames: ["load_skill", "emit_file", "web_search", "finish"],
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

  it("keeps the website quality contract aligned with concrete anti-slop rules", () => {
    const contract = renderWebsiteQualityContract();

    expect(contract).toContain("Navigation must use meaningful route labels");
    expect(contract).toContain("Footer must contribute real site content");
    expect(contract).toContain("Mobile nav may collapse visually");
    expect(contract).toContain("new page");
    expect(contract).toContain("External imagery must come from source-backed or project-owned assets");
    expect(contract).toContain("Metrics must be source-backed");
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

  it("locks the website quality contract wording with a snapshot", () => {
    expect(renderWebsiteQualityContract()).toMatchInlineSnapshot(`
      "## Website Quality Contract
      - Runtime scope is website generation only; do not generate mobile apps, slide decks, native app screens, or external coding-agent instructions.
      - One generated website must render correctly in desktop browser, MacBook, iPad, iPhone, and Android preview shells.
      - Treat preview as WYSIWYG: navigation, layout, media, forms, and responsive breakpoints must work inside iframe preview.
      - Use the selected local design system as the visual source of truth for color, typography, spacing, radius, shadows, motion, and component rhythm.
      - Avoid AI-slop defaults: no placeholder copy, no generic Feature 1/2/3 grids, no anonymous testimonials, no fake metrics, no repeated card modules across pages.
      - Navigation must use meaningful route labels; do not leave desktop or mobile nav shells as generic menu/navigation/quick links scaffolds.
      - Footer must contribute real site content; avoid copyright-only placeholders, label-only footers, or generic legal shells that add no value.
      - Mobile nav may collapse visually, but it still needs the same meaningful destinations as desktop rather than a menu-only placeholder shell.
      - When refine or generation creates a new page, that page must reuse the current site's active theme and the same shared navigation/footer shell unless the brief explicitly requests a shell redesign.
      - External imagery must come from source-backed or project-owned assets; do not ship example.com, placeholder.com, or other demo/stock placeholder URLs.
      - Metrics must be source-backed; do not invent percentages, multipliers, "hours saved", growth, or conversion-lift claims without brief or citation support.
      - Visual direction must be distinctive: expressive type pairing, intentional background system, layered sections, strong hero composition, and mobile-specific composition.
      - CSS must include responsive strategy using media queries, container queries, or clamp-based fluid sizing.
      - Every page must contain enough route-specific content depth to stand alone; sibling pages must not be superficial copies.
      - Blog detail pages must be complete publishable articles: they need a real body, meaningful section structure, and enough route-specific substance to read as finished pages instead of shells, stubs, or metadata-only placeholders.
      - Route / must always read as the site home entry, not as a downloads hub, certification portal, or login page.
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
    expect(detailContract).toContain("Render exactly one visible article language body in this file.");
    expect(detailContract).toContain("alternating zh/en paragraphs in the initial HTML");
  });

  it("treats requested bilingual blog detail pages as required skill outputs instead of runtime-only completions", () => {
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
        "/blog/agile-devops-system-design/index.html",
        "/blog/wechat-real-time-media-global/index.html",
        "/blog/ai-saas-commercialization-cto-practice/index.html",
      ]),
    );

    const objective = planRoundObjectiveForTesting(0, [
      "/blog/agile-devops-system-design/index.html",
      "/blog/wechat-real-time-media-global/index.html",
    ]);
    expect(objective.targetFiles).toEqual(["/blog/agile-devops-system-design/index.html"]);
    expect(objective.instruction).toContain("complete Blog detail HTML document");
    expect(objective.instruction).toContain("full readable article/detail page");
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
      - The confirmed Canonical Website Prompt is authoritative for page structure, content depth, audience, and design direction.
      - Page constraints:
        - Canonical Website Prompt is the authoritative source for website type, audience, content scope, page structure, and design direction.
        - Do not use hardcoded industry templates, product assumptions, or generic replacement text when the Canonical Website Prompt provides source content.
        - The page must be meaningfully distinct from sibling pages in section purpose, headings, content, and layout.
        - Navigation links must stay within the fixed route list and preserve the configured navigation order.
      - No route-specific source excerpt was found; derive a unique page architecture from the complete Canonical Website Prompt.
      - Derive route-specific sections, headings, card types, and interactions from the Canonical Website Prompt and source content.
      - Use a page-specific body architecture. Shared header/footer/design tokens are allowed; the main content section order, visual modules, and primary components must differ from sibling routes.
      - Do not apply a hardcoded industry skeleton or copy the previous page layout and only swap text.
      - Follow the workflow skill's Shared Shell/Footer Contract for header, main, and footer requirements.
      Sibling page intents to stay visually distinct from:
      /: Homepage. Establish the brand overview, core value, primary route entry, and next action while preserving site home-entry semantics.
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

  it("fails fast without a configured provider key instead of generating local files", async () => {
    await expect(runSkillToolExecutor({
      state: {
        messages: [new HumanMessage("Generate website routes / and /contact with industrial style.")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    })).rejects.toThrow("skill_tool_provider_api_key_missing");
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
    const blogRoute = decision.pageBlueprints.find((page) => page.pageKind === "blog-data-index")?.route;
    expect(blogRoute).toBe("/information-platform");

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
      }),
    ).not.toThrow();
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

    expect(() => validateAndNormalizeRequiredFiles({ decision, files })).toThrow(
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

  it("blocks Blog-backed list cards whose outer runtime item has zero padding", () => {
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
    ).toThrow("Blog list item outer class lacks runtime-safe padding");
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
        files,
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
      file.path === "/index.html"
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
      file.path === "/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              [
                "<main>",
                '<section aria-label="Language switch"><button type="button">中文</button><button type="button">English</button></section>',
                "<section>",
                '<h1><span class="lang-zh">工业自动化合作伙伴</span><span class="lang-en">Industrial automation partner</span></h1>',
                '<p><span class="lang-zh">我们为学校和机构提供完整的部署支持与内容服务。</span><span class="lang-en">We provide full deployment support and editorial services for schools and institutions.</span></p>',
                '<div class="feature-card"><h2><span class="lang-zh">实施路径</span><span class="lang-en">Implementation roadmap</span></h2><p><span class="lang-zh">每个阶段都有明确负责人和交付物。</span><span class="lang-en">Each phase has a named owner and explicit deliverables.</span></p></div>',
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
    ).toThrow("exposes editorial scaffold/explanatory wording");
  });

  it("allows substantive blog framing that mentions three essays without turning it into scaffold copy", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Generate a personal blog with three articles that reflect the author's methods and judgment.")],
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
        requirementText: "Generate a personal blog with three articles that reflect the author's methods and judgment.",
      }),
    ).not.toThrow();
  });

  it("does not misclassify topical prose about reading signals as a blog reading-method explainer", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Generate a practical editorial blog for engineering teams.")],
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
        requirementText: "Generate a practical editorial blog for engineering teams.",
      }),
    ).not.toThrow();
  });

  it("requires bilingual non-blog pages to expose real i18n mappings and a language switch", () => {
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

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: validGeneratedFiles(decision.routes),
        requirementText: "Build a bilingual Chinese and English AI blog with a language switch.",
      }),
    ).toThrow("missing bilingual i18n mappings");
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
                '<section><h2 data-i18n="home.section.title" data-i18n-zh="阅读入口" data-i18n-en="Reading entry">阅读入口</h2><p data-i18n="home.section.body" data-i18n-zh="博客承接持续更新的中文文章。" data-i18n-en="The blog continues with regularly updated articles.">博客承接持续更新的中文文章。</p></section>',
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

  it("requires requested Blog articles to have complete static detail bodies", () => {
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
    const thinDetail = (path: string, title: string) => ({
      path,
      type: "text/html",
      content: `<!doctype html><html><head><title>${title}</title></head><body><main><article><h1>${title}</h1><p>Short excerpt only.</p></article></main></body></html>`,
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
      thinDetail("/blog/ai-one/index.html", "AI one"),
      thinDetail("/blog/ai-two/index.html", "AI two"),
      thinDetail("/blog/ai-three/index.html", "AI three"),
    ];

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
        requirementText: "我要一个个人blog，主要是ai blog，帮我生成3篇文章",
      }),
    ).toThrow("must contain a complete article/detail body");
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

  it("requires any explicit /blog route to expose detail links and matching detail pages even without a requested count", () => {
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
    ).toThrow("must expose at least one /blog/{slug}/ detail link");
  });

  it("treats discovered /blog/{slug}/ links as missing required files before final validation", () => {
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
    const files = validGeneratedFiles(decision.routes).filter(
      (file) => file.path !== "/blog/demo/index.html",
    );

    expect(
      requiredFileChecklistForTesting(decision, {
        files,
        requirementText: "Build a personal blog with Home and Blog.",
      }),
    ).toContain("/blog/demo/index.html");
  });

  it("ignores /blog/{slug}/ links discovered only inside non-primary generated html routes", () => {
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

    expect(required).toContain("/blog/primary-post/index.html");
    expect(required).not.toContain("/blog/secondary-post/index.html");
    expect(required).not.toContain("/blog/third-post/index.html");
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

  it("collapses duplicated visible zh/en sibling nodes into one i18n-aware node", () => {
    const html = [
      '<h2 class="module-title" data-i18n-zh>继续阅读</h2>',
      '<h2 class="module-title" data-i18n-en>Continue reading</h2>',
    ].join("\n");

    expect(collapseVisibleBilingualPairsForTesting(html, "zh")).toContain(
      '<h2 class="module-title" data-i18n data-i18n-zh="继续阅读" data-i18n-en="Continue reading">继续阅读</h2>',
    );
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
    expect(normalized).toContain("attributeFilter: ['data-lang']");
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
    expect(decision.pageBlueprints.find((page) => page.route === "/casux-information-platform")?.pageKind).toBe("blog-data-index");
    expect(decision.routes).not.toEqual(expect.arrayContaining(["/3c-machines", "/custom-solutions"]));
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
