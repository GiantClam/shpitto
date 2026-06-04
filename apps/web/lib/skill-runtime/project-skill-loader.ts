import path from "node:path";

import {
  parseSkillFrontmatterSummary,
  parseWebsiteSkillMetadata,
  type SkillFrontmatterSummary,
  type WebsiteSkillMetadata,
} from "./od-skill-metadata.ts";
import {
  isImportedSkillFirstSurfaceMode,
  shouldSelectImportedWebsiteSkill,
  type WebsiteSurfaceMode,
} from "./open-design-adoption.ts";
import {
  classifyWebsiteSeedOrigin,
  resolveWebsiteArtifactGeneratorMode,
  scoreWebsiteSeedOriginForGenerator,
  type WebsiteArtifactGeneratorMode,
} from "./website-artifact-generator.ts";
import { selectWebsiteGenerationTypeSkill } from "./website-type-selector.ts";

export type ProjectSkillDescriptor = {
  id: string;
  rootDir: string;
  skillMdPath: string;
  skillJsonPath?: string;
  content: string;
  config?: Record<string, unknown>;
  websiteMetadata?: WebsiteSkillMetadata;
  frontmatter: SkillFrontmatterSummary;
  seedContract?: ProjectSkillSeedContract;
  resourceIndex?: ProjectSkillResourceIndex;
};

export type ProjectSkillBundleDescriptor = {
  requestedIds: string[];
  resolvedIds: string[];
  skills: ProjectSkillDescriptor[];
};

const SKILL_ALIAS_MAP: Record<string, string> = {
  brainstorming: "superpowers-brainstorming",
  "writing-plans": "superpowers-writing-plans",
  "static-site-html-page": "website-generation-workflow",
  "static-site-css": "website-generation-workflow",
  "static-site-js": "website-generation-workflow",
  "static-site-script": "website-generation-workflow",
  "static-site-shared-assets": "website-generation-workflow",
};

export const WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID = "website-orchestrator";
export const WEBSITE_GENERATION_TYPE_SKILL_IDS = [
  "corporate-b2b-site",
  "marketing-landing-site",
  "portfolio-blog-site",
  "docs-knowledge-site",
  "content-hub-site",
] as const;

export const WEBSITE_GENERATION_SKILL_BUNDLE: string[] = [
  WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID,
  "website-generation-workflow",
  "blog-detail-fill-workflow",
  "brainstorming",
  "writing-plans",
  "web-image-generator",
  "web-icon-library",
  "end-to-end-validation",
  "verification-before-completion",
  "visual-qa-mandatory",
  "responsive-by-default",
  "section-quality-checklist",
];

export const DOCUMENT_CONTENT_SKILL_IDS = ["pdf", "docx", "pptx"] as const;

const DEFAULT_SKILLS_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "skills");

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getProjectSkillsRoot(start?: string): Promise<string> {
  if (!start) return DEFAULT_SKILLS_ROOT;
  const candidates = [path.join(path.resolve(/* turbopackIgnore: true */ start), "skills"), DEFAULT_SKILLS_ROOT];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return candidates[0];
}

function toSkillId(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveProjectSkillAlias(skillId: string): string {
  const normalized = toSkillId(skillId);
  if (!normalized) return normalized;
  if (normalized.startsWith("static-site-")) return "website-generation-workflow";
  return SKILL_ALIAS_MAP[normalized] || normalized;
}

type ProjectSkillIndexEntry = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  rootDir: string;
  skillMdPath: string;
  websiteMetadata?: WebsiteSkillMetadata;
};

export type ProjectSkillTemplateSummary = {
  path: string;
  tokenNames: string[];
  responsiveBreakpoint?: string;
  keyClasses: string[];
  structureExcerpt: string[];
  routeExcerpts?: Partial<Record<ProjectSkillRouteFamily, string[]>>;
};

export type ProjectSkillChecklistSummary = {
  path: string;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  criticalChecks: string[];
  mustPassExcerpt: string[];
};

export type ProjectSkillRouteFamily =
  | "home"
  | "products"
  | "solutions"
  | "cases"
  | "about"
  | "contact"
  | "docs"
  | "resource"
  | "blog";

export type ProjectSkillSeedRouteOverride = {
  homepageTopologyClass?: string;
  openingFamily?: string;
  sectionCadence?: string[];
  allowedComponentRhythms?: string[];
  bannedGenericOpenings?: string[];
  componentBans?: string[];
  mediaPosture?: string;
  typographyPosture?: string;
  ctaPosture?: string;
};

export type ProjectSkillSeedContract = {
  contractVersion?: number;
  homepageTopologyClass?: string;
  openingFamily?: string;
  sectionCadence?: string[];
  allowedComponentRhythms?: string[];
  bannedGenericOpenings?: string[];
  componentBans?: string[];
  mediaPosture?: string;
  typographyPosture?: string;
  ctaPosture?: string;
  compatibleSurfaceModes?: WebsiteSurfaceMode[];
  visualBoldness?: "standard" | "high";
  routeOverrides?: Partial<Record<ProjectSkillRouteFamily, ProjectSkillSeedRouteOverride>>;
};

export type ProjectSkillContractSummary = {
  path: string;
  homepageTopologyClass?: string;
  openingFamily?: string;
  visualBoldness?: "standard" | "high";
  compatibleSurfaceModes: WebsiteSurfaceMode[];
  routeFamilies: ProjectSkillRouteFamily[];
  contractExcerpt: string[];
  routeExcerpts: Partial<Record<ProjectSkillRouteFamily, string[]>>;
};

export type ProjectSkillResourceIndex = {
  contractJson?: ProjectSkillContractSummary;
  templateHtml?: ProjectSkillTemplateSummary;
  exampleHtml?: ProjectSkillTemplateSummary;
  checklist?: ProjectSkillChecklistSummary;
};

export type WebsiteSeedSkillSelection = {
  id: string;
  score: number;
  reason: string;
};

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // Ignore invalid or missing JSON: skill runtime can still rely on SKILL.md.
  }
  return undefined;
}

function uniqueTrimmed(items: string[]): string[] {
  return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function clipResourceExcerptValue(value: string, maxChars = 140): string {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeRouteFamily(value: unknown): ProjectSkillRouteFamily | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "home" ||
    normalized === "products" ||
    normalized === "solutions" ||
    normalized === "cases" ||
    normalized === "about" ||
    normalized === "contact" ||
    normalized === "docs" ||
    normalized === "resource" ||
    normalized === "blog"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueTrimmed(value.map((item) => String(item || "")));
}

function normalizeSurfaceModeArray(value: unknown): WebsiteSurfaceMode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(
      (item): item is WebsiteSurfaceMode =>
        item === "corporate-b2b-site" ||
        item === "marketing-landing-site" ||
        item === "portfolio-blog-site" ||
        item === "docs-knowledge-site" ||
        item === "content-hub-site",
    );
}

function normalizeSeedRouteOverride(value: unknown): ProjectSkillSeedRouteOverride | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sectionCadence = normalizeStringArray(record.sectionCadence);
  const allowedComponentRhythms = normalizeStringArray(record.allowedComponentRhythms);
  const bannedGenericOpenings = normalizeStringArray(record.bannedGenericOpenings);
  const componentBans = normalizeStringArray(record.componentBans);
  const normalized: ProjectSkillSeedRouteOverride = {
    homepageTopologyClass: String(record.homepageTopologyClass || "").trim() || undefined,
    openingFamily: String(record.openingFamily || "").trim() || undefined,
    sectionCadence: sectionCadence.length > 0 ? sectionCadence : undefined,
    allowedComponentRhythms: allowedComponentRhythms.length > 0 ? allowedComponentRhythms : undefined,
    bannedGenericOpenings: bannedGenericOpenings.length > 0 ? bannedGenericOpenings : undefined,
    componentBans: componentBans.length > 0 ? componentBans : undefined,
    mediaPosture: String(record.mediaPosture || "").trim() || undefined,
    typographyPosture: String(record.typographyPosture || "").trim() || undefined,
    ctaPosture: String(record.ctaPosture || "").trim() || undefined,
  };
  return Object.values(normalized).some((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item))) ? normalized : undefined;
}

function normalizeSeedContract(value: unknown): ProjectSkillSeedContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const routeOverridesInput =
    record.routeOverrides && typeof record.routeOverrides === "object" && !Array.isArray(record.routeOverrides)
      ? (record.routeOverrides as Record<string, unknown>)
      : {};
  const routeOverrides = Object.fromEntries(
    Object.entries(routeOverridesInput)
      .map(([key, item]) => [normalizeRouteFamily(key), normalizeSeedRouteOverride(item)] as const)
      .filter((entry): entry is [ProjectSkillRouteFamily, ProjectSkillSeedRouteOverride] => Boolean(entry[0] && entry[1])),
  );
  const normalized: ProjectSkillSeedContract = {
    contractVersion: Number.isFinite(Number(record.contractVersion)) ? Number(record.contractVersion) : undefined,
    homepageTopologyClass: String(record.homepageTopologyClass || "").trim() || undefined,
    openingFamily: String(record.openingFamily || "").trim() || undefined,
    sectionCadence: normalizeStringArray(record.sectionCadence),
    allowedComponentRhythms: normalizeStringArray(record.allowedComponentRhythms),
    bannedGenericOpenings: normalizeStringArray(record.bannedGenericOpenings),
    componentBans: normalizeStringArray(record.componentBans),
    mediaPosture: String(record.mediaPosture || "").trim() || undefined,
    typographyPosture: String(record.typographyPosture || "").trim() || undefined,
    ctaPosture: String(record.ctaPosture || "").trim() || undefined,
    compatibleSurfaceModes: normalizeSurfaceModeArray(record.compatibleSurfaceModes),
    visualBoldness: String(record.visualBoldness || "").trim() === "high" ? "high" : "standard",
    routeOverrides: Object.keys(routeOverrides).length > 0 ? routeOverrides : undefined,
  };
  return normalized;
}

export function inferRouteFamiliesForPlanning(params: {
  routes?: string[];
  surfaceMode?: WebsiteSurfaceMode;
}): ProjectSkillRouteFamily[] {
  const families = new Set<ProjectSkillRouteFamily>();
  const routes = (params.routes || []).map((route) => String(route || "").trim().toLowerCase()).filter(Boolean);
  for (const route of routes) {
    if (route === "/") {
      families.add("home");
      continue;
    }
    if (/^\/blog(?:\/|$)/.test(route)) families.add("blog");
    if (/(?:^|\/)(?:products?|catalog|collection)(?:\/|$)/.test(route)) families.add("products");
    if (/(?:^|\/)(?:solutions?|services?|custom-solutions?)(?:\/|$)/.test(route)) families.add("solutions");
    if (/(?:^|\/)(?:cases?|portfolio|projects?)(?:\/|$)/.test(route)) families.add("cases");
    if (/(?:^|\/)(?:about|company|team|profile)(?:\/|$)/.test(route)) families.add("about");
    if (/(?:^|\/)(?:contact|inquiry|get-in-touch)(?:\/|$)/.test(route)) families.add("contact");
    if (/(?:^|\/)(?:docs?|documentation|guides?|manual|reference|api|developer|developers|kb|knowledge-base)(?:\/|$)/.test(route)) {
      families.add("docs");
    }
    if (
      /(?:^|\/)(?:research|resource|resources|downloads?|library|standards?|information-platform|knowledge-platform|repository|directory)(?:\/|$)/.test(
        route,
      )
    ) {
      families.add("resource");
    }
  }
  if (families.size === 0 || routes.includes("/")) families.add("home");
  if (params.surfaceMode === "docs-knowledge-site") families.add("docs");
  if (params.surfaceMode === "content-hub-site") families.add("resource");
  if (params.surfaceMode === "portfolio-blog-site") families.add("blog");
  return Array.from(families);
}

function pickTemplateExcerptForRouteFamily(
  content: string,
  fallback: string[],
  routeFamily: ProjectSkillRouteFamily,
): string[] {
  const lines = String(content || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return fallback;
  const familyPatternMap: Record<ProjectSkillRouteFamily, RegExp> = {
    home: /(?:hero|masthead|home|landing|lead|intro)/i,
    products: /(?:product|catalog|assortment|spec|comparison)/i,
    solutions: /(?:solution|service|process|timeline|workflow)/i,
    cases: /(?:case|proof|outcome|project|result)/i,
    about: /(?:about|team|identity|profile|trust)/i,
    contact: /(?:contact|inquiry|consult|form|channel)/i,
    docs: /(?:docs?|reference|guide|api|quickstart|search)/i,
    resource: /(?:resource|research|standards|library|ledger|collection)/i,
    blog: /(?:blog|article|story|editorial|feature)/i,
  };
  const matches = lines
    .filter(
      (line) =>
        familyPatternMap[routeFamily].test(line) &&
        (/^<\/?(?:section|article|aside|header|main)\b/i.test(line) || /\bclass=/.test(line) || /\bdata-od-id=/.test(line)),
    )
    .slice(0, 6)
    .map((line) => clipResourceExcerptValue(line));
  return matches.length > 0 ? uniqueTrimmed(matches) : fallback;
}

function extractHtmlStructureExcerpt(content: string): string[] {
  const lines = String(content || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const bodyStart = lines.findIndex((line) => /^<body\b/i.test(line));
  const relevantLines = bodyStart >= 0 ? lines.slice(bodyStart + 1) : lines;
  const structural = relevantLines
    .filter(
      (line) =>
        /^<\/?(?:header|main|section|nav|footer|article|aside)\b/i.test(line) ||
        /\bclass=/.test(line) ||
        /\bdata-od-id=/.test(line),
    )
    .slice(0, 8);
  const excerpt = (structural.length > 0 ? structural : relevantLines.slice(0, 8)).map((line) =>
    clipResourceExcerptValue(line),
  );
  return uniqueTrimmed(excerpt);
}

function summarizeTemplateHtml(content: string, filePath: string): ProjectSkillTemplateSummary | undefined {
  const text = String(content || "");
  if (!text.trim()) return undefined;
  const rootBlock = text.match(/:root\s*\{([\s\S]*?)\}/i)?.[1] || "";
  const tokenNames = uniqueTrimmed(Array.from(rootBlock.matchAll(/--([a-z0-9-]+)\s*:/gi)).map((match) => `--${match[1]}`));
  const responsiveBreakpoint = text.match(/@media\s*\(max-width:\s*([0-9]+px)\)/i)?.[1] || undefined;
  const keyClassCandidates = ["container", "section", "topnav", "pagefoot", "grid-2", "grid-3", "grid-4", "card", "btn", "ph-img"];
  const keyClasses = keyClassCandidates.filter((className) => new RegExp(`\\.${className}\\b`).test(text));
  const structureExcerpt = extractHtmlStructureExcerpt(text);
  const routeExcerpts = Object.fromEntries(
    (["home", "products", "solutions", "cases", "about", "contact", "docs", "resource", "blog"] as ProjectSkillRouteFamily[]).map(
      (family) => [family, pickTemplateExcerptForRouteFamily(text, structureExcerpt, family)],
    ),
  ) as Partial<Record<ProjectSkillRouteFamily, string[]>>;
  return {
    path: filePath,
    tokenNames: tokenNames.slice(0, 12),
    responsiveBreakpoint,
    keyClasses,
    structureExcerpt,
    routeExcerpts,
  };
}

function extractChecklistSection(content: string, headingPrefix: string): string[] {
  const lines = String(content || "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase().startsWith(headingPrefix.toLowerCase()));
  if (start < 0) return [];
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line.trim())) break;
    block.push(line);
  }
  return block;
}

function countChecklistItems(lines: string[]): number {
  return lines.filter((line) => /^\s*-\s*\[[ xX]?\]/.test(line)).length;
}

function summarizeChecklist(content: string, filePath: string): ProjectSkillChecklistSummary | undefined {
  const text = String(content || "");
  if (!text.trim()) return undefined;
  const p0Lines = extractChecklistSection(text, "## P0");
  const p1Lines = extractChecklistSection(text, "## P1");
  const p2Lines = extractChecklistSection(text, "## P2");
  const criticalChecks = uniqueTrimmed(
    p0Lines
      .filter((line) => /^\s*-\s*\[[ xX]?\]/.test(line))
      .map((line) => line.match(/\*\*(.+?)\*\*/) ? String(line.match(/\*\*(.+?)\*\*/)?.[1] || "") : line.replace(/^\s*-\s*\[[ xX]?\]\s*/, "").split(". ")[0] || "")
      .slice(0, 6),
  );
  return {
    path: filePath,
    p0Count: countChecklistItems(p0Lines),
    p1Count: countChecklistItems(p1Lines),
    p2Count: countChecklistItems(p2Lines),
    criticalChecks,
    mustPassExcerpt: uniqueTrimmed(
      p0Lines
        .filter((line) => /^\s*-\s*\[[ xX]?\]/.test(line))
        .map((line) => clipResourceExcerptValue(line.replace(/^\s*-\s*\[[ xX]?\]\s*/, ""), 180))
        .slice(0, 4),
    ),
  };
}

function summarizeSeedContract(contract: ProjectSkillSeedContract, filePath: string): ProjectSkillContractSummary | undefined {
  const routeFamilies = Object.keys(contract.routeOverrides || {})
    .map((item) => normalizeRouteFamily(item))
    .filter((item): item is ProjectSkillRouteFamily => Boolean(item));
  const contractExcerpt = uniqueTrimmed(
    [
      contract.homepageTopologyClass ? `homepageTopologyClass=${contract.homepageTopologyClass}` : "",
      contract.openingFamily ? `openingFamily=${contract.openingFamily}` : "",
      contract.visualBoldness ? `visualBoldness=${contract.visualBoldness}` : "",
      (contract.sectionCadence || []).length > 0 ? `sectionCadence=${(contract.sectionCadence || []).slice(0, 4).join(" -> ")}` : "",
      (contract.componentBans || []).length > 0 ? `componentBans=${(contract.componentBans || []).slice(0, 5).join(", ")}` : "",
      (contract.bannedGenericOpenings || []).length > 0
        ? `bannedGenericOpenings=${(contract.bannedGenericOpenings || []).slice(0, 5).join(", ")}`
        : "",
      contract.mediaPosture ? `mediaPosture=${contract.mediaPosture}` : "",
      contract.typographyPosture ? `typographyPosture=${contract.typographyPosture}` : "",
      contract.ctaPosture ? `ctaPosture=${contract.ctaPosture}` : "",
    ]
      .filter(Boolean)
      .map((line) => clipResourceExcerptValue(line, 180)),
  );
  const routeExcerpts = Object.fromEntries(
    routeFamilies.map((family) => {
      const override = contract.routeOverrides?.[family];
      const lines = uniqueTrimmed(
        [
          override?.homepageTopologyClass ? `homepageTopologyClass=${override.homepageTopologyClass}` : "",
          override?.openingFamily ? `openingFamily=${override.openingFamily}` : "",
          (override?.sectionCadence || []).length > 0 ? `sectionCadence=${(override?.sectionCadence || []).slice(0, 4).join(" -> ")}` : "",
          (override?.componentBans || []).length > 0 ? `componentBans=${(override?.componentBans || []).slice(0, 4).join(", ")}` : "",
          (override?.bannedGenericOpenings || []).length > 0
            ? `bannedGenericOpenings=${(override?.bannedGenericOpenings || []).slice(0, 4).join(", ")}`
            : "",
          override?.mediaPosture ? `mediaPosture=${override.mediaPosture}` : "",
          override?.typographyPosture ? `typographyPosture=${override.typographyPosture}` : "",
          override?.ctaPosture ? `ctaPosture=${override.ctaPosture}` : "",
        ]
          .filter(Boolean)
          .map((line) => clipResourceExcerptValue(line, 180)),
      );
      return [family, lines];
    }),
  ) as Partial<Record<ProjectSkillRouteFamily, string[]>>;

  return {
    path: filePath,
    homepageTopologyClass: contract.homepageTopologyClass,
    openingFamily: contract.openingFamily,
    visualBoldness: contract.visualBoldness,
    compatibleSurfaceModes: contract.compatibleSurfaceModes || [],
    routeFamilies,
    contractExcerpt,
    routeExcerpts,
  };
}

async function buildProjectSkillResourceIndex(
  rootDir: string,
  seedContract?: ProjectSkillSeedContract,
): Promise<ProjectSkillResourceIndex | undefined> {
  const fs = await import("node:fs/promises");
  const contractPath = path.join(rootDir, "contract.json");
  const templatePath = path.join(rootDir, "assets", "template.html");
  const examplePath = path.join(rootDir, "example.html");
  const checklistPath = path.join(rootDir, "references", "checklist.md");
  const resourceIndex: ProjectSkillResourceIndex = {};

  if (seedContract) {
    const contractSummary = summarizeSeedContract(seedContract, "contract.json");
    if (contractSummary) resourceIndex.contractJson = contractSummary;
  } else if (await pathExists(contractPath)) {
    const contractSummary = summarizeSeedContract(normalizeSeedContract(await readJsonIfExists(contractPath)) || {}, "contract.json");
    if (contractSummary) resourceIndex.contractJson = contractSummary;
  }

  if (await pathExists(templatePath)) {
    const template = summarizeTemplateHtml(await fs.readFile(templatePath, "utf8"), "assets/template.html");
    if (template) resourceIndex.templateHtml = template;
  }
  if (await pathExists(examplePath)) {
    const example = summarizeTemplateHtml(await fs.readFile(examplePath, "utf8"), "example.html");
    if (example) resourceIndex.exampleHtml = example;
  }
  if (await pathExists(checklistPath)) {
    const checklist = summarizeChecklist(await fs.readFile(checklistPath, "utf8"), "references/checklist.md");
    if (checklist) resourceIndex.checklist = checklist;
  }

  return resourceIndex.contractJson || resourceIndex.templateHtml || resourceIndex.exampleHtml || resourceIndex.checklist
    ? resourceIndex
    : undefined;
}

export function renderProjectSkillResourceIndex(index?: ProjectSkillResourceIndex): string {
  if (!index) return "";
  const lines = ["## Seed Resource Index"];
  if (index.contractJson) {
    lines.push(
      [
        `- ${index.contractJson.path}: seed contract`,
        index.contractJson.homepageTopologyClass ? `home topology ${index.contractJson.homepageTopologyClass}` : "",
        index.contractJson.openingFamily ? `opening ${index.contractJson.openingFamily}` : "",
        index.contractJson.visualBoldness ? `boldness ${index.contractJson.visualBoldness}` : "",
        index.contractJson.compatibleSurfaceModes.length > 0
          ? `surfaces ${index.contractJson.compatibleSurfaceModes.join(", ")}`
          : "",
        index.contractJson.routeFamilies.length > 0 ? `route overrides ${index.contractJson.routeFamilies.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  if (index.templateHtml) {
    lines.push(
      [
        `- ${index.templateHtml.path}: reusable HTML seed`,
        index.templateHtml.tokenNames.length > 0 ? `tokens ${index.templateHtml.tokenNames.join(", ")}` : "",
        index.templateHtml.keyClasses.length > 0 ? `key classes ${index.templateHtml.keyClasses.join(", ")}` : "",
        index.templateHtml.responsiveBreakpoint ? `responsive collapse at ${index.templateHtml.responsiveBreakpoint}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  if (index.exampleHtml) {
    lines.push(
      [
        `- ${index.exampleHtml.path}: example-backed HTML contract`,
        index.exampleHtml.tokenNames.length > 0 ? `tokens ${index.exampleHtml.tokenNames.join(", ")}` : "",
        index.exampleHtml.keyClasses.length > 0 ? `key classes ${index.exampleHtml.keyClasses.join(", ")}` : "",
        index.exampleHtml.responsiveBreakpoint ? `responsive collapse at ${index.exampleHtml.responsiveBreakpoint}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  if (index.checklist) {
    lines.push(
      [
        `- ${index.checklist.path}: self-review gates`,
        `P0=${index.checklist.p0Count}`,
        `P1=${index.checklist.p1Count}`,
        `P2=${index.checklist.p2Count}`,
        index.checklist.criticalChecks.length > 0 ? `critical checks ${index.checklist.criticalChecks.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  return lines.join("\n");
}

export function renderProjectSkillResourceContract(
  index?: ProjectSkillResourceIndex,
  options?: {
    routes?: string[];
    surfaceMode?: WebsiteSurfaceMode;
    routeFamilies?: ProjectSkillRouteFamily[];
  },
): string {
  if (!index) return "";
  const excerptMode = String(process.env.SHPITTO_OD_SEED_EXCERPT_INJECTION || "").trim().toLowerCase();
  const excerptInjectionEnabled =
    !excerptMode || excerptMode === "1" || excerptMode === "true" || excerptMode === "yes" || excerptMode === "on";
  if (!excerptInjectionEnabled) {
    return [
      renderProjectSkillResourceIndex(index),
      "## Seed Structural Contract",
      "- excerpt_injection_mode: summary-only rollback",
      "- Seed excerpt injection is disabled by rollout flag; keep imported seed selection but fall back to compact resource summaries.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const selectedRouteFamilies =
    options?.routeFamilies && options.routeFamilies.length > 0
      ? uniqueTrimmed(options.routeFamilies)
          .map((item) => normalizeRouteFamily(item))
          .filter((item): item is ProjectSkillRouteFamily => Boolean(item))
      : inferRouteFamiliesForPlanning({ routes: options?.routes, surfaceMode: options?.surfaceMode });
  const lines = [
    "## Seed Structural Contract",
    "- Preserve this seed's opening discipline, section cadence, and route-owned class semantics before falling back to generic local heuristics.",
    "- Treat these excerpts as structural cues, not placeholder copy to duplicate verbatim.",
  ];
  if (index.contractJson?.contractExcerpt?.length) {
    lines.push("### contract.json excerpt");
    lines.push(...index.contractJson.contractExcerpt.map((line) => `- ${line}`));
  }
  if (index.contractJson?.routeExcerpts) {
    for (const routeFamily of selectedRouteFamilies.slice(0, 4)) {
      const excerpt = index.contractJson.routeExcerpts[routeFamily];
      if (!excerpt?.length) continue;
      lines.push(`### ${routeFamily} contract excerpt`);
      lines.push(...excerpt.map((line) => `- ${line}`));
    }
  }
  if (index.templateHtml?.structureExcerpt?.length) {
    for (const routeFamily of selectedRouteFamilies.slice(0, 3)) {
      const excerpt = index.templateHtml.routeExcerpts?.[routeFamily];
      if (!excerpt?.length) continue;
      lines.push(`### assets/template.html ${routeFamily} excerpt`);
      lines.push(...excerpt.map((line) => `- ${line}`));
    }
    if (!selectedRouteFamilies.some((routeFamily) => (index.templateHtml?.routeExcerpts?.[routeFamily] || []).length > 0)) {
      lines.push("### assets/template.html excerpt");
      lines.push(...index.templateHtml.structureExcerpt.map((line) => `- ${line}`));
    }
  }
  if (index.exampleHtml?.structureExcerpt?.length) {
    for (const routeFamily of selectedRouteFamilies.slice(0, 3)) {
      const excerpt = index.exampleHtml.routeExcerpts?.[routeFamily];
      if (!excerpt?.length) continue;
      lines.push(`### example.html ${routeFamily} excerpt`);
      lines.push(...excerpt.map((line) => `- ${line}`));
    }
    if (!selectedRouteFamilies.some((routeFamily) => (index.exampleHtml?.routeExcerpts?.[routeFamily] || []).length > 0)) {
      lines.push("### example.html excerpt");
      lines.push(...index.exampleHtml.structureExcerpt.map((line) => `- ${line}`));
    }
  }
  if (index.checklist?.mustPassExcerpt?.length) {
    lines.push("### checklist excerpt");
    lines.push(...index.checklist.mustPassExcerpt.map((line) => `- ${line}`));
  }
  return lines.join("\n");
}

export async function listProjectSkills(start?: string): Promise<string[]> {
  const index = await readProjectSkillIndex(start);
  return Array.from(new Set(index.map((entry) => entry.id))).sort();
}

type SkillDirectoryEntry = {
  id: string;
  rootDir: string;
  skillMdPath: string;
};

async function collectSkillDirectories(
  skillsRoot: string,
  relativePath = "",
  depth = 0,
  maxDepth = 3,
): Promise<SkillDirectoryEntry[]> {
  const fs = await import("node:fs/promises");
  const currentDir = relativePath ? path.join(skillsRoot, relativePath) : skillsRoot;
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: SkillDirectoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
    const skillMdPath = path.join(skillsRoot, nextRelative, "SKILL.md");
    if (await pathExists(skillMdPath)) {
      const id = toSkillId(entry.name);
      if (id) {
        found.push({
          id,
          rootDir: path.join(skillsRoot, nextRelative),
          skillMdPath,
        });
      }
      continue;
    }
    if (depth >= maxDepth) continue;
    found.push(...(await collectSkillDirectories(skillsRoot, nextRelative, depth + 1, maxDepth)));
  }

  return found;
}

async function readProjectSkillIndex(start?: string): Promise<ProjectSkillIndexEntry[]> {
  const fs = await import("node:fs/promises");
  const skillsRoot = await getProjectSkillsRoot(start);
  const directories = await collectSkillDirectories(skillsRoot);
  const index: ProjectSkillIndexEntry[] = [];
  for (const directory of directories) {
    const { id, rootDir, skillMdPath } = directory;
    const content = await fs.readFile(skillMdPath, "utf8");
    const frontmatter = parseSkillFrontmatterSummary(id, content);
    let websiteMetadata: WebsiteSkillMetadata | undefined;
    try {
      websiteMetadata = parseWebsiteSkillMetadata(id, content);
    } catch {
      // Non-website Open Design skills must not enter website discovery.
    }
    index.push({
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      triggers: frontmatter.triggers,
      rootDir,
      skillMdPath,
      websiteMetadata,
    });
  }
  return index.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listWebsiteSeedSkillIds(start?: string): Promise<string[]> {
  const index = await readProjectSkillIndex(start);
  return index
    .filter((entry) => entry.websiteMetadata?.mode === "website")
    .map((entry) => entry.id)
    .sort();
}

export async function listDocumentContentSkillIds(start?: string): Promise<string[]> {
  const available = new Set(await listProjectSkills(start));
  return DOCUMENT_CONTENT_SKILL_IDS.filter((id) => available.has(id));
}

export async function getWebsiteGenerationSkillBundle(start?: string): Promise<string[]> {
  const seedIds = await listWebsiteSeedSkillIds(start);
  const documentSkillIds = await listDocumentContentSkillIds(start);
  return Array.from(
    new Set([
      ...WEBSITE_GENERATION_SKILL_BUNDLE.map((id) => resolveProjectSkillAlias(id)),
      ...seedIds,
      ...documentSkillIds,
    ]),
  );
}

function normalizeIntentText(parts: string[]): string {
  return parts
    .join("\n")
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreWebsiteSeedSkill(
  entry: ProjectSkillIndexEntry,
  intentText: string,
  surfaceMode?: WebsiteSurfaceMode,
  generatorMode: WebsiteArtifactGeneratorMode = resolveWebsiteArtifactGeneratorMode(),
): WebsiteSeedSkillSelection {
  const name = toSkillId(entry.name).replace(/[-_.]+/g, " ");
  const scenario = String(entry.websiteMetadata?.scenario || "").toLowerCase();
  const compatibleSurfaceModes = entry.websiteMetadata?.activation?.compatibleSurfaceModes || [];
  const triggerHits = entry.triggers
    .map((trigger) => trigger.trim())
    .filter(Boolean)
    .filter((trigger) => intentText.includes(trigger.toLowerCase()));
  let score = 0;
  const reasons: string[] = [];

  const hasNameMatch = Boolean(name && intentText.includes(name));
  const scenarioMatchesIntent = Boolean(scenario && intentText.includes(scenario));
  const scenarioMatchAllowed =
    entry.id !== "open-design-dashboard" ||
    triggerHits.length > 0 ||
    /\b(?:dashboard|admin|analytics|control panel|ops panel|operations dashboard)\b/i.test(intentText);
  const hasScenarioMatch = scenarioMatchesIntent && scenarioMatchAllowed;
  const hasPricingIntent = /(?:^|\s|\/)(?:pricing|price|plans?|tiers?|subscriptions?)(?:\s|\/|$)/i.test(intentText);
  const surfaceMatchAllowed = entry.id !== "open-design-pricing-page" || hasPricingIntent;
  const hasNonSurfaceSignal = hasNameMatch || hasScenarioMatch || triggerHits.length > 0;
  const hasSurfaceMatch = Boolean(
    hasNonSurfaceSignal && surfaceMatchAllowed && surfaceMode && compatibleSurfaceModes.includes(surfaceMode),
  );

  if (hasNameMatch) {
    score += 8;
    reasons.push(`name:${entry.name}`);
  }
  if (hasScenarioMatch) {
    score += 5;
    reasons.push(`scenario:${scenario}`);
  }
  if (hasSurfaceMatch) {
    const activationMode = entry.websiteMetadata?.activation?.mode;
    const rolloutStatus = entry.websiteMetadata?.activation?.rolloutStatus;
    const surfaceBonus =
      activationMode === "primary"
        ? 32
        : rolloutStatus === "active"
          ? 26
          : rolloutStatus === "staged"
            ? 24
            : 6;
    score += surfaceBonus;
    reasons.push(`surface:${surfaceMode}`);
  }
  const origin = classifyWebsiteSeedOrigin(entry);
  const generatorBonus = scoreWebsiteSeedOriginForGenerator({ mode: generatorMode, origin });
  const hasDirectGeneratorMatch = hasSurfaceMatch || hasNonSurfaceSignal;
  if (generatorBonus > 0 && hasDirectGeneratorMatch) {
    score += generatorBonus;
    reasons.push(`generator:${generatorMode}:${origin}`);
  }
  for (const trigger of triggerHits) {
    score += Math.min(16, 8 + Math.floor(trigger.length / 4));
  }
  if (triggerHits.length > 0) {
    reasons.push(`trigger:${triggerHits.slice(0, 3).join(", ")}`);
  }

  return {
    id: entry.id,
    score,
    reason: reasons.join("; "),
  };
}

function enrichImportedSkillFirstSelections(
  selections: WebsiteSeedSkillSelection[],
  surfaceMode?: WebsiteSurfaceMode,
): WebsiteSeedSkillSelection[] {
  if (!isImportedSkillFirstSurfaceMode(surfaceMode)) return selections;
  return selections.map((selection) => ({
    ...selection,
    score: selection.score + 18,
    reason: [selection.reason, `imported-skill-first:${surfaceMode}`].filter(Boolean).join("; "),
  }));
}

export async function selectWebsiteSeedSkillsForIntent(params: {
  requirementText?: string;
  routes?: string[];
  maxSkills?: number;
  start?: string;
  generatorMode?: WebsiteArtifactGeneratorMode;
}): Promise<WebsiteSeedSkillSelection[]> {
  const surfaceMode = selectWebsiteGenerationTypeSkill({
    requirementText: params.requirementText,
    routes: params.routes,
  }).surfaceMode;
  const index = (await readProjectSkillIndex(params.start)).filter((entry) => {
    if (entry.websiteMetadata?.mode !== "website") return false;
    return shouldSelectImportedWebsiteSkill({
      activationMode: entry.websiteMetadata.activation?.mode,
      rolloutStatus: entry.websiteMetadata.activation?.rolloutStatus,
      surfaceMode,
    });
  });
  if (index.length === 0) return [];

  const intentText = normalizeIntentText([params.requirementText || "", ...(params.routes || [])]);
  const maxSkills = Math.max(1, Number(params.maxSkills || 2));
  const generatorMode = params.generatorMode || resolveWebsiteArtifactGeneratorMode();
  const scored = enrichImportedSkillFirstSelections(
    index
    .map((entry) => scoreWebsiteSeedSkill(entry, intentText, surfaceMode, generatorMode))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
    surfaceMode,
  );

  if (scored.length > 0) return scored.slice(0, maxSkills);

  const fallback =
    index.find((entry) => String(entry.websiteMetadata?.scenario || "").toLowerCase() === "design") || index[0];
  const fallbackReason = [
    "fallback:generic-website-seed",
    isImportedSkillFirstSurfaceMode(surfaceMode) ? `imported-skill-first:${surfaceMode}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return fallback
    ? [
        {
          id: fallback.id,
          score: 1,
          reason: fallbackReason,
        },
      ]
    : [];
}

function scoreDocumentContentSkill(skillId: string, intentText: string, assetText: string): WebsiteSeedSkillSelection {
  const combinedText = `${assetText}\n${intentText}`;
  const reasons: string[] = [];
  let score = 0;

  const addScore = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (skillId === "pdf") {
    if (/\bpdf\b|application\/pdf|portable document/i.test(assetText)) addScore(16, "asset:pdf");
    if (/\bpdf\b|portable document|scanned document|\bocr\b/i.test(intentText)) addScore(6, "intent:pdf");
  }

  if (skillId === "docx") {
    if (/\bdocx\b|\.doc\b|wordprocessingml|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i.test(assetText)) {
      addScore(16, "asset:docx");
    }
    if (/\bdocx\b|\bdoc\b|\bword\b|word document|word doc|microsoft word/i.test(intentText)) {
      addScore(6, "intent:docx");
    }
  }

  if (skillId === "pptx") {
    if (/\bpptx\b|\.ppt\b|presentationml|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/i.test(assetText)) {
      addScore(16, "asset:pptx");
    }
    if (/\bpptx\b|\bppt\b|powerpoint|slide deck|\bslides?\b|\bpresentation\b|\bdeck\b/i.test(intentText)) {
      addScore(6, "intent:pptx");
    }
  }

  if (combinedText.includes(skillId)) addScore(2, `keyword:${skillId}`);

  return {
    id: skillId,
    score,
    reason: reasons.join("; "),
  };
}

export async function selectDocumentContentSkillsForIntent(params: {
  requirementText?: string;
  routes?: string[];
  referencedAssets?: string[];
  maxSkills?: number;
  start?: string;
}): Promise<WebsiteSeedSkillSelection[]> {
  const available = await listDocumentContentSkillIds(params.start);
  if (available.length === 0) return [];

  const intentText = normalizeIntentText([params.requirementText || "", ...(params.routes || [])]);
  const assetText = String(params.referencedAssets?.join("\n") || "").toLowerCase();
  const maxSkills = Math.max(1, Number(params.maxSkills || DOCUMENT_CONTENT_SKILL_IDS.length));

  return available
    .map((id) => scoreDocumentContentSkill(id, intentText, assetText))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, maxSkills);
}

async function resolveProjectSkillId(skillId: string, start?: string): Promise<string> {
  const normalized = resolveProjectSkillAlias(skillId);
  if (!normalized) return normalized;

  const skillsRoot = await getProjectSkillsRoot(start);
  if (await pathExists(path.join(skillsRoot, normalized, "SKILL.md"))) return normalized;

  const index = await readProjectSkillIndex(start);
  const match = index.find((entry) => {
    const aliases = [entry.id, entry.name, ...entry.triggers].map((value) => toSkillId(value));
    return aliases.includes(normalized);
  });
  return match?.id || normalized;
}

async function resolveProjectSkillIndexEntry(skillId: string, start?: string): Promise<ProjectSkillIndexEntry | undefined> {
  const normalized = await resolveProjectSkillId(skillId, start);
  if (!normalized) return undefined;
  const index = await readProjectSkillIndex(start);
  return index.find((entry) => entry.id === normalized);
}

export async function loadProjectSkill(skillId: string, start?: string): Promise<ProjectSkillDescriptor> {
  const entry = await resolveProjectSkillIndexEntry(skillId, start);
  if (!entry?.id) {
    throw new Error("skill_id is required");
  }

  const fs = await import("node:fs/promises");
  const normalized = entry.id;
  const targetRoot = entry.rootDir;
  const skillMdPath = path.join(targetRoot, "SKILL.md");
  const skillJsonPath = path.join(targetRoot, "skill.json");

  if (!(await pathExists(skillMdPath))) {
    const available = await listProjectSkills(start);
    throw new Error(
      available.length > 0
        ? `skill "${normalized}" not found under apps/web/skills. available: ${available.join(", ")}`
        : "no project skills found under apps/web/skills",
    );
  }

  const content = await fs.readFile(skillMdPath, "utf8");
  const config = await readJsonIfExists(skillJsonPath);
  const frontmatter = parseSkillFrontmatterSummary(normalized, content);
  const websiteMetadata = parseWebsiteSkillMetadata(normalized, content);
  const seedContract = normalizeSeedContract(await readJsonIfExists(path.join(targetRoot, "contract.json")));

  return {
    id: normalized,
    rootDir: targetRoot,
    skillMdPath,
    skillJsonPath: (await pathExists(skillJsonPath)) ? skillJsonPath : undefined,
    content,
    config,
    websiteMetadata,
    frontmatter,
    seedContract,
    resourceIndex: await buildProjectSkillResourceIndex(targetRoot, seedContract),
  };
}

export async function loadProjectSkillBundle(
  skillIds: string[],
  start = process.cwd(),
): Promise<ProjectSkillBundleDescriptor> {
  const requestedIds = (skillIds || []).map((id) => toSkillId(id)).filter(Boolean);
  const resolvedIds = Array.from(new Set(await Promise.all(requestedIds.map((id) => resolveProjectSkillId(id, start)))));
  const skills: ProjectSkillDescriptor[] = [];
  for (const id of resolvedIds) {
    skills.push(await loadProjectSkill(id, start));
  }
  return {
    requestedIds,
    resolvedIds,
    skills,
  };
}
