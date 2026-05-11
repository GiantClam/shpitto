import type { AgentState } from "../agent/graph.ts";
import { parseReferencedAssetsFromText } from "../agent/referenced-assets.ts";
import { routePlanningPolicy } from "./route-planning-policy.ts";

export type PageIntentSource =
  | "workflow_contract"
  | "prompt_contract"
  | "requirement_spec"
  | "explicit_route"
  | "nav_label"
  | "state_sitemap"
  | "auto_plan"
  | "default";

export type ComponentMix = {
  hero: number;
  feature: number;
  grid: number;
  proof: number;
  form: number;
  cta: number;
};

export type PageBlueprint = {
  route: string;
  navLabel: string;
  purpose: string;
  source: PageIntentSource;
  evidence?: string;
  constraints: string[];
  pageKind: "intent" | "home" | "search-directory" | "blog-data-index" | "auth";
  responsibility: string;
  contentSkeleton: string[];
  componentMix: ComponentMix;
};

export type LocalDecisionPlan = {
  requirementText: string;
  locale: "zh-CN" | "en";
  routes: string[];
  navLabels: string[];
  pageIntents: PageBlueprint[];
  pageBlueprints: PageBlueprint[];
  brandHint?: string;
};

function detectLocale(text: string): "zh-CN" | "en" {
  return /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en";
}

function normalizeLabelForMatching(label: string): string {
  return String(label || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

function normalizeRoute(route: string): string {
  const raw = String(route || "").trim();
  if (!raw) return "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isSyntheticLocaleMirrorRoute(route: string, baseRoutes: string[]): boolean {
  const normalized = normalizeRoute(route);
  if (!/^\/(?:zh|zh-cn|en)(?:\/|$)/i.test(normalized)) return false;
  const stripped = normalizeRoute(normalized.replace(/^\/(?:zh|zh-cn|en)(?=\/|$)/i, "") || "/");
  if (stripped === normalized) return false;
  return !baseRoutes.some((candidate) => {
    const normalizedCandidate = normalizeRoute(candidate);
    return normalizedCandidate === normalized || normalizedCandidate === stripped;
  });
}

function isSearchDirectoryRoute(route: string, label: string): boolean {
  const text = `${normalizeRoute(route)} ${String(label || "").trim()}`.toLowerCase();
  return /(certification|search|directory|download|downloads|query|lookup|catalog|results|assessment|evaluation)/i.test(text);
}

function slugifyLabel(label: string): string {
  return String(label || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractMessageContent(raw: any): string {
  const direct = String(raw?.content || "").trim();
  if (direct) return direct;

  const kwargsContent = raw?.kwargs?.content;
  if (typeof kwargsContent === "string" && kwargsContent.trim()) {
    return kwargsContent.trim();
  }
  if (Array.isArray(kwargsContent)) {
    const parts = kwargsContent
      .map((part: any) => String(part?.text || part?.content || "").trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n").trim();
  }
  return "";
}

function isHumanLikeMessage(raw: any): boolean {
  const ctorName = String(raw?.constructor?.name || "").toLowerCase();
  if (ctorName === "humanmessage") return true;

  const role = String(raw?.role || "").toLowerCase();
  if (role === "user" || role === "human") return true;

  const type = String(raw?.type || raw?._getType?.() || "").toLowerCase();
  if (type === "human" || type === "humanmessage") return true;

  const idPath = Array.isArray(raw?.id) ? raw.id.join("/") : String(raw?.id || "");
  return /humanmessage/i.test(idPath);
}

function extractRequirementText(state: AgentState): string {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const humanMessages: string[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    const content = extractMessageContent(msg);
    if (!content) continue;
    if (isHumanLikeMessage(msg)) humanMessages.push(content);
  }
  const workflow = (state as any)?.workflow_context || {};
  const executionMode = String(workflow.executionMode || "").trim().toLowerCase();
  const fallbackCandidates = [
    ...(executionMode === "refine"
      ? [
          String(workflow.latestUserText || "").trim(),
          String(workflow.canonicalPrompt || "").trim(),
          String(workflow.sourceRequirement || "").trim(),
          String(workflow.requirementAggregatedText || "").trim(),
        ]
      : [
          String(workflow.canonicalPrompt || "").trim(),
          String(workflow.sourceRequirement || "").trim(),
          String(workflow.requirementAggregatedText || "").trim(),
          String(workflow.latestUserText || "").trim(),
        ]),
    ...humanMessages,
  ];
  return Array.from(new Set(fallbackCandidates.filter(Boolean))).join("\n\n").trim();
}

function extractBrandHint(requirementText: string): string | undefined {
  if (/(?:logo\s+source|logo\s+strategy|text wordmark|generated temporary text logo|品牌文字标识|暂无\s*logo)/i.test(requirementText)) {
    return undefined;
  }
  const direct = requirementText.match(/(?:logo|brand|\u54c1\u724c)\s*[:：]\s*([^\n|,，。]+)/iu);
  if (direct?.[1]) {
    const value = String(direct[1]).trim();
    if (!/^(?:logo|text[_ -]?mark|wordmark|site|website|blog|brand)$/i.test(value)) return value;
  }

  const named = requirementText.match(/(?:named|name|\u540d\u4e3a)\s*["“”'`]?([A-Za-z][A-Za-z0-9 _-]{1,48})["“”'`]?/iu);
  if (named?.[1]) {
    const value = String(named[1]).trim();
    if (!/^(?:logo|text[_ -]?mark|wordmark|site|website|blog|brand)$/i.test(value)) return value;
  }

  return undefined;
}

function cleanLabel(raw: string): string {
  return String(raw || "")
    .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "")
    .replace(/\s*(?:\u9875\u9762|page)\s*$/iu, "")
    .replace(/\s*[（(][^）)]*[）)]\s*$/g, "")
    .replace(/[.,;:!?。！？；：]+$/g, "")
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .trim();
}

function splitPipeLabels(raw: string): string[] {
  const source = String(raw || "").trim();
  if (!source.includes("|")) return [];
  const content = source.includes(":") || source.includes("：") ? source.split(/[:：]/).slice(1).join(":") : source;
  return content
    .split("|")
    .map((item) => cleanLabel(item))
    .filter(Boolean);
}

function splitCommaLabels(raw: string): string[] {
  const source = String(raw || "").trim();
  if (!source || !/[,\uFF0C\u3001]/.test(source)) return [];
  const content = source.includes(":") || source.includes("：") ? source.split(/[:：]/).slice(1).join(":") : source;
  const labels = content
    .split(/[,\uFF0C\u3001]/)
    .map((item) => cleanLabel(String(item || "").replace(/[.!?。！？;；]\s+[\s\S]*$/u, "")))
    .filter(Boolean)
    .filter((label) => isLikelyPageLabel(label))
    .filter((label) => !/^https?:\/\//i.test(label))
    .filter((label) => !/\.(css|js|json|png|jpg|jpeg|svg|webp|ico)$/i.test(label))
    .slice(0, 16);
  return labels.length >= 2 ? labels : [];
}

const PROMPT_PLANNING_ARTIFACT_LABELS = new Set(
  routePlanningPolicy.blockedLabels.map((label) => normalizeLabelForMatching(label)).filter(Boolean),
);

const AUTO_PAGE_PLANNING_PATTERNS = routePlanningPolicy.autoPlanningIntentPatterns
  .map((pattern) => {
    try {
      return new RegExp(pattern, "iu");
    } catch {
      return undefined;
    }
  })
  .filter((pattern): pattern is RegExp => Boolean(pattern));

function isPromptPlanningArtifactLabel(label: string): boolean {
  const normalized = normalizeLabelForMatching(cleanLabel(label));
  if (!normalized) return false;
  return PROMPT_PLANNING_ARTIFACT_LABELS.has(normalized);
}

function isPromptPlanningArtifactRoute(route: string): boolean {
  const normalized = normalizeRoute(route);
  if (!normalized || normalized === "/") return false;
  return isPromptPlanningArtifactLabel(normalized.replace(/^\//, "").replace(/[-_/]+/g, " "));
}

function isImplementationMechanicsRoute(route: string): boolean {
  const normalized = normalizeRoute(route);
  if (!normalized || normalized === "/") return false;
  return /(?:^|\/)(?:api|storage|runtime|hydration|fallback|data-source|backend|worker|prompt|contract)(?:\/|$)/i.test(
    normalized,
  );
}

function isRoutePlanningArtifact(route: string): boolean {
  const normalized = normalizeRoute(route);
  if (!normalized || normalized === "/") return false;
  if (/^\/\d+$/.test(normalized)) return true;
  if (isPromptPlanningArtifactRoute(normalized)) return true;
  if (isImplementationMechanicsRoute(normalized)) return true;

  const segments = normalized
    .replace(/^\//, "")
    .split("/")
    .map((segment) => segment.replace(/[-_]+/g, " "))
    .filter(Boolean);

  return segments.some((segment) => isPromptPlanningArtifactLabel(segment));
}

function isLikelyPageLabel(label: string): boolean {
  const text = String(label || "").trim();
  if (!text) return false;
  if (text.length > 48) return false;
  if (/[.!?。！？;；]/.test(text)) return false;
  if (isPromptPlanningArtifactLabel(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;

  const blockedHint =
    /(build|generate|ensure|keep|style|script|prompt|draft|assumption|seo|guideline|requirement|must|should|\u8bf7|\u8981\u6c42|\u89c4\u8303|\u8be6\u7ec6|\u89e6\u53d1\u8bcd)/iu;
  if (blockedHint.test(text)) return false;

  const pageHint =
    /(home|products?|3c\s*machines|solutions?|cases?|about|contact|blogs?|news|downloads?|login|register|password|reset|forgot|verify|verification|creation|construction|certification|advocacy|research|platform|\u9996\u9875|\u4ea7\u54c1|\u65b9\u6848|\u6848\u4f8b|\u5173\u4e8e|\u8054\u7cfb|\u535a\u5ba2|\u6587\u7ae0|\u4e0b\u8f7d|\u767b\u5f55|\u6ce8\u518c|\u5bc6\u7801|\u9a8c\u8bc1|\u521b\u8bbe|\u5efa\u8bbe|\u4f18\u6807|\u5021\u5bfc|\u7814\u7a76|\u5e73\u53f0)/iu;
  if (pageHint.test(text)) return true;

  return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,32}$/.test(text) && words.length <= 3;
}

function extractNavLabels(requirementText: string): string[] {
  const lines = requirementText.split(/\r?\n/).map((line) => String(line || ""));
  const labels: string[] = [];
  const navHint = /(^|\b)(nav|navigation)\b|(\u4e3b\u5bfc\u822a|\u9876\u90e8\u5bfc\u822a|\u5bfc\u822a\u83dc\u5355|\u4e3b\u5bfc\u822a\u83dc\u5355)/iu;
  const blockedHint = /(tab|tabs|\u5206\u7c7b\u5bfc\u822a|\u4fe1\u606f\u5206\u7c7b)/iu;

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i].trim();
    if (!current) continue;
    if (!navHint.test(current)) continue;
    if (blockedHint.test(current)) continue;

    let combined = current;
    let cursor = i + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor].trim();
      if (!candidate || !candidate.includes("|")) break;
      combined += ` ${candidate}`;
      cursor += 1;
    }

    labels.push(...splitPipeLabels(combined));
  }

  if (labels.length > 0) return Array.from(new Set(labels));

  for (const line of lines) {
    if ((line.match(/\|/g) || []).length < 3) continue;
    labels.push(...splitPipeLabels(line));
  }

  return Array.from(new Set(labels));
}

function extractCommaPageLabels(requirementText: string): string[] {
  const lines = requirementText.split(/\r?\n/).map((line) => String(line || "").trim());
  const labels: string[] = [];
  const pageHint = /(pages?|page\s+list|routes?|includes?|navigation|nav|login|register|password|reset|forgot|verify|verification|\u9875\u9762|\u5bfc\u822a|\u5305\u62ec|\u5305\u542b|\u767b\u5f55|\u6ce8\u518c|\u5bc6\u7801|\u9a8c\u8bc1)/iu;
  const blockedHint = /(color|typography|spacing|style\s+guide|seo|meta|tag|tags|label|filters?|\u6807\u7b7e|\u989c\u8272|\u5b57\u4f53|\u89c4\u8303)/iu;

  for (const line of lines) {
    if (!line || !/[,\uFF0C\u3001]/.test(line)) continue;
    if (blockedHint.test(line)) continue;
    if (!pageHint.test(line)) continue;
    labels.push(...splitCommaLabels(line));
  }

  return Array.from(new Set(labels));
}

function extractPageHeadingLabels(requirementText: string): string[] {
  const labels: string[] = [];
  const headingRegex = /^\s{0,3}#{1,6}\s*(.+?)\s*$/gm;
  const pageHint =
    /(page|\u9875\u9762|\u9996\u9875|\u767b\u5f55|\u6ce8\u518c|\u5bc6\u7801|\u9a8c\u8bc1|\u4e0b\u8f7d|\u4fe1\u606f\u5e73\u53f0|\u7814\u7a76\u4e2d\u5fc3|\u521b\u8bbe|\u5efa\u8bbe|\u4f18\u6807|\u5021\u5bfc)/iu;
  const blockedHeading =
    /(\u63d0\u793a\u8bcd|\u89c4\u8303|\u7ec4\u4ef6|\u901a\u7528|\u7279\u6b8a|\u8be6\u7ec6|\u6574\u4f53\u5b9a\u4f4d|\u5b50\u57df\u540d|\u8bf4\u660e)/iu;

  for (const match of requirementText.matchAll(headingRegex)) {
    const raw = String(match[1] || "").replace(/^[^\p{L}\p{N}]+/u, "");
    const label = cleanLabel(raw);
    if (!label) continue;
    if (!pageHint.test(label)) continue;
    if (blockedHeading.test(label)) continue;
    if (/^[\u4e00-\u5341]+[、，：:]/u.test(label)) continue;
    labels.push(label);
  }

  return Array.from(new Set(labels));
}

function extractNumberedPageLabels(requirementText: string): string[] {
  const labels: string[] = [];
  const pageHint =
    /(home|products?|3c\s*machines|solutions?|cases?|about|contact|blogs?|news|downloads?|login|register|password|reset|forgot|verify|verification|creation|construction|certification|advocacy|research|platform|\u9996\u9875|\u4ea7\u54c1|\u65b9\u6848|\u6848\u4f8b|\u5173\u4e8e|\u8054\u7cfb|\u535a\u5ba2|\u6587\u7ae0|\u4e0b\u8f7d|\u767b\u5f55|\u6ce8\u518c|\u5bc6\u7801|\u9a8c\u8bc1)/iu;
  const blockedHint =
    /(color|typography|spacing|style\s+guide|seo|meta|cta|guideline|\u989c\u8272|\u5b57\u4f53|\u95f4\u8ddd|\u89c4\u8303|\u63d0\u793a\u8bcd)/iu;
  const lineRegex = /^\s*(?:[-*]\s*)?(?:\d{1,2}[\).])\s*([^\n]{1,120})$/gmu;

  for (const match of requirementText.matchAll(lineRegex)) {
    const raw = String(match[1] || "");
    const head = raw.split(/[\(\uFF08]/)[0] || raw;
    const label = cleanLabel(head.replace(/\s*[:\uFF1A].*$/, ""));
    if (!label) continue;
    if (blockedHint.test(label)) continue;
    if (!pageHint.test(label)) continue;
    labels.push(label);
  }

  return Array.from(new Set(labels));
}

function extractExplicitRoutes(requirementText: string): string[] {
  const routes: string[] = [];
  const lines = requirementText.split(/\r?\n/).map((line) => String(line || ""));
  const lineHint = /(route|path|url|href|sitemap|nav|navigation|\u9875\u9762|\u8def\u5f84|\u94fe\u63a5|\u5bfc\u822a)/iu;
  const blockedLine =
    /(tag|tags|label|filters?|\u6807\u7b7e|header\/nav\/main\/footer|nav\/main\/footer|styles?\.css|script\.js|css\s*\/\s*js|open\s+graph|seo\s+meta|html5)/iu;
  const routeRegex = /\/[a-zA-Z0-9][a-zA-Z0-9/_-]{0,80}/g;

  for (const line of lines) {
    if (!lineHint.test(line)) continue;
    if (blockedLine.test(line)) continue;
    for (const match of line.matchAll(routeRegex)) {
      const route = normalizeRoute(String(match[0] || "").trim());
      if (!route || route === "/") {
        routes.push("/");
        continue;
      }
      if (/\.(css|js|json|png|jpg|jpeg|svg|webp|ico|map)$/i.test(route)) continue;
      if (route.length > 48) continue;
      if (/^\/\d+$/.test(route)) continue;
      if (/^\/(?:css|js|asset|assets|static|src|dist)$/i.test(route)) continue;
      if (/(prompt|draft|generate|assumption|shp|script|styles?)/i.test(route)) continue;
      if (/(^|\/)(nav|main|footer|header|body|head)(\/|$)/i.test(route)) continue;
      if (isPromptPlanningArtifactRoute(route)) continue;
      routes.push(route);
    }
  }
  return routes;
}

function hasAutoPagePlanningIntent(requirementText: string): boolean {
  return AUTO_PAGE_PLANNING_PATTERNS.some((pattern) => pattern.test(requirementText));
}

function hasExplicitSinglePageIntent(requirementText: string): boolean {
  const text = String(requirementText || "").toLowerCase();
  if (!text.trim()) return false;
  const singlePagePatterns = [
    /\b(?:single|one)[-\s]?page(?:\s+(?:website|site|landing page|homepage|public website))?\b/i,
    /\b(?:one|1)\s+(?:homepage|home page)\s+only\b/i,
    /\b(?:homepage|home page)\s+only\b/i,
    /\bone\s+page\s+only\b/i,
    /(?:单页网站|单页面网站|单页站点|仅首页|只生成首页|只要首页|一个首页)/iu,
  ];
  const multiPageOverride =
    /\b(?:multi|multiple)[-\s]?page\b/i.test(text) ||
    /(?:多页网站|多页面网站|多页站点|多个页面)/iu.test(text);
  return !multiPageOverride && singlePagePatterns.some((pattern) => pattern.test(text));
}

function inferDefaultAutoRoutes(requirementText: string): string[] {
  const routes =
    routePlanningPolicy.defaultAutoRoutes.length > 0
      ? routePlanningPolicy.defaultAutoRoutes.map((route) => normalizeRoute(route))
      : ["/", "/about", "/custom-solutions", "/cases", "/contact"];

  for (const rule of routePlanningPolicy.conditionalAutoRoutes) {
    const matched = rule.matchPatterns.some((pattern) => {
      try {
        return new RegExp(pattern, "iu").test(requirementText);
      } catch {
        return false;
      }
    });
    const route = normalizeRoute(rule.route);
    if (!matched || !route || routes.includes(route)) continue;

    const insertBefore = rule.insertBefore ? normalizeRoute(rule.insertBefore) : "";
    const insertAt = insertBefore ? routes.indexOf(insertBefore) : -1;
    if (insertAt >= 0) {
      routes.splice(insertAt, 0, route);
    } else {
      routes.push(route);
    }
  }

  return routes;
}

function normalizeStructuredRoutes(routes: unknown[]): string[] {
  return uniqueRoutes(
    routes
      .map((route) => normalizeRoute(String(route || "")))
      .filter((route) => route && !isRoutePlanningArtifact(route)),
  );
}

function normalizeStructuredNavLabels(labels: unknown[], routes: string[], locale: "zh-CN" | "en"): string[] {
  return routes.map((route, index) => {
    const raw = cleanLabel(String(labels[index] || ""));
    if (!raw || raw.length > 32 || /[.!?。！？;；]/.test(raw) || isPromptPlanningArtifactLabel(raw)) {
      return routeToNavLabel(route, locale);
    }
    return raw;
  });
}

type PromptControlManifestRoutePlan = {
  routes: string[];
  navLabels: string[];
};

function extractFixedOutputFileRoutePlan(requirementText: string): PromptControlManifestRoutePlan {
  const source = String(requirementText || "");
  const match = source.match(/### Fixed Pages And File Output\s*([\s\S]*?)(?=\n### |\n## |\Z)/i);
  if (!match?.[1]) return { routes: [], navLabels: [] };
  const files = String(match[1])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .map((file) => filePathToRoute(file))
    .filter(Boolean);
  return { routes: normalizeStructuredRoutes(files), navLabels: [] };
}

function filePathToRoute(filePath: string): string {
  const normalized = normalizeRoute(String(filePath || "").replace(/\.(html?)$/i, ""));
  if (!normalized || normalized === "/index") return "/";
  if (normalized.endsWith("/index")) return normalizeRoute(normalized.slice(0, -("/index".length)) || "/");
  return "";
}

function extractPromptControlManifestRoutePlan(
  requirementText: string,
  locale: "zh-CN" | "en",
): PromptControlManifestRoutePlan {
  const source = String(requirementText || "");
  if (!source.includes("Prompt Control Manifest")) return extractFixedOutputFileRoutePlan(source);

  const contractBlock = source.match(/Prompt Control Manifest[^\n]*[\s\S]*?```(?:json)?\s*([\s\S]*?)```/i);
  const rawJson = String(contractBlock?.[1] || "").trim();
  if (!rawJson) return extractFixedOutputFileRoutePlan(source);

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return extractFixedOutputFileRoutePlan(source);
  }

  const routes = Array.isArray(parsed?.routes) ? normalizeStructuredRoutes(parsed.routes) : [];
  if (routes.length > 0) {
    return {
      routes,
      navLabels: Array.isArray(parsed?.navLabels) ? normalizeStructuredNavLabels(parsed.navLabels, routes, locale) : [],
    };
  }

  const files = Array.isArray(parsed?.files)
    ? parsed.files.map((file: unknown) => filePathToRoute(String(file || ""))).filter(Boolean)
    : [];
  const fileRoutes = normalizeStructuredRoutes(files);
  return fileRoutes.length > 0 ? { routes: fileRoutes, navLabels: [] } : extractFixedOutputFileRoutePlan(source);
}

function extractWorkflowPromptControlManifestRoutePlan(
  state: AgentState,
  locale: "zh-CN" | "en",
): PromptControlManifestRoutePlan {
  const workflow = ((state as any)?.workflow_context || {}) as Record<string, any>;
  const contract =
    workflow.promptControlManifest && typeof workflow.promptControlManifest === "object"
      ? workflow.promptControlManifest
      : undefined;
  if (!contract) return { routes: [], navLabels: [] };

  const routes = Array.isArray(contract.routes) ? normalizeStructuredRoutes(contract.routes) : [];
  if (routes.length > 0) {
    return {
      routes,
      navLabels: Array.isArray(contract.navLabels) ? normalizeStructuredNavLabels(contract.navLabels, routes, locale) : [],
    };
  }

  const files = Array.isArray(contract.files)
    ? contract.files.map((file: unknown) => filePathToRoute(String(file || ""))).filter(Boolean)
    : [];
  const fileRoutes = normalizeStructuredRoutes(files);
  return { routes: fileRoutes, navLabels: [] };
}

function extractRequirementSpecRoutes(state: AgentState, requirementText: string): string[] {
  const workflow = ((state as any)?.workflow_context || {}) as Record<string, any>;
  const spec = workflow.requirementSpec && typeof workflow.requirementSpec === "object" ? workflow.requirementSpec : undefined;
  const pageStructure = spec?.pageStructure && typeof spec.pageStructure === "object" ? spec.pageStructure : undefined;
  if (!pageStructure) return [];

  const mode = String(pageStructure.mode || "").toLowerCase();
  const planning = String(pageStructure.planning || "").toLowerCase();
  if (mode === "single") return ["/"];

  const pages = Array.isArray(pageStructure.pages) ? pageStructure.pages : Array.isArray(spec?.pages) ? spec.pages : [];
  if (pages.length > 0) return normalizeStructuredRoutes(labelsToRoutes(pages.map((page: unknown) => String(page || ""))));

  if (mode === "multi" && planning === "auto") return inferDefaultAutoRoutes(requirementText);
  return [];
}

function labelToRoute(label: string, index: number): string {
  const normalizedLabel = normalizeLabelForMatching(label);
  if (!normalizedLabel) return index === 1 ? "/" : `/page-${index}`;

  const matchedAlias = routePlanningPolicy.routeAliases.find((entry) =>
    entry.keys.some((key) => normalizedLabel.includes(normalizeLabelForMatching(key))),
  );
  if (matchedAlias) return matchedAlias.route;
  if (normalizedLabel === "home") return "/";

  const slug = slugifyLabel(label);
  if (!slug) return `/page-${index}`;
  return normalizeRoute(`/${slug}`);
}

function labelsToRoutes(labels: string[]): string[] {
  return labels.map((label, index) => labelToRoute(label, index + 1));
}

function uniqueRoutes(routes: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    const normalized = normalizeRoute(route);
    if (!normalized) continue;
    if (isRoutePlanningArtifact(normalized)) continue;
    if (isImplementationMechanicsRoute(normalized)) continue;

    if (normalized === "/") {
      if (!seen.has("/")) {
        seen.add("/");
        output.push("/");
      }
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function routeToNavLabel(route: string, locale: "zh-CN" | "en" = "en"): string {
  const normalized = normalizeRoute(route);
  const knownLabels: Record<string, { zh: string; en: string }> = {
    "/": { zh: "\u9996\u9875", en: "Home" },
    "/products": { zh: "\u4ea7\u54c1", en: "Products" },
    "/custom-solutions": { zh: "\u65b9\u6848", en: "Solutions" },
    "/cases": { zh: "\u6848\u4f8b", en: "Cases" },
    "/blog": { zh: "\u535a\u5ba2", en: "Blog" },
    "/news": { zh: "\u65b0\u95fb", en: "News" },
    "/contact": { zh: "\u8054\u7cfb", en: "Contact" },
    "/about": { zh: "\u5173\u4e8e", en: "About" },
    "/downloads": { zh: "\u8d44\u6599\u4e0b\u8f7d", en: "Downloads" },
    "/login": { zh: "\u767b\u5f55", en: "Login" },
    "/register": { zh: "\u6ce8\u518c", en: "Register" },
    "/reset-password": { zh: "\u627e\u56de\u5bc6\u7801", en: "Reset Password" },
    "/verify-email": { zh: "\u9a8c\u8bc1\u90ae\u7bb1", en: "Verify Email" },
  };

  if (knownLabels[normalized]) return locale === "zh-CN" ? knownLabels[normalized].zh : knownLabels[normalized].en;

  return normalized
    .replace(/^\//, "")
    .split("/")
    .join(" ")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function orderNavigationRoutes(routes: string[]): string[] {
  const normalizedRoutes = uniqueRoutes(routes);
  const homeRoutes = normalizedRoutes.filter((route) => normalizeRoute(route) === "/");
  const aboutRoutes = normalizedRoutes.filter((route) => /^\/about(?:\/|$)/.test(normalizeRoute(route)));
  const contactRoutes = normalizedRoutes.filter((route) => /^\/contact(?:\/|$)/.test(normalizeRoute(route)));
  const authRoutes = normalizedRoutes.filter((route) => /^(?:\/login|\/register|\/reset-password|\/verify-email)(?:\/|$)/.test(normalizeRoute(route)));
  const middleRoutes = normalizedRoutes.filter((route) => {
    const normalized = normalizeRoute(route);
    return (
      normalized !== "/" &&
      !/^\/about(?:\/|$)/.test(normalized) &&
      !/^\/contact(?:\/|$)/.test(normalized) &&
      !/^(?:\/login|\/register|\/reset-password|\/verify-email)(?:\/|$)/.test(normalized)
    );
  });

  return [...homeRoutes, ...middleRoutes, ...contactRoutes, ...aboutRoutes, ...authRoutes];
}

function shouldEnsureBlogRoute(): boolean {
  return String(process.env.SHPITTO_GENERATION_BLOG_ROUTE || "1").trim() !== "0";
}

function safeRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return undefined;
  }
}

function scoreBlogSemanticRoute(route: string, navLabel: string): { score: number; reasons: string[] } {
  const normalizedRoute = normalizeRoute(route);
  const text = `${normalizedRoute} ${String(navLabel || "")}`.trim();
  const policy = routePlanningPolicy.blogSemanticRoutePolicy;
  const fallbackRoute = normalizeRoute(policy.fallbackRoute || "/blog");
  if (normalizedRoute === fallbackRoute || normalizedRoute === "/blog") {
    return { score: 100, reasons: ["explicit Blog route"] };
  }

  let score = 0;
  const reasons: string[] = [];
  for (const signal of policy.signals) {
    if (signal.patterns.some((pattern) => safeRegex(pattern)?.test(text))) {
      score += signal.score;
      if (signal.reason) reasons.push(signal.reason);
    }
  }
  for (const signal of policy.negativeSignals) {
    if (signal.patterns.some((pattern) => safeRegex(pattern)?.test(text))) {
      score -= signal.score;
      if (signal.reason) reasons.push(`negative: ${signal.reason}`);
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

function isBlogSemanticRoute(route: string, navLabel: string): boolean {
  const result = scoreBlogSemanticRoute(route, navLabel);
  const threshold = routePlanningPolicy.blogSemanticRoutePolicy.confidenceThreshold || 70;
  return result.score >= threshold;
}

function findBlogSemanticRoute(routes: string[], navLabels?: string[]): string | undefined {
  const candidates = routes.map((route, index) => {
    const normalizedRoute = normalizeRoute(route);
    const label = String(navLabels?.[index] || routeToNavLabel(normalizedRoute)).trim();
    return {
      route: normalizedRoute,
      ...scoreBlogSemanticRoute(normalizedRoute, label),
      index,
    };
  });
  const threshold = routePlanningPolicy.blogSemanticRoutePolicy.confidenceThreshold || 70;
  return candidates
    .filter((candidate) => candidate.score >= threshold)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.route;
}

function requirementRequestsBlogSurface(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const negative = [
    /(?:不要|不需要|无需|仅首页|只做首页).{0,12}(?:blog|博客|博文)/i,
    /(?:do not|don't|no need|without|home only|single page).{0,20}(?:blog|post archive|article archive)/i,
  ];
  if (negative.some((pattern) => pattern.test(normalized))) return false;
  return /(?:\bblog\b|博客|博文|blog页面|blog route|文章列表|文章归档|内容归档|3篇\s*blog|\d+\s*篇\s*(?:blog|博客|文章))/i.test(
    normalized,
  );
}

function ensureBlogRoute(routes: string[], options: { singlePage: boolean; requirementText: string }): string[] {
  const normalizedRoutes = uniqueRoutes(routes);
  if (!shouldEnsureBlogRoute() || options.singlePage) return normalizedRoutes;
  if (!requirementRequestsBlogSurface(options.requirementText)) return normalizedRoutes;
  if (findBlogSemanticRoute(normalizedRoutes)) return normalizedRoutes;
  return uniqueRoutes([...normalizedRoutes, "/blog"]);
}

const EMPTY_COMPONENT_MIX: ComponentMix = { hero: 0, feature: 0, grid: 0, proof: 0, form: 0, cta: 0 };

const BLOG_DATA_SOURCE_CONSTRAINTS = [
  "Treat the selected Blog-capable navigation route as a first-class page-specific content surface, not a generic article mockup, detached landing page, or visible backend implementation block.",
  'The generated page for that route must include data-shpitto-blog-root and data-shpitto-blog-api="/api/blog/posts" inside the page collection/list/database module.',
  "Inside that section, include a data-shpitto-blog-list container with polished fallback resource cards that match the route taxonomy, language, typography, spacing, and visual system.",
  "Implementation mechanics are invisible infrastructure. Do not expose backend names, API/storage/runtime/hydration/fallback jargon, data-source mechanics, English design jargon, or policy wording in visitor-facing copy unless the route itself is explicitly Blog.",
  "Do not mention deployment refresh, fallback behavior, data hydration, API mechanics, data attributes, backend storage, or internal prompt terminology in visitor-facing copy.",
  "Use source-aligned fallback resource titles/excerpts only as preview fallbacks; deployment replaces or refreshes them from the project-scoped Blog D1 Worker API.",
  "Detail links must use /blog/{slug}/ so deployment-time static detail pages and sitemap output are SEO-addressable.",
  "Dynamic /blog/{slug}/ detail pages should inherit the selected route's detail grammar, such as resource, report, standard, case, news, insight, or blog article according to route semantics.",
  "Do not generate D1 credentials, Cloudflare binding code, worker code, or database secrets in static HTML.",
];

function allIndexesOf(input: string, needle: string): number[] {
  const text = String(input || "");
  const term = String(needle || "").trim();
  if (!term) return [];
  const indexes: number[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(term, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + Math.max(1, term.length);
  }
  return indexes;
}

function compactExcerpt(input: string, maxChars: number): string {
  const text = String(input || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars)).trim()}\n[excerpt truncated]`;
}

function escapeRegExp(input: string): string {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceTailStartIndex(text: string): number {
  const markers = [
    "External Research Addendum",
    "Website Knowledge Profile",
    "Uploaded materials",
    "\u4e0a\u4f20\u6587\u6863",
    "\u5404\u9875\u9762\u8be6\u7ec6",
  ];
  const indexes = markers.map((marker) => text.indexOf(marker)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : 0;
}

const PAGE_MARKER_PATTERN = "(?:page|route|home|channel|\\u9875\\u9762|\\u9801\\u9762|\\u7f51\\u9875|\\u7db2\\u9801|\\u9891\\u9053|\\u2eda\\u2faf|\\u9996\\u9875|\\u4e3b\\u9875)";

function routeSearchTerms(route: string, navLabel: string): string[] {
  const normalizedRoute = normalizeRoute(route);
  const routeLeaf = normalizedRoute.split("/").filter(Boolean).join(" ");
  const routeLabel = routeLeaf
    .split(/[-_ ]+/g)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : ""))
    .filter(Boolean)
    .join(" ");
  return Array.from(
    new Set([navLabel, normalizedRoute, routeLeaf, routeLabel].map((item) => String(item || "").trim()).filter(Boolean)),
  );
}

function scorePageBriefCandidate(text: string, index: number, sourceStart: number, terms: string[], route: string, term: string): number {
  const before = text.slice(Math.max(0, index - 160), index);
  const after = text.slice(index, Math.min(text.length, index + 420));
  const near = before + after;
  const pageMarkerRegex = new RegExp(PAGE_MARKER_PATTERN, "iu");
  let score = 0;
  if (index >= sourceStart) score += 20;
  if (/(?:^|\n)\s*(?:#{1,5}\s*)?(?:[-*\d.()]+|--\s*\d+\s+of\s+\d+\s*--)?/i.test(before)) score += 4;
  if (/--\s*\d+\s+of\s+\d+\s*--/i.test(near)) score += 18;
  if (pageMarkerRegex.test(near)) score += 10;
  if (term && new RegExp(`${escapeRegExp(term)}.{0,40}${PAGE_MARKER_PATTERN}`, "iu").test(after)) {
    score += 30;
  }
  if (/(?:\u751f\u6210|generate|build)[^\n]{0,60}$/iu.test(before)) {
    score += 55;
  }
  if (/[\u3010\[]/.test(after) || /(?:section|module|\u533a\u5757|\u6a21\u5757|\u5305\u542b|\u751f\u6210)/iu.test(after)) score += 10;
  if (new RegExp(`(?:\\u751f\\u6210|generate|build).{0,140}${PAGE_MARKER_PATTERN}`, "iu").test(near)) score += 30;
  if (term && new RegExp(`^\\s*\\d+[\\).]\\s*${escapeRegExp(term)}\\s*[\\u2014\\-]`, "iu").test(after)) {
    score -= 45;
  }
  if (/(?:\u6838\u5fc3\u677f\u5757\u5165\u53e3|\u67e5\u770b\u8be6\u60c5|quick entry)/iu.test(near)) {
    score -= 25;
  }
  if (/Build the .{0,80} uploaded source document/i.test(after) || /preserving its source-defined role/i.test(after)) {
    score -= 80;
  }
  if (/Page intent: Dedicated page/i.test(after) || /Derive its content depth/i.test(after)) {
    score -= 35;
  }
  if (route === "/" && /(?:home|\u9996\u9875|\u4e3b\u9875|\u2eda\u2faf)/iu.test(near)) score += 12;
  if (route === "/") {
    const blockedHomeTerms = [
      /资料下载/iu,
      /下载/iu,
      /认证入口/iu,
      /认证查询/iu,
      /查询/iu,
      /申请系统/iu,
      /login/iu,
      /register/iu,
    ];
    if (blockedHomeTerms.some((pattern) => pattern.test(near))) score -= 60;
  }
  for (const term of terms) {
    if (after.includes(term)) score += 2;
  }
  return score;
}

function findNextPageBoundary(text: string, from: number, terms: string[]): number {
  const boundaries: number[] = [];
  const tail = text.slice(from);
  const headingMatch = tail.search(/\n#{1,5}\s+/);
  if (headingMatch > 0) boundaries.push(from + headingMatch);
  const numberedPageMatch = tail.search(/\n\s*(?:--\s*\d+\s+of\s+\d+\s*--|(?:\d+[\).]|[-*])\s+)/i);
  if (numberedPageMatch > 20) boundaries.push(from + numberedPageMatch);
  for (const term of terms) {
    if (!term) continue;
    const index = text.indexOf(term, from + 120);
    if (index > from + 240) {
      const nearby = text.slice(Math.max(from, index - 100), Math.min(text.length, index + 160));
      if (new RegExp(`${PAGE_MARKER_PATTERN}|--\\s*\\d+\\s+of\\s+\\d+\\s*--`, "iu").test(nearby)) boundaries.push(index);
    }
  }
  return boundaries.length ? Math.min(...boundaries) : -1;
}

function findPageBriefStart(text: string, index: number, sourceStart: number): number {
  const prefix = text.slice(Math.max(0, sourceStart), index);
  const markerMatches = [...prefix.matchAll(/\n\s*(?:--\s*\d+\s+of\s+\d+\s*--|#{1,5}\s+|(?:\d+[\).]|[-*])\s+)/gi)];
  const marker = markerMatches.length ? markerMatches[markerMatches.length - 1] : undefined;
  const markerStart = marker && marker.index !== undefined ? Math.max(0, sourceStart + marker.index + 1) : undefined;
  const localBase = Math.max(markerStart ?? sourceStart, index - 260);
  const localBefore = text.slice(localBase, index);
  const generatedStart = Math.max(
    localBefore.lastIndexOf("\u751f\u6210"),
    localBefore.toLowerCase().lastIndexOf("generate"),
    localBefore.toLowerCase().lastIndexOf("build"),
  );
  if (generatedStart >= 0) return localBase + generatedStart;
  if (markerStart !== undefined) return markerStart;
  return Math.max(sourceStart, Math.max(0, index - 120));
}

export function extractRouteSourceBrief(
  requirementText: string,
  route: string,
  navLabel: string,
  maxChars = 3600,
): string {
  const text = String(requirementText || "").trim();
  if (!text) return "";
  const terms = routeSearchTerms(route, navLabel);
  if (route === "/") {
    terms.push("Home", "\u9996\u9875", "\u4e3b\u9875");
  }
  const uniqueTerms = Array.from(new Set(terms.filter(Boolean)));
  if (uniqueTerms.length === 0) return "";
  const sourceStart = sourceTailStartIndex(text);
  const candidates = uniqueTerms.flatMap((term) => allIndexesOf(text, term).map((index) => ({ term, index })));
  if (candidates.length === 0) return "";
  const best = candidates
    .map((candidate) => ({
      ...candidate,
      score: scorePageBriefCandidate(text, candidate.index, sourceStart, uniqueTerms, route, candidate.term),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index)[0];
  if (!best || best.score < 8) return "";

  const start = findPageBriefStart(text, best.index, sourceStart);
  const boundary = findNextPageBoundary(text, start + 1, uniqueTerms.filter((term) => term !== best.term));
  const end = boundary > start ? boundary : Math.min(text.length, best.index + maxChars + 600);
  return compactExcerpt(text.slice(start, end), maxChars);
}

function buildPageBlueprint(
  route: string,
  locale: "zh-CN" | "en",
  navLabel?: string,
  source: PageIntentSource = "default",
  evidence?: string,
): PageBlueprint {
  const normalizedRoute = normalizeRoute(route);
  const resolvedLabel = String(navLabel || routeToNavLabel(normalizedRoute, locale) || (locale === "zh-CN" ? "\u9875\u9762" : "Page")).trim();
  if (normalizedRoute === "/login" || normalizedRoute === "/register" || normalizedRoute === "/reset-password" || normalizedRoute === "/verify-email") {
    const authLabel = resolvedLabel || routeToNavLabel(normalizedRoute, locale);
    const authCopy: Record<
      string,
      { purpose: string; skeleton: string[] }
    > = {
      "/login": {
        purpose: `Sign-in page for "${authLabel}". Keep email login, Google OAuth, password recovery, and next-path handling inside one branded shell.`,
        skeleton: [
          "Auth hero with concise value proposition and trust cue",
          "Google sign-in and email/password form",
          "Forgot password entry point that preserves next",
          "Sign-up link for new users",
        ],
      },
      "/register": {
        purpose: `Registration page for "${authLabel}". Keep email registration, Google OAuth, and verification guidance inside the same theme shell.`,
        skeleton: [
          "Registration hero with trust-building copy",
          "Google sign-up and email/password form",
          "Email verification guidance and next-step explanation",
          "Back-to-sign-in link",
        ],
      },
      "/reset-password": {
        purpose: `Password reset page for "${authLabel}". Keep the flow minimal, clear, and consistent with the site theme.`,
        skeleton: [
          "Reset-password hero with security guidance",
          "New password and confirmation fields",
          "Success state that returns the user to sign in",
        ],
      },
      "/verify-email": {
        purpose: `Email verification page for "${authLabel}". Keep verification status, resend, and return-to-sign-in paths consistent with the site style.`,
        skeleton: [
          "Verification hero and status message",
          "Resend verification action",
          "Displayed email context and sign-in return link",
        ],
      },
    };
    const copy = authCopy[normalizedRoute];
    return {
      route: normalizedRoute,
      navLabel: authLabel,
      purpose: copy.purpose,
      source,
      evidence,
      constraints: [
        "Canonical Website Prompt remains authoritative for brand voice, audience, language, and visual direction.",
        "Auth pages must match the site's color system, typography, spacing, and brand tone.",
        "Preserve next destinations through login, registration, verification, and reset-password links.",
        "Do not use detached stock auth UI or alternate branding.",
      ],
      pageKind: "auth",
      responsibility: copy.purpose,
      contentSkeleton: copy.skeleton,
      componentMix: { hero: 18, feature: 0, grid: 0, proof: 10, form: 57, cta: 15 },
    };
  }
  if (isBlogSemanticRoute(normalizedRoute, resolvedLabel)) {
    const semanticScore = scoreBlogSemanticRoute(normalizedRoute, resolvedLabel);
    const purpose = `Content collection page for "${resolvedLabel}". The visible page must follow this route's own information architecture; implementation capability must not become a visitor-facing topic.`;
    return {
      route: normalizedRoute,
      navLabel: resolvedLabel,
      purpose,
      source,
      evidence,
      constraints: [
        "Canonical Website Prompt remains authoritative for brand voice, audience, language, and visual direction.",
        `Blog backend route confidence: ${semanticScore.score}/100${semanticScore.reasons.length ? ` (${semanticScore.reasons.join("; ")})` : ""}.`,
        ...BLOG_DATA_SOURCE_CONSTRAINTS,
      ],
      pageKind: "blog-data-index",
      responsibility: purpose,
      contentSkeleton: [
        "Site-matched hero explaining the value of this route's content/resource system",
        'Page-specific data-backed collection surface: <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
        "Fallback resource cards inside [data-shpitto-blog-list] using the selected route taxonomy, categories, excerpts, dates, tags, and /blog/{slug}/ detail links",
        "For information-platform or knowledge-hub routes, structure the visible list around page collections such as case library, standards/documents, research reports, policy updates, or product database entries when supported by the prompt",
        "Optional category/filter controls only if they are styled, page-specific, and usable with the static HTML content",
        "Contextual CTA that connects readers back to the site's primary conversion path",
      ],
      componentMix: { hero: 20, feature: 15, grid: 35, proof: 5, form: 0, cta: 25 },
    };
  }
  if (normalizedRoute === "/") {
    const purpose = "Homepage. Establish the brand overview, core value, primary route entry, and next action while preserving site home-entry semantics.";
    return {
      route: normalizedRoute,
      navLabel: resolvedLabel,
      purpose,
      source,
      evidence,
      constraints: [
        "Canonical Website Prompt remains authoritative for brand voice, audience, language, and visual direction.",
        "Do not reframe the homepage as a downloads hub, certification portal, or login page.",
        "Use a clear hero, overview, proof, and CTA rhythm; do not copy a downstream inner page layout.",
      ],
      pageKind: "home",
      responsibility: purpose,
      contentSkeleton: [
        "Brand-led hero establishing the site home entry",
        "Core value or capability overview with distinct supporting cards",
        "Evidence, standards, or proof section that reinforces the site mission",
        "Primary CTA to the most important next step",
      ],
      componentMix: { hero: 30, feature: 25, grid: 15, proof: 20, form: 0, cta: 10 },
    };
  }
  if (isSearchDirectoryRoute(normalizedRoute, resolvedLabel)) {
    const purpose = "Search-directory page. Provide search, filtering, results, and next-step guidance in one closed loop.";
    return {
      route: normalizedRoute,
      navLabel: resolvedLabel,
      purpose,
      source,
      evidence,
      constraints: [
        "Canonical Website Prompt remains authoritative for brand voice, audience, language, and visual direction.",
        "Search results and query cards must occupy the full available row; never leave them as narrow fragments inside a 12-column grid.",
        "Keep the visual rail compact unless it contains real media, charts, or metrics.",
      ],
      pageKind: "search-directory",
      responsibility: purpose,
      contentSkeleton: [
        "Query or filter controls aligned to the route's directory purpose",
        "Full-width result stack with readable cards or rows",
        "Methodology, criteria, or explanation section for result interpretation",
        "Application CTA to the next step",
      ],
      componentMix: { hero: 15, feature: 10, grid: 35, proof: 20, form: 10, cta: 10 },
    };
  }
  const purpose =
    normalizedRoute === "/"
      ? "Primary landing page. Derive the hero, section order, and conversion path from the confirmed Canonical Website Prompt and source content."
      : `Dedicated page for "${resolvedLabel}". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.`;
  const constraints = [
    "Canonical Website Prompt is the authoritative source for website type, audience, content scope, page structure, and design direction.",
    "Do not use hardcoded industry templates, product assumptions, or generic replacement text when the Canonical Website Prompt provides source content.",
    "The page must be meaningfully distinct from sibling pages in section purpose, headings, content, and layout.",
    "Navigation links must stay within the fixed route list and preserve the configured navigation order.",
  ];

  return {
    route: normalizedRoute,
    navLabel: resolvedLabel,
    purpose,
    source,
    evidence,
    constraints,
    pageKind: "intent",
    responsibility: purpose,
    contentSkeleton: [],
    componentMix: { ...EMPTY_COMPONENT_MIX },
  };
}

export function buildLocalDecisionPlan(state: AgentState): LocalDecisionPlan {
  const rawRequirementText = extractRequirementText(state);
  const parsedRequirement = parseReferencedAssetsFromText(rawRequirementText);
  const requirementText = parsedRequirement.cleanText || rawRequirementText;
  const locale = detectLocale(requirementText);
  const workflowContractPlan = extractWorkflowPromptControlManifestRoutePlan(state, locale);
  const promptContractPlan =
    workflowContractPlan.routes.length > 0 ? { routes: [], navLabels: [] } : extractPromptControlManifestRoutePlan(requirementText, locale);
  const workflowContractRoutes = workflowContractPlan.routes;
  const contractRoutes = workflowContractRoutes.length > 0 ? workflowContractRoutes : promptContractPlan.routes;
  const explicitRoutes = extractExplicitRoutes(requirementText).filter((route) => !isRoutePlanningArtifact(route));
  const hasExplicitRoutePlan = explicitRoutes.length > 0;
  const singlePageRoutes =
    contractRoutes.length > 0 || hasExplicitRoutePlan ? [] : hasExplicitSinglePageIntent(requirementText) ? ["/"] : [];
  const specRoutes =
    contractRoutes.length > 0 || hasExplicitRoutePlan || singlePageRoutes.length > 0
      ? []
      : extractRequirementSpecRoutes(state, requirementText);
  const navLabels = extractNavLabels(requirementText);
  const commaLabels = extractCommaPageLabels(requirementText);
  const numberedLabels = extractNumberedPageLabels(requirementText);
  const headingLabels = extractPageHeadingLabels(requirementText);
  const mergedLabels = Array.from(new Set([...navLabels, ...commaLabels, ...numberedLabels, ...headingLabels])).filter(
    (label) => isLikelyPageLabel(label),
  );

  const labelRoutes = labelsToRoutes(mergedLabels).filter((route) => !isRoutePlanningArtifact(route));
  const nonStateKnownRoutes = [
    ...contractRoutes,
    ...explicitRoutes,
    ...singlePageRoutes,
    ...specRoutes,
    ...labelRoutes,
  ].map((route) => normalizeRoute(route));
  const stateRoutes = Array.isArray(state.sitemap)
    ? state.sitemap.map((item) => normalizeRoute(String(item || ""))).filter((route) => !isRoutePlanningArtifact(route))
        .filter((route) => !isSyntheticLocaleMirrorRoute(route, nonStateKnownRoutes))
    : [];

  const candidates = hasExplicitRoutePlan ? explicitRoutes : [...stateRoutes, ...labelRoutes, ...explicitRoutes];
  const plannedFallback = candidates.length === 0 && hasAutoPagePlanningIntent(requirementText) ? inferDefaultAutoRoutes(requirementText) : [];
  const baseRoutes =
    contractRoutes.length > 0
      ? contractRoutes
      : hasExplicitRoutePlan
          ? explicitRoutes
        : singlePageRoutes.length > 0
          ? singlePageRoutes
          : specRoutes.length > 0
            ? specRoutes
            : candidates.length > 0
              ? candidates
              : plannedFallback;
  const withHome = baseRoutes.some((route) => normalizeRoute(route) === "/") ? baseRoutes : ["/", ...baseRoutes];
  const withSystemRoutes = ensureBlogRoute(withHome.length > 0 ? withHome : ["/"], {
    singlePage: singlePageRoutes.length > 0,
    requirementText,
  });
  const routes = orderNavigationRoutes(withSystemRoutes).slice(0, 16);

  const labelMap = new Map<string, string>();
  const structuredNavLabels =
    workflowContractPlan.navLabels.length > 0
      ? workflowContractPlan.navLabels
      : promptContractPlan.navLabels.length > 0
        ? promptContractPlan.navLabels
        : [];
  const structuredRoutes = workflowContractRoutes.length > 0 ? workflowContractRoutes : promptContractPlan.routes;
  for (let i = 0; i < structuredRoutes.length; i += 1) {
    const route = normalizeRoute(structuredRoutes[i]);
    const label = String(structuredNavLabels[i] || "").trim();
    if (route && label && !labelMap.has(route)) {
      labelMap.set(route, label);
    }
  }
  if (!hasExplicitRoutePlan) {
    for (let i = 0; i < mergedLabels.length; i += 1) {
      const label = String(mergedLabels[i] || "").trim();
      const mappedRoute = normalizeRoute(labelToRoute(label, i + 1));
      if (label && mappedRoute && !labelMap.has(mappedRoute)) {
        labelMap.set(mappedRoute, label);
      }
    }
  }

  const normalizedNavLabels = routes.map((route) => labelMap.get(route) || routeToNavLabel(route, locale));
  const pageIntentSource: PageIntentSource =
    workflowContractRoutes.length > 0
      ? "workflow_contract"
      : contractRoutes.length > 0
        ? "prompt_contract"
        : hasExplicitRoutePlan
            ? "explicit_route"
          : singlePageRoutes.length > 0
            ? "requirement_spec"
            : specRoutes.length > 0
              ? "requirement_spec"
              : stateRoutes.length > 0
                ? "state_sitemap"
                : labelRoutes.length > 0
                  ? "nav_label"
                  : explicitRoutes.length > 0
                    ? "explicit_route"
                    : plannedFallback.length > 0
                      ? "auto_plan"
                      : "default";
  const pageBlueprints = routes.map((route, index) =>
    buildPageBlueprint(route, locale, normalizedNavLabels[index], pageIntentSource, requirementText.slice(0, 800)),
  );

  return {
    requirementText,
    locale,
    navLabels: normalizedNavLabels,
    routes,
    pageIntents: pageBlueprints,
    pageBlueprints,
    brandHint: extractBrandHint(requirementText),
  };
}


