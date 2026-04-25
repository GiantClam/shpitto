import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";

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
  index_generated_at?: string;
  selection_candidates?: Array<{
    id: string;
    name: string;
    score: number;
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
  provider: "aiberm" | "crazyroute" | "openrouter";
  apiKey?: string;
  baseURL: string;
  modelName: string;
  defaultHeaders?: Record<string, string>;
};

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
  };
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

function tokenize(text: string): string[] {
  const lowered = text.toLowerCase();
  const tokens = lowered
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => {
      if (/^\d+$/.test(token)) return false;
      const hasCjk = /[\u4e00-\u9fff]/.test(token);
      if (hasCjk) return token.length >= 2;
      return token.length >= 3;
    });

  return Array.from(new Set(tokens));
}

type QueryIntent = "automotive" | "fintech" | "ai" | "developer-tools";

function detectQueryIntents(query: string): Set<QueryIntent> {
  const text = query.toLowerCase();
  const intents = new Set<QueryIntent>();

  const hasAny = (terms: string[]) =>
    terms.some((term) => {
      if (/^[a-z]{1,3}$/.test(term)) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
      }
      return text.includes(term);
    });

  if (hasAny(["automotive", "vehicle", "car", "auto", "汽车", "车企", "新能源车"])) {
    intents.add("automotive");
  }

  if (hasAny(["fintech", "finance", "payment", "billing", "crypto", "banking", "支付", "金融", "交易"])) {
    intents.add("fintech");
  }

  if (hasAny(["llm", "model", "agent", "人工智能", "大模型", "机器学习"])) {
    intents.add("ai");
  }

  if (hasAny(["developer", "devtool", "sdk", "api", "code", "programming", "开发", "工程", "编码", "工具链"])) {
    intents.add("developer-tools");
  }

  return intents;
}
function intentBoostForStyle(style: AwesomeIndexStyle, intents: Set<QueryIntent>) {
  if (intents.size === 0) return 0;
  const slug = String(style.slug || "").toLowerCase();
  const category = String(style.category || "").toLowerCase();

  let boost = 0;
  if (intents.has("automotive")) {
    if (category.includes("car brands")) boost += 10;
  }
  if (intents.has("fintech")) {
    if (category.includes("fintech")) boost += 10;
    if (["stripe", "kraken", "revolut", "wise", "coinbase"].includes(slug)) boost += 4;
  }
  if (intents.has("ai")) {
    if (category.includes("ai")) boost += 8;
  }
  if (intents.has("developer-tools")) {
    if (category.includes("developer tools")) boost += 8;
  }

  return boost;
}

function scoreStyle(style: AwesomeIndexStyle, query: string) {
  const tokens = tokenize(query);
  const haystacks = [style.slug, style.name, style.category || "", style.description || ""]
    .join(" ")
    .toLowerCase();
  const hayTokens = new Set(tokenize(haystacks));

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
        process.env.LLM_MODEL_CRAZYROUTE ||
        process.env.LLM_MODEL_CRAZYROUTER ||
        process.env.LLM_MODEL_CRAZYREOUTE ||
        process.env.LLM_MODEL ||
        "openai/gpt-5.3-codex",
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
    apiKey: process.env.AIBERM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY,
    baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
    modelName:
      process.env.LLM_MODEL_AIBERM ||
      process.env.AIBERM_MODEL ||
      process.env.LLM_MODEL ||
      "openai/gpt-5.3-codex",
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

export async function resolveDesignSkillHit(input: string | undefined | null): Promise<DesignSkillHit> {
  await ensureAwesomeIndex();

  const query = (input || "").trim();
  const queryLower = query.toLowerCase();
  const queryTokens = new Set(tokenize(queryLower));
  const intents = detectQueryIntents(query);
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
      const base = scoreStyle(style, query);
      const boost = intentBoostForStyle(style, intents);
      return {
        style,
        matched_keywords: base.matched_keywords,
        base_score: base.score,
        boost_score: boost,
        score: base.score + boost,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.boost_score !== a.boost_score) return b.boost_score - a.boost_score;
      if (b.base_score !== a.base_score) return b.base_score - a.base_score;
      return String(a.style.slug || "").localeCompare(String(b.style.slug || ""));
    });
  const explicit = styles.find((style) => {
    const slug = String(style.slug || "").toLowerCase();
    const name = String(style.name || "").toLowerCase();
    if (!slug && !name) return false;

    const slugTokens = tokenize(slug);
    const nameTokens = tokenize(name);
    const tokenHit =
      slugTokens.some((token) => queryTokens.has(token)) || nameTokens.some((token) => queryTokens.has(token));

    const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundarySlug =
      slug.length >= 4 ? new RegExp(`(?:^|[^a-z0-9])${escapedSlug}(?:$|[^a-z0-9])`, "i").test(queryLower) : false;
    const boundaryName =
      name.length >= 4 ? new RegExp(`(?:^|[^a-z0-9])${escapedName}(?:$|[^a-z0-9])`, "i").test(queryLower) : false;

    return tokenHit || boundarySlug || boundaryName;
  });
  let best = explicit
    ? scored.find((entry) => entry.style.slug === explicit.slug) || scored[0]
    : scored[0];
  let top3 = scored.slice(0, 3);

  const llmSelection = await selectStylesWithLlm({
    query,
    styles,
    selectionCriteria: selectionCriteriaText,
  });

  const styleById = new Map(styles.map((style) => [normalizeWorkflowStyleId(style.slug), style]));
  const scoreById = new Map(scored.map((entry) => [normalizeWorkflowStyleId(entry.style.slug), entry]));
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
  if (Array.isArray(llmSelection?.top_candidates)) {
    for (const item of llmSelection.top_candidates) {
      const id = normalizeWorkflowStyleId(item.id);
      if (!id || !styleById.has(id) || llmTopSlugs.includes(id)) continue;
      llmTopSlugs.push(id);
    }
  }
  while (llmTopSlugs.length < 3) {
    const fallback = scored.find((entry) => !llmTopSlugs.includes(normalizeWorkflowStyleId(entry.style.slug)));
    if (!fallback) break;
    llmTopSlugs.push(normalizeWorkflowStyleId(fallback.style.slug));
  }

  if (llmTopSlugs.length > 0) {
    const mappedTop = llmTopSlugs
      .map((slug) => scoreById.get(slug))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .slice(0, 3);
    if (mappedTop.length > 0) {
      top3 = mappedTop;
      const recommendedId = normalizeWorkflowStyleId(llmSelection?.recommended_id);
      const recommended = recommendedId ? scoreById.get(recommendedId) : undefined;
      best = recommended || mappedTop[0] || best;
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
    selection_candidates: top3.map((entry) => ({
      id: entry.style.slug,
      name: entry.style.name,
      score: entry.score,
      category: entry.style.category,
      design_md_url: entry.style.designMdUrl,
      design_md_path: entry.style.designMdPath,
      reason: llmReasons.get(normalizeWorkflowStyleId(entry.style.slug)),
      excluded_reason: llmExclusions.get(normalizeWorkflowStyleId(entry.style.slug)),
    })),
  };
}

export async function loadWorkflowSkillContext(input: string | undefined | null): Promise<WorkflowSkillContext> {
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

  const hit = await resolveDesignSkillHit(input);

  let designMd = "";
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







