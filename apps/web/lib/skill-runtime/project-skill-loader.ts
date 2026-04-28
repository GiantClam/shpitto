import path from "node:path";
import { fileURLToPath } from "node:url";

export type ProjectSkillDescriptor = {
  id: string;
  rootDir: string;
  skillMdPath: string;
  skillJsonPath?: string;
  content: string;
  config?: Record<string, unknown>;
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

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(CURRENT_DIR, "..", "..");
const DEFAULT_SKILLS_ROOT = path.join(WEB_ROOT, "skills");

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findRepoRoot(start: string): Promise<string> {
  const candidates: string[] = [];
  let current = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const candidate of candidates) {
    if ((await pathExists(path.join(candidate, "pnpm-workspace.yaml"))) || (await pathExists(path.join(candidate, ".git")))) {
      return candidate;
    }
  }

  return path.resolve(start);
}

async function getProjectSkillsRoot(start?: string): Promise<string> {
  if (!start) return DEFAULT_SKILLS_ROOT;
  const repoRoot = await findRepoRoot(start);
  const candidates = [
    path.join(repoRoot, "apps", "web", "skills"),
    path.join(repoRoot, "skills"),
    path.join(path.resolve(start), "skills"),
  ];
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

export async function loadProjectSkill(skillId: string, start?: string): Promise<ProjectSkillDescriptor> {
  const normalized = resolveProjectSkillAlias(skillId);
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

  return {
    id: normalized,
    rootDir: targetRoot,
    skillMdPath,
    skillJsonPath: (await pathExists(skillJsonPath)) ? skillJsonPath : undefined,
    content,
    config,
  };
}

export async function loadProjectSkillBundle(
  skillIds: string[],
  start = process.cwd(),
): Promise<ProjectSkillBundleDescriptor> {
  const requestedIds = (skillIds || []).map((id) => toSkillId(id)).filter(Boolean);
  const resolvedIds = Array.from(new Set(requestedIds.map((id) => resolveProjectSkillAlias(id))));
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
