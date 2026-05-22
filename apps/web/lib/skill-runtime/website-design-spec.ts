import type { DesignSkillHit } from "../agent/website-workflow.ts";
import type { LocalDecisionPlan, PageBlueprint } from "./decision-layer.ts";
import type { DesignStylePreset } from "../design-style-preset.ts";
import { selectCuratedLibraryImage } from "./curated-media-library.ts";

type WebsiteDesignSpecParams = {
  decision: LocalDecisionPlan;
  requirementText: string;
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
};

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
  const positive =
    /\b(company|corporate|enterprise|b2b|buyers?|procurement|manufacturer|manufacturing|factory|supplier|export|wholesale|distributor|hospitality|custom solutions?|product showcase|brand trust|inquiry)\b/i;
  const routeCount = params.decision.routes.filter((route) =>
    /(?:^|\/)(products?|custom-solutions?|solutions?|cases?|about|contact)(?:\/|$)/i.test(route),
  ).length;
  if (negative.test(text) && routeCount < 2) return false;
  return positive.test(text) || routeCount >= 2;
}

function routeRoleSummary(page: PageBlueprint): string {
  if (page.route === "/") return "Homepage";
  if (page.pageKind === "blog-data-index") return "Content index";
  if (page.pageKind === "search-directory") return "Directory";
  if (page.pageKind === "auth") return "Account/auth";
  return "Interior route";
}

function routeOpeningTopology(page: PageBlueprint, enterpriseHomepage: boolean): string {
  if (page.route === "/") {
    return enterpriseHomepage
      ? "image-backed enterprise hero -> compact proof row -> unified capability band -> concise CTA strip"
      : "single-column homepage hero -> proof band -> capability/CTA";
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
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

function routeMediaPlan(page: PageBlueprint, enterpriseHomepage: boolean): string[] {
  if (page.route === "/") {
    if (enterpriseHomepage) {
      return [
        "- slot_owner: opening-hero-background",
        "- image_purpose: procurement-confidence environmental cue for towels/home textiles behind the enterprise masthead",
        "- placement_band: inside the opening hero as a background-supported visual layer behind copy",
        "- preferred_ratio: 21:9 cinematic landscape or 16:9 wide landscape with strong subject readability",
        "- display_mode: image-backed enterprise hero with overlay copy; the image should carry the majority of first-screen visual weight, with no empty side rail, detached proof image, or hard-inserted width:100% inline image",
        "- source_priority: curated stock/library first",
        "- media_source_rule: when stock/library imagery is available, use a real photographic asset; do not use inline SVG, abstract illustration, or data-URI placeholder media for the primary hero visual",
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

function routeProhibitions(page: PageBlueprint, enterpriseHomepage: boolean): string[] {
  if (page.route === "/" && enterpriseHomepage) {
    return [
      "- prohibit: split hero / hero-grid / aside rail / snapshot panel / floating stat cards in the opening band",
      "- prohibit: founder/personal-brand cadence, boutique/editorial hero, lifestyle promo framing",
      "- prohibit: image as a first-screen side panel, empty right rail, or width:100% hard-inserted detached hero media",
      "- prohibit: homepage capability zone rendered as content-band--split, split-grid, detail sidebar, proof-rail, or right-column aside",
    ];
  }
  const text = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  const routeSpecificBan =
    /products?|catalog|collection/.test(text)
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

function buildRouteSpecLines(page: PageBlueprint, enterpriseHomepage: boolean): string[] {
  const routeText = `${page.route} ${page.navLabel} ${page.purpose}`.toLowerCase();
  const interiorMarkupContract =
    /products?|catalog|collection/.test(routeText)
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
  return [
    `- role: ${routeRoleSummary(page)}`,
    `- nav_label: ${page.navLabel}`,
    `- purpose: ${page.purpose}`,
    `- opening_topology: ${routeOpeningTopology(page, enterpriseHomepage)}`,
    `- section_cadence: ${page.contentSkeleton.join(" -> ") || "derive from the route role without reusing a generic hero shell"}`,
    "- section_spacing_contract: major route-owned section bands should usually breathe in roughly the 40-72px range, while nested proof rows, capability grids, card stacks, CTA action groups, and support clusters should still feel spacious in roughly the 28-44px range.",
    `- component_mix: hero ${page.componentMix.hero}, feature ${page.componentMix.feature}, grid ${page.componentMix.grid}, proof ${page.componentMix.proof}, form ${page.componentMix.form}, cta ${page.componentMix.cta}`,
    ...routeProhibitions(page, enterpriseHomepage),
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
          "- header_contract: locale switch must live in a dedicated utility wrapper beside the primary nav, not be concatenated directly into the nav link stream.",
          "- header_contract: the primary nav cluster should contain route links only. Do not place locale buttons inside `<nav>` and then emit a second empty utility wrapper.",
          "- header_contract: do not emit an empty locale utility shell.",
          "- header_contract: for corporate-b2b pages, keep locale button labels literal `EN` and `ZH`. Do not localize the header switch to `English`, `Chinese`, `中文`, `英文`, or similar long-form labels.",
          "- i18n_contract: for corporate-b2b pages, keep alternate-language strings in `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json`. The final HTML should rely on stable `data-i18n` keys rather than inline `data-i18n-zh` / `data-i18n-en` value blobs.",
          "- spacing_contract: keep the opening hero visually close to the shared header, but allow a measured shell transition of roughly 20-36px so the masthead can breathe. Do not stack large shell top padding and full section top padding before the first meaningful hero content.",
          "- spacing_contract: homepage shell rhythm should stay controlled and enterprise-like; major section spacing should usually remain in roughly the 40-72px range, while proof rows, capability-card groups, and CTA/support clusters should usually remain in roughly the 28-44px range instead of collapsing into utility-tight spacing.",
          "- capability_contract: homepage capability content must render as one unified capability band with heading + grid/list content in the same shell rhythm.",
          "- capability_contract: do not use `content-band--split`, `split-grid`, `detail`, `proof-rail`, or a right-column `aside` for the homepage capability zone.",
          "- cta_contract: CTA and section shells should use reusable class-owned layout instead of inline style spacing/alignment fixes.",
          "- copy_contract: do not surface internal art-direction or mood labels such as `heritage manufacturing`, `heritage craft`, `warm palette`, or similar direction metadata in the homepage eyebrow, hero kicker, proof row, footer, or other visitor-facing copy.",
          "- copy_contract: specifically do not use homepage eyebrow/kicker lines such as `Heritage textile manufacturing`, `heritage textile production`, or similar heritage-led positioning. The homepage kicker should describe business offer, buyer fit, or sourcing reliability instead.",
          "- copy_contract: do not let homepage copy echo instruction-led verbs such as `should`, `must`, `use`, `explain`, or similar generator-facing phrasing.",
          "- copy_contract: unless the brief explicitly requests heritage or company-history storytelling, do not use `heritage`, `craft tradition`, or similar legacy-positioning language as homepage value claims. Prefer sourcing clarity, quality control, responsiveness, and production discipline.",
          "- copy_contract: do not use plain `heritage` as a homepage value word unless the brief explicitly asks for heritage/history storytelling. Treat `heritage` as internal direction metadata by default.",
          "- markup_contract: do not use generic action-group utility classes such as `hero-actions` in the homepage opening or CTA areas. Use enterprise-specific action classes such as `enterprise-hero__actions`, `cta-band__actions`, or another reusable corporate-owned action cluster.",
          "- layout_markup_contract: do not place inline `style=` attributes on `section__head`, `section-header`, or equivalent section-heading wrappers. Spacing and alignment for section heads must come from shared CSS classes only.",
          "- caption_contract: if a visible caption appears near homepage imagery, it must reinforce buyer trust through product, application, or sourcing context. It must not explain how the visual module should behave or what layout alternative was avoided.",
        ]
      : [
          ...interiorMarkupContract,
          "- header_contract: locale switch must live in one dedicated utility wrapper beside the primary nav, not inside `<nav>`, and that utility wrapper must not be left empty.",
          "- header_contract: for corporate-b2b pages, keep locale button labels literal `EN` and `ZH`; keep longer language strings inside the JSON dictionaries, not the header switch.",
          "- i18n_contract: for corporate-b2b pages, route HTML should rely on stable `data-i18n` keys plus `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json`. Do not ship inline `data-i18n-zh` / `data-i18n-en` value blobs across final route markup.",
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
    ...routeMediaPlan(page, enterpriseHomepage),
  ];
}

function buildMediaResourceLines(page: PageBlueprint, enterpriseHomepage: boolean): string[] {
  const curatedImage = selectCuratedLibraryImage(page.route, page.evidence || page.purpose || "");
  const mediaPlan = routeMediaPlan(page, enterpriseHomepage);
  const ratio = mediaPlan.find((line) => line.includes("preferred_ratio"))?.replace(/^- /, "") || "preferred_ratio: contextual";
  const placement = mediaPlan.find((line) => line.includes("placement_band"))?.replace(/^- /, "") || "placement_band: contextual";
  const purpose = mediaPlan.find((line) => line.includes("image_purpose"))?.replace(/^- /, "") || "image_purpose: contextual proof";
  const desktopImageArea =
    page.route === "/"
      ? "desktop_image_area: full-width hero background layer with a protected center-right focal zone, at least 680px visual depth behind the masthead, and enough visible subject area to dominate the first screen"
      : /products?|catalog|collection/i.test(`${page.route} ${page.navLabel}`)
        ? "desktop_image_area: 520px max-width x 420px visual box within the opening or first proof/specification band"
        : /solutions?|services?|custom-solutions?/i.test(`${page.route} ${page.navLabel}`)
          ? "desktop_image_area: 560px max-width x 340px visual box within the opening or first process/capability band"
          : /cases?|portfolio|projects?/i.test(`${page.route} ${page.navLabel}`)
            ? "desktop_image_area: 560px max-width x 340px visual box within the opening or first evidence/outcome band"
            : "desktop_image_area: 420px max-width visual box";
  const mobileImageArea =
    page.route === "/"
      ? "mobile_image_area: full-width hero background layer with copy-first overlay and a 420px minimum visible visual depth"
      : "mobile_image_area: full available shell width, max 280px height";
  const textCompanionArea =
    page.route === "/"
      ? "desktop_text_companion_area: overlay content zone stays left/center-left, limited to roughly 35-45% of the visual emphasis, while the image remains the main first-screen attention anchor"
      : "desktop_text_companion_area: preserve a readable adjacent text column; do not let the image consume the entire band";
  return [
    `- resource_id: ${page.route === "/" ? "home-hero-01" : normalizeStyleToken(`${page.route}-media-01`)}`,
    "- source_priority: curated stock/library first",
    `- ${purpose}`,
    `- ${placement}`,
    `- ${ratio}`,
    `- ${desktopImageArea}`,
    `- ${mobileImageArea}`,
    `- ${textCompanionArea}`,
    "- hero_visual_balance: the image should carry roughly 55-65% of the first-screen visual emphasis while the overlay copy remains crisp and readable",
    "- object_fit_rule: preserve the key towel/environment subject with center-weighted cropping and a readable overlay scrim; never crop the image so tightly that the hero loses environmental context",
    "- display_mode: image-backed hero or contained route-owned media slot only; never hard-insert as a generic full-width image outside its planned module",
    "- source_validation_rule: when curated stock/library imagery is available for this slot, use a real photographic asset; do not substitute inline SVG, abstract illustration, or data-URI placeholder media",
    ...(curatedImage
      ? [
          `- suggested_asset_url: ${curatedImage.src}`,
          `- suggested_asset_alt: ${curatedImage.alt}`,
          `- suggested_asset_caption: ${curatedImage.caption}`,
        ]
      : []),
    "- caption_policy: homepage hero visual normally carries no caption; if a supporting line is used later, it must reinforce buyer trust through product/use context and never describe layout intent",
  ];
}

function buildMediaResourceList(params: WebsiteDesignSpecParams, enterpriseHomepage: boolean): string[] {
  return params.decision.pageBlueprints.map((page) => {
    return [
      `### resource:${page.route}`,
      `- route: ${page.route}`,
      ...buildMediaResourceLines(page, enterpriseHomepage),
    ].join("\n");
  });
}

export function buildWebsiteDesignSpecRouteExcerpt(params: WebsiteDesignSpecParams, route: string): string {
  const enterpriseHomepage = isCorporateB2BEnterpriseHomepage(params);
  const normalizedRoute = String(route || "/").trim() || "/";
  const page =
    params.decision.pageBlueprints.find((item) => item.route === normalizedRoute) ||
    params.decision.pageBlueprints.find((item) => item.route === "/") ||
    params.decision.pageBlueprints[0];
  if (!page) return "";
  return [
    `# Route Design Spec: ${page.route}`,
    `- selected_style: ${String(params.designHit?.name || params.designHit?.id || "runtime-selected-style").trim() || "runtime-selected-style"}`,
    ...buildRouteSpecLines(page, enterpriseHomepage),
    "- media_resource:",
    ...buildMediaResourceLines(page, enterpriseHomepage),
  ].join("\n");
}

export function buildWebsiteDesignSpecMarkdown(params: WebsiteDesignSpecParams): string {
  const enterpriseHomepage = isCorporateB2BEnterpriseHomepage(params);
  const styleId = String(params.designHit?.id || "runtime-selected-style").trim() || "runtime-selected-style";
  const styleName = String(params.designHit?.name || styleId).trim() || styleId;
  const styleReason = String(params.designHit?.design_desc || "runtime-selected-style").trim() || "runtime-selected-style";
  const routeLines = params.decision.routes.map((route, index) => {
    const page = params.decision.pageBlueprints[index];
    return `- ${route} (${page?.navLabel || route})`;
  });

  const routeSections = params.decision.pageBlueprints.map((page) => [`### ${page.route}`, ...buildRouteSpecLines(page, enterpriseHomepage)].join("\n"));
  const mediaResources = buildMediaResourceList(params, enterpriseHomepage);

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
    `- locale_strategy: ${params.decision.locale === "zh-CN" ? "Chinese-first" : "English-first with i18n resources for other locales"}`,
    `- primary_color: ${params.stylePreset.colors.primary}`,
    `- accent_color: ${params.stylePreset.colors.accent}`,
    `- background_color: ${params.stylePreset.colors.background}`,
    `- typography: ${params.stylePreset.typography}`,
    "",
    "## 3. Shell Contract",
    `- confirmed_routes: ${params.decision.routes.join(", ")}`,
    "- Shared shell may keep one header and one footer system, but body topology must still vary by route.",
    "- Utility routes, locale mechanics, source/documentation mechanics, and accessibility notes must not become homepage narrative content unless explicitly requested.",
    "- footer_copy_rule: shared shell copy must describe the company, support buyers, or reinforce trust; it must not expose text-wordmark mode, brand-system labels, i18n/locale strategy, or site-implementation notes.",
    "- copy_firewall_rule: visible copy must translate internal generation instructions into buyer-facing language. Do not surface contract wording such as `should`, `must`, `use`, `explain`, `layout intent`, or other instruction-led phrasing in captions, leads, shell copy, or CTA labels.",
    "- header_utility_rule: render locale/language controls in a dedicated utility shell adjacent to navigation, not inside the primary nav link stream.",
    "- header_utility_rule: the dedicated utility shell must contain the locale switch itself. Do not emit an empty `header-utility` / `locale-utility` placeholder while the locale buttons remain inside `<nav>`.",
    "- section_spacing_contract: corporate-b2b pages should feel composed and breathable; major section bands should usually land in roughly the 40-72px range instead of collapsing into very tight dashboard spacing.",
    "",
    "## 4. Homepage Contract",
    `- homepage_mode: ${enterpriseHomepage ? "enterprise_masthead" : "standard_homepage"}`,
    `- homepage_opening: ${routeOpeningTopology(params.decision.pageBlueprints.find((page) => page.route === "/") || params.decision.pageBlueprints[0], enterpriseHomepage)}`,
    enterpriseHomepage
      ? "- buyer_signals_mode: compact proof row only; do not render a second hero, large snapshot panel, or aside rail."
      : "- buyer_signals_mode: supporting proof/capability band.",
    enterpriseHomepage
      ? "- homepage_media_rule: the primary stock/library image belongs inside the opening hero as a background-supported visual layer with readable overlay copy; do not push the first meaningful image below the opening band."
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
