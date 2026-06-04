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
};

export type ProjectSkillChecklistSummary = {
  path: string;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  criticalChecks: string[];
  mustPassExcerpt: string[];
};

export type ProjectSkillResourceIndex = {
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
  return {
    path: filePath,
    tokenNames: tokenNames.slice(0, 12),
    responsiveBreakpoint,
    keyClasses,
    structureExcerpt: extractHtmlStructureExcerpt(text),
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

async function buildProjectSkillResourceIndex(rootDir: string): Promise<ProjectSkillResourceIndex | undefined> {
  const fs = await import("node:fs/promises");
  const templatePath = path.join(rootDir, "assets", "template.html");
  const examplePath = path.join(rootDir, "example.html");
  const checklistPath = path.join(rootDir, "references", "checklist.md");
  const resourceIndex: ProjectSkillResourceIndex = {};

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

  return resourceIndex.templateHtml || resourceIndex.exampleHtml || resourceIndex.checklist ? resourceIndex : undefined;
}

export function renderProjectSkillResourceIndex(index?: ProjectSkillResourceIndex): string {
  if (!index) return "";
  const lines = ["## Seed Resource Index"];
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

export function renderProjectSkillResourceContract(index?: ProjectSkillResourceIndex): string {
  if (!index) return "";
  const lines = [
    "## Seed Structural Contract",
    "- Preserve this seed's opening discipline, section cadence, and route-owned class semantics before falling back to generic local heuristics.",
    "- Treat these excerpts as structural cues, not placeholder copy to duplicate verbatim.",
  ];
  if (index.templateHtml?.structureExcerpt?.length) {
    lines.push("### assets/template.html excerpt");
    lines.push(...index.templateHtml.structureExcerpt.map((line) => `- ${line}`));
  }
  if (index.exampleHtml?.structureExcerpt?.length) {
    lines.push("### example.html excerpt");
    lines.push(...index.exampleHtml.structureExcerpt.map((line) => `- ${line}`));
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

  return {
    id: normalized,
    rootDir: targetRoot,
    skillMdPath,
    skillJsonPath: (await pathExists(skillJsonPath)) ? skillJsonPath : undefined,
    content,
    config,
    websiteMetadata,
    frontmatter,
    resourceIndex: await buildProjectSkillResourceIndex(targetRoot),
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
