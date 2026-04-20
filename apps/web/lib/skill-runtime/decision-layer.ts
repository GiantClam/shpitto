import type { AgentState } from "../agent/graph.ts";

export type PageKind =
  | "home"
  | "products"
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

const ROUTE_ALIASES: Array<{ key: string; route: string }> = [
  { key: "home", route: "/" },
  { key: "3c machines", route: "/3c-machines" },
  { key: "products", route: "/products" },
  { key: "product", route: "/products" },
  { key: "custom solutions", route: "/custom-solutions" },
  { key: "solutions", route: "/custom-solutions" },
  { key: "cases", route: "/cases" },
  { key: "case", route: "/cases" },
  { key: "about", route: "/about" },
  { key: "contact", route: "/contact" },
  { key: "news", route: "/news" },
];

function detectLocale(text: string): "zh-CN" | "en" {
  return /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en";
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

function extractRequirementText(state: AgentState): string {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    const type = String(msg?.constructor?.name || "");
    const content = String(msg?.content || "").trim();
    if (!content) continue;
    if (type === "HumanMessage") return content;
  }
  return "";
}

function extractBrandHint(requirementText: string): string | undefined {
  const direct = requirementText.match(/(?:logo|品牌|brand)\s*[：:]\s*([^\n|]+)/i);
  const value = String(direct?.[1] || "").trim();
  return value || undefined;
}

function extractNavLabels(requirementText: string): string[] {
  const navLine = requirementText.match(/(?:^|\n)\s*(?:nav|导航)\s*[：:]\s*([^\n]+)/i);
  const raw = String(navLine?.[1] || "").trim();
  if (!raw) return [];
  return raw
    .split("|")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function labelsToRoutes(labels: string[]): string[] {
  const routes: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    const matched = ROUTE_ALIASES.find((item) => key.includes(item.key));
    if (matched) {
      routes.push(matched.route);
      continue;
    }
    routes.push(normalizeRoute(label));
  }
  return routes;
}

function routeToNavLabel(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "Home";
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
    case "solutions":
      return {
        pageKind: kind,
        responsibility: "Show customization capability, process, lead-time, and engagement model.",
        contentSkeleton: [
          "hero",
          "solution-scenarios",
          "process-steps",
          "delivery-assurance",
          "support-model",
          "consult-cta",
        ],
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

function buildPageBlueprint(route: string, navLabel?: string): PageBlueprint {
  const normalizedRoute = normalizeRoute(route);
  const kind = inferPageKind(normalizedRoute);
  const template = blueprintByKind(kind);
  return {
    route: normalizedRoute,
    navLabel: String(navLabel || routeToNavLabel(normalizedRoute) || "Page").trim(),
    pageKind: template.pageKind,
    responsibility: template.responsibility,
    contentSkeleton: [...template.contentSkeleton],
    componentMix: { ...template.componentMix },
  };
}

export function buildLocalDecisionPlan(state: AgentState): LocalDecisionPlan {
  const requirementText = extractRequirementText(state);
  const locale = detectLocale(requirementText);
  const navLabels = extractNavLabels(requirementText);
  const navRoutes = labelsToRoutes(navLabels);
  const defaultRoutes = ["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"];
  const merged = Array.from(new Set([...(navRoutes.length ? navRoutes : defaultRoutes), ...defaultRoutes])).map(
    (x) => normalizeRoute(x),
  );
  const routes = merged.slice(0, 12);
  const labelMap = new Map<string, string>();
  for (let i = 0; i < navLabels.length; i += 1) {
    const label = String(navLabels[i] || "").trim();
    const mappedRoute = normalizeRoute(String(navRoutes[i] || ""));
    if (label && mappedRoute) labelMap.set(mappedRoute, label);
  }
  const normalizedNavLabels = routes.map((route) => labelMap.get(route) || routeToNavLabel(route));
  const pageBlueprints = routes.map((route, index) => buildPageBlueprint(route, normalizedNavLabels[index]));

  return {
    requirementText,
    locale,
    navLabels: normalizedNavLabels,
    routes,
    pageBlueprints,
    brandHint: extractBrandHint(requirementText),
  };
}
