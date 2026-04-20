import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { getR2Client } from "../r2.ts";
import type { ChatTaskResult } from "../agent/chat-task-store.ts";
import { completeChatTask, failChatTask, touchChatTaskHeartbeat, updateChatTaskProgress } from "../agent/chat-task-store.ts";
import { extractUiPayload } from "../agent/chat-ui-payload.ts";
import type { AgentState } from "../agent/graph.ts";
import { artifactCounts, collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles, mergeAgentState } from "./artifacts.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { bindRunProviderLockToState, resolveRunProviderRunnerLock, type RunProviderLock } from "./provider-runner.ts";
import { buildLocalDecisionPlan, type ComponentMix, type LocalDecisionPlan, type PageBlueprint } from "./decision-layer.ts";
import { resolveNextRuntimePhase } from "./stages/index.ts";
import { SKILL_RUNTIME_FIXED_PHASES, type SkillRuntimePhase } from "./stages/types.ts";
import {
  loadProjectSkill,
  resolveProjectSkillAlias,
  WEBSITE_GENERATION_SKILL_BUNDLE,
  type ProjectSkillDescriptor,
} from "./project-skill-loader.ts";

type LlmProvider = "aiberm" | "crazyroute";

type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  modelName: string;
};

type StaticArtifactFile = {
  path: string;
  content: string;
  type: string;
};

type WorkflowArtifactFile = {
  path: string;
  content: string;
  type: string;
};

export type SkillRuntimeStepSnapshot = {
  stepKey: string;
  stepIndex: number;
  totalSteps: number;
  status: string;
  files: StaticArtifactFile[];
  workflowArtifacts: WorkflowArtifactFile[];
  pages: Array<{ path: string; html: string }>;
  preferredLocale: "zh-CN" | "en";
};

export type SkillRuntimeExecutionSummary = {
  state: AgentState;
  assistantText: string;
  actions: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  pageCount: number;
  fileCount: number;
  generatedFiles: string[];
  phase: string;
  completedPhases: SkillRuntimePhase[];
  deployedUrl?: string;
};

export type RunSkillRuntimeExecutorParams = {
  state: AgentState;
  timeoutMs: number;
  onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
};

export type SkillRuntimeTaskParams = {
  taskId: string;
  chatId: string;
  inputState: AgentState;
  workerId?: string;
  setSessionState?: (state: AgentState) => void;
  skillId?: string;
};

const WEBSITE_MAIN_SKILL_ID = "website-generation-workflow";
const STAGE_SKILL_SCOPES = {
  workflow: [WEBSITE_MAIN_SKILL_ID, "brainstorming", "writing-plans"],
  styles: [WEBSITE_MAIN_SKILL_ID, "responsive-by-default", "web-image-generator", "web-icon-library"],
  script: [WEBSITE_MAIN_SKILL_ID, "responsive-by-default"],
  page: [WEBSITE_MAIN_SKILL_ID, "responsive-by-default", "section-quality-checklist", "web-image-generator", "web-icon-library"],
  repair: [WEBSITE_MAIN_SKILL_ID, "end-to-end-validation", "verification-before-completion", "visual-qa-mandatory"],
} as const;
type StageSkillScope = keyof typeof STAGE_SKILL_SCOPES;

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizePathToken(value: string): string {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized || "unknown";
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

function guessMimeByPath(filePath: string): string {
  const normalized = String(filePath || "").toLowerCase();
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".css")) return "text/css";
  if (normalized.endsWith(".js")) return "text/javascript";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

function dedupeFiles<T extends { path?: string; content?: string; type?: string }>(files: T[]): StaticArtifactFile[] {
  const byPath = new Map<string, StaticArtifactFile>();
  for (const file of files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    const content = String(file?.content || "");
    byPath.set(normalizedPath, {
      path: normalizedPath,
      content,
      type: String(file?.type || guessMimeByPath(normalizedPath)),
    });
  }
  return Array.from(byPath.values());
}

function classifyErrorCode(message: string): string {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("rate")) return "rate_limit";
  if (normalized.includes("auth") || normalized.includes("unauthorized") || normalized.includes("forbidden")) return "auth";
  if (normalized.includes("network") || normalized.includes("socket") || normalized.includes("econn")) return "network";
  if (normalized.includes("html")) return "html_invalid";
  return "unknown";
}

function extractRequirementText(state: AgentState): string {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    if (msg instanceof HumanMessage || String(msg?.constructor?.name || "") === "HumanMessage") {
      const content = String(msg?.content || "").trim();
      if (content) return content;
    }
  }
  return "";
}

function detectLocale(text: string, preferred?: string): "zh-CN" | "en" {
  const override = String(preferred || "").trim().toLowerCase();
  if (override.startsWith("zh")) return "zh-CN";
  if (override.startsWith("en")) return "en";
  return /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en";
}

function stripMarkdownCodeFences(raw: string): string {
  const text = String(raw || "").trim();
  // Handle trailing whitespace/newlines after closing fence
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)\n```\s*$/);
  if (fenced?.[1]) return fenced[1].trim();
  // Handle case where closing fence is missing (truncated output)
  const openOnly = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)$/);
  if (openOnly?.[1]) return openOnly[1].trim();
  return text;
}

function extractSkillDirectiveSnippet(skill: ProjectSkillDescriptor, maxLen = 2400): string {
  const raw = String(skill?.content || "");
  const noFrontmatter = raw.replace(/^---[\s\S]*?---\s*/m, "");
  const compact = noFrontmatter.replace(/\r\n/g, "\n").trim();
  if (!compact) return "";
  return compact.slice(0, Math.max(300, maxLen));
}

async function resolveWebsiteRuntimeSkill(params: {
  state: AgentState;
  explicitSkillId?: string;
}): Promise<{
  state: AgentState;
  loadedSkill: ProjectSkillDescriptor;
  loadedSkillIds: string[];
  skillDirective: string;
}> {
  const requestedSkillId = String(
    params.explicitSkillId || (params.state.workflow_context as any)?.skillId || WEBSITE_MAIN_SKILL_ID,
  ).trim();
  const loadedSkill = await loadProjectSkill(requestedSkillId);
  if (loadedSkill.id !== WEBSITE_MAIN_SKILL_ID) {
    throw new Error(
      `skill "${loadedSkill.id}" is not supported by website runtime. supported: ${WEBSITE_MAIN_SKILL_ID}`,
    );
  }
  const loadedSkillIds = Array.from(new Set(WEBSITE_GENERATION_SKILL_BUNDLE.map((id) => resolveProjectSkillAlias(id))));
  const skillDirective = extractSkillDirectiveSnippet(loadedSkill);
  const stateWithSkill: AgentState = {
    ...params.state,
    workflow_context: {
      ...(params.state.workflow_context || {}),
      skillId: loadedSkill.id,
      skillDirective,
      loadedSkillIds,
      skillMdPath: loadedSkill.skillMdPath,
    } as any,
  };
  return {
    state: stateWithSkill,
    loadedSkill,
    loadedSkillIds,
    skillDirective,
  };
}

function hasValidHtmlCore(rawHtml: string): boolean {
  const html = String(rawHtml || "");
  if (!html.trim()) return false;
  if (!/<\/head>/i.test(html)) return false;
  if (!/<body[\s>]/i.test(html)) return false;
  // Allow truncated HTML (missing </body> or </html>) — ensureHtmlDocument will patch them
  const hasStyleOpen = /<style[\s>]/i.test(html);
  const hasStyleClose = /<\/style>/i.test(html);
  if (hasStyleOpen && !hasStyleClose) return false;
  return true;
}

function ensureHtmlDocument(rawHtml: string): string {
  let html = stripMarkdownCodeFences(rawHtml).trim();
  if (!html) return "";
  if (!hasValidHtmlCore(html)) return "";
  if (!/<!doctype html>/i.test(html)) {
    html = `<!doctype html>\n${html}`;
  }
  if (!/<html[\s>]/i.test(html)) {
    html = `<html>\n${html}\n</html>`;
  }
  if (!/<body[\s>]/i.test(html)) {
    html = html.replace(/<\/head>/i, "</head>\n<body>") + "\n</body>";
  }
  if (!/<\/body>/i.test(html)) html = `${html}\n</body>`;
  if (!/<\/html>/i.test(html)) html = `${html}\n</html>`;
  if (!/href=["']\/styles\.css["']/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/styles.css" />\n</head>`);
    }
  }
  if (!/src=["']\/script\.js["']/i.test(html)) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `  <script src="/script.js"></script>\n</body>`);
    }
  }
  return html;
}

function createModelForProvider(config: ProviderConfig, timeoutMs: number, maxTokens: number, temperature = 0.2): ChatOpenAI {
  const model = new ChatOpenAI({
    modelName: config.modelName,
    openAIApiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    },
    timeout: timeoutMs,
    maxRetries: Number(process.env.LLM_MAX_RETRIES || 0),
    temperature,
    ...(Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? { maxTokens: Number(maxTokens) } : {}),
  });
  if (config.provider === "aiberm") {
    (model as any).topP = undefined;
  }
  return model;
}

function resolveProviderConfig(lock: RunProviderLock): ProviderConfig {
  if (lock.provider === "aiberm") {
    return {
      provider: "aiberm",
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName: String(lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL || "openai/gpt-5.3-codex"),
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
        "openai/gpt-5.3-codex",
    ),
  };
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

function buildNav(routes: string[], locale: "zh-CN" | "en"): Array<{ label: string; href: string }> {
  return routes.map((route) => ({ label: extractPageTitleForRoute(route, locale), href: normalizePath(route) }));
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

function buildNavFromDecision(plan: LocalDecisionPlan): Array<{ label: string; href: string }> {
  return plan.routes.map((route) => {
    const page = findPageBlueprint(plan, route);
    return { label: page.navLabel, href: normalizePath(route) };
  });
}

function renderLocalTaskPlan(params: {
  routes: string[];
  locale: "zh-CN" | "en";
  provider: string;
  model: string;
  decision: LocalDecisionPlan;
}): string {
  const lines = [
    "# Task Plan",
    "",
    `- Locale: ${params.locale}`,
    `- Provider: ${params.provider}`,
    `- Model: ${params.model}`,
    `- Routes: ${params.routes.join(", ")}`,
    "",
    "## Phase A (Local Decision Plan)",
    blueprintDigest(params.decision),
    "",
    "## Fixed Order",
    "1. task_plan.md",
    "2. findings.md",
    "3. DESIGN.md",
    "4. styles.css",
    "5. script.js",
    "6. index.html",
    "7. remaining pages",
    "8. repair",
  ];
  return lines.join("\n");
}

function renderLocalFindings(requirementText: string, decision: LocalDecisionPlan): string {
  const summary = String(requirementText || "").trim().slice(0, 2000);
  return ["# Findings", "", "## Input Prompt", summary || "(empty)", "", "## Phase A Decisions", blueprintDigest(decision)].join(
    "\n",
  );
}

function renderLocalDesign(requirementText: string, locale: "zh-CN" | "en", decision: LocalDecisionPlan): string {
  const langLine = locale === "zh-CN" ? "中文为主，工业风，高对比。" : "Primary language: English. Industrial, high-contrast visual system.";
  return [
    "# DESIGN",
    "",
    langLine,
    "",
    "## Tokens",
    "- Primary: #1F2937",
    "- Accent: #F59E0B",
    "- Background: #F3F4F6",
    "- Font stack: Inter, Segoe UI, system-ui, sans-serif",
    "",
    "## Prompt Excerpt",
    String(requirementText || "").trim().slice(0, 1600) || "(empty)",
    "",
    "## Page Blueprints",
    blueprintDigest(decision),
  ].join("\n");
}

function renderLocalStyles(): string {
  return [
    ":root {",
    "  --bg: #f3f4f6;",
    "  --fg: #111827;",
    "  --muted: #6b7280;",
    "  --primary: #1f2937;",
    "  --accent: #f59e0b;",
    "}",
    "* { box-sizing: border-box; }",
    "body { margin: 0; font-family: Inter, 'Segoe UI', system-ui, sans-serif; color: var(--fg); background: var(--bg); }",
    "a { color: inherit; text-decoration: none; }",
    ".container { width: min(1200px, 92vw); margin: 0 auto; }",
    "header { background: var(--primary); color: #fff; position: sticky; top: 0; z-index: 10; }",
    ".nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; gap: 20px; }",
    ".nav-links { display: flex; gap: 14px; flex-wrap: wrap; }",
    ".hero { padding: 70px 0 40px; }",
    ".hero h1 { margin: 0 0 12px; font-size: clamp(28px, 4vw, 48px); line-height: 1.15; }",
    ".hero p { color: var(--muted); max-width: 70ch; }",
    ".btn { display: inline-block; border: 0; border-radius: 10px; padding: 12px 16px; font-weight: 700; cursor: pointer; }",
    ".btn-primary { background: var(--accent); color: #111827; }",
    ".grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }",
    ".card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; box-shadow: 0 6px 22px rgba(17,24,39,.06); }",
    "footer { margin-top: 50px; background: #111827; color: #fff; padding: 26px 0; }",
    "form { display: grid; gap: 10px; }",
    "input, textarea, select { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }",
    "@media (max-width: 780px) { .hero { padding-top: 40px; } }",
  ].join("\n");
}

function renderLocalScript(): string {
  return [
    "(function () {",
    "  const year = document.querySelector('[data-year]');",
    "  if (year) year.textContent = String(new Date().getFullYear());",
    "})();",
  ].join("\n");
}

function renderLocalPage(params: { route: string; decision: LocalDecisionPlan; requirementText: string }): string {
  const { route, decision, requirementText } = params;
  const locale = decision.locale;
  const blueprint = findPageBlueprint(decision, route);
  const nav = buildNavFromDecision(decision)
    .map((item) => `<a href=\"${item.href === "/" ? "/" : item.href + "/"}\">${item.label}</a>`)
    .join("");
  const title = extractPageTitleForRoute(route, locale);
  const isContact = normalizePath(route) === "/contact";
  const skeletonHtml = blueprint.contentSkeleton.map((section) => `<li>${section}</li>`).join("");
  const mixText = formatComponentMix(blueprint.componentMix);
  const body = isContact
    ? `<section class="card"><h2>${locale === "zh-CN" ? "快速询价" : "Quick Quote"}</h2><form><input placeholder="Name" /><input placeholder="Company" /><input placeholder="Email" /><input placeholder="WhatsApp" /><input placeholder="Machine Model" /><input placeholder="Quantity" /><input placeholder="Deadline" /><button class="btn btn-primary" type="submit">${locale === "zh-CN" ? "提交" : "Submit"}</button></form><p>${blueprint.responsibility}</p></section>`
    : `<section class="card"><h2>${title}</h2><p>${String(requirementText || "").slice(0, 420)}</p><p><strong>Page Responsibility:</strong> ${blueprint.responsibility}</p><p><strong>Component Mix:</strong> ${mixText}</p><ul>${skeletonHtml}</ul></section>`;

  return ensureHtmlDocument(`<!doctype html>
<html lang="${locale === "zh-CN" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header><div class="container nav"><strong>LC-CNC™</strong><nav class="nav-links">${nav}</nav></div></header>
  <main class="container hero">
    <h1>${title}</h1>
    <p>${locale === "zh-CN" ? "工业风静态站点页面" : "Industrial static site page"}</p>
    ${body}
  </main>
  <footer><div class="container">© <span data-year></span> LC-CNC</div></footer>
  <script src="/script.js"></script>
</body>
</html>`);
}

function toProjectIdSlug(name: string): string {
  return String(name || "site")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
}

function isAssistantFailureSemantic(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("skill-runtime failed") || normalized.includes("generation failed");
}

async function persistStepArtifacts(params: {
  chatId: string;
  taskId: string;
  snapshot: SkillRuntimeStepSnapshot;
}): Promise<{ localDir: string; r2Prefix?: string; r2UploadedCount: number; r2Error?: string }> {
  const { chatId, taskId, snapshot } = params;
  const stepSlug = `${String(snapshot.stepIndex).padStart(3, "0")}-${sanitizePathToken(snapshot.stepKey)}`;
  const baseDir = path.resolve(
    process.cwd(),
    ".tmp",
    "chat-tasks",
    sanitizePathToken(chatId),
    sanitizePathToken(taskId),
    "steps",
    stepSlug,
  );
  await fs.mkdir(baseDir, { recursive: true });
  const manifest = {
    savedAt: nowIso(),
    stepKey: snapshot.stepKey,
    stepIndex: snapshot.stepIndex,
    totalSteps: snapshot.totalSteps,
    status: snapshot.status,
    preferredLocale: snapshot.preferredLocale,
    fileCount: snapshot.files.length,
    workflowFileCount: snapshot.workflowArtifacts.length,
    pageCount: snapshot.pages.length,
  };
  await fs.writeFile(path.join(baseDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.mkdir(path.join(baseDir, "site"), { recursive: true });
  await fs.mkdir(path.join(baseDir, "workflow"), { recursive: true });
  for (const file of snapshot.files) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const abs = path.join(baseDir, "site", rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, String(file.content || ""), "utf8");
  }
  for (const file of snapshot.workflowArtifacts) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const abs = path.join(baseDir, "workflow", rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, String(file.content || ""), "utf8");
  }

  let r2Prefix: string | undefined;
  let r2UploadedCount = 0;
  let r2Error: string | undefined;
  try {
    const r2 = getR2Client();
    if (r2.isConfigured()) {
      r2Prefix = `chat-tasks/${sanitizePathToken(chatId)}/${sanitizePathToken(taskId)}/steps/${stepSlug}`;
      await r2.putJson(`${r2Prefix}/manifest.json`, manifest);
      r2UploadedCount += 1;
      await r2.putJson(
        `${r2Prefix}/index.json`,
        {
          files: snapshot.files.map((file) => file.path),
          workflowFiles: snapshot.workflowArtifacts.map((file) => file.path),
          pages: snapshot.pages.map((page) => page.path),
        },
      );
      r2UploadedCount += 1;

      for (const file of snapshot.files) {
        const rel = String(file.path || "").replace(/^\/+/, "");
        if (!rel) continue;
        await r2.putObject(`${r2Prefix}/site/${rel}`, String(file.content || ""), {
          contentType: file.type || guessMimeByPath(file.path),
        });
        r2UploadedCount += 1;
      }

      for (const file of snapshot.workflowArtifacts) {
        const rel = String(file.path || "").replace(/^\/+/, "");
        if (!rel) continue;
        await r2.putObject(`${r2Prefix}/workflow/${rel}`, String(file.content || ""), {
          contentType: file.type || guessMimeByPath(file.path),
        });
        r2UploadedCount += 1;
      }

      for (const page of snapshot.pages) {
        const pageKey = routeToHtmlPath(page.path).replace(/^\/+/, "");
        if (!pageKey) continue;
        await r2.putObject(`${r2Prefix}/pages/${pageKey}`, String(page.html || ""), {
          contentType: "text/html",
        });
        r2UploadedCount += 1;
      }
    }
  } catch (error: any) {
    r2Error = String(error?.message || error || "r2-upload-failed");
  }
  return { localDir: baseDir, r2Prefix, r2UploadedCount, r2Error };
}

type RuntimeContext = {
  decision: LocalDecisionPlan;
  requirementText: string;
  locale: "zh-CN" | "en";
  routes: string[];
  providerLock: RunProviderLock;
  providerConfig: ProviderConfig;
  skillId: string;
  enabledSkillIds: string[];
};

class NativeSkillRuntime {
  private readonly context: RuntimeContext;
  private readonly onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  private readonly timeoutMs: number;
  private readonly totalSteps: number;
  private stepIndex = 0;
  private files: StaticArtifactFile[];
  private workflowFiles: WorkflowArtifactFile[];
  private pages: Array<{ path: string; html: string }>;
  private readonly requirementText: string;
  private readonly skillDirectiveCache = new Map<string, string>();

  constructor(params: {
    state: AgentState;
    timeoutMs: number;
    onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  }) {
    const decision = buildLocalDecisionPlan(params.state);
    const routes = Array.from(
      new Set((Array.isArray(params.state.sitemap) && params.state.sitemap.length > 0 ? params.state.sitemap : decision.routes).map((x) => normalizePath(String(x || "/")))),
    );
    const requirementText = decision.requirementText || extractRequirementText(params.state);
    const locale = detectLocale(requirementText, (params.state as any)?.workflow_context?.preferredLocale);
    const providerLock = resolveRunProviderRunnerLock({
      provider: (params.state as any)?.workflow_context?.lockedProvider,
      model: (params.state as any)?.workflow_context?.lockedModel,
    });
    const providerConfig = resolveProviderConfig(providerLock);
    const skillId = resolveProjectSkillAlias(
      String((params.state as any)?.workflow_context?.skillId || WEBSITE_MAIN_SKILL_ID),
    );
    const enabledSkillIds = Array.isArray((params.state as any)?.workflow_context?.loadedSkillIds)
      ? ((params.state as any)?.workflow_context?.loadedSkillIds || []).map((id: string) => String(id).trim()).filter(Boolean)
      : [skillId];
    const existingStatic = dedupeFiles((params.state as any)?.site_artifacts?.staticSite?.files || []);
    const existingWorkflow = dedupeFiles((params.state as any)?.site_artifacts?.workflowArtifacts?.files || []);
    const existingPages = Array.isArray((params.state as any)?.site_artifacts?.pages)
      ? ((params.state as any).site_artifacts.pages || [])
          .map((page: any) => ({ path: normalizePath(String(page?.path || "/")), html: ensureHtmlDocument(String(page?.html || "")) }))
          .filter((page: any) => !!page.path && !!page.html)
      : [];

    this.context = {
      decision,
      requirementText,
      locale,
      routes,
      providerLock,
      providerConfig,
      skillId,
      enabledSkillIds,
    };
    this.requirementText = requirementText;
    this.files = existingStatic;
    this.workflowFiles = existingWorkflow;
    this.pages = existingPages;
    this.onStep = params.onStep;
    this.timeoutMs = Math.max(30_000, Number(params.timeoutMs || 90_000));
    this.totalSteps = 6 + routes.length;
  }

  private getFile(pathName: string): StaticArtifactFile | undefined {
    const normalized = normalizePath(pathName);
    return this.files.find((f) => normalizePath(f.path) === normalized);
  }

  private setFile(pathName: string, content: string, type = guessMimeByPath(pathName)) {
    const normalized = normalizePath(pathName);
    const next: StaticArtifactFile = { path: normalized, content: String(content || ""), type };
    this.files = dedupeFiles([...this.files.filter((f) => normalizePath(f.path) !== normalized), next]);
  }

  private setWorkflowFile(pathName: string, content: string) {
    const normalized = normalizePath(pathName);
    const next: WorkflowArtifactFile = { path: normalized, content: String(content || ""), type: guessMimeByPath(pathName) };
    this.workflowFiles = dedupeFiles([...this.workflowFiles.filter((f) => normalizePath(f.path) !== normalized), next]);
  }

  private setPage(route: string, html: string) {
    const normalizedRoute = normalizePath(route);
    const next = { path: normalizedRoute, html: ensureHtmlDocument(html) };
    this.pages = [...this.pages.filter((p) => normalizePath(p.path) !== normalizedRoute), next];
    this.setFile(routeToHtmlPath(normalizedRoute), next.html, "text/html");
  }

  private async emit(stepKey: string, status: string) {
    if (!this.onStep) return;
    await this.onStep({
      stepKey,
      stepIndex: this.stepIndex,
      totalSteps: this.totalSteps,
      status,
      files: [...this.files],
      workflowArtifacts: [...this.workflowFiles],
      pages: [...this.pages],
      preferredLocale: this.context.locale,
    });
  }

  private async writeWorkflow(pathName: string, content: string, stageLabel: string) {
    this.setWorkflowFile(pathName, content);
    this.stepIndex += 1;
    await this.emit(pathName, `generating:${stageLabel}`);
  }

  private async writeSite(pathName: string, content: string, stageLabel: string) {
    this.setFile(pathName, content, guessMimeByPath(pathName));
    this.stepIndex += 1;
    await this.emit(pathName, `generating:${stageLabel}`);
  }

  private async invokeLlm(prompt: string, opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number }): Promise<string> {
    const isTestMode = process.env.NODE_ENV === "test";
    if (isTestMode) return "";
    const timeoutMs = Math.max(20_000, Number(opts?.timeoutMs || this.timeoutMs));
    const maxTokens = Math.max(256, Number(opts?.maxTokens || 8192));
    const model = createModelForProvider(this.context.providerConfig, timeoutMs, maxTokens, opts?.temperature ?? 0.2);
    const ai = await invokeModelWithIdleTimeout({
      model,
      messages: [new HumanMessage(prompt)],
      timeoutMs,
      operation: "skill-native-stage",
    });
    return String(ai?.content || "").trim();
  }

  private async loadSkillDirective(skillId: string, maxLen = 900): Promise<string> {
    const resolved = resolveProjectSkillAlias(skillId);
    if (!resolved) return "";
    const cacheKey = `${resolved}:${maxLen}`;
    const cached = this.skillDirectiveCache.get(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const skill = await loadProjectSkill(resolved);
      const snippet = extractSkillDirectiveSnippet(skill, maxLen);
      this.skillDirectiveCache.set(cacheKey, snippet);
      return snippet;
    } catch {
      this.skillDirectiveCache.set(cacheKey, "");
      return "";
    }
  }

  private async buildStageSkillDirective(stage: StageSkillScope): Promise<{ ids: string[]; text: string }> {
    const stageIds = STAGE_SKILL_SCOPES[stage] || [WEBSITE_MAIN_SKILL_ID];
    const allowSet = new Set(this.context.enabledSkillIds.map((id) => resolveProjectSkillAlias(id)));
    const selectedIds = Array.from(
      new Set(stageIds.map((id) => resolveProjectSkillAlias(id)).filter((id) => !!id && allowSet.has(id))),
    );
    const blocks: string[] = [];
    const maxDirectiveChars = Math.max(800, Number(process.env.SKILL_DYNAMIC_DIRECTIVE_MAX_CHARS || 3600));
    let used = 0;
    for (const id of selectedIds) {
      const snippet = await this.loadSkillDirective(id, 900);
      if (!snippet) continue;
      const block = `### ${id}\n${snippet}`;
      if (used > 0 && used + block.length > maxDirectiveChars) break;
      blocks.push(block);
      used += block.length;
    }
    return { ids: selectedIds, text: blocks.join("\n\n") };
  }

  private async ensureTaskPlan() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/task_plan.md");
    if (existing?.content?.trim()) return;
    await this.writeWorkflow("/task_plan.md", renderLocalTaskPlan({
      routes: this.context.routes,
      locale: this.context.locale,
      provider: this.context.providerLock.provider,
      model: this.context.providerLock.model,
      decision: this.context.decision,
    }), "task_plan");
  }

  private async ensureFindings() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/findings.md");
    if (existing?.content?.trim()) return;
    await this.writeWorkflow("/findings.md", renderLocalFindings(this.requirementText, this.context.decision), "findings");
  }

  private async ensureDesign() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/design.md");
    if (existing?.content?.trim()) return;
    await this.writeWorkflow(
      "/DESIGN.md",
      renderLocalDesign(this.requirementText, this.context.locale, this.context.decision),
      "design",
    );
  }

  private async ensureStyles() {
    if (this.getFile("/styles.css")?.content?.trim()) return;
    let css = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("styles");
      const prompt = `Generate a single styles.css for a multi-page industrial website.
Output raw CSS only. No markdown fences.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Locale: ${this.context.locale}
Routes: ${this.context.routes.join(", ")}
Page blueprints:
${blueprintDigest(this.context.decision)}
Requirements:
${this.requirementText.slice(0, 1800)}`;
      css = stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 12000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
      }));
    }
    if (!css.trim()) css = renderLocalStyles();
    await this.writeSite("/styles.css", css, "styles");
  }

  private async ensureScript() {
    if (this.getFile("/script.js")?.content?.trim()) return;
    let js = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("script");
      const prompt = `Generate a single script.js for a multi-page static website.
Output raw JavaScript only. No markdown fences.
Include only small UI helpers.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Locale: ${this.context.locale}
Routes: ${this.context.routes.join(", ")}
Page blueprints:
${blueprintDigest(this.context.decision)}`;
      js = stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 8000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
      }));
    }
    if (!js.trim()) js = renderLocalScript();
    await this.writeSite("/script.js", js, "script");
  }

  private async ensurePage(route: string) {
    const normalizedRoute = normalizePath(route);
    if (this.pages.some((p) => normalizePath(p.path) === normalizedRoute && String(p.html || "").trim())) return;
    const targetPath = routeToHtmlPath(normalizedRoute);
    const blueprint = findPageBlueprint(this.context.decision, normalizedRoute);
    let html = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("page");
      const navLinks = buildNavFromDecision(this.context.decision)
        .map((item) => `${item.label}:${item.href}`)
        .join(", ");
      const prompt = `Generate one complete HTML document for route ${normalizedRoute}.
Output raw HTML only. No markdown.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Must include:
- <!doctype html>, <html>, <head>, <body>
- <link rel="stylesheet" href="/styles.css">
- <script src="/script.js"></script>
- navigation links for routes (${navLinks})
Page responsibility: ${blueprint.responsibility}
Page skeleton: ${blueprint.contentSkeleton.join(" -> ")}
Component mix: ${formatComponentMix(blueprint.componentMix)}
Requirement:
${this.requirementText.slice(0, 2600)}`;
      const modelHtml = await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_PAGE || 16000),
        timeoutMs:
          normalizedRoute === "/"
            ? Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_ROOT_MS || 180000)
            : Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_PAGE_MS || 150000),
      });
      console.log(`[ensurePage] route=${normalizedRoute} llm_output_len=${modelHtml.length} first200=${modelHtml.slice(0, 200).replace(/\n/g, "\\n")}`);
      html = ensureHtmlDocument(modelHtml);
      console.log(`[ensurePage] route=${normalizedRoute} ensureHtmlDocument_len=${html.length}`);
    }
    if (!html.trim()) {
      console.log(`[ensurePage] route=${normalizedRoute} FALLBACK to renderLocalPage`);
      html = renderLocalPage({
        route: normalizedRoute,
        decision: this.context.decision,
        requirementText: this.requirementText,
      });
    }
    this.setPage(normalizedRoute, html);
    this.stepIndex += 1;
    await this.emit(targetPath, `generating:${normalizedRoute === "/" ? "index" : "pages"}`);
  }

  private async repairAllPages() {
    for (const page of [...this.pages]) {
      this.setPage(page.path, ensureHtmlDocument(page.html));
    }
    this.stepIndex += 1;
    await this.emit("repair", "generating:repair");
  }

  private buildSiteArtifacts(baseState: AgentState) {
    const brandName = String((baseState as any)?.site_artifacts?.branding?.name || "LC-CNC").trim() || "LC-CNC";
    const routeToFile: Record<string, string> = {};
    for (const route of this.context.routes) {
      routeToFile[normalizePath(route)] = routeToHtmlPath(route);
    }
    const pages = this.context.routes.map((route) => {
      const normalizedRoute = normalizePath(route);
      const found = this.pages.find((p) => normalizePath(p.path) === normalizedRoute);
      const html = ensureHtmlDocument(
        found?.html ||
          renderLocalPage({
            route: normalizedRoute,
            decision: this.context.decision,
            requirementText: this.requirementText,
          }),
      );
      return {
        path: normalizedRoute,
        seo: {
          title: `${extractPageTitleForRoute(normalizedRoute, this.context.locale)} | ${brandName}`,
          description: `${brandName} ${extractPageTitleForRoute(normalizedRoute, this.context.locale)} page`,
          menuLabel: extractPageTitleForRoute(normalizedRoute, this.context.locale),
          navLabel: extractPageTitleForRoute(normalizedRoute, this.context.locale),
        },
        html,
      };
    });
    const staticFiles = dedupeFiles([
      ...this.files,
      ...pages.map((page) => ({
        path: routeToHtmlPath(page.path),
        content: page.html,
        type: "text/html",
      })),
    ]);
    const workflowFiles = dedupeFiles(this.workflowFiles);

    return {
      projectId: toProjectIdSlug(brandName),
      branding: {
        name: brandName,
        colors: {
          primary: "#1F2937",
          accent: "#F59E0B",
        },
        style: {
          borderRadius: "sm",
          typography: "Inter, Segoe UI, system-ui, sans-serif",
        },
      },
      pages,
      staticSite: {
        mode: "skill-direct",
        generatedAt: nowIso(),
        routeToFile,
        files: staticFiles,
        generation: {
          isComplete: true,
          nextStep: null,
        },
      },
      workflowArtifacts: {
        generatedAt: nowIso(),
        files: workflowFiles,
      },
    };
  }

  async run(baseState: AgentState): Promise<AgentState> {
    await this.ensureTaskPlan();
    await this.ensureFindings();
    await this.ensureDesign();
    await this.ensureStyles();
    await this.ensureScript();
    await this.ensurePage("/");
    for (const route of this.context.routes) {
      if (normalizePath(route) === "/") continue;
      await this.ensurePage(route);
    }
    await this.repairAllPages();

    const siteArtifacts = this.buildSiteArtifacts(baseState);
    const actions = [{ text: "Deploy to Cloudflare", payload: "deploy", type: "button" as const }];
    const finalState: AgentState = {
      ...baseState,
      phase: "end",
      sitemap: this.context.routes,
      site_artifacts: siteArtifacts,
      workflow_context: {
        ...(baseState.workflow_context || {}),
        preferredLocale: this.context.locale,
        generationMode: "skill-native",
        genMode: "skill_native",
        lockedProvider: this.context.providerLock.provider,
        lockedModel: this.context.providerLock.model,
      } as any,
      messages: [
        ...(baseState.messages || []),
        new AIMessage({
          id: crypto.randomUUID(),
          content: "Skill-native static site generated successfully.",
          additional_kwargs: { actions },
        }),
      ],
    };
    return finalState;
  }
}

export async function runSkillRuntimeExecutor(params: RunSkillRuntimeExecutorParams): Promise<SkillRuntimeExecutionSummary> {
  const resolvedSkill = await resolveWebsiteRuntimeSkill({ state: params.state });
  const runtime = new NativeSkillRuntime({
    state: resolvedSkill.state,
    timeoutMs: params.timeoutMs,
    onStep: params.onStep,
  });

  const started = Date.now();
  const nextState = await runtime.run(resolvedSkill.state);
  const elapsedMs = Date.now() - started;
  const { assistantText, actions } = extractUiPayload(nextState);
  const files = getStaticArtifactFiles(nextState);
  const pages = getPages(nextState);
  const generatedFiles = getGeneratedFilePaths(nextState);
  const completedPhases = collectCompletedPhases(nextState);
  if (completedPhases.length === 0 || resolveNextRuntimePhase(nextState)) {
    throw new Error("skill-runtime failed to complete all stages");
  }
  const finalText = String(assistantText || "").trim() || `Skill-native completed in ${elapsedMs}ms.`;

  return {
    state: nextState,
    assistantText: finalText,
    actions: actions || [],
    pageCount: pages.length,
    fileCount: files.length,
    generatedFiles,
    phase: String(nextState.phase || "end"),
    completedPhases: SKILL_RUNTIME_FIXED_PHASES.filter((phase) => completedPhases.includes(phase)),
    deployedUrl: nextState.deployed_url,
  };
}

export class SkillRuntimeExecutor {
  static async runTask(params: SkillRuntimeTaskParams): Promise<void> {
    const { taskId, chatId, inputState, workerId = "worker", setSessionState } = params;
    const startedAt = Date.now();
    const resolvedSkill = await resolveWebsiteRuntimeSkill({
      state: inputState,
      explicitSkillId: params.skillId,
    });
    const { loadedSkill, skillDirective } = resolvedSkill;
    const decision = buildLocalDecisionPlan(inputState);
    const lock = resolveRunProviderRunnerLock({
      provider: (inputState as any)?.workflow_context?.lockedProvider,
      model: (inputState as any)?.workflow_context?.lockedModel,
    });
    const taskTimeoutMs = Math.max(60_000, Number(process.env.CHAT_ASYNC_TASK_TIMEOUT_MS || 900_000));
    let stepCount = 0;

    const stateWithLock = bindRunProviderLockToState(
      {
        ...inputState,
        phase: "skeleton",
        sitemap: decision.routes,
        workflow_context: {
          ...(inputState.workflow_context || {}),
          runMode: "async-task",
          genMode: "skill_native",
          generationMode: "skill-native",
          sourceRequirement: decision.requirementText || (inputState.workflow_context as any)?.sourceRequirement,
          preferredLocale: decision.locale,
          skillId: loadedSkill.id,
          skillDirective,
          skillMdPath: loadedSkill.skillMdPath,
          chatTaskId: taskId,
          chatId,
          workerId,
        } as any,
      },
      lock,
    );

    const checkpointRoot = path.resolve(
      process.cwd(),
      ".tmp",
      "chat-tasks",
      sanitizePathToken(chatId),
      sanitizePathToken(taskId),
    );

    try {
      await touchChatTaskHeartbeat(taskId, workerId);
      await updateChatTaskProgress(taskId, {
        assistantText: "Worker started skill-native runtime.",
        phase: "skeleton",
        progress: {
          stage: "generating:task_plan",
          skillId: loadedSkill.id,
          provider: lock.provider,
          model: lock.model,
          attempt: 1,
          startedAt: nowIso(),
          lastTokenAt: nowIso(),
          elapsedMs: 0,
          round: 0,
          maxRounds: 1,
        } as any,
      });

      const summary = await runSkillRuntimeExecutor({
        state: stateWithLock,
        timeoutMs: taskTimeoutMs,
        onStep: async (snapshot) => {
          stepCount += 1;
          const persisted = await persistStepArtifacts({ chatId, taskId, snapshot });
          await touchChatTaskHeartbeat(taskId, workerId);
          await updateChatTaskProgress(taskId, {
            assistantText: `Skill-native ${snapshot.status}`,
            phase: "skeleton",
            progress: {
              stage: snapshot.status,
              skillId: loadedSkill.id,
              filePath: normalizePath(snapshot.stepKey),
              provider: lock.provider,
              model: lock.model,
              attempt: 1,
              startedAt: new Date(startedAt).toISOString(),
              lastTokenAt: nowIso(),
              elapsedMs: Date.now() - startedAt,
              artifactKey: persisted.r2Prefix || persisted.localDir,
              pageCount: snapshot.pages.length,
              fileCount: snapshot.files.length,
              generatedFiles: snapshot.files.map((file) => normalizePath(file.path)),
              checkpointSaved: true,
              checkpointDir: persisted.localDir,
              r2UploadedCount: persisted.r2UploadedCount,
              r2UploadError: persisted.r2Error || null,
            } as any,
          });
        },
      });

      if (setSessionState) setSessionState(summary.state);
      await fs.mkdir(checkpointRoot, { recursive: true });
      await fs.writeFile(path.join(checkpointRoot, "state.json"), JSON.stringify({
        savedAt: nowIso(),
        phase: summary.phase,
        pageCount: summary.pageCount,
        fileCount: summary.fileCount,
        completedPhases: summary.completedPhases,
      }, null, 2), "utf8");
      await fs.writeFile(path.join(checkpointRoot, "project.json"), JSON.stringify((summary.state as any)?.site_artifacts || null, null, 2), "utf8");

      const elapsedMs = Date.now() - startedAt;
      const mergedResult: ChatTaskResult = {
        assistantText: summary.assistantText,
        actions: summary.actions,
        phase: summary.phase,
        deployedUrl: summary.deployedUrl,
        progress: {
          stage: "done",
          skillId: loadedSkill.id,
          provider: lock.provider,
          model: lock.model,
          attempt: 1,
          startedAt: new Date(startedAt).toISOString(),
          lastTokenAt: nowIso(),
          elapsedMs,
          filePath: summary.generatedFiles[summary.generatedFiles.length - 1],
          pageCount: summary.pageCount,
          fileCount: summary.fileCount,
          generatedFiles: summary.generatedFiles,
          artifactKey: checkpointRoot,
          checkpointSaved: true,
          checkpointDir: checkpointRoot,
          checkpointStatePath: path.join(checkpointRoot, "state.json"),
          checkpointProjectPath: path.join(checkpointRoot, "project.json"),
          round: stepCount,
          maxRounds: stepCount,
        } as any,
      };

      if (summary.phase !== "end" || isAssistantFailureSemantic(summary.assistantText)) {
        await failChatTask(taskId, summary.assistantText || "skill-runtime ended without completion");
        return;
      }

      await completeChatTask(taskId, mergedResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateChatTaskProgress(taskId, {
        assistantText: message,
        progress: {
          stage: "failed",
          skillId: loadedSkill.id,
          provider: lock.provider,
          model: lock.model,
          attempt: 1,
          startedAt: new Date(startedAt).toISOString(),
          lastTokenAt: nowIso(),
          elapsedMs: Date.now() - startedAt,
          errorCode: classifyErrorCode(message),
          artifactKey: checkpointRoot,
        } as any,
      });
      await failChatTask(taskId, message || "skill-runtime task failed");
    }
  }
}
