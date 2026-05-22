import { describe, expect, it } from "vitest";
import { buildWebsiteDesignSpecMarkdown, buildWebsiteDesignSpecRouteExcerpt } from "./website-design-spec.ts";
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
    expect(markdown).toContain("header_utility_rule: render locale/language controls in a dedicated utility shell adjacent to navigation");
    expect(markdown).toContain("homepage_capability_rule: render the homepage capability zone as one unified capability band");
    expect(markdown).toContain("suggested_asset_url: https://images.unsplash.com/photo-1519046904884-53103b34b206");
    expect(markdown).toContain("suggested_asset_alt: Folded beach towels beside a bright pool and sea-toned resort deck");
    expect(markdown).toContain("homepage_cta_rule: keep the CTA zone single-primary-block; avoid a second bordered side panel with inquiry instructions or support notes.");
    expect(markdown).toContain("source_validation_rule: when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media");
    expect(markdown).toContain("caption_policy: homepage hero visual normally carries no caption");
    expect(markdown).toContain("copy_contract: do not surface internal art-direction or mood labels such as `heritage manufacturing`, `heritage craft`, `warm palette`");
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
    expect(excerpt).toContain("header_contract: locale switch must live in a dedicated utility wrapper beside the primary nav");
    expect(excerpt).toContain("header_contract: the primary nav cluster should contain route links only.");
    expect(excerpt).toContain("spacing_contract: keep the opening hero visually close to the shared header, but allow a measured shell transition of roughly 20-36px");
    expect(excerpt).toContain("spacing_contract: homepage shell rhythm should stay controlled and enterprise-like");
    expect(excerpt).toContain("section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range");
    expect(excerpt).toContain("capability_contract: homepage capability content must render as one unified capability band");
    expect(excerpt).toContain("cta_contract: CTA and section shells should use reusable class-owned layout instead of inline style spacing/alignment fixes.");
    expect(excerpt).toContain("hero_visual_balance: the image should carry roughly 55-65% of the first-screen visual emphasis");
    expect(excerpt).toContain("suggested_asset_url: https://images.unsplash.com/photo-1519046904884-53103b34b206");
    expect(excerpt).toContain("caption_policy: homepage hero visual normally carries no caption");
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
});
