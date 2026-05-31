import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  extractRouteSourceBrief,
  type LocalDecisionPlan,
  type PageBlueprint,
} from "./decision-layer.ts";
import {
  bilingualDefaultVisibleLanguage as sharedBilingualDefaultVisibleLanguage,
  hasNegativePublishableDetailContract,
  isContentBackedPageKind,
  isBilingualRequirementText as sharedIsBilingualRequirementText,
  requirementRequestsPublishableDetailPages as sharedRequirementRequestsPublishableDetailPages,
  requestedPublishableContentCount as sharedRequestedPublishableContentCount,
  resolveRequestedExperienceLocale as sharedResolveRequestedExperienceLocale,
  shouldRequireBlogDetailPagesForRoute as sharedShouldRequireBlogDetailPagesForRoute,
} from "./website-generation-shared-policy.ts";

type TargetPageContractOptions = {
  focused?: boolean;
};

type InteriorPageArchetype = "products" | "solutions" | "cases" | "contact" | "about" | "blog-index" | "generic";

type BilingualPromptGuidance = {
  targetBlogDetailGuidance: string[];
  targetLanguageGate: string[];
};

type BlogPromptGuidance = {
  targetBlogIndexGate: string[];
  targetBlogCountGate: string[];
  targetBlogDetailGate: string[];
};

const BILINGUAL_PROMPT_GUIDANCE_PATH = fileURLToPath(
  new URL("../../skills/website-generation-workflow/BILINGUAL_PROMPT_GUIDANCE.md", import.meta.url),
);
const BLOG_PROMPT_GUIDANCE_PATH = fileURLToPath(
  new URL("../../skills/website-generation-workflow/BLOG_PROMPT_GUIDANCE.md", import.meta.url),
);

const DEFAULT_TARGET_SOURCE_BRIEF_CHARS = Math.max(
  800,
  Number(process.env.SKILL_TOOL_TARGET_SOURCE_BRIEF_CHARS || 1_600),
);

let cachedBilingualPromptGuidance: BilingualPromptGuidance | null = null;
let cachedBlogPromptGuidance: BlogPromptGuidance | null = null;

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function htmlPathToRoute(filePath: string): string {
  const normalized = normalizePath(filePath);
  if (normalized === "/index.html") return "/";
  if (!normalized.endsWith("/index.html")) return "";
  return normalizePath(normalized.slice(0, -("/index.html".length)) || "/");
}

function isBilingualRequirementText(text = ""): boolean {
  return sharedIsBilingualRequirementText(text);
}

function resolveRequestedExperienceLocale(
  requirementText = "",
  locale?: string,
): "zh-CN" | "en" | "bilingual" | undefined {
  return sharedResolveRequestedExperienceLocale(requirementText, locale);
}

function bilingualDefaultVisibleLanguage(text = ""): "zh-CN" | "en" {
  return sharedBilingualDefaultVisibleLanguage(text);
}

function requestedPublishableContentCount(requirementText = ""): number | undefined {
  return sharedRequestedPublishableContentCount(requirementText);
}

function requirementRequestsPublishableDetailPages(requirementText = ""): boolean {
  return sharedRequirementRequestsPublishableDetailPages(requirementText);
}

function shouldRequireBlogDetailPagesForRoute(page: PageBlueprint, requirementText = ""): boolean {
  return sharedShouldRequireBlogDetailPagesForRoute({
    route: page.route,
    navLabel: page.navLabel,
    requirementText,
    pageKind: page.pageKind,
  });
}

function extractPageTitleForRoute(route: string, locale: "zh-CN" | "en"): string {
  const normalized = normalizePath(route);
  if (normalized === "/") return locale === "zh-CN" ? "棣栭〉" : "Home";
  const token = normalized.split("/").filter(Boolean).join(" ");
  const title = token
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return title || (locale === "zh-CN" ? "椤甸潰" : "Page");
}

function extractMarkdownBulletSection(markdown: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "m");
  const match = markdown.match(pattern);
  if (!match) return [];
  return String(match[1] || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function loadBilingualPromptGuidance(): BilingualPromptGuidance {
  if (cachedBilingualPromptGuidance) return cachedBilingualPromptGuidance;
  const markdown = readFileSync(BILINGUAL_PROMPT_GUIDANCE_PATH, "utf8");
  cachedBilingualPromptGuidance = {
    targetBlogDetailGuidance: extractMarkdownBulletSection(markdown, "Target Blog Detail Guidance"),
    targetLanguageGate: extractMarkdownBulletSection(markdown, "Target Language Gate"),
  };
  return cachedBilingualPromptGuidance;
}

function loadBlogPromptGuidance(): BlogPromptGuidance {
  if (cachedBlogPromptGuidance) return cachedBlogPromptGuidance;
  const markdown = readFileSync(BLOG_PROMPT_GUIDANCE_PATH, "utf8");
  cachedBlogPromptGuidance = {
    targetBlogIndexGate: extractMarkdownBulletSection(markdown, "Target Blog Index Gate"),
    targetBlogCountGate: extractMarkdownBulletSection(markdown, "Target Blog Count Gate"),
    targetBlogDetailGate: extractMarkdownBulletSection(markdown, "Target Blog Detail Gate"),
  };
  return cachedBlogPromptGuidance;
}

function renderPromptGuidance(lines: string[], replacements: Record<string, string>): string[] {
  return lines.map((line) =>
    Object.entries(replacements).reduce(
      (acc, [token, value]) => acc.replaceAll(`{{${token}}}`, value),
      line,
    ),
  );
}

function classifyInteriorPageArchetype(page: PageBlueprint): InteriorPageArchetype {
  const route = normalizePath(page.route);
  const label = String(page.navLabel || "");
  const routeOrLabel = (pattern: RegExp) => pattern.test(route) || pattern.test(label);
  if (page.pageKind === "blog-data-index" || routeOrLabel(/(?:^|\/)(blog|articles?|writing|journal|insights?)(?:\/|$)|\bblog\b|\barticles?\b|\bwriting\b/i)) {
    return "blog-index";
  }
  if (routeOrLabel(/(?:^|\/)(products?|catalog|collection)(?:\/|$)|\bproducts?\b|\bcatalog\b|\bcollection\b/i)) return "products";
  if (routeOrLabel(/(?:^|\/)(solutions?|services?|custom-solutions?)(?:\/|$)|\bsolutions?\b|\bservices?\b/i)) return "solutions";
  if (routeOrLabel(/(?:^|\/)(cases?|portfolio|projects?)(?:\/|$)|\bcases?\b|\bportfolio\b|\bprojects?\b/i)) return "cases";
  if (routeOrLabel(/(?:^|\/)(contact|inquiry|get-in-touch)(?:\/|$)|\bcontact\b|\binquiry\b/i)) return "contact";
  if (routeOrLabel(/(?:^|\/)(about|company|team|profile)(?:\/|$)|\babout\b|\bcompany\b|\bteam\b|\bprofile\b/i)) return "about";
  return "generic";
}

function buildInteriorArchetypeGuidance(archetype: InteriorPageArchetype): string[] {
  switch (archetype) {
    case "blog-index":
      return [
        "- Blog index gate: open as an editorial archive or writing ledger, not as a generic split hero with a side panel. The first visible modules should establish themes, article promise, and reading value directly.",
        "- Blog index gate: the opening archive band, featured writing zone, and article list must be visibly distinct from `/about` and `/contact`. Do not reuse the same lead-copy + aside card geometry from those routes.",
        "- Blog index topology: after the opening archive band, separate featured writing or editorial themes, primary article cards, and onward archive/contact prompts into distinct major zones instead of one repeated hero-grid rhythm.",
      ];
    case "products":
      return [
        "- Product page gate: lead with grouped offers, product-family distinctions, spec logic, or sourcing options. Do not spend the opening modules reintroducing the company.",
        "- Product page gate: help a buyer compare or shortlist what to ask for next. Avoid a generic hero plus three interchangeable feature cards.",
        "- Product page topology: after the hero, expose at least three distinct major content zones such as family grouping, shortlist/comparison guidance, and sourcing/spec clarification. Do not compress them into one card grid plus one generic detail block.",
      ];
    case "solutions":
      return [
        "- Solutions page gate: organize around customer scenarios, operational needs, customization paths, or delivery modes. Do not let it read like a duplicate products page.",
        "- Solutions page gate: the first major modules should explain who the solution is for, what challenge it addresses, and how the engagement path works.",
        "- Solutions page topology: after the hero, separate audience-fit, engagement path, and delivery-mode content into visibly different zones instead of repeating the same grid/detail rhythm from sibling pages.",
      ];
    case "cases":
      return [
        "- Cases page gate: each visible case block should anchor to a scenario, intervention, or outcome/proof signal. Avoid vague testimonial filler or a company-profile rewrite.",
        "- Cases page gate: prefer structured proof cards, before/after context, or operational result framing. If the source lacks metrics, use explicit evidence-shaped placeholders instead of invented numbers.",
        "- Cases page topology: distinguish the case library zone from the methodology/proof zone. Do not render both as the same generic card section pattern.",
      ];
    case "contact":
      return [
        "- Contact page gate: reassure visitors what happens after outreach, what topics the team can handle, and which channel fits which need. Do not open with a generic company summary.",
        "- Contact page gate: form, direct methods, response expectation, and trust cues must read as one coherent conversion surface.",
        "- Contact page topology: keep contact methods, primary form, and response-expectation guidance as separate visible zones. Do not flatten the page into one intro section plus one form block.",
        "- Contact page topology: do not reuse a generic split-hero opener such as lead copy plus aside/panel from `/blog` or `/about`. Start with a route-owned contact conversion surface.",
      ];
    case "about":
      return [
        "- About page gate: establish identity, operating model, team/process credibility, and why this organization is trustworthy. Do not collapse into a duplicate home hero or a disguised contact page.",
        "- About page gate: use a narrative, milestone, process, or proof structure that explains the organization itself, not just a repeated list of products or CTA cards.",
        "- About page topology: separate identity/story, trust proof, and operating model into distinct major sections rather than reusing the products/contact rhythm.",
        "- About page topology: do not reuse the same split-hero opener as `/blog` or `/contact`. Start with a route-owned profile, operator timeline, or credibility masthead.",
      ];
    default:
      return [
        "- Interior page gate: make the first visible modules specific to the route's purpose and audience. Avoid generic hero plus filler-card repetition from sibling pages.",
        "- Interior page gate: do not open with a repeated split-hero shell such as `route-hero` + `hero-grid` + `hero-copy` + `aside.panel` / `detail-card`. Use a route-owned intro band, masthead, framework slab, or evidence header instead.",
        "- Interior page topology: the post-hero structure must contain at least three distinct major zones with different jobs. Do not compress the page into the same repeated section pattern used elsewhere.",
      ];
  }
}

function buildSiblingContrastBlock(plan: LocalDecisionPlan, route: string, focused: boolean): string {
  const siblings = plan.pageBlueprints.filter((item) => normalizePath(item.route) !== normalizePath(route));
  if (siblings.length === 0) return "";
  if (focused) {
    return siblings
      .slice(0, 4)
      .map((item) => `${item.route} (${item.pageKind})`)
      .join(", ");
  }
  return siblings
    .slice(0, 6)
    .map((item) => `${item.route}: ${item.purpose}`)
    .join("\n");
}

function findPageBlueprint(plan: LocalDecisionPlan, route: string): PageBlueprint {
  const normalized = normalizePath(route);
  return (
    plan.pageBlueprints.find((page) => normalizePath(page.route) === normalized) || {
      route: normalized,
      navLabel: extractPageTitleForRoute(normalized, plan.locale),
      purpose: "Dedicated page derived from the confirmed Canonical Website Prompt and source content.",
      source: "default",
      constraints: [
        "Canonical Website Prompt is authoritative.",
        "Do not use preset industry content.",
        "Stay distinct from sibling pages.",
      ],
      pageKind: "intent",
      responsibility: "Dedicated page derived from the confirmed Canonical Website Prompt and source content.",
      contentSkeleton: [],
      componentMix: { hero: 0, feature: 0, grid: 0, proof: 0, form: 0, cta: 0 },
    }
  );
}

export function formatTargetPageContract(
  plan: LocalDecisionPlan,
  targetFile: string,
  requirementText = "",
  options: TargetPageContractOptions = {},
): string {
  const route = htmlPathToRoute(targetFile);
  if (!route) return "";
  const page = findPageBlueprint(plan, route);
  const focused = options.focused === true;
  const requestedContentCount = requestedPublishableContentCount(requirementText);
  const requiresBlogDetailPages = shouldRequireBlogDetailPagesForRoute(page, requirementText);
  const isGeneratedBlogDetailRoute = /^\/blog\/[^/]+$/i.test(route) && !plan.routes.map(normalizePath).includes(route);
  const pageArchetype =
    !isGeneratedBlogDetailRoute && page.pageKind === "intent" ? classifyInteriorPageArchetype(page) : "generic";
  const bilingualPromptGuidance = loadBilingualPromptGuidance();
  const blogPromptGuidance = loadBlogPromptGuidance();
  const renderedTargetBlogDetailGuidance = renderPromptGuidance(
    bilingualPromptGuidance.targetBlogDetailGuidance,
    { DEFAULT_VISIBLE_LANGUAGE: bilingualDefaultVisibleLanguage(requirementText) },
  );
  const renderedTargetLanguageGate = renderPromptGuidance(
    bilingualPromptGuidance.targetLanguageGate,
    { DEFAULT_VISIBLE_LANGUAGE: bilingualDefaultVisibleLanguage(requirementText) },
  );
  const renderedTargetBlogIndexGate = renderPromptGuidance(blogPromptGuidance.targetBlogIndexGate, {});
  const renderedTargetBlogCountGate =
    requestedContentCount
      ? renderPromptGuidance(blogPromptGuidance.targetBlogCountGate, {
          REQUESTED_CONTENT_COUNT: String(requestedContentCount),
        })
      : [];
  const renderedTargetBlogDetailGate = renderPromptGuidance(blogPromptGuidance.targetBlogDetailGate, {});
  const sourceBrief = extractRouteSourceBrief(
    requirementText,
    page.route,
    page.navLabel,
    focused ? Math.min(DEFAULT_TARGET_SOURCE_BRIEF_CHARS, 900) : DEFAULT_TARGET_SOURCE_BRIEF_CHARS,
  );
  const siblingIntents = buildSiblingContrastBlock(plan, route, focused);
  const requestedLocale = resolveRequestedExperienceLocale(requirementText, plan.locale);
  const requiresCompletePublishableBlogDetail =
    isGeneratedBlogDetailRoute &&
    (Boolean(requestedContentCount) || requirementRequestsPublishableDetailPages(requirementText));
  const blogContentBackendGate =
    isContentBackedPageKind(page.pageKind)
      ? [...renderedTargetBlogIndexGate, ...renderedTargetBlogCountGate].join("\n")
      : "";
  const generatedBlogDetailGate =
    isGeneratedBlogDetailRoute
      ? [
          ...renderedTargetBlogDetailGate,
          ...(requiresCompletePublishableBlogDetail
            ? [
                "- Blog detail gate: this file is an explicitly requested publishable article target. During the initial website-generation pass it must ship as a complete readable article body, not a shell, stub, or deferred placeholder.",
                "- Blog detail gate: include one route-specific <h1>, one strong intro/excerpt paragraph, at least two substantive <h2> sections, and at least four meaningful body paragraphs so the detail route reads like finished technical writing.",
                "- Blog detail gate: do not mark the page with data-shpitto-blog-detail-shell=\"true\" and do not frame the article as something that will be written later.",
                "- Blog detail gate: keep the article topic-specific to the linked card title/excerpt and provide concrete insight, examples, architecture, tradeoffs, or operator guidance instead of generic content-strategy filler.",
              ]
            : [
                "- Blog detail gate: during the initial website-generation pass, this file only needs to be a structure-correct article shell, not a full long-form article body.",
                "- Blog detail gate: include one route-specific <h1>, one strong intro/excerpt paragraph, at least two substantive <h2> sections, and at least two meaningful body paragraphs so the detail route feels intentional and publishable later.",
                "- Blog detail gate: mark the shell with data-shpitto-blog-detail-shell=\"true\" on the main <article> so later blog-content generation can detect and replace the shell safely.",
                "- Blog detail gate: keep the shell topic-specific to the linked card title/excerpt. Do not drift into generic website process, archive explanation, or filler about content strategy in the abstract.",
                "- Blog detail gate: do not pretend the full article is already written. Use a polished route shell with topic map, reader context, and next-step framing instead of thin title-only placeholders or fake long-form filler.",
              ]),
          ...(isBilingualRequirementText(requirementText) ? renderedTargetBlogDetailGuidance : []),
        ].join("\n")
      : "";
  const bilingualLanguageGate = isBilingualRequirementText(requirementText)
    ? [...renderedTargetLanguageGate].join("\n")
    : "";

  return [
    "Target page contract:",
    `- File: ${targetFile}`,
    `- Route: ${page.route}`,
    `- Nav label: ${page.navLabel}`,
    `- Page intent: ${page.purpose}`,
    `- Intent source: ${page.source}`,
    `- Page kind: ${page.pageKind}`,
    requestedLocale === "zh-CN"
      ? "- Locale contract: this route is Chinese-first. All visible visitor-facing copy must be written directly in Chinese, including nav labels, headings, body text, CTA labels, filter labels, and footer copy. Keep English only for brand names, proper nouns, or unavoidable acronyms."
      : "",
    requestedLocale === "zh-CN"
      ? "- Locale contract: do not emit EN/ZH toggles, header language chips, bilingual shell payloads, or English-first body copy on this page."
      : "",
    requestedLocale === "en"
      ? "- Locale contract: keep the visible reading path in English only unless this route is explicitly marked bilingual."
      : "",
    "- The confirmed Canonical Website Prompt is authoritative for page structure, content depth, audience, and design direction.",
    page.constraints.length ? `- Page constraints:\n${page.constraints.map((item) => `  - ${item}`).join("\n")}` : "",
    page.contentSkeleton.length ? `- Required page skeleton:\n${page.contentSkeleton.map((item) => `  - ${item}`).join("\n")}` : "",
    page.contentSkeleton.length
      ? "- Skeleton mapping gate: each skeleton bullet must become its own visible major section or clearly distinct zone. Do not collapse multiple bullets into one generic card grid or one catch-all detail section."
      : "",
    sourceBrief
      ? `Page-specific source brief excerpt (authoritative for this file):\n${sourceBrief}`
      : "- No route-specific source excerpt was found; derive a unique page architecture from the complete Canonical Website Prompt.",
    "- Derive route-specific sections, headings, card types, and interactions from the Canonical Website Prompt and source content.",
    "- Use a page-specific body architecture. Shared header/footer/design tokens are allowed; the main content section order, visual modules, and primary components must differ from sibling routes.",
    "- Do not apply a hardcoded industry skeleton or copy the previous page layout and only swap text.",
    "- Visitor-facing copy must be substantive content for the audience, not a description of site mechanics. Do not tell visitors what the page's task is, where to start browsing, which route comes next, or that one page leads into deeper content.",
    "- Ban visible scaffold phrases and equivalents such as 从首页开始, 接下来看博客, 循序进入深内容, 阅读入口, 站点入口, 首页路径, 继续了解, 下一步, this page provides, homepage job, where to start, start from home, or next step when they explain navigation order rather than a concrete offer or action.",
    "- Ban route-mechanics phrasing such as 从前期到落地形成清晰路径, 从A到B形成浏览路径, 判断路径, 实施路径说明, 路径指引, 路线说明, or English equivalents like pathway explanation, browsing path, route path, or journey explanation when they merely narrate process choreography. Rewrite them as concrete capabilities, deliverables, operational support, proof, or consultation outcomes.",
    !isGeneratedBlogDetailRoute && !isContentBackedPageKind(page.pageKind)
      ? "- Destination page gate: the first visible section must immediately communicate a visitor benefit, capability, proof point, or concrete CTA. Do not open with page-purpose notes like 'this page provides', 'the next step is', 'continue to', 'what this page is for', or any explanation of route order."
      : "",
    !isGeneratedBlogDetailRoute && !isContentBackedPageKind(page.pageKind)
      ? "- Destination page gate: headings such as 继续了解, 下一步, Start here, Where to start, or similar are only acceptable when they introduce a real offer/action for the visitor. They are invalid if they merely choreograph browsing between pages."
      : "",
    page.pageKind === "search-directory"
      ? "- Directory opening gate: use one route-owned directory intro surface such as `route-intro`, `directory-intro`, `query-intro`, or `certification-entry`, and keep query/filter framing inside that same opening band."
      : "",
    page.pageKind === "search-directory"
      ? "- Directory opening gate: do not reopen the page with split-hero mechanics such as `hero__title`, `hero__lead`, `detail-grid`, or a right-rail `<aside>` filter panel. The opening should read like a directory/search surface, not a marketing hero."
      : "",
    page.pageKind === "search-directory"
      ? "- Directory opening gate: do not pair route-intro copy with `hero-panel`, `media-frame`, `proof-visual`, `lead-stack` + side media, or any two-column promo hero composition. The first band should prioritize query controls, result framing, criteria, or standards scope in one route-owned directory surface."
      : "",
    ...(!isGeneratedBlogDetailRoute && page.pageKind === "intent" ? buildInteriorArchetypeGuidance(pageArchetype) : []),
    page.route === "/"
      ? "- Homepage gate: route / must read as the official homepage and institutional overview. The title, meta description, H1, and first lead paragraph must establish brand mission, audience, scope, and navigation overview only. Do not describe route / as an entry point, site entry, homepage path, or browsing gateway in visible copy. Do not put download, certification, query/search, login, or registration wording in those fields; place those downstream functions only in later cards, nav, or CTA modules."
      : "",
    page.route === "/"
      ? "- Homepage gate: the title, meta description, H1, and first lead paragraph must not enumerate sibling route families such as Creation, Construction, Certification, Advocacy, Research Center, Information Platform, downloads, standards index, or resource directory. Summarize the institutional mission at a higher level and defer route-by-route naming to later sections, navigation, or cards."
      : "",
    page.route === "/"
      ? "- Homepage gate: the first capability/proof band must still read like an umbrella-institution overview. Do not let support-entry, consultation-entry, information-entry, certification-explainer, or contact-intake framing become the dominant identity of the opening sequence."
      : "",
    page.route === "/"
      ? "- Homepage gate: route / needs enough institutional depth to stand alone before route cards, contact blocks, or intake forms. Do not compress the homepage into a thin overview followed immediately by support routing."
      : "",
    page.route === "/"
      ? "- Homepage/footer wording gate: footer group labels must stay visitor-facing and destination-oriented. Do not label footer groups as Site routes, site path, browsing path, route guidance, entry point, 站点路径, 浏览路径, or 入口; use labels such as Primary navigation, Key sections, Research access, Contact, or Support instead."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: the hero must establish the brand, institutional scope, and homepage identity. Downstream functions may appear as secondary navigation cards, but never as the title, H1, or lead identity."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: downstream links must be concrete offers or destinations. Never write homepage route choreography such as 'start from the homepage, then read the blog', 'the homepage path', or 'the home page's task is to guide the next step'."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: when linking to a Blog/content route, use thematic CTA language such as read the blog, explore recent writing, or enter the article archive. Do not explain the site by counting or sequencing the current articles, for example 'the blog has three recent articles' or 'start with these three pieces'."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: if the confirmed prompt centers the site on one named person such as an author, founder, consultant, researcher, or executive, the home hero and first substantive section must introduce that person, their expertise, and why visitors should trust them before routing into /blog or archive surfaces. The blog/content index is downstream distribution, not the homepage identity."
      : "",
    page.pageKind === "home"
      ? "- Home page feature-card gate: if the page uses a 2-4 card row for themes, strengths, coverage areas, or editorial pillars, treat each item as a roomy feature card. The outer card class must own generous four-side padding and vertical rhythm, not just a border shell."
      : "",
    page.pageKind === "home"
      ? "- Home page feature-card gate: decorative numerals, step numbers, watermarks, or corner badges must have explicit inset positioning and must not crowd the title or body copy. Titles and paragraphs should align to one padded text column with stable top/right/bottom/left gutters."
      : "",
    isContentBackedPageKind(page.pageKind)
      ? "- Blog/content index gate: visible chips, pills, eyebrow labels, hero leads, and section intros must describe the subject, editorial stance, or archive value itself. They must never tell the visitor how to read, where to start, which order to follow, or that this page collects a certain number of articles."
      : "",
    isContentBackedPageKind(page.pageKind)
      ? "- Blog/content index gate: ban visible phrases like reading path, reading method, suggested reading order, how to read, this page collects, what you'll find here, start with these three articles, launch articles, 棣栧彂鏂囩珷, 闃呰璺緞, 闃呰鏂瑰紡, 鎺ㄨ崘闃呰椤哄簭, 濡備綍闃呰, 鏈〉鍐呭, or equivalent wording even inside pills/badges."
      : "",
    isContentBackedPageKind(page.pageKind) &&
    normalizePath(page.route) === "/blog" &&
    hasNegativePublishableDetailContract(requirementText)
      ? "- Blog/content index gate: this brief explicitly defers blog detail generation. Keep the first pass archive-first: starter cards must remain non-routing archive cards and must not link to /blog/{slug}/ detail routes in this run."
      : "",
    isContentBackedPageKind(page.pageKind) && requiresBlogDetailPages
      ? "- Blog/content index gate: do not satisfy article details with same-page anchors such as #article-detail, accordion panels, or detail sections embedded below the index. Every visible article/resource card must link to a stable /blog/{slug}/ route, and the generated output must include the matching /blog/{slug}/index.html file."
      : "",
    isContentBackedPageKind(page.pageKind) && !requiresBlogDetailPages
      ? "- Blog/content index gate: if this route is a generic information platform, standards hub, or resource collection, keep the first pass focused on the collection surface. Do not invent /blog/{slug}/ article detail pages unless the prompt, route identity, or source material explicitly asks for publishable article/news details."
      : "",
    isContentBackedPageKind(page.pageKind) && requiresBlogDetailPages && !requestedContentCount
      ? "- Blog/content index gate: without an explicit requested article count, keep the first pass lightweight. If the brief defers detail generation to a later workflow or says the first pass is index-first, starter cards must remain non-routing archive cards and must not link to /blog/{slug}/ detail routes in this run."
      : "",
    page.pageKind === "search-directory"
      ? "- Search-directory gate: if the layout uses a dense grid, search results must span the full available row and remain readable at desktop and mobile widths."
      : "",
    isContentBackedPageKind(page.pageKind)
      ? "- Blog/content index footer wording gate: footer labels must not use route-guidance wording such as Site routes, site path, browsing path, route guidance, reading entry, 站点路径, 浏览路径, 阅读入口, or 入口. Use subject-facing labels like Research topics, Standards library, Resource sections, Contact, or Support."
      : "",
    blogContentBackendGate,
    generatedBlogDetailGate,
    bilingualLanguageGate,
    "- Follow the workflow skill's Shared Shell/Footer Contract for header, main, and footer requirements.",
    siblingIntents
      ? focused
        ? `Primary sibling contrast routes: ${siblingIntents}`
        : `Sibling page intents to stay visually distinct from:\n${siblingIntents}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatWebsiteTargetPageContractForAdapter(
  plan: LocalDecisionPlan,
  targetFile: string,
  requirementText = "",
): string {
  return formatTargetPageContract(plan, targetFile, requirementText);
}

