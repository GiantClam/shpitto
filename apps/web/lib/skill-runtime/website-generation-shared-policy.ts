export type RequestedExperienceLocale = "zh-CN" | "en" | "bilingual";

type BlogDetailPolicyParams = {
  route: string;
  navLabel?: string;
  requirementText?: string;
  pageKind?: string;
};

function cjkCount(text: string): number {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function normalizePolicyRoute(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function hasExplicitChineseDefaultVisibleLanguage(text = ""): boolean {
  return /default (?:visible )?language (?:is|:)\s*(?:Chinese|zh-CN|zh)\b|defaultLocale["']?\s*[:=]\s*["']?zh(?:-CN)?["']?|Chinese-first|Chinese-source|中文优先|默认中文|默认可见语言.*中文/i.test(
    String(text || ""),
  );
}

function hasExplicitEnglishDefaultVisibleLanguage(text = ""): boolean {
  return /default (?:visible )?language (?:is|:)\s*(?:English|en)\b|defaultLocale["']?\s*[:=]\s*["']?en["']?|English-first|默认英文|默认可见语言.*英文/i.test(
    String(text || ""),
  );
}

function normalizeLocaleFallback(locale?: string): "zh-CN" | "en" | "bilingual" | undefined {
  const normalized = String(locale || "")
    .trim()
    .toLowerCase();
  if (normalized === "bilingual") return "bilingual";
  if (normalized === "zh-cn" || normalized === "zh") return "zh-CN";
  if (normalized === "en") return "en";
  return undefined;
}

function normalizeCountToken(token: string): number | undefined {
  const raw = String(token || "").trim();
  if (!raw) return undefined;
  const ascii = raw.replace(/[\uFF10-\uFF19]/g, (char) => String(char.charCodeAt(0) - 0xff10));
  if (/^\d+$/.test(ascii)) {
    const value = Number(ascii);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const zhMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return zhMap[raw];
}

export function hasExplicitChineseOnlyLocaleContract(text = ""): boolean {
  const normalized = String(text || "");
  return (
    /\bLanguage:\s*Chinese\b(?!\s*(?:and|\/|,|&))/i.test(normalized) ||
    /Final website locale requirement:\s*Chinese\b(?!\s*(?:and|\/|,|&))/i.test(normalized) ||
    /\bLocale:\s*(?:zh-CN|zh)\b/i.test(normalized) ||
    /single-language\s+Chinese-first/i.test(normalized) ||
    /\bChinese-only\b/i.test(normalized) ||
    /\bKeep all visible copy in Chinese\b/i.test(normalized) ||
    /\bKeep the site in Chinese\b/i.test(normalized)
  );
}

export function hasExplicitEnglishOnlyLocaleContract(text = ""): boolean {
  const normalized = String(text || "");
  return (
    /\bLanguage:\s*English\b(?!\s*(?:and|\/|,|&))/i.test(normalized) ||
    /Final website locale requirement:\s*English\b(?!\s*(?:and|\/|,|&))/i.test(normalized) ||
    /\bLocale:\s*en\b/i.test(normalized) ||
    /single-language\s+English-first/i.test(normalized) ||
    /\bEnglish-only\b/i.test(normalized) ||
    /\bKeep all visible copy in English\b/i.test(normalized) ||
    /\bKeep the site in English\b/i.test(normalized)
  );
}

export function hasExplicitBilingualLocaleContract(text = ""): boolean {
  const normalized = String(text || "");
  return (
    /\b(?:build|create|generate|make|need|want|launch)\b[^\n]{0,120}\bbilingual\b/i.test(normalized) ||
    /\bChinese\s+and\s+English\b/i.test(normalized) ||
    /\bEnglish\s+and\s+Chinese\b/i.test(normalized) ||
    /\bboth\s+Chinese\s+and\s+English\b/i.test(normalized) ||
    /\bswitch\s+between\s+English\s+and\s+Chinese\b/i.test(normalized)
  );
}

export function prefersSingleLanguageShell(text = ""): boolean {
  const normalized = String(text || "");
  return (
    /Do not emit an EN\/ZH switch/i.test(normalized) ||
    /Do not emit .*bilingual resource files/i.test(normalized) ||
    /Prefer a single-language site over a fake language toggle/i.test(normalized)
  );
}

export function isBilingualRequirementText(text = ""): boolean {
  if (
    hasExplicitChineseOnlyLocaleContract(text) ||
    hasExplicitEnglishOnlyLocaleContract(text) ||
    prefersSingleLanguageShell(text)
  ) {
    return false;
  }
  return hasExplicitBilingualLocaleContract(text);
}

export function resolveRequestedExperienceLocale(
  requirementText = "",
  locale?: string,
): RequestedExperienceLocale | undefined {
  if (hasExplicitChineseOnlyLocaleContract(requirementText)) return "zh-CN";
  if (hasExplicitEnglishOnlyLocaleContract(requirementText)) return "en";
  if (hasExplicitBilingualLocaleContract(requirementText) && !prefersSingleLanguageShell(requirementText)) {
    return "bilingual";
  }
  return normalizeLocaleFallback(locale);
}

export function bilingualDefaultVisibleLanguage(text = ""): "zh-CN" | "en" {
  const source = String(text || "");
  if (hasExplicitChineseDefaultVisibleLanguage(source)) return "zh-CN";
  if (hasExplicitEnglishDefaultVisibleLanguage(source)) return "en";
  return cjkCount(source) >= 4 ? "zh-CN" : "en";
}

export function detectPrimaryLocaleFromRequirement(requirementText = "", locale?: string): "zh-CN" | "en" {
  const requestedLocale = resolveRequestedExperienceLocale(requirementText, locale);
  if (requestedLocale === "zh-CN" || requestedLocale === "en") return requestedLocale;
  if (requestedLocale === "bilingual") {
    if (hasExplicitChineseDefaultVisibleLanguage(requirementText)) return "zh-CN";
    if (hasExplicitEnglishDefaultVisibleLanguage(requirementText)) return "en";
    return /[\u4e00-\u9fff]/.test(String(requirementText || "")) ? "zh-CN" : "en";
  }
  const fallback = normalizeLocaleFallback(locale);
  if (fallback === "zh-CN" || fallback === "en") return fallback;
  return /[\u4e00-\u9fff]/.test(String(requirementText || "")) ? "zh-CN" : "en";
}

export function requestedPublishableContentCount(requirementText = ""): number | undefined {
  const text = String(requirementText || "");
  const asciiPatterns = [
    /\b(?:create|write|generate|publish|seed|add|produce)\s+([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
    /\b([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
  ];
  for (const pattern of asciiPatterns) {
    const match = text.match(pattern);
    const value = normalizeCountToken(match?.[1] || "");
    if (value) return Math.min(value, 12);
  }
  const contentNoun =
    "(?:文章|博客|blog|博客文章|帖子|博文|报告|研究报告|指南|案例|posts?|articles?|blog\\s+posts?|reports?|guides?|case\\s+studies?)";
  const countToken = "([0-9\\uFF10-\\uFF19]+|一|二|两|三|四|五|六|七|八|九|十)";
  const patterns = [
    new RegExp(`(?:生成|撰写|创建|产出|入库|发布|新增|整理|补充)\\s*${countToken}\\s*(?:篇|个|条|项)?\\s*${contentNoun}`, "i"),
    new RegExp(`${countToken}\\s*(?:篇|个|条|项)?\\s*${contentNoun}`, "i"),
    new RegExp(`(?:create|write|generate|publish|seed|add)\\s*${countToken}\\s*${contentNoun}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = normalizeCountToken(match?.[1] || "");
    if (value) return Math.min(value, 12);
  }
  return undefined;
}

export function shouldRequireAllDiscoveredBlogDetails(requirementText = ""): boolean {
  return /(?:complete|full|all|every|matching|corresponding|全部|所有|完整|每个|对应).{0,30}(?:blog|article|post|detail|文章|博客|详情)/i.test(
    String(requirementText || ""),
  );
}

export function isContentBackedPageKind(pageKind: string | undefined): boolean {
  return pageKind === "blog-data-index" || pageKind === "content-collection-index";
}

export function routeActsAsPublishableArchive(route: string, navLabel = ""): boolean {
  const text = `${normalizePolicyRoute(route)} ${String(navLabel || "")}`.trim().toLowerCase();
  return /(?:^|[\s/-])(blog|blogs|news|article|articles|post|posts|insight|insights|journal|story|stories)(?:$|[\s/-])/i.test(
    text,
  );
}

export function routeDefaultsToCollectionSurface(route: string, navLabel = ""): boolean {
  const text = `${normalizePolicyRoute(route)} ${String(navLabel || "")}`.trim().toLowerCase();
  return /(?:information[-\s]?platform|knowledge[-\s]?(?:platform|hub)|resource(?:s)?[-\s]?(?:hub|library|center)|research[-\s]?center|standards[-\s]?(?:system|library)|policy[-\s]?library|documentation[-\s]?portal|downloads?[-\s]?hub|repository|archive[-\s]?center|case[-\s]?library)/i.test(
    text,
  );
}

export function hasNegativePublishableDetailContract(requirementText = ""): boolean {
  return /(?:do\s+not|don't|without|unless\s+[^.]{0,40}\bexplicitly|不要|不得|禁止|除非).{0,80}(?:blog|blogs|article|articles|post|posts|news|insight|insights|journal|story|stories|publishable|博客|文章|帖子|博文|资讯|洞察).{0,80}(?:detail|details|route|routes|slug|slugs|archive|archives|详情|路由|归档)/iu.test(
    String(requirementText || ""),
  );
}

export function hasNegativeBlogArchiveBehaviorContract(requirementText = ""): boolean {
  const text = String(requirementText || "").trim();
  if (!text) return false;
  const explicitArchiveSuppressionPatterns = [
    /(?:do\s+not|don't|no\s+need|without|avoid|exclude)\s+(?:a\s+)?(?:blog|blogs?|blog\/archive|blog\s+or\s+archive)\b/i,
    /\bno\s+blog\/archive\s+assumptions\b/i,
    /(?:do\s+not|don't|without|avoid|exclude|no).{0,40}(?:blog|archive).{0,20}(?:behavior|behaviour|surface|route|routes|links?)/i,
    /(?:do\s+not|don't|without|avoid|exclude).{0,40}(?:blog\s+(?:index|archive|archives?|route|routes|surface)|archive\s+(?:page|pages|route|routes|surface)|\/blog\b)/i,
    /(?:不要|不需要|无需|避免|排除).{0,16}(?:blog|博客|博文)(?!.{0,16}(?:详情|detail|slug))/i,
    /(?:不要|不需要|无需|避免|排除).{0,16}(?:归档|内容归档|文章归档|博客归档|blog归档|博客路由|文章路由|\/blog)/i,
  ];
  const suppressesArchive = explicitArchiveSuppressionPatterns.some((pattern) => pattern.test(text));
  if (!suppressesArchive && hasNegativePublishableDetailContract(text)) {
    return false;
  }
  return suppressesArchive;
}

export function requirementRequestsPublishableDetailPages(requirementText = ""): boolean {
  const text = String(requirementText || "").trim();
  if (!text) return false;
  if (hasNegativePublishableDetailContract(text)) return false;
  const explicitCount = requestedPublishableContentCount(text);
  if (explicitCount) return true;
  return /(?:\b(?:blog|blogs|article|articles|post|posts|news|insight|insights|journal|story|stories|report|reports|guide|guides|case\s+library)\b.{0,32}\b(?:detail page|detail pages|article detail|article details|post detail|post details|publishable|archive|archives|slug|slugs|stable\s+\/blog\/\{slug\}\/|\/blog\/\{slug\}\/|route|routes)\b|\b(?:detail page|detail pages|article detail|article details|post detail|post details|publishable article|publishable articles|stable\s+\/blog\/\{slug\}\/|\/blog\/\{slug\}\/)\b|(?:博客|文章|帖子|博文|资讯|快讯|洞察|报告|指南).{0,16}(?:详情页|归档|路由|slug)|(?:文章详情|博客详情|详情页生成|详情页补全))/iu.test(
    text,
  );
}

export function shouldRequireBlogDetailPagesForRoute(params: BlogDetailPolicyParams): boolean {
  const route = normalizePolicyRoute(params.route);
  const requirementText = String(params.requirementText || "");
  if (requestedPublishableContentCount(requirementText)) return true;
  if (hasNegativePublishableDetailContract(requirementText)) return false;
  if (route === "/blog") return requirementRequestsPublishableDetailPages(requirementText);
  if (params.pageKind === "content-collection-index" || params.pageKind === "search-directory") return false;
  if (routeDefaultsToCollectionSurface(route, params.navLabel || "")) return false;
  if (routeActsAsPublishableArchive(route, params.navLabel || "")) return true;
  return requirementRequestsPublishableDetailPages(requirementText);
}
