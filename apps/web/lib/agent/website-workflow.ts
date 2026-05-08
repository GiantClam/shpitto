import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";
import { getWebsiteDesignDirection } from "../open-design/design-directions.ts";

const execFileAsync = promisify(execFile);

export type DesignSkillDescriptor = {
  id: string;
  name: string;
  design_desc: string;
  category?: string;
  design_md_url?: string;
};

export type DesignSkillHit = {
  id: string;
  name: string;
  design_desc: string;
  score: number;
  matched_keywords: string[];
  source: "website-generation-workflow";
  category?: string;
  design_md_url?: string;
  design_md_path?: string;
  design_md_inline?: string;
  index_generated_at?: string;
  selection_mode?:
    | "local_score"
    | "explicit_match"
    | "open_design_explicit"
    | "open_design_context"
    | "prompt_adaptive"
    | "llm_semantic_rerank"
    | "llm_semantic_override";
  local_top_candidate?: {
    id: string;
    name: string;
    score: number;
    category?: string;
    matched_keywords?: string[];
  };
  llm_recommended_id?: string;
  llm_override_reason?: string;
  llm_candidate_limit?: number;
  selection_candidates?: Array<{
    id: string;
    name: string;
    score: number;
    local_rank?: number;
    base_score?: number;
    category?: string;
    design_md_url?: string;
    design_md_path?: string;
    reason?: string;
    excluded_reason?: string;
  }>;
  style_preset?: DesignStylePreset;
};

export type WorkflowSkillContext = {
  hit: DesignSkillHit;
  workflowSkill: string;
  designGeneratorSkill: string;
  selectionCriteria: string;
  sequentialWorkflow: string;
  workflowGuide: string;
  rulesSummary: string;
  designMd: string;
  stylePreset: DesignStylePreset;
  templateBlueprint: TemplateBlueprintResolved;
};

export type WorkflowRuntimeContext = {
  workflowSkill: string;
  designGeneratorSkill: string;
  selectionCriteria: string;
  sequentialWorkflow: string;
  workflowGuide: string;
  rulesSummary: string;
  designMd: string;
};

export type WorkflowRuntimeContextField = keyof WorkflowRuntimeContext;

export type WorkflowRuntimeContextLoadOptions = {
  fields?: WorkflowRuntimeContextField[];
};

export type WorkflowVisualDecisionContext = {
  primaryVisualDirection?: string;
  secondaryVisualTags?: string[];
  visualDecisionSource?: "user_explicit" | "user_recommended_default" | "prompt_adaptive" | "fallback";
  lockPrimaryVisualDirection?: boolean;
};

type AwesomeIndexStyle = {
  name: string;
  slug: string;
  category?: string;
  description?: string;
  designMdUrl?: string;
  designMdPath?: string;
};

type AwesomeIndex = {
  generatedAt?: string;
  styles?: AwesomeIndexStyle[];
};

type StyleProfileMap = Record<string, Partial<DesignStylePreset>>;

type TemplateBlueprintPage = {
  seoTitleTemplate?: string;
  seoDescriptionTemplate?: string;
  componentTypes?: string[];
};

type TemplateBlueprintRaw = {
  extends?: string;
  id?: string;
  routeMode?: string;
  paths?: string[];
  pages?: Record<string, TemplateBlueprintPage>;
};

type TemplateBlueprintMap = Record<string, TemplateBlueprintRaw>;

export type TemplateBlueprintResolved = {
  key: string;
  id: string;
  routeMode: "fixed" | "adaptive";
  paths: string[];
  pages: Record<string, Required<TemplateBlueprintPage>>;
};

const AWESOME_INDEX_REFRESH_MS = 1000 * 60 * 60 * 6;
const AWESOME_DESIGN_MIN_CONTENT_LENGTH = Number(process.env.AWESOME_DESIGN_MIN_CONTENT_LENGTH || 120);
const WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT = Math.max(
  3,
  Math.min(20, Number(process.env.WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT || 8)),
);
const WORKFLOW_RUNTIME_TEXT_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.WORKFLOW_RUNTIME_TEXT_CACHE_TTL_MS || 1000 * 60 * 5),
);
type CachedTextEntry = { value: string; expiresAt: number };
const workflowRuntimeTextCache = new Map<string, CachedTextEntry>();

type WorkflowLlmStyleSelection = {
  recommended_id?: string;
  top_candidates?: Array<{
    id?: string;
    reason?: string;
  }>;
  excluded?: Array<{
    id?: string;
    reason?: string;
  }>;
};

type WorkflowProviderConfig = {
  provider: "pptoken" | "aiberm" | "crazyroute" | "openrouter";
  apiKey?: string;
  baseURL: string;
  modelName: string;
  defaultHeaders?: Record<string, string>;
};

type PromptVisualIntent = {
  active: boolean;
  score: number;
  matchedKeywords: string[];
  designMd: string;
  stylePreset: Partial<DesignStylePreset>;
  reason: string;
};

type PromptAdaptiveSignal = {
  key?: string;
  pattern?: string;
  core?: boolean;
  mood?: string;
  primaryDefault?: string;
  accentDefault?: string;
  surfaceDefault?: string;
};

type PromptAdaptiveDesignPolicy = {
  id?: string;
  name?: string;
  category?: string;
  reason?: string;
  activation?: {
    hexColors?: boolean;
    minCoreSignals?: number;
    minCoreSignalsWithExplicitLanguage?: number;
  };
  explicitVisualLanguagePatterns?: string[];
  signals?: PromptAdaptiveSignal[];
  darkModePatterns?: string[];
  defaults?: Record<string, string>;
  typography?: string;
  designMd?: {
    title?: string;
    intro?: string;
    typographyRules?: string[];
    layoutRules?: string[];
  };
};

type StyleSelectionPolicy = {
  explicitStyleReferenceIgnoredTokens?: string[];
  promptAdaptiveDesign?: PromptAdaptiveDesignPolicy;
};

export function normalizeWorkflowVisualDecisionContext(
  input?: WorkflowVisualDecisionContext | null,
): WorkflowVisualDecisionContext | undefined {
  if (!input) return undefined;
  const primaryVisualDirection = getWebsiteDesignDirection(input.primaryVisualDirection || "")?.id;
  if (!primaryVisualDirection) return undefined;
  return {
    primaryVisualDirection,
    secondaryVisualTags: Array.isArray(input.secondaryVisualTags)
      ? input.secondaryVisualTags.filter(
          (value): value is string =>
            typeof value === "string" &&
            value.trim().length > 0 &&
            !getWebsiteDesignDirection(value),
        )
      : [],
    visualDecisionSource: input.visualDecisionSource,
    lockPrimaryVisualDirection:
      Boolean(input.lockPrimaryVisualDirection) || input.visualDecisionSource === "user_explicit",
  };
}

function pathExists(p: string) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

function findRepoRoot(start = process.cwd()): string {
  const candidates: string[] = [];
  let current = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const candidate of candidates) {
    const hasWorkspace = existsSync(path.join(candidate, "pnpm-workspace.yaml"));
    const hasGit = existsSync(path.join(candidate, ".git"));
    if (hasWorkspace || hasGit) return candidate;
  }

  return path.resolve(start, "..", "..");
}

function getPaths() {
  const root = findRepoRoot();
  const cacheDir = path.join(root, ".cache", "awesome-design-md");
  const indexJson = path.join(cacheDir, "index.json");
  const buildScript = path.join(root, "apps", "web", "scripts", "build_awesome_design_index.mjs");
  const skillRoot = path.join(root, "apps", "web", "skills");
  const workflowSkill = path.join(skillRoot, "website-generation-workflow", "SKILL.md");
  const bundledIndexJson = path.join(
    skillRoot,
    "website-generation-workflow",
    "awesome-design.snapshot.json",
  );
  const bundledLocalIndexJson = path.join(
    skillRoot,
    "website-generation-workflow",
    "awesome-design.local.index.json",
  );
  const localTemplateRoot = path.join(
    skillRoot,
    "website-generation-workflow",
    "awesome-design-md",
    "design-md",
  );
  const selectionCriteria = path.join(
    skillRoot,
    "design-website-generator",
    "prompts",
    "selection-criteria.md",
  );
  const designGeneratorSkill = path.join(
    skillRoot,
    "design-website-generator",
    "SKILL.md",
  );
  const sequentialWorkflow = path.join(
    skillRoot,
    "design-website-generator",
    "prompts",
    "sequential-workflow.md",
  );
  const workflowGuide = path.join(
    skillRoot,
    "design-website-generator",
    "prompts",
    "workflow-guide.md",
  );
  const designRulesDir = path.join(
    skillRoot,
    "design-website-generator",
    "rules",
  );
  const styleProfiles = path.join(
    skillRoot,
    "website-generation-workflow",
    "style-profiles.json",
  );
  const templateBlueprints = path.join(
    skillRoot,
    "website-generation-workflow",
    "template-blueprints.json",
  );
  const workflowSkillJson = path.join(
    skillRoot,
    "website-generation-workflow",
    "skill.json",
  );

  return {
    root,
    cacheDir,
    indexJson,
    buildScript,
    workflowSkill,
    bundledIndexJson,
    bundledLocalIndexJson,
    localTemplateRoot,
    selectionCriteria,
    designGeneratorSkill,
    sequentialWorkflow,
    workflowGuide,
    designRulesDir,
    styleProfiles,
    templateBlueprints,
    workflowSkillJson,
  };
}

async function loadStyleSelectionPolicy(): Promise<StyleSelectionPolicy> {
  const { workflowSkillJson } = getPaths();
  try {
    const raw = await fs.readFile(workflowSkillJson, "utf8");
    const parsed = JSON.parse(raw);
    const policy = parsed?.styleSelectionPolicy;
    return policy && typeof policy === "object" ? (policy as StyleSelectionPolicy) : {};
  } catch {
    return {};
  }
}

async function ensureAwesomeIndex() {
  const { cacheDir, indexJson, buildScript, bundledIndexJson, bundledLocalIndexJson, localTemplateRoot } = getPaths();
  const forceRefresh = process.env.AWESOME_DESIGN_REFRESH === "1";

  const indexExists = await pathExists(indexJson);
  let shouldRefresh = forceRefresh || !indexExists;

  if (!shouldRefresh && indexExists) {
    const stat = await fs.stat(indexJson);
    shouldRefresh = Date.now() - stat.mtimeMs > AWESOME_INDEX_REFRESH_MS;
  }

  if (!shouldRefresh) return;
  if (!(await pathExists(buildScript))) return;

  await fs.mkdir(cacheDir, { recursive: true });

  try {
    await execFileAsync("node", [buildScript, cacheDir], {
      timeout: Number(process.env.AWESOME_DESIGN_REFRESH_TIMEOUT_MS || 15000),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 2,
      env: {
        ...process.env,
        AWESOME_DESIGN_TEMPLATE_ROOT: localTemplateRoot,
        AWESOME_DESIGN_SNAPSHOT_PATH: bundledIndexJson,
        AWESOME_DESIGN_LOCAL_INDEX_PATH: bundledLocalIndexJson,
      },
    });
  } catch {
    // Non-blocking: fallback to stale cache or local design systems
  }
}

async function loadIndexFile(filePath: string): Promise<AwesomeIndex | null> {
  if (!(await pathExists(filePath))) return null;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AwesomeIndex;
    if (!Array.isArray(parsed.styles) || parsed.styles.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadAwesomeIndex(): Promise<AwesomeIndex | null> {
  const { indexJson, bundledLocalIndexJson, bundledIndexJson } = getPaths();
  const cacheIndex = await loadIndexFile(indexJson);
  if (cacheIndex) return cacheIndex;
  const localBundledIndex = await loadIndexFile(bundledLocalIndexJson);
  if (localBundledIndex) return localBundledIndex;
  return loadIndexFile(bundledIndexJson);
}

function tokenize(text: string, ignoredTokens: Set<string> = new Set()): string[] {
  const lowered = text.toLowerCase();
  const tokens = lowered
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => {
      if (/^\d+$/.test(token)) return false;
      if (ignoredTokens.has(token)) return false;
      const hasCjk = /[\u4e00-\u9fff]/.test(token);
      if (hasCjk) return token.length >= 2;
      return token.length >= 3;
    });

  return Array.from(new Set(tokens));
}

function scoreStyle(style: AwesomeIndexStyle, query: string, ignoredTokens: Set<string>) {
  const tokens = tokenize(query, ignoredTokens);
  const haystacks = [style.slug, style.name, style.category || "", style.description || ""]
    .join(" ")
    .toLowerCase();
  const hayTokens = new Set(tokenize(haystacks, ignoredTokens));

  const matched: string[] = [];
  let score = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (hayTokens.has(token)) {
      matched.push(token);
      score += token.length >= 5 ? 4 : 3;
      continue;
    }
    if (haystacks.includes(token)) {
      matched.push(token);
      score += token.length >= 5 ? 2 : 1;
    }
  }

  if (query.toLowerCase().includes(style.slug.toLowerCase())) score += 4;

  return { score, matched_keywords: Array.from(new Set(matched)) };
}

function hasExplicitStyleReference(
  style: AwesomeIndexStyle,
  queryLower: string,
  queryTokens: Set<string>,
  ignoredTokens: Set<string>,
): boolean {
  const slug = String(style.slug || "").toLowerCase();
  const name = String(style.name || "").toLowerCase();
  if (!slug && !name) return false;

  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundarySlug =
    slug.length >= 4 ? new RegExp(`(?:^|[^a-z0-9])${escapedSlug}(?:$|[^a-z0-9])`, "i").test(queryLower) : false;
  const boundaryName =
    name.length >= 4 ? new RegExp(`(?:^|[^a-z0-9])${escapedName}(?:$|[^a-z0-9])`, "i").test(queryLower) : false;
  if (boundarySlug || boundaryName) return true;

  const slugTokens = tokenize(slug, ignoredTokens);
  const nameTokens = tokenize(name, ignoredTokens);
  const tokenGroups = [slugTokens, nameTokens].filter((tokens) => tokens.length > 0);

  return tokenGroups.some((tokens) => {
    if (tokens.length !== 1) return false;
    const [token] = tokens;
    return token.length >= 4 && queryTokens.has(token);
  });
}

function extractHexColors(text: string): string[] {
  return Array.from(new Set((String(text || "").match(/#[0-9a-fA-F]{6}\b/g) || []).map((item) => item.toUpperCase())));
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | undefined {
  const normalized = String(hex || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function isWarmAccentLikeHex(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  return rgb.r >= 180 && rgb.g >= 80 && rgb.g <= 190 && rgb.b <= 90;
}

function compileConfiguredPattern(pattern: string): RegExp | undefined {
  const raw = String(pattern || "").trim();
  if (!raw) return undefined;
  try {
    return new RegExp(raw, "i");
  } catch {
    return undefined;
  }
}

function hasConfiguredPatternMatch(source: string, patterns: string[] | undefined): boolean {
  return (patterns || []).some((pattern) => {
    const regex = compileConfiguredPattern(pattern);
    return regex ? regex.test(source) : source.toLowerCase().includes(String(pattern || "").toLowerCase());
  });
}

function configuredColor(defaults: Record<string, string> | undefined, key: string, fallback: string): string {
  const value = String(defaults?.[key] || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function configuredSignalColor(
  signals: PromptAdaptiveSignal[],
  matchedKeys: string[],
  defaults: Record<string, string> | undefined,
  field: "primaryDefault" | "accentDefault" | "surfaceDefault",
  fallbackKey: string,
  fallback: string,
  options: { preferLast?: boolean } = {},
): string {
  const orderedSignals = options.preferLast ? [...signals].reverse() : signals;
  for (const signal of orderedSignals) {
    const key = String(signal.key || "").trim();
    if (!key || !matchedKeys.includes(key)) continue;
    const configuredKey = String(signal[field] || "").trim();
    if (!configuredKey) continue;
    const color = configuredColor(defaults, configuredKey, "");
    if (color) return color;
  }
  return configuredColor(defaults, fallbackKey, fallback);
}

function extractPromptVisualIntent(query: string, policy?: PromptAdaptiveDesignPolicy): PromptVisualIntent {
  const source = String(query || "");
  const configuredSignals = (policy?.signals || []).filter((signal) => signal?.key && signal?.pattern);
  if (configuredSignals.length === 0) {
    return {
      active: false,
      score: 0,
      matchedKeywords: [],
      designMd: "",
      stylePreset: {},
      reason: "No prompt-adaptive design policy is configured.",
    };
  }

  const hexColors = extractHexColors(source);
  const matchedSignals = configuredSignals.filter((signal) => {
    const regex = compileConfiguredPattern(String(signal.pattern || ""));
    return regex ? regex.test(source) : false;
  });
  const matchedKeywords = matchedSignals.map((signal) => String(signal.key));
  const visualCoreCount = matchedSignals.filter((signal) => signal.core === true).length;
  const explicitVisualLanguage = hasConfiguredPatternMatch(source, policy?.explicitVisualLanguagePatterns);
  const activation = policy?.activation || {};
  const active =
    (activation.hexColors !== false && hexColors.length > 0) ||
    (explicitVisualLanguage && visualCoreCount >= Math.max(1, Number(activation.minCoreSignalsWithExplicitLanguage || 2))) ||
    visualCoreCount >= Math.max(1, Number(activation.minCoreSignals || 3));

  if (!active) {
    return {
      active: false,
      score: 0,
      matchedKeywords,
      designMd: "",
      stylePreset: {},
      reason: "No explicit visual system was detected in the prompt.",
    };
  }

  const defaults = policy?.defaults || {};
  const coreMatched = matchedSignals.some((signal) => signal.core === true);
  const shapeIsSoft = matchedSignals.some((signal) => signal.core === true);
  const wantsDark = hasConfiguredPatternMatch(source, policy?.darkModePatterns);
  const wantsLight = coreMatched || !wantsDark;
  const primary =
    hexColors[0] ||
    configuredSignalColor(configuredSignals, matchedKeywords, defaults, "primaryDefault", "primary", "#2563EB");
  const explicitWarmAccent = hexColors.find((hex) => hex !== primary && isWarmAccentLikeHex(hex));
  const accent =
    explicitWarmAccent ||
    hexColors.find((hex) => hex !== primary) ||
    configuredSignalColor(configuredSignals, matchedKeywords, defaults, "accentDefault", "accent", "#22C55E", { preferLast: true });
  const background = wantsLight
    ? configuredColor(defaults, "lightBackground", "#FFFFFF")
    : configuredColor(defaults, "darkBackground", "#07120E");
  const surface = wantsLight
    ? configuredSignalColor(configuredSignals, matchedKeywords, defaults, "surfaceDefault", "lightSurface", "#F8FAFC")
    : configuredColor(defaults, "darkSurface", "#102019");
  const panel = wantsLight ? configuredColor(defaults, "lightPanel", "#FFFFFF") : configuredColor(defaults, "darkPanel", "#14281F");
  const text = wantsLight ? configuredColor(defaults, "lightText", "#12312A") : configuredColor(defaults, "darkText", "#F3F8F4");
  const muted = wantsLight ? configuredColor(defaults, "lightMuted", "#51635C") : configuredColor(defaults, "darkMuted", "#B8C8BF");
  const border = wantsLight ? configuredColor(defaults, "lightBorder", "#D7E7DD") : configuredColor(defaults, "darkBorder", "#274237");
  const mode = wantsLight ? "light" : "dark";
  const mood = matchedSignals.map((signal) => String(signal.mood || "").trim()).filter(Boolean);
  const designMdConfig = policy?.designMd || {};
  const typography = String(policy?.typography || "").trim() || "Inter, system-ui, -apple-system, sans-serif";

  const designMd = [
    "# DESIGN",
    "",
    `# ${designMdConfig.title || policy?.name || "Prompt-Adaptive Design System"}`,
    "",
    designMdConfig.intro ||
      "This design system is derived from the confirmed Canonical Website Prompt and overrides generic template aesthetics when explicit visual requirements are present.",
    "",
    "## 1. Extracted Visual Requirements",
    `- Extracted visual signals: ${matchedKeywords.join(", ") || "explicit visual direction"}.`,
    hexColors.length ? `- Explicit palette from prompt: ${hexColors.join(", ")}.` : `- Inferred palette from prompt signals: primary ${primary}, accent ${accent}.`,
    `- Required mood: ${mood.join(", ") || "source-led"}.`,
    "",
    "## 2. Color Palette",
    `- Primary: ${primary}`,
    `- Accent: ${accent}`,
    `- Background: ${background}`,
    `- Surface: ${surface}`,
    `- Panel: ${panel}`,
    `- Text: ${text}`,
    `- Muted text: ${muted}`,
    `- Border: ${border}`,
    "",
    "## 3. Typography",
    ...(designMdConfig.typographyRules || [`Use ${typography} for readable content.`]),
    "",
    "## 4. Layout And Shape",
    `- Mode: ${mode}.`,
    `- Shape language: ${shapeIsSoft ? "soft, rounded, approachable cards and controls" : "clean, restrained, professional containers"}.`,
    ...(designMdConfig.layoutRules || [
      "Use clear section rhythm and source-specific content modules.",
      "Prompt-defined colors, mood, audience, and brand semantics remain authoritative.",
    ]),
  ].join("\n");

  return {
    active: true,
    score: 100 + matchedKeywords.length * 5 + hexColors.length * 10,
    matchedKeywords,
    designMd,
    stylePreset: {
      mode,
      typography,
      borderRadius: shapeIsSoft ? "md" : "sm",
      navVariant: "pill",
      headerVariant: "solid",
      footerVariant: wantsLight ? "light" : "dark",
      buttonVariant: "solid",
      heroTheme: wantsLight ? "light" : "dark",
      heroEffect: "none",
      navLabelMaxChars: 12,
      colors: {
        primary,
        accent,
        background,
        surface,
        panel,
        text,
        muted,
        border,
      },
    },
    reason: policy?.reason || "Canonical prompt contains explicit visual requirements; using prompt-adaptive design context.",
  };
}

function buildOpenDesignDirectionMd(
  directionId: string,
  source:
    | "explicit"
    | "recommended"
    | "system-recommended default"
    | "explicit upstream choice"
    | "structured visual decision",
): string {
  const direction = getWebsiteDesignDirection(directionId);
  if (!direction) return "";
  const isExplicitSource = source === "explicit" || source === "explicit upstream choice";
  const isRecommendedSource = source === "recommended" || source === "system-recommended default";

  return [
    "# DESIGN",
    "",
    `# Open Design Direction: ${direction.label}`,
    "",
    isExplicitSource
      ? "This design contract comes from an explicit user-selected open-design direction and must remain the primary visual category."
      : isRecommendedSource
        ? "This design contract comes from a system-recommended open-design direction and should be treated as a default visual inclination."
      : "This design contract comes from a system-recommended open-design direction and should be treated as a default visual inclination.",
    "",
    "## 1. Direction Summary",
    `- Direction id: ${direction.id}`,
    `- Mood: ${direction.mood}`,
    `- References: ${direction.references.join(", ")}`,
    "",
    "## 2. Palette",
    `- Background: ${direction.palette.bg}`,
    `- Surface: ${direction.palette.surface}`,
    `- Foreground: ${direction.palette.fg}`,
    `- Muted: ${direction.palette.muted}`,
    `- Border: ${direction.palette.border}`,
    `- Accent: ${direction.palette.accent}`,
    "",
    "## 3. Typography",
    `- Display font: ${direction.displayFont}`,
    `- Body font: ${direction.bodyFont}`,
    direction.monoFont ? `- Mono font: ${direction.monoFont}` : "",
    "",
    "## 4. Layout Posture",
    ...direction.posture.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStylePresetFromOpenDesignDirection(directionId: string): Partial<DesignStylePreset> {
  const direction = getWebsiteDesignDirection(directionId);
  if (!direction) return {};

  const colorMap: Record<string, DesignStylePreset["colors"]> = {
    "editorial-monocle": {
      primary: "#A84B3A",
      accent: "#A84B3A",
      background: "#F8F4EA",
      surface: "#FFFDF8",
      panel: "#FFFDF8",
      text: "#2E241F",
      muted: "#6B5A52",
      border: "#E6DDD0",
    },
    "modern-minimal": {
      primary: "#2563EB",
      accent: "#2563EB",
      background: "#FFFFFF",
      surface: "#FFFFFF",
      panel: "#FFFFFF",
      text: "#111827",
      muted: "#6B7280",
      border: "#E5E7EB",
    },
    "warm-soft": {
      primary: "#C56B4E",
      accent: "#C56B4E",
      background: "#FBF5EE",
      surface: "#FFFDF9",
      panel: "#FFFDF9",
      text: "#3A2A24",
      muted: "#7A665C",
      border: "#E8D9CC",
    },
    "tech-utility": {
      primary: "#16A34A",
      accent: "#16A34A",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      panel: "#FFFFFF",
      text: "#0F172A",
      muted: "#475569",
      border: "#E2E8F0",
    },
    "brutalist-experimental": {
      primary: "#E4572E",
      accent: "#E4572E",
      background: "#F7F5F0",
      surface: "#FFFFFF",
      panel: "#FFFFFF",
      text: "#111111",
      muted: "#444444",
      border: "#111111",
    },
    "industrial-b2b": {
      primary: "#2563EB",
      accent: "#2563EB",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      panel: "#FFFFFF",
      text: "#0F172A",
      muted: "#475569",
      border: "#CBD5E1",
    },
    "heritage-manufacturing": {
      primary: "#B8893E",
      accent: "#B8893E",
      background: "#F7F2E8",
      surface: "#FFFDF8",
      panel: "#FFFDF8",
      text: "#2B211C",
      muted: "#6C5A4E",
      border: "#DCCDB8",
    },
  };

  const isSharp = directionId === "brutalist-experimental" || directionId === "industrial-b2b" || directionId === "tech-utility";
  const isDarkFooter = directionId === "industrial-b2b" || directionId === "tech-utility" || directionId === "brutalist-experimental";

  return {
    mode: "light",
    typography: `${direction.displayFont}; ${direction.bodyFont}`,
    borderRadius: isSharp ? "sm" : "md",
    navVariant: isSharp ? "underline" : "pill",
    headerVariant: "solid",
    footerVariant: isDarkFooter ? "dark" : "light",
    buttonVariant: "solid",
    heroTheme: isDarkFooter ? "dark" : "light",
    heroEffect: "none",
    navLabelMaxChars: 12,
    colors: colorMap[directionId] || {},
  };
}

function isValidDesignMdText(raw: string): boolean {
  const text = raw.trim();
  if (text.length < AWESOME_DESIGN_MIN_CONTENT_LENGTH) return false;
  if (/^<!doctype html/i.test(text) || /^<html/i.test(text)) return false;
  return /(^#\s+.+)|(^##\s+.+)|(\btypography\b)|(\bcolor\b)|(\bspacing\b)/im.test(text);
}

function toLocalPath(candidate: string, root: string): string | null {
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return null;

  if (candidate.startsWith("local://")) {
    const trimmed = candidate.slice("local://".length).replace(/^\/+/, "");
    return path.join(root, trimmed);
  }

  if (path.isAbsolute(candidate)) return candidate;
  return path.join(root, candidate);
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

async function loadFirstHealthyLocalDesignMd(style: AwesomeIndexStyle): Promise<{ content: string; source: string } | null> {
  const { root, localTemplateRoot } = getPaths();
  const localCandidates = uniq([
    toLocalPath(style.designMdPath || "", root),
    toLocalPath(style.designMdUrl || "", root),
    path.join(localTemplateRoot, style.slug, "DESIGN.md"),
    path.join(localTemplateRoot, style.slug, "README.md"),
  ]);

  for (const localPath of localCandidates) {
    if (!(await pathExists(localPath))) continue;
    try {
      const content = await fs.readFile(localPath, "utf8");
      if (!isValidDesignMdText(content)) continue;
      return { content, source: localPath };
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function loadDesignMdByStyle(style: AwesomeIndexStyle): Promise<string> {
  const localResult = await loadFirstHealthyLocalDesignMd(style);
  if (localResult) return localResult.content;

  throw new Error(
    `DESIGN.md unavailable for style "${style.slug}". Checked local sources only.`,
  );
}

async function loadAnyLocalDesignMd(): Promise<string> {
  const { localTemplateRoot } = getPaths();
  if (!(await pathExists(localTemplateRoot))) return "";

  const stack = [localTemplateRoot];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: any[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower !== "design.md" && lower !== "readme.md") continue;
      try {
        const text = await fs.readFile(abs, "utf8");
        if (isValidDesignMdText(text)) return text;
      } catch {
        // ignore and continue
      }
    }
  }
  return "";
}

async function loadFileText(filePath: string) {
  if (!filePath) return "";
  if (WORKFLOW_RUNTIME_TEXT_CACHE_TTL_MS > 0) {
    const hit = workflowRuntimeTextCache.get(filePath);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  if (!(await pathExists(filePath))) return "";
  const content = await fs.readFile(filePath, "utf8");

  if (WORKFLOW_RUNTIME_TEXT_CACHE_TTL_MS > 0) {
    workflowRuntimeTextCache.set(filePath, {
      value: content,
      expiresAt: Date.now() + WORKFLOW_RUNTIME_TEXT_CACHE_TTL_MS,
    });
  }

  return content;
}

async function loadRulesSummary(rulesDir: string): Promise<string> {
  if (!(await pathExists(rulesDir))) return "";

  try {
    const entries = await fs.readdir(rulesDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => path.join(rulesDir, entry.name))
      .sort((a, b) => a.localeCompare(b, "en"));

    if (mdFiles.length === 0) return "";

    const chunks: string[] = [];
    for (const file of mdFiles) {
      const text = await loadFileText(file);
      if (!text.trim()) continue;
      const title = path.basename(file, ".md");
      const compact = text
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 24)
        .join("\n");
      if (!compact) continue;
      chunks.push(`## ${title}\n${compact}`);
    }

    return chunks.join("\n\n");
  } catch {
    return "";
  }
}

function normalizeWorkflowStyleId(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveWorkflowProviderConfig(): WorkflowProviderConfig {
  const providerRaw = String(process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const sharedModel = String(process.env.LLM_MODEL || process.env.LLM_MODEL_DEFAULT || "").trim();
  if (providerRaw === "pptoken") {
    return {
      provider: "pptoken",
      apiKey: process.env.PPTOKEN_API_KEY,
      baseURL: process.env.PPTOKEN_BASE_URL || "https://api.pptoken.org/v1",
      modelName:
        sharedModel ||
        process.env.LLM_MODEL_PPTOKEN ||
        process.env.PPTOKEN_MODEL ||
        "gpt-5.4-mini",
    };
  }
  if (providerRaw === "crazyroute" || providerRaw === "crazyrouter" || providerRaw === "crazyreoute") {
    return {
      provider: "crazyroute",
      apiKey:
        process.env.CRAZYROUTE_API_KEY ||
        process.env.CRAZYROUTER_API_KEY ||
        process.env.CRAZYREOUTE_API_KEY,
      baseURL:
        process.env.CRAZYROUTE_BASE_URL ||
        process.env.CRAZYROUTER_BASE_URL ||
        process.env.CRAZYREOUTE_BASE_URL ||
        "https://crazyrouter.com/v1",
      modelName:
        sharedModel ||
        process.env.LLM_MODEL_CRAZYROUTE ||
        process.env.LLM_MODEL_CRAZYROUTER ||
        process.env.LLM_MODEL_CRAZYREOUTE ||
        "gpt-5.4-mini",
    };
  }
  if (providerRaw === "openrouter") {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      modelName: process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5",
      defaultHeaders: {
        "HTTP-Referer": "https://shpitto.com",
        "X-Title": "Shpitto",
      },
    };
  }
  return {
    provider: "aiberm",
    apiKey: process.env.AIBERM_API_KEY || process.env.PPTOKEN_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY,
    baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
    modelName:
      sharedModel ||
      process.env.LLM_MODEL_AIBERM ||
      process.env.AIBERM_MODEL ||
      "gpt-5.4-mini",
  };
}

function parseJsonFromLlmText(raw: string): any | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct !== null) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  const startObj = text.indexOf("{");
  const endObj = text.lastIndexOf("}");
  if (startObj >= 0 && endObj > startObj) {
    const parsed = tryParse(text.slice(startObj, endObj + 1).trim());
    if (parsed !== null) return parsed;
  }

  const startArr = text.indexOf("[");
  const endArr = text.lastIndexOf("]");
  if (startArr >= 0 && endArr > startArr) {
    const parsed = tryParse(text.slice(startArr, endArr + 1).trim());
    if (parsed !== null) return parsed;
  }

  return null;
}

async function selectStylesWithLlm(params: {
  query: string;
  styles: AwesomeIndexStyle[];
  selectionCriteria: string;
}): Promise<WorkflowLlmStyleSelection | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (String(process.env.WORKFLOW_STYLE_SELECT_USE_LLM || "1").trim() === "0") return null;

  const config = resolveWorkflowProviderConfig();
  if (!config.apiKey) return null;

  const styleCatalog = params.styles
    .map((style, index) => {
      const description = String(style.description || "").replace(/\s+/g, " ").trim().slice(0, 140);
      return `${index + 1}. id=${style.slug}; name=${style.name}; category=${style.category || "unknown"}; desc=${description}`;
    })
    .join("\n");

  const model = new ChatOpenAI({
    modelName: config.modelName,
    openAIApiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    },
    timeout: Math.max(12_000, Number(process.env.WORKFLOW_STYLE_SELECT_TIMEOUT_MS || 45_000)),
    temperature: 0,
    maxRetries: 0,
    maxTokens: Math.max(1200, Number(process.env.WORKFLOW_STYLE_SELECT_MAX_TOKENS || 2400)),
  });
  if (config.provider === "aiberm") {
    (model as any).topP = undefined;
  }

  const systemPrompt = [
    "You are a design-system selector for website generation.",
    "Select styles semantically using user intent, industry, tone, and conversion goals.",
    "Return strict JSON only.",
    "JSON schema:",
    "{",
    '  "recommended_id": "style-id",',
    '  "top_candidates": [',
    '    { "id": "style-id", "reason": "why this fits" }',
    "  ],",
    '  "excluded": [',
    '    { "id": "style-id", "reason": "why excluded despite being close" }',
    "  ]",
    "}",
    "Constraints:",
    "- recommended_id must come from provided catalog.",
    "- top_candidates length must be exactly 3.",
    "- reasons should be concise and specific.",
  ].join("\n");

  const userPrompt = [
    "Selection criteria:",
    params.selectionCriteria.trim() || "(missing criteria)",
    "",
    "User requirement:",
    params.query.trim() || "(empty requirement)",
    "",
    "Style catalog:",
    styleCatalog,
  ].join("\n");

  try {
    const response = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);
    const content = Array.isArray((response as any)?.content)
      ? (response as any).content
          .map((item: any) => (typeof item === "string" ? item : String(item?.text || "")))
          .join("\n")
      : String((response as any)?.content || "");
    const parsed = parseJsonFromLlmText(content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as WorkflowLlmStyleSelection;
  } catch {
    return null;
  }
}

async function loadStyleProfiles(): Promise<StyleProfileMap> {
  const { styleProfiles } = getPaths();
  if (!(await pathExists(styleProfiles))) return {};
  try {
    const raw = await fs.readFile(styleProfiles, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as StyleProfileMap;
  } catch {
    return {};
  }
}

async function loadTemplateBlueprints(): Promise<TemplateBlueprintMap> {
  const { templateBlueprints } = getPaths();
  if (!(await pathExists(templateBlueprints))) {
    throw new Error(`template-blueprints.json missing at ${templateBlueprints}`);
  }
  try {
    const raw = await fs.readFile(templateBlueprints, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("template-blueprints.json has invalid shape");
    }
    return parsed as TemplateBlueprintMap;
  } catch (error) {
    throw new Error(
      `failed to load template-blueprints.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizeRoutePath(pathLike: string): string {
  const trimmed = (pathLike || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeading.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");
  return normalized || "/";
}

function resolveTemplateBlueprintByKey(
  allBlueprints: TemplateBlueprintMap,
  key: string,
): TemplateBlueprintResolved {
  const fallbackKey = allBlueprints[key] ? key : "default";
  const baseCandidate = allBlueprints[fallbackKey];
  if (!baseCandidate) {
    throw new Error(`template blueprint "${key}" not found and fallback "default" is missing`);
  }

  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = fallbackKey;
  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error(`template blueprint extends cycle detected at "${cursor}"`);
    }
    seen.add(cursor);
    chain.unshift(cursor);
    cursor = allBlueprints[cursor]?.extends;
  }

  let id = fallbackKey;
  let routeMode: "fixed" | "adaptive" = "fixed";
  let paths: string[] = [];
  const pages: Record<string, Required<TemplateBlueprintPage>> = {};

  for (const chainKey of chain) {
    const current = allBlueprints[chainKey];
    if (!current) continue;

    if (typeof current.id === "string" && current.id.trim()) {
      id = current.id.trim();
    }

    if (current.routeMode === "adaptive" || current.routeMode === "fixed") {
      routeMode = current.routeMode;
    }

    if (Array.isArray(current.paths) && current.paths.length > 0) {
      paths = Array.from(
        new Set(
          current.paths
            .map((entry) => normalizeRoutePath(String(entry || "")))
            .filter(Boolean),
        ),
      );
    }

    if (current.pages && typeof current.pages === "object") {
      for (const [rawPath, pageConfig] of Object.entries(current.pages)) {
        const pagePath = normalizeRoutePath(rawPath);
        const previous = pages[pagePath] || {
          seoTitleTemplate: "",
          seoDescriptionTemplate: "",
          componentTypes: [],
        };
        const mergedTypes = Array.isArray(pageConfig.componentTypes)
          ? pageConfig.componentTypes.map((item) => String(item)).filter(Boolean)
          : previous.componentTypes;

        pages[pagePath] = {
          seoTitleTemplate: pageConfig.seoTitleTemplate || previous.seoTitleTemplate || "",
          seoDescriptionTemplate:
            pageConfig.seoDescriptionTemplate || previous.seoDescriptionTemplate || "",
          componentTypes: mergedTypes,
        };
      }
    }
  }

  if (paths.length === 0) {
    paths = Object.keys(pages);
  }

  if (paths.length === 0) {
    throw new Error(`template blueprint "${fallbackKey}" has no paths`);
  }

  if (!paths.includes("/")) {
    paths.unshift("/");
  }

  for (const routePath of paths) {
    const existing = pages[routePath] || {
      seoTitleTemplate: "",
      seoDescriptionTemplate: "",
      componentTypes: [],
    };
    pages[routePath] = {
      seoTitleTemplate: existing.seoTitleTemplate || `Page | {{brand}}`,
      seoDescriptionTemplate:
        existing.seoDescriptionTemplate || `Explore ${routePath} at {{brand}}.`,
      componentTypes: existing.componentTypes || [],
    };
  }

  return {
    key: fallbackKey,
    id,
    routeMode,
    paths,
    pages,
  };
}

function extractHexPalette(designMd: string): string[] {
  const hits = designMd.match(/#[0-9a-fA-F]{6}\b/g) || [];
  return Array.from(new Set(hits.map((x) => x.toUpperCase())));
}

function inferModeFromDesignMd(designMd: string) {
  const text = designMd.toLowerCase();
  const darkSignals = [
    "dark mode",
    "dark theme",
    "deep dark",
    "dark hero",
    "midnight",
    "charcoal",
    "true black",
    "void-black",
    "black background",
    "near-black",
  ];
  const lightSignals = [
    "light mode",
    "light theme",
    "white background",
    "white canvas",
    "airy",
    "minimal",
    "white space",
    "bright",
    "clean white",
  ];

  const darkScore = darkSignals.reduce((acc, token) => acc + (text.includes(token) ? 2 : 0), 0);
  const lightScore = lightSignals.reduce((acc, token) => acc + (text.includes(token) ? 2 : 0), 0);
  return darkScore > lightScore ? "dark" : "light";
}

function inferBorderRadiusFromDesignMd(designMd: string): "none" | "sm" | "md" | "lg" {
  const text = designMd.toLowerCase();
  if (text.includes("square") || text.includes("sharp")) return "none";
  if (text.includes("rounded") || text.includes("soft")) return "md";
  return "sm";
}

function inferTypographyFromDesignMd(designMd: string): string {
  const text = designMd.toLowerCase();
  const candidates = [
    "inter",
    "space grotesk",
    "ibm plex sans",
    "sf pro display",
    "roboto",
    "montserrat",
    "manrope",
    "lato",
  ];
  const match = candidates.find((font) => text.includes(font));
  if (!match) return "\"Space Grotesk\", \"IBM Plex Sans\", system-ui, -apple-system, sans-serif";
  const normalized = match
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${normalized}, system-ui, -apple-system, sans-serif`;
}

function buildPresetFromDesignMd(designMd: string): Partial<DesignStylePreset> {
  const mode = inferModeFromDesignMd(designMd);
  const palette = extractHexPalette(designMd);
  const primary = palette[0] || (mode === "dark" ? "#2A72E5" : "#2563EB");
  const accent = palette[1] || (mode === "dark" ? "#9CA3AF" : "#22C55E");

  return {
    mode,
    typography: inferTypographyFromDesignMd(designMd),
    borderRadius: inferBorderRadiusFromDesignMd(designMd),
    navVariant: mode === "dark" ? "underline" : "pill",
    headerVariant: mode === "dark" ? "glass" : "solid",
    footerVariant: mode === "dark" ? "dark" : "light",
    buttonVariant: "solid",
    heroTheme: mode === "dark" ? "dark" : "light",
    heroEffect: "none",
    navLabelMaxChars: mode === "dark" ? 10 : 12,
    colors: {
      primary,
      accent,
      background: mode === "dark" ? "#06090F" : "#FFFFFF",
      surface: mode === "dark" ? "#0B1120" : "#F8FAFC",
      panel: mode === "dark" ? "#111827" : "#FFFFFF",
      text: mode === "dark" ? "#F3F4F6" : "#0F172A",
      muted: mode === "dark" ? "#9CA3AF" : "#475569",
      border: mode === "dark" ? "#1F2937" : "#E2E8F0",
    },
  };
}

export async function resolveDesignSkillHit(
  input: string | undefined | null,
  visualDecision?: WorkflowVisualDecisionContext,
): Promise<DesignSkillHit> {
  await ensureAwesomeIndex();

  const query = (input || "").trim();
  const normalizedVisualDecision = normalizeWorkflowVisualDecisionContext(visualDecision);
  const stylePolicy = await loadStyleSelectionPolicy();
  const ignoredStyleTokens = new Set((stylePolicy.explicitStyleReferenceIgnoredTokens || []).map((token) => String(token).toLowerCase()));
  const queryLower = query.toLowerCase();
  const queryTokens = new Set(tokenize(queryLower, ignoredStyleTokens));
  const { selectionCriteria } = getPaths();
  const selectionCriteriaText = await loadFileText(selectionCriteria);
  const index = await loadAwesomeIndex();
  const styles = index?.styles || [];

  if (!styles.length) {
    return {
      id: "awesome-index-unavailable",
      name: "Awesome Index Unavailable",
      design_desc:
        "awesome-design-md index is unavailable. Please ensure apps/web/skills/website-generation-workflow assets and .cache/awesome-design-md/index.json are available.",
      score: 0,
      matched_keywords: [],
      source: "website-generation-workflow",
    };
  }

  const scored = styles
    .map((style) => {
      const base = scoreStyle(style, query, ignoredStyleTokens);
      return {
        style,
        matched_keywords: base.matched_keywords,
        base_score: base.score,
        score: base.score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.base_score !== a.base_score) return b.base_score - a.base_score;
      return String(a.style.slug || "").localeCompare(String(b.style.slug || ""));
    });
  const explicit = styles.find((style) => hasExplicitStyleReference(style, queryLower, queryTokens, ignoredStyleTokens));
  let best = explicit
    ? scored.find((entry) => entry.style.slug === explicit.slug) || scored[0]
    : scored[0];
  let top3 = scored.slice(0, 3);
  const localBest = scored[0];
  let selectionMode: NonNullable<DesignSkillHit["selection_mode"]> = explicit ? "explicit_match" : "local_score";
  let llmRecommendedId: string | undefined;
  let llmOverrideReason: string | undefined;

  const structuredDirectionId = normalizedVisualDecision?.primaryVisualDirection;
  if (!explicit && structuredDirectionId) {
    const direction = getWebsiteDesignDirection(structuredDirectionId);
    if (direction) {
      const lockedPrimary = Boolean(normalizedVisualDecision?.lockPrimaryVisualDirection);
      const sourceLabel =
        normalizedVisualDecision?.visualDecisionSource === "user_recommended_default"
          ? "system-recommended default"
          : normalizedVisualDecision?.visualDecisionSource === "user_explicit"
            ? "explicit upstream choice"
            : "structured visual decision";
      return {
        id: `open-design-${direction.id}`,
        name: direction.label,
        design_desc: `Open-design direction selected upstream from ${sourceLabel}: ${direction.label}.`,
        score: 10_000,
        matched_keywords: [direction.id],
        source: "website-generation-workflow",
        category: "Open Design",
        design_md_inline: buildOpenDesignDirectionMd(direction.id, sourceLabel),
        index_generated_at: index?.generatedAt,
        selection_mode: lockedPrimary ? "open_design_explicit" : "open_design_context",
        local_top_candidate: localBest
          ? {
              id: localBest.style.slug,
              name: localBest.style.name,
              score: localBest.score,
              category: localBest.style.category,
              matched_keywords: localBest.matched_keywords,
            }
          : undefined,
        llm_candidate_limit: WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT,
        selection_candidates: top3.map((entry, index) => ({
          id: entry.style.slug,
          name: entry.style.name,
          score: entry.score,
          local_rank: index + 1,
          base_score: entry.base_score,
          category: entry.style.category,
          design_md_url: entry.style.designMdUrl,
          design_md_path: entry.style.designMdPath,
          excluded_reason: lockedPrimary
            ? `Structured visual decision locked ${direction.id} as the primary visual category.`
            : `Structured visual decision selected ${direction.id} as the primary visual category.`,
        })),
        style_preset: normalizeStylePreset(buildStylePresetFromOpenDesignDirection(direction.id), {}),
      };
    }
  }

  const promptVisualIntent = extractPromptVisualIntent(query, stylePolicy.promptAdaptiveDesign);

  if (!explicit && promptVisualIntent.active) {
    return {
      id: stylePolicy.promptAdaptiveDesign?.id || "prompt-adaptive",
      name: stylePolicy.promptAdaptiveDesign?.name || "Prompt-Adaptive",
      design_desc: promptVisualIntent.reason,
      score: promptVisualIntent.score,
      matched_keywords: promptVisualIntent.matchedKeywords,
      source: "website-generation-workflow",
      category: stylePolicy.promptAdaptiveDesign?.category || "Prompt Derived",
      design_md_inline: promptVisualIntent.designMd,
      index_generated_at: index?.generatedAt,
      selection_mode: "prompt_adaptive",
      local_top_candidate: localBest
        ? {
            id: localBest.style.slug,
            name: localBest.style.name,
            score: localBest.score,
            category: localBest.style.category,
            matched_keywords: localBest.matched_keywords,
          }
        : undefined,
      llm_candidate_limit: WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT,
      selection_candidates: top3.map((entry, index) => ({
        id: entry.style.slug,
        name: entry.style.name,
        score: entry.score,
        local_rank: index + 1,
        base_score: entry.base_score,
        category: entry.style.category,
        design_md_url: entry.style.designMdUrl,
        design_md_path: entry.style.designMdPath,
        excluded_reason: "Prompt-defined visual requirements are more specific than this generic template match.",
      })),
      style_preset: normalizeStylePreset(promptVisualIntent.stylePreset, {}),
    };
  }

  const llmPool = scored.slice(0, WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT);
  const explicitEntry = explicit ? scored.find((entry) => entry.style.slug === explicit.slug) : undefined;
  if (explicitEntry && !llmPool.some((entry) => entry.style.slug === explicitEntry.style.slug)) {
    llmPool.push(explicitEntry);
  }

  const llmSelection = await selectStylesWithLlm({
    query,
    styles: llmPool.map((entry) => entry.style),
    selectionCriteria: selectionCriteriaText,
  });

  const styleById = new Map(llmPool.map((entry) => [normalizeWorkflowStyleId(entry.style.slug), entry.style]));
  const scoreById = new Map(llmPool.map((entry) => [normalizeWorkflowStyleId(entry.style.slug), entry]));
  const localRankById = new Map(scored.map((entry, index) => [normalizeWorkflowStyleId(entry.style.slug), index + 1]));
  const llmReasons = new Map<string, string>();
  const llmExclusions = new Map<string, string>();

  if (llmSelection?.top_candidates?.length) {
    for (const item of llmSelection.top_candidates) {
      const id = normalizeWorkflowStyleId(item.id);
      if (!id) continue;
      if (item.reason) llmReasons.set(id, item.reason.trim());
    }
  }
  if (llmSelection?.excluded?.length) {
    for (const item of llmSelection.excluded) {
      const id = normalizeWorkflowStyleId(item.id);
      if (!id) continue;
      if (item.reason) llmExclusions.set(id, item.reason.trim());
    }
  }

  const llmTopSlugs: string[] = [];
  const llmTopCandidates = Array.isArray(llmSelection?.top_candidates) ? llmSelection.top_candidates : [];
  if (llmTopCandidates.length > 0) {
    for (const item of llmTopCandidates) {
      const id = normalizeWorkflowStyleId(item.id);
      if (!id || !styleById.has(id) || llmTopSlugs.includes(id)) continue;
      llmTopSlugs.push(id);
    }
  }

  if (llmTopCandidates.length > 0) {
    while (llmTopSlugs.length < 3) {
      const fallback = llmPool.find((entry) => !llmTopSlugs.includes(normalizeWorkflowStyleId(entry.style.slug)));
      if (!fallback) break;
      llmTopSlugs.push(normalizeWorkflowStyleId(fallback.style.slug));
    }
    const mappedTop = llmTopSlugs
      .map((slug) => scoreById.get(slug))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .slice(0, 3);
    if (mappedTop.length > 0) {
      top3 = mappedTop;
      const recommendedId = normalizeWorkflowStyleId(llmSelection?.recommended_id);
      const recommended = recommendedId ? scoreById.get(recommendedId) : undefined;
      const llmBest = recommended || mappedTop[0] || undefined;
      if (llmBest) {
        const previousBestId = normalizeWorkflowStyleId(best.style.slug);
        const nextBestId = normalizeWorkflowStyleId(llmBest.style.slug);
        llmRecommendedId = recommended ? recommendedId : nextBestId;
        llmOverrideReason = llmReasons.get(nextBestId) || undefined;
        selectionMode = nextBestId === previousBestId ? "llm_semantic_rerank" : "llm_semantic_override";
        best = llmBest;
      }
    }
  }

  return {
    id: best.style.slug,
    name: best.style.name,
    design_desc: best.style.description || `Use ${best.style.name} design language from awesome-design-md.`,
    score: best.score,
    matched_keywords: best.matched_keywords,
    source: "website-generation-workflow",
    category: best.style.category,
    design_md_url: best.style.designMdUrl,
    design_md_path: best.style.designMdPath,
    index_generated_at: index?.generatedAt,
    selection_mode: selectionMode,
    local_top_candidate: localBest
      ? {
          id: localBest.style.slug,
          name: localBest.style.name,
          score: localBest.score,
          category: localBest.style.category,
          matched_keywords: localBest.matched_keywords,
        }
      : undefined,
    llm_recommended_id: llmRecommendedId,
    llm_override_reason:
      selectionMode === "llm_semantic_override"
        ? llmOverrideReason || "LLM semantic selector preferred this candidate over the local top score."
        : undefined,
    llm_candidate_limit: WORKFLOW_STYLE_LLM_CANDIDATE_LIMIT,
    selection_candidates: top3.map((entry) => ({
      id: entry.style.slug,
      name: entry.style.name,
      score: entry.score,
      local_rank: localRankById.get(normalizeWorkflowStyleId(entry.style.slug)),
      base_score: entry.base_score,
      category: entry.style.category,
      design_md_url: entry.style.designMdUrl,
      design_md_path: entry.style.designMdPath,
      reason: llmReasons.get(normalizeWorkflowStyleId(entry.style.slug)),
      excluded_reason: llmExclusions.get(normalizeWorkflowStyleId(entry.style.slug)),
    })),
  };
}

export async function loadWorkflowSkillContext(
  input: string | undefined | null,
  visualDecision?: WorkflowVisualDecisionContext,
): Promise<WorkflowSkillContext> {
  const {
    workflowSkill,
    selectionCriteria,
    designGeneratorSkill,
    sequentialWorkflow,
    workflowGuide,
    designRulesDir,
  } = getPaths();

  const workflowSkillText = await loadFileText(workflowSkill);
  const designGeneratorSkillText = await loadFileText(designGeneratorSkill);
  const selectionCriteriaText = await loadFileText(selectionCriteria);
  const sequentialWorkflowText = await loadFileText(sequentialWorkflow);
  const workflowGuideText = await loadFileText(workflowGuide);
  const rulesSummary = await loadRulesSummary(designRulesDir);

  if (!designGeneratorSkillText.trim()) {
    throw new Error(`design-website-generator SKILL missing at ${designGeneratorSkill}`);
  }
  if (!sequentialWorkflowText.trim()) {
    throw new Error(`sequential-workflow prompt missing at ${sequentialWorkflow}`);
  }

  const hit = await resolveDesignSkillHit(input, visualDecision);

  let designMd = "";
  if (hit.design_md_inline?.trim()) {
    designMd = hit.design_md_inline;
  } else {
    try {
      if (hit.id && hit.id !== "awesome-index-unavailable") {
        designMd = await loadDesignMdByStyle({
          name: hit.name,
          slug: hit.id,
          category: hit.category,
          description: hit.design_desc,
          designMdUrl: hit.design_md_url,
          designMdPath: hit.design_md_path,
        });
      }
    } catch {
      // Fallback below
    }
  }
  if (!designMd.trim()) {
    designMd = await loadAnyLocalDesignMd();
  }

  const styleProfiles = await loadStyleProfiles();
  const profilePreset = hit.id ? styleProfiles[hit.id] || {} : {};
  const inferredPreset = designMd ? buildPresetFromDesignMd(designMd) : {};
  const stylePreset = normalizeStylePreset(
    {
      ...(inferredPreset as Partial<DesignStylePreset>),
      ...(profilePreset as Partial<DesignStylePreset>),
      ...(hit.style_preset as Partial<DesignStylePreset>),
    },
    {},
  );

  let templateBlueprint: TemplateBlueprintResolved = {
    key: "skill-direct",
    id: "skill-direct",
    routeMode: "adaptive",
    paths: [],
    pages: {},
  };
  try {
    const allBlueprints = await loadTemplateBlueprints();
    templateBlueprint = resolveTemplateBlueprintByKey(allBlueprints, hit.id || "default");
  } catch {
    // Keep adaptive skill-direct default when blueprint source is missing/invalid
  }

  const enrichedHit: DesignSkillHit = {
    ...hit,
    style_preset: stylePreset,
  };

  return {
    hit: enrichedHit,
    workflowSkill: workflowSkillText,
    designGeneratorSkill: designGeneratorSkillText,
    selectionCriteria: selectionCriteriaText,
    sequentialWorkflow: sequentialWorkflowText,
    workflowGuide: workflowGuideText,
    rulesSummary,
    designMd,
    stylePreset,
    templateBlueprint,
  };
}

const WORKFLOW_RUNTIME_CONTEXT_FIELDS: WorkflowRuntimeContextField[] = [
  "workflowSkill",
  "designGeneratorSkill",
  "selectionCriteria",
  "sequentialWorkflow",
  "workflowGuide",
  "rulesSummary",
  "designMd",
];

function normalizeRequestedRuntimeContextFields(
  fields?: WorkflowRuntimeContextField[],
): WorkflowRuntimeContextField[] {
  if (!Array.isArray(fields) || fields.length === 0) return WORKFLOW_RUNTIME_CONTEXT_FIELDS;
  const valid = new Set<WorkflowRuntimeContextField>(WORKFLOW_RUNTIME_CONTEXT_FIELDS);
  const normalized = Array.from(new Set(fields.filter((field): field is WorkflowRuntimeContextField => valid.has(field))));
  return normalized.length > 0 ? normalized : WORKFLOW_RUNTIME_CONTEXT_FIELDS;
}

export async function loadWorkflowRuntimeContext(): Promise<WorkflowRuntimeContext>;
export async function loadWorkflowRuntimeContext(
  options: WorkflowRuntimeContextLoadOptions,
): Promise<Partial<WorkflowRuntimeContext>>;
export async function loadWorkflowRuntimeContext(
  options?: WorkflowRuntimeContextLoadOptions,
): Promise<WorkflowRuntimeContext | Partial<WorkflowRuntimeContext>> {
  const {
    workflowSkill,
    selectionCriteria,
    designGeneratorSkill,
    sequentialWorkflow,
    workflowGuide,
    designRulesDir,
  } = getPaths();

  const requestedFields = normalizeRequestedRuntimeContextFields(options?.fields);
  const requested = new Set<WorkflowRuntimeContextField>(requestedFields);
  const context: Partial<WorkflowRuntimeContext> = {};

  if (requested.has("workflowSkill")) {
    const workflowSkillText = await loadFileText(workflowSkill);
    if (!workflowSkillText.trim()) {
      throw new Error(`website-generation-workflow SKILL missing at ${workflowSkill}`);
    }
    context.workflowSkill = workflowSkillText;
  }

  if (requested.has("designGeneratorSkill")) {
    const designGeneratorSkillText = await loadFileText(designGeneratorSkill);
    if (!designGeneratorSkillText.trim()) {
      throw new Error(`design-website-generator SKILL missing at ${designGeneratorSkill}`);
    }
    context.designGeneratorSkill = designGeneratorSkillText;
  }

  if (requested.has("selectionCriteria")) {
    context.selectionCriteria = await loadFileText(selectionCriteria);
  }

  if (requested.has("sequentialWorkflow")) {
    const sequentialWorkflowText = await loadFileText(sequentialWorkflow);
    if (!sequentialWorkflowText.trim()) {
      throw new Error(`sequential-workflow prompt missing at ${sequentialWorkflow}`);
    }
    context.sequentialWorkflow = sequentialWorkflowText;
  }

  if (requested.has("workflowGuide")) {
    context.workflowGuide = await loadFileText(workflowGuide);
  }

  if (requested.has("rulesSummary")) {
    context.rulesSummary = await loadRulesSummary(designRulesDir);
  }

  if (requested.has("designMd")) {
    context.designMd = await loadAnyLocalDesignMd();
  }

  return context;
}







