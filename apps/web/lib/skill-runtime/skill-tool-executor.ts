import crypto from "node:crypto";
import path from "node:path";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import type { AgentState } from "../agent/graph.ts";
import {
  appendReferencedAssetsBlock,
  parseReferencedAssetsFromText,
} from "../agent/referenced-assets.ts";
import { loadWorkflowSkillContext } from "../agent/website-workflow.ts";
import { DEFAULT_STYLE_PRESET, normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";
import {
  buildLocalDecisionPlan,
  type ComponentMix,
  type LocalDecisionPlan,
  type PageBlueprint,
} from "./decision-layer.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles } from "./artifacts.ts";
import { resolveRunProviderRunnerLock, type RunProviderLock } from "./provider-runner.ts";
import {
  SKILL_TOOL_DEFINITIONS,
  buildSkillToolSystemInstructions,
  handleSkillToolCall,
  type SkillToolCall,
  type SkillToolFile,
} from "./skill-tool-registry.ts";

type LlmProvider = "aiberm" | "crazyroute";

type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  modelName: string;
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

const MAX_TOOL_ROUNDS = Math.max(2, Number(process.env.SKILL_TOOL_MAX_ROUNDS || 20));
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
const DEFAULT_INITIAL_REQUIREMENT_CHARS = Math.max(400, Number(process.env.SKILL_TOOL_INITIAL_REQUIREMENT_CHARS || 1400));
const DEFAULT_INITIAL_DESIGN_CHARS = Math.max(800, Number(process.env.SKILL_TOOL_INITIAL_DESIGN_CHARS || 1800));
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
  const normalized = normalizePath(route);
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
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
    // eslint-disable-next-line no-new-func
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
  if (!/mobile-nav-toggle/i.test(css)) return css;
  if (/runtime-nav-toggle-fix/i.test(css)) return css;
  return [
    css,
    "",
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
  ].join("\n");
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
  if (!hasStylesheetRef(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/styles.css" />\n</head>`);
  }
  if (!hasSharedScriptRef(html) && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  <script src="/script.js"></script>\n</body>`);
  }
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
    if (isHumanLike) return content;
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

function extractPageTitleForRoute(route: string, locale: "zh-CN" | "en"): string {
  const normalized = normalizePath(route);
  if (normalized === "/") return locale === "zh-CN" ? "首页" : "Home";
  const token = normalized.split("/").filter(Boolean).join(" ");
  const title = token
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return title || (locale === "zh-CN" ? "页面" : "Page");
}

function formatComponentMix(mix: ComponentMix): string {
  return [
    `hero:${mix.hero}%`,
    `feature:${mix.feature}%`,
    `grid:${mix.grid}%`,
    `proof:${mix.proof}%`,
    `form:${mix.form}%`,
    `cta:${mix.cta}%`,
  ].join(", ");
}

function blueprintDigest(plan: LocalDecisionPlan): string {
  return plan.pageBlueprints
    .map(
      (page) =>
        `- ${page.route} (${page.pageKind})\n  responsibility: ${page.responsibility}\n  skeleton: ${page.contentSkeleton.join(
          " -> ",
        )}\n  mix: ${formatComponentMix(page.componentMix)}`,
    )
    .join("\n");
}

function findPageBlueprint(plan: LocalDecisionPlan, route: string): PageBlueprint {
  const normalized = normalizePath(route);
  return (
    plan.pageBlueprints.find((page) => normalizePath(page.route) === normalized) || {
      route: normalized,
      navLabel: extractPageTitleForRoute(normalized, plan.locale),
      pageKind: "generic",
      responsibility: "Provide route-specific information with clear navigation and conversion endpoint.",
      contentSkeleton: ["hero", "content-sections", "proof", "cta"],
      componentMix: { hero: 20, feature: 20, grid: 20, proof: 20, form: 10, cta: 10 },
    }
  );
}

function applyStateSitemapToDecision(base: LocalDecisionPlan, sitemap: unknown): LocalDecisionPlan {
  const inputRoutes = Array.isArray(sitemap)
    ? sitemap
        .map((item) => normalizePath(String(item || "")))
        .filter((route) => route && route !== "/")
    : [];
  if (inputRoutes.length === 0) return base;
  const routes = Array.from(new Set(["/", ...inputRoutes])).slice(0, 12);
  const pageBlueprints = routes.map((route) => {
    const existing = base.pageBlueprints.find((page) => normalizePath(page.route) === normalizePath(route));
    if (existing) return existing;
    const fallback = findPageBlueprint(base, route);
    return {
      ...fallback,
      route: normalizePath(route),
      navLabel: extractPageTitleForRoute(route, base.locale),
    };
  });
  return {
    ...base,
    routes,
    navLabels: pageBlueprints.map((page) => page.navLabel),
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
    "## Local Blueprint",
    blueprintDigest(params.decision),
  ].join("\n");

  const findings = [
    "# Findings",
    "",
    "## Input Prompt",
    String(params.requirementText || "").trim().slice(0, 2600) || "(empty)",
    "",
    "## Derived Blueprint",
    blueprintDigest(params.decision),
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

function buildFallbackStyles(stylePreset: DesignStylePreset): string {
  return [
    ":root {",
    `  --primary: ${stylePreset.colors.primary};`,
    `  --accent: ${stylePreset.colors.accent};`,
    `  --background: ${stylePreset.colors.background};`,
    `  --surface: ${stylePreset.colors.surface};`,
    `  --panel: ${stylePreset.colors.panel};`,
    `  --text: ${stylePreset.colors.text};`,
    `  --muted: ${stylePreset.colors.muted};`,
    `  --border: ${stylePreset.colors.border};`,
    "  --radius: 16px;",
    "  --radius-pill: 999px;",
    "  --shadow-sm: 0 6px 20px rgba(15, 23, 42, 0.08);",
    "  --shadow-lg: 0 18px 40px rgba(15, 23, 42, 0.14);",
    "}",
    "* { box-sizing: border-box; }",
    "body {",
    "  margin: 0;",
    `  font-family: ${stylePreset.typography};`,
    "  color: var(--text);",
    "  background: var(--background);",
    "}",
    ".container { width: min(1120px, 92vw); margin: 0 auto; }",
    "header { position: sticky; top: 0; z-index: 60; background: var(--surface); border-bottom: 1px solid var(--border); }",
    "nav { display: flex; gap: 14px; flex-wrap: wrap; padding: 14px 0; align-items: center; }",
    "nav a {",
    "  color: var(--text);",
    "  text-decoration: none;",
    "  padding: 8px 12px;",
    "  border-radius: var(--radius-pill);",
    "  font-weight: 600;",
    "  transition: background-color .22s ease, transform .22s ease, color .22s ease;",
    "}",
    "nav a:hover {",
    "  color: var(--primary);",
    "  background: color-mix(in oklab, var(--primary) 14%, transparent);",
    "  transform: translateY(-1px);",
    "}",
    ".hero { padding: 72px 0 36px; }",
    ".hero h1 { margin: 0 0 14px; font-size: clamp(2rem, 6vw, 3.3rem); line-height: 1.08; letter-spacing: -0.02em; }",
    ".hero p { max-width: 72ch; line-height: 1.72; color: color-mix(in oklab, var(--text) 70%, #1e293b 30%); }",
    ".cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 18px 0 28px; }",
    ".card {",
    "  background: color-mix(in oklab, var(--surface) 95%, #ffffff 5%);",
    "  border-radius: var(--radius);",
    "  padding: 18px;",
    "  border: 1px solid var(--border);",
    "  box-shadow: var(--shadow-sm);",
    "  transition: transform .22s ease, box-shadow .22s ease;",
    "}",
    ".card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }",
    ".cta { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #fff; text-decoration: none; border-radius: var(--radius-pill); padding: 11px 20px; font-weight: 700; }",
    ".cta:hover { transform: translateY(-1px); }",
    "footer {",
    "  margin-top: 48px;",
    "  padding: 26px 0 40px;",
    "  color: color-mix(in oklab, var(--text) 72%, transparent);",
    "}",
    "@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }",
  ].join("\n");
}

function buildFallbackScript(): string {
  return [
    "(() => {",
    "  const yearNodes = document.querySelectorAll('[data-year]');",
    "  const year = String(new Date().getFullYear());",
    "  yearNodes.forEach((node) => {",
    "    node.textContent = year;",
    "  });",
    "})();",
  ].join("\n");
}

function buildFallbackPage(params: {
  route: string;
  decision: LocalDecisionPlan;
  requirementText: string;
  brandName: string;
}): string {
  const route = normalizePath(params.route);
  const page = findPageBlueprint(params.decision, route);
  const title = extractPageTitleForRoute(route, params.decision.locale);
  const nav = params.decision.routes
    .map((item) => {
      const navPage = findPageBlueprint(params.decision, item);
      const normalized = normalizePath(item);
      const href = normalized === "/" ? "/" : `${normalized}/`;
      return `<a href="${href}">${navPage.navLabel}</a>`;
    })
    .join("");
  const cardList = page.contentSkeleton
    .slice(0, 6)
    .map((section) => `<article class="card"><h3>${section}</h3><p>${page.responsibility}</p></article>`)
    .join("");

  return `<!doctype html>
<html lang="${params.decision.locale === "zh-CN" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | ${params.brandName}</title>
  <meta name="description" content="${params.brandName} ${title} page" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <div class="container">
      <nav>${nav}</nav>
    </div>
  </header>
  <main class="container">
    <section class="hero">
      <h1>${title}</h1>
      <p>${page.responsibility}</p>
      <a class="cta" href="/contact/">${params.decision.locale === "zh-CN" ? "联系我们" : "Contact Us"}</a>
    </section>
    <section class="cards">${cardList}</section>
    <section>
      <p>${String(params.requirementText || "").trim().slice(0, 480)}</p>
    </section>
  </main>
  <footer>
    <div class="container">${params.brandName} © <span data-year></span></div>
  </footer>
  <script src="/script.js"></script>
</body>
</html>`;
}

function resolveProviderConfig(lock: RunProviderLock): ProviderConfig {
  if (lock.provider === "aiberm") {
    return {
      provider: "aiberm",
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName: String(lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || "openai/gpt-5.3-codex"),
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
        "openai/gpt-5.3-codex",
    ),
  };
}

function toOpenAiToolDefinitions() {
  return SKILL_TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  })) as any[];
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
  const tools = toOpenAiToolDefinitions();
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
        const response = await client.chat.completions.create(
          {
            model: params.config.modelName,
            messages: baseMessagesToOpenAiMessages(messages),
            tools,
            tool_choice: params.toolChoice,
            temperature: 0.2,
            max_tokens: maxTokens,
          } as any,
          { signal: controller.signal },
        );
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

function resolveRoundTimeouts(taskTimeoutMs: number): { idleTimeoutMs: number; absoluteTimeoutMs: number } {
  const idleTimeoutMs = clampTimeout(taskTimeoutMs, DEFAULT_ROUND_IDLE_TIMEOUT_MS, 10_000);
  let absoluteTimeoutMs = clampTimeout(taskTimeoutMs, DEFAULT_ROUND_ABSOLUTE_TIMEOUT_MS, idleTimeoutMs + 5_000);
  if (absoluteTimeoutMs <= idleTimeoutMs) absoluteTimeoutMs = idleTimeoutMs + 5_000;
  return { idleTimeoutMs, absoluteTimeoutMs };
}

function resolveStageBudgetMs(taskTimeoutMs: number, plannedFileCount: number): number {
  const fileCount = Math.max(1, Number(plannedFileCount || 0));
  const computedBudget = fileCount * STAGE_BUDGET_PER_FILE_MS;
  return clampTimeout(taskTimeoutMs, computedBudget, STAGE_BUDGET_PER_FILE_MS);
}

function errorText(error: unknown): string {
  return String((error as any)?.message || error || "unknown error");
}

function isRetryableProviderError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  if (/(401|403|forbidden|unauthorized|invalid api key|authentication failed)/i.test(text)) return false;
  if (/(404|model not found|unsupported model|not supported|bad request|invalid_request_error)/i.test(text)) return false;
  if (/(timeout|timed out|429|rate limit|503|502|504|service unavailable|connection error|network|socket hang up|econnreset|etimedout|eai_again|enotfound|temporarily unavailable|overloaded|upstream)/i.test(text)) {
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

async function invokeModelWithRetry(params: {
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

function ensureRequiredFiles(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText: string;
  brandName: string;
  stylePreset: DesignStylePreset;
}): RuntimeWorkflowFile[] {
  const output = [...params.files];
  const byPath = new Map(dedupeFiles(output).map((file) => [normalizePath(file.path), file]));
  const existingStyles = byPath.get("/styles.css");
  if (!existingStyles || !isLikelyValidCss(existingStyles.content)) {
    output.push({
      path: "/styles.css",
      content: buildFallbackStyles(params.stylePreset),
      type: "text/css",
    });
  }
  const existingScript = byPath.get("/script.js");
  if (!existingScript || !isLikelyValidJs(existingScript.content)) {
    output.push({
      path: "/script.js",
      content: buildFallbackScript(),
      type: "text/javascript",
    });
  }
  for (const route of params.decision.routes) {
    const pagePath = routeToHtmlPath(route);
    const existingPage = byPath.get(pagePath);
    const existingPageHtml = ensureHtmlDocument(String(existingPage?.content || ""));
    if (existingPage && existingPageHtml && !containsToolTranscriptNoise(existingPageHtml)) continue;
    output.push({
      path: pagePath,
      content: buildFallbackPage({
        route,
        decision: params.decision,
        requirementText: params.requirementText,
        brandName: params.brandName,
      }),
      type: "text/html",
    });
  }
  return dedupeFiles(output).map((file) => {
    if (file.path === "/styles.css") {
      return {
        ...file,
        content: normalizeGeneratedCss(file.content),
      };
    }
    if (file.path.endsWith(".html")) {
      return {
        ...file,
        content:
          rewriteAbsoluteSiteLinksToRelative(
            ensureHtmlDocument(file.content) || file.content,
            normalizePath(file.path),
          ) || file.content,
      };
    }
    return file;
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

function requiredFileChecklist(decision: LocalDecisionPlan): string[] {
  return ["/styles.css", "/script.js", ...decision.routes.map((route) => routeToHtmlPath(route))];
}

function missingRequiredFiles(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): string[] {
  const set = new Set(files.map((file) => normalizePath(file.path)));
  return requiredFileChecklist(decision).filter((path) => !set.has(path));
}

type RoundObjective = {
  targetFiles: string[];
  instruction: string;
  strictSingleTarget: boolean;
};

function planRoundObjective(round: number, missingFiles: string[]): RoundObjective {
  const missing = missingFiles.map((item) => normalizePath(item));
  if (!ENABLE_STAGED_OBJECTIVE || missing.length === 0) {
    return {
      targetFiles: missing,
      instruction: "Emit all missing required files as efficiently as possible.",
      strictSingleTarget: false,
    };
  }

  const priorityOrder = ["/styles.css", "/script.js", "/index.html", ...missing.filter((item) => item.endsWith("/index.html"))];
  const firstTarget = priorityOrder.find((item) => missing.includes(item)) || missing[0];
  if (!firstTarget) {
    return {
      targetFiles: [],
      instruction: "No missing required files.",
      strictSingleTarget: false,
    };
  }

  if (firstTarget === "/styles.css") {
    return {
      targetFiles: [firstTarget],
      instruction:
        "This round only emit /styles.css with complete base tokens/layout styles. Do not emit other files in this round.",
      strictSingleTarget: true,
    };
  }
  if (firstTarget === "/script.js") {
    return {
      targetFiles: [firstTarget],
      instruction:
        "This round only emit /script.js with lightweight interactions/utilities and no framework dependency.",
      strictSingleTarget: true,
    };
  }
  if (firstTarget === "/index.html") {
    return {
      targetFiles: [firstTarget],
      instruction:
        "This round only emit /index.html as a complete HTML document referencing /styles.css and /script.js.",
      strictSingleTarget: true,
    };
  }

  return {
    targetFiles: [firstTarget],
    instruction:
      `This round only emit ${firstTarget} as a complete HTML document referencing /styles.css and /script.js.`,
    strictSingleTarget: true,
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
  });
}

function buildToolRoundPrompt(params: {
  round: number;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  loadedSkillIds: string[];
  emittedFiles: RuntimeWorkflowFile[];
  requiredMissing: string[];
  objective: RoundObjective;
}): string {
  const currentFiles = params.emittedFiles
    .map((file) => `- ${file.path} (${file.type}, ${String(file.content || "").length} chars)`)
    .join("\n");
  const includeFullBlueprint = params.round >= 3 || !params.objective.strictSingleTarget;
  return [
    `Round: ${params.round + 1}/${MAX_TOOL_ROUNDS}`,
    `Routes: ${params.decision.routes.join(", ")}`,
    `Style: ${params.styleName}`,
    `Style reason: ${params.styleReason}`,
    "",
    "Round objective:",
    `- Target files: ${params.objective.targetFiles.join(", ") || "(none)"}`,
    `- Instruction: ${params.objective.instruction}`,
    includeFullBlueprint ? "Blueprint:" : "Blueprint summary:",
    includeFullBlueprint
      ? blueprintDigest(params.decision)
      : `- Route count: ${params.decision.routes.length}\n- Primary routes: ${params.decision.routes.slice(0, 3).join(", ")}`,
    "",
    `Loaded skills: ${params.loadedSkillIds.join(", ") || "(none)"}`,
    `Missing required files: ${params.requiredMissing.join(", ") || "(none)"}`,
    "",
    "Current emitted files:",
    currentFiles || "(none)",
    "",
    "Strict protocol:",
    "- Use native tool calls (load_skill, emit_file, finish); do not fake tool calls in plain text.",
    "- Every round must include at least one tool call until all required files are emitted.",
    "- Emit_file content must be raw file content (no markdown fences, no tool transcript wrappers).",
    params.objective.strictSingleTarget
      ? "- This round must focus on the objective target file only."
      : "- You may emit multiple missing files when needed.",
    "- Call finish only after all required files exist and are complete.",
  ].join("\n");
}

function shouldUseLocalFallback(config: ProviderConfig): boolean {
  if (String(process.env.SKILL_TOOL_FORCE_LOCAL || "").trim() === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return !config.apiKey;
}

function buildLocalExecutionFiles(params: {
  decision: LocalDecisionPlan;
  requirementText: string;
  stylePreset: DesignStylePreset;
  brandName: string;
}): RuntimeWorkflowFile[] {
  const files: RuntimeWorkflowFile[] = [
    { path: "/styles.css", content: buildFallbackStyles(params.stylePreset), type: "text/css" },
    { path: "/script.js", content: buildFallbackScript(), type: "text/javascript" },
  ];
  for (const route of params.decision.routes) {
    files.push({
      path: routeToHtmlPath(route),
      content: buildFallbackPage({
        route,
        decision: params.decision,
        requirementText: params.requirementText,
        brandName: params.brandName,
      }),
      type: "text/html",
    });
  }
  return files;
}

export async function runSkillToolExecutor(params: SkillToolExecutorParams): Promise<SkillToolExecutorSummary> {
  const requirementText = extractRequirementText(params.state);
  const parsedRequirement = parseReferencedAssetsFromText(requirementText);
  const referencedAssets = parsedRequirement.referencedAssets;
  const requirementWithReferences = appendReferencedAssetsBlock(
    parsedRequirement.cleanText || requirementText,
    referencedAssets,
  );
  const decision = applyStateSitemapToDecision(buildLocalDecisionPlan(params.state), params.state.sitemap);
  const workflow = await loadWorkflowSkillContext(requirementWithReferences);
  const stylePreset = normalizeStylePreset(workflow.stylePreset, {});
  const lock = resolveRunProviderRunnerLock({
    provider: (params.state as any)?.workflow_context?.lockedProvider,
    model: (params.state as any)?.workflow_context?.lockedModel,
  });
  const providerConfig = resolveProviderConfig(lock);
  const brandName = String(decision.brandHint || (params.state as any)?.site_artifacts?.branding?.name || "LC-CNC").trim() || "LC-CNC";

  const workflowFiles = buildWorkflowFiles({
    requirementText: requirementWithReferences,
    decision,
    designMd: workflow.designMd,
    locale: decision.locale,
    provider: lock.provider,
    model: lock.model,
  });
  const emittedFiles: RuntimeWorkflowFile[] = [];
  const loadedSkills = new Map<string, string>();
  const assistantNotes: string[] = [];
  const toolHistoryMessages: BaseMessage[] = [
    new SystemMessage(
      [
        "You are a senior frontend engineer generating a full static multi-page website.",
        "Output must be produced only through tools.",
        "Never emit placeholder tokens like <UNKNOWN>.",
        "Keep files production-ready and internally consistent.",
        "",
        buildSkillToolSystemInstructions(),
        "",
        "You may call multiple tools in a round.",
      ].join("\n"),
    ),
    new HumanMessage(
      [
        "Initial context:",
        `- User requirement: ${String(requirementWithReferences || "").slice(0, DEFAULT_INITIAL_REQUIREMENT_CHARS) || "(empty)"}`,
        referencedAssets.length > 0 ? "- Referenced assets (must use when relevant):" : "- Referenced assets: none",
        ...(referencedAssets.length > 0
          ? referencedAssets.map((line) => `  - ${line}`)
          : []),
        `- Locale: ${decision.locale}`,
        `- Preferred design system: ${workflow.hit?.name || workflow.hit?.id || "auto"}`,
        `- Design rationale: ${
          workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
          workflow.hit?.design_desc ||
          "N/A"
        }`,
        "",
        "Design excerpt:",
        String(workflow.designMd || "").slice(0, DEFAULT_INITIAL_DESIGN_CHARS) || "(no design.md)",
        "",
        "Required files:",
        requiredFileChecklist(decision).join(", "),
      ].join("\n"),
    ),
  ];

  if (shouldUseLocalFallback(providerConfig)) {
    emittedFiles.push(
      ...buildLocalExecutionFiles({
        decision,
        requirementText: requirementWithReferences,
        stylePreset,
        brandName,
      }),
    );
    await emitSnapshot({
      stepKey: "/index.html",
      stepIndex: 1,
      totalSteps: 1,
      status: "generating:local-fallback",
      locale: decision.locale,
      files: dedupeFiles(emittedFiles),
      workflowArtifacts: workflowFiles,
      pages: decision.routes.map((route) => ({
        path: normalizePath(route),
        html: String(
          dedupeFiles(emittedFiles).find((file) => normalizePath(file.path) === routeToHtmlPath(route))?.content || "",
        ),
      })),
      onStep: params.onStep,
    });
    assistantNotes.push("Skill-native tool executor used local fallback mode.");
  } else {
    const stageBudgetMs = resolveStageBudgetMs(params.timeoutMs, requiredFileChecklist(decision).length);
    const stageStartedAt = Date.now();
    const timeoutConfig = resolveRoundTimeouts(params.timeoutMs);
    const preflightModel = createToolProtocolModel({
      config: providerConfig,
      requestTimeoutMs: timeoutConfig.absoluteTimeoutMs,
      toolChoice: { type: "function", function: { name: "finish" } },
    }) as {
      invoke: (messages: BaseMessage[]) => Promise<any>;
      stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
    };
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
    await preflightProviderModel({
      model: preflightModel,
      config: providerConfig,
      taskTimeoutMs: params.timeoutMs,
    });

    await emitSnapshot({
      stepKey: "preflight",
      stepIndex: 0,
      totalSteps: MAX_TOOL_ROUNDS,
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
      onStep: params.onStep,
    });

    let toolErrorCount = 0;
    let idleRounds = 0;
    let noProgressRounds = 0;
    let lastRoundCallNames = "";
    let lastRoundToolErrors = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (Date.now() - stageStartedAt > stageBudgetMs) {
        throw new Error(
          `skill-tool stage budget exceeded (${stageBudgetMs}ms): provider=${providerConfig.provider}, model=${providerConfig.modelName}`,
        );
      }
      const missing = missingRequiredFiles(decision, emittedFiles);
      const objective = planRoundObjective(round, missing);
      const prompt = buildToolRoundPrompt({
        round,
        decision,
        stylePreset,
        styleName: workflow.hit?.name || workflow.hit?.id || "selected-style",
        styleReason:
          workflow.hit?.selection_candidates?.find((item) => item.id === workflow.hit?.id)?.reason ||
          workflow.hit?.design_desc ||
          "Follow requirement semantics and conversion goals.",
        loadedSkillIds: Array.from(loadedSkills.keys()),
        emittedFiles,
        requiredMissing: missing,
        objective,
      });
      toolHistoryMessages.push(new HumanMessage(prompt));
      const modelForRound = noProgressRounds > 0 ? modelWithEmitFile : modelWithTools;
      const roundOutput = await invokeRoundWithTimeout({
        model: modelForRound,
        messages: toolHistoryMessages,
        idleTimeoutMs: timeoutConfig.idleTimeoutMs,
        absoluteTimeoutMs: timeoutConfig.absoluteTimeoutMs,
        operation: `skill-tool-round-${round + 1}`,
      });
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
            const normalizedFile = normalizePath(String(result.file.path || "")) === "/styles.css"
              ? { ...result.file, content: normalizeGeneratedCss(String(result.file.content || "")) }
              : result.file;
            emittedFiles.push(normalizedFile);
            emittedThisRound += 1;
            emittedPathsThisRound.push(normalizePath(normalizedFile.path));
          }
          if (result.kind === "finish") requestedFinish = true;
          toolErrorCount = 0;
        } catch (error: any) {
          toolErrorCount += 1;
          const errorText = String(error?.message || error || "unknown tool error");
          lastRoundToolErrors = `${call.name}:${errorText}`;
          assistantNotes.push(`tool_error:${call.name}:${errorText}`);
          toolHistoryMessages.push(
            new ToolMessage({
              tool_call_id: String(call.id || `${call.name}_${crypto.randomUUID().slice(0, 8)}`),
              content: `[tool_error:${call.name}] ${errorText}`,
            }),
          );
          if (toolErrorCount >= MAX_TOOL_ERRORS) {
            throw new Error(`skill-tool execution aborted after repeated tool errors: ${errorText}`);
          }
        }
      }

      const dedupedCurrent = dedupeFiles(emittedFiles);
      const stillMissing = missingRequiredFiles(decision, dedupedCurrent);
      const emittedTargetThisRound =
        !objective.strictSingleTarget ||
        objective.targetFiles.some((target) => emittedPathsThisRound.includes(normalizePath(target)));
      const progressed = (emittedThisRound > 0 || stillMissing.length < missing.length) && emittedTargetThisRound;
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
        totalSteps: MAX_TOOL_ROUNDS,
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
        onStep: params.onStep,
      });

      if (requestedFinish && stillMissing.length > 0) {
        throw new Error(`finish called before required files were emitted: ${stillMissing.join(", ")}`);
      }
      if (requestedFinish && stillMissing.length === 0) break;
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
      if (roundCalls.length === 0 && stillMissing.length === 0) break;
      if (stillMissing.length === 0 && progressed) break;
    }
  }

  const completedStaticFiles = ensureRequiredFiles({
    decision,
    files: emittedFiles,
    requirementText: requirementWithReferences,
    brandName,
    stylePreset,
  });
  const mergedWorkflowFiles = dedupeFiles([...workflowFiles, ...completedStaticFiles.filter((file) => file.path.endsWith(".md"))]);
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
          actions: [{ text: "Deploy to Cloudflare", payload: "deploy", type: "button" }],
        },
      }),
    ],
    workflow_context: {
      ...(params.state.workflow_context || {}),
      runMode: (params.state.workflow_context as any)?.runMode || "async-task",
      genMode: "skill_native",
      generationMode: "skill-native",
      preferredLocale: decision.locale,
      sourceRequirement: requirementWithReferences,
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
  const actions = [{ text: "Deploy to Cloudflare", payload: "deploy", type: "button" as const }];
  const finalFiles = getStaticArtifactFiles(finalState);
  const finalPages = getPages(finalState);

  await emitSnapshot({
    stepKey: "repair",
    stepIndex: MAX_TOOL_ROUNDS,
    totalSteps: MAX_TOOL_ROUNDS,
    status: "generating:repair",
    locale: decision.locale,
    files: finalFiles as RuntimeWorkflowFile[],
    workflowArtifacts: mergedWorkflowFiles,
    pages: finalPages as Array<{ path: string; html: string }>,
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
  };
}
