import { describe, expect, it } from "vitest";
import {
  buildRouteUnitContractSummary,
  buildWebsiteMediaResourceList,
  buildWebsiteDesignSpecMarkdown,
  buildWebsiteDesignSpecRouteExcerpt,
} from "./website-design-spec.ts";
import type { LocalDecisionPlan } from "./decision-layer.ts";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset.ts";

function buildMockDecision(): LocalDecisionPlan {
  return {
    requirementText:
      "Create a company website homepage. Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
    locale: "en",
    routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
    navLabels: ["Home", "Products", "Custom Solutions", "Cases", "About", "Contact"],
    brandHint: "Vbuy Textile",
    routeAuthorityMode: "prompt_manifest",
    pageIntents: [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Export-ready textile manufacturing homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Masthead", "Proof strip", "Capability band", "CTA strip"],
        componentMix: { hero: 12, feature: 18, grid: 16, proof: 22, form: 6, cta: 18 },
        constraints: [],
      },
      {
        route: "/products",
        navLabel: "Products",
        purpose: "Product assortment page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Products",
        contentSkeleton: ["Catalog lead", "Proof row", "Assortment grid"],
        componentMix: { hero: 8, feature: 18, grid: 24, proof: 20, form: 4, cta: 10 },
        constraints: [],
      },
      {
        route: "/custom-solutions",
        navLabel: "Custom Solutions",
        purpose: "Customization and delivery process page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Solutions",
        contentSkeleton: ["Process intro", "Timeline", "Scenario proof"],
        componentMix: { hero: 6, feature: 16, grid: 10, proof: 18, form: 6, cta: 12 },
        constraints: [],
      },
      {
        route: "/cases",
        navLabel: "Cases",
        purpose: "Application and outcome proof page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Cases",
        contentSkeleton: ["Evidence header", "Case ledger", "Outcome strip"],
        componentMix: { hero: 5, feature: 12, grid: 14, proof: 24, form: 2, cta: 8 },
        constraints: [],
      },
      {
        route: "/about",
        navLabel: "About",
        purpose: "Company identity and operating trust page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "About",
        contentSkeleton: ["Company masthead", "Operating profile", "Trust strip"],
        componentMix: { hero: 6, feature: 10, grid: 8, proof: 20, form: 0, cta: 6 },
        constraints: [],
      },
      {
        route: "/contact",
        navLabel: "Contact",
        purpose: "Contact and inquiry page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Contact",
        contentSkeleton: ["Contact block", "Channels", "Expectation row"],
        componentMix: { hero: 4, feature: 10, grid: 8, proof: 8, form: 28, cta: 12 },
        constraints: [],
      },
    ],
    pageBlueprints: [] as any,
  } as LocalDecisionPlan;
}

describe("buildWebsiteDesignSpecMarkdown", () => {
  it("produces an IBM enterprise homepage contract with an image-backed hero", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "ibm",
        slug: "ibm",
        name: "IBM",
        design_desc: "IBM Carbon enterprise system",
        selection_mode: "explicit_match",
        selection_candidates: [],
      } as any,
    });

    expect(markdown).toContain("homepage_mode: enterprise_masthead");
    expect(markdown).toContain("website_surface_mode: corporate-b2b-site");
    expect(markdown).toContain("image-backed enterprise hero -> compact proof row -> unified capability band -> concise CTA strip");
    expect(markdown).toContain("prohibit: split hero / hero-grid / aside rail / snapshot panel / floating stat cards in the opening band");
    expect(markdown).toContain("placement_band: inside the opening hero as a background-supported visual layer behind copy");
    expect(markdown).toContain("## 7. Media Resource List");
    expect(markdown).toContain("resource_id: home-hero-01");
    expect(markdown).toContain("desktop_image_area: full-width hero background layer with a protected center-right focal zone, at least 680px visual depth");
    expect(markdown).toContain("desktop_text_companion_area: overlay content zone stays left/center-left, limited to roughly 35-45% of the visual emphasis");
    expect(markdown).toContain("hero_visual_balance: the image should carry roughly 55-65% of the first-screen visual emphasis");
    expect(markdown).toContain("homepage_media_source_validation: a real stock/library photo is required for the primary hero visual when available; inline SVG or abstract placeholder media is not acceptable.");
    expect(markdown).toContain("homepage_hero_markup_rule: render a real img/picture node inside the opening hero media slot");
    expect(markdown).toContain("homepage_heading_contract: the homepage may contain exactly one H1, and it must appear inside `.enterprise-hero__content`.");
    expect(markdown).toContain("homepage_spacing_contract: keep the opening hero visually close to the shared header, but allow a measured 20-36px shell transition");
    expect(markdown).toContain("major homepage section spacing should usually stay in roughly the 40-72px range");
    expect(markdown).toContain("section_spacing_contract: corporate-b2b pages should feel composed and breathable");
    expect(markdown).toContain("homepage_markup_contract: prefer `enterprise-hero` / `enterprise-hero__media` / `enterprise-hero__content`");
    expect(markdown).toContain("homepage_css_contract: styles.css must style the opening hero through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row`.");
    expect(markdown).toContain("homepage_header_rule: keep locale controls outside the primary nav link stream");
    expect(markdown).toContain("header_utility_rule: this shell is single-language English-first.");
    expect(markdown).toContain("homepage_capability_rule: render the homepage capability zone as one unified capability band");
    expect(markdown).not.toContain("Folded beach towels beside a bright pool and sea-toned resort deck");
    expect(markdown).toContain("homepage_cta_rule: keep the CTA zone single-primary-block; avoid a second bordered side panel with inquiry instructions or support notes.");
    expect(markdown).toContain("source_validation_rule: when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media");
    expect(markdown).toContain("caption_policy: homepage hero visual normally carries no caption");
    expect(markdown).toContain("copy_contract: do not surface internal art-direction or mood labels such as `heritage manufacturing`, `heritage craft`, `warm palette`");
    expect(markdown).toContain("site_generator_mode: hybrid");
    expect(markdown).toContain("shpitto_platform_boundary:");
  });

  it("can explicitly opt the design spec back to native generation", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      siteGeneratorMode: "native",
    });

    expect(markdown).toContain("site_generator_mode: native");
    expect(markdown).toContain("functionality_port_scope: no external frontend generator is active for this run.");
  });

  it("records the hybrid frontend generator boundary in the design spec", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "corporate-b2b-site",
      siteGeneratorMode: "hybrid",
      selectedSeedSkillIds: ["open-design-web-prototype", "docs-reference-template"],
    });

    expect(markdown).toContain("site_generator_mode: hybrid");
    expect(markdown).toContain("seed_authority_mode: seed-authoritative");
    expect(markdown).toContain("selected_seed_contracts: open-design-web-prototype, docs-reference-template");
    expect(markdown).toContain("heuristic_fallback_rule: local contentSkeleton and componentMix are fallback planning hints only.");
    expect(markdown).toContain("Open Design owns visual direction and module rhythm");
    expect(markdown).toContain("HTML Anything owns concrete HTML/CSS template discipline");
    expect(markdown).toContain("functionality_port_scope: port generation functionality, template discipline");
    expect(markdown).toContain("shpitto_ui_theme_boundary: Shpitto Studio and platform UI keep the app theme");
    expect(markdown).toContain("`--shp-*` tokens and `.shp-*` shell classes");
    expect(markdown).toContain("generated_site_theme_boundary: generated customer websites may use their own route-level design tokens");
    expect(markdown).toContain("Shpitto remains responsible for Blog/content hooks, Contact/API wiring");
    expect(markdown).toContain("selected_frontend_seed_skills: open-design-web-prototype, docs-reference-template");
  });

  it("persists selected seed contract signals when contract objects are available", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "corporate-b2b-site",
      selectedSeedSkillIds: ["industrial-b2b-foundation", "precision-catalog-template"],
      selectedSeedContracts: [
        {
          id: "industrial-b2b-foundation",
          contract: {
            homepageTopologyClass: "procurement-masthead",
            openingFamily: "enterprise-industrial",
            sectionCadence: ["image-backed procurement masthead", "proof row", "capability band", "inquiry CTA"],
            componentBans: ["editorial archive shelf", "pricing table"],
            mediaPosture: "Use factory and operations visuals.",
            typographyPosture: "Industrial sans with mono accents.",
            ctaPosture: "Quote or consultation CTA.",
            compatibleSurfaceModes: ["corporate-b2b-site"],
            visualBoldness: "high",
            routeOverrides: {
              home: {
                homepageTopologyClass: "procurement-masthead",
                openingFamily: "enterprise-industrial",
                sectionCadence: ["image-backed procurement masthead", "proof row", "capability band", "inquiry CTA"],
              },
            },
          },
        },
      ],
    });

    expect(markdown).toContain("seed_opening_family: enterprise-industrial");
    expect(markdown).toContain("seed_homepage_topology_class: procurement-masthead");
    expect(markdown).toContain("seed_section_cadence: image-backed procurement masthead -> proof row -> capability band -> inquiry CTA");
    expect(markdown).toContain("seed_component_bans: editorial archive shelf, pricing table");
    expect(markdown).toContain("seed_media_posture: Use factory and operations visuals.");
    expect(markdown).toContain("seed_typography_posture: Industrial sans with mono accents.");
  });

  it("applies the enterprise homepage contract to generic corporate-b2b sites even without an explicit IBM override", () => {
    const decision = buildMockDecision();
    decision.requirementText =
      "Create a company website homepage for enterprise buyers. Focus on product showcase, brand trust, custom solutions, and contact flow.";
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "heritage-manufacturing",
        slug: "heritage-manufacturing",
        name: "Heritage Manufacturing",
        design_desc: "Procurement-facing B2B company style",
        selection_mode: "open_design_context",
        selection_candidates: [],
      } as any,
    });

    expect(markdown).toContain("homepage_mode: enterprise_masthead");
    expect(markdown).toContain("homepage_markup_contract: prefer `enterprise-hero` / `enterprise-hero__media` / `enterprise-hero__content`");
    expect(markdown).toContain("homepage_spacing_contract: keep the opening hero visually close to the shared header, but allow a measured 20-36px shell transition");
    expect(markdown).toContain("major homepage section spacing should usually stay in roughly the 40-72px range");
  });

  it("emits a translation-driven locale registry contract for multilingual sites", () => {
    const decision = buildMockDecision();
    decision.requirementText =
      "Create a multilingual company website with supported locales: zh-CN, en, ja, fr. Default visible language is Chinese and later translations should come from a catalog pipeline instead of rebuilding pages per locale.";
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "corporate-b2b-site",
    });

    expect(markdown).toContain("Translation-driven multilingual shell");
    expect(markdown).toContain("/i18n/locales.json");
    expect(markdown).toContain("/i18n/messages.zh-CN.json");
    expect(markdown).toContain("compact selector/menu");
    expect(markdown).toContain("Do not emit one HTML route tree per locale");
  });

  it("keeps Chinese-first bilingual prompts on the bilingual shell instead of collapsing to single-language Chinese-first", () => {
    const decision = buildMockDecision();
    decision.locale = "zh-CN";
    decision.routes = ["/", "/casux-information-platform"];
    decision.navLabels = ["Home", "Information"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Masthead", "Collection", "CTA"],
        componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 10, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information",
        purpose: "Resource and standards index.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Information platform.",
        contentSkeleton: ["Collection lead", "Resource list", "CTA"],
        componentMix: { hero: 10, feature: 15, grid: 30, proof: 10, form: 20, cta: 15 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const requirementText = [
      "# Canonical Website Generation Prompt",
      "- Language: Chinese-first bilingual Chinese and English.",
      "- Keep one locale visible at a time. Chinese is the default visible language for the first render on every route.",
      "- Bilingual output must be locale-switchable.",
    ].join("\n");

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(markdown).toContain("locale_strategy: Bilingual with the prompt-defined default visible locale and i18n resources for the inactive locale");
    expect(markdown).toContain("/i18n/messages.en.json");
    expect(markdown).toContain("/i18n/messages.zh-CN.json");
    expect(markdown).not.toContain("locale_strategy: Chinese-first single-language shell");
    expect(markdown).not.toContain("Do not emit locale/language controls");
  });

  it("injects consultation-form and full-footer contracts when inquiry capture is required", () => {
    const decision = buildMockDecision();
    decision.requirementText =
      'Create a CASUX information platform with a real consultation form. Requirement form includes "functionalRequirements":["contact_form"].';
    decision.routes = ["/", "/casux-information-platform", "/about"];
    decision.navLabels = ["Home", "Information Platform", "About"];
    decision.pageBlueprints = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Institutional overview.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Masthead", "Overview", "CTA"],
        componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 10, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information Platform",
        purpose: "Resource and standards index.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Information platform.",
        contentSkeleton: ["Collection lead", "Resource list", "CTA"],
        componentMix: { hero: 10, feature: 15, grid: 30, proof: 10, form: 20, cta: 15 },
        constraints: [],
      },
      {
        route: "/about",
        navLabel: "About",
        purpose: "Identity page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "About page.",
        contentSkeleton: ["Identity", "Trust", "CTA"],
        componentMix: { hero: 10, feature: 20, grid: 15, proof: 20, form: 0, cta: 10 },
        constraints: [],
      },
    ] as any;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(markdown).toContain("footer_destination_contract: the homepage footer must enumerate the full confirmed route destination set");
    expect(markdown).toContain("consultation_form_contract: this run requires at least one real consultation intake form");
    expect(markdown).toContain("consultation_form_fields: the form must contain name, organization/company, email, topic/subject, and message fields");
    expect(markdown).toContain("this route is an approved host for the required consultation intake");
    expect(markdown).toContain("CTA-only action groups, and mailto links do not satisfy the consultation intake requirement");
  });

  it("respects explicit consultation-host restrictions from the requirement text", () => {
    const decision = buildMockDecision();
    decision.requirementText =
      "Create a CASUX information platform and homepage. The homepage or information platform must include the consultation form with name, organization, email, topic, and message.";
    decision.routes = ["/", "/casux-information-platform", "/about"];
    decision.navLabels = ["Home", "Information Platform", "About"];
    decision.pageBlueprints = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Institutional overview.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Masthead", "Overview", "CTA"],
        componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 10, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information Platform",
        purpose: "Resource and standards index.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Information platform.",
        contentSkeleton: ["Collection lead", "Resource list", "CTA"],
        componentMix: { hero: 10, feature: 15, grid: 30, proof: 10, form: 20, cta: 15 },
        constraints: [],
      },
      {
        route: "/about",
        navLabel: "About",
        purpose: "Identity page.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "About page.",
        contentSkeleton: ["Identity", "Trust", "CTA"],
        componentMix: { hero: 10, feature: 20, grid: 15, proof: 20, form: 0, cta: 10 },
        constraints: [],
      },
    ] as any;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });
    const aboutExcerpt = buildWebsiteDesignSpecRouteExcerpt(
      {
        decision,
        requirementText: decision.requirementText,
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "content-hub-site",
      } as any,
      "/about",
    );

    expect(markdown).toContain("consultation_form_host_preference: when the requirement text explicitly limits the form host");
    expect(aboutExcerpt).not.toContain("this route is an approved host for the required consultation intake");
  });

  it("produces a focused homepage route excerpt", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;
    const excerpt = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "ibm",
        slug: "ibm",
        name: "IBM",
        design_desc: "IBM Carbon enterprise system",
        selection_mode: "explicit_match",
        selection_candidates: [],
      } as any,
    }, "/");
    expect(excerpt).toContain("Route Design Spec: /");
    expect(excerpt).toContain("opening_topology: image-backed enterprise hero -> compact proof row -> unified capability band -> concise CTA strip");
    expect(excerpt).toContain("placement_band: inside the opening hero as a background-supported visual layer behind copy");
    expect(excerpt).toContain("desktop_image_area: full-width hero background layer with a protected center-right focal zone, at least 680px visual depth");
    expect(excerpt).toContain("source_validation_rule: when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media");
    expect(excerpt).toContain("markup_contract: the opening hero should use an enterprise-specific wrapper");
    expect(excerpt).toContain("markup_contract: do not reuse legacy split-hero class names such as `hero-grid`");
    expect(excerpt).toContain("markup_contract: do not mix legacy hero utility classes such as `hero__body`, `hero__content`, or `hero__actions`");
    expect(excerpt).toContain("css_contract: styles.css must define the homepage opening through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row`");
    expect(excerpt).toContain("header_contract: the primary nav cluster should contain route links only.");
    expect(excerpt).toContain("header_contract: this route is single-language English-first.");
    expect(excerpt).toContain("spacing_contract: keep the opening hero visually close to the shared header, but allow a measured shell transition of roughly 20-36px");
    expect(excerpt).toContain("spacing_contract: homepage shell rhythm should stay controlled and enterprise-like");
    expect(excerpt).toContain("section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range");
    expect(excerpt).toContain("capability_contract: homepage capability content must render as one unified capability band");
    expect(excerpt).toContain("cta_contract: CTA and section shells should use reusable class-owned layout instead of inline style spacing/alignment fixes.");
    expect(excerpt).toContain("hero_visual_balance: the image should carry roughly 55-65% of the first-screen visual emphasis");
    expect(excerpt).not.toContain("Folded beach towels beside a bright pool and sea-toned resort deck");
    expect(excerpt).toContain("caption_policy: homepage hero visual normally carries no caption");
  });

  it("renders discovery-brief and design-system lock metadata in the design spec", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "docs-knowledge-site",
      discoveryBrief: {
        surfaceMode: "docs-knowledge-site",
        audience: ["developers"],
        primaryGoal: "reference clarity",
        routes: ["/", "/guides", "/reference"],
        sourcePriority: "uploaded_files",
        localeMode: "en",
        supportedLocales: ["en", "fr"],
        defaultLocale: "en",
        visualDirectionId: "tech-utility",
        designSystemId: "ibm-carbon",
        designSystemName: "IBM Carbon",
        immutableConstraints: ["brand:Vbuy Textile"],
      },
      designSystemId: "ibm-carbon",
      designSystemName: "IBM Carbon",
      selectedSeedSkillIds: ["docs-knowledge-foundation", "docs-reference-template"],
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    });

    expect(markdown).toContain("website_surface_mode: docs-knowledge-site");
    expect(markdown).toContain("discovery_source_priority: uploaded_files");
    expect(markdown).toContain("discovery_supported_locales: en, fr");
    expect(markdown).toContain("discovery_default_locale: en");
    expect(markdown).toContain("discovery_design_system_name: IBM Carbon");
    expect(markdown).toContain("design_system_lock_id: ibm-carbon");
    expect(markdown).toContain("design_system_lock_name: IBM Carbon");
    expect(markdown).toContain("selected_frontend_seed_skills: docs-knowledge-foundation, docs-reference-template");
  });

  it("locks distinct visual identities for corporate, docs, content-hub, and portfolio/blog surfaces", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const corporate = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: "Create a corporate B2B website for enterprise buyers.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "corporate-b2b-site",
    });
    const docs = buildWebsiteDesignSpecRouteExcerpt(
      {
        decision,
        requirementText: "Create a developer documentation and API reference website.",
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "docs-knowledge-site",
      },
      "/",
    );
    const portfolio = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: "Create a polished personal technical blog with article writing as a first-class surface.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "portfolio-blog-site",
    });
    const hub = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: "Create an institutional standards and resource hub.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(corporate).toContain("surface_visual_identity");
    expect(corporate).toContain("industrial enterprise, procurement, operations, and institutional trust");
    expect(corporate).toContain("Do not reuse the same green/white rounded-card system");
    expect(corporate).toContain("surface_copy_exclusion");
    expect(corporate).toContain("`Responsive layout`, `Shared shell`, `Desktop and mobile review`");
    expect(corporate).toContain("surface_css_tokens: --bg #0B1220");
    expect(corporate).toContain("--primary #4F8EF7; --accent #F5A524");
    expect(corporate).toContain("image-backed enterprise masthead, wide proof bands");

    expect(docs).toContain("website_surface_mode: docs-knowledge-site");
    expect(docs).toContain("documentation/reference workspace");
    expect(docs).toContain("code/reference panels");
    expect(docs).toContain("Do not reuse the same green/white rounded-card system");
    expect(docs).toContain("surface_css_tokens: --bg #F7F8FB");
    expect(docs).toContain("--primary #2454D8; --accent #00A7B5");

    expect(portfolio).toContain("website_surface_mode: portfolio-blog-site");
    expect(portfolio).toContain("editorial technical journal or operator portfolio");
    expect(portfolio).toContain("profile-led masthead, expertise or editorial-pillars band");
    expect(portfolio).toContain("Do not reuse the same green/white rounded-card system");
    expect(portfolio).toContain("surface_css_tokens: --bg #F4EFE7");
    expect(portfolio).toContain("--primary #1E6B8F; --accent #C86B3C");

    expect(hub).toContain("website_surface_mode: content-hub-site");
    expect(hub).toContain("editorial/institutional archive");
    expect(hub).toContain("collection shelves, ledger rows, archive grids");
    expect(hub).toContain("Do not reuse the same green/white rounded-card system");
    expect(hub).toContain("surface_css_tokens: --bg #F5EFE6");
    expect(hub).toContain("--primary #7A3524; --accent #B6813B");
  });

  it("switches content-hub surface tokens to the child-friendly institutional palette when the brief explicitly locks it", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;
    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText:
        "Create the official CASUX bilingual institutional website for child-friendly space standards and research. Use ecological green #2E8B57 with warm orange CTA accents.",
      stylePreset: {
        ...DEFAULT_STYLE_PRESET,
        colors: {
          ...DEFAULT_STYLE_PRESET.colors,
          primary: "#2E8B57",
          accent: "#F59E0B",
          background: "#FFFFFF",
        },
        typography: '"Inter", "Noto Sans SC", system-ui, -apple-system, sans-serif',
      },
      websiteSurfaceMode: "content-hub-site",
      designHit: {
        id: "prompt-adaptive",
        name: "Prompt-Adaptive",
        design_desc: "Canonical prompt contains explicit visual requirements; using prompt-adaptive design context instead of a generic template default.",
        score: 100,
        matched_keywords: ["child-friendly", "institutional", "ecological green"],
        source: "website-generation-workflow",
        category: "Prompt-Adaptive",
        design_md_inline: "",
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        sourcePriority: "uploaded_files",
        audience: ["education_operators", "research_partners"],
        primaryGoal: "institutional_trust, resource_discovery, program_introduction",
        routes: ["/", "/casux-creation", "/casux-construction"],
        localeMode: "bilingual",
        visualDirectionId: "institutional-child-friendly",
        immutableConstraints: [],
      },
      designSystemId: "prompt-adaptive",
      designSystemName: "Prompt-Adaptive",
    });

    expect(markdown).toContain("surface_css_tokens: --bg #F6FBF6");
    expect(markdown).toContain("--primary #2E8B57; --accent #F59E0B");
    expect(markdown).toContain("warm institutional sans such as Inter");
    expect(markdown).toContain("child-friendly institutional guidance");
    expect(markdown).toContain("process-lead, framework-grid, scorecard-band");
    expect(markdown).not.toContain("--primary #7A3524; --accent #B6813B");
    expect(markdown).not.toContain("serif-forward or publication-like typography");
  });

  it("uses a profile-led homepage archetype for portfolio/blog surfaces", () => {
    const decision = buildMockDecision();
    decision.routes = ["/", "/blog", "/about", "/contact"];
    decision.navLabels = ["Home", "Blog", "About", "Contact"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Introduce the operator and editorial viewpoint.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Profile masthead", "Editorial pillars", "Writing spotlight", "CTA"],
        componentMix: { hero: 20, feature: 15, grid: 15, proof: 15, form: 5, cta: 10 },
        constraints: [],
      },
      {
        route: "/blog",
        navLabel: "Blog",
        purpose: "Technical writing archive.",
        source: "prompt_contract",
        pageKind: "blog-data-index",
        responsibility: "Blog archive",
        contentSkeleton: ["Archive lead", "Article cards", "CTA"],
        componentMix: { hero: 10, feature: 10, grid: 30, proof: 10, form: 0, cta: 10 },
        constraints: [],
      },
      {
        route: "/about",
        navLabel: "About",
        purpose: "Operator background.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "About",
        contentSkeleton: ["Profile", "Experience", "CTA"],
        componentMix: { hero: 10, feature: 10, grid: 10, proof: 10, form: 0, cta: 10 },
        constraints: [],
      },
      {
        route: "/contact",
        navLabel: "Contact",
        purpose: "Contact route.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Contact",
        contentSkeleton: ["Contact", "Channels", "CTA"],
        componentMix: { hero: 5, feature: 10, grid: 10, proof: 5, form: 20, cta: 10 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText:
        "Create a polished personal technical blog homepage for an operator-writer. The homepage should introduce the person first, then route readers into the blog.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "portfolio-blog-site",
    });

    expect(markdown).toContain("homepage_mode: profile_editorial_homepage");
    expect(markdown).toContain("profile-led editorial masthead -> expertise/pillars band -> selected writing or proof band -> concise contact CTA");
    expect(markdown).toContain("surface_homepage_archetype: profile-led editorial homepage");
    expect(markdown).toContain("the portfolio/blog homepage opening must establish the named operator first");
    expect(markdown).toContain("Do not ship decorative gradient placeholders, empty context cards, or weak right-side filler.");
    expect(markdown).toContain(
      "homepage_media_rule: portfolio/blog homepage media should reinforce the named operator or publication through a real contextual image or a substantive writing/proof module; do not place a decorative placeholder card or weak right-side panel beside the masthead.",
    );
    expect(markdown).toContain(
      "homepage_media_source_validation: when a portfolio/blog homepage or archive support slot uses media, prefer a real operator/publication-context image when available; otherwise replace the slot with route-owned writing/proof substance instead of abstract placeholder media.",
    );
    expect(markdown).toContain(
      "homepage_hero_markup_rule: when the profile/editorial homepage or `/blog` archive uses a support panel, render a real image node or a dense route-owned proof module; do not emit a text-light placeholder box, empty context rectangle, or decorative pseudo-image panel.",
    );
    expect(markdown).toContain("footer_shell_contract: every route footer must use a structured footer shell");
    expect(markdown).not.toContain("homepage_mode: enterprise_masthead");
  });

  it("uses different homepage archetypes for docs and content-hub surfaces", () => {
    const decision = buildMockDecision();
    decision.routes = ["/"];
    decision.navLabels = ["Home"];
    decision.pageIntents = [decision.pageIntents[0]];
    decision.pageBlueprints = decision.pageIntents;

    const docs = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: "Create a developer documentation homepage for API guides and reference.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "docs-knowledge-site",
    });
    const hub = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: "Create an institutional resource hub homepage for standards and research.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(docs).toContain("homepage_mode: docs_workspace_homepage");
    expect(docs).toContain("docs workspace masthead -> search/index rail -> quickstart strip -> reference matrix -> compact support CTA");
    expect(docs).toContain("section_cadence: documentation workspace lead -> search/index rail -> quickstart strip -> guide stack -> reference matrix -> compact support CTA");
    expect(docs).toContain("surface_homepage_archetype: docs workspace/reference index");
    expect(docs).toContain("geometry_contract: the docs homepage opening must not use marketing hero utility geometry");
    expect(docs).toContain("docs-index-rail");
    expect(docs).toContain("docs homepage visuals should support wayfinding");
    expect(docs).not.toContain("homepage_mode: enterprise_masthead");
    expect(docs).not.toContain("section_cadence: Brand-led hero establishing the site home entry");

    expect(hub).toContain("homepage_mode: collection_index_homepage");
    expect(hub).toContain("editorial archive masthead -> collection shelves -> resource ledger -> institutional CTA");
    expect(hub).toContain("section_cadence: editorial archive masthead -> topic/collection shelves -> standards/research ledger -> resource index rows -> institutional CTA");
    expect(hub).toContain("surface_homepage_archetype: editorial/institutional collection index");
    expect(hub).toContain("geometry_contract: the content-hub homepage opening must not use marketing hero utility geometry");
    expect(hub).toContain("standards-ledger");
    expect(hub).toContain("content-hub homepage visuals should support collection context");
    expect(hub).not.toContain("homepage_mode: enterprise_masthead");
    expect(hub).not.toContain("section_cadence: Brand-led hero establishing the site home entry");
  });

  it("uses an institution-led homepage contract for official content-hub homepages", () => {
    const decision = buildMockDecision();
    decision.locale = "zh-CN";
    decision.routes = ["/", "/casux-information-platform", "/casux-research-center"];
    decision.navLabels = ["Home", "Information Platform", "Research Center"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose:
          "Build the Home page as the official CASUX homepage and institutional overview. Establish CASUX as the umbrella standards system, research center, and information platform before routing visitors into sibling pathways.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: [
          "Brand-led hero establishing the official homepage overview",
          "Core value or capability overview with distinct supporting cards",
          "Evidence, standards, or proof section that reinforces the site mission",
          "Primary CTA to the most important next step",
        ],
        componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 10, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information Platform",
        purpose: "Public information library and resource index.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Information platform",
        contentSkeleton: ["Collection lead", "Resource list", "Consultation CTA"],
        componentMix: { hero: 10, feature: 15, grid: 30, proof: 10, form: 20, cta: 15 },
        constraints: [],
      },
      {
        route: "/casux-research-center",
        navLabel: "Research Center",
        purpose: "Research evidence collection route.",
        source: "prompt_contract",
        pageKind: "search-directory",
        responsibility: "Research route",
        contentSkeleton: ["Research intro", "Evidence rows", "CTA"],
        componentMix: { hero: 10, feature: 20, grid: 20, proof: 15, form: 5, cta: 10 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText:
        "Create the official CASUX homepage and institutional overview for a bilingual standards and research platform. Route / must remain the official homepage identity and must not read like a resource index or certification portal.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(markdown).toContain("homepage_mode: institution_led_content_hub_homepage");
    expect(markdown).toContain("brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA");
    expect(markdown).toContain("institution-led content hub homepage");
    expect(markdown).toContain("title, meta description, H1, and first lead paragraph must establish the institution");
    expect(markdown).toContain("Keep certification, downloads, resource index, search, and route-family explanations out of those fields");
    expect(markdown).toContain("Do not let certification, information-entry, support-entry, consultation-entry, downloads, or route-family labels dominate the opening identity");
    expect(markdown).toContain("Do not collapse route / into a thin overview plus consultation/support entry framing");
    expect(markdown).toContain("institutional trust and capability overview band");
    expect(markdown).toContain("must not use a two-column split hero, equal-column copy/media pair, or right-side visual rail");
    expect(markdown).toContain("do not lead the content-hub homepage with generic `hero`, `hero-wrap`, `hero-grid`");
    expect(markdown).toContain("prefer a stacked or asymmetrical institutional masthead");
    expect(markdown).toContain("homepage_markup_contract: prefer route-owned institutional classes");
    expect(markdown).not.toContain("homepage_mode: collection_index_homepage");
  });

  it("writes institution-led content-hub homepage excerpt rules that ban split-hero geometry", () => {
    const decision = buildMockDecision();
    decision.locale = "zh-CN";
    decision.routes = ["/", "/casux-information-platform"];
    decision.navLabels = ["Home", "Information"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Official homepage and institutional overview for CASUX.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Institution-led homepage",
        contentSkeleton: ["Institutional masthead", "Capability shelves", "Proof band", "Consultation CTA"],
        componentMix: { hero: 18, feature: 18, grid: 18, proof: 18, form: 10, cta: 8 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information",
        purpose: "Content collection page.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Collection page",
        contentSkeleton: ["Knowledge lead", "Collection surface", "Cards", "CTA"],
        componentMix: { hero: 12, feature: 12, grid: 30, proof: 8, form: 0, cta: 18 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const excerpt = buildWebsiteDesignSpecRouteExcerpt(
      {
        decision,
        requirementText:
          "Create the official CASUX homepage and institutional overview for a bilingual standards and research platform. Route / must remain the official homepage identity and must not read like a resource index or certification portal.",
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "content-hub-site",
      },
      "/",
    );

    expect(excerpt).toContain("surface_homepage_archetype: institution-led content hub homepage");
    expect(excerpt).toContain("must not use a two-column split hero, equal-column copy/media pair, or right-side visual rail");
    expect(excerpt).toContain("do not lead the content-hub homepage with generic `hero`, `hero-wrap`, `hero-grid`");
    expect(excerpt).toContain("prefer a stacked or asymmetrical institutional masthead");
    expect(excerpt).toContain("homepage opening visual should sit below or behind the institutional masthead");
  });

  it("adds certification-specific scoring and review contracts to certification directory routes", () => {
    const decision = buildMockDecision();
    decision.locale = "zh-CN";
    decision.routes = ["/casux-certification"];
    decision.navLabels = ["Certification"];
    decision.pageIntents = [
      {
        route: "/casux-certification",
        navLabel: "Certification",
        purpose: "Certification directory for standards review and preparation guidance.",
        source: "prompt_contract",
        pageKind: "search-directory",
        responsibility: "Certification route",
        contentSkeleton: ["Lead", "Filters", "Results", "Consultation CTA"],
        componentMix: { hero: 15, feature: 10, grid: 35, proof: 20, form: 10, cta: 10 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText:
        "Certification route source notes: cover five-dimension scoring model, total score thresholds, assessor packet, quality-mark workflow, and certification badge criteria.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "content-hub-site",
    });

    expect(markdown).toContain("opening_topology: certification criteria lead -> scoring/results ledger -> review-prep and consultation band");
    expect(markdown).toContain("section_cadence: certification criteria lead -> score/results rows -> review-prep and assessor materials -> consultation CTA");
    expect(markdown).toContain("criteria-ledger");
    expect(markdown).toContain("scorecard-band");
    expect(markdown).toContain("total-score thresholds");
    expect(markdown).toContain("assessor/reviewer materials");
    expect(markdown).toContain("certification badge");
  });

  it("builds a route-unit contract summary for checkpoint metadata", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const summary = buildRouteUnitContractSummary(
      {
        decision,
        requirementText: decision.requirementText,
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "corporate-b2b-site",
        selectedSeedSkillIds: ["open-design-web-prototype", "corporate-b2b-site"],
      },
      "/products",
    );

    expect(summary?.route).toBe("/products");
    expect(summary?.routeContract.join("\n")).toContain("route=/products");
    expect(summary?.routeContract.join("\n")).toContain("seedAuthority=seed-authoritative");
    expect(summary?.openingFamily).toBe("catalog");
    expect(summary?.inheritedTokens).toEqual(expect.arrayContaining(["#2563EB", "#22C55E"]));
    expect(summary?.inheritedTerminology).toContain("corporate-b2b-site");
    expect(summary?.inheritedSeedSkillIds).toEqual(["open-design-web-prototype", "corporate-b2b-site"]);
    expect(summary?.openingTopology).toContain("catalog lead band");
    expect(summary?.mediaPlan.join("\n")).toContain("slot_owner: catalog-lead proof slot");
    expect(summary?.mediaResources?.[0]).toMatchObject({
      route: "/products",
      slotOwner: "catalog-lead proof slot",
      preferredRatio: "4:3, 5:4, or square",
    });
  });

  it("builds a synthetic route-unit summary for blog detail routes instead of falling back to home", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const summary = buildRouteUnitContractSummary(
      {
        decision,
        requirementText: "Build a personal editorial site with a publishable blog archive and article detail pages.",
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "portfolio-blog-site",
      },
      "/blog/devops-as-team-rhythm",
    );

    expect(summary?.route).toBe("/blog/devops-as-team-rhythm");
    expect(summary?.navLabel).toBe("Devops As Team Rhythm");
    expect(summary?.routeContract[0]).toBe("route=/blog/devops-as-team-rhythm");
    expect(summary?.openingTopology).toContain("article lead band");
    expect(summary?.mediaResources?.[0]).toMatchObject({
      route: "/blog/devops-as-team-rhythm",
      slotOwner: "article-supporting-proof slot",
    });
  });

  it("keeps the /blog route-unit summary under an authoritative portfolio-blog manifest", () => {
    const decision: LocalDecisionPlan = {
      requirementText:
        "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. Keep the first pass profile-led and index-first.",
      locale: "en",
      routes: ["/", "/blog", "/contact", "/about"],
      navLabels: ["Home", "Blog", "Contact", "About"],
      brandHint: "AI Consultant",
      routeAuthorityMode: "prompt_manifest",
      pageIntents: [
        {
          route: "/",
          navLabel: "Home",
          purpose: "Homepage. Establish the profile-led editorial overview and next action.",
          source: "prompt_contract",
          pageKind: "home",
          responsibility: "Homepage",
          contentSkeleton: ["Profile masthead", "Writing themes", "Contact CTA"],
          componentMix: { hero: 30, feature: 20, grid: 15, proof: 20, form: 0, cta: 15 },
          constraints: [],
        },
        {
          route: "/blog",
          navLabel: "Blog",
          purpose:
            'Content collection page for "Blog". Keep the first pass as a route-owned editorial archive and do not require publishable detail pages.',
          source: "prompt_contract",
          pageKind: "content-collection-index",
          responsibility: "Blog index",
          contentSkeleton: ["Archive intro", "Post cards", "Contextual CTA"],
          componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
          constraints: [],
        },
        {
          route: "/contact",
          navLabel: "Contact",
          purpose: 'Dedicated page for "Contact".',
          source: "prompt_contract",
          pageKind: "intent",
          responsibility: "Contact",
          contentSkeleton: ["Contact block"],
          componentMix: { hero: 10, feature: 10, grid: 10, proof: 10, form: 40, cta: 20 },
          constraints: [],
        },
        {
          route: "/about",
          navLabel: "About",
          purpose: 'Dedicated page for "About".',
          source: "prompt_contract",
          pageKind: "intent",
          responsibility: "About",
          contentSkeleton: ["About lead"],
          componentMix: { hero: 15, feature: 15, grid: 15, proof: 20, form: 0, cta: 10 },
          constraints: [],
        },
      ],
      pageBlueprints: [] as any,
    };
    decision.pageBlueprints = decision.pageIntents;

    const summary = buildRouteUnitContractSummary(
      {
        decision,
        requirementText: decision.requirementText,
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "portfolio-blog-site",
      },
      "/blog",
    );

    expect(summary?.route).toBe("/blog");
    expect(summary?.navLabel).toBe("Blog");
    expect(summary?.pageKind).toBe("content-collection-index");
    expect(summary?.routeContract.join("\n")).toContain('purpose=Content collection page for "Blog"');
    expect(summary?.openingTopology).toContain("editorial");
  });

  it("tightens the portfolio/blog archive against weak support rails and placeholder context panels", () => {
    const decision = buildMockDecision();
    decision.routes = ["/", "/blog"];
    decision.navLabels = ["Home", "Blog"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Introduce the operator and route readers into selected writing.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Profile masthead", "Editorial pillars", "Writing spotlight"],
        componentMix: { hero: 20, feature: 15, grid: 15, proof: 15, form: 0, cta: 10 },
        constraints: [],
      },
      {
        route: "/blog",
        navLabel: "Blog",
        purpose: "Editorial archive for articles, notes, and archive-ready essays.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Blog archive",
        contentSkeleton: ["Archive intro", "Featured writing", "Article ledger"],
        componentMix: { hero: 10, feature: 10, grid: 30, proof: 10, form: 0, cta: 10 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText:
        "Create a personal editorial site for an AI consultant with a strong profile homepage and a blog archive that feels like a real publication.",
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "portfolio-blog-site",
    });

    expect(markdown).toContain(
      "prohibit: giant text-only archive lead plus a low-information context box or empty visual rail; supporting archive panels must carry real writing or publication evidence",
    );
    expect(markdown).toContain(
      "support_band_contract: when the homepage uses a companion visual/support panel, that panel must contain either a real operator/publication-context image or dense writing/proof substance. Do not ship decorative gradient placeholders, empty context cards, or weak right-side filler.",
    );
    expect(markdown).toContain(
      "support_band_contract: when the homepage uses a left-right support band, the copy and media columns must read as one aligned pair.",
    );
    expect(markdown).toContain(
      "card_media_contract: featured writing, operator proof, and selected article shelves should prefer integrated image-text cards when credible contextual imagery is available",
    );
  });

  it("exposes the media resource list as structured contract data", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const resources = buildWebsiteMediaResourceList({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      websiteSurfaceMode: "corporate-b2b-site",
    });

    expect(resources.map((resource) => resource.route)).toEqual(decision.routes);
    expect(resources[0]).toMatchObject({
      resourceId: "home-hero-01",
      route: "/",
      slotOwner: "opening-hero-background",
      sourcePriority: "curated stock/library first",
    });
    expect(resources.find((resource) => resource.route === "/products")).toMatchObject({
      resourceId: "products-media-01",
      imagePurpose: expect.stringContaining("product-family"),
      desktopImageArea: expect.stringContaining("520px max-width"),
    });
  });

  it("assigns distinct interior opening topologies for core corporate-b2b routes", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const products = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    }, "/products");
    const solutions = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    }, "/custom-solutions");
    const cases = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    }, "/cases");
    const about = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    }, "/about");
    const contact = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "ibm", slug: "ibm", name: "IBM", design_desc: "IBM Carbon enterprise system" } as any,
    }, "/contact");

    expect(products).toContain("opening_topology: catalog lead band -> assortment navigator -> comparison/specification row");
    expect(products).toContain("opening_media_contract: the products page must include a real product/material image in the opening catalog lead or the first opening-adjacent proof/specification band.");
    expect(products).toContain("image-text product card or aligned proof panel");
    expect(products).toContain("placement_band: inside the opening catalog lead or the immediately following assortment/specification proof band");
    expect(solutions).toContain("opening_topology: process intro band -> collaboration timeline -> scenario-fit proof row");
    expect(solutions).toContain("opening_media_contract: the solutions page must include a real process/scenario image in the opening process intro or the first opening-adjacent capability/proof band.");
    expect(solutions).toContain("placement_band: inside the opening process intro or the immediately following process/capability band");
    expect(cases).toContain("opening_topology: evidence header -> case ledger -> outcome/proof strip");
    expect(cases).toContain("opening_media_contract: the cases page must include a real scenario/result image in the opening evidence header or the first opening-adjacent proof strip.");
    expect(cases).toContain("placement_band: inside the opening evidence header or the immediately following case evidence/outcome strip");
    expect(about).toContain("opening_topology: company masthead -> operating profile slab -> trust/process strip");
    expect(contact).toContain("opening_topology: conversion-first inquiry block -> contact channels -> response expectation row");
    expect(products).toContain("prohibit: repeated interior hero skeleton across products, custom-solutions, cases, about, and contact");
  });

  it("assigns specialized opening families to creation, construction, advocacy, and case routes", () => {
    const decision = buildMockDecision();
    decision.routes = ["/", "/casux-creation", "/casux-construction", "/casux-advocacy", "/case-studies"];
    decision.navLabels = ["Home", "Creation", "Construction", "Advocacy", "Cases"];
    decision.pageIntents = [
      decision.pageIntents[0],
      {
        route: "/casux-creation",
        navLabel: "Creation",
        purpose: "Creation route for narrative architecture and content structure.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Creation",
        contentSkeleton: ["Creation masthead", "Narrative framework grid", "Proof CTA"],
        componentMix: { hero: 10, feature: 16, grid: 12, proof: 12, form: 4, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-construction",
        navLabel: "Construction",
        purpose: "Construction route for implementation and execution.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Construction",
        contentSkeleton: ["Process lead", "Execution roadmap", "Implementation proof"],
        componentMix: { hero: 10, feature: 16, grid: 12, proof: 12, form: 4, cta: 10 },
        constraints: [],
      },
      {
        route: "/casux-advocacy",
        navLabel: "Advocacy",
        purpose: "Advocacy route for participation and coalition work.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Advocacy",
        contentSkeleton: ["Advocacy lead", "Participation network", "Action framework"],
        componentMix: { hero: 10, feature: 16, grid: 12, proof: 12, form: 4, cta: 10 },
        constraints: [],
      },
      {
        route: "/case-studies",
        navLabel: "Cases",
        purpose: "Case studies route for evidence and outcomes.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Cases",
        contentSkeleton: ["Evidence header", "Case ledger", "Outcome strip"],
        componentMix: { hero: 10, feature: 16, grid: 12, proof: 12, form: 4, cta: 10 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const creation = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "modern-minimal", slug: "modern-minimal", name: "Modern minimal / Linear", design_desc: "Institutional content system" } as any,
    }, "/casux-creation");
    const construction = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "modern-minimal", slug: "modern-minimal", name: "Modern minimal / Linear", design_desc: "Institutional content system" } as any,
    }, "/casux-construction");
    const advocacy = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "modern-minimal", slug: "modern-minimal", name: "Modern minimal / Linear", design_desc: "Institutional content system" } as any,
    }, "/casux-advocacy");
    const cases = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: decision.requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: { id: "modern-minimal", slug: "modern-minimal", name: "Modern minimal / Linear", design_desc: "Institutional content system" } as any,
    }, "/case-studies");

    expect(creation).toContain("opening_topology: creation masthead -> narrative framework grid -> proof/CTA");
    expect(creation).toContain("creation-masthead");
    expect(creation).toContain("rather than a generic `detail-grid` with an `aside` surface");
    expect(construction).toContain("opening_topology: process lead band -> execution roadmap -> implementation proof row");
    expect(construction).toContain("construction-intro");
    expect(advocacy).toContain("opening_topology: advocacy lead band -> participation network -> action framework");
    expect(advocacy).toContain("advocacy-lead");
    expect(cases).toContain("opening_topology: evidence header -> case ledger -> outcome/proof strip");
    expect(cases).toContain("rather than a generic `detail-grid` with an `aside` surface");
  });

  it("keeps knowledge-platform content indexes out of product-catalog topology", () => {
    const decision = buildMockDecision();
    decision.routes = ["/", "/casux-information-platform"];
    decision.navLabels = ["Home", "Casux Information Platform"];
    decision.pageIntents = [
      decision.pageIntents[0],
      {
        route: "/casux-information-platform",
        navLabel: "Casux Information Platform",
        purpose: 'Content collection page for "Casux Information Platform".',
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Content collection page",
        contentSkeleton: [
          "Knowledge-hub lead",
          "Collection/index surface",
          "Resource cards",
          "Contextual CTA",
        ],
        componentMix: { hero: 12, feature: 12, grid: 30, proof: 8, form: 0, cta: 18 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const excerpt = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText:
        "Build a CASUX information platform for standards, research materials, and policy resources.",
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "industrial-b2b",
        slug: "industrial-b2b",
        name: "Industrial B2B",
        design_desc: "Structured institutional system",
      } as any,
    }, "/casux-information-platform");

    expect(excerpt).toContain("opening_topology: knowledge-hub lead band -> collection navigator -> resource/result stack");
    expect(excerpt).toContain("Knowledge-hub lead explaining how visitors should use the collection");
    expect(excerpt).toContain("knowledge-hub-lead");
    expect(excerpt).toContain("do not wrap a content-collection opening in generic hero shells such as `hero`, `hero--split`, `hero-grid`, `hero__grid`, or `hero-panel`");
    expect(excerpt).toContain("do not mix legacy hero utility classes such as `hero__content`, `hero__actions`, `hero-title`, or `hero-lead`");
    expect(excerpt).not.toContain("catalog lead band -> assortment navigator -> comparison/specification row");
    expect(excerpt).not.toContain("the products page must include a real product/material image");
    expect(excerpt).not.toContain("opening_markup_contract: the first products opening section");
  });

  it("writes Chinese-first locale strategy and single-language collection contracts for Chinese sites", () => {
    const decision = buildMockDecision();
    decision.locale = "zh-CN";
    decision.routes = ["/", "/casux-information-platform"];
    decision.navLabels = ["首页", "信息"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "首页",
        purpose: "Homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Brand-led hero", "Proof band", "Capability band", "CTA"],
        componentMix: { hero: 20, feature: 18, grid: 12, proof: 20, form: 6, cta: 12 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "信息",
        purpose: 'Content collection page for "Casux Information Platform".',
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Content collection page",
        contentSkeleton: ["Knowledge-hub lead", "Collection/index surface", "Resource cards", "Contextual CTA"],
        componentMix: { hero: 12, feature: 12, grid: 30, proof: 8, form: 0, cta: 18 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText: [
        "# Canonical Website Generation Prompt",
        "- Language: Chinese",
        "- Final website locale requirement: Chinese.",
        "- Locale contract: this site is single-language Chinese-first.",
      ].join("\n"),
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "modern-minimal",
        slug: "modern-minimal",
        name: "Modern minimal / Linear",
        design_desc: "Institutional content collection style",
      } as any,
    });
    const excerpt = buildWebsiteDesignSpecRouteExcerpt({
      decision,
      requirementText: [
        "# Canonical Website Generation Prompt",
        "- Language: Chinese",
        "- Final website locale requirement: Chinese.",
        "- Locale contract: this site is single-language Chinese-first.",
      ].join("\n"),
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "modern-minimal",
        slug: "modern-minimal",
        name: "Modern minimal / Linear",
        design_desc: "Institutional content collection style",
      } as any,
    }, "/casux-information-platform");

    expect(markdown).toContain("locale_strategy: Chinese-first single-language shell");
    expect(excerpt).toContain("single-language Chinese-first");
    expect(excerpt).toContain("Do not emit `/i18n/messages.en.json`");
    expect(excerpt).not.toContain("route HTML should rely on stable `data-i18n` keys plus `/i18n/messages.en.json`");
    expect(excerpt).toContain("collection-title");
  });

  it("derives Chinese-first shell contracts from the canonical prompt even when decision.locale is missing", () => {
    const decision = buildMockDecision();
    decision.locale = undefined as any;
    decision.routes = ["/", "/casux-creation"];
    decision.navLabels = ["首页", "创建"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "首页",
        purpose: "Homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Brand-led hero", "Proof band", "Capability band", "CTA"],
        componentMix: { hero: 20, feature: 18, grid: 12, proof: 20, form: 6, cta: 12 },
        constraints: [],
      },
      {
        route: "/casux-creation",
        navLabel: "创建",
        purpose: 'Dedicated page for "Creation".',
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Creation page",
        contentSkeleton: ["Route lead", "Primary content", "Supporting proof", "CTA"],
        componentMix: { hero: 10, feature: 18, grid: 12, proof: 16, form: 6, cta: 12 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const requirementText = [
      "# Canonical Website Generation Prompt",
      "- Language: Chinese",
      "- Final website locale requirement: Chinese.",
      "- Locale contract: this site is single-language Chinese-first.",
    ].join("\n");

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "modern-minimal",
        slug: "modern-minimal",
        name: "Modern minimal / Linear",
        design_desc: "Institutional content collection style",
      } as any,
    });
    const excerpt = buildWebsiteDesignSpecRouteExcerpt(
      {
        decision,
        requirementText,
        stylePreset: DEFAULT_STYLE_PRESET,
        designHit: {
          id: "modern-minimal",
          slug: "modern-minimal",
          name: "Modern minimal / Linear",
          design_desc: "Institutional content collection style",
        } as any,
      },
      "/casux-creation",
    );

    expect(markdown).toContain("locale_strategy: Chinese-first single-language shell");
    expect(markdown).toContain("this shell is single-language Chinese-first");
    expect(excerpt).toContain("this route is single-language Chinese-first");
    expect(excerpt).not.toContain("keep locale button labels literal `EN` and `ZH`");
    expect(excerpt).not.toContain("route HTML should rely on stable `data-i18n` keys plus `/i18n/messages.en.json`");
  });

  it("marks route excerpts as seed-authoritative when selected frontend seeds exist", () => {
    const decision = buildMockDecision();
    decision.pageBlueprints = decision.pageIntents;

    const excerpt = buildWebsiteDesignSpecRouteExcerpt(
      {
        decision,
        requirementText: decision.requirementText,
        stylePreset: DEFAULT_STYLE_PRESET,
        websiteSurfaceMode: "corporate-b2b-site",
        selectedSeedSkillIds: ["open-design-web-prototype", "docs-reference-template"],
      },
      "/products",
    );

    expect(excerpt).toContain("seed_authority_mode: seed-authoritative");
    expect(excerpt).toContain("selected_seed_contracts: open-design-web-prototype, docs-reference-template");
    expect(excerpt).toContain("local contentSkeleton and componentMix are fallback planning hints only");
  });

  it("lets explicit Chinese-first locale contracts beat bilingual-looking workflow noise", () => {
    const decision = buildMockDecision();
    decision.locale = undefined as any;
    decision.routes = ["/", "/casux-information-platform"];
    decision.navLabels = ["Home", "Information"];
    decision.pageIntents = [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Brand-led hero", "Proof band", "Capability band", "CTA"],
        componentMix: { hero: 20, feature: 18, grid: 12, proof: 20, form: 6, cta: 12 },
        constraints: [],
      },
      {
        route: "/casux-information-platform",
        navLabel: "Information",
        purpose: "Content collection page.",
        source: "prompt_contract",
        pageKind: "content-collection-index",
        responsibility: "Collection page",
        contentSkeleton: ["Knowledge lead", "Collection surface", "Cards", "CTA"],
        componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
        constraints: [],
      },
    ] as any;
    decision.pageBlueprints = decision.pageIntents;

    const requirementText = [
      "# Canonical Website Generation Prompt",
      "- Internal prompt language: English only.",
      "- Final website locale requirement: Chinese.",
      "- Language: Chinese",
      "- Locale contract: this site is single-language Chinese-first.",
      "- Do not emit an EN/ZH switch or bilingual resource files.",
    ].join("\n");

    const markdown = buildWebsiteDesignSpecMarkdown({
      decision,
      requirementText,
      stylePreset: DEFAULT_STYLE_PRESET,
      designHit: {
        id: "modern-minimal",
        slug: "modern-minimal",
        name: "Modern minimal / Linear",
        design_desc: "Institutional content collection style",
      } as any,
    });

    expect(markdown).toContain("locale_strategy: Chinese-first single-language shell");
    expect(markdown).not.toContain("locale_strategy: English-first with i18n resources for other locales");
  });
});
