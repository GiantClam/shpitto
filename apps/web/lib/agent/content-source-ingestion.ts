import { getProjectAssetObject } from "../project-assets.ts";
import {
  buildRequirementSpec,
  parseRequirementFormFromText,
  type RequirementSpec,
} from "./chat-orchestrator.ts";
import {
  extractDeterministicTextFromDocumentBytes,
  extractDocumentContentFromBytes,
} from "./document-ingestion.ts";
import {
  searchSerperBatch,
  type SerperSearchConfig,
  type WebSearchSource,
} from "../tools/web-search/serper.ts";
import {
  containsWorkflowCjk,
  isWorkflowArtifactEnglishSafe,
  normalizeWorkflowArtifactText,
  sanitizeWorkflowArtifactList,
  sanitizeWorkflowArtifactText,
} from "../workflow-artifact-language.ts";

export type WebsiteKnowledgeSource = {
  type: "domain" | "web_search" | "uploaded_file" | "user_input";
  title: string;
  url?: string;
  fileName?: string;
  snippet?: string;
  confidence: number;
};

export type WebsiteKnowledgeProfile = {
  sourceMode: "new_site" | "domain" | "uploaded_files" | "mixed";
  domains: string[];
  sources: WebsiteKnowledgeSource[];
  brand: {
    name?: string;
    description?: string;
    tone?: string;
  };
  audience: string[];
  offerings: string[];
  differentiators: string[];
  proofPoints: string[];
  suggestedPages: Array<{
    route: string;
    title: string;
    purpose: string;
    contentInputs: string[];
  }>;
  contentGaps: string[];
  summary: string;
};

export type WebsiteEvidenceBrief = {
  sourceMode: WebsiteKnowledgeProfile["sourceMode"];
  priorityFacts: Array<{
    category: "brand" | "audience" | "offering" | "differentiator" | "proof";
    fact: string;
  }>;
  sourcePriorities: Array<{
    rank: number;
    type: WebsiteKnowledgeSource["type"];
    title: string;
    location?: string;
    confidence: number;
    snippet?: string;
  }>;
  pageBriefs: Array<{
    route: string;
    title: string;
    purpose: string;
    contentInputs: string[];
    sourceHints: string[];
  }>;
  contentGaps: string[];
  assumptions: string[];
};

type AssetReference = {
  key?: string;
  fileName?: string;
  url?: string;
  referenceText: string;
};

type SuggestedPage = WebsiteKnowledgeProfile["suggestedPages"][number];

const UPLOADED_SOURCE_SNIPPET_LIMIT = 12_000;
const KNOWLEDGE_PROFILE_SUMMARY_LIMIT = 8_000;

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isPlaceholderBrandValue(value: string): boolean {
  const normalized = normalizeText(value)
    .replace(/^[:：-]+|[:：-]+$/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return /^(?:logo|text[_ -]?mark|wordmark|site|website|blog|brand)$/i.test(normalized);
}

function containsCjk(text: string): boolean {
  return containsWorkflowCjk(text);
}

function internalNavLabelForRoute(route: string, fallback = ""): string {
  const normalized = String(route || "/").trim() || "/";
  if (normalized === "/") return "Home";
  if (isWorkflowArtifactEnglishSafe(fallback)) return normalizeWorkflowArtifactText(fallback);
  const leaf = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() || "page";
  return leaf
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => (part === part.toUpperCase() && /^[A-Z0-9-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function englishOnlyList(items: string[], fallback: string): string {
  return sanitizeWorkflowArtifactList(items, fallback);
}

function englishOnlyText(text: string, fallback: string): string {
  return sanitizeWorkflowArtifactText(text, fallback);
}

function hasUploadedMaterialSignal(text: string): boolean {
  return (
    /uploaded|upload|attachment|attached|file|pdf|document|materials?/i.test(text) ||
    /[\u4e0a\u4f20\u9644\u4ef6\u6587\u6863\u6750\u6599]/.test(text)
  );
}

function shouldSkipGenericSearchForUploadedMaterials(params: {
  requirementText: string;
  domains: string[];
  referencedAssets?: string[];
}): boolean {
  return (
    params.domains.length === 0 &&
    (params.referencedAssets || []).length > 0 &&
    hasUploadedMaterialSignal(params.requirementText)
  );
}

function looksLikeRawPdfInternals(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return false;
  const markers = [
    "%pdf",
    "/flatedecode",
    "/type /page",
    "/type/page",
    " endobj",
    " obj ",
    " stream ",
    " endstream",
    " xref",
    "trailer",
  ];
  const hitCount = markers.reduce((count, marker) => count + (normalized.includes(marker) ? 1 : 0), 0);
  return normalized.startsWith("%pdf") || hitCount >= 2;
}

function hasUsefulNaturalText(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length < 120) return false;
  if (looksLikeRawPdfInternals(normalized)) return false;
  const wordHits = normalized.match(/[a-zA-Z]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
  return wordHits.length >= 12;
}

function brandFromUploadedFileName(fileName: string): string {
  const stem = String(fileName || "")
    .replace(/\.[a-z0-9]+$/gi, "")
    .replace(/\.[a-z0-9]+$/gi, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const acronym = stem.match(/\b[A-Z][A-Z0-9]{2,20}\b/)?.[0];
  return normalizeText(acronym || stem).slice(0, 80);
}

function buildFallbackBusinessSignals(text: string, limit: number): string[] {
  const source = String(text || "");
  if (!source) return [];
  const signals = new Set<string>();
  const patterns = [
    /\b(?:AI|DevOps|SaaS|K12|CTO|CEO|CPO|VP|GM|Huawei|WeChat|HelloTalk)\b/gi,
    /(?:\d+\+?\s*(?:schools?|countries?|users?)|\d+%\s*(?:-|to)\s*\d+%|\d+%-\d+%)/gi,
    /(?:个人简历网站|个人经历|职业履历亮点|全球化进程奠基者|研发体系变革专家|科技创业生态建设者|数字人创作平台|商业价值跃升)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = normalizeText(match[0]);
      if (!value) continue;
      signals.add(value);
      if (signals.size >= limit) return Array.from(signals).slice(0, limit);
    }
  }
  return Array.from(signals).slice(0, limit);
}

function derivePageTitleFromSpecToken(token: string): string {
  const normalized = normalizeText(token).toLowerCase();
  if (normalized === "home") return "Home";
  if (normalized === "about") return "About";
  if (normalized === "blog") return "Blog";
  if (normalized === "contact") return "Contact";
  if (normalized === "products") return "Products";
  if (normalized === "services") return "Services";
  if (normalized === "cases") return "Cases";
  if (normalized === "pricing") return "Pricing";
  return internalNavLabelForRoute(`/${normalized}`, token);
}

function derivePagePurposeFromSpec(page: string, spec: RequirementSpec): string {
  const normalized = normalizeText(page).toLowerCase();
  if (normalized === "blog") {
    return "Publish three source-backed blog posts that express the founder's methods, operating lessons, and AI point of view.";
  }
  if (normalized === "about") {
    return "Build trust with the founder biography, career timeline, leadership scope, and cross-company impact.";
  }
  if (normalized === "contact") {
    return "Provide a direct, credible way to start a conversation or collaboration.";
  }
  if (normalized === "cases") {
    return "Show representative projects, outcomes, and operating patterns with clear proof-oriented storytelling.";
  }
  if (normalized === "products" || normalized === "services") {
    return "Present concrete offerings, advisory themes, or capability areas with scannable detail.";
  }
  if (spec.siteType === "portfolio") {
    return `Build a distinct ${derivePageTitleFromSpecToken(page)} page around the founder's experience, perspective, and proof points.`;
  }
  return `Deliver a route-specific ${derivePageTitleFromSpecToken(page)} page grounded in the confirmed requirement and source material.`;
}

function buildSuggestedPagesFromRequirementSpec(spec: RequirementSpec, facts: string[]): SuggestedPage[] {
  const pageTokens = spec.pageStructure?.pages?.length
    ? spec.pageStructure.pages
    : spec.pages?.length
      ? spec.pages
      : [];
  const contentInputs = uniqueBriefItems(
    [
      ...(facts || []),
      ...(spec.businessContext ? [spec.businessContext] : []),
      ...(spec.customNotes ? [spec.customNotes] : []),
    ],
    6,
  );

  if (pageTokens.length > 0) {
    const used = new Set<string>();
    return pageTokens.map((page, index) => {
      const normalized = normalizeText(page).toLowerCase();
      const baseRoute = normalized === "home" ? "/" : `/${normalized.replace(/^\/+/, "")}`;
      const route = dedupeDocumentRoute(baseRoute, index, used);
      return {
        route,
        title: derivePageTitleFromSpecToken(page),
        purpose: derivePagePurposeFromSpec(page, spec),
        contentInputs,
      };
    });
  }

  if (spec.siteType === "portfolio") {
    return [
      {
        route: "/",
        title: "Home",
        purpose: "Introduce the founder's positioning, key leadership chapters, AI direction, and concrete proof signals.",
        contentInputs,
      },
      {
        route: "/blog",
        title: "Blog",
        purpose: "Publish three opinionated blog entries distilled from the founder's career experience and operating principles.",
        contentInputs,
      },
    ];
  }

  return [];
}

function inferBrandFromText(text: string): string | undefined {
  const source = String(text || "");
  const leadingVerb = source.match(/^\s*(Use|Build|Create|Generate|Make|Launch|Need|Want)\b/i)?.[1];
  if (leadingVerb) {
    return undefined;
  }
  if (/(?:logo\s+source|logo\s+strategy|brandlogo|text wordmark|generated temporary text logo|品牌文字标识|暂无\s*logo)/i.test(source)) {
    return undefined;
  }
  const blockedBrand = /^(?:logo|text[_ -]?mark|wordmark|site|website|blog)$/i;
  const patterns = [
    /(?:named|called|brand(?:\s+name)?|company(?:\s+name)?|organization(?:\s+name)?)\s*[:：]?\s*["“”']?([A-Z][A-Z0-9_-]{2,30})["“”']?/i,
    /(?:名为|名称为|品牌名为|机构名为|公司名为|一个名为)\s*["“”']?([A-Z][A-Z0-9_-]{2,30})["“”']?/u,
    /["“”']([A-Z][A-Z0-9_-]{2,30})["“”']\s*[（(][^）)]{0,80}[）)]/u,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = normalizeText(match?.[1]);
    if (value && !/^(?:Use|Build|Create|Generate|Make|Launch|Need|Want)$/i.test(value) && !blockedBrand.test(value)) {
      return value.slice(0, 80);
    }
  }
  const signatureCandidate = source
    .split(/\r?\n+/)
    .map((line) => normalizeText(line))
    .find((line) => {
      if (!line || line.length < 3 || line.length > 24) return false;
      if (!/^[A-Za-z][A-Za-z0-9_-]{2,24}$/.test(line)) return false;
      return !isPlaceholderBrandValue(line);
    });
  if (signatureCandidate) return signatureCandidate.slice(0, 80);
  const acronym = source.match(/\b[A-Z][A-Z0-9_-]{3,20}\b/)?.[0];
  const normalizedAcronym = normalizeText(acronym);
  return normalizedAcronym && !blockedBrand.test(normalizedAcronym) ? normalizedAcronym.slice(0, 80) : undefined;
}

function normalizeLabelForMatching(label: string): string {
  return String(label || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

function cleanPageLabel(raw: string): string {
  return String(raw || "")
    .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "")
    .replace(/\s*(?:page|\u9875\u9762)\s*$/iu, "")
    .replace(/\s*[（(][^）)]*[）)]\s*$/g, "")
    .replace(/[.,;:!?。！？；：]+$/g, "")
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .trim();
}

const DOCUMENT_PAGE_ROUTE_ALIASES: Array<{ route: string; keys: string[] }> = [
  { route: "/", keys: ["home", "homepage", "\u9996\u9875", "\u4e3b\u9875"] },
  { route: "/downloads", keys: ["downloads", "download", "\u8d44\u6599\u4e0b\u8f7d", "\u4e0b\u8f7d"] },
  { route: "/about", keys: ["about", "\u5173\u4e8e"] },
  { route: "/contact", keys: ["contact", "\u8054\u7cfb", "\u54a8\u8be2"] },
  { route: "/login", keys: ["login", "signin", "sign in", "\u767b\u5f55"] },
  { route: "/register", keys: ["register", "signup", "sign up", "\u6ce8\u518c"] },
  { route: "/reset-password", keys: ["forgot password", "reset password", "password reset", "\u627e\u56de\u5bc6\u7801", "\u5fd8\u8bb0\u5bc6\u7801"] },
  { route: "/verify-email", keys: ["verify email", "email verification", "confirm email", "\u9a8c\u8bc1\u90ae\u7bb1", "\u90ae\u7bb1\u9a8c\u8bc1"] },
];

const DOCUMENT_PAGE_CHINESE_ROUTE_TOKENS: Array<{ pattern: RegExp; replacement: string[] }> = [
  { pattern: /\u9996\u9875|\u4e3b\u9875/u, replacement: ["home"] },
  { pattern: /\u5173\u4e8e(?:\u6211\u4eec)?/u, replacement: ["about", "us"] },
  { pattern: /\u8054\u7cfb(?:\u6211\u4eec)?|\u54a8\u8be2/u, replacement: ["contact", "us"] },
  { pattern: /\u8d44\u6599\u4e0b\u8f7d|\u4e0b\u8f7d/u, replacement: ["downloads"] },
  { pattern: /\u7814\u7a76\u4e2d\u5fc3/u, replacement: ["research", "center"] },
  { pattern: /\u4fe1\u606f\u5e73\u53f0/u, replacement: ["information", "platform"] },
  { pattern: /\u6807\u51c6\u4f53\u7cfb|\u6807\u51c6/u, replacement: ["standards", "system"] },
  { pattern: /\u521b\u8bbe/u, replacement: ["creation"] },
  { pattern: /\u5efa\u8bbe/u, replacement: ["construction"] },
  { pattern: /\u4f18\u6807/u, replacement: ["certification"] },
  { pattern: /\u5021\u5bfc/u, replacement: ["advocacy"] },
  { pattern: /\u65b9\u6848/u, replacement: ["solutions"] },
  { pattern: /\u6848\u4f8b/u, replacement: ["case", "studies"] },
  { pattern: /\u8d44\u6e90/u, replacement: ["resources"] },
];

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const token of tokens) {
    const normalized = String(token || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function labelToReadableRouteSlug(label: string): string {
  const source = String(label || "").normalize("NFKD");
  const compactSource = source.replace(/\s+/g, "");
  const hasCjk = /[\u4e00-\u9fff]/.test(source);
  const asciiSlug = source
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const asciiTokens = asciiSlug ? asciiSlug.split("-").filter(Boolean) : [];
  const mappedTokens = DOCUMENT_PAGE_CHINESE_ROUTE_TOKENS.flatMap((entry) =>
    entry.pattern.test(source) ? entry.replacement : [],
  );
  const leadingAsciiToken = hasCjk ? compactSource.match(/^[A-Za-z0-9]+/)?.[0]?.toLowerCase() || "" : "";
  const readableTokens = uniqueTokens([
    ...(leadingAsciiToken ? [leadingAsciiToken] : []),
    ...asciiTokens,
    ...mappedTokens,
  ]);
  return readableTokens.join("-");
}

function routeFromDocumentPageLabel(label: string, index: number): string {
  const normalized = normalizeLabelForMatching(label);
  if (!normalized) return index === 0 ? "/" : `/page-${index + 1}`;
  const matched = DOCUMENT_PAGE_ROUTE_ALIASES.find((entry) =>
    entry.keys.some((key) => normalized === normalizeLabelForMatching(key)),
  );
  if (matched) return matched.route;

  const slug = labelToReadableRouteSlug(label);
  return slug ? `/${slug}` : `/page-${index + 1}`;
}

function dedupeDocumentRoute(route: string, index: number, used: Set<string>): string {
  const normalized = String(route || "").trim() || `/page-${index + 1}`;
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }

  const base = normalized === "/" ? "/home" : normalized;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const next = `${base}-${suffix}`;
  used.add(next);
  return next;
}

function isUnsupportedGeneratedPageLabel(label: string): boolean {
  const normalized = normalizeLabelForMatching(label);
  return /(authcodeerror|autherror|\u8ba4\u8bc1\u9519\u8bef)/iu.test(normalized);
}

function splitExplicitNavLabels(line: string): string[] {
  const source = String(line || "").trim();
  if (!source.includes("|")) return [];
  const content = source.includes(":") || source.includes("\uFF1A") ? source.split(/[:\uFF1A]/).slice(1).join(":") : source;
  return content
    .split("|")
    .map((item) => cleanPageLabel(item))
    .filter(Boolean)
    .filter((label) => label.length <= 48);
}

function extractDocumentSuggestedPages(text: string): { pages: SuggestedPage[]; gaps: string[] } {
  const source = String(text || "");
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labels: string[] = [];
  const navHint =
    /(nav|navigation|\u4e3b\u5bfc\u822a|\u9876\u90e8\u5bfc\u822a|\u5bfc\u822a\u83dc\u5355|\u4e3b\u5bfc\u822a\u83dc\u5355)/iu;
  const inlineNavMatch = source.match(
    /(?:nav|navigation|\u4e3b\u5bfc\u822a|\u9876\u90e8\u5bfc\u822a|\u5bfc\u822a\u83dc\u5355|\u4e3b\u5bfc\u822a\u83dc\u5355)[^:：]{0,40}[:：]\s*([\s\S]{1,800}?)(?:\s+-\s*(?:\u53f3\u4e0a\u89d2|right)|\s+【|\n|$)/iu,
  );
  if (inlineNavMatch?.[1]?.includes("|")) {
    labels.push(...splitExplicitNavLabels(inlineNavMatch[1]));
  }

  if (labels.length === 0) {
    for (const line of lines) {
      if (!line.includes("|") || !navHint.test(line)) continue;
      labels.push(...splitExplicitNavLabels(line));
      if (labels.length > 0) break;
    }
  }

  if (labels.length === 0) {
    const headingRegex =
      /(?:^|\n)\s*(?:#{1,6}\s*)?(?:[\u{1F300}-\u{1FAFF}]\s*)?([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff\s_-]{0,32}(?:page|\u9875\u9762|downloads?|\u8d44\u6599\u4e0b\u8f7d|\u9996\u9875))/giu;
    for (const match of source.matchAll(headingRegex)) {
      const label = cleanPageLabel(String(match[1] || ""));
      if (!label || label.length > 48) continue;
      labels.push(label);
    }
  }

  const pages: SuggestedPage[] = [];
  const gaps: string[] = [];
  const seenRoutes = new Set<string>();
  for (const label of labels) {
    if (isUnsupportedGeneratedPageLabel(label)) {
      gaps.push(`Document mentions ${label}, but this route is treated as a non-page auth artifact and should stay external.`);
      continue;
    }
    const route = dedupeDocumentRoute(routeFromDocumentPageLabel(label, pages.length), pages.length, seenRoutes);
    if (!route) continue;
    pages.push({
      route,
      title: label,
      purpose: `Build the ${label} page from the uploaded source document, preserving its source-defined role and content modules.`,
      contentInputs: [label, "uploaded source document"],
    });
  }

  return {
    pages: pages.length >= 2 ? pages.slice(0, 16) : [],
    gaps,
  };
}

export function extractDomainsFromRequirement(requirementText: string): string[] {
  const matches = normalizeText(requirementText).match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi);
  if (!matches) return [];
  const blockedExtensions = new Set([
    "css",
    "doc",
    "docx",
    "gif",
    "ico",
    "jpeg",
    "jpg",
    "js",
    "json",
    "md",
    "pdf",
    "png",
    "ppt",
    "pptx",
    "svg",
    "webp",
    "xls",
    "xlsx",
  ]);
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
  return String(text || "").replace(/```[\s\S]*?```/g, " ");
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
  return normalized || normalizeText(requirementText);
}

export function resolveWebSearchQueryBudget(requirementText: string, configured?: number): number {
  if (Number.isFinite(configured) && Number(configured) > 0) {
    return Math.max(1, Math.min(10, Number(configured)));
  }
  const domains = extractDomainsFromRequirement(requirementText);
  if (domains.length > 0) return 6;
  if (/行业资料|industry research|竞品|competitor|同类机构|research/i.test(requirementText)) return 5;
  return 3;
}

export function buildWebsiteSearchQueries(requirementText: string, maxQueries?: number): string[] {
  const normalized = buildSearchableRequirementText(requirementText);
  if (!normalized) return [];

  const domains = extractDomainsFromRequirement(requirementText);
  const base = normalized.slice(0, 180);
  const suggestions: string[] = [];
  for (const domain of domains) {
    suggestions.push(
      `site:${domain}`,
      domain,
      `site:${domain} about OR company OR profile OR intro`,
      `site:${domain} products OR services OR solutions`,
      `site:${domain} cases OR news OR blog OR research`,
      `site:${domain} contact`,
    );
  }
  suggestions.push(
    base,
    `${base.slice(0, 120)} website content examples`,
    `${base.slice(0, 120)} website information architecture`,
    `${base.slice(0, 120)} industry website best practices`,
  );

  const limit = resolveWebSearchQueryBudget(requirementText, maxQueries);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const query of suggestions) {
    const compact = normalizeText(query);
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(compact);
    if (output.length >= limit) break;
  }
  return output;
}

function sourceFromSearch(item: WebSearchSource, confidence = 0.78): WebsiteKnowledgeSource {
  return {
    type: "web_search",
    title: normalizeText(item.title || item.url).slice(0, 160),
    url: normalizeText(item.url),
    snippet: normalizeText(item.snippet).slice(0, 500),
    confidence,
  };
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function candidateDomainUrls(domains: string[], sources: WebsiteKnowledgeSource[]): string[] {
  const urls: string[] = [];
  for (const domain of domains) {
    urls.push(`https://${domain}/`, `https://www.${domain}/`);
  }
  for (const source of sources) {
    if (!source.url) continue;
    const parsed = safeUrl(source.url);
    if (!parsed) continue;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (domains.includes(host)) urls.push(source.url);
  }
  const seen = new Set<string>();
  return urls.filter((url) => {
    const key = url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function htmlToText(html: string): { title?: string; description?: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
  return {
    title: normalizeText(title),
    description: normalizeText(description),
    text: normalizeText(stripped).slice(0, 2000),
  };
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ShpittoPromptDraftBot/1.0",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.4",
      },
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function collectDomainPageSources(params: {
  domains: string[];
  searchSources: WebsiteKnowledgeSource[];
  timeoutMs: number;
}): Promise<WebsiteKnowledgeSource[]> {
  const urls = candidateDomainUrls(params.domains, params.searchSources);
  const sources: WebsiteKnowledgeSource[] = [];
  for (const url of urls) {
    const html = await fetchTextWithTimeout(url, Math.max(3000, Math.min(8000, params.timeoutMs)));
    if (!html) continue;
    const parsed = htmlToText(html);
    const title = parsed.title || safeUrl(url)?.hostname || url;
    const snippet = normalizeText([parsed.description, parsed.text].filter(Boolean).join(" ")).slice(0, 700);
    if (!snippet) continue;
    sources.push({
      type: "domain",
      title,
      url,
      snippet,
      confidence: 0.92,
    });
    if (sources.length >= 4) break;
  }
  return sources;
}

function parseAssetReference(line: string): AssetReference {
  const referenceText = normalizeText(line);
  const urlMatch = referenceText.match(/\bhttps?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/g, "") || "";
  const parsedUrl = urlMatch ? safeUrl(urlMatch) : undefined;
  const keyFromQuery = parsedUrl?.searchParams.get("key") || "";
  const keyFromPublicUrl = parsedUrl?.pathname
    ? decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, "")).match(/(?:^|\/)(project-assets\/.+)$/)?.[1] || ""
    : "";
  const keyMatch = referenceText.match(/\bkey:\s*([^\s)]+)/i)?.[1] || "";
  const fileName =
    referenceText.match(/Asset\s+"([^"]+)"/i)?.[1] ||
    referenceText.match(/\bfile(?:Name)?:\s*([^,;)]+)/i)?.[1] ||
    referenceText.match(/\bpath:\s*([^,;)]+?)(?:\s+\(|\s+URL:|$)/i)?.[1]?.split("/").pop() ||
    (parsedUrl ? decodeURIComponent(parsedUrl.pathname.split("/").pop() || "") : "") ||
    "";
  return {
    key: normalizeText(keyMatch || keyFromQuery || keyFromPublicUrl),
    fileName: normalizeText(fileName),
    url: normalizeText(urlMatch),
    referenceText,
  };
}

function inferProjectScopeFromAssetKey(key: string): { ownerUserId: string; projectId: string } | undefined {
  const normalized = String(key || "").trim().replace(/^\/+/, "");
  const match = normalized.match(/^project-assets\/([^/]+)\/([^/]+)\//i);
  if (!match?.[1] || !match?.[2]) return undefined;
  return {
    ownerUserId: match[1],
    projectId: match[2],
  };
}

function extractTextFromUploadedBytes(params: {
  body: Uint8Array;
  contentType: string;
  fileName: string;
}): { text: string; unsupportedReason?: string } {
  const extracted = extractDeterministicTextFromDocumentBytes(params);
  return { text: extracted.text, unsupportedReason: extracted.unsupportedReason };
}

async function fetchAssetBytesFromUrl(url: string): Promise<{ body: Uint8Array; contentType: string } | undefined> {
  const parsed = safeUrl(url);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/pdf,text/*,*/*;q=0.6" },
    });
    if (!response.ok) return undefined;
    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > 10 * 1024 * 1024) return undefined;
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > 10 * 1024 * 1024) return undefined;
    return {
      body,
      contentType: response.headers.get("content-type") || "",
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function retryUploadedAssetRead<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  let last: T | undefined;
  const maxAttempts = Math.max(3, Number(process.env.CHAT_UPLOAD_ASSET_READ_RETRIES || 5));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await read();
    if (last) return last;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(3_000, 700 * (attempt + 1))));
    }
  }
  return last;
}

async function collectUploadedFileSources(params: {
  ownerUserId?: string;
  projectId?: string;
  referencedAssets?: string[];
}): Promise<{ sources: WebsiteKnowledgeSource[]; gaps: string[] }> {
  const sources: WebsiteKnowledgeSource[] = [];
  const gaps: string[] = [];
  const ownerUserId = normalizeText(params.ownerUserId);
  const projectId = normalizeText(params.projectId);
  const referencedAssets = params.referencedAssets || [];
  const parsedReferences = referencedAssets.map((line) => parseAssetReference(line));
  const hasPublicUrlReference = parsedReferences.some((ref) => !!ref.url);
  if ((!ownerUserId || !projectId) && !hasPublicUrlReference) {
    if (referencedAssets.length > 0) gaps.push("Uploaded assets were referenced but cannot be read without project owner context.");
    return { sources, gaps };
  }

  for (const ref of parsedReferences) {
    if (!ref.key && !ref.url) {
      sources.push({
        type: "uploaded_file",
        title: ref.fileName || "Referenced uploaded asset",
        fileName: ref.fileName || undefined,
        snippet: ref.referenceText,
        confidence: 0.45,
      });
      gaps.push(`Could not resolve uploaded file bytes for reference: ${ref.referenceText.slice(0, 120)}`);
      continue;
    }
    try {
      let assetBytes: { body: Uint8Array; contentType: string } | undefined;
      if (ref.key) {
        const assetKey = ref.key;
        const inferredScope = inferProjectScopeFromAssetKey(assetKey);
        const scopedReads = [
          ownerUserId && projectId ? { ownerUserId, projectId } : undefined,
          inferredScope,
        ].filter((scope): scope is { ownerUserId: string; projectId: string } => Boolean(scope));
        for (const scope of scopedReads) {
          try {
            const object = await retryUploadedAssetRead(() => getProjectAssetObject({ ...scope, key: assetKey }));
            if (object && !object.skipped && object.ok && "body" in object && object.body) {
              assetBytes = {
                body: object.body,
                contentType: object.contentType || "",
              };
              break;
            }
          } catch {
            // Fall through to the public URL, or to the next inferred scope.
          }
        }
      }
      if (!assetBytes && ref.url) {
        const assetUrl = ref.url;
        assetBytes = await retryUploadedAssetRead(() => fetchAssetBytesFromUrl(assetUrl));
      }
      if (!assetBytes) {
        gaps.push(`Uploaded file was not readable: ${ref.fileName || ref.key || ref.url}`);
        continue;
      }
      const fileName = ref.fileName || ref.key?.split("/").pop() || ref.url?.split("/").pop() || "uploaded-file";
      const contentType = assetBytes.contentType || "";
      const extracted = await extractDocumentContentFromBytes({
        body: assetBytes.body,
        contentType,
        fileName,
        timeoutMs: 45_000,
      });
      if (extracted.text) {
        sources.push({
          type: "uploaded_file",
          title: fileName,
          fileName,
          snippet: extracted.text.slice(0, UPLOADED_SOURCE_SNIPPET_LIMIT),
          confidence: extracted.confidence,
        });
      } else {
        sources.push({
          type: "uploaded_file",
          title: fileName,
          fileName,
          snippet: ref.referenceText,
          confidence: 0.5,
        });
        const parserGap = extracted.gaps[0] || `${fileName} could not be parsed as text (${extracted.unsupportedReason || "empty_text"}).`;
        gaps.push(`${parserGap} Ask the user for key facts or an exportable source file.`);
      }
    } catch {
      gaps.push(`Uploaded file parsing failed: ${ref.fileName || ref.key}`);
    }
  }
  return { sources, gaps };
}

function extractBulletCandidates(text: string, patterns: RegExp[], limit: number): string[] {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?。！？；;])\s+|[。！？；;]\s*/g)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const hits = sentences.filter((sentence) => patterns.some((pattern) => pattern.test(sentence)));
  return Array.from(new Set(hits)).slice(0, limit);
}

function uniqueBriefItems(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function buildUserInputSource(requirementText: string): WebsiteKnowledgeSource | undefined {
  const normalized = normalizeText(requirementText);
  if (!normalized || normalized.length < 80) return undefined;
  return {
    type: "user_input",
    title: "Conversation requirement brief",
    snippet: normalized.slice(0, UPLOADED_SOURCE_SNIPPET_LIMIT),
    confidence: 0.78,
  };
}

function inferSourceMode(domains: string[], uploadedCount: number, requirementText: string): WebsiteKnowledgeProfile["sourceMode"] {
  const newSite = /new website|new site|新建站|没有资料|暂无内容|from scratch/i.test(requirementText);
  if (domains.length > 0 && uploadedCount > 0) return "mixed";
  if (domains.length > 0) return "domain";
  if (uploadedCount > 0) return "uploaded_files";
  return newSite ? "new_site" : "mixed";
}

function buildKnowledgeProfileLegacy(params: {
  requirementText: string;
  sources: WebsiteKnowledgeSource[];
  domains: string[];
  contentGaps: string[];
}): WebsiteKnowledgeProfile {
  const reliableSources = params.sources.filter((source) => source.confidence >= 0.65 && hasUsefulNaturalText(source.snippet || ""));
  const uploadedSources = params.sources.filter((source) => source.type === "uploaded_file");
  const uploadedTextBrand = uploadedSources
    .map((source) => inferBrandFromText(source.snippet || ""))
    .find(Boolean);
  const uploadedBrand = uploadedSources
    .map((source) => brandFromUploadedFileName(source.fileName || source.title))
    .find(Boolean);
  const combined = [params.requirementText, ...reliableSources.map((source) => source.snippet || "")].join(" ");
  const brand =
    uploadedTextBrand ||
    inferBrandFromText(params.requirementText) ||
    params.requirementText.match(/(?:brand|company|name|品牌|公司|机构|名称)\s*[:：]\s*([^\n,，。]+)/i)?.[1] ||
    uploadedBrand ||
    reliableSources.find((source) => source.type === "domain" || source.type === "uploaded_file")?.title ||
    params.domains[0];
  const audience = extractBulletCandidates(combined, [/audience|customer|parent|buyer|用户|客户|家长|受众/i], 5);
  const offerings = extractBulletCandidates(combined, [/service|product|solution|course|assessment|research|服务|产品|课程|评估|研究/i], 6);
  const differentiators = extractBulletCandidates(combined, [/unique|advantage|differenti|certif|expert|优势|差异|认证|专业|可信/i], 5);
  const proofPoints = extractBulletCandidates(combined, [/case|client|data|sample|certif|result|案例|客户|数据|样本|资质|成果/i], 5);
  const gaps = [...params.contentGaps];
  const explicitPagePlan = extractDocumentSuggestedPages(
    [params.requirementText, ...uploadedSources.map((source) => source.snippet || "")].join("\n"),
  );
  gaps.push(...explicitPagePlan.gaps);
  if (params.sources.length === 0) gaps.push("No external or uploaded content source was available; prompt draft must mark business details as assumptions.");
  if (offerings.length === 0) gaps.push("Offerings/services are still thin; ask the user for 3-5 concrete products or services.");
  if (proofPoints.length === 0) gaps.push("Proof points are missing; ask for cases, credentials, data, awards, or testimonials.");
  const sourceMode = inferSourceMode(params.domains, uploadedSources.length, params.requirementText);
  const summarySources =
    sourceMode === "uploaded_files"
      ? params.sources.filter((source) => source.type === "uploaded_file" && source.confidence >= 0.65)
      : params.sources.filter((source) => source.confidence >= 0.65);

  return {
    sourceMode,
    domains: params.domains,
    sources: params.sources.slice(0, 12),
    brand: {
      name: normalizeText(brand),
      description: normalizeText(reliableSources[0]?.snippet).slice(0, 360) || undefined,
    },
    audience,
    offerings,
    differentiators,
    proofPoints,
    suggestedPages:
      explicitPagePlan.pages.length > 0
        ? explicitPagePlan.pages
        : [
            { route: "/", title: "Home", purpose: "Explain positioning and route visitors to proof, offerings, and contact.", contentInputs: offerings.slice(0, 3) },
            { route: "/about", title: "About", purpose: "Build trust with organization background and credentials.", contentInputs: differentiators.slice(0, 3) },
            { route: "/products", title: "Products or Services", purpose: "Present concrete offerings with scannable details.", contentInputs: offerings.slice(0, 5) },
            { route: "/cases", title: "Cases or Insights", purpose: "Show proof, outcomes, research, and stories.", contentInputs: proofPoints.slice(0, 5) },
            { route: "/contact", title: "Contact", purpose: "Capture leads and inquiries.", contentInputs: audience.slice(0, 3) },
          ],
    contentGaps: Array.from(new Set(gaps)).slice(0, 8),
    summary: summarySources
      .slice(0, 6)
      .map((source) => `${source.title}: ${source.snippet || source.url || source.fileName || ""}`)
      .join(" ")
      .slice(0, KNOWLEDGE_PROFILE_SUMMARY_LIMIT),
  };
}

function buildKnowledgeProfile(params: {
  requirementText: string;
  sources: WebsiteKnowledgeSource[];
  domains: string[];
  contentGaps: string[];
}): WebsiteKnowledgeProfile {
  const parsedForm = parseRequirementFormFromText(params.requirementText);
  const requirementSpec = buildRequirementSpec(
    params.requirementText,
    parsedForm.hasForm ? [params.requirementText] : undefined,
  );
  const reliableSources = params.sources.filter((source) => source.confidence >= 0.65 && hasUsefulNaturalText(source.snippet || ""));
  const uploadedSources = params.sources.filter((source) => source.type === "uploaded_file");
  const uploadedTextBrand = uploadedSources
    .map((source) => inferBrandFromText(source.snippet || ""))
    .find(Boolean);
  const uploadedBrand = uploadedSources
    .map((source) => brandFromUploadedFileName(source.fileName || source.title))
    .find(Boolean);
  const combined = [params.requirementText, ...reliableSources.map((source) => source.snippet || "")].join(" ");
  const brand =
    uploadedTextBrand ||
    uploadedBrand ||
    inferBrandFromText(params.requirementText) ||
    requirementSpec.brand ||
    params.requirementText.match(/(?:brand|company|name)\s*[:=]\s*([^\n,]+)/i)?.[1] ||
    reliableSources.find((source) => source.type === "domain" || source.type === "uploaded_file")?.title ||
    params.domains[0];
  const safeBrand = isPlaceholderBrandValue(String(brand || "")) ? "" : normalizeText(brand);
  const inferredSignals = buildFallbackBusinessSignals(
    [requirementSpec.businessContext, requirementSpec.customNotes, params.requirementText].filter(Boolean).join(" "),
    8,
  );
  const audience = uniqueBriefItems(
    [
      ...(requirementSpec.targetAudience || []),
      ...extractBulletCandidates(combined, [/audience|customer|parent|buyer|鐢ㄦ埛|瀹㈡埛|瀹堕暱|鍙椾紬/i], 5),
    ],
    5,
  );
  const offerings = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [/service|product|solution|course|assessment|research|鏈嶅姟|浜у搧|璇剧▼|璇勪及|鐮旂┒/i], 6),
      ...inferredSignals,
    ],
    6,
  );
  const differentiators = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [/unique|advantage|differenti|certif|expert|浼樺娍|宸紓|璁よ瘉|涓撲笟|鍙俊/i], 5),
      ...inferredSignals,
    ],
    5,
  );
  const proofPoints = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [/case|client|data|sample|certif|result|妗堜緥|瀹㈡埛|鏁版嵁|鏍锋湰|璧勮川|鎴愭灉/i], 5),
      ...buildFallbackBusinessSignals([params.requirementText, requirementSpec.customNotes].filter(Boolean).join(" "), 5),
    ],
    5,
  );
  const gaps = [...params.contentGaps];
  const explicitPagePlan = extractDocumentSuggestedPages(
    [params.requirementText, ...uploadedSources.map((source) => source.snippet || "")].join("\n"),
  );
  const requirementDrivenPages = buildSuggestedPagesFromRequirementSpec(
    requirementSpec,
    uniqueBriefItems([...offerings, ...differentiators, ...proofPoints], 8),
  );
  gaps.push(...explicitPagePlan.gaps);
  if (params.sources.length === 0) gaps.push("No external or uploaded content source was available; prompt draft must mark business details as assumptions.");
  if (offerings.length === 0) gaps.push("Offerings/services are still thin; ask the user for 3-5 concrete products or services.");
  if (proofPoints.length === 0) gaps.push("Proof points are missing; ask for cases, credentials, data, awards, or testimonials.");
  const sourceMode = inferSourceMode(params.domains, uploadedSources.length, params.requirementText);
  const summarySources =
    sourceMode === "uploaded_files"
      ? params.sources.filter((source) => source.type === "uploaded_file" && source.confidence >= 0.65)
      : params.sources.filter((source) => source.confidence >= 0.65);

  return {
    sourceMode,
    domains: params.domains,
    sources: params.sources.slice(0, 12),
    brand: {
      name: safeBrand || undefined,
      description: normalizeText(reliableSources[0]?.snippet).slice(0, 360) || undefined,
    },
    audience,
    offerings,
    differentiators,
    proofPoints,
    suggestedPages:
      explicitPagePlan.pages.length > 0
        ? explicitPagePlan.pages
        : requirementDrivenPages.length > 0
          ? requirementDrivenPages
          : [
              { route: "/", title: "Home", purpose: "Explain positioning and route visitors to proof, offerings, and contact.", contentInputs: offerings.slice(0, 3) },
              { route: "/about", title: "About", purpose: "Build trust with organization background and credentials.", contentInputs: differentiators.slice(0, 3) },
              { route: "/products", title: "Products or Services", purpose: "Present concrete offerings with scannable details.", contentInputs: offerings.slice(0, 5) },
              { route: "/cases", title: "Cases or Insights", purpose: "Show proof, outcomes, research, and stories.", contentInputs: proofPoints.slice(0, 5) },
              { route: "/contact", title: "Contact", purpose: "Capture leads and inquiries.", contentInputs: audience.slice(0, 3) },
            ],
    contentGaps: Array.from(new Set(gaps)).slice(0, 8),
    summary: summarySources
      .slice(0, 6)
      .map((source) => `${source.title}: ${source.snippet || source.url || source.fileName || ""}`)
      .join(" ")
      .slice(0, KNOWLEDGE_PROFILE_SUMMARY_LIMIT),
  };
}

export function buildWebsiteEvidenceBrief(profile: WebsiteKnowledgeProfile): WebsiteEvidenceBrief {
  const priorityFacts: WebsiteEvidenceBrief["priorityFacts"] = [];
  const addFacts = (category: WebsiteEvidenceBrief["priorityFacts"][number]["category"], facts: string[]) => {
    for (const fact of uniqueBriefItems(facts, 8)) {
      priorityFacts.push({ category, fact });
    }
  };

  addFacts("brand", [
    profile.brand.name ? `Brand or organization: ${profile.brand.name}` : "",
    profile.brand.description ? `Source description: ${profile.brand.description}` : "",
  ]);
  addFacts("audience", profile.audience);
  addFacts("offering", profile.offerings);
  addFacts("differentiator", profile.differentiators);
  addFacts("proof", profile.proofPoints);

  const sourcePriorities = [...profile.sources]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((source, index) => ({
      rank: index + 1,
      type: source.type,
      title: normalizeText(source.title || source.url || source.fileName || `Source ${index + 1}`).slice(0, 160),
      location: normalizeText(source.url || source.fileName) || undefined,
      confidence: source.confidence,
      snippet: normalizeText(source.snippet).slice(0, 520) || undefined,
    }));
  const sourceHints = sourcePriorities
    .slice(0, 4)
    .map((source) => source.title)
    .filter(Boolean);

  const pageBriefs = profile.suggestedPages.slice(0, 16).map((page) => ({
    route: page.route,
    title: page.title,
    purpose: page.purpose,
    contentInputs: uniqueBriefItems(page.contentInputs, 8),
    sourceHints,
  }));

  const assumptions = uniqueBriefItems(
    [
      profile.sources.length === 0
        ? "Business details not backed by external or uploaded sources must be marked as assumptions."
        : "",
      profile.offerings.length === 0
        ? "Offering/service details are thin; use only user-provided context and mark any inferred items as assumptions."
        : "",
      profile.proofPoints.length === 0
        ? "Proof points are thin; do not invent metrics, awards, client names, certifications, or testimonials."
        : "",
      profile.sourceMode === "new_site"
        ? "For a new site, use industry patterns only for structure and UX, not as brand-owned facts."
        : "",
    ],
    6,
  );

  return {
    sourceMode: profile.sourceMode,
    priorityFacts: priorityFacts.slice(0, 24),
    sourcePriorities,
    pageBriefs,
    contentGaps: profile.contentGaps.slice(0, 8),
    assumptions,
  };
}

export async function buildWebsiteKnowledgeProfile(params: {
  requirementText: string;
  searchConfig?: SerperSearchConfig;
  timeoutMs: number;
  maxQueries?: number;
  referencedAssets?: string[];
  ownerUserId?: string;
  projectId?: string;
}): Promise<WebsiteKnowledgeProfile> {
  const domains = extractDomainsFromRequirement(params.requirementText);
  const queries = buildWebsiteSearchQueries(params.requirementText, params.maxQueries);
  const webSources: WebsiteKnowledgeSource[] = [];
  const sources: WebsiteKnowledgeSource[] = [];
  const contentGaps: string[] = [];
  const userInputSource = buildUserInputSource(params.requirementText);
  const skipGenericSearch = shouldSkipGenericSearchForUploadedMaterials({
    requirementText: params.requirementText,
    domains,
    referencedAssets: params.referencedAssets,
  });

  const uploaded = await collectUploadedFileSources({
    ownerUserId: params.ownerUserId,
    projectId: params.projectId,
    referencedAssets: params.referencedAssets,
  });
  contentGaps.push(...uploaded.gaps);

  if (params.searchConfig && queries.length > 0 && !skipGenericSearch) {
    const batch = await searchSerperBatch(queries, {
      config: params.searchConfig,
      timeoutMs: Math.max(4000, params.timeoutMs),
    });
    for (const row of batch) {
      webSources.push(...(row.sources || []).map((source) => sourceFromSearch(source)));
    }
  }

  if (domains.length > 0) {
    const domainSources = await collectDomainPageSources({
      domains,
      searchSources: webSources,
      timeoutMs: params.timeoutMs,
    });
    sources.push(...domainSources);
    if (domainSources.length === 0) {
      contentGaps.push(`Domain was provided (${domains.join(", ")}) but same-domain page extraction returned no readable HTML.`);
    }
  }

  sources.push(...uploaded.sources);
  sources.push(...webSources);
  if (userInputSource) sources.unshift(userInputSource);

  const deduped: WebsiteKnowledgeSource[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const key = `${source.type}:${source.url || source.fileName || source.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return buildKnowledgeProfile({
    requirementText: params.requirementText,
    domains,
    sources: deduped,
    contentGaps,
  });
}

export function formatWebsiteEvidenceBrief(brief: WebsiteEvidenceBrief): string {
  const priorityLines = brief.priorityFacts.length
    ? brief.priorityFacts.map((item) => `- [${item.category}] ${englishOnlyText(item.fact, "Source-backed fact available in uploaded/domain material.")}`)
    : ["- No source-backed priority facts were extracted; the prompt must keep business claims conservative."];
  const sourceLines = brief.sourcePriorities.length
    ? brief.sourcePriorities.flatMap((source) =>
        [
          `${source.rank}. [${source.type}] ${englishOnlyText(source.title, `Source ${source.rank}`)}${
            source.location && (isWorkflowArtifactEnglishSafe(source.location) || /^https?:\/\//i.test(source.location))
              ? ` | ${source.location}`
              : ""
          } | confidence ${source.confidence.toFixed(2)}`,
          isWorkflowArtifactEnglishSafe(source.snippet || "")
            ? `   - Evidence: ${normalizeWorkflowArtifactText(source.snippet)}`
            : "   - Evidence: multilingual source excerpt available; use the extracted source artifact directly when needed.",
        ].filter(Boolean),
      )
    : ["- No readable source priorities available."];
  const pageLines = brief.pageBriefs.length
    ? brief.pageBriefs.flatMap((page, index) => [
        `${index + 1}. ${internalNavLabelForRoute(page.route, page.title)} (${page.route})`,
        `   - Purpose: ${englishOnlyText(page.purpose, `Deliver a distinct route brief for ${internalNavLabelForRoute(page.route, page.title)} using source-backed content.`)}`,
        `   - Content inputs: ${englishOnlyList(page.contentInputs, "derive conservatively from source-backed facts")}`,
        `   - Source hints: ${englishOnlyList(page.sourceHints, "multilingual source hints available in extracted source artifacts")}`,
      ])
    : ["- No page briefs available."];
  const gapLines = brief.contentGaps.length
    ? brief.contentGaps.map((gap) => `- Gap: ${englishOnlyText(gap, "Some source-dependent details still require extraction or confirmation from uploaded materials.")}`)
    : ["- Gap: none"];
  const assumptionLines = brief.assumptions.length
    ? brief.assumptions.map((assumption) => `- Assumption rule: ${englishOnlyText(assumption, "Keep unsupported claims omitted unless source-backed confirmation is available.")}`)
    : ["- Assumption rule: none"];

  return [
    "## 7. Evidence Brief",
    `- Source mode: ${brief.sourceMode}`,
    "",
    "### Priority Facts",
    ...priorityLines,
    "",
    "### Source Priorities",
    ...sourceLines,
    "",
    "### Page Briefs",
    ...pageLines,
    "",
    "### Gaps And Assumptions",
    ...gapLines,
    ...assumptionLines,
  ].join("\n");
}

export function formatWebsiteKnowledgeProfile(profile: WebsiteKnowledgeProfile): string {
  const sourceLines = profile.sources
    .slice(0, 8)
    .map((source, index) => {
      const rawLocation = source.url || source.fileName || "";
      const location = isWorkflowArtifactEnglishSafe(rawLocation) || /^https?:\/\//i.test(rawLocation) ? rawLocation : "";
      const title = englishOnlyText(source.title, `Source ${index + 1}`);
      return `${index + 1}. [${source.type}] ${title}${location ? ` | ${location}` : ""}${
        isWorkflowArtifactEnglishSafe(source.snippet || "")
          ? ` | ${normalizeWorkflowArtifactText(source.snippet).slice(0, 260)}`
          : " | multilingual source text stored in extracted source artifacts"
      }`;
    })
    .join("\n");
  const pageLines = profile.suggestedPages
    .slice(0, 16)
    .map(
      (page, index) =>
        `${index + 1}. ${internalNavLabelForRoute(page.route, page.title)} | ${page.route} | ${englishOnlyText(page.purpose, `Deliver a route-specific page for ${internalNavLabelForRoute(page.route, page.title)} based on source material.`)}`,
    )
    .join("\n");
  return [
    "## Website Knowledge Profile",
    `- Source mode: ${profile.sourceMode}`,
    profile.domains.length ? `- Domains: ${profile.domains.join(", ")}` : "- Domains: none",
    profile.brand.name ? `- Brand: ${englishOnlyText(profile.brand.name, "source-defined brand available in uploaded/domain material")}` : "- Brand: unknown",
    profile.audience.length ? `- Audience signals: ${englishOnlyList(profile.audience, "multilingual audience signals available in extracted source artifacts")}` : "- Audience signals: none",
    profile.offerings.length ? `- Offering signals: ${englishOnlyList(profile.offerings, "multilingual offering signals available in extracted source artifacts")}` : "- Offering signals: none",
    profile.differentiators.length ? `- Differentiators: ${englishOnlyList(profile.differentiators, "multilingual differentiator signals available in extracted source artifacts")}` : "- Differentiators: none",
    profile.proofPoints.length ? `- Proof points: ${englishOnlyList(profile.proofPoints, "source-backed proof points available in extracted source artifacts")}` : "- Proof points: none",
    pageLines ? "- Suggested pages from source:\n" + pageLines : "- Suggested pages from source: none",
    profile.contentGaps.length ? `- Content gaps: ${englishOnlyList(profile.contentGaps, "source-specific content gaps remain and must be handled conservatively")}` : "- Content gaps: none",
    sourceLines ? "- Sources:\n" + sourceLines : "- Sources: none",
  ].join("\n");
}

export const __contentSourceIngestionForTesting = {
  buildWebsiteEvidenceBrief,
  buildKnowledgeProfile,
  extractDocumentSuggestedPages,
  extractTextFromUploadedBytes,
  formatWebsiteEvidenceBrief,
  shouldSkipGenericSearchForUploadedMaterials,
};
