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
import {
  CONTENT_INGESTION_AUDIENCE_RE,
  CONTENT_INGESTION_DIFFERENTIATOR_RE,
  CONTENT_INGESTION_FALLBACK_SIGNAL_RE,
  CONTENT_INGESTION_OFFERING_RE,
  CONTENT_INGESTION_PROOF_RE,
} from "./content-source-ingestion-keywords.ts";

export type WebsiteKnowledgeSource = {
  type: "domain" | "url_page" | "web_search" | "uploaded_file" | "user_input";
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
    sourceKind?: "structural_source" | "requirement_spec" | "fallback";
    confidence?: number;
    extractionReason?: string;
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

export type KnowledgeProfileEnrichmentOptions = {
  useDomainSources?: boolean;
  useExplicitUrlSources?: boolean;
  useUploadedSources?: boolean;
  useWebSearch?: boolean;
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
    .replace(/^[:锛?]+|[:锛?]+$/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return /^(?:logo|text[_ -]?mark|wordmark|site|website|blog|brand)$/i.test(normalized);
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
  if (isWorkflowArtifactEnglishSafe(fallback)) return compressRouteLabel(fallback, normalized);
  const leaf = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() || "page";
  return leaf
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => (part === part.toUpperCase() && /^[A-Z0-9-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

const WORKFLOW_MULTILINGUAL_SUMMARY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u4e3b\u5bfc\u822a\u83dc\u5355|\u4e3b\u5bfc\u822a|\u5bfc\u822a\u83dc\u5355/gu, "Main navigation"],
  [/\u7f51\u7ad9\u5b9a\u4f4d/gu, "Website positioning"],
  [/\u89c6\u89c9\u98ce\u683c/gu, "Visual style"],
  [/\u9996\u9875/gu, "Home"],
  [/\u8d44\u6599\u4e0b\u8f7d/gu, "Downloads"],
  [/\u7814\u7a76\u4e2d\u5fc3/gu, "Research Center"],
  [/\u4fe1\u606f\u5e73\u53f0/gu, "Information Platform"],
  [/\u6807\u51c6\u4f53\u7cfb|\u6807\u51c6\u7cfb\u7edf/gu, "Standards System"],
  [/\u6848\u4f8b\u7814\u7a76|\u6848\u4f8b/gu, "Case Studies"],
  [/\u521b\u8bbe|\u521b\u5efa/gu, "Creation"],
  [/\u5efa\u8bbe/gu, "Construction"],
  [/\u4f18\u6807|\u8ba4\u8bc1/gu, "Certification"],
  [/\u5021\u5bfc/gu, "Advocacy"],
  [/\u4e13\u4e1a\u6807\u51c6\u5236\u5b9a\u673a\u6784/gu, "professional standards institution"],
  [/\u7814\u7a76\u4e2d\u5fc3/gu, "research center"],
  [/\u4fe1\u606f\u5e73\u53f0/gu, "information platform"],
  [/\u751f\u6210/gu, "Include"],
  [/\u6807\u51c6\u6587\u4ef6\u5c55\u793a\u5361\u7247\u7ec4\u4ef6/gu, "standards document card component"],
  [/\u5de6\u4fa7\s*PDF\s*\u56fe\u6807/giu, "left PDF icon"],
  [/\u4e2d\u95f4\u6807\u51c6\u540d\u79f0/gu, "standard name"],
  [/\u6807\u51c6\u7f16\u53f7/gu, "standard ID"],
  [/\u53d1\u5e03\u673a\u6784/gu, "issuing body"],
  [/\u53d1\u5e03\u65e5\u671f/gu, "release date"],
  [/\u53f3\u4fa7\u4e0b\u8f7d\u6309\u94ae/gu, "right-aligned download button"],
  [/\u8bc4\u5206\u53ef\u89c6\u5316\u7ec4\u4ef6/gu, "scoring visualization component"],
  [/\u603b\u5206/gu, "total score"],
  [/\u5706\u5f62\u8fdb\u5ea6\u6761/gu, "circular progress chart"],
  [/\u4e94\u7ef4\u5ea6\u96f7\u8fbe\u56fe/gu, "five-dimension radar chart"],
  [/\u8ba4\u8bc1\u7b49\u7ea7\u5fbd\u7ae0/gu, "certification badge"],
  [/\u751f\u6001\u7eff/gu, "ecological green"],
  [/\u6696\u6a59\u8272/gu, "warm orange"],
  [/\u4e3a\u4e3b\u8272\u8c03/gu, "as the primary palette"],
  [/\u642d\u914d/gu, "paired with"],
  [/\u4f5c\u4e3a\s*CTA\s*\u70b9\u7f00/giu, "as a CTA accent"],
];

export function summarizeWorkflowSourceText(text: string, fallback: string): string {
  const source = normalizeText(text);
  if (!source) return fallback;
  const safe = sanitizeWorkflowArtifactText(source, "");
  if (safe && !/^\.[a-z0-9]{1,6}$/i.test(safe) && /[a-z0-9]/i.test(safe)) return safe;

  let summarized = source
    .replace(/```/g, " ")
    .replace(/[\u201c\u201d\u300c\u300d\u300e\u300f]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u3001\u3002\u3001\u00b7]/g, ", ")
    .replace(/[\uFF1A:]+/g, ": ")
    .replace(/[\uFF08]/g, " (")
    .replace(/[\uFF09]/g, ") ")
    .replace(/[|｜]/g, " | ")
    .replace(/[，；]/g, ", ")
    .replace(/[【】\[\]<>]/g, " ");

  for (const [pattern, replacement] of WORKFLOW_MULTILINGUAL_SUMMARY_REPLACEMENTS) {
    summarized = summarized.replace(pattern, replacement);
  }

  summarized = summarized
    .replace(/\b(CASUX)(Creation|Construction|Certification|Advocacy|Research Center|Information Platform)\b/g, "$1 $2")
    .replace(/\bInclude([A-Za-z])/g, "Include $1")
    .replace(/\bwith([A-Za-z])/g, "with $1")
    .replace(/[\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+\|\s+/g, " | ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/,\s*\|/g, " |")
    .trim();

  const normalized = sanitizeWorkflowArtifactText(summarized, "");
  if (!normalized) return fallback;
  if (/^\.[a-z0-9]{1,6}$/i.test(normalized)) return fallback;
  if (!/[a-z0-9]/i.test(normalized)) return fallback;
  return normalized;
}

function englishOnlyList(items: string[], fallback: string): string {
  const normalized = items
    .map((item) => summarizeWorkflowSourceText(item, ""))
    .filter((item) => isWorkflowArtifactEnglishSafe(item));
  return normalized.length ? normalized.join(" | ") : sanitizeWorkflowArtifactList(items, fallback);
}

function englishOnlyText(text: string, fallback: string): string {
  return summarizeWorkflowSourceText(text, fallback);
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
    CONTENT_INGESTION_FALLBACK_SIGNAL_RE,
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
        sourceKind: "requirement_spec",
        confidence: 0.78,
        extractionReason: "Derived from explicit page structure supplied in the confirmed requirement.",
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
        sourceKind: "fallback",
        confidence: 0.68,
        extractionReason: "Default portfolio home page inferred from site type.",
      },
      {
        route: "/blog",
        title: "Blog",
        purpose: "Publish three opinionated blog entries distilled from the founder's career experience and operating principles.",
        contentInputs,
        sourceKind: "fallback",
        confidence: 0.68,
        extractionReason: "Default portfolio blog page inferred from site type.",
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
  if (/(?:logo\s+source|logo\s+strategy|brandlogo|text wordmark|generated temporary text logo|\u54c1\u724c\u6587\u5b57\u6807\u8bc6|\u6682\u65e0\s*logo)/i.test(source)) {
    return undefined;
  }
  const blockedBrand = /^(?:logo|text[_ -]?mark|wordmark|site|website|blog)$/i;
  const patterns = [
    /(?:named|called|brand(?:\s+name)?|company(?:\s+name)?|organization(?:\s+name)?)\s*[:\uFF1A]?\s*["\u201C\u201D']?([A-Z][A-Z0-9_-]{2,30})["\u201C\u201D']?/i,
    /(?:\u540d\u4e3a|\u540d\u79f0\u4e3a|\u54c1\u724c\u540d\u4e3a|\u673a\u6784\u540d\u4e3a|\u516c\u53f8\u540d\u4e3a|\u4e00\u4e2a\u540d\u4e3a)\s*["\u201C\u201D']?([A-Z][A-Z0-9_-]{2,30})["\u201C\u201D']?/u,
    /["\u201C\u201D']([A-Z][A-Z0-9_-]{2,30})["\u201C\u201D']\s*[\uFF08(][^\uFF09)]{0,80}[\uFF09)]/u,
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
    .replace(/^\s*(?:[-*?+]|\d+[.)])\s+/, "")
    .replace(/\s*(?:page|\u9875\u9762)\s*$/iu, "")
    .replace(/\s*[?(][^?)]*[?)]\s*$/g, "")
    .replace(/[.,;:!??????]+$/g, "")
    .replace(/^["??'`]+|["??'`]+$/g, "")
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

function isKnownShortPageLabel(normalized: string): boolean {
  return [
    "home",
    "about",
    "contact",
    "blog",
    "news",
    "faq",
    "pricing",
    "login",
    "register",
  ].includes(normalized);
}

function scoreSuggestedPageCandidate(page: SuggestedPage): number {
  const normalizedTitle = normalizeLabelForMatching(page.title);
  const routeLeaf = String(page.route || "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
  const normalizedRouteLeaf = normalizeLabelForMatching(routeLeaf);

  if (page.route === "/") return 10;

  let score = 0;

  const matchesKnownAlias = DOCUMENT_PAGE_ROUTE_ALIASES.some((entry) =>
    entry.keys.some((key) => {
      const normalizedKey = normalizeLabelForMatching(key);
      return normalizedTitle === normalizedKey || normalizedRouteLeaf === normalizedKey;
    }),
  );
  if (matchesKnownAlias) score += 4;

  if (/[\u4e00-\u9fff]/.test(page.title) || /\s/.test(page.title)) score += 2;
  if (normalizedRouteLeaf.length >= 5) score += 2;
  if (normalizedTitle.length >= 5) score += 1;

  if (/[\\/]/.test(page.title)) score -= 3;
  if (/^(?:\d+|[a-z]{1,2})$/i.test(normalizedRouteLeaf) && !isKnownShortPageLabel(normalizedTitle)) score -= 4;
  if (/^(?:\d+|[a-z]{1,2})$/i.test(normalizedTitle) && !isKnownShortPageLabel(normalizedTitle)) score -= 4;
  if (/(?:whatsapp|wechat|telegram|line|email|phone|qq|skype|odm|oem|tt|payment|quote)$/i.test(normalizedRouteLeaf)) score -= 5;
  if (/(?:whatsapp|wechat|telegram|line|email|phone|qq|skype|odm|oem|tt|payment|quote)$/i.test(normalizedTitle)) score -= 5;

  return score;
}

function confidenceFromSuggestedPageScore(score: number): number {
  if (score >= 10) return 0.99;
  if (score >= 8) return 0.95;
  if (score >= 6) return 0.9;
  if (score >= 4) return 0.82;
  if (score >= 2) return 0.72;
  return 0.4;
}

function isGenericDocumentPagePlaceholder(page: SuggestedPage): boolean {
  const normalizedTitle = normalizeLabelForMatching(page.title);
  const routeLeaf = String(page.route || "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
  const normalizedRouteLeaf = normalizeLabelForMatching(routeLeaf);
  return /^page\d+$/i.test(normalizedTitle) || /^page\d+$/i.test(normalizedRouteLeaf);
}

function synthesizeStructuredHomePage(pages: SuggestedPage[]): SuggestedPage {
  const featuredInputs = uniqueBriefItems(
    [...pages.map((page) => page.title), "uploaded source document"],
    4,
  );
  return {
    route: "/",
    title: "Home",
    purpose: "Provide the primary landing page that introduces the organization and routes visitors into the source-defined sections.",
    contentInputs: featuredInputs,
    sourceKind: "structural_source",
    confidence: 0.84,
    extractionReason:
      "Synthesized from a degraded structural page plan that contained stable first-level routes but lost the root landing page during source extraction.",
  };
}

function repairStructuredSuggestedPages(pages: SuggestedPage[]): { pages: SuggestedPage[]; gaps: string[] } {
  const gaps: string[] = [];
  const stablePages = pages.filter((page) => !isGenericDocumentPagePlaceholder(page));
  const placeholderPages = pages.filter((page) => isGenericDocumentPagePlaceholder(page));

  let repairedPages = pages;
  if (stablePages.length >= 4 && placeholderPages.length > 0) {
    repairedPages = stablePages;
    gaps.push(
      `Dropped generic source page placeholders (${placeholderPages.map((page) => `${page.title} (${page.route})`).join(", ")}) because the structural page plan already contained stable visitor-facing routes.`,
    );
  }

  const hasHome = repairedPages.some((page) => page.route === "/");
  if (!hasHome && stablePages.length >= 4 && placeholderPages.length > 0) {
    repairedPages = [synthesizeStructuredHomePage(stablePages), ...repairedPages];
    gaps.push(
      "Synthesized a Home route because the structural page plan lost its root entry while retaining multiple stable first-level routes.",
    );
  }

  return { pages: repairedPages, gaps };
}

function filterStructuredSuggestedPages(pages: SuggestedPage[]): { pages: SuggestedPage[]; gaps: string[] } {
  const accepted: SuggestedPage[] = [];
  const gaps: string[] = [];

  for (const page of pages) {
    const score = scoreSuggestedPageCandidate(page);
    if (score < 2) {
      gaps.push(
        `Ignored low-confidence source page candidate "${page.title}" (${page.route}) because it did not look like a stable visitor-facing page.`,
      );
      continue;
    }
    accepted.push({
      ...page,
      sourceKind: page.sourceKind || "structural_source",
      confidence: page.confidence ?? confidenceFromSuggestedPageScore(score),
      extractionReason:
        page.extractionReason ||
        "Derived from explicit navigation or stable structural labels in uploaded/domain source material.",
    });
  }

  const repaired = repairStructuredSuggestedPages(accepted);
  return { pages: repaired.pages, gaps: [...gaps, ...repaired.gaps] };
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
    /(?:nav|navigation|\u4e3b\u5bfc\u822a|\u9876\u90e8\u5bfc\u822a|\u5bfc\u822a\u83dc\u5355|\u4e3b\u5bfc\u822a\u83dc\u5355)[^:?]{0,40}[:?]\s*([\s\S]{1,800}?)(?:\s+-\s*(?:\u53f3\u4e0a\u89d2|right)|\s+?|\n|$)/iu,
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
    const candidate = {
      route,
      title: label,
      purpose: `Build the ${label} page from the uploaded source document, preserving its source-defined role and content modules.`,
      contentInputs: [label, "uploaded source document"],
      sourceKind: "structural_source" as const,
    };
    if (scoreSuggestedPageCandidate(candidate) < 2) {
      gaps.push(
        `Ignored low-confidence source page candidate "${candidate.title}" (${candidate.route}) because it did not look like a stable visitor-facing page.`,
      );
      continue;
    }
    pages.push(candidate);
  }

  return {
    pages: pages.length >= 2 ? pages.slice(0, 16) : [],
    gaps,
  };
}

function extractSuggestedPagesFromStructuralSources(
  sources: WebsiteKnowledgeSource[],
): { pages: SuggestedPage[]; gaps: string[] } {
  const gaps: string[] = [];
  const mergedPages: SuggestedPage[] = [];
  const usedRoutes = new Set<string>();

  for (const source of sources) {
    const extracted = extractDocumentSuggestedPages(source.snippet || "");
    gaps.push(...extracted.gaps);
    for (const page of extracted.pages) {
      const route = dedupeDocumentRoute(page.route, mergedPages.length, usedRoutes);
      if (!route) continue;
      mergedPages.push({
        ...page,
        route,
      });
    }
  }

  const filtered = filterStructuredSuggestedPages(mergedPages);
  return {
    pages: filtered.pages.slice(0, 16),
    gaps: [...gaps, ...filtered.gaps],
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

function trimUrlTrailingPunctuation(value: string): string {
  return String(value || "").replace(/[),.;:!?]+$/g, "");
}

function trimLikelyNaturalLanguageSuffixFromUrl(value: string): string {
  const normalized = trimUrlTrailingPunctuation(value);
  const firstCjkIndex = normalized.search(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  if (firstCjkIndex <= 0) return normalized;
  const candidate = trimUrlTrailingPunctuation(normalized.slice(0, firstCjkIndex));
  if (!candidate) return normalized;
  const reparsed = safeUrl(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  return reparsed ? candidate : normalized;
}

function looksLikeHtmlPageUrl(url: URL): boolean {
  if (!/^https?:$/i.test(url.protocol)) return false;
  const blockedExtensions = /\.(?:pdf|docx?|pptx?|xlsx?|zip|rar|7z|png|jpe?g|gif|svg|webp|css|js|json|xml|txt)$/i;
  return !blockedExtensions.test(url.pathname || "");
}

export function extractExplicitUrlsFromRequirement(requirementText: string): string[] {
  const matches =
    String(requirementText || "").match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) || [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of matches) {
    const raw = trimLikelyNaturalLanguageSuffixFromUrl(match);
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = safeUrl(normalized);
    if (!parsed || !looksLikeHtmlPageUrl(parsed)) continue;
    const key = parsed.toString().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(parsed.toString());
  }
  return urls.slice(0, 4);
}

function extractVisibleNavLabels(html: string): string[] {
  const labels = new Set<string>();
  for (const match of String(html || "").matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = normalizeText(String(match[1] || "").replace(/<[^>]+>/g, " "));
    if (!label || label.length > 36) continue;
    if (/^(?:learn more|read more|contact|quote|download|next|prev|more)$/i.test(label)) continue;
    labels.add(label);
    if (labels.size >= 8) break;
  }
  return Array.from(labels);
}

function extractVisibleHeadingOutline(html: string): string[] {
  const headings = new Set<string>();
  for (const match of String(html || "").matchAll(/<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const heading = normalizeText(String(match[2] || "").replace(/<[^>]+>/g, " "));
    if (!heading || heading.length > 120) continue;
    headings.add(heading);
    if (headings.size >= 6) break;
  }
  return Array.from(headings);
}

function buildUrlPageSnippet(url: string, html: string): string {
  const parsed = htmlToText(html);
  const navLabels = extractVisibleNavLabels(html);
  const headings = extractVisibleHeadingOutline(html);
  const urlObj = safeUrl(url);
  const routeLabel = urlObj?.pathname && urlObj.pathname !== "/" ? `Source page: ${urlObj.pathname}` : "Source page: homepage";
  return [
    routeLabel,
    parsed.title ? `Title: ${parsed.title}` : "",
    parsed.description ? `Description: ${parsed.description}` : "",
    navLabels.length > 0 ? `Main navigation: ${navLabels.join(" | ")}` : "",
    headings.length > 0 ? `Heading outline: ${headings.join(" > ")}` : "",
    parsed.text,
  ]
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 1600);
}

async function collectExplicitUrlPageSources(params: {
  urls: string[];
  timeoutMs: number;
}): Promise<WebsiteKnowledgeSource[]> {
  const sources: WebsiteKnowledgeSource[] = [];
  for (const url of params.urls) {
    const html = await fetchTextWithTimeout(url, Math.max(3000, Math.min(8000, params.timeoutMs)));
    if (!html) continue;
    const parsed = htmlToText(html);
    const snippet = buildUrlPageSnippet(url, html);
    if (!snippet) continue;
    sources.push({
      type: "url_page",
      title: parsed.title || safeUrl(url)?.hostname || url,
      url,
      snippet,
      confidence: 0.96,
    });
  }
  return sources;
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
  if (/琛屼笟璧勬枡|industry research|绔炲搧|competitor|鍚岀被鏈烘瀯|research/i.test(requirementText)) return 5;
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
    .split(/(?<=[.!?銆傦紒锛燂紱;])\s+|[銆傦紒锛燂紱;]\s*/g)
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
  const newSite = /new website|new site|鏂板缓绔檤娌℃湁璧勬枡|鏆傛棤鍐呭|from scratch/i.test(requirementText);
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
    params.requirementText.match(/(?:brand|company|name|\u54c1\u724c|\u516c\u53f8|\u673a\u6784|\u540d\u79f0)\s*[:\uFF1A=]?\s*([^\n,\uFF0C\u3002]+)/i)?.[1] ||
    uploadedBrand ||
    reliableSources.find((source) => source.type === "domain" || source.type === "uploaded_file")?.title ||
    params.domains[0];
  const audience = extractBulletCandidates(combined, [CONTENT_INGESTION_AUDIENCE_RE], 5);
  const offerings = extractBulletCandidates(combined, [CONTENT_INGESTION_OFFERING_RE], 6);
  const differentiators = extractBulletCandidates(combined, [CONTENT_INGESTION_DIFFERENTIATOR_RE], 5);
  const proofPoints = extractBulletCandidates(combined, [CONTENT_INGESTION_PROOF_RE], 5);
  const gaps = [...params.contentGaps];
  const structuralSources = params.sources.filter((source) => source.type === "uploaded_file" || source.type === "url_page");
  const explicitPagePlan = extractSuggestedPagesFromStructuralSources(structuralSources);
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
            { route: "/", title: "Home", purpose: "Explain positioning and route visitors to proof, offerings, and contact.", contentInputs: offerings.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
            { route: "/about", title: "About", purpose: "Build trust with organization background and credentials.", contentInputs: differentiators.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
            { route: "/products", title: "Products or Services", purpose: "Present concrete offerings with scannable details.", contentInputs: offerings.slice(0, 5), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
            { route: "/cases", title: "Cases or Insights", purpose: "Show proof, outcomes, research, and stories.", contentInputs: proofPoints.slice(0, 5), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
            { route: "/contact", title: "Contact", purpose: "Capture leads and inquiries.", contentInputs: audience.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
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
      ...extractBulletCandidates(combined, [CONTENT_INGESTION_AUDIENCE_RE], 5),
    ],
    5,
  );
  const offerings = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [CONTENT_INGESTION_OFFERING_RE], 6),
      ...inferredSignals,
    ],
    6,
  );
  const differentiators = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [CONTENT_INGESTION_DIFFERENTIATOR_RE], 5),
      ...inferredSignals,
    ],
    5,
  );
  const proofPoints = uniqueBriefItems(
    [
      ...extractBulletCandidates(combined, [CONTENT_INGESTION_PROOF_RE], 5),
      ...buildFallbackBusinessSignals([params.requirementText, requirementSpec.customNotes].filter(Boolean).join(" "), 5),
    ],
    5,
  );
  const gaps = [...params.contentGaps];
  const structuralSources = params.sources.filter((source) => source.type === "uploaded_file" || source.type === "url_page");
  const explicitPagePlan = extractSuggestedPagesFromStructuralSources(structuralSources);
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
              { route: "/", title: "Home", purpose: "Explain positioning and route visitors to proof, offerings, and contact.", contentInputs: offerings.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
              { route: "/about", title: "About", purpose: "Build trust with organization background and credentials.", contentInputs: differentiators.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
              { route: "/products", title: "Products or Services", purpose: "Present concrete offerings with scannable details.", contentInputs: offerings.slice(0, 5), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
              { route: "/cases", title: "Cases or Insights", purpose: "Show proof, outcomes, research, and stories.", contentInputs: proofPoints.slice(0, 5), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
              { route: "/contact", title: "Contact", purpose: "Capture leads and inquiries.", contentInputs: audience.slice(0, 3), sourceKind: "fallback", confidence: 0.66, extractionReason: "Default company page inferred because no stronger source-defined plan was available." },
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
  enrichment?: KnowledgeProfileEnrichmentOptions;
}): Promise<WebsiteKnowledgeProfile> {
  const domains = extractDomainsFromRequirement(params.requirementText);
  const explicitUrls = extractExplicitUrlsFromRequirement(params.requirementText);
  const queries = buildWebsiteSearchQueries(params.requirementText, params.maxQueries);
  const enrichment = params.enrichment || {};
  const useDomainSources = enrichment.useDomainSources !== false;
  const useExplicitUrlSources = enrichment.useExplicitUrlSources !== false;
  const useUploadedSources = enrichment.useUploadedSources !== false;
  const useWebSearch = enrichment.useWebSearch !== false;
  const webSources: WebsiteKnowledgeSource[] = [];
  const sources: WebsiteKnowledgeSource[] = [];
  const contentGaps: string[] = [];
  const userInputSource = buildUserInputSource(params.requirementText);
  const skipGenericSearch = shouldSkipGenericSearchForUploadedMaterials({
    requirementText: params.requirementText,
    domains,
    referencedAssets: params.referencedAssets,
  });

  const uploaded = useUploadedSources
    ? await collectUploadedFileSources({
        ownerUserId: params.ownerUserId,
        projectId: params.projectId,
        referencedAssets: params.referencedAssets,
      })
    : { sources: [], gaps: [] as string[] };
  contentGaps.push(...uploaded.gaps);

  const explicitUrlSources = useExplicitUrlSources && explicitUrls.length
    ? await collectExplicitUrlPageSources({
        urls: explicitUrls,
        timeoutMs: params.timeoutMs,
      })
    : [];
  if (useExplicitUrlSources && explicitUrls.length > 0 && explicitUrlSources.length === 0) {
    contentGaps.push(`Explicit URL source was provided (${explicitUrls.join(", ")}) but readable page extraction returned no HTML summary.`);
  }

  if (useWebSearch && params.searchConfig && queries.length > 0 && !skipGenericSearch) {
    const batch = await searchSerperBatch(queries, {
      config: params.searchConfig,
      timeoutMs: Math.max(4000, params.timeoutMs),
    });
    for (const row of batch) {
      webSources.push(...(row.sources || []).map((source) => sourceFromSearch(source)));
    }
  }

  if (useDomainSources && domains.length > 0) {
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

  sources.push(...explicitUrlSources);
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
        (() => {
          const summarizedSnippet = summarizeWorkflowSourceText(source.snippet || "", "");
          return [
          `${source.rank}. [${source.type}] ${englishOnlyText(source.title, `Source ${source.rank}`)}${
            source.location && (isWorkflowArtifactEnglishSafe(source.location) || /^https?:\/\//i.test(source.location))
              ? ` | ${source.location}`
              : ""
          } | confidence ${source.confidence.toFixed(2)}`,
          summarizedSnippet
            ? `   - Evidence: ${summarizedSnippet}`
            : "   - Evidence: source-backed multilingual excerpt exists but still requires a conservative English summary.",
        ].filter(Boolean);
        })(),
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
      const summarizedSnippet = summarizeWorkflowSourceText(source.snippet || "", "");
      return `${index + 1}. [${source.type}] ${title}${location ? ` | ${location}` : ""}${
        summarizedSnippet ? ` | ${summarizedSnippet.slice(0, 260)}` : " | source-backed multilingual text still requires an English-safe summary"
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
  extractExplicitUrlsFromRequirement,
  extractDocumentSuggestedPages,
  extractTextFromUploadedBytes,
  formatWebsiteEvidenceBrief,
  shouldSkipGenericSearchForUploadedMaterials,
};
