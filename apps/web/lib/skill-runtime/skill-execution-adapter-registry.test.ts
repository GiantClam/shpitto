import { describe, expect, it } from "vitest";

import { getSkillExecutionAdapter } from "./skill-execution-adapter-registry";
import type { SkillExecutionRoundPromptParams } from "./skill-execution-adapter";
import type { LocalDecisionPlan } from "./decision-layer";
import {
  assertCorporateRequiredFilesPresentForTesting,
  assertCorporateRouteAssetRefsForTesting,
  assertCorporateI18nResourceQualityForTesting,
  assertCorporateRouteOpeningValidationForTesting,
  assertCorporateRouteRoleValidationForTesting,
  assertCorporateSourceQualityForTesting,
  normalizeCorporateValidatedFilesForTesting,
  assertCorporateSharedShellRouteConsistencyForTesting,
  assertCorporateSharedShellStructureForTesting,
  assertCorporateSharedShellValidationForTesting,
} from "./corporate-b2b-skill-adapter";

function createDecisionPlan(overrides: Partial<LocalDecisionPlan> & Pick<LocalDecisionPlan, "routes">): LocalDecisionPlan {
  const pageBlueprints = overrides.pageBlueprints || [];
  return {
    requirementText: overrides.requirementText || "Official company website for enterprise buyers.",
    locale: overrides.locale || "en",
    routes: overrides.routes,
    navLabels:
      overrides.navLabels || overrides.routes.map((route) => (route === "/" ? "Home" : route.replace(/^\//, "") || "Home")),
    pageIntents: overrides.pageIntents || pageBlueprints,
    pageBlueprints,
    brandHint: overrides.brandHint,
    routeAuthorityMode: overrides.routeAuthorityMode,
  };
}

describe("skill-execution-adapter-registry", () => {
  it("maps corporate-b2b-site to its dedicated execution adapter", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");

    expect(adapter.skillId).toBe("corporate-b2b-site");
  });

  it("adds corporate shell consistency contract to the corporate execution prompt", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      pageBlueprints: [
        {
          route: "/",
          navLabel: "Home",
          purpose: "Company overview and primary offer.",
          source: "workflow_contract",
          constraints: [],
          pageKind: "intent",
          responsibility: "Overview",
          contentSkeleton: ["hero", "proof", "cta"],
          componentMix: { hero: 1, feature: 1, grid: 0, proof: 1, form: 0, cta: 1 },
        },
      ],
    });
    const params: SkillExecutionRoundPromptParams = {
      round: 1,
      totalRounds: 4,
      decision,
      stylePreset: {
        colors: { primary: "#0f62fe", accent: "#8a3ffc", background: "#ffffff" },
        typography: "IBM Plex Sans, sans-serif",
      } as any,
      styleName: "IBM",
      styleReason: "explicit corporate override",
      loadedSkillIds: ["website-generation-workflow", "corporate-b2b-site"],
      emittedFiles: [],
      requiredMissing: ["/index.html"],
      objective: {
        targetFiles: ["/index.html"],
        instruction: "Generate homepage",
        strictSingleTarget: true,
      },
      requirementText: "Official company website for an export manufacturer serving enterprise buyers.",
    };

    const prompt = adapter.buildToolRoundPrompt(params);

    expect(prompt).toContain("Corporate B2B execution contract:");
    expect(prompt).toContain("Navigation destinations, labels, order, and CTA wording must stay identical");
    expect(prompt).toContain("Shared-shell QA contract: treat nav/footer drift as a failed generation result");
    expect(prompt).toContain("Treat the current round as part of one corporate site system");
    expect(prompt).toContain("Before emitting any route with imagery, verify that each visual belongs to a named business-proof module");
  });

  it("adds route-specific products contract to the corporate target page contract", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      pageBlueprints: [
        {
          route: "/products",
          navLabel: "Products",
          purpose: "Product families and sourcing fit.",
          source: "workflow_contract",
          constraints: [],
          pageKind: "intent",
          responsibility: "Catalog",
          contentSkeleton: ["lead", "grid", "proof", "cta"],
          componentMix: { hero: 0, feature: 1, grid: 1, proof: 1, form: 0, cta: 1 },
        },
      ],
    });

    const contract = adapter.formatTargetPageContract(
      decision,
      "/products/index.html",
      "Official company website for an export manufacturer serving enterprise buyers.",
    );

    expect(contract).toContain("Products contract: organize the main body around product families");
    expect(contract).toContain("Do not redesign the navigation or footer per page");
    expect(contract).toContain("Media contract: prefer product-family, material, texture, folded-pack");
    expect(contract).toContain("Products opening contract: start with a compact catalog lead");
  });

  it("builds a corporate-specific required file checklist including bilingual resources when requested", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      navLabels: ["Home", "Products", "Contact"],
      pageBlueprints: [],
    });

    const required = adapter.buildRequiredFileChecklist(decision, {
      requirementText: "Official bilingual company website for enterprise buyers and procurement teams.",
    });

    expect(required).toEqual([
      "/styles.css",
      "/script.js",
      "/index.html",
      "/products/index.html",
      "/contact/index.html",
      "/i18n/messages.en.json",
      "/i18n/messages.zh-CN.json",
    ]);
  });

  it("rejects missing corporate required files before shared helper validation", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      navLabels: ["Home", "Products", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRequiredFilesPresentForTesting(
        decision,
        [
          { path: "/styles.css", type: "text/css", content: "body{}" },
          { path: "/script.js", type: "application/javascript", content: "void 0;" },
          { path: "/index.html", type: "text/html", content: "<!doctype html><html></html>" },
          { path: "/products/index.html", type: "text/html", content: "<!doctype html><html></html>" },
        ],
        "Official company website for enterprise buyers.",
      ),
    ).toThrow(/skill_tool_missing_required_files: \/contact\/index\.html/i);
  });

  it("plans corporate rounds with homepage-first and serial interior pages", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");

    expect(
      adapter.planRoundObjective(0, ["/styles.css", "/script.js", "/index.html", "/products/index.html"]),
    ).toEqual({
      targetFiles: ["/styles.css"],
      instruction: expect.stringContaining("shared corporate foundation"),
      strictSingleTarget: true,
    });

    expect(
      adapter.planRoundObjective(1, ["/script.js", "/index.html", "/products/index.html"]),
    ).toEqual({
      targetFiles: ["/script.js"],
      instruction: expect.stringContaining("shared corporate foundation"),
      strictSingleTarget: true,
    });

    expect(
      adapter.planRoundObjective(2, ["/index.html", "/products/index.html", "/contact/index.html"]),
    ).toEqual({
      targetFiles: ["/index.html"],
      instruction: expect.stringContaining("Emit the homepage first"),
      strictSingleTarget: true,
    });

    expect(
      adapter.planRoundObjective(3, ["/products/index.html", "/contact/index.html"]),
    ).toEqual({
      targetFiles: ["/products/index.html"],
      instruction: expect.stringContaining("preserving the homepage shell"),
      strictSingleTarget: true,
    });
  });

  it("resolves corporate max rounds from the corporate-specific round model", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
      navLabels: ["Home", "Products", "Solutions", "Cases", "About", "Contact"],
      pageBlueprints: [],
    });

    expect(
      adapter.resolveMaxToolRounds(decision, "Bilingual corporate website for enterprise buyers and procurement teams."),
    ).toBeGreaterThanOrEqual(10);
  });

  it("owns a corporate-specific sanitize hook instead of forwarding emitted HTML sanitization", async () => {
    const adapter = await getSkillExecutionAdapter("corporate-b2b-site");

    const sanitized = adapter.sanitizeEmittedHtml?.(
      "/blog/index.html",
      '<!doctype html><html><body><main><h1>Archive</h1><p>How to read this archive and follow the suggested reading order.</p></main></body></html>',
      "Create 3 blog posts for enterprise buyers.",
    );

    expect(String(sanitized || "")).not.toMatch(/how to read|suggested reading order/i);
  });

  it("runs corporate-owned post-QA normalization on validated files", () => {
    const result = normalizeCorporateValidatedFilesForTesting(
      [
        {
          path: "/blog/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><h1>Archive</h1><p>How to read this archive and follow the suggested reading order.</p></main></body></html>',
        },
      ],
      "Create 3 blog posts for enterprise buyers.",
    );

    const blogFile = result.find((file) => file.path === "/blog/index.html");
    expect(String(blogFile?.content || "")).not.toMatch(/how to read|suggested reading order/i);
  });

  it("rejects locale controls nested inside nav or paired with an empty utility wrapper", async () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSharedShellValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><div class="header-utility"></div><nav><a href="/">Home</a><a href="/products">Products</a><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">�</button><button data-locale-toggle data-locale="en">EN</button></div></nav></header><footer><a href="/">Home</a><a href="/products">Products</a><p>Serving enterprise buyers with response-ready support.</p></footer></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><div class="header-utility"></div><nav><a href="/">Home</a><a href="/products">Products</a><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">�</button><button data-locale-toggle data-locale="en">EN</button></div></nav></header><footer><a href="/">Home</a><a href="/products">Products</a><p>Serving enterprise buyers with response-ready support.</p></footer></body></html>',
        },
      ]),
    ).toThrow(/nests locale controls inside the primary nav|empty locale\/header utility wrapper|exactly one dedicated adjacent utility wrapper/i);
  });

  it("rejects inline style attributes on visible corporate media and layout blocks", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/contact"],
      navLabels: ["Home", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="" /></div><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="contact-conversion"><div class="form-shell" style="align-items:center;"><article class="card"><img src="https://example.com/sample.jpg" alt="Sample kit" style="width:100%;height:100%;object-fit:cover;" /></article><aside class="card-grid" style="margin-top:16px;"><div class="card" style="background:rgba(255,255,255,0.7);"><p>Response window</p></div></aside><ul class="stack" style="padding-left:1rem;"><li>Checklist</li></ul></div></section></main></body></html>',
        },
      ]),
    ).toThrow(/inline style attributes on media elements|inline style attributes on visible layout blocks/i);
  });

  it("rejects mojibake or encoding-corrupted visible copy in corporate pages", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/custom-solutions"],
      navLabels: ["Home", "Custom Solutions"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__content"><h1>Home</h1><p>Reliable supply.</p></div></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="process-intro"><div><h1>Solutions</h1><p>Programs matched to the buyer閳ユ獨 fulfillment model.</p></div><figure><img src="https://example.com/solution.jpg" alt="Solution context" /></figure></section></main></body></html>',
        },
      ]),
    ).toThrow(/mojibake|encoding-corrupted visible copy/i);
  });

  it("rejects mojibake locale button labels in corporate shell output", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/contact"],
      navLabels: ["Home", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            "<!doctype html><html><body><header><div class=\"header-utility\"><button data-locale-toggle data-locale=\"en\">EN</button><button data-locale-toggle data-locale=\"zh-CN\">\uFFFD</button></div></header><main><section class=\"enterprise-hero\"><div class=\"enterprise-hero__media\"><img src=\"https://example.com/hero.jpg\" alt=\"Hero\" /></div><div class=\"enterprise-hero__content\"><h1>Home</h1></div></section></main></body></html>",
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="contact-conversion"><h1>Contact</h1></section></main></body></html>',
        },
      ]),
    ).toThrow(/mojibake|encoding-corrupted visible copy/i);
  });

  it("rejects non-EN/ZH locale button labels in the corporate header switch", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/contact"],
      navLabels: ["Home", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSharedShellValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><div class="header-utility"><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">中文</button><button data-locale-toggle data-locale="en">English</button></div></div><nav><a href="/">Home</a><a href="/contact">Contact</a></nav></header><footer><a href="/">Home</a><a href="/contact">Contact</a><p>Serving enterprise buyers with response-ready support.</p></footer></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><div class="header-utility"><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">ZH</button><button data-locale-toggle data-locale="en">EN</button></div></div><nav><a href="/">Home</a><a href="/contact">Contact</a></nav></header><footer><a href="/">Home</a><a href="/contact">Contact</a><p>Serving enterprise buyers with response-ready support.</p></footer></body></html>',
        },
      ]),
    ).toThrow(/locale button labels literal EN\/ZH/i);
  });

  it("rejects corrupted or English-only zh-CN dictionaries for corporate bilingual pages", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateI18nResourceQualityForTesting(
        decision,
        [
          {
            path: "/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__content"><h1 data-i18n="home.hero.title">Home</h1></div></section></main></body></html>',
          },
          {
            path: "/products/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="catalog-lead"><h1 data-i18n="products.hero.title">Products</h1></section></main></body></html>',
          },
          {
            path: "/i18n/messages.en.json",
            type: "application/json",
            content: JSON.stringify({
              "nav.home": "Home",
              "nav.products": "Products",
              "nav.customSolutions": "Custom Solutions",
              "nav.cases": "Cases",
              "nav.contact": "Contact",
              "nav.about": "About",
              "locale.switch.label": "Language",
              "locale.en": "EN",
              "locale.zh": "ZH",
              "home.hero.kicker": "Textile manufacturer / Export ready",
            }),
          },
          {
            path: "/i18n/messages.zh-CN.json",
            type: "application/json",
            content: JSON.stringify({
              "nav.home": "Home",
              "nav.products": "Products",
              "nav.customSolutions": "Custom Solutions",
              "nav.cases": "Cases",
              "nav.contact": "Contact",
              "nav.about": "About",
              "locale.switch.label": "Language",
              "locale.en": "EN",
              "locale.zh": "ZH",
              "home.hero.kicker": "Textile manufacturer 路 Export ready",
            }),
          },
        ],
        "Build a bilingual corporate website for enterprise buyers.",
      ),
    ).toThrow(/real Chinese copy|corrupted homepage kicker|mojibake|mixed-script corruption/i);
  });

  it("rejects homepage direction-label copy that leaks internal art direction", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><p class="kicker">Heritage manufacturing</p><h1>Export-ready towels</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1></div><figure><img src="https://example.com/product.jpg" alt="Product" /></figure></div></section></main></body></html>',
        },
      ]),
    ).toThrow(/internal art-direction labels|heritage manufacturing/i);
  });

  it("rejects homepage heritage value language unless the brief explicitly asks for history/heritage storytelling", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(
        decision,
        [
          {
            path: "/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><p class="kicker">Export textile manufacturer</p><h1>Heritage textile production for hospitality buyers</h1></div></section></main></body></html>',
          },
          {
            path: "/products/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1></div><figure><img src="https://example.com/product.jpg" alt="Product" /></figure></div></section></main></body></html>',
          },
        ],
        "Official company website for enterprise buyers.",
      ),
    ).toThrow(/heritage\/legacy wording|heritage-story brief/i);
  });

  it("accepts homepage heritage wording only when the brief explicitly asks for heritage storytelling", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(
        decision,
        [
          {
            path: "/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><p class="kicker">Company history</p><h1>Heritage textile production since 1998</h1></div></section></main></body></html>',
          },
          {
            path: "/products/index.html",
            type: "text/html",
            content:
              '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1></div><figure><img src="https://example.com/product.jpg" alt="Product" /></figure></div></section></main></body></html>',
          },
        ],
        "Official company website for enterprise buyers. Include company history and heritage storytelling on the homepage.",
      ),
    ).not.toThrow();
  });

  it("rejects legacy hero action classes and inline-styled section heads", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/contact"],
      navLabels: ["Home", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><h1>Home</h1><div class="hero-actions"><a href="/contact">Contact</a></div></div></section></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="contact-conversion"><div class="section__head" style="margin-bottom:0;"><h1>Contact</h1></div></section></main></body></html>',
        },
      ]),
    ).toThrow(/legacy generic hero utility classes|section__head block/i);
  });

  it("rejects products, solutions, and cases pages that delay the first meaningful image past the opening-adjacent band", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases"],
      navLabels: ["Home", "Products", "Custom Solutions", "Cases"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1><p>Assortment overview.</p></div></div></section><section class="spec-row"><div class="site-shell"><div class="spec-grid"><article><h2>Sizes</h2></article></div></div></section><section class="material-range"><figure><img src="https://example.com/product.jpg" alt="Product" /></figure></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="process-intro"><div><h1>Solutions</h1><p>Process overview.</p></div></section><section class="timeline-band"><div class="timeline"><article><h2>Brief</h2></article></div></section><section class="program-context"><figure><img src="https://example.com/solution.jpg" alt="Solution context" /></figure></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="evidence-header"><div><h1>Cases</h1><p>Outcome overview.</p></div></section><section class="case-ledger"><article><h2>Hospitality</h2></article></section><section class="outcome-strip"><figure><img src="https://example.com/case.jpg" alt="Case result" /></figure></section></main></body></html>',
        },
      ]),
    ).toThrow(/must include a real route-owned image in the opening band or first opening-adjacent proof band/i);
  });

  it("accepts products, solutions, and cases pages with real opening or opening-adjacent media", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases"],
      navLabels: ["Home", "Products", "Custom Solutions", "Cases"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1><p>Assortment overview.</p></div><figure><img src="https://example.com/product.jpg" alt="Product" /></figure></div></section><section class="spec-row"><article><h2>Sizes</h2></article></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="process-intro"><div><h1>Solutions</h1><p>Process overview.</p></div></section><section class="timeline-band"><div class="timeline"></div><figure><img src="https://example.com/solution.jpg" alt="Solution context" /></figure></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="evidence-header"><div><h1>Cases</h1><p>Outcome overview.</p></div><figure><img src="https://example.com/case.jpg" alt="Case result" /></figure></section><section class="case-ledger"><article><h2>Hospitality</h2></article></section></main></body></html>',
        },
      ]),
    ).not.toThrow();
  });

  it("rejects meta-design figcaptions in products, solutions, and cases openings", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases"],
      navLabels: ["Home", "Products", "Custom Solutions", "Cases"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSourceQualityForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__media"><img src="https://example.com/hero.jpg" alt="Hero" /></div><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="catalog-lead"><div class="catalog-grid"><div><h1>Products</h1></div><figure><img src="https://example.com/product.jpg" alt="Product" /><figcaption>Product-support visuals should show texture rather than abstract blocks.</figcaption></figure></div></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="process-intro"><div><h1>Solutions</h1></div><figure><img src="https://example.com/solution.jpg" alt="Solution" /><figcaption>Use contextual visuals to explain OEM and ODM programs.</figcaption></figure></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="evidence-header"><div><h1>Cases</h1></div><figure><img src="https://example.com/case.jpg" alt="Case result" /><figcaption>This image supports the proof row and should feel grounded.</figcaption></figure></section></main></body></html>',
        },
      ]),
    ).toThrow(/meta-design image caption/i);
  });

  it("rejects missing nav or footer in the corporate shared shell", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSharedShellStructureForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a></nav></header><footer><a href="/">Home</a></footer></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a></nav></header><main><h1>Products</h1></main></body></html>',
        },
      ]),
    ).toThrow(/must include the shared corporate footer shell/i);
  });

  it("rejects corporate pages that omit shared asset references", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRouteAssetRefsForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><script src="/script.js" defer></script></head><body><main><h1>Home</h1></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Products</h1></main></body></html>',
        },
      ]),
    ).toThrow(/must reference \/script\.js/i);
  });

  it("rejects corporate routes that do not read like their owned page role", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      navLabels: ["Home", "Products", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRouteRoleValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><h1>Home</h1><p>Corporate overview.</p></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><h1>Products</h1><p>Welcome to our story-driven brand page.</p></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><h1>Contact</h1><p>Learn more about our story.</p></main></body></html>',
        },
      ]),
    ).toThrow(/products page|contact page/i);
  });

  it("rejects corporate interior routes that reuse generic opening section shells", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
      navLabels: ["Home", "Products", "Solutions", "Cases", "About", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRouteOpeningValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="stack-lg"><h1>Products</h1></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="process-intro"><h1>Solutions</h1></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="evidence-header"><h1>Cases</h1></section></main></body></html>',
        },
        {
          path: "/about/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="company-masthead"><h1>About</h1></section></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="contact-conversion"><h1>Contact</h1></section></main></body></html>',
        },
      ]),
    ).toThrow(/products opening class|catalog-lead|assortment-lead/i);
  });

  it("accepts distinct route-owned opening section classes across core corporate interior pages", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
      navLabels: ["Home", "Products", "Solutions", "Cases", "About", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRouteOpeningValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="catalog-lead section"><h1>Products</h1></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="solution-lead section"><h1>Solutions</h1></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="case-lead section"><h1>Cases</h1></section></main></body></html>',
        },
        {
          path: "/about/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="about-lead section"><h1>About</h1></section></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="contact-conversion section"><h1>Contact</h1></section></main></body></html>',
        },
      ]),
    ).not.toThrow();
  });

  it("accepts a generic spacing section when the first visible opening band contains a route-owned class", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
      navLabels: ["Home", "Products", "Solutions", "Cases", "About", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateRouteOpeningValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="enterprise-hero"><div class="enterprise-hero__content"><h1>Home</h1></div></section></main></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="section section--tight"><div class="site-shell"><div class="catalog-lead catalog-grid"><h1>Products</h1></div></div></section></main></body></html>',
        },
        {
          path: "/custom-solutions/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="section"><div class="site-shell"><div class="process-intro"><h1>Solutions</h1></div></div></section></main></body></html>',
        },
        {
          path: "/cases/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="section"><div class="site-shell"><div class="evidence-header"><h1>Cases</h1></div></div></section></main></body></html>',
        },
        {
          path: "/about/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="section"><div class="site-shell"><div class="company-masthead"><h1>About</h1></div></div></section></main></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><main><section class="section"><div class="site-shell"><div class="contact-conversion"><h1>Contact</h1></div></div></section></main></body></html>',
        },
      ]),
    ).not.toThrow();
  });

  it("rejects interior pages that drift from the homepage corporate nav/footer destinations", () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products", "/contact"],
      navLabels: ["Home", "Products", "Contact"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSharedShellRouteConsistencyForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/contact">Contact</a></nav></header><footer><a href="/">Home</a><a href="/products">Products</a><a href="/contact">Contact</a></footer></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a></nav></header><footer><a href="/">Home</a><a href="/products">Products</a></footer></body></html>',
        },
        {
          path: "/contact/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a><a href="/contact">Contact</a></nav></header><footer><a href="/">Home</a><a href="/products">Products</a><a href="/contact">Contact</a></footer></body></html>',
        },
      ]),
    ).toThrow(/must preserve the shared corporate navigation destinations from \/index\.html; missing \/contact/i);
  });

  it("rejects implementation-oriented shell copy in the corporate shared shell", async () => {
    const decision = createDecisionPlan({
      locale: "en",
      routes: ["/", "/products"],
      navLabels: ["Home", "Products"],
      pageBlueprints: [],
    });

    expect(() =>
      assertCorporateSharedShellValidationForTesting(decision, [
        {
          path: "/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a></nav><div class="header-utility"><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">ZH</button><button data-locale-toggle data-locale="en">EN</button></div></div></header><footer><a href="/">Home</a><a href="/products">Products</a><p>Serving enterprise buyers with response-ready support.</p></footer></body></html>',
        },
        {
          path: "/products/index.html",
          type: "text/html",
          content:
            '<!doctype html><html><body><header><nav><a href="/">Home</a><a href="/products">Products</a></nav><div class="header-utility"><div class="locale-switch"><button data-locale-toggle data-locale="zh-CN">ZH</button><button data-locale-toggle data-locale="en">EN</button></div></div></header><footer><a href="/">Home</a><a href="/products">Products</a><p>English-first site experience for enterprise visitors.</p></footer></body></html>',
        },
      ]),
    ).toThrow(/implementation\/i18n shell copy/i);
  });
});



