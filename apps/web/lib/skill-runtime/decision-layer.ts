import type { AgentState } from "../agent/graph.ts";
import { parseReferencedAssetsFromText } from "../agent/referenced-assets.ts";

export type PageKind =
  | "home"
  | "products"
  | "creation"
  | "construction"
  | "certification"
  | "advocacy"
  | "research"
  | "platform"
  | "downloads"
  | "auth"
  | "solutions"
  | "cases"
  | "about"
  | "contact"
  | "news"
  | "generic";

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
  pageKind: PageKind;
  responsibility: string;
  contentSkeleton: string[];
  componentMix: ComponentMix;
};

export type LocalDecisionPlan = {
  requirementText: string;
  locale: "zh-CN" | "en";
  routes: string[];
  navLabels: string[];
  pageBlueprints: PageBlueprint[];
  brandHint?: string;
};

const ROUTE_ALIASES: Array<{ keys: string[]; route: string }> = [
  { keys: ["home", "homepage", "index", "\u9996\u9875", "\u4e3b\u9875"], route: "/" },
  { keys: ["products", "product", "\u4ea7\u54c1"], route: "/products" },
  { keys: ["customsolutions", "solutions", "solution", "\u65b9\u6848"], route: "/custom-solutions" },
  { keys: ["cases", "case", "\u6848\u4f8b"], route: "/cases" },
  { keys: ["about", "company", "\u5173\u4e8e"], route: "/about" },
  { keys: ["contact", "contacts", "\u8054\u7cfb", "\u54a8\u8be2"], route: "/contact" },
  { keys: ["news", "updates", "\u8d44\u8baf", "\u65b0\u95fb"], route: "/news" },
  { keys: ["casuxcreation", "creation", "\u521b\u8bbe"], route: "/casux-creation" },
  { keys: ["casuxconstruction", "construction", "\u5efa\u8bbe"], route: "/casux-construction" },
  { keys: ["casuxcertification", "casuxqualitymark", "certification", "\u4f18\u6807", "\u6d4b\u8bc4", "\u8ba4\u8bc1"], route: "/casux-certification" },
  { keys: ["casuxadvocacy", "advocacy", "alliance", "\u5021\u5bfc", "\u8054\u76df"], route: "/casux-advocacy" },
  { keys: ["casuxresearchcenter", "researchcenter", "research", "\u7814\u7a76\u4e2d\u5fc3"], route: "/casux-research-center" },
  { keys: ["casuxinformationplatform", "informationplatform", "platform", "\u4fe1\u606f\u5e73\u53f0"], route: "/casux-information-platform" },
  { keys: ["downloads", "download", "\u8d44\u6599\u4e0b\u8f7d", "\u4e0b\u8f7d"], route: "/downloads" },
  { keys: ["login", "signin", "sign-in", "\u767b\u5f55"], route: "/login" },
  { keys: ["register", "signup", "sign-up", "\u6ce8\u518c"], route: "/register" },
];

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
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    const content = extractMessageContent(msg);
    if (!content) continue;
    if (isHumanLikeMessage(msg)) return content;
  }
  const workflow = (state as any)?.workflow_context || {};
  const fallbackCandidates = [
    String(workflow.latestUserText || "").trim(),
    String(workflow.requirementAggregatedText || "").trim(),
    String(workflow.requirementDraft || "").trim(),
    String(workflow.sourceRequirement || "").trim(),
  ];
  for (const candidate of fallbackCandidates) {
    if (candidate) return candidate;
  }
  return "";
}

function extractBrandHint(requirementText: string): string | undefined {
  const direct = requirementText.match(/(?:logo|brand|\u54c1\u724c)\s*[:：]\s*([^\n|,，。]+)/iu);
  if (direct?.[1]) return String(direct[1]).trim();

  const named = requirementText.match(/(?:named|name|\u540d\u4e3a)\s*["“”'`]?([A-Za-z][A-Za-z0-9 _-]{1,48})["“”'`]?/iu);
  if (named?.[1]) return String(named[1]).trim();

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
    .map((item) => cleanLabel(item))
    .filter(Boolean)
    .filter((label) => isLikelyPageLabel(label))
    .filter((label) => !/^https?:\/\//i.test(label))
    .filter((label) => !/\.(css|js|json|png|jpg|jpeg|svg|webp|ico)$/i.test(label))
    .slice(0, 16);
  return labels.length >= 2 ? labels : [];
}

function isLikelyPageLabel(label: string): boolean {
  const text = String(label || "").trim();
  if (!text) return false;
  if (text.length > 48) return false;
  if (/[.!?。！？;；]/.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;

  const blockedHint =
    /(build|generate|ensure|keep|style|script|prompt|draft|assumption|seo|guideline|requirement|must|should|\u8bf7|\u8981\u6c42|\u89c4\u8303|\u8be6\u7ec6|\u89e6\u53d1\u8bcd)/iu;
  if (blockedHint.test(text)) return false;

  const pageHint =
    /(home|products?|3c\s*machines|solutions?|cases?|about|contact|news|downloads?|login|register|creation|construction|certification|advocacy|research|platform|\u9996\u9875|\u4ea7\u54c1|\u65b9\u6848|\u6848\u4f8b|\u5173\u4e8e|\u8054\u7cfb|\u4e0b\u8f7d|\u767b\u5f55|\u6ce8\u518c|\u521b\u8bbe|\u5efa\u8bbe|\u4f18\u6807|\u5021\u5bfc|\u7814\u7a76|\u5e73\u53f0)/iu;
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
  const pageHint = /(pages?|page\s+list|routes?|includes?|navigation|nav|\u9875\u9762|\u5bfc\u822a|\u5305\u62ec|\u5305\u542b)/iu;
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
    /(page|\u9875\u9762|\u9996\u9875|\u767b\u5f55|\u6ce8\u518c|\u4e0b\u8f7d|\u4fe1\u606f\u5e73\u53f0|\u7814\u7a76\u4e2d\u5fc3|\u521b\u8bbe|\u5efa\u8bbe|\u4f18\u6807|\u5021\u5bfc)/iu;
  const blockedHeading =
    /(\u63d0\u793a\u8bcd|\u89c4\u8303|\u7ec4\u4ef6|\u901a\u7528|\u7279\u6b8a|\u8be6\u7ec6|\u6574\u4f53\u5b9a\u4f4d|\u5b50\u57df\u540d|\u8bf4\u660e)/iu;

  for (const match of requirementText.matchAll(headingRegex)) {
    const raw = String(match[1] || "").replace(/^[^\p{L}\p{N}]+/u, "");
    const label = cleanLabel(raw);
    if (!label) continue;
    if (!pageHint.test(label)) continue;
    if (blockedHeading.test(label)) continue;
    if (/^[\u4e00-\u5341]+[銆?锛?]/u.test(label)) continue;
    labels.push(label);
  }

  return Array.from(new Set(labels));
}

function extractNumberedPageLabels(requirementText: string): string[] {
  const labels: string[] = [];
  const pageHint =
    /(home|products?|3c\s*machines|solutions?|cases?|about|contact|news|downloads?|login|register|creation|construction|certification|advocacy|research|platform|\u9996\u9875|\u4ea7\u54c1|\u65b9\u6848|\u6848\u4f8b|\u5173\u4e8e|\u8054\u7cfb|\u4e0b\u8f7d|\u767b\u5f55|\u6ce8\u518c)/iu;
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
  const blockedLine = /(tag|tags|label|filters?|\u6807\u7b7e|header\/nav\/main\/footer|nav\/main\/footer|styles?\.css|script\.js)/iu;
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
      if (/(prompt|draft|generate|assumption|shp|script|styles?)/i.test(route)) continue;
      if (/(^|\/)(nav|main|footer|header|body|head)(\/|$)/i.test(route)) continue;
      routes.push(route);
    }
  }
  return routes;
}

function labelToRoute(label: string, index: number): string {
  const normalizedLabel = normalizeLabelForMatching(label);
  if (!normalizedLabel) return index === 1 ? "/" : `/page-${index}`;

  const matchedAlias = ROUTE_ALIASES.find((entry) =>
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
    "/casux-creation": { zh: "CASUX\u521b\u8bbe", en: "CASUX Creation" },
    "/casux-construction": { zh: "CASUX\u5efa\u8bbe", en: "CASUX Construction" },
    "/casux-certification": { zh: "CASUX\u4f18\u6807", en: "CASUX Certification" },
    "/casux-advocacy": { zh: "CASUX\u5021\u5bfc", en: "CASUX Advocacy" },
    "/casux-research-center": { zh: "CASUX\u7814\u7a76\u4e2d\u5fc3", en: "CASUX Research Center" },
    "/casux-information-platform": { zh: "CASUX\u4fe1\u606f\u5e73\u53f0", en: "CASUX Information Platform" },
    "/downloads": { zh: "\u8d44\u6599\u4e0b\u8f7d", en: "Downloads" },
    "/login": { zh: "\u767b\u5f55", en: "Login" },
    "/register": { zh: "\u6ce8\u518c", en: "Register" },
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

function inferPageKind(route: string): PageKind {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "home";
  if (/\/casux-creation|\/creation/.test(normalized)) return "creation";
  if (/\/casux-construction|\/construction/.test(normalized)) return "construction";
  if (/\/casux-certification|\/certification|\/quality-mark|\/query/.test(normalized)) return "certification";
  if (/\/casux-advocacy|\/advocacy|\/alliance/.test(normalized)) return "advocacy";
  if (/\/casux-research-center|\/research/.test(normalized)) return "research";
  if (/\/casux-information-platform|\/platform/.test(normalized)) return "platform";
  if (/\/downloads?/.test(normalized)) return "downloads";
  if (/\/(login|register|auth|signin|signup)/.test(normalized)) return "auth";
  if (/\/(3c-machines|products?)/.test(normalized)) return "products";
  if (/\/(custom-solutions?|solutions?)/.test(normalized)) return "solutions";
  if (/\/cases?/.test(normalized)) return "cases";
  if (/\/about/.test(normalized)) return "about";
  if (/\/contact/.test(normalized)) return "contact";
  if (/\/news/.test(normalized)) return "news";
  return "generic";
}

function normalizeComponentMix(mix: ComponentMix): ComponentMix {
  const safe = {
    hero: Math.max(0, Number(mix.hero) || 0),
    feature: Math.max(0, Number(mix.feature) || 0),
    grid: Math.max(0, Number(mix.grid) || 0),
    proof: Math.max(0, Number(mix.proof) || 0),
    form: Math.max(0, Number(mix.form) || 0),
    cta: Math.max(0, Number(mix.cta) || 0),
  };

  const total = safe.hero + safe.feature + safe.grid + safe.proof + safe.form + safe.cta;
  if (total <= 0) {
    return { hero: 20, feature: 20, grid: 20, proof: 15, form: 10, cta: 15 };
  }

  const scale = 100 / total;
  return {
    hero: Math.round(safe.hero * scale),
    feature: Math.round(safe.feature * scale),
    grid: Math.round(safe.grid * scale),
    proof: Math.round(safe.proof * scale),
    form: Math.round(safe.form * scale),
    cta: Math.round(safe.cta * scale),
  };
}

function blueprintByKind(kind: PageKind): Omit<PageBlueprint, "route" | "navLabel"> {
  switch (kind) {
    case "home":
      return {
        pageKind: kind,
        responsibility: "Explain value proposition quickly and route users to product, case, and contact flows.",
        contentSkeleton: [
          "hero",
          "value-strip",
          "featured-products",
          "feature-pillars",
          "case-highlights",
          "certification-row",
          "contact-cta",
        ],
        componentMix: normalizeComponentMix({ hero: 22, feature: 18, grid: 22, proof: 18, form: 4, cta: 16 }),
      };
    case "products":
      return {
        pageKind: kind,
        responsibility: "Present product families with specs and strong conversion paths.",
        contentSkeleton: ["hero", "product-grid", "spec-cards", "comparison-strip", "faq", "quote-cta"],
        componentMix: normalizeComponentMix({ hero: 16, feature: 14, grid: 34, proof: 14, form: 6, cta: 16 }),
      };
    case "creation":
      return {
        pageKind: kind,
        responsibility: "Explain how to create compliant child-friendly spaces from scratch with actionable standards.",
        contentSkeleton: ["hero", "definition", "five-dimensions", "space-types", "creation-flow", "case-list"],
        componentMix: normalizeComponentMix({ hero: 16, feature: 28, grid: 22, proof: 14, form: 6, cta: 14 }),
      };
    case "construction":
      return {
        pageKind: kind,
        responsibility: "Provide build guidelines, standard hierarchy, and practical implementation references.",
        contentSkeleton: ["hero", "guides-download", "standard-system", "six-key-elements", "technical-articles", "cta"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 24, grid: 20, proof: 18, form: 6, cta: 18 }),
      };
    case "certification":
      return {
        pageKind: kind,
        responsibility: "Offer transparent certification search and clear application pathways for products and spaces.",
        contentSkeleton: ["hero", "search-panel", "filters", "rating-system", "application-entry", "certified-showcase"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 18, grid: 20, proof: 16, form: 20, cta: 12 }),
      };
    case "advocacy":
      return {
        pageKind: kind,
        responsibility: "Show alliance impact, campaigns, and a clear onboarding path for new members.",
        contentSkeleton: ["hero", "alliance-overview", "member-wall", "events", "city-progress-map", "join-cta"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 20, grid: 20, proof: 18, form: 10, cta: 18 }),
      };
    case "research":
      return {
        pageKind: kind,
        responsibility: "Present research capability, experts, outputs, and international collaborations.",
        contentSkeleton: ["hero", "lab-intro", "research-domains", "expert-team", "publications-reports", "global-partners"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 24, grid: 16, proof: 20, form: 8, cta: 18 }),
      };
    case "platform":
      return {
        pageKind: kind,
        responsibility: "Surface key data, policy intelligence, and subscription updates through interactive modules.",
        contentSkeleton: ["hero", "dashboard-metrics", "tab-navigation", "distribution-map", "data-feed", "subscription-cta"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 20, grid: 26, proof: 16, form: 8, cta: 16 }),
      };
    case "downloads":
      return {
        pageKind: kind,
        responsibility: "Enable efficient discovery and retrieval of standard documents and reports.",
        contentSkeleton: ["hero", "filters", "document-list", "preview-entry", "hot-downloads", "login-hint"],
        componentMix: normalizeComponentMix({ hero: 12, feature: 16, grid: 30, proof: 18, form: 8, cta: 16 }),
      };
    case "auth":
      return {
        pageKind: kind,
        responsibility: "Provide secure login or registration with clear value communication.",
        contentSkeleton: ["hero", "auth-form", "user-types", "benefits", "agreement-consent", "help-links"],
        componentMix: normalizeComponentMix({ hero: 12, feature: 14, grid: 10, proof: 14, form: 36, cta: 14 }),
      };
    case "solutions":
      return {
        pageKind: kind,
        responsibility: "Show customization capability, process, lead-time, and engagement model.",
        contentSkeleton: ["hero", "solution-scenarios", "process-steps", "delivery-assurance", "support-model", "consult-cta"],
        componentMix: normalizeComponentMix({ hero: 16, feature: 26, grid: 20, proof: 16, form: 6, cta: 16 }),
      };
    case "cases":
      return {
        pageKind: kind,
        responsibility: "Build trust with real case outcomes and manufacturing credibility.",
        contentSkeleton: ["hero", "case-gallery", "result-metrics", "client-proof", "timeline", "contact-cta"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 16, grid: 30, proof: 22, form: 4, cta: 14 }),
      };
    case "about":
      return {
        pageKind: kind,
        responsibility: "Communicate company story, capability depth, and compliance.",
        contentSkeleton: ["hero", "company-story", "milestones", "rd-and-factory", "certification-row", "contact-cta"],
        componentMix: normalizeComponentMix({ hero: 14, feature: 26, grid: 14, proof: 24, form: 6, cta: 16 }),
      };
    case "contact":
      return {
        pageKind: kind,
        responsibility: "Capture leads through multi-channel contact and quote form.",
        contentSkeleton: ["hero", "contact-channels", "quote-form", "service-commitment", "privacy-consent", "faq"],
        componentMix: normalizeComponentMix({ hero: 12, feature: 16, grid: 8, proof: 14, form: 36, cta: 14 }),
      };
    case "news":
      return {
        pageKind: kind,
        responsibility: "Publish updates with readable category-based news listing and subscriptions.",
        contentSkeleton: ["hero", "category-tabs", "news-grid", "feature-article", "subscribe-cta"],
        componentMix: normalizeComponentMix({ hero: 12, feature: 18, grid: 30, proof: 20, form: 6, cta: 14 }),
      };
    default:
      return {
        pageKind: "generic",
        responsibility: "Provide route-specific information with clear navigation and conversion endpoint.",
        contentSkeleton: ["hero", "content-sections", "proof", "cta"],
        componentMix: normalizeComponentMix({ hero: 18, feature: 22, grid: 20, proof: 18, form: 8, cta: 14 }),
      };
  }
}

function buildPageBlueprint(route: string, locale: "zh-CN" | "en", navLabel?: string): PageBlueprint {
  const normalizedRoute = normalizeRoute(route);
  const kind = inferPageKind(normalizedRoute);
  const template = blueprintByKind(kind);

  return {
    route: normalizedRoute,
    navLabel: String(navLabel || routeToNavLabel(normalizedRoute, locale) || (locale === "zh-CN" ? "\u9875\u9762" : "Page")).trim(),
    pageKind: template.pageKind,
    responsibility: template.responsibility,
    contentSkeleton: [...template.contentSkeleton],
    componentMix: { ...template.componentMix },
  };
}

export function buildLocalDecisionPlan(state: AgentState): LocalDecisionPlan {
  const rawRequirementText = extractRequirementText(state);
  const parsedRequirement = parseReferencedAssetsFromText(rawRequirementText);
  const requirementText = parsedRequirement.cleanText || rawRequirementText;
  const locale = detectLocale(requirementText);
  const navLabels = extractNavLabels(requirementText);
  const commaLabels = extractCommaPageLabels(requirementText);
  const numberedLabels = extractNumberedPageLabels(requirementText);
  const headingLabels = extractPageHeadingLabels(requirementText);
  const mergedLabels = Array.from(new Set([...navLabels, ...commaLabels, ...numberedLabels, ...headingLabels])).filter(
    (label) => isLikelyPageLabel(label),
  );

  const labelRoutes = labelsToRoutes(mergedLabels);
  const explicitRoutes = extractExplicitRoutes(requirementText);
  const stateRoutes = Array.isArray(state.sitemap)
    ? state.sitemap.map((item) => normalizeRoute(String(item || "")))
    : [];

  const candidates = [...stateRoutes, ...labelRoutes, ...explicitRoutes];
  const withHome = candidates.some((route) => normalizeRoute(route) === "/") ? candidates : ["/", ...candidates];
  const routes = uniqueRoutes(withHome.length > 0 ? withHome : ["/"]).slice(0, 16);

  const labelMap = new Map<string, string>();
  for (let i = 0; i < mergedLabels.length; i += 1) {
    const label = String(mergedLabels[i] || "").trim();
    const mappedRoute = normalizeRoute(labelToRoute(label, i + 1));
    if (label && mappedRoute && !labelMap.has(mappedRoute)) {
      labelMap.set(mappedRoute, label);
    }
  }

  const normalizedNavLabels = routes.map((route) => labelMap.get(route) || routeToNavLabel(route, locale));
  const pageBlueprints = routes.map((route, index) => buildPageBlueprint(route, locale, normalizedNavLabels[index]));

  return {
    requirementText,
    locale,
    navLabels: normalizedNavLabels,
    routes,
    pageBlueprints,
    brandHint: extractBrandHint(requirementText),
  };
}


