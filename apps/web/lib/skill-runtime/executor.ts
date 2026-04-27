import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { getR2Client } from "../r2.ts";
import { buildCloudflareBeaconSnippet, CloudflareClient, type CloudflareWebAnalyticsSite } from "../cloudflare.ts";
import { Bundler } from "../bundler.ts";
import { publishCurrentProjectAssets, syncGeneratedProjectAssetsFromSite } from "../project-assets.ts";
import type { ChatTaskPendingEdit, ChatTaskResult } from "../agent/chat-task-store.ts";
import {
  completeChatTask,
  createChatTask,
  failChatTask,
  getChatTask,
  touchChatTaskHeartbeat,
  updateChatTaskProgress,
} from "../agent/chat-task-store.ts";
import { extractUiPayload } from "../agent/chat-ui-payload.ts";
import type { AgentState } from "../agent/graph.ts";
import {
  archiveSiteArtifactsToR2,
  recordDeployment,
  saveProjectState,
  syncProjectCustomDomainOrigin,
  upsertProjectSiteBinding,
} from "../agent/db.ts";
import { loadWorkflowSkillContext, type DesignSkillHit } from "../agent/website-workflow.ts";
import { DEFAULT_STYLE_PRESET, normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";
import { artifactCounts, collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles, mergeAgentState } from "./artifacts.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { bindRunProviderLockToState, resolveRunProviderRunnerLock, type RunProviderLock } from "./provider-runner.ts";
import {
  buildLocalDecisionPlan,
  extractRouteSourceBrief,
  type ComponentMix,
  type LocalDecisionPlan,
  type PageBlueprint,
} from "./decision-layer.ts";
import { SKILL_RUNTIME_FIXED_PHASES, type SkillRuntimePhase } from "./phase-types.ts";
import {
  loadProjectSkill,
  resolveProjectSkillAlias,
  WEBSITE_GENERATION_SKILL_BUNDLE,
  type ProjectSkillDescriptor,
} from "./project-skill-loader.ts";
import { runSkillToolExecutor } from "./skill-tool-executor.ts";
import { validateComponent, type DesignSpec, type ValidationResult } from "../../skills/design-website-generator/tools/component-validator.ts";
import {
  buildContextForPageN,
  buildDesignContext,
  buildPageContext,
  type ColorUsage,
  type DesignContext,
  type HeadingRecord,
  type PageContext,
  type TermRecord,
  type TypoUsage,
} from "../../skills/design-website-generator/tools/context-builder.ts";

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

type WorkflowGuidancePack = {
  selectionCriteria: string;
  sequentialWorkflow: string;
  workflowGuide: string;
  rulesSummary: string;
  designMd: string;
};

type DesignConfirmSnapshot = {
  selectedStyleId: string;
  selectedStyleName: string;
  reason: string;
  colors: Record<string, string>;
  typography: string;
  borderRadius: string;
  overrides: Record<string, unknown>;
};

type PageQaRecord = {
  route: string;
  passed: boolean;
  score: number;
  retries: number;
  errors: string[];
  warnings: string[];
};

const QA_MAX_RETRIES = Math.max(0, Number(process.env.SKILL_QA_MAX_RETRIES || 2));
const QA_MIN_SCORE = Math.max(1, Number(process.env.SKILL_QA_MIN_SCORE || 90));
const PAGE_CONTEXT_MAX_CHARS = Math.max(1200, Number(process.env.SKILL_PAGE_CONTEXT_MAX_CHARS || 6500));
const PAGE_CONTEXT_MAX_PAGES = Math.max(1, Number(process.env.SKILL_PAGE_CONTEXT_MAX_PAGES || 4));
const PAGE_CONTEXT_MAX_TERMS = Math.max(6, Number(process.env.SKILL_PAGE_CONTEXT_MAX_TERMS || 24));
function shouldUseSkillToolMode() {
  if (String(process.env.SKILL_TOOL_FORCE_LOCAL || "").trim() === "1") return false;
  return String(process.env.SKILL_TOOL_MODE || "1").trim() !== "0";
}

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
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("bodytimeouterror") ||
    normalized.includes("body timeout") ||
    normalized.includes("und_err_body_timeout") ||
    normalized.includes("terminated")
  ) return "timeout";
  if (normalized.includes("rate")) return "rate_limit";
  if (normalized.includes("auth") || normalized.includes("unauthorized") || normalized.includes("forbidden")) return "auth";
  if (normalized.includes("network") || normalized.includes("socket") || normalized.includes("econn")) return "network";
  if (normalized.includes("html")) return "html_invalid";
  return "unknown";
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

function isHumanLikeMessage(raw: any): boolean {
  const ctorName = String(raw?.constructor?.name || "").toLowerCase();
  if (ctorName === "humanmessage") return true;

  const role = String(raw?.role || "").toLowerCase();
  if (role === "user" || role === "human") return true;

  const type = String(raw?.type || raw?._getType?.() || "").toLowerCase();
  if (type === "human" || type === "humanmessage") return true;

  const idPath = Array.isArray(raw?.id) ? raw.id.join("/") : String(raw?.id || "");
  return /humanmessage/i.test(idPath);
}

function extractRequirementText(state: AgentState): string {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    if (msg instanceof HumanMessage || isHumanLikeMessage(msg)) {
      const content = extractMessageContent(msg);
      if (content) return content;
    }
  }
  const workflow = toRecord((state as any)?.workflow_context);
  const fallbackCandidates = [
    String(workflow.canonicalPrompt || "").trim(),
    String(workflow.latestUserText || "").trim(),
    String(workflow.requirementAggregatedText || "").trim(),
    String(workflow.sourceRequirement || "").trim(),
  ];
  for (const candidate of fallbackCandidates) {
    if (candidate) return candidate;
  }
  return "";
}

function isDeployConfirmationIntent(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/^deploy(?:\s+now|\s+site)?$/.test(normalized)) return true;
  if (/^(?:部署|发布|上线|确认部署|部署到cloudflare)$/.test(normalized)) return true;
  if (normalized.includes("deploy to cloudflare")) return true;
  if (normalized.includes("deploy cloudflare")) return true;
  if (normalized.includes("部署到cloudflare")) return true;
  if (normalized.includes("部署到 cloudflare")) return true;
  if (normalized.includes("发布到cloudflare")) return true;
  return false;
}

function isProjectLikeArtifact(value: unknown): value is { pages: any[] } {
  return !!value && typeof value === "object" && Array.isArray((value as any).pages);
}

async function readProjectJsonFromPath(filePath: string): Promise<any | undefined> {
  const absPath = path.resolve(String(filePath || ""));
  if (!absPath.toLowerCase().endsWith(".json")) return undefined;
  try {
    const raw = await fs.readFile(absPath, "utf8");
    const parsed = JSON.parse(raw);
    if (isProjectLikeArtifact(parsed)) return parsed;
  } catch {
    // ignore and let caller fallback to other sources
  }
  return undefined;
}

async function resolveDeploySourceProject(state: AgentState): Promise<any | undefined> {
  if (isProjectLikeArtifact((state as any)?.site_artifacts)) return (state as any).site_artifacts;
  if (isProjectLikeArtifact((state as any)?.project_json)) return (state as any).project_json;

  const workflow = toRecord((state as any)?.workflow_context);
  const sourcePathCandidates = [
    String(workflow.deploySourceProjectPath || ""),
    String(workflow.checkpointProjectPath || ""),
    String(workflow.lastCheckpointProjectPath || ""),
  ].filter(Boolean);

  for (const candidate of sourcePathCandidates) {
    const project = await readProjectJsonFromPath(candidate);
    if (project) return project;
  }

  return undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function routePathToHtml(route: string): string {
  const normalized = normalizePath(route);
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
}

function ensureSkillDirectStaticProject(project: any): any {
  const next = cloneJson(project || {});
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  if (String(next?.staticSite?.mode || "") === "skill-direct" && files.length > 0) {
    next.staticSite = {
      ...(next.staticSite || {}),
      mode: "skill-direct",
      files,
    };
    return next;
  }

  const pages = Array.isArray(next?.pages) ? next.pages : [];
  const fromPages = pages
    .map((page: any) => ({
      path: routePathToHtml(String(page?.path || "/")),
      content: String(page?.html || ""),
      type: "text/html",
    }))
    .filter((entry: any) => String(entry.path || "").trim() && String(entry.content || "").trim());

  const mergedFiles = dedupeFiles([...files, ...fromPages]);
  if (mergedFiles.length === 0) {
    throw new Error("Refine source project has no static files to patch.");
  }

  next.staticSite = {
    ...(next.staticSite || {}),
    mode: "skill-direct",
    files: mergedFiles,
  };
  return next;
}

function detectAccentColor(instruction: string): { name: string; hex: string } | undefined {
  const text = String(instruction || "").toLowerCase();
  const hexMatch = text.match(/#([0-9a-f]{3,8})\b/i);
  if (hexMatch?.[0]) {
    return { name: "custom", hex: hexMatch[0] };
  }
  const candidates: Array<{ name: string; hex: string; patterns: RegExp[] }> = [
    { name: "blue", hex: "#2563eb", patterns: [/蓝|blue|indigo|azure/] },
    { name: "green", hex: "#16a34a", patterns: [/绿|green|emerald|mint/] },
    { name: "red", hex: "#dc2626", patterns: [/红|red|crimson/] },
    { name: "orange", hex: "#ea580c", patterns: [/橙|orange|amber/] },
    { name: "purple", hex: "#7c3aed", patterns: [/紫|purple|violet/] },
    { name: "black", hex: "#111827", patterns: [/黑|black|dark/] },
  ];
  for (const candidate of candidates) {
    if (candidate.patterns.some((re) => re.test(text))) {
      return { name: candidate.name, hex: candidate.hex };
    }
  }
  return undefined;
}

function detectTitleOverride(instruction: string): string | undefined {
  const text = String(instruction || "").trim();
  const patterns = [
    /(?:标题|title)\s*(?:改成|为|:|：)\s*[“"']?([^"”'。！？\n\r]+)[”"']?/i,
    /(?:叫做|命名为)\s*[“"']?([^"”'。！？\n\r]+)[”"']?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = String(match?.[1] || "").trim();
    if (candidate) return candidate.slice(0, 120);
  }
  return undefined;
}

function detectTextReplacement(instruction: string): { from: string; to: string } | undefined {
  const text = String(instruction || "").trim();
  const cn = text.match(/把\s*[“"']?([^"”'，。；;]+)[”"']?\s*改成\s*[“"']?([^"”'，。；;\n\r]+)[”"']?/i);
  if (cn?.[1] && cn?.[2]) {
    const from = String(cn[1]).trim();
    const to = String(cn[2]).trim();
    if (from && to && from !== to) return { from, to };
  }
  const en = text.match(/replace\s+[“"']?([^"”']+)[”"']?\s+with\s+[“"']?([^"”'\n\r]+)[”"']?/i);
  if (en?.[1] && en?.[2]) {
    const from = String(en[1]).trim();
    const to = String(en[2]).trim();
    if (from && to && from !== to) return { from, to };
  }
  return undefined;
}

function syncPagesFromStaticFiles(project: any): any {
  const next = cloneJson(project || {});
  const staticFiles = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const pagesByRoute = new Map<string, { path: string; html: string }>();
  const existingPages = Array.isArray(next?.pages) ? next.pages : [];
  for (const page of existingPages) {
    const route = normalizePath(String(page?.path || "/"));
    pagesByRoute.set(route, {
      path: route,
      html: String(page?.html || ""),
    });
  }

  for (const file of staticFiles) {
    const filePath = normalizePath(String(file.path || ""));
    if (!filePath.toLowerCase().endsWith(".html")) continue;
    const route = filePath === "/index.html" ? "/" : normalizePath(filePath.replace(/\/index\.html$/i, ""));
    pagesByRoute.set(route, {
      path: route,
      html: String(file.content || ""),
    });
  }

  next.pages = Array.from(pagesByRoute.values()).sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });
  return next;
}

function injectCloudflareAnalyticsBeacon(project: any, siteTag: string): any {
  const normalizedTag = String(siteTag || "").trim();
  if (!normalizedTag) return project;

  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const snippet = buildCloudflareBeaconSnippet(normalizedTag);

  const injectedFiles = files.map((file) => {
    const mime = String(file.type || "").toLowerCase();
    const filePath = String(file.path || "").toLowerCase();
    if (!(mime.includes("html") || filePath.endsWith(".html") || filePath.endsWith(".htm"))) {
      return file;
    }

    const original = String(file.content || "");
    const normalized = original.replace(
      /<script[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*>[\s\S]*?<\/script>/i,
      snippet,
    );
    if (normalized !== original) {
      return {
        ...file,
        content: normalized,
      };
    }

    if (/<\/body>/i.test(original)) {
      return {
        ...file,
        content: original.replace(/<\/body>/i, `${snippet}\n</body>`),
      };
    }

    return {
      ...file,
      content: `${original}\n${snippet}\n`,
    };
  });

  const withStatic = {
    ...next,
    staticSite: {
      ...(next?.staticSite || {}),
      mode: "skill-direct",
      files: injectedFiles,
    },
  };
  return syncPagesFromStaticFiles(withStatic);
}

function applyRefineInstructionToProject(project: any, instruction: string): { project: any; changedFiles: string[] } {
  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const changed = new Set<string>();
  const accent = detectAccentColor(instruction);
  const titleOverride = detectTitleOverride(instruction);
  const textReplacement = detectTextReplacement(instruction);

  const updatedFiles = files.map((file) => {
    const nextFile = { ...file };
    const lowerPath = String(nextFile.path || "").toLowerCase();
    if (lowerPath.endsWith(".css") && accent) {
      const refineCss = [
        "",
        `/* refine-runtime-accent: ${accent.name} */`,
        `:root { --refine-accent: ${accent.hex}; --shp-primary: var(--refine-accent); }`,
        "a, .btn, button, .cta, .primary { color: var(--refine-accent); border-color: color-mix(in oklab, var(--refine-accent) 45%, transparent); }",
        ".btn-primary, .cta-primary, button.primary { background: var(--refine-accent); color: #fff; }",
      ].join("\n");
      nextFile.content = `${String(nextFile.content || "").trimEnd()}\n${refineCss}\n`;
      changed.add(nextFile.path);
    }

    if (lowerPath.endsWith(".html")) {
      const before = String(nextFile.content || "");
      let after = before;
      if (titleOverride) {
        const withTitleTag = after.replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleOverride}</title>`);
        after = withTitleTag;
        if (withTitleTag === before) {
          const withH1 = after.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${titleOverride}</h1>`);
          after = withH1;
        }
      }
      if (textReplacement && textReplacement.from) {
        const escaped = textReplacement.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replacementPattern = new RegExp(escaped, "g");
        after = after.replace(replacementPattern, textReplacement.to);
      }
      if (after !== before) {
        nextFile.content = after;
        changed.add(nextFile.path);
      }
    }

    return nextFile;
  });

  const withStatic = {
    ...next,
    staticSite: {
      ...(next.staticSite || {}),
      mode: "skill-direct",
      files: updatedFiles,
      generation: {
        ...((next.staticSite || {}).generation || {}),
        refinedAt: nowIso(),
        refineInstruction: String(instruction || "").slice(0, 400),
      },
    },
  };
  const withSyncedPages = syncPagesFromStaticFiles(withStatic);
  withSyncedPages.staticSite = {
    ...(next.staticSite || {}),
    mode: "skill-direct",
    files: updatedFiles,
    generation: {
      ...((next.staticSite || {}).generation || {}),
      refinedAt: nowIso(),
      refineInstruction: String(instruction || "").slice(0, 400),
    },
  };

  return {
    project: withSyncedPages,
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
}

function applyDeterministicRefineFixups(
  project: any,
  instruction: string,
): { project: any; changedFiles: string[] } {
  const normalizedInstruction = String(instruction || "").trim();
  if (!normalizedInstruction) {
    return { project, changedFiles: [] };
  }

  const hasDeleteIntent = /(删除|移除|去掉|remove|delete)/i.test(normalizedInstruction);
  const removeMenuButton =
    hasDeleteIntent &&
    /(menu|菜单|导航栏)/i.test(normalizedInstruction);

  const literalTargets = new Set<string>();
  if (/for enterprise and saas teams/i.test(normalizedInstruction)) {
    literalTargets.add("For enterprise and SaaS teams");
  }
  const quotedPatterns = [
    /[“"']([^“”"'\n\r]{2,120})[”"']/g,
    /删除\s*([A-Za-z][A-Za-z0-9 .&/+-]{3,120})/gi,
  ];
  for (const pattern of quotedPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedInstruction))) {
      const candidate = String(match[1] || "").trim();
      if (!candidate) continue;
      if (/^(menu|菜单)$/i.test(candidate)) continue;
      literalTargets.add(candidate);
    }
  }

  if (!removeMenuButton && literalTargets.size === 0) {
    return { project, changedFiles: [] };
  }

  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const changed = new Set<string>();

  const updatedFiles = files.map((file) => {
    const lowerPath = String(file.path || "").toLowerCase();
    if (!lowerPath.endsWith(".html")) return file;

    const before = String(file.content || "");
    let after = before;

    if (removeMenuButton) {
      after = after.replace(/<button[\s\S]*?data-nav-toggle[\s\S]*?<\/button>\s*/gi, "");
      after = after.replace(/<button[\s\S]*?>\s*Menu\s*<\/button>\s*/gi, "");
    }

    for (const target of literalTargets) {
      if (!target) continue;
      after = after.split(target).join("");
    }
    after = after.replace(/<span class="eyebrow">\s*<\/span>\s*/gi, "");
    after = after.replace(/\n{3,}/g, "\n\n");

    if (after !== before) {
      changed.add(file.path);
      return { ...file, content: after };
    }
    return file;
  });

  if (changed.size === 0) {
    return { project, changedFiles: [] };
  }

  const withStatic = {
    ...next,
    staticSite: {
      ...(next.staticSite || {}),
      mode: "skill-direct",
      files: updatedFiles,
      generation: {
        ...((next.staticSite || {}).generation || {}),
        refinedAt: nowIso(),
        refineInstruction: normalizedInstruction.slice(0, 400),
        refineMode: "visual-skill+deterministic-fixup",
      },
    },
  };
  const withSyncedPages = syncPagesFromStaticFiles(withStatic);
  return {
    project: withSyncedPages,
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
}

type RefineSkillEdit = {
  path: string;
  content: string;
  reason?: string;
};

function parseJsonFromLlmText(raw: string): any | undefined {
  const text = String(raw || "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function normalizeRefineSkillEdits(rawEdits: unknown, allowedPaths: Set<string>): RefineSkillEdit[] {
  if (!Array.isArray(rawEdits)) return [];
  const edits: RefineSkillEdit[] = [];
  const seen = new Set<string>();
  for (const row of rawEdits) {
    const normalizedPath = normalizePath(String((row as any)?.path || ""));
    const content = String((row as any)?.content || "");
    const reason = String((row as any)?.reason || "").trim();
    if (!normalizedPath || !allowedPaths.has(normalizedPath)) continue;
    if (!content.trim()) continue;
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    edits.push({
      path: normalizedPath,
      content,
      ...(reason ? { reason } : {}),
    });
  }
  return edits;
}

async function applyRefineInstructionWithSkill(params: {
  project: any;
  instruction: string;
  skillDirective: string;
  providerConfig: ProviderConfig;
  timeoutMs: number;
}): Promise<{ project: any; changedFiles: string[]; summary?: string }> {
  const normalizedInstruction = String(params.instruction || "").trim();
  if (!normalizedInstruction) {
    return { project: params.project, changedFiles: [] };
  }

  const next = ensureSkillDirectStaticProject(params.project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  if (files.length === 0) {
    return { project: next, changedFiles: [] };
  }

  const fileContext = files
    .map((file) => ({
      path: normalizePath(String(file.path || "")),
      type: String(file.type || guessMimeByPath(String(file.path || ""))),
      content: String(file.content || ""),
    }))
    .filter((file) => !!file.path)
    .slice(0, 12)
    .map((file) => ({
      ...file,
      content: file.content.slice(0, 24_000),
    }));

  const allowedPaths = new Set(fileContext.map((file) => file.path));
  const model = createModelForProvider(
    params.providerConfig,
    Math.max(25_000, Number(params.timeoutMs || 90_000)),
    Math.max(1200, Number(process.env.CHAT_REFINE_MAX_TOKENS || 6000)),
    0.15,
  );

  const systemPrompt = [
    "You are a senior frontend refinement engineer.",
    "Apply visual/code refinements to an existing static website project.",
    "Return strict JSON only.",
    "Never output markdown fences.",
  ].join(" ");

  const userPrompt = [
    "Task: apply the user refine request to existing files.",
    "",
    "User refine request:",
    normalizedInstruction,
    "",
    "Skill directive (must follow):",
    params.skillDirective || "(none)",
    "",
    "Current files (path + full content):",
    JSON.stringify(fileContext, null, 2),
    "",
    "Output JSON schema:",
    "{",
    '  "summary": "short string",',
    '  "edits": [',
    '    { "path": "/index.html", "content": "<full updated file content>", "reason": "what changed" }',
    "  ]",
    "}",
    "",
    "Rules:",
    "- Output full file content for each edited file (not patch).",
    "- Only edit files that are truly needed.",
    "- Keep HTML/CSS/JS valid and production-safe.",
    "- For deletion requests, remove the exact target text/element instead of adding comments.",
    "- If request says remove menu button, remove the corresponding button/trigger from nav markup and related JS hooks when needed.",
  ].join("\n");

  const ai = await invokeModelWithIdleTimeout({
    model,
    messages: [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
    timeoutMs: Math.max(25_000, Number(params.timeoutMs || 90_000)),
    operation: "refine-skill",
  });
  const raw = String(ai?.content || "").trim();
  const parsed = parseJsonFromLlmText(raw);
  const edits = normalizeRefineSkillEdits(parsed?.edits, allowedPaths);
  if (edits.length === 0) {
    return {
      project: next,
      changedFiles: [],
      summary: String(parsed?.summary || "").trim(),
    };
  }

  const fileMap = new Map(
    files.map((file) => [normalizePath(String(file.path || "")), { ...file }]),
  );
  const changed = new Set<string>();
  for (const edit of edits) {
    const existing = fileMap.get(edit.path);
    if (!existing) continue;
    const before = String(existing.content || "");
    const after = String(edit.content || "");
    if (!after.trim() || before === after) continue;
    fileMap.set(edit.path, {
      ...existing,
      content: after,
      type: String(existing.type || guessMimeByPath(edit.path)),
    });
    changed.add(edit.path);
  }

  const updatedFiles = Array.from(fileMap.values());
  const withStatic = {
    ...next,
    staticSite: {
      ...(next.staticSite || {}),
      mode: "skill-direct",
      files: updatedFiles,
      generation: {
        ...((next.staticSite || {}).generation || {}),
        refinedAt: nowIso(),
        refineInstruction: normalizedInstruction.slice(0, 400),
        refineMode: "visual-skill",
      },
    },
  };
  const withSyncedPages = syncPagesFromStaticFiles(withStatic);

  return {
    project: withSyncedPages,
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
    summary: String(parsed?.summary || "").trim() || undefined,
  };
}

async function materializeSiteDirectoryFromProject(project: any, siteDir: string): Promise<{
  fileCount: number;
  generatedFiles: string[];
}> {
  const bundle = await Bundler.createBundle(project);
  await fs.mkdir(siteDir, { recursive: true });
  for (const entry of bundle.fileEntries) {
    const normalizedPath = normalizePath(String(entry.path || ""));
    const relative = normalizedPath.replace(/^\/+/, "");
    const targetPath = path.resolve(siteDir, relative);
    const root = path.resolve(siteDir);
    if (!targetPath.startsWith(root)) {
      throw new Error(`Invalid refine output file path: ${normalizedPath}`);
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, entry.content, "utf8");
  }
  return {
    fileCount: bundle.fileEntries.length,
    generatedFiles: bundle.fileEntries.map((entry) => normalizePath(entry.path)),
  };
}

function toSafeProjectNameToken(value: string, fallback: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 28);
}

function resolveDeployProjectName(project: any, state: AgentState, chatId: string): string {
  const prefix = toSafeProjectNameToken(String(process.env.CLOUDFLARE_PAGES_PROJECT_PREFIX || "shpitto"), "shpitto");
  const brandToken = toSafeProjectNameToken(
    String(project?.branding?.name || project?.projectId || "site"),
    "site",
  );
  const suffixSource = String((state as any)?.user_id || chatId || crypto.randomUUID());
  const suffixToken = toSafeProjectNameToken(sanitizePathToken(suffixSource), "deploy").slice(0, 10);
  const merged = `${prefix}-${brandToken}-${suffixToken}`
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return merged.slice(0, 58);
}

export type DeploySmokeResult = {
  status: "passed" | "failed" | "skipped";
  checks: Array<{ name: string; passed: boolean; message?: string }>;
  url?: string;
};

function isRemoteDeploySmokeEnabled(): boolean {
  if (String(process.env.DEPLOY_SMOKE_DISABLE || "").trim() === "1") return false;
  return Boolean(String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim() && String(process.env.CLOUDFLARE_API_TOKEN || "").trim());
}

function evaluateDeploySmoke(checks: DeploySmokeResult["checks"]): DeploySmokeResult {
  return {
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    checks,
  };
}

function uniqueDeploySmokeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function runPreDeploySmoke(bundle: { manifest: Record<string, string>; fileEntries: Array<{ path?: string; content?: string; type?: string }> }): DeploySmokeResult {
  const entries = Array.isArray(bundle.fileEntries) ? bundle.fileEntries : [];
  const byPath = new Map(entries.map((entry) => [normalizePath(String(entry.path || "")), entry]));
  const htmlEntries = entries.filter((entry) => normalizePath(String(entry.path || "")).endsWith(".html"));
  const checks: DeploySmokeResult["checks"] = [
    {
      name: "bundle_has_files",
      passed: entries.length > 0,
      message: `${entries.length} file(s) in bundle`,
    },
    {
      name: "index_html_exists",
      passed: byPath.has("/index.html"),
      message: "Root index.html must exist",
    },
    {
      name: "html_documents_valid",
      passed:
        htmlEntries.length > 0 &&
        htmlEntries.every((entry) => {
          const html = String(entry.content || "");
          return /<!doctype html>|<html[\s>]/i.test(html) && /<body[\s>]/i.test(html);
        }),
      message: `${htmlEntries.length} HTML file(s) checked`,
    },
    {
      name: "local_assets_present",
      passed: htmlEntries.every((entry) => {
        const html = String(entry.content || "");
        const refs = Array.from(html.matchAll(/\b(?:href|src)=["']\/(styles\.css|script\.js)["']/gi)).map((match) =>
          normalizePath(match[1] || ""),
        );
        return refs.every((ref) => byPath.has(ref));
      }),
      message: "Root CSS/JS references resolve inside bundle",
    },
  ];
  return evaluateDeploySmoke(checks);
}

async function fetchPostDeploySmokeCandidate(url: string, timeoutMs: number): Promise<DeploySmokeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "shpitto-deploy-smoke/1.0" },
    });
    const text = await res.text().catch(() => "");
    const result = evaluateDeploySmoke([
      {
        name: "http_status",
        passed: res.status >= 200 && res.status < 400,
        message: `HTTP ${res.status} at ${url}`,
      },
      {
        name: "html_body",
        passed: /<body[\s>]/i.test(text),
        message: `Response should contain an HTML body at ${url}`,
      },
    ]);
    return { ...result, url };
  } catch (error) {
    return {
      status: "failed",
      url,
      checks: [
        {
          name: "remote_fetch",
          passed: false,
          message: `${url}: ${String((error as any)?.message || error || "fetch failed")}`,
        },
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPostDeploySmoke(
  url: string,
  options: { fallbackUrls?: string[]; maxAttempts?: number; retryMs?: number } = {},
): Promise<DeploySmokeResult> {
  const target = String(url || "").trim();
  if (!target) {
    return { status: "failed", checks: [{ name: "url_present", passed: false, message: "Deployment URL is empty" }] };
  }
  if (!isRemoteDeploySmokeEnabled()) {
    return {
      status: "skipped",
      checks: [{ name: "remote_fetch", passed: true, message: "Skipped because Cloudflare credentials are not configured" }],
      url: target,
    };
  }
  const candidates = uniqueDeploySmokeUrls([target, ...(options.fallbackUrls || [])]);
  const maxAttempts = Math.max(1, Number(options.maxAttempts || process.env.DEPLOY_SMOKE_MAX_ATTEMPTS || 8));
  const retryMs = Math.max(0, Number(options.retryMs ?? process.env.DEPLOY_SMOKE_RETRY_MS ?? 5_000));
  const timeoutMs = Math.max(2_000, Number(process.env.DEPLOY_SMOKE_TIMEOUT_MS || 15_000));

  let lastResult: DeploySmokeResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const candidate of candidates) {
      const result = await fetchPostDeploySmokeCandidate(candidate, timeoutMs);
      if (result.status === "passed") {
        return result;
      }
      lastResult = {
        ...result,
        checks: result.checks.map((check) => ({
          ...check,
          message: `${check.message || "failed"} (attempt ${attempt}/${maxAttempts})`,
        })),
      };
    }
    if (attempt < maxAttempts && retryMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  return (
    lastResult || {
      status: "failed",
      checks: [{ name: "remote_fetch", passed: false, message: "No deployment URL candidates were available" }],
    }
  );
}

function detectLocale(text: string, preferred?: string): "zh-CN" | "en" {
  const override = String(preferred || "").trim().toLowerCase();
  if (override.startsWith("zh")) return "zh-CN";
  if (override.startsWith("en")) return "en";
  return /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en";
}

function extractStateMessageText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((message: any) => {
      const content = message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") return part;
            return String(part?.text || part?.content || "");
          })
          .join(" ");
      }
      return String(content || "");
    })
    .join("\n");
}

function buildDomainConfigurationGuidance(params: {
  liveUrl: string;
  deploymentHost: string;
  locale: "zh-CN" | "en";
}): string {
  const liveHost = (() => {
    try {
      return new URL(params.liveUrl).host;
    } catch {
      return "";
    }
  })();
  const cnameTarget = params.deploymentHost || liveHost || "your-project.pages.dev";
  if (params.locale === "zh-CN") {
    return [
      "## 域名配置指导",
      "",
      "1. 在当前项目的部署预览区点击域名配置入口，或进入 Cloudflare Pages 对应项目的 Custom domains。",
      "2. 添加你的自定义域名，例如 `www.example.com` 或根域名 `example.com`。",
      `3. 如果 DNS 不在 Cloudflare，为 \`www\` 或子域名添加 CNAME，目标填写 \`${cnameTarget}\`。`,
      "4. 如果配置根域名，按 Cloudflare Pages 提示使用 CNAME Flattening，或将 DNS 托管迁移到 Cloudflare。",
      "5. 等待域名状态和 SSL 证书变为 Active 后，打开自定义域名验证站点是否可访问。",
    ].join("\n");
  }
  return [
    "## Domain Configuration Guide",
    "",
    "1. Use the domain configuration entry in the deployment preview area, or open the Cloudflare Pages project and go to Custom domains.",
    "2. Add your custom domain, for example `www.example.com` or the apex domain `example.com`.",
    `3. If DNS is hosted outside Cloudflare, create a CNAME for \`www\` or the subdomain pointing to \`${cnameTarget}\`.`,
    "4. For an apex/root domain, follow Cloudflare Pages guidance for CNAME Flattening or move DNS hosting to Cloudflare.",
    "5. Wait until the domain and SSL certificate are Active, then open the custom domain to verify the site.",
  ].join("\n");
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

function extractSkillDirectiveSnippet(skill: ProjectSkillDescriptor, maxLen = 12000): string {
  const raw = String(skill?.content || "");
  const noFrontmatter = raw.replace(/^---[\s\S]*?---\s*/m, "");
  const compact = noFrontmatter.replace(/\r\n/g, "\n").trim();
  if (!compact) return "";
  if (!Number.isFinite(maxLen) || maxLen <= 0) return compact;
  return compact.slice(0, Math.max(300, maxLen));
}

function clipTextWithBudget(input: string, maxChars: number): string {
  const text = String(input || "").trim();
  if (!text) return "";
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  const markerIndex = text.search(/\n##\s+(?:7\.\s+External Research Addendum|Website Knowledge Profile)\b/i);
  if (markerIndex > 0 && markerIndex < text.length - 200) {
    const headBudget = Math.max(1_000, Math.floor(maxChars * 0.42));
    const sourceBudget = Math.max(600, maxChars - headBudget - 96);
    return [
      text.slice(0, headBudget).trim(),
      "",
      "[Middle omitted due to prompt budget; source addendum preserved below]",
      "",
      text.slice(markerIndex, markerIndex + sourceBudget).trim(),
    ].join("\n");
  }
  const headBudget = Math.max(800, Math.floor(maxChars * 0.58));
  const tailBudget = Math.max(500, maxChars - headBudget - 80);
  return [
    text.slice(0, headBudget).trim(),
    "",
    "[Middle omitted due to prompt budget]",
    "",
    text.slice(-tailBudget).trim(),
  ].join("\n");
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
  const existingWorkflow = ((params.state as any)?.workflow_context || {}) as Record<string, unknown>;
  const hasExistingGuidance =
    String(existingWorkflow.selectionCriteria || "").trim().length > 0 &&
    String(existingWorkflow.sequentialWorkflow || "").trim().length > 0 &&
    String(existingWorkflow.designMd || "").trim().length > 0;

  let styleHit = ((params.state as any)?.design_hit || undefined) as DesignSkillHit | undefined;
  let stylePreset = normalizeStylePreset(existingWorkflow.stylePreset as Partial<DesignStylePreset>, {});
  let guidance = {
    selectionCriteria: String(existingWorkflow.selectionCriteria || ""),
    sequentialWorkflow: String(existingWorkflow.sequentialWorkflow || ""),
    workflowGuide: String(existingWorkflow.workflowGuide || ""),
    rulesSummary: String(existingWorkflow.rulesSummary || ""),
    designMd: String(existingWorkflow.designMd || ""),
  };
  if (!hasExistingGuidance || !styleHit) {
    const requirementText = extractRequirementText(params.state);
    const workflowContext = await loadWorkflowSkillContext(requirementText);
    stylePreset = normalizeStylePreset(workflowContext.stylePreset, {});
    styleHit = workflowContext.hit;
    guidance = {
      selectionCriteria: workflowContext.selectionCriteria,
      sequentialWorkflow: workflowContext.sequentialWorkflow,
      workflowGuide: workflowContext.workflowGuide,
      rulesSummary: workflowContext.rulesSummary,
      designMd: workflowContext.designMd,
    };
  }

  const stateWithSkill: AgentState = {
    ...params.state,
    design_hit: styleHit,
    workflow_context: {
      ...(params.state.workflow_context || {}),
      skillId: loadedSkill.id,
      skillDirective,
      loadedSkillIds,
      skillMdPath: loadedSkill.skillMdPath,
      selectionCriteria: guidance.selectionCriteria,
      sequentialWorkflow: guidance.sequentialWorkflow,
      workflowGuide: guidance.workflowGuide,
      rulesSummary: guidance.rulesSummary,
      designMd: guidance.designMd,
      stylePreset,
      designSystemId: styleHit?.id,
      designSystemName: styleHit?.name,
      designSelectionReason:
        (styleHit?.selection_candidates || []).find((item) => item.id === styleHit?.id)?.reason || styleHit?.design_desc,
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
  if (!/<link\b[^>]*href=["'][^"']*styles\.css(?:[?#][^"']*)?["'][^>]*>/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/styles.css" />\n</head>`);
    }
  }
  if (!/<script\b[^>]*src=["'][^"']*script\.js(?:[?#][^"']*)?["'][^>]*>/i.test(html)) {
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
      modelName: String(lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL || "openai/gpt-5.4-mini"),
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
        "openai/gpt-5.4-mini",
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
        `- ${page.route}\n  navLabel: ${page.navLabel}\n  source: ${page.source}\n  intent: ${page.purpose}`,
    )
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
  const summary = clipTextWithBudget(requirementText, Number(process.env.SKILL_DIRECT_FINDINGS_REQUIREMENT_CHARS || 48_000));
  return ["# Findings", "", "## Input Prompt", summary || "(empty)", "", "## Phase A Decisions", blueprintDigest(decision)].join(
    "\n",
  );
}

function renderLocalDesign(
  requirementText: string,
  locale: "zh-CN" | "en",
  decision: LocalDecisionPlan,
  stylePreset: DesignStylePreset = DEFAULT_STYLE_PRESET,
): string {
  const langLine = locale === "zh-CN" ? "中文为主，工业风，高对比。" : "Primary language: English. Industrial, high-contrast visual system.";
  return [
    "# DESIGN",
    "",
    langLine,
    "",
    "## Tokens",
    `- Primary: ${stylePreset.colors.primary}`,
    `- Accent: ${stylePreset.colors.accent}`,
    `- Background: ${stylePreset.colors.background}`,
    `- Surface: ${stylePreset.colors.surface}`,
    `- Text: ${stylePreset.colors.text}`,
    `- Font stack: ${stylePreset.typography}`,
    "",
    "## Prompt Excerpt",
    String(requirementText || "").trim().slice(0, 1600) || "(empty)",
    "",
    "## Page Blueprints",
    blueprintDigest(decision),
  ].join("\n");
}

function renderLocalStyles(stylePreset: DesignStylePreset = DEFAULT_STYLE_PRESET): string {
  return [
    ":root {",
    `  --bg: ${stylePreset.colors.background.toLowerCase()};`,
    `  --fg: ${stylePreset.colors.text.toLowerCase()};`,
    `  --muted: ${stylePreset.colors.muted.toLowerCase()};`,
    `  --primary: ${stylePreset.colors.primary.toLowerCase()};`,
    `  --accent: ${stylePreset.colors.accent.toLowerCase()};`,
    `  --surface: ${stylePreset.colors.surface.toLowerCase()};`,
    `  --border: ${stylePreset.colors.border.toLowerCase()};`,
    "}",
    "* { box-sizing: border-box; }",
    `body { margin: 0; font-family: ${stylePreset.typography}; color: var(--fg); background: var(--bg); }`,
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
    ".card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; box-shadow: 0 6px 22px rgba(17,24,39,.06); }",
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

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function writeCheckpointFile(rootDir: string, filePath: string, content: string): Promise<string> {
  const rel = String(filePath || "").replace(/^\/+/, "");
  if (!rel) return "";
  const abs = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (!abs.startsWith(root)) {
    throw new Error(`Invalid checkpoint output file path: ${filePath}`);
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return rel;
}

async function persistStepArtifacts(params: {
  chatId: string;
  taskId: string;
  snapshot: SkillRuntimeStepSnapshot;
}): Promise<{
  localDir: string;
  latestDir: string;
  latestSiteDir: string;
  latestWorkflowDir: string;
  changedFiles: string[];
  changedWorkflowFiles: string[];
  r2Prefix?: string;
  r2UploadedCount: number;
  r2Error?: string;
}> {
  const { chatId, taskId, snapshot } = params;
  const stepSlug = `${String(snapshot.stepIndex).padStart(3, "0")}-${sanitizePathToken(snapshot.stepKey)}`;
  const taskRoot = path.resolve(
    process.cwd(),
    ".tmp",
    "chat-tasks",
    sanitizePathToken(chatId),
    sanitizePathToken(taskId),
  );
  const baseDir = path.join(
    taskRoot,
    "steps",
    stepSlug,
  );
  const latestDir = path.join(taskRoot, "latest");
  const latestSiteDir = path.join(latestDir, "site");
  const latestWorkflowDir = path.join(latestDir, "workflow");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.mkdir(latestSiteDir, { recursive: true });
  await fs.mkdir(latestWorkflowDir, { recursive: true });
  const changedFiles: StaticArtifactFile[] = [];
  const changedWorkflowFiles: WorkflowArtifactFile[] = [];
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
    checkpointMode: "incremental",
  };
  await fs.writeFile(path.join(baseDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.mkdir(path.join(baseDir, "site"), { recursive: true });
  await fs.mkdir(path.join(baseDir, "workflow"), { recursive: true });
  for (const file of snapshot.files) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const content = String(file.content || "");
    const latestAbs = path.resolve(latestSiteDir, rel);
    const previous = await readTextIfExists(latestAbs);
    if (previous !== content) {
      changedFiles.push(file);
      await writeCheckpointFile(path.join(baseDir, "site"), file.path, content);
    }
    await writeCheckpointFile(latestSiteDir, file.path, content);
  }
  for (const file of snapshot.workflowArtifacts) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const content = String(file.content || "");
    const latestAbs = path.resolve(latestWorkflowDir, rel);
    const previous = await readTextIfExists(latestAbs);
    if (previous !== content) {
      changedWorkflowFiles.push(file);
      await writeCheckpointFile(path.join(baseDir, "workflow"), file.path, content);
    }
    await writeCheckpointFile(latestWorkflowDir, file.path, content);
  }
  await fs.writeFile(
    path.join(baseDir, "delta.json"),
    JSON.stringify(
      {
        savedAt: manifest.savedAt,
        changedFiles: changedFiles.map((file) => file.path),
        changedWorkflowFiles: changedWorkflowFiles.map((file) => file.path),
        latestDir,
        latestSiteDir,
        latestWorkflowDir,
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(latestDir, "manifest.json"),
    JSON.stringify(
      {
        ...manifest,
        latestUpdatedAt: manifest.savedAt,
        latestDir,
        latestSiteDir,
        latestWorkflowDir,
      },
      null,
      2,
    ),
    "utf8",
  );

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
          changedFiles: changedFiles.map((file) => file.path),
          changedWorkflowFiles: changedWorkflowFiles.map((file) => file.path),
        },
      );
      r2UploadedCount += 1;

      for (const file of changedFiles) {
        const rel = String(file.path || "").replace(/^\/+/, "");
        if (!rel) continue;
        await r2.putObject(`${r2Prefix}/site/${rel}`, String(file.content || ""), {
          contentType: file.type || guessMimeByPath(file.path),
        });
        r2UploadedCount += 1;
      }

      for (const file of changedWorkflowFiles) {
        const rel = String(file.path || "").replace(/^\/+/, "");
        if (!rel) continue;
        await r2.putObject(`${r2Prefix}/workflow/${rel}`, String(file.content || ""), {
          contentType: file.type || guessMimeByPath(file.path),
        });
        r2UploadedCount += 1;
      }
    }
  } catch (error: any) {
    r2Error = String(error?.message || error || "r2-upload-failed");
  }
  return {
    localDir: baseDir,
    latestDir,
    latestSiteDir,
    latestWorkflowDir,
    changedFiles: changedFiles.map((file) => file.path),
    changedWorkflowFiles: changedWorkflowFiles.map((file) => file.path),
    r2Prefix,
    r2UploadedCount,
    r2Error,
  };
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
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  guidance: WorkflowGuidancePack;
  designConfirm: DesignConfirmSnapshot;
  designSpec: DesignSpec;
  designContext: DesignContext;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractPrimaryFontFamily(fontStack: string): string {
  const raw = String(fontStack || "").trim();
  if (!raw) return "Space Grotesk";
  const first = raw.split(",")[0]?.trim() || "Space Grotesk";
  return first.replace(/^["']|["']$/g, "");
}

function buildRuntimeDesignSpec(params: {
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  overrides?: Record<string, unknown>;
}): DesignSpec {
  const { stylePreset, designHit, overrides } = params;
  const primaryFont = extractPrimaryFontFamily(stylePreset.typography);
  const appliedDesignSystem = {
    name: designHit?.id || "runtime-selected-style",
    visualTheme: designHit?.design_desc || "Skill runtime style preset",
    colors: {
      primary: [{ name: "primary", value: stylePreset.colors.primary }],
      accent: [{ name: "accent", value: stylePreset.colors.accent }],
      neutral: [
        { name: "background", value: stylePreset.colors.background },
        { name: "surface", value: stylePreset.colors.surface },
        { name: "border", value: stylePreset.colors.border },
      ],
      semantic: [],
      shadows: [{ name: "card-shadow", value: "0 6px 22px rgba(17,24,39,.06)" }],
    },
    typography: [
      {
        role: "Heading",
        font: primaryFont,
        size: "48px",
        weight: 700,
        lineHeight: "1.15",
        letterSpacing: "-0.02em",
      },
      {
        role: "Body",
        font: primaryFont,
        size: "16px",
        weight: 400,
        lineHeight: "1.6",
        letterSpacing: "0",
      },
    ],
    shadows: {
      card: "0 6px 22px rgba(17,24,39,.06)",
    },
    layout: {
      spacing: [4, 8, 12, 16, 24, 32],
      maxWidth: "1200px",
      grid: "12-col",
      borderRadius: {
        card: stylePreset.borderRadius,
      },
    },
    dosAndDonts: { dos: [], donts: [] },
  };

  return {
    version: "1.0",
    sourceDesignSystems: [designHit?.id || "runtime-selected-style"],
    appliedDesignSystem: appliedDesignSystem as any,
    customOverrides: overrides || {},
    generatedAt: nowIso(),
    confirmedItems: [
      "primary-color",
      "accent-color",
      "typography",
      "spacing",
      "border-radius",
      "component-style",
    ],
  };
}

class NativeSkillRuntime {
  private readonly context: RuntimeContext;
  private readonly onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  private readonly timeoutMs: number;
  private readonly totalSteps: number;
  private stepIndex = 0;
  private files: StaticArtifactFile[];
  private workflowFiles: WorkflowArtifactFile[];
  private pages: Array<{ path: string; html: string }>;
  private pageContexts: PageContext[];
  private qaRecords: PageQaRecord[];
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
    const workflowContext = toRecord((params.state as any)?.workflow_context);
    const stylePreset = normalizeStylePreset(
      (workflowContext.stylePreset as Partial<DesignStylePreset>) || (params.state as any)?.design_hit?.style_preset,
      {},
    );
    const designHit = ((params.state as any)?.design_hit || undefined) as DesignSkillHit | undefined;
    const designOverrides = toRecord(workflowContext.designOverrides);
    const guidance: WorkflowGuidancePack = {
      selectionCriteria: String(workflowContext.selectionCriteria || ""),
      sequentialWorkflow: String(workflowContext.sequentialWorkflow || ""),
      workflowGuide: String(workflowContext.workflowGuide || ""),
      rulesSummary: String(workflowContext.rulesSummary || ""),
      designMd: String(workflowContext.designMd || ""),
    };
    const designConfirm: DesignConfirmSnapshot = {
      selectedStyleId: String(workflowContext.designSystemId || designHit?.id || "runtime-selected-style"),
      selectedStyleName: String(workflowContext.designSystemName || designHit?.name || "Runtime Selected Style"),
      reason: String(workflowContext.designSelectionReason || designHit?.design_desc || "auto-selected"),
      colors: {
        primary: stylePreset.colors.primary,
        accent: stylePreset.colors.accent,
        background: stylePreset.colors.background,
        surface: stylePreset.colors.surface,
        text: stylePreset.colors.text,
        border: stylePreset.colors.border,
      },
      typography: stylePreset.typography,
      borderRadius: stylePreset.borderRadius,
      overrides: designOverrides,
    };
    const designSpec = buildRuntimeDesignSpec({
      stylePreset,
      designHit,
      overrides: designOverrides,
    });
    const designContext = buildDesignContext(designSpec);
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
      stylePreset,
      designHit,
      guidance,
      designConfirm,
      designSpec,
      designContext,
    };
    this.requirementText = requirementText;
    this.files = existingStatic;
    this.workflowFiles = existingWorkflow;
    this.pages = existingPages;
    this.pageContexts = existingPages.map((page: { path: string; html: string }, index: number) =>
      this.buildPageContextFromHtml(page.path, page.html, index + 1),
    );
    this.qaRecords = [];
    this.onStep = params.onStep;
    this.timeoutMs = Math.max(30_000, Number(params.timeoutMs || 90_000));
    this.totalSteps = 8 + routes.length;
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

  private async invokeLlm(
    prompt: string,
    opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number; systemPrompt?: string },
  ): Promise<string> {
    const isTestMode = process.env.NODE_ENV === "test";
    if (isTestMode) return "";
    const timeoutMs = Math.max(20_000, Number(opts?.timeoutMs || this.timeoutMs));
    const maxTokens = Math.max(256, Number(opts?.maxTokens || 8192));
    const model = createModelForProvider(this.context.providerConfig, timeoutMs, maxTokens, opts?.temperature ?? 0.2);
    const messages: BaseMessage[] = [];
    const systemPrompt = String(opts?.systemPrompt || "").trim();
    if (systemPrompt) {
      messages.push(new SystemMessage(systemPrompt));
    }
    messages.push(new HumanMessage(prompt));
    const ai = await invokeModelWithIdleTimeout({
      model,
      messages,
      timeoutMs,
      operation: "skill-native-stage",
    });
    return String(ai?.content || "").trim();
  }

  private async loadSkillDirective(skillId: string, maxLen = 6000): Promise<string> {
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
    const maxDirectiveChars = Math.max(1200, Number(process.env.SKILL_DYNAMIC_DIRECTIVE_MAX_CHARS || 24000));
    let used = 0;
    for (const id of selectedIds) {
      const snippet = await this.loadSkillDirective(id, 6000);
      if (!snippet) continue;
      const block = `### ${id}\n${snippet}`;
      if (used > 0 && used + block.length > maxDirectiveChars) break;
      blocks.push(block);
      used += block.length;
    }
    return { ids: selectedIds, text: blocks.join("\n\n") };
  }

  private buildStageGuidance(stage: "styles" | "page" | "script"): string {
    const baseBudget = Math.max(10_000, Number(process.env.SKILL_RUNTIME_GUIDANCE_MAX_CHARS || 72_000));
    const stageBudget = stage === "page" ? baseBudget : Math.round(baseBudget * 0.7);
    const sequentialBudget = Math.max(4000, Number(process.env.SKILL_RUNTIME_SEQUENTIAL_MAX_CHARS || 26_000));
    const designBudget = Math.max(4000, Number(process.env.SKILL_RUNTIME_DESIGN_MD_MAX_CHARS || 30_000));
    const rulesBudget = Math.max(2500, Number(process.env.SKILL_RUNTIME_RULES_MAX_CHARS || 10_000));
    const workflowBudget = Math.max(1000, Number(process.env.SKILL_RUNTIME_WORKFLOW_GUIDE_MAX_CHARS || 4000));

    const entries: Array<{ title: string; content: string }> = [
      {
        title: "sequential-workflow",
        content: clipTextWithBudget(this.context.guidance.sequentialWorkflow, sequentialBudget),
      },
      {
        title: "design-md",
        content: clipTextWithBudget(this.context.guidance.designMd, designBudget),
      },
      {
        title: "rules-summary",
        content: clipTextWithBudget(this.context.guidance.rulesSummary, rulesBudget),
      },
      {
        title: "workflow-guide",
        content: clipTextWithBudget(this.context.guidance.workflowGuide, workflowBudget),
      },
    ];

    const blocks: string[] = [];
    let used = 0;
    for (const entry of entries) {
      const text = String(entry.content || "").trim();
      if (!text) continue;
      const block = `## ${entry.title}\n${text}`;
      if (used > 0 && used + block.length > stageBudget) continue;
      blocks.push(block);
      used += block.length;
    }
    return blocks.join("\n\n");
  }

  private extractHeadingRecords(html: string): HeadingRecord[] {
    const records: HeadingRecord[] = [];
    const matches = String(html || "").matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi);
    for (const match of matches) {
      const level = Number(match[1]);
      const text = String(match[2] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const usedTerms = text
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/g)
        .filter((token) => token.length >= 2)
        .slice(0, 8);
      records.push({ text, level, usedTerms });
      if (records.length >= 18) break;
    }
    return records;
  }

  private extractTermRecords(headings: HeadingRecord[]): TermRecord[] {
    const counter = new Map<string, number>();
    for (const heading of headings) {
      for (const token of heading.usedTerms || []) {
        counter.set(token, Number(counter.get(token) || 0) + 1);
      }
    }
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([term, usageCount]) => ({
        term,
        definition: `Recurring term in generated headings`,
        usageCount,
      }));
  }

  private extractLinks(html: string): Array<{ target: string; anchor: string; type: string }> {
    const links: Array<{ target: string; anchor: string; type: string }> = [];
    const matches = String(html || "").matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of matches) {
      const target = normalizePath(String(match[1] || ""));
      const anchor = String(match[2] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!target || !anchor) continue;
      links.push({
        target,
        anchor,
        type: target.startsWith("/") ? "internal" : "external",
      });
      if (links.length >= 24) break;
    }
    return links;
  }

  private buildPageContextFromHtml(route: string, html: string, pageOrder: number): PageContext {
    const normalizedRoute = normalizePath(route);
    const blueprint = findPageBlueprint(this.context.decision, normalizedRoute);
    const headings = this.extractHeadingRecords(html);
    const terms = this.extractTermRecords(headings);
    const colorsUsed: ColorUsage[] = [
      { token: "primary", value: this.context.stylePreset.colors.primary, usage: "buttons, nav, highlights" },
      { token: "accent", value: this.context.stylePreset.colors.accent, usage: "cta, emphasis" },
      { token: "surface", value: this.context.stylePreset.colors.surface, usage: "cards, sections" },
    ];
    const typographyUsed: TypoUsage[] = [
      {
        role: "Body",
        font: extractPrimaryFontFamily(this.context.stylePreset.typography),
        size: "16px",
        usage: "body copy",
      },
      {
        role: "Heading",
        font: extractPrimaryFontFamily(this.context.stylePreset.typography),
        size: "clamp(28px, 4vw, 48px)",
        usage: "hero headings",
      },
    ];

    return buildPageContext(
      normalizedRoute,
      pageOrder,
      {
        headings,
        keyTerms: terms,
        featureList: blueprint.contentSkeleton.slice(0, 8),
        toneAndManner: this.context.locale === "zh-CN" ? "专业、可信、工业化" : "professional, credible, industrial",
      },
      {
        colorsUsed,
        typographyUsed,
        componentsUsed: blueprint.contentSkeleton.slice(0, 10),
      },
      {
        sections: blueprint.contentSkeleton.slice(0, 10),
        links: this.extractLinks(html),
        navigationItems: buildNavFromDecision(this.context.decision).map((item) => item.label),
      },
    );
  }

  private upsertPageContext(pageContext: PageContext) {
    this.pageContexts = [
      ...this.pageContexts.filter((item) => normalizePath(item.pageName) !== normalizePath(pageContext.pageName)),
      pageContext,
    ].sort((a, b) => a.pageOrder - b.pageOrder);
  }

  private upsertQaRecord(record: PageQaRecord) {
    this.qaRecords = [...this.qaRecords.filter((item) => normalizePath(item.route) !== normalizePath(record.route)), record];
  }

  private buildSequentialPageContext(pageOrder: number): string {
    return buildContextForPageN(pageOrder, this.pageContexts, {
      maxChars: PAGE_CONTEXT_MAX_CHARS,
      maxPages: PAGE_CONTEXT_MAX_PAGES,
      maxTerms: PAGE_CONTEXT_MAX_TERMS,
    });
  }

  private async ensureDesignConfirm() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/design-confirmation.json");
    if (existing?.content?.trim()) return;
    await this.writeWorkflow(
      "/design-confirmation.json",
      JSON.stringify(
        {
          generatedAt: nowIso(),
          selected: this.context.designConfirm,
          sourceSkill: this.context.skillId,
          recommendationCandidates: (this.context.designHit?.selection_candidates || []).slice(0, 3),
        },
        null,
        2,
      ),
      "design_confirm",
    );
  }

  private async validatePageWithRetry(params: {
    route: string;
    promptBuilder: (qaFeedback: string, attempt: number) => string;
    systemPrompt: string;
    maxTokens: number;
    timeoutMs: number;
    fallbackHtml: string;
  }): Promise<string> {
    let attempt = 0;
    let qaFeedback = "";
    let finalHtml = "";
    let finalQa: ValidationResult | null = null;

    while (attempt <= QA_MAX_RETRIES) {
      const prompt = params.promptBuilder(qaFeedback, attempt);
      const modelHtml = await this.invokeLlm(prompt, {
        maxTokens: params.maxTokens,
        timeoutMs: params.timeoutMs,
        systemPrompt: params.systemPrompt,
      });
      finalHtml = ensureHtmlDocument(modelHtml);
      if (!finalHtml.trim()) finalHtml = params.fallbackHtml;

      finalQa = await validateComponent(finalHtml, this.context.designSpec, this.context.designContext);
      const pass = finalQa.passed && Number(finalQa.score || 0) >= QA_MIN_SCORE;
      if (pass) break;

      const hints = [
        ...((finalQa.errors || []).slice(0, 6)),
        ...((finalQa.warnings || []).slice(0, 4)),
      ];
      qaFeedback = hints.length > 0 ? hints.map((item) => `- ${item}`).join("\n") : "- Improve design compliance and accessibility.";
      attempt += 1;
      if (attempt > QA_MAX_RETRIES) break;
    }

    const qa = finalQa || {
      passed: true,
      score: 100,
      checks: [],
      errors: [],
      warnings: [],
    };
    this.upsertQaRecord({
      route: params.route,
      passed: qa.passed && Number(qa.score || 0) >= QA_MIN_SCORE,
      score: Number(qa.score || 0),
      retries: Math.min(attempt, QA_MAX_RETRIES),
      errors: qa.errors || [],
      warnings: qa.warnings || [],
    });
    return finalHtml || params.fallbackHtml;
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
      renderLocalDesign(this.requirementText, this.context.locale, this.context.decision, this.context.stylePreset),
      "design",
    );
  }

  private async ensureStyles() {
    if (this.getFile("/styles.css")?.content?.trim()) return;
    let css = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("styles");
      const stageGuidance = this.buildStageGuidance("styles");
      const systemPrompt = `You are a senior frontend design-system engineer.
Generate only raw CSS for styles.css.
Keep the output production-safe, responsive, and semantically consistent.
Never include markdown fences or explanation text.
Follow skill directives and design guidance strictly.`;
      const prompt = `Generate a single styles.css for a multi-page industrial website.
Output raw CSS only. No markdown fences.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Guidance bundle:
${stageGuidance}
Locale: ${this.context.locale}
Selected style: ${this.context.designConfirm.selectedStyleName} (${this.context.designConfirm.selectedStyleId})
Style selection reason: ${this.context.designConfirm.reason}
Design tokens:
- colors: ${JSON.stringify(this.context.designConfirm.colors)}
- typography: ${this.context.designConfirm.typography}
- borderRadius: ${this.context.designConfirm.borderRadius}
Routes: ${this.context.routes.join(", ")}
Page blueprints:
${blueprintDigest(this.context.decision)}
Requirements:
${this.requirementText.slice(0, 1800)}`;
      css = normalizeGeneratedCss(stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 12000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
        systemPrompt,
      })));
    }
    if (!css.trim()) css = renderLocalStyles(this.context.stylePreset);
    css = normalizeGeneratedCss(css);
    await this.writeSite("/styles.css", css, "styles");
  }

  private async ensureScript() {
    if (this.getFile("/script.js")?.content?.trim()) return;
    let js = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("script");
      const stageGuidance = this.buildStageGuidance("script");
      const systemPrompt = `You are a frontend JavaScript engineer.
Generate only raw JavaScript for script.js.
Keep behavior minimal, deterministic, and accessibility-friendly.
No markdown fences and no explanatory text.`;
      const prompt = `Generate a single script.js for a multi-page static website.
Output raw JavaScript only. No markdown fences.
Include only small UI helpers.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Guidance bundle:
${stageGuidance}
Locale: ${this.context.locale}
Routes: ${this.context.routes.join(", ")}
Page blueprints:
${blueprintDigest(this.context.decision)}`;
      js = stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 8000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
        systemPrompt,
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
    const pageOrder = this.pageContexts.length + 1;
    const fallbackHtml = renderLocalPage({
      route: normalizedRoute,
      decision: this.context.decision,
      requirementText: this.requirementText,
    });
    let html = fallbackHtml;

    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("page");
      const stageGuidance = this.buildStageGuidance("page");
      const navLinks = buildNavFromDecision(this.context.decision)
        .map((item) => `${item.label}:${item.href}`)
        .join(", ");
      const sequentialContext = this.buildSequentialPageContext(pageOrder);
      const pageSourceBrief = extractRouteSourceBrief(
        this.requirementText,
        normalizedRoute,
        blueprint.navLabel,
        4200,
      );
      const systemPrompt = [
        "You are a staff frontend engineer generating complete static HTML pages.",
        "Only output raw HTML. No markdown, no commentary.",
        "Always include <!doctype html>, <html>, <head>, <body>.",
        "Always include <link rel=\"stylesheet\" href=\"/styles.css\"> and <script src=\"/script.js\"></script>.",
        "Follow design-system tokens, accessibility, and the provided skill guidance strictly.",
      ].join("\n");
      const promptBuilder = (qaFeedback: string, attempt: number) => `Generate one complete HTML document for route ${normalizedRoute}.
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Guidance bundle:
${stageGuidance}
Selected style: ${this.context.designConfirm.selectedStyleName} (${this.context.designConfirm.selectedStyleId})
Design rationale: ${this.context.designConfirm.reason}
Design tokens:
- colors: ${JSON.stringify(this.context.designConfirm.colors)}
- typography: ${this.context.designConfirm.typography}
- borderRadius: ${this.context.designConfirm.borderRadius}
- overrides: ${JSON.stringify(this.context.designConfirm.overrides)}
Locale: ${this.context.locale}
Navigation links: ${navLinks}
Page responsibility: ${blueprint.responsibility}
Page skeleton: ${blueprint.contentSkeleton.join(" -> ")}
Component mix: ${formatComponentMix(blueprint.componentMix)}
Page-specific source brief excerpt (authoritative for this file):
${pageSourceBrief || "No route-specific source excerpt found. Derive a unique page architecture from the complete requirement below."}
Requirement:
${clipTextWithBudget(this.requirementText, Number(process.env.SKILL_DIRECT_PAGE_REQUIREMENT_CHARS || 12_000))}
${sequentialContext ? `\n${sequentialContext}` : ""}
${qaFeedback ? `\nQA fix instructions (attempt ${attempt}):\n${qaFeedback}` : ""}`;

      html = await this.validatePageWithRetry({
        route: normalizedRoute,
        promptBuilder,
        systemPrompt,
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_PAGE || 16000),
        timeoutMs:
          normalizedRoute === "/"
            ? Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_ROOT_MS || 180000)
            : Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_PAGE_MS || 150000),
        fallbackHtml,
      });
    }

    this.setPage(normalizedRoute, html);
    const pageContext = this.buildPageContextFromHtml(normalizedRoute, html, pageOrder);
    this.upsertPageContext(pageContext);
    const qa = this.qaRecords.find((item) => normalizePath(item.route) === normalizedRoute);
    this.stepIndex += 1;
    const qaSuffix = qa ? `:qa-${qa.score}` : "";
    await this.emit(targetPath, `generating:${normalizedRoute === "/" ? "index" : "pages"}${qaSuffix}`);
  }

  private async repairAllPages() {
    for (const page of [...this.pages]) {
      this.setPage(page.path, ensureHtmlDocument(page.html));
    }
    this.stepIndex += 1;
    await this.emit("repair", "generating:repair");
  }

  private async ensureQaReport() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/qa-report.json");
    if (existing?.content?.trim()) return;
    const averageScore =
      this.qaRecords.length > 0
        ? Math.round(this.qaRecords.reduce((sum, item) => sum + Number(item.score || 0), 0) / this.qaRecords.length)
        : 100;
    await this.writeWorkflow(
      "/qa-report.json",
      JSON.stringify(
        {
          generatedAt: nowIso(),
          minPassingScore: QA_MIN_SCORE,
          retriesAllowed: QA_MAX_RETRIES,
          averageScore,
          records: this.qaRecords,
        },
        null,
        2,
      ),
      "qa_report",
    );
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
          primary: this.context.stylePreset.colors.primary,
          accent: this.context.stylePreset.colors.accent,
        },
        style: {
          borderRadius: this.context.stylePreset.borderRadius,
          typography: this.context.stylePreset.typography,
        },
      },
      skillHit: this.context.designHit,
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
    await this.ensureDesignConfirm();
    await this.ensureDesign();
    await this.ensureStyles();
    await this.ensureScript();
    await this.ensurePage("/");
    for (const route of this.context.routes) {
      if (normalizePath(route) === "/") continue;
      await this.ensurePage(route);
    }
    await this.ensureQaReport();
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

async function runLegacySkillRuntimeExecutor(params: RunSkillRuntimeExecutorParams): Promise<SkillRuntimeExecutionSummary> {
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
  const missingPhases = SKILL_RUNTIME_FIXED_PHASES.filter((phase) => !completedPhases.includes(phase));
  if (completedPhases.length === 0 || missingPhases.length > 0) {
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

export async function runSkillRuntimeExecutor(params: RunSkillRuntimeExecutorParams): Promise<SkillRuntimeExecutionSummary> {
  if (shouldUseSkillToolMode()) {
    const summary = await runSkillToolExecutor(params as any);
    return {
      state: summary.state,
      assistantText: summary.assistantText,
      actions: summary.actions || [],
      pageCount: summary.pageCount,
      fileCount: summary.fileCount,
      generatedFiles: summary.generatedFiles,
      phase: String(summary.phase || summary.state.phase || "end"),
      completedPhases: SKILL_RUNTIME_FIXED_PHASES.filter((phase) => summary.completedPhases.includes(phase)),
      deployedUrl: summary.deployedUrl,
    };
  }
  return await runLegacySkillRuntimeExecutor(params);
}

function toProgressStageMessage(stage: string, stepIndex?: number, totalSteps?: number): string {
  const normalized = String(stage || "").trim();
  const progress = Number.isFinite(Number(stepIndex)) && Number.isFinite(Number(totalSteps))
    ? ` (${stepIndex}/${totalSteps})`
    : "";
  if (!normalized) return `Generation in progress${progress}`;
  if (normalized.includes("design_confirm")) return `Design confirmation prepared${progress}`;
  if (normalized.includes("task_plan")) return `Planning generation steps${progress}`;
  if (normalized.includes("findings")) return `Analyzing requirements${progress}`;
  if (normalized.includes("design")) return `Finalizing design tokens${progress}`;
  if (normalized.includes("styles")) return `Generating shared styles.css${progress}`;
  if (normalized.includes("script")) return `Generating shared script.js${progress}`;
  if (normalized.includes("index")) return `Generating homepage${progress}`;
  if (normalized.includes("pages")) return `Generating internal pages${progress}`;
  if (normalized.includes("qa_report")) return `Running design QA summary${progress}`;
  if (normalized.includes("repair")) return `Repairing and validating final output${progress}`;
  if (normalized.includes("/")) return `Generating ${normalized}${progress}`;
  return `Generation stage: ${normalized}${progress}`;
}

function compactMessageForSession(message: any): { role: string; content: string } {
  const ctorName = String(message?.constructor?.name || "").toLowerCase();
  let role = "assistant";
  if (ctorName.includes("human")) role = "user";
  else if (ctorName.includes("ai")) role = "assistant";
  else if (String(message?.role || "").toLowerCase() === "user") role = "user";
  else if (String(message?.role || "").toLowerCase() === "assistant") role = "assistant";
  const content = String(message?.content || "").slice(0, 8000);
  return { role, content };
}

function buildSessionSnapshot(state: AgentState): Partial<AgentState> {
  const workflow = toRecord((state as any)?.workflow_context);
  return {
    phase: String(state.phase || "conversation"),
    current_page_index: Number(state.current_page_index || 0),
    attempt_count: Number(state.attempt_count || 0),
    sitemap: Array.isArray(state.sitemap) ? state.sitemap : undefined,
    industry: state.industry,
    theme: state.theme,
    design_hit: (state as any)?.design_hit,
    user_id: state.user_id,
    deployed_url: (state as any)?.deployed_url,
    messages: (Array.isArray(state.messages) ? state.messages : []).slice(-20).map((msg: any) => compactMessageForSession(msg) as any),
    workflow_context: {
      runMode: workflow.runMode,
      genMode: workflow.genMode,
      generationMode: workflow.generationMode,
      preferredLocale: workflow.preferredLocale,
      sourceRequirement: workflow.sourceRequirement,
      skillId: workflow.skillId,
      refineSkillId: workflow.refineSkillId,
      lockedProvider: workflow.lockedProvider,
      lockedModel: workflow.lockedModel,
      designSystemId: workflow.designSystemId,
      designSystemName: workflow.designSystemName,
      designSelectionReason: workflow.designSelectionReason,
      stylePreset: workflow.stylePreset,
      designOverrides: workflow.designOverrides,
      conversationStage: workflow.conversationStage,
      executionMode: workflow.executionMode,
      intent: workflow.intent,
      intentConfidence: workflow.intentConfidence,
      intentReason: workflow.intentReason,
      refineRequested: workflow.refineRequested,
      refineSourceProjectPath: workflow.refineSourceProjectPath,
      refineSourceTaskId: workflow.refineSourceTaskId,
      requirementCompletionPercent: workflow.requirementCompletionPercent,
      requirementSpec: workflow.requirementSpec,
      requirementPatchPlan: workflow.requirementPatchPlan,
      requirementRevision: workflow.requirementRevision,
      supersededMessages: workflow.supersededMessages,
      correctionSummary: workflow.correctionSummary,
      canonicalPrompt: workflow.canonicalPrompt,
      promptControlManifest: workflow.promptControlManifest,
      requirementAggregatedText: workflow.requirementAggregatedText,
      latestUserText: workflow.latestUserText,
      latestUserTextRaw: workflow.latestUserTextRaw,
      referencedAssets: workflow.referencedAssets,
      assumedDefaults: workflow.assumedDefaults,
      deploySourceProjectPath: workflow.deploySourceProjectPath,
      deploySourceTaskId: workflow.deploySourceTaskId,
      checkpointProjectPath: workflow.checkpointProjectPath,
      deployRequested: workflow.deployRequested,
    } as any,
  };
}

function collectPendingEditOperations(pendingEdits: ChatTaskPendingEdit[]): unknown[] {
  const operations: unknown[] = [];
  for (const edit of pendingEdits) {
    const patchPlan = edit.patchPlan as { operations?: unknown[] } | undefined;
    if (Array.isArray(patchPlan?.operations)) {
      operations.push(...patchPlan.operations);
    }
  }
  return operations;
}

async function readPendingEditsForTask(taskId: string): Promise<ChatTaskPendingEdit[]> {
  const current = await getChatTask(taskId);
  const pending = current?.result?.internal?.pendingEdits;
  if (!Array.isArray(pending)) return [];
  return pending
    .map((edit) => ({
      id: String((edit as any)?.id || crypto.randomUUID()),
      text: String((edit as any)?.text || "").trim(),
      createdAt: String((edit as any)?.createdAt || nowIso()),
      ownerUserId: String((edit as any)?.ownerUserId || "").trim() || undefined,
      patchPlan: (edit as any)?.patchPlan,
    }))
    .filter((edit) => edit.text);
}

async function queuePendingRefineTask(params: {
  taskId: string;
  chatId: string;
  ownerUserId?: string;
  baseState: AgentState;
  checkpointProjectPath: string;
  pendingEdits: ChatTaskPendingEdit[];
}) {
  const pendingText = params.pendingEdits.map((edit) => edit.text).filter(Boolean).join("\n");
  if (!pendingText.trim() || !params.checkpointProjectPath.trim()) return undefined;

  const pendingState: AgentState = {
    ...params.baseState,
    workflow_context: {
      ...(params.baseState.workflow_context || {}),
      runMode: "async-task",
      genMode: "skill_native",
      executionMode: "refine",
      conversationStage: "previewing",
      intent: "refine_preview",
      intentReason: "pending-edits-after-active-task",
      refineRequested: true,
      deployRequested: false,
      sourceRequirement: pendingText,
      latestUserText: pendingText,
      latestUserTextRaw: pendingText,
      refineSourceProjectPath: params.checkpointProjectPath,
      refineSourceTaskId: params.taskId,
      deploySourceProjectPath: params.checkpointProjectPath,
      deploySourceTaskId: params.taskId,
      checkpointProjectPath: params.checkpointProjectPath,
      requirementPatchPlan: {
        revision: params.pendingEdits.length,
        instructionText: pendingText,
        operations: collectPendingEditOperations(params.pendingEdits),
      },
      pendingEditsConsumedFromTaskId: params.taskId,
    } as any,
    messages: [...(params.baseState.messages || []), new HumanMessage({ content: pendingText })],
  };

  return createChatTask(params.chatId, params.ownerUserId, {
    assistantText: "Pending edits accepted. Queued a follow-up refinement from the latest preview.",
    phase: "queued",
    internal: {
      inputState: pendingState,
      sessionState: pendingState,
      queuedAt: nowIso(),
      skillId: String((params.baseState.workflow_context as any)?.skillId || WEBSITE_MAIN_SKILL_ID),
      consumedPendingEditsFromTaskId: params.taskId,
      consumedPendingEditIds: params.pendingEdits.map((edit) => edit.id),
    } as any,
    progress: {
      stage: "queued",
      stageMessage: "Follow-up refine task queued from pending edits.",
      skillId: String((params.baseState.workflow_context as any)?.skillId || WEBSITE_MAIN_SKILL_ID),
      attempt: 1,
      startedAt: nowIso(),
      round: 0,
      maxRounds: 1,
      checkpointSaved: false,
      nextStep: "refine",
      pendingEditsCount: params.pendingEdits.length,
    } as any,
  });
}

async function runDeployOnlyTask(params: {
  taskId: string;
  chatId: string;
  workerId: string;
  inputState: AgentState;
  setSessionState?: (state: AgentState) => void;
}): Promise<void> {
  const { taskId, chatId, workerId, inputState, setSessionState } = params;
  const startedAt = Date.now();

  await touchChatTaskHeartbeat(taskId, workerId);
  await updateChatTaskProgress(taskId, {
    assistantText: "Deploy request confirmed. Preparing Cloudflare deployment.",
    phase: "deploy",
    progress: {
      stage: "deploying:prepare",
      stageMessage: "Loading latest generated site artifacts...",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs: 0,
      attempt: 1,
      checkpointSaved: false,
    } as any,
  });

  const sourceProject = await resolveDeploySourceProject(inputState);
  if (!sourceProject) {
    await failChatTask(
      taskId,
      "No generated site artifacts found for deployment. Please generate a site first, then confirm deploy.",
    );
    return;
  }
  const projectName = resolveDeployProjectName(sourceProject, inputState, chatId);
  const deploymentHost = `${projectName}.pages.dev`;
  const cf = new CloudflareClient();
  const ownerUserId = String(inputState.user_id || "").trim();
  let dbProjectId = chatId;
  let deployProject = sourceProject;
  let analyticsSite: CloudflareWebAnalyticsSite | null = null;
  let analyticsStatus = "pending";
  let analyticsWarning = "";

  try {
    if (ownerUserId) {
      try {
        dbProjectId = await saveProjectState(ownerUserId, sourceProject, inputState.access_token, chatId);
      } catch (error) {
        console.warn(
          `[SkillRuntimeExecutor] saveProjectState before deploy failed: ${String((error as any)?.message || error || "unknown")}`,
        );
      }
    }

    await updateChatTaskProgress(taskId, {
      assistantText: `Provisioning analytics for ${deploymentHost}...`,
      phase: "deploy",
      progress: {
        stage: "deploying:analytics",
        stageMessage: "Preparing Cloudflare Web Analytics site token...",
        startedAt: new Date(startedAt).toISOString(),
        lastTokenAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        attempt: 1,
      } as any,
    });

    try {
      analyticsSite = await cf.ensureWebAnalyticsSite(deploymentHost);
      deployProject = injectCloudflareAnalyticsBeacon(sourceProject, analyticsSite.siteTag);
      analyticsStatus = "active";
    } catch (error) {
      analyticsStatus = "degraded";
      analyticsWarning = String((error as any)?.message || error || "Cloudflare analytics provisioning failed");
      console.warn(`[SkillRuntimeExecutor] analytics provisioning warning: ${analyticsWarning}`);
    }

    await updateChatTaskProgress(taskId, {
      assistantText: `Deploying to Cloudflare project ${projectName}...`,
      phase: "deploy",
      progress: {
        stage: "deploying:upload",
        stageMessage: "Uploading static bundle to Cloudflare Pages...",
        startedAt: new Date(startedAt).toISOString(),
        lastTokenAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        attempt: 1,
        analyticsStatus,
      } as any,
    });

    const bundle = await Bundler.createBundle(deployProject);
    const preDeploySmoke = runPreDeploySmoke(bundle);
    if (preDeploySmoke.status === "failed") {
      await failChatTask(
        taskId,
        `Pre-deploy smoke gate failed: ${preDeploySmoke.checks
          .filter((check) => !check.passed)
          .map((check) => `${check.name}${check.message ? ` (${check.message})` : ""}`)
          .join(", ")}`,
      );
      return;
    }

    let r2BundlePrefix = "";
    if (ownerUserId) {
      try {
        const archived = await archiveSiteArtifactsToR2({
          projectId: dbProjectId || chatId,
          ownerUserId,
          projectJson: deployProject,
          bundle: {
            manifest: bundle.manifest,
            fileEntries: bundle.fileEntries.map((entry) => ({
              path: entry.path,
              content: entry.content,
              type: entry.type,
            })),
          },
        });
        r2BundlePrefix = String(archived?.prefix || "");
      } catch (error) {
        console.warn(
          `[SkillRuntimeExecutor] archiveSiteArtifactsToR2 failed: ${String((error as any)?.message || error || "unknown")}`,
        );
      }
    }

    await cf.createProject(projectName);
    const deployment = await cf.uploadDeployment(projectName, bundle);
    const deployedUrl = String((deployment as any)?.result?.url || `https://${projectName}.pages.dev`);
    const productionUrl = `https://${projectName}.pages.dev`;
    const postDeploySmoke = await runPostDeploySmoke(deployedUrl, { fallbackUrls: [productionUrl] });
    if (postDeploySmoke.status === "failed") {
      await failChatTask(
        taskId,
        `Post-deploy smoke gate failed: ${postDeploySmoke.checks
          .filter((check) => !check.passed)
          .map((check) => `${check.name}${check.message ? ` (${check.message})` : ""}`)
          .join(", ")}`,
      );
      return;
    }
    const liveUrl = postDeploySmoke.url || deployedUrl;

    if (ownerUserId) {
      try {
        dbProjectId = await saveProjectState(ownerUserId, deployProject, inputState.access_token, dbProjectId || chatId);
        await upsertProjectSiteBinding(dbProjectId || chatId, ownerUserId, liveUrl, {
          analyticsProvider: "cloudflare_web_analytics",
          analyticsStatus,
          analyticsLastSyncAt: analyticsSite ? nowIso() : null,
          cfWaSiteId: analyticsSite?.siteId || null,
          cfWaSiteTag: analyticsSite?.siteTag || null,
          cfWaSiteToken: analyticsSite?.siteToken || null,
          cfWaHost: analyticsSite?.host || deploymentHost,
        });
        await syncProjectCustomDomainOrigin(
          dbProjectId || chatId,
          ownerUserId,
          analyticsSite?.host || deploymentHost,
        );
        await recordDeployment(
          dbProjectId || chatId,
          liveUrl,
          "production",
          inputState.access_token,
          r2BundlePrefix || undefined,
        );
      } catch (error) {
        console.warn(
          `[SkillRuntimeExecutor] post-deploy D1 sync warning: ${String((error as any)?.message || error || "unknown")}`,
        );
      }
    }

    let publishedAssetVersion = "";
    try {
      if (ownerUserId) {
        const published = await publishCurrentProjectAssets({
          ownerUserId,
          projectId: chatId,
        });
        publishedAssetVersion = String(published.publishedVersion || "").trim();
      }
    } catch (error) {
      console.warn(
        `[SkillRuntimeExecutor] publishCurrentProjectAssets failed after deploy: ${String((error as any)?.message || error || "unknown")}`,
      );
    }

    const deployLocale = detectLocale(
      extractStateMessageText(inputState.messages),
      (inputState.workflow_context as any)?.preferredLocale,
    );
    const domainGuidance = buildDomainConfigurationGuidance({
      liveUrl,
      deploymentHost,
      locale: deployLocale,
    });
    const deploymentMessageParts = [
      deployLocale === "zh-CN" ? `部署成功：${liveUrl}` : `Deployment successful: ${liveUrl}`,
      publishedAssetVersion ? `(Published assets ${publishedAssetVersion})` : "",
      analyticsStatus === "active"
        ? "(Cloudflare analytics enabled)"
        : analyticsWarning
          ? `(Analytics pending: ${analyticsWarning})`
          : "(Analytics pending)",
      `(Smoke: pre=${preDeploySmoke.status}, post=${postDeploySmoke.status})`,
      "",
      domainGuidance,
    ].filter(Boolean);
    const deploymentMessage = deploymentMessageParts.join("\n");

    const nextState: AgentState = {
      ...inputState,
      phase: "end",
      site_artifacts: deployProject,
      project_json: deployProject,
      deployed_url: liveUrl,
      db_project_id: dbProjectId || chatId,
      workflow_context: {
        ...(inputState.workflow_context || {}),
        deployRequested: false,
        deploySourceProjectPath: String((inputState.workflow_context as any)?.deploySourceProjectPath || ""),
        deploySourceTaskId: String((inputState.workflow_context as any)?.deploySourceTaskId || ""),
        analyticsStatus,
        analyticsSiteTag: analyticsSite?.siteTag || "",
        smoke: {
          preDeploy: preDeploySmoke,
          postDeploy: postDeploySmoke,
        },
        ...(publishedAssetVersion ? { publishedAssetVersion } : {}),
      } as any,
      messages: [
        ...(inputState.messages || []),
        new AIMessage({
          id: crypto.randomUUID(),
          content: deploymentMessage,
          additional_kwargs: {
            actions: [{ text: "View Live Site", payload: liveUrl, type: "url" }],
          },
        }),
      ],
    };

    if (setSessionState) setSessionState(nextState);

    const elapsedMs = Date.now() - startedAt;
    const mergedResult: ChatTaskResult = {
      assistantText: deploymentMessage,
      actions: [{ text: "View Live Site", payload: liveUrl, type: "url" }],
      phase: "end",
      deployedUrl: liveUrl,
      internal: {
        workerId,
        inputState: buildSessionSnapshot(nextState),
        sessionState: buildSessionSnapshot(nextState),
      } as any,
      progress: {
        stage: "deployed",
        stageMessage: "Cloudflare deployment completed.",
        startedAt: new Date(startedAt).toISOString(),
        lastTokenAt: nowIso(),
        elapsedMs,
        attempt: 1,
        fileCount: bundle.fileEntries.length,
        generatedFiles: bundle.fileEntries.map((entry) => normalizePath(String(entry.path || ""))),
        checkpointSaved: false,
        analyticsStatus,
        analyticsSiteTag: analyticsSite?.siteTag || "",
        smoke: {
          preDeploy: preDeploySmoke,
          postDeploy: postDeploySmoke,
        },
        ...(publishedAssetVersion ? { publishedAssetVersion } : {}),
      } as any,
    };

    await completeChatTask(taskId, mergedResult);
  } catch (error) {
    const message = String((error as any)?.message || error || "Deploy failed.");
    await failChatTask(taskId, message);
  }
}

async function runRefineTask(params: {
  taskId: string;
  chatId: string;
  workerId: string;
  inputState: AgentState;
  setSessionState?: (state: AgentState) => void;
}): Promise<void> {
  const { taskId, chatId, workerId, inputState, setSessionState } = params;
  const startedAt = Date.now();
  const checkpointRoot = path.resolve(
    process.cwd(),
    ".tmp",
    "chat-tasks",
    sanitizePathToken(chatId),
    sanitizePathToken(taskId),
  );
  const checkpointProjectPath = path.join(checkpointRoot, "project.json");
  const checkpointStatePath = path.join(checkpointRoot, "state.json");
  const checkpointWorkflowDir = path.join(checkpointRoot, "workflow");
  const checkpointSiteDir = path.join(checkpointRoot, "site");

  await touchChatTaskHeartbeat(taskId, workerId);
  await updateChatTaskProgress(taskId, {
    assistantText: "Refine request accepted. Preparing base project and patch plan.",
    phase: "refine",
    progress: {
      stage: "refining:prepare",
      stageMessage: "Loading latest project baseline...",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs: 0,
      attempt: 1,
      checkpointSaved: false,
    } as any,
  });

  const sourceProject = await resolveDeploySourceProject(inputState);
  if (!sourceProject) {
    await failChatTask(
      taskId,
      "No preview/deployed baseline found for refine. Please generate a site first, then request refinement.",
    );
    return;
  }

  const requirementText = extractRequirementText(inputState);
  const refineSkillEnabledRaw = String(
    process.env.CHAT_REFINE_ENABLE_SKILL ||
      (process.env.NODE_ENV === "test" ? "0" : "1"),
  )
    .trim()
    .toLowerCase();
  const refineSkillEnabled = !["0", "false", "off", "no"].includes(refineSkillEnabledRaw);
  const refineSkillId = resolveProjectSkillAlias(
    String(
      (inputState.workflow_context as any)?.refineSkillId ||
        process.env.CHAT_REFINE_SKILL_ID ||
        "website-refinement-workflow",
    ).trim(),
  );
  let refineSkillDirective = "";
  let effectiveRefineSkillId = refineSkillId;
  let refineSkillError = "";
  let refined: { project: any; changedFiles: string[]; summary?: string } = {
    project: sourceProject,
    changedFiles: [],
  };
  if (refineSkillEnabled) {
    try {
      const refineSkill = await loadProjectSkill(refineSkillId);
      refineSkillDirective = extractSkillDirectiveSnippet(refineSkill, 10_000);
      effectiveRefineSkillId = refineSkill.id;
    } catch {
      // Keep skill id as-is and fall back to heuristic refine when skill loading fails.
      effectiveRefineSkillId = refineSkillId;
    }
    const providerLock = resolveRunProviderRunnerLock({
      provider: (inputState.workflow_context as any)?.lockedProvider,
      model: (inputState.workflow_context as any)?.lockedModel,
    });
    const providerConfig = resolveProviderConfig(providerLock);
    try {
      refined = await applyRefineInstructionWithSkill({
        project: sourceProject,
        instruction: requirementText,
        skillDirective: refineSkillDirective,
        providerConfig,
        timeoutMs: Math.max(30_000, Number(process.env.CHAT_REFINE_TIMEOUT_MS || 120_000)),
      });
    } catch (error) {
      refineSkillError = String((error as any)?.message || "unknown skill refine failure");
    }
  } else {
    effectiveRefineSkillId = `${refineSkillId} (disabled)`;
  }
  if (refined.changedFiles.length === 0) {
    refined = applyRefineInstructionToProject(sourceProject, requirementText);
  }
  const deterministicFixup = applyDeterministicRefineFixups(refined.project, requirementText);
  if (deterministicFixup.changedFiles.length > 0) {
    const mergedChanged = new Set<string>([
      ...refined.changedFiles,
      ...deterministicFixup.changedFiles,
    ]);
    refined = {
      ...refined,
      project: deterministicFixup.project,
      changedFiles: Array.from(mergedChanged).sort((a, b) => a.localeCompare(b)),
    };
  }
  if (refined.changedFiles.length === 0) {
    await failChatTask(
      taskId,
      "Refine request did not match existing site content. Please provide exact target text/selector or a clearer visual change description.",
    );
    return;
  }

  await updateChatTaskProgress(taskId, {
    assistantText: "Applying refinement changes and validating output files.",
    phase: "refine",
    progress: {
      stage: "refining:apply",
      stageMessage: "Applying targeted file patches...",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      attempt: 1,
      checkpointSaved: false,
    } as any,
  });

  await fs.mkdir(checkpointRoot, { recursive: true });
  await fs.mkdir(checkpointWorkflowDir, { recursive: true });
  const materialized = await materializeSiteDirectoryFromProject(refined.project, checkpointSiteDir);
  await fs.writeFile(checkpointProjectPath, JSON.stringify(refined.project, null, 2), "utf8");
  await fs.writeFile(
    path.join(checkpointWorkflowDir, "refine_report.md"),
    [
      "# Refine Report",
      "",
      `- generatedAt: ${nowIso()}`,
      `- refineSkillId: ${effectiveRefineSkillId}`,
      `- refineSkillEnabled: ${refineSkillEnabled ? "true" : "false"}`,
      ...(refineSkillError ? [`- refineSkillError: ${refineSkillError}`] : []),
      `- changedFiles: ${refined.changedFiles.join(", ") || "(none)"}`,
      ...(refined.summary ? [`- summary: ${refined.summary}`] : []),
      "",
      "## Instruction",
      "",
      requirementText || "(empty)",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    checkpointStatePath,
    JSON.stringify(
      {
        savedAt: nowIso(),
        phase: "refine",
        stage: "refined",
        fileCount: materialized.fileCount,
        changedFiles: refined.changedFiles,
      },
      null,
      2,
    ),
    "utf8",
  );

  const nextState: AgentState = {
    ...inputState,
    phase: "end",
    project_json: refined.project,
    site_artifacts: refined.project,
    workflow_context: {
      ...(inputState.workflow_context || {}),
      executionMode: "generate",
      refineRequested: false,
      deployRequested: false,
      checkpointProjectPath,
      deploySourceProjectPath: checkpointProjectPath,
      deploySourceTaskId: taskId,
    } as any,
    messages: [
      ...(inputState.messages || []),
      new AIMessage({
        id: crypto.randomUUID(),
        content: `Refinement completed. Updated ${refined.changedFiles.length} files with your latest changes.`,
      }),
    ],
  };
  if (setSessionState) setSessionState(nextState);

  const elapsedMs = Date.now() - startedAt;
  await syncGeneratedProjectAssetsFromSite({
    ownerUserId: String(inputState.user_id || "").trim() || undefined,
    projectId: chatId,
    taskId,
    siteDir: checkpointSiteDir,
    generatedFiles: materialized.generatedFiles,
  }).catch(() => {
    // Best-effort asset sync should not block task completion.
  });
  const pendingEdits = await readPendingEditsForTask(taskId);
  await completeChatTask(taskId, {
    assistantText: `Refinement completed. Updated ${refined.changedFiles.length} files.`,
    phase: "end",
    internal: {
      workerId,
      inputState: buildSessionSnapshot(nextState),
      sessionState: buildSessionSnapshot(nextState),
      pendingEdits,
    } as any,
    progress: {
      stage: "refined",
      stageMessage: "Refine patch completed successfully.",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs,
      attempt: 1,
      fileCount: materialized.fileCount,
      generatedFiles: materialized.generatedFiles,
      checkpointSaved: true,
      checkpointDir: checkpointRoot,
      checkpointStatePath,
      checkpointProjectPath,
      checkpointSiteDir,
      checkpointWorkflowDir,
      nextStep: "preview",
      pendingEditsCount: pendingEdits.length,
    } as any,
  });
  if (pendingEdits.length > 0) {
    await queuePendingRefineTask({
      taskId,
      chatId,
      ownerUserId: String(inputState.user_id || pendingEdits[pendingEdits.length - 1]?.ownerUserId || "").trim() || undefined,
      baseState: nextState,
      checkpointProjectPath,
      pendingEdits,
    });
  }
}

export class SkillRuntimeExecutor {
  static async runTask(params: SkillRuntimeTaskParams): Promise<void> {
    const { taskId, chatId, inputState, workerId = "worker", setSessionState } = params;
    const executionMode = String((inputState.workflow_context as any)?.executionMode || "").trim().toLowerCase();
    const refineRequested =
      executionMode === "refine" ||
      Boolean((inputState.workflow_context as any)?.refineRequested);
    const deployRequested =
      Boolean((inputState.workflow_context as any)?.deployRequested) ||
      isDeployConfirmationIntent(extractRequirementText(inputState));
    if (refineRequested && !deployRequested) {
      await runRefineTask({ taskId, chatId, workerId, inputState, setSessionState });
      return;
    }
    if (deployRequested) {
      await runDeployOnlyTask({ taskId, chatId, workerId, inputState, setSessionState });
      return;
    }

    const startedAt = Date.now();
    const resolvedSkill = await resolveWebsiteRuntimeSkill({
      state: inputState,
      explicitSkillId: params.skillId,
    });
    const preparedState = resolvedSkill.state;
    const { loadedSkill, skillDirective } = resolvedSkill;
    const decision = buildLocalDecisionPlan(preparedState);
    const lock = resolveRunProviderRunnerLock({
      provider: (preparedState as any)?.workflow_context?.lockedProvider,
      model: (preparedState as any)?.workflow_context?.lockedModel,
    });
    const taskTimeoutMs = Math.max(60_000, Number(process.env.CHAT_ASYNC_TASK_TIMEOUT_MS || 900_000));
    let stepCount = 0;
    let latestCheckpointSiteDir = "";
    let latestCheckpointWorkflowDir = "";

    const stateWithLock = bindRunProviderLockToState(
      {
        ...preparedState,
        phase: "skeleton",
        sitemap: decision.routes,
        workflow_context: {
          ...(preparedState.workflow_context || {}),
          runMode: "async-task",
          genMode: "skill_native",
          generationMode: "skill-native",
          sourceRequirement: decision.requirementText || (preparedState.workflow_context as any)?.sourceRequirement,
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
        assistantText: "Worker started skill-native runtime. Selecting design system and confirming tokens.",
        phase: "skeleton",
        progress: {
          stage: "generating:design_confirm",
          stageMessage: "Selecting design system and preparing confirmation...",
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
          latestCheckpointSiteDir = persisted.latestSiteDir;
          latestCheckpointWorkflowDir = persisted.latestWorkflowDir;
          const stageMessage = toProgressStageMessage(snapshot.status, snapshot.stepIndex, snapshot.totalSteps);
          try {
            await touchChatTaskHeartbeat(taskId, workerId);
            await updateChatTaskProgress(taskId, {
              assistantText: stageMessage,
              phase: "skeleton",
              progress: {
                stage: snapshot.status,
                stageMessage,
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
                changedFiles: persisted.changedFiles.map((file) => normalizePath(file)),
                changedWorkflowFiles: persisted.changedWorkflowFiles.map((file) => normalizePath(file)),
                checkpointSaved: true,
                checkpointDir: persisted.latestDir,
                checkpointStepDir: persisted.localDir,
                checkpointSiteDir: latestCheckpointSiteDir,
                checkpointWorkflowDir: latestCheckpointWorkflowDir,
                r2UploadedCount: persisted.r2UploadedCount,
                r2UploadError: persisted.r2Error || null,
              } as any,
            });
          } catch (progressError) {
            console.warn("[SkillRuntimeExecutor] continuing after non-fatal step progress update failure:", progressError);
          }
        },
      });

      const checkpointProjectPath = path.join(checkpointRoot, "project.json");
      const sessionStateForNext: AgentState = {
        ...(summary.state as any),
        workflow_context: {
          ...((summary.state as any)?.workflow_context || {}),
          deploySourceProjectPath: checkpointProjectPath,
          deploySourceTaskId: taskId,
          checkpointProjectPath,
          deployRequested: false,
        },
      };

      if (setSessionState) setSessionState(sessionStateForNext);
      await fs.mkdir(checkpointRoot, { recursive: true });
      await fs.writeFile(path.join(checkpointRoot, "state.json"), JSON.stringify({
        savedAt: nowIso(),
        phase: summary.phase,
        pageCount: summary.pageCount,
        fileCount: summary.fileCount,
        completedPhases: summary.completedPhases,
      }, null, 2), "utf8");
      await fs.writeFile(checkpointProjectPath, JSON.stringify((summary.state as any)?.site_artifacts || null, null, 2), "utf8");

      const elapsedMs = Date.now() - startedAt;
      const pendingEdits = await readPendingEditsForTask(taskId);
      const mergedResult: ChatTaskResult = {
        assistantText: summary.assistantText,
        actions: summary.actions,
        phase: summary.phase,
        deployedUrl: summary.deployedUrl,
        internal: {
          skillId: loadedSkill.id,
          workerId,
          inputState: buildSessionSnapshot(sessionStateForNext),
          sessionState: buildSessionSnapshot(sessionStateForNext),
          pendingEdits,
        } as any,
        progress: {
          stage: "done",
          stageMessage: "Generation completed successfully.",
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
          checkpointProjectPath,
          checkpointSiteDir: latestCheckpointSiteDir,
          checkpointWorkflowDir: latestCheckpointWorkflowDir,
          round: stepCount,
          maxRounds: stepCount,
          pendingEditsCount: pendingEdits.length,
        } as any,
      };

      if (summary.phase !== "end" || isAssistantFailureSemantic(summary.assistantText)) {
        await failChatTask(taskId, summary.assistantText || "skill-runtime ended without completion");
        return;
      }

      await syncGeneratedProjectAssetsFromSite({
        ownerUserId: String(inputState.user_id || "").trim() || undefined,
        projectId: chatId,
        taskId,
        siteDir: latestCheckpointSiteDir,
        generatedFiles: summary.generatedFiles,
      }).catch(() => {
        // Best-effort asset sync should not block task completion.
      });

      await completeChatTask(taskId, mergedResult);
      if (pendingEdits.length > 0) {
        await queuePendingRefineTask({
          taskId,
          chatId,
          ownerUserId: String(inputState.user_id || pendingEdits[pendingEdits.length - 1]?.ownerUserId || "").trim() || undefined,
          baseState: sessionStateForNext,
          checkpointProjectPath,
          pendingEdits,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateChatTaskProgress(taskId, {
        assistantText: message,
        progress: {
          stage: "failed",
          stageMessage: "Generation failed.",
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
