import path from "node:path";

import {
  parseSkillFrontmatterSummary,
  parseWebsiteSkillMetadata,
  type SkillFrontmatterSummary,
  type WebsiteSkillMetadata,
} from "./od-skill-metadata.ts";

export type ProjectSkillDescriptor = {
  id: string;
  rootDir: string;
  skillMdPath: string;
  skillJsonPath?: string;
  content: string;
  config?: Record<string, unknown>;
  websiteMetadata?: WebsiteSkillMetadata;
  frontmatter: SkillFrontmatterSummary;
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

export const WEBSITE_GENERATION_SKILL_BUNDLE: string[] = [
  "website-generation-workflow",
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
  skillMdPath: string;
  websiteMetadata?: WebsiteSkillMetadata;
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

export async function listProjectSkills(start?: string): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const skillsRoot = await getProjectSkillsRoot(start);
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = toSkillId(entry.name);
    if (!id) continue;
    const skillMdPath = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!(await pathExists(skillMdPath))) continue;
    ids.push(id);
  }
  return ids.sort();
}

async function readProjectSkillIndex(start?: string): Promise<ProjectSkillIndexEntry[]> {
  const fs = await import("node:fs/promises");
  const skillsRoot = await getProjectSkillsRoot(start);
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const index: ProjectSkillIndexEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = toSkillId(entry.name);
    if (!id) continue;
    const skillMdPath = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!(await pathExists(skillMdPath))) continue;
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

function scoreWebsiteSeedSkill(entry: ProjectSkillIndexEntry, intentText: string): WebsiteSeedSkillSelection {
  const name = toSkillId(entry.name).replace(/[-_.]+/g, " ");
  const scenario = String(entry.websiteMetadata?.scenario || "").toLowerCase();
  const triggerHits = entry.triggers
    .map((trigger) => trigger.trim())
    .filter(Boolean)
    .filter((trigger) => intentText.includes(trigger.toLowerCase()));
  let score = 0;
  const reasons: string[] = [];

  if (name && intentText.includes(name)) {
    score += 8;
    reasons.push(`name:${entry.name}`);
  }
  if (scenario && intentText.includes(scenario)) {
    score += 5;
    reasons.push(`scenario:${scenario}`);
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

export async function selectWebsiteSeedSkillsForIntent(params: {
  requirementText?: string;
  routes?: string[];
  maxSkills?: number;
  start?: string;
}): Promise<WebsiteSeedSkillSelection[]> {
  const index = (await readProjectSkillIndex(params.start)).filter((entry) => entry.websiteMetadata?.mode === "website");
  if (index.length === 0) return [];

  const intentText = normalizeIntentText([params.requirementText || "", ...(params.routes || [])]);
  const maxSkills = Math.max(1, Number(params.maxSkills || 2));
  const scored = index
    .map((entry) => scoreWebsiteSeedSkill(entry, intentText))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  if (scored.length > 0) return scored.slice(0, maxSkills);

  const fallback =
    index.find((entry) => String(entry.websiteMetadata?.scenario || "").toLowerCase() === "design") || index[0];
  return fallback
    ? [
        {
          id: fallback.id,
          score: 1,
          reason: "fallback:generic-website-seed",
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

export async function loadProjectSkill(skillId: string, start?: string): Promise<ProjectSkillDescriptor> {
  const normalized = await resolveProjectSkillId(skillId, start);
  if (!normalized) {
    throw new Error("skill_id is required");
  }

  const fs = await import("node:fs/promises");
  const skillsRoot = await getProjectSkillsRoot(start);
  const targetRoot = path.join(skillsRoot, normalized);
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
