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
import {
  buildLocalDecisionPlan,
  extractRouteSourceBrief,
  type LocalDecisionPlan,
  type PageBlueprint,
} from "./decision-layer.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles } from "./artifacts.ts";
import { resolveRunProviderRunnerLock, resolveRunProviderRunnerLocks, type RunProviderLock } from "./provider-runner.ts";
import {
  getWebsiteGenerationSkillBundle,
  listDocumentContentSkillIds,
  listWebsiteSeedSkillIds,
  selectDocumentContentSkillsForIntent,
  selectWebsiteSeedSkillsForIntent,
} from "./project-skill-loader.ts";
import {
  SKILL_TOOL_DEFINITIONS,
  buildSkillToolSystemInstructions,
  handleSkillToolCall,
  type SkillToolCall,
  type SkillToolFile,
} from "./skill-tool-registry.ts";
import { renderWebsiteQualityContract } from "./website-quality-contract.ts";
import type { QaSummary } from "./qa-summary.ts";
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
  isBilingualRequirementText as sharedIsBilingualRequirementText,
} from "./bilingual-copy-guard.ts";
import { sanitizeBlogIndexEditorialScaffoldText } from "../../skills/website-generation-workflow/runtime-site-completions.ts";
import { getSkillExecutionAdapter } from "./skill-execution-adapter-registry.ts";
import type { SkillExecutionAdapter, SkillExecutionRoundObjective, SkillExecutionValidationResult } from "./skill-execution-adapter.ts";

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
const DETAIL_TARGETS_PER_ROUND = Math.max(1, Number(process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND || 1));
const DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT = Math.max(
  1,
  Number(process.env.SKILL_TOOL_DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT || 3),
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

function routeToHtmlPath(route: string): string {
  const normalized = normalizePath(route).replace(/\/+$/g, "") || "/";
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
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

export function htmlPathToRoute(filePath: string): string {
  const normalized = normalizePath(filePath);
  if (normalized === "/index.html") return "/";
  if (!normalized.endsWith("/index.html")) return "";
  return normalizePath(normalized.slice(0, -("/index.html".length)) || "/");
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

function isBilingualRequirementText(text = ""): boolean {
  return sharedIsBilingualRequirementText(text);
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

function hasSubstantialCjkAndLatin(text: string): boolean {
  const source = String(text || "");
  const words = latinContentWords(source);
  return cjkCount(source) >= 4 && (words.length >= 5 || latinLetterCount(source) >= 36);
}

function bilingualDefaultVisibleLanguage(text = ""): "zh-CN" | "en" {
  return cjkCount(String(text || "")) >= 4 ? "zh-CN" : "en";
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
    ["site entry label", /(?:阅读入口|站点入口|首页路径|内容路径|浏览路径|访问路径)/],
    ["homepage-to-content sequence", /从(?:首页|主页)开始.{0,40}(?:循序|进入|接下来|博客|深内容)/i],
    ["next-blog sequence", /接下来看(?:博客|文章|内容).{0,40}(?:具体|更具体|深入|完整)/i],
    ["deep-content pathway", /(?:循序进入深内容|进入深内容)/i],
    ["page role explainer", /(?:首页|主页|博客页|页面|本页|这个页面).{0,18}(?:任务|职责|作用|目的|定位)(?:是|为|在于)/i],
    [
      "mechanical next step",
      /(?:(?:首页|主页|博客|页面|站点|入口|路径|角色|目标).{0,60}(?:下一步|继续了解|接下来)|(?:下一步|继续了解|接下来).{0,60}(?:首页|主页|博客|页面|站点|入口|路径|角色|目标))/i,
    ],
    ["role-target routing", /按角色和目标快速进入下一步/i],
    ["from-to browsing path", /从.{0,24}到.{0,24}(?:形成|构成|串成).{0,16}(?:路径|动线|浏览|阅读)/i],
    ["homepage job explainer", /(?:homepage|home page|home route).{0,40}(?:job|task|purpose|role).{0,20}(?:is|:)/i],
    ["start-from-home sequence", /(?:start from|begin with).{0,24}(?:home|homepage|the home page).{0,60}(?:then|next|continue|blog|archive|deeper)/i],
    ["site browsing path", /(?:site|page|homepage|blog).{0,40}(?:browsing path|reading path|content path|where to start)/i],
  ];
  return terms.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
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
  const normalizedPath = normalizePath(filePath);
  let next = String(html || "");
  if (!next) return next;
  if (normalizedPath === "/blog/index.html" && requestedPublishableContentCount(requirementText)) {
    next = sanitizeBlogIndexEditorialScaffoldText(next);
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

function normalizeCountToken(token: string): number | undefined {
  const raw = String(token || "").trim();
  if (!raw) return undefined;
  const ascii = raw.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
  if (/^\d+$/.test(ascii)) {
    const value = Number(ascii);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const zhMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return zhMap[raw];
}

function requestedPublishableContentCount(requirementText = ""): number | undefined {
  const text = String(requirementText || "");
  const asciiPatterns = [
    /\b(?:create|write|generate|publish|seed|add|produce)\s+([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
    /\b([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
  ];
  for (const pattern of asciiPatterns) {
    const match = text.match(pattern);
    const value = normalizeCountToken(match?.[1] || "");
    if (value) return Math.min(value, 12);
  }
  const contentNoun =
    "(?:文章|博客|blog|博客文章|帖子|博文|报告|研究报告|指南|案例|posts?|articles?|blog\\s+posts?|reports?|guides?|case\\s+studies?)";
  const countToken = "([0-9０-９]+|一|二|两|三|四|五|六|七|八|九|十)";
  const patterns = [
    new RegExp(`(?:生成|写|撰写|创建|产出|入库|发布|新增|整理|补充)\\s*${countToken}\\s*(?:篇|个|条|份)?\\s*${contentNoun}`, "i"),
    new RegExp(`${countToken}\\s*(?:篇|个|条|份)?\\s*${contentNoun}`, "i"),
    new RegExp(`(?:create|write|generate|publish|seed|add)\\s*${countToken}\\s*${contentNoun}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = normalizeCountToken(match?.[1] || "");
    if (value) return Math.min(value, 12);
  }
  return undefined;
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

function getBlogDataSourceRoutes(decision: LocalDecisionPlan): string[] {
  return decision.pageBlueprints
    .filter((page) => page.pageKind === "blog-data-index")
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
  return Array.from(targets);
}

function hasValidHtmlCore(rawHtml: string): boolean {
  const html = String(rawHtml || "");
  if (!html.trim()) return false;
  if (!/<\/head>/i.test(html)) return false;
  if (!/<body[\s>]/i.test(html)) return false;
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

function normalizeGeneratedCss(rawCss: string): string {
  const css = stripMarkdownCodeFences(rawCss).trim();
  if (!css) return "";
  const patches: string[] = [];
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
  return patches.length > 0 ? [css, ...patches].join("\n\n") : css;
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

  return html;
}

function normalizeGeneratedJs(rawJs: string, requirementText = ""): string {
  const js = stripMarkdownCodeFences(rawJs).trim();
  if (!js) return "";
  if (!isBilingualRequirementText(requirementText)) return js;
  if (/__shpitto_apply_i18n|data-i18n-zh|data-i18n-en/i.test(js)) return js;
  return [
    js,
    "",
    "(() => {",
    "  const root = document.documentElement;",
    "  const STORAGE_KEY = 'shpitto:locale';",
    "  const resolveLang = () => {",
    "    const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return ''; } })();",
    "    if (stored === 'en' || stored === 'zh-CN') return stored;",
    "    if (root.dataset.lang === 'en' || root.dataset.lang === 'zh-CN') return root.dataset.lang;",
    "    return root.lang === 'en' ? 'en' : 'zh-CN';",
    "  };",
    "  const setLang = (lang) => {",
    "    const next = lang === 'en' ? 'en' : 'zh-CN';",
    "    root.dataset.lang = next;",
    "    root.lang = next;",
    "    document.querySelectorAll('[data-locale-toggle]').forEach((node) => {",
    "      const target = node.getAttribute('data-locale') || (node.textContent || '').trim();",
    "      const normalizedTarget = /^en/i.test(target) ? 'en' : 'zh-CN';",
    "      node.setAttribute('aria-pressed', normalizedTarget === next ? 'true' : 'false');",
    "    });",
    "    try { localStorage.setItem(STORAGE_KEY, next); } catch {}",
    "  };",
    "  const applyI18n = () => {",
    "    const lang = resolveLang() === 'en' ? 'en' : 'zh';",
    "    document.querySelectorAll('[data-i18n]').forEach((node) => {",
    "      const value = lang === 'en' ? node.getAttribute('data-i18n-en') : node.getAttribute('data-i18n-zh');",
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
    "    node.addEventListener('click', () => {",
    "      const target = node.getAttribute('data-locale') || (node.textContent || '').trim();",
    "      setLang(/^en/i.test(target) ? 'en' : 'zh-CN');",
    "      applyI18n();",
    "    });",
    "  });",
    "  setLang(resolveLang());",
    "  applyI18n();",
    "  new MutationObserver(() => applyI18n()).observe(root, { attributes: true, attributeFilter: ['data-lang'] });",
    "})();",
  ].join("\n");
}

function hasBilingualI18nMapping(html: string): boolean {
  return /\sdata-i18n(?:\s|=|>)/i.test(html) || /data-i18n-zh\s*=\s*["'][^"']+["'][^>]*data-i18n-en\s*=\s*["'][^"']+["']/i.test(html);
}

function hasBilingualLocaleToggle(html: string): boolean {
  return /\sdata-locale-toggle(?:\s|=|>)/i.test(html);
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

export function normalizeGeneratedCssForTesting(rawCss: string): string {
  return normalizeGeneratedCss(rawCss);
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

export function collapseVisibleBilingualPairsForTesting(rawHtml: string, defaultVisibleLanguage: "zh-CN" | "zh" | "en"): string {
  return collapseVisibleBilingualPairs(rawHtml, defaultVisibleLanguage);
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

export function formatTargetPageContract(plan: LocalDecisionPlan, targetFile: string, requirementText = ""): string {
  const route = htmlPathToRoute(targetFile);
  if (!route) return "";
  const page = findPageBlueprint(plan, route);
  const requestedContentCount = requestedPublishableContentCount(requirementText);
  const isGeneratedBlogDetailRoute = /^\/blog\/[^/]+$/i.test(route) && !plan.routes.map(normalizePath).includes(route);
  const bilingualPromptGuidance = loadBilingualPromptGuidance();
  const blogPromptGuidance = loadBlogPromptGuidance();
  const renderedTargetBlogDetailGuidance = renderPromptGuidance(
    bilingualPromptGuidance.targetBlogDetailGuidance,
    { DEFAULT_VISIBLE_LANGUAGE: bilingualDefaultVisibleLanguage(requirementText) },
  );
  const renderedTargetLanguageGate = renderPromptGuidance(
    bilingualPromptGuidance.targetLanguageGate,
    { DEFAULT_VISIBLE_LANGUAGE: bilingualDefaultVisibleLanguage(requirementText) },
  );
  const renderedTargetBlogIndexGate = renderPromptGuidance(blogPromptGuidance.targetBlogIndexGate, {});
  const renderedTargetBlogCountGate =
    requestedContentCount
      ? renderPromptGuidance(blogPromptGuidance.targetBlogCountGate, {
          REQUESTED_CONTENT_COUNT: String(requestedContentCount),
        })
      : [];
  const renderedTargetBlogDetailGate = renderPromptGuidance(blogPromptGuidance.targetBlogDetailGate, {});
  const sourceBrief = extractRouteSourceBrief(requirementText, page.route, page.navLabel, 4200);
  const siblingIntents = plan.pageBlueprints
    .filter((item) => normalizePath(item.route) !== normalizePath(route))
    .slice(0, 6)
    .map((item) => `${item.route}: ${item.purpose}`)
    .join("\n");
  const blogContentBackendGate =
    page.pageKind === "blog-data-index"
      ? [...renderedTargetBlogIndexGate, ...renderedTargetBlogCountGate].join("\n")
      : "";
    const generatedBlogDetailGate =
      isGeneratedBlogDetailRoute
        ? [
            ...renderedTargetBlogDetailGate,
            ...(isBilingualRequirementText(requirementText) ? renderedTargetBlogDetailGuidance : []),
        ].join("\n")
      : "";
  const bilingualLanguageGate = isBilingualRequirementText(requirementText)
    ? [
        ...renderedTargetLanguageGate,
      ].join("\n")
    : "";

  return [
    "Target page contract:",
    `- File: ${targetFile}`,
    `- Route: ${page.route}`,
    `- Nav label: ${page.navLabel}`,
    `- Page intent: ${page.purpose}`,
    `- Intent source: ${page.source}`,
    `- Page kind: ${page.pageKind}`,
    "- The confirmed Canonical Website Prompt is authoritative for page structure, content depth, audience, and design direction.",
    page.constraints.length ? `- Page constraints:\n${page.constraints.map((item) => `  - ${item}`).join("\n")}` : "",
    page.contentSkeleton.length ? `- Required page skeleton:\n${page.contentSkeleton.map((item) => `  - ${item}`).join("\n")}` : "",
    sourceBrief
      ? `Page-specific source brief excerpt (authoritative for this file):\n${sourceBrief}`
      : "- No route-specific source excerpt was found; derive a unique page architecture from the complete Canonical Website Prompt.",
    "- Derive route-specific sections, headings, card types, and interactions from the Canonical Website Prompt and source content.",
    "- Use a page-specific body architecture. Shared header/footer/design tokens are allowed; the main content section order, visual modules, and primary components must differ from sibling routes.",
    "- Do not apply a hardcoded industry skeleton or copy the previous page layout and only swap text.",
    "- Visitor-facing copy must be substantive content for the audience, not a description of site mechanics. Do not tell visitors what the page's task is, where to start browsing, which route comes next, or that one page leads into deeper content.",
    "- Ban visible scaffold phrases and equivalents such as 从首页开始, 接下来看博客, 循序进入深内容, 阅读入口, 站点入口, 首页路径, 继续了解, 下一步, this page provides, homepage job, where to start, start from home, or next step when they explain navigation order rather than a concrete offer or action.",
    page.route === "/"
      ? "- Homepage gate: route / must read as the site home entry. The title, meta description, H1, and first lead paragraph must establish brand mission, audience, scope, and navigation overview only. Do not put download, certification, query/search, login, or registration wording in those fields; place those downstream functions only in later cards, nav, or CTA modules."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: the hero must establish the brand and entry-purpose relationship. Downstream functions may appear as secondary navigation cards, but never as the title, H1, or lead identity."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: downstream links must be concrete offers or destinations. Never write homepage route choreography such as 'start from the homepage, then read the blog', 'the homepage path', or 'the home page's task is to guide the next step'."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: when linking to a Blog/content route, use thematic CTA language such as read the blog, explore recent writing, or enter the article archive. Do not explain the site by counting or sequencing the current articles, for example 'the blog has three recent articles' or 'start with these three pieces'."
      : "",
    page.pageKind === "home"
      ? "- Home page gate: if the confirmed prompt centers the site on one named person such as an author, founder, consultant, researcher, or executive, the home hero and first substantive section must introduce that person, their expertise, and why visitors should trust them before routing into /blog or archive surfaces. The blog/content index is downstream distribution, not the homepage identity."
      : "",
    page.pageKind === "home"
      ? "- Home page feature-card gate: if the page uses a 2-4 card row for themes, strengths, coverage areas, or editorial pillars, treat each item as a roomy feature card. The outer card class must own generous four-side padding and vertical rhythm, not just a border shell."
      : "",
    page.pageKind === "home"
      ? "- Home page feature-card gate: decorative numerals, step numbers, watermarks, or corner badges must have explicit inset positioning and must not crowd the title or body copy. Titles and paragraphs should align to one padded text column with stable top/right/bottom/left gutters."
      : "",
    page.pageKind === "blog-data-index"
      ? "- Blog/content index gate: visible chips, pills, eyebrow labels, hero leads, and section intros must describe the subject, editorial stance, or archive value itself. They must never tell the visitor how to read, where to start, which order to follow, or that this page collects a certain number of articles."
      : "",
    page.pageKind === "blog-data-index"
      ? "- Blog/content index gate: ban visible phrases like reading path, reading method, suggested reading order, how to read, this page collects, what you'll find here, start with these three articles, launch articles, 首发文章, 阅读路径, 阅读方式, 推荐阅读顺序, 如何阅读, 本页内容, or equivalent wording even inside pills/badges."
      : "",
    page.pageKind === "blog-data-index"
      ? "- Blog/content index gate: do not satisfy article details with same-page anchors such as #article-detail, accordion panels, or detail sections embedded below the index. Every visible article/resource card must link to a stable /blog/{slug}/ route, and the generated output must include the matching /blog/{slug}/index.html file."
      : "",
    page.pageKind === "search-directory"
      ? "- Search-directory gate: if the layout uses a dense grid, search results must span the full available row and remain readable at desktop and mobile widths."
      : "",
    blogContentBackendGate,
    generatedBlogDetailGate,
    bilingualLanguageGate,
    "- Follow the workflow skill's Shared Shell/Footer Contract for header, main, and footer requirements.",
    siblingIntents ? `Sibling page intents to stay visually distinct from:\n${siblingIntents}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

export function formatWebsiteTargetPageContractForAdapter(
  plan: LocalDecisionPlan,
  targetFile: string,
  requirementText = "",
): string {
  return formatTargetPageContract(plan, targetFile, requirementText);
}

function buildBilingualProtocolReference(defaultVisibleLanguage: "zh-CN" | "zh" | "en"): string {
  const visibleTitle =
    defaultVisibleLanguage === "en" ? "Thoughtful AI notes for everyday readers." : "写给每个人的 AI 小笔记。";
  const visibleLead =
    defaultVisibleLanguage === "en"
      ? "Calm editorial guidance for people who want practical AI judgment."
      : "用克制、实用的方式解释 AI 如何进入日常判断。";
  return [
    "Bilingual reference scaffold (adapt the copy, keep the exact protocol):",
    '<header><nav><a href="/" data-i18n="nav.home" data-i18n-zh="首页" data-i18n-en="Home">首页</a><a href="/blog/" data-i18n="nav.blog" data-i18n-zh="博客" data-i18n-en="Blog">博客</a><button type="button" data-locale-toggle data-locale="zh-CN">ZH</button><button type="button" data-locale-toggle data-locale="en">EN</button></nav></header>',
    `<h1 data-i18n="home.hero.title" data-i18n-zh="写给每个人的 AI 小笔记。" data-i18n-en="Thoughtful AI notes for everyday readers.">${visibleTitle}</h1>`,
    `<p data-i18n="home.hero.lead" data-i18n-zh="用克制、实用的方式解释 AI 如何进入日常判断。" data-i18n-en="Calm editorial guidance for people who want practical AI judgment.">${visibleLead}</p>`,
    "Do not render the zh and en versions as two visible sibling nodes. One node holds both translations; /script.js swaps the text.",
  ].join("\n");
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

function buildWorkflowFiles(params: {
  requirementText: string;
  decision: LocalDecisionPlan;
  designMd: string;
  locale: "zh-CN" | "en";
  provider: string;
  model: string;
}): RuntimeWorkflowFile[] {
  const taskPlan = [
    "# Task Plan",
    "",
    `- Locale: ${params.locale}`,
    `- Provider: ${params.provider}`,
    `- Model: ${params.model}`,
    `- Routes: ${params.decision.routes.join(", ")}`,
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

  return [
    { path: "/task_plan.md", content: taskPlan, type: "text/markdown" },
    { path: "/findings.md", content: findings, type: "text/markdown" },
    { path: "/design.md", content: design, type: "text/markdown" },
  ];
}

function resolveProviderConfig(lock: RunProviderLock): ProviderConfig {
  if (lock.provider === "pptoken") {
    return {
      provider: "pptoken",
      apiKey: process.env.PPTOKEN_API_KEY,
      baseURL: process.env.PPTOKEN_BASE_URL || "https://api.pptoken.org/v1",
      defaultHeaders: {},
      modelName: String(lock.model || process.env.LLM_MODEL_PPTOKEN || process.env.PPTOKEN_MODEL || "gpt-5.4-mini"),
    };
  }
  if (lock.provider === "aiberm") {
    return {
      provider: "aiberm",
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName: String(lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL || "gpt-5.4-mini"),
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
    modelName: String(
      lock.model ||
        process.env.LLM_MODEL_CRAZYROUTE ||
        process.env.LLM_MODEL_CRAZYROUTER ||
        process.env.LLM_MODEL_CRAZYREOUTE ||
        process.env.LLM_MODEL ||
        "gpt-5.4-mini",
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

  // Aiberm's OpenAI-compatible endpoint rejects OpenAI's named tool_choice shape
  // with `Unknown parameter: tool_choice.function`. It still accepts tools with
  // the generic required mode, and the prompt constrains the desired tool.
  if (config.provider === "aiberm") return "required";

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
      if (attempt >= retries || !isRetryableProviderError(error)) {
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
}): Promise<{ attempt: ProviderAttempt; notes: string[] }> {
  let lastError: unknown;
  const notes: string[] = [];
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
      return { attempt, notes };
    } catch (error) {
      lastError = error;
      const isLast = index >= params.attempts.length - 1;
      const canFallback =
        isRetryableProviderError(error) ||
        /provider_tool_protocol_mismatch|native tool_calls|empty response without native tool_calls/i.test(
          errorText(error),
        );
      if (!canFallback || isLast) {
        throw error;
      }
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
  model: { invoke: (messages: BaseMessage[]) => Promise<any>; stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>> };
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
}): { files: RuntimeWorkflowFile[]; qaSummary: QaSummary; qaRecords: SkillToolQaRecord[] } {
  const files = dedupeFiles(params.files);
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
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
    files,
    requirementText: params.requirementText || "",
  }).filter((filePath) => !byPath.has(normalizePath(filePath)));
  if (missing.length > 0) {
    throw new Error(`skill_tool_missing_required_files: ${missing.join(", ")}`);
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

  assertSharedShellConsistency(params.decision, byPath);

  for (const route of params.decision.routes) {
    totalRoutes += 1;
    const pagePath = routeToHtmlPath(route);
    const page = byPath.get(pagePath);
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
    if ((isPlannedBlogDataRoute || isExplicitBlogIndexRoute) && !hasBlogContract) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} does not include the Blog data-source contract`);
    }
    if (isPlannedBlogDataRoute || isExplicitBlogIndexRoute || hasBlogContract) {
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
        const selectedDetailRoutes = selectedBlogDetailRoutesForRequirement(detailRoutes, params.requirementText || "");
        for (const [routeKey, expectation] of extractBlogDetailExpectations(html)) {
          if (selectedDetailRoutes.includes(normalizePath(routeKey)) && !detailExpectations.has(routeKey)) {
            detailExpectations.set(routeKey, expectation);
          }
        }
        if (detailRoutes.length === 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} must expose at least one /blog/{slug}/ detail link because Blog/content-backed generation always includes detail pages`,
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
        !shouldRequireAllDiscoveredBlogDetails(params.requirementText || "") &&
        detailRoutes.length > DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT
      ) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes ${detailRoutes.length} Blog detail links without an explicit requested content count; limit the initial Blog fallback to ${DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT} substantial entries or ask for a specific article count`,
        );
      }
        for (const detailRoute of selectedDetailRoutes) {
          const detailPath = routeToHtmlPath(detailRoute);
          const detailFile = byPath.get(detailPath);
          if (!detailFile || !isMeaningfulArticleDetailHtml(String(detailFile.content || ""))) {
            throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} must contain a complete article/detail body, not only title, metadata, or excerpt content`,
          );
        }
        const detailScaffoldTerms = findVisibleBlogDetailEditorialScaffold(String(detailFile.content || ""));
          if (detailScaffoldTerms.length > 0) {
            throw new Error(
              `skill_tool_invalid_required_file: ${detailPath} exposes editorial scaffold/explanatory wording instead of final article content: ${detailScaffoldTerms.join(", ")}`,
            );
          }
          const detailIssues = findBlogDetailQualityIssues(String(detailFile.content || ""));
          if (detailIssues.length > 0) {
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
        files
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
        if (!detailFile || !isMeaningfulArticleDetailHtml(String(detailFile.content || ""))) {
          throw new Error(
          `skill_tool_invalid_required_file: ${detailPath} must contain a complete article/detail body, not only title, metadata, or excerpt content`,
        );
      }
      const detailScaffoldTerms = findVisibleBlogDetailEditorialScaffold(String(detailFile.content || ""));
        if (detailScaffoldTerms.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} exposes editorial scaffold/explanatory wording instead of final article content: ${detailScaffoldTerms.join(", ")}`,
          );
        }
        const detailIssues = findBlogDetailQualityIssues(String(detailFile.content || ""));
        if (detailIssues.length > 0) {
          throw new Error(
            `skill_tool_invalid_required_file: ${detailPath} ${detailIssues.join("; ")}`,
          );
        }
      }
    }

  if (sharedIsBilingualRequirementText(params.requirementText || "")) {
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
          `skill_tool_invalid_required_file: ${pagePath} is missing bilingual i18n mappings for visible core copy; add data-i18n with zh/en values instead of shipping a single-language page`,
        );
      }
      if (!hasBilingualLocaleToggle(html)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} is missing a real bilingual language switch; add a data-locale-toggle control that swaps visible zh/en copy`,
        );
      }
    }
  }
  if (!requestedSiteContentCount && !shouldRequireAllDiscoveredBlogDetails(params.requirementText || "")) {
    const detailRoutes = Array.from(
      new Set(
        files
          .filter((file) => normalizePath(file.path).endsWith(".html"))
          .filter((file) => isPrimaryBlogIndexHtmlFile(params.decision, file.path))
          .flatMap((file) => extractBlogDetailRoutes(String(file.content || ""))),
      ),
    );
    if (detailRoutes.length > DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT) {
      throw new Error(
        `skill_tool_invalid_required_file: Blog/content fallback exposes ${detailRoutes.length} detail links without an explicit requested content count; limit the initial Blog fallback to ${DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT} substantial entries or ask for a specific article count`,
      );
    }
  }

  for (const [detailRoute, expectation] of detailExpectations.entries()) {
    const detailPath = routeToHtmlPath(detailRoute);
    const detailFile = byPath.get(detailPath);
    if (!detailFile || !isMeaningfulArticleDetailHtml(String(detailFile.content || ""))) {
      throw new Error(
        `skill_tool_invalid_required_file: ${detailPath} must contain a complete article/detail body, not only title, metadata, or excerpt content`,
      );
    }
    const detailIssues = findBlogDetailQualityIssues(String(detailFile.content || ""));
    if (detailIssues.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${detailPath} ${detailIssues.join("; ")}`,
      );
    }
  }

  const normalizedFiles = files.map((file) => {
    if (file.path === "/styles.css") {
      return {
        ...file,
        content: normalizeGeneratedCss(file.content),
      };
    }
    if (file.path.endsWith(".html")) {
      const htmlDocument = ensureHtmlDocument(file.content);
      if (!htmlDocument || containsToolTranscriptNoise(htmlDocument)) {
        throw new Error(`skill_tool_invalid_generated_html: ${file.path}`);
      }
      const html = enforceNavigationOrder(
        rewriteAbsoluteSiteLinksToRelative(
          htmlDocument,
          normalizePath(file.path),
        ),
        params.decision,
      );
      return {
        ...file,
        content: html,
      };
    }
    return file;
  });
  const qaSummary: QaSummary = {
    averageScore: Math.max(0, Math.round(aggregateScore)),
    totalRoutes,
    passedRoutes: totalRoutes,
    totalRetries: 0,
    retriesAllowed: 0,
    antiSlopIssueCount: Array.from(categories.values()).reduce((sum, item) => sum + item.count, 0),
    categories: Array.from(categories.values()).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
  };
  return { files: normalizedFiles, qaSummary, qaRecords };
}

export function validateWebsiteRequiredFilesWithQaForAdapter(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): SkillExecutionValidationResult {
  return validateAndNormalizeRequiredFilesWithQa(params);
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
  return normalizePath(value || "/");
}

function extractTagBlock(html: string, tagName: string): string {
  const match = String(html || "").match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i"));
  return String(match?.[0] || "");
}

function extractPlannedRoutesFromHtmlBlock(html: string, allowedRoutes: Set<string>): string[] {
  const routes = Array.from(String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => normalizeHrefRoute(match[1] || ""))
    .filter((route) => !!route && allowedRoutes.has(route));
  return Array.from(new Set(routes));
}

function assertSharedShellConsistency(decision: LocalDecisionPlan, byPath: Map<string, RuntimeWorkflowFile>) {
  const plannedRoutes = new Set(decision.routes.map((route) => normalizePath(route)));
  const homeHtml = ensureHtmlDocument(String(byPath.get("/index.html")?.content || ""));
  if (!homeHtml) return;

  const canonicalNavBlock = extractTagBlock(homeHtml, "nav");
  const canonicalFooterBlock = extractTagBlock(homeHtml, "footer");
  const canonicalNavRoutes = extractPlannedRoutesFromHtmlBlock(canonicalNavBlock, plannedRoutes);
  const canonicalFooterRoutes = extractPlannedRoutesFromHtmlBlock(canonicalFooterBlock, plannedRoutes);

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

export function enforceNavigationOrder(html: string, decision: LocalDecisionPlan): string {
  const routeOrder = new Map(
    decision.routes.map((route, index) => [normalizePath(route), index]),
  );
  const routeLabel = new Map(
    decision.routes.map((route, index) => [normalizePath(route), String(decision.navLabels[index] || "").trim()]),
  );
  if (routeOrder.size <= 1) return html;

  return String(html || "").replace(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/gi, (full, attrs, inner) => {
    const anchors = Array.from(String(inner || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi));
    const known = anchors
      .map((match, originalIndex) => ({
        tag: String(match[0] || "").replace(/(<a\b[^>]*>)([\s\S]*?)(<\/a>)/i, (anchorFull, open, label, close) => {
          const normalizedRoute = normalizeHrefRoute(match[1]);
          const canonicalLabel = routeLabel.get(normalizedRoute);
          return canonicalLabel ? `${open}${canonicalLabel}${close}` : anchorFull;
        }),
        route: normalizeHrefRoute(match[1]),
        originalIndex,
      }))
      .filter((item) => routeOrder.has(item.route));
    if (known.length < 2) return full;

    const sortedKnown = [...known].sort((left, right) => {
      const leftOrder = routeOrder.get(left.route) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = routeOrder.get(right.route) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.originalIndex - right.originalIndex;
    });
    const unknown = anchors
      .map((match, originalIndex) => ({
        tag: match[0],
        route: normalizeHrefRoute(match[1]),
        originalIndex,
      }))
      .filter((item) => !routeOrder.has(item.route));
    const reordered = [...sortedKnown, ...unknown].map((item) => item.tag).join("\n          ");
    return `<nav${attrs}>${reordered}</nav>`;
  });
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
  if (normalized === "/blog/index.html") return true;
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

function shouldRequireAllDiscoveredBlogDetails(requirementText = ""): boolean {
  return /(?:complete|full|all|every|matching|corresponding|全部|所有|完整|每个|对应).{0,30}(?:blog|article|post|detail|文章|博客|详情)/i.test(
    String(requirementText || ""),
  );
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

function selectedBlogDetailRoutesForRequirement(detailRoutes: string[], requirementText = ""): string[] {
  const uniqueRoutes = Array.from(new Set(detailRoutes.map((route) => normalizePath(route)).filter(Boolean)));
  const requestedCount = requestedPublishableContentCount(requirementText);
  if (requestedCount) return uniqueRoutes.slice(0, requestedCount);
  if (shouldRequireAllDiscoveredBlogDetails(requirementText)) return uniqueRoutes;
  return uniqueRoutes.slice(0, DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT);
}

function requiredFileChecklist(decision: LocalDecisionPlan, params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {}): string[] {
  const requirementText = params.requirementText || "";
  const discoveredDetails = discoveredBlogDetailChecklist(decision, params.files || []);
  const requestedCount = requestedPublishableContentCount(requirementText);
  const requiredDetails = requestedCount
    ? discoveredDetails.slice(0, requestedCount)
    : shouldRequireAllDiscoveredBlogDetails(requirementText)
      ? discoveredDetails
      : discoveredDetails.slice(0, DEFAULT_UNREQUESTED_BLOG_DETAIL_LIMIT);
  return Array.from(new Set([
    "/styles.css",
    "/script.js",
    ...decision.routes.map((route) => routeToHtmlPath(route)),
    ...requiredDetails,
  ]));
}

export function requiredWebsiteFileChecklistForAdapter(
  decision: LocalDecisionPlan,
  params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
): string[] {
  return requiredFileChecklist(decision, params);
}

function resolveMaxToolRounds(decision: LocalDecisionPlan, requirementText = ""): number {
  const requestedCount = requestedPublishableContentCount(requirementText) || 0;
  const sharedRounds = 1;
  const routeRounds = Math.max(1, Math.ceil(decision.routes.length / HTML_TARGETS_PER_ROUND));
  const detailRounds = requestedCount > 0 ? Math.ceil(requestedCount / DETAIL_TARGETS_PER_ROUND) : 0;
  const batchedEmissionRounds = Math.min(
    MAX_TOOL_ROUNDS,
    Math.max(
      4,
      sharedRounds + routeRounds + detailRounds + 2,
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
  const home = missing.filter((item) => item === "/index.html");
  const isSharedOrHome = (item: string) => item === "/styles.css" || item === "/script.js" || item === "/index.html";
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
  return [...css, ...js, ...home, ...routePages, ...blogDetails, ...other];
}

function describeObjectiveTarget(target: string): string {
  if (target === "/styles.css") return "/styles.css shared design tokens, responsive layout, card/list/detail styles, and footer/navigation styles";
  if (target === "/script.js") return "/script.js shared lightweight interactions, language switch support when required, navigation behavior, and Blog hydration that preserves fallback markup";
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
  if (sharedTargets.length > 0) {
    return {
      targetFiles: sharedTargets,
      instruction:
        `Emit the shared static foundation in this round: ${sharedTargets.map(describeObjectiveTarget).join("; ")}. Keep CSS/JS consistent across every planned page. Do not emit HTML unless it is necessary to unblock these shared files.`,
      strictSingleTarget: false,
    };
  }

  const pageTargets = missing
    .filter((item) => item.endsWith("/index.html"))
    .filter((item) => !/^\/blog\/.+\/index\.html$/i.test(item))
    .slice(0, HTML_TARGETS_PER_ROUND);
  if (pageTargets.length > 0) {
    return {
      targetFiles: pageTargets,
      instruction:
        `Emit these complete route HTML documents in one consistent batch: ${pageTargets.map(describeObjectiveTarget).join("; ")}. Reuse the same header, navigation, footer, CSS, JS, language switch mechanics, and route order. Each page body must be route-specific and visitor-facing; never explain browsing order or page mechanics.`,
      strictSingleTarget: false,
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
  });
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
}): string {
  const currentFiles = params.emittedFiles
    .map((file) => `- ${file.path} (${file.type}, ${String(file.content || "").length} chars)`)
    .join("\n");
  const targetContracts = params.objective.targetFiles
    .map((target) => normalizePath(target))
    .filter((target) => target.endsWith(".html"))
    .slice(0, 6)
    .map((target) => formatTargetPageContract(params.decision, target, params.requirementText))
    .filter(Boolean);
  const firstTarget = params.objective.targetFiles[0] ? normalizePath(params.objective.targetFiles[0]) : "";
  const includeFullContract =
    firstTarget === "/styles.css" ||
    firstTarget === "/script.js" ||
    firstTarget.endsWith(".html") ||
    params.round >= 3 ||
    !params.objective.strictSingleTarget;
  const blogDataRoutes = getBlogDataSourceRoutes(params.decision);
  const requestedContentCount = requestedPublishableContentCount(params.requirementText);
  const requiresLanguageSwitch = isBilingualRequirementText(params.requirementText);
  const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(params.requirementText);
  const bilingualPromptGuidance = loadBilingualPromptGuidance();
  const renderedRoundLanguageGuidance = renderPromptGuidance(
    bilingualPromptGuidance.roundLanguageGuidance,
    { DEFAULT_VISIBLE_LANGUAGE: defaultVisibleLanguage },
  );
  const renderedRoundStrictProtocol = renderPromptGuidance(
    bilingualPromptGuidance.roundStrictProtocol,
    { DEFAULT_VISIBLE_LANGUAGE: defaultVisibleLanguage },
  );
  return [
    `Round: ${params.round + 1}/${params.totalRounds}`,
    `Routes: ${params.decision.routes.join(", ")}`,
    `Style: ${params.styleName}`,
    `Style reason: ${params.styleReason}`,
    "",
    "Round objective:",
    `- Target files: ${params.objective.targetFiles.join(", ") || "(none)"}`,
    `- Instruction: ${params.objective.instruction}`,
    includeFullContract ? "Generation contract:" : "Generation contract summary:",
    includeFullContract
      ? contractDigest(params.decision)
      : `- Route count: ${params.decision.routes.length}\n- Primary routes: ${params.decision.routes.slice(0, 3).join(", ")}`,
    targetContracts.length > 0 ? ["", "Target page contracts:", targetContracts.join("\n\n")].join("\n") : "",
    "",
    `Loaded skills: ${params.loadedSkillIds.join(", ") || "(none)"}`,
    `Missing required files: ${params.requiredMissing.join(", ") || "(none)"}`,
    `Content-binding route(s): ${blogDataRoutes.join(", ") || "(none; emit fallback route only if the route plan has no confident content-capable page)"}. This is internal implementation context; visible headings and cards must follow each route's own taxonomy and must not mention backend/runtime/fallback mechanics.`,
    requestedContentCount
      ? `Requested publishable content gate: the brief asks for ${requestedContentCount} complete content item(s). Blog/content-backed output must provide ${requestedContentCount} full article/detail targets with body prose, not title-only cards or explanatory list mechanics.`
      : "",
    ...(requiresLanguageSwitch ? renderedRoundLanguageGuidance : []),
    ...(requiresLanguageSwitch ? ["", buildBilingualProtocolReference(defaultVisibleLanguage)] : []),
    "",
    "Current emitted files:",
    currentFiles || "(none)",
    "",
    "Strict protocol:",
    "- Use native tool calls (load_skill, emit_file, finish); do not fake tool calls in plain text.",
    "- Every round must include at least one tool call until all required files are emitted.",
    "- Emit_file content must be raw file content (no markdown fences, no tool transcript wrappers).",
    ...(requiresLanguageSwitch ? renderedRoundStrictProtocol : []),
    "- Follow the website-generation-workflow skill contract for Canonical Website Prompt adherence, page differentiation, and shared shell/footer rules.",
    "- Follow the Website Quality Contract: website-only scope, multi-device WYSIWYG preview, strong visual direction, responsive CSS, and no placeholder/template slop.",
    "- Multi-page generation must be coherent, not fragile: keep one shared HTML shell contract, one shared navigation order, one shared footer, one shared CSS system, one shared JS behavior layer, one shared bilingual switch behavior when requested, and pass the same QA gate across every emitted page.",
    "- When this round targets multiple files, emit every target file in the same round unless a provider error prevents it. Do not split one straightforward multi-page website into one model round per file.",
    "- Visitor-facing content must be final site content. Do not show explanatory scaffolding such as reading method, what you'll find, article collection, this page collects, each article includes date/read time/tags, launch articles, three launch articles, 首发文章, 三篇首发文章, or their Chinese equivalents.",
    "- If the brief asks for three articles, present the actual three article cards and complete article bodies; do not write a site-structure explanation that says the page has three launch/first articles.",
    "- Blog/content-index hero text must express a real thesis or value proposition about the topic. Never use hero or section lead sentences that merely tell the visitor how to browse, read, or start the list.",
    "- If the brief asks for three articles, present the actual three article cards and complete article bodies; do not write a site-structure explanation that gives the reader an order for consuming them.",
    "- Treat requested article count as invisible production logic. The page may contain exactly three cards, but visible copy must not announce the count with slogans like three articles, three launch articles, three ways, here are three complete articles, or 持续更新三篇首发文章.",
    "- On the home page, do not explain the site by summarizing or sequencing the current Blog articles. Link to the Blog with a topical CTA, not with copy like 'the blog currently has three recent articles' or 'start from these three'.",
    "- On the home page, if you render a 2-4 card row for themes, strengths, coverage areas, or editorial pillars, make each item a spacious feature card with explicit four-side padding and parent-controlled gap. Avoid compressed border-only shells.",
    "- Decorative numerals, step numbers, watermarks, or corner badges inside those home feature cards must be visibly inset from the edge and must not steal the text gutter from the title/body column.",
    "- Do not rely on data-fallback-posts, hidden templates, or script-only rendering to satisfy Blog detail-link requirements. The initial HTML in [data-shpitto-blog-list] must visibly contain the article cards and /blog/{slug}/ links.",
    "- Do not use same-page anchors such as #article-detail, accordions, hidden panels, or inline sections as substitutes for Blog detail pages. Blog cards must link to /blog/{slug}/ and each linked detail must be emitted as /blog/{slug}/index.html.",
    "- If a Blog/content list uses an outer card class like .article-card or .blog-card, that exact class must carry the essential padding itself. Do not put all gutters only on nested wrappers such as __body or __content, because runtime hydration may replace inner markup.",
    "- Avoid repeated generic section names like only surface/section/cards across every page; use route-specific module classes where useful.",
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
}): string {
  return buildToolRoundPrompt(params);
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
  const skillId = String(workflowContext.skillId || "website-generation-workflow");
  const adapter = await getSkillExecutionAdapter(skillId);
  const toolRequirementContext = Array.from(
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
  const decision = applyStateSitemapToDecision(buildLocalDecisionPlan(params.state), params.state.sitemap);
  const workflow = await loadWorkflowSkillContext(
    sanitizedRequirementWithReferences,
    normalizeWorkflowVisualDecisionContext(workflowContext as any),
  );
  const qualityContract = renderWebsiteQualityContract();
  const availableSkillIds = await getWebsiteGenerationSkillBundle();
  const websiteSeedSkillIds = await listWebsiteSeedSkillIds();
  const documentSkillIds = await listDocumentContentSkillIds();
  const selectedSeedSkills = await selectWebsiteSeedSkillsForIntent({
    requirementText: sanitizedRequirementWithReferences,
    routes: decision.routes,
    maxSkills: Number(process.env.SKILL_TOOL_MAX_SEED_SKILLS || 2),
  });
  const selectedDocumentSkills = await selectDocumentContentSkillsForIntent({
    requirementText: sanitizedRequirementWithReferences,
    routes: decision.routes,
    referencedAssets,
    maxSkills: Number(process.env.SKILL_TOOL_MAX_DOCUMENT_SKILLS || 3),
  });
  const stylePreset = normalizeStylePreset(workflow.stylePreset, {});
  const providerAttempts = resolveProviderAttempts({
    provider: (params.state as any)?.workflow_context?.lockedProvider,
    model: (params.state as any)?.workflow_context?.lockedModel,
  });
  let activeAttempt = providerAttempts[0];
  let lock = activeAttempt.lock;
  let providerConfig = activeAttempt.config;
  const brandName =
    String(decision.brandHint || (params.state as any)?.site_artifacts?.branding?.name || "").trim() ||
    resolveBrandName(decision);
  const totalToolRounds = adapter.resolveMaxToolRounds(decision, toolRequirementContext);
  const expectedRequiredFileCountAtStart = resolveExpectedRequiredFileCount({
    decision,
    adapter,
    requirementText: toolRequirementContext,
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
    provider: lock.provider,
    model: lock.model,
  });
  let assistantNotes: string[] = [];
  let completedStaticFiles: RuntimeWorkflowFile[] | undefined;
  let completedQaSummary: QaSummary | undefined;
  let completedQaRecords: SkillToolQaRecord[] = [];
  let lastStageFiles: RuntimeWorkflowFile[] = [];
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
          `- User requirement:\n${clipRuntimeRequirement(toolRequirementContext, DEFAULT_INITIAL_REQUIREMENT_CHARS) || "(empty)"}`,
          referencedAssets.length > 0 ? "- Referenced assets (must use when relevant):" : "- Referenced assets: none",
          ...(referencedAssets.length > 0
            ? referencedAssets.map((line) => `  - ${line}`)
            : []),
          `- Locale: ${decision.locale}`,
          `- Preferred design system: ${workflow.hit?.name || workflow.hit?.id || "auto"}`,
          `- Available website skills: ${availableSkillIds.join(", ")}`,
          `- Website seed skills discovered from frontmatter: ${websiteSeedSkillIds.join(", ") || "(none)"}`,
          `- Recommended seed skills for this brief: ${selectedSeedSkills.map((item) => `${item.id} (${item.reason})`).join(", ") || "(none)"}`,
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
          qualityContract,
          "",
          "Workflow skill contract:",
          String(workflow.workflowSkill || "").slice(0, DEFAULT_INITIAL_WORKFLOW_SKILL_CHARS) || "(no workflow skill)",
          "",
          "Required files:",
          adapter.buildRequiredFileChecklist(decision).join(", "),
          requestedPublishableContentCount(toolRequirementContext)
            ? `- The requested content count is ${requestedPublishableContentCount(toolRequirementContext)}. After the Blog/content index emits its /blog/{slug}/ card links, the same number of static /blog/{slug}/index.html detail files becomes required. Do not finish with only the index page or same-page anchors.`
            : "- If a Blog/content index is planned, its visible fallback cards must expose /blog/{slug}/ links; matching static detail files become required as soon as those links exist.",
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
      assistantNotes.push(...selectedProviderAttempt.notes);
      lock = activeAttempt.lock;
      providerConfig = activeAttempt.config;
      workflowFiles = buildWorkflowFiles({
        requirementText: sanitizedRequirementWithReferences,
        decision,
        designMd: workflow.designMd,
        locale: decision.locale,
        provider: lock.provider,
        model: lock.model,
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
        onStep: params.onStep,
      });

      let toolErrorCount = 0;
      let idleRounds = 0;
      let noProgressRounds = 0;
      let lastRoundCallNames = "";
      let lastRoundToolErrors = "";
      let qaRepairTargets: string[] = [];
      const defaultVisibleLanguage = bilingualDefaultVisibleLanguage(toolRequirementContext);
      completedStaticFiles = undefined;
      completedQaSummary = undefined;
      completedQaRecords = [];

      for (let round = 0; round < totalToolRounds; round += 1) {
        const expectedRequiredFileCount = resolveExpectedRequiredFileCount({
          decision,
          adapter,
          files: emittedFiles,
          requirementText: toolRequirementContext,
        });
        const stageBudgetMs = resolveStageBudgetMs(params.timeoutMs, expectedRequiredFileCount);
        if (Date.now() - stageStartedAt > stageBudgetMs) {
          throw new Error(
            [
              `skill-tool stage budget exceeded (${stageBudgetMs}ms): provider=${providerConfig.provider}, model=${providerConfig.modelName}`,
              `expectedRequiredFiles=${expectedRequiredFileCount}`,
              `plannedRounds=${totalToolRounds}; emittedFiles=${dedupeFiles(emittedFiles).length}; requiredMissing=${
                adapter
                  .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: toolRequirementContext })
                  .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path)))
                  .join(", ") || "(none)"
              }`,
            ].join("\n"),
          );
        }
        const missing = adapter
          .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: toolRequirementContext })
          .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path)));
        const activeRepairTargets = missing.length === 0 ? qaRepairTargets : [];
        const objectiveTargets = activeRepairTargets.length > 0 ? activeRepairTargets : missing;
        const objective = adapter.planRoundObjective(round, objectiveTargets);
        const timeoutConfig = resolveRoundTimeouts({
          taskTimeoutMs: params.timeoutMs,
          targetFileCount: Math.max(1, objective.targetFiles.length || objectiveTargets.length || 1),
        });
        const prompt = adapter.buildToolRoundPrompt({
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
          requirementText: toolRequirementContext,
        });
        toolHistoryMessages.push(new HumanMessage(prompt));
        const modelWithTools = createToolProtocolModel({
          config: providerConfig,
          requestTimeoutMs: timeoutConfig.absoluteTimeoutMs,
          toolChoice: SKILL_TOOL_TOOL_CHOICE === "auto" ? "auto" : "required",
        }) as {
          invoke: (messages: BaseMessage[]) => Promise<any>;
          stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
        };
        const modelWithEmitFile = createToolProtocolModel({
          config: providerConfig,
          requestTimeoutMs: timeoutConfig.absoluteTimeoutMs,
          toolChoice: { type: "function", function: { name: "emit_file" } },
        }) as {
          invoke: (messages: BaseMessage[]) => Promise<any>;
          stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
        };
        const modelForRound = noProgressRounds > 0 ? modelWithEmitFile : modelWithTools;
        let roundOutput: ToolRoundOutput;
        try {
          roundOutput = await invokeRoundWithTimeout({
            model: modelForRound,
            messages: toolHistoryMessages,
            idleTimeoutMs: timeoutConfig.idleTimeoutMs,
            absoluteTimeoutMs: timeoutConfig.absoluteTimeoutMs,
            operation: `skill-tool-round-${round + 1}`,
          });
        } catch (error) {
          if (!isRetryableProviderError(error)) {
            throw error;
          }
          const stillMissingAfterRetry = adapter
            .buildRequiredFileChecklist(decision, { files: emittedFiles, requirementText: toolRequirementContext })
            .filter((path) => !new Set(emittedFiles.map((file) => normalizePath(file.path))).has(normalizePath(path)));
          throw new Error(
            `skill_tool_provider_retry_exhausted: ${errorText(error)}; missing=${stillMissingAfterRetry.join(", ") || "(none)"}`,
          );
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
              let normalizedFile = result.file;
              if (normalizedPath === "/styles.css") {
                normalizedFile = { ...result.file, content: normalizeGeneratedCss(String(result.file.content || "")) };
              } else if (normalizedPath === "/script.js") {
                normalizedFile = {
                  ...result.file,
                  content: normalizeGeneratedJs(String(result.file.content || ""), toolRequirementContext),
                };
              } else if (normalizedPath.endsWith(".html")) {
                let nextHtml = String(result.file.content || "");
                nextHtml = adapter.sanitizeEmittedHtml
                  ? adapter.sanitizeEmittedHtml(normalizedPath, nextHtml, toolRequirementContext)
                  : nextHtml;
                if (isBilingualRequirementText(toolRequirementContext)) {
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
        const stillMissing = adapter
          .buildRequiredFileChecklist(decision, { files: dedupedCurrent, requirementText: toolRequirementContext })
          .filter((path) => !new Set(dedupedCurrent.map((file) => normalizePath(file.path))).has(normalizePath(path)));
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
          try {
            const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
              decision,
              files: emittedFiles,
              requirementText: toolRequirementContext,
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
            qaRepairTargets = extractQaRepairTargets(feedback);
            toolHistoryMessages.push(
              new HumanMessage(
                [
                  "Generated files failed the workflow QA gate. Re-emit only the affected complete file(s), then call finish after validation can pass.",
                  qaRepairTargets.length > 0
                    ? `QA repair targets: ${qaRepairTargets.join(", ")}`
                    : "QA repair targets: (none extracted; preserve all routes while fixing the reported issue)",
                  feedback,
                  "Repair requirements are generic page-type/layout rules from the workflow skill; preserve route list, navigation, Blog data-source contract, and generated file paths.",
                ].join("\n"),
              ),
            );
            idleRounds = 0;
            noProgressRounds = 0;
            continue;
          }
        }
      }

      if (!completedStaticFiles || !completedQaSummary) {
        const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
          decision,
          files: emittedFiles,
          requirementText: toolRequirementContext,
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
    const validated = adapter.validateAndNormalizeRequiredFilesWithQa({
      decision,
      files: lastStageFiles,
      requirementText: toolRequirementContext,
    });
    completedStaticFiles = validated.files;
    completedQaSummary = validated.qaSummary;
    completedQaRecords = validated.qaRecords;
  }
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
  const { staticFiles } = splitStaticAndWorkflow(completedStaticFiles);
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
      preferredLocale: decision.locale,
      sourceRequirement: sanitizedRequirementWithReferences,
      skillId: String((params.state.workflow_context as any)?.skillId || "website-generation-workflow"),
      lockedProvider: lock.provider,
      lockedModel: lock.model,
      stylePreset,
      designSystemId: workflow.hit?.id,
      designSystemName: workflow.hit?.name,
      designSelectionReason:
        workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
        workflow.hit?.design_desc,
      selectionCriteria: workflow.selectionCriteria,
      sequentialWorkflow: workflow.sequentialWorkflow,
      workflowGuide: workflow.workflowGuide,
      rulesSummary: workflow.rulesSummary,
      designMd: workflow.designMd,
    } as any,
  };

  const assistantText =
    assistantNotes.filter(Boolean).slice(-1)[0] ||
    `Skill-native generation completed with ${decision.routes.length} routes and ${staticFiles.length} static files.`;
  const actions = [{ text: "Deploy to shpitto server", payload: "deploy", type: "button" as const }];
  const finalFiles = getStaticArtifactFiles(finalState);
  const finalPages = getPages(finalState);

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
  };
}
