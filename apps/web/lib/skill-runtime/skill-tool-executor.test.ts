import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  formatTargetPageContract,
  enforceNavigationOrder,
  htmlPathToRoute,
  invokeModelWithRetry,
  isRetryableProviderError,
  normalizeToolChoiceForProvider,
  resolveToolProtocolForProvider,
  runSkillToolExecutor,
  sanitizeRequirementForGenerationForTesting,
  validateAndNormalizeRequiredFiles,
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

  return [
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
    expect(contract).toContain("External imagery must come from source-backed or project-owned assets");
    expect(contract).toContain("Metrics must be source-backed");
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
    const files = validGeneratedFiles(decision.routes).map((file) =>
      file.path === "/blog/index.html"
        ? {
            ...file,
            content: String(file.content).replace(
              /<main>[\s\S]*<\/main>/,
              '<main><a href="#content">跳到主要内容</a><h1>博客｜Bays Wong</h1><section aria-label="语言切换"><button type="button">中文</button><button type="button">English</button></section><section id="content" data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h2>技术与组织实践博客</h2><p>这里记录的是我在研发体系变革、实时音视频基础设施和创业商业化中的判断、取舍与复盘。</p><div data-shpitto-blog-list><article><a href="/blog/demo/">示例文章</a></article></div></section><section><h2>继续阅读</h2><p>从下方条目进入完整正文，默认显示中文，切换后再显示英文版本。</p></section></main>',
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

  it("does not hard-fail bilingual output only because a switch contract is absent", () => {
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
