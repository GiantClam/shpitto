import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import type { AgentState } from "../agent/graph.ts";
import {
  appendReferencedAssetsBlock,
  parseReferencedAssetsFromText,
} from "../agent/referenced-assets.ts";
import { loadWorkflowSkillContext, normalizeWorkflowVisualDecisionContext } from "../agent/website-workflow.ts";
import { DEFAULT_STYLE_PRESET, normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";
import { selectWebsiteGenerationTypeSkill } from "./website-type-selector.ts";
import {
  buildLocalDecisionPlan,
  type LocalDecisionPlan,
  type PageBlueprint,
} from "./decision-layer.ts";
import {
  buildRouteUnitContractSummary,
  buildWebsiteDesignSpecMarkdown,
  buildWebsiteDesignSpecRouteExcerpt,
  type RouteUnitContractSummary,
} from "./website-design-spec.ts";
import {
  buildGenerationUnitInputFromRouteContract,
  createSkillExecutionGenerationWorkerAdapter,
  type GenerationUnitInput,
} from "./generation-worker-adapter.ts";
import {
  renderWebsiteArtifactGeneratorContract,
  resolveWebsiteArtifactGeneratorMode,
  type WebsiteArtifactGeneratorMode,
} from "./website-artifact-generator.ts";
import { inferWebsiteSurfaceModeFromSkillId, type WebsiteDiscoveryBrief, type WebsiteSurfaceMode } from "./open-design-adoption.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles } from "./artifacts.ts";
import {
  DEFAULT_OPENAI_COMPAT_MODEL,
  normalizeProviderModelId,
  resolveScenarioAwareProviderModelId,
} from "./provider-model-id.ts";
import { resolveRunProviderRunnerLock, resolveRunProviderRunnerLocks, type RunProviderLock } from "./provider-runner.ts";
import {
  getWebsiteGenerationSkillBundle,
  inferRouteFamiliesForPlanning,
  listDocumentContentSkillIds,
  listWebsiteSeedSkillIds,
  loadProjectSkill,
  renderProjectSkillResourceContract,
  renderProjectSkillResourceIndex,
  selectDocumentContentSkillsForIntent,
  selectWebsiteSeedSkillsForIntent,
  type ProjectSkillRouteFamily,
  type WebsiteSeedSkillSelection,
} from "./project-skill-loader.ts";
import {
  SKILL_TOOL_DEFINITIONS,
  buildSkillToolSystemInstructions,
  handleSkillToolCall,
  type SkillToolCall,
  type SkillToolFile,
} from "./skill-tool-registry.ts";
import { renderWebsiteQualityContract } from "./website-quality-contract.ts";
import { buildShadowVisualEvaluation, type QaSummary } from "./qa-summary.ts";
import {
  lintGeneratedWebsiteHtml,
  lintGeneratedWebsiteRouteHtml,
  lintGeneratedWebsiteStyles,
  mergeAntiSlopLintResults,
  renderAntiSlopFeedback,
} from "../visual-qa/anti-slop-linter.ts";
import {
  findDuplicatedBilingualDomCopy,
  findVisibleSimultaneousBilingualCopy as sharedFindVisibleSimultaneousBilingualCopy,
} from "./bilingual-copy-guard.ts";
import { sanitizeBlogIndexEditorialScaffoldText } from "../../skills/website-generation-workflow/runtime-site-completions.ts";
import { getSkillExecutionAdapter } from "./skill-execution-adapter-registry.ts";
import type { SkillExecutionAdapter, SkillExecutionRoundObjective, SkillExecutionValidationResult } from "./skill-execution-adapter.ts";
import { selectCuratedLibraryImage } from "./curated-media-library.ts";
import {
  buildLocalePlan,
  getLocaleMessagePath,
  I18N_LOCALE_REGISTRY_PATH,
  I18N_MESSAGE_EN_PATH,
  I18N_MESSAGE_ZH_CN_PATH,
  normalizeLocaleCode,
  normalizeLocaleList,
} from "./locale-plan.ts";
import {
  bilingualDefaultVisibleLanguage,
  hasExplicitBlogDetailFillRequest,
  hasExplicitChineseOnlyLocaleContract,
  hasExplicitEnglishOnlyLocaleContract,
  hasNegativeBlogArchiveBehaviorContract,
  hasNegativePublishableDetailContract,
  isContentBackedPageKind,
  isBilingualRequirementText,
  requestedPublishableContentCount,
  resolveRequestedExperienceLocale,
  shouldRequireAllDiscoveredBlogDetails,
  shouldRequireBlogDetailPagesForRoute as shouldRequireBlogDetailPagesForRoutePolicy,
  requirementRequestsPublishableDetailPages,
} from "./website-generation-shared-policy.ts";
import {
  formatTargetPageContract as formatRuntimeTargetPageContract,
  htmlPathToRoute,
} from "./website-page-contract.ts";
export {
  formatTargetPageContract,
  formatWebsiteTargetPageContractForAdapter,
  htmlPathToRoute,
} from "./website-page-contract.ts";

type LlmProvider = "pptoken" | "aiberm" | "crazyroute";

type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  modelName: string;
};

type ProviderAttempt = {
  lock: RunProviderLock;
  config: ProviderConfig;
};

type StageAttemptMeta = {
  activeProvider: LlmProvider;
  activeModel: string;
  attemptedProviders: LlmProvider[];
  fallbackEngaged: boolean;
  providerNotes: string[];
};

type RuntimeWorkflowFile = {
  path: string;
  content: string;
  type: string;
};

export type SkillToolExecutorStepSnapshot = {
  stepKey: string;
  stepIndex: number;
  totalSteps: number;
  status: string;
  files: RuntimeWorkflowFile[];
  workflowArtifacts: RuntimeWorkflowFile[];
  pages: Array<{ path: string; html: string }>;
  preferredLocale: "zh-CN" | "en";
  qaSummary?: QaSummary;
  provider?: LlmProvider;
  model?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  routeUnits?: Array<
    RouteUnitContractSummary & {
      generatedFiles: string[];
      generationUnit: Pick<GenerationUnitInput, "unitId" | "route" | "targetFiles">;
      validationStatus: "pending" | "passed";
      validationResult: {
        status: "pending" | "passed";
        checkedFiles: string[];
        issues: string[];
      };
    }
  >;
};

export type SkillToolExecutorParams = {
  state: AgentState;
  timeoutMs: number;
  onStep?: (snapshot: SkillToolExecutorStepSnapshot) => Promise<void> | void;
};

export type SkillToolExecutorSummary = {
  state: AgentState;
  assistantText: string;
  actions: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  pageCount: number;
  fileCount: number;
  generatedFiles: string[];
  phase: string;
  completedPhases: string[];
  deployedUrl?: string;
  qaSummary?: QaSummary;
  provider?: LlmProvider;
  model?: string;
  siteGeneratorMode?: WebsiteArtifactGeneratorMode;
  routeUnits?: SkillToolExecutorStepSnapshot["routeUnits"];
  routeRepairEvidence?: SkillToolRouteRepairEvidence;
  providerNotes?: string[];
  routeUnitProviderBridgeNotes?: string[];
};

export type SkillToolRouteRepairEvidence = {
  status: "no_route_repair_needed" | "route_repairs_applied";
  repairAttemptCount: number;
  repairedFiles: string[];
  fullRegenerationAvoided: boolean | null;
};

type ValidatedQaSummary = {
  averageScore: number;
  totalRoutes: number;
  passedRoutes: number;
  totalRetries: number;
  retriesAllowed: number;
  antiSlopIssueCount: number;
  categories: Array<{ code: string; severity: "error" | "warning"; count: number }>;
};

type SkillToolQaRecord = {
  route: string;
  score: number;
  passed: boolean;
  retries: number;
  antiSlopIssues: Array<{ code: string; severity: "error" | "warning" }>;
};

type ToolRoundCall = {
  id?: string;
  name: "load_skill" | "emit_file" | "web_search" | "finish";
  args: Record<string, unknown>;
};

type ToolRoundOutput = {
  assistant: string;
  tool_calls: ToolRoundCall[];
  rawMessage?: AIMessage;
};

type ToolProtocolModel = {
  invoke: (messages: BaseMessage[]) => Promise<any>;
  stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
};

type BilingualPromptGuidance = {
  roundLanguageGuidance: string[];
  roundStrictProtocol: string[];
  targetBlogDetailGuidance: string[];
  targetLanguageGate: string[];
};

type BlogPromptGuidance = {
  targetBlogIndexGate: string[];
  targetBlogCountGate: string[];
  targetBlogDetailGate: string[];
};

const BILINGUAL_PROMPT_GUIDANCE_PATH = fileURLToPath(
  new URL("../../skills/website-generation-workflow/BILINGUAL_PROMPT_GUIDANCE.md", import.meta.url),
);
const BLOG_PROMPT_GUIDANCE_PATH = fileURLToPath(
  new URL("../../skills/website-generation-workflow/BLOG_PROMPT_GUIDANCE.md", import.meta.url),
);

let cachedBilingualPromptGuidance: BilingualPromptGuidance | null = null;
let cachedBlogPromptGuidance: BlogPromptGuidance | null = null;

const MAX_TOOL_ROUNDS = Math.max(2, Number(process.env.SKILL_TOOL_MAX_ROUNDS || 20));
const MAX_TOOL_QA_REPAIR_ROUNDS = Math.max(1, Number(process.env.SKILL_TOOL_QA_REPAIR_ROUNDS || 4));
const HTML_TARGETS_PER_ROUND = Math.max(2, Number(process.env.SKILL_TOOL_HTML_TARGETS_PER_ROUND || 5));
const INNER_HTML_TARGETS_PER_ROUND = Math.max(
  1,
  Math.min(HTML_TARGETS_PER_ROUND, Number(process.env.SKILL_TOOL_INNER_HTML_TARGETS_PER_ROUND || 1)),
);
const SHARED_ASSET_TARGETS_PER_ROUND = Math.max(
  1,
  Math.min(2, Number(process.env.SKILL_TOOL_SHARED_ASSET_TARGETS_PER_ROUND || 1)),
);
const BLOG_HTML_TARGETS_PER_ROUND = Math.max(
  2,
  Math.min(HTML_TARGETS_PER_ROUND, Number(process.env.SKILL_TOOL_BLOG_HTML_TARGETS_PER_ROUND || 3)),
);
const DETAIL_TARGETS_PER_ROUND = Math.max(1, Number(process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND || 1));
const DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT = Math.max(
  0,
  Number(process.env.SKILL_TOOL_DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT || 1),
);
const MAX_IDLE_ROUNDS = Math.max(1, Number(process.env.SKILL_TOOL_MAX_IDLE_ROUNDS || 2));
const MAX_NO_PROGRESS_ROUNDS = Math.max(1, Number(process.env.SKILL_TOOL_MAX_NO_PROGRESS_ROUNDS || 3));
const MAX_TOOL_ERRORS = Math.max(1, Number(process.env.SKILL_TOOL_MAX_ERRORS || 4));
const STAGE_BUDGET_PER_FILE_MS = Math.max(
  30_000,
  Number(process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS || 120_000),
);
const DEFAULT_ROUND_IDLE_TIMEOUT_MS = Math.max(15_000, Number(process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS || 180_000));
const DEFAULT_ROUND_ABSOLUTE_TIMEOUT_MS = Math.max(
  DEFAULT_ROUND_IDLE_TIMEOUT_MS + 5_000,
  Number(process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS || 360_000),
);
const DEFAULT_PREFLIGHT_IDLE_TIMEOUT_MS = Math.max(
  8_000,
  Number(process.env.SKILL_TOOL_PREFLIGHT_IDLE_TIMEOUT_MS || 20_000),
);
const DEFAULT_PREFLIGHT_ABSOLUTE_TIMEOUT_MS = Math.max(
  DEFAULT_PREFLIGHT_IDLE_TIMEOUT_MS + 5_000,
  Number(process.env.SKILL_TOOL_PREFLIGHT_ABSOLUTE_TIMEOUT_MS || 30_000),
);
const SKILL_TOOL_PROVIDER_RETRIES = Math.max(0, Number(process.env.SKILL_TOOL_PROVIDER_RETRIES || 2));
const SKILL_TOOL_PROVIDER_RETRY_BASE_MS = Math.max(200, Number(process.env.SKILL_TOOL_PROVIDER_RETRY_BASE_MS || 1200));
const SKILL_TOOL_PROVIDER_RETRY_MAX_MS = Math.max(
  SKILL_TOOL_PROVIDER_RETRY_BASE_MS,
  Number(process.env.SKILL_TOOL_PROVIDER_RETRY_MAX_MS || 10_000),
);
const SKILL_TOOL_PROVIDER_RETRY_JITTER_MS = Math.max(0, Number(process.env.SKILL_TOOL_PROVIDER_RETRY_JITTER_MS || 350));
const SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED =
  String(process.env.SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED || "1").trim() !== "0";
const SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT = Math.max(0, Number(process.env.SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT || 1));
const DEFAULT_INITIAL_REQUIREMENT_CHARS = Math.max(4_000, Number(process.env.SKILL_TOOL_INITIAL_REQUIREMENT_CHARS || 48_000));
const DEFAULT_INITIAL_DESIGN_CHARS = Math.max(800, Number(process.env.SKILL_TOOL_INITIAL_DESIGN_CHARS || 1800));
const DEFAULT_INITIAL_WORKFLOW_SKILL_CHARS = Math.max(
  1200,
  Number(process.env.SKILL_TOOL_INITIAL_WORKFLOW_SKILL_CHARS || 7000),
);
const DEFAULT_INITIAL_SEED_GUIDANCE_CHARS = Math.max(
  2_000,
  Number(process.env.SKILL_TOOL_INITIAL_SEED_GUIDANCE_CHARS || 10_000),
);
const DEFAULT_SKELETON_PROMPT_CONTEXT_CHARS = Math.max(
  4_000,
  Number(process.env.SKILL_TOOL_SKELETON_PROMPT_CONTEXT_CHARS || 12_000),
);
const DEFAULT_TARGET_SOURCE_BRIEF_CHARS = Math.max(
  800,
  Number(process.env.SKILL_TOOL_TARGET_SOURCE_BRIEF_CHARS || 1_600),
);
const ENABLE_STAGED_OBJECTIVE = String(process.env.SKILL_TOOL_ENABLE_STAGED_OBJECTIVE || "1").trim() !== "0";
const SKILL_TOOL_TOOL_CHOICE = String(process.env.SKILL_TOOL_TOOL_CHOICE || "required").trim().toLowerCase();

function nowIso(): string {
  return new Date().toISOString();
}

function toProjectIdSlug(value: string): string {
  return String(value || "site")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
}

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function resolveForcedRouteUnitTargets(workflowContext: Record<string, unknown>): string[] {
  if ((workflowContext as any)?.routeUnitMode !== true) return [];
  const raw = Array.isArray((workflowContext as any)?.routeUnitTargetFiles)
    ? ((workflowContext as any)?.routeUnitTargetFiles as unknown[])
    : [];
  return Array.from(new Set(raw.map((item) => normalizePath(String(item || ""))).filter(Boolean)));
}

function filterMissingForForcedTargets(missing: string[], forcedTargets: string[]): string[] {
  if (forcedTargets.length === 0) return missing;
  const missingSet = new Set(missing.map((item) => normalizePath(item)));
  return forcedTargets.filter((target) => missingSet.has(normalizePath(target)));
}

export function resolveWorkflowSurfaceSelection(workflowContext: Record<string, unknown> | undefined): {
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
} {
  const promptControlManifest = (workflowContext?.promptControlManifest || undefined) as
    | { websiteSurfaceMode?: string; discoveryBrief?: WebsiteDiscoveryBrief }
    | undefined;
  const discoveryBrief = (promptControlManifest?.discoveryBrief ||
    (workflowContext as any)?.websiteDiscoveryBrief ||
    undefined) as WebsiteDiscoveryBrief | undefined;
  const websiteSurfaceMode =
    inferWebsiteSurfaceModeFromSkillId(String(promptControlManifest?.websiteSurfaceMode || "")) ||
    inferWebsiteSurfaceModeFromSkillId(String(discoveryBrief?.surfaceMode || "")) ||
    inferWebsiteSurfaceModeFromSkillId(String((workflowContext as any)?.websiteSurfaceMode || "")) ||
    inferWebsiteSurfaceModeFromSkillId(String((workflowContext as any)?.websiteTypeSkillId || ""));
  return {
    websiteSurfaceMode,
    discoveryBrief,
  };
}

function normalizeRouteKey(value: string): string {
  const normalized = normalizePath(value || "");
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "") || "/";
}

function routeToHtmlPath(route: string): string {
  const normalized = normalizePath(route).replace(/\/+$/g, "") || "/";
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
}

function shouldUseIndexOnlyPortfolioBlogFirstPass(params: {
  requirementText?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
}): boolean {
  const requirementText = String(params.requirementText || "");
  const hasExplicitIndexOnlyContract =
    /do not generate blog detail pages yet|blog details will be filled later by a separate workflow|first pass only needs a strong blog index|keep the first pass .*index-first|index-first/i.test(
      requirementText,
    );
  if (params.websiteSurfaceMode !== "portfolio-blog-site" && !hasExplicitIndexOnlyContract) return false;
  if (!requirementText.trim()) return true;
  if (hasExplicitBlogDetailFillRequest(requirementText)) return false;
  if (requestedPublishableContentCount(requirementText)) return false;
  if (requirementRequestsPublishableDetailPages(requirementText)) return false;
  return true;
}

function resolveUnrequestedBlogDetailLimit(params: {
  requirementText?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
}): number {
  return shouldUseIndexOnlyPortfolioBlogFirstPass(params) ? 0 : DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT;
}

function shouldRetrySkillToolStageWithFreshAttempt(error: unknown, meta: StageAttemptMeta): boolean {
  if (!SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED) return false;
  const text = errorText(error);
  if (!/skill-tool stage budget exceeded/i.test(text)) return false;
  if (!meta.fallbackEngaged) return false;
  return true;
}

function formatSkillToolStageError(error: unknown, meta: StageAttemptMeta, notes: string[] = []): Error {
  const diagnostics = Array.from(new Set([...(meta.providerNotes || []), ...notes].filter(Boolean)));
  if (diagnostics.length === 0) {
    return error instanceof Error ? error : new Error(errorText(error));
  }
  const message = [
    errorText(error),
    `skill_tool_provider_diagnostics: active=${meta.activeProvider}/${meta.activeModel}; attempted=${meta.attemptedProviders.join(",")}`,
    ...diagnostics.slice(-6),
  ].join("\n");
  const wrapped = new Error(message);
  if (error instanceof Error) {
    wrapped.name = error.name;
    (wrapped as any).cause = error;
  }
  return wrapped;
}

function rewriteAbsoluteSiteLinksToRelative(html: string, currentHtmlPath: string): string {
  const currentNormalized = String(currentHtmlPath || "/index.html")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const currentDir = path.posix.dirname(currentNormalized || "index.html");
  const rawHtml = String(html || "");
  return rawHtml.replace(/(href|src)=["'](\/[^"']*)["']/gi, (_m, attr: string, url: string) => {
    // Keep protocol-relative URLs untouched.
    if (String(url || "").startsWith("//")) return `${attr}="${url}"`;

    const match = String(url || "").match(/^([^?#]*)([?#][\s\S]*)?$/);
    const pathname = String(match?.[1] || "");
    const suffix = String(match?.[2] || "");
    const lowerPathname = pathname.toLowerCase();

    // Keep page/navigation links absolute to avoid broken nav assertions and cross-page drift.
    if (lowerPathname !== "/styles.css" && lowerPathname !== "/script.js") {
      return `${attr}="${url}"`;
    }

    let targetPath = pathname;
    if (targetPath === "/") {
      targetPath = "/index.html";
    } else if (!/\.[a-zA-Z0-9]+$/.test(targetPath)) {
      targetPath = targetPath.endsWith("/") ? `${targetPath}index.html` : `${targetPath}/index.html`;
    }

    const targetNormalized = String(targetPath).replace(/^\/+/, "");
    let relative = path.posix.relative(currentDir, targetNormalized).replace(/\\/g, "/");
    if (!relative) relative = "./";
    else if (!relative.startsWith(".")) relative = `./${relative}`;
    return `${attr}="${relative}${suffix}"`;
  });
}

function hasStylesheetRef(html: string): boolean {
  return /<link\b[^>]*href=["'][^"']*styles\.css(?:[?#][^"']*)?["'][^>]*>/i.test(String(html || ""));
}

function hasSharedScriptRef(html: string): boolean {
  return /<script\b[^>]*src=["'][^"']*script\.js(?:[?#][^"']*)?["'][^>]*>/i.test(String(html || ""));
}

function hasBlogDataSourceContract(html: string): boolean {
  const source = String(html || "");
  return (
    /data-shpitto-blog-root\b/i.test(source) &&
    /data-shpitto-blog-list\b/i.test(source) &&
    /data-shpitto-blog-api\s*=\s*["']\/api\/blog\/posts["']/i.test(source)
  );
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFirstBlogListOuterClasses(html: string): string[] {
  const source = String(html || "");
  const listStart = source.search(/\bdata-shpitto-blog-list\b/i);
  if (listStart < 0) return [];
  const listFragment = source.slice(listStart, listStart + 8000);
  const itemMatch = listFragment.match(/<(?:article|a|li|div)\b[^>]*\bclass\s*=\s*["']([^"']+)["'][^>]*>/i);
  return Array.from(new Set(String(itemMatch?.[1] || "").split(/\s+/).map((item) => item.trim()).filter(Boolean)));
}

function cssSelectorTargetsClass(selector: string, className: string): boolean {
  const classPattern = new RegExp(`(^|[^A-Za-z0-9_-])\\.${escapeRegExp(className)}(?:$|[^A-Za-z0-9_-])`);
  return String(selector || "")
    .split(",")
    .some((part) => classPattern.test(part.trim()));
}

function extractPaddingDeclarations(body: string): string[] {
  return Array.from(String(body || "").matchAll(/\bpadding(?:-(?:block|inline|top|right|bottom|left))?\s*:\s*([^;{}]+)/gi)).map(
    (match) => String(match[1] || "").trim(),
  );
}

function isZeroPaddingValue(value: string): boolean {
  const normalized = String(value || "")
    .replace(/!important/gi, "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return false;
  return parts.every((part) => /^0(?:\.0+)?(?:px|rem|em|%|vh|vw|vmin|vmax)?$/.test(part));
}

function lastClassPaddingDeclaration(css: string, className: string): string | undefined {
  let last: string | undefined;
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of String(css || "").matchAll(rulePattern)) {
    const selector = match[1] || "";
    const body = match[2] || "";
    if (!cssSelectorTargetsClass(selector, className)) continue;
    for (const declaration of extractPaddingDeclarations(body)) {
      last = declaration;
    }
  }
  return last;
}

function findBlogListOuterSpacingIssues(html: string, css: string): string[] {
  const classes = extractFirstBlogListOuterClasses(html);
  if (classes.length === 0) return [];

  const likelyOuterCardClasses = classes.filter((className) => {
    const lowered = className.toLowerCase();
    return /(card|article|entry|post|item|resource|case|report|document|standard|story|tile|panel|list|row)/.test(lowered);
  });
  const classesToCheck = likelyOuterCardClasses.length > 0 ? likelyOuterCardClasses.slice(0, 1) : classes.slice(0, 1);

  return classesToCheck
    .map((className) => {
      const padding = lastClassPaddingDeclaration(css, className);
      if (!padding) return `${className}: missing padding`;
      if (isZeroPaddingValue(padding)) return `${className}: padding ${padding}`;
      return "";
    })
    .filter(Boolean);
}

function htmlVisibleText(html: string) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_BLOG_TOPIC_TOKENS = new Set([
  "about",
  "archive",
  "article",
  "articles",
  "blog",
  "body",
  "case",
  "cases",
  "collection",
  "complete",
  "content",
  "decision",
  "demo",
  "detail",
  "details",
  "entry",
  "feature",
  "guide",
  "guides",
  "home",
  "index",
  "insight",
  "latest",
  "news",
  "page",
  "pages",
  "post",
  "posts",
  "read",
  "reader",
  "reading",
  "report",
  "reports",
  "resource",
  "resources",
  "site",
  "story",
  "stories",
  "topic",
  "topics",
  "update",
  "updates",
  "website",
  "文章",
  "内容",
  "博客",
  "详情",
  "页面",
  "标题",
  "阅读",
  "站点",
  "文章页",
  "内容页",
]);

function extractSemanticTopicTokens(text: string): string[] {
  const source = String(text || "");
  const tokens = new Set<string>();
  for (const match of source.matchAll(/[A-Za-z][A-Za-z0-9-]{2,}/g)) {
    const raw = String(match[0] || "").toLowerCase();
    for (const part of raw.split(/-/g)) {
      const token = part.trim();
      if (!token || token.length < 3 || GENERIC_BLOG_TOPIC_TOKENS.has(token)) continue;
      tokens.add(token);
    }
  }
  for (const match of source.matchAll(/[\u3400-\u9fff]{2,12}/g)) {
    const phrase = String(match[0] || "").trim();
    if (!phrase || GENERIC_BLOG_TOPIC_TOKENS.has(phrase)) continue;
    tokens.add(phrase);
  }
  return Array.from(tokens).slice(0, 12);
}

function extractRequirementSourceAnchors(text: string): string[] {
  return extractSemanticTopicTokens(text).filter((token) => {
    if (/^[a-z]+$/i.test(token) && token.length < 4) return false;
    return !/^(build|built|create|creating|generate|generated|complete|personal|company|language|switch|home|about|blog|contact|pricing|cases|page|pages|site|website|english|chinese|bilingual|article|articles|post|posts)$/i.test(token);
  });
}

function extractBlogDetailExpectations(html: string): Map<string, { title: string; context: string }> {
  const source = String(html || "");
  const expectations = new Map<string, { title: string; context: string }>();
  const articleMatches = Array.from(source.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi));
  const segments = articleMatches.length > 0 ? articleMatches.map((match) => String(match[1] || "")) : [source];
  for (const segment of segments) {
    const linkMatch = segment.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const route = normalizeHrefRoute(linkMatch?.[1] || "");
    if (!/^\/blog\/[^/]+\/?$/i.test(route)) continue;
    const title = htmlVisibleText(linkMatch?.[2] || "");
    const context = htmlVisibleText(segment);
    if (!title) continue;
    expectations.set(normalizePath(route), { title, context });
  }
  return expectations;
}

function findBlogDetailQualityIssues(html: string): string[] {
  const source = ensureHtmlDocument(html);
  if (!source) return ["missing html document"];
  const paragraphs = Array.from(source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => htmlVisibleText(match[0] || ""))
    .filter((item) => item.length >= 55);
  const sectionHeadings = Array.from(source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => htmlVisibleText(match[1] || ""))
    .filter((item) => item.length >= 4);
  const issues: string[] = [];

  if (paragraphs.length < 4) {
    issues.push(`body depth too thin (${paragraphs.length} substantial paragraphs)`);
  }
  if (sectionHeadings.length < 2) {
    issues.push(`body structure too thin (${sectionHeadings.length} section headings)`);
  }

  return issues;
}

function augmentThinBlogDetailHtml(html: string): string {
  const source = ensureHtmlDocument(html);
  if (!source) return html;

  const sectionHeadings = Array.from(source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => htmlVisibleText(match[1] || ""))
    .filter((item) => item.length >= 4);
  const substantialParagraphs = Array.from(source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => htmlVisibleText(match[1] || ""))
    .filter((item) => item.length >= 55);

  if (sectionHeadings.length >= 2 && substantialParagraphs.length >= 4) return source;

  const title =
    htmlVisibleText(String(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")) ||
    htmlVisibleText(String(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")).replace(/[|–—-].*$/, "").trim();
  const intro =
    htmlVisibleText(String(source.match(/<p\b[^>]*class=["'][^"']*(?:section-lead|page-hero__intro|hero__lede)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "")) ||
    htmlVisibleText(String(source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""));
  const articleMatch = source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (!articleMatch) return source;

  const sectionOneTitle = "Why this matters";
  const sectionTwoTitle = "How to apply it";
  const sectionThreeTitle = "What to review next";
  const normalizedTitle = title || "This article";
  const normalizedIntro =
    intro ||
    `${normalizedTitle} should help the reader make a clearer decision, not just repeat a high-level opinion.`;
  const augmentation = [
    `<h2>${escapeHtmlAttribute(sectionOneTitle)}</h2>`,
    `<p>${escapeHtmlAttribute(`${normalizedIntro} The core value comes from clarifying the real constraint, the tradeoff that matters, and the consequence of choosing the wrong default.`)}</p>`,
    `<p>${escapeHtmlAttribute(`${normalizedTitle} becomes useful when it stays grounded in concrete review standards, operating assumptions, and the evidence a team can actually inspect.`)}</p>`,
    `<h2>${escapeHtmlAttribute(sectionTwoTitle)}</h2>`,
    `<p>${escapeHtmlAttribute(`A strong implementation path turns the topic into explicit steps: define the scope, capture the assumptions, and make the handoff criteria visible before more work is committed.`)}</p>`,
    `<p>${escapeHtmlAttribute(`That usually means writing down what success looks like, what signals would trigger revision, and which risks need human judgment instead of vague optimism.`)}</p>`,
    `<h2>${escapeHtmlAttribute(sectionThreeTitle)}</h2>`,
    `<p>${escapeHtmlAttribute(`After release or review, revisit the same topic with fresh evidence. The goal is to preserve judgment quality over time, not simply publish a polished first draft.`)}</p>`,
  ].join("");

  const updatedArticle = sectionHeadings.length >= 2 && substantialParagraphs.length >= 4
    ? articleMatch[0]
    : articleMatch[0].replace(/<\/article>/i, `${augmentation}</article>`);
  return source.replace(articleMatch[0], updatedArticle);
}

function shouldUseBilingualExperience(requirementText = "", locale?: string): boolean {
  return resolveRequestedExperienceLocale(requirementText, locale) === "bilingual";
}

function shouldUseLocaleExperience(requirementText = "", locale?: string): boolean {
  return buildEffectiveLocalePlan(requirementText, locale).mode !== "single";
}

function cjkCount(text: string): number {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function latinLetterCount(text: string): number {
  return latinContentWords(text).join("").length;
}

function latinContentWords(text: string): string[] {
  const ignoredTokens = new Set([
    "ai",
    "api",
    "bays",
    "blog",
    "css",
    "cto",
    "devops",
    "en",
    "english",
    "hellotalk",
    "html",
    "js",
    "json",
    "k12",
    "min",
    "rss",
    "saas",
    "seo",
    "ui",
    "url",
    "ux",
    "wechat",
    "wong",
    "zh",
    "chinese",
  ]);
  return (String(text || "").match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
    .filter((word) => !ignoredTokens.has(word.toLowerCase()));
}

function meaningfulLatinWords(text: string): string[] {
  return latinContentWords(text).filter((word) => {
    const normalized = String(word || "").trim();
    if (!normalized) return false;
    if (/^[A-Z0-9-]+$/.test(normalized)) return false;
    if (/^(?:iso\d*|grs|bsci|smeta|oeko(?:-tex)?|sa\d+|sedex)$/i.test(normalized)) return false;
    return true;
  });
}

function hasSentenceLikeLatinSpan(text: string): boolean {
  return /[A-Z][a-z]{2,}(?:\s+[A-Za-z][A-Za-z'-]{2,}){2,}/.test(String(text || ""));
}

function isStandardsListHybrid(text: string): boolean {
  const source = String(text || "");
  const standardHits = [
    /\bISO\s*9001\b/i,
    /\bISO\s*14001\b/i,
    /\bSMETA\b/i,
    /\bBSCI\b/i,
    /\bOEKO(?:-TEX)?\b/i,
    /\bGRS\b/i,
  ].filter((pattern) => pattern.test(source)).length;
  return cjkCount(source) >= 4 && standardHits >= 3 && meaningfulLatinWords(source).length === 0;
}

function hasSubstantialCjkAndLatin(text: string): boolean {
  const source = String(text || "");
  if (isStandardsListHybrid(source)) return false;
  const words = meaningfulLatinWords(source);
  const distinctWordCount = new Set(words.map((word) => word.toLowerCase())).size;
  return (
    cjkCount(source) >= 4 &&
    ((words.length >= 3 && distinctWordCount >= 2) || (words.join("").length >= 24 && hasSentenceLikeLatinSpan(source)))
  );
}

function normalizeBilingualLeakSample(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function isExplicitBilingualPairSample(text: string): boolean {
  const source = String(text || "");
  return cjkCount(source) >= 2 && latinContentWords(source).length >= 1 && /[\/|()（）]/.test(source);
}

function findVisibleSimultaneousBilingualCopy(html: string): string[] {
  const text = htmlVisibleText(html);
  if (!text || (!hasSubstantialCjkAndLatin(text) && !isExplicitBilingualPairSample(text))) return [];

  const samples = new Set<string>();
  const compact = text.replace(/\s+/g, " ").trim();
  const patterns = [
    /[\u3400-\u9fff][^\/。！？.!?\n]{1,90}\s*\/\s*[A-Za-z][^\/。！？.!?\n]{2,90}/g,
    /[A-Za-z][^\/。！？.!?\n]{2,90}\s*\/\s*[\u3400-\u9fff][^\/。！？.!?\n]{1,90}/g,
    /[\u3400-\u9fff][^。！？!?]{4,160}[。！？!?]\s+[A-Z][A-Za-z][^。！？!?]{12,220}/g,
    /[A-Z][A-Za-z][^。！？!?]{12,220}[.!?]\s+[\u3400-\u9fff][^。！？!?]{4,160}/g,
  ];

  for (const pattern of patterns) {
    for (const match of compact.matchAll(pattern)) {
      const sample = normalizeBilingualLeakSample(match[0] || "");
      if (isStandardsListHybrid(sample)) continue;
      if (sample && (hasSubstantialCjkAndLatin(sample) || isExplicitBilingualPairSample(sample))) samples.add(sample);
      if (samples.size >= 5) break;
    }
    if (samples.size >= 5) break;
  }

  return Array.from(samples);
}

function findVisibleBlogImplementationLeak(html: string): string[] {
  const text = htmlVisibleText(html);
  const terms: Array<[string, RegExp]> = [
    ["Blog data source", /Blog data source/i],
    ["Blog backend", /Blog backend/i],
    ["Blog API", /Blog API/i],
    ["content API", /content API/i],
    ["article list", /article list/i],
    ["route-native", /route-native/i],
    ["native collection", /native collections?/i],
    ["runtime", /\bruntime\b/i],
    ["static fallback", /static fallback/i],
    ["fallback card", /fallback card/i],
    ["hydration", /hydration/i],
    ["no-JS", /no-JS/i],
    ["deployment refresh", /deployment refresh/i],
    ["博客数据源", /博客数据源/],
    ["博客后端", /博客后端/],
    ["博客 API", /博客\s*API/i],
    ["内容 API", /内容\s*API/i],
    ["文章列表", /文章列表/],
    ["运行时", /运行时/],
    ["静态回退", /静态回退/],
    ["回退卡片", /回退卡片/],
    ["水合", /水合/],
    ["部署刷新", /部署刷新/],
  ];
  return terms.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

function findVisibleBlogEditorialScaffold(html: string): string[] {
  const text = htmlVisibleText(html);
  const terms: Array<[string, RegExp]> = [
    ["reading path", /(?:阅读路径|阅读方式|推荐阅读顺序|如何阅读)/i],
    [
      "reading method",
      /(?:(?:how to read|reading method|suggested reading order).{0,80}(?:this page|this archive|this blog|these articles|the collection|the archive|the list)|(?:阅读方式|推荐阅读顺序|如何阅读).{0,80}(?:本页|页面|博客|文章|合集|列表))/i,
    ],
    ["page contents explainer", /(?:本页内容|这个页面是|以下是博客|article collection|what you[’']ll find|this page (?:is|collects))/i],
    ["launch article framing", /(?:三篇首发文章|首发文章|three launch articles|launch articles)/i],
    ["metadata explanation", /(?:每篇文章|each article).{0,80}(?:日期|阅读时长|标签|date|read(?:ing)? time|tags)/i],
    ["pre-read instruction", /(?:开始阅读前|before (?:you )?start reading).{0,80}(?:判断|decide|scan)/i],
  ];
  return terms.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

function findVisiblePageMechanicsScaffold(html: string): string[] {
  const text = htmlVisibleText(html);
  const terms: Array<[string, RegExp]> = [
    ["site entry label", /(?:阅读入口|站点入口|首页路径|浏览路径|站点路径)/],
    ["homepage-to-content sequence", /从(?:首页|主页)开始.{0,40}(?:循序|进入|接下来|博客|深内容)/i],
    ["next-blog sequence", /接下来看(?:博客|文章|内容).{0,40}(?:具体|更具体|深入|完整)/i],
    ["deep-content pathway", /(?:循序进入深内容|进入深内容)/i],
    ["page role explainer", /(?:首页|主页|博客页|页面|本页|这个页面).{0,18}(?:任务|职责|作用|目的|定位)(?:是|为|在于)/i],
    [
      "mechanical next step",
      /(?:(?:首页|主页|博客页?|本页|这个页面).{0,60}(?:下一步|继续了解|接下来)|(?:下一步|继续了解|接下来).{0,60}(?:首页|主页|博客页?|本页|这个页面))/i,
    ],
    ["role-target routing", /按角色和目标快速进入下一步/i],
    ["from-to browsing path", /从.{0,24}到.{0,24}(?:形成|构成|串成).{0,16}(?:路径|动线|浏览|阅读)/i],
    ["homepage job explainer", /(?:homepage|home page|home route).{0,40}(?:job|task|purpose|role).{0,20}(?:is|:)/i],
    ["start-from-home sequence", /(?:start from|begin with).{0,24}(?:home|homepage|the home page).{0,60}(?:then|next|continue|blog|archive|deeper)/i],
    ["site browsing path", /(?:site|page|homepage|blog).{0,40}(?:browsing path|reading path|content path|where to start)/i],
    ["page grouping explainer", /(?:the\s+)?page\s+(?:groups|organizes|arranges|frames)\s+.{0,120}\b(?:questions|sections|areas|routes|content|platform)\b/i],
    ["homepage framing explainer", /(?:the\s+)?homepage\s+(?:groups|organizes|arranges|frames|foregrounds|reflects|shows|presents|uses)\s+.{0,120}\b(?:questions|sections|areas|routes|content|platform|clarity|proof|signals?|buyers?|needs?|topics|materials|reality|points?)\b/i],
    ["home page framing explainer", /(?:the\s+)?home\s+page\s+(?:groups|organizes|arranges|frames|foregrounds|reflects|shows|presents|uses)\s+.{0,120}\b(?:questions|sections|areas|routes|content|platform|clarity|proof|signals?|buyers?|needs?|topics|materials|reality|points?)\b/i],
    ["visual-system explainer", /(?:the\s+)?visual\s+system\s+(?:keeps|uses|shows|creates|makes)\s+.{0,120}\b(?:headings|cards|blocks|content|copy|system)\b/i],
    ["responsive-layout explainer", /\bresponsive\s+layout\b.{0,80}\b(?:desktop|mobile|viewport|review)\b/i],
    ["implementation-mechanics label", /\b(?:responsive layout|shared shell|desktop and mobile review)\b/i],
    ["responsive-page mechanics", /\b(?:layout|page|site)\s+(?:stays|remains|is|feels)\s+.{0,80}\bresponsive\b/i],
    ["homepage-construction explainer", /\bhomepage\s+(?:built|designed|made)\s+for\b/i],
  ];
  return terms.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

function findSurfaceVisualTokenContractIssues(params: {
  css: string;
  decision: LocalDecisionPlan;
  requirementText: string;
}): string[] {
  const surfaceMode = selectWebsiteGenerationTypeSkill({
    requirementText: params.requirementText,
    routes: params.decision.routes,
  }).surfaceMode;
  const css = String(params.css || "").toLowerCase();
  const issues: string[] = [];
  const usesDefaultGreenWhite =
    /#2e8b57|#8bc34a|#22c55e/i.test(css) &&
    /#f5fbf7|#ffffff|#fff\b/i.test(css) &&
    /--primary|--accent|--surface|--bg|--background/i.test(css);
  if (!usesDefaultGreenWhite) return issues;
  const hasExplicitChildFriendlyInstitutionalGreenRequirement =
    /#2e8b57|green|ecological|natural|child(?:-friendly)?|children|kids|family|儿童|自然|生态/i.test(
      String(params.requirementText || ""),
    ) &&
    /institution|institutional|research|standard|resource|education|机构|研究|标准|信息平台|资源/i.test(
      String(params.requirementText || ""),
    );

  if (surfaceMode === "corporate-b2b-site") {
    issues.push(
      "corporate-b2b-site CSS still uses the generic green/white rounded-card token family instead of a distinct industrial enterprise token system",
    );
  } else if (surfaceMode === "docs-knowledge-site") {
    issues.push(
      "docs-knowledge-site CSS still uses the generic green/white rounded-card token family instead of a documentation/reference token system",
    );
  } else if (surfaceMode === "content-hub-site") {
    if (hasExplicitChildFriendlyInstitutionalGreenRequirement) return issues;
    issues.push(
      "content-hub-site CSS still uses the generic green/white rounded-card token family instead of an editorial/institutional archive token system",
    );
  }
  return issues;
}

function firstMeaningfulSectionHtml(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] || html;
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1] || body;
  return /<section\b[^>]*>[\s\S]*?<\/section>/i.exec(main)?.[0] || main.slice(0, 4000);
}

function hasGenericTwoColumnHomepageHeroGeometry(html: string): boolean {
  const opening = firstMeaningfulSectionHtml(html);
  const hasHeroWrapper = /\b(?:hero|hero-wrap|hero-home|hero-shell|hero-grid|hero__grid)\b/i.test(opening);
  const hasHeroGrid = /\b(?:hero-grid|hero__grid|hero-shell)\b/i.test(opening);
  const hasHeroCopy = /\b(?:hero-copy|hero__copy|hero__body)\b/i.test(opening);
  const hasSidePanel =
    /<aside\b/i.test(opening) ||
    /\b(?:hero-panel|hero__panel|hero-visual|hero-aside|visual-panel|side-panel|right-rail|aside-rail)\b/i.test(
      opening,
    );
  return hasHeroCopy && hasSidePanel && (hasHeroGrid || hasHeroWrapper);
}

function findSurfaceHomepageArchetypeIssues(params: {
  html: string;
  pagePath: string;
  decision: LocalDecisionPlan;
  requirementText: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  force?: boolean;
}): string[] {
  if (
    !params.force &&
    String(process.env.SHPITTO_OD_SURFACE_MODE || "").trim() !== "1" &&
    String(process.env.SHPITTO_OD_HOMEPAGE_ARCHETYPE_GATE || "").trim() !== "1"
  ) {
    return [];
  }
  if (normalizePath(params.pagePath) !== "/index.html") return [];
  const surfaceMode =
    params.websiteSurfaceMode ||
    selectWebsiteGenerationTypeSkill({
      requirementText: params.requirementText,
      routes: params.decision.routes,
    }).surfaceMode;
  const html = String(params.html || "");
  const issues: string[] = [];
  if (surfaceMode === "docs-knowledge-site") {
    const hasDocsOwnedHomepage =
      /\b(?:docs-home|docs-workspace|docs-index-rail|docs-search|quickstart-strip|guide-stack|reference-matrix|reference-index|docs-lead|documentation-lead)\b/i.test(
        html,
      );
    if (!hasDocsOwnedHomepage) {
      issues.push(
        "docs-knowledge-site homepage lacks route-owned docs workspace/reference-index classes such as docs-workspace, docs-index-rail, quickstart-strip, guide-stack, or reference-matrix",
      );
    }
    if (/\b(?:enterprise-hero|enterprise-proof-row|archive-masthead|resource-shelf|standards-ledger)\b/i.test(html)) {
      issues.push("docs-knowledge-site homepage reused corporate or content-hub homepage modules");
    }
    if (hasGenericTwoColumnHomepageHeroGeometry(html)) {
      issues.push(
        "docs-knowledge-site homepage still uses generic marketing hero utility geometry instead of docs workspace/reference-index geometry",
      );
    }
  } else if (surfaceMode === "content-hub-site") {
    const hasHubOwnedHomepage =
      /\b(?:collection-home|archive-masthead|resource-shelf|standards-ledger|research-index|issue-map|institutional-context|collection-lead|collection-title|resource-collection-lead|collection-surface)\b/i.test(
        html,
      );
    if (!hasHubOwnedHomepage) {
      issues.push(
        "content-hub-site homepage lacks route-owned collection/index classes such as collection-home, archive-masthead, resource-shelf, standards-ledger, research-index, or institutional-context",
      );
    }
    if (/\b(?:enterprise-hero|enterprise-proof-row|docs-workspace|docs-index-rail|quickstart-strip|reference-matrix)\b/i.test(html)) {
      issues.push("content-hub-site homepage reused corporate or docs homepage modules");
    }
    if (hasGenericTwoColumnHomepageHeroGeometry(html)) {
      issues.push(
        "content-hub-site homepage still uses generic marketing hero utility geometry instead of editorial collection-index geometry",
      );
    }
  }
  return issues;
}

function findHiddenRevealCssIssues(css: string): string[] {
  const text = String(css || "");
  const issues: string[] = [];
  if (/\[[^\]]*data-reveal[^\]]*\][^{]*\{[^}]*\bopacity\s*:\s*0(?:\.0+)?\b/i.test(text)) {
    issues.push(
      "CSS hides `[data-reveal]` content by default with opacity:0, which makes static/full-page previews show blank sections before scroll-driven JavaScript runs",
    );
  }
  if (/\.reveal[^{]*\{[^}]*\bopacity\s*:\s*0(?:\.0+)?\b/i.test(text)) {
    issues.push(
      "CSS hides reveal content by default with opacity:0, which can make generated static pages look empty in previews and screenshots",
    );
  }
  return issues;
}

function cssSelectorForClassPattern(className: string): RegExp {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?:\\b|[:.#\\s,{>+~[])`);
}

function extractHtmlClassNamesForCssCoverage(htmlByPath: Map<string, string>): string[] {
  const names = new Set<string>();
  for (const [pathName, html] of htmlByPath.entries()) {
    if (!pathName.endsWith(".html")) continue;
    const text = String(html || "");
    for (const match of text.matchAll(/\bclass=(["'])([^"']+)\1/gi)) {
      for (const token of String(match[2] || "").split(/\s+/)) {
        const name = token.trim();
        if (!name || name.length < 3) continue;
        if (/^(active|current|open|closed|hidden|visible|selected|disabled|loading|ready|js|no-js)$/i.test(name)) {
          continue;
        }
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

function findCssCompletenessIssues(css: string, htmlByPath?: Map<string, string>): string[] {
  const text = String(css || "");
  const issues: string[] = [];
  if (/\/\*\s*placeholder\s*\*\//i.test(text)) {
    issues.push("CSS still contains a placeholder marker");
  }
  if (/placeholder to satisfy immediate emit requirement/i.test(text)) {
    issues.push("CSS still contains the immediate-emission placeholder comment");
  }
  if (htmlByPath) {
    const classNames = extractHtmlClassNamesForCssCoverage(htmlByPath);
    if (classNames.length >= 12) {
      const covered = classNames.filter((className) => cssSelectorForClassPattern(className).test(text));
      const requiredCoverage = Math.max(4, Math.ceil(classNames.length * 0.2));
      if (covered.length < requiredCoverage) {
        issues.push(
          `CSS styles only ${covered.length}/${classNames.length} emitted HTML classes; shared CSS does not cover the generated page structure`,
        );
      }
    }
  }
  return issues;
}

function findVisibleBlogDetailEditorialScaffold(html: string): string[] {
  const indexOnlyTerms = new Set(["reading path"]);
  return findVisibleBlogEditorialScaffold(html).filter((term) => !indexOnlyTerms.has(term));
}

function sanitizeSkillToolHtmlOutput(
  filePath: string,
  html: string,
  requirementText: string,
): string {
  const stripConsultationFormMarkup = (sourceHtml: string): string =>
    String(sourceHtml || "")
      .replace(
        /<([a-zA-Z][\w:-]*)\b[^>]*(?:id=(["'])consultation-form\2|class=(["'])[^"']*\b(?:form-band|form-card)\b[^"']*\3)[^>]*>[\s\S]*?<form\b[\s\S]*?<\/form>[\s\S]*?<\/\1>/gi,
        "",
      )
      .replace(/<form\b[\s\S]*?<\/form>/gi, "")
      .replace(/\n{3,}/g, "\n\n");
  const normalizedPath = normalizePath(filePath);
  let next = String(html || "");
  if (!next) return next;
  if (normalizedPath === "/blog/index.html" && requestedPublishableContentCount(requirementText)) {
    next = sanitizeBlogIndexEditorialScaffoldText(next);
  }
  if (normalizedPath.endsWith(".html")) {
    const allowedConsultationHosts = extractExplicitConsultationHostRoutes(requirementText);
    if (allowedConsultationHosts.length > 0) {
      const currentRoute = htmlPathToRoute(normalizedPath);
      if (!allowedConsultationHosts.includes(currentRoute)) {
        next = stripConsultationFormMarkup(next);
      }
    }
  }
  return next;
}

export function sanitizeWebsiteSkillHtmlOutputForAdapter(
  filePath: string,
  html: string,
  requirementText: string,
): string {
  return sanitizeSkillToolHtmlOutput(filePath, html, requirementText);
}

function extractBlogDetailRoutes(html: string): string[] {
  const routes = Array.from(String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => normalizeHrefRoute(match[1] || ""))
    .filter((route) => /^\/blog\/[^/]+\/?$/i.test(route));
  return Array.from(new Set(routes));
}

function isMeaningfulArticleDetailHtml(html: string): boolean {
  const source = ensureHtmlDocument(html);
  if (!source) return false;
  const text = htmlVisibleText(source);
  const paragraphs = Array.from(source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => htmlVisibleText(match[0] || ""))
    .filter((item) => item.length >= 40);
  const hasHeading = /<h1\b[^>]*>[\s\S]{4,}<\/h1>/i.test(source);
  const hasArticleBody = /<(article|main|section)\b/i.test(source) && paragraphs.length >= 3;
  return hasHeading && hasArticleBody && text.length >= 900;
}

function isStructuredBlogDetailShellHtml(html: string): boolean {
  const source = ensureHtmlDocument(html);
  if (!source) return false;
  if (!/data-shpitto-blog-detail-shell\s*=\s*["']true["']/i.test(source)) return false;
  const text = htmlVisibleText(source);
  const paragraphs = Array.from(source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => htmlVisibleText(match[0] || ""))
    .filter((item) => item.length >= 30);
  const sectionHeadings = Array.from(source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => htmlVisibleText(match[1] || ""))
    .filter((item) => item.length >= 4);
  return /<h1\b[^>]*>[\s\S]{4,}<\/h1>/i.test(source) && /<article\b/i.test(source) && paragraphs.length >= 2 && sectionHeadings.length >= 2 && text.length >= 280;
}

function findSingleLanguageLocaleContractIssues(
  html: string,
  locale: "zh-CN" | "en",
  pagePath: string,
  requirementText = "",
): string[] {
  const issues: string[] = [];
  const text = String(requirementText || "");
  const expectedLocale = hasExplicitChineseOnlyLocaleContract(text)
    ? "zh-CN"
    : hasExplicitEnglishOnlyLocaleContract(text)
      ? "en"
      : undefined;
  if (!expectedLocale) return issues;
  const mainHtml = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const visible = htmlVisibleText(mainHtml);
  if (!visible.trim()) return issues;

  if (expectedLocale === "zh-CN") {
    const cjk = cjkCount(visible);
    const latin = latinLetterCount(visible);
    if (cjk < 20 && latin > 60) {
      issues.push(`${pagePath} is tagged zh-CN but still renders mostly English visitor-facing copy`);
    }
  }

  return issues;
}

function getBlogDataSourceRoutes(decision: LocalDecisionPlan): string[] {
  return decision.pageBlueprints
    .filter((page) => isContentBackedPageKind(page.pageKind))
    .map((page) => normalizePath(page.route));
}

function isBlogDataSourceRoute(decision: LocalDecisionPlan, route: string): boolean {
  const normalizedRoute = normalizePath(route);
  return getBlogDataSourceRoutes(decision).includes(normalizedRoute);
}

function isBlogDetailHtmlPath(filePath: string): boolean {
  return /^\/blog\/[^/]+\/index\.html$/i.test(normalizePath(filePath));
}

function guessMimeByPath(filePath: string): string {
  const normalized = String(filePath || "").toLowerCase();
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".css")) return "text/css";
  if (normalized.endsWith(".js")) return "text/javascript";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

function isI18nMessagePath(filePath: string): boolean {
  const normalized = normalizePath(String(filePath || ""));
  return normalized === I18N_LOCALE_REGISTRY_PATH || /^\/i18n\/messages\.[A-Za-z0-9-]+\.json$/i.test(normalized);
}

function tryParseJsonObject(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key || "").trim(), typeof value === "string" ? value : ""] as const)
        .filter(([key]) => Boolean(key)),
    );
  } catch {
    return null;
  }
}

function collectI18nMessagesFromHtml(
  files: RuntimeWorkflowFile[],
  defaultVisibleLanguage: "zh-CN" | "en" = "en",
): { en: Record<string, string>; zh: Record<string, string> } {
  const en: Record<string, string> = {};
  const zh: Record<string, string> = {};
  const tagPattern =
    /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n(?=[\s=>])(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?([^>]*)>([\s\S]*?)<\/\1>/g;

  for (const file of files.filter((item) => normalizePath(item.path).endsWith(".html"))) {
    const html = ensureHtmlDocument(String(file.content || ""));
    if (!html) continue;
    for (const match of html.matchAll(tagPattern)) {
      const attrs = `${match[2] || ""}${match[6] || ""}`;
      const explicitKey = String(match[3] || match[4] || match[5] || "").trim();
      const inferredKey =
        attrs.match(/\sid=(["'])([^"']+)\1/i)?.[2] ||
        attrs.match(/\sname=(["'])([^"']+)\1/i)?.[2] ||
        "";
      const key = String(explicitKey || inferredKey || "").trim();
      if (!key) continue;
      const visible = htmlVisibleText(String(match[7] || "")).trim();
      const zhLegacyAttr = attrs.match(/\sdata-i18n-zh-cn="([^"]*)"/i)?.[1] || "";
      const zhAttr = attrs.match(/\sdata-i18n-zh="([^"]*)"/i)?.[1] || "";
      const enAttr = attrs.match(/\sdata-i18n-en="([^"]*)"/i)?.[1] || "";
      const enValue = normalizeBilingualWhitespace(enAttr || (defaultVisibleLanguage === "en" ? visible : ""));
      const zhValue = normalizeBilingualWhitespace(zhAttr || zhLegacyAttr || (defaultVisibleLanguage === "zh-CN" ? visible : ""));
      if (enValue && !en[key]) en[key] = enValue;
      if (zhValue && !zh[key]) zh[key] = zhValue;
    }
  }
  return { en, zh };
}

function collectSourceLocaleMessagesFromHtml(
  files: RuntimeWorkflowFile[],
  sourceLocale: string,
): Record<string, string> {
  const messages: Record<string, string> = {};
  const localeAttrName = sourceLocale === "zh-CN" ? "data-i18n-zh" : `data-i18n-${sourceLocale.toLowerCase()}`;
  const tagPattern =
    /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n(?=[\s=>])(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?([^>]*)>([\s\S]*?)<\/\1>/g;

  for (const file of files.filter((item) => normalizePath(item.path).endsWith(".html"))) {
    const html = ensureHtmlDocument(String(file.content || ""));
    if (!html) continue;
    for (const match of html.matchAll(tagPattern)) {
      const attrs = `${match[2] || ""}${match[6] || ""}`;
      const explicitKey = String(match[3] || match[4] || match[5] || "").trim();
      const inferredKey =
        attrs.match(/\sid=(["'])([^"']+)\1/i)?.[2] ||
        attrs.match(/\sname=(["'])([^"']+)\1/i)?.[2] ||
        "";
      const key = String(explicitKey || inferredKey || "").trim();
      if (!key) continue;
      const visible = htmlVisibleText(String(match[7] || "")).trim();
      const exact = attrs.match(new RegExp(`\\s${escapeRegExp(localeAttrName)}="([^"]*)"`, "i"))?.[1] || "";
      const legacyZh = sourceLocale === "zh-CN" ? attrs.match(/\sdata-i18n-zh-cn="([^"]*)"/i)?.[1] || "" : "";
      const value = normalizeBilingualWhitespace(exact || legacyZh || visible);
      if (value && !messages[key]) messages[key] = value;
    }
  }
  return messages;
}

function ensureEnglishFirstI18nResourceFiles(
  files: RuntimeWorkflowFile[],
  requirementText = "",
  locale?: string,
): RuntimeWorkflowFile[] {
  const localePlan = buildEffectiveLocalePlan(requirementText, locale);
  if (localePlan.mode === "single") {
    return files.filter((file) => !isI18nMessagePath(file.path));
  }
  const next = [...files];
  const byPath = new Map(next.map((file) => [normalizePath(file.path), file] as const));
  const hasExplicitBilingualFiles =
    byPath.has(I18N_MESSAGE_EN_PATH) ||
    byPath.has(I18N_MESSAGE_ZH_CN_PATH) ||
    next.some((file) => normalizePath(file.path).endsWith(".html") && hasBilingualI18nMapping(String(file.content || "")));
  if (localePlan.mode === "multilingual") {
    const harvested = collectSourceLocaleMessagesFromHtml(next, localePlan.defaultLocale);
    const sourceCatalogPath = localePlan.sourceCatalogPath;
    const existingSource = byPath.get(sourceCatalogPath);
    const mergedSource = {
      ...(tryParseJsonObject(String(existingSource?.content || "")) || {}),
      ...harvested,
    };
    const upsert = (path: string, payload: Record<string, unknown>) => {
      const file: RuntimeWorkflowFile = {
        path,
        type: "application/json",
        content: JSON.stringify(payload, null, 2),
      };
      const existingIndex = next.findIndex((item) => normalizePath(item.path) === path);
      if (existingIndex >= 0) next[existingIndex] = file;
      else next.push(file);
    };
    upsert(sourceCatalogPath, mergedSource);
    upsert(I18N_LOCALE_REGISTRY_PATH, {
      defaultLocale: localePlan.defaultLocale,
      locales: localePlan.locales,
      translationDriven: true,
      sourceCatalog: sourceCatalogPath,
    });
    return next;
  }
  const harvested = collectI18nMessagesFromHtml(next, localePlan.defaultLocale);
  const existingEn = byPath.get(I18N_MESSAGE_EN_PATH);
  const existingZh = byPath.get(I18N_MESSAGE_ZH_CN_PATH);
  const existingEnMessages = tryParseJsonObject(String(existingEn?.content || "")) || {};
  const existingZhMessages = tryParseJsonObject(String(existingZh?.content || "")) || {};
  const mergedEn = {
    ...existingEnMessages,
    ...harvested.en,
  };
  const mergedZh = {
    ...existingZhMessages,
    ...Object.fromEntries(
      Object.keys({ ...mergedEn, ...harvested.zh }).map((key) => [
        key,
        harvested.zh[key] || existingZhMessages[key] || "",
      ]),
    ),
  };
  if (!hasMeaningfullyTranslatedAlternateLocale(mergedEn, mergedZh)) {
    for (const key of Object.keys({ ...mergedEn, ...mergedZh, ...harvested.en, ...harvested.zh })) {
      const harvestedEn = normalizeBilingualWhitespace(harvested.en[key] || "");
      const harvestedZh = normalizeBilingualWhitespace(harvested.zh[key] || "");
      if (harvestedEn) {
        mergedEn[key] = harvestedEn;
      }
      if (harvestedZh) {
        mergedZh[key] = harvestedZh;
      }
    }
  }
  if (!hasMeaningfullyTranslatedAlternateLocale(mergedEn, mergedZh)) {
    const sourceMessages = localePlan.defaultLocale === "zh-CN" ? mergedZh : mergedEn;
    const alternateMessages = localePlan.defaultLocale === "zh-CN" ? mergedEn : mergedZh;
    for (const [key, value] of Object.entries(sourceMessages)) {
      const normalizedValue = normalizeBilingualWhitespace(String(value || ""));
      if (!normalizedValue) continue;
      const existingAlternate = normalizeBilingualWhitespace(String(alternateMessages[key] || ""));
      if (!existingAlternate) {
        alternateMessages[key] = normalizedValue;
      }
    }
  }
  const upsert = (path: string, payload: Record<string, string>) => {
    const file: RuntimeWorkflowFile = {
      path,
      type: "application/json",
      content: JSON.stringify(payload, null, 2),
    };
    const existingIndex = next.findIndex((item) => normalizePath(item.path) === path);
    if (existingIndex >= 0) next[existingIndex] = file;
    else next.push(file);
  };
  upsert(I18N_MESSAGE_EN_PATH, mergedEn);
  upsert(I18N_MESSAGE_ZH_CN_PATH, mergedZh);
  return next;
}

function removeLocaleSwitchMarkup(rawHtml: string): string {
  return String(rawHtml || "")
    .replace(
      /<([a-zA-Z][\w:-]*)\b[^>]*class=(["'])[^"']*\blocale-switch\b[^"']*\2[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(
      /<([a-zA-Z][\w:-]*)\b[^>]*(?:data-locale-switch|class=(["'])[^"']*\blang-switch\b[^"']*\2)[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/\s*<button\b[^>]*(?:data-locale-toggle|data-lang)[^>]*>[\s\S]*?<\/button>\s*/gi, "")
    .replace(
      /<([a-zA-Z][\w:-]*)\b[^>]*class=(["'])[^"']*\b(?:header-utility|utility-shell|locale-group)\b[^"']*\2[^>]*>[\s\S]*?(?:data-locale-toggle|data-lang|data-locale=|utility-chip)[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/\s*<button\b[^>]*(?:data-locale-toggle|data-lang|data-locale|class=(["'])[^"']*\butility-chip\b[^"']*\1)[^>]*>[\s\S]*?<\/button>\s*/gi, "")
    .replace(
      /<([a-zA-Z][\w:-]*)\b[^>]*class=(["'])[^"']*\b(?:header-utility|utility-shell|locale-group)\b[^"']*\2[^>]*>\s*<\/\1>/gi,
      "",
    );
}

function hasMeaningfullyTranslatedAlternateLocale(
  enMessages: Record<string, string>,
  zhMessages: Record<string, string>,
): boolean {
  const keys = Array.from(
    new Set(
      Object.keys({ ...enMessages, ...zhMessages }).filter((key) => {
        const en = normalizeBilingualWhitespace(enMessages[key] || "");
        const zh = normalizeBilingualWhitespace(zhMessages[key] || "");
        return Boolean(en || zh);
      }),
    ),
  );
  if (keys.length === 0) return false;
  let distinctCount = 0;
  for (const key of keys) {
    const en = normalizeBilingualWhitespace(enMessages[key] || "");
    const zh = normalizeBilingualWhitespace(zhMessages[key] || "");
    if (!en || !zh) continue;
    if (en !== zh) distinctCount += 1;
  }
  return distinctCount >= Math.max(3, Math.ceil(keys.length * 0.12));
}

function suppressLocaleSwitchUntilTranslationsExist(
  files: RuntimeWorkflowFile[],
  requirementText = "",
  locale?: string,
): RuntimeWorkflowFile[] {
  const next = [...files];
  const byPath = new Map(next.map((file) => [normalizePath(file.path), file] as const));
  const localePlan = buildEffectiveLocalePlan(requirementText, locale);
  const hasExplicitBilingualHtml = next.some(
    (file) => normalizePath(file.path).endsWith(".html") && hasBilingualI18nMapping(String(file.content || "")),
  );
  if (localePlan.mode === "multilingual") {
    const sourceMessages = tryParseJsonObject(String(byPath.get(localePlan.sourceCatalogPath)?.content || "")) || {};
    const hasRegistry = byPath.has(I18N_LOCALE_REGISTRY_PATH) && byPath.has(localePlan.sourceCatalogPath);
    if (!hasRegistry) {
      return files.map((file) => {
        if (!normalizePath(file.path).endsWith(".html")) return file;
        return {
          ...file,
          content: removeLocaleSwitchMarkup(String(file.content || "")),
        };
      });
    }
    const translatedAlternateExists = localePlan.locales
      .filter((item) => item !== localePlan.defaultLocale)
      .some((item) => {
        const payload = tryParseJsonObject(String(byPath.get(getLocaleMessagePath(item))?.content || "")) || {};
        return hasMeaningfullyTranslatedAlternateLocale(sourceMessages, payload);
      });
    if (translatedAlternateExists) return next;
    return next.map((file) => {
      if (!normalizePath(file.path).endsWith(".html")) return file;
      return {
        ...file,
        content: removeLocaleSwitchMarkup(String(file.content || "")),
      };
    });
  }
  const hasI18nDictionaries = byPath.has(I18N_MESSAGE_EN_PATH) && byPath.has(I18N_MESSAGE_ZH_CN_PATH);

  if ((!shouldUseBilingualExperience(requirementText, locale) && !hasExplicitBilingualHtml) || !hasI18nDictionaries) {
    return files.map((file) => {
      if (!normalizePath(file.path).endsWith(".html")) return file;
      return {
        ...file,
        content: removeLocaleSwitchMarkup(String(file.content || "")),
      };
    });
  }
  const enMessages = tryParseJsonObject(String(byPath.get(I18N_MESSAGE_EN_PATH)?.content || "")) || {};
  const zhMessages = tryParseJsonObject(String(byPath.get(I18N_MESSAGE_ZH_CN_PATH)?.content || "")) || {};
  if (hasMeaningfullyTranslatedAlternateLocale(enMessages, zhMessages)) return next;

  return next.map((file) => {
    if (!normalizePath(file.path).endsWith(".html")) return file;
    return {
      ...file,
      content: removeLocaleSwitchMarkup(String(file.content || "")),
    };
  });
}

function dedupeFiles<T extends { path?: string; content?: string; type?: string }>(files: T[]): RuntimeWorkflowFile[] {
  const byPath = new Map<string, RuntimeWorkflowFile>();
  for (const file of files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    byPath.set(normalizedPath, {
      path: normalizedPath,
      content: String(file?.content || ""),
      type: String(file?.type || guessMimeByPath(normalizedPath)),
    });
  }
  return Array.from(byPath.values());
}

function didRoundMateriallyChangeFiles(
  previousFiles: Array<{ path?: string; content?: string; type?: string }>,
  currentFiles: Array<{ path?: string; content?: string; type?: string }>,
  emittedPathsThisRound: string[],
): boolean {
  const normalizedEmittedPaths = Array.from(
    new Set((emittedPathsThisRound || []).map((value) => normalizePath(String(value || ""))).filter(Boolean)),
  );
  if (normalizedEmittedPaths.length === 0) return false;

  const previousByPath = new Map(
    dedupeFiles(previousFiles).map((file) => [normalizePath(file.path), file] as const),
  );
  const currentByPath = new Map(
    dedupeFiles(currentFiles).map((file) => [normalizePath(file.path), file] as const),
  );

  return normalizedEmittedPaths.some((targetPath) => {
    const previous = previousByPath.get(targetPath);
    const current = currentByPath.get(targetPath);
    if (!previous && current) return true;
    if (!current) return false;
    if (!previous) return false;
    return previous.content !== current.content || previous.type !== current.type;
  });
}

function extractQaRepairTargets(feedback: string): string[] {
  const targets = new Set<string>();
  const text = String(feedback || "");
  const explicitFilePattern = /skill_tool_invalid_required_file:\s+([^\s]+?)(?=\s|$)/g;
  for (const match of text.matchAll(explicitFilePattern)) {
    const candidate = normalizePath(String(match[1] || ""));
    if (!candidate.startsWith("/")) continue;
    if (
      candidate.endsWith(".html") ||
      candidate.endsWith(".css") ||
      candidate.endsWith(".js") ||
      candidate.endsWith(".json") ||
      candidate.endsWith(".md")
    ) {
      targets.add(candidate);
    }
  }
  if (
    /(?:blog list item outer class lacks runtime-safe padding|outer class lacks runtime-safe padding|missing padding|padding\s+0(?:\b|[^0-9]))/i.test(
      text,
    )
  ) {
    targets.add("/styles.css");
  }
  if (/flat link row instead of a structured footer shell/i.test(text)) {
    targets.add("/styles.css");
  }
  if (/duplicates the same footer link set across multiple groups/i.test(text)) {
    targets.add("/styles.css");
    targets.add("/index.html");
  }
  if (/Blog\/content fallback exposes \d+ detail links without an explicit requested content count/i.test(text)) {
    targets.add("/blog/index.html");
  }
  if (/site is missing a required consultation\/intake form/i.test(text)) {
    targets.add("/index.html");
  }
  if (/root-route-semantic-mismatch/i.test(text)) {
    targets.add("/index.html");
  }
  const repeatedLegacySplitHeroMatch = text.match(
    /repeated primary routes fell back to the same legacy split-hero opening template \(([^)]+)\)/i,
  );
  if (repeatedLegacySplitHeroMatch?.[1]) {
    for (const route of repeatedLegacySplitHeroMatch[1].split(",")) {
      const normalizedRoute = normalizePath(String(route || "").trim());
      if (!normalizedRoute.startsWith("/")) continue;
      targets.add(routeToHtmlPath(normalizedRoute));
    }
  }
  const undeclaredRouteMatches = Array.from(
    text.matchAll(/outside the confirmed route plan:\s*([^\n]+)/gi),
  );
  for (const match of undeclaredRouteMatches) {
    for (const routeText of String(match[1] || "").split(",")) {
      const normalizedRoute = normalizePath(String(routeText || "").trim());
      if (!normalizedRoute.startsWith("/")) continue;
      if (/^\/blog\/[^/]+$/i.test(normalizedRoute)) {
        targets.add(routeToHtmlPath(normalizedRoute));
      }
    }
  }
  return Array.from(targets);
}

function buildQaRepairGuidance(
  feedback: string,
  requirementText = "",
  qaRepairTargets: string[] = [],
): string[] {
  const text = String(feedback || "");
  if (!text.trim()) return [];

  const guidance: string[] = [];
  const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(requirementText);
  const defaultVisibleLanguageLabel = defaultVisibleLanguage === "en" ? "English (en)" : "Chinese (zh-CN)";
  const blogDetailTargets = qaRepairTargets.filter((target) => isBlogDetailHtmlPath(target));
  const hasBilingualLeak =
    /simultaneous bilingual visible copy|duplicate(?:d)? bilingual|language-switched content/i.test(text);
  const hasBilingualProtocolGap =
    /missing bilingual copy mappings|missing bilingual locale switch/i.test(text);
  const hasPageMechanicsScaffold = /exposes page mechanics\/scaffold wording/i.test(text);
  const hasBlogEditorialScaffold = /exposes editorial scaffold\/explanatory wording/i.test(text);
  const hasBlogBodyGap = /must contain a complete article\/detail body/i.test(text);
  const hasBlogDepthGap = /body depth too thin|body structure too thin/i.test(text);
  const hasMissingBlogDataSourceContract = /does not include the Blog data-source contract/i.test(text);
  const hasMissingBlogDetailLinks =
    /must expose at least one \/blog\/\{slug\}\/ detail link|must expose \d+ \/blog\/\{slug\}\/ detail links/i.test(text);
  const hasUnexpectedBlogDetailLinksInIndexFirstPass =
    /Blog\/content fallback exposes \d+ detail links without an explicit requested content count/i.test(text);
  const hasContentListPaddingGap = /blog list item outer class lacks runtime-safe padding|outer class lacks runtime-safe padding/i.test(
    text,
  );
  const hasUnexpectedContentBackendMount =
    /applies the Blog\/content collection data-source contract on a non-content route|applies the Blog\/content collection data-source contract despite explicit no blog\/archive behavior/i.test(
      text,
    );
  const hasFlatFooterShell = /flat link row instead of a structured footer shell/i.test(text);
  const hasDuplicateFooterGroups = /duplicates the same footer link set across multiple groups/i.test(text);
  const hasMissingConsultationForm = /site is missing a required consultation\/intake form/i.test(text);
  const hasRootRouteSemanticMismatch = /root-route-semantic-mismatch/i.test(text);
  const hasWorkflowMetaLeak = /exposes workflow\/process\/meta wording instead of visitor-facing content/i.test(text);
  const hasRepeatedLegacySplitHero = /repeated primary routes fell back to the same legacy split-hero opening template/i.test(text);
  const hasSurfaceTokenContractGap = /violates surface visual token contract/i.test(text);
  const hasSurfaceHomepageArchetypeGap = /violates the surface homepage archetype contract/i.test(text);
  const hasHiddenRevealCss = /hides route content before preview interaction/i.test(text);
  const hasIncompleteSharedCss = /is incomplete shared site CSS/i.test(text);
  const hasCollectionOpeningFallback =
    /reuses the legacy split-hero template instead of a route-owned (?:content collection|directory) opening/i.test(text);
  const hasSingleLanguageLocaleMismatch =
    /is tagged zh-CN but still renders mostly English visitor-facing copy/i.test(text);

  if (hasBilingualLeak || hasBilingualProtocolGap) {
    guidance.push(
      `Bilingual repair: affected files must show exactly one visible language at a time. Default visible language is ${defaultVisibleLanguageLabel}. Remove zh/en pairs, slash-separated bilingual labels, and appended translated summaries from visible copy.`,
      "Bilingual repair: keep alternate-language copy only in the exact `data-i18n`, `data-i18n-zh`, and `data-i18n-en` protocol or an equivalent hidden dictionary consumed by `/script.js`.",
    );
    if (qaRepairTargets.some((target) => target.endsWith(".html") && !isBlogDetailHtmlPath(target) && target !== "/blog/index.html")) {
      guidance.push(
        "Bilingual repair: any affected non-blog HTML page must include visible header switch controls using `data-locale-toggle` plus `data-locale=\"zh-CN\"` / `data-locale=\"en\"`. If a real switch cannot be completed this round, fall back that page to a single visible language instead of mixed bilingual copy.",
      );
    }
    if (qaRepairTargets.includes("/index.html")) {
      guidance.push(
        "Bilingual homepage repair: hero title, lead, badges, and proof rows must not mix Chinese and English in the same visible sentence or pill. Store the alternate language in `data-i18n-*` attributes and keep one readable language path on screen.",
      );
    }
    if (blogDetailTargets.length > 0) {
      guidance.push(
        "Bilingual blog-detail repair: each affected `/blog/{slug}/index.html` must render one visible article language body only. Do not place English paragraphs under Chinese article text or vice versa in the initial HTML.",
      );
    }
  }

  if (/must preserve the shared footer destinations from \/index\.html/i.test(text)) {
    guidance.push(
      "Shared-shell repair: every affected non-home page must preserve the same footer destination set as `/index.html`. Keep all planned route links in the footer even if the body content changes.",
      "Shared-shell repair: when rewriting a page, copy the active shared footer shell first, then edit only the route-specific main content so footer links for Products, Custom Solutions, Cases, Contact, and About do not disappear.",
    );
  }

  if (hasSingleLanguageLocaleMismatch) {
    guidance.push(
      "Single-language locale repair: rewrite all visible visitor-facing copy in the affected route into Chinese. Keep brand names and route slugs as proper nouns only; nav labels, headings, body text, CTA labels, and footer copy must read as a complete Chinese-first page.",
      "Single-language locale repair: remove EN/ZH switch controls, utility chips, and bilingual shell payloads from the affected route. Do not keep English-only hero/body/footer copy on a zh-CN page.",
    );
  }

  if (hasFlatFooterShell) {
    guidance.push(
      "Shared-shell repair: rebuild the footer as a structured shell, not a flat stream of bare anchors. Use grouped footer wrappers such as brand/copy, link list, and meta/action rows that match the shared CSS footer utilities.",
      "Shared-shell repair: preserve the shared route destinations, but wrap them inside the footer layout classes defined in `/styles.css` so the footer renders as a designed block instead of one collapsed link row.",
      "Shared-shell repair: `/styles.css` must style `footer`, `.site-footer`, or `.footer` itself with visible band chrome such as padding plus background, border-top, or margin-top. Footer cards may sit inside that band, but the top-level footer cannot look like ordinary body cards.",
    );
  }

  if (hasDuplicateFooterGroups) {
    guidance.push(
      "Shared-shell repair: footer groups must have distinct jobs. Do not repeat the full route list under multiple headings such as Routes and Resources.",
      "Shared-shell repair: keep primary route navigation in one group, and make resource/support groups contain genuinely different destinations such as downloads, consultation, contact, policy, or document actions.",
      "Shared-shell repair: rewrite `/index.html` first. Preserve one canonical route-navigation group in the footer, then convert the duplicated group into a different information architecture such as contact methods, service actions, proof, or support links instead of repeating the same anchors.",
    );
  }

  if (hasMissingConsultationForm) {
    guidance.push(
      "Consultation-form repair: add one real intake form on the most relevant conversion or information route. It must include name, organization/company, email, topic/subject, and message fields.",
      "Consultation-form repair: keep the form visitor-facing and submit-ready with labels, inputs, textarea, and a clear submit CTA. Do not replace it with a mailto link, CTA card, or explanatory copy.",
    );
  }

  if (hasRootRouteSemanticMismatch) {
    guidance.push(
      "Homepage semantic repair: re-emit `/index.html` so the title, meta description, H1, opening lead, and first proof/capability band present the official homepage and institutional overview first.",
      "Homepage semantic repair: remove support-entry, consultation-entry, contact-entry, information-entry, project-support, institutional-support, download, certification, login, and intake-first wording from the homepage title, hero, badges, and first CTA row.",
      "Homepage semantic repair: keep downstream support, consultation, downloads, or contact actions only as secondary modules or later CTA bands after the homepage has already established organization identity, standards/research scope, and institutional credibility.",
      "Homepage semantic repair: do not let the opening modules read like a service desk, intake portal, or assistance funnel. The first visible homepage sections must anchor the institution, what it covers, who it serves, and why the overview matters.",
    );
  }

  if (hasWorkflowMetaLeak) {
    guidance.push(
      "Visitor-copy repair: remove workflow/process/meta vocabulary from all visible HTML, including headings, eyebrow labels, badges, cards, CTAs, meta descriptions, alt text, and footer copy.",
      "Visitor-copy repair: never render internal planning phrases such as assumption notes, content gap, Prompt Control Manifest, source priorities, page brief, source material appendix, internal prompt, or requirement completion.",
      "Visitor-copy repair: rewrite the affected sentence around the website subject itself. For example, replace internal no-blog/archive assumption notes with concrete documentation scope, reference coverage, standards guidance, implementation notes, or visitor outcomes.",
    );
  }

  if (hasRepeatedLegacySplitHero || hasCollectionOpeningFallback) {
    guidance.push(
      "Route-opening repair: replace legacy `hero-grid` / `hero-panel` / `hero-copy + aside` openings with route-owned lead bands. Sibling pages must not share the same split-hero shell with swapped copy.",
      "Route-opening repair: content collection and directory routes should foreground their own collection/filter/result surface instead of opening with a generic two-column hero plus sidebar panel.",
      "Route-opening repair: for non-home pages, do not reopen the page with `route-hero`, `hero-grid`, `hero-copy`, `action-row`, and `aside.panel` as the repeated sibling template. Use one dominant route-owned opening band instead.",
      "Route-opening repair: directory pages should use a compact directory intro plus inline filters/results framing. Do not pair `hero__title` / `hero__lead` with a right-rail `aside` or a `detail-grid` split opening.",
      "Route-opening repair: content collection openings must replace legacy `hero-title`, `hero-lead`, `hero__actions`, and `hero__content` utilities with route-owned collection classes such as `collection-title`, `collection-lead`, `collection-actions`, `knowledge-hub-title`, or `knowledge-hub-actions`.",
      "Route-opening repair: for `/resources`, `/research`, `/standards`, or directory routes, make the first `<main>` child a single route-owned band such as `<section class=\"resource-index-header\">`, `<section class=\"directory-intro\">`, or `<section class=\"collection-ledger\">` with the h1, lead, search/filter/category controls, and a short evidence row in that same band.",
      "Route-opening repair: delete the split opening scaffold entirely from the affected route: no `hero-grid`, `hero-copy`, `hero-panel`, `hero__content`, `hero__actions`, `aside.panel`, or `detail-grid` before the directory cards/results.",
    );
  }

  if (hasSurfaceTokenContractGap) {
    guidance.push(
      "Surface-token repair: re-emit `/styles.css` and replace the generic green/white rounded-card token family with the `surface_css_tokens` and `surface_typography_tokens` from `/website_design_spec.md`.",
      "Surface-token repair: preserve existing content and shell structure, but change root CSS variables, typography, background treatment, section rhythm, and module chrome so corporate, docs, and content-hub surfaces no longer look like the same template.",
    );
  }

  if (hasSurfaceHomepageArchetypeGap) {
    guidance.push(
      "Surface-homepage repair: rebuild `/index.html` from the `homepage_archetype_contract` and `opening_topology` in `/website_design_spec.md`, not from a generic hero/cards/CTA homepage template.",
      "Surface-homepage repair: do not keep `hero`, `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`, or `hero-aside` opening utilities and only rename the outer wrapper. The opening geometry itself must change.",
      "Surface-homepage repair: docs/knowledge homepages need route-owned docs workspace modules such as docs-workspace, docs-index-rail, quickstart-strip, guide-stack, and reference-matrix.",
      "Surface-homepage repair: content-hub homepages need route-owned collection modules such as collection-home, archive-masthead, resource-shelf, standards-ledger, research-index, and institutional-context.",
    );
  }

  if (hasHiddenRevealCss) {
    guidance.push(
      "Static preview repair: re-emit `/styles.css` so all route content is visible by default. Do not set `[data-reveal]`, `.reveal`, section blocks, cards, or footer areas to `opacity:0` before JavaScript or scrolling runs.",
      "Static preview repair: reveal animations may use subtle transform/transition only after content remains visible, or may add an enhancement class from JavaScript. The baseline CSS must render every section in full-page screenshots without user scrolling.",
    );
  }

  if (hasIncompleteSharedCss) {
    guidance.push(
      "Shared CSS repair: re-emit `/styles.css` as complete site CSS, not a placeholder or partial media patch. It must include root tokens, body typography/background, header/nav, buttons/CTAs, layout grids, cards/sections, footer, and responsive breakpoints.",
      "Shared CSS repair: preserve generated HTML class names and style the actual classes already present in the route pages so the preview does not render as unstyled browser-default HTML.",
    );
  }

  if (hasBlogBodyGap || hasBlogDepthGap) {
    guidance.push(
      blogDetailTargets.length > 0
        ? `Blog detail repair: re-emit these complete article pages, not partial patches or index-card shells: ${blogDetailTargets.join(", ")}.`
        : "Blog detail repair: re-emit each affected `/blog/{slug}/index.html` as a complete article page, not a card, excerpt, or metadata shell.",
      "Blog detail repair: each article must include one page-specific `<h1>`, at least four substantial body paragraphs, at least two `<h2>` section headings with supporting paragraphs, and enough total prose to read like a publishable article.",
      "Blog detail repair: expand the exact visible list-card topic from `/blog/index.html`; do not drift into generic website/process filler or archive-placeholder language.",
    );
  }

  if (hasMissingBlogDataSourceContract) {
    guidance.push(
      "Blog route repair: if the affected route is `/blog` or a planned content-backed archive route, rebuild its main collection section with the hidden runtime mount contract intact.",
      "Blog route repair: the archive/list module itself must contain `data-shpitto-blog-root`, `data-shpitto-blog-api=\"/api/blog/posts\"`, and one nested list wrapper using `data-shpitto-blog-list`.",
      "Blog route repair: keep those data attributes invisible integration hooks only. Wrap them around real article/archive cards rendered as visitor-facing content, not backend/process explanation copy.",
      "Blog route repair: preserve the route's shared header/footer and page-specific opening, then place the mounted collection surface inside the route-owned blog/archive section rather than as a detached generic block.",
    );
  }

  if (hasMissingBlogDetailLinks) {
    guidance.push(
      "Blog archive repair: every visible archive card on the affected `/blog` route must include a stable `/blog/{slug}/` detail link, not just a title, summary, or non-clickable shell.",
      "Blog archive repair: re-emit `/blog/index.html` with substantial publishable cards that link to the requested detail pages, and make the generated output include the matching `/blog/{slug}/index.html` files for those visible links.",
      "Blog archive repair: use the exact requested article topics or the existing visible archive topics from the current `/blog` page. Do not replace them with generic launch notes, placeholder posts, or archive-mechanics copy.",
    );
  }

  if (hasUnexpectedBlogDetailLinksInIndexFirstPass) {
    guidance.push(
      "Index-first blog repair: re-emit `/blog/index.html` only. The first pass must keep the archive strong but index-only, so remove all live `/blog/{slug}/` anchors from the fallback cards in this run.",
      "Index-first blog repair: keep exactly three substantial archive cards if no count was requested, but make them non-routing editorial/resource cards with titles, summaries, dates, tags, or category metadata instead of detail-page links.",
      "Index-first blog repair: do not emit matching `/blog/{slug}/index.html` files, same-page detail sections, or hidden detail panels. The dedicated blog-detail-fill workflow will create those later.",
    );
  }

  if (hasPageMechanicsScaffold) {
    guidance.push(
      "Visitor-facing page repair: delete route-choreography copy such as 下一步, 继续了解, 从首页开始, where to start, this page provides, the page's role, or next step when they explain how to browse the site instead of what the visitor gets.",
      "Visitor-facing page repair: rewrite the first visible sections around audience problem, concrete offer, proof, capability, or direct CTA. The page must read like a finished destination, not a sitemap explainer or page-purpose note.",
      "Visitor-facing page repair: remove implementation-review wording such as responsive layout, shared shell, browser previews, internal reviews, working sessions, or homepage built/designed for. Replace it with subject matter such as research scope, standards coverage, evidence quality, API reference behavior, operational proof, or visitor outcomes.",
      "Visitor-facing page repair: footer group labels must not read like route guidance. Replace labels such as Site routes, site path, browsing path, route guidance, 站点路径, 浏览路径, or 入口 with visitor-facing labels such as Primary navigation, Key sections, Research access, Contact, or Support.",
    );
  }

  if (hasBlogEditorialScaffold) {
    guidance.push(
      blogDetailTargets.length > 0
        ? `Blog detail repair: remove editorial explainer phrases from these article pages: ${blogDetailTargets.join(", ")}.`
        : "Blog detail repair: remove editorial explainer phrases from each affected `/blog/{slug}/index.html`.",
      "Blog detail repair: do not describe how to read the article, what this page collects, or what the article will cover in abstract terms. Replace that scaffolding with article-specific analysis, examples, and conclusions.",
    );
  }

  if (hasContentListPaddingGap) {
    guidance.push(
      "Shared-style repair: this is a `/styles.css` contract issue first. Re-emit the shared CSS so the direct child card/row class under `[data-shpitto-blog-list]` owns visible inner padding on its outer shell.",
      "Shared-style repair: if the list uses classes such as `.download-card`, `.resource-card`, `.article-card`, `.blog-card`, `.case-card`, or similar outer shells, that exact class must define non-zero padding itself instead of relying only on nested `__body` wrappers.",
    );
  }

  if (hasUnexpectedContentBackendMount) {
    guidance.push(
      "Route-contract repair: Remove `data-shpitto-blog-root`, `data-shpitto-blog-list`, `data-shpitto-blog-api`, and `/api/blog/posts` integration hooks from the affected page instead of inventing `/blog/{slug}/` detail links.",
      "Route-contract repair: rebuild the page as a normal route-owned destination using its own sections, proof, cards, filters, search controls, and CTA grammar. Keep Blog/content runtime mounts only when the prompt explicitly allows Blog/archive behavior or publishable detail content.",
    );
  }

  return Array.from(new Set(guidance));
}

function buildQaRepairMessage(
  feedback: string,
  requirementText = "",
): {
  message: string;
  targets: string[];
  guidance: string[];
} {
  const targets = extractQaRepairTargets(feedback);
  const guidance = buildQaRepairGuidance(feedback, requirementText, targets);
  return {
    targets,
    guidance,
    message: [
      "Generated files failed the workflow QA gate. Re-emit only the affected complete file(s), then call finish after validation can pass.",
      targets.length > 0
        ? `QA repair targets: ${targets.join(", ")}`
        : "QA repair targets: (none extracted; preserve all routes while fixing the reported issue)",
      guidance.length > 0
        ? `QA repair guidance:\n- ${guidance.join("\n- ")}`
        : "QA repair guidance: (none)",
      feedback,
      "Repair requirements are generic page-type/layout rules from the workflow skill; preserve route list, navigation, Blog data-source contract, and generated file paths.",
    ].join("\n"),
  };
}

function hasValidHtmlCore(rawHtml: string): boolean {
  const html = String(rawHtml || "");
  if (!html.trim()) return false;
  const hasHtmlLikeSurface =
    /<body[\s>]/i.test(html) ||
    /<main[\s>]/i.test(html) ||
    /<section[\s>]/i.test(html) ||
    /<article[\s>]/i.test(html) ||
    /<!doctype html>/i.test(html) ||
    /<html[\s>]/i.test(html);
  if (!hasHtmlLikeSurface) return false;
  const hasStyleOpen = /<style[\s>]/i.test(html);
  const hasStyleClose = /<\/style>/i.test(html);
  if (hasStyleOpen && !hasStyleClose) return false;
  return true;
}

function stripMarkdownCodeFences(raw: string): string {
  const text = String(raw || "").trim();
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)\n```\s*$/);
  if (fenced?.[1]) return fenced[1].trim();
  const openOnly = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)$/);
  if (openOnly?.[1]) return openOnly[1].trim();
  return text;
}

function containsToolTranscriptNoise(raw: string): boolean {
  const text = String(raw || "");
  if (!text.trim()) return false;
  return /<tool_call>|<tool_response>|```|("name"\s*:\s*"(?:fetchUrl|webSearch|web_search|load_skill|emit_file|finish)")/i.test(text);
}

function isLikelyValidJs(raw: string): boolean {
  const text = stripMarkdownCodeFences(raw).trim();
  if (!text || containsToolTranscriptNoise(text)) return false;
  try {
    // Syntax check only. Does not execute generated code.
    new Function(text);
    return true;
  } catch {
    return false;
  }
}

function isLikelyValidCss(raw: string): boolean {
  const text = stripMarkdownCodeFences(raw).trim();
  if (!text || containsToolTranscriptNoise(text)) return false;
  if (/<\/?(?:html|head|body|script)\b/i.test(text)) return false;
  return true;
}

function isLikelyValidI18nJson(raw: string): boolean {
  const parsed = tryParseJsonObject(String(raw || ""));
  return Boolean(parsed && Object.keys(parsed).length >= 1);
}

function normalizeGeneratedCss(rawCss: string): string {
  const css = stripMarkdownCodeFences(rawCss).trim();
  if (!css) return "";
  const patches: string[] = [];
  if (/\.site-nav[^{]*\{[^}]*flex-wrap\s*:\s*wrap/i.test(css) && !/runtime-nav-single-row-fix/i.test(css)) {
    patches.push([
      "/* runtime-nav-single-row-fix */",
      "@media (min-width: 48.001rem) {",
      "  .site-header__bar {",
      "    display: grid;",
      "    grid-template-columns: auto minmax(0, 1fr) auto;",
      "    align-items: center;",
      "    gap: clamp(0.5rem, 1.2vw, 0.9rem);",
      "  }",
      "",
      "  .site-nav {",
      "    min-width: 0;",
      "    flex-wrap: nowrap;",
      "    justify-content: flex-start;",
      "    overflow-x: auto;",
      "    scrollbar-width: none;",
      "  }",
      "",
      "  .site-nav::-webkit-scrollbar {",
      "    display: none;",
      "  }",
      "",
      "  .site-nav a,",
      "  .site-nav button,",
      "  .locale-toggle {",
      "    flex: 0 0 auto;",
      "    white-space: nowrap;",
      "    padding-inline: 0.85rem;",
      "  }",
      "",
      "  .header-utility {",
      "    flex: 0 0 auto;",
      "    white-space: nowrap;",
      "  }",
      "}",
    ].join("\n"));
  }
  if (/mobile-nav-toggle/i.test(css) && !/runtime-nav-toggle-fix/i.test(css)) {
    patches.push([
      "/* runtime-nav-toggle-fix */",
      ".mobile-nav-toggle,",
      ".mobile-nav-toggle.btn {",
      "  display: none;",
      "}",
      "",
      "@media (max-width: 48rem) {",
      "  .mobile-nav-toggle,",
      "  .mobile-nav-toggle.btn {",
      "    display: inline-flex;",
      "    align-items: center;",
      "  }",
      "",
      "  .site-nav {",
      "    display: none;",
      "    width: 100%;",
      "    flex-direction: column;",
      "    align-items: flex-start;",
      "    gap: var(--space-02, 0.5rem);",
      "  }",
      "",
      "  .site-nav.is-open {",
      "    display: flex;",
      "  }",
      "}",
    ].join("\n"));
  }
  if (/\.blog-card\b/i.test(css) && !/runtime-blog-card-padding-fix/i.test(css)) {
    patches.push([
      "/* runtime-blog-card-padding-fix */",
      ".blog-card {",
      "  padding: max(1.25rem, 20px);",
      "  display: grid;",
      "  gap: 0.875rem;",
      "}",
    ].join("\n"));
  }
  if (!/runtime-stock-media-module/i.test(css)) {
    patches.push([
      "/* runtime-stock-media-module */",
      ".shpitto-stock-media {",
      "  margin: 0;",
      "  display: grid;",
      "  gap: 0.75rem;",
      "}",
      ".shpitto-stock-media img {",
      "  display: block;",
      "  width: 100%;",
      "  aspect-ratio: 16 / 10;",
      "  object-fit: cover;",
      "  border-radius: 0.75rem;",
      "}",
      ".shpitto-stock-media figcaption {",
      "  margin: 0;",
      "  color: var(--muted, #52606d);",
      "  font-size: 0.95rem;",
      "  line-height: 1.55;",
      "}",
      ".shpitto-stock-media--enterprise-proof {",
      "  max-width: 42rem;",
      "}",
      ".proof-strip .shpitto-stock-media--enterprise-proof {",
      "  margin-inline: auto;",
      "}",
      ".proof-strip .shpitto-stock-media--enterprise-proof img {",
      "  aspect-ratio: 5 / 3;",
      "  border-radius: 0.5rem;",
      "  border: 1px solid var(--line, #e0e0e0);",
      "}",
      ".proof-strip .shpitto-stock-media--enterprise-proof figcaption {",
      "  max-width: 52ch;",
      "}",
      ".split-grid--aligned {",
      "  align-items: stretch;",
      "}",
      ".split-grid--aligned > * {",
      "  min-height: 100%;",
      "}",
      ".media-frame--paired {",
      "  display: grid;",
      "  align-self: stretch;",
      "  min-height: clamp(280px, 34vw, 420px);",
      "}",
      ".media-frame--paired img {",
      "  width: 100%;",
      "  height: 100%;",
      "  object-fit: cover;",
      "  position: absolute;",
      "  inset: 0;",
      "}",
      ".media-frame--paired .ph-caption {",
      "  position: relative;",
      "  z-index: 1;",
      "  margin-top: auto;",
      "  max-width: 28ch;",
      "  padding: 0.875rem 1rem;",
      "  border-radius: 0.9rem;",
      "  background: rgba(255,255,255,0.78);",
      "  color: var(--text, #1f1a17);",
      "  font-family: var(--font-body, system-ui, sans-serif);",
      "  font-size: 0.95rem;",
      "  line-height: 1.45;",
      "  box-shadow: 0 8px 24px rgba(31, 26, 23, 0.08);",
      "}",
      ".article-ledger .blog-card,",
      ".article-ledger .article-card,",
      ".article-ledger .article-item {",
      "  overflow: hidden;",
      "}",
      ".article-card--with-media,",
      ".blog-card--with-media,",
      ".article-item--with-media {",
      "  display: grid;",
      "  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);",
      "  gap: 0;",
      "  padding: 0;",
      "}",
      ".article-card--with-media > img,",
      ".blog-card--with-media > img,",
      ".article-item--with-media > img {",
      "  width: 100%;",
      "  height: 100%;",
      "  min-height: 100%;",
      "  object-fit: cover;",
      "}",
      ".article-card--with-media > .card-copy,",
      ".blog-card--with-media > .card-copy,",
      ".article-item--with-media > .card-copy,",
      ".article-card--with-media > .article-copy,",
      ".blog-card--with-media > .article-copy,",
      ".article-item--with-media > .article-copy,",
      ".article-card--with-media > .article-body,",
      ".blog-card--with-media > .article-body,",
      ".article-item--with-media > .article-body {",
      "  padding: clamp(18px, 2vw, 26px);",
      "  display: grid;",
      "  gap: 12px;",
      "  align-content: start;",
      "}",
      "@media (max-width: 720px) {",
      "  .article-card--with-media,",
      "  .blog-card--with-media,",
      "  .article-item--with-media {",
      "    grid-template-columns: 1fr;",
      "  }",
      "  .media-frame--paired {",
      "    min-height: 240px;",
      "  }",
      "}",
      ".enterprise-hero {",
      "  position: relative;",
      "  overflow: hidden;",
      "  min-height: clamp(28rem, 68vh, 44rem);",
      "  display: flex;",
      "  align-items: flex-end;",
      "  isolation: isolate;",
      "}",
      ".enterprise-hero::before {",
      "  content: \"\";",
      "  position: absolute;",
      "  inset: 0;",
      "  background: linear-gradient(90deg, rgba(7, 27, 54, 0.78) 0%, rgba(7, 27, 54, 0.52) 42%, rgba(7, 27, 54, 0.18) 100%);",
      "  z-index: 1;",
      "}",
      ".enterprise-hero .shell-inner,",
      ".enterprise-hero .masthead-stack,",
      ".enterprise-hero .enterprise-hero__content,",
      ".enterprise-hero .enterprise-proof-row {",
      "  position: relative;",
      "  z-index: 2;",
      "}",
      ".enterprise-hero .enterprise-hero__media {",
      "  position: absolute;",
      "  inset: 0;",
      "  z-index: 0;",
      "  margin: 0;",
      "  max-width: none;",
      "}",
      ".enterprise-hero .enterprise-hero__media .media-cover,",
      ".enterprise-hero .enterprise-hero__media picture {",
      "  width: 100%;",
      "  height: 100%;",
      "  display: block;",
      "}",
      ".enterprise-hero .enterprise-hero__media img {",
      "  width: 100%;",
      "  height: 100%;",
      "  aspect-ratio: auto;",
      "  object-fit: cover;",
      "  border-radius: 0;",
      "  border: 0;",
      "}",
      ".enterprise-hero .enterprise-hero__content {",
      "  max-width: 44rem;",
      "  color: white;",
      "}",
      ".enterprise-hero .enterprise-proof-row {",
      "  display: flex;",
      "  flex-wrap: wrap;",
      "  gap: 0.75rem;",
      "  margin-top: 1rem;",
      "}",
      ".enterprise-hero .enterprise-proof-row > * {",
      "  backdrop-filter: blur(8px);",
      "  background: rgba(7, 27, 54, 0.36);",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  border-radius: 999px;",
      "  padding: 0.55rem 0.9rem;",
      "}",
      ".masthead--single-column .masthead-stack {",
      "  display: grid;",
      "  grid-template-columns: minmax(0, 1fr) !important;",
      "}",
      ".masthead--single-column .panel,",
      ".masthead--single-column .proof-panel {",
      "  max-width: 44rem;",
      "}",
      ".detail-layout .shpitto-stock-media,",
      ".detail-grid .shpitto-stock-media {",
      "  max-width: 32rem;",
      "}",
      "@media (max-width: 48rem) {",
      "  .shpitto-stock-media--enterprise-proof,",
      "  .detail-layout .shpitto-stock-media,",
      "  .detail-grid .shpitto-stock-media {",
      "    max-width: 100%;",
      "  }",
      "}",
      ".page-title--measure {",
      "  max-width: 20ch;",
      "}",
      ".proof-badge-row {",
      "  display: flex;",
      "  flex-wrap: wrap;",
      "  gap: 0.75rem;",
      "  margin-top: 1.25rem;",
      "}",
      ".proof-figure {",
      "  margin: 0;",
      "  overflow: hidden;",
      "}",
      ".proof-figure__image {",
      "  width: 100%;",
      "  height: 100%;",
      "  aspect-ratio: 16 / 9;",
      "  object-fit: cover;",
      "}",
      ".proof-figure__caption {",
      "  padding: var(--space-4, 1rem);",
      "  color: var(--text-subtle, #525252);",
      "  font-size: 0.95rem;",
      "}",
      ".section-row--capability {",
      "  align-items: end;",
      "  margin-bottom: 1rem;",
      "}",
      ".section-row--cta {",
      "  flex-wrap: wrap;",
      "  align-items: center;",
      "}",
      ".stack--measure {",
      "  max-width: 47.5rem;",
      "}",
      ".cta-surface {",
      "  background: var(--surface);",
      "}",
      ".stack--section-intro {",
      "  margin-bottom: var(--space-5);",
      "}",
    ].join("\n"));
  }
  return patches.length > 0 ? [css, ...patches].join("\n\n") : css;
}

function syncSharedCssVariablesToStylePreset(rawCss: string, stylePreset: DesignStylePreset): string {
  const css = String(rawCss || "").trim();
  if (!css) return css;
  const colors = stylePreset?.colors;
  if (!colors?.primary || !colors?.accent || !colors?.background || !colors?.surface || !colors?.panel || !colors?.text || !colors?.muted || !colors?.border) {
    return css;
  }
  const softPrimary = colors.surface;
  const softAccent = /^#f59e0b$/i.test(colors.accent) ? "#FFF3E0" : colors.surface;
  const focus = colors.primary;
  const replacements: Array<[string, string]> = [
    ["--bg", colors.background],
    ["--background", colors.background],
    ["--surface", colors.surface],
    ["--panel", colors.panel],
    ["--text", colors.text],
    ["--muted", colors.muted],
    ["--border", colors.border],
    ["--primary", colors.primary],
    ["--accent", colors.accent],
    ["--success", colors.primary],
    ["--primary-soft", softPrimary],
    ["--accent-soft", softAccent],
    ["--focus", focus],
  ];
  const applyVarOverrides = (rootBlock: string): string => {
    let next = rootBlock;
    for (const [name, value] of replacements) {
      const pattern = new RegExp(`${name}\\s*:\\s*[^;]+;`, "i");
      if (pattern.test(next)) {
        next = next.replace(pattern, `${name}: ${value};`);
      } else {
        next = next.replace(/\}\s*$/, `  ${name}: ${value};\n}`);
      }
    }
    return next;
  };
  if (/:root\s*\{[\s\S]*?\}/i.test(css)) {
    return css.replace(/:root\s*\{[\s\S]*?\}/i, (match) => `/* runtime-style-preset-sync */\n${applyVarOverrides(match)}`);
  }
  const override = [
    "/* runtime-style-preset-sync */",
    applyVarOverrides(":root {\n}"),
  ].join("\n");
  return `${css}\n\n${override}`;
}

function extractMarkdownBulletSection(markdown: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "m");
  const match = markdown.match(pattern);
  if (!match) return [];
  return String(match[1] || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function loadBilingualPromptGuidance(): BilingualPromptGuidance {
  if (cachedBilingualPromptGuidance) return cachedBilingualPromptGuidance;
  const markdown = readFileSync(BILINGUAL_PROMPT_GUIDANCE_PATH, "utf8");
  cachedBilingualPromptGuidance = {
    roundLanguageGuidance: extractMarkdownBulletSection(markdown, "Round Language Guidance"),
    roundStrictProtocol: extractMarkdownBulletSection(markdown, "Round Strict Protocol"),
    targetBlogDetailGuidance: extractMarkdownBulletSection(markdown, "Target Blog Detail Guidance"),
    targetLanguageGate: extractMarkdownBulletSection(markdown, "Target Language Gate"),
  };
  return cachedBilingualPromptGuidance;
}

function loadBlogPromptGuidance(): BlogPromptGuidance {
  if (cachedBlogPromptGuidance) return cachedBlogPromptGuidance;
  const markdown = readFileSync(BLOG_PROMPT_GUIDANCE_PATH, "utf8");
  cachedBlogPromptGuidance = {
    targetBlogIndexGate: extractMarkdownBulletSection(markdown, "Target Blog Index Gate"),
    targetBlogCountGate: extractMarkdownBulletSection(markdown, "Target Blog Count Gate"),
    targetBlogDetailGate: extractMarkdownBulletSection(markdown, "Target Blog Detail Gate"),
  };
  return cachedBlogPromptGuidance;
}

function renderPromptGuidance(lines: string[], replacements: Record<string, string>): string[] {
  return lines.map((line) =>
    Object.entries(replacements).reduce(
      (acc, [token, value]) => acc.replaceAll(`{{${token}}}`, value),
      line,
    ),
  );
}

function escapeHtmlAttribute(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripLanguageVariantAttributes(attrs: string): string {
  return String(attrs || "")
    .replace(/\sclass=(["'])([^"']*)\1/gi, (_match, quote: string, classValue: string) => {
      const normalizedClassValue = String(classValue || "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter(
          (token) =>
            !/^(?:lang-(?:zh|zh-cn|en)|(?:zh|en)(?:-only)?|locale-(?:zh|en)|is-(?:zh|en)|i18n-(?:zh|en))$/i.test(
              token,
            ),
        )
        .join(" ");
      return normalizedClassValue ? ` class=${quote}${normalizedClassValue}${quote}` : "";
    })
    .replace(/\sdata-i18n(?:-zh|-en)?(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/\s(?:lang|xml:lang|data-lang|data-locale|data-variant|data-language|aria-hidden|hidden)(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlAttributeValue(value: string): string {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function normalizeBilingualWhitespace(text: string): string {
  return decodeHtmlAttributeValue(text).replace(/\s+/g, " ").trim();
}

function splitExplicitBilingualPairParts(text: string): string[] {
  return normalizeBilingualWhitespace(text)
    .split(/\s(?:\/|\||·|<>|路)\s|\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function chooseZhPreferredText(primary: string, fallback: string): string {
  const candidates = [...splitExplicitBilingualPairParts(primary), ...splitExplicitBilingualPairParts(fallback)];
  for (const candidate of candidates) {
    if (cjkCount(candidate) >= 1 && latinContentWords(candidate).length <= 1) return candidate;
  }
  return normalizeBilingualWhitespace(primary) || normalizeBilingualWhitespace(fallback);
}

function chooseEnPreferredText(primary: string, fallback: string): string {
  const candidates = [...splitExplicitBilingualPairParts(primary), ...splitExplicitBilingualPairParts(fallback)];
  for (const candidate of candidates) {
    if (latinContentWords(candidate).length >= 1 && cjkCount(candidate) <= 1) return candidate;
  }
  return normalizeBilingualWhitespace(primary) || normalizeBilingualWhitespace(fallback);
}

function normalizeExplicitBilingualNodeCopy(
  zhText: string,
  enText: string,
): { zh: string; en: string } | null {
  const normalizedZh = normalizeBilingualWhitespace(zhText);
  const normalizedEn = normalizeBilingualWhitespace(enText);
  const zhLooksMixed = isExplicitBilingualPairSample(normalizedZh);
  const enLooksMixed = isExplicitBilingualPairSample(normalizedEn);
  if (!zhLooksMixed && !enLooksMixed) return null;
  const zh = chooseZhPreferredText(normalizedZh, normalizedEn);
  const en = chooseEnPreferredText(normalizedEn, normalizedZh);
  if (!zh || !en || zh === en) return null;
  return { zh, en };
}

function normalizeInlineBilingualI18nMappings(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
): string {
  const tagPattern =
    /<([a-zA-Z][\w:-]*)([^>]*?\sdata-i18n-zh="([^"]*)"[^>]*?\sdata-i18n-en="([^"]*)"[^>]*)>([\s\S]*?)<\/\1>/g;
  return String(rawHtml || "").replace(tagPattern, (match, tagName, rawAttrs, zhAttr, enAttr, innerHtml) => {
    const normalized = normalizeExplicitBilingualNodeCopy(String(zhAttr || ""), String(enAttr || ""));
    if (!normalized) return match;
    const visible = defaultVisibleLanguage === "en" ? normalized.en : normalized.zh;
    const nextAttrs = String(rawAttrs || "")
      .replace(/\sdata-i18n-zh="[^"]*"/i, ` data-i18n-zh="${escapeHtmlAttribute(normalized.zh)}"`)
      .replace(/\sdata-i18n-en="[^"]*"/i, ` data-i18n-en="${escapeHtmlAttribute(normalized.en)}"`);
    if (/<[a-zA-Z]/.test(String(innerHtml || ""))) return `<${tagName}${nextAttrs}>${innerHtml}</${tagName}>`;
    return `<${tagName}${nextAttrs}>${visible}</${tagName}>`;
  });
}

function normalizeKnownBilingualSectionLabels(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
): string {
  const labelMap = new Map<string, { zh: string; en: string }>([
    ["About the maker", { zh: "关于制造伙伴", en: "About the maker" }],
    ["Trust anchors", { zh: "信任锚点", en: "Trust anchors" }],
    ["Story and operating model", { zh: "合作方式", en: "Story and operating model" }],
    ["How we work", { zh: "协作方式", en: "How we work" }],
    ["Proof and standards", { zh: "标准与证明", en: "Proof and standards" }],
    ["Collaboration invitation", { zh: "合作邀请", en: "Collaboration invitation" }],
  ]);
  const tagPattern = /<([a-zA-Z][\w:-]*)([^>]*)>([^<>]+)<\/\1>/g;
  return String(rawHtml || "").replace(tagPattern, (match, tagName, rawAttrs, innerText) => {
    const attrs = String(rawAttrs || "");
    if (/\sdata-i18n(?:\s|=|>)/i.test(attrs)) return match;
    const normalizedText = normalizeBilingualWhitespace(innerText);
    const mapped = labelMap.get(normalizedText);
    if (!mapped) return match;
    const visible = defaultVisibleLanguage === "en" ? mapped.en : mapped.zh;
    return `<${tagName}${attrs} data-i18n data-i18n-zh="${escapeHtmlAttribute(mapped.zh)}" data-i18n-en="${escapeHtmlAttribute(mapped.en)}">${visible}</${tagName}>`;
  });
}

function normalizeKnownSharedShellCopy(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
): string {
  const snippetMap = new Map<string, { zh: string; en: string }>([
    [
      "B2B textile, OEM/ODM, certified sourcing, gift packaging, and brand-ready merchandising.",
      {
        zh: "B2B 制造、OEM/ODM、认证采购、包装支持与品牌交付协同。",
        en: "B2B manufacturing, OEM/ODM, certified sourcing, packaging support, and brand-ready delivery.",
      },
    ],
    [
      "Text wordmark brand system · warm editorial presentation",
      {
        zh: "文字标识品牌系统 · 温暖编辑感呈现",
        en: "Text wordmark brand system · warm editorial presentation",
      },
    ],
    [
      "Text wordmark brand system 路 warm editorial presentation",
      {
        zh: "文字标识品牌系统 · 温暖编辑感呈现",
        en: "Text wordmark brand system · warm editorial presentation",
      },
    ],
    [
      "Textile manufacturing",
      {
        zh: "纺织制造",
        en: "Textile manufacturing",
      },
    ],
    [
      "Text wordmark brand presentation",
      {
        zh: "采购导向企业呈现",
        en: "Buyer-ready company presentation",
      },
    ],
    [
      "English / Chinese site experience",
      {
        zh: "支持全球采购沟通",
        en: "Global sourcing communication support",
      },
    ],
    [
      "Text wordmark brand",
      {
        zh: "企业品牌识别",
        en: "Clean company identity",
      },
    ],
    [
      "Bilingual experience",
      {
        zh: "跨市场沟通",
        en: "Cross-market communication",
      },
    ],
    [
      "Industrial home textiles 路 procurement-ready supply",
      {
        zh: "工业制造 · 采购导向供应",
        en: "Industrial manufacturing · procurement-ready supply",
      },
    ],
    [
      "Textile & packaging",
      {
        zh: "制造与包装",
        en: "Manufacturing & packaging",
      },
    ],
    [
      "Textile · Gift · Bath",
      {
        zh: "产品 · 包装 · 应用",
        en: "Products · Packaging · Application",
      },
    ],
    [
      "Textile B2B brand · warm editorial identity",
      {
        zh: "制造业 B2B 品牌 · 温暖编辑气质",
        en: "Manufacturing B2B brand · warm editorial identity",
      },
    ],
    [
      "Textile B2B brand 路 warm editorial identity",
      {
        zh: "制造业 B2B 品牌 · 温暖编辑气质",
        en: "Manufacturing B2B brand · warm editorial identity",
      },
    ],
    [
      "Heritage manufacturing / craft",
      {
        zh: "传承工艺制造",
        en: "Heritage manufacturing / craft",
      },
    ],
    [
      "Heritage manufacturing · craft",
      {
        zh: "传承工艺制造",
        en: "Heritage manufacturing · craft",
      },
    ],
    [
      "Shpitto Textile",
      {
        zh: "Shpitto 制造",
        en: "Shpitto Manufacturing",
      },
    ],
    [
      "Textile · B2B · Heritage Craft",
      {
        zh: "制造 · B2B · 传承工艺",
        en: "Manufacturing · B2B · Heritage Craft",
      },
    ],
    [
      "Textile B2B Heritage manufacturing / craft",
      {
        zh: "制造业 B2B · 传承工艺制造",
        en: "Manufacturing B2B Heritage manufacturing / craft",
      },
    ],
    [
      "Textile Heritage manufacturing / craft",
      {
        zh: "制造 · 传承工艺制造",
        en: "Manufacturing Heritage manufacturing / craft",
      },
    ],
  ]);

  const tagPattern =
    /<([a-zA-Z][\w:-]*)([^>]*)(?:\sdata-i18n(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)?([^>]*)>([^<>]+)<\/\1>/g;
  return String(rawHtml || "").replace(tagPattern, (match, tagName, rawAttrsA, rawAttrsB, innerText) => {
    const attrs = `${rawAttrsA || ""}${rawAttrsB || ""}`;
    const normalizedText = normalizeBilingualWhitespace(innerText);
    const mapped = snippetMap.get(normalizedText);
    if (!mapped) return match;
    const visible = defaultVisibleLanguage === "en" ? mapped.en : mapped.zh;
    const strippedAttrs = attrs
      .replace(/\sdata-i18n(?:-zh|-en)?(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
      .trim();
    return `<${tagName}${strippedAttrs ? ` ${strippedAttrs}` : ""} data-i18n data-i18n-zh="${escapeHtmlAttribute(mapped.zh)}" data-i18n-en="${escapeHtmlAttribute(mapped.en)}">${visible}</${tagName}>`;
  });
}

function normalizeKnownRouteAnchorCopy(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
): string {
  const routeLabelMap = new Map<string, { zh: string; en: string }>([
    ["/", { zh: "首页", en: "Home" }],
    ["/products", { zh: "产品", en: "Products" }],
    ["/custom-solutions", { zh: "定制方案", en: "Custom Solutions" }],
    ["/cases", { zh: "案例", en: "Cases" }],
    ["/contact", { zh: "联系", en: "Contact" }],
    ["/about", { zh: "关于", en: "About" }],
    ["/blog", { zh: "博客", en: "Blog" }],
  ]);
  return String(rawHtml || "").replace(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, leftAttrs, href, rightAttrs, innerHtml) => {
    const normalizedRoute = normalizeRouteKey(normalizeHrefRoute(String(href || "")));
    const labels = routeLabelMap.get(normalizedRoute);
    if (!labels) return match;
    if (/\sdata-i18n(?:\s|=|>)/i.test(`${leftAttrs || ""} ${rightAttrs || ""}`)) return match;
    const visibleText = normalizeBilingualWhitespace(htmlVisibleText(innerHtml));
    if (!visibleText || ![labels.zh, labels.en].includes(visibleText)) return match;
    const visible = defaultVisibleLanguage === "en" ? labels.en : labels.zh;
    return `<a${leftAttrs || ""}href="${escapeHtmlAttribute(String(href || ""))}"${rightAttrs || ""} data-i18n data-i18n-zh="${escapeHtmlAttribute(labels.zh)}" data-i18n-en="${escapeHtmlAttribute(labels.en)}">${visible}</a>`;
  });
}

function normalizeKnownMixedBusinessTerms(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
): string {
  if (defaultVisibleLanguage === "en") return String(rawHtml || "");
  const replacements: Array<[RegExp, string]> = [
    [/\bOperating model\b/g, "工作方式"],
    [/\bWhat we care about\b/g, "关注重点"],
    [/\bIdentity\b/g, "品牌定位"],
    [/\bMaterial fit\b/g, "材料适配"],
    [/\bOrder clarity\b/g, "订单清晰"],
    [/\bQuality consistency\b/g, "品质一致"],
    [/\bStory\b/g, "故事"],
    [/\bCompliance-aware presentation\b/g, "合规导向表达"],
    [/\bCraft \+ scale\b/g, "工艺与量产"],
    [/\bCase Library\b/g, "案例库"],
    [/\bRepeatability\b/g, "可复用性"],
    [/\bComparable brief\b/g, "相似项目咨询"],
    [/\bGift box and textile pairing\b/g, "礼盒与产品组合"],
    [/\bGift box and product pairing\b/g, "礼盒与产品组合"],
    [/\bHeritage manufacturing \/ craft\b/g, "传承工艺制造"],
    [/\bHeritage manufacturing · craft\b/g, "传承工艺制造"],
    [/\bHeritage manufacturing\b/g, "传承制造"],
    [/\bHeritage Craft\b/g, "传承工艺"],
    [/\bTextile B2B Heritage manufacturing \/ craft\b/g, "制造业 B2B · 传承工艺制造"],
    [/\bTextile Heritage manufacturing \/ craft\b/g, "制造 · 传承工艺制造"],
    [/\bShpitto Textile\b/g, "Shpitto 制造"],
    [/\bManufacturing\b/g, "制造"],
    [/\bScenario \/ Intervention \/ Evidence\b/g, "场景 / 介入 / 证据"],
    [/\bGifting\b/g, "礼赠"],
    [/\bRetail\b/g, "零售"],
    [/\b1\.\s*Understand\b/g, "1. 理解需求"],
    [/\b2\.\s*Shape\b/g, "2. 形成方案"],
    [/\b3\.\s*Deliver\b/g, "3. 推进交付"],
    [/\bProducts\b/g, "产品"],
    [/\bCustom Solutions\b/g, "定制方案"],
    [/\bCases\b/g, "案例"],
    [/\bContact\b/g, "联系"],
    [/\bAbout Shpitto\b/g, "关于 Shpitto"],
    [/\bTextile manufacturing\b/g, "纺织制造"],
    [/\btextile\b/g, "纺织"],
    [/\bgift box\b/g, "礼盒"],
    [/\btowel\b/g, "毛巾"],
    [/\bbath\b/g, "浴室"],
    [/\bsports\b/g, "运动"],
    [/\bmanufacturer\b/g, "制造伙伴"],
    [/\benterprise buyers\b/g, "企业买家"],
    [/\bCraft-led manufacturing and packaging delivery\./g, "工艺导向的制造与包装交付。"],
  ];
  const tagPattern = /<([a-zA-Z][\w:-]*)([^>]*)>([^<>]+)<\/\1>/g;
  return String(rawHtml || "").replace(tagPattern, (match, tagName, rawAttrs, innerText) => {
    const attrs = String(rawAttrs || "");
    if (/\sdata-i18n(?:\s|=|>)/i.test(attrs)) return match;
    const decoded = decodeHtmlAttributeValue(innerText);
    if (cjkCount(decoded) < 1 && !/\b(?:Products|Custom Solutions|Cases|Contact|Operating model|Understand|Shape|Deliver|Case Library|Repeatability|Comparable brief|Scenario|Intervention|Evidence|Gifting|Retail|Gift box and textile pairing|manufacturing|gift box|towel|bath|sports|manufacturer|enterprise buyers)\b/i.test(decoded)) {
      return match;
    }
    let nextText = decoded;
    for (const [pattern, replacement] of replacements) {
      nextText = nextText.replace(pattern, replacement);
    }
    if (nextText === decoded) return match;
    return `<${tagName}${attrs}>${escapeHtmlAttribute(nextText)}</${tagName}>`;
  });
}

function normalizeKnownMechanicalPhrases(rawHtml: string): string {
  return String(rawHtml || "")
    .replaceAll("回复路径与下一步信息", "合作回应与后续安排")
    .replaceAll("next step information", "follow-through guidance");
}

function collapseVisibleBilingualPairs(rawHtml: string, defaultVisibleLanguage: "zh-CN" | "zh" | "en"): string {
  let html = String(rawHtml || "");
  if (!html) return html;

  const patterns = [
    {
      regex:
        /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n-zh(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?([^>]*)>([^<>]*)<\/\1>\s*<\1([^>]*)\sdata-i18n-en(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?([^>]*)>([^<>]*)<\/\1>/g,
      firstLang: "zh" as const,
      secondLang: "en" as const,
    },
    {
      regex:
        /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n-en(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?([^>]*)>([^<>]*)<\/\1>\s*<\1([^>]*)\sdata-i18n-zh(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?([^>]*)>([^<>]*)<\/\1>/g,
      firstLang: "en" as const,
      secondLang: "zh" as const,
    },
    {
      regex: /<([a-zA-Z][\w:-]*)([^>]*)()>([^<>]*)<\/\1>\s*<\1([^>]*)()>([^<>]*)<\/\1>/g,
      firstLang: "auto" as const,
      secondLang: "auto" as const,
    },
  ];

  for (const pattern of patterns) {
    html = html.replace(
      pattern.regex,
      (match, tagName, leftAttrsA, leftAttrsB, firstContent, rightAttrsA, rightAttrsB, secondContent) => {
        const rawLeftAttrs = `${leftAttrsA || ""} ${leftAttrsB || ""}`.trim();
        const rawRightAttrs = `${rightAttrsA || ""} ${rightAttrsB || ""}`.trim();
        if (/data-locale-toggle\b/i.test(rawLeftAttrs) || /data-locale-toggle\b/i.test(rawRightAttrs)) return match;
        const firstAttrs = stripLanguageVariantAttributes(`${leftAttrsA || ""} ${leftAttrsB || ""}`);
        const secondAttrs = stripLanguageVariantAttributes(`${rightAttrsA || ""} ${rightAttrsB || ""}`);
        if (firstAttrs !== secondAttrs) return match;
        const firstVisible = String(firstContent || "").trim();
        const secondVisible = String(secondContent || "").trim();
        if (!firstVisible || !secondVisible) return match;
        let zhText = pattern.firstLang === "zh" ? firstVisible : secondVisible;
        let enText = pattern.firstLang === "en" ? firstVisible : secondVisible;
        if (pattern.firstLang === "auto") {
          const firstDecoded = htmlVisibleText(firstVisible);
          const secondDecoded = htmlVisibleText(secondVisible);
          const firstLooksZh = cjkCount(firstDecoded) >= 2 && latinLetterCount(firstDecoded) <= Math.max(8, firstDecoded.length);
          const firstLooksEn = latinLetterCount(firstDecoded) >= 3 && cjkCount(firstDecoded) <= 1;
          const secondLooksZh = cjkCount(secondDecoded) >= 2 && latinLetterCount(secondDecoded) <= Math.max(8, secondDecoded.length);
          const secondLooksEn = latinLetterCount(secondDecoded) >= 3 && cjkCount(secondDecoded) <= 1;
          if (firstLooksZh && secondLooksEn) {
            zhText = firstVisible;
            enText = secondVisible;
          } else if (firstLooksEn && secondLooksZh) {
            zhText = secondVisible;
            enText = firstVisible;
          } else {
            return match;
          }
        }
        const visible = defaultVisibleLanguage === "en" ? enText : zhText;
        return `<${tagName}${firstAttrs ? ` ${firstAttrs}` : ""} data-i18n data-i18n-zh="${escapeHtmlAttribute(
          htmlVisibleText(zhText),
        )}" data-i18n-en="${escapeHtmlAttribute(htmlVisibleText(enText))}">${visible}</${tagName}>`;
      },
    );
  }

  html = normalizeInlineBilingualI18nMappings(html, defaultVisibleLanguage);
  html = normalizeKnownBilingualSectionLabels(html, defaultVisibleLanguage);
  html = normalizeKnownSharedShellCopy(html, defaultVisibleLanguage);
  html = normalizeKnownRouteAnchorCopy(html, defaultVisibleLanguage);
  html = normalizeKnownMixedBusinessTerms(html, defaultVisibleLanguage);
  html = normalizeKnownMechanicalPhrases(html);
  return html;
}

function normalizeGeneratedJs(rawJs: string, requirementText = "", locale?: string): string {
  const js = stripMarkdownCodeFences(rawJs).trim();
  if (!js) return "";
  const localePlan = buildEffectiveLocalePlan(requirementText, locale);
  if (localePlan.mode === "single") return js;
  if (/__shpitto_apply_i18n|__shpitto_locale_runtime__/i.test(js)) return js;
  const registryJson = JSON.stringify({
    defaultLocale: localePlan.defaultLocale,
    locales: localePlan.locales,
    translationDriven: localePlan.translationDriven,
  });
  return [
    js,
    "",
    "/* __shpitto_locale_runtime__ */",
    "(() => {",
    "  const root = document.documentElement;",
    "  const STORAGE_KEY = 'shpitto:locale';",
    `  const FALLBACK_LOCALE_REGISTRY = ${registryJson};`,
    `  const LOCALE_REGISTRY_PATH = '${I18N_LOCALE_REGISTRY_PATH}';`,
    "  const resolveMessagePath = (lang) => {",
    "    const relative = `/i18n/messages.${lang}.json`;",
    "    const previewBase = typeof window !== 'undefined' ? String(window.__shpittoPreviewBase || '').replace(/\\/+$/, '') : '';",
    "    return previewBase ? `${previewBase}${relative}` : relative;",
    "  };",
    "  const resolveRegistryPath = () => {",
    "    const previewBase = typeof window !== 'undefined' ? String(window.__shpittoPreviewBase || '').replace(/\\/+$/, '') : '';",
    "    return previewBase ? `${previewBase}${LOCALE_REGISTRY_PATH}` : LOCALE_REGISTRY_PATH;",
    "  };",
    "  const messageCache = new Map();",
    "  let activeRequestId = 0;",
    "  let localeRegistry = FALLBACK_LOCALE_REGISTRY;",
    "  const normalizeLang = (lang) => {",
    "    const value = String(lang || '').trim();",
    "    if (localeRegistry.locales.includes(value)) return value;",
    "    if (/^zh(?:-|$)/i.test(value) && localeRegistry.locales.includes('zh-CN')) return 'zh-CN';",
    "    if (/^en(?:-|$)/i.test(value) && localeRegistry.locales.includes('en')) return 'en';",
    "    return localeRegistry.defaultLocale || FALLBACK_LOCALE_REGISTRY.defaultLocale || 'en';",
    "  };",
    "  const loadLocaleRegistry = async () => {",
    "    try {",
    "      const response = await fetch(resolveRegistryPath(), { credentials: 'same-origin' });",
    "      if (!response.ok) throw new Error(`HTTP ${response.status}`);",
    "      const payload = await response.json();",
    "      const locales = Array.isArray(payload?.locales) ? payload.locales.map((item) => String(item || '').trim()).filter(Boolean) : [];",
    "      const defaultLocale = typeof payload?.defaultLocale === 'string' ? String(payload.defaultLocale).trim() : '';",
    "      if (locales.length > 0) {",
    "        localeRegistry = {",
    "          defaultLocale: defaultLocale && locales.includes(defaultLocale) ? defaultLocale : locales[0],",
    "          locales,",
    "          translationDriven: Boolean(payload?.translationDriven),",
    "        };",
    "      }",
    "    } catch {}",
    "    return localeRegistry;",
    "  };",
    "  const resolveLang = () => {",
    "    const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return ''; } })();",
    "    if (stored) return normalizeLang(stored);",
    "    if (root.dataset.lang) return normalizeLang(root.dataset.lang);",
    "    if (root.lang) return normalizeLang(root.lang);",
    "    return normalizeLang(localeRegistry.defaultLocale);",
    "  };",
    "  const loadMessages = async (lang) => {",
    "    const normalizedLang = normalizeLang(lang);",
    "    if (messageCache.has(normalizedLang)) return messageCache.get(normalizedLang) || {};",
    "    const path = resolveMessagePath(normalizedLang);",
    "    try {",
    "      const response = await fetch(path, { credentials: 'same-origin' });",
    "      if (!response.ok) throw new Error(`HTTP ${response.status}`);",
    "      const payload = await response.json();",
    "      const normalized = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};",
    "      messageCache.set(normalizedLang, normalized);",
    "      return normalized;",
    "    } catch {",
    "      const fallback = {};",
    "      messageCache.set(normalizedLang, fallback);",
    "      return fallback;",
    "    }",
    "  };",
    "  const setLang = (lang) => {",
    "    const next = normalizeLang(lang);",
    "    root.dataset.lang = next;",
    "    root.lang = next;",
    "    document.querySelectorAll('[data-locale-toggle]').forEach((node) => {",
    "      const target = node.getAttribute('data-locale') || (node.textContent || '').trim();",
    "      const normalizedTarget = normalizeLang(target);",
    "      node.setAttribute('aria-pressed', normalizedTarget === next ? 'true' : 'false');",
    "    });",
    "    document.querySelectorAll('[data-locale-select]').forEach((node) => {",
    "      node.value = next;",
    "    });",
    "    try { localStorage.setItem(STORAGE_KEY, next); } catch {}",
    "  };",
    "  const applyI18n = async () => {",
    "    const requestId = ++activeRequestId;",
    "    const lang = resolveLang();",
    "    const messages = await loadMessages(lang);",
    "    if (requestId !== activeRequestId) return;",
    "    document.querySelectorAll('[data-i18n]').forEach((node) => {",
    "      const key = node.getAttribute('data-i18n') || '';",
    "      const genericAttr = node.getAttribute(`data-i18n-${lang.toLowerCase()}`);",
    "      const legacyZhAttr = lang === 'zh-CN' ? node.getAttribute('data-i18n-zh') || node.getAttribute('data-i18n-zh-cn') : '';",
    "      const legacyEnAttr = lang === 'en' ? node.getAttribute('data-i18n-en') : '';",
    "      const value = (key && typeof messages[key] === 'string' && messages[key]) || genericAttr || legacyZhAttr || legacyEnAttr || node.textContent;",
    "      if (typeof value === 'string' && value.length) node.textContent = value;",
    "    });",
    "    document.querySelectorAll('[data-i18n-zh][data-i18n-en]:not([data-i18n])').forEach((node) => {",
    "      const value = lang === 'en' ? node.getAttribute('data-i18n-en') : node.getAttribute('data-i18n-zh');",
    "      if (typeof value === 'string' && value.length) node.textContent = value;",
    "    });",
    "  };",
    "  document.querySelectorAll('[data-locale-toggle]').forEach((node) => {",
    "    if (node.dataset.shpittoLocaleBound === '1') return;",
    "    node.dataset.shpittoLocaleBound = '1';",
    "    node.addEventListener('click', async () => {",
    "      const target = node.getAttribute('data-locale') || (node.textContent || '').trim();",
    "      setLang(target);",
    "      await applyI18n();",
    "    });",
    "  });",
    "  document.querySelectorAll('[data-locale-select]').forEach((node) => {",
    "    if (node.dataset.shpittoLocaleBound === '1') return;",
    "    node.dataset.shpittoLocaleBound = '1';",
    "    node.addEventListener('change', async () => {",
    "      setLang(node.value || localeRegistry.defaultLocale);",
    "      await applyI18n();",
    "    });",
    "  });",
    "  void loadLocaleRegistry().then(() => {",
    "    setLang(resolveLang());",
    "    void applyI18n();",
    "  });",
    "  new MutationObserver(() => { void applyI18n(); }).observe(root, { attributes: true, attributeFilter: ['data-lang'] });",
    "})();",
  ].join("\n");
}

function hasBilingualI18nMapping(html: string): boolean {
  return /\sdata-i18n(?:\s|=|>)/i.test(html) || /data-i18n-zh\s*=\s*["'][^"']+["'][^>]*data-i18n-en\s*=\s*["'][^"']+["']/i.test(html);
}

function hasBilingualLocaleToggle(html: string): boolean {
  return /\sdata-locale-toggle(?:\s|=|>)/i.test(html);
}

function buildBilingualLocaleToggleMarkup(defaultVisibleLanguage: "zh-CN" | "zh" | "en", requirementText = "", locale?: string): string {
  const localePlan = buildEffectiveLocalePlan(requirementText, locale || defaultVisibleLanguage);
  if (localePlan.mode === "multilingual") {
    const options = localePlan.locales
      .map(
        (item) =>
          `    <option value="${escapeHtmlAttribute(item)}"${item === localePlan.defaultLocale ? " selected" : ""}>${escapeHtmlAttribute(item)}</option>`,
      )
      .join("\n");
    return [
      '<label class="locale-switch" aria-label="Language switch">',
      '  <span class="sr-only">Language</span>',
      "  <select data-locale-select>",
      options,
      "  </select>",
      "</label>",
    ].join("\n");
  }
  const zhVisible = "ZH";
  const enVisible = "EN";
  return [
    '<div class="locale-switch" aria-label="Language switch">',
    `  <button type="button" data-locale-toggle data-locale="zh-CN">${zhVisible}</button>`,
    `  <button type="button" data-locale-toggle data-locale="en">${enVisible}</button>`,
    "</div>",
  ].join("\n");
}

function ensureBilingualHtmlShell(
  rawHtml: string,
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
  requirementText = "",
  locale?: string,
): string {
  let html = ensureHtmlDocument(rawHtml);
  if (!html) return html;
  const localePlan = buildEffectiveLocalePlan(requirementText, locale || defaultVisibleLanguage);

  html = html.replace(/<html\b([^>]*)>/i, (_match, attrs) => {
    let nextAttrs = String(attrs || "");
    if (/\slang=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\slang=(["']).*?\1/i, ` lang="${localePlan.defaultLocale}"`);
    } else {
      nextAttrs = `${nextAttrs} lang="${localePlan.defaultLocale}"`;
    }
    if (/\sdata-lang=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\sdata-lang=(["']).*?\1/i, ` data-lang="${localePlan.defaultLocale}"`);
    } else {
      nextAttrs = `${nextAttrs} data-lang="${localePlan.defaultLocale}"`;
    }
    return `<html${nextAttrs}>`;
  });

  if (hasBilingualLocaleToggle(html)) return html;
  const toggleMarkup = buildBilingualLocaleToggleMarkup(defaultVisibleLanguage, requirementText, locale);

  if (/<nav\b[^>]*>/i.test(html)) {
    return html.replace(/<\/nav>/i, `</nav>\n${toggleMarkup}`);
  }
  if (/<header\b[^>]*>/i.test(html)) {
    return html.replace(/<header\b([^>]*)>/i, `<header$1>\n${toggleMarkup}`);
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b([^>]*)>/i, `<body$1>\n${toggleMarkup}`);
  }
  return `${toggleMarkup}\n${html}`;
}

function ensureHtmlDocument(rawHtml: string): string {
  let html = stripMarkdownCodeFences(rawHtml).trim();
  if (!html) return "";
  if (!hasValidHtmlCore(html)) return "";
  if (!/<!doctype html>/i.test(html)) html = `<!doctype html>\n${html}`;
  if (!/<html[\s>]/i.test(html)) html = `<html>\n${html}\n</html>`;
  if (!/<body[\s>]/i.test(html)) html = html.replace(/<\/head>/i, "</head>\n<body>") + "\n</body>";
  if (!/<\/body>/i.test(html)) html = `${html}\n</body>`;
  if (!/<\/html>/i.test(html)) html = `${html}\n</html>`;
  return html;
}

function stripEmptyBrandMarkPlaceholders(rawHtml: string): string {
  return String(rawHtml || "").replace(
    /<span\b[^>]*class=["'][^"']*\bbrand-mark\b[^"']*["'][^>]*>\s*<\/span>/gi,
    "",
  );
}

function stripEmptyLocaleGroupPlaceholders(rawHtml: string): string {
  return String(rawHtml || "").replace(
    /<div\b[^>]*class=["'][^"']*\blocale-group\b[^"']*["'][^>]*>\s*<\/div>/gi,
    "",
  );
}

function hasExplicitEnterpriseTechVisualOverride(requirementText: string): boolean {
  return /(?:\bIBM\b|\bCarbon\b)/i.test(String(requirementText || ""));
}

function hasCorporateB2BHomepageSignals(requirementText: string): boolean {
  const text = String(requirementText || "");
  const negative = /\b(portfolio|personal(?:\s+site)?|resume|curriculum vitae|cv|creator|newsletter|journal|media site|editorial blog)\b/i;
  const positive =
    /\b(company|corporate|enterprise|b2b|buyers?|procurement|manufacturer|manufacturing|factory|supplier|export|wholesale|distributor|hospitality|custom solutions?|product showcase|brand trust|inquiry)\b/i;
  if (negative.test(text) && !hasExplicitEnterpriseTechVisualOverride(text)) return false;
  return positive.test(text) || hasExplicitEnterpriseTechVisualOverride(text);
}

function shouldApplyCorporateB2BHomepageContract(
  requirementText: string,
  websiteSurfaceMode?: WebsiteSurfaceMode,
): boolean {
  if (websiteSurfaceMode) return websiteSurfaceMode === "corporate-b2b-site";
  return hasCorporateB2BHomepageSignals(requirementText);
}

function normalizeEnterpriseTechTextWordmarkShell(rawHtml: string, requirementText: string): string {
  const html = String(rawHtml || "");
  if (!html || !hasExplicitEnterpriseTechVisualOverride(requirementText)) return html;
  return html.replace(
    /class=(["'])([^"']*\b)brand-mark(\b[^"']*)\1/gi,
    (_match, quote, prefix, suffix) => `class=${quote}${prefix}brand__wordmark${suffix}${quote}`,
  );
}

function normalizeEnterpriseTechLegacyDirectionCopy(rawHtml: string, requirementText: string): string {
  let html = String(rawHtml || "");
  if (!html || !hasExplicitEnterpriseTechVisualOverride(requirementText)) return html;

  const replacements: Array<[RegExp, string]> = [
    [/\bHeritage textile manufacturing\b/gi, "Enterprise manufacturing"],
    [/\bHeritage manufacturing\b/gi, "Enterprise manufacturing"],
    [/\bheritage craft\b/gi, "enterprise manufacturing"],
    [/\bwarm,\s*structured presentation\b/gi, "structured enterprise presentation"],
    [/\bwarm palette\b/gi, "blue-and-white enterprise palette"],
  ];

  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }

  return html;
}

function replaceClassTokens(
  rawHtml: string,
  replacements: Array<{ from: string; to: string }>,
): string {
  const html = String(rawHtml || "");
  if (!html || replacements.length === 0) return html;
  return html.replace(/class=(["'])([^"']*)\1/gi, (_match, quote: string, classes: string) => {
    let next = classes;
    for (const replacement of replacements) {
      const pattern = new RegExp(`\\b${escapeRegExp(replacement.from)}\\b`, "g");
      next = next.replace(pattern, replacement.to);
    }
    next = next.replace(/\s+/g, " ").trim();
    return `class=${quote}${next}${quote}`;
  });
}

function normalizeCorporateHomepageOpeningRuntimePassThrough(rawHtml: string, filePath: string, requirementText: string): string {
  return String(rawHtml || "");
}

function routeFromHtmlPathForMediaTarget(filePath: string): string {
  const normalized = normalizePath(filePath);
  if (normalized === "/index.html") return "/";
  if (normalized.endsWith("/index.html")) return normalizePath(normalized.replace(/\/index\.html$/i, ""));
  return normalized;
}

function hasRenderedImageModule(rawHtml: string): boolean {
  return /<(?:img|picture)\b/i.test(String(rawHtml || ""));
}

function hasSyntheticSvgImageModule(rawHtml: string): boolean {
  return /<(?:img|source)\b[^>]+src=["']data:image\/svg\+xml/i.test(String(rawHtml || ""));
}

function hasFunctionalResponsiveNavDisclosure(stylesCss: string, scriptJs: string): boolean {
  const css = String(stylesCss || "");
  const script = String(scriptJs || "");
  if (!css || !script) return false;

  const hasToggleHook = /\b(?:data-nav-toggle|data-menu-toggle)\b/i.test(script);
  const hasOpenStateRule = /\.(?:site-nav|nav)\.is-open\b/i.test(css);
  const hasResponsiveToggleRule =
    /@media[\s\S]*?\.(?:mobile-nav-toggle|nav-toggle)(?:\.btn)?\b[\s\S]*?display\s*:\s*(?:inline-flex|flex|block)/i.test(css) ||
    /@media[\s\S]*?\.(?:mobile-nav-toggle|nav-toggle)(?:\.btn)?\b[\s\S]*?visibility\s*:\s*visible/i.test(css);
  const hasCollapsedNavRule =
    /@media[\s\S]*?\.(?:site-nav|nav)\b[\s\S]*?display\s*:\s*none/i.test(css) ||
    /@media[\s\S]*?\.(?:site-nav|nav)\b[\s\S]*?max-height\s*:\s*0/i.test(css);

  return hasToggleHook && hasOpenStateRule && hasResponsiveToggleRule && hasCollapsedNavRule;
}

function stripNonFunctionalNavToggle(rawHtml: string, keepResponsiveNavToggle: boolean): string {
  const html = String(rawHtml || "");
  if (!html || keepResponsiveNavToggle) return html;

  return html
    .replace(/<button\b[^>]*(?:data-nav-toggle|data-menu-toggle)[^>]*>[\s\S]*?<\/button>\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizePortfolioBlogPairedMediaLayout(rawHtml: string, filePath: string, requirementText: string): string {
  const html = String(rawHtml || "");
  const route = routeFromHtmlPathForMediaTarget(filePath);
  const requirement = String(requirementText || "");
  if (!html) return html;
  if (!/\b(?:portfolio|personal site|blog|writer|writing|essay|editorial|creator|consultant|technical blog)\b/i.test(requirement)) {
    return html;
  }

  let next = html;
  if ((route === "/" || route === "/blog") && /\bsplit-grid\b/i.test(next)) {
    next = next.replace(/\bsplit-grid\b/g, "split-grid split-grid--aligned");
  }
  if ((route === "/" || route === "/blog") && /\bmedia-frame\b/i.test(next)) {
    next = next.replace(/\bmedia-frame\b/g, "media-frame media-frame--paired");
  }

  return next;
}

function replaceSyntheticSvgMediaWithCuratedImage(rawHtml: string, filePath: string, requirementText: string): string {
  const html = String(rawHtml || "");
  if (!html) return html;
  if (!hasSyntheticSvgImageModule(html)) return html;

  const route = routeFromHtmlPathForMediaTarget(filePath);
  const image = selectCuratedLibraryImage(route, requirementText);
  if (!image) return html;

  const figureOpenPattern = /<figure\b([^>]*)>/i;
  const imgPattern = /<img\b([^>]*)src=(["'])data:image\/svg\+xml[^"']*\2([^>]*)>/i;
  if (!imgPattern.test(html)) return html;

  let next = html.replace(imgPattern, (_match, before: string, _quote: string, after: string) => {
    const loading = route === "/" ? "eager" : "lazy";
    return `<img${before}src="${escapeHtmlAttribute(image.src)}" alt="${escapeHtmlAttribute(image.alt)}" loading="${loading}"${after}>`;
  });

  if (figureOpenPattern.test(next)) {
    next = next.replace(figureOpenPattern, (match, attrs: string) => {
      const hasStockSource = /\bdata-stock-source=/.test(match);
      return hasStockSource ? match : `<figure${attrs} data-stock-source="curated-library">`;
    });
  }

  if (/<figcaption\b/i.test(next)) {
    next = next.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/i, `<figcaption>${escapeHtmlAttribute(image.caption)}</figcaption>`);
  }

  return next;
}

function normalizeEnterpriseHomepageInlineStyles(rawHtml: string, filePath: string, requirementText: string): string {
  return String(rawHtml || "");
}

function extractFirstHomepageSectionHtml(rawHtml: string): string {
  const html = String(rawHtml || "");
  const sectionMatch = html.match(/<section\b[\s\S]*?<\/section>/i);
  if (sectionMatch?.[0]) return sectionMatch[0];
  return html.slice(0, 5000);
}

function extractFirstMainSectionHtml(rawHtml: string): string {
  const html = String(rawHtml || "");
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const mainHtml = String(mainMatch?.[1] || html);
  const sectionMatch = mainHtml.match(/<section\b[\s\S]*?<\/section>/i);
  if (sectionMatch?.[0]) return sectionMatch[0];
  return mainHtml.slice(0, 5000);
}

function openingUsesLegacySplitHero(openingHtml: string): boolean {
  const opening = String(openingHtml || "");
  if (/\b(?:hero-grid|hero__grid|hero-panel|hero--split)\b/i.test(opening) || /<aside\b/i.test(opening)) {
    return true;
  }
  const routeOwnedCollectionLead =
    /\b(?:knowledge-hub-lead|resource-collection-lead|information-platform-lead|research-index-lead|collection-surface|research-open)\b/i.test(
      opening,
    );
  const legacyHeroUtilityInsideCollectionLead =
    /\b(?:hero__content|hero__actions|hero-title|hero-lead)\b/i.test(opening);
  return routeOwnedCollectionLead && legacyHeroUtilityInsideCollectionLead;
}

function footerNeedsStructuredShell(footerHtml: string, stylesCss = ""): boolean {
  const footer = String(footerHtml || "");
  if (!footer) return false;
  const sharedFooterUtilitiesDefined =
    /\.(?:site-footer__inner|footer(?:-|__)(?:inner|top|grid|brand|links|nav|meta|actions|bottom|panel|col|notes|title))\b/i.test(
      String(stylesCss || ""),
    );
  if (!sharedFooterUtilitiesDefined) return false;
  const hasLayoutShell =
    /\b(?:site-footer__inner|footer(?:-|__)(?:inner|grid|top|bottom|panel|col))\b/i.test(footer);
  const hasIdentityZone =
    /\bfooter(?:-|__)brand\b/i.test(footer) ||
    /<a\b[^>]*class=(["'])[^"']*\bbrand\b/i.test(footer) ||
    (/\bfooter(?:-|__)col\b/i.test(footer) && /<a\b[^>]*class=(["'])[^"']*\bbrand\b/i.test(footer));
  const hasNavigationZone =
    /\bfooter(?:-|__)(?:links|nav)\b/i.test(footer) ||
    (/<h[23]\b[\s\S]*?<\/h[23]>\s*<ul\b/i.test(footer) && /<li>\s*<a\b/gi.test(footer)) ||
    (/<ul\b[\s\S]*?<li>\s*<a\b/gi.test(footer) && (footer.match(/<li>\s*<a\b/gi) || []).length >= 3);
  const hasSupportZone =
    /\bfooter(?:-|__)(?:meta|actions|top|bottom|notes)\b/i.test(footer) ||
    /\bfineprint\b/i.test(footer);
  if (!hasFooterBandStyle(stylesCss)) return true;
  const structuredZoneCount = [hasLayoutShell, hasIdentityZone, hasNavigationZone, hasSupportZone].filter(Boolean).length;
  return structuredZoneCount < 3;
}

function findCorporateB2BHomepageContractIssues(
  rawHtml: string,
  filePath: string,
  requirementText: string,
  stylesCss = "",
  websiteSurfaceMode?: WebsiteSurfaceMode,
): string[] {
  const issues: string[] = [];
  if (normalizePath(filePath) !== "/index.html" || !shouldApplyCorporateB2BHomepageContract(requirementText, websiteSurfaceMode)) return issues;
  const fullHtml = String(rawHtml || "");
  const opening = extractFirstHomepageSectionHtml(rawHtml);
  if (!opening) return ["opening section missing"];

  const hasRealImageNode = /<(?:img|picture)\b/i.test(opening);
  const hasBackgroundImage = /\bbackground-image\s*:/i.test(opening);
  const hasRealImageInsideHeroMedia =
    /\benterprise-hero__media\b[\s\S]*?<(?:img|picture)\b/i.test(opening) ||
    /<(?:img|picture)\b[\s\S]*?\benterprise-hero__media\b/i.test(opening);
  const hasEnterpriseHero = /\benterprise-hero\b/i.test(opening);
  const hasEnterpriseHeroContent = /\benterprise-hero__content\b/i.test(opening);
  const hasEnterpriseHeroMedia = /\benterprise-hero__media\b/i.test(opening);
  const openingH1Count = Array.from(opening.matchAll(/<h1\b/gi)).length;
  const homepageH1Count = Array.from(fullHtml.matchAll(/<h1\b/gi)).length;
  if (!hasRealImageNode && !hasBackgroundImage) {
    issues.push("opening hero must include a real image node or background image");
  }
  if (!hasRealImageInsideHeroMedia) {
    issues.push("opening hero must place a real img/picture node inside enterprise-hero__media");
  }

  if (!hasEnterpriseHero) {
    issues.push("opening hero must use enterprise-hero markup rather than a generic hero shell");
  }

  if (!hasEnterpriseHeroContent) {
    issues.push("opening hero must expose enterprise-hero__content so the overlay copy is owned by the enterprise hero contract");
  }

  if (!hasEnterpriseHeroMedia && !hasBackgroundImage) {
    issues.push("opening hero must expose enterprise-hero__media or a real hero background image");
  }
  if (openingH1Count === 0) {
    issues.push("opening hero must contain the homepage H1 inside enterprise-hero__content");
  }
  if (openingH1Count > 1) {
    issues.push("opening hero must not contain more than one H1");
  }
  if (homepageH1Count !== 1) {
    issues.push("homepage must contain exactly one H1");
  }

  if (/\bdata:image\/svg\+xml/i.test(opening)) {
    issues.push("opening hero uses inline SVG placeholder media instead of a real photographic asset");
  }

  if (/\b(?:enterprise-hero-visual|visual-content|visual-note|media-panel|media-frame)\b/i.test(opening)) {
    issues.push("opening hero still uses placeholder media scaffolding instead of a real planned hero image");
  }

  if (/\b(?:hero-grid|hero__grid|hero-panel|hero-copy)\b/i.test(opening) || /<aside\b/i.test(opening)) {
    issues.push("opening hero fell back to legacy split-hero markup instead of the enterprise hero contract");
  }

  const openingVisibleText = htmlVisibleText(opening);
  if (/\b(?:text wordmark|wordmark brand|site experience|language strategy|english-first|i18n|locale)\b/i.test(openingVisibleText)) {
    issues.push("opening hero exposes implementation wording instead of visitor-facing enterprise copy");
  }

  if (/\bcontent-band--split\b/i.test(fullHtml) || /<aside\b[^>]*class=["'][^"']*\bdetail\b/i.test(fullHtml)) {
    issues.push("homepage capability zone fell back to split content + sidebar instead of one unified capability band");
  }
  const mainHtmlMatch = fullHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const mainHtml = String(mainHtmlMatch?.[1] || fullHtml || "");
  const mainWithoutOpening = opening ? mainHtml.replace(opening, "") : mainHtml;
  const nonOpeningHeroTitleH1Count = Array.from(
    mainWithoutOpening.matchAll(/<h1\b[^>]*class=["'][^"']*\bhero-title\b[^"']*["'][^>]*>/gi),
  ).length;
  const nonOpeningH1Count = Array.from(mainWithoutOpening.matchAll(/<h1\b/gi)).length;
  if (nonOpeningHeroTitleH1Count > 0 || nonOpeningH1Count > 0) {
    issues.push("homepage capability zone introduced a second hero-scale H1 instead of using H2/section-title semantics");
  }

  if (/<nav\b[^>]*>[\s\S]*?\bclass=["'][^"']*\blocale-switch\b/i.test(fullHtml)) {
    issues.push("header locale controls leaked into the primary nav instead of a dedicated adjacent utility wrapper");
  }

  if (/<div class="utility language-switch"[^>]*>\s*<\/div>/i.test(fullHtml)) {
    issues.push("header emitted an empty locale utility shell");
  }

  const styles = String(stylesCss || "");
  if (styles) {
    if (/\.enterprise-hero\b[^{}]*\{[^}]*\bgrid-template-columns\s*:/i.test(styles)) {
      issues.push("homepage hero CSS still uses a split-panel grid-template-columns layout instead of one image-backed overlay surface");
    }
    const enterpriseHeroContentBlock =
      styles.match(/\.enterprise-hero__content\b[^{}]*\{([^}]*)\}/i)?.[1] || "";
    const enterpriseHeroContentDeclarations = enterpriseHeroContentBlock
      .split(";")
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const backgroundDeclaration = enterpriseHeroContentDeclarations.find((part) =>
      /^background(?:-image|-color)?\s*:/i.test(part),
    );
    if (
      backgroundDeclaration &&
      !/^background(?:-image|-color)?\s*:\s*(?:transparent|none|unset|initial|rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\)|#(?:0000|00000000))\s*$/i.test(
        backgroundDeclaration,
      )
    ) {
      issues.push("homepage hero copy layer still has its own background surface instead of transparent overlay text");
    }
    const boxShadowDeclaration = enterpriseHeroContentDeclarations.find((part) => /^box-shadow\s*:/i.test(part));
    if (
      boxShadowDeclaration &&
      !/^box-shadow\s*:\s*(?:none|0|0px|0\s+0(?:\s+0(?:\s+0)?)?|unset|initial)\s*$/i.test(boxShadowDeclaration)
    ) {
      issues.push("homepage hero copy layer still uses card shadow/panel styling instead of a clean overlay layer");
    }
    const hasAbsoluteMediaLayer =
      /\.enterprise-hero__media\b[\s\S]*?\{[\s\S]*?\bposition\s*:\s*absolute\b[\s\S]*?\binset\s*:\s*0\b/i.test(styles) ||
      /\.enterprise-hero\s+\.enterprise-hero__media\b[\s\S]*?\{[\s\S]*?\bposition\s*:\s*absolute\b[\s\S]*?\binset\s*:\s*0\b/i.test(styles);
    if (!hasAbsoluteMediaLayer) {
      issues.push("homepage hero CSS must make enterprise-hero__media fill the hero container as the underlying media layer");
    }
  }

  return issues;
}

function buildInjectedMediaFigure(
  image: {
    src: string;
    alt: string;
    caption: string;
  },
  eager = false,
  classes: string[] = ["shpitto-stock-media"],
): string {
  const loading = eager ? "eager" : "lazy";
  const className = Array.from(new Set(classes.filter(Boolean))).join(" ").trim() || "shpitto-stock-media";
  return [
    `<figure class="${escapeHtmlAttribute(className)}" data-stock-source="curated-library">`,
    `  <img src="${escapeHtmlAttribute(image.src)}" alt="${escapeHtmlAttribute(image.alt)}" loading="${loading}" />`,
    `  <figcaption>${escapeHtmlAttribute(image.caption)}</figcaption>`,
    `</figure>`,
  ].join("\n");
}

function injectCuratedMediaIntoHtml(rawHtml: string, filePath: string, requirementText: string): string {
  const route = routeFromHtmlPathForMediaTarget(filePath);
  if (route === "/" && hasCorporateB2BHomepageSignals(requirementText)) {
    return String(rawHtml || "");
  }
  const html = normalizePortfolioBlogPairedMediaLayout(
    replaceSyntheticSvgMediaWithCuratedImage(rawHtml, filePath, requirementText),
    filePath,
    requirementText,
  );
  if (!html || hasRenderedImageModule(html)) return html;
  const image = selectCuratedLibraryImage(route, requirementText);
  if (!image) return html;
  const figureClasses = ["shpitto-stock-media"];
  if (route === "/" && hasCorporateB2BHomepageSignals(requirementText)) {
    figureClasses.push("shpitto-stock-media--enterprise-proof");
  }
  const figure = buildInjectedMediaFigure(image, route === "/", figureClasses);

  const mediaFramePattern = /<([a-zA-Z][\w:-]*)\b([^>]*)class=(["'])([^"']*\bmedia-frame\b[^"']*)\3([^>]*)>/i;
  if (mediaFramePattern.test(html)) {
    return html.replace(mediaFramePattern, (match) => `${match}\n${figure}`);
  }

  const panelPattern = /<aside\b([^>]*)class=(["'])([^"']*\bpanel\b[^"']*)\2([^>]*)>/i;
  if (panelPattern.test(html)) {
    return html.replace(panelPattern, (match) => `${match}\n${figure}`);
  }

  const heroGridPattern = /<div\b([^>]*)class=(["'])([^"']*\bhero__grid\b[^"']*)\2([^>]*)>/i;
  if (heroGridPattern.test(html)) {
    return html.replace(heroGridPattern, (match) => `${match}\n${figure}`);
  }

  const detailLayoutPattern = /<div\b([^>]*)class=(["'])([^"']*\bdetail-layout\b[^"']*)\2([^>]*)>/i;
  if (detailLayoutPattern.test(html)) {
    return html.replace(detailLayoutPattern, (match) => `${match}\n${figure}`);
  }

  const detailGridPattern = /<div\b([^>]*)class=(["'])([^"']*\bdetail-grid\b[^"']*)\2([^>]*)>/i;
  if (detailGridPattern.test(html)) {
    return html.replace(detailGridPattern, (match) => `${match}\n${figure}`);
  }

  const detailBodyPattern = /<div\b([^>]*)class=(["'])([^"']*\bdetail-body\b[^"']*)\2([^>]*)>/i;
  if (detailBodyPattern.test(html)) {
    return html.replace(detailBodyPattern, (match) => `${figure}\n${match}`);
  }

  const sectionHeadingPattern = /<div\b([^>]*)class=(["'])([^"']*\bsection-heading\b[^"']*)\2([^>]*)>\s*([\s\S]*?)<\/div>/i;
  if (sectionHeadingPattern.test(html)) {
    return html.replace(sectionHeadingPattern, (match) => `${match}\n${figure}`);
  }

  const sectionHeadPattern = /<div\b([^>]*)class=(["'])([^"']*\bsection-head\b[^"']*)\2([^>]*)>\s*([\s\S]*?)<\/div>/i;
  if (sectionHeadPattern.test(html)) {
    return html.replace(sectionHeadPattern, (match) => `${match}\n${figure}`);
  }

  if (route === "/" && hasCorporateB2BHomepageSignals(requirementText)) {
    const mastheadSectionPattern = /<section\b[^>]*class=["'][^"']*\bmasthead\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i;
    if (mastheadSectionPattern.test(html)) {
      return html.replace(mastheadSectionPattern, (match) => `${match}\n${figure}`);
    }
  }

  const mainPattern = /<main\b[^>]*>/i;
  if (mainPattern.test(html)) {
    return html.replace(mainPattern, (match) => `${match}\n${figure}`);
  }

  return html;
}

export function stripEmptyBrandMarkPlaceholdersForTesting(rawHtml: string): string {
  return stripEmptyBrandMarkPlaceholders(rawHtml);
}

export function hasExplicitBlogDetailFillRequestForTesting(requirementText = ""): boolean {
  return hasExplicitBlogDetailFillRequest(requirementText);
}

export function stripEmptyLocaleGroupPlaceholdersForTesting(rawHtml: string): string {
  return stripEmptyLocaleGroupPlaceholders(rawHtml);
}

export function normalizeEnterpriseTechTextWordmarkShellForTesting(rawHtml: string, requirementText: string): string {
  return normalizeEnterpriseTechTextWordmarkShell(rawHtml, requirementText);
}

export function normalizeEnterpriseTechLegacyDirectionCopyForTesting(rawHtml: string, requirementText: string): string {
  return normalizeEnterpriseTechLegacyDirectionCopy(rawHtml, requirementText);
}

export function normalizeCorporateHomepageOpeningRuntimePassThroughForTesting(
  rawHtml: string,
  filePath: string,
  requirementText: string,
): string {
  return normalizeCorporateHomepageOpeningRuntimePassThrough(rawHtml, filePath, requirementText);
}

export function injectCuratedMediaIntoHtmlForTesting(rawHtml: string, filePath: string, requirementText: string): string {
  return injectCuratedMediaIntoHtml(rawHtml, filePath, requirementText);
}

export function injectCuratedMediaIntoHtmlForPreview(rawHtml: string, filePath: string, requirementText: string): string {
  return injectCuratedMediaIntoHtml(rawHtml, filePath, requirementText);
}

export function normalizeEnterpriseHomepageInlineStylesForTesting(
  rawHtml: string,
  filePath: string,
  requirementText: string,
): string {
  return normalizeEnterpriseHomepageInlineStyles(rawHtml, filePath, requirementText);
}

export function findCorporateB2BHomepageContractIssuesForTesting(
  rawHtml: string,
  filePath: string,
  requirementText: string,
  stylesCss = "",
  websiteSurfaceMode?: WebsiteSurfaceMode,
): string[] {
  return findCorporateB2BHomepageContractIssues(rawHtml, filePath, requirementText, stylesCss, websiteSurfaceMode);
}

export function findSurfaceHomepageArchetypeIssuesForTesting(params: {
  html: string;
  pagePath: string;
  decision: LocalDecisionPlan;
  requirementText: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
}): string[] {
  return findSurfaceHomepageArchetypeIssues({ ...params, force: true });
}

export function findVisiblePageMechanicsScaffoldForTesting(html: string): string[] {
  return findVisiblePageMechanicsScaffold(html);
}

export function normalizeWebsiteStaticFilesForPreview(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): RuntimeWorkflowFile[] {
  const requirementText = String(params.requirementText || params.decision?.requirementText || "");
  const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(requirementText);
  const wantsBilingualExperience = shouldUseLocaleExperience(requirementText, params.decision.locale);
  const workflowSurfaceSelection = resolveWorkflowSurfaceSelection(
    (((params.decision as any)?.workflow_context || {}) as Record<string, unknown>) || undefined,
  );
  const indexOnlyPortfolioBlogFirstPass = shouldUseIndexOnlyPortfolioBlogFirstPass({
    requirementText,
    websiteSurfaceMode: workflowSurfaceSelection.websiteSurfaceMode,
  });
  const sharedStylesCss = String(
    (params.files || []).find((file) => normalizePath(String(file?.path || "")) === "/styles.css")?.content || "",
  );
  const sharedScriptJs = String(
    (params.files || []).find((file) => normalizePath(String(file?.path || "")) === "/script.js")?.content || "",
  );
  const keepResponsiveNavToggle = hasFunctionalResponsiveNavDisclosure(sharedStylesCss, sharedScriptJs);
  return dedupeFiles(
    (params.files || [])
      .filter((file) => !(indexOnlyPortfolioBlogFirstPass && isBlogDetailHtmlPath(String(file?.path || ""))))
      .map((file) => {
      const filePath = normalizePath(String(file?.path || ""));
      const content = String(file?.content || "");
      const type = String(file?.type || guessMimeByPath(filePath));
      if (filePath === "/styles.css") {
        return {
          path: filePath,
          content: normalizeGeneratedCss(content),
          type,
        };
      }
      if (filePath === "/script.js") {
        return {
          path: filePath,
          content: normalizeGeneratedJs(content, requirementText, params.decision.locale),
          type,
        };
      }
      if (!filePath.toLowerCase().endsWith(".html")) {
        return {
          path: filePath,
          content,
          type,
        };
      }

      const sanitized = sanitizeWebsiteSkillHtmlOutputForAdapter(filePath, content, requirementText);
      const withDocument = wantsBilingualExperience
        ? ensureBilingualHtmlShell(sanitized, defaultVisibleLanguage, requirementText, params.decision.locale)
        : ensureHtmlDocument(sanitized);
      const routeScopedHtml = rewriteAbsoluteSiteLinksToRelative(withDocument, filePath);
      const html = injectCuratedMediaIntoHtml(
        normalizeEnterpriseTechLegacyDirectionCopy(
          normalizeEnterpriseTechTextWordmarkShell(
            stripEmptyLocaleGroupPlaceholders(
              stripEmptyBrandMarkPlaceholders(
                stripNonFunctionalNavToggle(
                  enforceNavigationOrder(
                    indexOnlyPortfolioBlogFirstPass && normalizePath(filePath) === "/blog/index.html"
                      ? String(routeScopedHtml || "").replace(
                          /<a\b([^>]*)href=(["'])\/blog\/[^"']+\/?\2([^>]*)>([\s\S]*?)<\/a>/gi,
                          (_match, beforeHref: string, _quote: string, afterHref: string, inner: string) =>
                            `<span${String(beforeHref || "")}${String(afterHref || "")}>${String(inner || "")}</span>`,
                        )
                      : routeScopedHtml,
                    params.decision,
                    requirementText,
                  ),
                  keepResponsiveNavToggle,
                ),
              ),
            ),
            requirementText,
          ),
          requirementText,
        ),
        filePath,
        requirementText,
      );
      return {
        path: filePath,
        content: injectConsultationFormOnAllowedHost(
          filePath,
          normalizeEnterpriseHomepageInlineStyles(
            normalizeCorporateHomepageOpeningRuntimePassThrough(html, filePath, requirementText),
            filePath,
            requirementText,
          ),
          requirementText,
        ),
        type,
      };
      }),
  );
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

function extractRequirementText(state: AgentState): string {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const humanMessages: string[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    const content = extractMessageContent(msg);
    if (!content) continue;

    const ctorName = String(msg?.constructor?.name || "").toLowerCase();
    const role = String(msg?.role || "").toLowerCase();
    const type = String(msg?.type || msg?._getType?.() || "").toLowerCase();
    const idPath = Array.isArray(msg?.id) ? msg.id.join("/") : String(msg?.id || "");
    const isHumanLike =
      ctorName === "humanmessage" ||
      role === "user" ||
      role === "human" ||
      type === "human" ||
      type === "humanmessage" ||
      /humanmessage/i.test(idPath);
    if (isHumanLike) humanMessages.push(content);
  }
  const workflow = (state as any)?.workflow_context || {};
  const executionMode = String(workflow.executionMode || "").trim().toLowerCase();
  const requirementSources = [
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
  return Array.from(new Set(requirementSources.filter(Boolean))).join("\n\n").trim();
}

function extractPageTitleForRoute(route: string, locale: "zh-CN" | "en"): string {
  const normalized = normalizePath(route);
  if (normalized === "/") return locale === "zh-CN" ? "\u9996\u9875" : "Home";
  const token = normalized.split("/").filter(Boolean).join(" ");
  const title = token
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return title || (locale === "zh-CN" ? "\u9875\u9762" : "Page");
}

function localizedKnownRouteLabel(route: string, locale: "zh-CN" | "en"): string {
  const normalized = normalizeRouteKey(route);
  const known = new Map<string, { zh: string; en: string }>([
    ["/", { zh: "首页", en: "Home" }],
    ["/products", { zh: "产品", en: "Products" }],
    ["/custom-solutions", { zh: "定制方案", en: "Custom Solutions" }],
    ["/cases", { zh: "案例", en: "Cases" }],
    ["/contact", { zh: "联系", en: "Contact" }],
    ["/about", { zh: "关于", en: "About" }],
    ["/blog", { zh: "博客", en: "Blog" }],
  ]);
  const mapped = known.get(normalized);
  if (mapped) return locale === "zh-CN" ? mapped.zh : mapped.en;
  const suffixKnown = [
    { pattern: /(?:^|\/)(?:[^/]+-)?creation$/i, zh: "创建", en: "Creation" },
    { pattern: /(?:^|\/)(?:[^/]+-)?construction$/i, zh: "建设", en: "Construction" },
    { pattern: /(?:^|\/)(?:[^/]+-)?certification$/i, zh: "认证", en: "Certification" },
    { pattern: /(?:^|\/)(?:[^/]+-)?advocacy$/i, zh: "倡议", en: "Advocacy" },
    { pattern: /(?:^|\/)(?:[^/]+-)?research(?:-center)?$/i, zh: "研究", en: "Research" },
    { pattern: /(?:^|\/)(?:[^/]+-)?information(?:-platform)?$/i, zh: "信息", en: "Information" },
    { pattern: /(?:^|\/)standards(?:-system|-library)?$/i, zh: "标准", en: "Standards" },
    { pattern: /(?:^|\/)case(?:-studies|-study)?$/i, zh: "案例", en: "Cases" },
  ];
  const suffixMatch = suffixKnown.find((item) => item.pattern.test(normalized));
  if (suffixMatch) return locale === "zh-CN" ? suffixMatch.zh : suffixMatch.en;
  return extractPageTitleForRoute(normalized, locale);
}

function resolveBrandName(decision: LocalDecisionPlan): string {
  const explicit = String(decision.brandHint || "").trim();
  if (explicit) return explicit;
  return decision.locale === "zh-CN" ? "\u7f51\u7ad9" : "Website";
}

function contractDigest(plan: LocalDecisionPlan): string {
  return plan.pageBlueprints
    .map(
      (page) =>
        `- ${page.route}\n  navLabel: ${page.navLabel}\n  source: ${page.source}\n  kind: ${page.pageKind}\n  intent: ${page.purpose}${
          page.contentSkeleton.length ? `\n  skeleton: ${page.contentSkeleton.join(" -> ")}` : ""
        }${page.constraints.length ? `\n  constraints: ${page.constraints.join(" | ")}` : ""}`,
    )
    .join("\n");
}

function extractTopLevelMarkdownSection(source: string, headingPattern: RegExp): string {
  const text = String(source || "");
  const match = headingPattern.exec(text);
  if (!match || match.index === undefined) return "";
  const start = match.index;
  const afterHeadingIndex = start + match[0].length;
  const tail = text.slice(afterHeadingIndex);
  const nextHeadingOffset = tail.search(/\n##\s+/);
  const end = nextHeadingOffset >= 0 ? afterHeadingIndex + nextHeadingOffset : text.length;
  return text.slice(start, end).trim();
}

function compactSection(text: string, maxChars: number): string {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (!Number.isFinite(maxChars) || maxChars <= 0 || normalized.length <= maxChars) return normalized;
  return clipRuntimeRequirement(normalized, maxChars);
}

function parsePromptControlManifestJson(source: string): Record<string, unknown> | null {
  const matches = Array.from(
    String(source || "").matchAll(
      /^###\s+Prompt Control Manifest(?:\s*\(Machine Readable\))?[^\n]*\s*(?:\r?\n)+```(?:json)?\s*([\s\S]*?)```/gim,
    ),
  );
  const rawJson = String(matches.at(-1)?.[1] || "").trim();
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildLocalePlanFromManifestOverride(
  requirementText: string,
  fallbackLocale?: string,
): ReturnType<typeof buildLocalePlan> | null {
  const parsed = parsePromptControlManifestJson(requirementText);
  if (!parsed) return null;
  const localeConfig =
    parsed.localeConfig && typeof parsed.localeConfig === "object" && !Array.isArray(parsed.localeConfig)
      ? (parsed.localeConfig as Record<string, unknown>)
      : null;
  const discoveryBrief =
    parsed.discoveryBrief && typeof parsed.discoveryBrief === "object" && !Array.isArray(parsed.discoveryBrief)
      ? (parsed.discoveryBrief as Record<string, unknown>)
      : null;
  const normalizeVisibleLocale = (value: string): "zh-CN" | "en" => (value === "zh-CN" ? "zh-CN" : "en");
  const modeRaw = String(localeConfig?.mode || discoveryBrief?.localeMode || "").trim().toLowerCase();
  const normalizedMode =
    modeRaw === "bilingual" || modeRaw === "multilingual" || modeRaw === "single"
      ? modeRaw
      : modeRaw === "zh" || modeRaw === "zh-cn" || modeRaw === "en"
        ? "single"
        : "";
  const defaultLocale = normalizeVisibleLocale(
    normalizeLocaleCode(String(localeConfig?.defaultLocale || discoveryBrief?.defaultLocale || fallbackLocale || "")) ||
      buildLocalePlan(requirementText, fallbackLocale).defaultLocale,
  );
  const manifestLocales = normalizeLocaleList(localeConfig?.locales || discoveryBrief?.supportedLocales);
  const locales =
    manifestLocales.length > 0
      ? Array.from(new Set([defaultLocale, ...manifestLocales.filter(Boolean)]))
      : normalizedMode === "bilingual"
        ? [defaultLocale, defaultLocale === "zh-CN" ? "en" : "zh-CN"]
        : [defaultLocale];
  if (!normalizedMode) return null;
  if (normalizedMode === "bilingual") {
    return {
      mode: "bilingual",
      defaultLocale,
      locales: Array.from(new Set(locales.slice(0, 2))),
      translationDriven: false,
      sourceCatalogPath: getLocaleMessagePath(defaultLocale),
      registryPath: I18N_LOCALE_REGISTRY_PATH,
    };
  }
  if (normalizedMode === "multilingual") {
    return {
      mode: "multilingual",
      defaultLocale,
      locales: Array.from(new Set(locales)),
      translationDriven: true,
      sourceCatalogPath: getLocaleMessagePath(defaultLocale),
      registryPath: I18N_LOCALE_REGISTRY_PATH,
    };
  }
  if (normalizedMode === "single") {
    return {
      mode: "single",
      defaultLocale,
      locales: [defaultLocale],
      translationDriven: false,
      sourceCatalogPath: getLocaleMessagePath(defaultLocale),
      registryPath: I18N_LOCALE_REGISTRY_PATH,
    };
  }
  return null;
}

function buildEffectiveLocalePlan(requirementText: string, fallbackLocale?: string): ReturnType<typeof buildLocalePlan> {
  return buildLocalePlanFromManifestOverride(requirementText, fallbackLocale) || buildLocalePlan(requirementText, fallbackLocale);
}

function manifestDeclaredHtmlFiles(decision: LocalDecisionPlan): string[] {
  if (!isClosedManifestAuthority(decision)) return [];
  const parsed = parsePromptControlManifestJson(decision.requirementText || "");
  const files = Array.isArray(parsed?.files) ? parsed.files : [];
  return Array.from(
    new Set(
      files
        .map((item) => normalizePath(String(item || "")))
        .filter((filePath) => filePath.endsWith(".html")),
    ),
  );
}

function buildSkeletonPromptRequirementContext(requirementText: string): string {
  const source = String(requirementText || "").trim();
  if (!source) return "";
  if (source.length <= DEFAULT_SKELETON_PROMPT_CONTEXT_CHARS) return source;

  const sections = [
    extractTopLevelMarkdownSection(source, /^##\s*0\b.*$/im),
    extractTopLevelMarkdownSection(source, /^##\s*0\.5\b.*$/im),
    extractTopLevelMarkdownSection(source, /^##\s*1\.5\b.*$/im),
    extractTopLevelMarkdownSection(source, /^##\s*1\.6\b.*$/im),
    extractTopLevelMarkdownSection(source, /^##\s*3\.5\b.*$/im),
  ]
    .map((section) => compactSection(section, section.includes("Prompt Control Manifest") ? 5_000 : 2_000))
    .filter(Boolean);

  const sourceAddendum = compactSection(
    extractTopLevelMarkdownSection(source, /^##\s*(?:7\.\s+Evidence Brief|7\.5\s+External Research Addendum|Website Knowledge Profile)\b.*$/im),
    3_500,
  );
  if (sourceAddendum) sections.push(sourceAddendum);

  const combined = Array.from(new Set(sections)).filter(Boolean).join("\n\n");
  if (!combined) return clipRuntimeRequirement(source, DEFAULT_SKELETON_PROMPT_CONTEXT_CHARS);
  if (combined.length <= DEFAULT_SKELETON_PROMPT_CONTEXT_CHARS) return combined;
  return clipRuntimeRequirement(combined, DEFAULT_SKELETON_PROMPT_CONTEXT_CHARS);
}

function stripLegacyGenerationBlueprintSections(text: string): string {
  const source = String(text || "");
  const headingMatch = source.match(/^##\s*3\.5\b.*$/im);
  if (!headingMatch || headingMatch.index === undefined) return source;
  const heading = headingMatch[0] || "";
  if (/Prompt Control Manifest/i.test(heading)) return source;

  const start = headingMatch.index;
  const before = source.slice(0, start).trimEnd();
  const afterStart = start + heading.length;
  const nextTopLevelHeading = source.slice(afterStart).search(/\n##\s+(?!3\.5\b)/);
  const after = nextTopLevelHeading >= 0 ? source.slice(afterStart + nextTopLevelHeading).trimStart() : "";
  return [before, after].filter(Boolean).join("\n\n").trim();
}

export function sanitizeRequirementForGenerationForTesting(text: string): string {
  return stripLegacyGenerationBlueprintSections(text);
}

export function buildSkeletonPromptRequirementContextForTesting(text: string): string {
  return buildSkeletonPromptRequirementContext(text);
}

export function normalizeGeneratedCssForTesting(rawCss: string): string {
  return normalizeGeneratedCss(rawCss);
}

export function syncSharedCssVariablesToStylePresetForTesting(rawCss: string, stylePreset: DesignStylePreset): string {
  return syncSharedCssVariablesToStylePreset(rawCss, stylePreset);
}

export function requiredFileChecklistForTesting(
  decision: LocalDecisionPlan,
  params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
): string[] {
  return requiredFileChecklist(decision, params);
}

export function planRoundObjectiveForTesting(
  round: number,
  missingFiles: string[],
): { targetFiles: string[]; instruction: string; strictSingleTarget: boolean } {
  return planRoundObjective(round, missingFiles);
}

export function didRoundMateriallyChangeFilesForTesting(
  previousFiles: Array<{ path?: string; content?: string; type?: string }>,
  currentFiles: Array<{ path?: string; content?: string; type?: string }>,
  emittedPathsThisRound: string[],
): boolean {
  return didRoundMateriallyChangeFiles(previousFiles, currentFiles, emittedPathsThisRound);
}

export function extractQaRepairTargetsForTesting(feedback: string): string[] {
  return extractQaRepairTargets(feedback);
}

export function buildQaRepairGuidanceForTesting(
  feedback: string,
  requirementText = "",
  qaRepairTargets: string[] = [],
): string[] {
  return buildQaRepairGuidance(feedback, requirementText, qaRepairTargets);
}

export function buildQaRepairMessageForTesting(
  feedback: string,
  requirementText = "",
): {
  message: string;
  targets: string[];
  guidance: string[];
} {
  return buildQaRepairMessage(feedback, requirementText);
}

export function collapseVisibleBilingualPairsForTesting(rawHtml: string, defaultVisibleLanguage: "zh-CN" | "zh" | "en"): string {
  return collapseVisibleBilingualPairs(rawHtml, defaultVisibleLanguage);
}

export function ensureEnglishFirstI18nResourceFilesForTesting(
  files: RuntimeWorkflowFile[],
  requirementText = "",
  locale?: string,
): RuntimeWorkflowFile[] {
  return ensureEnglishFirstI18nResourceFiles(files, requirementText, locale);
}

export function findVisibleSimultaneousBilingualCopyForTesting(html: string): string[] {
  return findVisibleSimultaneousBilingualCopy(html);
}

export function normalizeGeneratedJsForTesting(rawJs: string, requirementText = ""): string {
  return normalizeGeneratedJs(rawJs, requirementText);
}

export function resolveRoundTimeoutsForTesting(params: {
  taskTimeoutMs: number;
  targetFileCount: number;
}): { idleTimeoutMs: number; absoluteTimeoutMs: number } {
  return resolveRoundTimeouts(params);
}

export function resolveExpectedRequiredFileCountForTesting(params: {
  decision: LocalDecisionPlan;
  adapter: SkillExecutionAdapter;
  files?: RuntimeWorkflowFile[];
  requirementText?: string;
}): number {
  return resolveExpectedRequiredFileCount(params);
}

export function resolveWorkflowSurfaceSelectionForTesting(workflowContext: Record<string, unknown> | undefined) {
  return resolveWorkflowSurfaceSelection(workflowContext);
}

function clipRuntimeRequirement(input: string, maxChars: number): string {
  const text = String(input || "").trim();
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  const markerIndex = text.search(/\n##\s+(?:7\.\s+Evidence Brief|7\.5\s+External Research Addendum|Website Knowledge Profile)\b/i);
  if (markerIndex > 0 && markerIndex < text.length - 200) {
    const headBudget = Math.max(6_000, Math.floor(maxChars * 0.42));
    const sourceBudget = Math.max(2_000, maxChars - headBudget - 96);
    return [
      text.slice(0, headBudget).trim(),
      "",
      "[Middle omitted due to prompt budget; source addendum preserved below]",
      "",
      text.slice(markerIndex, markerIndex + sourceBudget).trim(),
    ].join("\n");
  }
  const headBudget = Math.max(2_000, Math.floor(maxChars * 0.58));
  const tailBudget = Math.max(1_000, maxChars - headBudget - 80);
  return [
    text.slice(0, headBudget).trim(),
    "",
    "[Middle omitted due to prompt budget]",
    "",
    text.slice(-tailBudget).trim(),
  ].join("\n");
}

// Page-contract generation moved to website-page-contract.ts so executor remains replaceable.

function findPageBlueprint(plan: LocalDecisionPlan, route: string): PageBlueprint {
  const normalized = normalizePath(route);
  return (
    plan.pageBlueprints.find((page) => normalizePath(page.route) === normalized) || {
      route: normalized,
      navLabel: extractPageTitleForRoute(normalized, plan.locale),
      purpose: "Dedicated page derived from the confirmed Canonical Website Prompt and source content.",
      source: "default",
      constraints: [
        "Canonical Website Prompt is authoritative.",
        "Do not use preset industry content.",
        "Stay distinct from sibling pages.",
      ],
      pageKind: "intent",
      responsibility: "Dedicated page derived from the confirmed Canonical Website Prompt and source content.",
      contentSkeleton: [],
      componentMix: { hero: 0, feature: 0, grid: 0, proof: 0, form: 0, cta: 0 },
    }
  );
}

function buildBilingualProtocolReference(
  defaultVisibleLanguage: "zh-CN" | "zh" | "en",
  requirementText = "",
  locale?: string,
): string {
  const visibleTitle = "Thoughtful AI notes for everyday readers.";
  const visibleLead = "Calm editorial guidance for people who want practical AI judgment.";
  const localePlan = buildEffectiveLocalePlan(requirementText, locale || defaultVisibleLanguage);
  if (localePlan.mode === "multilingual") {
    return [
      "Translation-driven locale reference scaffold (adapt the copy, keep the protocol):",
      '<header><nav><a href="/" data-i18n="nav.home">Home</a><a href="/blog/" data-i18n="nav.blog">Blog</a></nav><div class="header-utility"><label class="locale-switch"><span class="sr-only">Language</span><select data-locale-select><option value="zh-CN">zh-CN</option><option value="en">en</option><option value="ja">ja</option></select></label></div></header>',
      `<h1 data-i18n="home.hero.title">${visibleTitle}</h1>`,
      `<p data-i18n="home.hero.lead">${visibleLead}</p>`,
      `${I18N_LOCALE_REGISTRY_PATH}: {"defaultLocale":"${localePlan.defaultLocale}","locales":${JSON.stringify(localePlan.locales)},"translationDriven":true,"sourceCatalog":"${localePlan.sourceCatalogPath}"}`,
      `${localePlan.sourceCatalogPath}: {"nav.home":"${localePlan.defaultLocale === "zh-CN" ? "首页" : "Home"}","nav.blog":"${localePlan.defaultLocale === "zh-CN" ? "博客" : "Blog"}","home.hero.title":"${localePlan.defaultLocale === "zh-CN" ? "写给每个人的 AI 小笔记。" : "Thoughtful AI notes for everyday readers."}","home.hero.lead":"${localePlan.defaultLocale === "zh-CN" ? "用克制、实用的方式解释 AI 如何进入日常判断。" : "Calm editorial guidance for people who want practical AI judgment."}"}`,
      "Keep the initial HTML visibly source-locale only. Later translation passes should emit additional /i18n/messages.{locale}.json files without regenerating route HTML.",
    ].join("\n");
  }
  return [
    "English-first i18n-ready reference scaffold (adapt the copy, keep the exact protocol):",
    '<header><nav><a href="/" data-i18n="nav.home">Home</a><a href="/blog/" data-i18n="nav.blog">Blog</a><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button><button type="button" data-locale-toggle data-locale="en">EN</button></nav></header>',
    `<h1 data-i18n="home.hero.title">${visibleTitle}</h1>`,
    `<p data-i18n="home.hero.lead">${visibleLead}</p>`,
    `${I18N_MESSAGE_EN_PATH}: {"nav.home":"Home","nav.blog":"Blog","home.hero.title":"Thoughtful AI notes for everyday readers.","home.hero.lead":"Calm editorial guidance for people who want practical AI judgment."}`,
    `${I18N_MESSAGE_ZH_CN_PATH}: {"nav.home":"首页","nav.blog":"博客","home.hero.title":"写给每个人的 AI 小笔记。","home.hero.lead":"用克制、实用的方式解释 AI 如何进入日常判断。"}`,
    "Keep the initial HTML visibly English-only. /script.js may swap text using the i18n JSON files when the locale changes.",
  ].join("\n");
}

function isSharedAssetPath(targetFile: string): boolean {
  const normalized = normalizePath(targetFile);
  return normalized === "/styles.css" || normalized === "/script.js" || isI18nMessagePath(normalized);
}

function isSharedAssetRound(targetFiles: string[]): boolean {
  const normalizedTargets = (targetFiles || []).map((target) => normalizePath(target)).filter(Boolean);
  return normalizedTargets.length > 0 && normalizedTargets.every((target) => isSharedAssetPath(target));
}

function isIsolatedHomeRound(targetFiles: string[]): boolean {
  const normalizedTargets = (targetFiles || []).map((target) => normalizePath(target)).filter(Boolean);
  return normalizedTargets.length === 1 && normalizedTargets[0] === "/index.html";
}

function isIsolatedInteriorHtmlRound(targetFiles: string[]): boolean {
  const normalizedTargets = (targetFiles || []).map((target) => normalizePath(target)).filter(Boolean);
  return (
    normalizedTargets.length === 1 &&
    normalizedTargets[0].endsWith(".html") &&
    normalizedTargets[0] !== "/index.html"
  );
}

function isRouteUnitProviderBridgeEnabled(): boolean {
  const raw = String(process.env.SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE || "").trim().toLowerCase();
  if (raw) return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  return resolveWebsiteArtifactGeneratorMode() !== "native";
}

export function shouldUseRouteUnitProviderBridgeForTesting(objective: SkillExecutionRoundObjective): boolean {
  return isRouteUnitProviderBridgeEnabled() && objective.strictSingleTarget && isIsolatedInteriorHtmlRound(objective.targetFiles);
}

function resolveLightweightRoundModelName(config: ProviderConfig, envKeys: string[]): string {
  const providerKey = config.provider.toUpperCase();
  const providerScopedKey = envKeys
    .map((key) => `${key}_${providerKey}`)
    .find((key) => String((process.env as Record<string, string | undefined>)[key] || "").trim());
  const explicit =
    envKeys.map((key) => String((process.env as Record<string, string | undefined>)[key] || "").trim()).find(Boolean) ||
    (providerScopedKey
      ? String((process.env as Record<string, string | undefined>)[providerScopedKey] || "").trim()
      : "");
  if (explicit) return normalizeProviderModelId(config.provider, explicit, DEFAULT_OPENAI_COMPAT_MODEL);
  if (/mini/i.test(config.modelName)) {
    return normalizeProviderModelId(config.provider, config.modelName, DEFAULT_OPENAI_COMPAT_MODEL);
  }
  return normalizeProviderModelId(config.provider, DEFAULT_OPENAI_COMPAT_MODEL, DEFAULT_OPENAI_COMPAT_MODEL);
}

function resolveRoundProviderConfig(config: ProviderConfig, objective: RoundObjective): ProviderConfig {
  const sharedAssetRound = isSharedAssetRound(objective.targetFiles);
  const isolatedHomeRound = isIsolatedHomeRound(objective.targetFiles);
  const isolatedInteriorHtmlRound = isIsolatedInteriorHtmlRound(objective.targetFiles);
  if (!sharedAssetRound && !isolatedHomeRound && !isolatedInteriorHtmlRound) return config;
  const lightweightModelName = sharedAssetRound
    ? resolveLightweightRoundModelName(config, ["SKILL_TOOL_SHARED_ASSET_MODEL", "LLM_MODEL_SHARED_ASSET"])
    : isolatedHomeRound
      ? resolveLightweightRoundModelName(config, ["SKILL_TOOL_HOME_ROUND_MODEL", "LLM_MODEL_HOME_ROUND"])
      : resolveLightweightRoundModelName(config, ["SKILL_TOOL_INTERIOR_HTML_MODEL", "LLM_MODEL_INTERIOR_HTML"]);
  if (!lightweightModelName || lightweightModelName === config.modelName) return config;
  return {
    ...config,
    modelName: lightweightModelName,
  };
}

function buildSharedAssetRoundContract(params: {
  decision: LocalDecisionPlan;
  targetFiles: string[];
  styleName: string;
  styleReason: string;
  requiresLanguageSwitch: boolean;
  defaultVisibleLanguage: "zh-CN" | "zh" | "en";
}): string {
  const localePlan = buildLocalePlan(params.decision.requirementText || "", params.decision.locale);
  const normalizedTargets = params.targetFiles.map((target) => normalizePath(target)).filter(Boolean);
  const cssRequested = normalizedTargets.includes("/styles.css");
  const scriptRequested = normalizedTargets.includes("/script.js");
  const i18nRequested = normalizedTargets.some((target) => isI18nMessagePath(target));
  const routeSummary = params.decision.routes.slice(0, 8).join(", ") || "(none)";
  const bilingualLines = params.requiresLanguageSwitch
    ? [
        `- Locale switch contract: preserve exactly one visible language at a time. Default visible language is ${params.defaultVisibleLanguage}.`,
        "- Locale switch contract: script.js may store inactive-language copy in data-i18n-* attributes or a compact in-page messages dictionary, but must never render simultaneous visible bilingual copy in one reading path.",
        "- Locale switch contract: keep the switch route-stable and lightweight. Do not add framework-style runtime shells, hydration placeholders, or content-regeneration mechanics.",
      ]
    : [
        "- Locale switch contract: no bilingual runtime is required unless the emitted HTML later proves otherwise.",
      ];
  const requestedLocale = resolveRequestedExperienceLocale(params.decision.requirementText || "", params.decision.locale);

  return [
    "Shared asset contract:",
    `- Routes supported by the shared shell: ${routeSummary}`,
    `- Visual direction: ${params.styleName}`,
    `- Visual rationale: ${params.styleReason}`,
    requestedLocale === "zh-CN"
      ? "- Single-language locale contract: the shared shell must be Chinese-first. Do not generate language switches, locale chips, or English-first nav/footer copy for the confirmed routes."
      : "",
    cssRequested
      ? "- /styles.css must define the shared design tokens, spacing scale, responsive shell, nav/footer/header system, card rhythm, and page-safe defaults for all confirmed routes. Keep it production-ready and compact."
      : "",
    cssRequested
      ? "- /styles.css must optimize for resilient layout primitives first: variables, typography, grids, stacks, hero spacing, card padding, footer layout, and breakpoint behavior. Do not include page-by-page decorative overfitting."
      : "",
    cssRequested
      ? "- Heading typography must preserve polished words and names: do not use `overflow-wrap:anywhere` or `word-break:break-all` on h1/h2/h3, `.section-title`, `.hero h1`, or display heading selectors. Use normal wrapping, balanced measures, and responsive clamps instead."
      : "",
    cssRequested
      ? "- Generated UI text must use `letter-spacing: 0` for body, buttons, cards, and headings. Do not use negative letter-spacing. Do not set `hyphens:auto` on headings; tune font size and measure instead."
      : "",
    cssRequested
      ? "- Responsive data/table contract: prefer stacked cards or compact definition rows for homepage/docs-hub comparisons. If a real `<table>` is necessary, CSS must provide a `.table-wrap`, `.responsive-table`, or equivalent shell with horizontal overflow and readable cell padding so mobile screenshots do not clip columns."
      : "",
    cssRequested
      ? "- Color token contract: define every hex color in `:root` and reuse tokens through `var(...)`, `rgba(...)`, or `color-mix(...)`. Outside `:root`, do not emit raw hex values, including `var(--token, #hex)` fallbacks; add a named token instead."
      : "",
    cssRequested
      ? "- Hero metric/stat cards must not become narrow text columns. Do not use `.stat-list { grid-template-columns: repeat(3, minmax(0, 1fr)) }` inside a hero rail; use roomy horizontal cards, one-column stacks, or `minmax(12rem, 1fr)` with short labels only."
      : "",
    scriptRequested
      ? "- /script.js must define only shared behavior: nav active-state handling, locale toggle when required, lightweight form helpers, and minimal progressive enhancement. Do not embed page copy, article bodies, or route-specific prose."
      : "",
    scriptRequested
      ? "- /script.js must stay framework-free and defensive. Prefer small DOM helpers over route-specific choreography."
      : "",
    i18nRequested && localePlan.mode === "multilingual"
      ? `- i18n resources must emit ${I18N_LOCALE_REGISTRY_PATH} plus ${localePlan.sourceCatalogPath} as the source catalog. Additional /i18n/messages.{locale}.json dictionaries should be translation outputs keyed to the same stable \`data-i18n\` keys; do not regenerate HTML per locale.`
      : "",
    i18nRequested && localePlan.mode !== "multilingual"
      ? `- i18n resources must emit ${I18N_MESSAGE_EN_PATH} and ${I18N_MESSAGE_ZH_CN_PATH} as stable key/value JSON dictionaries. Both locales should be populated for shared-shell and visible core-copy keys; the default visible locale is ${params.defaultVisibleLanguage}.`
      : "",
    ...bilingualLines,
    "- Keep the shared shell coherent across all routes, but leave route-specific structure and content decisions to later HTML rounds.",
    "- Do not spend shared-asset budget restating every page contract, article rule, or downstream content requirement. Focus on the common CSS/JS layer only.",
  ]
    .filter(Boolean)
    .join("\n");
}

function isSyntheticLocaleMirrorRoute(route: string, baseRoutes: string[]): boolean {
  const normalized = normalizePath(route);
  if (!/^\/(?:zh|zh-cn|en)(?:\/|$)/i.test(normalized)) return false;
  const stripped = normalizePath(normalized.replace(/^\/(?:zh|zh-cn|en)(?=\/|$)/i, "") || "/");
  if (stripped === normalized) return false;
  return !baseRoutes.some((candidate) => {
    const normalizedCandidate = normalizePath(candidate);
    return normalizedCandidate === normalized || normalizedCandidate === stripped;
  });
}

function applyStateSitemapToDecision(base: LocalDecisionPlan, sitemap: unknown): LocalDecisionPlan {
  if (base.routeAuthorityMode === "workflow_manifest" || base.routeAuthorityMode === "prompt_manifest") {
    return base;
  }
  const baseRoutes = Array.isArray(base.routes) ? base.routes.map((route) => normalizePath(route)) : [];
  const inputRoutes = Array.isArray(sitemap)
    ? sitemap
        .map((item) => normalizePath(String(item || "")))
        .filter((route) => route && route !== "/")
        .filter((route) => !isSyntheticLocaleMirrorRoute(route, baseRoutes))
    : [];
  if (inputRoutes.length === 0) return base;
  const routes = Array.from(new Set(["/", ...inputRoutes])).slice(0, 12);
  const pageBlueprints = routes.map((route) => {
    const existing = base.pageBlueprints.find((page) => normalizePath(page.route) === normalizePath(route));
    if (existing) return existing;
    const existingOrGeneric = findPageBlueprint(base, route);
    return {
      ...existingOrGeneric,
      route: normalizePath(route),
      navLabel: extractPageTitleForRoute(route, base.locale),
    };
  });
  return {
    ...base,
    routes,
    navLabels: pageBlueprints.map((page) => page.navLabel),
    pageIntents: pageBlueprints,
    pageBlueprints,
  };
}

export function applyStateSitemapToDecisionForTesting(base: LocalDecisionPlan, sitemap: unknown): LocalDecisionPlan {
  return applyStateSitemapToDecision(base, sitemap);
}

function buildWorkflowFiles(params: {
  requirementText: string;
  decision: LocalDecisionPlan;
  designMd: string;
  locale: "zh-CN" | "en";
  provider: string;
  model: string;
  stylePreset: DesignStylePreset;
  designHit?: any;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
  siteGeneratorMode?: WebsiteArtifactGeneratorMode;
  selectedSeedSkillIds?: string[];
  selectedSeedContracts?: Array<{ id: string; contract: any }>;
}): RuntimeWorkflowFile[] {
  const workflowLocale = resolveRequestedExperienceLocale(params.requirementText, params.locale) || params.locale;
  const taskPlan = [
    "# Task Plan",
    "",
    `- Locale: ${workflowLocale}`,
    `- Provider: ${params.provider}`,
    `- Model: ${params.model}`,
    `- Routes: ${params.decision.routes.join(", ")}`,
    "",
    "## Fixed Order",
    "1. task_plan.md",
    "2. findings.md",
    "3. design.md",
    "4. website_design_spec.md",
    "5. static assets",
    "6. route HTML",
    "7. QA repair",
    "",
    "## Local Route Plan",
    contractDigest(params.decision),
  ].join("\n");

  const findings = [
    "# Findings",
    "",
    "## Input Prompt",
    clipRuntimeRequirement(params.requirementText, Number(process.env.SKILL_TOOL_FINDINGS_REQUIREMENT_CHARS || 48_000)) || "(empty)",
    "",
    "## Derived Route Plan",
    contractDigest(params.decision),
  ].join("\n");

  const design = [
    "# DESIGN",
    "",
    String(params.designMd || "").trim().slice(0, 12_000) || "Use selected design system guidance.",
  ].join("\n");
  const designSpec = buildWebsiteDesignSpecMarkdown({
    decision: params.decision,
    requirementText: params.requirementText,
    stylePreset: params.stylePreset,
    designHit: params.designHit,
    websiteSurfaceMode: params.websiteSurfaceMode,
    discoveryBrief: params.discoveryBrief,
    designSystemId: params.designSystemId,
    designSystemName: params.designSystemName,
    siteGeneratorMode: params.siteGeneratorMode,
    selectedSeedSkillIds: params.selectedSeedSkillIds,
    selectedSeedContracts: params.selectedSeedContracts,
  });

  return [
    { path: "/task_plan.md", content: taskPlan, type: "text/markdown" },
    { path: "/findings.md", content: findings, type: "text/markdown" },
    { path: "/design.md", content: design, type: "text/markdown" },
    { path: "/website_design_spec.md", content: designSpec, type: "text/markdown" },
  ];
}

function buildRouteUnitSnapshotsForToolFlow(params: {
  decision: LocalDecisionPlan;
  requirementText: string;
  stylePreset: DesignStylePreset;
  designHit?: any;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
  selectedSeedSkillIds?: string[];
  selectedSeedContracts?: Array<{ id: string; contract: any }>;
  files: RuntimeWorkflowFile[];
  qaRecords?: SkillToolQaRecord[];
}): NonNullable<SkillToolExecutorStepSnapshot["routeUnits"]> {
  const files = dedupeFiles(params.files || []);
  const qaRecords = params.qaRecords || [];
  return params.decision.pageBlueprints.map((page) => {
    const route = normalizePath(page.route);
    const summary = buildRouteUnitContractSummary(
      {
        decision: params.decision,
        requirementText: params.requirementText,
        stylePreset: params.stylePreset,
        designHit: params.designHit,
        websiteSurfaceMode: params.websiteSurfaceMode,
        discoveryBrief: params.discoveryBrief,
        designSystemId: params.designSystemId,
        designSystemName: params.designSystemName,
        selectedSeedSkillIds: params.selectedSeedSkillIds,
        selectedSeedContracts: params.selectedSeedContracts,
      },
      route,
    ) || {
      route,
      navLabel: page.navLabel,
      pageKind: page.pageKind,
      routeContract: [
        `route=${route}`,
        `navLabel=${page.navLabel}`,
        `pageKind=${page.pageKind}`,
        `purpose=${page.purpose}`,
      ],
      inheritedTerminology: [params.decision.brandHint || "", params.websiteSurfaceMode || ""].filter(Boolean),
      inheritedTokens: [
        params.stylePreset.colors.primary,
        params.stylePreset.colors.accent,
        params.stylePreset.colors.background,
        params.stylePreset.typography,
      ].filter(Boolean),
      inheritedSeedSkillIds: params.selectedSeedSkillIds || [],
      openingFamily: "route-owned",
      openingTopology: "route-specific lead band",
      mediaPlan: [],
      mediaResources: [],
    };
    const htmlPath = routeToHtmlPath(route);
    const generatedFiles = files
      .map((file) => normalizePath(file.path))
      .filter((filePath) => filePath === htmlPath || filePath === "/styles.css" || filePath === "/script.js");
    const generationUnitInput = buildGenerationUnitInputFromRouteContract({
      summary,
      context: { websiteSurfaceMode: params.websiteSurfaceMode },
    });
    const routeQa = qaRecords.find((record) => normalizePath(record.route) === route);
    const validationStatus = routeQa?.passed ? "passed" : "pending";
    return {
      ...summary,
      generatedFiles,
      generationUnit: {
        unitId: generationUnitInput.unitId,
        route: generationUnitInput.route,
        targetFiles: generationUnitInput.targetFiles,
      },
      validationStatus,
      validationResult: {
        status: validationStatus,
        checkedFiles: generatedFiles,
        issues: (routeQa?.antiSlopIssues || []).map((issue) => `${issue.severity}:${issue.code}`),
      },
    };
  });
}

export function buildShadowVisualEvaluationForTesting(params: {
  routeUnits: NonNullable<SkillToolExecutorStepSnapshot["routeUnits"]>;
  files: RuntimeWorkflowFile[];
  selectedSeedSkillIds: string[];
  seedAuthorityMode?: string;
}): QaSummary["shadowVisualEvaluation"] | undefined {
  return buildShadowVisualEvaluation({
    routeUnits: params.routeUnits,
    stylesCss: params.files.find((file) => normalizePath(file.path) === "/styles.css")?.content || "",
    selectedSeedSkillIds: params.selectedSeedSkillIds,
  });
}

function resolveProviderConfig(lock: RunProviderLock): ProviderConfig {
  if (lock.provider === "pptoken") {
    return {
      provider: "pptoken",
      apiKey: process.env.PPTOKEN_API_KEY,
      baseURL: process.env.PPTOKEN_BASE_URL || "https://cn.pptoken.cc/v1",
      defaultHeaders: {},
      modelName: normalizeProviderModelId(
        "pptoken",
        String(lock.model || process.env.LLM_MODEL_PPTOKEN || process.env.PPTOKEN_MODEL || DEFAULT_OPENAI_COMPAT_MODEL),
        DEFAULT_OPENAI_COMPAT_MODEL,
      ),
    };
  }
  if (lock.provider === "aiberm") {
    return {
      provider: "aiberm",
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName: normalizeProviderModelId(
        "aiberm",
        String(
          lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL || DEFAULT_OPENAI_COMPAT_MODEL,
        ),
        DEFAULT_OPENAI_COMPAT_MODEL,
      ),
    };
  }
  return {
    provider: "crazyroute",
    apiKey: process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY,
    baseURL:
      process.env.CRAZYROUTE_BASE_URL ||
      process.env.CRAZYROUTER_BASE_URL ||
      process.env.CRAZYREOUTE_BASE_URL ||
      "https://crazyrouter.com/v1",
    defaultHeaders: {},
    modelName: normalizeProviderModelId(
      "crazyroute",
      String(
        lock.model ||
          process.env.LLM_MODEL_CRAZYROUTE ||
          process.env.LLM_MODEL_CRAZYROUTER ||
          process.env.LLM_MODEL_CRAZYREOUTE ||
          process.env.LLM_MODEL ||
          DEFAULT_OPENAI_COMPAT_MODEL,
      ),
      DEFAULT_OPENAI_COMPAT_MODEL,
    ),
  };
}

function resolveProviderAttempts(preferred?: { provider?: string; model?: string }): ProviderAttempt[] {
  const attempts = resolveRunProviderRunnerLocks(preferred)
    .map((lock) => ({ lock, config: resolveProviderConfig(lock) }))
    .filter((attempt) => !!attempt.config.apiKey);
  if (attempts.length > 0) return attempts;
  const fallbackLock = resolveRunProviderRunnerLock(preferred);
  return [{ lock: fallbackLock, config: resolveProviderConfig(fallbackLock) }];
}

function toOpenAiToolDefinitions(onlyToolName?: ToolRoundCall["name"]) {
  const selectedTools = onlyToolName
    ? SKILL_TOOL_DEFINITIONS.filter((tool) => tool.name === onlyToolName)
    : SKILL_TOOL_DEFINITIONS;
  return selectedTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  })) as any[];
}

export function normalizeToolChoiceForProvider(config: Pick<ProviderConfig, "provider">, toolChoice: any): any {
  if (!toolChoice || typeof toolChoice !== "object") return toolChoice;
  if (toolChoice.type !== "function") return toolChoice;

  const namedToolChoiceMode = String(process.env.SKILL_TOOL_NAMED_TOOL_CHOICE || "").trim().toLowerCase();
  if (namedToolChoiceMode === "1" || namedToolChoiceMode === "true") return toolChoice;
  if (namedToolChoiceMode === "0" || namedToolChoiceMode === "false") return "required";

  // Some OpenAI-compatible endpoints reject named tool_choice objects even though
  // they accept the generic required mode. We still restrict the exposed tools
  // later, so required mode preserves the single-tool contract without sending
  // provider-specific object shapes that regress in production.
  if (config.provider === "aiberm" || config.provider === "pptoken") return "required";

  return toolChoice;
}

function getNamedToolChoiceName(toolChoice: any): ToolRoundCall["name"] | undefined {
  if (!toolChoice || typeof toolChoice !== "object") return undefined;
  if (String(toolChoice.type || "").trim() !== "function") return undefined;
  return normalizeToolCallName(toolChoice.function?.name);
}

export function resolveToolProtocolForProvider(config: Pick<ProviderConfig, "provider">, toolChoice: any): {
  toolChoice: any;
  toolNames: string[];
} {
  const requestedToolName = getNamedToolChoiceName(toolChoice);
  const normalizedToolChoice = normalizeToolChoiceForProvider(config, toolChoice);
  const restrictToRequestedTool = requestedToolName && normalizedToolChoice === "required";
  const toolNames = (
    restrictToRequestedTool
      ? [requestedToolName]
      : SKILL_TOOL_DEFINITIONS.map((tool) => tool.name)
  ) as string[];

  return {
    toolChoice: normalizedToolChoice,
    toolNames,
  };
}

function stringifyToolArgs(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "{}";
    }
  }
  return "{}";
}

function extractOpenAiToolCallsFromMessage(message: any): any[] {
  const directCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const kwargCalls = Array.isArray(message?.additional_kwargs?.tool_calls) ? message.additional_kwargs.tool_calls : [];
  const allCalls = [...directCalls, ...kwargCalls];
  const normalized = allCalls
    .map((call: any) => {
      const name = String(call?.function?.name || call?.name || "").trim();
      if (!name) return null;
      return {
        id: String(call?.id || `call_${crypto.randomUUID().slice(0, 8)}`),
        type: "function",
        function: {
          name,
          arguments: stringifyToolArgs(call?.function?.arguments ?? call?.args ?? {}),
        },
      };
    })
    .filter(Boolean);
  const byKey = new Map<string, any>();
  for (const call of normalized) {
    const key = `${String(call?.id || "")}|${String(call?.function?.name || "")}|${String(call?.function?.arguments || "")}`;
    if (!byKey.has(key)) byKey.set(key, call);
  }
  return Array.from(byKey.values());
}

function baseMessagesToOpenAiMessages(messages: BaseMessage[]): any[] {
  const output: any[] = [];
  for (const msg of messages || []) {
    if (msg instanceof SystemMessage) {
      output.push({ role: "system", content: readModelText((msg as any)?.content) || "" });
      continue;
    }
    if (msg instanceof HumanMessage) {
      output.push({ role: "user", content: readModelText((msg as any)?.content) || "" });
      continue;
    }
    if (msg instanceof ToolMessage) {
      output.push({
        role: "tool",
        content: readModelText((msg as any)?.content) || "",
        tool_call_id: String((msg as any)?.tool_call_id || ""),
      });
      continue;
    }
    if (msg instanceof AIMessage) {
      const content = readModelText((msg as any)?.content);
      const toolCalls = extractOpenAiToolCallsFromMessage(msg as any);
      output.push({
        role: "assistant",
        content: toolCalls.length > 0 ? content || null : content || "",
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    output.push({ role: "user", content: readModelText((msg as any)?.content) || "" });
  }
  return output;
}

function createToolProtocolModel(params: {
  config: ProviderConfig;
  requestTimeoutMs: number;
  toolChoice: any;
}): {
  invoke: (messages: BaseMessage[]) => Promise<AIMessage>;
} {
  const client = new OpenAI({
    apiKey: params.config.apiKey,
    baseURL: params.config.baseURL,
    defaultHeaders: params.config.defaultHeaders,
  });
  const protocol = resolveToolProtocolForProvider(params.config, params.toolChoice);
  const onlyToolName =
    protocol.toolNames.length === 1 ? (protocol.toolNames[0] as ToolRoundCall["name"]) : undefined;
  const tools = toOpenAiToolDefinitions(onlyToolName);
  const maxTokens = Math.max(256, Number(process.env.LLM_MAX_TOKENS_SKILL_TOOL || 12_000));

  return {
    invoke: async (messages: BaseMessage[]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, Math.max(10_000, Number(params.requestTimeoutMs) || 60_000));
      try {
        const rawResponse = await client.chat.completions.create(
          {
            model: params.config.modelName,
            messages: baseMessagesToOpenAiMessages(messages),
            tools,
            tool_choice: protocol.toolChoice,
            temperature: 0.2,
            max_tokens: maxTokens,
          } as any,
          { signal: controller.signal },
        );
        const response =
          typeof rawResponse === "string"
            ? JSON.parse(rawResponse)
            : rawResponse;
        const choice = response?.choices?.[0]?.message as any;
        const toolCalls = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];
        return new AIMessage({
          content: readModelText(choice?.content),
          additional_kwargs: toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
          response_metadata: {
            model_name: String(response?.model || params.config.modelName),
            finish_reason: String(response?.choices?.[0]?.finish_reason || ""),
          },
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        } as any);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function readModelText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    const maybeContent = (value as any).content;
    if (typeof maybeContent === "string") return maybeContent;
  }
  return "";
}

function parseToolCallArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeToolCallName(raw: unknown): ToolRoundCall["name"] | undefined {
  const value = String(raw || "").trim();
  if (value === "load_skill" || value === "emit_file" || value === "web_search" || value === "finish") return value;
  return undefined;
}

function extractToolCallsFromMessage(message: any): ToolRoundCall[] {
  const normalized: ToolRoundCall[] = [];

  const directCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (const call of directCalls) {
    const name = normalizeToolCallName(call?.name);
    if (!name) continue;
    normalized.push({
      id: call?.id ? String(call.id) : undefined,
      name,
      args: parseToolCallArgs(call?.args),
    });
  }

  const kwargCalls = Array.isArray(message?.additional_kwargs?.tool_calls) ? message.additional_kwargs.tool_calls : [];
  for (const call of kwargCalls) {
    const name = normalizeToolCallName(call?.function?.name || call?.name);
    if (!name) continue;
    const args = parseToolCallArgs(call?.function?.arguments ?? call?.args);
    normalized.push({
      id: call?.id ? String(call.id) : undefined,
      name,
      args,
    });
  }

  const byKey = new Map<string, ToolRoundCall>();
  for (const call of normalized) {
    const key = `${call.id || ""}|${call.name}|${JSON.stringify(call.args || {})}`;
    if (!byKey.has(key)) byKey.set(key, call);
  }
  return Array.from(byKey.values());
}

function describeToolProtocolShape(message: any): string {
  const directCalls = Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0;
  const kwargCalls = Array.isArray(message?.additional_kwargs?.tool_calls)
    ? message.additional_kwargs.tool_calls.length
    : 0;
  const assistant = readModelText(message?.content).trim();
  const assistantPreview = assistant ? assistant.slice(0, 180).replace(/\s+/g, " ") : "";
  const addKeys = Object.keys((message?.additional_kwargs && typeof message.additional_kwargs === "object")
    ? message.additional_kwargs
    : {}).join(",") || "(none)";
  const metaKeys = Object.keys((message?.response_metadata && typeof message.response_metadata === "object")
    ? message.response_metadata
    : {}).join(",") || "(none)";
  return `shape[tool_calls=${directCalls},kwarg_tool_calls=${kwargCalls},assistant_len=${assistant.length},assistant_preview="${assistantPreview}",additional_keys=${addKeys},response_meta_keys=${metaKeys}]`;
}

function clampTimeout(taskTimeoutMs: number, candidateMs: number, minMs: number): number {
  const safeCandidate = Math.max(minMs, candidateMs);
  const safeTask = Number.isFinite(taskTimeoutMs) && taskTimeoutMs > 0 ? Math.max(minMs, taskTimeoutMs) : safeCandidate;
  return Math.max(minMs, Math.min(safeCandidate, safeTask));
}

const VISITOR_COPY_WORKFLOW_META_LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/\bcontent gap\b/i, "content gap"],
  [/\b(?:assumption notes?|source assumptions?|prompt assumptions?|route assumptions?|no blog\/archive assumptions?|no blog or archive assumptions?)\b/i, "assumption"],
  [/\bprompt control manifest\b/i, "prompt control manifest"],
  [/\bsource priorities\b/i, "source priorities"],
  [/\bpage briefs?\b/i, "page briefs"],
  [/\bsource material appendix\b/i, "source material appendix"],
  [/\bwebsite knowledge profile\b/i, "website knowledge profile"],
  [/\brequirement completion\b/i, "requirement completion"],
  [/\binternal prompt\b/i, "internal prompt"],
  [/内容缺口|内容空缺/u, "content gap"],
  [/假设(?:项|说明|备注)/u, "assumption"],
  [/提示词控制清单/u, "prompt control manifest"],
  [/来源优先级|来源优先顺序/u, "source priorities"],
  [/页面简报|页面摘要/u, "page briefs"],
  [/来源材料附录|素材附录/u, "source material appendix"],
];

function findVisibleWorkflowMetaLeak(html: string): string[] {
  const visible = htmlVisibleText(html);
  if (!visible) return [];
  const issues: string[] = [];
  for (const [pattern, label] of VISITOR_COPY_WORKFLOW_META_LEAK_PATTERNS) {
    if (pattern.test(visible) && !issues.includes(label)) issues.push(label);
  }
  return issues;
}

function extractPlaceholderGateIssues(lint: {
  issues: Array<{ code: string; severity: "error" | "warning"; message?: string }>;
}): string[] {
  return Array.from(
    new Set(
      (lint.issues || [])
        .filter((issue) => issue.code === "placeholder-copy" || issue.code === "external-placeholder-image")
        .map((issue) => issue.message || issue.code),
    ),
  );
}

function isClosedManifestAuthority(decision: LocalDecisionPlan): boolean {
  return decision.routeAuthorityMode === "prompt_manifest" || decision.routeAuthorityMode === "workflow_manifest";
}

function manifestAllowedRoutes(decision: LocalDecisionPlan): Set<string> {
  return new Set(decision.routes.map((route) => normalizeRouteKey(route)));
}

function manifestAllowsRoute(decision: LocalDecisionPlan, route: string, requirementText = ""): boolean {
  if (!isClosedManifestAuthority(decision)) return true;
  const manifestRequirementText = requirementText || decision.requirementText || "";
  const normalizedRoute = normalizeRouteKey(route);
  if (manifestAllowedRoutes(decision).has(normalizedRoute)) return true;
  const hasPublishableContentRoute = decision.pageBlueprints.some(
    (page) =>
      isContentBackedPageKind(page.pageKind) &&
      shouldRequireBlogDetailPagesForRoutePolicy({
        route: page.route,
        navLabel: page.navLabel,
        requirementText: manifestRequirementText,
        pageKind: page.pageKind,
      }),
  );
  const hasBlogDataIndexRoute =
    !hasNegativePublishableDetailContract(manifestRequirementText) &&
    decision.pageBlueprints.some((page) => page.pageKind === "blog-data-index");
  const requestAllowsPublishableDetails = requirementRequestsPublishableDetailPages(manifestRequirementText);
  if (
    /^\/blog\/[^/]+\/?$/i.test(normalizedRoute) &&
    (manifestAllowedRoutes(decision).has("/blog") ||
      Boolean(requestedPublishableContentCount(manifestRequirementText)) ||
      requestAllowsPublishableDetails ||
      hasBlogDataIndexRoute ||
      hasPublishableContentRoute)
  ) {
    return true;
  }
  return false;
}

function manifestAllowsOutputFile(decision: LocalDecisionPlan, filePath: string, requirementText = ""): boolean {
  if (!isClosedManifestAuthority(decision)) return true;
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPath.endsWith(".html")) return true;
  const route = htmlPathToRoute(normalizedPath);
  return Boolean(route && manifestAllowsRoute(decision, route, requirementText));
}

function collectInternalHtmlRoutes(html: string): string[] {
  const routes: string[] = [];
  for (const match of String(html || "").matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const route = normalizeRouteKey(href.split(/[?#]/)[0] || "/");
    if (!route || /\.[a-z0-9]{2,8}$/i.test(route)) continue;
    routes.push(route);
  }
  return Array.from(new Set(routes));
}

function listManifestRouteLinkViolations(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): Array<{ sourcePath: string; route: string }> {
  if (!isClosedManifestAuthority(params.decision)) return [];
  const expectedHtml = new Set(params.decision.routes.map((route) => routeToHtmlPath(route)));
  const emittedHtmlRoutes = new Set(
    dedupeFiles(params.files)
      .map((file) => normalizePath(file.path))
      .filter((filePath) => filePath.endsWith(".html"))
      .map((filePath) => htmlPathToRoute(filePath))
      .filter((route): route is string => Boolean(route)),
  );
  const violations: Array<{ sourcePath: string; route: string }> = [];
  for (const file of dedupeFiles(params.files)) {
    const sourcePath = normalizePath(file.path);
    if (!expectedHtml.has(sourcePath)) continue;
    for (const route of collectInternalHtmlRoutes(String(file.content || ""))) {
      const generatedRouteFamily = /^\/(?:blog|archive)(?:\/|$)/i.test(route);
      if (
        (emittedHtmlRoutes.has(route) || generatedRouteFamily) &&
        !manifestAllowsRoute(params.decision, route, params.requirementText || "")
      ) {
        violations.push({ sourcePath, route });
      }
    }
  }
  return violations;
}

function listUnexpectedManifestHtmlFiles(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): string[] {
  if (!isClosedManifestAuthority(params.decision)) return [];
  const expectedHtml = new Set(params.decision.routes.map((route) => routeToHtmlPath(route)));
  const linkedInternalRoutes = new Set<string>();
  for (const file of dedupeFiles(params.files)) {
    const filePath = normalizePath(file.path);
    if (!expectedHtml.has(filePath)) continue;
    for (const route of collectInternalHtmlRoutes(String(file.content || ""))) {
      linkedInternalRoutes.add(route);
    }
  }
  return dedupeFiles(params.files)
    .map((file) => normalizePath(file.path))
    .filter((filePath) => filePath.endsWith(".html"))
    .filter((filePath) => {
      if (expectedHtml.has(filePath)) return false;
      const route = htmlPathToRoute(filePath);
      if (!route) return false;
      if (manifestAllowsRoute(params.decision, route, params.requirementText || "")) return false;
      if (route.split("/").filter(Boolean).length > 1 && !linkedInternalRoutes.has(route)) return false;
      return true;
    })
    .sort();
}

function leadingSectionSignature(html: string): string {
  const main = String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || String(html || "");
  const section = main.match(/<(section|article|div)\b([^>]*)>/i);
  if (!section) return "";
  const className = String(section[2] || "").match(/\bclass=["']([^"']+)["']/i)?.[1] || "";
  return className
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

function collectObservationOnlyVisualFindings(params: {
  decision: LocalDecisionPlan;
  byPath: Map<string, RuntimeWorkflowFile>;
}): QaSummary["observations"] {
  const signatures = new Map<string, string[]>();
  for (const route of params.decision.routes.filter((route) => normalizePath(route) !== "/")) {
    const html = String(params.byPath.get(routeToHtmlPath(route))?.content || "");
    const signature = leadingSectionSignature(html);
    if (!signature) continue;
    signatures.set(signature, [...(signatures.get(signature) || []), route]);
  }
  const observations: NonNullable<QaSummary["observations"]> = [];
  for (const [signature, routes] of signatures.entries()) {
    if (routes.length >= 3) {
      observations.push({
        code: "repeated-opening-family",
        severity: "observation",
        message: `Observation only: ${routes.length} interior routes start with the same opening class signature (${signature}).`,
        routes,
      });
    }
  }
  return observations;
}

function countBlogDetailFiles(filePaths: string[]): number {
  return filePaths.filter((filePath) => /^\/blog\/.+\/index\.html$/i.test(normalizePath(filePath))).length;
}

function resolveRoundTimeouts(params: {
  taskTimeoutMs: number;
  targetFileCount: number;
}): { idleTimeoutMs: number; absoluteTimeoutMs: number } {
  const fileCount = Math.max(1, Number(params.targetFileCount || 0));
  const perFileIdleBudgetMs = Math.max(
    10_000,
    Math.min(DEFAULT_ROUND_IDLE_TIMEOUT_MS, Math.floor(STAGE_BUDGET_PER_FILE_MS * 0.5)),
  );
  const perFileAbsoluteBudgetMs = Math.max(
    perFileIdleBudgetMs + 5_000,
    Math.min(DEFAULT_ROUND_ABSOLUTE_TIMEOUT_MS, STAGE_BUDGET_PER_FILE_MS),
  );
  const idleTimeoutMs = clampTimeout(params.taskTimeoutMs, perFileIdleBudgetMs * fileCount, 10_000);
  let absoluteTimeoutMs = clampTimeout(
    params.taskTimeoutMs,
    perFileAbsoluteBudgetMs * fileCount,
    idleTimeoutMs + 5_000,
  );
  if (absoluteTimeoutMs <= idleTimeoutMs) absoluteTimeoutMs = idleTimeoutMs + 5_000;
  return { idleTimeoutMs, absoluteTimeoutMs };
}

function resolveStageBudgetMs(taskTimeoutMs: number, plannedFileCount: number): number {
  const fileCount = Math.max(1, Number(plannedFileCount || 0));
  const computedBudget = fileCount * STAGE_BUDGET_PER_FILE_MS;
  return clampTimeout(taskTimeoutMs, computedBudget, STAGE_BUDGET_PER_FILE_MS);
}

function resolveExpectedRequiredFileCount(params: {
  decision: LocalDecisionPlan;
  adapter: SkillExecutionAdapter;
  files?: RuntimeWorkflowFile[];
  requirementText?: string;
}): number {
  const requirementText = String(params.requirementText || "");
  const requiredFiles = params.adapter.buildRequiredFileChecklist(params.decision, {
    files: params.files,
    requirementText,
  });
  const requestedCount = requestedPublishableContentCount(requirementText) || 0;
  const discoveredDetailCount = Math.min(requestedCount, countBlogDetailFiles(requiredFiles));
  const undiscoveredRequestedCount = Math.max(0, requestedCount - discoveredDetailCount);
  return Math.max(1, requiredFiles.length + undiscoveredRequestedCount);
}

function collectErrorTextParts(error: unknown, seen = new Set<unknown>()): string[] {
  if (!error || seen.has(error)) return [];
  seen.add(error);

  if (typeof error === "string") return [error];
  if (typeof error !== "object") return [String(error)];

  const raw = error as Record<string, unknown>;
  const parts = [
    raw.name,
    raw.code,
    raw.status,
    raw.statusCode,
    raw.type,
    raw.message,
    raw.stack,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return [
    ...parts,
    ...collectErrorTextParts(raw.cause, seen),
    ...collectErrorTextParts(raw.error, seen),
    ...collectErrorTextParts(raw.details, seen),
  ];
}

function errorText(error: unknown): string {
  const parts = collectErrorTextParts(error);
  return parts.length > 0 ? parts.join(" | ") : "unknown error";
}

export function isRetryableProviderError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  if (/(401|403|forbidden|unauthorized|invalid api key|authentication failed)/i.test(text)) return false;
  if (/(404|model not found|unsupported model|not supported|bad request|invalid_request_error)/i.test(text)) return false;
  if (/(timeout|timed out|bodytimeouterror|body timeout|und_err_body_timeout|terminated|429|rate limit|503|502|504|service unavailable|connection error|network|socket hang up|econnreset|econnaborted|etimedout|eai_again|enotfound|fetch failed|temporarily unavailable|overloaded|upstream)/i.test(text)) {
    return true;
  }
  return false;
}

function isProviderAccessError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  return /(401|403|forbidden|unauthorized|invalid api key|authentication failed)/i.test(text);
}

function isProviderConfigurationError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  return /(bad port|invalid url|failed to parse url|unknown scheme|invalid base url|malformed url)/i.test(text);
}

function retryBackoffMs(attempt: number): number {
  const exp = SKILL_TOOL_PROVIDER_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = SKILL_TOOL_PROVIDER_RETRY_JITTER_MS > 0
    ? Math.floor(Math.random() * (SKILL_TOOL_PROVIDER_RETRY_JITTER_MS + 1))
    : 0;
  return Math.min(SKILL_TOOL_PROVIDER_RETRY_MAX_MS, exp + jitter);
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function invokeModelTextWithTimeout(params: {
  model: { invoke: (messages: BaseMessage[]) => Promise<any>; stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>> };
  messages: BaseMessage[];
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  operation: string;
}): Promise<AIMessage> {
  return await new Promise<AIMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`skill-tool absolute timeout (${params.operation}, ${params.absoluteTimeoutMs}ms)`));
    }, params.absoluteTimeoutMs);

    invokeModelWithIdleTimeout({
      model: params.model as any,
      messages: params.messages,
      timeoutMs: params.idleTimeoutMs,
      operation: params.operation,
    })
      .then((message) => {
        clearTimeout(timer);
        resolve(message as AIMessage);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function invokeModelWithRetry(params: {
  model: { invoke: (messages: BaseMessage[]) => Promise<any>; stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>> };
  messages: BaseMessage[];
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  operation: string;
  retries?: number;
}): Promise<AIMessage> {
  const retries = Math.max(0, Number(params.retries ?? SKILL_TOOL_PROVIDER_RETRIES));
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await invokeModelTextWithTimeout({
        model: params.model,
        messages: params.messages,
        idleTimeoutMs: params.idleTimeoutMs,
        absoluteTimeoutMs: params.absoluteTimeoutMs,
        operation: `${params.operation}:attempt-${attempt + 1}`,
      });
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableProviderError(error) || isProviderConfigurationError(error)) {
        throw error;
      }
      await sleepMs(retryBackoffMs(attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
}

async function preflightProviderModel(params: {
  model: {
    invoke: (messages: BaseMessage[]) => Promise<any>;
    stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
  };
  config: ProviderConfig;
  taskTimeoutMs: number;
}): Promise<void> {
  const enabled = String(process.env.SKILL_TOOL_PREFLIGHT_ENABLED || "1").trim() !== "0";
  if (!enabled) return;
  const idleTimeoutMs = clampTimeout(params.taskTimeoutMs, DEFAULT_PREFLIGHT_IDLE_TIMEOUT_MS, 8_000);
  let absoluteTimeoutMs = clampTimeout(params.taskTimeoutMs, DEFAULT_PREFLIGHT_ABSOLUTE_TIMEOUT_MS, idleTimeoutMs + 4_000);
  if (absoluteTimeoutMs <= idleTimeoutMs) absoluteTimeoutMs = idleTimeoutMs + 4_000;
  const preflightMessages: BaseMessage[] = [
    new SystemMessage(
      [
        "Tool protocol preflight.",
        "You must call tool `finish` immediately.",
        "Do not output plain text and do not emit any other tool.",
      ].join("\n"),
    ),
    new HumanMessage("Call tool finish now."),
  ];
  const response = await invokeModelWithRetry({
    model: params.model,
    messages: preflightMessages,
    idleTimeoutMs,
    absoluteTimeoutMs,
    operation: `skill-tool-preflight:${params.config.provider}/${params.config.modelName}`,
    retries: SKILL_TOOL_PROVIDER_RETRIES,
  });
  const assistant = String(readModelText((response as any)?.content) || "").trim();
  const toolCalls = extractToolCallsFromMessage(response);
  const scope = `${params.config.provider}/${params.config.modelName}`;
  if (toolCalls.length === 0) {
    const shape = describeToolProtocolShape(response as any);
    if (assistant && /<tool_call>|<tool_response>|"name"\s*:\s*"(?:load_skill|emit_file|web_search|finish)"/i.test(assistant)) {
      throw new Error(
        `provider_tool_protocol_mismatch: ${scope} returned text tool transcript instead of native tool_calls; ${shape}`,
      );
    }
    if (assistant) {
      throw new Error(`provider_tool_protocol_mismatch: ${scope} returned assistant text without native tool_calls; ${shape}`);
    }
    throw new Error(`provider_tool_protocol_mismatch: ${scope} returned empty response without native tool_calls; ${shape}`);
  }
  const finishCalls = toolCalls.filter((call) => call.name === "finish");
  if (finishCalls.length === 0 || toolCalls.length !== 1) {
    throw new Error(
      `provider_tool_protocol_mismatch: ${scope} preflight expected only finish tool call, got [${toolCalls
        .map((call) => call.name)
        .join(", ")}]`,
    );
  }
}

async function selectProviderAttempt(params: {
  attempts: ProviderAttempt[];
  taskTimeoutMs: number;
  requestTimeoutMs: number;
}): Promise<{ attempt: ProviderAttempt; notes: string[]; excludedProviders: LlmProvider[] }> {
  let lastError: unknown;
  const notes: string[] = [];
  const excludedProviders = new Set<LlmProvider>();
  for (let index = 0; index < params.attempts.length; index += 1) {
    const attempt = params.attempts[index];
    const preflightModel = createToolProtocolModel({
      config: attempt.config,
      requestTimeoutMs: params.requestTimeoutMs,
      toolChoice: { type: "function", function: { name: "finish" } },
    }) as {
      invoke: (messages: BaseMessage[]) => Promise<any>;
      stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
    };
    try {
      await preflightProviderModel({
        model: preflightModel,
        config: attempt.config,
        taskTimeoutMs: params.taskTimeoutMs,
      });
      return {
        attempt,
        notes,
        excludedProviders: Array.from(excludedProviders).filter((provider) => provider !== attempt.config.provider),
      };
    } catch (error) {
      lastError = error;
      const isLast = index >= params.attempts.length - 1;
      const canFallback =
        isRetryableProviderError(error) ||
        isProviderAccessError(error) ||
        isProviderConfigurationError(error) ||
        /provider_tool_protocol_mismatch|native tool_calls|empty response without native tool_calls/i.test(
          errorText(error),
        );
      if (!canFallback || isLast) {
        throw error;
      }
      excludedProviders.add(attempt.config.provider);
      notes.push(
        `provider_preflight_fallback:${attempt.config.provider}/${attempt.config.modelName}:${errorText(error).slice(0, 320)}`,
      );
      console.warn(
        `[skill-tool] provider preflight failed for ${attempt.config.provider}/${attempt.config.modelName}; falling back: ${errorText(error)}`,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
}

async function invokeRoundWithTimeout(params: {
  model: ToolProtocolModel;
  messages: BaseMessage[];
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  operation: string;
}): Promise<ToolRoundOutput> {
  const message = await invokeModelWithRetry({
    model: params.model,
    messages: params.messages,
    idleTimeoutMs: params.idleTimeoutMs,
    absoluteTimeoutMs: params.absoluteTimeoutMs,
    operation: params.operation,
    retries: SKILL_TOOL_PROVIDER_RETRIES,
  });
  const assistant = readModelText((message as any)?.content).trim();
  const tool_calls = extractToolCallsFromMessage(message);
  if (tool_calls.length === 0) {
    const shape = describeToolProtocolShape(message as any);
    const assistantText = String(assistant || "").trim();
    if (assistantText && /<tool_call>|<tool_response>|"name"\s*:\s*"(?:load_skill|emit_file|web_search|finish)"/i.test(assistantText)) {
      throw new Error(
        `provider_tool_protocol_mismatch: ${params.operation} returned text tool transcript instead of native tool_calls; ${shape}`,
      );
    }
    if (assistantText) {
      throw new Error(
        `provider_tool_protocol_mismatch: ${params.operation} returned assistant text without native tool_calls; ${shape}`,
      );
    }
    throw new Error(`provider_tool_protocol_mismatch: ${params.operation} returned no native tool_calls; ${shape}`);
  }
  return { assistant, tool_calls, rawMessage: message };
}

function canFallbackRoundProvider(error: unknown): boolean {
  if (isRetryableProviderError(error)) return true;
  if (isProviderAccessError(error)) return true;
  if (isProviderConfigurationError(error)) return true;
  return /provider_tool_protocol_mismatch|native tool_calls|empty response without native tool_calls/i.test(
    errorText(error),
  );
}

function prioritizeProviderAttempts(
  attempts: ProviderAttempt[],
  preferredAttempt: ProviderAttempt,
  excludedProviders: Set<LlmProvider> = new Set(),
): ProviderAttempt[] {
  const eligibleAttempts = attempts.filter((attempt) => !excludedProviders.has(attempt.config.provider));
  const baseAttempts = eligibleAttempts.length > 0 ? eligibleAttempts : attempts;
  const preferredKey = `${preferredAttempt.config.provider}:${preferredAttempt.config.modelName}`;
  const ordered = [preferredAttempt];
  for (const attempt of baseAttempts) {
    const key = `${attempt.config.provider}:${attempt.config.modelName}`;
    if (key === preferredKey) continue;
    ordered.push(attempt);
  }
  return ordered;
}

async function invokeRoundWithProviderFallback(params: {
  attempts: ProviderAttempt[];
  preferredAttempt: ProviderAttempt;
  excludedProviders?: Set<LlmProvider>;
  objective: RoundObjective;
  messages: BaseMessage[];
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  operation: string;
  forceEmitFile: boolean;
  createModel: (args: { config: ProviderConfig; toolChoice: any; requestTimeoutMs: number }) => ToolProtocolModel;
  invokeRound: (args: {
    model: ToolProtocolModel;
    messages: BaseMessage[];
    idleTimeoutMs: number;
    absoluteTimeoutMs: number;
    operation: string;
  }) => Promise<ToolRoundOutput>;
}): Promise<{ output: ToolRoundOutput; attempt: ProviderAttempt; notes: string[] }> {
  const orderedAttempts = prioritizeProviderAttempts(
    params.attempts,
    params.preferredAttempt,
    params.excludedProviders || new Set(),
  );
  const notes: string[] = [];
  let lastError: unknown;
  for (let index = 0; index < orderedAttempts.length; index += 1) {
    const attempt = orderedAttempts[index];
    const roundProviderConfig = resolveRoundProviderConfig(attempt.config, params.objective);
    const model = params.createModel({
      config: roundProviderConfig,
      requestTimeoutMs: params.absoluteTimeoutMs,
      toolChoice: params.forceEmitFile
        ? { type: "function", function: { name: "emit_file" } }
        : SKILL_TOOL_TOOL_CHOICE === "auto"
          ? "auto"
          : "required",
    });
    try {
      const output = await params.invokeRound({
        model,
        messages: params.messages,
        idleTimeoutMs: params.idleTimeoutMs,
        absoluteTimeoutMs: params.absoluteTimeoutMs,
        operation: params.operation,
      });
      return { output, attempt: { ...attempt, config: roundProviderConfig }, notes };
    } catch (error) {
      lastError = error;
      const isLast = index >= orderedAttempts.length - 1;
      if (!canFallbackRoundProvider(error) || isLast) {
        throw error;
      }
      notes.push(
        `provider_round_fallback:${roundProviderConfig.provider}/${roundProviderConfig.modelName}:${errorText(error).slice(0, 320)}`,
      );
      console.warn(
        `[skill-tool] round fallback after ${roundProviderConfig.provider}/${roundProviderConfig.modelName}: ${errorText(error)}`,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
}

type RouteUnitProviderBridgeResult = {
  output: ToolRoundOutput;
  attempt: ProviderAttempt;
  notes: string[];
  prompt: string;
};

async function tryInvokeRouteUnitProviderBridgeRound(params: {
  adapter: SkillExecutionAdapter;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  loadedSkillIds: string[];
  emittedFiles: RuntimeWorkflowFile[];
  objective: SkillExecutionRoundObjective;
  requirementText: string;
  totalRounds: number;
  providerAttempts: ProviderAttempt[];
  activeAttempt: ProviderAttempt;
  excludedProviders: Set<LlmProvider>;
  toolHistoryMessages: BaseMessage[];
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  roundNumber: number;
  forceEmitFile: boolean;
}): Promise<RouteUnitProviderBridgeResult | undefined> {
  if (!shouldUseRouteUnitProviderBridgeForTesting(params.objective)) return undefined;
  const targetFile = normalizePath(params.objective.targetFiles[0] || "");
  const route = htmlPathToRoute(targetFile);
  if (!route) return undefined;
  const summary = buildRouteUnitContractSummary(
    {
      decision: params.decision,
      requirementText: params.requirementText,
      stylePreset: params.stylePreset,
    },
    route,
  );
  if (!summary) return undefined;

  let captured:
    | {
        output: ToolRoundOutput;
        attempt: ProviderAttempt;
        notes: string[];
        prompt: string;
      }
    | undefined;
  const generationAdapter = createSkillExecutionGenerationWorkerAdapter({
    skillAdapter: params.adapter,
    decision: params.decision,
    stylePreset: params.stylePreset,
    styleName: params.styleName,
    styleReason: params.styleReason,
    requirementText: params.requirementText,
    totalRounds: params.totalRounds,
    loadedSkillIds: params.loadedSkillIds,
    emittedFiles: params.emittedFiles,
    invokeRound: async ({ input, prompt, objective }) => {
      const roundResult = await invokeRoundWithProviderFallback({
        attempts: params.providerAttempts,
        preferredAttempt: params.activeAttempt,
        excludedProviders: params.excludedProviders,
        objective: objective as RoundObjective,
        messages: [...params.toolHistoryMessages, new HumanMessage(prompt)],
        idleTimeoutMs: params.idleTimeoutMs,
        absoluteTimeoutMs: params.absoluteTimeoutMs,
        operation: `route-unit-provider-bridge-${params.roundNumber}`,
        forceEmitFile: params.forceEmitFile,
        createModel: ({ config, toolChoice, requestTimeoutMs }) =>
          createToolProtocolModel({
            config,
            requestTimeoutMs,
            toolChoice,
          }) as ToolProtocolModel,
        invokeRound: invokeRoundWithTimeout,
      });
      captured = {
        output: roundResult.output,
        attempt: roundResult.attempt,
        notes: roundResult.notes,
        prompt,
      };
      return {
        unitId: input.unitId,
        status: "passed",
        files: [],
        summary: `route-unit provider bridge dispatched ${input.unitId}`,
      };
    },
  });
  const input = buildGenerationUnitInputFromRouteContract({
    summary,
    targetFiles: params.objective.targetFiles,
  });
  await generationAdapter.runUnit(input);
  if (!captured) return undefined;
  return {
    output: captured.output,
    attempt: captured.attempt,
    prompt: captured.prompt,
    notes: [`route_unit_provider_bridge:${input.unitId}:${params.objective.targetFiles.join("|")}`, ...captured.notes],
  };
}

export function validateAndNormalizeRequiredFiles(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): RuntimeWorkflowFile[] {
  return validateAndNormalizeRequiredFilesWithQa(params).files;
}

export function validateAndNormalizeRequiredFilesWithQa(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  enforceCorporateHomepageContract?: boolean;
}): { files: RuntimeWorkflowFile[]; qaSummary: QaSummary; qaRecords: SkillToolQaRecord[] } {
  const unrequestedBlogDetailLimit = resolveUnrequestedBlogDetailLimit({
    requirementText: params.requirementText || "",
    websiteSurfaceMode: params.websiteSurfaceMode,
  });
  const files = dedupeFiles(params.files);
  const normalizedFiles = suppressLocaleSwitchUntilTranslationsExist(
    ensureEnglishFirstI18nResourceFiles(
      normalizeWebsiteStaticFilesForPreview({
        decision: params.decision,
        files: files.map((file) => {
          if (file.path === "/styles.css") {
            return {
              ...file,
              content: normalizeGeneratedCss(file.content),
            };
          }
          if (file.path === "/script.js") {
            return {
              ...file,
              content: normalizeGeneratedJs(file.content, params.requirementText || ""),
            };
          }
          if (file.path.endsWith(".html")) {
            const htmlDocument = ensureHtmlDocument(file.content);
            if (!htmlDocument || containsToolTranscriptNoise(htmlDocument)) {
              throw new Error(`skill_tool_invalid_generated_html: ${file.path}`);
            }
          }
          return file;
        }),
        requirementText: params.requirementText || "",
      }),
      params.requirementText || "",
      params.decision.locale,
    ),
    params.requirementText || "",
    params.decision.locale,
  );
  for (const file of normalizedFiles) {
    if (!isBlogDetailHtmlPath(file.path)) continue;
    if (isStructuredBlogDetailShellHtml(String(file.content || ""))) continue;
    file.content = augmentThinBlogDetailHtml(String(file.content || ""));
  }
  const byPath = new Map(normalizedFiles.map((file) => [normalizePath(file.path), file]));
  const categories = new Map<string, { code: string; severity: "error" | "warning"; count: number }>();
  const detailExpectations = new Map<string, { title: string; context: string }>();
  let aggregateScore = 100;
  let totalRoutes = 0;
  const qaRecords: SkillToolQaRecord[] = [];
  const collectLint = (lint: { score: number; issues: Array<{ code: string; severity: "error" | "warning" }> }) => {
    aggregateScore = Math.min(aggregateScore, Number.isFinite(lint.score) ? lint.score : 0);
    for (const issue of lint.issues || []) {
      const key = `${issue.severity}:${issue.code}`;
      const existing = categories.get(key);
      if (existing) existing.count += 1;
      else categories.set(key, { code: issue.code, severity: issue.severity, count: 1 });
    }
  };
  const missing = requiredFileChecklist(params.decision, {
    files: normalizedFiles,
    requirementText: params.requirementText || "",
  }).filter((filePath) => !byPath.has(normalizePath(filePath)));
  if (missing.length > 0) {
    throw new Error(`skill_tool_missing_required_files: ${missing.join(", ")}`);
  }
  const manifestRouteLinkViolations = listManifestRouteLinkViolations({
    decision: params.decision,
    files: normalizedFiles,
    requirementText: params.requirementText || "",
  });
  if (manifestRouteLinkViolations.length > 0) {
    const bySource = new Map<string, string[]>();
    for (const violation of manifestRouteLinkViolations) {
      bySource.set(violation.sourcePath, [...(bySource.get(violation.sourcePath) || []), violation.route]);
    }
    const [sourcePath, routes = []] = Array.from(bySource.entries())[0] || [];
    throw new Error(
      `skill_tool_invalid_required_file: ${sourcePath} links to unrequested route(s) outside the Prompt Control Manifest: ${Array.from(
        new Set(routes),
      ).join(", ")}`,
    );
  }
  const unexpectedManifestHtmlFiles = listUnexpectedManifestHtmlFiles({
    decision: params.decision,
    files: normalizedFiles,
    requirementText: params.requirementText || "",
  });
  if (unexpectedManifestHtmlFiles.length > 0) {
    throw new Error(
      `skill_tool_manifest_gate_failed: generated unrequested page files outside the Prompt Control Manifest: ${unexpectedManifestHtmlFiles.join(", ")}`,
    );
  }

  const styles = byPath.get("/styles.css");
  if (!styles || !isLikelyValidCss(styles.content)) {
    throw new Error("skill_tool_invalid_required_file: /styles.css is missing or invalid CSS");
  }

  const script = byPath.get("/script.js");
  if (!script || !isLikelyValidJs(script.content)) {
    throw new Error("skill_tool_invalid_required_file: /script.js is missing or invalid JavaScript");
  }

  const stylesLint = lintGeneratedWebsiteStyles(styles.content);
  collectLint(stylesLint);
  if (!stylesLint.passed) {
    throw new Error(`skill_tool_invalid_required_file: /styles.css failed layout QA\n${renderAntiSlopFeedback(stylesLint)}`);
  }
  const htmlByPathForCssCoverage = new Map<string, string>();
  for (const [filePath, file] of byPath.entries()) {
    if (filePath.endsWith(".html")) {
      htmlByPathForCssCoverage.set(filePath, String(file.content || ""));
    }
  }
  const cssCompletenessIssues = findCssCompletenessIssues(String(styles.content || ""), htmlByPathForCssCoverage);
  if (cssCompletenessIssues.length > 0) {
    throw new Error(
      `skill_tool_invalid_required_file: /styles.css is incomplete shared site CSS: ${cssCompletenessIssues.join("; ")}`,
    );
  }
  const hiddenRevealCssIssues = findHiddenRevealCssIssues(String(styles.content || ""));
  if (hiddenRevealCssIssues.length > 0) {
    throw new Error(
      `skill_tool_invalid_required_file: /styles.css hides route content before preview interaction: ${hiddenRevealCssIssues.join("; ")}`,
    );
  }
  const surfaceVisualTokenIssues = findSurfaceVisualTokenContractIssues({
    css: String(styles.content || ""),
    decision: params.decision,
    requirementText: params.requirementText || "",
  });
  if (surfaceVisualTokenIssues.length > 0) {
    throw new Error(
      `skill_tool_invalid_required_file: /styles.css violates surface visual token contract: ${surfaceVisualTokenIssues.join("; ")}`,
    );
  }

  assertSharedShellConsistency(params.decision, byPath, params.requirementText || "");
  assertGenericRouteShapeQuality(params.decision, byPath);
  assertConsultationFormRequirement(params.decision, byPath, params.requirementText || "");
  assertNoReservedPlaceholderContacts(byPath);

  for (const route of params.decision.routes) {
    totalRoutes += 1;
    const pagePath = routeToHtmlPath(route);
    const page = byPath.get(pagePath);
    const pageBlueprint =
      params.decision.pageBlueprints.find((item) => normalizePath(item.route) === normalizePath(route)) ||
      findPageBlueprint(params.decision, route);
    const html = ensureHtmlDocument(String(page?.content || ""));
    if (!page || !html || containsToolTranscriptNoise(html)) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} is missing or invalid HTML`);
    }
    if (!hasStylesheetRef(html)) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} does not reference /styles.css`);
    }
    if (!hasSharedScriptRef(html)) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} does not reference /script.js`);
    }
    const routeLint = mergeAntiSlopLintResults(
      lintGeneratedWebsiteHtml(html),
      lintGeneratedWebsiteRouteHtml(html, {
        route,
        navLabel:
          params.decision.navLabels[
            params.decision.routes.findIndex((item) => normalizePath(item) === normalizePath(route))
          ],
        pagePurpose: params.decision.pageBlueprints.find((item) => normalizePath(item.route) === normalizePath(route))?.purpose,
      }),
    );
    const placeholderGateIssues = extractPlaceholderGateIssues(routeLint);
    if (placeholderGateIssues.length > 0) {
      throw new Error(
        `skill_tool_placeholder_gate_failed: ${pagePath} exposes placeholder/demo content instead of final visitor-facing material: ${placeholderGateIssues.join(
          "; ",
        )}`,
      );
    }
    collectLint(routeLint);
    if (!routeLint.passed) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} failed route QA\n${renderAntiSlopFeedback(routeLint)}`);
    }
    qaRecords.push({
      route: normalizePath(route),
      score: Math.max(0, Math.round(Number(routeLint.score || 0))),
      passed: true,
      retries: 0,
      antiSlopIssues: routeLint.issues.map((issue) => ({ code: issue.code, severity: issue.severity })),
    });
    const pageMechanicsTerms = findVisiblePageMechanicsScaffold(html);
    if (pageMechanicsTerms.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} exposes page mechanics/scaffold wording instead of visitor-facing content: ${pageMechanicsTerms.join(", ")}`,
      );
    }
    const workflowMetaLeaks = findVisibleWorkflowMetaLeak(html);
    if (workflowMetaLeaks.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} exposes workflow/process/meta wording instead of visitor-facing content: ${workflowMetaLeaks.join(", ")}`,
      );
    }
    const surfaceHomepageArchetypeIssues = findSurfaceHomepageArchetypeIssues({
      html,
      pagePath,
      decision: params.decision,
      requirementText: params.requirementText || "",
      websiteSurfaceMode: params.websiteSurfaceMode,
    });
    if (surfaceHomepageArchetypeIssues.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} violates the surface homepage archetype contract: ${surfaceHomepageArchetypeIssues.join("; ")}`,
      );
    }
    const singleLanguageLocaleIssues = findSingleLanguageLocaleContractIssues(
      html,
      params.decision.locale,
      pagePath,
      params.requirementText || "",
    );
    if (singleLanguageLocaleIssues.length > 0) {
      throw new Error(`skill_tool_invalid_required_file: ${singleLanguageLocaleIssues.join("; ")}`);
    }
    if (params.enforceCorporateHomepageContract !== false) {
      const corporateB2BHomepageIssues = findCorporateB2BHomepageContractIssues(
        html,
        pagePath,
        params.requirementText || "",
        String(styles.content || ""),
        params.websiteSurfaceMode,
      );
      if (corporateB2BHomepageIssues.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} violates the corporate-b2b homepage contract: ${corporateB2BHomepageIssues.join("; ")}`,
        );
      }
    }
    const requestedSiteContentCount = requestedPublishableContentCount(params.requirementText || "");
    if (requestedSiteContentCount) {
      const scaffoldTerms = findVisibleBlogEditorialScaffold(html);
      if (scaffoldTerms.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes editorial scaffold/explanatory wording instead of final content: ${scaffoldTerms.join(", ")}`,
        );
      }
    }
    const isPlannedBlogDataRoute = isBlogDataSourceRoute(params.decision, route);
    const isExplicitBlogIndexRoute = normalizePath(route) === "/blog";
    const hasBlogContract = hasBlogDataSourceContract(html);
    const forbidsBlogArchiveBehavior =
      isClosedManifestAuthority(params.decision) &&
      hasNegativeBlogArchiveBehaviorContract(params.requirementText || "") &&
      !manifestAllowedRoutes(params.decision).has("/blog");
    if (hasBlogContract && forbidsBlogArchiveBehavior) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} applies the Blog/content collection data-source contract despite explicit no blog/archive behavior`,
      );
    }
    if ((isPlannedBlogDataRoute || isExplicitBlogIndexRoute) && !hasBlogContract) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} does not include the Blog data-source contract`);
    }
    if (hasBlogContract && !isPlannedBlogDataRoute && !isExplicitBlogIndexRoute) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} applies the Blog/content collection data-source contract on a non-content route`,
      );
    }
    if (isPlannedBlogDataRoute || isExplicitBlogIndexRoute || hasBlogContract) {
      const requiresDetailPages = shouldRequireBlogDetailPagesForRoutePolicy({
        route: pageBlueprint.route,
        navLabel: pageBlueprint.navLabel,
        requirementText: params.requirementText || "",
        pageKind: pageBlueprint.pageKind,
      });
      const leakedTerms = findVisibleBlogImplementationLeak(html);
      if (leakedTerms.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes internal Blog/content backend implementation wording in visible copy: ${leakedTerms.join(", ")}`,
        );
      }
      const blogScaffoldTerms = findVisibleBlogEditorialScaffold(html);
      if (blogScaffoldTerms.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes editorial scaffold/explanatory wording instead of final content: ${blogScaffoldTerms.join(", ")}`,
        );
      }
      const blogListSpacingIssues = findBlogListOuterSpacingIssues(html, String(styles.content || ""));
      if (blogListSpacingIssues.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} Blog list item outer class lacks runtime-safe padding: ${blogListSpacingIssues.join(", ")}`,
        );
      }
      const detailRoutes = extractBlogDetailRoutes(html);
      const selectedDetailRoutes = selectedBlogDetailRoutesForRequirement(
        detailRoutes,
        params.requirementText || "",
        params.websiteSurfaceMode,
      );
      for (const [routeKey, expectation] of extractBlogDetailExpectations(html)) {
        if (selectedDetailRoutes.includes(normalizePath(routeKey)) && !detailExpectations.has(routeKey)) {
          detailExpectations.set(routeKey, expectation);
        }
      }
      if (requiresDetailPages && detailRoutes.length === 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must expose at least one /blog/{slug}/ detail link because this route behaves like a publishable Blog/article archive`,
        );
      }
      const requestedCount = requestedPublishableContentCount(params.requirementText || "");
      if (requestedCount) {
        if (detailRoutes.length < requestedCount) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} must expose ${requestedCount} /blog/{slug}/ detail links for the requested publishable content items; found ${detailRoutes.length}`,
          );
        }
      } else if (
        requiresDetailPages &&
        !shouldRequireAllDiscoveredBlogDetails(params.requirementText || "") &&
        detailRoutes.length > unrequestedBlogDetailLimit
      ) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes ${detailRoutes.length} Blog detail links without an explicit requested content count; ${describeUnrequestedBlogDetailPolicy(unrequestedBlogDetailLimit)}`,
        );
      }
      for (const detailRoute of selectedDetailRoutes) {
        const detailPath = routeToHtmlPath(detailRoute);
        const detailFile = byPath.get(detailPath);
        if (!detailFile) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
          );
        }
        const detailHtml = String(detailFile.content || "");
        const isStructuredShell = isStructuredBlogDetailShellHtml(detailHtml);
        if (!isStructuredShell && !isMeaningfulArticleDetailHtml(detailHtml)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
          );
        }
        const detailScaffoldTerms = findVisibleBlogDetailEditorialScaffold(detailHtml);
        if (detailScaffoldTerms.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} exposes editorial scaffold/explanatory wording instead of final article content: ${detailScaffoldTerms.join(", ")}`,
          );
        }
        const detailIssues = isStructuredShell ? [] : findBlogDetailQualityIssues(detailHtml);
        if (!isStructuredShell && detailIssues.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} ${detailIssues.join("; ")}`,
          );
        }
      }
    }
  }

  const requestedSiteContentCount = requestedPublishableContentCount(params.requirementText || "");
  if (requestedSiteContentCount) {
    const detailRoutes = Array.from(
      new Set(
        normalizedFiles
          .filter((file) => normalizePath(file.path).endsWith(".html"))
          .flatMap((file) => extractBlogDetailRoutes(String(file.content || ""))),
      ),
    );
    if (detailRoutes.length < requestedSiteContentCount) {
      throw new Error(
        `skill_tool_invalid_required_file: site must expose ${requestedSiteContentCount} /blog/{slug}/ detail links for the requested publishable content items; found ${detailRoutes.length}`,
      );
    }
      for (const detailRoute of detailRoutes.slice(0, requestedSiteContentCount)) {
        const detailPath = routeToHtmlPath(detailRoute);
        const detailFile = byPath.get(detailPath);
        if (!detailFile) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
          );
        }
        const detailHtml = String(detailFile.content || "");
        const isStructuredShell = isStructuredBlogDetailShellHtml(detailHtml);
        if (!isStructuredShell && !isMeaningfulArticleDetailHtml(detailHtml)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
          );
        }
        const detailScaffoldTerms = findVisibleBlogDetailEditorialScaffold(detailHtml);
        if (detailScaffoldTerms.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} exposes editorial scaffold/explanatory wording instead of final article content: ${detailScaffoldTerms.join(", ")}`,
          );
        }
        const detailIssues = isStructuredShell ? [] : findBlogDetailQualityIssues(detailHtml);
        if (!isStructuredShell && detailIssues.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} ${detailIssues.join("; ")}`,
          );
        }
      }
    }

  const enMessages = byPath.get(I18N_MESSAGE_EN_PATH);
  const zhMessages = byPath.get(I18N_MESSAGE_ZH_CN_PATH);
  const hasI18nDictionaries = Boolean(
    enMessages &&
    zhMessages &&
    isLikelyValidI18nJson(String(enMessages.content || "")) &&
    isLikelyValidI18nJson(String(zhMessages.content || "")),
  );

  if (isBilingualRequirementText(params.requirementText || "")) {
    const allHtml = files
      .filter((item) => normalizePath(item.path).endsWith(".html"))
      .map((item) => String(item.content || ""))
      .join("\n");
    for (const file of files.filter((item) => normalizePath(item.path).endsWith(".html"))) {
      if (isBlogDetailHtmlPath(file.path)) continue;
      const duplicatedDom = findDuplicatedBilingualDomCopy(String(file.content || ""));
      if (duplicatedDom.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${normalizePath(file.path)} contains duplicated bilingual DOM copy in lang-zh/lang-en pairs instead of swapping one active language at a time: ${duplicatedDom.join(" | ")}`,
        );
      }
      const leaks = sharedFindVisibleSimultaneousBilingualCopy(String(file.content || ""));
      if (leaks.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${normalizePath(file.path)} renders obvious simultaneous bilingual visible copy instead of language-switched content: ${leaks.join(" | ")}`,
        );
      }
    }

    if (hasI18nDictionaries) {
      const parsedEnMessages = tryParseJsonObject(String(enMessages?.content || ""));
      const parsedZhMessages = tryParseJsonObject(String(zhMessages?.content || ""));
      const hasTranslatedAltLocale = Boolean(
        parsedEnMessages &&
        parsedZhMessages &&
        hasMeaningfullyTranslatedAlternateLocale(parsedEnMessages, parsedZhMessages),
      );

      const plannedNonBlogRoutes = params.decision.routes.filter((route) => {
        const normalizedRoute = normalizePath(route);
        if (normalizedRoute === "/blog") return false;
        if (isBlogDataSourceRoute(params.decision, normalizedRoute)) return false;
        return true;
      });
      for (const route of plannedNonBlogRoutes) {
        const pagePath = routeToHtmlPath(route);
        const page = byPath.get(pagePath);
        const html = ensureHtmlDocument(String(page?.content || ""));
        if (!html) continue;
        if (!hasBilingualI18nMapping(html)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} is missing i18n mappings for visible core copy; add stable data-i18n keys so locale resources can translate the page without regenerating HTML`,
          );
        }
        if (hasTranslatedAltLocale && !hasBilingualLocaleToggle(html)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} is missing a real bilingual language switch; add a data-locale-toggle control that swaps visible copy via the i18n resource files`,
          );
        }
        if (!hasTranslatedAltLocale && hasBilingualLocaleToggle(html)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} exposes an EN/ZH switch but the locale resources do not contain real alternate-language translations for the visible core copy; either provide translated locale resources or remove the switch and keep one visible language`,
          );
        }
      }
    }
  }
  if (!requestedSiteContentCount && !shouldRequireAllDiscoveredBlogDetails(params.requirementText || "")) {
    const detailRoutes = Array.from(
      new Set(
        normalizedFiles
          .filter((file) => normalizePath(file.path).endsWith(".html"))
          .filter((file) => isPrimaryBlogIndexHtmlFile(params.decision, file.path))
          .flatMap((file) => extractBlogDetailRoutes(String(file.content || ""))),
      ),
    );
    if (detailRoutes.length > unrequestedBlogDetailLimit) {
      throw new Error(
        `skill_tool_invalid_required_file: Blog/content fallback exposes ${detailRoutes.length} detail links without an explicit requested content count; ${describeUnrequestedBlogDetailPolicy(unrequestedBlogDetailLimit)}`,
      );
    }
  }

  if (unrequestedBlogDetailLimit === 0 && !requestedSiteContentCount && !shouldRequireAllDiscoveredBlogDetails(params.requirementText || "")) {
    const emittedDetailFiles = normalizedFiles.filter((file) => isBlogDetailHtmlPath(file.path));
    if (emittedDetailFiles.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: initial portfolio/blog pass emitted ${emittedDetailFiles.length} static blog detail page(s); ${describeUnrequestedBlogDetailPolicy(unrequestedBlogDetailLimit)}`,
      );
    }
  }

  for (const file of normalizedFiles.filter((item) => isBlogDetailHtmlPath(item.path))) {
    const detailPath = normalizePath(file.path);
    const detailHtml = ensureHtmlDocument(String(file.content || ""));
    if (!detailHtml) continue;
    if (!hasStylesheetRef(detailHtml)) {
      throw new Error(`skill_tool_invalid_required_file: ${detailPath} does not reference /styles.css`);
    }
    if (!hasSharedScriptRef(detailHtml)) {
      throw new Error(`skill_tool_invalid_required_file: ${detailPath} does not reference /script.js`);
    }
  }

  for (const [detailRoute, expectation] of detailExpectations.entries()) {
    const detailPath = routeToHtmlPath(detailRoute);
    const detailFile = byPath.get(detailPath);
    if (!detailFile) {
      throw new Error(
        `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
      );
    }
    const detailHtml = String(detailFile.content || "");
    const isStructuredShell = isStructuredBlogDetailShellHtml(detailHtml);
    if (!isStructuredShell && !isMeaningfulArticleDetailHtml(detailHtml)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${detailPath} must contain a structure-correct Blog detail shell or a complete article/detail body`,
      );
    }
    const detailIssues = isStructuredShell ? [] : findBlogDetailQualityIssues(detailHtml);
    if (!isStructuredShell && detailIssues.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${detailPath} ${detailIssues.join("; ")}`,
      );
    }
  }

  const qaSummary: QaSummary = {
    averageScore: Math.max(0, Math.round(aggregateScore)),
    totalRoutes,
    passedRoutes: totalRoutes,
    totalRetries: 0,
    retriesAllowed: 0,
    antiSlopIssueCount: Array.from(categories.values()).reduce((sum, item) => sum + item.count, 0),
    categories: Array.from(categories.values()).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
    observations: collectObservationOnlyVisualFindings({ decision: params.decision, byPath }),
  };
  return { files: normalizedFiles, qaSummary, qaRecords };
}

export function validateWebsiteRequiredFilesWithQaForAdapter(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
  websiteSurfaceMode?: string;
  enforceCorporateHomepageContract?: boolean;
}): SkillExecutionValidationResult {
  return validateAndNormalizeRequiredFilesWithQa({
    ...params,
    websiteSurfaceMode: inferWebsiteSurfaceModeFromSkillId(String(params.websiteSurfaceMode || "")),
  });
}

function normalizeHrefRoute(href: string): string {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || /^mailto:|^tel:|^javascript:/i.test(raw)) return "";
  let value = raw;
  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    return "";
  }
  value = value.split("#")[0]?.split("?")[0] || "";
  value = value.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
  return normalizeRouteKey(value || "/");
}

function hasStructuredFooterShellMarkup(html: string): boolean {
  const footer = String(html || "");
  return (
    /\b(?:site-footer__inner|footer(?:-|__)(?:inner|top|grid|brand|links|nav|meta|actions|bottom|panel|col|notes|section))\b/i.test(
      footer,
    ) ||
    (/<h[23]\b[\s\S]*?<\/h[23]>\s*<ul\b/i.test(footer) && (footer.match(/<li>\s*<a\b/gi) || []).length >= 3)
  );
}

function hasFooterBandStyle(stylesCss: string): boolean {
  const styles = String(stylesCss || "");
  return Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)).some((match) => {
    const selector = String(match[1] || "");
    const declarations = String(match[2] || "");
    const targetsFooterBand = /(?:^|[,\s])(?:footer|\.site-footer|\.footer)(?:[#.:\s,{]|$)/i.test(selector);
    const givesVisibleBand =
      /\b(?:padding(?:-[\w-]+)?|background(?:-[\w-]+)?|border-top|margin-top)\s*:/i.test(declarations);
    return targetsFooterBand && givesVisibleBand;
  });
}

function hasDuplicateFooterLinkGroups(html: string): boolean {
  const footer = extractTagBlock(String(html || ""), "footer");
  if (!footer) return false;
  const groupPattern =
    /<([a-zA-Z][\w:-]*)\b[^>]*class=(["'])[^"']*\bfooter(?:-|__)(?:links|nav)\b[^"']*\2[^>]*>([\s\S]*?)<\/\1>/gi;
  const groups = Array.from(footer.matchAll(groupPattern))
    .map((match) =>
      Array.from(new Set(Array.from(String(match[3] || "").matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi))
        .map((hrefMatch) => normalizeHrefRoute(String(hrefMatch[1] || "")))
        .filter((route) => Boolean(route) && route !== "/")
        .sort())),
    )
    .filter((routes) => routes.length >= 3);
  const fingerprints = groups.map((routes) => routes.join("|")).filter(Boolean);
  return new Set(fingerprints).size !== fingerprints.length;
}

function extractTagBlock(html: string, tagName: string): string {
  const matches = Array.from(
    String(html || "").matchAll(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi")),
  ).map((match) => String(match[0] || ""));
  if (matches.length === 0) return "";
  if (tagName.toLowerCase() !== "footer") return matches[0] || "";
  const structuredFooter =
    matches.findLast((block) =>
      /\bsite-footer\b|\bfooter(?:-|__)(?:inner|top|grid|brand|links|nav|meta|actions|bottom|panel|col|notes|title)\b/i.test(
        block,
      ),
    ) || matches[matches.length - 1];
  return String(structuredFooter || "");
}

function requirementNeedsConsultationForm(text = ""): boolean {
  const source = String(text || "");
  return /(?:consultation|intake|clarification)\s+form|form\s+with\s+name,\s*organization,\s*email,\s*topic,\s*and\s*message|咨询(?:表单|收集|入口|需求)|咨询.*(?:姓名|机构|单位|邮箱|主题|留言)/i.test(
    source,
  );
}

function extractExplicitConsultationHostRoutes(text = ""): string[] {
  const hosts = new Set<string>();
  for (const line of String(text || "").split(/\r?\n+/)) {
    if (!/consultation|intake|contact form|咨询(?:表单|入口|收集)/i.test(line)) continue;
    if (!/only|approved host|may host|host the real consultation form|host the required consultation intake/i.test(line)) {
      continue;
    }
    if (/(?:homepage|home page|首页|主页|route\s*\/(?:\s|$))/i.test(line)) {
      hosts.add("/");
    }
    for (const match of line.matchAll(/\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*/gi)) {
      hosts.add(normalizeRouteKey(String(match[0] || "")));
    }
  }
  return Array.from(hosts);
}

function injectConsultationFormOnAllowedHost(filePath: string, html: string, requirementText = ""): string {
  if (!requirementNeedsConsultationForm(requirementText)) return html;
  const allowedRoutes = extractExplicitConsultationHostRoutes(requirementText);
  if (allowedRoutes.length === 0) return html;
  const route = htmlPathToRoute(normalizePath(filePath));
  if (!allowedRoutes.includes(route)) return html;
  if (hasConsultationForm(html)) return html;
  const section = [
    '<section id="consultation-form" class="section form-shell">',
    '  <div class="site-shell">',
    '    <div class="section-head">',
    '      <p class="kicker" data-i18n data-i18n-zh="咨询表单" data-i18n-en="Consultation form">咨询表单</p>',
    '      <h2 class="section-title" data-i18n data-i18n-zh="提交机构咨询" data-i18n-en="Submit an institutional inquiry">提交机构咨询</h2>',
    '      <p class="section-lead" data-i18n data-i18n-zh="请留下姓名、机构、邮箱、主题与需求说明，便于 CASUX 团队后续联系。" data-i18n-en="Leave your name, organization, email, topic, and message so the CASUX team can follow up.">请留下姓名、机构、邮箱、主题与需求说明，便于 CASUX 团队后续联系。</p>',
    "    </div>",
    '    <form class="form-card form-grid" data-auto-status action="#" method="post">',
    '      <div class="field-grid">',
    '        <label class="field"><span data-i18n data-i18n-zh="姓名" data-i18n-en="Name">姓名</span><input type="text" name="name" placeholder="您的姓名" autocomplete="name" required></label>',
    '        <label class="field"><span data-i18n data-i18n-zh="机构 / 公司" data-i18n-en="Organization / Company">机构 / 公司</span><input type="text" name="organization" placeholder="机构名称" autocomplete="organization" required></label>',
    '        <label class="field"><span data-i18n data-i18n-zh="邮箱" data-i18n-en="Email">邮箱</span><input type="email" name="email" placeholder="name@organization.org" autocomplete="email" required></label>',
    '        <label class="field"><span data-i18n data-i18n-zh="主题 / 事项" data-i18n-en="Topic / Subject">主题 / 事项</span><input type="text" name="topic" placeholder="标准、研究或项目咨询" required></label>',
    "      </div>",
    '      <label class="field"><span data-i18n data-i18n-zh="留言" data-i18n-en="Message">留言</span><textarea name="message" placeholder="请说明背景、问题与期待的联系方向。" required></textarea></label>',
    '      <div class="form-actions"><button class="button" type="submit" data-i18n data-i18n-zh="发送咨询请求" data-i18n-en="Send inquiry">发送咨询请求</button></div>',
    "    </form>",
    "  </div>",
    "</section>",
  ].join("\n");
  if (/<\/main>/i.test(html)) {
    return html.replace(/<\/main>/i, `${section}\n</main>`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${section}\n</body>`);
  }
  return `${html}\n${section}`;
}

function hasConsultationForm(html: string): boolean {
  const forms = Array.from(String(html || "").matchAll(/<form\b[\s\S]*?<\/form>/gi)).map((match) => String(match[0] || ""));
  return forms.some((form) => {
    const visible = htmlVisibleText(form).toLowerCase();
    const source = `${form} ${visible}`.toLowerCase();
    const hasName = /\bname\b|姓名|联系人|称呼/i.test(source);
    const hasOrganization = /organization|organisation|company|institution|单位|机构|组织|公司/i.test(source);
    const hasEmail = /\bemail\b|邮箱|电子邮件/i.test(source);
    const hasTopic = /\b(topic|subject)\b|主题|议题|咨询事项|咨询类型/i.test(source);
    const hasMessage = /<textarea\b/i.test(form) || /\bmessage\b|留言|说明|需求|备注/i.test(source);
    return hasName && hasOrganization && hasEmail && hasTopic && hasMessage;
  });
}

function assertConsultationFormRequirement(
  decision: LocalDecisionPlan,
  byPath: Map<string, RuntimeWorkflowFile>,
  requirementText = "",
) {
  if (!requirementNeedsConsultationForm(requirementText)) return;
  const plannedHtml = decision.routes
    .map((route) => routeToHtmlPath(route))
    .map((pagePath) => String(byPath.get(pagePath)?.content || ""))
    .filter(Boolean);
  if (plannedHtml.some(hasConsultationForm)) return;
  throw new Error(
    "skill_tool_invalid_required_file: site is missing a required consultation/intake form with name, organization, email, topic, and message fields",
  );
}

function extractPlannedRoutesFromHtmlBlock(html: string, allowedRoutes: Set<string>): string[] {
  const routes = Array.from(String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => normalizeHrefRoute(match[1] || ""))
    .filter((route) => !!route && allowedRoutes.has(route));
  return Array.from(new Set(routes));
}

function extractUndeclaredInternalRoutesFromHtmlBlock(html: string, allowedRoutes: Set<string>): string[] {
  const routes = Array.from(String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => String(match[1] || "").trim())
    .filter((href) => href.startsWith("/"))
    .filter((href) => !/^\/(?:api|_next|assets?)\b/i.test(href))
    .filter((href) => !/\.[a-z0-9]{2,8}(?:[?#].*)?$/i.test(href) || /\.html?(?:[?#].*)?$/i.test(href))
    .map((href) => normalizeHrefRoute(href))
    .filter((route) => !!route && !allowedRoutes.has(route));
  return Array.from(new Set(routes));
}

function collectAllowedSharedShellRoutes(decision: LocalDecisionPlan, requirementText = ""): Set<string> {
  const allowedRoutes = new Set(decision.routes.map((route) => normalizePath(route)));
  const allowedHtmlRoutes = requiredFileChecklist(decision, { requirementText })
    .filter((filePath) => filePath.endsWith(".html"))
    .map((filePath) => htmlPathToRoute(filePath))
    .filter((route): route is string => Boolean(route));
  for (const route of allowedHtmlRoutes) {
    allowedRoutes.add(normalizePath(route));
  }
  return allowedRoutes;
}

function findReservedPlaceholderContactTokens(html: string): string[] {
  const source = `${String(html || "")}\n${htmlVisibleText(html)}`;
  const matches = new Set<string>();
  const reservedEmailPattern =
    /\b[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)*(?:example|test|invalid|localhost)\b|\b[A-Z0-9._%+-]+@example\.(?:com|org|net|edu)\b/gi;
  for (const match of source.matchAll(reservedEmailPattern)) {
    const token = String(match[0] || "").trim();
    if (token) matches.add(token);
  }
  const reservedUrlPattern =
    /\bhttps?:\/\/(?:[A-Z0-9-]+\.)*(?:example|test|invalid|localhost)(?:\/[^\s"'<>]*)?|\bhttps?:\/\/example\.(?:com|org|net|edu)(?:\/[^\s"'<>]*)?/gi;
  for (const match of source.matchAll(reservedUrlPattern)) {
    const token = String(match[0] || "").trim();
    if (token) matches.add(token);
  }
  return Array.from(matches).slice(0, 8);
}

function assertNoReservedPlaceholderContacts(byPath: Map<string, RuntimeWorkflowFile>) {
  for (const [pagePath, file] of byPath.entries()) {
    if (!normalizePath(pagePath).endsWith(".html")) continue;
    const matches = findReservedPlaceholderContactTokens(String(file.content || ""));
    if (matches.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} exposes reserved placeholder contact or URL tokens instead of publishable public details: ${matches.join(", ")}`,
      );
    }
  }
}

function assertSharedShellConsistency(
  decision: LocalDecisionPlan,
  byPath: Map<string, RuntimeWorkflowFile>,
  requirementText = "",
) {
  const plannedRoutes = collectAllowedSharedShellRoutes(decision, requirementText);
  const homeHtml = ensureHtmlDocument(String(byPath.get("/index.html")?.content || ""));
  if (!homeHtml) return;
  const stylesCss = String(byPath.get("/styles.css")?.content || "");

  const canonicalNavBlock = extractTagBlock(homeHtml, "nav");
  const canonicalFooterBlock = extractTagBlock(homeHtml, "footer");
  const canonicalNavRoutes = extractPlannedRoutesFromHtmlBlock(canonicalNavBlock, plannedRoutes);
  const canonicalFooterRoutes = extractPlannedRoutesFromHtmlBlock(canonicalFooterBlock, plannedRoutes);
  const undeclaredHomeNavRoutes = extractUndeclaredInternalRoutesFromHtmlBlock(canonicalNavBlock, plannedRoutes);
  if (undeclaredHomeNavRoutes.length > 0) {
    throw new Error(
      `skill_tool_invalid_required_file: /index.html navigation exposes undeclared internal routes outside the confirmed route plan: ${undeclaredHomeNavRoutes.join(", ")}`,
    );
  }
  const undeclaredHomeFooterRoutes = extractUndeclaredInternalRoutesFromHtmlBlock(canonicalFooterBlock, plannedRoutes);
  if (undeclaredHomeFooterRoutes.length > 0) {
    throw new Error(
      `skill_tool_invalid_required_file: /index.html footer exposes undeclared internal routes outside the confirmed route plan: ${undeclaredHomeFooterRoutes.join(", ")}`,
    );
  }
  if (canonicalFooterBlock && footerNeedsStructuredShell(canonicalFooterBlock, stylesCss)) {
    throw new Error(
      "skill_tool_invalid_required_file: /index.html collapses the shared footer into a flat link row instead of a structured footer shell",
    );
  }
  if (canonicalFooterBlock && hasDuplicateFooterLinkGroups(canonicalFooterBlock)) {
    throw new Error(
      "skill_tool_invalid_required_file: /index.html duplicates the same footer link set across multiple groups",
    );
  }

  for (const route of decision.routes) {
    const normalizedRoute = normalizePath(route);
    if (normalizedRoute === "/") continue;
    const pagePath = routeToHtmlPath(normalizedRoute);
    const html = ensureHtmlDocument(String(byPath.get(pagePath)?.content || ""));
    if (!html) continue;

    if (canonicalNavBlock) {
      const pageNavBlock = extractTagBlock(html, "nav");
      if (!pageNavBlock) {
        throw new Error(`skill_tool_invalid_required_file: ${pagePath} must preserve the shared navigation shell defined on /index.html`);
      }
      const undeclaredNavRoutes = extractUndeclaredInternalRoutesFromHtmlBlock(pageNavBlock, plannedRoutes);
      if (undeclaredNavRoutes.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} navigation exposes undeclared internal routes outside the confirmed route plan: ${undeclaredNavRoutes.join(", ")}`,
        );
      }
      if (canonicalNavRoutes.length > 0) {
        const pageNavRoutes = extractPlannedRoutesFromHtmlBlock(pageNavBlock, plannedRoutes);
        const missingNavRoutes = canonicalNavRoutes.filter((item) => !pageNavRoutes.includes(item));
        if (missingNavRoutes.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} must preserve the shared navigation destinations from /index.html; missing ${missingNavRoutes.join(", ")}`,
          );
        }
      }
    }

    if (canonicalFooterBlock) {
      const pageFooterBlock = extractTagBlock(html, "footer");
      if (!pageFooterBlock) {
        throw new Error(`skill_tool_invalid_required_file: ${pagePath} must preserve the shared footer shell defined on /index.html`);
      }
      const undeclaredFooterRoutes = extractUndeclaredInternalRoutesFromHtmlBlock(pageFooterBlock, plannedRoutes);
      if (undeclaredFooterRoutes.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} footer exposes undeclared internal routes outside the confirmed route plan: ${undeclaredFooterRoutes.join(", ")}`,
        );
      }
      if (footerNeedsStructuredShell(pageFooterBlock, stylesCss)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} collapses the shared footer into a flat link row instead of a structured footer shell`,
        );
      }
      if (hasDuplicateFooterLinkGroups(pageFooterBlock)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} duplicates the same footer link set across multiple groups`,
        );
      }
      if (canonicalFooterRoutes.length > 0) {
        const pageFooterRoutes = extractPlannedRoutesFromHtmlBlock(pageFooterBlock, plannedRoutes);
        const missingFooterRoutes = canonicalFooterRoutes.filter((item) => !pageFooterRoutes.includes(item));
        if (missingFooterRoutes.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} must preserve the shared footer destinations from /index.html; missing ${missingFooterRoutes.join(", ")}`,
          );
        }
      }
    }
  }
}

function assertGenericRouteShapeQuality(decision: LocalDecisionPlan, byPath: Map<string, RuntimeWorkflowFile>) {
  const plannedPrimaryRoutes = decision.pageBlueprints.filter((page) => {
    const normalizedRoute = normalizePath(page.route);
    return normalizedRoute !== "/" && page.pageKind !== "auth" && !/^\/blog\/[^/]+$/i.test(normalizedRoute);
  });

  const legacySplitHeroRoutes: string[] = [];
  for (const page of plannedPrimaryRoutes) {
    const pagePath = routeToHtmlPath(page.route);
    const html = ensureHtmlDocument(String(byPath.get(pagePath)?.content || ""));
    if (!html) continue;
    const opening = extractFirstMainSectionHtml(html);
    const usesLegacySplitHero = openingUsesLegacySplitHero(opening);
    if (usesLegacySplitHero) {
      legacySplitHeroRoutes.push(page.route);
    }
    if ((page.pageKind === "content-collection-index" || page.pageKind === "search-directory") && usesLegacySplitHero) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} reuses the legacy split-hero template instead of a route-owned ${page.pageKind === "content-collection-index" ? "content collection" : "directory"} opening`,
      );
    }
  }

  const repeatedSplitHeroAcrossMajority =
    legacySplitHeroRoutes.length >= 3 &&
    legacySplitHeroRoutes.length >= Math.ceil(Math.max(1, plannedPrimaryRoutes.length) * 0.6);
  const repeatedSplitHeroAcrossRouteHeavySite =
    plannedPrimaryRoutes.length >= 6 &&
    legacySplitHeroRoutes.length >= 4 &&
    legacySplitHeroRoutes.length >= Math.ceil(plannedPrimaryRoutes.length * 0.5);
  if (repeatedSplitHeroAcrossMajority || repeatedSplitHeroAcrossRouteHeavySite) {
    throw new Error(
      `skill_tool_invalid_required_file: repeated primary routes fell back to the same legacy split-hero opening template (${legacySplitHeroRoutes.join(", ")}); give sibling routes distinct opening structures`,
    );
  }
}

export function enforceNavigationOrder(html: string, decision: LocalDecisionPlan, requirementText = ""): string {
  const routeOrder = new Map(
    decision.routes.map((route, index) => [normalizeRouteKey(route), index]),
  );
  const routeLabel = new Map(
    decision.routes.map((route, index) => [normalizeRouteKey(route), String(decision.navLabels[index] || "").trim()]),
  );
  if (routeOrder.size <= 1) return html;

  const zhRouteLabel = new Map(
    decision.routes.map((route) => [normalizeRouteKey(route), localizedKnownRouteLabel(route, "zh-CN")]),
  );
  const enRouteLabel = new Map(
    decision.routes.map((route) => [normalizeRouteKey(route), localizedKnownRouteLabel(route, "en")]),
  );
  const requestedLocale = resolveRequestedExperienceLocale(requirementText, decision.locale);
  const visibleLocale: "zh-CN" | "en" =
    requestedLocale === "bilingual"
      ? bilingualDefaultVisibleLanguage(requirementText)
      : requestedLocale === "zh-CN"
        ? "zh-CN"
        : "en";

  const localizeKnownRouteAnchor = (anchorHtml: string, route: string): string => {
    if (/\bclass=(["'])[^"']*\bbrand\b[^"']*\1/i.test(String(anchorHtml || ""))) {
      return anchorHtml;
    }
    const normalizedRoute = normalizeRouteKey(route);
    const zhLabel = zhRouteLabel.get(normalizedRoute);
    const enLabel = routeLabel.get(normalizedRoute) || enRouteLabel.get(normalizedRoute);
    const visibleLabel = visibleLocale === "en" ? enLabel : zhLabel;
    if (!zhLabel || !enLabel || !visibleLabel) return anchorHtml;
    const keepBilingualNavPayload = shouldUseLocaleExperience(requirementText, decision.locale);
    return String(anchorHtml || "").replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/i, (_anchorFull, attrs) => {
      const cleanedAttrs = String(attrs || "")
        .replace(/\sdata-i18n(?:-zh|-en)?(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
        .trim();
      if (!keepBilingualNavPayload) {
        return `<a${cleanedAttrs ? ` ${cleanedAttrs}` : ""}>${visibleLabel}</a>`;
      }
      return `<a${cleanedAttrs ? ` ${cleanedAttrs}` : ""} data-i18n data-i18n-zh="${escapeHtmlAttribute(zhLabel)}" data-i18n-en="${escapeHtmlAttribute(enLabel)}">${visibleLabel}</a>`;
    });
  };

  const rewriteKnownRouteAnchors = (sourceHtml: string): string =>
    String(sourceHtml || "").replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (anchorFull, href) => {
      const normalizedRoute = normalizeHrefRoute(String(href || ""));
      if (!routeOrder.has(normalizedRoute)) return anchorFull;
      return localizeKnownRouteAnchor(anchorFull, normalizedRoute);
    });

  const extractLocaleToggleMarkup = (sourceHtml: string): string => {
    const explicitWrapper = String(sourceHtml || "").match(
      /<([a-zA-Z][\w:-]*)\b[^>]*class=(["'])[^"']*\blocale-switch\b[^"']*\2[^>]*>[\s\S]*?<\/\1>/i,
    )?.[0];
    if (explicitWrapper) return explicitWrapper;
    const selectWrapper = String(sourceHtml || "").match(
      /<([a-zA-Z][\w:-]*)\b[^>]*data-locale-select[^>]*>[\s\S]*?<\/\1>/i,
    )?.[0];
    if (selectWrapper) return `<div class="locale-switch" aria-label="Language switch">${selectWrapper}</div>`;
    const buttons = Array.from(
      String(sourceHtml || "").matchAll(/<button\b[^>]*data-locale-toggle[^>]*>[\s\S]*?<\/button>/gi),
    ).map((match) => String(match[0] || "").trim()).filter(Boolean);
    if (buttons.length === 0) return "";
    return `<div class="locale-switch" aria-label="Language switch">${buttons.join("")}</div>`;
  };

  const buildOrderedKnownAnchorMarkup = (innerHtml: string, includeLocaleToggle: boolean, addMissingKnownRoutes = true): string => {
    const anchors = Array.from(String(innerHtml || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi));
    const keepBilingualNavPayload = shouldUseLocaleExperience(requirementText, decision.locale);
    const localeToggleMarkup =
      includeLocaleToggle && keepBilingualNavPayload ? extractLocaleToggleMarkup(String(innerHtml || "")) : "";
    const brandAnchors = anchors
      .map((match, originalIndex) => ({
        tag: String(match[0] || ""),
        route: normalizeHrefRoute(match[1]),
        originalIndex,
      }))
      .filter((item) => /\bclass=(["'])[^"']*\bbrand\b[^"']*\1/i.test(item.tag));
    const known = anchors
      .map((match, originalIndex) => ({
        tag: localizeKnownRouteAnchor(String(match[0] || ""), normalizeHrefRoute(match[1])),
        route: normalizeHrefRoute(match[1]),
        originalIndex,
      }))
      .filter((item) => routeOrder.has(item.route) && !/\bclass=(["'])[^"']*\bbrand\b[^"']*\1/i.test(item.tag));
    if (known.length < 1) {
      return String(innerHtml || "");
    }

    const sortedKnown = [...known].sort((left, right) => {
      const leftOrder = routeOrder.get(left.route) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = routeOrder.get(right.route) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.originalIndex - right.originalIndex;
    });
    const dedupedKnown = sortedKnown.filter(
      (item, index, items) => items.findIndex((candidate) => candidate.route === item.route) === index,
    );
    const unknown = anchors
      .map((match, originalIndex) => ({
        tag: match[0],
        route: normalizeHrefRoute(match[1]),
        originalIndex,
      }))
      .filter(
        (item) =>
          !routeOrder.has(item.route) && !/\bclass=(["'])[^"']*\bbrand\b[^"']*\1/i.test(String(item.tag || "")),
      );

    const seenKnownRoutes = new Set(dedupedKnown.map((item) => item.route));
    const missingKnown = addMissingKnownRoutes
      ? decision.routes
          .map((route) => normalizePath(route))
          .map((route) => normalizeRouteKey(route))
          .filter((route) => route !== "/" && !seenKnownRoutes.has(route))
          .map((route) => {
            const zhLabel = zhRouteLabel.get(route) || localizedKnownRouteLabel(route, "zh-CN");
            const enLabel = routeLabel.get(route) || enRouteLabel.get(route) || localizedKnownRouteLabel(route, "en");
            const visibleLabel = visibleLocale === "en" ? enLabel : zhLabel;
            if (!keepBilingualNavPayload) {
              return `<a href="${route}">${visibleLabel}</a>`;
            }
            return `<a href="${route}" data-i18n data-i18n-zh="${escapeHtmlAttribute(zhLabel)}" data-i18n-en="${escapeHtmlAttribute(enLabel)}">${visibleLabel}</a>`;
          })
      : [];

    return [
      ...brandAnchors.map((item) => item.tag),
      ...dedupedKnown.map((item) => item.tag),
      ...missingKnown,
      ...unknown.map((item) => item.tag),
      ...(localeToggleMarkup ? [localeToggleMarkup] : []),
    ].join("\n          ");
  };

  const reorderKnownRouteBlock = (tagName: "nav" | "footer", sourceHtml: string): string =>
    String(sourceHtml || "").replace(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi"), (full, attrs, inner) => {
      const innerHtml = String(inner || "");
      if (tagName === "nav" && /\bfooter(?:-|__)(?:nav|links)\b/i.test(String(attrs || ""))) {
        const reorderedInner = buildOrderedKnownAnchorMarkup(innerHtml, false, false);
        if (reorderedInner === innerHtml) return full;
        return `<${tagName}${attrs}>${reorderedInner}</${tagName}>`;
      }
      if (tagName === "footer" && hasStructuredFooterShellMarkup(innerHtml)) {
        const rewrittenInner = innerHtml.replace(
          /<([a-zA-Z][\w:-]*)\b([^>]*)class=(["'])([^"']*\bfooter(?:-|__)(?:nav|links)\b[^"']*)\3([^>]*)>([\s\S]*?)<\/\1>/gi,
          (_match, elementName: string, beforeClassAttrs: string, quote: string, classValue: string, afterClassAttrs: string, blockInner: string) => {
            const reorderedInner = buildOrderedKnownAnchorMarkup(String(blockInner || ""), false, false);
            return `<${elementName}${beforeClassAttrs}class=${quote}${classValue}${quote}${afterClassAttrs}>${reorderedInner}</${elementName}>`;
          },
        );
        return `<${tagName}${attrs}>${rewrittenInner}</${tagName}>`;
      }

      const reordered = buildOrderedKnownAnchorMarkup(innerHtml, tagName === "nav");
      if (reordered === innerHtml) return full;
      return `<${tagName}${attrs}>${reordered}</${tagName}>`;
    });

  const dedupeDuplicateFooterLinkGroups = (sourceHtml: string): string =>
    String(sourceHtml || "").replace(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/gi, (footerFull, footerAttrs, footerInner) => {
      if (!hasStructuredFooterShellMarkup(String(footerInner || ""))) return footerFull;
      const seenFingerprints = new Set<string>();
      const dedupedInner = String(footerInner || "").replace(
        /<([a-zA-Z][\w:-]*)\b([^>]*)class=(["'])([^"']*\bfooter(?:-|__)(?:nav|links)\b[^"']*)\3([^>]*)>([\s\S]*?)<\/\1>/gi,
        (_match, elementName: string, beforeClassAttrs: string, quote: string, classValue: string, afterClassAttrs: string, blockInner: string) => {
          const normalizedInner = buildOrderedKnownAnchorMarkup(String(blockInner || ""), false, false);
          const anchors = Array.from(
            String(normalizedInner || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi),
          ).map((anchorMatch) => {
            const tag = String(anchorMatch[0] || "");
            const route = normalizeHrefRoute(String(anchorMatch[1] || ""));
            return { tag, route };
          });
          const knownRoutes = Array.from(
            new Set(
              anchors
                .map((item) => normalizeRouteKey(item.route))
                .filter((route) => route !== "/" && routeOrder.has(route)),
            ),
          ).sort();
          const fingerprint = knownRoutes.join("|");
          if (knownRoutes.length >= 3 && seenFingerprints.has(fingerprint)) {
            const unknownAnchors = anchors
              .filter((item) => {
                const normalizedRoute = normalizeRouteKey(item.route);
                return normalizedRoute === "/" || !routeOrder.has(normalizedRoute);
              })
              .map((item) => item.tag);
            return `<${elementName}${beforeClassAttrs}class=${quote}${classValue}${quote}${afterClassAttrs}>${unknownAnchors.join("\n          ")}</${elementName}>`;
          }
          if (knownRoutes.length >= 3) {
            seenFingerprints.add(fingerprint);
          }
          return `<${elementName}${beforeClassAttrs}class=${quote}${classValue}${quote}${afterClassAttrs}>${normalizedInner}</${elementName}>`;
        },
      );
      return `<footer${footerAttrs}>${dedupedInner}</footer>`;
    });

  return rewriteKnownRouteAnchors(
    dedupeDuplicateFooterLinkGroups(reorderKnownRouteBlock("footer", reorderKnownRouteBlock("nav", String(html || "")))),
  );
}

function splitStaticAndWorkflow(files: RuntimeWorkflowFile[]): {
  staticFiles: RuntimeWorkflowFile[];
  workflowFiles: RuntimeWorkflowFile[];
} {
  const staticFiles: RuntimeWorkflowFile[] = [];
  const workflowFiles: RuntimeWorkflowFile[] = [];
  for (const file of files) {
    if (String(file.path || "").toLowerCase().endsWith(".md")) {
      workflowFiles.push(file);
      continue;
    }
    staticFiles.push(file);
  }
  return {
    staticFiles: dedupeFiles(staticFiles),
    workflowFiles: dedupeFiles(workflowFiles),
  };
}

function buildPagesFromRoutes(routes: string[], staticFiles: RuntimeWorkflowFile[], locale: "zh-CN" | "en", brandName: string) {
  const byPath = new Map(staticFiles.map((file) => [normalizePath(file.path), file]));
  return routes.map((route) => {
    const normalizedRoute = normalizePath(route);
    const filePath = routeToHtmlPath(normalizedRoute);
    const html = rewriteAbsoluteSiteLinksToRelative(
      ensureHtmlDocument(String(byPath.get(filePath)?.content || "")),
      filePath,
    );
    return {
      path: normalizedRoute,
      seo: {
        title: `${extractPageTitleForRoute(normalizedRoute, locale)} | ${brandName}`,
        description: `${brandName} ${extractPageTitleForRoute(normalizedRoute, locale)} page`,
        menuLabel: extractPageTitleForRoute(normalizedRoute, locale),
        navLabel: extractPageTitleForRoute(normalizedRoute, locale),
      },
      html,
    };
  });
}

function isPrimaryBlogIndexHtmlFile(decision: LocalDecisionPlan, filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const blogRoutes = getBlogDataSourceRoutes(decision).map((route) => routeToHtmlPath(route));
  return blogRoutes.includes(normalized);
}

function discoveredBlogDetailChecklist(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[] = []): string[] {
  const detailRoutes: string[] = [];
  for (const file of files) {
    if (isPrimaryBlogIndexHtmlFile(decision, file.path)) {
      detailRoutes.push(...extractBlogDetailRoutes(String(file.content || "")));
    }
  }
  return Array.from(new Set(detailRoutes)).map((route) => routeToHtmlPath(route));
}

function requestedBlogDetailChecklist(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[] = [],
  requirementText = "",
): string[] {
  const requestedCount = requestedPublishableContentCount(requirementText);
  if (!requestedCount) return [];
  return discoveredBlogDetailChecklist(decision, files).slice(0, requestedCount);
}

function selectedBlogDetailRoutesForRequirement(
  detailRoutes: string[],
  requirementText = "",
  websiteSurfaceMode?: WebsiteSurfaceMode,
): string[] {
  const uniqueRoutes = Array.from(new Set(detailRoutes.map((route) => normalizePath(route)).filter(Boolean)));
  const requestedCount = requestedPublishableContentCount(requirementText);
  if (requestedCount) return uniqueRoutes.slice(0, requestedCount);
  if (shouldRequireAllDiscoveredBlogDetails(requirementText)) return uniqueRoutes;
  return uniqueRoutes.slice(
    0,
    resolveUnrequestedBlogDetailLimit({
      requirementText,
      websiteSurfaceMode,
    }),
  );
}

function requiredFileChecklist(decision: LocalDecisionPlan, params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {}): string[] {
  const requirementText = params.requirementText || "";
  const localePlan = buildEffectiveLocalePlan(requirementText, decision.locale);
  const discoveredDetails = discoveredBlogDetailChecklist(decision, params.files || []);
  const manifestDeclaredDetails = manifestDeclaredHtmlFiles(decision).filter((filePath) => isBlogDetailHtmlPath(filePath));
  const requestedCount = requestedPublishableContentCount(requirementText);
  const blogDetailFillRequested = hasExplicitBlogDetailFillRequest(requirementText);
  const requiredDetails = blogDetailFillRequested
    ? requestedCount
      ? Array.from(new Set([...manifestDeclaredDetails.slice(0, requestedCount), ...discoveredDetails.slice(0, requestedCount)]))
      : manifestDeclaredDetails.length > 0
        ? manifestDeclaredDetails
        : shouldRequireAllDiscoveredBlogDetails(requirementText)
          ? discoveredDetails
          : discoveredDetails.slice(
              0,
              resolveUnrequestedBlogDetailLimit({
                requirementText,
              }),
            )
    : [];
  const manifestAllowedDetails = requiredDetails.filter((filePath) =>
    manifestAllowsOutputFile(decision, filePath, requirementText),
  );
  const localeTargets =
    localePlan.mode === "single"
      ? []
      : localePlan.mode === "multilingual"
        ? [I18N_LOCALE_REGISTRY_PATH, localePlan.sourceCatalogPath]
        : [I18N_MESSAGE_EN_PATH, I18N_MESSAGE_ZH_CN_PATH];
  return Array.from(new Set([
    "/styles.css",
    "/script.js",
    ...localeTargets,
    ...decision.routes.map((route) => routeToHtmlPath(route)),
    ...manifestAllowedDetails,
  ]));
}

function hasBlogIndexRoute(decision: LocalDecisionPlan): boolean {
  return getBlogDataSourceRoutes(decision).length > 0;
}

function resolveHtmlTargetsPerRound(decision: LocalDecisionPlan, requirementText = ""): number {
  const requestedCount = requestedPublishableContentCount(requirementText) || 0;
  return hasBlogIndexRoute(decision) || requestedCount > 0 ? BLOG_HTML_TARGETS_PER_ROUND : HTML_TARGETS_PER_ROUND;
}

export function requiredWebsiteFileChecklistForAdapter(
  decision: LocalDecisionPlan,
  params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
): string[] {
  return requiredFileChecklist(decision, params);
}

function resolveMaxToolRounds(decision: LocalDecisionPlan, requirementText = ""): number {
  const requestedCount = requestedPublishableContentCount(requirementText) || 0;
  const sharedRounds = Math.ceil(2 / SHARED_ASSET_TARGETS_PER_ROUND);
  const htmlTargetsPerRound = resolveHtmlTargetsPerRound(decision, requirementText);
  const hasHome = decision.routes.some((route) => normalizePath(route) === "/");
  const nonHomeRouteCount = decision.routes.filter((route) => normalizePath(route) !== "/").length;
  const homeRound = hasHome ? 1 : 0;
  const routeRounds = Math.max(
    1,
    homeRound + Math.ceil(nonHomeRouteCount / Math.max(1, Math.min(INNER_HTML_TARGETS_PER_ROUND, htmlTargetsPerRound))),
  );
  const detailRounds = requestedCount > 0 ? Math.ceil(requestedCount / DETAIL_TARGETS_PER_ROUND) : 0;
  const routeSlackRounds = nonHomeRouteCount >= 5 ? Math.ceil(nonHomeRouteCount / 5) : 0;
  const collectionSlackRounds =
    hasHome &&
    decision.pageBlueprints.filter((page) => {
      const normalizedRoute = normalizePath(page.route);
      return (
        normalizedRoute !== "/" &&
        (page.pageKind === "content-collection-index" || page.pageKind === "search-directory")
      );
    }).length >= 2
      ? 1
      : 0;
  const batchedEmissionRounds = Math.min(
    MAX_TOOL_ROUNDS,
    Math.max(
      4,
      sharedRounds + routeRounds + detailRounds + routeSlackRounds + collectionSlackRounds + 2,
    ),
  );
  return batchedEmissionRounds + MAX_TOOL_QA_REPAIR_ROUNDS;
}

export function resolveWebsiteSkillMaxToolRoundsForAdapter(decision: LocalDecisionPlan, requirementText = ""): number {
  return resolveMaxToolRounds(decision, requirementText);
}

function missingRequiredFiles(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[], requirementText = ""): string[] {
  const set = new Set(files.map((file) => normalizePath(file.path)));
  return requiredFileChecklist(decision, { files, requirementText }).filter((path) => !set.has(path));
}

function orderObjectiveTargets(missingFiles: string[]): string[] {
  const missing = Array.from(new Set(missingFiles.map((item) => normalizePath(item)).filter(Boolean)));
  const css = missing.filter((item) => item === "/styles.css");
  const js = missing.filter((item) => item === "/script.js");
  const i18n = missing.filter((item) => isI18nMessagePath(item));
  const home = missing.filter((item) => item === "/index.html");
  const isSharedOrHome = (item: string) =>
    item === "/styles.css" || item === "/script.js" || isI18nMessagePath(item) || item === "/index.html";
  const routePages = missing
    .filter((item) => item.endsWith("/index.html"))
    .filter((item) => !isSharedOrHome(item))
    .filter((item) => !/^\/blog\/.+\/index\.html$/i.test(item))
    .sort((a, b) => (a === "/blog/index.html" ? -1 : b === "/blog/index.html" ? 1 : a.localeCompare(b)));
  const blogDetails = missing.filter((item) => /^\/blog\/.+\/index\.html$/i.test(item)).sort();
  const other = missing
    .filter((item) => !isSharedOrHome(item))
    .filter((item) => !routePages.includes(item) && !blogDetails.includes(item))
    .sort();
  return [...css, ...js, ...i18n, ...home, ...routePages, ...blogDetails, ...other];
}

function describeObjectiveTarget(target: string): string {
  if (target === "/styles.css") return "/styles.css shared design tokens, responsive layout, card/list/detail styles, and footer/navigation styles";
  if (target === "/script.js") return "/script.js shared lightweight interactions, language switch support when required, navigation behavior, and Blog hydration that preserves fallback markup";
  if (target === I18N_LOCALE_REGISTRY_PATH) return `${I18N_LOCALE_REGISTRY_PATH} locale registry describing defaultLocale, supported locales, and translation-driven runtime behavior`;
  if (target === I18N_MESSAGE_EN_PATH) return `${I18N_MESSAGE_EN_PATH} English-first translation dictionary for visible UI/site copy`;
  if (target === I18N_MESSAGE_ZH_CN_PATH) return `${I18N_MESSAGE_ZH_CN_PATH} zh-CN translation dictionary keyed to the English-first site copy`;
  if (/^\/i18n\/messages\.[A-Za-z0-9-]+\.json$/i.test(target)) {
    const locale = target.replace(/^\/i18n\/messages\.|\.json$/gi, "");
    return `${target} ${locale} translation dictionary keyed to stable site-copy i18n keys`;
  }
  if (target === "/index.html") return "/index.html complete homepage HTML referencing shared CSS/JS";
  if (target === "/blog/index.html") {
    return "/blog/index.html complete Blog/content index HTML with exactly the promised fallback cards and direct /blog/{slug}/ links";
  }
  if (/^\/blog\/.+\/index\.html$/i.test(target)) {
    return `${target} complete Blog detail HTML with a full readable body, headings, shell/header/footer, and shared CSS/JS references`;
  }
  if (target.endsWith("/index.html")) return `${target} complete route HTML referencing shared CSS/JS`;
  return `${target} complete static asset`;
}

type RoundObjective = {
  targetFiles: string[];
  instruction: string;
  strictSingleTarget: boolean;
};

function planRoundObjective(round: number, missingFiles: string[]): RoundObjective {
  const missing = orderObjectiveTargets(missingFiles);
  if (!ENABLE_STAGED_OBJECTIVE || missing.length === 0) {
    return {
      targetFiles: missing,
      instruction: "Emit all missing required files as efficiently as possible.",
      strictSingleTarget: false,
    };
  }

  if (missing.length === 0) {
    return {
      targetFiles: [],
      instruction: "No missing required files.",
      strictSingleTarget: false,
    };
  }

  const sharedTargets = missing.filter((item) => item === "/styles.css" || item === "/script.js");
  const i18nTargets = missing.filter((item) => isI18nMessagePath(item));
  if (sharedTargets.length > 0) {
    const batchedSharedTargets = sharedTargets.slice(0, SHARED_ASSET_TARGETS_PER_ROUND);
    return {
      targetFiles: batchedSharedTargets,
      instruction:
        `Emit the shared static foundation in this round: ${batchedSharedTargets.map(describeObjectiveTarget).join("; ")}. Keep CSS/JS consistent across every planned page. Do not emit HTML unless it is necessary to unblock these shared files.`,
      strictSingleTarget: batchedSharedTargets.length === 1,
    };
  }
  if (i18nTargets.length > 0) {
    const batchedI18nTargets = i18nTargets.slice(0, SHARED_ASSET_TARGETS_PER_ROUND);
    return {
      targetFiles: batchedI18nTargets,
      instruction:
        `Emit the i18n resource files in this round: ${batchedI18nTargets.map(describeObjectiveTarget).join("; ")}. Keep the keys stable and aligned to the English-first visible HTML copy so later translation can happen without regenerating page structure.`,
      strictSingleTarget: batchedI18nTargets.length === 1,
    };
  }

  const hasBlogWork = missing.some((item) => item === "/blog/index.html" || /^\/blog\/.+\/index\.html$/i.test(item));
  const htmlTargetsThisRound = hasBlogWork ? BLOG_HTML_TARGETS_PER_ROUND : HTML_TARGETS_PER_ROUND;
  const hasHomeTarget = missing.includes("/index.html");
  if (hasHomeTarget) {
    return {
      targetFiles: ["/index.html"],
      instruction:
        `Emit the homepage first in this round: ${describeObjectiveTarget("/index.html")}. Focus on the shared shell, hero hierarchy, navigation, footer continuity, and first-impression quality before expanding the interior route batch.`,
      strictSingleTarget: false,
    };
  }
  const pageTargets = missing
    .filter((item) => item.endsWith("/index.html"))
    .filter((item) => !/^\/blog\/.+\/index\.html$/i.test(item))
    .slice(0, Math.min(htmlTargetsThisRound, INNER_HTML_TARGETS_PER_ROUND));
  if (pageTargets.length > 0) {
    const serialPageMode = pageTargets.length === 1;
    return {
      targetFiles: pageTargets,
      instruction:
        `Emit these complete route HTML documents in one consistent batch: ${pageTargets.map(describeObjectiveTarget).join("; ")}. Reuse the same header, navigation, footer, CSS, JS, language switch mechanics, and route order. Each page body must be route-specific and visitor-facing; never explain browsing order or page mechanics.`,
      strictSingleTarget: serialPageMode,
    };
  }

  const detailTargets = missing
    .filter((item) => /^\/blog\/.+\/index\.html$/i.test(item))
    .slice(0, DETAIL_TARGETS_PER_ROUND);
  if (detailTargets.length > 0) {
    const serialDetailMode = detailTargets.length === 1;
    return {
      targetFiles: detailTargets,
      instruction:
        serialDetailMode
          ? `Emit this complete Blog/detail page in this round: ${detailTargets.map(describeObjectiveTarget).join("; ")}. Focus on finishing this one detail completely before moving to the next. Preserve the same shared shell, navigation, footer, bilingual behavior when required, and CSS/JS references. Do not emit stubs, excerpts-only pages, metadata-only pages, rewritten indexes, or fallback-derived filler.`
          : `Emit these complete Blog/detail pages in one batch: ${detailTargets.map(describeObjectiveTarget).join("; ")}. Each detail must expand the matching card topic into a full body page and preserve the same shared shell, navigation, footer, bilingual behavior when required, and CSS/JS references. Do not emit stubs, excerpts-only pages, metadata-only pages, rewritten indexes, or fallback-derived filler.`,
      strictSingleTarget: serialDetailMode,
    };
  }

  const otherTargets = missing.slice(0, Math.max(2, Number(process.env.SKILL_TOOL_MISC_TARGETS_PER_ROUND || 6)));
  return {
    targetFiles: otherTargets,
    instruction:
      `Emit these remaining required files in one batch: ${otherTargets.map(describeObjectiveTarget).join("; ")}.`,
    strictSingleTarget: false,
  };
}

function emitSnapshot(params: {
  stepKey: string;
  stepIndex: number;
  totalSteps: number;
  status: string;
  locale: "zh-CN" | "en";
  files: RuntimeWorkflowFile[];
  workflowArtifacts: RuntimeWorkflowFile[];
  pages: Array<{ path: string; html: string }>;
  qaSummary?: QaSummary;
  provider?: LlmProvider;
  model?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  routeUnits?: SkillToolExecutorStepSnapshot["routeUnits"];
  onStep?: (snapshot: SkillToolExecutorStepSnapshot) => Promise<void> | void;
}): Promise<void> | void {
  if (!params.onStep) return;
  return params.onStep({
    stepKey: params.stepKey,
    stepIndex: params.stepIndex,
    totalSteps: params.totalSteps,
    status: params.status,
    files: params.files,
    workflowArtifacts: params.workflowArtifacts,
    pages: params.pages,
    preferredLocale: params.locale,
    qaSummary: params.qaSummary,
    provider: params.provider,
    model: params.model,
    websiteSurfaceMode: params.websiteSurfaceMode,
    routeUnits: params.routeUnits,
  });
}

function buildRouteUnitQaSummary(): QaSummary {
  return {
    averageScore: 1,
    totalRoutes: 1,
    passedRoutes: 1,
    totalRetries: 0,
    retriesAllowed: MAX_TOOL_QA_REPAIR_ROUNDS,
    antiSlopIssueCount: 0,
    categories: [],
  };
}

export function planWebsiteSkillRoundObjectiveForAdapter(round: number, missingFiles: string[]): SkillExecutionRoundObjective {
  return planRoundObjective(round, missingFiles);
}

function buildToolRoundPrompt(params: {
  round: number;
  totalRounds: number;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  loadedSkillIds: string[];
  emittedFiles: RuntimeWorkflowFile[];
  requiredMissing: string[];
  objective: RoundObjective;
  requirementText: string;
  analysisRequirementText?: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
}): string {
  const analysisRequirementText = String(params.analysisRequirementText || params.requirementText || "");
  const decisionWorkflowSurfaceMode = resolveWorkflowSurfaceSelection(
    (((params.decision as any)?.workflow_context || {}) as Record<string, unknown>) || undefined,
  ).websiteSurfaceMode;
  const indexOnlyPortfolioBlogFirstPass =
    shouldUseIndexOnlyPortfolioBlogFirstPass({
      requirementText: analysisRequirementText,
      websiteSurfaceMode: params.websiteSurfaceMode || decisionWorkflowSurfaceMode,
    }) ||
    (params.loadedSkillIds.includes("portfolio-blog-site") &&
      shouldUseIndexOnlyPortfolioBlogFirstPass({
        requirementText: analysisRequirementText,
        websiteSurfaceMode: "portfolio-blog-site",
      }));
  const sharedAssetRound = isSharedAssetRound(params.objective.targetFiles);
  const currentFiles = params.emittedFiles
    .map((file) => `- ${file.path} (${file.type}, ${String(file.content || "").length} chars)`)
    .join("\n");
  const targetContracts = sharedAssetRound
    ? []
    : params.objective.targetFiles
    .map((target) => normalizePath(target))
    .filter((target) => target.endsWith(".html"))
    .slice(0, 6)
    .map((target) =>
      formatRuntimeTargetPageContract(params.decision, target, params.requirementText, {
        focused:
          !sharedAssetRound &&
          params.objective.targetFiles.length === 1 &&
          target === normalizePath(params.objective.targetFiles[0] || "") &&
          target.endsWith(".html"),
      }),
    )
    .filter(Boolean);
  const firstTarget = params.objective.targetFiles[0] ? normalizePath(params.objective.targetFiles[0]) : "";
  const singleHtmlTargetRound =
    !sharedAssetRound &&
    params.objective.targetFiles.length === 1 &&
    firstTarget.endsWith(".html");
  const focusedPage = singleHtmlTargetRound ? findPageBlueprint(params.decision, htmlPathToRoute(firstTarget) || "/") : undefined;
  const focusedPageKind = focusedPage?.pageKind || "";
  const focusedBlogTarget = isContentBackedPageKind(focusedPageKind) || /^\/blog\/[^/]+\/?$/.test(htmlPathToRoute(firstTarget) || "");
  const focusedRequiresBlogDetailPages = focusedPage
    ? shouldRequireBlogDetailPagesForRoutePolicy({
        route: focusedPage.route,
        navLabel: focusedPage.navLabel,
        requirementText: analysisRequirementText,
        pageKind: focusedPage.pageKind,
      })
    : false;
  const focusedHomeTarget = focusedPageKind === "home" || firstTarget === "/index.html";
  const includeFullContract =
    !sharedAssetRound &&
    !singleHtmlTargetRound &&
    (firstTarget.endsWith(".html") || params.round >= 3 || !params.objective.strictSingleTarget);
  const blogDataRoutes = getBlogDataSourceRoutes(params.decision);
  const plannedContentRoutesRequireDetails = params.decision.pageBlueprints.some(
                (page) =>
                  isContentBackedPageKind(page.pageKind) &&
                  shouldRequireBlogDetailPagesForRoutePolicy({
                    route: page.route,
                    navLabel: page.navLabel,
                    requirementText: analysisRequirementText,
                    pageKind: page.pageKind,
                  }),
  );
  const requestedContentCount = requestedPublishableContentCount(analysisRequirementText);
  let requestedContentGate = "";
  if (!sharedAssetRound && (!singleHtmlTargetRound || focusedBlogTarget)) {
    if (requestedContentCount) {
      requestedContentGate = `Requested publishable content gate: the brief asks for ${requestedContentCount} complete content item(s). Blog/content-backed output must provide ${requestedContentCount} full article/detail targets with body prose, not title-only cards or explanatory list mechanics.`;
    } else if (indexOnlyPortfolioBlogFirstPass) {
      requestedContentGate =
        "Portfolio/blog first-pass gate: keep the initial blog surface archive-first. Emit a strong /blog/index.html page with archive-ready cards or collection entries, but do not emit /blog/{slug}/ links or static /blog/{slug}/index.html files until the dedicated blog-detail-fill stage.";
    } else if (focusedRequiresBlogDetailPages || (!singleHtmlTargetRound && plannedContentRoutesRequireDetails)) {
      requestedContentGate = `Requested publishable content gate: no explicit article count was requested. ${describeUnrequestedBlogDetailPolicy()}.`;
    } else {
      requestedContentGate =
        "Requested publishable content gate: no explicit article count was requested. For generic information-platform, research, standards, and resource-collection routes, keep the first pass collection-first and do not invent /blog/{slug}/ detail targets.";
    }
  }
  const localePlan = buildLocalePlan(analysisRequirementText, params.decision.locale);
  const requiresLanguageSwitch = localePlan.mode !== "single";
  const includeBilingualPromptGuidance = localePlan.mode === "bilingual";
  const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(analysisRequirementText);
  const bilingualPromptGuidance = loadBilingualPromptGuidance();
  const renderedRoundLanguageGuidance = renderPromptGuidance(
    bilingualPromptGuidance.roundLanguageGuidance,
    { DEFAULT_VISIBLE_LANGUAGE: defaultVisibleLanguage },
  );
  const renderedRoundStrictProtocol = renderPromptGuidance(
    bilingualPromptGuidance.roundStrictProtocol,
    { DEFAULT_VISIBLE_LANGUAGE: defaultVisibleLanguage },
  );
  const sharedAssetContract = sharedAssetRound
    ? buildSharedAssetRoundContract({
        decision: params.decision,
        targetFiles: params.objective.targetFiles,
        styleName: params.styleName,
        styleReason: params.styleReason,
        requiresLanguageSwitch,
        defaultVisibleLanguage,
      })
    : "";
  const currentFileSummary = singleHtmlTargetRound
    ? `- Current target: ${firstTarget}\n- Shared shell must remain consistent with: ${params.decision.routes.join(", ")}`
    : currentFiles || "(none)";
  const footerShellContract = !sharedAssetRound
    ? [
        "Structured footer shell minimum:",
        '- Every HTML page footer must use a structured shell such as `<footer class="site-footer"><div class="site-footer__inner">...</div></footer>`.',
        "- `/styles.css` must style the top-level `footer`, `.site-footer`, or `.footer` selector with visible footer-band chrome: padding plus at least one of background, border-top, or margin-top.",
        "- Include at least three footer zones with recognizable classes: `footer-brand` or `site-footer__brand`, `footer-nav` or `footer-links`, and `footer-meta`, `footer-actions`, `footer-notes`, or `footer-bottom`.",
        "- Footer cards or columns may sit inside the band, but do not make the footer read as ordinary body cards. The top-level footer must be visually distinct from the main content.",
        "- Do not emit a footer that is only a flat stream of anchors or one copyright line. If /styles.css defines footer shell utilities, the HTML must use those same utilities.",
      ].join("\n")
    : "";
  const focusedRouteDesignSpec = singleHtmlTargetRound
    ? buildWebsiteDesignSpecRouteExcerpt({
        decision: params.decision,
        requirementText: params.requirementText,
        stylePreset: params.stylePreset,
        designHit: {
          id: params.styleName,
          slug: params.styleName,
          name: params.styleName,
          design_desc: params.styleReason,
          selection_mode: "runtime",
          selection_candidates: [],
        } as any,
      }, htmlPathToRoute(firstTarget) || "/")
    : "";
  return [
    `Round: ${params.round + 1}/${params.totalRounds}`,
    `Routes: ${params.decision.routes.join(", ")}`,
    `Style: ${params.styleName}`,
    `Style reason: ${params.styleReason}`,
    "",
    "Round objective:",
    `- Target files: ${params.objective.targetFiles.join(", ") || "(none)"}`,
    `- Instruction: ${params.objective.instruction}`,
    sharedAssetRound
      ? sharedAssetContract
      : singleHtmlTargetRound
        ? "Focused page contract:"
      : includeFullContract
        ? "Generation contract:"
        : "Generation contract summary:",
    !sharedAssetRound
      ? singleHtmlTargetRound
        ? `- Focus route: ${focusedPage?.route || firstTarget}\n- Page kind: ${focusedPageKind || "intent"}\n- Shared shell/footer/nav must stay aligned with the confirmed manifest.`
        : includeFullContract
        ? contractDigest(params.decision)
        : `- Route count: ${params.decision.routes.length}\n- Primary routes: ${params.decision.routes.slice(0, 3).join(", ")}`
      : "",
    targetContracts.length > 0 ? ["", "Target page contracts:", targetContracts.join("\n\n")].join("\n") : "",
    focusedRouteDesignSpec ? ["", "Focused route design spec:", focusedRouteDesignSpec].join("\n") : "",
    footerShellContract ? ["", footerShellContract].join("\n") : "",
    "",
    `Loaded skills: ${params.loadedSkillIds.join(", ") || "(none)"}`,
    `Missing required files: ${params.requiredMissing.join(", ") || "(none)"}`,
    !sharedAssetRound && !singleHtmlTargetRound
      ? `Content-binding route(s): ${blogDataRoutes.join(", ") || "(none; emit fallback route only if the route plan has no confident content-capable page)"}. This is internal implementation context; visible headings and cards must follow each route's own taxonomy and must not mention backend/runtime/fallback mechanics.`
      : "",
    requestedContentGate,
    ...(includeBilingualPromptGuidance ? renderedRoundLanguageGuidance : []),
    ...(requiresLanguageSwitch && !singleHtmlTargetRound
      ? ["", buildBilingualProtocolReference(defaultVisibleLanguage, analysisRequirementText, params.decision.locale)]
      : []),
    "",
    "Current emitted files:",
    currentFileSummary,
    "",
    "Strict protocol:",
    "- Use native tool calls (load_skill, emit_file, finish); do not fake tool calls in plain text.",
    "- Every round must include at least one tool call until all required files are emitted.",
    "- Emit_file content must be raw file content (no markdown fences, no tool transcript wrappers).",
    indexOnlyPortfolioBlogFirstPass
      ? "- Absolute portfolio/blog first-pass rule: even on `/blog/index.html`, do not emit any `/blog/{slug}/` anchors, detail-page teasers, or static `/blog/{slug}/index.html` files in this run. Keep the archive as index-only cards without live detail routes."
      : "",
    ...(includeBilingualPromptGuidance ? renderedRoundStrictProtocol : []),
    sharedAssetRound
      ? "- For shared-asset rounds, prioritize the common CSS/JS layer only. Do not restate or solve route-specific content architecture inside /styles.css or /script.js."
      : "- Follow the website-generation-workflow skill contract for Canonical Website Prompt adherence, page differentiation, and shared shell/footer rules.",
    params.decision.routeAuthorityMode === "prompt_manifest" || params.decision.routeAuthorityMode === "workflow_manifest"
      ? "- Prompt Control Manifest closed-set rule: emit only the manifest route HTML files plus shared assets. Do not create extra pages, /blog/{slug}/ detail files, archive pages, downloads pages, or alternate route aliases unless those exact routes are present in the manifest."
      : "",
    sharedAssetRound
      ? "- CSS surface-token rule: when emitting /styles.css, read `/website_design_spec.md` and honor its `surface_css_tokens` / `surface_typography_tokens`. These surface tokens override generic style preset colors; do not reuse one green-white rounded-card theme for corporate, docs, and content-hub surfaces."
      : "",
    sharedAssetRound
      ? "- Shared-asset completeness rule: every `/styles.css` or `/script.js` emission must be a production-ready complete file for the current route set, not a placeholder, bootstrap comment, partial patch, TODO stub, or 'emit requirement' shim."
      : "",
    sharedAssetRound
      ? "- Shared-asset completeness rule: `/styles.css` must stand on its own with root tokens, typography, layout, header/nav, buttons, cards, forms, footer, and responsive rules. `/script.js` must stand on its own with valid syntax and only the shared behavior actually required by the generated site."
      : "",
    "- Follow the Website Quality Contract: website-only scope, multi-device WYSIWYG preview, strong visual direction, responsive CSS, and no placeholder/template slop.",
    "- Multi-page generation must be coherent, not fragile: keep one shared HTML shell contract, one shared navigation order, one shared footer, one shared CSS system, one shared JS behavior layer, one shared bilingual switch behavior when requested, and pass the same QA gate across every emitted page.",
    "- When this round targets multiple files, emit every target file in the same round unless a provider error prevents it. Do not split one straightforward multi-page website into one model round per file.",
    ...(!sharedAssetRound
      ? [
          "- Visitor-facing content must be final site content. Do not show explanatory scaffolding such as reading method, what you'll find, article collection, this page collects, each article includes date/read time/tags, launch articles, three launch articles, 首发文章, 三篇首发文章, or their Chinese equivalents.",
          "- Visitor-facing content must not reuse internal planning vocabulary. Never render phrases such as assumption notes, content gap, Prompt Control Manifest, source priorities, page brief, source material appendix, internal prompt, or requirement completion.",
          "- Visitor-facing copy must talk about the site's subject, not the page mechanics. Do not write sentences like 'the page groups...', 'the homepage frames...', 'the home page foregrounds...', or 'the visual system keeps...'. Replace them with concrete subject matter, proof, docs topics, product capabilities, or user outcomes.",
          "- Shared footer rule: do not duplicate the same route list under multiple footer headings. If one group already contains the main route navigation, the other footer groups must serve different jobs such as contact, support, proof, or topical shortcuts.",
          "- Follow Open Design copy discipline: concise H1/H2 headlines, one-to-two-sentence leads, and CTA labels that say what happens next. Avoid generic CTAs like Learn More, Read More, Get Started, or Click Here.",
          ...(focusedBlogTarget || (!singleHtmlTargetRound && (requestedContentCount || 0) > 0)
            ? [
                "- If the brief asks for three articles, present the actual three article cards and complete article bodies; do not write a site-structure explanation that says the page has three launch/first articles.",
                "- Blog/content-index hero text must express a real thesis or value proposition about the topic. Never use hero or section lead sentences that merely tell the visitor how to browse, read, or start the list.",
                "- If the brief asks for three articles, present the actual three article cards and complete article bodies; do not write a site-structure explanation that gives the reader an order for consuming them.",
                "- Treat requested article count as invisible production logic. The page may contain exactly three cards, but visible copy must not announce the count with slogans like three articles, three launch articles, three ways, here are three complete articles, or 持续更新三篇首发文章.",
                ...(indexOnlyPortfolioBlogFirstPass
                  ? [
                      "- Portfolio/blog initial pass rule: `/blog/index.html` must stay index-only. Use archive-ready non-linked cards or collection entries; do not emit `/blog/{slug}/` anchors, teaser CTAs that imply a live article route, or static `/blog/{slug}/index.html` files in this run.",
                    ]
                  : []),
                focusedRequiresBlogDetailPages || (!singleHtmlTargetRound && plannedContentRoutesRequireDetails)
                  ? "- Do not rely on data-fallback-posts, hidden templates, or script-only rendering to satisfy Blog detail-link requirements. The initial HTML in [data-shpitto-blog-list] must visibly contain the article cards and /blog/{slug}/ links."
                  : "- For generic information-platform, research, standards, and resource-collection routes, fallback cards may stay collection cards without /blog/{slug}/ links unless the brief explicitly asks for publishable detail pages.",
                focusedRequiresBlogDetailPages || (!singleHtmlTargetRound && plannedContentRoutesRequireDetails)
                  ? "- Do not use same-page anchors such as #article-detail, accordions, hidden panels, or inline sections as substitutes for Blog detail pages. Blog cards must link to /blog/{slug}/ and each linked detail must be emitted as /blog/{slug}/index.html."
                  : "- For generic collection routes, do not emit hidden or orphaned /blog/{slug}/ shells that are not promised by visible cards or explicit article/archive requirements.",
                "- If a Blog/content list uses an outer card class like .article-card or .blog-card, that exact class must carry the essential padding itself. Do not put all gutters only on nested wrappers such as __body or __content, because runtime hydration may replace inner markup.",
              ]
            : []),
          ...(focusedHomeTarget || !singleHtmlTargetRound
            ? [
                "- On the home page, do not explain the site by summarizing or sequencing the current Blog articles. Link to the Blog with a topical CTA, not with copy like 'the blog currently has three recent articles' or 'start from these three'.",
                "- On the home page, if you render a 2-4 card row for themes, strengths, coverage areas, or editorial pillars, make each item a spacious feature card with explicit four-side padding and parent-controlled gap. Avoid compressed border-only shells.",
                "- On the home page, small hero-side stat cards should be labels plus short facts, not paragraph containers. If the card copy needs a sentence, use a full-width list item or roomy feature card instead of a narrow stat column.",
                "- Decorative numerals, step numbers, watermarks, or corner badges inside those home feature cards must be visibly inset from the edge and must not steal the text gutter from the title/body column.",
              ]
            : []),
          "- Avoid repeated generic section names like only surface/section/cards across every page; use route-specific module classes where useful.",
        ]
      : [
          "- Shared-asset rounds should avoid page-level visitor copy rules unless they directly affect the common shell. Keep the prompt compact enough for fast CSS/JS emission.",
        ]),
    params.objective.strictSingleTarget
      ? "- This round must focus on the objective target file only."
      : "- Emit all objective target files in this round when practical; batch shared assets, route pages, and Blog detail pages rather than serializing one file per round.",
    "- Call finish only after all required files exist and are complete.",
  ].join("\n");
}

export function buildWebsiteSkillToolRoundPromptForAdapter(params: {
  round: number;
  totalRounds: number;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  loadedSkillIds: string[];
  emittedFiles: RuntimeWorkflowFile[];
  requiredMissing: string[];
  objective: SkillExecutionRoundObjective;
  requirementText: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
}): string {
  return buildToolRoundPrompt(params);
}

export async function renderWebsiteSeedSkillSidecarGuidance(
  selections: WebsiteSeedSkillSelection[],
  options?: {
    maxChars?: number;
    routes?: string[];
    websiteSurfaceMode?: WebsiteSurfaceMode;
    routeFamilies?: ProjectSkillRouteFamily[];
  },
): Promise<string> {
  const maxChars = options?.maxChars || DEFAULT_INITIAL_SEED_GUIDANCE_CHARS;
  const uniqueSelections = Array.from(
    new Map((selections || []).filter((item) => item?.id).map((item) => [item.id, item])).values(),
  ).slice(0, 4);
  if (uniqueSelections.length === 0) return "";

  const blocks: string[] = [];
  for (const selection of uniqueSelections) {
    try {
      const skill = await loadProjectSkill(selection.id);
      const resourceIndex = renderProjectSkillResourceIndex(skill.resourceIndex);
      const resourceContract = renderProjectSkillResourceContract(skill.resourceIndex, {
        routes: options?.routes,
        surfaceMode: options?.websiteSurfaceMode,
        routeFamilies: options?.routeFamilies,
      });
      blocks.push(
        [
          `## seed:${skill.id}`,
          `- selection_reason: ${selection.reason || "surface/intent match"}`,
          skill.websiteMetadata?.activation?.mode ? `- activation_mode: ${skill.websiteMetadata.activation.mode}` : "",
          skill.websiteMetadata?.activation?.rolloutStatus
            ? `- rollout_status: ${skill.websiteMetadata.activation.rolloutStatus}`
            : "",
          resourceIndex,
          resourceContract,
          resourceContract ? "" : undefined,
          skill.seedContract?.visualBoldness ? `- visual_boldness: ${skill.seedContract.visualBoldness}` : "",
          "### Contract excerpt",
          clipRuntimeRequirement(skill.content, Math.max(900, Math.floor(maxChars / Math.max(1, uniqueSelections.length)))),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (error) {
      blocks.push(
        [
          `## seed:${selection.id}`,
          `- selection_reason: ${selection.reason || "surface/intent match"}`,
          `- load_status: unavailable (${String((error as Error)?.message || error || "unknown error")})`,
        ].join("\n"),
      );
    }
  }

  const guidance = [
    "# Recommended Website Primary Seed Guidance",
    "",
    "Use these selected seed skills as compact source-of-truth guidance for visual structure, route openings, route topology, and content consistency.",
    "When a listed seed has an example-backed HTML contract, preserve its discipline without copying placeholder text.",
    "Call load_skill for the full skill before expanding a route family or shared design system from it.",
    "",
    ...blocks,
  ].join("\n");

  return clipRuntimeRequirement(guidance, maxChars);
}

export function resolveWebsiteSkillRoundProviderConfigForTesting(
  config: ProviderConfig,
  objective: SkillExecutionRoundObjective,
): ProviderConfig {
  return resolveRoundProviderConfig(config, objective as RoundObjective);
}

export async function invokeWebsiteSkillRoundWithProviderFallbackForTesting(params: {
  attempts: Array<{ config: ProviderConfig }>;
  preferredProvider?: LlmProvider;
  excludedProviders?: LlmProvider[];
  objective: SkillExecutionRoundObjective;
  forceEmitFile?: boolean;
  invokeRound: (args: {
    config: ProviderConfig;
    toolChoice: any;
    messages: BaseMessage[];
    idleTimeoutMs: number;
    absoluteTimeoutMs: number;
    operation: string;
  }) => Promise<ToolRoundOutput>;
}): Promise<{ provider: LlmProvider; model: string; notes: string[] }> {
  const attempts: ProviderAttempt[] = params.attempts.map((attempt, index) => ({
    lock: {
      provider: attempt.config.provider,
      model: attempt.config.modelName,
      reason: `test-attempt-${index + 1}`,
    } as RunProviderLock,
    config: attempt.config,
  }));
  const preferredAttempt =
    attempts.find((attempt) => attempt.config.provider === params.preferredProvider) || attempts[0];
  const result = await invokeRoundWithProviderFallback({
    attempts,
    preferredAttempt,
    excludedProviders: new Set(params.excludedProviders || []),
    objective: params.objective as RoundObjective,
    messages: [new HumanMessage("test")],
    idleTimeoutMs: 5_000,
    absoluteTimeoutMs: 10_000,
    operation: "test-round",
    forceEmitFile: params.forceEmitFile === true,
    createModel: ({ config, toolChoice, requestTimeoutMs }) =>
      ({
        invoke: async () => ({ content: "" }),
        __config: config,
        __toolChoice: toolChoice,
        __requestTimeoutMs: requestTimeoutMs,
      }) as unknown as ToolProtocolModel,
    invokeRound: async ({ model, messages, idleTimeoutMs, absoluteTimeoutMs, operation }) =>
      params.invokeRound({
        config: (model as any).__config,
        toolChoice: (model as any).__toolChoice,
        messages,
        idleTimeoutMs,
        absoluteTimeoutMs,
        operation,
      }),
  });
  return {
    provider: result.attempt.config.provider,
    model: result.attempt.config.modelName,
    notes: result.notes,
  };
}

export async function runSkillToolExecutor(params: SkillToolExecutorParams): Promise<SkillToolExecutorSummary> {
  const requirementText = extractRequirementText(params.state);
  const parsedRequirement = parseReferencedAssetsFromText(requirementText);
  const referencedAssets = parsedRequirement.referencedAssets;
  const requirementWithReferences = appendReferencedAssetsBlock(
    parsedRequirement.cleanText || requirementText,
    referencedAssets,
  );
  const sanitizedRequirementWithReferences = stripLegacyGenerationBlueprintSections(requirementWithReferences);
  const workflowContext = (params.state as any)?.workflow_context || {};
  const skillId = String(workflowContext.executionSkillId || workflowContext.skillId || "website-generation-workflow");
  const adapter = await getSkillExecutionAdapter(skillId);
  const fullRequirementContext = Array.from(
    new Set(
      [
        sanitizedRequirementWithReferences,
        String(workflowContext.canonicalPrompt || "").trim(),
        String(workflowContext.sourceRequirement || "").trim(),
        String(workflowContext.latestUserTextRaw || "").trim(),
        String(workflowContext.latestUserText || "").trim(),
        String(workflowContext.requirementAggregatedText || "").trim(),
      ].filter(Boolean),
    ),
  ).join("\n\n");
  const promptRequirementContext = buildSkeletonPromptRequirementContext(fullRequirementContext);
  const decision = applyStateSitemapToDecision(buildLocalDecisionPlan(params.state), params.state.sitemap);
  const workflow = await loadWorkflowSkillContext(
    sanitizedRequirementWithReferences,
    normalizeWorkflowVisualDecisionContext(workflowContext as any),
  );
  const qualityContract = renderWebsiteQualityContract();
  const availableSkillIds = await getWebsiteGenerationSkillBundle();
  const websiteSeedSkillIds = await listWebsiteSeedSkillIds();
  const documentSkillIds = await listDocumentContentSkillIds();
  const siteGeneratorMode = resolveWebsiteArtifactGeneratorMode();
  const selectedSeedSkills = await selectWebsiteSeedSkillsForIntent({
    requirementText: sanitizedRequirementWithReferences,
    routes: decision.routes,
    maxSkills: Number(process.env.SKILL_TOOL_MAX_SEED_SKILLS || 2),
    generatorMode: siteGeneratorMode,
  });
  const persistedSelectedSeedSkillIds = Array.isArray((workflowContext as any).selectedSeedSkillIds)
    ? ((workflowContext as any).selectedSeedSkillIds as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const effectiveSelectedSeedSkills =
    persistedSelectedSeedSkillIds.length > 0
      ? Array.from(
          new Map(
            [
              ...persistedSelectedSeedSkillIds.map((id) => ({ id, score: Number.MAX_SAFE_INTEGER, reason: "workflow-context-persisted" })),
              ...selectedSeedSkills,
            ].map((item) => [item.id, item]),
          ).values(),
        )
      : selectedSeedSkills;
  const workflowSurfaceSelection = resolveWorkflowSurfaceSelection(workflowContext as Record<string, unknown> | undefined);
  const selectedDiscoveryBrief = workflowSurfaceSelection.discoveryBrief;
  const selectedWebsiteSurfaceMode = workflowSurfaceSelection.websiteSurfaceMode;
  const selectedSeedContracts = (
    await Promise.all(
      effectiveSelectedSeedSkills.map(async (item) => {
        try {
          const skill = await loadProjectSkill(item.id);
          return skill.seedContract ? { id: skill.id, contract: skill.seedContract } : undefined;
        } catch {
          return undefined;
        }
      }),
    )
  ).filter((item): item is { id: string; contract: Record<string, unknown> } => Boolean(item));
  const selectedSeedRouteFamilies = inferRouteFamiliesForPlanning({
    routes: decision.routes,
    surfaceMode: selectedWebsiteSurfaceMode,
  });
  const strongestVisualBoldness = selectedSeedContracts.some((item) => item.contract.visualBoldness === "high")
    ? "high"
    : "standard";
  const selectedSeedSkillGuidance = await renderWebsiteSeedSkillSidecarGuidance(effectiveSelectedSeedSkills, {
    routes: decision.routes,
    websiteSurfaceMode: selectedWebsiteSurfaceMode,
    routeFamilies: selectedSeedRouteFamilies,
  });
  const selectedDocumentSkills = await selectDocumentContentSkillsForIntent({
    requirementText: sanitizedRequirementWithReferences,
    routes: decision.routes,
    referencedAssets,
    maxSkills: Number(process.env.SKILL_TOOL_MAX_DOCUMENT_SKILLS || 3),
  });
  const stylePreset = normalizeStylePreset(workflow.stylePreset, {});
  const selectedDesignSystemId = String((workflowContext as any).designSystemId || "").trim() || undefined;
  const selectedDesignSystemName = String((workflowContext as any).designSystemName || "").trim() || undefined;
  const forcedRouteUnitTargets = resolveForcedRouteUnitTargets(workflowContext as Record<string, unknown>);
  let providerAttempts = resolveProviderAttempts({
    provider: (params.state as any)?.workflow_context?.lockedProvider,
    model: (params.state as any)?.workflow_context?.lockedModel,
  });
  providerAttempts = providerAttempts.map((attempt) => ({
    ...attempt,
    config: {
      ...attempt.config,
      modelName: resolveScenarioAwareProviderModelId({
        provider: attempt.config.provider,
        requestedModel: attempt.config.modelName,
        fallbackModel: DEFAULT_OPENAI_COMPAT_MODEL,
        surfaceMode: selectedWebsiteSurfaceMode,
        seedAuthorityMode: decision.seedAuthorityMode || "seed-authoritative",
        hasImportedSeed: selectedSeedContracts.length > 0,
        visualBoldness: strongestVisualBoldness,
        routeFamilies: selectedSeedRouteFamilies,
      }),
    },
  }));
  let activeAttempt = providerAttempts[0];
  let lock = activeAttempt.lock;
  let providerConfig = activeAttempt.config;
  const brandName =
    String(decision.brandHint || (params.state as any)?.site_artifacts?.branding?.name || "").trim() ||
    resolveBrandName(decision);
  const totalToolRounds = adapter.resolveMaxToolRounds(decision, fullRequirementContext);
  const expectedRequiredFileCountAtStart =
    forcedRouteUnitTargets.length > 0
      ? forcedRouteUnitTargets.length
      : resolveExpectedRequiredFileCount({
          decision,
          adapter,
          requirementText: fullRequirementContext,
        });
  const providerSelectionTimeoutConfig = resolveRoundTimeouts({
    taskTimeoutMs: params.timeoutMs,
    targetFileCount: Math.min(2, expectedRequiredFileCountAtStart),
  });
  let workflowFiles = buildWorkflowFiles({
    requirementText: sanitizedRequirementWithReferences,
    decision,
    designMd: workflow.designMd,
    locale: decision.locale,
    provider: providerConfig.provider,
    model: providerConfig.modelName,
    stylePreset,
    designHit: workflow.hit,
    websiteSurfaceMode: selectedWebsiteSurfaceMode,
    discoveryBrief: selectedDiscoveryBrief,
    designSystemId: selectedDesignSystemId,
    designSystemName: selectedDesignSystemName,
    siteGeneratorMode,
    selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
    selectedSeedContracts,
  });
  let assistantNotes: string[] = [];
  let completedStaticFiles: RuntimeWorkflowFile[] | undefined;
  let completedQaSummary: QaSummary | undefined;
  let completedQaRecords: SkillToolQaRecord[] = [];
  let lastStageFiles: RuntimeWorkflowFile[] = [];
  let qaRepairAttemptCount = 0;
  const qaRepairFileTargets = new Set<string>();
  let stageMeta: StageAttemptMeta = {
    activeProvider: providerConfig.provider,
    activeModel: providerConfig.modelName,
    attemptedProviders: providerAttempts.map((attempt) => attempt.config.provider),
    fallbackEngaged: false,
    providerNotes: [],
  };

  if (!providerConfig.apiKey) {
    throw new Error(`skill_tool_provider_api_key_missing: provider=${providerConfig.provider}`);
  }

  for (let stageRetry = 0; stageRetry <= SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT; stageRetry += 1) {
    const emittedFiles: RuntimeWorkflowFile[] = [];
    const loadedSkills = new Map<string, string>();
    const stageExcludedProviders = new Set<LlmProvider>();
    assistantNotes = [];
    const toolHistoryMessages: BaseMessage[] = [
      new SystemMessage(
        [
          "You are a senior frontend engineer generating a full static multi-page website.",
          "Output must be produced only through tools.",
          "Never emit placeholder tokens like <UNKNOWN>.",
          "Keep files production-ready and internally consistent.",
          "",
          qualityContract,
          "",
          buildSkillToolSystemInstructions(),
          "",
          "You may call multiple tools in a round.",
        ].join("\n"),
      ),
      new HumanMessage(
        [
          "Initial context:",
          `- User requirement:\n${clipRuntimeRequirement(promptRequirementContext, DEFAULT_INITIAL_REQUIREMENT_CHARS) || "(empty)"}`,
          referencedAssets.length > 0 ? "- Referenced assets (must use when relevant):" : "- Referenced assets: none",
          ...(referencedAssets.length > 0
            ? referencedAssets.map((line) => `  - ${line}`)
            : []),
          `- Locale: ${decision.locale}`,
          `- Preferred design system: ${workflow.hit?.name || workflow.hit?.id || "auto"}`,
          "",
          renderWebsiteArtifactGeneratorContract({
            mode: siteGeneratorMode,
            surfaceMode: selectedWebsiteSurfaceMode,
            selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
          }),
          "",
          `- Available website skills: ${availableSkillIds.join(", ")}`,
          `- Website seed skills discovered from frontmatter: ${websiteSeedSkillIds.join(", ") || "(none)"}`,
          `- Recommended seed skills for this brief: ${effectiveSelectedSeedSkills.map((item) => `${item.id} (${item.reason})`).join(", ") || "(none)"}`,
          selectedSeedSkillGuidance
            ? "- Recommended primary seed guidance is already injected below; still call load_skill for full details when expanding a matching route family."
            : "- No primary seed guidance was injected for this brief.",
          `- Document content skills available: ${documentSkillIds.join(", ") || "(none)"}`,
          `- Recommended document skills for uploaded/source files: ${
            selectedDocumentSkills.map((item) => `${item.id} (${item.reason})`).join(", ") || "(none)"
          }`,
          selectedDocumentSkills.length > 0
            ? "- Load recommended document skills before interpreting extracted source material from uploaded PDFs, Word files, or slide decks."
            : "- No document-specific skill is required unless later tool context introduces PDF, DOCX, or PPTX source files.",
          `- Design rationale: ${
            workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
            workflow.hit?.design_desc ||
            "N/A"
          }`,
          "",
          "Design excerpt:",
          String(workflow.designMd || "").slice(0, DEFAULT_INITIAL_DESIGN_CHARS) || "(no design.md)",
          "",
          "Recommended primary seed guidance:",
          selectedSeedSkillGuidance || "(none)",
          "",
          "Website design specification:",
          workflowFiles.find((file) => normalizePath(file.path) === "/website_design_spec.md")?.content.slice(0, 10_000) ||
            "(no website design spec)",
          "",
          qualityContract,
          "",
          "Workflow skill contract:",
          String(workflow.workflowSkill || "").slice(0, DEFAULT_INITIAL_WORKFLOW_SKILL_CHARS) || "(no workflow skill)",
          "",
          "Required files:",
          adapter.buildRequiredFileChecklist(decision).join(", "),
          requestedPublishableContentCount(fullRequirementContext)
            ? `- The requested content count is ${requestedPublishableContentCount(fullRequirementContext)}. After an explicit Blog/content archive emits its /blog/{slug}/ card links, the same number of static /blog/{slug}/index.html detail files becomes required. Do not finish with only the index page or same-page anchors.`
            : decision.pageBlueprints.some(
                (page) =>
                  isContentBackedPageKind(page.pageKind) &&
                  shouldRequireBlogDetailPagesForRoutePolicy({
                    route: page.route,
                    navLabel: page.navLabel,
                    requirementText: fullRequirementContext,
                    pageKind: page.pageKind,
                  }),
              )
              ? `- If an explicit Blog/content archive is planned, only expose /blog/{slug}/ links when the brief explicitly requests publishable detail pages. Otherwise keep the initial pass index-only and do not emit static detail files.`
              : "- If a generic content-backed collection route is planned, keep the initial pass collection-first. Do not emit /blog/{slug}/ detail files unless the prompt, route identity, or source material explicitly asks for publishable article/news details.",
          stageRetry > 0
            ? `- Fresh-stage retry: ${stageRetry}/${SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT}. Avoid repeating previous repair loops; converge faster.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ];

    try {
      const stageStartedAt = Date.now();
      const selectedProviderAttempt = await selectProviderAttempt({
        attempts: providerAttempts,
        taskTimeoutMs: params.timeoutMs,
        requestTimeoutMs: providerSelectionTimeoutConfig.absoluteTimeoutMs,
      });
      activeAttempt = selectedProviderAttempt.attempt;
      for (const provider of selectedProviderAttempt.excludedProviders) {
        if (provider !== activeAttempt.config.provider) {
          stageExcludedProviders.add(provider);
        }
      }
      assistantNotes.push(...selectedProviderAttempt.notes);
      lock = activeAttempt.lock;
      providerConfig = activeAttempt.config;
      workflowFiles = buildWorkflowFiles({
        requirementText: sanitizedRequirementWithReferences,
        decision,
        designMd: workflow.designMd,
        locale: decision.locale,
        provider: providerConfig.provider,
        model: providerConfig.modelName,
        stylePreset,
        designHit: workflow.hit,
        websiteSurfaceMode: selectedWebsiteSurfaceMode,
        discoveryBrief: selectedDiscoveryBrief,
        designSystemId: selectedDesignSystemId,
        designSystemName: selectedDesignSystemName,
        siteGeneratorMode,
        selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
        selectedSeedContracts,
      });
      stageMeta = {
        activeProvider: providerConfig.provider,
        activeModel: providerConfig.modelName,
        attemptedProviders: providerAttempts.map((attempt) => attempt.config.provider),
        fallbackEngaged: providerAttempts.findIndex((attempt) => attempt.config.provider === providerConfig.provider) > 0,
        providerNotes: selectedProviderAttempt.notes,
      };

      await emitSnapshot({
        stepKey: "preflight",
        stepIndex: 0,
        totalSteps: totalToolRounds,
        status: "generating:preflight-ok",
        locale: decision.locale,
        files: dedupeFiles(emittedFiles),
        workflowArtifacts: workflowFiles,
        pages: decision.routes.map((route) => ({
          path: normalizePath(route),
          html: String(
            dedupeFiles(emittedFiles).find((file) => normalizePath(file.path) === routeToHtmlPath(route))?.content || "",
          ),
        })),
        provider: stageMeta.activeProvider,
        model: stageMeta.activeModel,
        websiteSurfaceMode: selectedWebsiteSurfaceMode,
        routeUnits: buildRouteUnitSnapshotsForToolFlow({
          decision,
          requirementText: fullRequirementContext,
          stylePreset,
          designHit: workflow.hit,
          websiteSurfaceMode: selectedWebsiteSurfaceMode,
          discoveryBrief: selectedDiscoveryBrief,
          designSystemId: selectedDesignSystemId,
          designSystemName: selectedDesignSystemName,
          selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
          selectedSeedContracts,
          files: dedupeFiles(emittedFiles),
          qaRecords: completedQaRecords,
        }),
        onStep: params.onStep,
      });

      let toolErrorCount = 0;
      let idleRounds = 0;
      let noProgressRounds = 0;
      let lastRoundCallNames = "";
      let lastRoundToolErrors = "";
      let qaRepairTargets: string[] = [];
      const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(fullRequirementContext);
      completedStaticFiles = undefined;
      completedQaSummary = undefined;
      completedQaRecords = [];

      for (let round = 0; round < totalToolRounds; round += 1) {
        const expectedRequiredFileCount = resolveExpectedRequiredFileCount({
          decision,
          adapter,
          files: emittedFiles,
          requirementText: fullRequirementContext,
        });
        const stageBudgetMs = resolveStageBudgetMs(params.timeoutMs, expectedRequiredFileCount);
        if (Date.now() - stageStartedAt > stageBudgetMs) {
          throw new Error(
            [
              `skill-tool stage budget exceeded (${stageBudgetMs}ms): provider=${providerConfig.provider}, model=${providerConfig.modelName}`,
              `expectedRequiredFiles=${expectedRequiredFileCount}`,
              `plannedRounds=${totalToolRounds}; emittedFiles=${dedupeFiles(emittedFiles).length}; requiredMissing=${
                adapter
                  .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: fullRequirementContext })
                  .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path)))
                  .join(", ") || "(none)"
              }`,
            ].join("\n"),
          );
        }
        const missing = adapter
          .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: fullRequirementContext })
          .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path)));
        const scopedMissing = filterMissingForForcedTargets(missing, forcedRouteUnitTargets);
        const activeRepairTargets = scopedMissing.length === 0 ? qaRepairTargets : [];
        const objectiveTargets = activeRepairTargets.length > 0 ? activeRepairTargets : scopedMissing;
        const objective = adapter.planRoundObjective(round, objectiveTargets);
        const timeoutConfig = resolveRoundTimeouts({
          taskTimeoutMs: params.timeoutMs,
          targetFileCount: Math.max(1, objective.targetFiles.length || objectiveTargets.length || 1),
        });
        const roundPromptParams = {
          round,
          totalRounds: totalToolRounds,
          decision,
          stylePreset,
          styleName: workflow.hit?.name || workflow.hit?.id || "selected-style",
          styleReason:
            workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
            workflow.hit?.design_desc ||
            "Follow requirement semantics and conversion goals.",
          loadedSkillIds: Array.from(loadedSkills.keys()),
          emittedFiles,
          requiredMissing: objectiveTargets,
          objective,
          requirementText: promptRequirementContext,
          analysisRequirementText: fullRequirementContext,
          websiteSurfaceMode: selectedWebsiteSurfaceMode,
        };
        const forceEmitFile = noProgressRounds > 0;
        let roundOutput: ToolRoundOutput;
        try {
          const bridgeResult = await tryInvokeRouteUnitProviderBridgeRound({
            adapter,
            decision,
            stylePreset,
            styleName: workflow.hit?.name || workflow.hit?.id || "selected-style",
            styleReason:
              workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
              workflow.hit?.design_desc ||
              "Follow requirement semantics and conversion goals.",
            loadedSkillIds: Array.from(loadedSkills.keys()),
            emittedFiles,
            objective,
            requirementText: promptRequirementContext,
            totalRounds: totalToolRounds,
            providerAttempts,
            activeAttempt,
            excludedProviders: stageExcludedProviders,
            toolHistoryMessages,
            idleTimeoutMs: timeoutConfig.idleTimeoutMs,
            absoluteTimeoutMs: timeoutConfig.absoluteTimeoutMs,
            roundNumber: round + 1,
            forceEmitFile,
          });
          if (bridgeResult) {
            toolHistoryMessages.push(new HumanMessage(bridgeResult.prompt));
            roundOutput = bridgeResult.output;
            if (bridgeResult.notes.length > 0) {
              assistantNotes.push(...bridgeResult.notes);
            }
            activeAttempt = bridgeResult.attempt;
            providerConfig = bridgeResult.attempt.config;
            lock = bridgeResult.attempt.lock;
            stageMeta = {
              ...stageMeta,
              activeProvider: providerConfig.provider,
              activeModel: providerConfig.modelName,
              fallbackEngaged:
                stageMeta.fallbackEngaged ||
                providerAttempts.findIndex((attempt) => attempt.config.provider === providerConfig.provider) > 0 ||
                bridgeResult.notes.length > 0,
              providerNotes: [...stageMeta.providerNotes, ...bridgeResult.notes],
            };
          } else {
            const prompt = adapter.buildToolRoundPrompt(roundPromptParams);
            toolHistoryMessages.push(new HumanMessage(prompt));
            const roundResult = await invokeRoundWithProviderFallback({
              attempts: providerAttempts,
              preferredAttempt: activeAttempt,
              excludedProviders: stageExcludedProviders,
              objective,
              messages: toolHistoryMessages,
              idleTimeoutMs: timeoutConfig.idleTimeoutMs,
              absoluteTimeoutMs: timeoutConfig.absoluteTimeoutMs,
              operation: `skill-tool-round-${round + 1}`,
              forceEmitFile,
              createModel: ({ config, toolChoice, requestTimeoutMs }) =>
                createToolProtocolModel({
                  config,
                  requestTimeoutMs,
                  toolChoice,
                }) as ToolProtocolModel,
              invokeRound: invokeRoundWithTimeout,
            });
            roundOutput = roundResult.output;
            if (roundResult.notes.length > 0) {
              assistantNotes.push(...roundResult.notes);
            }
            activeAttempt = roundResult.attempt;
            providerConfig = roundResult.attempt.config;
            lock = roundResult.attempt.lock;
            stageMeta = {
              ...stageMeta,
              activeProvider: providerConfig.provider,
              activeModel: providerConfig.modelName,
              fallbackEngaged:
                stageMeta.fallbackEngaged ||
                providerAttempts.findIndex((attempt) => attempt.config.provider === providerConfig.provider) > 0 ||
                roundResult.notes.length > 0,
              providerNotes: [...stageMeta.providerNotes, ...roundResult.notes],
            };
          }
        } catch (error) {
          if (shouldUseRouteUnitProviderBridgeForTesting(objective)) {
            assistantNotes.push(`route_unit_provider_bridge_legacy_fallback:${errorText(error).slice(0, 320)}`);
            const prompt = adapter.buildToolRoundPrompt(roundPromptParams);
            toolHistoryMessages.push(new HumanMessage(prompt));
            const roundResult = await invokeRoundWithProviderFallback({
              attempts: providerAttempts,
              preferredAttempt: activeAttempt,
              excludedProviders: stageExcludedProviders,
              objective,
              messages: toolHistoryMessages,
              idleTimeoutMs: timeoutConfig.idleTimeoutMs,
              absoluteTimeoutMs: timeoutConfig.absoluteTimeoutMs,
              operation: `skill-tool-round-${round + 1}`,
              forceEmitFile,
              createModel: ({ config, toolChoice, requestTimeoutMs }) =>
                createToolProtocolModel({
                  config,
                  requestTimeoutMs,
                  toolChoice,
                }) as ToolProtocolModel,
              invokeRound: invokeRoundWithTimeout,
            });
            roundOutput = roundResult.output;
            if (roundResult.notes.length > 0) {
              assistantNotes.push(...roundResult.notes);
            }
            activeAttempt = roundResult.attempt;
            providerConfig = roundResult.attempt.config;
            lock = roundResult.attempt.lock;
            stageMeta = {
              ...stageMeta,
              activeProvider: providerConfig.provider,
              activeModel: providerConfig.modelName,
              fallbackEngaged:
                stageMeta.fallbackEngaged ||
                providerAttempts.findIndex((attempt) => attempt.config.provider === providerConfig.provider) > 0 ||
                roundResult.notes.length > 0,
              providerNotes: [...stageMeta.providerNotes, ...roundResult.notes],
            };
          } else {
            if (!isRetryableProviderError(error)) {
              throw error;
            }
            const stillMissingAfterRetry = filterMissingForForcedTargets(
              adapter
              .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: fullRequirementContext })
              .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path))),
              forcedRouteUnitTargets,
            );
            throw new Error(
              `skill_tool_provider_retry_exhausted: ${errorText(error)}; missing=${stillMissingAfterRetry.join(", ") || "(none)"}`,
            );
          }
        }
        if (roundOutput.assistant) {
          assistantNotes.push(String(roundOutput.assistant).trim());
        }
        if (roundOutput.rawMessage) {
          toolHistoryMessages.push(roundOutput.rawMessage);
        } else {
          toolHistoryMessages.push(
            new AIMessage({
              content: roundOutput.assistant || "",
              additional_kwargs: {
                tool_calls: roundOutput.tool_calls.map((call) => ({
                  id: call.id || `call_${crypto.randomUUID().slice(0, 8)}`,
                  type: "function",
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args || {}),
                  },
                })),
              },
            }),
          );
        }

        let requestedFinish = false;
        let emittedThisRound = 0;
        const emittedPathsThisRound: string[] = [];
        const previousDedupedFiles = dedupeFiles(emittedFiles);
        const roundCalls: SkillToolCall[] = (roundOutput.tool_calls || []).map((call) => ({
          id: call.id,
          name: call.name,
          args: (call.args || {}) as Record<string, unknown>,
        }));
        lastRoundCallNames = roundCalls.map((call) => call.name).join(",") || "(none)";

        for (const call of roundCalls) {
          try {
            const result = await handleSkillToolCall(call, { loadedSkills });
            toolHistoryMessages.push(
              new ToolMessage({
                tool_call_id: String(call.id || `${call.name}_${crypto.randomUUID().slice(0, 8)}`),
                content: result.toolResult.slice(0, call.name === "load_skill" ? 16_000 : 1200),
              }),
            );
            if (result.kind === "file") {
              const normalizedPath = normalizePath(String(result.file.path || ""));
              if (!manifestAllowsOutputFile(decision, normalizedPath, fullRequirementContext)) {
                throw new Error(
                  `skill_tool_manifest_gate_failed: ${normalizedPath} is outside the Prompt Control Manifest route set`,
                );
              }
              let normalizedFile = result.file;
              if (normalizedPath === "/styles.css") {
                normalizedFile = { ...result.file, content: normalizeGeneratedCss(String(result.file.content || "")) };
              } else if (normalizedPath === "/script.js") {
                normalizedFile = {
                  ...result.file,
                  content: normalizeGeneratedJs(String(result.file.content || ""), fullRequirementContext),
                };
              } else if (normalizedPath.endsWith(".html")) {
                let nextHtml = String(result.file.content || "");
                nextHtml = adapter.sanitizeEmittedHtml
                  ? adapter.sanitizeEmittedHtml(normalizedPath, nextHtml, fullRequirementContext)
                  : nextHtml;
                if (isBilingualRequirementText(fullRequirementContext)) {
                  nextHtml = collapseVisibleBilingualPairs(nextHtml, defaultVisibleLanguage);
                }
                normalizedFile = {
                  ...result.file,
                  content: nextHtml,
                };
              }
              emittedFiles.push(normalizedFile);
              emittedThisRound += 1;
              emittedPathsThisRound.push(normalizePath(normalizedFile.path));
            }
            if (result.kind === "finish") requestedFinish = true;
            toolErrorCount = 0;
          } catch (error: any) {
            toolErrorCount += 1;
            const toolErrorText = String(error?.message || error || "unknown tool error");
            lastRoundToolErrors = `${call.name}:${toolErrorText}`;
            assistantNotes.push(`tool_error:${call.name}:${toolErrorText}`);
            toolHistoryMessages.push(
              new ToolMessage({
                tool_call_id: String(call.id || `${call.name}_${crypto.randomUUID().slice(0, 8)}`),
                content: `[tool_error:${call.name}] ${toolErrorText}`,
              }),
            );
            if (toolErrorCount >= MAX_TOOL_ERRORS) {
              throw new Error(`skill-tool execution aborted after repeated tool errors: ${toolErrorText}`);
            }
          }
        }

        const dedupedCurrent = dedupeFiles(emittedFiles);
        const stillMissing = filterMissingForForcedTargets(
          adapter
          .buildRequiredFileChecklist(decision, { files: dedupedCurrent, requirementText: fullRequirementContext })
          .filter((path) => !new Set(dedupedCurrent.map((file) => normalizePath(file.path))).has(normalizePath(path))),
          forcedRouteUnitTargets,
        );
        const emittedTargetThisRound =
          !objective.strictSingleTarget ||
          objective.targetFiles.some((target) => emittedPathsThisRound.includes(normalizePath(target)));
        const materialFileProgress = didRoundMateriallyChangeFiles(
          previousDedupedFiles,
          dedupedCurrent,
          emittedPathsThisRound,
        );
        const progressed = (materialFileProgress || stillMissing.length < missing.length) && emittedTargetThisRound;
        if (objective.strictSingleTarget && emittedThisRound > 0 && !emittedTargetThisRound) {
          assistantNotes.push(
            `tool_round_off_target: expected=${objective.targetFiles.join(",")} emitted=${emittedPathsThisRound.join(",") || "(none)"}`,
          );
        }

        if (roundCalls.length === 0) {
          idleRounds += 1;
        } else {
          idleRounds = 0;
        }
        if (progressed) {
          noProgressRounds = 0;
        } else {
          noProgressRounds += 1;
        }

        await emitSnapshot({
          stepKey: roundCalls.find((call) => call.name === "emit_file")?.args?.path
            ? normalizePath(String(roundCalls.find((call) => call.name === "emit_file")?.args?.path || ""))
            : `round-${round + 1}`,
          stepIndex: round + 1,
          totalSteps: totalToolRounds,
          status:
            roundCalls.length > 0
              ? `generating:tool-round-${round + 1}:${objective.targetFiles.join("|") || "auto"}`
              : `generating:tool-idle-${idleRounds}/${MAX_IDLE_ROUNDS}`,
          locale: decision.locale,
          files: dedupedCurrent,
          workflowArtifacts: workflowFiles,
          pages: decision.routes.map((route) => ({
            path: normalizePath(route),
            html: String(dedupedCurrent.find((file) => file.path === routeToHtmlPath(route))?.content || ""),
          })),
          provider: stageMeta.activeProvider,
          model: stageMeta.activeModel,
          websiteSurfaceMode: selectedWebsiteSurfaceMode,
          routeUnits: buildRouteUnitSnapshotsForToolFlow({
            decision,
            requirementText: fullRequirementContext,
            stylePreset,
            designHit: workflow.hit,
          websiteSurfaceMode: selectedWebsiteSurfaceMode,
          discoveryBrief: selectedDiscoveryBrief,
          designSystemId: selectedDesignSystemId,
          designSystemName: selectedDesignSystemName,
          selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
          selectedSeedContracts,
          files: dedupedCurrent,
          qaRecords: completedQaRecords,
        }),
          onStep: params.onStep,
        });

        if (requestedFinish && stillMissing.length > 0) {
          toolHistoryMessages.push(
            new HumanMessage(
              [
                "Finish was requested too early. Do not call finish yet.",
                `Missing required files: ${stillMissing.join(", ")}`,
                "Next round emit the missing files as complete outputs, then call finish only after all required files exist.",
              ].join("\n"),
            ),
          );
          idleRounds = 0;
          noProgressRounds = 0;
          continue;
        }
        if (idleRounds >= MAX_IDLE_ROUNDS && stillMissing.length > 0) {
          throw new Error(
            `skill-tool idle rounds exceeded (${idleRounds}/${MAX_IDLE_ROUNDS}) with missing files: ${stillMissing.join(
              ", ",
            )}; last_round_calls=${lastRoundCallNames}; last_tool_error=${lastRoundToolErrors || "(none)"}`,
          );
        }
        if (noProgressRounds >= MAX_NO_PROGRESS_ROUNDS && stillMissing.length > 0) {
          throw new Error(
            `skill-tool no-progress rounds exceeded (${noProgressRounds}/${MAX_NO_PROGRESS_ROUNDS}) with missing files: ${stillMissing.join(
              ", ",
            )}; last_round_calls=${lastRoundCallNames}; last_tool_error=${lastRoundToolErrors || "(none)"}`,
          );
        }
        if (stillMissing.length === 0) {
          if (forcedRouteUnitTargets.length > 0) {
            completedStaticFiles = dedupedCurrent;
            completedQaSummary = buildRouteUnitQaSummary();
            completedQaRecords = [];
            break;
          }
          try {
            const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
              decision,
              files: emittedFiles,
              requirementText: fullRequirementContext,
              websiteSurfaceMode: selectedWebsiteSurfaceMode,
            });
            completedStaticFiles = validated.files;
            completedQaSummary = validated.qaSummary;
            completedQaRecords = validated.qaRecords;
            break;
          } catch (error) {
            const feedback = errorText(error);
            if (round + 1 >= totalToolRounds) {
              throw error;
            }
            assistantNotes.push(`tool_validation_repair:${feedback.slice(0, 500)}`);
            const qaRepairMessage = buildQaRepairMessage(feedback, fullRequirementContext);
            qaRepairTargets = qaRepairMessage.targets;
            qaRepairAttemptCount += 1;
            for (const target of qaRepairTargets) {
              qaRepairFileTargets.add(normalizePath(target));
            }
            toolHistoryMessages.push(
              new HumanMessage(qaRepairMessage.message),
            );
            idleRounds = 0;
            noProgressRounds = 0;
            continue;
          }
        }
      }

      if (!completedStaticFiles || !completedQaSummary) {
        if (forcedRouteUnitTargets.length > 0) {
          completedStaticFiles = dedupeFiles(emittedFiles);
          completedQaSummary = buildRouteUnitQaSummary();
          completedQaRecords = [];
          break;
        }
        const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
          decision,
          files: emittedFiles,
          requirementText: fullRequirementContext,
          websiteSurfaceMode: selectedWebsiteSurfaceMode,
        });
        completedStaticFiles = validated.files;
        completedQaSummary = validated.qaSummary;
        completedQaRecords = validated.qaRecords;
      }
      lastStageFiles = dedupeFiles(emittedFiles);
      break;
    } catch (error) {
      if (
        stageRetry < SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT &&
        shouldRetrySkillToolStageWithFreshAttempt(error, stageMeta)
      ) {
        console.warn(
          `[skill-tool] fresh-stage retry after budget exceeded on ${stageMeta.activeProvider}/${stageMeta.activeModel}; retry ${stageRetry + 1}/${SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT}`,
        );
        assistantNotes.push(`stage_retry_after_budget:${stageMeta.activeProvider}`);
        continue;
      }
      throw formatSkillToolStageError(error, stageMeta, assistantNotes);
    }
  }

  if (!completedStaticFiles || !completedQaSummary) {
    if (forcedRouteUnitTargets.length > 0) {
      completedStaticFiles = dedupeFiles(lastStageFiles);
      completedQaSummary = buildRouteUnitQaSummary();
      completedQaRecords = [];
    } else {
    const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
      decision,
      files: lastStageFiles,
      requirementText: fullRequirementContext,
      websiteSurfaceMode: selectedWebsiteSurfaceMode,
    });
    completedStaticFiles = validated.files;
    completedQaSummary = validated.qaSummary;
    completedQaRecords = validated.qaRecords;
    }
  }
  if (qaRepairAttemptCount > 0) {
    completedQaSummary = {
      ...completedQaSummary,
      totalRetries: Math.max(Number(completedQaSummary.totalRetries || 0), qaRepairAttemptCount),
    };
  }
  completedStaticFiles = completedStaticFiles.map((file) =>
    file.path === "/styles.css"
      ? { ...file, content: syncSharedCssVariablesToStylePreset(String(file.content || ""), stylePreset) }
      : file,
  );
  const routeRepairEvidence: SkillToolRouteRepairEvidence = {
    status: qaRepairAttemptCount > 0 ? "route_repairs_applied" : "no_route_repair_needed",
    repairAttemptCount: qaRepairAttemptCount,
    repairedFiles: Array.from(qaRepairFileTargets).sort((a, b) => a.localeCompare(b)),
    fullRegenerationAvoided: qaRepairAttemptCount > 0 ? true : null,
  };
  const { staticFiles } = splitStaticAndWorkflow(completedStaticFiles);
  const finalRouteUnits = buildRouteUnitSnapshotsForToolFlow({
    decision,
    requirementText: fullRequirementContext,
    stylePreset,
    designHit: workflow.hit,
    websiteSurfaceMode: selectedWebsiteSurfaceMode,
    discoveryBrief: selectedDiscoveryBrief,
    designSystemId: selectedDesignSystemId,
    designSystemName: selectedDesignSystemName,
    selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
    selectedSeedContracts,
    files: staticFiles,
    qaRecords: completedQaRecords,
  });
  completedQaSummary = {
    ...completedQaSummary,
    shadowVisualEvaluation: buildShadowVisualEvaluation({
      routeUnits: finalRouteUnits,
      stylesCss: staticFiles.find((file) => normalizePath(file.path) === "/styles.css")?.content || "",
      selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
    }),
  };
  const qaReportFile: RuntimeWorkflowFile = {
    path: "/qa-report.json",
    type: "application/json",
    content: JSON.stringify(
      {
        generatedAt: nowIso(),
        minPassingScore: 84,
        retriesAllowed: 0,
        averageScore: completedQaSummary.averageScore,
        summary: completedQaSummary,
        records: completedQaRecords,
        routeRepairEvidence,
      },
      null,
      2,
    ),
  };
  const mergedWorkflowFiles = dedupeFiles([
    ...workflowFiles,
    ...completedStaticFiles.filter((file) => file.path.endsWith(".md")),
    qaReportFile,
  ]);
  const pages = buildPagesFromRoutes(decision.routes, staticFiles, decision.locale, brandName);
  const routeToFile: Record<string, string> = {};
  for (const route of decision.routes) {
    routeToFile[normalizePath(route)] = routeToHtmlPath(route);
  }

  const siteArtifacts = {
    projectId: toProjectIdSlug(brandName),
    branding: {
      name: brandName,
      colors: {
        primary: stylePreset.colors.primary,
        accent: stylePreset.colors.accent,
      },
      style: {
        borderRadius: stylePreset.borderRadius,
        typography: stylePreset.typography,
      },
    },
    skillHit: workflow.hit,
    pages,
    staticSite: {
      mode: "skill-direct",
      generatedAt: nowIso(),
      routeToFile,
      files: staticFiles,
      generation: { isComplete: true, nextStep: null },
    },
    workflowArtifacts: {
      generatedAt: nowIso(),
      files: mergedWorkflowFiles,
    },
  };
  const finalState: AgentState = {
    ...params.state,
    phase: "end",
    sitemap: decision.routes,
    design_hit: workflow.hit,
    site_artifacts: siteArtifacts,
    messages: [
      ...(params.state.messages || []),
      new AIMessage({
        id: crypto.randomUUID(),
        content: assistantNotes.filter(Boolean).slice(-1)[0] || "Skill-tool site generated successfully.",
        additional_kwargs: {
          actions: [{ text: "Deploy to shpitto server", payload: "deploy", type: "button" }],
        },
      }),
    ],
    workflow_context: {
      ...(params.state.workflow_context || {}),
      runMode: (params.state.workflow_context as any)?.runMode || "async-task",
      genMode: "skill_native",
      generationMode: "skill-native",
      siteGeneratorMode,
      preferredLocale: decision.locale,
      sourceRequirement: sanitizedRequirementWithReferences,
      skillId: String((params.state.workflow_context as any)?.skillId || "website-generation-workflow"),
      lockedProvider: lock.provider,
      lockedModel: stageMeta.activeModel,
      stylePreset,
      designSystemId: workflow.hit?.id,
      designSystemName: workflow.hit?.name,
      designSelectionReason:
        workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
        workflow.hit?.design_desc,
      selectedSeedSkillIds: effectiveSelectedSeedSkills.map((item) => item.id),
      selectedSeedSkillReasons: effectiveSelectedSeedSkills,
      websiteSurfaceMode: selectedWebsiteSurfaceMode,
      websiteDiscoveryBrief: selectedDiscoveryBrief,
      routeUnits: finalRouteUnits,
      routeRepairEvidence,
      selectionCriteria: workflow.selectionCriteria,
      sequentialWorkflow: workflow.sequentialWorkflow,
      workflowGuide: workflow.workflowGuide,
      rulesSummary: workflow.rulesSummary,
      designMd: workflow.designMd,
      websiteDesignSpec:
        workflowFiles.find((file) => normalizePath(file.path) === "/website_design_spec.md")?.content || "",
    } as any,
  };

  const assistantText =
    assistantNotes.filter(Boolean).slice(-1)[0] ||
    `Skill-native generation completed with ${decision.routes.length} routes and ${staticFiles.length} static files.`;
  const actions = [{ text: "Deploy to shpitto server", payload: "deploy", type: "button" as const }];
  const finalFiles = getStaticArtifactFiles(finalState);
  const finalPages = getPages(finalState);
  const providerNotes = stageMeta.providerNotes.filter(Boolean);
  const routeUnitProviderBridgeNotes = Array.from(
    new Set(
      [...assistantNotes, ...providerNotes]
        .filter(Boolean)
        .filter((note) => note.includes("route_unit_provider_bridge")),
    ),
  );

  await emitSnapshot({
    stepKey: "/qa-report.json",
    stepIndex: totalToolRounds,
    totalSteps: totalToolRounds,
    status: "generating:qa_report",
    locale: decision.locale,
    files: finalFiles as RuntimeWorkflowFile[],
    workflowArtifacts: mergedWorkflowFiles,
    pages: finalPages as Array<{ path: string; html: string }>,
    qaSummary: completedQaSummary,
    provider: stageMeta.activeProvider,
    model: stageMeta.activeModel,
    websiteSurfaceMode: selectedWebsiteSurfaceMode,
    routeUnits: finalRouteUnits,
    onStep: params.onStep,
  });

  return {
    state: finalState,
    assistantText,
    actions,
    pageCount: finalPages.length,
    fileCount: finalFiles.length,
    generatedFiles: getGeneratedFilePaths(finalState),
    phase: String(finalState.phase || "end"),
    completedPhases: collectCompletedPhases(finalState),
    deployedUrl: finalState.deployed_url,
    qaSummary: completedQaSummary,
    provider: stageMeta.activeProvider,
    model: stageMeta.activeModel,
    siteGeneratorMode,
    routeUnits: finalRouteUnits,
    routeRepairEvidence,
    providerNotes,
    routeUnitProviderBridgeNotes,
  };
}
function describeUnrequestedBlogDetailPolicy(limit = DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT): string {
  return limit === 0
    ? "do not expose any /blog/{slug}/ detail links or static detail pages in the initial pass unless the brief explicitly asks for them"
    : `limit the initial Blog fallback to ${limit} substantial detail entries unless the brief asks for more`;
}
