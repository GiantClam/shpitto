import type { DesignSkillHit } from "../agent/website-workflow.ts";
import type { LocalDecisionPlan, PageBlueprint } from "./decision-layer.ts";
import type { DesignStylePreset } from "../design-style-preset.ts";
import { selectCuratedLibraryImage } from "./curated-media-library.ts";
import { isBilingualRequirementText } from "./bilingual-copy-guard.ts";
import type { WebsiteDiscoveryBrief, WebsiteSurfaceMode } from "./open-design-adoption.ts";
import { selectWebsiteGenerationTypeSkill } from "./website-type-selector.ts";
import { buildLocalePlan, I18N_LOCALE_REGISTRY_PATH } from "./locale-plan.ts";
import {
  renderWebsiteArtifactGeneratorContract,
  resolveWebsiteArtifactGeneratorMode,
  type WebsiteArtifactGeneratorMode,
} from "./website-artifact-generator.ts";
import {
  mediaPlanLinesFromResource,
  mediaResourceContractLines,
  mediaResourceMarkdownSection,
  type WebsiteMediaResource,
} from "./website-media-plan.ts";

type WebsiteDesignSpecParams = {
  decision: LocalDecisionPlan;
  requirementText: string;
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
  siteGeneratorMode?: WebsiteArtifactGeneratorMode;
  selectedSeedSkillIds?: string[];
};

type DesignSpecLocaleMode = "zh-CN" | "en" | "bilingual" | "multilingual";

export type RouteUnitContractSummary = {
  route: string;
  navLabel: string;
  pageKind: string;
  routeContract: string[];
  inheritedTerminology: string[];
  inheritedTokens: string[];
  inheritedSeedSkillIds: string[];
  openingFamily: string;
  openingTopology: string;
  mediaPlan: string[];
  mediaResources: WebsiteMediaResource[];
};

function humanizeBlogDetailSlug(route: string): string {
  const slug = String(route || "")
    .trim()
    .replace(/^\/blog\//i, "")
    .replace(/\/+$/g, "");
  const title = slug
    .split(/[-_]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return title || "Article";
}

function buildSyntheticBlogDetailPage(route: string): PageBlueprint {
  const normalizedRoute = String(route || "").trim() || "/";
  const title = humanizeBlogDetailSlug(normalizedRoute);
  return {
    route: normalizedRoute,
    navLabel: title,
    purpose: `Publishable article detail page for ${title}.`,
    source: "default",
    pageKind: "intent",
    responsibility: `Article detail page for ${title}.`,
    contentSkeleton: ["Article hero", "Argument section", "Evidence section", "Conclusion / next action"],
    componentMix: { hero: 8, feature: 8, grid: 0, proof: 18, form: 0, cta: 6 },
    constraints: [
      "This route is a blog/article detail destination, not a homepage or collection index.",
      "Keep the page topic-specific to the linked article slug and preserve shared shell continuity.",
    ],
  };
}

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
  const surfaceMode = resolveWebsiteSurfaceMode(params);
  const surfaceTokenLines = buildSurfaceTokenContractLines(params, surfaceMode)
    .filter((line) => /surface_(?:css|typography)_tokens/i.test(line))
    .map((line) => line.replace(/^-\s*/, "").trim());
  return Array.from(
    new Set(
      [
        ...surfaceTokenLines,
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
  if (page.pageKind === "blog-data-index" || page.pageKind === "content-collection-index") return true;
  const text = [
    page.route,
    page.navLabel,
    page.purpose,
    page.responsibility,
    ...(page.contentSkeleton || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /research|standards?|information(?:-platform)?|resource|resources|downloads?|library|documents?|publications?|reports?|knowledge-hub/i.test(
    text,
  );
}

function isPortfolioBlogInteriorSurface(page: PageBlueprint, surfaceMode: WebsiteSurfaceMode): boolean {
  if (surfaceMode !== "portfolio-blog-site") return false;
  const route = String(page.route || "").trim().toLowerCase();
  if (route === "/" || /^\/blog\/[^/]+$/i.test(route)) return false;
  return route === "/blog" || route === "/about" || route === "/contact";
}

function isInformationPlatformCollectionPage(page: PageBlueprint): boolean {
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  return /information-platform|information|resource|resources|downloads?|library|materials?/i.test(text);
}

function isResearchCollectionPage(page: PageBlueprint): boolean {
  if (isInformationPlatformCollectionPage(page)) return false;
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  return /research|standards?|documents?|publications?|reports?/i.test(text);
}

function hasExplicitChineseLocaleContract(text: string): boolean {
  return /(?:final website locale requirement|requested site locale|language|locale)\s*:\s*chinese\b(?!\s*(?:and\b|\/|,|&|-first\b|first\b|bilingual\b|multilingual\b))|single-language chinese-first|chinese-only|keep all visible copy in chinese|keep the site in chinese|locale contract:\s*this site is single-language chinese-first/i.test(
    String(text || ""),
  );
}

function hasExplicitEnglishLocaleContract(text: string): boolean {
  return /(?:final website locale requirement|requested site locale|language|locale)\s*:\s*english\b(?!\s*(?:and\b|\/|,|&|-first\b|first\b|bilingual\b|multilingual\b))|single-language english-first|english-only|keep all visible copy in english|keep the site in english|locale contract:\s*this site is single-language english-first/i.test(
    String(text || ""),
  );
}

function hasExplicitBilingualLocaleContract(text: string): boolean {
  return /(?:final website locale requirement|requested site locale|language|locale)\s*:\s*(?:chinese-first\s+|english-first\s+)?bilingual\b|(?:final website locale requirement|requested site locale|language|locale)\s*:\s*(?:chinese|english)\s+(?:and|&)\s+(?:english|chinese)\b|bilingual output must be locale-switchable|keep one locale visible at a time/i.test(
    String(text || ""),
  );
}

function requirementNeedsConsultationForm(text: string): boolean {
  return /(?:consultation|intake|clarification|contact|inquiry)\s+form|form\s+with\s+name,\s*organization,\s*email,\s*topic,\s*and\s*message|咨询(?:表单|收集|入口|需求)|咨询.*(?:姓名|机构|单位|邮箱|主题|留言)|customer_inquiry_form|contact_form/i.test(
    String(text || ""),
  );
}

function extractExplicitConsultationFormHostHints(requirementText: string): Array<{ route?: string; pattern?: RegExp }> {
  const text = String(requirementText || "").trim().toLowerCase();
  if (!text) return [];
  const hints: Array<{ route?: string; pattern?: RegExp }> = [];
  const hasHomeOrInfoHost =
    /(?:homepage|home page|route\s*\/|route \/|首页|主页).{0,40}(?:or|and|或|及).{0,40}(?:information platform|resource index|materials directory|information|资料平台|信息平台|资源索引)/i.test(
      text,
    ) ||
    /(?:information platform|resource index|materials directory|information|资料平台|信息平台|资源索引).{0,40}(?:or|and|或|及).{0,40}(?:homepage|home page|route\s*\/|route \/|首页|主页)/i.test(
      text,
    );
  if (hasHomeOrInfoHost) {
    hints.push({ route: "/" });
    hints.push({ pattern: /(?:information-platform|information|resource|resources|materials|downloads?|library|support|help)/i });
  }
  return hints;
}

function routeShouldHostConsultationForm(page: PageBlueprint, requirementText = ""): boolean {
  const route = String(page.route || "").trim().toLowerCase();
  const text = `${route} ${String(page.navLabel || "").trim().toLowerCase()}`;
  const explicitHints = extractExplicitConsultationFormHostHints(requirementText);
  if (explicitHints.length > 0) {
    return explicitHints.some((hint) => {
      if (hint.route && route === hint.route) return true;
      if (hint.pattern && hint.pattern.test(text)) return true;
      return false;
    });
  }
  if (/(?:^|\/)(contact|inquiry|get-in-touch)(?:\/|$)|\bcontact\b|\binquiry\b/i.test(text)) return true;
  if (/(?:information-platform|information|resource|resources|downloads?|support|help|library)/i.test(text)) return true;
  return route === "/";
}

function resolveDesignSpecLocaleMode(params: WebsiteDesignSpecParams): DesignSpecLocaleMode {
  const localePlan = buildLocalePlan(params.requirementText, params.decision.locale);
  if (localePlan.mode === "multilingual") return "multilingual";
  if (hasExplicitChineseLocaleContract(params.requirementText)) return "zh-CN";
  if (hasExplicitEnglishLocaleContract(params.requirementText)) return "en";
  if (localePlan.mode === "bilingual" || hasExplicitBilingualLocaleContract(params.requirementText) || isBilingualRequirementText(params.requirementText)) {
    return "bilingual";
  }
  if (params.decision.locale === "zh-CN") return "zh-CN";
  if (params.decision.locale === "en") return "en";
  return "en";
}

function buildLocaleShellContractLines(localeMode: DesignSpecLocaleMode, requirementText = ""): string[] {
  const localePlan = buildLocalePlan(requirementText, localeMode === "zh-CN" || localeMode === "en" ? localeMode : undefined);
  if (localeMode === "multilingual") {
    return [
      "- header_contract: multilingual sites must keep locale controls in one dedicated utility wrapper beside the primary nav, not inside `<nav>`, and that utility wrapper must not be left empty.",
      "- header_contract: when the locale set is larger than EN/ZH, prefer a compact selector/menu pattern over a long row of locale pills in the header.",
      `- i18n_contract: route HTML should rely on stable \`data-i18n\` keys plus \`${I18N_LOCALE_REGISTRY_PATH}\` and a source catalog such as \`${localePlan.sourceCatalogPath}\`. Do not emit one HTML route tree per locale or duplicate visible copy for every locale in the initial page render.`,
      "- translation_contract: non-default locale dictionaries belong to the translation pipeline and should be generated from the source catalog without regenerating layout, route HTML, or article structure.",
    ];
  }
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
  if (localeMode === "multilingual") return "Translation-driven multilingual shell with one default visible locale, a locale registry, and source-catalog-first message generation";
  if (localeMode === "bilingual") return "Bilingual with the prompt-defined default visible locale and i18n resources for the inactive locale";
  if (localeMode === "zh-CN") return "Chinese-first single-language shell";
  return "English-first single-language shell";
}

function buildShellLocaleLines(localeMode: DesignSpecLocaleMode, requirementText = ""): string[] {
  const localePlan = buildLocalePlan(requirementText, localeMode === "zh-CN" || localeMode === "en" ? localeMode : undefined);
  if (localeMode === "multilingual") {
    return [
      "- header_utility_rule: render locale/language controls in a dedicated utility shell adjacent to navigation, not inside the primary nav link stream.",
      "- header_utility_rule: for multi-locale sites, use one compact selector/menu in that utility shell instead of a long run of locale buttons when the locale count grows beyond two.",
      `- header_utility_rule: the locale shell may stay hidden in the first pass if only the source catalog \`${localePlan.sourceCatalogPath}\` exists and translated non-default locale dictionaries have not been generated yet.`,
    ];
  }
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

function isInstitutionalChildFriendlyContentHubSurface(
  params: WebsiteDesignSpecParams,
  surfaceMode = resolveWebsiteSurfaceMode(params),
): boolean {
  if (surfaceMode !== "content-hub-site") return false;
  const text = [
    params.requirementText,
    params.designHit?.id,
    params.designHit?.name,
    params.designHit?.design_desc,
    params.designSystemId,
    params.designSystemName,
    params.discoveryBrief?.visualDirectionId,
    params.discoveryBrief?.primaryGoal,
    ...(params.discoveryBrief?.audience || []),
  ]
    .filter(Boolean)
    .join(" ");
  const childFriendly = /\b(child(?:-|\s)?friendly|children|kids?|education|校园|儿童|亲子|幼儿)\b/i.test(text);
  const institutional = /\b(institutional|standards?|research|resource|library|advocacy|certification|平台|标准|研究|机构)\b/i.test(
    text,
  );
  const greenLocked =
    /#2e8b57|#f59e0b|institutional-child-friendly|ecological green|warm orange/i.test(text) ||
    normalizeStyleToken(params.stylePreset.colors.primary) === normalizeStyleToken("#2E8B57");
  return childFriendly && institutional && greenLocked;
}

function buildSurfaceTokenContractLines(params: WebsiteDesignSpecParams, surfaceMode: WebsiteSurfaceMode): string[] {
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
    if (isInstitutionalChildFriendlyContentHubSurface(params, surfaceMode)) {
      return [
        ...shared,
        "- surface_css_tokens: --bg #F6FBF6; --surface #FFFFFF; --panel #F3FAF1; --text #193329; --muted #4B6657; --border #CFE3D3; --primary #2E8B57; --accent #F59E0B.",
        '- surface_typography_tokens: warm institutional sans such as Inter, Noto Sans SC, or IBM Plex Sans with crisp display sizing; avoid serif-forward archive typography and heavy enterprise-industrial chrome.',
      ];
    }
    return [
      ...shared,
      "- surface_css_tokens: --bg #F5EFE6; --surface #FFF9EF; --panel #FFFFFF; --text #261A13; --muted #6F5B4B; --border #D8C6AD; --primary #7A3524; --accent #B6813B.",
      "- surface_typography_tokens: editorial or institutional serif-forward pairing such as Georgia/Source Serif with a restrained sans; avoid docs-style monospace and corporate dark enterprise dominance.",
    ];
  }
  if (surfaceMode === "portfolio-blog-site") {
    return [
      ...shared,
      "- surface_css_tokens: --bg #F4EFE7; --surface #FFFDF9; --panel #FFFFFF; --text #1F1A17; --muted #625650; --border #D8CDC1; --primary #1E6B8F; --accent #C86B3C.",
      "- surface_typography_tokens: editorial long-form pairing such as Source Serif, Charter, or Georgia with a restrained sans for UI chrome; prioritize readable article rhythm over enterprise density or docs monospace dominance.",
    ];
  }
  return [
    ...shared,
    "- surface_css_tokens: choose a palette that is visibly distinct from the default green-white card theme and appropriate for the selected website surface.",
  ];
}

function buildSurfaceVisualIdentityLines(params: WebsiteDesignSpecParams, surfaceMode: WebsiteSurfaceMode): string[] {
  const shared = [
    "- surface_visual_identity: this surface must have a distinct aesthetic, layout rhythm, and module vocabulary for its website type. Do not reuse the same green/white rounded-card system across corporate, docs, and content-hub sites.",
    "- surface_copy_exclusion: never render internal layout or QA labels such as `Responsive layout`, `Shared shell`, `Desktop and mobile review`, `homepage groups`, `homepage frames`, or `visual system keeps` in visitor-facing copy. Replace them with subject-specific content, proof, reference topics, resource categories, or visitor outcomes.",
    ...buildSurfaceTokenContractLines(params, surfaceMode),
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
    if (isInstitutionalChildFriendlyContentHubSurface(params, surfaceMode)) {
      return [
        ...shared,
        "- surface_aesthetic: child-friendly institutional guidance, ecological green trust cues, and warm learning-oriented accents. Prefer bright natural surfaces, credible education/research photography, and approachable institutional polish instead of terracotta archive mood or factory styling.",
        "- surface_layout_rhythm: brand-led institutional masthead, route-owned process/research/standards bands, scoring or roadmap proof rows, and image-backed evidence modules should define the cadence instead of repeated archive mastheads or generic hero-card-CTA loops.",
        "- surface_module_vocabulary: use institutional-masthead, capability-shelf, process-lead, framework-grid, scorecard-band, research-proof, standards-library, and consultation-host modules. Avoid collection-home repetition, archive-only chrome, and identical kicker-title-lead openings across routes.",
      ];
    }
    return [
      ...shared,
      "- surface_aesthetic: editorial/institutional archive, standards library, or research desk. Prefer serif-forward or publication-like typography with paper/ink/terracotta/olive or another distinct archive palette rather than corporate/docs green-white cards.",
      "- surface_layout_rhythm: collection shelves, ledger rows, archive grids, research cards, resource indexes, and dense onward navigation should carry the experience instead of product proof bands or documentation code panels.",
      "- surface_module_vocabulary: use collection-home, standards-ledger, research-index, resource-shelf, download-row, issue-map, and institutional-context modules. Avoid corporate sales modules and docs workspace chrome as the dominant template.",
    ];
  }
  if (surfaceMode === "portfolio-blog-site") {
    return [
      ...shared,
      "- surface_aesthetic: editorial technical journal or operator portfolio. Prefer paper/ink/copper/slate or another publication-led palette with long-form readability, measured contrast, and an intentional personal point of view rather than corporate dark enterprise chrome or docs workspace UI.",
      "- surface_layout_rhythm: profile-led masthead, expertise or editorial-pillars band, article cards, essay leads, and concise contact strips should define the cadence instead of enterprise proof bands, docs rails, or institutional shelves.",
      "- surface_module_vocabulary: use profile-masthead, editorial-pillar-grid, article-ledger, writing-spotlight, article-meta, and operator-proof modules. Avoid generic hero/card/CTA loops and avoid collection-home or enterprise-masthead semantics as the dominant pattern.",
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

function routePageArchetype(page: PageBlueprint, surfaceMode: WebsiteSurfaceMode): string {
  if (page.route === "/") {
    if (surfaceMode === "docs-knowledge-site") return "home/docs-reference: establish the reference workspace, search/index path, and primary guide destinations.";
    if (surfaceMode === "content-hub-site") return "home/content-hub: establish institution or editorial scope before resource shelves and collection rows.";
    if (surfaceMode === "portfolio-blog-site") return "home/profile-editorial: establish the named operator or publication identity before article/archive mechanics.";
    return "home/identity: establish brand, audience, offer, and primary visitor path before proof or CTA modules.";
  }
  if (isContentCollectionPage(page)) return "content-collection: organize resources, articles, standards, or knowledge items with route-specific context and discovery aids.";

  const text = `${page.route} ${page.navLabel} ${page.purpose} ${page.responsibility}`.toLowerCase();
  if (/docs?|documentation|guide|manual|reference|api|handbook|playbook|faq|tutorial/.test(text)) {
    return "docs-reference: prioritize wayfinding, usage context, and readable reference groupings over campaign copy.";
  }
  if (/products?|catalog|collection/.test(text)) {
    return "products-catalog: support comparison, specification, assortment, or buyer decision logic.";
  }
  if (/solutions?|services?|custom-solutions?/.test(text)) {
    return "solutions-services: explain scenario fit, process, operating model, and engagement path.";
  }
  if (/cases?|portfolio|projects?/.test(text)) {
    return "cases-proof: show evidence, scenario context, outcomes, and credible proof structure.";
  }
  if (/about|company|team|profile/.test(text)) {
    return "about-identity: build trust through organization, operating model, credentials, process, or person profile.";
  }
  if (/contact|inquiry|get-in-touch/.test(text)) {
    return "contact-conversion: clarify channels, response expectations, required inputs, and next step after outreach.";
  }
  if (/blog|article|writing|editorial|journal|insight/.test(text)) {
    return "blog-editorial: foreground writing value, topic scope, article access, and editorial credibility.";
  }
  return "route-owned: derive a route-specific visitor job from the confirmed brief and avoid generic hero-card-CTA repetition.";
}

function isInstitutionLedContentHubHomepage(page: PageBlueprint, surfaceMode: WebsiteSurfaceMode): boolean {
  if (surfaceMode !== "content-hub-site" || page.route !== "/") return false;
  const text = [page.purpose, page.responsibility, ...(page.contentSkeleton || []), page.source]
    .filter(Boolean)
    .join(" ");
  return /official homepage overview|official-homepage identity|official homepage|institutional overview|brand overview|umbrella/i.test(
    text,
  );
}

function routeOpeningTopology(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string {
  if (/^\/blog\/[^/]+$/i.test(String(page.route || "").trim())) {
    return "article lead band -> argument section -> evidence section -> conclusion / related reading";
  }
  if (page.route === "/") {
    if (enterpriseHomepage || surfaceMode === "corporate-b2b-site") {
      return "image-backed enterprise hero -> compact proof row -> unified capability band -> concise CTA strip";
    }
    if (surfaceMode === "docs-knowledge-site") {
      return "docs workspace masthead -> search/index rail -> quickstart strip -> reference matrix -> compact support CTA";
    }
    if (surfaceMode === "portfolio-blog-site") {
      return "profile-led editorial masthead -> expertise/pillars band -> selected writing or proof band -> concise contact CTA";
    }
    if (surfaceMode === "content-hub-site") {
      if (isInstitutionLedContentHubHomepage(page, surfaceMode)) {
        return "brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA";
      }
      return "editorial archive masthead -> collection shelves -> resource ledger -> institutional CTA";
    }
    return "single-column homepage hero -> proof band -> capability/CTA";
  }
  if (isContentCollectionPage(page)) {
    if (surfaceMode === "portfolio-blog-site" && String(page.route || "").trim().toLowerCase() === "/blog") {
      return "editorial archive masthead -> featured writing band -> article ledger";
    }
    if (isInformationPlatformCollectionPage(page)) {
      return "information-platform lead -> collection navigator -> standards/research/update ledgers";
    }
    if (isResearchCollectionPage(page)) {
      return "research index lead -> topic navigator -> publication/evidence ledger";
    }
    return "knowledge-hub lead band -> collection navigator -> resource/result stack";
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  if (/(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(page.route) || /\bcreation\b/.test(text)) {
    return "creation masthead -> narrative framework grid -> proof/CTA";
  }
  if (/(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(page.route) || /\bconstruction\b/.test(text)) {
    return "process lead band -> execution roadmap -> implementation proof row";
  }
  if (/(?:^|\/)(?:casux-)?certification(?:\/|$)/i.test(page.route) || /\bcertification\b/.test(text)) {
    return "certification criteria lead -> scoring/results ledger -> review-prep and consultation band";
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

function buildRouteMediaResource(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): WebsiteMediaResource {
  const resourceId = page.route === "/" ? "home-hero-01" : normalizeStyleToken(`${page.route}-media-01`);
  if (page.route === "/") {
    if (enterpriseHomepage || surfaceMode === "corporate-b2b-site") {
      return {
        resourceId,
        route: page.route,
        slotOwner: "opening-hero-background",
        imagePurpose:
          "procurement-confidence environmental cue that reinforces product, capability, or operating trust behind the enterprise masthead",
        placementBand: "inside the opening hero as a background-supported visual layer behind copy",
        preferredRatio: "21:9 cinematic landscape or 16:9 wide landscape with strong subject readability",
        displayMode:
          "image-backed enterprise hero with overlay copy; the image should carry the majority of first-screen visual weight, with no empty side rail, detached proof image, or hard-inserted width:100% inline image",
        sourcePriority: "curated stock/library first",
        mediaSourceRule:
          "when stock/library imagery is available, use a real photographic asset; do not use inline SVG, abstract illustration, or data-URI placeholder media for the primary hero visual",
      };
    }
    if (surfaceMode === "docs-knowledge-site") {
      return {
        resourceId,
        route: page.route,
        slotOwner: "docs-reference-workspace",
        imagePurpose:
          "compact product/reference context such as search, API surface, version cues, or implementation examples; it should support wayfinding rather than act as a campaign hero",
        placementBand:
          "inside a docs workspace panel, quickstart/reference strip, or index rail adjacent to the opening; do not make it a full-bleed hero background",
        preferredRatio: "16:10, 4:3, or disciplined code/reference panel",
        displayMode: "compact reference surface, search/index module, or code/reference panel with readable labels",
      };
    }
    if (surfaceMode === "content-hub-site") {
      return {
        resourceId,
        route: page.route,
        slotOwner: "archive-context-surface",
        imagePurpose:
          "institutional, research, standards, or collection context that supports the archive/index surface without dominating it like a campaign hero",
        placementBand:
          "within an archive masthead, collection shelf, resource ledger, or institutional context band; do not use a docs code panel or enterprise hero background",
        preferredRatio: "4:3, 3:2, or disciplined publication thumbnail",
        displayMode: "editorial/institutional support visual, document cover cluster, ledger thumbnail, or collection-context panel",
      };
    }
    return {
      resourceId,
      route: page.route,
      slotOwner: "homepage-supporting-band",
      imagePurpose: "brand/product context",
      placementBand: "supporting band after the opening section",
      preferredRatio: "landscape",
      displayMode: "contained supporting media",
    };
  }
  if (isContentCollectionPage(page)) {
    return {
      resourceId,
      route: page.route,
      slotOwner: "knowledge-hub supporting proof slot",
      imagePurpose:
        "institutional, research, standards, policy, or documentation context that helps visitors understand the collection surface without implying publishable editorial archive semantics",
      placementBand:
        "supporting proof band adjacent to the collection navigator or result stack; do not force a product-catalog hero image treatment",
      preferredRatio: "16:9, 4:3, or disciplined landscape",
    };
  }
  if (/^\/blog\/[^/]+$/i.test(String(page.route || "").trim())) {
    return {
      resourceId,
      route: page.route,
      slotOwner: "article-supporting-proof slot",
      imagePurpose: "article-specific contextual proof, operator scene, or subject-supporting visual that reinforces the main argument",
      placementBand:
        "inside the article lead band or the first evidence section; support the article body without turning the page back into a collection index",
      preferredRatio: "16:9, 4:3, or disciplined landscape",
    };
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  if (/products?|catalog|collection/.test(text)) {
    return {
      resourceId,
      route: page.route,
      slotOwner: "catalog-lead proof slot",
      imagePurpose: "product-family, material, texture, or folded-pack proof that helps buyers understand assortment immediately",
      placementBand:
        "inside the opening catalog lead or the immediately following assortment/specification proof band; the first meaningful product image must appear in the opening zone or the first opening-adjacent proof row",
      preferredRatio: "4:3, 5:4, or square",
    };
  }
  if (/solutions?|services?|custom-solutions?/.test(text)) {
    return {
      resourceId,
      route: page.route,
      slotOwner: "process-intro proof slot",
      imagePurpose: "environment, process, delivery, or collaboration-context proof that makes the solution path legible at first glance",
      placementBand:
        "inside the opening process intro or the immediately following process/capability band; the first meaningful image must appear in the opening zone or first opening-adjacent proof row",
      preferredRatio: "16:9, 5:3, or disciplined landscape",
    };
  }
  if (/cases?|portfolio|projects?/.test(text)) {
    return {
      resourceId,
      route: page.route,
      slotOwner: "evidence-header proof slot",
      imagePurpose: "application, scenario, or result proof that makes the case outcome concrete before deeper reading",
      placementBand:
        "inside the opening evidence header or the immediately following case evidence/outcome strip; the first meaningful case image must appear in the opening zone or first opening-adjacent proof row",
      preferredRatio: "16:9, 4:3, or square",
    };
  }
  return {
    resourceId,
    route: page.route,
    slotOwner: "supporting content band",
    imagePurpose: "route-specific contextual proof",
    placementBand: "supporting band, never hard-inserted into the opening by default",
    preferredRatio: "contextual",
  };
}

function routeMediaPlan(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  return mediaPlanLinesFromResource(buildRouteMediaResource(page, enterpriseHomepage, surfaceMode));
}

export function buildRouteUnitContractSummary(
  params: WebsiteDesignSpecParams,
  route: string,
): RouteUnitContractSummary | undefined {
  const websiteSurfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    websiteSurfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  const normalizedRoute = String(route || "/").trim() || "/";
  const page =
    params.decision.pageBlueprints.find((item) => item.route === normalizedRoute) ||
    (/^\/blog\/[^/]+$/i.test(normalizedRoute) ? buildSyntheticBlogDetailPage(normalizedRoute) : undefined) ||
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
      `seedAuthority=${resolveSeedAuthorityMode(params)}`,
      ...buildRouteUnitContractHighlights(page),
    ],
    inheritedTerminology: summarizeInheritedTerminology(params),
    inheritedTokens: summarizeInheritedTokens(params),
    inheritedSeedSkillIds: params.selectedSeedSkillIds || [],
    openingFamily: routeOpeningFamily(page),
    openingTopology,
    mediaPlan: routeMediaPlan(page, enterpriseHomepage, websiteSurfaceMode),
    mediaResources: [buildRouteMediaResource(page, enterpriseHomepage, websiteSurfaceMode)],
  };
}

function buildRouteUnitContractHighlights(page: PageBlueprint): string[] {
  if (!isContentCollectionPage(page)) return [];
  const classHints = isInformationPlatformCollectionPage(page)
    ? "routeOwnedOpening=information-platform-lead | resource-collection-lead | knowledge-hub-lead"
    : isResearchCollectionPage(page)
      ? "routeOwnedOpening=research-index-lead | knowledge-hub-lead | resource-collection-lead"
      : "routeOwnedOpening=knowledge-hub-lead | resource-collection-lead | collection-lead";
  const highlights = [
    classHints,
    `openingRootClass=first visible <section> root must include ${classHints.split("=")[1]}`,
    "openingLayout=one route-owned collection/index surface with the navigator inside the opening band",
    "openingMarkup=no <aside> inside the opening band; supporting proof must stay embedded inside the same route-owned root surface",
    "openingBan=no hero, hero--split, hero-grid, hero__grid, hero-copy, hero-panel, hero-aside, right-rail aside, or promo split-hero masthead",
  ];
  if (isInformationPlatformCollectionPage(page)) {
    highlights.push("openingIdentity=public information library or materials directory, not an entry point or gateway explainer");
  }
  if (isResearchCollectionPage(page)) {
    highlights.push("openingIdentity=research or standards index, not a promotional hero or faux product catalog");
  }
  return highlights;
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
    if (isInstitutionLedContentHubHomepage(page, surfaceMode)) {
      return [
        "- prohibit: collapsing the homepage identity into a resource index, archive explanation, certification portal, download hub, or search-directory opener",
        "- prohibit: title/meta/H1/lead copy that lists downstream route families or operational functions as the homepage identity",
        "- prohibit: marketing hero utility geometry made from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, or a right-side visual rail",
        "- prohibit: collection shelves, ledgers, or resource rows taking over the first-screen homepage role before the institutional masthead establishes brand mission and scope",
      ];
    }
    return [
      "- prohibit: generic marketing homepage skeleton such as hero -> three feature cards -> proof strip -> CTA",
      "- prohibit: docs workspace chrome, code/reference panels, enterprise proof rows, and product-sales capability bands as the dominant homepage template",
      "- prohibit: using only generic classes such as `hero`, `hero-grid`, `card-grid`, `page-section`, or `section band` for the opening collection modules",
      "- prohibit: marketing hero utility geometry made from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, or a right-side visual rail",
    ];
  }
  if (page.route === "/" && surfaceMode === "portfolio-blog-site") {
    return [
      "- prohibit: generic marketing homepage skeleton such as hero -> three feature cards -> proof strip -> CTA",
      "- prohibit: enterprise proof-row cadence, docs workspace rails, or institutional archive shelves as the dominant homepage template",
      "- prohibit: turning the homepage into a bare article directory, reading-order explainer, or archive-count announcement before introducing the person behind the site",
      "- prohibit: using only generic classes such as `hero`, `hero-grid`, `card-grid`, `page-section`, or `section band` for the opening portfolio/blog modules",
      "- prohibit: low-information visual filler such as pale gradient rectangles, empty context cards, weak right rails, placeholder media boxes, or decorative featured-context panels with little or no real evidence",
    ];
  }
  if (isContentCollectionPage(page)) {
    if (surfaceMode === "portfolio-blog-site" && String(page.route || "").trim().toLowerCase() === "/blog") {
      return [
        "- prohibit: generic split-hero markup such as `hero-grid`, `hero__grid`, `hero-panel`, `hero-copy`, or a side-rail aside in the opening archive band",
        "- prohibit: turning the blog index into a route-order explainer, article-count note, or generic company summary before the writing itself",
        "- prohibit: reusing the same opening geometry as `/about` or `/contact`; the blog route must read as an editorial archive first",
        "- prohibit: giant text-only archive lead plus a low-information context box or empty visual rail; supporting archive panels must carry real writing or publication evidence",
      ];
    }
    return [
      "- prohibit: repeated homepage hero skeleton on every route",
      "- prohibit: turning a knowledge/resource collection into a faux product catalog or export-sales assortment page",
      "- prohibit: inventing publishable article detail pages or editorial archive promises unless the prompt explicitly requests them",
      "- prohibit: utility/language/documentation topics becoming the main body content",
      "- prohibit: opening the collection as `hero-copy` + `hero-aside`, `hero-panel` + quick-links rail, or another promotional split-hero masthead",
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
  requirementText = "",
): string[] {
  if (isContentCollectionPage(page)) {
    return [
      `- role: ${routeRoleSummary(page)}`,
      `- nav_label: ${page.navLabel}`,
      `- purpose: ${page.purpose}`,
      `- opening_topology: ${routeOpeningTopology(page, enterpriseHomepage, surfaceMode)}`,
      "- section_cadence: Knowledge-hub lead explaining how visitors should use the collection -> page-specific collection/index surface -> resource/result cards or rows -> contextual CTA or cross-navigation back into the core site",
      `- page_archetype: ${routePageArchetype(page, surfaceMode)}`,
      "- section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range, while nested resource cards, filter rows, metadata stacks, CTA action groups, and support clusters should still feel spacious in roughly the 28-44px range.",
      `- component_mix: hero ${page.componentMix.hero}, feature ${page.componentMix.feature}, grid ${page.componentMix.grid}, proof ${page.componentMix.proof}, form ${page.componentMix.form}, cta ${page.componentMix.cta}`,
      ...routeProhibitions(page, enterpriseHomepage, surfaceMode),
      "- markup_contract: the first visible content-index band should use route-owned knowledge-hub semantics such as `knowledge-hub-lead`, `resource-collection-lead`, `information-platform-lead`, or `research-index-lead` rather than product-catalog wrappers such as `catalog-lead` or `product-comparison-lead`.",
      "- opening_root_contract: the first visible `<section>` root must carry a route-owned collection class such as `knowledge-hub-lead`, `resource-collection-lead`, `information-platform-lead`, or `research-index-lead`.",
      "- markup_contract: do not wrap a content-collection opening in generic hero shells such as `hero`, `hero--split`, `hero-grid`, `hero__grid`, or `hero-panel`.",
      "- markup_contract: do not mix legacy hero utility classes such as `hero__content`, `hero__actions`, `hero-title`, or `hero-lead` into a route-owned collection opening. The opening lead itself must carry the route-owned collection semantics.",
      "- markup_contract: collection openings should name their copy clusters with route-owned classes such as `collection-title`, `collection-lead`, `collection-actions`, `knowledge-hub-title`, or `knowledge-hub-actions` instead of reusing legacy hero utility names.",
      "- layout_contract: keep the first visible collection band as one route-owned index surface. Fold navigator, category cues, scope notes, quick access, and supporting proof into that same opening band instead of splitting the opening into lead copy plus a right-rail aside panel.",
      "- opening_markup_contract: do not use `<aside>` inside the first visible collection band. Supporting proof must stay as embedded cards, inline media, or stacked companions within the same route-owned root surface.",
      ...buildLocaleShellContractLines(localeMode, requirementText),
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
  const consultationHostContract =
        requirementNeedsConsultationForm(requirementText) && routeShouldHostConsultationForm(page, requirementText)
      ? [
          "- conversion_contract: this route is an approved host for the required consultation intake. Materialize one real HTML `<form>` with name, organization/company, email, topic/subject, and message fields.",
          "- conversion_contract: search fields, filter rows, CTA-only action groups, and mailto links do not satisfy the consultation intake requirement on this route.",
        ]
      : [];
  const contentHubInteriorCopyContract =
    surfaceMode === "content-hub-site" && page.route !== "/"
      ? [
          "- copy_contract: interior content-hub routes must speak directly about standards coverage, research scope, resource categories, institutional governance, or implementation evidence. Do not explain how the page is organized, how visitors should read it, or what the route helps teams do.",
          "- copy_contract: reject self-descriptions such as `The page groups...`, `This route helps teams...`, `This page helps teams compare...`, or `How the collection is organized` in visible headings, leads, section intros, and CTA helper text.",
        ]
      : [];
  const portfolioBlogInteriorContract =
    isPortfolioBlogInteriorSurface(page, surfaceMode)
      ? [
          "- copy_contract: portfolio/blog interior routes must speak directly about writing themes, operator background, collaboration scope, response expectations, or article value. Do not reuse generic route-purpose filler or split-hero scaffolding text.",
          "- layout_contract: `/blog`, `/about`, and `/contact` must each use different opening geometry. Do not let those sibling routes share the same lead-copy plus aside/panel composition.",
          "- layout_contract: when an interior portfolio/blog route uses a two-column text/media composition, the media column must be a real paired companion with aligned top edge, shared row height logic, and enough visual area to balance the copy column. Do not place a small floating image tile beside a much taller text slab.",
        ]
      : [];
  const interiorMarkupContract =
    /(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(page.route) || /\bcreation\b/.test(routeText)
      ? [
          "- markup_contract: the first visible creation band should use route-owned class semantics such as `creation-masthead`, `narrative-lead`, or `content-architecture-intro` rather than a generic `detail-grid` with an `aside` surface.",
        ]
      : /(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(page.route) || /\bconstruction\b/.test(routeText)
        ? [
            "- markup_contract: the first visible construction band should use route-owned class semantics such as `process-lead`, `construction-intro`, or `execution-roadmap` rather than a generic `detail-grid` with an `aside` surface.",
          ]
        : /(?:^|\/)(?:casux-)?certification(?:\/|$)/i.test(page.route) || /\bcertification\b/.test(routeText)
          ? [
              "- markup_contract: the first visible certification band should use route-owned class semantics such as `certification-entry`, `criteria-ledger`, `scorecard-band`, `review-prep`, or `assessor-packet` rather than a generic `detail-grid` with an `aside` surface.",
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
      : surfaceMode === "portfolio-blog-site" && page.route === "/blog"
        ? [
            "- markup_contract: the first visible blog band should use route-owned editorial archive semantics such as `editorial-archive-masthead`, `writing-ledger-intro`, `featured-writing-band`, or `article-ledger` rather than a generic `route-hero`, `hero-grid`, `hero-copy`, `hero-panel`, or split-hero shell.",
            "- card_media_contract: `/blog` archive cards should prefer integrated image-text article cards or featured-writing cards when credible contextual imagery is available. Do not default to text-only cards if the route already reserves visual support space.",
          ]
        : surfaceMode === "portfolio-blog-site" && page.route === "/about"
          ? [
              "- markup_contract: the first visible about band should use route-owned profile semantics such as `operator-masthead`, `profile-timeline`, `credibility-ledger`, or `operator-proof` rather than a generic `route-hero`, `hero-grid`, `hero-copy`, `hero-panel`, or split-hero shell.",
            ]
          : surfaceMode === "portfolio-blog-site" && page.route === "/contact"
            ? [
                "- markup_contract: the first visible contact band should use route-owned conversion semantics such as `contact-conversion`, `contact-channels`, `response-expectation`, or `collaboration-intake` rather than a generic `route-hero`, `hero-grid`, `hero-copy`, `hero-panel`, or split-hero shell.",
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
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
        ? [
            "- surface_homepage_archetype: institution-led content hub homepage, not a pure collection index and not a marketing landing page.",
            "- geometry_contract: the content-hub homepage opening must establish the institution first through a brand-led masthead plus capability shelves. Do not let collection shelves, resource rows, archive explanations, or directory framing replace the homepage identity in the first screen.",
            "- geometry_contract: the institution-led homepage opening must not use a two-column split hero, equal-column copy/media pair, or right-side visual rail. Prefer a stacked or asymmetrical masthead where the institution-defining copy lands first and any visual support is subordinate.",
            "- markup_contract: the first visible content-hub homepage section should use route-owned institutional semantics such as `institutional-masthead`, `brand-overview`, `capability-shelf`, `standards-scope`, or `institutional-proof` instead of archive-index wrappers such as `collection-home`, `archive-masthead`, or `resource-index-head`.",
            "- markup_contract: do not lead the content-hub homepage with generic `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, `media-frame`, `proof-visual`, or campaign `page-section` shells as the dominant opening.",
            "- copy_contract: the title, meta description, H1, and first lead paragraph must establish the institution, audience, trust scope, and umbrella mission only. Keep certification, downloads, resource index, search, and route-family explanations out of those fields; defer them to later shelves, proof rows, nav, or CTA modules.",
            "- copy_contract: the homepage opening may mention the site's standards, research, advocacy, or information scope, but it must frame them as institutional capabilities or destinations rather than as the homepage's primary semantic role.",
            "- layout_contract: prefer a stacked or asymmetrical institutional masthead followed by capability shelves and standards/research proof. The homepage opening visual should sit below or behind the institutional masthead, not as a same-weight hero column beside the opening copy.",
          ]
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site"
        ? [
            "- surface_homepage_archetype: editorial/institutional collection index, not a marketing landing page or docs workspace.",
            "- geometry_contract: the content-hub homepage opening must not use marketing hero utility geometry composed from `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, an `aside`, panel, or right visual rail. Prefer an editorial/index geometry where the masthead, shelves, ledgers, and resource rows carry the opening instead of a right-side hero panel.",
            "- markup_contract: the first visible content-hub homepage section should use route-owned collection semantics such as `collection-home`, `archive-masthead`, `resource-shelf`, `standards-ledger`, `research-index`, `issue-map`, or `institutional-context`.",
            "- markup_contract: do not lead the content-hub homepage with generic `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, `card-grid`, or campaign `page-section` shells as the dominant opening.",
            "- layout_contract: content-hub density should come from shelves, ledgers, archive grids, topic navigation, and resource rows; avoid docs code panels, enterprise proof bands, and product-sales capability modules.",
          ]
        : page.route === "/" && !enterpriseHomepage && surfaceMode === "portfolio-blog-site"
          ? [
              "- surface_homepage_archetype: profile-led editorial homepage, not a marketing landing page, not a docs workspace, and not a bare archive index.",
              "- geometry_contract: the portfolio/blog homepage opening must establish the named operator first through a profile masthead plus expertise or editorial-pillars support. Do not let article-count notes, archive mechanics, or route-order explanations replace the homepage identity in the first screen.",
              "- markup_contract: the first visible portfolio/blog homepage section should use route-owned editorial semantics such as `profile-masthead`, `operator-overview`, `editorial-pillar-grid`, `writing-spotlight`, or `operator-proof` rather than enterprise, docs, or institutional wrappers.",
              "- layout_contract: portfolio/blog cadence should come from profile framing, article cards, editorial proof, and readable long-form support zones; avoid enterprise proof rows, docs rails, and archive-shelf-first homepage logic.",
              "- support_band_contract: when the homepage uses a companion visual/support panel, that panel must contain either a real operator/publication-context image or dense writing/proof substance. Do not ship decorative gradient placeholders, empty context cards, or weak right-side filler.",
              "- support_band_contract: when the homepage uses a left-right support band, the copy and media columns must read as one aligned pair. Match their top edge, keep the media at card/panel scale rather than thumbnail scale, and avoid a narrow floating image that visually detaches from the text column.",
              "- card_media_contract: featured writing, operator proof, and selected article shelves should prefer integrated image-text cards when credible contextual imagery is available rather than text-only cards plus a detached support image elsewhere on the page.",
            ]
        : [];
  const sectionCadence =
    page.route === "/" && !enterpriseHomepage && surfaceMode === "docs-knowledge-site"
      ? "documentation workspace lead -> search/index rail -> quickstart strip -> guide stack -> reference matrix -> compact support CTA"
      : page.route === "/blog" && surfaceMode === "portfolio-blog-site"
        ? "editorial archive masthead -> featured writing/image-text band -> article ledger with image-text cards -> concise archive CTA"
      : page.route === "/about" && surfaceMode === "portfolio-blog-site"
        ? "operator masthead -> credibility or timeline slab -> collaboration proof/CTA"
      : page.route === "/contact" && surfaceMode === "portfolio-blog-site"
        ? "contact conversion band -> channel matrix -> response expectation row"
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "portfolio-blog-site"
        ? "profile-led editorial masthead -> expertise or editorial-pillars band -> selected writing/proof band with aligned companion media -> concise contact CTA"
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
        ? "brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA"
      : page.route === "/" && !enterpriseHomepage && surfaceMode === "content-hub-site"
        ? "editorial archive masthead -> topic/collection shelves -> standards/research ledger -> resource index rows -> institutional CTA"
        : /(?:^|\/)(?:casux-)?certification(?:\/|$)/i.test(page.route) || /\bcertification\b/.test(routeText)
          ? "certification criteria lead -> score/results rows -> review-prep and assessor materials -> consultation CTA"
        : page.contentSkeleton.join(" -> ") || "derive from the route role without reusing a generic hero shell";
  return [
    `- role: ${routeRoleSummary(page)}`,
    `- nav_label: ${page.navLabel}`,
    `- purpose: ${page.purpose}`,
    `- opening_topology: ${routeOpeningTopology(page, enterpriseHomepage, surfaceMode)}`,
    `- section_cadence: ${sectionCadence}`,
    `- page_archetype: ${routePageArchetype(page, surfaceMode)}`,
    "- section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range, while nested proof rows, capability grids, card stacks, CTA action groups, and support clusters should still feel spacious in roughly the 28-44px range.",
    "- header_layout_contract: on desktop widths, keep the primary navigation in one compact row. Do not allow wrapped nav links before tightening labels, gap spacing, font sizing, or utility-shell width.",
    "- card_spacing_contract: visible cards, proof rows, resource rows, and CTA shells must keep consistent internal padding so copy does not visually crowd borders, corners, or action rows.",
    `- component_mix: hero ${page.componentMix.hero}, feature ${page.componentMix.feature}, grid ${page.componentMix.grid}, proof ${page.componentMix.proof}, form ${page.componentMix.form}, cta ${page.componentMix.cta}`,
    ...routeProhibitions(page, enterpriseHomepage, surfaceMode),
    ...consultationHostContract,
    ...contentHubInteriorCopyContract,
    ...portfolioBlogInteriorContract,
    ...surfaceHomepageContract,
    ...((/(?:^|\/)(?:casux-)?certification(?:\/|$)/i.test(page.route) || /\bcertification\b/.test(routeText))
      ? [
          "- copy_contract: certification routes must speak concretely about evaluation criteria, scoring dimensions, total-score thresholds, assessor/reviewer materials, evidence packets, or quality-mark/badge outcomes. Do not keep the route at the generic level of topic filters plus resource cards.",
          "- copy_contract: at least one opening/result band should name review logic directly, for example score criteria, assessment dimensions, threshold logic, assessor packet, reviewer checklist, certification badge, or quality-mark workflow.",
          "- copy_contract: when the source brief names certification-specific mechanics, preserve them as visitor-facing route substance rather than diluting them into generic standards or information-platform wording.",
        ]
      : []),
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
          ...buildLocaleShellContractLines(localeMode, requirementText),
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
          ...buildLocaleShellContractLines(localeMode, requirementText),
          "- cta_contract: section shells, opening grids, checklists, and support rows must use reusable classes rather than inline spacing/alignment styles.",
          "- copy_contract: route-opening leads, captions, and support lines must read like finished buyer-facing copy. Do not echo instruction-led verbs such as `should`, `must`, `use`, `explain`, or other contract wording in visible text.",
          "- caption_contract: visible route-opening captions must be buyer-facing and business-facing. They may describe material proof, application context, sourcing relevance, or delivery context, but they must not explain what the visual should do, what the layout is trying to prove, or what weaker visual treatment was avoided.",
          "- media_markup_contract: route-opening proof media must use reusable semantic classes rather than inline `style=` attributes on `<img>`, `<figure>`, or proof panels. Width, height, object-fit, max-width, and alignment belong in shared CSS classes.",
          "- layout_markup_contract: route openings and CTA bands must not rely on inline-styled `hero-title`, `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or `media-frame` blocks for spacing or sizing. Express these patterns through reusable route-owned classes in `/styles.css`.",
          "- layout_markup_contract: do not use generic `hero-actions` class names on interior openings, proof strips, or CTA bands. Use route-owned or shell-owned action classes instead.",
          "- layout_markup_contract: do not place inline `style=` attributes on `section__head`, `section-header`, or equivalent heading wrappers. Section-head spacing and alignment must be class-owned.",
          "- footer_markup_contract: footer support notes and action groups must use reusable footer classes. Do not use inline `margin-top` spacing fixes on `footer-notes`, helper paragraphs, or footer action wrappers.",
          ...(/(?:^|\/)(?:casux-)?creation(?:\/|$)|\bcreation\b/.test(routeText)
            ? [
                "- opening_media_contract: framework and creation routes must pair the opening masthead or the first opening-adjacent proof band with a real workshop, planning, or child-space context image. Do not leave the route opening text-only.",
                "- opening_markup_contract: creation/framework routes should foreground route-owned opening classes such as `framework-masthead`, `creation-lead`, or `principles-grid` rather than reusing a generic lead-band shell with swapped copy.",
              ]
            : /(?:^|\/)(?:casux-)?construction(?:\/|$)|\bconstruction\b/.test(routeText)
              ? [
                  "- opening_media_contract: process, implementation, or construction routes must include a real delivery, site, or execution-context image in the opening band or first proof row. Do not leave the route opening text-only.",
                  "- opening_markup_contract: process/implementation routes should foreground route-owned opening classes such as `process-intro`, `execution-roadmap`, or `implementation-lead` rather than reusing a generic lead-band shell with swapped copy.",
                ]
              : /(?:^|\/)(?:casux-)?advocacy(?:\/|$)|\badvocacy\b/.test(routeText)
                ? [
                    "- opening_media_contract: advocacy, alliance, outreach, or participation routes must include a real meeting, partnership, workshop, or community-context image in the opening band or first proof row. Do not leave the route opening text-only.",
                    "- opening_markup_contract: advocacy/participation routes should foreground route-owned opening classes such as `advocacy-lead`, `participation-network`, or `action-framework` rather than reusing a generic lead-band shell with swapped copy.",
                  ]
                : /research|information platform|resource|resources|library|standards|reports?|documents?/.test(routeText)
                  ? [
                      "- opening_media_contract: research, standards, information-platform, or resource routes must include a real institutional, reading, archive, or evidence-context image in the opening band or first proof row. Do not leave the route opening text-only.",
                    ]
                  : []),
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

function buildExpandedMediaResource(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): WebsiteMediaResource {
  const curatedImage = selectCuratedLibraryImage(page.route, page.evidence || page.purpose || "");
  const resource = buildRouteMediaResource(page, enterpriseHomepage, surfaceMode);
  const desktopImageArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "full-width hero background layer with a protected center-right focal zone, at least 680px visual depth behind the masthead, and enough visible subject area to dominate the first screen"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "compact docs/reference panel or search-index surface, roughly 420-560px wide, visually secondary to wayfinding clarity"
        : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
          ? "institutional context visual or standards/research proof panel, roughly 360-520px wide, visually secondary to the brand masthead and capability shelves"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "archive thumbnail, document-cover cluster, or institutional context panel, roughly 360-520px wide, visually secondary to collection shelves and ledgers"
      : /products?|catalog|collection/i.test(`${page.route} ${page.navLabel}`)
        ? "image-text product card or aligned proof panel, typically 520px max-width x 420px visual box within the opening or first proof/specification band"
        : /solutions?|services?|custom-solutions?/i.test(`${page.route} ${page.navLabel}`)
          ? "560px max-width x 340px visual box within the opening or first process/capability band"
          : /cases?|portfolio|projects?/i.test(`${page.route} ${page.navLabel}`)
            ? "560px max-width x 340px visual box within the opening or first evidence/outcome band"
            : "420px max-width visual box";
  const mobileImageArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "full-width hero background layer with copy-first overlay and a 420px minimum visible visual depth"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "full-width compact reference panel below the docs opening, capped around 260px height"
        : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
          ? "full-width institutional context image or proof panel below the masthead, capped around 260px height"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "full-width archive/resource thumbnail cluster below the collection masthead, capped around 260px height"
      : /products?|catalog|collection/i.test(`${page.route} ${page.navLabel}`)
        ? "full-width image-text product card media, usually capped around 260-320px height while keeping the text paired in the same card"
        : "full available shell width, max 280px height";
  const textCompanionArea =
    page.route === "/" && (enterpriseHomepage || surfaceMode === "corporate-b2b-site")
      ? "overlay content zone stays left/center-left, limited to roughly 35-45% of the visual emphasis, while the image remains the main first-screen attention anchor"
      : page.route === "/" && surfaceMode === "docs-knowledge-site"
        ? "docs opening copy should stay compact and pair with search/index/reference controls rather than overlaying a large hero image"
        : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
          ? "institutional opening copy should lead the first screen, while capability shelves and proof context support the masthead instead of replacing it with archive navigation"
        : page.route === "/" && surfaceMode === "content-hub-site"
          ? "collection opening copy should pair with shelves, ledgers, and topic navigation rather than overlaying a large hero image"
      : "preserve a readable adjacent text column; do not let the image consume the entire band";
  const visualBalance =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "docs homepage visuals should support wayfinding; search/index/reference content carries the primary first-screen emphasis"
      : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
        ? "content-hub homepage visuals should support institutional scope and proof; the brand masthead and capability overview carry the primary first-screen emphasis"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "content-hub homepage visuals should support collection context; shelves, ledgers, and topic navigation carry the primary first-screen emphasis"
        : "the image should carry roughly 55-65% of the first-screen visual emphasis while the overlay copy remains crisp and readable";
  const displayMode =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "compact docs workspace panel, reference matrix, or search/index support slot only; never a full-bleed campaign hero"
      : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
        ? "institutional proof panel, standards/research context visual, or capability-supporting media slot only; never a pure archive index thumbnail cluster or full-bleed campaign hero"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "archive/context panel, document-cover cluster, or ledger thumbnail system only; never a full-bleed campaign hero or docs code panel"
        : "image-backed hero or contained route-owned media slot only; never hard-insert as a generic full-width image outside its planned module";
  const captionPolicy =
    page.route === "/" && surfaceMode === "docs-knowledge-site"
      ? "visible docs visual labels may name APIs, versions, guides, or reference areas, but must not explain layout intent"
      : page.route === "/" && surfaceMode === "content-hub-site" && isInstitutionLedContentHubHomepage(page, surfaceMode)
        ? "visible hub visual labels may name institutional scope, standards coverage, research focus, or proof context, but must not explain layout intent or reframe the homepage as a resource directory"
      : page.route === "/" && surfaceMode === "content-hub-site"
        ? "visible hub visual labels may name standards, research scopes, resource categories, or institutional context, but must not explain layout intent"
        : "homepage hero visual normally carries no caption; if a supporting line is used later, it must reinforce buyer trust through product/use context and never describe layout intent";
  return {
    ...resource,
    sourcePriority: resource.sourcePriority || "curated stock/library first",
    desktopImageArea,
    mobileImageArea,
    desktopTextCompanionArea: textCompanionArea,
    heroVisualBalance: visualBalance,
    objectFitRule:
      "preserve the key product/environment subject with center-weighted cropping and a readable overlay scrim; never crop the image so tightly that the hero loses its contextual proof value",
    displayMode,
    sourceValidationRule:
      "when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media",
    suggestedAsset: curatedImage
      ? {
          url: curatedImage.src,
          alt: curatedImage.alt,
          caption: curatedImage.caption,
        }
      : undefined,
    captionPolicy,
  };
}

function buildMediaResourceLines(
  page: PageBlueprint,
  enterpriseHomepage: boolean,
  surfaceMode: WebsiteSurfaceMode,
): string[] {
  return mediaResourceContractLines(buildExpandedMediaResource(page, enterpriseHomepage, surfaceMode));
}

export function buildWebsiteMediaResourceList(
  params: WebsiteDesignSpecParams,
): WebsiteMediaResource[] {
  const surfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    surfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  return params.decision.pageBlueprints.map((page) => buildExpandedMediaResource(page, enterpriseHomepage, surfaceMode));
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
    ...buildSurfaceVisualIdentityLines(params, websiteSurfaceMode),
    ...buildRouteSpecLines(page, enterpriseHomepage, localeMode, websiteSurfaceMode, params.requirementText),
    "- media_resource:",
    ...buildMediaResourceLines(page, enterpriseHomepage, websiteSurfaceMode),
  ].join("\n");
}

export function buildWebsiteDesignSpecMarkdown(params: WebsiteDesignSpecParams): string {
  const localeMode = resolveDesignSpecLocaleMode(params);
  const websiteSurfaceMode = resolveWebsiteSurfaceMode(params);
  const enterpriseHomepage =
    websiteSurfaceMode === "corporate-b2b-site" && isCorporateB2BEnterpriseHomepage(params);
  const homepagePage =
    params.decision.pageBlueprints.find((page) => page.route === "/") || params.decision.pageBlueprints[0];
  const institutionLedContentHubHomepage =
    homepagePage ? isInstitutionLedContentHubHomepage(homepagePage, websiteSurfaceMode) : false;
  const needsConsultationForm = requirementNeedsConsultationForm(params.requirementText);
  const restrictedConsultationHosts = extractExplicitConsultationFormHostHints(params.requirementText);
  const styleId = String(params.designHit?.id || "runtime-selected-style").trim() || "runtime-selected-style";
  const styleName = String(params.designHit?.name || styleId).trim() || styleId;
  const styleReason = String(params.designHit?.design_desc || "runtime-selected-style").trim() || "runtime-selected-style";
  const siteGeneratorMode = params.siteGeneratorMode || resolveWebsiteArtifactGeneratorMode();
  const routeLines = params.decision.routes.map((route, index) => {
    const page = params.decision.pageBlueprints[index];
    return `- ${route} (${page?.navLabel || route})`;
  });

  const routeSections = params.decision.pageBlueprints.map((page) =>
    [`### ${page.route}`, ...buildRouteSpecLines(page, enterpriseHomepage, localeMode, websiteSurfaceMode, params.requirementText)].join("\n"),
  );
  const mediaResources = buildWebsiteMediaResourceList(params).map(mediaResourceMarkdownSection);

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
          ...(params.discoveryBrief.supportedLocales?.length
            ? [`- discovery_supported_locales: ${params.discoveryBrief.supportedLocales.join(", ")}`]
            : []),
          ...(params.discoveryBrief.defaultLocale ? [`- discovery_default_locale: ${params.discoveryBrief.defaultLocale}`] : []),
          `- discovery_visual_direction_id: ${params.discoveryBrief.visualDirectionId}`,
          `- discovery_primary_goal: ${params.discoveryBrief.primaryGoal || "prompt-adaptive"}`,
        ]
      : []),
    ...(params.designSystemId ? [`- design_system_lock_id: ${params.designSystemId}`] : []),
    ...(params.designSystemName ? [`- design_system_lock_name: ${params.designSystemName}`] : []),
    ...(params.discoveryBrief?.designSystemName ? [`- discovery_design_system_name: ${params.discoveryBrief.designSystemName}`] : []),
    `- primary_color: ${params.stylePreset.colors.primary}`,
    `- accent_color: ${params.stylePreset.colors.accent}`,
    `- background_color: ${params.stylePreset.colors.background}`,
    `- typography: ${params.stylePreset.typography}`,
    ...buildSurfaceVisualIdentityLines(params, websiteSurfaceMode),
    "",
    renderWebsiteArtifactGeneratorContract({
      mode: siteGeneratorMode,
      surfaceMode: websiteSurfaceMode,
      selectedSeedSkillIds: params.selectedSeedSkillIds,
    }),
    "",
    "## 3. Shell Contract",
    `- confirmed_routes: ${params.decision.routes.join(", ")}`,
    "- Shared shell may keep one header and one footer system, but body topology must still vary by route.",
    "- footer_destination_contract: the homepage footer must enumerate the full confirmed route destination set for this run; do not reduce it to a CTA-only subset or a partial route sample.",
    "- footer_destination_contract: every interior route footer must preserve that same destination set even when the routes are regrouped under different headings.",
    "- footer_shell_contract: every route footer must use a structured footer shell with a visually distinct footer band plus separate identity, navigation, and support/meta zones. Do not collapse the footer into one inline row of anchors or a copyright-only strip.",
    "- footer_shell_contract: if `/styles.css` defines footer-shell utilities such as `site-footer__inner`, `footer-grid`, `footer-brand`, `footer-links`, `footer-nav`, `footer-meta`, `footer-actions`, `footer-bottom`, `footer-panel`, or `footer-col`, the HTML footer must use those same structured zones.",
    "- footer_group_distinction_contract: footer groups must have distinct jobs. Do not repeat the same route set under multiple headings such as both primary navigation and key sections/resources.",
    "- Utility routes, locale mechanics, source/documentation mechanics, and accessibility notes must not become homepage narrative content unless explicitly requested.",
    "- footer_copy_rule: shared shell copy must describe the company, support buyers, or reinforce trust; it must not expose text-wordmark mode, brand-system labels, i18n/locale strategy, or site-implementation notes.",
    "- copy_firewall_rule: visible copy must translate internal generation instructions into buyer-facing language. Do not surface contract wording such as `should`, `must`, `use`, `explain`, `layout intent`, or other instruction-led phrasing in captions, leads, shell copy, or CTA labels.",
    ...(needsConsultationForm
      ? [
          "- consultation_form_contract: this run requires at least one real consultation intake form in the generated site.",
          restrictedConsultationHosts.length > 0
            ? "- consultation_form_host_preference: when the requirement text explicitly limits the form host, place the single real form only on those approved host routes and link back to it from the other pages instead of duplicating the form."
            : "- consultation_form_host_preference: use the dedicated contact route when present; otherwise host the form on the primary information/resource route or the homepage.",
          "- consultation_form_fields: the form must contain name, organization/company, email, topic/subject, and message fields. Search/filter inputs, CTA buttons, and mailto links do not satisfy this requirement.",
        ]
      : []),
    ...buildShellLocaleLines(localeMode, params.requirementText),
    "- section_spacing_contract: corporate-b2b pages should feel composed and breathable; major section bands should usually land in roughly the 40-72px range instead of collapsing into very tight dashboard spacing.",
    "",
    "## 4. Homepage Contract",
    `- homepage_mode: ${enterpriseHomepage || websiteSurfaceMode === "corporate-b2b-site" ? "enterprise_masthead" : websiteSurfaceMode === "docs-knowledge-site" ? "docs_workspace_homepage" : websiteSurfaceMode === "portfolio-blog-site" ? "profile_editorial_homepage" : websiteSurfaceMode === "content-hub-site" ? institutionLedContentHubHomepage ? "institution_led_content_hub_homepage" : "collection_index_homepage" : "standard_homepage"}`,
    `- homepage_opening: ${routeOpeningTopology(homepagePage, enterpriseHomepage, websiteSurfaceMode)}`,
    websiteSurfaceMode === "docs-knowledge-site"
      ? "- homepage_archetype_contract: docs home must use docs workspace/reference index geometry with search/index rail, quickstart strip, guide stack, and reference matrix. Do not reuse corporate or hub homepage skeletons."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- homepage_archetype_contract: content hub home may still carry standards/research/resource depth, but when the prompt requires an official homepage identity it must open as a brand-led institutional overview. Downstream directories, certification/resource semantics, and collection shelves belong after the institutional masthead."
      : websiteSurfaceMode === "content-hub-site"
        ? "- homepage_archetype_contract: content hub home must use editorial/institutional collection-index geometry with archive masthead, shelves, ledgers, and resource rows. Do not reuse corporate or docs homepage skeletons."
        : "",
    enterpriseHomepage
      ? "- buyer_signals_mode: compact proof row only; do not render a second hero, large snapshot panel, or aside rail."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- buyer_signals_mode: institutional trust and capability overview band."
      : "- buyer_signals_mode: supporting proof/capability band.",
    websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
      ? "- homepage_opening_copy_gate: keep the title, meta description, H1, first lead, and first capability/proof band at the umbrella-institution level. Do not let certification, information-entry, support-entry, consultation-entry, downloads, or route-family labels dominate the opening identity."
      : "",
    websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
      ? "- homepage_density_gate: the opening homepage sequence must include enough institutional substance to stand alone before route cards or contact actions. Do not collapse route / into a thin overview plus consultation/support entry framing."
      : "",
    enterpriseHomepage
      ? "- homepage_media_rule: the primary stock/library image belongs inside the opening hero as a background-supported visual layer with readable overlay copy; do not push the first meaningful image below the opening band."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- homepage_media_rule: content-hub homepage media should support institutional scope, standards/research proof, or public-trust context inside the masthead or first proof band; do not let archive thumbnails or directory framing replace the homepage identity."
      : websiteSurfaceMode === "docs-knowledge-site"
        ? "- homepage_media_rule: docs homepage media should support wayfinding or reference context inside docs modules; do not place a generic image/card as a right-side hero panel."
        : websiteSurfaceMode === "content-hub-site"
          ? "- homepage_media_rule: content-hub homepage media should support archive, research, or resource context inside collection modules; do not place a generic image/card as a right-side hero panel."
          : websiteSurfaceMode === "portfolio-blog-site"
            ? "- homepage_media_rule: portfolio/blog homepage media should reinforce the named operator or publication through a real contextual image or a substantive writing/proof module; do not place a decorative placeholder card or weak right-side panel beside the masthead."
          : "- homepage_media_rule: media belongs to a supporting band, not a hard-inserted generic hero panel.",
    enterpriseHomepage
      ? "- homepage_media_source_validation: a real stock/library photo is required for the primary hero visual when available; inline SVG or abstract placeholder media is not acceptable."
      : websiteSurfaceMode === "portfolio-blog-site"
        ? "- homepage_media_source_validation: when a portfolio/blog homepage or archive support slot uses media, prefer a real operator/publication-context image when available; otherwise replace the slot with route-owned writing/proof substance instead of abstract placeholder media."
      : "- homepage_media_source_validation: prefer real stock/library imagery when available; avoid abstract placeholder media for key supporting slots.",
    enterpriseHomepage
      ? "- homepage_hero_markup_rule: render a real img/picture node inside the opening hero media slot; do not rely on a CSS-only background-image as the sole hero visual when a real asset is available, and do not emit enterprise-hero-visual, media-panel, visual-content, visual-note, or any text-only pseudo-image box."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- homepage_hero_markup_rule: if the institutional homepage uses a supporting visual, keep it subordinate to the opening copy inside the masthead background, below the masthead, or inside the first institutional proof band. Do not render an equal-column copy/image hero pair or a detached right-side visual panel."
      : websiteSurfaceMode === "portfolio-blog-site"
        ? "- homepage_hero_markup_rule: when the profile/editorial homepage or `/blog` archive uses a support panel, render a real image node or a dense route-owned proof module; do not emit a text-light placeholder box, empty context rectangle, or decorative pseudo-image panel."
      : "- homepage_hero_markup_rule: when the route calls for hero media, render a real image node or background image rather than a text-only placeholder box.",
    enterpriseHomepage
      ? "- homepage_markup_contract: prefer `enterprise-hero` / `enterprise-hero__media` / `enterprise-hero__content` style class semantics. Do not reuse legacy `hero-grid`, `hero__grid`, `hero-panel`, `media-frame`, or `aside`-rail naming for the opening hero."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- homepage_markup_contract: prefer route-owned institutional classes such as `institutional-masthead`, `brand-overview`, `capability-shelf`, `institutional-proof`, or `standards-scope`. Do not lead route / with `hero-grid`, `hero__grid`, `hero-copy`, `hero-panel`, `hero-aside`, `media-frame`, or a symmetric copy/media masthead wrapper."
      : "",
    enterpriseHomepage
      ? "- homepage_css_contract: styles.css must style the opening hero through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row`. Do not rely on generic `.hero-grid`, `.hero-copy`, `.hero-panel`, or `.media-frame` selectors for the homepage opening."
      : websiteSurfaceMode === "content-hub-site" && institutionLedContentHubHomepage
        ? "- homepage_css_contract: styles.css must style the homepage opening as an institutional masthead with stacked or asymmetrical rhythm. Do not implement route / with equal-width hero columns, right-rail media geometry, or generic `.hero-grid` / `.hero-copy` / `.hero-panel` selectors as the opening layout primitive."
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
