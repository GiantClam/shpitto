import type { DesignSkillHit } from "../agent/website-workflow.ts";
import type { LocalDecisionPlan, PageBlueprint } from "./decision-layer.ts";
import type { DesignStylePreset } from "../design-style-preset.ts";
import { selectCuratedLibraryImage } from "./curated-media-library.ts";
import { isBilingualRequirementText } from "./bilingual-copy-guard.ts";
import type { WebsiteDiscoveryBrief, WebsiteSurfaceMode } from "./open-design-adoption.ts";
import { selectWebsiteGenerationTypeSkill } from "./website-type-selector.ts";

type WebsiteDesignSpecParams = {
  decision: LocalDecisionPlan;
  requirementText: string;
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
};

type DesignSpecLocaleMode = "zh-CN" | "en" | "bilingual";

export type RouteUnitContractSummary = {
  route: string;
  navLabel: string;
  pageKind: string;
  routeContract: string[];
  inheritedTerminology: string[];
  inheritedTokens: string[];
  openingFamily: string;
  openingTopology: string;
  mediaPlan: string[];
};

function summarizeInheritedTerminology(params: WebsiteDesignSpecParams): string[] {
  return Array.from(
    new Set(
      [
        params.decision.brandHint,
        params.websiteSurfaceMode,
        params.discoveryBrief?.surfaceMode,
        params.discoveryBrief?.primaryGoal,
        ...(params.discoveryBrief?.audience || []),
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function summarizeInheritedTokens(params: WebsiteDesignSpecParams): string[] {
  return Array.from(
    new Set(
      [
        params.stylePreset.colors.primary,
        params.stylePreset.colors.accent,
        params.stylePreset.colors.background,
        params.stylePreset.typography,
        params.designSystemId,
        params.designSystemName,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function routeOpeningFamily(page: PageBlueprint): string {
  if (page.route === "/") return "homepage";
  if (isContentCollectionPage(page)) return "collection";
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  if (/docs?|documentation|guide|manual|reference|api|handbook|playbook|faq|tutorial/.test(text)) return "docs";
  if (/research|standards?|information|downloads?|resource|library|certification|advocacy/.test(text)) return "content-hub";
  if (/products?|catalog|collection/.test(text)) return "catalog";
  if (/solutions?|services?|custom-solutions?/.test(text)) return "solutions";
  if (/cases?|portfolio|projects?/.test(text)) return "evidence";
  if (/contact|inquiry/.test(text)) return "conversion";
  if (/about|company|team|profile/.test(text)) return "identity";
  return "route-owned";
}

function isContentCollectionPage(page: PageBlueprint): boolean {
  return page.pageKind === "blog-data-index" || page.pageKind === "content-collection-index";
}

function hasExplicitChineseLocaleContract(text: string): boolean {
  return /(?:final website locale requirement|requested site locale|language|locale)\s*:\s*chinese\b|single-language chinese-first|chinese-only|keep all visible copy in chinese|keep the site in chinese|locale contract:\s*this site is single-language chinese-first/i.test(
    String(text || ""),
  );
}

function hasExplicitEnglishLocaleContract(text: string): boolean {
  return /(?:final website locale requirement|requested site locale|language|locale)\s*:\s*english\b|single-language english-first|english-only|keep all visible copy in english|keep the site in english|locale contract:\s*this site is single-language english-first/i.test(
    String(text || ""),
  );
}

function resolveDesignSpecLocaleMode(params: WebsiteDesignSpecParams): DesignSpecLocaleMode {
  return params.decision.locale === "zh-CN" || hasExplicitChineseLocaleContract(params.requirementText)
    ? "zh-CN"
    : params.decision.locale === "en" || hasExplicitEnglishLocaleContract(params.requirementText)
      ? "en"
      : isBilingualRequirementText(params.requirementText)
        ? "bilingual"
        : "en";
}

function buildLocaleShellContractLines(localeMode: DesignSpecLocaleMode): string[] {
  if (localeMode === "bilingual") {
    return [
      "- header_contract: locale switch must live in one dedicated utility wrapper beside the primary nav, not inside `<nav>`, and that utility wrapper must not be left empty.",
      "- header_contract: keep locale button labels literal `EN` and `ZH`; keep longer language strings inside the JSON dictionaries, not the header switch.",
      "- i18n_contract: route HTML should rely on stable `data-i18n` keys plus `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json`. Do not ship inline `data-i18n-zh` / `data-i18n-en` value blobs across final route markup.",
    ];
  }
  if (localeMode === "zh-CN") {
    return [
      "- header_contract: this route is single-language Chinese-first. Do not emit a locale switch, EN/ZH utility shell, or bilingual nav/footer chrome.",
      "- i18n_contract: ship visible Chinese-first copy directly in final HTML. Do not emit `/i18n/messages.en.json`, `/i18n/messages.zh-CN.json`, inline alternate-language payloads, or hidden bilingual shell content.",
    ];
  }
  return [
    "- header_contract: this route is single-language English-first. Do not emit a locale switch, EN/ZH utility shell, or bilingual nav/footer chrome unless the prompt explicitly requests it.",
    "- i18n_contract: ship visible English-first copy directly in final HTML. Do not emit `/i18n/messages.en.json`, `/i18n/messages.zh-CN.json`, inline alternate-language payloads, or hidden bilingual shell content unless the prompt explicitly requests bilingual output.",
  ];
}

function describeLocaleStrategy(localeMode: DesignSpecLocaleMode): string {
  if (localeMode === "bilingual") return "English-first with i18n resources for other locales";
  if (localeMode === "zh-CN") return "Chinese-first single-language shell";
  return "English-first single-language shell";
}

function buildShellLocaleLines(localeMode: DesignSpecLocaleMode): string[] {
  if (localeMode === "bilingual") {
    return [
      "- header_utility_rule: render locale/language controls in a dedicated utility shell adjacent to navigation, not inside the primary nav link stream.",
      "- header_utility_rule: the dedicated utility shell must contain the locale switch itself. Do not emit an empty `header-utility` / `locale-utility` placeholder while the locale buttons remain inside `<nav>`.",
    ];
  }
  return [
    `- header_utility_rule: this shell is ${localeMode === "zh-CN" ? "single-language Chinese-first" : "single-language English-first"}. Do not emit locale/language controls, EN/ZH switches, or bilingual shell chrome.`,
  ];
}

function normalizeStyleToken(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isCorporateB2BEnterpriseHomepage(params: WebsiteDesignSpecParams): boolean {
  const routeSignals = params.decision.routes.join(" ");
  const pageSignals = params.decision.pageBlueprints
    .map((page) => `${page.route} ${page.navLabel} ${page.purpose} ${page.responsibility}`)
    .join(" ");
  const text = [
    params.requirementText,
    params.decision.brandHint || "",
    routeSignals,
    pageSignals,
    params.designHit?.id || "",
    params.designHit?.name || "",
    params.designHit?.design_desc || "",
  ]
    .filter(Boolean)
    .join(" ");
  const negative = /\b(portfolio|personal(?:\s+site)?|resume|curriculum vitae|cv|creator|newsletter|journal|media site|editorial blog)\b/i;
  const institutionalNegative =
    /\b(research center|research hub|information platform|knowledge platform|resource center|standards system|standards library|documentation portal|certification hub|advocacy|repository|directory|downloads? hub|policy library)\b/i;
  const positive =
    /\b(company|corporate|enterprise|b2b|buyers?|procurement|manufacturer|manufacturing|factory|supplier|export|wholesale|distributor|hospitality|custom solutions?|product showcase|brand trust|inquiry)\b/i;
  const routeCount = params.decision.routes.filter((route) =>
    /(?:^|\/)(products?|custom-solutions?|solutions?|cases?|about|contact)(?:\/|$)/i.test(route),
  ).length;
  if ((negative.test(text) || institutionalNegative.test(text)) && routeCount < 2) return false;
  return positive.test(text) || routeCount >= 2;
}

function resolveWebsiteSurfaceMode(params: WebsiteDesignSpecParams): WebsiteSurfaceMode {
  return (
    params.websiteSurfaceMode ||
    params.discoveryBrief?.surfaceMode ||
    selectWebsiteGenerationTypeSkill({
      requirementText: params.requirementText,
      routes: params.decision.routes,
    }).surfaceMode
  );
}

function buildSurfaceTokenContractLines(surfaceMode: WebsiteSurfaceMode): string[] {
  const shared = [
    "- surface_token_precedence: the surface token contract wins over generic style preset colors when they conflict. `/styles.css` should declare these values, or a very close palette with the same contrast and type personality.",
  ];
  if (surfaceMode === "corporate-b2b-site") {
    return [
      ...shared,
      "- surface_css_tokens: --bg #0B1220; --surface #101A2E; --panel #16233A; --text #F8FAFC; --muted #B8C4D6; --border #2E3D58; --primary #4F8EF7; --accent #F5A524.",
      "- surface_typography_tokens: sturdy enterprise sans such as IBM Plex Sans, Sora, or a similar industrial sans; avoid editorial serif dominance and docs-style monospace as the main voice.",
    ];
  }
  if (surfaceMode === "docs-knowledge-site") {
    return [
      ...shared,
      "- surface_css_tokens: --bg #F7F8FB; --surface #FFFFFF; --panel #EEF3FA; --text #172033; --muted #526173; --border #D9E1EE; --primary #2454D8; --accent #00A7B5.",
      "- surface_typography_tokens: documentation sans plus monospaced accents such as IBM Plex Sans with JetBrains Mono, Source Code Pro, or a similar code/reference accent.",
    ];
  }
  if (surfaceMode === "content-hub-site") {
    return [
      ...shared,
      "- surface_css_tokens: --bg #F5EFE6; --surface #FFF9EF; --panel #FFFFFF; --text #261A13; --muted #6F5B4B; --border #D8C6AD; --primary #7A3524; --accent #B6813B.",
      "- surface_typography_tokens: editorial or institutional serif-forward pairing such as Georgia/Source Serif with a restrained sans; avoid docs-style monospace and corporate dark enterprise dominance.",
    ];
  }
  return [
    ...shared,
    "- surface_css_tokens: choose a palette that is visibly distinct from the default green-white card theme and appropriate for the selected website surface.",
  ];
}

function buildSurfaceVisualIdentityLines(surfaceMode: WebsiteSurfaceMode): string[] {
  const shared = [
    "- surface_visual_identity: this surface must have a distinct aesthetic, layout rhythm, and module vocabulary for its website type. Do not reuse the same green/white rounded-card system across corporate, docs, and content-hub sites.",
    "- surface_copy_exclusion: never render internal layout or QA labels such as `Responsive layout`, `Shared shell`, `Desktop and mobile review`, `homepage groups`, `homepage frames`, or `visual system keeps` in visitor-facing copy. Replace them with subject-specific content, proof, reference topics, resource categories, or visitor outcomes.",
    ...buildSurfaceTokenContractLines(surfaceMode),
  ];
  if (surfaceMode === "corporate-b2b-site") {
    return [
      ...shared,
      "- surface_aesthetic: industrial enterprise, procurement, operations, and institutional trust. Prefer a steel/graphite/navy or similarly grounded base with one restrained high-contrast accent rather than a generic green-white card theme.",
      "- surface_layout_rhythm: image-backed enterprise masthead, wide proof bands, capability/process modules, and concrete operational media should define the first-screen and homepage cadence.",
      "- surface_module_vocabulary: use enterprise-owned hero, proof-row, capability-band, process, trust, and inquiry modules. Avoid docs workspace modules, editorial archive shelves, and repeated floating-card grids as the dominant pattern.",
    ];
  }
  if (surfaceMode === "docs-knowledge-site") {
    return [
      ...shared,
      "- surface_aesthetic: documentation/reference workspace. Prefer paper/ink/slate/cobalt/teal or another developer-documentation palette with monospaced accents and compact structural contrast, not the corporate enterprise masthead palette.",
      "- surface_layout_rhythm: establish wayfinding, document families, reference cards, code/reference panels, TOC/search cues, and narrow readable measures instead of campaign proof bands or editorial magazine shelves.",
      "- surface_module_vocabulary: use docs-home, reference-index, guide-stack, quickstart, version, API, search, and cross-link modules. Do not make docs pages look like product-sales pages or content-hub archives.",
    ];
  }
  if (surfaceMode === "content-hub-site") {
    return [
      ...shared,
      "- surface_aesthetic: editorial/institutional archive, standards library, or research desk. Prefer serif-forward or publication-like typography with paper/ink/terracotta/olive or another distinct archive palette rather than corporate/docs green-white cards.",
      "- surface_layout_rhythm: collection shelves, ledger rows, archive grids, research cards, resource indexes, and dense onward navigation should carry the experience instead of product proof bands or documentation code panels.",
      "- surface_module_vocabulary: use collection-home, standards-ledger, research-index, resource-shelf, download-row, issue-map, and institutional-context modules. Avoid corporate sales modules and docs workspace chrome as the dominant template.",
    ];
  }
  return [
    ...shared,
    "- surface_aesthetic: choose a visual language that matches this surface and differs from adjacent website types in color, typography, opening composition, and section cadence.",
    "- surface_layout_rhythm: avoid recycling one generic homepage/cards/CTA skeleton across unrelated website surfaces.",
  ];
}

function routeRoleSummary(page: PageBlueprint): string {
  if (page.route === "/") return "Homepage";
  if (page.pageKind === "blog-data-index") return "Content archive";
  if (page.pageKind === "content-collection-index") return "Content collection";
  if (page.pageKind === "search-directory") return "Directory";
  if (page.pageKind === "auth") return "Account/auth";
  return "Interior route";
}

function routeOpeningTopology(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string {
  if (page.route === "/") {
    if (enterpriseHomepage || surfaceMode === "corporate-b2b-site") {
      return "image-backed enterprise hero -> compact proof row -> unified capability band -> concise CTA strip";
    }
    if (surfaceMode === "docs-knowledge-site") {
      return "docs workspace masthead -> search/index rail -> quickstart strip -> reference matrix -> compact support CTA";
    }
    if (surfaceMode === "content-hub-site") {
      return "editorial archive masthead -> collection shelves -> resource ledger -> institutional CTA";
    }
    return "single-column homepage hero -> proof band -> capability/CTA";
  }
  if (isContentCollectionPage(page)) {
    return "knowledge-hub lead band -> collection navigator -> resource/result stack";
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  if (/(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(page.route) || /\bcreation\b/.test(text)) {
    return "creation masthead -> narrative framework grid -> proof/CTA";
  }
  if (/(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(page.route) || /\bconstruction\b/.test(text)) {
    return "process lead band -> execution roadmap -> implementation proof row";
  }
  if (/(?:^|\/)(?:casux-)?advocacy(?:\/|$)/i.test(page.route) || /\badvocacy\b/.test(text)) {
    return "advocacy lead band -> participation network -> action framework";
  }
  if (/products?|catalog|collection/.test(text)) {
    return "catalog lead band -> assortment navigator -> comparison/specification row";
  }
  if (/solutions?|services?|custom-solutions?/.test(text)) {
    return "process intro band -> collaboration timeline -> scenario-fit proof row";
  }
  if (/cases?|portfolio|projects?/.test(text)) {
    return "evidence header -> case ledger -> outcome/proof strip";
  }
  if (/contact|inquiry/.test(text)) {
    return "conversion-first inquiry block -> contact channels -> response expectation row";
  }
  if (/about|company|team|profile/.test(text)) {
    return "company masthead -> operating profile slab -> trust/process strip";
  }
  return "route-specific lead band -> primary content band -> supporting proof/CTA";
}

function routeMediaPlan(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  if (page.route === "/") {
    if (enterpriseHomepage || surfaceMode === "corporate-b2b-site") {
      return [
        "- slot_owner: opening-hero-background",
        "- image_purpose: procurement-confidence environmental cue that reinforces product, capability, or operating trust behind the enterprise masthead",
        "- placement_band: inside the opening hero as a background-supported visual layer behind copy",
        "- preferred_ratio: 21:9 cinematic landscape or 16:9 wide landscape with strong subject readability",
        "- display_mode: image-backed enterprise hero with overlay copy; the image should carry the majority of first-screen visual weight, with no empty side rail, detached proof image, or hard-inserted width:100% inline image",
        "- source_priority: curated stock/library first",
        "- media_source_rule: when stock/library imagery is available, use a real photographic asset; do not use inline SVG, abstract illustration, or data-URI placeholder media for the primary hero visual",
      ];
    }
    if (surfaceMode === "docs-knowledge-site") {
      return [
        "- slot_owner: docs-reference-workspace",
        "- image_purpose: compact product/reference context such as search, API surface, version cues, or implementation examples; it should support wayfinding rather than act as a campaign hero",
        "- placement_band: inside a docs workspace panel, quickstart/reference strip, or index rail adjacent to the opening; do not make it a full-bleed hero background",
        "- preferred_ratio: 16:10, 4:3, or disciplined code/reference panel",
        "- display_mode: compact reference surface, search/index module, or code/reference panel with readable labels",
      ];
    }
    if (surfaceMode === "content-hub-site") {
      return [
        "- slot_owner: archive-context-surface",
        "- image_purpose: institutional, research, standards, or collection context that supports the archive/index surface without dominating it like a campaign hero",
        "- placement_band: within an archive masthead, collection shelf, resource ledger, or institutional context band; do not use a docs code panel or enterprise hero background",
        "- preferred_ratio: 4:3, 3:2, or disciplined publication thumbnail",
        "- display_mode: editorial/institutional support visual, document cover cluster, ledger thumbnail, or collection-context panel",
      ];
    }
    return [
      "- slot_owner: homepage-supporting-band",
      "- image_purpose: brand/product context",
      "- placement_band: supporting band after the opening section",
      "- preferred_ratio: landscape",
      "- display_mode: contained supporting media",
    ];
  }
  if (isContentCollectionPage(page)) {
    return [
      "- slot_owner: knowledge-hub supporting proof slot",
      "- image_purpose: institutional, research, standards, policy, or documentation context that helps visitors understand the collection surface without implying publishable editorial archive semantics",
      "- placement_band: supporting proof band adjacent to the collection navigator or result stack; do not force a product-catalog hero image treatment",
      "- preferred_ratio: 16:9, 4:3, or disciplined landscape",
    ];
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  if (/products?|catalog|collection/.test(text)) {
    return [
      "- slot_owner: catalog-lead proof slot",
      "- image_purpose: product-family, material, texture, or folded-pack proof that helps buyers understand assortment immediately",
      "- placement_band: inside the opening catalog lead or the immediately following assortment/specification proof band; the first meaningful product image must appear in the opening zone or the first opening-adjacent proof row",
      "- preferred_ratio: 4:3, 5:4, or square",
    ];
  }
  if (/solutions?|services?|custom-solutions?/.test(text)) {
    return [
      "- slot_owner: process-intro proof slot",
      "- image_purpose: environment, process, delivery, or collaboration-context proof that makes the solution path legible at first glance",
      "- placement_band: inside the opening process intro or the immediately following process/capability band; the first meaningful image must appear in the opening zone or first opening-adjacent proof row",
      "- preferred_ratio: 16:9, 5:3, or disciplined landscape",
    ];
  }
  if (/cases?|portfolio|projects?/.test(text)) {
    return [
      "- slot_owner: evidence-header proof slot",
      "- image_purpose: application, scenario, or result proof that makes the case outcome concrete before deeper reading",
      "- placement_band: inside the opening evidence header or the immediately following case evidence/outcome strip; the first meaningful case image must appear in the opening zone or first opening-adjacent proof row",
      "- preferred_ratio: 16:9, 4:3, or square",
    ];
  }
  return [
    "- slot_owner: supporting content band",
    "- image_purpose: route-specific contextual proof",
    "- placement_band: supporting band, never hard-inserted into the opening by default",
  ];
}

export function buildRouteUnitContractSummary(
  params: WebsiteDesignSpecParams,
  route: string,
): RouteUnitContractSummary | undefined {
  const websiteSurfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    websiteSurfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  const page =
    params.decision.pageBlueprints.find((item) => item.route === route) ||
    params.decision.pageBlueprints.find((item) => item.route === "/") ||
    params.decision.pageBlueprints[0];
  if (!page) return undefined;
  const openingTopology = routeOpeningTopology(page, enterpriseHomepage, websiteSurfaceMode);
  return {
    route: page.route,
    navLabel: page.navLabel,
    pageKind: page.pageKind,
    routeContract: [
      `route=${page.route}`,
      `navLabel=${page.navLabel}`,
      `pageKind=${page.pageKind}`,
      `purpose=${page.purpose}`,
    ],
    inheritedTerminology: summarizeInheritedTerminology(params),
    inheritedTokens: summarizeInheritedTokens(params),
    openingFamily: routeOpeningFamily(page),
    openingTopology,
    mediaPlan: routeMediaPlan(page, enterpriseHomepage, websiteSurfaceMode),
  };
}

function routeProhibitions(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  if (page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")) {
    return [
      "- prohibit: split hero / hero-grid / aside rail / snapshot panel / floating stat cards in the opening band",
      "- prohibit: founder/personal-brand cadence, boutique/editorial hero, lifestyle promo framing",
      "- prohibit: image as a first-screen side panel, empty right rail, or width:100% hard-inserted detached hero media",
      "- prohibit: homepage capability zone rendered as content-band--split, split-grid, detail sidebar, proof-rail, or right-column aside",
    ];
  }
  if (page.route === "/" && surfaceMode === "docs-knowledge-site") {
    return [
      "- prohibit: generic marketing homepage skeleton such as hero -> three feature cards -> proof strip -> CTA",
      "- prohibit: image-backed enterprise masthead, procurement proof row, editorial archive shelves, and broad campaign hero framing",
      "- prohibit: using only generic classes such as `hero`, `hero-grid`, `card-grid`, `page-section`, or `section band` for the opening docs modules",
      "- prohibit: marketing hero utility geometry made from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, or a right-side visual rail",
    ];
  }
  if (page.route === "/" && surfaceMode === "content-hub-site") {
    return [
      "- prohibit: generic marketing homepage skeleton such as hero -> three feature cards -> proof strip -> CTA",
      "- prohibit: docs workspace chrome, code/reference panels, enterprise proof rows, and product-sales capability bands as the dominant homepage template",
      "- prohibit: using only generic classes such as `hero`, `hero-grid`, `card-grid`, `page-section`, or `section band` for the opening collection modules",
      "- prohibit: marketing hero utility geometry made from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, or a right-side visual rail",
    ];
  }
  if (isContentCollectionPage(page)) {
    return [
      "- prohibit: repeated homepage hero skeleton on every route",
      "- prohibit: turning a knowledge/resource collection into a faux product catalog or export-sales assortment page",
      "- prohibit: inventing publishable article detail pages or editorial archive promises unless the prompt explicitly requests them",
      "- prohibit: utility/language/documentation topics becoming the main body content",
    ];
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  const routeSpecificBan =
    /(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(page.route) || /\bcreation\b/.test(text)
      ? "- prohibit: reopening the page with a generic prose-plus-aside split hero. Creation routes must start with a route-owned narrative or content-architecture lead."
      : /(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(page.route) || /\bconstruction\b/.test(text)
        ? "- prohibit: reopening the page with a generic prose-plus-aside split hero. Construction routes must start process-first or execution-first."
        : /(?:^|\/)(?:casux-)?advocacy(?:\/|$)/i.test(page.route) || /\badvocacy\b/.test(text)
          ? "- prohibit: reopening the page with a generic prose-plus-aside split hero. Advocacy routes must start with a participation or action-framework lead."
          : /products?|catalog|collection/.test(text)
      ? "- prohibit: reopening the page as a generic promotional hero or another homepage-style promise stack; products must start with assortment/specification logic."
      : /solutions?|services?|custom-solutions?/.test(text)
        ? "- prohibit: reopening the page as another catalog hero; solutions must start process-first or scenario-first."
        : /cases?|portfolio|projects?/.test(text)
          ? "- prohibit: reopening the page as a generic marketing hero; cases must start evidence-first or outcome-first."
          : /contact|inquiry/.test(text)
            ? "- prohibit: reopening the page as a brand billboard hero; contact must start with inquiry, channels, or response readiness."
            : /about|company|team|profile/.test(text)
              ? "- prohibit: reopening the page as a campaign hero; about must start with company identity, operating profile, or trust/process proof."
              : "";
  return [
    "- prohibit: repeated homepage hero skeleton on every route",
    "- prohibit: repeated interior hero skeleton across products, custom-solutions, cases, about, and contact",
    "- prohibit: utility/language/documentation topics becoming the main body content",
    ...(routeSpecificBan ? [routeSpecificBan] : []),
  ];
}

function buildRouteSpecLines(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  localeMode: DesignSpecLocaleMode,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  if (isContentCollectionPage(page)) {
    return [
      `- role: ${routeRoleSummary(page)}`,
      `- nav_label: ${page.navLabel}`,
      `- purpose: ${page.purpose}`,
      `- opening_topology: ${routeOpeningTopology(page, enterpriseHomepage, surfaceMode)}`,
      "- section_cadence: Knowledge-hub lead explaining how visitors should use the collection -> page-specific collection/index surface -> resource/result cards or rows -> contextual CTA or cross-navigation back into the core site",
      "- section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range, while nested resource cards, filter rows, metadata stacks, CTA action groups, and support clusters should still feel spacious in roughly the 28-44px range.",
      `- component_mix: hero ${page.componentMix.hero}, feature ${page.componentMix.feature}, grid ${page.componentMix.grid}, proof ${page.componentMix.proof}, form ${page.componentMix.form}, cta ${page.componentMix.cta}`,
      ...routeProhibitions(page, enterpriseHomepage, surfaceMode),
      "- markup_contract: the first visible content-index band should use route-owned knowledge-hub semantics such as `knowledge-hub-lead`, `resource-collection-lead`, `information-platform-lead`, or `research-index-lead` rather than product-catalog wrappers such as `catalog-lead` or `product-comparison-lead`.",
      "- markup_contract: do not wrap a content-collection opening in generic hero shells such as `hero`, `hero--split`, `hero-grid`, `hero__grid`, or `hero-panel`.",
      "- markup_contract: do not mix legacy hero utility classes such as `hero__content`, `hero__actions`, `hero-title`, or `hero-lead` into a route-owned collection opening. The opening lead itself must carry the route-owned collection semantics.",
      "- markup_contract: collection openings should name their copy clusters with route-owned classes such as `collection-title`, `collection-lead`, `collection-actions`, `knowledge-hub-title`, or `knowledge-hub-actions` instead of reusing legacy hero utility names.",
      ...buildLocaleShellContractLines(localeMode),
      "- cta_contract: section shells, opening grids, checklists, and support rows must use reusable classes rather than inline spacing/alignment styles.",
      "- copy_contract: route-opening leads, captions, and support lines must read like finished visitor-facing copy. Do not echo instruction-led verbs such as `should`, `must`, `use`, `explain`, or other contract wording in visible text.",
      "- caption_contract: visible collection captions may describe standards, research, policy, documentation, or case-library context, but they must not explain what the visual or layout is trying to prove.",
      "- media_markup_contract: route-opening proof media must use reusable semantic classes rather than inline `style=` attributes on `<img>`, `<figure>`, or proof panels. Width, height, object-fit, max-width, and alignment belong in shared CSS classes.",
      "- layout_markup_contract: route openings and CTA bands must not rely on inline-styled `hero-title`, `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or `media-frame` blocks for spacing or sizing. Express these patterns through reusable route-owned classes in `/styles.css`.",
      "- footer_markup_contract: footer support notes and action groups must use reusable footer classes. Do not use inline `margin-top` spacing fixes on `footer-notes`, helper paragraphs, or footer action wrappers.",
      "- media_plan:",
      ...routeMediaPlan(page, enterpriseHomepage, surfaceMode),
    ];
  }
  const routeText = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  const interiorMarkupContract =
    /(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(page.route) || /\bcreation\b/.test(routeText)
      ? [
          "- markup_contract: the first visible creation band should use route-owned class semantics such as `creation-masthead`, `narrative-lead`, or `content-architecture-intro` rather than a generic `detail-grid` with an `aside` surface.",
        ]
      : /(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(page.route) || /\bconstruction\b/.test(routeText)
        ? [
            "- markup_contract: the first visible construction band should use route-owned class semantics such as `process-lead`, `construction-intro`, or `execution-roadmap` rather than a generic `detail-grid` with an `aside` surface.",
          ]
        : /(?:^|\/)(?:casux-)?advocacy(?:\/|$)/i.test(page.route) || /\badvocacy\b/.test(routeText)
          ? [
              "- markup_contract: the first visible advocacy band should use route-owned class semantics such as `advocacy-lead`, `participation-network`, or `action-framework` rather than a generic `detail-grid` with an `aside` surface.",
            ]
          : /(?:^|\/)(?:case-studies|cases)(?:\/|$)/i.test(page.route)
            ? [
                "- markup_contract: the first visible cases band should use route-owned class semantics such as `evidence-header`, `case-ledger-intro`, `outcome-frame`, or `case-lead` rather than a generic `detail-grid` with an `aside` surface.",
              ]
            : /products?|catalog|collection/.test(routeText)
      ? [
          "- markup_contract: the first visible products band should use route-owned class semantics such as `catalog-lead`, `assortment-lead`, or `product-comparison-lead` rather than a generic `section stack-lg` shell.",
        ]
      : /solutions?|services?|custom-solutions?/.test(routeText)
      ? [
          "- markup_contract: the first visible solutions band should use route-owned class semantics such as `process-intro`, `solutions-process-intro`, `scenario-fit-lead`, or `solution-lead` rather than a generic `section stack-lg` shell.",
        ]
      : /cases?|portfolio|projects?/.test(routeText)
          ? [
              "- markup_contract: the first visible cases band should use route-owned class semantics such as `evidence-header`, `case-ledger-intro`, `outcome-frame`, or `case-lead` rather than a generic `section stack-lg` shell.",
            ]
          : /about|company|team|profile/.test(routeText)
            ? [
                "- markup_contract: the first visible about band should use route-owned class semantics such as `company-masthead`, `operating-profile`, `trust-masthead`, or `about-lead` rather than a generic `section grid grid--2` shell.",
              ]
            : /contact|inquiry/.test(routeText)
              ? [
                  "- markup_contract: the first visible contact band should use route-owned class semantics such as `contact-conversion`, `contact-channels`, or `response-expectation` rather than a generic `section grid grid--2` shell.",
                ]
              : [];
  const surfaceHomepageContract =
    page.route === "/" && !enterpriseHomepage && surfaceMode === "docs-knowledge-site"
      ? [
          "- surface_homepage_archetype: docs workspace/reference index, not a marketing landing page.",
          "- geometry_contract: the docs homepage opening must not use marketing hero utility geometry composed from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, an `aside`, panel, or right visual rail. Prefer a workspace geometry where search/index rail, quickstart strip, and reference matrix are visible as the primary structure.",
          "- markup_contract: the first visible docs homepage section should use route-owned docs semantics such as `docs-home`, `docs-workspace`, `docs-index-rail`, `docs-search`, `quickstart-strip`, `guide-stack`, or `reference-matrix`.",
          "- markup_contract: do not lead the docs homepage with generic `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, `card-grid`, or campaign `page-section` shells as the dominant opening.",
          "- layout_contract: docs homepage density should come from wayfinding, readable measures, reference grouping, version/search cues, and code/reference panels; avoid broad sales proof rows and repeated floating feature cards.",
        ]
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site"
        ? [
            "- surface_homepage_archetype: editorial/institutional collection index, not a marketing landing page or docs workspace.",
            "- geometry_contract: the content-hub homepage opening must not use marketing hero utility geometry composed from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, an `aside`, panel, or right visual rail. Prefer an editorial/index geometry where the masthead, shelves, ledgers, and resource rows carry the opening instead of a right-side hero panel.",
            "- markup_contract: the first visible content-hub homepage section should use route-owned collection semantics such as `collection-home`, `archive-masthead`, `resource-shelf`, `standards-ledger`, `research-index`, `issue-map`, or `institutional-context`.",
            "- markup_contract: do not lead the content-hub homepage with generic `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, `card-grid`, or campaign `page-section` shells as the dominant opening.",
            "- layout_contract: content-hub density should come from shelves, ledgers, archive grids, topic navigation, and resource rows; avoid docs code panels, enterprise proof bands, and product-sales capability modules.",
          ]
        : [];
  const sectionCadence =
    page.route === "/" && !enterpriseHomepage && surfaceMode === "docs-knowledge-site"
      ? "documentation workspace lead -> search/index rail -> quickstart strip -> guide stack -> reference matrix -> compact support CTA"
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site"
        ? "editorial archive masthead -> topic/collection shelves -> standards/research ledger -> resource index rows -> institutional CTA"
        : page.contentSkeleton.join(" -> ") || "derive from the route role without reusing a generic hero shell";
  return [
    `- role: ${routeRoleSummary(page)}`,
    `- nav_label: ${page.navLabel}`,
    `- purpose: ${page.purpose}`,
    `- opening_topology: ${routeOpeningTopology(page, enterpriseHomepage, surfaceMode)}`,
    `- section_cadence: ${sectionCadence}`,
    "- section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range, while nested proof rows, capability grids, card stacks, CTA action groups, and support clusters should still feel spacious in roughly the 28-44px range.",
    `- component_mix: hero ${page.componentMix.hero}, feature ${page.componentMix.feature}, grid ${page.componentMix.grid}, proof ${page.componentMix.proof}, form ${page.componentMix.form}, cta ${page.componentMix.cta}`,
    ...routeProhibitions(page, enterpriseHomepage, surfaceMode),
    ...surfaceHomepageContract,
    ...(page.route === "/" && enterpriseHomepage
      ? [
          "- markup_contract: the opening hero should use an enterprise-specific wrapper such as `enterprise-hero` or `hero hero--enterprise`, plus dedicated media/content children like `enterprise-hero__media` and `enterprise-hero__content`.",
          "- markup_contract: do not fall back to generic opening wrappers such as `hero`, `section hero`, or other marketing-landing hero shells. The opening wrapper itself must remain enterprise-specific.",
          "- markup_contract: do not reuse legacy split-hero class names such as `hero-grid`, `hero__grid`, `hero-panel`, `media-frame`, or `hero-copy + aside` for the corporate-b2b enterprise opening.",
          "- markup_contract: do not mix legacy hero utility classes such as `hero__body`, `hero__content`, or `hero__actions` into the enterprise hero output; use enterprise-specific hero classes consistently.",
          "- markup_contract: do not use legacy inner hero classes such as `hero-title`, `hero-copy`, `hero-actions`, `page-section`, or other generic marketing-hero utility names inside the enterprise homepage hero. Keep the hero subtree enterprise-specific.",
          "- css_contract: styles.css must define the homepage opening through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row` rather than through `.hero-grid`, `.hero-copy`, `.hero-panel`, or `.media-frame`.",
          "- css_overlay_contract: the homepage opening must render as one image-backed hero surface. `.enterprise-hero__media` should behave like the shared media layer, and `.enterprise-hero__content` should behave like overlay copy rather than a separate card/panel.",
          "- css_overlay_contract: do not style `.enterprise-hero` as a two-column split panel with explicit `grid-template-columns`, and do not give `.enterprise-hero__content` its own opaque/gradient card background or card shadow that visually detaches it from the hero image.",
          "- css_overlay_contract: `.enterprise-hero__content` must remain a transparent overlay text layer. Do not assign it `background`, `border`, `box-shadow`, or `backdrop-filter` values that make it read as a separate frosted card.",
          "- header_contract: the primary nav cluster should contain route links only. Do not place locale buttons inside `<nav>` and then emit a second empty utility wrapper.",
          "- header_contract: do not emit an empty locale utility shell.",
          ...buildLocaleShellContractLines(localeMode),
          "- spacing_contract: keep the opening hero visually close to the shared header, but allow a measured shell transition of roughly 20-36px so the masthead can breathe. Do not stack large shell top padding and full section top padding before the first meaningful hero content.",
          "- spacing_contract: homepage shell rhythm should stay controlled and enterprise-like; major section spacing should usually remain in roughly the 40-72px range, while proof rows, capability-card groups, and CTA/support clusters should usually remain in roughly the 28-44px range instead of collapsing into utility-tight spacing.",
          "- capability_contract: homepage capability content must render as one unified capability band with heading + grid/list content in the same shell rhythm.",
          "- capability_contract: do not use `content-band--split`, `split-grid`, `detail`, `proof-rail`, or a right-column `aside` for the homepage capability zone.",
          "- cta_contract: CTA and section shells should use reusable class-owned layout instead of inline style spacing/alignment fixes.",
          "- copy_contract: do not surface internal art-direction or mood labels such as `heritage manufacturing`, `heritage craft`, `warm palette`, or similar direction metadata in the homepage eyebrow, hero kicker, proof row, footer, or other visitor-facing copy.",
          "- copy_contract: specifically do not use homepage eyebrow/kicker lines that expose a hidden product vertical or art-direction preset. The homepage kicker should describe business offer, buyer fit, operating trust, or sourcing reliability instead.",
          "- copy_contract: do not let homepage copy echo instruction-led verbs such as `should`, `must`, `use`, `explain`, or similar generator-facing phrasing.",
          "- copy_contract: unless the brief explicitly requests heritage or company-history storytelling, do not use `heritage`, `craft tradition`, or similar legacy-positioning language as homepage value claims. Prefer sourcing clarity, quality control, responsiveness, and production discipline.",
          "- copy_contract: do not use plain `heritage` as a homepage value word unless the brief explicitly asks for heritage/history storytelling. Treat `heritage` as internal direction metadata by default.",
          "- markup_contract: do not use generic action-group utility classes such as `hero-actions` in the homepage opening or CTA areas. Use enterprise-specific action classes such as `enterprise-hero__actions`, `cta-band__actions`, or another reusable corporate-owned action cluster.",
          "- layout_markup_contract: do not place inline `style=` attributes on `section__head`, `section-header`, or equivalent section-heading wrappers. Spacing and alignment for section heads must come from shared CSS classes only.",
          "- caption_contract: if a visible caption appears near homepage imagery, it must reinforce buyer trust through product, application, or sourcing context. It must not explain how the visual module should behave or what layout alternative was avoided.",
        ]
      : [
          ...interiorMarkupContract,
          ...buildLocaleShellContractLines(localeMode),
          "- cta_contract: section shells, opening grids, checklists, and support rows must use reusable classes rather than inline spacing/alignment styles.",
          "- copy_contract: route-opening leads, captions, and support lines must read like finished buyer-facing copy. Do not echo instruction-led verbs such as `should`, `must`, `use`, `explain`, or other contract wording in visible text.",
          "- caption_contract: visible route-opening captions must be buyer-facing and business-facing. They may describe material proof, application context, sourcing relevance, or delivery context, but they must not explain what the visual should do, what the layout is trying to prove, or what weaker visual treatment was avoided.",
          "- media_markup_contract: route-opening proof media must use reusable semantic classes rather than inline `style=` attributes on `<img>`, `<figure>`, or proof panels. Width, height, object-fit, max-width, and alignment belong in shared CSS classes.",
          "- layout_markup_contract: route openings and CTA bands must not rely on inline-styled `hero-title`, `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or `media-frame` blocks for spacing or sizing. Express these patterns through reusable route-owned classes in `/styles.css`.",
          "- layout_markup_contract: do not use generic `hero-actions` class names on interior openings, proof strips, or CTA bands. Use route-owned or shell-owned action classes instead.",
          "- layout_markup_contract: do not place inline `style=` attributes on `section__head`, `section-header`, or equivalent heading wrappers. Section-head spacing and alignment must be class-owned.",
          "- footer_markup_contract: footer support notes and action groups must use reusable footer classes. Do not use inline `margin-top` spacing fixes on `footer-notes`, helper paragraphs, or footer action wrappers.",
          ...(/products?|catalog|collection/.test(routeText)
            ? [
                "- opening_media_contract: the products page must include a real product/material image in the opening catalog lead or the first opening-adjacent proof/specification band. Do not delay the first meaningful product image until a later support section.",
                "- opening_markup_contract: the first products opening section should foreground the route-owned class itself (for example `catalog-lead` or `product-comparison-lead`) rather than leading with a generic shell token such as `route-band`.",
                "- markup_contract: route-opening product proof media should use classes such as `product-media`, `products-proof-panel`, `panel-image`, or similarly route-owned product-media semantics rather than generic inline styling.",
              ]
            : /solutions?|services?|custom-solutions?/.test(routeText)
              ? [
                  "- opening_media_contract: the solutions page must include a real process/scenario image in the opening process intro or the first opening-adjacent capability/proof band. Do not delay the first meaningful solution image until a later support section.",
                  "- opening_markup_contract: the first solutions opening section should foreground the route-owned class itself (for example `process-intro` or `scenario-fit-lead`) rather than leading with a generic shell token such as `route-band`.",
                  "- markup_contract: route-opening solutions proof media should use classes such as `process-media`, `solutions-proof-panel`, `panel-image`, or similarly route-owned solutions-media semantics rather than generic inline styling.",
                ]
              : /cases?|portfolio|projects?/.test(routeText)
                ? [
                    "- opening_media_contract: the cases page must include a real scenario/result image in the opening evidence header or the first opening-adjacent proof strip. Do not delay the first meaningful case image until a later support section.",
                    "- opening_markup_contract: the first cases opening section should foreground the route-owned class itself (for example `evidence-header` or `outcome-frame`) rather than leading with a generic shell token such as `route-band`.",
                    "- markup_contract: route-opening case proof media should use classes such as `case-media`, `cases-proof-panel`, `panel-image`, or similarly route-owned case-media semantics rather than generic inline styling.",
                  ]
                : /contact|inquiry/.test(routeText)
                  ? [
                      "- markup_contract: the contact opening support panel should use a dedicated route-owned class such as `contact-conversion__aside`, `contact-support-panel`, or equivalent contact-specific shell semantics rather than inline `max-width`, `justify-self`, or ad-hoc alignment styles.",
                    ]
                : []),
        ]),
    "- media_plan:",
    ...routeMediaPlan(page, enterpriseHomepage, surfaceMode),
  ];
}

function buildMediaResourceLines(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  const curatedImage = selectCuratedLibraryImage(page.route, page.evidence || page.purpose || "");
  const mediaPlan = routeMediaPlan(page, enterpriseHomepage, surfaceMode);
  const ratio = mediaPlan.find((line) => line.includes("preferred_ratio"))?.replace(/^- /, "") || "preferred_ratio: contextual";
  const placement = mediaPlan.find((line) => line.includes("placement_band"))?.replace(/^- /, "") || "placement_band: contextual";
  const purpose = mediaPlan.find((line) => line.includes("image_purpose"))?.replace(/^- /, "") || "image_purpose: contextual proof";
  const desktopImageArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "desktop_image_area: full-width hero background layer with a protected center-right focal zone, at least 680px visual depth behind the masthead, and enough visible subject area to dominate the first screen"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "desktop_image_area: compact docs/reference panel or search-index surface, roughly 420-560px wide, visually secondary to wayfinding clarity"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "desktop_image_area: archive thumbnail, document-cover cluster, or institutional context panel, roughly 360-520px wide, visually secondary to collection shelves and ledgers"
      : /products?|catalog|collection/i.test(`${page.route} ${page.navLabel}`)
        ? "desktop_image_area: 520px max-width x 420px visual box within the opening or first proof/specification band"
        : /solutions?|services?|custom-solutions?/i.test(`${page.route} ${page.navLabel}`)
          ? "desktop_image_area: 560px max-width x 340px visual box within the opening or first process/capability band"
          : /cases?|portfolio|projects?/i.test(`${page.route} ${page.navLabel}`)
            ? "desktop_image_area: 560px max-width x 340px visual box within the opening or first evidence/outcome band"
            : "desktop_image_area: 420px max-width visual box";
  const mobileImageArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "mobile_image_area: full-width hero background layer with copy-first overlay and a 420px minimum visible visual depth"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "mobile_image_area: full-width compact reference panel below the docs opening, capped around 260px height"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "mobile_image_area: full-width archive/resource thumbnail cluster below the collection masthead, capped around 260px height"
      : "mobile_image_area: full available shell width, max 280px height";
  const textCompanionArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "desktop_text_companion_area: overlay content zone stays left/center-left, limited to roughly 35-45% of the visual emphasis, while the image remains the main first-screen attention anchor"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "desktop_text_companion_area: docs opening copy should stay compact and pair with search/index/reference controls rather than overlaying a large hero image"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "desktop_text_companion_area: collection opening copy should pair with shelves, ledgers, and topic navigation rather than overlaying a large hero image"
      : "desktop_text_companion_area: preserve a readable adjacent text column; do not let the image consume the entire band";
  const visualBalance =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "- hero_visual_balance: docs homepage visuals should support wayfinding; search/index/reference content carries the primary first-screen emphasis"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "- hero_visual_balance: content-hub homepage visuals should support collection context; shelves, ledgers, and topic navigation carry the primary first-screen emphasis"
        : "- hero_visual_balance: the image should carry roughly 55-65% of the first-screen visual emphasis while the overlay copy remains crisp and readable";
  const displayMode =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "- display_mode: compact docs workspace panel, reference matrix, or search/index support slot only; never a full-bleed campaign hero"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "- display_mode: archive/context panel, document-cover cluster, or ledger thumbnail system only; never a full-bleed campaign hero or docs code panel"
        : "- display_mode: image-backed hero or contained route-owned media slot only; never hard-insert as a generic full-width image outside its planned module";
  const captionPolicy =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "- caption_policy: visible docs visual labels may name APIs, versions, guides, or reference areas, but must not explain layout intent"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "- caption_policy: visible hub visual labels may name standards, research scopes, resource categories, or institutional context, but must not explain layout intent"
        : "- caption_policy: homepage hero visual normally carries no caption; if a supporting line is used later, it must reinforce buyer trust through product/use context and never describe layout intent";
  return [
    `- resource_id: ${page.route === "/" ? "home-hero-01" : normalizeStyleToken(`${page.route}-media-01`)}`,
    "- source_priority: curated stock/library first",
    `- ${purpose}`,
    `- ${placement}`,
    `- ${ratio}`,
    `- ${desktopImageArea}`,
    `- ${mobileImageArea}`,
    `- ${textCompanionArea}`,
    visualBalance,
    "- object_fit_rule: preserve the key product/environment subject with center-weighted cropping and a readable overlay scrim; never crop the image so tightly that the hero loses its contextual proof value",
    displayMode,
    "- source_validation_rule: when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media",
    ...(curatedImage
      ? [
          `- suggested_asset_url: ${curatedImage.src}`,
          `- suggested_asset_alt: ${curatedImage.alt}`,
          `- suggested_asset_caption: ${curatedImage.caption}`,
        ]
      : []),
    captionPolicy,
  ];
}

function buildMediaResourceList(
  params: WebsiteDesignSpecParams,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  return params.decision.pageBlueprints.map((page) => {
    return [
      `### resource:${page.route}`,
      `- route: ${page.route}`,
      ...buildMediaResourceLines(page, enterpriseHomepage, surfaceMode),
    ].join("\n");
  });
}

export function buildWebsiteDesignSpecRouteExcerpt(params: WebsiteDesignSpecParams, route: string): string {
  const localeMode = resolveDesignSpecLocaleMode(params);
  const websiteSurfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    websiteSurfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  const normalizedRoute = String(route || "/").trim() || "/";
  const page =
    params.decision.pageBlueprints.find((item) => item.route === normalizedRoute) ||
    params.decision.pageBlueprints.find((item) => item.route === "/") ||
    params.decision.pageBlueprints[0];
  if (!page) return "";
  return [
    `# Route Design Spec: ${page.route}`,
    `- selected_style: ${String(params.designHit?.name || params.designHit?.id || "runtime-selected-style").trim() || "runtime-selected-style"}`,
    `- website_surface_mode: ${websiteSurfaceMode}`,
    ...buildSurfaceVisualIdentityLines(websiteSurfaceMode),
    ...buildRouteSpecLines(page, enterpriseHomepage, localeMode, websiteSurfaceMode),
    "- media_resource:",
    ...buildMediaResourceLines(page, enterpriseHomepage, websiteSurfaceMode),
  ].join("\n");
}

export function buildWebsiteDesignSpecMarkdown(params: WebsiteDesignSpecParams): string {
  const localeMode = resolveDesignSpecLocaleMode(params);
  const websiteSurfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    websiteSurfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  const styleId = String(params.designHit?.id || "runtime-selected-style").trim() || "runtime-selected-style";
  const styleName = String(params.designHit?.name || styleId).trim() || styleId;
  const styleReason = String(params.designHit?.design_desc || "runtime-selected-style").trim() || "runtime-selected-style";
  const routeLines = params.decision.routes.map((route, index) => {
    const page = params.decision.pageBlueprints[index];
    return `- ${route} (${page?.navLabel || route})`;
  });

  const routeSections = params.decision.pageBlueprints.map((page) =>
    [`### ${page.route}`, ...buildRouteSpecLines(page, enterpriseHomepage, localeMode, websiteSurfaceMode)].join("\n"),
  );
  const mediaResources = buildMediaResourceList(params, enterpriseHomepage, websiteSurfaceMode);

  return [
    "# Website Design Specification",
    "",
    "## 1. Authority",
    "- This file is the design execution contract for the current generation run.",
    "- Page generation must follow this spec before improvising layout or media decisions.",
    "- Runtime validators may normalize broken output, but they are not the primary design author.",
    "",
    "## 2. Global Design System",
    `- selected_style_id: ${styleId}`,
    `- selected_style_name: ${styleName}`,
    `- selection_reason: ${styleReason}`,
    `- website_surface_mode: ${websiteSurfaceMode}`,
    `- locale_strategy: ${describeLocaleStrategy(localeMode)}`,
    ...(params.discoveryBrief
      ? [
          `- discovery_source_priority: ${params.discoveryBrief.sourcePriority}`,
          `- discovery_routes: ${params.discoveryBrief.routes.join(", ")}`,
          `- discovery_visual_direction_id: ${params.discoveryBrief.visualDirectionId}`,
          `- discovery_primary_goal: ${params.discoveryBrief.primaryGoal || "prompt-adaptive"}`,
        ]
      : []),
    ...(params.designSystemId ? [`- design_system_lock_id: ${params.designSystemId}`] : []),
    ...(params.designSystemName ? [`- design_system_lock_name: ${params.designSystemName}`] : []),
    `- primary_color: ${params.stylePreset.colors.primary}`,
    `- accent_color: ${params.stylePreset.colors.accent}`,
    `- background_color: ${params.stylePreset.colors.background}`,
    `- typography: ${params.stylePreset.typography}`,
    ...buildSurfaceVisualIdentityLines(websiteSurfaceMode),
    "",
    "## 3. Shell Contract",
    `- confirmed_routes: ${params.decision.routes.join(", ")}`,
    "- Shared shell may keep one header and one footer system, but body topology must still vary by route.",
    "- Utility routes, locale mechanics, source/documentation mechanics, and accessibility notes must not become homepage narrative content unless explicitly requested.",
    "- footer_copy_rule: shared shell copy must describe the company, support buyers, or reinforce trust; it must not expose text-wordmark mode, brand-system labels, i18n/locale strategy, or site-implementation notes.",
    "- copy_firewall_rule: visible copy must translate internal generation instructions into buyer-facing language. Do not surface contract wording such as `should`, `must`, `use`, `explain`, `layout intent`, or other instruction-led phrasing in captions, leads, shell copy, or CTA labels.",
    ...buildShellLocaleLines(localeMode),
    "- section_spacing_contract: corporate-b2b pages should feel composed and breathable; major section bands should usually land in roughly the 40-72px range instead of collapsing into very tight dashboard spacing.",
    "",
    "## 4. Homepage Contract",
    `- homepage_mode: ${enterpriseHomepage || websiteSurfaceMode === "corporate-b2b-site" ? "enterprise_masthead" : websiteSurfaceMode === "docs-knowledge-site" ? "docs_workspace_homepage" : websiteSurfaceMode === "content-hub-site" ? "collection_index_homepage" : "standard_homepage"}`,
    `- homepage_opening: ${routeOpeningTopology(params.decision.pageBlueprints.find((page) => page.route === "/") || params.decision.pageBlueprints[0], enterpriseHomepage, websiteSurfaceMode)}`,
    websiteSurfaceMode === "docs-knowledge-site"
      ? "- homepage_archetype_contract: docs home must use docs workspace/reference index geometry with search/index rail, quickstart strip, guide stack, and reference matrix. Do not reuse corporate or hub homepage skeletons."
      : websiteSurfaceMode === "content-hub-site"
        ? "- homepage_archetype_contract: content hub home must use editorial/institutional collection-index geometry with archive masthead, shelves, ledgers, and resource rows. Do not reuse corporate or docs homepage skeletons."
        : "",
    enterpriseHomepage
      ? "- buyer_signals_mode: compact proof row only; do not render a second hero, large snapshot panel, or aside rail."
      : "- buyer_signals_mode: supporting proof/capability band.",
    enterpriseHomepage
      ? "- homepage_media_rule: the primary stock/library image belongs inside the opening hero as a background-supported visual layer with readable overlay copy; do not push the first meaningful image below the opening band."
      : websiteSurfaceMode === "docs-knowledge-site"
        ? "- homepage_media_rule: docs homepage media should support wayfinding or reference context inside docs modules; do not place a generic image/card as a right-side hero panel."
        : websiteSurfaceMode === "content-hub-site"
          ? "- homepage_media_rule: content-hub homepage media should support archive, research, or resource context inside collection modules; do not place a generic image/card as a right-side hero panel."
          : "- homepage_media_rule: media belongs to a supporting band, not a hard-inserted generic hero panel.",
    enterpriseHomepage
      ? "- homepage_media_source_validation: a real stock/library photo is required for the primary hero visual when available; inline SVG or abstract placeholder media is not acceptable."
      : "- homepage_media_source_validation: prefer real stock/library imagery when available; avoid abstract placeholder media for key supporting slots.",
    enterpriseHomepage
      ? "- homepage_hero_markup_rule: render a real img/picture node inside the opening hero media slot; do not rely on a CSS-only background-image as the sole hero visual when a real asset is available, and do not emit enterprise-hero-visual, media-panel, visual-content, visual-note, or any text-only pseudo-image box."
      : "- homepage_hero_markup_rule: when the route calls for hero media, render a real image node or background image rather than a text-only placeholder box.",
    enterpriseHomepage
      ? "- homepage_markup_contract: prefer `enterprise-hero` / `enterprise-hero__media` / `enterprise-hero__content` style class semantics. Do not reuse legacy `hero-grid`, `hero__grid`, `hero-panel`, `media-frame`, or `aside`-rail naming for the opening hero."
      : "",
    enterpriseHomepage
      ? "- homepage_css_contract: styles.css must style the opening hero through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row`. Do not rely on generic `.hero-grid`, `.hero-copy`, `.hero-panel`, or `.media-frame` selectors for the homepage opening."
      : "",
    enterpriseHomepage
      ? "- homepage_css_overlay_contract: the homepage opening must behave like one image-backed hero surface. `.enterprise-hero__media` should fill the hero container as the underlying media layer, and `.enterprise-hero__content` should sit above it as overlay copy rather than as a separate split-panel card."
      : "",
    enterpriseHomepage
      ? "- homepage_css_overlay_contract: do not implement the opening hero with explicit two-column `grid-template-columns` splits, and do not assign `.enterprise-hero__content` its own opaque/gradient card background, card shadow, or separate panel surface."
      : "",
    enterpriseHomepage
      ? "- homepage_heading_contract: the homepage may contain exactly one H1, and it must appear inside `.enterprise-hero__content`. The following capability band must use H2/section-title semantics instead of a second hero-scale H1."
      : "",
    enterpriseHomepage
      ? "- homepage_spacing_contract: keep the opening hero visually close to the shared header, but allow a measured 20-36px shell transition so the masthead does not feel cramped. Do not combine a large `.main-inner` top padding with a full first-section top padding that creates an empty band before the hero."
      : "",
    enterpriseHomepage
      ? "- homepage_spacing_contract: styles.css should express a controlled enterprise shell rhythm; major homepage section spacing should usually stay in roughly the 40-72px range, while proof rows, capability-card groups, CTA actions, and nested support clusters should usually stay in roughly the 28-44px range instead of collapsing into overly tight spacing."
      : "",
    enterpriseHomepage
      ? "- homepage_header_rule: keep locale controls outside the primary nav link stream, inside one dedicated adjacent utility shell only; do not duplicate locale controls across nav and utility wrappers."
      : "",
    enterpriseHomepage
      ? "- homepage_capability_rule: render the homepage capability zone as one unified capability band with a heading block plus a capability grid/list. Do not use `content-band--split`, `split-grid`, `detail`, `proof-rail`, or a right-column `aside` for that zone."
      : "",
    enterpriseHomepage
      ? "- homepage_cta_rule: keep the CTA zone single-primary-block; avoid a second bordered side panel with inquiry instructions or support notes."
      : "- homepage_cta_rule: prefer a primary CTA block with only compact supporting notes.",
    "",
    "## 5. Route Map",
    ...routeLines,
    "",
    "## 6. Route Specifications",
    ...routeSections,
    "",
    "## 7. Media Resource List",
    ...mediaResources,
  ]
    .filter(Boolean)
    .join("\n");
}
