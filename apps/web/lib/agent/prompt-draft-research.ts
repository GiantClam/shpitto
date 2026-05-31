import OpenAI from "openai";
import {
  assessUserInputSufficiency,
  buildRequirementSpec,
  composeStructuredPrompt,
  parseRequirementFormFromText,
  type RequirementSpec,
  type RequirementSlot,
} from "./chat-orchestrator";
import {
  buildWebsiteEvidenceBrief,
  buildWebsiteKnowledgeProfile,
  extractExplicitUrlsFromRequirement,
  buildWebsiteSearchQueries,
  formatWebsiteEvidenceBrief,
  formatWebsiteKnowledgeProfile,
  resolveWebSearchQueryBudget,
  summarizeWorkflowSourceText,
  type WebsiteEvidenceBrief,
  type KnowledgeProfileEnrichmentOptions,
  type WebsiteKnowledgeProfile,
} from "./content-source-ingestion.ts";
import {
  buildLocalDecisionPlan,
  type LocalDecisionPlan,
} from "../skill-runtime/decision-layer.ts";
import {
  buildLocalePlan,
  getLocaleMessagePath,
  I18N_LOCALE_REGISTRY_PATH,
  I18N_MESSAGE_EN_PATH,
  I18N_MESSAGE_ZH_CN_PATH,
} from "../skill-runtime/locale-plan.ts";
import { loadProjectSkill } from "../skill-runtime/project-skill-loader.ts";
import {
  assessWebsiteDiscoveryBrief,
  type WebsiteDiscoveryBrief,
  type WebsiteSurfaceMode,
} from "../skill-runtime/open-design-adoption.ts";
import { resolveRunProviderLock, type ProviderName } from "../skill-runtime/provider-lock.ts";
import { selectWebsiteGenerationTypeSkill } from "../skill-runtime/website-type-selector.ts";
import {
  resolveSerperSearchConfigFromEnv,
  searchSerperBatch,
  type SerperSearchConfig,
  type WebSearchSource,
} from "../tools/web-search/serper.ts";
import {
  containsWorkflowCjk,
  isWorkflowArtifactEnglishSafe,
  normalizeWorkflowArtifactText,
  sanitizeWorkflowArtifactText,
} from "../workflow-artifact-language.ts";

export type PromptDraftSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type PromptDraftBuildResult = {
  canonicalPrompt: string;
  usedWebSearch: boolean;
  researchSummary?: string;
  sources: PromptDraftSource[];
  promptControlManifest: PromptControlManifest;
  websiteSurfaceMode: WebsiteSurfaceMode;
  discoveryBrief: WebsiteDiscoveryBrief;
  evidenceBrief?: WebsiteEvidenceBrief;
  knowledgeProfile?: WebsiteKnowledgeProfile;
  model?: string;
  provider?: ProviderName;
  draftMode?: "template" | "llm" | "llm_web_search";
  fallbackReason?: string;
};

export type PromptControlManifest = {
  schemaVersion: 1;
  promptKind: "canonical_website_prompt";
  routeSource: "prompt_draft_page_plan" | "uploaded_source_page_plan";
  websiteSurfaceMode?: WebsiteSurfaceMode;
  visualDirectionId?: string;
  designSystemId?: string;
  routes: string[];
  navLabels: string[];
  files: string[];
  localeConfig?: {
    mode: "single" | "bilingual" | "multilingual";
    defaultLocale: string;
    locales: string[];
    translationDriven: boolean;
    sourceCatalogPath?: string;
    registryPath?: string;
  };
  discoveryBrief?: WebsiteDiscoveryBrief;
  pageIntents: Array<{
    route: string;
    navLabel: string;
    purpose: string;
    source: string;
  }>;
};

export type SourceEnrichmentPlan = {
  shouldUseUrlExtraction: boolean;
  shouldUseDomainSources: boolean;
  shouldUseUploadedAssets: boolean;
  shouldUseWebSearch: boolean;
  reasons: string[];
};

type DraftProviderConfig = {
  provider: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
  fallbackModel?: string;
};

type PromptDraftDisplayLocale = "zh" | "en";
type RequestedSiteLocale = "zh-CN" | "en" | "bilingual" | "multilingual";

const SOURCE_MATERIAL_APPENDIX_PER_SOURCE_LIMIT = 12_000;
const SOURCE_MATERIAL_APPENDIX_TOTAL_LIMIT = 24_000;

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function toKebabToken(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function containsCjk(text: string): boolean {
  return containsWorkflowCjk(text);
}

const ROUTE_LABEL_CONTAINER_WORDS = new Set([
  "center",
  "hub",
  "page",
  "pages",
  "platform",
  "portal",
  "site",
  "system",
  "website",
]);

const COMMON_ROUTE_PREFIX_WORDS = new Set([
  "about",
  "blog",
  "case",
  "cases",
  "contact",
  "custom",
  "download",
  "downloads",
  "home",
  "information",
  "platform",
  "product",
  "products",
  "research",
  "service",
  "services",
  "solution",
  "solutions",
  "standard",
  "standards",
]);

function looksLikeRouteBrandPrefixToken(token: string, route = ""): boolean {
  const normalized = String(token || "").trim();
  if (/^[A-Z0-9]{4,}$/.test(normalized)) return true;
  const routeLead = String(route || "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)[0]
    ?.split(/[-_]+/g)
    .filter(Boolean)[0]
    ?.toLowerCase();
  return (
    !!routeLead &&
    normalized.toLowerCase() === routeLead &&
    normalized.length >= 4 &&
    !COMMON_ROUTE_PREFIX_WORDS.has(routeLead)
  );
}

function compressRouteLabel(label: string, route = ""): string {
  const normalized = normalizeWorkflowArtifactText(label);
  if (!normalized) return "";

  const originalWords = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let words = normalized.split(/\s+/).filter(Boolean);
  let strippedBrandPrefix = false;

  if (words.length > 1 && looksLikeRouteBrandPrefixToken(originalWords[0] || "", route)) {
    words = words.slice(1);
    strippedBrandPrefix = true;
  }

  const normalizedPhrase = words.join(" ").toLowerCase();
  if (normalizedPhrase === "case studies") return "Cases";

  if (words.length > 1 && ROUTE_LABEL_CONTAINER_WORDS.has(words[words.length - 1].toLowerCase())) {
    words = words.slice(0, -1);
  }

  if (words.length === 0) {
    words = normalized.split(/\s+/).filter(Boolean);
  }

  if (strippedBrandPrefix && words.length > 1) {
    return words[0];
  }

  if (words.length === 2 && ROUTE_LABEL_CONTAINER_WORDS.has(words[1].toLowerCase())) {
    return words[0];
  }

  return words.join(" ");
}

function internalNavLabelForRoute(route: string, fallback = ""): string {
  const normalized = String(route || "/").trim() || "/";
  if (normalized === "/") return "Home";
  if (
    isWorkflowArtifactEnglishSafe(fallback) &&
    !isLegacyGenericRoutePurpose(fallback) &&
    !isCollectionRoutePurpose(fallback) &&
    !isSpecializedRoutePurpose(fallback)
  ) {
    return compressRouteLabel(fallback, normalized);
  }
  const leaf = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() || "page";
  return leaf
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => (part === part.toUpperCase() && /^[A-Z0-9-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function isContentCollectionRoute(route: string, fallback = ""): boolean {
  const normalizedRoute = String(route || "/").toLowerCase();
  const normalizedFallback = String(fallback || "").toLowerCase();
  const haystack = `${normalizedRoute} ${normalizedFallback}`;
  if (!haystack.trim()) return false;
  return /(?:research|information|standards|resource|resources|downloads?|library|archive|knowledge|documents?|reports?|publications?|insights?)(?:[-_\s/]|$)/i.test(
    haystack,
  );
}

function buildSpecializedRoutePurpose(route: string, fallback = ""): string {
  const normalizedRoute = String(route || "/").toLowerCase();
  const label = internalNavLabelForRoute(route, fallback);
  if (/(?:^|\/)(?:casux-)?creation(?:\/|$)/i.test(normalizedRoute)) {
    return `Treat ${label} as a narrative and content-architecture route. Open with a route-owned creation masthead, explain how messaging or content structure is shaped, then move into reusable frameworks, proof, and a clear next action. Do not fall back to a generic split hero with an aside panel.`;
  }
  if (/(?:^|\/)(?:casux-)?construction(?:\/|$)/i.test(normalizedRoute)) {
    return `Treat ${label} as an implementation and execution route. Open with a route-owned construction/process lead, show staged execution or governance structure, then move into implementation proof and the next operational step. Do not fall back to a generic split hero with an aside panel.`;
  }
  if (/(?:^|\/)(?:casux-)?advocacy(?:\/|$)/i.test(normalizedRoute)) {
    return `Treat ${label} as a coalition, participation, or action-framework route. Open with a route-owned advocacy lead, show the network or participation model, then move into action framework, proof, and next involvement paths. Do not fall back to a generic split hero with an aside panel.`;
  }
  if (/(?:^|\/)(?:case-studies|cases)(?:\/|$)/i.test(normalizedRoute)) {
    return `Treat ${label} as an evidence-led case route. Open with a route-owned evidence header, lead quickly into scenario or outcome proof, and keep the page grounded in concrete case signals rather than a generic split hero with an aside panel.`;
  }
  return "";
}

function isSpecializedRoutePurpose(value: string): boolean {
  return /treat\s+.+\s+as\s+(?:a narrative and content-architecture route|an implementation and execution route|a coalition, participation, or action-framework route|an evidence-led case route)\./i.test(
    String(value || ""),
  );
}

function isLegacyGenericRoutePurpose(value: string): boolean {
  return /deliver a route-specific page .*distinct source-backed content and a clear next action/i.test(String(value || ""));
}

function isCollectionRoutePurpose(value: string): boolean {
  return /source-backed content collection route .*route-owned collection opening/i.test(String(value || ""));
}

function internalPurposeForRoute(route: string, fallback = ""): string {
  if (isWorkflowArtifactEnglishSafe(fallback) && isSpecializedRoutePurpose(fallback)) {
    return normalizeWorkflowArtifactText(fallback);
  }
  const specializedPurpose = buildSpecializedRoutePurpose(route, fallback);
  if (specializedPurpose) return specializedPurpose;
  if (isWorkflowArtifactEnglishSafe(fallback) && isCollectionRoutePurpose(fallback)) {
    return normalizeWorkflowArtifactText(fallback);
  }
  if (isContentCollectionRoute(route, fallback)) {
    return `Treat ${internalNavLabelForRoute(route, fallback)} as a source-backed content collection route with a route-owned collection opening, curated summaries or entries, and clear onward paths. Use route-owned collection copy wrappers such as collection-title, collection-lead, collection-actions, knowledge-hub-title, or knowledge-hub-actions instead of legacy hero-title, hero-lead, hero__actions, or hero__content utilities. Do not default to a legacy split-hero template or invent /blog/{slug}/ detail pages unless the source material explicitly requires them.`;
  }
  if (isWorkflowArtifactEnglishSafe(fallback) && !isLegacyGenericRoutePurpose(fallback)) {
    return normalizeWorkflowArtifactText(fallback);
  }
  return `Deliver a route-specific page for ${internalNavLabelForRoute(route, fallback)} with distinct source-backed content and a clear next action.`;
}

function requirementNeedsBlogRoute(requirementText: string): boolean {
  const normalized = String(requirementText || "");
  if (!normalized) return false;
  if (
    /(?:do not|don't|no need|without|avoid|no)\s+(?:a\s+)?(?:blog|blogs?|archive|archives?|blog\/archive|blog or archive|blog\/archive)\b/i.test(
      normalized,
    ) ||
    /\bno\s+blog\/archive\s+assumptions\b/i.test(normalized) ||
    /(?:不要|不需要|无需|避免).{0,16}(?:blog|博客|博文|归档|文章)/i.test(normalized)
  ) {
    return false;
  }
  return /(?:\bblog\b|博客|博文|文章|posts?|articles?)/i.test(normalized);
}

function mergeRequiredBlogRoute(plan: LocalDecisionPlan, requirementText: string): LocalDecisionPlan {
  if (!requirementNeedsBlogRoute(requirementText)) return plan;
  if (
    plan.pageBlueprints.some(
      (page) => page.pageKind === "blog-data-index" || page.pageKind === "content-collection-index" || page.route === "/blog",
    )
  ) {
    return plan;
  }

  const next = {
    ...plan,
    routes: [...plan.routes],
    navLabels: [...plan.navLabels],
    pageBlueprints: [...plan.pageBlueprints],
    pageIntents: [...plan.pageIntents],
  };
  const blogBlueprint = buildLocalDecisionPlan({
    messages: [{ role: "user", content: "Only generate / and /blog. Blog is a first-class content route." }],
    workflow_context: {
      latestUserText: "Only generate / and /blog. Blog is a first-class content route.",
      requirementAggregatedText: "Only generate / and /blog. Blog is a first-class content route.",
    },
  } as any).pageBlueprints.find((page) => page.route === "/blog");
  if (!blogBlueprint) return plan;

  if (!next.routes.includes("/blog")) next.routes.push("/blog");
  if (!next.navLabels.some((label) => String(label || "").trim().toLowerCase() === "blog")) {
    next.navLabels.push(blogBlueprint.navLabel);
  }
  next.pageBlueprints.push({
    ...blogBlueprint,
    source: "prompt_contract",
  });
  next.pageIntents = [...next.pageBlueprints];
  return next;
}

function buildPromptDecisionPlan(requirementText: string): LocalDecisionPlan {
  const parsedForm = parseRequirementFormFromText(requirementText);
  const requirementSpec = buildRequirementSpec(requirementText, [requirementText]);
  const workflowContext: Record<string, unknown> = {
    latestUserText: requirementText,
    requirementAggregatedText: requirementText,
  };
  if (parsedForm.hasForm && requirementSpec.pageStructure) {
    workflowContext.requirementSpec = requirementSpec;
  }

  const plan = buildLocalDecisionPlan({
    messages: [{ role: "user", content: requirementText }],
    workflow_context: workflowContext,
  } as any);
  return mergeRequiredBlogRoute(plan, requirementText);
}

function routeToHtmlPath(route: string): string {
  const normalized = String(route || "/").trim() || "/";
  if (normalized === "/") return "/index.html";
  return `${normalized.replace(/\/+$/g, "")}/index.html`;
}

function normalizeDiscoveryDesignSystemId(spec: RequirementSpec): string | undefined {
  const inspiration = spec.designSystemInspiration;
  const candidate =
    String((inspiration as any)?.id || "")
      .trim() ||
    String((inspiration as any)?.slug || "")
      .trim() ||
    String((inspiration as any)?.title || "")
      .trim();
  const normalized = toKebabToken(candidate);
  return normalized || undefined;
}

function resolveDiscoverySourcePriority(params: {
  spec: RequirementSpec;
  knowledgeProfile?: WebsiteKnowledgeProfile;
  referencedAssets?: string[];
  requirementText: string;
}): WebsiteDiscoveryBrief["sourcePriority"] {
  const specSources = Array.isArray(params.spec.contentSources)
    ? params.spec.contentSources.map((item) => String(item || "").trim().toLowerCase())
    : [];
  const sourceMode = String(params.knowledgeProfile?.sourceMode || "").trim().toLowerCase();
  const hasUploads = (params.referencedAssets || []).length > 0 || specSources.includes("uploaded_files");
  const hasDomain = sourceMode === "domain" || sourceMode === "mixed" || specSources.includes("same_domain");
  const hasWebResearch = sourceMode === "web_search" || sourceMode === "mixed" || specSources.includes("web_research");

  if ((hasUploads && hasDomain) || (hasUploads && hasWebResearch) || (hasDomain && hasWebResearch) || sourceMode === "mixed") {
    return "mixed";
  }
  if (hasUploads) return "uploaded_files";
  if (hasDomain) return "same_domain";
  if (hasWebResearch) return "web_research";
  return hasExplicitUrlSignal(params.requirementText) ? "same_domain" : "user";
}

function hasExplicitUrlSignal(requirementText: string): boolean {
  return extractExplicitUrlsFromRequirement(requirementText).length > 0;
}

function buildWebsiteDiscoveryBrief(params: {
  requirementText: string;
  spec: RequirementSpec;
  decisionPlan: LocalDecisionPlan;
  knowledgeProfile?: WebsiteKnowledgeProfile;
  referencedAssets?: string[];
}): WebsiteDiscoveryBrief {
  const selection = selectWebsiteGenerationTypeSkill({
    requirementText: params.requirementText,
    siteType: params.spec.siteType,
    routes: params.decisionPlan.routes,
    targetAudience: params.spec.targetAudience,
    primaryGoal: params.spec.primaryGoal,
  });
  const audience = Array.isArray(params.spec.targetAudience)
    ? params.spec.targetAudience.map((item) => sanitizeWorkflowArtifactText(item, "audience")).filter(Boolean)
    : [];
  const primaryGoal = Array.isArray(params.spec.primaryGoal)
    ? params.spec.primaryGoal.map((item) => sanitizeWorkflowArtifactText(item, "goal")).filter(Boolean).join(", ")
    : "";
  const immutableConstraints = Array.from(
    new Set(
      [
        ...((params.spec.explicitConstraints || []).map((item) => sanitizeWorkflowArtifactText(item, "constraint")).filter(Boolean)),
        params.spec.brand ? `brand:${sanitizeWorkflowArtifactText(params.spec.brand, "brand")}` : "",
        params.spec.locale ? `locale:${params.spec.locale}` : "",
      ].filter(Boolean),
    ),
  ).slice(0, 8);

  const brief = {
    surfaceMode: selection.surfaceMode,
    audience,
    primaryGoal: primaryGoal || sanitizeWorkflowArtifactText(selection.reason, "goal"),
    routes: [...params.decisionPlan.routes],
    sourcePriority: resolveDiscoverySourcePriority({
      spec: params.spec,
      knowledgeProfile: params.knowledgeProfile,
      referencedAssets: params.referencedAssets,
      requirementText: params.requirementText,
    }),
    localeMode: params.spec.locale || resolveRequestedSiteLocale(params.requirementText),
    supportedLocales: Array.isArray(params.spec.supportedLocales)
      ? params.spec.supportedLocales.map((item) => String(item || "").trim()).filter(Boolean)
      : undefined,
    defaultLocale: String(params.spec.defaultLocale || "").trim() || undefined,
    visualDirectionId: sanitizeWorkflowArtifactText(params.spec.primaryVisualDirection || "prompt-adaptive", "visual direction"),
    designSystemId: normalizeDiscoveryDesignSystemId(params.spec),
    designSystemName: normalizeText((params.spec.designSystemInspiration as any)?.title || ""),
    immutableConstraints,
  };
  return {
    ...brief,
    ...assessWebsiteDiscoveryBrief(brief),
  };
}

function buildPromptControlManifest(
  plan: LocalDecisionPlan,
  routeSource: PromptControlManifest["routeSource"] = "prompt_draft_page_plan",
  requestedSiteLocale: RequestedSiteLocale = "en",
  discoveryBrief?: WebsiteDiscoveryBrief,
): PromptControlManifest {
  const htmlPaths = plan.pageBlueprints.map((page) => routeToHtmlPath(page.route));
  const localePlan = buildLocalePlan(plan.requirementText || "", requestedSiteLocale);
  const i18nPaths =
    requestedSiteLocale === "bilingual"
      ? [I18N_MESSAGE_EN_PATH, I18N_MESSAGE_ZH_CN_PATH]
      : requestedSiteLocale === "multilingual"
        ? [I18N_LOCALE_REGISTRY_PATH, localePlan.sourceCatalogPath]
        : [];
  return {
    schemaVersion: 1,
    promptKind: "canonical_website_prompt",
    routeSource,
    websiteSurfaceMode: discoveryBrief?.surfaceMode,
    visualDirectionId: discoveryBrief?.visualDirectionId,
    designSystemId: discoveryBrief?.designSystemId,
    routes: [...plan.routes],
    navLabels: plan.pageBlueprints.map((page) => internalNavLabelForRoute(page.route, page.navLabel)),
    files: Array.from(new Set(["/styles.css", "/script.js", ...i18nPaths, ...htmlPaths])),
    localeConfig:
      requestedSiteLocale === "bilingual" || requestedSiteLocale === "multilingual"
        ? {
            mode: localePlan.mode,
            defaultLocale: localePlan.defaultLocale,
            locales: localePlan.locales,
            translationDriven: localePlan.translationDriven,
            sourceCatalogPath: localePlan.sourceCatalogPath,
            registryPath: localePlan.translationDriven ? localePlan.registryPath : undefined,
          }
        : undefined,
    discoveryBrief,
    pageIntents: plan.pageBlueprints.map((page) => ({
      route: page.route,
      navLabel: internalNavLabelForRoute(page.route, page.navLabel),
      purpose: internalPurposeForRoute(page.route, page.purpose),
      source: page.source,
    })),
  };
}

function buildDiscoveryBriefSection(brief: WebsiteDiscoveryBrief): string {
  const lines = [
    "### Discovery Brief Lock",
    `- websiteSurfaceMode: ${brief.surfaceMode}`,
    `- audience: ${brief.audience.join(", ") || "prompt-adaptive"}`,
    `- primaryGoal: ${brief.primaryGoal || "prompt-adaptive"}`,
    `- routes: ${brief.routes.join(", ")}`,
    `- sourcePriority: ${brief.sourcePriority}`,
    `- localeMode: ${brief.localeMode}`,
    `- visualDirectionId: ${brief.visualDirectionId}`,
  ];
  if (brief.designSystemId) lines.push(`- designSystemId: ${brief.designSystemId}`);
  if (brief.designSystemName) lines.push(`- designSystemName: ${brief.designSystemName}`);
  if (brief.supportedLocales?.length) lines.push(`- supportedLocales: ${brief.supportedLocales.join(", ")}`);
  if (brief.defaultLocale) lines.push(`- defaultLocale: ${brief.defaultLocale}`);
  if (brief.immutableConstraints.length > 0) {
    lines.push(`- immutableConstraints: ${brief.immutableConstraints.join("; ")}`);
  }
  if (brief.confirmationStatus) lines.push(`- confirmationStatus: ${brief.confirmationStatus}`);
  if (brief.missingFields?.length) lines.push(`- missingFields: ${brief.missingFields.join(", ")}`);
  if (brief.assumptions?.length) lines.push(`- assumptions: ${brief.assumptions.join("; ")}`);
  return lines.join("\n");
}

function resolveRequestedSiteLocale(requirementText: string): RequestedSiteLocale {
  const localePlan = buildLocalePlan(requirementText);
  if (localePlan.mode === "multilingual") return "multilingual";
  const spec = buildRequirementSpec(requirementText, [requirementText]);
  if (spec.locale === "bilingual" || spec.locale === "zh-CN" || spec.locale === "en") {
    return spec.locale;
  }
  return /(?:\bbilingual\b|中英双语|双语|language\s+switch)/i.test(requirementText) ? "bilingual" : "en";
}

function ensureCanonicalPromptHasBilingualContract(
  draft: string,
  requestedSiteLocale: RequestedSiteLocale,
  displayLocale: PromptDraftDisplayLocale = "en",
): string {
  const normalizedDraft = normalizeText(draft);
  if (!normalizedDraft || (requestedSiteLocale !== "bilingual" && requestedSiteLocale !== "multilingual")) {
    return normalizedDraft;
  }
  if (
    /##\s*7\.35\s+(?:Bilingual Experience Contract|Locale & Translation Contract)\b/i.test(normalizedDraft)
  ) {
    return normalizedDraft;
  }
  const localePlan = buildLocalePlan(normalizedDraft, displayLocale === "zh" ? "zh-CN" : "en");
  const chineseFirst =
    displayLocale === "zh" ||
    /(?:default visible language is Chinese|Chinese-first|中文优先|默认中文|默认可见语言.*中文)/i.test(normalizedDraft);
  const visibleLanguageLabel = chineseFirst ? "Chinese" : "English";
  const strategyLabel = chineseFirst ? "Chinese-first" : "English-first";
  const section =
    requestedSiteLocale === "multilingual"
      ? [
          "## 7.35 Locale & Translation Contract",
          "",
          `- Requested site locale: multilingual output using a ${strategyLabel} translation-driven locale registry.`,
          `- Initial visible-language contract: the first generated website pass must render ${visibleLanguageLabel} visible copy only across nav, hero, CTAs, footer, forms, and core site sections.`,
          `- Initial implementation contract: generate stable \`data-i18n\` keys on translatable nodes plus \`${I18N_LOCALE_REGISTRY_PATH}\` and \`${localePlan.sourceCatalogPath}\` as the source catalog. Do not emit one HTML copy per locale.`,
          "- Translation contract: non-default locale JSON files belong to the translation pipeline. They should be generated from the source catalog without regenerating page structure, route HTML, or layout modules.",
          `- Keep the initial HTML shell ${strategyLabel} and lightweight. Locale expansion should happen through message catalogs and the locale registry, not duplicated HTML siblings or per-locale route trees.`,
          "- Locale-switch contract: only render a visible locale switch when the registry exists and at least one non-default locale has real translated copy for the shared-shell and page-core keys.",
          "- Blog/content workflows stay source-language in the first pass. Do not require the initial generation round to author long-form article bodies in every locale.",
        ].join("\n")
      : [
          "## 7.35 Bilingual Experience Contract",
          "",
          `- Requested site locale: bilingual EN/ZH using a ${strategyLabel} i18n-ready generation strategy.`,
          `- Initial visible-language contract: the first generated website pass must render ${visibleLanguageLabel} visible copy only across nav, hero, CTAs, footer, forms, and core non-blog site sections. Do not emit visible Chinese/English pairs in the same heading, paragraph, card, CTA, nav item, footer, or article body.`,
          "- Initial implementation contract: generate stable `data-i18n` keys on translatable nodes plus `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json` resource files. The alternate-locale file may start as a key-complete draft, but do not ship a visible EN/ZH switch unless the alternate locale already contains real translated copy for the core keys used on the page.",
          `- Keep the initial HTML shell ${strategyLabel} and lightweight. Alternate-language delivery should come from i18n resource files rather than duplicating page content inside HTML attributes or sibling DOM nodes.`,
          "- Add EN/ZH switch controls only when the runtime is prepared to swap visible copy via the i18n resource files while preserving the current route and language preference.",
          "- Blog/content workflows stay single-language in the first pass. Do not require EN/ZH switching inside blog cards, blog index pages, or blog/article detail pages during initial generation.",
          `- If a real i18n-backed language switch cannot be completed, keep the initial website ${visibleLanguageLabel.toLowerCase()}-only with the i18n resource files in place. Do not fake bilingual support with visible \`Chinese / English\` copy pairs.`,
        ].join("\n");
  const addendumIndex = normalizedDraft.search(/\n##\s*7\.5\s+External Research Addendum/i);
  if (addendumIndex >= 0) {
    return `${normalizedDraft.slice(0, addendumIndex).trimEnd()}\n\n${section}\n${normalizedDraft.slice(addendumIndex)}`;
  }
  return `${normalizedDraft}\n\n${section}`;
}

function isGenericFallbackSuggestedPages(profile?: WebsiteKnowledgeProfile): boolean {
  const routes = (profile?.suggestedPages || []).map((page) => page.route).join("|");
  return routes === "/|/about|/products|/cases|/contact";
}

function selectHighConfidenceSuggestedPages(profile?: WebsiteKnowledgeProfile) {
  return (profile?.suggestedPages || []).filter((page) => {
    const sourceKind = page.sourceKind || "structural_source";
    const confidence = page.confidence ?? (sourceKind === "fallback" ? 0.5 : 0.8);
    if (sourceKind === "fallback") return false;
    return confidence >= 0.72;
  });
}

function shouldUseKnowledgeSuggestedPages(profile?: WebsiteKnowledgeProfile): boolean {
  const candidatePages = selectHighConfidenceSuggestedPages(profile);
  if (!profile || candidatePages.length < 2) return false;
  if (isGenericFallbackSuggestedPages(profile)) return false;
  return profile.sourceMode === "uploaded_files" || profile.sourceMode === "domain" || profile.sourceMode === "mixed";
}

function buildPromptDecisionPlanFromKnowledgeProfile(
  requirementText: string,
  knowledgeProfile?: WebsiteKnowledgeProfile,
): { plan: LocalDecisionPlan; routeSource: PromptControlManifest["routeSource"] } {
  if (!shouldUseKnowledgeSuggestedPages(knowledgeProfile)) {
    return { plan: buildPromptDecisionPlan(requirementText), routeSource: "prompt_draft_page_plan" };
  }

  const candidatePages = selectHighConfidenceSuggestedPages(knowledgeProfile);
  const nav = candidatePages.map((page) => internalNavLabelForRoute(page.route, page.title)).join(" | ");
  const routeLines = candidatePages
    .map((page) => `- ${internalNavLabelForRoute(page.route, page.title)}: ${page.route}. ${internalPurposeForRoute(page.route, page.purpose)}`)
    .join("\n");
  const routeManifest = JSON.stringify(
    {
      routes: candidatePages.map((page) => page.route),
      navLabels: candidatePages.map((page) => internalNavLabelForRoute(page.route, page.title)),
      files: [
        "/styles.css",
        "/script.js",
        ...candidatePages.map((page) => routeToHtmlPath(page.route)),
      ],
    },
    null,
    2,
  );
  const sourcePlannedText = [
    requirementText,
    "",
    "Source-defined navigation:",
    nav,
    "",
    "Source-defined route plan:",
    routeLines,
    "",
    "Source-defined route manifest:",
    "```json",
    routeManifest,
    "```",
  ].join("\n");
  const plan = buildPromptDecisionPlan(sourcePlannedText);
  const suggestedRoutes = candidatePages.map((page) => page.route);
  const existingByRoute = new Map(plan.pageBlueprints.map((page) => [page.route, page]));
  plan.routes = [...suggestedRoutes];
  plan.navLabels = candidatePages.map((page) => internalNavLabelForRoute(page.route, page.title));
  plan.pageBlueprints = candidatePages.map((page) => {
    const existing = existingByRoute.get(page.route);
    if (existing) {
      return {
        ...existing,
        navLabel: internalNavLabelForRoute(page.route, page.title),
        purpose: internalPurposeForRoute(page.route, page.purpose || existing.purpose),
      };
    }
    return {
      route: page.route,
      navLabel: internalNavLabelForRoute(page.route, page.title),
      purpose: internalPurposeForRoute(page.route, page.purpose),
      source: "prompt_contract",
      constraints: ["Source-defined route from uploaded/domain material."],
      pageKind: page.route === "/" ? "home" : isContentCollectionRoute(page.route, page.purpose || page.title) ? "content-collection-index" : "intent",
      responsibility: internalPurposeForRoute(page.route, page.purpose),
      contentSkeleton: [],
      componentMix: { hero: 18, feature: 22, grid: 20, proof: 18, form: 8, cta: 14 },
    };
  });
  plan.pageIntents = [...plan.pageBlueprints];
  return { plan, routeSource: "uploaded_source_page_plan" };
}

function extractMarkdownSection(content: string, heading: string): string {
  const marker = heading.trim();
  const start = content.indexOf(marker);
  if (start < 0) return "";
  const afterStart = start + marker.length;
  const nextHeading = content.slice(afterStart).search(/\n#{2,4}\s+/);
  const end = nextHeading >= 0 ? afterStart + nextHeading : content.length;
  return content.slice(start, end).trim();
}

async function loadWebsiteWorkflowContractSummary(): Promise<string> {
  try {
    const skill = await loadProjectSkill("website-generation-workflow");
    const content = String(skill.content || "");
    return [
      extractMarkdownSection(content, "### Phase 0.25: Canonical Prompt Confirmation Gate (Mandatory)"),
      extractMarkdownSection(content, "### Phase 0.25: Prompt Draft Confirmation Gate (Mandatory)"),
      extractMarkdownSection(content, "#### Evidence Brief Contract (Mandatory)"),
      extractMarkdownSection(content, "#### Page Differentiation Contract (Mandatory)"),
      extractMarkdownSection(content, "#### Shared Shell/Footer Contract (Mandatory)"),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 5200);
  } catch {
    return "";
  }
}

function buildPromptControlManifestSection(
  requirementText: string,
  workflowContractSummary = "",
  plan = buildPromptDecisionPlan(requirementText),
  routeSource: PromptControlManifest["routeSource"] = "prompt_draft_page_plan",
  discoveryBrief?: WebsiteDiscoveryBrief,
): string {
  const needsConsultationForm = /(?:consultation|intake|clarification|contact|inquiry)\s+form|form\s+with\s+name,\s*organization,\s*email,\s*topic,\s*and\s*message|咨询(?:表单|收集|入口|需求)|咨询.*(?:姓名|机构|单位|邮箱|主题|留言)|customer_inquiry_form|contact_form/i.test(
    String(requirementText || ""),
  );
  const plannedRoutes = new Set((plan.routes || []).map((route) => String(route || "").trim().toLowerCase()));
  const consultationHostRoutes = plan.pageBlueprints
    .filter((page) => {
      const route = String(page.route || "").trim().toLowerCase();
      const label = String(page.navLabel || "").trim().toLowerCase();
      if (/(?:^|\/)(contact|inquiry|get-in-touch)(?:\/|$)|\bcontact\b|\binquiry\b/i.test(`${route} ${label}`)) return true;
      if (/(?:information-platform|information|resource|resources|downloads?|support|help|library)/i.test(`${route} ${label}`))
        return true;
      return route === "/" && !plannedRoutes.has("/contact");
    })
    .map((page) => page.route);
  const requestedSiteLocale = resolveRequestedSiteLocale(requirementText);
  const localePlan = buildLocalePlan(requirementText, requestedSiteLocale);
  const promptControlManifest = buildPromptControlManifest(plan, routeSource, requestedSiteLocale, discoveryBrief);
  const fixedFileLines = promptControlManifest.files.map((file) => `- ${file}`);
  const pageLines = plan.pageBlueprints.flatMap((page, index) => [
    `${index + 1}. ${internalNavLabelForRoute(page.route, page.navLabel)} (${page.route} -> ${routeToHtmlPath(page.route)})`,
    `   - Page intent: ${internalPurposeForRoute(page.route, page.purpose)}`,
    `   - Route source: ${page.source}`,
    `   - Page kind: ${page.pageKind}`,
    ...(page.constraints.length ? page.constraints.map((item) => `   - Constraint: ${item}`) : []),
    ...(needsConsultationForm && consultationHostRoutes.includes(page.route)
      ? [
          "   - Constraint: This route is an approved host for the required consultation intake. Materialize one real HTML `<form>` with fields for name, organization/company, email, topic/subject, and message. Search/filter controls, CTA buttons, and mailto links do not satisfy this requirement.",
        ]
      : []),
    ...(page.contentSkeleton.length ? page.contentSkeleton.map((item) => `   - Required module: ${item}`) : []),
    "   - Derive page-specific sections, content depth, and interactions from the Canonical Website Prompt and source material.",
    "   - Do not apply a hardcoded industry skeleton or reuse another page by only replacing text.",
  ]);

  return [
    "## 3.5 Prompt Control Manifest (Mandatory)",
    "",
    "This section is a thin machine-readable control manifest. It is not the website content plan.",
    "The canonical website prompt outside this section remains authoritative for brand semantics, source facts, page content depth, design direction, copy, and interactions.",
    "",
    "### Fixed Pages And File Output",
    ...fixedFileLines,
    "",
    "### Prompt Control Manifest (Machine Readable)",
    "```json",
    JSON.stringify(promptControlManifest, null, 2),
    "```",
    "",
    ...(discoveryBrief ? [buildDiscoveryBriefSection(discoveryBrief), ""] : []),
    "- Generate only the pages and shared assets listed above. Do not add unlisted pages such as /downloads, /open, or /js.",
    "- All pages share /styles.css and /script.js, but each page body must be planned from its own route intent.",
    "- Page differentiation and shared shell/footer requirements are governed by website-generation-workflow SKILL.md.",
    "- Navigation links must point only to the fixed pages above. The current page nav item must have a recognizable active state.",
    "- Shared-shell navigation labels must stay concise and visitor-facing. If source page titles repeat a brand prefix or end with container words such as Center, Platform, or System, collapse the visible nav label to the shortest natural single-word destination that still preserves route meaning.",
    ...(requestedSiteLocale === "multilingual"
      ? [
          `- Locale contract: this site is translation-driven multilingual with ${localePlan.defaultLocale} as the default visible language. Generate one shared HTML structure, \`${I18N_LOCALE_REGISTRY_PATH}\`, and \`${localePlan.sourceCatalogPath}\` as the source catalog; do not generate one route tree per locale.`,
          "- Locale contract: visible locale switching is optional in the first pass and should appear only when non-default locale dictionaries contain real translated copy.",
        ]
      : requestedSiteLocale === "bilingual"
        ? [
            "- Locale contract: render a real EN/ZH switch only when the site is explicitly bilingual and the i18n resource files are present.",
          ]
        : [
            `- Locale contract: this site is ${requestedSiteLocale === "zh-CN" ? "single-language Chinese-first" : "single-language English-first"}. Do not emit an EN/ZH switch, bilingual resource files, or hidden alternate-language shell payloads.`,
          ]),
    "- Canonical Website Prompt is the authoritative source for website type, audience, content scope, page structure, and design direction.",
    "- The executor must not substitute product, fintech, industrial, or other preset content when the source material defines a different site.",
    ...(workflowContractSummary ? ["", "### Workflow Skill Contract (Authoritative Rules)", workflowContractSummary] : []),
    "",
    "### Page-Level Intent Contract",
    ...pageLines,
    "",
    "### Shared Shell Destination Contract",
    "- The homepage footer must enumerate the full confirmed shared destination set for this run. Do not reduce it to a CTA-only subset, a category-only subset, or a partial route sample.",
    "- Every interior route footer must preserve the same planned shared footer destinations defined by the home page. Do not drop route links from the footer on interior pages, even when regrouping them under different headings.",
    "- Shared footer consistency must not flatten page bodies into one repeated split-hero template. Keep the shell consistent while giving sibling routes distinct first-screen structures.",
    ...(needsConsultationForm
      ? [
          "",
          "### Consultation Capture Contract",
          "- This run requires at least one real consultation intake form in the generated site.",
          "- Preferred host routes are the dedicated contact route when present; otherwise use the primary information/resource route or the homepage.",
          "- The form must be a real HTML `<form>` with name, organization/company, email, topic/subject, and message fields.",
          "- Search boxes, filters, newsletter fields, CTA buttons, and mailto links do not satisfy the consultation capture requirement.",
        ]
      : []),
    "",
    "### Home Hero Layout Safety",
    "- Hero text, stats panels, CTAs, and media must not overlap.",
    "- The H1 must use clamp(), a sane line-height, max-width, and overflow-wrap: anywhere.",
    "- Desktop may use a two-column layout. Below 1100px it must switch to a single column.",
    "- Data/card areas in the hero may use at most two columns, and must become one column on mobile.",
    "- Do not stack primary hero content with absolute positioning that can cause text and cards to overlap.",
    "",
    "### Page Repetition Constraints",
    "- No two inner pages may have the exact same section class order, card type order, or primary content layout.",
    "- Page class names and interactions should describe the actual route intent and source content, not generic template categories.",
  ].join("\n");
}

function stripLegacyPageDifferentiationBlueprint(draft: string): string {
  const headingMatch = draft.match(/^##\s*3\.5\b.*$/im);
  if (!headingMatch || headingMatch.index === undefined) return draft;
  const heading = headingMatch[0] || "";
  if (/Prompt Control Manifest/i.test(heading)) return draft;
  const start = headingMatch.index;
  if (start < 0) return draft;
  const before = draft.slice(0, start).trimEnd();
  const afterStart = start + heading.length;
  const nextTopLevelHeading = draft.slice(afterStart).search(/\n##\s+(?!3\.5\b)/);
  const after =
    nextTopLevelHeading >= 0
      ? draft.slice(afterStart + nextTopLevelHeading).trimStart()
      : "";
  return [before, after].filter(Boolean).join("\n\n").trim();
}

function enrichCanonicalPromptWithControlManifest(
  draft: string,
  requirementText: string,
  workflowContractSummary = "",
  plan?: LocalDecisionPlan,
  routeSource: PromptControlManifest["routeSource"] = "prompt_draft_page_plan",
  discoveryBrief?: WebsiteDiscoveryBrief,
): string {
  const normalizedDraft = normalizeText(draft);
  if (!normalizedDraft) {
    return buildPromptControlManifestSection(requirementText, workflowContractSummary, plan, routeSource, discoveryBrief);
  }
  const draftWithoutLegacy = stripLegacyPageDifferentiationBlueprint(normalizedDraft);
  if (
    /##\s*3\.5\s+Prompt Control Manifest/i.test(draftWithoutLegacy) &&
    draftWithoutLegacy.includes("### Prompt Control Manifest (Machine Readable)")
  ) {
    return draftWithoutLegacy;
  }

  const contractSection = buildPromptControlManifestSection(
    requirementText,
    workflowContractSummary,
    plan,
    routeSource,
    discoveryBrief,
  );
  if (/##\s*3\.5\s+Prompt Control Manifest/i.test(draftWithoutLegacy)) {
    return `${draftWithoutLegacy}\n\n${contractSection}`;
  }
  const insertionPoint = draftWithoutLegacy.indexOf("\n## 4.");
  if (insertionPoint >= 0) {
    return `${draftWithoutLegacy.slice(0, insertionPoint)}\n\n${contractSection}\n${draftWithoutLegacy.slice(insertionPoint)}`;
  }
  return `${draftWithoutLegacy}\n\n${contractSection}`;
}

function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function resolveDraftProviderConfig(): { config?: DraftProviderConfig; reason?: string } {
  const lock = resolveRunProviderLock({
    provider: process.env.CHAT_DRAFT_PROVIDER || process.env.SKILL_NATIVE_PROVIDER_LOCK,
    model: process.env.CHAT_DRAFT_MODEL || process.env.SKILL_NATIVE_MODEL_LOCK,
  });

  if (lock.provider === "pptoken") {
    const apiKey = normalizeText(process.env.PPTOKEN_API_KEY);
    if (!apiKey) return { reason: "missing_provider_api_key:pptoken" };
    return {
      config: {
        provider: "pptoken",
        apiKey,
        baseURL: normalizeText(process.env.PPTOKEN_BASE_URL) || "https://api.pptoken.org/v1",
        model:
          normalizeText(process.env.CHAT_DRAFT_MODEL) ||
          normalizeText(lock.model) ||
          normalizeText(process.env.LLM_MODEL) ||
          normalizeText(process.env.LLM_MODEL_PPTOKEN) ||
          normalizeText(process.env.PPTOKEN_MODEL) ||
          "gpt-5.4-mini",
        fallbackModel:
          normalizeText(process.env.CHAT_DRAFT_FALLBACK_MODEL) ||
          normalizeText(process.env.LLM_MODEL_FALLBACK_PPTOKEN) ||
          undefined,
      },
    };
  }

  if (lock.provider === "aiberm") {
    const apiKey = normalizeText(process.env.AIBERM_API_KEY);
    if (!apiKey) return { reason: "missing_provider_api_key:aiberm" };
    return {
      config: {
        provider: "aiberm",
        apiKey,
        baseURL: normalizeText(process.env.AIBERM_BASE_URL) || "https://aiberm.com/v1",
        model:
          normalizeText(process.env.CHAT_DRAFT_MODEL) ||
          normalizeText(lock.model) ||
          normalizeText(process.env.LLM_MODEL) ||
          normalizeText(process.env.LLM_MODEL_AIBERM) ||
          normalizeText(process.env.AIBERM_MODEL) ||
          "gpt-5.4-mini",
        fallbackModel:
          normalizeText(process.env.CHAT_DRAFT_FALLBACK_MODEL) ||
          normalizeText(process.env.LLM_MODEL_FALLBACK_AIBERM) ||
          undefined,
      },
    };
  }

  const crazyrouteKey =
    normalizeText(process.env.CRAZYROUTE_API_KEY) ||
    normalizeText(process.env.CRAZYROUTER_API_KEY) ||
    normalizeText(process.env.CRAZYREOUTE_API_KEY);
  if (!crazyrouteKey) return { reason: "missing_provider_api_key:crazyroute" };
  return {
    config: {
      provider: "crazyroute",
      apiKey: crazyrouteKey,
      baseURL:
        normalizeText(process.env.CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTER_BASE_URL) ||
        normalizeText(process.env.CRAZYREOUTE_BASE_URL) ||
        "https://crazyrouter.com/v1",
      model:
        normalizeText(process.env.CHAT_DRAFT_MODEL) ||
        normalizeText(lock.model) ||
        normalizeText(process.env.LLM_MODEL) ||
        normalizeText(process.env.LLM_MODEL_CRAZYROUTE) ||
        normalizeText(process.env.LLM_MODEL_CRAZYROUTER) ||
        normalizeText(process.env.LLM_MODEL_CRAZYREOUTE) ||
        normalizeText(process.env.CRAZYROUTE_MODEL) ||
        normalizeText(process.env.CRAZYROUTER_MODEL) ||
        normalizeText(process.env.CRAZYREOUTE_MODEL) ||
        "gpt-5.4-mini",
      fallbackModel:
        normalizeText(process.env.CHAT_DRAFT_FALLBACK_MODEL) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYROUTE) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYROUTER) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYREOUTE) ||
        undefined,
    },
  };
}

function shouldSkipNetworkInCurrentEnv(): { skip: boolean; reason?: string } {
  if (process.env.NODE_ENV === "test") {
    return { skip: true, reason: "test_environment_skip_network" };
  }
  return { skip: false };
}

function shouldEnableWebSearch(): boolean {
  return String(process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED || "1").trim() !== "0";
}

function shouldEnableLlmDraft(): boolean {
  return String(process.env.CHAT_DRAFT_LLM_ENABLED || "1").trim() !== "0";
}

function normalizeSources(rawSources: any): PromptDraftSource[] {
  if (!Array.isArray(rawSources)) return [];
  const seen = new Set<string>();
  const sources: PromptDraftSource[] = [];
  for (const row of rawSources) {
    const title = normalizeText(row?.title).slice(0, 160);
    const url = normalizeText(row?.url || row?.link);
    const snippet = normalizeText(row?.snippet).slice(0, 320);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: title || url,
      url,
      ...(snippet ? { snippet } : {}),
    });
  }
  return sources.slice(0, 8);
}

function extractChatCompletionText(rawContent: unknown): string {
  if (typeof rawContent === "string") return normalizeText(rawContent);
  if (Array.isArray(rawContent)) {
    const chunks = rawContent
      .map((item: any) => normalizeText(item?.text || item?.content || item))
      .filter(Boolean);
    return chunks.join("\n").trim();
  }
  if (rawContent && typeof rawContent === "object") {
    return normalizeText((rawContent as any).text || (rawContent as any).content);
  }
  return "";
}

function extractDomainsFromRequirement(requirementText: string): string[] {
  const matches = normalizeText(requirementText).match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi);
  if (!matches) return [];
  const blockedExtensions = new Set(["css", "gif", "ico", "jpeg", "jpg", "js", "json", "png", "svg", "webp"]);
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const match of matches) {
    const domain = match.toLowerCase().replace(/^www\./, "");
    const extension = domain.split(".").pop() || "";
    if (blockedExtensions.has(extension)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains.slice(0, 3);
}

function stripFencedBlocks(text: string): string {
  return normalizeText(text).replace(/```[\s\S]*?```/g, " ");
}

function buildSearchableRequirementText(requirementText: string): string {
  const withoutBlocks = stripFencedBlocks(requirementText);
  const lines = withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[Requirement Form\]$/i.test(line))
    .filter((line) => !/^(?:\{|\}|\]|\[|")/.test(line));
  const normalized = lines.join(" ").replace(/\s+/g, " ").trim();
  return normalized || normalizeText(requirementText).replace(/\s+/g, " ");
}

function hasExplicitUrlExtractionIntent(text: string): boolean {
  const normalized = String(text || "");
  return /(?:提取|抓取|读取|参考|按.*网站|extract|crawl|scrape|use .* as (?:the )?(?:main )?source|based on .*website|reference .*website)/i.test(
    normalized,
  );
}

function hasExplicitUploadedSourceIntent(text: string): boolean {
  const normalized = String(text || "");
  return /(?:附件|上传|文档|PDF|材料|根据附件|根据上传|uploaded|upload|attachment|document|materials?)/i.test(
    normalized,
  );
}

function buildSourceEnrichmentPlan(params: {
  requirementText: string;
  spec: RequirementSpec;
  referencedAssets?: string[];
}): SourceEnrichmentPlan {
  const sufficiency = assessUserInputSufficiency(params.requirementText, params.spec, params.referencedAssets);
  const explicitUrls = extractExplicitUrlsFromRequirement(params.requirementText);
  const hasUploadedAssets = (params.referencedAssets || []).length > 0;
  const contentSources = new Set((params.spec.contentSources || []).map((item) => String(item || "").trim()));
  const explicitUrlIntent = explicitUrls.length > 0 && hasExplicitUrlExtractionIntent(params.requirementText);
  const explicitUploadIntent = hasUploadedAssets && hasExplicitUploadedSourceIntent(params.requirementText);
  const shouldUseUploadedAssets = hasUploadedAssets && (explicitUploadIntent || !sufficiency.sufficient);
  const shouldUseUrlExtraction = explicitUrls.length > 0 && (explicitUrlIntent || !sufficiency.sufficient);
  const shouldUseDomainSources =
    (contentSources.has("existing_domain") || explicitUrls.length > 0) &&
    (explicitUrlIntent || !sufficiency.sufficient);
  const shouldUseWebSearch = !sufficiency.sufficient;

  const reasons: string[] = [];
  if (!sufficiency.sufficient) {
    reasons.push(`input_insufficient:${sufficiency.missing.join(",") || "unknown"}`);
  }
  if (shouldUseUploadedAssets) reasons.push(explicitUploadIntent ? "explicit_uploaded_source_reference" : "uploaded_assets_fill_gaps");
  if (shouldUseUrlExtraction) reasons.push(explicitUrlIntent ? "explicit_url_extraction_request" : "url_fill_gaps");
  if (shouldUseDomainSources) reasons.push(explicitUrlIntent ? "explicit_domain_source_request" : "domain_fill_gaps");
  if (shouldUseWebSearch) reasons.push("web_search_fill_gaps");

  return {
    shouldUseUrlExtraction,
    shouldUseDomainSources,
    shouldUseUploadedAssets,
    shouldUseWebSearch,
    reasons,
  };
}

function buildSerperQueries(requirementText: string, slots: RequirementSlot[], maxQueries: number): string[] {
  const suggestions: string[] = buildWebsiteSearchQueries(requirementText, maxQueries);
  const hasVisual = slots.some((slot) => slot.key === "visual-system" && slot.filled);
  const hasSitemap = slots.some((slot) => slot.key === "sitemap-pages" && slot.filled);

  const first = suggestions[0]?.replace(/^site:/i, "") || "";
  if (!hasVisual && first) suggestions.push(`${first} brand style guide examples`);
  if (!hasSitemap && first) suggestions.push(`${first} sitemap pages for company website`);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const query of suggestions) {
    const compact = normalizeText(query);
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(compact);
  }
  return deduped.slice(0, maxQueries);
}

export function buildSerperQueriesForTesting(
  requirementText: string,
  slots: RequirementSlot[],
  maxQueries: number,
): string[] {
  return buildSerperQueries(requirementText, slots, maxQueries);
}

export function buildPromptControlManifestForTesting(requirementText: string): PromptControlManifest {
  const spec = buildRequirementSpec(requirementText, [requirementText]);
  const plan = buildPromptDecisionPlan(requirementText);
  const discoveryBrief = buildWebsiteDiscoveryBrief({
    requirementText,
    spec,
    decisionPlan: plan,
  });
  return buildPromptControlManifest(plan, "prompt_draft_page_plan", resolveRequestedSiteLocale(requirementText), discoveryBrief);
}

export function buildPromptControlManifestFromKnowledgeProfileForTesting(
  requirementText: string,
  knowledgeProfile: WebsiteKnowledgeProfile,
): PromptControlManifest {
  const decision = buildPromptDecisionPlanFromKnowledgeProfile(requirementText, knowledgeProfile);
  const spec = buildRequirementSpec(requirementText, [requirementText]);
  const discoveryBrief = buildWebsiteDiscoveryBrief({
    requirementText,
    spec,
    decisionPlan: decision.plan,
    knowledgeProfile,
  });
  return buildPromptControlManifest(decision.plan, decision.routeSource, resolveRequestedSiteLocale(requirementText), discoveryBrief);
}

export function enrichCanonicalPromptWithControlManifestForTesting(draft: string, requirementText: string): string {
  return enrichCanonicalPromptWithControlManifest(draft, requirementText);
}

export function ensureCanonicalPromptHasBilingualContractForTesting(
  draft: string,
  requestedSiteLocale: RequestedSiteLocale,
  displayLocale: PromptDraftDisplayLocale = "en",
): string {
  return ensureCanonicalPromptHasBilingualContract(draft, requestedSiteLocale, displayLocale);
}

export function mergeTemplateWithKnowledgeProfileForTesting(
  localDraft: string,
  knowledgeProfile: WebsiteKnowledgeProfile,
): string {
  const evidenceBrief = buildWebsiteEvidenceBrief(knowledgeProfile);
  return mergeTemplateWithResearch(
    localDraft,
    mapKnowledgeSourcesToPromptSources(knowledgeProfile),
    knowledgeProfile.summary,
    knowledgeProfile,
    evidenceBrief,
  );
}

export function buildSourceEnrichmentPlanForTesting(params: {
  requirementText: string;
  referencedAssets?: string[];
}): SourceEnrichmentPlan {
  return buildSourceEnrichmentPlan({
    requirementText: params.requirementText,
    spec: buildRequirementSpec(params.requirementText, [params.requirementText]),
    referencedAssets: params.referencedAssets,
  });
}

async function collectSerperResearch(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs: number;
  maxQueries: number;
  searchConfig?: SerperSearchConfig;
}): Promise<{ sources: PromptDraftSource[]; summary: string }> {
  const queries = buildSerperQueries(params.requirementText, params.slots, params.maxQueries);
  if (queries.length === 0) return { sources: [], summary: "" };

  const batch = await searchSerperBatch(queries, {
    config: params.searchConfig,
    timeoutMs: Math.max(4_000, params.timeoutMs),
  });
  const rawSources: WebSearchSource[] = [];
  for (const row of batch) {
    rawSources.push(...(row.sources || []));
  }
  const sources = normalizeSources(rawSources);
  const summary = sources
    .slice(0, 4)
    .map((item) => normalizeText(item.snippet))
    .filter(Boolean)
    .join(" ")
    .slice(0, 480);
  return { sources, summary };
}

function mergeTemplateWithResearch(
  localDraft: string,
  sources: PromptDraftSource[],
  summary: string,
  knowledgeProfile?: WebsiteKnowledgeProfile,
  evidenceBrief?: WebsiteEvidenceBrief,
  requestedSiteLocale: RequestedSiteLocale = "en",
  displayLocale: PromptDraftDisplayLocale = "en",
): string {
  const seededDraft = ensureCanonicalPromptHasBilingualContract(localDraft, requestedSiteLocale, displayLocale);
  if (sources.length === 0 && !summary && !knowledgeProfile && !evidenceBrief) return seededDraft;
  const refs = sources
    .slice(0, 6)
    .map((source, idx) => {
      const title = sanitizeWorkflowArtifactText(source.title, `Source ${idx + 1}`);
      const location = isWorkflowArtifactEnglishSafe(source.url) || /^https?:\/\//i.test(source.url || "")
        ? source.url
        : `source-reference-${idx + 1}`;
      return `${idx + 1}. ${title} - ${location}`;
    })
    .join("\n");
  const safeSummary = sanitizeWorkflowArtifactText(
    summary,
    "English-normalized search summary unavailable; rely on the evidence brief and source-backed profile.",
  );
  const resolvedEvidenceBrief =
    evidenceBrief || (knowledgeProfile ? buildWebsiteEvidenceBrief(knowledgeProfile) : undefined);
  const evidenceLines = resolvedEvidenceBrief ? [formatWebsiteEvidenceBrief(resolvedEvidenceBrief), ""] : [];
  const sourceAppendix = formatSourceMaterialAppendix(knowledgeProfile);
  const sourceAppendixLines = sourceAppendix ? [sourceAppendix, ""] : [];
  return [
    seededDraft,
    "",
    ...evidenceLines,
    ...sourceAppendixLines,
    "## 7.5 External Research Addendum",
    safeSummary ? `- Search summary: ${safeSummary}` : "- Search summary: none",
    refs ? "- Reference sources:\n" + refs : "- Reference sources: none",
    knowledgeProfile ? "" : "",
    knowledgeProfile ? formatWebsiteKnowledgeProfile(knowledgeProfile) : "",
  ].join("\n");
}

function formatSourceMaterialAppendix(knowledgeProfile?: WebsiteKnowledgeProfile): string {
  const sourceEntries = (knowledgeProfile?.sources || [])
    .filter((source) => source.confidence >= 0.65 && normalizeText(source.snippet))
    .slice(0, 4);
  if (sourceEntries.length === 0) return "";

  let remaining = SOURCE_MATERIAL_APPENDIX_TOTAL_LIMIT;
  const blocks: string[] = [];
  for (const [index, source] of sourceEntries.entries()) {
    if (remaining <= 0) break;
    const rawLocation = normalizeText(source.url || source.fileName);
    const location = isWorkflowArtifactEnglishSafe(rawLocation) || /^https?:\/\//i.test(rawLocation) ? rawLocation : "";
    const title = sanitizeWorkflowArtifactText(source.title || location, `Source ${index + 1}`);
    const snippet = normalizeText(source.snippet)
      .replace(/```/g, "'''")
      .slice(0, Math.min(SOURCE_MATERIAL_APPENDIX_PER_SOURCE_LIMIT, remaining));
    remaining -= snippet.length;
    if (!snippet) continue;
    blocks.push(
      [
        `### Source ${index + 1}: [${source.type}] ${title}`,
        location ? `- Location: ${location}` : "",
        `- Confidence: ${source.confidence.toFixed(2)}`,
        "- Internal note: keep route semantics, terminology, and component requirements aligned with the source artifact. Preserve multilingual source meaning through English summaries when the raw excerpt is not workflow-safe.",
        `- Excerpt summary: ${summarizeWorkflowSourceText(
          snippet,
          "Source excerpt requires a conservative English summary before generation.",
        )}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (blocks.length === 0) return "";

  return [
    "## 7.25 Source Material Appendix (Internal Generation Input)",
    "Use these excerpts to preserve source-defined page content, structure, terminology, components, and visual direction. They are internal generation inputs; do not render appendix labels, source notes, or raw analysis markers as visitor-facing copy.",
    "",
    ...blocks,
  ].join("\n\n");
}

function ensureCanonicalPromptHasEvidenceBrief(draft: string, evidenceBrief?: WebsiteEvidenceBrief): string {
  const normalizedDraft = normalizeText(draft);
  if (!evidenceBrief || !normalizedDraft || /##\s*7\.\s+Evidence Brief/i.test(normalizedDraft)) {
    return normalizedDraft;
  }
  const evidenceSection = formatWebsiteEvidenceBrief(evidenceBrief);
  const addendumIndex = normalizedDraft.search(/\n##\s*7\.5\s+External Research Addendum/i);
  if (addendumIndex >= 0) {
    return `${normalizedDraft.slice(0, addendumIndex).trimEnd()}\n\n${evidenceSection}\n${normalizedDraft.slice(addendumIndex)}`;
  }
  return `${normalizedDraft}\n\n${evidenceSection}`;
}

function ensureCanonicalPromptHasSourceMaterialAppendix(
  draft: string,
  knowledgeProfile?: WebsiteKnowledgeProfile,
): string {
  const normalizedDraft = normalizeText(draft);
  const appendix = formatSourceMaterialAppendix(knowledgeProfile);
  if (!appendix || !normalizedDraft || /##\s*7\.25\s+Source Material Appendix\b/i.test(normalizedDraft)) {
    return normalizedDraft;
  }
  const addendumIndex = normalizedDraft.search(/\n##\s*7\.5\s+External Research Addendum/i);
  if (addendumIndex >= 0) {
    return `${normalizedDraft.slice(0, addendumIndex).trimEnd()}\n\n${appendix}\n${normalizedDraft.slice(addendumIndex)}`;
  }
  return `${normalizedDraft}\n\n${appendix}`;
}

function looksLikeTemplateDraft(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const headingCount = (normalized.match(/^##\s+/gm) || []).length;
  if (headingCount >= 4) return true;
  return normalized.includes("## 1.") && normalized.includes("## 2.");
}

function resolveDraftLlmTimeoutMs(timeoutMs?: number): number {
  return Math.max(8_000, Number(process.env.CHAT_DRAFT_LLM_TIMEOUT_MS || timeoutMs || 45_000));
}

function resolveDraftMaxTokens(compact = false): number {
  const configured = Number(process.env.CHAT_DRAFT_MAX_TOKENS || 1400);
  const bounded = Math.max(600, Math.min(2600, Number.isFinite(configured) ? configured : 1400));
  return compact ? Math.max(600, Math.min(1200, bounded)) : bounded;
}

async function requestPromptDraftWithLlm(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs: number;
  config: DraftProviderConfig;
  templateDraft: string;
  workflowContractSummary: string;
  decisionPlan: LocalDecisionPlan;
  routeSource: PromptControlManifest["routeSource"];
  discoveryBrief: WebsiteDiscoveryBrief;
  researchSources: PromptDraftSource[];
  researchSummary: string;
  evidenceBrief?: WebsiteEvidenceBrief;
  knowledgeProfile?: WebsiteKnowledgeProfile;
  displayLocale?: PromptDraftDisplayLocale;
  requestedSiteLocale?: RequestedSiteLocale;
}): Promise<PromptDraftBuildResult | undefined> {
  const model = normalizeText(params.config.model) || "openai/gpt-5.4-mini";
  const fallbackModel = normalizeText(params.config.fallbackModel);
  const client = new OpenAI({
    apiKey: params.config.apiKey,
    baseURL: params.config.baseURL,
  });
  const timeoutMs = resolveDraftLlmTimeoutMs(params.timeoutMs);
  const completion = `${params.slots.filter((slot) => slot.filled).length}/${params.slots.length}`;
  const missingLabels = params.slots.filter((slot) => !slot.filled).map((slot) => slot.label);
  const displayLocale = params.displayLocale === "zh" ? "zh" : "en";
  const requestedSiteLocale = params.requestedSiteLocale || "en";
  const localePlan = buildLocalePlan(params.requirementText, requestedSiteLocale);
  const targetLanguage = "English for internal workflow artifacts";
  const languagePreservationRule = [
    "- Write the entire canonical prompt, workflow instructions, assumptions, page descriptions, and process notes in English only.",
    "- Do not mirror the user's preferred website locale into the language of the internal prompt artifact.",
    requestedSiteLocale === "multilingual"
      ? `- Express the final website locale requirement explicitly as translation-driven multilingual site output with ${localePlan.defaultLocale} as the default visible language, while keeping the planning artifact itself in English.`
      : requestedSiteLocale === "bilingual"
        ? `- Express the final website locale requirement explicitly as bilingual EN/ZH site output with ${localePlan.defaultLocale} as the default visible language, while keeping the planning artifact itself in English.`
      : `- Express the final website locale requirement explicitly as ${displayLocale === "zh" ? "Chinese-facing site output" : "English-facing site output"} while keeping the planning artifact itself in English.`,
    "- Keep filenames, routes, CSS/JS identifiers, code-like tokens, and product/brand names unchanged.",
  ].join(" ");

  const fullResearchBlock =
    params.researchSources.length > 0
      ? params.researchSources
          .slice(0, 6)
          .map((item, idx) => `${idx + 1}. ${item.title} | ${item.url} | ${item.snippet || ""}`)
          .join("\n")
    : "(none)";
  const evidenceBriefBlock = params.evidenceBrief
    ? formatWebsiteEvidenceBrief(params.evidenceBrief)
    : params.knowledgeProfile
      ? formatWebsiteEvidenceBrief(buildWebsiteEvidenceBrief(params.knowledgeProfile))
      : "(none)";

  async function runSingleAttempt(attempt: {
    model: string;
    compact: boolean;
  }): Promise<{
    rawDraft: string;
    parsed?: { canonicalPrompt?: string; researchSummary?: string; sources?: any[] };
  }> {
    const templateSlice = attempt.compact ? params.templateDraft.slice(0, 2200) : params.templateDraft;
    const compactResearchBlock =
      params.researchSources.length > 0
        ? params.researchSources
            .slice(0, 2)
            .map((item, idx) => `${idx + 1}. ${item.title} | ${item.url}`)
            .join("\n")
        : "(none)";

    const responsePromise = client.chat.completions.create({
      model: attempt.model,
      temperature: 0.2,
      max_tokens: resolveDraftMaxTokens(attempt.compact),
      messages: [
        {
          role: "system",
          content:
            `You are a senior website prompt architect. Output strict JSON only. Rebuild a complete canonical website generation prompt in ${targetLanguage}. The markdown prompt must preserve the source-material richness of a professional page-by-page generation brief, not a compressed structured spec.`,
        },
        {
          role: "user",
          content: [
            "User requirement:",
            params.requirementText || "(empty)",
            "",
            `Requirement completion: ${completion}`,
            `Missing slots: ${missingLabels.join(" / ") || "none"}`,
            "",
            "Template draft (must follow this structure style):",
            "```markdown",
            templateSlice,
            "```",
            "",
            "Web search findings (Serper):",
            params.researchSummary || "(none)",
            attempt.compact ? compactResearchBlock : fullResearchBlock,
            "",
            "Evidence Brief:",
            evidenceBriefBlock,
            "",
            "Website knowledge profile:",
            params.knowledgeProfile ? formatWebsiteKnowledgeProfile(params.knowledgeProfile) : "(none)",
            "",
            "Return JSON with shape:",
            "{",
            `  "canonicalPrompt": "string: complete markdown website generation prompt in ${targetLanguage}, rich enough to directly drive website generation",`,
            '  "researchSummary": "string: short summary of what web findings changed",',
            '  "sources": [{ "title": "string", "url": "https://...", "snippet": "string" }]',
            "}",
            "",
            "Rules:",
            "- Keep markdown section headings and expand the content into a canonical website generation prompt.",
            languagePreservationRule,
            "- Use user constraints directly, avoid generic wording.",
            "- Use the uploaded/domain/source facts as high-confidence website content. Do not replace source-defined websites with generic product, SaaS, fintech, industrial, or e-commerce assumptions.",
            "- Every planned page needs a concrete page-level prompt: page goal, audience intent, section order, required facts/copy, components, interactions, and visual treatment.",
            "- For missing information, follow the workflow skill's Evidence Brief and visitor-facing copy contracts. Do not invent brand-owned proof points.",
            "- Preserve and refine the 'Prompt Control Manifest' section; do not delete its fixed file list, routes, or page intent contract.",
            "- Preserve the 'Prompt Control Manifest (Machine Readable)' JSON block exactly as the authoritative route/file handoff. Do not translate JSON keys, route values, or file paths.",
            "- Every page must keep a distinct body structure derived from the canonical prompt and source content. Shared header/footer/design language is allowed, repeated inner-page body templates are not.",
            "- Preserve the home hero responsive layout safety requirements so text, stats, CTA, and media cannot overlap.",
            requestedSiteLocale === "multilingual"
              ? "- If the requested site locale is multilingual, preserve the locale-and-translation contract: generate source-language HTML plus locale registry/catalog artifacts, and avoid per-locale page regeneration."
              : "- If the requested site locale is bilingual, preserve the bilingual experience contract and implement a real language switch with hidden alternate-language storage instead of visible translated duplicates.",
            "- Keep planning assumptions and visitor-facing copy behavior aligned with the workflow skill.",
          ].join("\n"),
        },
      ],
    } as any);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`prompt-draft-llm-timeout-${timeoutMs}`)), timeoutMs),
    );
    const response = await Promise.race([responsePromise, timeoutPromise]);
    const rawContent = (response as any)?.choices?.[0]?.message?.content;
    const outputText = extractChatCompletionText(rawContent);
    const parsed = safeJsonParse<{
      canonicalPrompt?: string;
      researchSummary?: string;
      sources?: any[];
    }>(outputText);
    return {
      rawDraft: normalizeText(parsed?.canonicalPrompt || outputText),
      parsed,
    };
  }

  let usedModel = model;
  let primaryError: unknown;
  let result:
    | {
        rawDraft: string;
        parsed?: { canonicalPrompt?: string; researchSummary?: string; sources?: any[] };
      }
    | undefined;

  try {
    result = await runSingleAttempt({ model, compact: false });
  } catch (error) {
    primaryError = error;
  }

  const retryModel = fallbackModel || model;
  const shouldRetry =
    !result?.rawDraft ||
    !looksLikeTemplateDraft(result.rawDraft) ||
    (primaryError && String((primaryError as any)?.message || "").includes("prompt-draft-llm-timeout"));

  if (shouldRetry) {
    try {
      result = await runSingleAttempt({ model: retryModel, compact: true });
      usedModel = retryModel;
      primaryError = undefined;
    } catch (retryError) {
      if (primaryError) {
        const first = normalizeText((primaryError as any)?.message || primaryError) || "llm_attempt_failed";
        const second = normalizeText((retryError as any)?.message || retryError) || "llm_retry_failed";
        throw new Error(`${first};retry:${second}`);
      }
      throw retryError;
    }
  }

  const parsed = result?.parsed;
  const rawDraft = normalizeText(result?.rawDraft);
  if (!rawDraft) return undefined;
  const evidenceBrief = params.evidenceBrief || (params.knowledgeProfile ? buildWebsiteEvidenceBrief(params.knowledgeProfile) : undefined);

  const canonicalPrompt = ensureCanonicalPromptHasSourceMaterialAppendix(
    ensureCanonicalPromptHasEvidenceBrief(
      enrichCanonicalPromptWithControlManifest(
        looksLikeTemplateDraft(rawDraft)
          ? rawDraft
          : mergeTemplateWithResearch(params.templateDraft, params.researchSources, params.researchSummary, params.knowledgeProfile, evidenceBrief, requestedSiteLocale, displayLocale),
        params.requirementText,
        params.workflowContractSummary,
        params.decisionPlan,
        params.routeSource,
        params.discoveryBrief,
      ),
      evidenceBrief,
    ),
    params.knowledgeProfile,
  );
  const mergedSources = normalizeSources([...(parsed?.sources || []), ...params.researchSources]);
  return {
    canonicalPrompt,
    usedWebSearch: hasWebEvidence(params.knowledgeProfile),
    researchSummary: sanitizeWorkflowArtifactText(
      parsed?.researchSummary || params.researchSummary,
      "English-normalized research summary unavailable; rely on the evidence brief and source-backed profile.",
    ),
    sources: mergedSources,
    promptControlManifest: buildPromptControlManifest(
      params.decisionPlan,
      params.routeSource,
      resolveRequestedSiteLocale(params.requirementText),
      params.discoveryBrief,
    ),
    websiteSurfaceMode: params.discoveryBrief.surfaceMode,
    discoveryBrief: params.discoveryBrief,
    evidenceBrief,
    knowledgeProfile: params.knowledgeProfile,
    model: usedModel,
    provider: params.config.provider,
    draftMode: hasWebEvidence(params.knowledgeProfile) ? "llm_web_search" : "llm",
  };
}

function hasWebEvidence(profile?: WebsiteKnowledgeProfile): boolean {
  return Boolean(profile?.sources?.some((source) => source.type === "domain" || source.type === "web_search"));
}

function mapKnowledgeSourcesToPromptSources(profile?: WebsiteKnowledgeProfile): PromptDraftSource[] {
  return normalizeSources(
    (profile?.sources || []).map((source) => ({
      title: source.title,
      url: source.url || (source.fileName ? `uploaded-file:${source.fileName}` : ""),
      snippet: source.snippet,
    })),
  );
}

function applyKnowledgeProfileToPromptPlan(params: {
  requirementText: string;
  slots: RequirementSlot[];
  workflowContractSummary: string;
  discoveryBrief: WebsiteDiscoveryBrief;
  knowledgeProfile: WebsiteKnowledgeProfile;
}): {
  decisionPlan: LocalDecisionPlan;
  routeSource: PromptControlManifest["routeSource"];
  promptControlManifest: PromptControlManifest;
  localDraft: string;
} {
  const knowledgeDecision = buildPromptDecisionPlanFromKnowledgeProfile(params.requirementText, params.knowledgeProfile);
  const promptControlManifest = buildPromptControlManifest(
    knowledgeDecision.plan,
    knowledgeDecision.routeSource,
    resolveRequestedSiteLocale(params.requirementText),
    params.discoveryBrief,
  );
  const localDraft = enrichCanonicalPromptWithControlManifest(
    composeStructuredPrompt(params.requirementText, params.slots),
    params.requirementText,
    params.workflowContractSummary,
    knowledgeDecision.plan,
    knowledgeDecision.routeSource,
    params.discoveryBrief,
  );
  return {
    decisionPlan: knowledgeDecision.plan,
    routeSource: knowledgeDecision.routeSource,
    promptControlManifest,
    localDraft,
  };
}

export async function buildPromptDraftWithResearch(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs?: number;
  referencedAssets?: string[];
  ownerUserId?: string;
  projectId?: string;
  displayLocale?: PromptDraftDisplayLocale;
}): Promise<PromptDraftBuildResult> {
  const workflowContractSummary = await loadWebsiteWorkflowContractSummary();
  const requestedSiteLocale = resolveRequestedSiteLocale(params.requirementText);
  const requirementSpec = buildRequirementSpec(params.requirementText, [params.requirementText]);
  const sourceEnrichmentPlan = buildSourceEnrichmentPlan({
    requirementText: params.requirementText,
    spec: requirementSpec,
    referencedAssets: params.referencedAssets,
  });
  let decisionPlan = buildPromptDecisionPlan(params.requirementText);
  let discoveryBrief = buildWebsiteDiscoveryBrief({
    requirementText: params.requirementText,
    spec: requirementSpec,
    decisionPlan,
    referencedAssets: params.referencedAssets,
  });
  let routeSource: PromptControlManifest["routeSource"] = "prompt_draft_page_plan";
  let promptControlManifest = buildPromptControlManifest(
    decisionPlan,
    routeSource,
    resolveRequestedSiteLocale(params.requirementText),
    discoveryBrief,
  );
  let localDraft = enrichCanonicalPromptWithControlManifest(
    composeStructuredPrompt(params.requirementText, params.slots),
    params.requirementText,
    workflowContractSummary,
    decisionPlan,
    routeSource,
    discoveryBrief,
  );
  localDraft = ensureCanonicalPromptHasBilingualContract(localDraft, requestedSiteLocale, params.displayLocale);
  const searchTimeoutMs = Number(params.timeoutMs || process.env.CHAT_DRAFT_WEB_SEARCH_TIMEOUT_MS || 16_000);
  const llmTimeoutMs = resolveDraftLlmTimeoutMs(params.timeoutMs);
  let sources: PromptDraftSource[] = [];
  let researchSummary = "";
  let webSearchFailureReason = "";
  let evidenceBrief: WebsiteEvidenceBrief | undefined;
  let knowledgeProfile: WebsiteKnowledgeProfile | undefined;
  const buildEnrichmentOptions = (overrides?: Partial<KnowledgeProfileEnrichmentOptions>): KnowledgeProfileEnrichmentOptions => ({
    useDomainSources: sourceEnrichmentPlan.shouldUseDomainSources,
    useExplicitUrlSources: sourceEnrichmentPlan.shouldUseUrlExtraction,
    useUploadedSources: sourceEnrichmentPlan.shouldUseUploadedAssets,
    useWebSearch: sourceEnrichmentPlan.shouldUseWebSearch,
    ...(overrides || {}),
  });
  const hasAnyEnabledEnrichment = (options: KnowledgeProfileEnrichmentOptions) =>
    Boolean(options.useDomainSources || options.useExplicitUrlSources || options.useUploadedSources || options.useWebSearch);
  const getSafeResearchSummary = () =>
    sanitizeWorkflowArtifactText(
      researchSummary,
      "English-normalized research summary unavailable; rely on the evidence brief and source-backed profile.",
    );
  const applyResolvedKnowledgeProfile = (profile: WebsiteKnowledgeProfile) => {
    knowledgeProfile = profile;
    evidenceBrief = buildWebsiteEvidenceBrief(profile);
    sources = mapKnowledgeSourcesToPromptSources(profile);
    researchSummary = profile.summary;
    const next = applyKnowledgeProfileToPromptPlan({
      requirementText: params.requirementText,
      slots: params.slots,
      workflowContractSummary,
      discoveryBrief,
      knowledgeProfile: profile,
    });
    decisionPlan = next.decisionPlan;
    discoveryBrief = buildWebsiteDiscoveryBrief({
      requirementText: params.requirementText,
      spec: requirementSpec,
      decisionPlan,
      knowledgeProfile: profile,
      referencedAssets: params.referencedAssets,
    });
    routeSource = next.routeSource;
    promptControlManifest = buildPromptControlManifest(decisionPlan, routeSource, requestedSiteLocale, discoveryBrief);
    localDraft = ensureCanonicalPromptHasBilingualContract(
      enrichCanonicalPromptWithControlManifest(
        composeStructuredPrompt(params.requirementText, params.slots),
        params.requirementText,
        workflowContractSummary,
        decisionPlan,
        routeSource,
        discoveryBrief,
      ),
      requestedSiteLocale,
      params.displayLocale,
    );
  };
  const buildKnowledgeProfileForSelectedSources = async (overrides?: Partial<KnowledgeProfileEnrichmentOptions>) => {
    const enrichment = buildEnrichmentOptions(overrides);
    if (!hasAnyEnabledEnrichment(enrichment)) return undefined;
    return buildWebsiteKnowledgeProfile({
      requirementText: params.requirementText,
      timeoutMs: searchTimeoutMs,
      maxQueries: enrichment.useWebSearch
        ? resolveWebSearchQueryBudget(
            params.requirementText,
            Number(process.env.CHAT_DRAFT_WEB_SEARCH_MAX_QUERIES || 0),
          )
        : 0,
      searchConfig: enrichment.useWebSearch ? resolveSerperSearchConfigFromEnv().config : undefined,
      referencedAssets: enrichment.useUploadedSources ? params.referencedAssets : undefined,
      ownerUserId: params.ownerUserId,
      projectId: params.projectId,
      enrichment,
    });
  };
  const networkGate = shouldSkipNetworkInCurrentEnv();
  if (networkGate.skip) {
    const uploadedOnlyProfile = await buildKnowledgeProfileForSelectedSources({
      useDomainSources: false,
      useExplicitUrlSources: false,
      useWebSearch: false,
    });
    if (uploadedOnlyProfile) applyResolvedKnowledgeProfile(uploadedOnlyProfile);
    const canonicalPrompt = mergeTemplateWithResearch(
      localDraft,
      sources,
      researchSummary,
      knowledgeProfile,
      evidenceBrief,
      requestedSiteLocale,
      params.displayLocale,
    );
    return {
      canonicalPrompt,
      usedWebSearch: hasWebEvidence(knowledgeProfile),
      sources,
      promptControlManifest,
      websiteSurfaceMode: discoveryBrief.surfaceMode,
      discoveryBrief,
      evidenceBrief,
      knowledgeProfile,
      researchSummary: getSafeResearchSummary(),
      fallbackReason: networkGate.reason,
      draftMode: "template",
    };
  }

  if (
    sourceEnrichmentPlan.shouldUseDomainSources ||
    sourceEnrichmentPlan.shouldUseUrlExtraction ||
    sourceEnrichmentPlan.shouldUseUploadedAssets ||
    sourceEnrichmentPlan.shouldUseWebSearch
  ) {
    const webSearchEnabled = shouldEnableWebSearch();
    const serper = resolveSerperSearchConfigFromEnv();
    if (sourceEnrichmentPlan.shouldUseWebSearch && webSearchEnabled && !serper.config) {
      webSearchFailureReason = serper.reason || "missing_serper_config";
    } else {
      try {
        knowledgeProfile = await buildKnowledgeProfileForSelectedSources({
          useWebSearch: sourceEnrichmentPlan.shouldUseWebSearch && webSearchEnabled,
        });
        if (knowledgeProfile) {
          applyResolvedKnowledgeProfile(knowledgeProfile);
        }
        if (
          sourceEnrichmentPlan.shouldUseWebSearch &&
          webSearchEnabled &&
          knowledgeProfile &&
          !hasWebEvidence(knowledgeProfile) &&
          !knowledgeProfile.sources.some((source) => source.type === "uploaded_file" || source.type === "url_page" || source.type === "domain")
        ) {
          webSearchFailureReason = "serper_no_results";
        }
      } catch (error) {
        const searchFailureReason = normalizeText((error as any)?.message || error) || "serper_search_failed";
        try {
          const uploadedOnlyProfile = await buildKnowledgeProfileForSelectedSources({
            useDomainSources: false,
            useExplicitUrlSources: false,
            useWebSearch: false,
          });
          if (uploadedOnlyProfile) {
            applyResolvedKnowledgeProfile(uploadedOnlyProfile);
            webSearchFailureReason = `web_search_failed:${searchFailureReason};uploaded_sources_used`;
          } else {
            webSearchFailureReason = searchFailureReason;
          }
        } catch (uploadedError) {
          const uploadedReason = normalizeText((uploadedError as any)?.message || uploadedError) || "uploaded_sources_failed";
          webSearchFailureReason = `${searchFailureReason};uploaded_sources:${uploadedReason}`;
        }
      }
    }
  } else if (sourceEnrichmentPlan.shouldUseWebSearch && !shouldEnableWebSearch()) {
    webSearchFailureReason = "chat_draft_web_search_disabled";
    const uploadedOnlyProfile = await buildKnowledgeProfileForSelectedSources({
      useDomainSources: false,
      useExplicitUrlSources: false,
      useWebSearch: false,
    });
    if (uploadedOnlyProfile) applyResolvedKnowledgeProfile(uploadedOnlyProfile);
  }

  const provider = resolveDraftProviderConfig();
  if (!provider.config) {
    const canonicalPrompt = mergeTemplateWithResearch(
      localDraft,
      sources,
      researchSummary,
      knowledgeProfile,
      evidenceBrief,
      requestedSiteLocale,
      params.displayLocale,
    );
    return {
      canonicalPrompt,
      usedWebSearch: hasWebEvidence(knowledgeProfile),
      sources,
      promptControlManifest,
      websiteSurfaceMode: discoveryBrief.surfaceMode,
      discoveryBrief,
      evidenceBrief,
      knowledgeProfile,
      researchSummary: getSafeResearchSummary(),
      fallbackReason: provider.reason,
      draftMode: "template",
    };
  }

  if (shouldEnableLlmDraft()) {
    try {
      const llmDraft = await requestPromptDraftWithLlm({
        requirementText: params.requirementText,
        slots: params.slots,
        timeoutMs: llmTimeoutMs,
        config: provider.config,
        templateDraft: localDraft,
        workflowContractSummary,
        decisionPlan,
        routeSource,
        discoveryBrief,
        researchSources: sources,
        researchSummary,
        evidenceBrief,
        knowledgeProfile,
        displayLocale: params.displayLocale,
        requestedSiteLocale,
      });
      if (llmDraft) {
        return {
          ...llmDraft,
          promptControlManifest,
          fallbackReason: webSearchFailureReason || undefined,
        };
      }
    } catch (error) {
      const llmReason = normalizeText((error as any)?.message || error) || "llm_draft_failed";
      const canonicalPrompt = mergeTemplateWithResearch(
        localDraft,
        sources,
        researchSummary,
        knowledgeProfile,
        evidenceBrief,
        requestedSiteLocale,
        params.displayLocale,
      );
      return {
        canonicalPrompt,
        usedWebSearch: hasWebEvidence(knowledgeProfile),
        sources,
        promptControlManifest,
        websiteSurfaceMode: discoveryBrief.surfaceMode,
        discoveryBrief,
        evidenceBrief,
        knowledgeProfile,
        researchSummary: getSafeResearchSummary(),
        fallbackReason: webSearchFailureReason
          ? `web_search:${webSearchFailureReason};llm:${llmReason}`
          : llmReason,
        provider: provider.config.provider,
        model: provider.config.model,
        draftMode: "template",
      };
    }
  }

  const canonicalPrompt = mergeTemplateWithResearch(
    localDraft,
    sources,
    researchSummary,
    knowledgeProfile,
    evidenceBrief,
    requestedSiteLocale,
    params.displayLocale,
  );
  return {
    canonicalPrompt,
    usedWebSearch: hasWebEvidence(knowledgeProfile),
    sources,
    promptControlManifest,
    websiteSurfaceMode: discoveryBrief.surfaceMode,
    discoveryBrief,
    evidenceBrief,
    knowledgeProfile,
    researchSummary: getSafeResearchSummary(),
    fallbackReason: webSearchFailureReason || "llm_draft_disabled",
    provider: provider.config.provider,
    model: provider.config.model,
    draftMode: "template",
  };
}
