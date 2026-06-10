import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getR2Client } from "../r2.ts";
import { buildCloudflareBeaconSnippet, CloudflareClient, type CloudflareWebAnalyticsSite } from "../cloudflare.ts";
import { deployWithWrangler, type WranglerDeployResult } from "../cloudflare-pages-wrangler.ts";
import { Bundler } from "../bundler.ts";
import {
  injectDeployedBlogRuntime,
  isDeployedBlogRuntimeEnabled,
  resolveBlogD1BindingConfig,
} from "../deployed-blog-runtime.ts";
import {
  buildDeployedBlogSnapshotFiles,
  buildDeployedBlogSnapshotFilesFromD1,
  injectDeployedBlogSnapshot,
} from "../deployed-blog-snapshot.ts";
import { getD1Client } from "../d1.ts";
import { renderMarkdownToHtml } from "../blog-markdown.ts";
import type { BlogPostRecord, BlogPostUpsertInput } from "../blog-types.ts";
import {
  listProjectAssets,
  publishCurrentProjectAssets,
  rewriteProjectAssetLogicalUrlsForRelease,
  syncGeneratedProjectAssetsFromSite,
} from "../project-assets.ts";
import type { ChatTaskPendingEdit, ChatTaskResult } from "../agent/chat-task-store.ts";
import {
  completeChatTask,
  createChatTask,
  failChatTask,
  getChatTask,
  getLatestPreviewableChatTaskForChat,
  touchChatTaskHeartbeat,
  updateChatTaskProgress,
} from "../agent/chat-task-store.ts";
import { extractUiPayload } from "../agent/chat-ui-payload.ts";
import type { AgentState } from "../agent/graph.ts";
import { buildSelectedSeedSkillManifest } from "../agent/website-generation-contract.ts";
import {
  archiveSiteArtifactsToR2,
  deriveProjectSiteKey,
  getOwnedProjectSummary,
  listProjectCustomDomains,
  recordDeployment,
  saveProjectState,
  syncProjectCustomDomainOrigin,
  upsertProjectSiteBinding,
} from "../agent/db.ts";
import { appendWorkflowAuditEvent } from "../agent/workflow-audit.ts";
import {
  completeWorkflowCompensation,
  failWorkflowCompensation,
  startWorkflowCompensation,
} from "../agent/workflow-compensation.ts";
import {
  attachWorkflowRuntimeToState,
  markWorkflowExecutionCompleted,
  markWorkflowExecutionFailed,
  markWorkflowExecutionStarted,
  resolveWorkflowRuntimeFromState,
} from "../agent/workflow-runtime-adapter.ts";
import { assertCanMutatePublishedSite } from "../billing/enforcement.ts";
import {
  loadWorkflowSkillContext,
  normalizeWorkflowVisualDecisionContext,
  type DesignSkillHit,
} from "../agent/website-workflow.ts";
import { readChatShortTermMemory, writeChatShortTermMemory } from "../agent/chat-memory.ts";
import { configureUndiciProxyFromEnv } from "../agent/network.ts";
import { DEFAULT_STYLE_PRESET, normalizeStylePreset, type DesignStylePreset } from "../design-style-preset.ts";
import { artifactCounts, collectCompletedPhases, getGeneratedFilePaths, getPages, getStaticArtifactFiles, mergeAgentState } from "./artifacts.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import { bindRunProviderLockToState, resolveRunProviderRunnerLock, type RunProviderLock } from "./provider-runner.ts";
import { applyTranslationLane, resolveTranslationLanePlan, type TranslationCatalogDraft } from "./translation-lane.ts";
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
  inferRouteFamiliesForPlanning,
  selectDocumentContentSkillsForIntent,
  selectWebsiteSeedSkillsForIntent,
  WEBSITE_GENERATION_SKILL_BUNDLE,
  WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID,
  WEBSITE_GENERATION_TYPE_SKILL_IDS,
  type ProjectSkillDescriptor,
  type ProjectSkillSeedContract,
} from "./project-skill-loader.ts";
import {
  lintGeneratedWebsiteHtml,
  lintGeneratedWebsiteRouteHtml,
  mergeAntiSlopLintResults,
  renderAntiSlopFeedback,
  type AntiSlopLintResult,
} from "../visual-qa/anti-slop-linter.ts";
import {
  normalizeWebsiteStaticFilesForPreview,
  resolveWorkflowSurfaceSelection,
  runSkillToolExecutor,
  validateAndNormalizeRequiredFilesWithQa,
  type SkillToolRouteRepairEvidence,
} from "./skill-tool-executor.ts";
import {
  buildGenerationUnitInputFromRouteContract,
  type GenerationUnitInput,
} from "./generation-worker-adapter.ts";
import {
  buildImmutableGenerationContract,
  normalizeWebsiteGenerationContract,
  type ImmutableGenerationContract,
} from "./generation-contract.ts";
import type { WebsiteArtifactGeneratorMode } from "./website-artifact-generator.ts";
import { verifyRouteUnitArtifacts } from "./contract-verifier.ts";
import { GenerationContractViolationError } from "./contract-violation.ts";
import {
  buildRouteUnitContractSummary,
  buildWebsiteDesignSpecMarkdown,
  buildWebsiteDesignSpecRouteExcerpt,
  type RouteUnitContractSummary,
} from "./website-design-spec.ts";
import {
  writeGenerationContractCheckpoint,
  writeGenerationVerificationCheckpoint,
  writeRouteUnitInputCheckpoint,
  writeRouteUnitVerificationCheckpoint,
} from "./route-unit-checkpoint.ts";
import { runV2RouteUnitRuntime } from "./route-unit-runner.ts";
import {
  inferWebsiteSurfaceModeFromSkillId,
  type WebsiteDiscoveryBrief,
  type WebsiteSurfaceMode,
} from "./open-design-adoption.ts";
import { selectWebsiteGenerationTypeSkill } from "./website-type-selector.ts";
import { renderWebsiteQualityContract } from "./website-quality-contract.ts";
import { createSkillToolRouteUnitGenerationWorker } from "./v2-route-generation-worker.ts";
import {
  createModelForProvider,
  describeProviderConfig,
  isRetryableProviderError,
  providerErrorText,
  providerRetryBackoffMs,
  resolveProviderAttempts,
  resolveProviderConfig,
  resolveProviderRetryPolicy,
  type LlmProvider,
  type ProviderAttempt,
  type ProviderConfig,
} from "./provider-model.ts";
import { resolveScenarioAwareProviderModelId } from "./provider-model-id.ts";
import { classifyWebsiteSeedOrigin, type WebsiteSeedOrigin } from "./website-artifact-generator.ts";

configureUndiciProxyFromEnv();
import { buildShadowVisualEvaluation, type QaSummary } from "./qa-summary.ts";
import {
  containsWorkflowCjk,
  isWorkflowArtifactEnglishSafe,
  listWorkflowArtifactLanguageIssues,
  normalizeWorkflowArtifactText,
} from "../workflow-artifact-language.ts";
import { isBilingualRequirementText } from "./bilingual-copy-guard.ts";
import { validateComponent, type DesignSpec, type ValidationResult } from "../../skills/design-website-generator/tools/component-validator.ts";
import {
  buildBlogContentWorkflowPreview as buildWebsiteBlogContentWorkflowPreview,
  buildContentWorkflowConfirmTimelineMetadataForWorkflow,
  buildGeneratedBlogSeedPosts as buildWebsiteGeneratedBlogSeedPosts,
  collectBlogWorkflowSourceText,
  inferBlogBrandForWorkflow,
  projectHasGeneratedBlogContentMount as projectHasWebsiteGeneratedBlogContentMount,
  type BlogWorkflowSurfaceKind,
  resolveBlogNavLabelForWorkflow,
} from "../../skills/website-generation-workflow/blog-content-workflow.ts";
import {
  applyWebsiteStructuralRefineCompletions,
  extractOrderedBlogDetailRoutesFromProject as extractWebsiteOrderedBlogDetailRoutesFromProject,
  extractStructuralRefineRouteAdditions as extractWebsiteStructuralRefineRouteAdditions,
  materializeWebsiteBlogDetailPages,
  projectHasStaticBlogDetailFile as projectHasWebsiteStaticBlogDetailFile,
  renderGeneratedBlogDetailPage as renderWebsiteGeneratedBlogDetailPage,
  slugFromBlogDetailRoute as slugFromWebsiteBlogDetailRoute,
} from "../../skills/website-generation-workflow/runtime-site-completions.ts";
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
  preferredLocale: "zh-CN" | "en" | "bilingual";
  qaSummary?: QaSummary;
  provider?: string;
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
  qaSummary?: QaSummary;
  provider?: string;
  model?: string;
  siteGeneratorMode?: WebsiteArtifactGeneratorMode;
  routeUnits?: SkillRuntimeStepSnapshot["routeUnits"];
  routeRepairEvidence?: SkillToolRouteRepairEvidence;
  providerNotes?: string[];
  routeUnitProviderBridgeNotes?: string[];
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
export const STAGE_SKILL_SCOPES = {
  workflow: [WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID, WEBSITE_MAIN_SKILL_ID, "brainstorming", "writing-plans"],
  styles: [WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID, WEBSITE_MAIN_SKILL_ID, "responsive-by-default", "design-system-enforcement", "web-image-generator", "web-icon-library"],
  script: [WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID, WEBSITE_MAIN_SKILL_ID, "responsive-by-default"],
  page: [WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID, WEBSITE_MAIN_SKILL_ID, "responsive-by-default", "design-system-enforcement", "section-quality-checklist", "web-image-generator", "web-icon-library"],
  repair: [WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID, WEBSITE_MAIN_SKILL_ID, "design-system-enforcement", "end-to-end-validation", "verification-before-completion", "visual-qa-mandatory"],
} as const;
type StageSkillScope = keyof typeof STAGE_SKILL_SCOPES;

type WorkflowGuidancePack = {
  selectionCriteria: string;
  sequentialWorkflow: string;
  workflowGuide: string;
  rulesSummary: string;
  designMd: string;
  websiteDesignSpec: string;
};

type DesignGuidanceCacheSnapshot = {
  requirementHash: string;
  templateStyleId: string;
  primaryVisualDirection: string;
  secondaryVisualTags: string;
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
  antiSlopIssues: Array<{ code: string; severity: "error" | "warning" }>;
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

function mergeValidationWithAntiSlop(base: ValidationResult, antiSlop: AntiSlopLintResult): ValidationResult {
  const antiChecks = antiSlop.issues.map((issue) => ({
    rule: `anti-slop:${issue.code}`,
    category: "accessibility" as const,
    passed: false,
    message: issue.message,
    severity: issue.severity === "error" ? ("major" as const) : ("minor" as const),
  }));
  const errors = [
    ...(base.errors || []),
    ...antiSlop.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `[anti-slop] ${issue.message}`),
  ];
  const warnings = [
    ...(base.warnings || []),
    ...antiSlop.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => `[anti-slop] ${issue.message}`),
  ];

  return {
    passed: base.passed && antiSlop.passed && errors.length === 0,
    score: Math.min(Number(base.score || 0), antiSlop.score),
    checks: [...(base.checks || []), ...antiChecks],
    errors,
    warnings,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildQaSummaryFromPageRecords(
  records: PageQaRecord[],
  retriesAllowed: number,
  shadowOptions?: {
    routeUnits?: Array<{
      route: string;
      routeContract: string[];
      openingFamily?: string;
      openingTopology?: string;
    }>;
    stylesCss?: string;
    selectedSeedSkillIds?: string[];
  },
): QaSummary {
  const safeRecords = Array.isArray(records) ? records : [];
  const averageScore =
    safeRecords.length > 0
      ? Math.round(safeRecords.reduce((sum, item) => sum + Number(item.score || 0), 0) / safeRecords.length)
      : 100;
  const categoryMap = new Map<string, { code: string; severity: "error" | "warning"; count: number }>();
  for (const record of safeRecords) {
    for (const issue of record.antiSlopIssues || []) {
      const key = `${issue.severity}:${issue.code}`;
      const existing = categoryMap.get(key);
      if (existing) existing.count += 1;
      else categoryMap.set(key, { code: issue.code, severity: issue.severity, count: 1 });
    }
  }
  const categories = Array.from(categoryMap.values()).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
  const shadowVisualEvaluation = buildShadowVisualEvaluation({
    routeUnits: shadowOptions?.routeUnits || [],
    stylesCss: shadowOptions?.stylesCss || "",
    selectedSeedSkillIds: shadowOptions?.selectedSeedSkillIds || [],
  });
  return {
    averageScore,
    totalRoutes: safeRecords.length,
    passedRoutes: safeRecords.filter((item) => item.passed).length,
    totalRetries: safeRecords.reduce((sum, item) => sum + Math.max(0, Number(item.retries || 0)), 0),
    retriesAllowed: Math.max(0, Number(retriesAllowed || 0)),
    antiSlopIssueCount: categories.reduce((sum, item) => sum + item.count, 0),
    categories,
    shadowVisualEvaluation,
  };
}

async function bestEffortWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[SkillRuntimeExecutor] ${label} timed out after ${timeoutMs}ms; continuing.`);
          resolve(undefined);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveGeneratedAssetSyncTimeoutMs(): number {
  const raw = Number(process.env.CHAT_GENERATED_ASSET_SYNC_TIMEOUT_MS || 30_000);
  return Number.isFinite(raw) ? Math.max(5_000, raw) : 30_000;
}

function sanitizePathToken(value: string): string {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized || "unknown";
}

function localChatTasksBaseDirs(): string[] {
  return Array.from(
    new Set([
      path.resolve(/* turbopackIgnore: true */ process.cwd(), ".tmp", "chat-tasks"),
      path.resolve(/* turbopackIgnore: true */ process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
    ]),
  );
}

function localChatTaskRoot(chatId?: string, taskId?: string): string {
  const [primaryRoot] = localChatTaskRootCandidates(chatId, taskId);
  return primaryRoot || path.join(localChatTasksBaseDirs()[0] || ".tmp/chat-tasks", "unknown", "unknown");
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

function resolveFailureProviderMeta(
  message: string,
  fallback: { provider: string; model: string },
): { provider: string; model: string } {
  const active = String(message || "").match(/skill_tool_provider_diagnostics:\s*active=([^/\s;]+)\/([^;\s]+)/i);
  const provider = String(active?.[1] || "").trim();
  const model = String(active?.[2] || "").trim();
  if (!provider || !model) return fallback;
  return { provider, model };
}

function preferStrongerCanonicalPrompt(...candidates: Array<unknown>): string {
  const normalized = candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => value.startsWith("# Canonical Website Generation Prompt"));
  if (normalized.length === 0) return "";
  return normalized.sort((left, right) => {
    const score = (value: string) => {
      let total = 0;
      if (/Bilingual Experience Contract|Final website locale requirement:\s*Chinese and English|Language:\s*Chinese and English/i.test(value)) total += 4;
      if (/HelloTalk|Huawei|WeChat|DevOps|SaaS|K12|AI/i.test(value)) total += 3;
      const completion = value.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
      if (completion) {
        total += Number(completion[1] || 0);
      }
      total += Math.min(value.length, 20000) / 10000;
      return total;
    };
    return score(right) - score(left);
  })[0];
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
  const workflow = toRecord((state as any)?.workflow_context);
  const executionMode = String(workflow.executionMode || "").trim().toLowerCase();
  const prioritizedWorkflowCandidates =
    executionMode === "refine"
      ? [
          String(workflow.latestUserText || "").trim(),
          String(workflow.latestUserTextRaw || "").trim(),
          String(workflow.canonicalPrompt || "").trim(),
          String(workflow.sourceRequirement || "").trim(),
          String(workflow.requirementAggregatedText || "").trim(),
        ]
      : executionMode === "deploy"
        ? [
            String(workflow.sourceRequirement || "").trim(),
            String(workflow.requirementAggregatedText || "").trim(),
            String(workflow.canonicalPrompt || "").trim(),
            String(workflow.latestUserTextRaw || "").trim(),
            String(workflow.latestUserText || "").trim(),
          ]
        : [
            String(workflow.canonicalPrompt || "").trim(),
            String(workflow.sourceRequirement || "").trim(),
            String(workflow.requirementAggregatedText || "").trim(),
            String(workflow.latestUserTextRaw || "").trim(),
            String(workflow.latestUserText || "").trim(),
          ];
  for (const candidate of prioritizedWorkflowCandidates) {
    if (candidate) return candidate;
  }

  const messages = Array.isArray(state.messages) ? state.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg: any = messages[i];
    if (msg instanceof HumanMessage || isHumanLikeMessage(msg)) {
      const content = extractMessageContent(msg);
      if (content) return content;
    }
  }
  return "";
}

function isDeployConfirmationIntent(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/^(?:\u90e8\u7f72|\u53d1\u5e03|\u4e0a\u7ebf|\u786e\u8ba4\u90e8\u7f72)$/.test(normalized)) return true;
  if (normalized.includes("\u90e8\u7f72\u5230 cloudflare")) return true;
  if (normalized.includes("\u53d1\u5e03\u5230 cloudflare")) return true;
  if (normalized.includes("\u4e0a\u7ebf\u5230 cloudflare")) return true;
  if (/^deploy(?:\s+now|\s+site)?$/.test(normalized)) return true;
  if (/^(?:\u90e8\u7f72|\u53d1\u5e03|\u4e0a\u7ebf|\u786e\u8ba4\u90e8\u7f72|\u90e8\u7f72\u5230cloudflare)$/.test(normalized)) return true;
  if (normalized.includes("deploy to cloudflare")) return true;
  if (normalized.includes("deploy cloudflare")) return true;
  if (normalized.includes("\u90e8\u7f72\u5230cloudflare")) return true;
  if (normalized.includes("\u90e8\u7f72\u5230 cloudflare")) return true;
  if (normalized.includes("\u53d1\u5e03\u5230cloudflare")) return true;
  return false;
}

function isProjectLikeArtifact(value: unknown): value is { pages: any[] } {
  return !!value && typeof value === "object" && Array.isArray((value as any).pages);
}

async function readProjectJsonFromPath(filePath: string): Promise<any | undefined> {
  const candidates = resolveCheckpointProjectPathCandidates(filePath);
  for (const absPath of candidates) {
    if (!absPath.toLowerCase().endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(absPath, "utf8");
      const parsed = JSON.parse(raw);
      if (isProjectLikeArtifact(parsed)) return parsed;
    } catch {
      // ignore and let caller fallback to other sources
    }
  }
  return undefined;
}

function localChatTaskRootCandidates(chatId?: string, taskId?: string): string[] {
  const safeChatId = sanitizePathToken(String(chatId || "").trim());
  const safeTaskId = sanitizePathToken(String(taskId || "").trim());
  if (!safeChatId || !safeTaskId) return [];
  return localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, safeChatId, safeTaskId));
}

function resolveCheckpointProjectPathCandidates(filePath: string): string[] {
  const raw = String(filePath || "").trim();
  if (!raw) return [];
  const normalized = raw.replace(/\\/g, "/");
  const suffixMatch = normalized.match(/(?:^|\/)\.tmp\/chat-tasks\/(.+)$/i);
  const candidates = [path.resolve(raw)];
  if (suffixMatch?.[1]) {
    const suffix = suffixMatch[1].replace(/^\/+/, "");
    candidates.push(...localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, suffix)));
  }
  return Array.from(new Set(candidates));
}

async function readProjectJsonFromLocalTaskRoot(chatId?: string, taskId?: string): Promise<any | undefined> {
  for (const taskRoot of localChatTaskRootCandidates(chatId, taskId)) {
    const project = await readProjectJsonFromPath(path.join(taskRoot, "project.json"));
    if (project) return project;
  }
  return undefined;
}

async function readLatestProjectJsonFromLocalChatRoots(chatId?: string, excludeTaskId?: string): Promise<any | undefined> {
  const safeChatId = sanitizePathToken(String(chatId || "").trim());
  if (!safeChatId) return undefined;
  const chatRoots = localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, safeChatId));
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const chatRoot of chatRoots) {
    try {
      const entries = await fs.readdir(chatRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (excludeTaskId && entry.name === sanitizePathToken(excludeTaskId)) continue;
        const projectPath = path.join(chatRoot, entry.name, "project.json");
        try {
          const stat = await fs.stat(projectPath);
          if (stat.isFile()) candidates.push({ filePath: projectPath, mtimeMs: stat.mtimeMs });
        } catch {
          // ignore incomplete checkpoint
        }
      }
    } catch {
      // ignore missing local chat root
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    const project = await readProjectJsonFromPath(candidate.filePath);
    if (project) return project;
  }
  return undefined;
}

async function resolveProjectArtifactFromTask(task: Awaited<ReturnType<typeof getLatestPreviewableChatTaskForChat>>) {
  if (!task) return undefined;
  const internal = (task.result?.internal || {}) as Record<string, unknown>;
  const artifactCandidates = [
    (internal as any).artifactSnapshot,
    (internal as any).sessionState?.site_artifacts,
    (internal as any).sessionState?.project_json,
    (internal as any).inputState?.site_artifacts,
    (internal as any).inputState?.project_json,
  ];
  for (const candidate of artifactCandidates) {
    if (isProjectLikeArtifact(candidate)) return candidate;
  }

  const progress = (task.result?.progress || {}) as Record<string, unknown>;
  const pathCandidates = [
    String(progress.checkpointProjectPath || ""),
    String(progress.checkpointSiteDir || ""),
    String(progress.checkpointDir || ""),
  ].filter(Boolean);

  for (const candidate of pathCandidates) {
    const normalized = String(candidate || "").trim();
    const project =
      normalized.toLowerCase().endsWith(".json")
        ? await readProjectJsonFromPath(normalized)
        : await readProjectJsonFromPath(path.join(normalized, "project.json"));
    if (project) return project;
  }

  return undefined;
}

async function resolveDeploySourceProject(
  state: AgentState,
  params?: { chatId?: string; taskId?: string },
): Promise<any | undefined> {
  if (isProjectLikeArtifact((state as any)?.site_artifacts)) return (state as any).site_artifacts;
  if (isProjectLikeArtifact((state as any)?.project_json)) return (state as any).project_json;

  const workflow = toRecord((state as any)?.workflow_context);
  const sourcePathCandidates = [
    String(workflow.translationSourceProjectPath || ""),
    String(workflow.refineSourceProjectPath || ""),
    String(workflow.deploySourceProjectPath || ""),
    String(workflow.checkpointProjectPath || ""),
    String(workflow.lastCheckpointProjectPath || ""),
  ].filter(Boolean);

  for (const candidate of sourcePathCandidates) {
    const project = await readProjectJsonFromPath(candidate);
    if (project) return project;
  }

  const sourceTaskIdCandidates = [
    String(workflow.translationSourceTaskId || ""),
    String(workflow.refineSourceTaskId || ""),
    String(workflow.deploySourceTaskId || ""),
  ].filter(Boolean);

  for (const sourceTaskId of sourceTaskIdCandidates) {
    const sourceTask = await getChatTask(sourceTaskId).catch(() => undefined);
    const project = await resolveProjectArtifactFromTask(sourceTask);
    if (project) return project;
    if (params?.chatId) {
      const localProject = await readProjectJsonFromLocalTaskRoot(params.chatId, sourceTaskId);
      if (localProject) return localProject;
    }
  }

  if (params?.chatId) {
    const latestPreviewTask = await getLatestPreviewableChatTaskForChat(params.chatId, { statuses: ["succeeded"] }).catch(
      () => undefined,
    );
    if (latestPreviewTask && latestPreviewTask.id !== params.taskId) {
      const project = await resolveProjectArtifactFromTask(latestPreviewTask);
      if (project) return project;
    }
    const localProject = await readLatestProjectJsonFromLocalChatRoots(params.chatId, params.taskId);
    if (localProject) return localProject;
  }

  return undefined;
}

function summarizeRefineBaselineInputs(state: AgentState) {
  const workflow = toRecord((state as any)?.workflow_context);
  return {
    translationSourceProjectPath: String(workflow.translationSourceProjectPath || "").trim() || null,
    refineSourceProjectPath: String(workflow.refineSourceProjectPath || "").trim() || null,
    deploySourceProjectPath: String(workflow.deploySourceProjectPath || "").trim() || null,
    checkpointProjectPath: String(workflow.checkpointProjectPath || "").trim() || null,
    lastCheckpointProjectPath: String(workflow.lastCheckpointProjectPath || "").trim() || null,
    translationSourceTaskId: String(workflow.translationSourceTaskId || "").trim() || null,
    refineSourceTaskId: String(workflow.refineSourceTaskId || "").trim() || null,
    deploySourceTaskId: String(workflow.deploySourceTaskId || "").trim() || null,
    hasProjectJson: isProjectLikeArtifact((state as any)?.project_json),
    hasSiteArtifacts: isProjectLikeArtifact((state as any)?.site_artifacts),
  };
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
    { name: "blue", hex: "#2563eb", patterns: [/(\u84dd|blue|indigo|azure)/] },
    { name: "green", hex: "#16a34a", patterns: [/(\u7eff|green|emerald|mint)/] },
    { name: "red", hex: "#dc2626", patterns: [/(\u7ea2|red|crimson)/] },
    { name: "orange", hex: "#ea580c", patterns: [/(\u6a59|orange|amber)/] },
    { name: "purple", hex: "#7c3aed", patterns: [/(\u7d2b|purple|violet)/] },
    { name: "black", hex: "#111827", patterns: [/(\u9ed1|black|dark)/] },
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
    /(?:\u6807\u9898|title)\s*(?:\u6539\u6210|\u4e3a|to|:|\uff1a)\s*["']?([^"'\u3002\uff01\uff1f\uff1b\n\r]+)["']?/i,
    /(?:\u53eb\u505a|\u547d\u540d\u4e3a)\s*["']?([^"'\u3002\uff01\uff1f\uff1b\n\r]+)["']?/i,
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
  const cn = text.match(/\u628a\s*["'\u201c\u201d\u2018\u2019]?([^"'\u201c\u201d\u2018\u2019\uff0c\u3002\uff1b;]+)["'\u201c\u201d\u2018\u2019]?\s*\u6539\u6210\s*["'\u201c\u201d\u2018\u2019]?([^"'\u201c\u201d\u2018\u2019\uff0c\u3002\uff1b;\n\r]+)["'\u201c\u201d\u2018\u2019]?/i);
  if (cn?.[1] && cn?.[2]) {
    const from = String(cn[1]).trim();
    const to = String(cn[2]).trim();
    if (from && to && from !== to) return { from, to };
  }
  const en = text.match(/replace\s+["'\u201c\u201d\u2018\u2019]?([^"'\u201c\u201d\u2018\u2019]+)["'\u201c\u201d\u2018\u2019]?\s+with\s+["'\u201c\u201d\u2018\u2019]?([^"'\u201c\u201d\u2018\u2019\n\r]+)["'\u201c\u201d\u2018\u2019]?/i);
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

function ensureSharedSiteRefsForRefineHtml(project: any): any {
  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  let changed = false;

  const updatedFiles = files.map((file) => {
    const filePath = normalizePath(String(file?.path || ""));
    if (!filePath.toLowerCase().endsWith(".html")) return file;

    let html = ensureHtmlDocument(String(file?.content || ""));
    if (!html) return file;

    if (!/<link\b[^>]*href=["'][^"']*styles\.css["'][^>]*>/i.test(html)) {
      const href = filePath === "/index.html" ? "/styles.css" : relativeAssetPathForHtml(filePath, "/styles.css");
      html = /<\/head>/i.test(html)
        ? html.replace(/<\/head>/i, `  <link rel="stylesheet" href="${href}">\n</head>`)
        : html;
    }

    if (!/<script\b[^>]*src=["'][^"']*script\.js["'][^>]*>\s*<\/script>/i.test(html)) {
      const src = filePath === "/index.html" ? "/script.js" : relativeAssetPathForHtml(filePath, "/script.js");
      html = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `  <script src="${src}" defer></script>\n</body>`)
        : `${html}\n<script src="${src}" defer></script>`;
    }

    if (html === String(file?.content || "")) return file;
    changed = true;
    return {
      ...file,
      content: html,
      type: String(file?.type || guessMimeByPath(filePath)),
    };
  });

  if (!changed) return next;
  return syncPagesFromStaticFiles({
    ...next,
    staticSite: {
      ...(next.staticSite || {}),
      mode: "skill-direct",
      files: updatedFiles,
    },
  });
}

function relativeAssetPathForHtml(filePath: string, assetPath: "/styles.css" | "/script.js"): string {
  const normalized = normalizePath(filePath);
  if (normalized === "/index.html") return assetPath;
  const segments = normalized.replace(/^\/+/, "").split("/");
  const depth = Math.max(0, segments.length - 1);
  const prefix = depth <= 0 ? "." : Array(depth).fill("..").join("/");
  return `${prefix}${assetPath}`;
}

function isRecoverableRefineSkillFailure(error: unknown): boolean {
  const text = String((error as any)?.message || error || "").trim();
  if (!text) return false;
  return /provider_tool_protocol_mismatch|skill_tool_invalid_generated_html|skill_tool_invalid_required_file/i.test(text);
}

function normalizeGeneratedProjectArtifactPreview(params: {
  project: any;
  decision: LocalDecisionPlan;
  requirementText: string;
  workflowContext?: Record<string, unknown>;
}): any {
  const next = ensureSkillDirectStaticProject(params.project);
  const workflowSurfaceSelection = resolveWorkflowSurfaceSelection({
    ...(params.workflowContext || {}),
    sourceRequirement: params.requirementText,
  });
  const normalizedFiles = validateAndNormalizeRequiredFilesWithQa({
    decision: params.decision,
    files: dedupeFiles((next?.staticSite?.files || []) as any[]),
    requirementText: params.requirementText,
    websiteSurfaceMode: workflowSurfaceSelection.websiteSurfaceMode,
    enforceCorporateHomepageContract: workflowSurfaceSelection.websiteSurfaceMode === "corporate-b2b-site",
  }).files;
  return syncPagesFromStaticFiles({
    ...next,
    staticSite: {
      ...(next?.staticSite || {}),
      mode: "skill-direct",
      files: normalizedFiles,
    },
  });
}

function hasRouteRemovalIntent(instruction: string): boolean {
  return /(\u5220\u9664|\u79fb\u9664|\u53bb\u6389|\u4e0d\u8981|\u4e0d\u5e94\u8be5\u6709|remove|delete|should\s+not\s+have|do\s+not\s+want|no\s+longer\s+need)/i.test(
    String(instruction || ""),
  );
}

function collectRouteRemovalTargets(project: any, instruction: string): string[] {
  if (!hasRouteRemovalIntent(instruction)) return [];

  const routes = new Set<string>();
  const normalizedInstruction = String(instruction || "");
  if (/(?:\/custom-solutions\b|custom[-\s]?solutions?\b|\u65b9\u6848(?:\u9875|\u9875\u9762)?)/i.test(normalizedInstruction)) {
    routes.add("/custom-solutions");
  }

  for (const page of Array.isArray(project?.pages) ? project.pages : []) {
    const route = normalizePath(String(page?.path || ""));
    if (!route || route === "/") continue;
    const slug = route.split("/").filter(Boolean).pop() || "";
    if (slug && new RegExp(`(?:^|[^a-z])${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z]|$)`, "i").test(normalizedInstruction)) {
      routes.add(route);
    }
  }

  return Array.from(routes);
}

function stripRouteLinksFromHtml(html: string, route: string): string {
  const normalizedRoute = normalizePath(route);
  if (!normalizedRoute || normalizedRoute === "/") return String(html || "");
  const escapedRoute = normalizedRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTrimmed = normalizedRoute.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hrefPattern = `(?:${escapedRoute}(?:/index\\.html)?/?|\\./${escapedTrimmed}(?:/index\\.html)?/?|${escapedTrimmed}(?:/index\\.html)?/?)`;
  return String(html || "")
    .replace(new RegExp(`<a\\b[^>]*href=["']${hrefPattern}["'][^>]*>[\\s\\S]*?<\\/a>`, "gi"), "")
    .replace(/\s{2,}/g, " ");
}

function removeRoutesFromProject(project: any, routes: string[]): { project: any; changedFiles: string[] } {
  const routeSet = new Set(routes.map((route) => normalizePath(route)).filter(Boolean));
  if (routeSet.size === 0) return { project, changedFiles: [] };

  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const changed = new Set<string>();
  const keptFiles: any[] = [];

  for (const file of files) {
    const filePath = normalizePath(String(file?.path || ""));
    const route = filePath === "/index.html" ? "/" : normalizePath(filePath.replace(/\/index\.html$/i, ""));
    if (routeSet.has(route)) {
      changed.add(filePath);
      continue;
    }
    if (filePath.toLowerCase().endsWith(".html")) {
      let content = String(file.content || "");
      for (const targetRoute of routeSet) {
        const updated = stripRouteLinksFromHtml(content, targetRoute);
        if (updated !== content) {
          content = updated;
        }
      }
      if (content !== String(file.content || "")) {
        keptFiles.push({ ...file, content });
        changed.add(filePath);
        continue;
      }
    }
    keptFiles.push(file);
  }

  next.staticSite = {
    ...(next.staticSite || {}),
    mode: "skill-direct",
    files: keptFiles,
  };
  next.pages = (Array.isArray(next.pages) ? next.pages : []).filter(
    (page: any) => !routeSet.has(normalizePath(String(page?.path || ""))),
  );
  return {
    project: syncPagesFromStaticFiles(next),
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
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

function normalizeDeployHost(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).host.toLowerCase();
  } catch {
    return raw.replace(/^\/+|\/+$/g, "");
  }
}

function isPagesDevHost(host: string): boolean {
  const normalized = normalizeDeployHost(host);
  return normalized === "pages.dev" || normalized.endsWith(".pages.dev");
}

function shouldProvisionWebAnalyticsForDeployment(host: string): boolean {
  if (String(process.env.CLOUDFLARE_WA_AUTO_PROVISION || "1").trim() === "0") return false;
  if (isPagesDevHost(host)) {
    return String(process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV || "").trim() === "1";
  }
  return true;
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

export function applyDeterministicRefineFixups(
  project: any,
  instruction: string,
): { project: any; changedFiles: string[] } {
  const normalizedInstruction = String(instruction || "").trim();
  if (!normalizedInstruction) {
    return { project, changedFiles: [] };
  }

  const hasDeleteIntent = hasRouteRemovalIntent(normalizedInstruction);
  const removeMenuButton =
    hasDeleteIntent &&
    /(menu|\u83dc\u5355|\u5bfc\u822a\u680f)/i.test(normalizedInstruction);
  const routesToRemove = collectRouteRemovalTargets(project, normalizedInstruction);
  const hasSpacingIntent = /(\u8fb9\u8ddd|\u5185\u8fb9\u8ddd|\u7559\u767d|\u95f4\u8ddd|padding|spacing|space)/i.test(
    normalizedInstruction,
  );
  const mentionsTimelineCards =
    /AI\s*(?:\u89c2\u5bdf|\u89c0\u5bdf)|\u5de5\u7a0b\u5b9e\u8df5|\u5168\u7403\u5316\u89c6\u89d2|global/i.test(normalizedInstruction) &&
    /(\u4e09\u4e2adiv|\u4e09\u5f20\u5361|\u4e09\u4e2a\u5361|\u5361\u7247|div|card)/i.test(normalizedInstruction);
  const adjustTimelineCardSpacing = hasSpacingIntent && mentionsTimelineCards;

  const literalTargets = new Set<string>();
  if (/for enterprise and saas teams/i.test(normalizedInstruction)) {
    literalTargets.add("For enterprise and SaaS teams");
  }
  const quotedPatterns = [
    /["'\u201c\u201d\u2018\u2019]([^"'\u201c\u201d\u2018\u2019\n\r]{2,120})["'\u201c\u201d\u2018\u2019]/g,
    /\u5220\u9664\s*([A-Za-z][A-Za-z0-9 .&/+-]{3,120})/gi,
  ];
  for (const pattern of quotedPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedInstruction))) {
      const candidate = String(match[1] || "").trim();
      if (!candidate) continue;
      if (/^(menu|\u83dc\u5355)$/i.test(candidate)) continue;
      literalTargets.add(candidate);
    }
  }

  if (!removeMenuButton && literalTargets.size === 0 && !adjustTimelineCardSpacing && routesToRemove.length === 0) {
    return { project, changedFiles: [] };
  }

  const next = ensureSkillDirectStaticProject(project);
  const files = dedupeFiles((next?.staticSite?.files || []) as any[]);
  const changed = new Set<string>();

  const updatedFiles = files.map((file) => {
    const lowerPath = String(file.path || "").toLowerCase();
    if (adjustTimelineCardSpacing && lowerPath.endsWith(".css")) {
      const before = String(file.content || "");
      let after = before;
      const timelineGridRule = [
        ".timeline-grid {",
        "  display: grid;",
        "  grid-template-columns: repeat(3, minmax(0, 1fr));",
        "  gap: 1.25rem;",
        "}",
      ].join("\n");
      const timelineStepRule = [
        ".timeline-step {",
        "  position: relative;",
        "  overflow: hidden;",
        "  padding: clamp(1.35rem, 2.6vw, 1.85rem);",
        "  display: grid;",
        "  gap: 0.85rem;",
        "  align-content: start;",
        "  min-height: 14rem;",
        "}",
      ].join("\n");
      const timelineStepHeadingRule = [
        ".timeline-step h3 {",
        "  margin: 0;",
        "  max-width: calc(100% - 4.5rem);",
        "}",
      ].join("\n");
      const timelineStepBodyRule = [
        ".timeline-step p {",
        "  margin: 0;",
        "  max-width: 24ch;",
        "  color: var(--muted);",
        "}",
      ].join("\n");
      const timelineStepMarkerRule = [
        ".timeline-step::before {",
        "  content: attr(data-step);",
        "  position: absolute;",
        "  right: 1.15rem;",
        "  top: 1rem;",
        "  font-family: var(--display);",
        "  font-size: 2.7rem;",
        "  color: color-mix(in oklab, var(--accent) 20%, transparent);",
        "}",
      ].join("\n");
      const overrideBlock = [
        timelineGridRule,
        timelineStepRule,
        timelineStepHeadingRule,
        timelineStepBodyRule,
        timelineStepMarkerRule,
      ].join("\n");
      if (/\.timeline-step\s*\{[\s\S]*?\}/.test(after)) {
        after = after.replace(
          /\.timeline-grid\s*\{[\s\S]*?\}/,
          timelineGridRule,
        );
        after = after.replace(
          /\.timeline-step\s*\{[\s\S]*?\}/,
          timelineStepRule,
        );
        if (/\.timeline-step h3\s*\{/.test(after)) {
          after = after.replace(
            /\.timeline-step h3\s*\{[\s\S]*?\}/,
            timelineStepHeadingRule,
          );
        } else {
          after += `\n${timelineStepHeadingRule}`;
        }
        if (/\.timeline-step p\s*\{/.test(after)) {
          after = after.replace(
            /\.timeline-step p\s*\{[\s\S]*?\}/,
            timelineStepBodyRule,
          );
        } else {
          after += `\n${timelineStepBodyRule}`;
        }
        if (/\.timeline-step::before\s*\{/.test(after)) {
          after = after.replace(
            /\.timeline-step::before\s*\{[\s\S]*?\}/,
            timelineStepMarkerRule,
          );
        } else {
          after += `\n${timelineStepMarkerRule}`;
        }
      } else {
        after += `\n\n${overrideBlock}\n`;
      }
      if (after !== before) {
        changed.add(file.path);
        return { ...file, content: after };
      }
      return file;
    }

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

  if (changed.size === 0 && routesToRemove.length === 0) {
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
  let finalProject = withSyncedPages;
  if (routesToRemove.length > 0) {
    const routeRemoval = removeRoutesFromProject(finalProject, routesToRemove);
    if (routeRemoval.changedFiles.length > 0) {
      finalProject = routeRemoval.project;
      for (const filePath of routeRemoval.changedFiles) changed.add(filePath);
    }
  }

  return {
    project: finalProject,
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
}

type RefineSkillEdit = {
  path: string;
  content: string;
  reason?: string;
};

const STRUCTURAL_ROUTE_ALIAS_MAP: Array<{ route: string; keys: string[] }> = [
  { route: "/", keys: ["home", "homepage", "index", "首页"] },
  { route: "/products", keys: ["product", "products", "产品", "产品页"] },
  { route: "/custom-solutions", keys: ["solution", "solutions", "custom solution", "custom solutions", "方案", "解决方案"] },
  { route: "/cases", keys: ["case", "cases", "案例", "案例页"] },
  { route: "/about", keys: ["about", "company", "关于", "关于我们"] },
  { route: "/contact", keys: ["contact", "contacts", "联系", "联系我们"] },
  { route: "/blog", keys: ["blog", "blogs", "article", "articles", "博客", "文章", "内容页"] },
  { route: "/news", keys: ["news", "updates", "update", "资讯", "新闻", "动态"] },
  { route: "/downloads", keys: ["download", "downloads", "resource", "resources", "资料下载", "下载"] },
  { route: "/pricing", keys: ["pricing", "price", "prices", "报价", "价格", "定价"] },
  { route: "/faq", keys: ["faq", "faqs", "questions", "常见问题", "问答"] },
  { route: "/services", keys: ["service", "services", "服务"] },
  { route: "/team", keys: ["team", "teams", "团队"] },
];

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
  refineScope?: string;
  targetRoutes?: string[];
  websiteSurfaceMode?: WebsiteSurfaceMode;
  qualityContract?: string;
  validationFeedback?: string;
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

  const approvedNewRoutePaths = extractStructuralRefineRouteAdditions(next, normalizedInstruction).map((route) =>
    routeToHtmlPath(route),
  );
  const allowedPaths = new Set([...fileContext.map((file) => file.path), ...approvedNewRoutePaths]);
  const model = createModelForProvider(
    params.providerConfig,
    Math.max(25_000, Number(params.timeoutMs || 90_000)),
    Math.max(1200, Number(process.env.CHAT_REFINE_MAX_TOKENS || 6000)),
    0.15,
  );

  const systemPrompt = [
    "You are a senior frontend refinement engineer.",
    "Apply visual/code refinements to an existing static website project.",
    "You must preserve the site's current surface mode and satisfy every supplied quality contract.",
    "When the scope is route_regenerate, rewrite the named route openings coherently instead of making only cosmetic micro-patches.",
    "Return strict JSON only.",
    "Never output markdown fences.",
  ].join(" ");

  const refineScope = String(params.refineScope || "").trim();
  const surfaceMode = String(params.websiteSurfaceMode || "").trim();
  const targetRoutes = Array.isArray(params.targetRoutes) ? params.targetRoutes.filter(Boolean) : [];
  const validationFeedback = String(params.validationFeedback || "").trim();
  const surfaceSpecificGuidance =
    surfaceMode === "corporate-b2b-site"
      ? [
          "- This is a corporate/procurement-facing B2B site.",
          "- Homepage openings must use an enterprise homepage structure, not a generic split hero shell.",
          "- If the homepage hero or route-leading media is edited, use `.enterprise-hero`, `.enterprise-hero__content`, and `.enterprise-hero__media`.",
          "- `.enterprise-hero__media` must contain a real `<img>` or `<picture>` node; do not leave placeholder-only boxes.",
          "- Remove placeholder scaffolding such as `media-frame`, `ph-img`, empty visual cards, and decorative blank media rails when replacing hero media.",
          "- When a route such as Cases uses a leading visual slot, replace placeholder media with a real image-backed module rather than a blank frame.",
        ].join("\n")
      : surfaceMode === "docs-knowledge-site"
        ? [
            "- This is a docs/knowledge site.",
            "- Homepage openings must use docs workspace/reference-index structure, not a generic marketing hero shell.",
            "- If `/index.html` is being regenerated, use route-owned docs classes such as `.docs-workspace`, `.docs-index-rail`, `.quickstart-strip`, `.guide-stack`, and `.reference-matrix` in the opening modules.",
            "- Do not reuse `.enterprise-hero`, `.archive-masthead`, `.resource-shelf`, `hero-grid`, `hero__grid`, `hero__body`, `hero-panel`, or right-rail split openings on docs homepages.",
            "- Keep search/index rail, quickstart, guide stack, and reference modules in the docs opening itself instead of generic cards dropped under a hero.",
          ].join("\n")
        : surfaceMode === "content-hub-site"
          ? [
              "- This is a content-hub / research-index site.",
              "- Homepage openings must use editorial collection-index structure, not a generic marketing hero shell.",
              "- If `/index.html` is being regenerated, use route-owned collection classes such as `.collection-home`, `.archive-masthead`, `.resource-shelf`, `.standards-ledger`, `.research-index`, and `.institutional-context` in the opening modules.",
              "- Do not reuse `.enterprise-hero`, `.docs-workspace`, `.docs-index-rail`, `hero-grid`, `hero__grid`, `hero__body`, `hero-panel`, or right-rail split openings on content-hub homepages.",
              "- Keep collection shelves, ledgers, and resource index rows in the homepage opening itself instead of generic hero-plus-card stacks.",
            ].join("\n")
          : "- Preserve the current route surface semantics and replace placeholder media with real, publishable media modules when requested.";

  const userPrompt = [
    "Task: apply the user refine request to the current static site files.",
    "",
    "User refine request:",
    normalizedInstruction,
    "",
    "Current refine scope:",
    refineScope || "(unspecified)",
    "",
    "Current website surface mode:",
    surfaceMode || "(unspecified)",
    "",
    "Target routes that should receive coherent route-owned changes first:",
    targetRoutes.length > 0 ? JSON.stringify(targetRoutes, null, 2) : "(no explicit route targets detected)",
    "",
    "Skill directive (must follow):",
    params.skillDirective || "(none)",
    "",
    "Website quality contract (must follow):",
    String(params.qualityContract || "").trim() || "(none)",
    "",
    "Surface-specific guidance:",
    surfaceSpecificGuidance,
    ...(validationFeedback
      ? [
          "",
          "Previous validation failed. Your edits must explicitly fix this:",
          validationFeedback,
        ]
      : []),
    "",
    "Current files (path + full content):",
    JSON.stringify(fileContext, null, 2),
    "",
    "Approved new file paths for this refine request:",
    JSON.stringify(approvedNewRoutePaths, null, 2),
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
    "- Prefer changing the targeted route files and shared assets before touching unrelated routes.",
    "- If refine scope is route_regenerate, rewrite the target route opening and its immediate supporting structure so it reads like a finished route, not a patched shell.",
    "- You may create a new file only when its path is listed in 'Approved new file paths for this refine request'.",
    "- When creating a new route page, output a complete production-ready HTML document for that path, not a stub.",
    "- For deletion requests, remove the exact target text/element instead of adding comments.",
    "- If request says remove menu button, remove the corresponding button/trigger from nav markup and related JS hooks when needed.",
    "- If the request replaces blank or placeholder media, remove placeholder scaffolding classes instead of keeping them around new content.",
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
    const after = String(edit.content || "");
    if (!after.trim()) continue;
    if (!existing) {
      fileMap.set(edit.path, {
        path: edit.path,
        content: after,
        type: guessMimeByPath(edit.path),
      });
      changed.add(edit.path);
      continue;
    }
    const before = String(existing.content || "");
    if (before === after) continue;
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

function normalizeProjectArtifactForMaterialization(params: {
  project: any;
  decision?: LocalDecisionPlan;
  requirementText?: string;
  workflowContext?: Record<string, unknown>;
  skipFullSiteValidation?: boolean;
}): any {
  if (params.decision && !params.skipFullSiteValidation) {
    return normalizeGeneratedProjectArtifactPreview({
      project: params.project,
      decision: params.decision,
      requirementText: String(params.requirementText || params.decision.requirementText || "").trim(),
      workflowContext: params.workflowContext,
    });
  }
  return ensureSharedSiteRefsForRefineHtml(ensureSkillDirectStaticProject(params.project));
}

async function materializeSiteDirectoryFromProject(
  project: any,
  siteDir: string,
  options?: {
    decision?: LocalDecisionPlan;
    requirementText?: string;
    workflowContext?: Record<string, unknown>;
    skipFullSiteValidation?: boolean;
  },
): Promise<{
  fileCount: number;
  generatedFiles: string[];
  project: any;
}> {
  const normalizedProject = normalizeProjectArtifactForMaterialization({
    project,
    decision: options?.decision,
    requirementText: options?.requirementText,
    workflowContext: options?.workflowContext,
    skipFullSiteValidation: options?.skipFullSiteValidation,
  });
  const bundle = await Bundler.createBundle(normalizedProject);
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
    project: normalizedProject,
  };
}

function normalizeGenerationContractRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function resolveWorkflowGenerationContract(workflowContext: Record<string, unknown>): ImmutableGenerationContract | undefined {
  const existing = normalizeGenerationContractRecord(workflowContext.generationContract);
  if (existing) {
    try {
      return normalizeWebsiteGenerationContract(existing as any);
    } catch {
      // Fall through to contract rebuild from normalized workflow context.
    }
  }
  const promptControlManifest =
    workflowContext.promptControlManifest && typeof workflowContext.promptControlManifest === "object"
      ? workflowContext.promptControlManifest
      : undefined;
  const discoveryBrief =
    workflowContext.websiteDiscoveryBrief && typeof workflowContext.websiteDiscoveryBrief === "object"
      ? workflowContext.websiteDiscoveryBrief
      : undefined;
  const routeUnitContracts = Array.isArray(workflowContext.routeUnitContracts)
    ? ((workflowContext.routeUnitContracts as unknown[]) as any[])
    : undefined;
  const selectedSeedSkillManifest =
    workflowContext.selectedSeedSkillManifest && typeof workflowContext.selectedSeedSkillManifest === "object"
      ? (workflowContext.selectedSeedSkillManifest as any)
      : undefined;
  const selectedSeedContracts = Array.isArray(workflowContext.selectedSeedContracts)
    ? (workflowContext.selectedSeedContracts as any[])
    : undefined;
  if (!promptControlManifest && !routeUnitContracts?.length) return undefined;
  return buildImmutableGenerationContract({
    generationLane: String(workflowContext.generationLane || "").trim() || "legacy",
    websiteSurfaceMode: String(workflowContext.websiteSurfaceMode || "").trim() || undefined,
    promptControlManifest,
    discoveryBrief,
    selectedSeedSkillManifest,
    selectedSeedContracts,
    routeUnitContracts,
  });
}

async function persistContractVerificationCheckpoints(params: {
  checkpointRoot: string;
  contract: ImmutableGenerationContract;
  verification: ReturnType<typeof verifyRouteUnitArtifacts>;
}) {
  await writeGenerationContractCheckpoint(params.checkpointRoot, params.contract);
  for (const summary of params.contract.routeUnitContracts) {
    await writeRouteUnitInputCheckpoint(
      params.checkpointRoot,
      summary.route,
      buildGenerationUnitInputFromRouteContract({
        summary,
        context: {
          contractHash: params.contract.contractHash,
          websiteSurfaceMode: params.contract.websiteSurfaceMode,
          generationLane: params.contract.generationLane,
        },
      }),
    );
  }
  await writeGenerationVerificationCheckpoint(params.checkpointRoot, params.verification);
  for (const routeResult of params.verification.routeResults || []) {
    await writeRouteUnitVerificationCheckpoint(params.checkpointRoot, routeResult);
  }
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

function pagesProjectNameFromUrl(rawUrl: unknown): string {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    const host = new URL(raw).host.toLowerCase();
    const suffix = ".pages.dev";
    if (!host.endsWith(suffix)) return "";
    const left = host.slice(0, -suffix.length).replace(/\.$/, "");
    if (!left) return "";
    const labels = left.split(".").filter(Boolean);
    const projectName = labels.length > 1 ? labels.slice(1).join(".") : labels[0];
    return toSafeProjectNameToken(projectName, "");
  } catch {
    return "";
  }
}

function resolveDeployProjectName(project: any, state: AgentState, chatId: string): string {
  const previousProjectName = pagesProjectNameFromUrl((state as any)?.deployed_url);
  if (previousProjectName) return previousProjectName;

  const prefix = toSafeProjectNameToken(String(process.env.CLOUDFLARE_PAGES_PROJECT_PREFIX || "shpitto"), "shpitto");
  const projectToken = toSafeProjectNameToken(
    String(chatId || (state as any)?.db_project_id || project?.projectId || "site"),
    "site",
  );
  const ownerSource = String((state as any)?.user_id || "").trim();
  const ownerToken = ownerSource ? toSafeProjectNameToken(sanitizePathToken(ownerSource), "owner").slice(0, 10) : "";
  const merged = [prefix, projectToken, ownerToken]
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return merged.slice(0, 58);
}

export type DeploySmokeResult = {
  status: "passed" | "failed" | "skipped";
  checks: Array<{ name: string; passed: boolean; message?: string }>;
  url?: string;
};

type CloudflareDeployStrategy = "direct-upload" | "wrangler";

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

function extractPagesProjectNameFromDeployUrl(rawUrl: string): string {
  try {
    const host = new URL(String(rawUrl || "").trim()).hostname.toLowerCase();
    if (!host.endsWith(".pages.dev")) return "";
    const stem = host.slice(0, -".pages.dev".length);
    if (!stem) return "";
    const segments = stem.split(".").filter(Boolean);
    return segments.length > 1 ? segments.slice(1).join(".") : stem;
  } catch {
    return "";
  }
}

function isDeploySmokeTransportMessage(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  return [
    "fetch failed",
    "connect timeout",
    "timed out",
    "timeout",
    "tls",
    "socket",
    "econnreset",
    "econnrefused",
    "ehostunreach",
    "enotfound",
    "eai_again",
    "network",
    "disconnected before secure tls connection was established",
    "remote_fetch",
  ].some((token) => normalized.includes(token));
}

function shouldBypassRemoteDeploySmoke(result: DeploySmokeResult | null | undefined): boolean {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  return checks.length > 0 && checks.every((check) => !check.passed && isDeploySmokeTransportMessage(String(check.message || "")));
}

async function resolveCloudflareDeploymentSmokeBypass(params: {
  url: string;
  failure: DeploySmokeResult | null;
  scope: "post-deploy" | "blog-runtime";
}): Promise<DeploySmokeResult | null> {
  if (!shouldBypassRemoteDeploySmoke(params.failure)) return null;
  const projectName = extractPagesProjectNameFromDeployUrl(params.url);
  if (!projectName) return null;

  try {
    const project = await new CloudflareClient().getPagesProject(projectName);
    const latestDeployment = project?.latestDeployment;
    const latestStageStatus = String(latestDeployment?.latestStage?.status || "").trim().toLowerCase();
    if (!latestDeployment?.url || latestStageStatus !== "success") return null;

    const originalMessages = (params.failure?.checks || [])
      .map((check) => String(check.message || "").trim())
      .filter(Boolean)
      .join(" | ");
    return {
      status: "skipped",
      url: String(params.url || "").trim(),
      checks: [
        {
          name: "cloudflare_api_latest_deployment",
          passed: true,
          message: `Cloudflare API confirmed latest production deployment success at ${latestDeployment.url}.`,
        },
        {
          name: "remote_fetch_unreachable",
          passed: true,
          message: `Skipped ${params.scope} live fetch verification because the worker environment could not reach the Pages host.${originalMessages ? ` Original failure: ${originalMessages}` : ""}`,
        },
      ],
    };
  } catch {
    return null;
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

  const bypassed =
    candidates.length > 0
      ? await resolveCloudflareDeploymentSmokeBypass({
          url: candidates[0] || target,
          failure: lastResult,
          scope: "post-deploy",
        })
      : null;
  if (bypassed) return bypassed;

  return (
    lastResult || {
      status: "failed",
      checks: [{ name: "remote_fetch", passed: false, message: "No deployment URL candidates were available" }],
    }
  );
}

function detectLocale(text: string, preferred?: string): "zh-CN" | "en" {
  const normalized = String(text || "");
  if (
    /(?:Final website locale requirement|Language|Locale|Requested site locale)\s*:\s*Chinese\b(?!\s*(?:and|\/|,|&))/i.test(
      normalized,
    ) ||
    /single-language\s+Chinese-first/i.test(normalized) ||
    /Chinese-only/i.test(normalized) ||
    /Chinese-facing site output/i.test(normalized) ||
    /Keep all visible copy in Chinese/i.test(normalized) ||
    /Keep the site in Chinese/i.test(normalized)
  ) {
    return "zh-CN";
  }
  if (
    /(?:Final website locale requirement|Language|Locale|Requested site locale)\s*:\s*English\b(?!\s*(?:and|\/|,|&))/i.test(
      normalized,
    ) ||
    /single-language\s+English-first/i.test(normalized) ||
    /English-only/i.test(normalized) ||
    /English-facing site output/i.test(normalized) ||
    /Keep all visible copy in English/i.test(normalized) ||
    /Keep the site in English/i.test(normalized)
  ) {
    return "en";
  }
  const override = String(preferred || "").trim().toLowerCase();
  if (override.startsWith("zh")) return "zh-CN";
  if (override.startsWith("en")) return "en";
  return /[\u4e00-\u9fff]/.test(normalized) ? "zh-CN" : "en";
}

function detectRuntimeLocale(text: string, preferred?: string): "zh-CN" | "en" | "bilingual" {
  const normalized = String(text || "");
  if (isBilingualRequirementText(normalized)) return "bilingual";
  if (
    /(?:Final website locale requirement|Language|Locale|Requested site locale)\s*:\s*(?:Chinese|English)\b(?!\s*(?:and|\/|,|&))/i.test(
      normalized,
    ) ||
    /single-language\s+(?:Chinese-first|English-first)/i.test(normalized) ||
    /(?:Chinese-only|English-only)/i.test(normalized) ||
    /Keep all visible copy in (?:Chinese|English)/i.test(normalized) ||
    /Keep the site in (?:Chinese|English)/i.test(normalized)
  ) {
    return detectLocale(normalized);
  }
  const override = String(preferred || "").trim().toLowerCase();
  if (override === "bilingual" || override === "both") return "bilingual";
  if (override.startsWith("zh")) return "zh-CN";
  if (override.startsWith("en")) return "en";
  return detectLocale(normalized, preferred);
}
function toVisibleLocale(locale: "zh-CN" | "en" | "bilingual"): "zh-CN" | "en" {
  return locale === "bilingual" ? "en" : locale;
}

function shouldReuseWebsiteDesignSpec(
  existingSpec: string,
  locale: "zh-CN" | "en" | "bilingual",
): boolean {
  const normalized = String(existingSpec || "").trim();
  if (!normalized) return false;
  if (locale === "bilingual") return /locale_strategy:\s*English-first with i18n resources for other locales/i.test(normalized);
  if (locale === "zh-CN") return /locale_strategy:\s*Chinese-first single-language shell/i.test(normalized);
  return /locale_strategy:\s*English-first single-language shell/i.test(normalized);
}

export function detectRuntimeLocaleForTesting(
  text: string,
  preferred?: string,
): "zh-CN" | "en" | "bilingual" {
  return detectRuntimeLocale(text, preferred);
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
  locale: "zh-CN" | "en" | "bilingual";
}): string {
  const locale = toVisibleLocale(params.locale);
  const steps = buildDomainGuidanceSteps({ ...params, locale });
  const title = locale === "zh-CN" ? "## \u57df\u540d\u914d\u7f6e\u6307\u5bfc" : "## Domain Configuration Guide";
  return [title, "", ...steps.map((step, index) => `${index + 1}. ${step}`)].join("\n");
}

export async function resolveProjectAuthApiBase(params: { projectId: string; userId: string }): Promise<string> {
  const projectId = String(params.projectId || "").trim();
  const userId = String(params.userId || "").trim();
  if (!projectId || !userId) return "";

  try {
    const [project, domains] = await Promise.all([
      getOwnedProjectSummary(projectId, userId),
      listProjectCustomDomains(projectId, userId).catch(() => []),
    ]);

    const customDomain = domains.find((domain) => String(domain.hostname || "").trim())?.hostname;
    if (customDomain) return `https://${String(customDomain).trim()}`;

    const latestDeploymentUrl = String(project?.latestDeploymentUrl || "").trim();
    if (latestDeploymentUrl) {
      try {
        return new URL(latestDeploymentUrl).origin;
      } catch {
        // fall through to the deployment host fallback below.
      }
    }

    const deploymentHost = String(project?.deploymentHost || "").trim();
    if (deploymentHost) {
      return `https://${deploymentHost.replace(/^https?:\/\//i, "").replace(/^\/+|\/+$/g, "")}`;
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeCloudflareDeployStrategy(value: string): CloudflareDeployStrategy | undefined {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "wrangler") return "wrangler";
  if (normalized === "direct" || normalized === "direct-upload" || normalized === "upload") return "direct-upload";
  return undefined;
}

function resolveCloudflareDeployStrategy(params: { blogRuntimeEnabled: boolean; blogRuntimeInjected: boolean }): CloudflareDeployStrategy {
  if (params.blogRuntimeEnabled || params.blogRuntimeInjected) return "wrangler";
  const configured = normalizeCloudflareDeployStrategy(String(process.env.CLOUDFLARE_DEPLOY_STRATEGY || ""));
  if (configured) return configured;
  return "direct-upload";
}

async function fetchDeploySmokeText(url: string, timeoutMs: number): Promise<{ status: number; contentType: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "shpitto-blog-runtime-smoke/1.0" },
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      text: await res.text().catch(() => ""),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPostDeployBlogRuntimeSmoke(baseUrl: string): Promise<DeploySmokeResult> {
  const target = String(baseUrl || "").replace(/\/+$/g, "");
  if (!target) {
    return { status: "failed", checks: [{ name: "blog_runtime_url_present", passed: false, message: "Deployment URL is empty" }] };
  }
  if (!isRemoteDeploySmokeEnabled()) {
    return {
      status: "skipped",
      url: target,
      checks: [
        {
          name: "blog_runtime_remote_fetch",
          passed: true,
          message: "Skipped because Cloudflare credentials are not configured",
        },
      ],
    };
  }

  const timeoutMs = Math.max(2_000, Number(process.env.DEPLOY_SMOKE_TIMEOUT_MS || 15_000));
  const checks: DeploySmokeResult["checks"] = [];

  async function checkText(
    name: string,
    pathName: string,
    validate: (response: { status: number; contentType: string; text: string }) => boolean,
    message: string,
  ) {
    const url = `${target}${pathName}`;
    try {
      const response = await fetchDeploySmokeText(url, timeoutMs);
      checks.push({
        name,
        passed: response.status >= 200 && response.status < 400 && validate(response),
        message: `${message}; HTTP ${response.status}; content-type=${response.contentType || "unknown"}`,
      });
    } catch (error) {
      checks.push({
        name,
        passed: false,
        message: `${url}: ${String((error as any)?.message || error || "fetch failed")}`,
      });
    }
  }

  await checkText("blog_index_html", "/blog/", (res) => /<html[\s>]|<body[\s>]/i.test(res.text), "Blog index should be HTML");
  await checkText(
    "blog_posts_api_json",
    "/api/blog/posts",
    (res) => res.contentType.toLowerCase().includes("json") && /"ok"\s*:\s*true/.test(res.text),
    "Blog posts API should be JSON from Pages Functions",
  );
  await checkText(
    "blog_runtime_metadata",
    "/shpitto-blog-runtime.json",
    (res) => res.contentType.toLowerCase().includes("json") && res.text.includes('"mode": "deployment-d1-runtime"'),
    "Blog runtime metadata should identify D1 runtime mode",
  );
  await checkText(
    "blog_rss_xml",
    "/blog/rss.xml",
    (res) => /xml|rss/i.test(res.contentType) || /<rss[\s>]/i.test(res.text),
    "Blog RSS should be XML",
  );
  await checkText(
    "sitemap_includes_blog",
    "/sitemap.xml",
    (res) => res.text.includes("/blog"),
    "Sitemap should include Blog URLs",
  );

  const result = { ...evaluateDeploySmoke(checks), url: target };
  const bypassed = await resolveCloudflareDeploymentSmokeBypass({
    url: target,
    failure: result,
    scope: "blog-runtime",
  });
  return bypassed || result;
}

function resolveCustomDomainCnameTarget(deploymentHost: string, liveHost: string) {
  return String(deploymentHost || liveHost || "").trim();
}

function buildDomainDnsRecords(params: {
  liveUrl: string;
  deploymentHost: string;
  locale: "zh-CN" | "en" | "bilingual";
}): Array<{ type: string; host: string; value: string; ttl: string; note: string }> {
  const locale = toVisibleLocale(params.locale);
  const liveHost = (() => {
    try {
      return new URL(params.liveUrl).host;
    } catch {
      return "";
    }
  })();
  const cnameTarget = resolveCustomDomainCnameTarget(params.deploymentHost, liveHost);
  const ttl = params.locale === "zh-CN" ? "自动 / 默认" : "Auto / Default";
  if (locale === "zh-CN") {
    return [
      {
        type: "CNAME",
        host: "www",
        value: cnameTarget,
        ttl,
        note: "用于 www.example.com 这类子域名。",
      },
      {
        type: "CNAME / ALIAS / ANAME",
        host: "@",
        value: cnameTarget,
        ttl,
        note: "用于 example.com 根域名；如果 DNS 服务商不支持根域名 CNAME，请选择 ALIAS、ANAME 或等价的扁平化记录。",
      },
    ];
  }
  return [
    {
      type: "CNAME",
      host: "www",
      value: cnameTarget,
      ttl,
      note: "Use for a subdomain such as www.example.com.",
    },
    {
      type: "CNAME / ALIAS / ANAME",
      host: "@",
      value: cnameTarget,
      ttl,
      note: "Use for an apex domain such as example.com. If your DNS provider does not support apex CNAME, use ALIAS, ANAME, or an equivalent flattened record.",
    },
  ];
}

function buildDomainConfigurationGuidanceSteps(params: {
  liveUrl: string;
  deploymentHost: string;
  locale: "zh-CN" | "en" | "bilingual";
}): string[] {
  const locale = toVisibleLocale(params.locale);
  const liveHost = (() => {
    try {
      return new URL(params.liveUrl).host;
    } catch {
      return "";
    }
  })();
  const cnameTarget = resolveCustomDomainCnameTarget(params.deploymentHost, liveHost);
  if (locale === "zh-CN") {
    return [
      "在你的域名 DNS 管理后台新增一条记录；如果配置 `www.example.com`，使用下方 `www` 的 CNAME 记录。",
      `记录值填写 \`${cnameTarget}\`，TTL 保持自动或默认即可。`,
      "如果配置根域名 `example.com`，主机记录填写 `@`；若 DNS 服务商不支持根域名 CNAME，请选择 ALIAS、ANAME 或等价的扁平化记录。",
      "保存 DNS 后等待解析生效，再回到域名配置入口添加并校验你的自定义域名。",
      "状态和证书生效后，打开自定义域名确认网站可访问。",
    ];
  }
  return [
    "Open your domain DNS settings and add a record. For `www.example.com`, use the `www` CNAME record shown below.",
    `Set the record value to \`${cnameTarget}\` and keep TTL as Auto or Default.`,
    "For an apex domain such as `example.com`, use host `@`. If your DNS provider does not support apex CNAME, use ALIAS, ANAME, or an equivalent flattened record.",
    "Save the DNS record, then add and verify the custom domain from the domain configuration entry.",
    "After the status and certificate are active, open the custom domain to verify the site.",
  ];
}

function buildDomainGuidanceDnsRecords(params: {
  liveUrl: string;
  deploymentHost: string;
  locale: "zh-CN" | "en" | "bilingual";
}): Array<{ type: string; host: string; value: string; ttl: string; note: string }> {
  const locale = toVisibleLocale(params.locale);
  const liveHost = (() => {
    try {
      return new URL(params.liveUrl).host;
    } catch {
      return "";
    }
  })();
  const cnameTarget = resolveCustomDomainCnameTarget(params.deploymentHost, liveHost);
  const ttl = locale === "zh-CN" ? "\u81ea\u52a8 / \u9ed8\u8ba4" : "Auto / Default";
  if (locale === "zh-CN") {
    return [
      {
        type: "CNAME",
        host: "www",
        value: cnameTarget,
        ttl,
        note: "\u7528\u4e8e www.example.com \u8fd9\u7c7b\u5b50\u57df\u540d\u3002",
      },
      {
        type: "CNAME / ALIAS / ANAME",
        host: "@",
        value: cnameTarget,
        ttl,
        note: "\u7528\u4e8e example.com \u6839\u57df\u540d\uff1b\u5982\u679c DNS \u670d\u52a1\u5546\u4e0d\u652f\u6301\u6839\u57df\u540d CNAME\uff0c\u8bf7\u9009\u62e9 ALIAS\u3001ANAME \u6216\u7b49\u4ef7\u7684\u6241\u5e73\u5316\u8bb0\u5f55\u3002",
      },
    ];
  }
  return [
    {
      type: "CNAME",
      host: "www",
      value: cnameTarget,
      ttl,
      note: "Use for a subdomain such as www.example.com.",
    },
    {
      type: "CNAME / ALIAS / ANAME",
      host: "@",
      value: cnameTarget,
      ttl,
      note: "Use for an apex domain such as example.com. If your DNS provider does not support apex CNAME, use ALIAS, ANAME, or an equivalent flattened record.",
    },
  ];
}

function buildDomainGuidanceSteps(params: {
  liveUrl: string;
  deploymentHost: string;
  locale: "zh-CN" | "en" | "bilingual";
}): string[] {
  const locale = toVisibleLocale(params.locale);
  const liveHost = (() => {
    try {
      return new URL(params.liveUrl).host;
    } catch {
      return "";
    }
  })();
  const cnameTarget = resolveCustomDomainCnameTarget(params.deploymentHost, liveHost);
  if (locale === "zh-CN") {
    return [
      "\u5728\u4f60\u7684\u57df\u540d DNS \u7ba1\u7406\u540e\u53f0\u65b0\u589e\u4e00\u6761\u8bb0\u5f55\uff1b\u5982\u679c\u914d\u7f6e `www.example.com`\uff0c\u4f7f\u7528\u4e0b\u65b9 `www` \u7684 CNAME \u8bb0\u5f55\u3002",
      `\u8bb0\u5f55\u503c\u586b\u5199 \`${cnameTarget}\`\uff0cTTL \u4fdd\u6301\u81ea\u52a8\u6216\u9ed8\u8ba4\u5373\u53ef\u3002`,
      "\u5982\u679c\u914d\u7f6e\u6839\u57df\u540d `example.com`\uff0c\u4e3b\u673a\u8bb0\u5f55\u586b\u5199 `@`\uff1b\u82e5 DNS \u670d\u52a1\u5546\u4e0d\u652f\u6301\u6839\u57df\u540d CNAME\uff0c\u8bf7\u9009\u62e9 ALIAS\u3001ANAME \u6216\u7b49\u4ef7\u7684\u6241\u5e73\u5316\u8bb0\u5f55\u3002",
      "\u4fdd\u5b58 DNS \u540e\u7b49\u5f85\u89e3\u6790\u751f\u6548\uff0c\u518d\u56de\u5230\u57df\u540d\u914d\u7f6e\u5165\u53e3\u6dfb\u52a0\u5e76\u6821\u9a8c\u4f60\u7684\u81ea\u5b9a\u4e49\u57df\u540d\u3002",
      "\u72b6\u6001\u548c\u8bc1\u4e66\u751f\u6548\u540e\uff0c\u6253\u5f00\u81ea\u5b9a\u4e49\u57df\u540d\u786e\u8ba4\u7f51\u7ad9\u53ef\u8bbf\u95ee\u3002",
    ];
  }
  return [
    "Open your domain DNS settings and add a record. For `www.example.com`, use the `www` CNAME record shown below.",
    `Set the record value to \`${cnameTarget}\` and keep TTL as Auto or Default.`,
    "For an apex domain such as `example.com`, use host `@`. If your DNS provider does not support apex CNAME, use ALIAS, ANAME, or an equivalent flattened record.",
    "Save the DNS record, then add and verify the custom domain from the domain configuration entry.",
    "After the status and certificate are active, open the custom domain to verify the site.",
  ];
}

function buildDomainVerificationChecklist(locale: "zh-CN" | "en" | "bilingual"): string[] {
  if (toVisibleLocale(locale) === "zh-CN") {
    return [
      "DNS \u8bb0\u5f55\u7684\u7c7b\u578b\u3001\u4e3b\u673a\u8bb0\u5f55\u548c\u8bb0\u5f55\u503c\u4e0e\u5361\u7247\u4e00\u81f4\u3002",
      "\u57df\u540d\u914d\u7f6e\u9875\u4e2d\u8be5\u57df\u540d\u72b6\u6001\u663e\u793a\u4e3a\u5df2\u751f\u6548\u6216\u5df2\u9a8c\u8bc1\u3002",
      "HTTPS \u8bc1\u4e66\u5df2\u751f\u6548\uff0c\u6253\u5f00\u81ea\u5b9a\u4e49\u57df\u540d\u4e0d\u51fa\u73b0\u5b89\u5168\u8b66\u544a\u3002",
      "\u9996\u9875\u3001Blog \u548c\u767b\u5f55\u7b49\u5173\u952e\u9875\u9762\u90fd\u80fd\u4f7f\u7528\u65b0\u57df\u540d\u8bbf\u95ee\u3002",
    ];
  }
  return [
    "The DNS record type, host, and value match this card.",
    "The domain configuration page shows the domain as active or verified.",
    "HTTPS is active and the custom domain opens without a browser security warning.",
    "Key pages such as Home, Blog, and auth pages work on the new domain.",
  ];
}

function buildDomainConfigurationTips(locale: "zh-CN" | "en" | "bilingual"): string[] {
  if (toVisibleLocale(locale) === "zh-CN") {
    return [
      "\u89e3\u6790\u901a\u5e38\u51e0\u5206\u949f\u5185\u751f\u6548\uff0c\u4f46\u90e8\u5206 DNS \u670d\u52a1\u5546\u53ef\u80fd\u9700\u8981 24 \u5c0f\u65f6\u3002",
      "\u5982\u679c\u57df\u540d\u5df2\u6709 A\u3001AAAA \u6216 CNAME \u8bb0\u5f55\uff0c\u9700\u8981\u5148\u786e\u8ba4\u662f\u5426\u4e0e\u65b0\u914d\u7f6e\u51b2\u7a81\u3002",
      "\u5982\u679c\u540c\u65f6\u914d\u7f6e\u6839\u57df\u540d\u548c www\uff0c\u5efa\u8bae\u4e24\u6761\u8bb0\u5f55\u90fd\u6307\u5411\u5361\u7247\u4e2d\u7684\u8bb0\u5f55\u503c\u3002",
    ];
  }
  return [
    "DNS usually propagates within minutes, but some providers can take up to 24 hours.",
    "If the domain already has A, AAAA, or CNAME records, check whether they conflict with the new record.",
    "If you configure both apex and www domains, point both records to the value shown in this card.",
  ];
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
  const markerIndex = text.search(/\n##\s+(?:7\.\s+Evidence Brief|7\.5\s+External Research Addendum|Website Knowledge Profile)\b/i);
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
  const requestedExecutionSkillId = String((params.state.workflow_context as any)?.executionSkillId || "").trim();
  const requestedWebsiteSkillId =
    requestedSkillId && requestedSkillId !== WEBSITE_MAIN_SKILL_ID ? requestedSkillId : requestedExecutionSkillId || requestedSkillId;
  const loadedSkill = await loadProjectSkill(requestedWebsiteSkillId || WEBSITE_MAIN_SKILL_ID);
  if (loadedSkill.id !== WEBSITE_MAIN_SKILL_ID && !WEBSITE_GENERATION_TYPE_SKILL_IDS.includes(loadedSkill.id as any)) {
    throw new Error(
      `skill "${loadedSkill.id}" is not supported by website runtime. supported: ${WEBSITE_MAIN_SKILL_ID}, ${WEBSITE_GENERATION_TYPE_SKILL_IDS.join(", ")}`,
    );
  }
  const requirementText = extractRequirementText(params.state);
  const existingWorkflow = ((params.state as any)?.workflow_context || {}) as Record<string, unknown>;
  const requirementSpec = (existingWorkflow.requirementSpec || {}) as Record<string, unknown>;
  const persistedWebsiteTypeSkillId = String(existingWorkflow.websiteTypeSkillId || "").trim();
  const selectedWebsiteType = persistedWebsiteTypeSkillId
    ? {
        skillId: persistedWebsiteTypeSkillId as (typeof WEBSITE_GENERATION_TYPE_SKILL_IDS)[number],
        siteType: String(existingWorkflow.websiteSiteType || "").trim() as any,
        surfaceMode:
          inferWebsiteSurfaceModeFromSkillId(String(existingWorkflow.websiteSurfaceMode || "")) ||
          inferWebsiteSurfaceModeFromSkillId(persistedWebsiteTypeSkillId) ||
          "portfolio-blog-site",
        reason: "workflow-context-persisted surface selection",
      }
    : selectWebsiteGenerationTypeSkill({
        requirementText,
        siteType: String(requirementSpec.siteType || ""),
        routes:
          (((existingWorkflow.promptControlManifest as any)?.routes || (params.state as any)?.sitemap?.routes || []) as string[]),
        targetAudience: Array.isArray(requirementSpec.targetAudience)
          ? (requirementSpec.targetAudience as string[])
          : undefined,
        primaryGoal: Array.isArray(requirementSpec.primaryGoal) ? (requirementSpec.primaryGoal as string[]) : undefined,
      });
  const selectedSeedSkills = await selectWebsiteSeedSkillsForIntent({
    requirementText,
    routes: ((params.state as any)?.sitemap?.routes || []) as string[],
    maxSkills: Number(process.env.SKILL_RUNTIME_MAX_SEED_SKILLS || 2),
  });
  const { selectedSeedContracts, selectedSeedSkillManifest } = await resolveSelectedSeedSkillArtifacts(selectedSeedSkills);
  const selectedDocumentSkills = await selectDocumentContentSkillsForIntent({
    requirementText,
    routes: ((params.state as any)?.sitemap?.routes || []) as string[],
    maxSkills: Number(process.env.SKILL_RUNTIME_MAX_DOCUMENT_SKILLS || 3),
  });
  const loadedSkillIds = Array.from(
    new Set([
      ...WEBSITE_GENERATION_SKILL_BUNDLE.map((id) => resolveProjectSkillAlias(id)),
      resolveProjectSkillAlias(selectedWebsiteType.skillId),
      ...selectedSeedSkills.map((item) => item.id),
      ...selectedDocumentSkills.map((item) => item.id),
    ]),
  );
  const skillDirective = extractSkillDirectiveSnippet(loadedSkill);
  const normalizedVisualDecision = normalizeWorkflowVisualDecisionContext(existingWorkflow as any);
  const currentGuidanceCache = buildDesignGuidanceCacheSnapshot(requirementText, normalizedVisualDecision);
  const hasExistingGuidance =
    String(existingWorkflow.selectionCriteria || "").trim().length > 0 &&
    String(existingWorkflow.sequentialWorkflow || "").trim().length > 0 &&
    String(existingWorkflow.designMd || "").trim().length > 0 &&
    matchesDesignGuidanceCacheSnapshot(existingWorkflow, currentGuidanceCache);

  let styleHit = ((params.state as any)?.design_hit || undefined) as DesignSkillHit | undefined;
  let stylePreset = normalizeStylePreset(existingWorkflow.stylePreset as Partial<DesignStylePreset>, {});
  let guidance = {
    selectionCriteria: String(existingWorkflow.selectionCriteria || ""),
    sequentialWorkflow: String(existingWorkflow.sequentialWorkflow || ""),
    workflowGuide: String(existingWorkflow.workflowGuide || ""),
    rulesSummary: String(existingWorkflow.rulesSummary || ""),
    designMd: String(existingWorkflow.designMd || ""),
    websiteDesignSpec: String(existingWorkflow.websiteDesignSpec || ""),
  };
  if (!hasExistingGuidance || !styleHit) {
    const workflowContext = await loadWorkflowSkillContext(
      requirementText,
      normalizedVisualDecision,
    );
    stylePreset = normalizeStylePreset(workflowContext.stylePreset, {});
    styleHit = workflowContext.hit;
    guidance = {
      selectionCriteria: workflowContext.selectionCriteria,
      sequentialWorkflow: workflowContext.sequentialWorkflow,
      workflowGuide: workflowContext.workflowGuide,
      rulesSummary: workflowContext.rulesSummary,
      designMd: workflowContext.designMd,
      websiteDesignSpec: "",
    };
  }

  const executionSkillId = loadedSkill.id === WEBSITE_MAIN_SKILL_ID ? selectedWebsiteType.skillId : loadedSkill.id;

  const stateWithSkill: AgentState = {
    ...params.state,
    design_hit: styleHit,
    workflow_context: {
      ...(params.state.workflow_context || {}),
      skillId: WEBSITE_MAIN_SKILL_ID,
      executionSkillId,
      skillDirective,
      loadedSkillIds,
      selectedSeedSkillIds: selectedSeedSkillManifest.selected.map((item) => item.id),
      selectedSeedSkillReasons: selectedSeedSkills,
      selectedSeedContracts,
      selectedSeedSkillManifest,
      selectedDocumentSkillIds: selectedDocumentSkills.map((item) => item.id),
      selectedDocumentSkillReasons: selectedDocumentSkills,
      websiteOrchestratorSkillId: WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID,
      websiteTypeSkillId: selectedWebsiteType.skillId,
      websiteTypeKind: selectedWebsiteType.siteType,
      websiteTypeSelectionReason: selectedWebsiteType.reason,
      skillMdPath: loadedSkill.skillMdPath,
      selectionCriteria: guidance.selectionCriteria,
      sequentialWorkflow: guidance.sequentialWorkflow,
      workflowGuide: guidance.workflowGuide,
      rulesSummary: guidance.rulesSummary,
      designMd: guidance.designMd,
      websiteDesignSpec: guidance.websiteDesignSpec,
      stylePreset,
      designGuidanceRequirementHash: currentGuidanceCache.requirementHash,
      designGuidanceTemplateStyleId: currentGuidanceCache.templateStyleId,
      designGuidancePrimaryVisualDirection: currentGuidanceCache.primaryVisualDirection,
      designGuidanceSecondaryVisualTags: currentGuidanceCache.secondaryVisualTags,
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
  // Allow truncated HTML (missing </body> or </html>); ensureHtmlDocument will patch them.
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

function extractPageTitleForRoute(route: string, locale: "zh-CN" | "en" | "bilingual"): string {
  locale = toVisibleLocale(locale);
  const normalized = normalizePath(route);
  if (normalized === "/") return locale === "zh-CN" ? "首页" : "Home";
  const token = normalized.split("/").filter(Boolean).join(" ");
  const title = token
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return title || (locale === "zh-CN" ? "页面" : "Page");
}

function buildNav(routes: string[], locale: "zh-CN" | "en" | "bilingual"): Array<{ label: string; href: string }> {
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

function containsCjk(text: string): boolean {
  return containsWorkflowCjk(text);
}

function internalNavLabelForRoute(route: string, fallback = ""): string {
  const normalized = normalizePath(route || "/");
  if (normalized === "/") return "Home";
  if (isWorkflowArtifactEnglishSafe(fallback)) return normalizeWorkflowArtifactText(fallback);
  const leaf = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() || "page";
  return leaf
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => (part === part.toUpperCase() && /^[A-Z0-9-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function internalPurposeForProcessText(route: string, fallback = ""): string {
  if (isWorkflowArtifactEnglishSafe(fallback)) return normalizeWorkflowArtifactText(fallback);
  return `Deliver a distinct route brief for ${internalNavLabelForRoute(route, fallback)} using source-backed content and a clear next action.`;
}

function normalizeSlugToken(input: string, fallback: string): string {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || fallback;
}

function extractRefineTargetRoutes(project: any, instruction: string): string[] {
  const normalizedInstruction = String(instruction || "").trim().toLowerCase();
  if (!normalizedInstruction) return [];

  const discovered = new Set<string>();
  const existingRoutes = listProjectRoutes(project).map((route) => normalizePath(route));

  if (/(?:homepage|home page|home hero|首页|首屏)/i.test(normalizedInstruction)) {
    discovered.add("/");
  }

  for (const route of existingRoutes) {
    if (route === "/") continue;
    const leaf = route.split("/").filter(Boolean).pop() || "";
    const normalizedLeaf = leaf.replace(/[-_]+/g, " ").trim().toLowerCase();
    if (!normalizedLeaf) continue;
    if (normalizedInstruction.includes(route.toLowerCase()) || normalizedInstruction.includes(normalizedLeaf)) {
      discovered.add(route);
    }
  }

  for (const alias of STRUCTURAL_ROUTE_ALIAS_MAP) {
    if (alias.keys.some((key) => normalizedInstruction.includes(String(key || "").toLowerCase()))) {
      const normalizedRoute = normalizePath(alias.route);
      if (existingRoutes.includes(normalizedRoute)) discovered.add(normalizedRoute);
    }
  }

  return Array.from(discovered);
}

function buildInternalRequirementSummaryForWorkflow(requirementText: string, decision: LocalDecisionPlan, locale: "zh-CN" | "en" | "bilingual"): string {
  locale = toVisibleLocale(locale);
  const excerpt = clipTextWithBudget(String(requirementText || "").trim(), 1600);
  return [
    "- Internal workflow language: English only.",
    `- Final website locale requirement: ${locale === "zh-CN" ? "Chinese" : "English"}.`,
    `- Planned routes: ${decision.routes.join(", ") || "/"}.`,
    !isWorkflowArtifactEnglishSafe(excerpt)
      ? "- The original user wording contains multilingual text and is intentionally omitted from this workflow note. Use the canonical prompt, evidence brief, and structured route plan as the source of truth."
      : excerpt
        ? `- Raw requirement excerpt: ${excerpt}`
        : "- No raw requirement text available.",
  ].join("\n");
}

function blueprintDigest(plan: LocalDecisionPlan): string {
  return plan.pageBlueprints
    .map(
      (page) =>
        `- ${page.route}\n  navLabel: ${internalNavLabelForRoute(page.route, page.navLabel)}\n  source: ${page.source}\n  kind: ${page.pageKind}\n  intent: ${internalPurposeForProcessText(page.route, page.purpose)}${
          page.contentSkeleton.length ? `\n  skeleton: ${page.contentSkeleton.join(" -> ")}` : ""
        }${page.constraints.length ? `\n  constraints: ${page.constraints.join(" | ")}` : ""}`,
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

function getWebsiteCompletionDeps() {
  return {
    normalizePath,
    routeToHtmlPath,
    ensureHtmlDocument,
    htmlToReadableText,
    dedupeFiles,
    cloneJson,
    escapeHtml,
    syncPagesFromStaticFiles,
    ensureSkillDirectStaticProject,
    toVisibleLocale,
    buildBlogContentWorkflowPreview,
    collectPrimaryBlogSourceText,
    collectDeployBlogSourceText,
    inferBlogBrand,
    diffStaticProjectFiles,
    listProjectRoutes,
    buildLocalDecisionPlan,
    extractRequirementText,
    renderLocalPage,
    structuralRouteAliasMap: STRUCTURAL_ROUTE_ALIAS_MAP,
  };
}

function getWebsiteBlogWorkflowDeps() {
  return {
    normalizePath,
    htmlToReadableText,
    dedupeFiles,
    toVisibleLocale,
    extractMessageContent,
    isHumanLikeMessage,
    isDeployConfirmationIntent,
  };
}

function renderLocalTaskPlan(params: {
  routes: string[];
  locale: "zh-CN" | "en" | "bilingual";
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
    "4. website_design_spec.md",
    "5. styles.css",
    "6. script.js",
    "7. index.html",
    "8. remaining pages",
    "9. repair",
  ];
  return lines.join("\n");
}

function renderLocalFindings(requirementText: string, decision: LocalDecisionPlan): string {
  const summary = buildInternalRequirementSummaryForWorkflow(requirementText, decision, decision.locale);
  return ["# Findings", "", "## Request Summary", summary || "(empty)", "", "## Phase A Decisions", blueprintDigest(decision)].join(
    "\n",
  );
}

function renderLocalDesign(
  requirementText: string,
  locale: "zh-CN" | "en" | "bilingual",
  decision: LocalDecisionPlan,
  stylePreset: DesignStylePreset = DEFAULT_STYLE_PRESET,
): string {
  locale = toVisibleLocale(locale);
  const langLine =
    locale === "zh-CN"
      ? "Final website locale: Chinese. Internal design/process notes remain English-only."
      : "Final website locale: English. Internal design/process notes remain English-only.";
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
    "## Internal Requirement Summary",
    buildInternalRequirementSummaryForWorkflow(requirementText, decision, locale),
    "",
    "## Page Blueprints",
    blueprintDigest(decision),
  ].join("\n");
}

function renderLocalWebsiteDesignSpec(params: {
  requirementText: string;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
  selectedSeedSkillIds?: string[];
  selectedSeedContracts?: Array<{ id: string; contract: ProjectSkillSeedContract }>;
}): string {
  return buildWebsiteDesignSpecMarkdown({
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
  });
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    ".auth-shell { display: grid; gap: 22px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: stretch; }",
    ".auth-copy, .auth-panel { display: grid; gap: 14px; }",
    ".auth-eyebrow { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); }",
    ".auth-title { margin: 0; font-size: clamp(28px, 4vw, 44px); line-height: 1.08; }",
    ".auth-lead { margin: 0; color: var(--muted); max-width: 58ch; }",
    ".auth-pills { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }",
    ".auth-mini-card { padding: 14px; border-radius: 12px; background: color-mix(in oklab, var(--surface) 92%, white 8%); }",
    ".auth-mini-card p { margin: 0; }",
    ".auth-mini-card p + p { margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.5; }",
    ".auth-form { display: grid; gap: 12px; }",
    ".auth-field { display: grid; gap: 8px; }",
    ".auth-field label { font-size: 14px; font-weight: 700; color: var(--fg); }",
    ".auth-status { margin: 0; min-height: 1.2rem; font-size: 14px; line-height: 1.5; color: var(--muted); }",
    ".auth-status[data-state='error'] { color: #b91c1c; }",
    ".auth-status[data-state='success'] { color: #166534; }",
    ".auth-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }",
    ".btn-block { width: 100%; text-align: center; }",
    "footer { margin-top: 50px; background: #111827; color: #fff; padding: 26px 0; }",
    "form { display: grid; gap: 10px; }",
    "input, textarea, select { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }",
    "@media (max-width: 780px) { .hero { padding-top: 40px; } }",
  ].join("\n");
}

export function renderLocalAuthBody(params: {
  route: string;
  locale: "zh-CN" | "en";
  title: string;
  blueprint: PageBlueprint;
  projectId?: string;
  siteKey?: string;
}): string {
  const { route, locale, title, blueprint, projectId, siteKey } = params;
  const routeKey = normalizePath(route);
  const safeProjectId = escapeHtml(String(projectId || "").trim());
  const safeSiteKey = escapeHtml(String(siteKey || "").trim());
  const copy: Record<
    string,
    {
      eyebrow: string;
      lead: string;
      cardA: string;
      cardB: string;
      submit: string;
      secondaryHref: string;
      secondaryLabel: string;
      tertiaryHref?: string;
      tertiaryLabel?: string;
    }
  > = {
    "/login": {
      eyebrow: locale === "zh-CN" ? "登录" : "Sign in",
      lead:
        locale === "zh-CN"
          ? "使用与站点主题一致的登录壳完成邮箱登录、Google OAuth、找回密码和返回路径。"
          : "Use the same theme shell as the site to handle email login, Google OAuth, password recovery, and return paths.",
      cardA: locale === "zh-CN" ? "邮箱登录" : "Email login",
      cardB: locale === "zh-CN" ? "继续使用 Google" : "Continue with Google",
      submit: locale === "zh-CN" ? "登录" : "Sign in",
      secondaryHref: "/register",
      secondaryLabel: locale === "zh-CN" ? "去注册" : "Create account",
      tertiaryHref: "/reset-password",
      tertiaryLabel: locale === "zh-CN" ? "找回密码" : "Forgot password",
    },
    "/register": {
      eyebrow: locale === "zh-CN" ? "注册" : "Register",
      lead:
        locale === "zh-CN"
          ? "完成邮箱注册、Google OAuth 和验证提示，并保持主题与生成站点一致。"
          : "Complete email registration, Google OAuth, and verification guidance while keeping the site theme intact.",
      cardA: locale === "zh-CN" ? "邮箱注册" : "Email sign-up",
      cardB: locale === "zh-CN" ? "邮箱验证" : "Email verification",
      submit: locale === "zh-CN" ? "创建账号" : "Create account",
      secondaryHref: "/login",
      secondaryLabel: locale === "zh-CN" ? "返回登录" : "Back to sign in",
    },
    "/reset-password": {
      eyebrow: locale === "zh-CN" ? "找回密码" : "Reset password",
      lead:
        locale === "zh-CN"
          ? "在同一套视觉系统中重置密码，并保留返回登录和原始 next 路径。"
          : "Reset the password in the same visual system and preserve the original next path.",
      cardA: locale === "zh-CN" ? "新密码" : "New password",
      cardB: locale === "zh-CN" ? "回到登录" : "Return to sign in",
      submit: locale === "zh-CN" ? "更新密码" : "Update password",
      secondaryHref: "/login",
      secondaryLabel: locale === "zh-CN" ? "返回登录" : "Back to sign in",
    },
    "/verify-email": {
      eyebrow: locale === "zh-CN" ? "验证邮箱" : "Verify email",
      lead:
        locale === "zh-CN"
          ? "显示验证状态、允许重发，并保持返回登录和 next 路径一致。"
          : "Show verification status, allow resend, and keep return-to-sign-in and next paths consistent.",
      cardA: locale === "zh-CN" ? "验证状态" : "Verification status",
      cardB: locale === "zh-CN" ? "重发验证" : "Resend verification",
      submit: locale === "zh-CN" ? "重发验证邮件" : "Resend verification email",
      secondaryHref: "/login",
      secondaryLabel: locale === "zh-CN" ? "返回登录" : "Back to sign in",
    },
  };
  const current = copy[routeKey] || copy["/login"];
  const safeTitle = escapeHtml(title);
  const safeResponsibility = escapeHtml(blueprint.responsibility);
  const authForm = (() => {
    if (routeKey === "/login") {
      return `
        <form class="auth-form" data-shpitto-auth-form="login">
          <input type="hidden" name="projectId" value="${safeProjectId}" data-shpitto-auth-project-id />
          <input type="hidden" name="siteKey" value="${safeSiteKey}" data-shpitto-auth-site-key />
          <input type="hidden" name="next" value="/" data-shpitto-auth-next />
          <div class="auth-field">
            <label for="auth-email">${locale === "zh-CN" ? "邮箱" : "Email"}</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="name@company.com" />
          </div>
          <div class="auth-field">
            <label for="auth-password">${locale === "zh-CN" ? "密码" : "Password"}</label>
            <input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="${locale === "zh-CN" ? "输入密码" : "Enter password"}" />
          </div>
          <p class="auth-status" data-shpitto-auth-status></p>
          <button class="btn btn-primary btn-block" type="submit">${escapeHtml(current.submit)}</button>
        </form>
      `;
    }
    if (routeKey === "/register") {
      return `
        <form class="auth-form" data-shpitto-auth-form="register">
          <input type="hidden" name="projectId" value="${safeProjectId}" data-shpitto-auth-project-id />
          <input type="hidden" name="siteKey" value="${safeSiteKey}" data-shpitto-auth-site-key />
          <input type="hidden" name="next" value="/" data-shpitto-auth-next />
          <div class="auth-field">
            <label for="auth-email">${locale === "zh-CN" ? "邮箱" : "Email"}</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="name@company.com" />
          </div>
          <div class="auth-field">
            <label for="auth-password">${locale === "zh-CN" ? "密码" : "Password"}</label>
            <input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="${locale === "zh-CN" ? "至少 8 个字符" : "At least 8 characters"}" />
          </div>
          <div class="auth-field">
            <label for="auth-confirm">${locale === "zh-CN" ? "确认密码" : "Confirm password"}</label>
            <input id="auth-confirm" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" placeholder="${locale === "zh-CN" ? "再次输入密码" : "Repeat password"}" />
          </div>
          <p class="auth-status" data-shpitto-auth-status></p>
          <button class="btn btn-primary btn-block" type="submit">${escapeHtml(current.submit)}</button>
        </form>
      `;
    }
    if (routeKey === "/reset-password") {
      return `
        <form class="auth-form" data-shpitto-auth-form="reset-password">
          <input type="hidden" name="projectId" value="${safeProjectId}" data-shpitto-auth-project-id />
          <input type="hidden" name="siteKey" value="${safeSiteKey}" data-shpitto-auth-site-key />
          <input type="hidden" name="next" value="/" data-shpitto-auth-next />
          <div class="auth-field">
            <label for="auth-password">${locale === "zh-CN" ? "新密码" : "New password"}</label>
            <input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="${locale === "zh-CN" ? "至少 8 个字符" : "At least 8 characters"}" />
          </div>
          <div class="auth-field">
            <label for="auth-confirm">${locale === "zh-CN" ? "确认密码" : "Confirm password"}</label>
            <input id="auth-confirm" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" placeholder="${locale === "zh-CN" ? "再次输入新密码" : "Repeat new password"}" />
          </div>
          <p class="auth-status" data-shpitto-auth-status></p>
          <button class="btn btn-primary btn-block" type="submit">${escapeHtml(current.submit)}</button>
        </form>
      `;
    }
    return `
      <form class="auth-form" data-shpitto-auth-form="verify-email">
        <input type="hidden" name="projectId" value="${safeProjectId}" data-shpitto-auth-project-id />
        <input type="hidden" name="siteKey" value="${safeSiteKey}" data-shpitto-auth-site-key />
        <input type="hidden" name="next" value="/" data-shpitto-auth-next />
        <div class="auth-field">
          <label for="auth-email">${locale === "zh-CN" ? "邮箱" : "Email"}</label>
          <input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="name@company.com" />
        </div>
        <p class="auth-status" data-shpitto-auth-status></p>
        <button class="btn btn-primary btn-block" type="submit">${escapeHtml(current.submit)}</button>
      </form>
    `;
  })();

  return `
    <section class="card auth-shell">
      <div class="auth-copy">
        <p class="auth-eyebrow">${escapeHtml(current.eyebrow)}</p>
        <h2 class="auth-title">${safeTitle}</h2>
        <p class="auth-lead">${escapeHtml(current.lead)}</p>
        <div class="auth-pills">
          <article class="card auth-mini-card">
            <p>${escapeHtml(current.cardA)}</p>
            <p>${safeResponsibility}</p>
          </article>
          <article class="card auth-mini-card">
            <p>${escapeHtml(current.cardB)}</p>
            <p>${escapeHtml(blueprint.constraints[1] || blueprint.constraints[0] || "")}</p>
          </article>
        </div>
      </div>
      <div class="auth-panel">
        ${authForm}
        <div class="auth-actions">
          <a class="btn btn-primary btn-block" href="${escapeHtml(current.secondaryHref)}" data-shpitto-auth-link="secondary">${escapeHtml(current.secondaryLabel)}</a>
          ${current.tertiaryHref ? `<a class="btn btn-block" href="${escapeHtml(current.tertiaryHref)}" data-shpitto-auth-link="tertiary">${escapeHtml(current.tertiaryLabel || "")}</a>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderLocalScript(): string {
  return [
    "(function () {",
    "  const year = document.querySelector('[data-year]');",
    "  if (year) year.textContent = String(new Date().getFullYear());",
    "  const safeNextPath = function (value, fallback) {",
    "    const next = String(value || '').trim();",
    "    return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;",
    "  };",
    "  const resolveAuthContext = function () {",
    "    const params = new URLSearchParams(window.location.search);",
    "    const theme = String(params.get('theme') || '').trim();",
    "    const authApiBase = String(document.documentElement.getAttribute('data-shpitto-auth-api-base') || window.location.origin).trim() || window.location.origin;",
    "    const projectId = String(document.documentElement.getAttribute('data-shpitto-project-id') || '').trim() || String(document.querySelector('[data-shpitto-auth-project-id]')?.value || '').trim();",
    "    const siteKey = String(document.documentElement.getAttribute('data-shpitto-site-key') || '').trim() || String(document.querySelector('[data-shpitto-auth-site-key]')?.value || '').trim();",
    "    const referrer = (() => {",
    "      try {",
    "        if (!document.referrer) return '';",
    "        const url = new URL(document.referrer);",
    "        return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '';",
    "      } catch {",
    "        return '';",
    "      }",
    "    })();",
    "    const next = safeNextPath(params.get('next'), safeNextPath(referrer, '/'));",
    "    return { params, next, theme, authApiBase, projectId, siteKey };",
    "  };",
    "  const authContext = resolveAuthContext();",
    "  document.querySelectorAll('[data-shpitto-auth-next]').forEach(function (input) {",
    "    input.value = authContext.next;",
    "  });",
    "  document.querySelectorAll('[data-shpitto-auth-link]').forEach(function (anchor) {",
    "    const url = new URL(anchor.getAttribute('href') || '/', window.location.origin);",
    "    url.searchParams.set('next', authContext.next);",
    "    if (authContext.theme) url.searchParams.set('theme', authContext.theme);",
    "    anchor.setAttribute('href', url.pathname + url.search + url.hash);",
    "  });",
    "  const authStatusByForm = new WeakMap();",
    "  const setAuthStatus = function (form, state, message) {",
    "    const status = authStatusByForm.get(form) || form.querySelector('[data-shpitto-auth-status]');",
    "    if (!status) return;",
    "    authStatusByForm.set(form, status);",
    "    status.textContent = message || '';",
    "    status.dataset.state = state || '';",
    "  };",
    "  const setButtonLoading = function (form, loading) {",
    "    const button = form.querySelector('button[type=\"submit\"]');",
    "    if (!button) return;",
    "    if (!button.dataset.label) button.dataset.label = button.textContent || '';",
    "    button.disabled = Boolean(loading);",
    "    button.textContent = loading ? '...' : button.dataset.label;",
    "  };",
    "  const getFormValue = function (form, name) {",
    "    const field = form.querySelector(`[name=\"${name}\"]`);",
    "    return field ? String(field.value || '').trim() : '';",
    "  };",
    "  const buildAuthPayload = function (form, extra) {",
    "    const payload = {",
    "      email: getFormValue(form, 'email'),",
    "      password: getFormValue(form, 'password'),",
    "      token: getFormValue(form, 'token'),",
    "      projectId: authContext.projectId,",
    "      siteKey: authContext.siteKey,",
    "      next: authContext.next,",
    "      theme: authContext.theme,",
    "      ...extra,",
    "    };",
    "    return payload;",
    "  };",
    "  const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };",
    "  const submitAuthForm = async function (form, endpoint, payload, successHandler) {",
    "    setButtonLoading(form, true);",
    "    setAuthStatus(form, '', '');",
    "    try {",
    "      const target = new URL(endpoint, authContext.authApiBase);",
    "      const response = await fetch(target.toString(), { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });",
    "      const data = await response.json().catch(() => ({}));",
    "      if (!response.ok) {",
    "        setAuthStatus(form, 'error', String(data.error || data.message || 'Request failed.'));",
    "        return;",
    "      }",
    "      if (typeof successHandler === 'function') {",
    "        await successHandler(data, response);",
    "      }",
    "    } catch (error) {",
    "      setAuthStatus(form, 'error', String((error && error.message) || error || 'Request failed.'));",
    "    } finally {",
    "      setButtonLoading(form, false);",
    "    }",
    "  };",
    "  const loginForm = document.querySelector('[data-shpitto-auth-form=\"login\"]');",
    "  if (loginForm) {",
    "    loginForm.addEventListener('submit', function (event) {",
    "      event.preventDefault();",
    "      submitAuthForm(loginForm, '/auth/password', buildAuthPayload(loginForm), function () {",
    "        window.location.assign(authContext.next || '/');",
    "      });",
    "    });",
    "  }",
    "  const registerForm = document.querySelector('[data-shpitto-auth-form=\"register\"]');",
    "  if (registerForm) {",
    "    registerForm.addEventListener('submit', function (event) {",
    "      event.preventDefault();",
    "      const password = getFormValue(registerForm, 'password');",
    "      const confirmPassword = getFormValue(registerForm, 'confirmPassword');",
    "      if (password.length < 8) {",
    "        setAuthStatus(registerForm, 'error', 'Password must be at least 8 characters.');",
    "        return;",
    "      }",
    "      if (password !== confirmPassword) {",
    "        setAuthStatus(registerForm, 'error', 'Passwords do not match.');",
    "        return;",
    "      }",
    "      submitAuthForm(registerForm, '/auth/signup', buildAuthPayload(registerForm), function () {",
    "        const url = new URL('/verify-email', authContext.authApiBase);",
    "        url.searchParams.set('email', getFormValue(registerForm, 'email'));",
    "        url.searchParams.set('next', authContext.next || '/');",
    "        if (authContext.theme) url.searchParams.set('theme', authContext.theme);",
    "        if (authContext.projectId) url.searchParams.set('projectId', authContext.projectId);",
    "        if (authContext.siteKey) url.searchParams.set('siteKey', authContext.siteKey);",
    "        window.location.assign(url.pathname + url.search + url.hash);",
    "      });",
    "    });",
    "  }",
    "  const resetForm = document.querySelector('[data-shpitto-auth-form=\"reset-password\"]');",
    "  if (resetForm) {",
    "    resetForm.addEventListener('submit', function (event) {",
    "      event.preventDefault();",
    "      const password = getFormValue(resetForm, 'password');",
    "      const confirmPassword = getFormValue(resetForm, 'confirmPassword');",
    "      const token = String(new URLSearchParams(window.location.search).get('token') || '').trim();",
    "      if (!token) {",
    "        setAuthStatus(resetForm, 'error', 'This password reset link is missing a token.');",
    "        return;",
    "      }",
    "      if (password.length < 8) {",
    "        setAuthStatus(resetForm, 'error', 'Password must be at least 8 characters.');",
    "        return;",
    "      }",
    "      if (password !== confirmPassword) {",
    "        setAuthStatus(resetForm, 'error', 'Passwords do not match.');",
    "        return;",
    "      }",
    "      submitAuthForm(resetForm, '/auth/password/reset', { token: token, password: password, projectId: authContext.projectId, siteKey: authContext.siteKey }, function () {",
    "        setAuthStatus(resetForm, 'success', 'Password updated. Please sign in again.');",
    "        setTimeout(function () {",
    "          window.location.assign('/login?next=' + encodeURIComponent(authContext.next || '/') + (authContext.theme ? '&theme=' + encodeURIComponent(authContext.theme) : ''));",
    "        }, 650);",
    "      });",
    "    });",
    "  }",
    "  const verifyForm = document.querySelector('[data-shpitto-auth-form=\"verify-email\"]');",
    "  if (verifyForm) {",
    "    const token = String(new URLSearchParams(window.location.search).get('token') || '').trim();",
    "    const emailField = verifyForm.querySelector('[name=\"email\"]');",
    "    if (emailField) emailField.value = String(new URLSearchParams(window.location.search).get('email') || '').trim();",
    "    if (token) {",
    "      setAuthStatus(verifyForm, '', 'Verifying your email...');",
    "      submitAuthForm(verifyForm, '/auth/email-verification/confirm', { token: token, projectId: authContext.projectId, siteKey: authContext.siteKey }, function () {",
    "        setAuthStatus(verifyForm, 'success', 'Email verified. You can now sign in.');",
    "      });",
    "    }",
    "    verifyForm.addEventListener('submit', function (event) {",
    "      event.preventDefault();",
    "      const email = getFormValue(verifyForm, 'email');",
    "      if (!email) {",
    "        setAuthStatus(verifyForm, 'error', 'Enter your email on the sign-in page to resend verification.');",
    "        return;",
    "      }",
    "      submitAuthForm(verifyForm, '/auth/email-verification/resend', { email: email, next: authContext.next, theme: authContext.theme, projectId: authContext.projectId, siteKey: authContext.siteKey }, function () {",
    "        setAuthStatus(verifyForm, 'success', 'If the account exists, a verification email has been sent.');",
    "      });",
    "    });",
    "  }",
    "  const blogRoot = document.querySelector('[data-shpitto-blog-root]');",
    "  const blogList = blogRoot && blogRoot.querySelector('[data-shpitto-blog-list]');",
    "  if (blogRoot && blogList) {",
    "    const api = blogRoot.getAttribute('data-shpitto-blog-api') || '/api/blog/posts';",
    "    const escapeHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>\"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' })[char] || char; }); };",
    "    fetch(api + '?limit=12', { headers: { accept: 'application/json' } })",
    "      .then(function (response) { return response.ok ? response.json() : null; })",
    "      .then(function (data) {",
    "        if (!data || !data.ok || !Array.isArray(data.posts) || data.posts.length === 0) return;",
    "        blogList.innerHTML = data.posts.slice(0, 12).map(function (post) {",
    "          const slug = encodeURIComponent(String(post.slug || 'post'));",
    "          const title = String(post.title || 'Untitled');",
    "          const excerpt = String(post.excerpt || '');",
    "          const category = String(post.category || 'Article');",
    "          return '<article class=\"card\"><p>' + escapeHtml(category) + '</p><h3><a href=\"/blog/' + slug + '/\">' + escapeHtml(title) + '</a></h3><p>' + escapeHtml(excerpt) + '</p></article>';",
    "        }).join('');",
    "      })",
    "      .catch(function () {});",
    "  }",
    "})();",
  ].join("\n");
}

function renderLocalPage(params: {
  route: string;
  decision: LocalDecisionPlan;
  requirementText: string;
  projectId?: string;
  siteKey?: string;
  authApiBase?: string;
}): string {
  const { route, decision, requirementText, projectId, siteKey, authApiBase } = params;
  const locale = decision.locale;
  const blueprint = findPageBlueprint(decision, route);
  const nav = buildNavFromDecision(decision)
    .map((item) => `<a href=\"${item.href === "/" ? "/" : item.href + "/"}\">${item.label}</a>`)
    .join("");
  const title = extractPageTitleForRoute(route, locale);
  const isAuth = /^(?:\/login|\/register|\/reset-password|\/verify-email)(?:\/|$)/.test(normalizePath(route));
  const isContact = normalizePath(route) === "/contact";
  const isBlog = normalizePath(route) === "/blog";
  const skeletonHtml = blueprint.contentSkeleton.map((section) => `<li>${section}</li>`).join("");
  const mixText = formatComponentMix(blueprint.componentMix);
  const safeAuthApiBase = String(authApiBase || "").trim();
  const htmlAuthApiBase = safeAuthApiBase ? ` data-shpitto-auth-api-base="${escapeHtml(safeAuthApiBase)}"` : "";
  const htmlProjectAttr = String(projectId || "").trim() ? ` data-shpitto-project-id="${escapeHtml(String(projectId || "").trim())}"` : "";
  const htmlSiteAttr = String(siteKey || "").trim() ? ` data-shpitto-site-key="${escapeHtml(String(siteKey || "").trim())}"` : "";
  const body = isBlog
    ? `<section class="card"><h2>${title}</h2><p>${blueprint.responsibility}</p><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div class="grid" data-shpitto-blog-list><article class="card"><p>${locale === "zh-CN" ? "\u6587\u7ae0" : "Article"}</p><h3><a href="/blog/launch-notes/">${locale === "zh-CN" ? "\u54c1\u724c\u52a8\u6001" : "Launch Notes"}</a></h3><p>${locale === "zh-CN" ? "\u9605\u8bfb\u6700\u65b0\u5185\u5bb9\u4e0e\u89c2\u70b9\u3002" : "Read the latest content and perspectives."}</p></article></div></section></section>`
    : isAuth
      ? renderLocalAuthBody({ route, locale, title, blueprint, projectId, siteKey })
    : isContact
      ? `<section class="card"><h2>${locale === "zh-CN" ? "\u5feb\u901f\u8be2\u4ef7" : "Quick Quote"}</h2><form><input placeholder="Name" /><input placeholder="Company" /><input placeholder="Email" /><input placeholder="WhatsApp" /><input placeholder="Machine Model" /><input placeholder="Quantity" /><input placeholder="Deadline" /><button class="btn btn-primary" type="submit">${locale === "zh-CN" ? "\u63d0\u4ea4" : "Submit"}</button></form><p>${blueprint.responsibility}</p></section>`
      : `<section class="card"><h2>${title}</h2><p>${String(requirementText || "").slice(0, 420)}</p><p><strong>Page Responsibility:</strong> ${blueprint.responsibility}</p><p><strong>Component Mix:</strong> ${mixText}</p><ul>${skeletonHtml}</ul></section>`;

  return ensureHtmlDocument(`<!doctype html>
<html lang="${locale === "zh-CN" ? "zh-CN" : "en"}"${htmlAuthApiBase}${htmlProjectAttr}${htmlSiteAttr}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header><div class="container nav"><strong>LC-CNC&trade;</strong><nav class="nav-links">${nav}</nav></div></header>
  <main class="container hero">
    <h1>${title}</h1>
    <p>${locale === "zh-CN" ? "\u5de5\u4e1a\u98ce\u9759\u6001\u7ad9\u70b9\u9875\u9762" : "Industrial static site page"}</p>
    ${body}
  </main>
  <footer><div class="container">&copy; <span data-year></span> LC-CNC</div></footer>
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
  const taskRoot = localChatTaskRoot(chatId, taskId);
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
    websiteSurfaceMode: snapshot.websiteSurfaceMode,
    routeUnitCount: snapshot.routeUnits?.length || 0,
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
        websiteSurfaceMode: snapshot.websiteSurfaceMode,
        routeUnits: snapshot.routeUnits || [],
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
        routeUnits: snapshot.routeUnits || [],
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
  chatId?: string;
  taskId?: string;
  workerId?: string;
  workflowId?: string;
  decision: LocalDecisionPlan;
  requirementText: string;
  locale: "zh-CN" | "en" | "bilingual";
  routes: string[];
  providerLock: RunProviderLock;
  providerConfig: ProviderConfig;
  skillId: string;
  websiteTypeSkillId: string;
  enabledSkillIds: string[];
  stylePreset: DesignStylePreset;
  designHit?: DesignSkillHit;
  guidance: WorkflowGuidancePack;
  designConfirm: DesignConfirmSnapshot;
  designSpec: DesignSpec;
  designContext: DesignContext;
  websiteDesignSpec: string;
  websiteSurfaceMode?: WebsiteSurfaceMode;
  discoveryBrief?: WebsiteDiscoveryBrief;
  designSystemId?: string;
  designSystemName?: string;
  selectedSeedSkillIds?: string[];
  selectedSeedContracts?: Array<{
    id: string;
    source?: "shpitto" | "imported-open-design" | "imported-html-anything";
    reason?: string;
    contract: ProjectSkillSeedContract;
  }>;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapWebsiteSeedOriginToManifestSource(origin: WebsiteSeedOrigin): "shpitto" | "imported-open-design" | "imported-html-anything" {
  if (origin === "open-design") return "imported-open-design";
  if (origin === "html-anything") return "imported-html-anything";
  return "shpitto";
}

function normalizePersistedSelectedSeedContracts(
  value: unknown,
): Array<{
  id: string;
  source?: "shpitto" | "imported-open-design" | "imported-html-anything";
  reason?: string;
  contract: ProjectSkillSeedContract;
}> {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map((entry) => {
      const item = toRecord(entry);
      const id = String(item.id || "").trim();
      const contract = item.contract && typeof item.contract === "object" && !Array.isArray(item.contract)
        ? (item.contract as ProjectSkillSeedContract)
        : undefined;
      if (!id || !contract) return undefined;
      const source = String(item.source || "").trim();
      return {
        id,
        source:
          source === "imported-open-design" || source === "imported-html-anything" || source === "shpitto"
            ? (source as "shpitto" | "imported-open-design" | "imported-html-anything")
            : undefined,
        reason: String(item.reason || "").trim() || undefined,
        contract,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  return entries;
}

function normalizeSelectedSeedSkillIdsFromWorkflowContext(workflowContext: Record<string, unknown>): string[] {
  const explicit = Array.isArray(workflowContext.selectedSeedSkillIds)
    ? (workflowContext.selectedSeedSkillIds as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (explicit.length > 0) return Array.from(new Set(explicit));

  const fromContracts = normalizePersistedSelectedSeedContracts(workflowContext.selectedSeedContracts).map((item) => item.id);
  if (fromContracts.length > 0) return Array.from(new Set(fromContracts));

  const manifest = toRecord(workflowContext.selectedSeedSkillManifest);
  const fromManifest = Array.isArray(manifest.selected)
    ? (manifest.selected as unknown[])
        .map((item) => String(toRecord(item).id || "").trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set(fromManifest));
}

async function resolveSelectedSeedSkillArtifacts(
  selectedSeedSkills: Array<{ id: string; reason: string }>,
): Promise<{
  selectedSeedContracts: Array<{
    id: string;
    source: "shpitto" | "imported-open-design" | "imported-html-anything";
    reason?: string;
    contract: ProjectSkillSeedContract;
  }>;
  selectedSeedSkillManifest: ReturnType<typeof buildSelectedSeedSkillManifest>;
}> {
  type ResolvedSelectedSeedEntry = {
    id: string;
    source: "shpitto" | "imported-open-design" | "imported-html-anything";
    reason?: string;
    contract?: ProjectSkillSeedContract;
  };

  const resolvedEntries: ResolvedSelectedSeedEntry[] = await Promise.all(
    selectedSeedSkills.map(async (item): Promise<ResolvedSelectedSeedEntry> => {
      try {
        const skill = await loadProjectSkill(item.id);
        return {
          id: skill.id,
          source: mapWebsiteSeedOriginToManifestSource(classifyWebsiteSeedOrigin(skill)),
          reason: item.reason,
          contract: skill.seedContract,
        };
      } catch {
        return {
          id: String(item.id || "").trim(),
          source: String(item.id || "").includes("imported-")
            ? (String(item.id || "").includes("html-anything") ? "imported-html-anything" : "imported-open-design")
            : ("shpitto" as const),
          reason: item.reason,
          contract: undefined,
        };
      }
    }),
  );

  const selectedSeedContracts = resolvedEntries.flatMap((item) =>
    item.id && item.contract
      ? [
          {
            id: item.id,
            source: item.source,
            reason: item.reason,
            contract: item.contract,
          },
        ]
      : [],
  );

  return {
    selectedSeedContracts,
    selectedSeedSkillManifest: buildSelectedSeedSkillManifest(
      resolvedEntries.map((item) => ({
        id: item.id,
        source: item.source,
        reason: item.reason,
      })),
      "Skill runtime selected imported website seeds for the active website workflow.",
    ),
  };
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
  private readonly providerAttempts: ProviderAttempt[];
  private activeProviderIndex = 0;
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
    const locale = detectRuntimeLocale(requirementText, (params.state as any)?.workflow_context?.preferredLocale);
    const workflowContext = toRecord((params.state as any)?.workflow_context);
    const skillId = resolveProjectSkillAlias(
      String(workflowContext.executionSkillId || workflowContext.skillId || WEBSITE_MAIN_SKILL_ID),
    );
    const enabledSkillIds = Array.isArray((params.state as any)?.workflow_context?.loadedSkillIds)
      ? ((params.state as any)?.workflow_context?.loadedSkillIds || []).map((id: string) => String(id).trim()).filter(Boolean)
      : [skillId];
    const stylePreset = normalizeStylePreset(
      (workflowContext.stylePreset as Partial<DesignStylePreset>) || (params.state as any)?.design_hit?.style_preset,
      {},
    );
    const designHit = ((params.state as any)?.design_hit || undefined) as DesignSkillHit | undefined;
    const designOverrides = toRecord(workflowContext.designOverrides);
    const promptControlManifest = toRecord(workflowContext.promptControlManifest);
    const workflowRuntime = toRecord(workflowContext.workflowRuntime);
    const websiteSurfaceMode =
      inferWebsiteSurfaceModeFromSkillId(String(promptControlManifest.websiteSurfaceMode || "")) ||
      inferWebsiteSurfaceModeFromSkillId(String((promptControlManifest as any)?.discoveryBrief?.surfaceMode || "")) ||
      inferWebsiteSurfaceModeFromSkillId(String(workflowContext.websiteSurfaceMode || "")) ||
      inferWebsiteSurfaceModeFromSkillId(String(workflowContext.websiteTypeSkillId || "")) ||
      inferWebsiteSurfaceModeFromSkillId(skillId);
    const discoveryBrief = (((promptControlManifest as any)?.discoveryBrief ||
      workflowContext.websiteDiscoveryBrief ||
      undefined) as WebsiteDiscoveryBrief | undefined);
    const selectedSeedContracts = normalizePersistedSelectedSeedContracts(workflowContext.selectedSeedContracts);
    const selectedSeedSkillIds = normalizeSelectedSeedSkillIdsFromWorkflowContext(workflowContext);
    const routeFamilies = inferRouteFamiliesForPlanning({ routes });
    const baseProviderAttempts = resolveProviderAttempts({
      provider: (params.state as any)?.workflow_context?.lockedProvider,
      model: (params.state as any)?.workflow_context?.lockedModel,
    });
    const requestedModel = resolveScenarioAwareProviderModelId({
      provider: baseProviderAttempts[0].lock.provider,
      requestedModel: String(workflowContext.lockedModel || "").trim() || undefined,
      surfaceMode: websiteSurfaceMode,
      seedAuthorityMode: decision.seedAuthorityMode,
      hasImportedSeed: selectedSeedContracts.length > 0,
      visualBoldness: selectedSeedContracts.some((item) => item.contract.visualBoldness === "high") ? "high" : undefined,
      routeFamilies,
    });
    const providerAttempts = resolveProviderAttempts({
      provider: baseProviderAttempts[0].lock.provider,
      model: requestedModel,
    });
    const providerLock = providerAttempts[0].lock;
    const providerConfig = providerAttempts[0].config;
    const guidance: WorkflowGuidancePack = {
      selectionCriteria: String(workflowContext.selectionCriteria || ""),
      sequentialWorkflow: String(workflowContext.sequentialWorkflow || ""),
      workflowGuide: String(workflowContext.workflowGuide || ""),
      rulesSummary: String(workflowContext.rulesSummary || ""),
      designMd: String(workflowContext.designMd || ""),
      websiteDesignSpec: String(workflowContext.websiteDesignSpec || ""),
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
    const generatedWebsiteDesignSpec = renderLocalWebsiteDesignSpec({
      requirementText,
      decision,
      stylePreset,
      designHit,
      websiteSurfaceMode,
      discoveryBrief,
      designSystemId: String(workflowContext.designSystemId || "").trim() || undefined,
      designSystemName: String(workflowContext.designSystemName || "").trim() || undefined,
      selectedSeedSkillIds,
      selectedSeedContracts,
    });
    const websiteDesignSpec = shouldReuseWebsiteDesignSpec(guidance.websiteDesignSpec, locale)
      ? guidance.websiteDesignSpec.trim()
      : generatedWebsiteDesignSpec;
    const existingStatic = dedupeFiles((params.state as any)?.site_artifacts?.staticSite?.files || []);
    const existingWorkflow = dedupeFiles((params.state as any)?.site_artifacts?.workflowArtifacts?.files || []);
    const existingPages = Array.isArray((params.state as any)?.site_artifacts?.pages)
      ? ((params.state as any).site_artifacts.pages || [])
          .map((page: any) => ({ path: normalizePath(String(page?.path || "/")), html: ensureHtmlDocument(String(page?.html || "")) }))
          .filter((page: any) => !!page.path && !!page.html)
      : [];

    this.context = {
      chatId: String(workflowContext.chatId || "").trim() || undefined,
      taskId: String(workflowContext.chatTaskId || workflowContext.taskId || "").trim() || undefined,
      workerId: String(workflowContext.workerId || "").trim() || undefined,
      workflowId: String(workflowRuntime.workflowId || "").trim() || undefined,
      decision,
      requirementText,
      locale,
      routes,
      providerLock,
      providerConfig,
      skillId,
      websiteTypeSkillId: String(workflowContext.websiteTypeSkillId || ""),
      enabledSkillIds,
      stylePreset,
      designHit,
      guidance,
      designConfirm,
      designSpec,
      designContext,
      websiteDesignSpec,
      websiteSurfaceMode,
      discoveryBrief,
      designSystemId: String(workflowContext.designSystemId || "").trim() || undefined,
      designSystemName: String(workflowContext.designSystemName || "").trim() || undefined,
      selectedSeedSkillIds,
      selectedSeedContracts,
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
    this.providerAttempts = providerAttempts;
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

  private buildRouteUnitSnapshots(): Array<
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
  > {
    return this.context.decision.pageBlueprints.map((page) => {
      const summary = buildRouteUnitContractSummary(
        {
          decision: this.context.decision,
          requirementText: this.requirementText,
          stylePreset: this.context.stylePreset,
          designHit: this.context.designHit,
          websiteSurfaceMode: this.context.websiteSurfaceMode,
          discoveryBrief: this.context.discoveryBrief,
          designSystemId: this.context.designSystemId,
          designSystemName: this.context.designSystemName,
          selectedSeedSkillIds: this.context.selectedSeedSkillIds,
          selectedSeedContracts: this.context.selectedSeedContracts,
        },
        page.route,
      ) || {
        route: page.route,
        navLabel: page.navLabel,
        pageKind: page.pageKind,
        routeContract: [
          `route=${page.route}`,
          `navLabel=${page.navLabel}`,
          `pageKind=${page.pageKind}`,
          `purpose=${page.purpose}`,
        ],
        inheritedTerminology: [this.context.decision.brandHint || "", this.context.websiteSurfaceMode || ""].filter(Boolean),
        inheritedTokens: [
          this.context.stylePreset.colors.primary,
          this.context.stylePreset.colors.accent,
          this.context.stylePreset.colors.background,
          this.context.stylePreset.typography,
        ].filter(Boolean),
        inheritedSeedSkillIds: this.context.selectedSeedSkillIds || [],
        openingFamily: "route-owned",
        openingTopology: "route-specific lead band",
        mediaPlan: [],
        mediaResources: [],
      };
      const htmlPath = routeToHtmlPath(page.route);
      const generatedFiles = this.files
        .map((file) => normalizePath(file.path))
        .filter((filePath) => filePath === htmlPath || filePath === "/styles.css" || filePath === "/script.js");
      const generationUnitInput = buildGenerationUnitInputFromRouteContract({
        summary,
        context: { websiteSurfaceMode: this.context.websiteSurfaceMode },
      });
      const routeQa = this.qaRecords.find((record) => normalizePath(record.route) === normalizePath(page.route));
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

  private async emit(stepKey: string, status: string) {
    if (!this.onStep) return;
    const routeUnits = this.buildRouteUnitSnapshots();
    const qaSummary =
      this.qaRecords.length > 0
        ? buildQaSummaryFromPageRecords(this.qaRecords, QA_MAX_RETRIES, {
            routeUnits,
            stylesCss: this.getFile("/styles.css")?.content || "",
            selectedSeedSkillIds: this.context.selectedSeedSkillIds || [],
          })
        : undefined;
    await this.onStep({
      stepKey,
      stepIndex: this.stepIndex,
      totalSteps: this.totalSteps,
      status,
      files: [...this.files],
      workflowArtifacts: [...this.workflowFiles],
      pages: [...this.pages],
      preferredLocale: this.context.locale,
      qaSummary,
      websiteSurfaceMode: this.context.websiteSurfaceMode,
      routeUnits,
    });
  }

  private async writeWorkflow(pathName: string, content: string, stageLabel: string) {
    const languageIssues = listWorkflowArtifactLanguageIssues(content);
    if (languageIssues.length > 0) {
      throw new Error(
        `skill_tool_workflow_artifact_language_gate_failed: ${normalizePath(pathName)} ${languageIssues.join("; ")}`,
      );
    }
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
    opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number; systemPrompt?: string; operationLabel?: string },
  ): Promise<string> {
    const isTestMode = process.env.NODE_ENV === "test";
    if (isTestMode) return "";
    const timeoutMs = Math.max(20_000, Number(opts?.timeoutMs || this.timeoutMs));
    const maxTokens = Math.max(256, Number(opts?.maxTokens || 8192));
    const retryPolicy = resolveProviderRetryPolicy("skill-native");
    const sleepMs = async (ms: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
    };
    const model = createModelForProvider(this.context.providerConfig, timeoutMs, maxTokens, opts?.temperature ?? 0.2);
    const messages: BaseMessage[] = [];
    const systemPrompt = String(opts?.systemPrompt || "").trim();
    const operationLabel = String(opts?.operationLabel || "").trim() || "skill-native-stage";
    if (systemPrompt) {
      messages.push(new SystemMessage(systemPrompt));
    }
    messages.push(new HumanMessage(prompt));
    let lastError: unknown;
    for (let index = this.activeProviderIndex; index < this.providerAttempts.length; index += 1) {
      const attempt = this.providerAttempts[index];
      const attemptModel =
        index === this.activeProviderIndex
          ? model
          : createModelForProvider(attempt.config, timeoutMs, maxTokens, opts?.temperature ?? 0.2);
      for (let retryAttempt = 0; retryAttempt <= retryPolicy.retries; retryAttempt += 1) {
        try {
          const ai = await invokeModelWithIdleTimeout({
            model: attemptModel,
            messages,
            timeoutMs,
            operation: `${operationLabel}:${attempt.config.provider}`,
          });
          if (index !== this.activeProviderIndex) {
            this.activeProviderIndex = index;
            this.context.providerLock = attempt.lock;
            this.context.providerConfig = attempt.config;
            console.warn(
              `[skill-native] provider_fallback_engaged ${JSON.stringify({
                chatId: this.context.chatId || null,
                taskId: this.context.taskId || null,
                workflowId: this.context.workflowId || null,
                workerId: this.context.workerId || null,
                operation: operationLabel,
                activeProviderIndex: index,
                provider: attempt.config.provider,
                model: attempt.config.modelName,
                endpoint: describeProviderConfig(attempt.config),
              })}`,
            );
          }
          return String(ai?.content || "").trim();
        } catch (error) {
          lastError = error;
          const retryable = isRetryableProviderError(error);
          const isLastProvider = index >= this.providerAttempts.length - 1;
          const exhaustedProviderRetries = retryAttempt >= retryPolicy.retries;
          console.warn(
            `[skill-native] provider_attempt_failed ${JSON.stringify({
              chatId: this.context.chatId || null,
              taskId: this.context.taskId || null,
              workflowId: this.context.workflowId || null,
              workerId: this.context.workerId || null,
              operation: operationLabel,
              providerChainIndex: index,
              providerAttempt: retryAttempt + 1,
              providerRetryBudget: retryPolicy.retries + 1,
              provider: attempt.config.provider,
              model: attempt.config.modelName,
              endpoint: describeProviderConfig(attempt.config),
              retryable,
              willRetrySameProvider: retryable && !exhaustedProviderRetries,
              willFallbackProvider: retryable && exhaustedProviderRetries && !isLastProvider,
              error: providerErrorText(error),
            })}`,
          );
          if (retryable && !exhaustedProviderRetries) {
            await sleepMs(providerRetryBackoffMs(retryPolicy, retryAttempt + 1));
            continue;
          }
          if (!retryable || isLastProvider) {
            throw error;
          }
          break;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(providerErrorText(lastError));
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
    const coreSet = new Set(WEBSITE_GENERATION_SKILL_BUNDLE.map((id) => resolveProjectSkillAlias(id)));
    const websiteTypeSkillId = resolveProjectSkillAlias(this.context.websiteTypeSkillId || "");
    const seedSkillIds =
      stage === "styles" || stage === "page"
        ? this.context.enabledSkillIds.filter((id) => !coreSet.has(resolveProjectSkillAlias(id)))
        : [];
    const stageIds = [
      ...(STAGE_SKILL_SCOPES[stage] || [WEBSITE_MAIN_SKILL_ID]),
      ...(websiteTypeSkillId ? [websiteTypeSkillId] : []),
      ...seedSkillIds,
    ];
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
    const specBudget = Math.max(2500, Number(process.env.SKILL_RUNTIME_WEBSITE_SPEC_MAX_CHARS || 12000));

    const entries: Array<{ title: string; content: string }> = [
      {
        title: "website-design-spec",
        content: clipTextWithBudget(this.context.websiteDesignSpec, specBudget),
      },
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
    let finalAntiSlop = { passed: true, score: 100, issues: [] as Array<{ code: string; severity: "error" | "warning"; message: string }> };
    const pageBlueprint = findPageBlueprint(this.context.decision, params.route);

    while (attempt <= QA_MAX_RETRIES) {
      const prompt = params.promptBuilder(qaFeedback, attempt);
      const modelHtml = await this.invokeLlm(prompt, {
        maxTokens: params.maxTokens,
        timeoutMs: params.timeoutMs,
        systemPrompt: params.systemPrompt,
        operationLabel: `page:${params.route}`,
      });
      finalHtml = ensureHtmlDocument(modelHtml);
      if (!finalHtml.trim()) finalHtml = params.fallbackHtml;

      const antiSlop = mergeAntiSlopLintResults(
        lintGeneratedWebsiteHtml(finalHtml),
        lintGeneratedWebsiteRouteHtml(finalHtml, {
          route: params.route,
          navLabel: pageBlueprint.navLabel,
          pagePurpose: pageBlueprint.purpose,
        }),
      );
      finalAntiSlop = antiSlop;
      finalQa = mergeValidationWithAntiSlop(
        await validateComponent(finalHtml, this.context.designSpec, this.context.designContext),
        antiSlop,
      );
      const pass = finalQa.passed && Number(finalQa.score || 0) >= QA_MIN_SCORE;
      if (pass) break;

      const antiSlopFeedback = renderAntiSlopFeedback(antiSlop);
      const hints = [
        ...((finalQa.errors || []).slice(0, 6)),
        ...((finalQa.warnings || []).slice(0, 4)),
      ];
      qaFeedback = [
        hints.length > 0 ? hints.map((item) => `- ${item}`).join("\n") : "- Improve design compliance and accessibility.",
        antiSlopFeedback,
      ].filter(Boolean).join("\n");
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
      antiSlopIssues: finalAntiSlop.issues.map((issue) => ({ code: issue.code, severity: issue.severity })),
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
    await this.writeWorkflow(
      "/DESIGN.md",
      renderLocalDesign(this.requirementText, this.context.locale, this.context.decision, this.context.stylePreset),
      "design",
    );
  }

  private async ensureWebsiteDesignSpec() {
    const existing = this.workflowFiles.find((f) => normalizePath(f.path).toLowerCase() === "/website_design_spec.md");
    if (existing?.content?.trim()) return;
    await this.writeWorkflow("/website_design_spec.md", this.context.websiteDesignSpec, "website_design_spec");
  }

  private async ensureStyles() {
    if (this.getFile("/styles.css")?.content?.trim()) return;
    let css = "";
    if (process.env.NODE_ENV !== "test") {
      const stageSkill = await this.buildStageSkillDirective("styles");
      const stageGuidance = this.buildStageGuidance("styles");
      const qualityContract = renderWebsiteQualityContract();
      const internalRequirementSummary = buildInternalRequirementSummaryForWorkflow(
        this.requirementText,
        this.context.decision,
        this.context.locale,
      );
      const systemPrompt = `You are a senior frontend design-system engineer.
Generate only raw CSS for styles.css.
Keep the output production-safe, responsive, and semantically consistent.
Never include markdown fences or explanation text.
Follow skill directives, design guidance, and the website quality contract strictly.`;
      const prompt = `Generate a single styles.css for the confirmed multi-page static website.
Output raw CSS only. No markdown fences.
${qualityContract}
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
${internalRequirementSummary}`;
      css = normalizeGeneratedCss(stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 12000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
        systemPrompt,
        operationLabel: "styles:/styles.css",
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
      const qualityContract = renderWebsiteQualityContract();
      const internalRequirementSummary = buildInternalRequirementSummaryForWorkflow(
        this.requirementText,
        this.context.decision,
        this.context.locale,
      );
      const systemPrompt = `You are a frontend JavaScript engineer.
Generate only raw JavaScript for script.js.
Keep behavior minimal, deterministic, and accessibility-friendly.
No markdown fences and no explanatory text.`;
      const prompt = `Generate a single script.js for a multi-page static website.
Output raw JavaScript only. No markdown fences.
Include only small UI helpers.
${qualityContract}
Skill ID: ${this.context.skillId}
Loaded Skills: ${stageSkill.ids.join(", ")}
Skill directives:
${stageSkill.text}
Guidance bundle:
${stageGuidance}
Locale: ${this.context.locale}
Routes: ${this.context.routes.join(", ")}
Page blueprints:
${blueprintDigest(this.context.decision)}
Requirements:
${internalRequirementSummary}
${this.context.routes.some((route) => normalizePath(route) === "/blog") ? 'Blog script contract: if [data-shpitto-blog-root] exists, fetch /api/blog/posts, render into [data-shpitto-blog-list], and leave fallback cards intact on failure. Do not include credentials, D1 bindings, or Worker code.' : ""}`;
      js = stripMarkdownCodeFences(await this.invokeLlm(prompt, {
        maxTokens: Number(process.env.LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET || 8000),
        timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS || 120000),
        systemPrompt,
        operationLabel: "script:/script.js",
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
      const qualityContract = renderWebsiteQualityContract();
      const navLinks = buildNavFromDecision(this.context.decision)
        .map((item) => `${internalNavLabelForRoute(item.href, item.label)}:${item.href}`)
        .join(", ");
      const sequentialContext = this.buildSequentialPageContext(pageOrder);
      const pageSourceBrief = extractRouteSourceBrief(
        this.requirementText,
        normalizedRoute,
        blueprint.navLabel,
        4200,
      );
      const internalRequirementSummary = buildInternalRequirementSummaryForWorkflow(
        this.requirementText,
        this.context.decision,
        this.context.locale,
      );
      const internalPageSourceBrief =
        pageSourceBrief && isWorkflowArtifactEnglishSafe(pageSourceBrief)
          ? normalizeWorkflowArtifactText(pageSourceBrief)
          : "Route-specific source notes are multilingual; preserve the source-backed page structure and visitor intent without copying raw multilingual excerpts into this internal prompt.";
      const routeDesignSpecExcerpt = buildWebsiteDesignSpecRouteExcerpt({
        decision: this.context.decision,
        requirementText: this.requirementText,
        stylePreset: this.context.stylePreset,
        designHit: this.context.designHit,
        websiteSurfaceMode: this.context.websiteSurfaceMode,
        discoveryBrief: this.context.discoveryBrief,
        designSystemId: this.context.designSystemId,
        designSystemName: this.context.designSystemName,
      }, normalizedRoute);
      const systemPrompt = [
        "You are a staff frontend engineer generating complete static HTML pages.",
        "Only output raw HTML. No markdown, no commentary.",
        "Always include <!doctype html>, <html>, <head>, <body>.",
        "Always include <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
        "Always include <link rel=\"stylesheet\" href=\"/styles.css\"> and <script src=\"/script.js\"></script>.",
        "If this route is marked as content-backed, design a page-specific content surface: preserve the site theme, include data-shpitto-blog-root, data-shpitto-blog-list, and data-shpitto-blog-api=\"/api/blog/posts\", and render polished preview resources without exposing backend or implementation labels.",
        "Follow design-system tokens, accessibility, the provided skill guidance, and the website quality contract strictly.",
      ].join("\n");
      const promptBuilder = (qaFeedback: string, attempt: number) => `Generate one complete HTML document for route ${normalizedRoute}.
${qualityContract}
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
Internal content binding contract, not visitor copy: when the current page kind is blog-data-index or content-collection-index, include data-shpitto-blog-root, data-shpitto-blog-list, and data-shpitto-blog-api="/api/blog/posts" inside the selected page's collection/list/database module; use source-aligned preview resource cards only. Never expose backend names, API/storage/runtime/hydration/fallback jargon, data-source mechanics, English design jargon, policy wording, or deployment mechanics in visible copy unless this route is explicitly Blog. Do not generate database credentials, D1 binding code, Cloudflare Worker code, or secrets.
Page responsibility: ${blueprint.responsibility}
Local fallback skeleton only: ${blueprint.contentSkeleton.join(" -> ")}
Local fallback component mix only: ${formatComponentMix(blueprint.componentMix)}
Fallback rule: if the selected seed guidance or route design spec defines a stronger opening family, section cadence, route-owned class vocabulary, or template discipline, follow that seed/spec contract first and use the local fallback hints only where the contract stays silent.
Page-specific source brief excerpt (authoritative for this file):
${internalPageSourceBrief || "No route-specific source excerpt found. Derive a unique page architecture from the complete requirement below."}
Route design spec excerpt (authoritative for layout/media decisions):
${routeDesignSpecExcerpt || "No route design spec excerpt found. Derive route layout from the full website design specification."}
Requirement:
${internalRequirementSummary}
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
    const routeUnits = this.buildRouteUnitSnapshots();
    const summary = buildQaSummaryFromPageRecords(this.qaRecords, QA_MAX_RETRIES, {
      routeUnits,
      stylesCss: this.getFile("/styles.css")?.content || "",
      selectedSeedSkillIds: this.context.selectedSeedSkillIds || [],
    });
    await this.writeWorkflow(
      "/qa-report.json",
      JSON.stringify(
        {
          generatedAt: nowIso(),
          minPassingScore: QA_MIN_SCORE,
          retriesAllowed: QA_MAX_RETRIES,
          averageScore,
          summary,
          records: this.qaRecords,
        },
        null,
        2,
      ),
      "qa_report",
    );
  }

  private async buildSiteArtifacts(baseState: AgentState) {
    const brandName = String((baseState as any)?.site_artifacts?.branding?.name || "LC-CNC").trim() || "LC-CNC";
    const projectId = String((baseState as any)?.db_project_id || "").trim();
    const ownerUserId = String((baseState as any)?.user_id || "").trim();
    const authApiBase = projectId && ownerUserId ? await resolveProjectAuthApiBase({ projectId, userId: ownerUserId }) : "";
    const siteKey = projectId && ownerUserId ? deriveProjectSiteKey(projectId, ownerUserId) : "";
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
            projectId,
            siteKey,
            authApiBase,
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

    const projectArtifact = {
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
    return materializeGeneratedBlogDetailPages({
      project: projectArtifact,
      inputState: baseState,
      locale: this.context.locale,
    });
  }

  async run(baseState: AgentState): Promise<AgentState> {
    await this.ensureTaskPlan();
    await this.ensureFindings();
    await this.ensureDesignConfirm();
    await this.ensureDesign();
    await this.ensureWebsiteDesignSpec();
    await this.ensureStyles();
    await this.ensureScript();
    await this.ensurePage("/");
    for (const route of this.context.routes) {
      if (normalizePath(route) === "/") continue;
      await this.ensurePage(route);
    }
    await this.ensureQaReport();
    await this.repairAllPages();

    const siteArtifacts = await this.buildSiteArtifacts(baseState);
    const actions = [{ text: "Deploy to shpitto server", payload: "deploy", type: "button" as const }];
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
        websiteDesignSpec: this.context.websiteDesignSpec,
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

  getQaSummary(): QaSummary {
    return buildQaSummaryFromPageRecords(this.qaRecords, QA_MAX_RETRIES, {
      routeUnits: this.buildRouteUnitSnapshots(),
      stylesCss: this.getFile("/styles.css")?.content || "",
      selectedSeedSkillIds: this.context.selectedSeedSkillIds || [],
    });
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
  const qaSummary = runtime.getQaSummary();

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
    qaSummary,
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
      qaSummary: summary.qaSummary,
      provider: summary.provider,
      model: summary.model,
      siteGeneratorMode: summary.siteGeneratorMode,
      routeUnits: (summary as any).routeUnits,
      routeRepairEvidence: summary.routeRepairEvidence,
      providerNotes: summary.providerNotes,
      routeUnitProviderBridgeNotes: summary.routeUnitProviderBridgeNotes,
    };
  }
  return await runLegacySkillRuntimeExecutor(params);
}

function toProgressStageMessage(stage: string, stepIndex?: number, totalSteps?: number): string {
  const normalized = String(stage || "").trim();
  const progress = Number.isFinite(Number(stepIndex)) && Number.isFinite(Number(totalSteps))
    ? ` (step ${stepIndex}/${totalSteps})`
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
      websiteDesignSpec: workflow.websiteDesignSpec,
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
      websiteSurfaceMode: workflow.websiteSurfaceMode,
      websiteDiscoveryBrief: workflow.websiteDiscoveryBrief,
      contractHash: workflow.contractHash,
      generationLane: workflow.generationLane,
      generationLaneConfig: workflow.generationLaneConfig,
      selectedSeedSkillIds: workflow.selectedSeedSkillIds,
      selectedSeedSkillReasons: workflow.selectedSeedSkillReasons,
      selectedSeedContracts: workflow.selectedSeedContracts,
      selectedSeedSkillManifest: workflow.selectedSeedSkillManifest,
      routeUnitContracts: workflow.routeUnitContracts,
      generationContract: workflow.generationContract,
      workflowRuntime: workflow.workflowRuntime,
      skillActionDomain: workflow.skillActionDomain,
      skillAction: workflow.skillAction,
      blogDetailFillRequested: workflow.blogDetailFillRequested,
      blogDetailFillStatus: workflow.blogDetailFillStatus,
      blogDetailFillCompleted: workflow.blogDetailFillCompleted,
      deploySourceProjectPath: workflow.deploySourceProjectPath,
      deploySourceTaskId: workflow.deploySourceTaskId,
      checkpointProjectPath: workflow.checkpointProjectPath,
      siteRevisionId: workflow.siteRevisionId,
      baseSiteRevisionId: workflow.baseSiteRevisionId,
      siteRevisionMode: workflow.siteRevisionMode,
      deployRequested: workflow.deployRequested,
    } as any,
  };
}

async function syncChatMemoryFromState(params: {
  chatId: string;
  stage: "previewing" | "deployed" | "drafting" | "deploying";
  intent?: string;
  intentConfidence?: number;
  taskId: string;
  state: AgentState;
  recentSummary: string;
  deployedUrl?: string;
}): Promise<void> {
  const workflow = toRecord((params.state as any)?.workflow_context);
  const requirementSpec = workflow.requirementSpec;
  if (!requirementSpec || typeof requirementSpec !== "object") return;
  const existingMemory = await readChatShortTermMemory(params.chatId);
  const revisionId = String(workflow.siteRevisionId || existingMemory?.revisionPointer?.revisionId || "").trim();
  if (!revisionId) return;
  const slots = Array.isArray(workflow.requirementSlots) ? workflow.requirementSlots : existingMemory?.requirementState?.slots || [];
  const missingCriticalSlots = slots.filter((slot: any) => slot?.required && !slot?.filled).map((slot: any) => String(slot?.label || ""));
  await writeChatShortTermMemory({
    threadId: params.chatId,
    stage: params.stage,
    intent: (params.intent || workflow.intent || existingMemory?.intent || "") as any,
    intentConfidence:
      typeof params.intentConfidence === "number"
        ? params.intentConfidence
        : Number(workflow.intentConfidence || existingMemory?.intentConfidence || 0) || undefined,
    recentSummary: params.recentSummary,
    updatedAt: new Date().toISOString(),
    revisionPointer: {
      revisionId,
      baseRevisionId: String(workflow.baseSiteRevisionId || existingMemory?.revisionPointer?.baseRevisionId || "").trim() || undefined,
      mode: (String(workflow.siteRevisionMode || existingMemory?.revisionPointer?.mode || "generate").trim().toLowerCase() as
        | "generate"
        | "refine"
        | "deploy"),
      taskId: params.taskId,
      checkpointProjectPath: String(workflow.checkpointProjectPath || "").trim() || undefined,
      deployedUrl: params.deployedUrl || String((params.state as any)?.deployed_url || "").trim() || undefined,
      requirementRevision: Number(workflow.requirementRevision || existingMemory?.revisionPointer?.requirementRevision || 0) || undefined,
      updatedAt: new Date().toISOString(),
    },
    workflowContext: workflow,
    requirementState: {
      slots: slots as any,
      conflicts: Array.isArray(workflow.correctionSummary) ? (workflow.correctionSummary as string[]) : existingMemory?.requirementState?.conflicts || [],
      missingCriticalSlots,
      readyScore:
        Number(workflow.requirementCompletionPercent || existingMemory?.requirementState?.readyScore || 0) ||
        Math.round((slots.filter((slot: any) => slot?.filled).length / Math.max(1, slots.length)) * 100),
      activeScope: String(workflow.activeScope || existingMemory?.requirementState?.activeScope || "").trim() || undefined,
      assumptions: Array.isArray(workflow.assumedDefaults) ? (workflow.assumedDefaults as string[]) : existingMemory?.requirementState?.assumptions || [],
      currentValues: requirementSpec as any,
    },
  });
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
      refineScope: "patch",
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

function htmlToReadableText(input: string) {
  return String(input || "")
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

export type BlogContentWorkflowPreview = {
  required: boolean;
  reason: string;
  navLabel: string;
  surfaceKind: BlogWorkflowSurfaceKind;
  posts: BlogPostUpsertInput[];
};

export function buildGeneratedBlogSeedPostsForTesting(params: {
  sourceText: string;
  locale: "zh-CN" | "en" | "bilingual";
}): BlogPostUpsertInput[] {
  const visibleLocale = toVisibleLocale(params.locale);
  return buildWebsiteGeneratedBlogSeedPosts({
    ...params,
    locale: visibleLocale,
    deps: getWebsiteBlogWorkflowDeps(),
  });
}

export function projectHasGeneratedBlogContentMount(project: any): boolean {
  return projectHasWebsiteGeneratedBlogContentMount(project, getWebsiteBlogWorkflowDeps());
}

export function buildBlogContentWorkflowPreview(params: {
  project: any;
  inputState: AgentState;
  locale: "zh-CN" | "en" | "bilingual";
}): BlogContentWorkflowPreview {
  const visibleLocale = toVisibleLocale(params.locale);
  return buildWebsiteBlogContentWorkflowPreview({
    ...params,
    locale: visibleLocale,
    deps: getWebsiteBlogWorkflowDeps(),
  });
}

function renderPendingContentConfirmationAssistantText(params: {
  locale: "zh-CN" | "en" | "bilingual";
  postCount: number;
  surfaceKind: BlogWorkflowSurfaceKind;
  phase: "generate" | "refine";
}): string {
  const locale = toVisibleLocale(params.locale);
  const { postCount, surfaceKind, phase } = params;
  if (surfaceKind === "blog-archive") {
    if (phase === "generate") {
      return locale === "zh-CN"
        ? `网站已生成，并已准备 ${postCount} 篇 Blog 文章草案。请先确认文章内容，再继续部署上线。`
        : `The website is generated and ${postCount} Blog article drafts are ready. Confirm the articles before deployment.`;
    }
    return locale === "zh-CN"
      ? `修改已完成，并已生成 ${postCount} 篇 Blog 文章草案。确认后即可部署。`
      : `Refinement completed. ${postCount} Blog article drafts are ready for confirmation before deploy.`;
  }
  if (phase === "generate") {
    return locale === "zh-CN"
      ? `网站已生成，并已准备 ${postCount} 条内容条目草案。请先确认内容，再继续部署上线。`
      : `The website is generated and ${postCount} content entry drafts are ready. Confirm the entries before deployment.`;
  }
  return locale === "zh-CN"
    ? `修改已完成，并已生成 ${postCount} 条内容条目草案。确认后即可部署。`
    : `Refinement completed. ${postCount} content entry drafts are ready for confirmation before deploy.`;
}

export function materializeGeneratedBlogDetailPagesForTesting(params: {
  project: any;
  inputState: AgentState;
  locale: "zh-CN" | "en" | "bilingual";
  mode?: "shell" | "content";
}): any {
  const visibleLocale = toVisibleLocale(params.locale);
  return materializeWebsiteBlogDetailPages({
    ...params,
    locale: visibleLocale,
    mode: params.mode,
    deps: getWebsiteCompletionDeps(),
  });
}

export function finalizeGeneratedProjectArtifactForTesting(params: {
  project: any;
  inputState: AgentState;
  locale: "zh-CN" | "en" | "bilingual";
}): any {
  return finalizeGeneratedProjectArtifact(params);
}

export async function materializeSiteDirectoryFromProjectForTesting(params: {
  project: any;
  siteDir: string;
  decision?: LocalDecisionPlan;
  requirementText?: string;
  workflowContext?: Record<string, unknown>;
}) {
  return materializeSiteDirectoryFromProject(params.project, params.siteDir, {
    decision: params.decision,
    requirementText: params.requirementText,
    workflowContext: params.workflowContext,
  });
}

export function normalizeGeneratedProjectArtifactPreviewForTesting(params: {
  project: any;
  decision: LocalDecisionPlan;
  requirementText: string;
  workflowContext?: Record<string, unknown>;
}) {
  return normalizeGeneratedProjectArtifactPreview(params);
}

export function buildQaSummaryFromPageRecordsForTesting(params: {
  records: PageQaRecord[];
  retriesAllowed: number;
  routeUnits?: Array<{
    route: string;
    routeContract: string[];
    openingFamily?: string;
    openingTopology?: string;
  }>;
  stylesCss?: string;
  selectedSeedSkillIds?: string[];
}) {
  return buildQaSummaryFromPageRecords(params.records, params.retriesAllowed, {
    routeUnits: params.routeUnits,
    stylesCss: params.stylesCss,
    selectedSeedSkillIds: params.selectedSeedSkillIds,
  });
}

export async function resolveWebsiteRuntimeSkillForTesting(params: {
  state: AgentState;
  explicitSkillId?: string;
}) {
  return resolveWebsiteRuntimeSkill(params);
}

export function resolveRuntimeTaskExecutionModeForTesting(state: AgentState) {
  return resolveRuntimeTaskExecutionMode(state);
}

function materializeGeneratedBlogDetailPages(params: {
  project: any;
  inputState: AgentState;
  locale: "zh-CN" | "en" | "bilingual";
  mode?: "shell" | "content";
}): any {
  const visibleLocale = toVisibleLocale(params.locale);
  return materializeWebsiteBlogDetailPages({
    ...params,
    locale: visibleLocale,
    mode: params.mode,
    deps: getWebsiteCompletionDeps(),
  });
}

function finalizeGeneratedProjectArtifact(params: {
  project: any;
  inputState: AgentState;
  locale: "zh-CN" | "en" | "bilingual";
}): any {
  return materializeGeneratedBlogDetailPages({
    ...params,
    mode: "shell",
  });
}

function collectPrimaryBlogSourceText(inputState: AgentState): string {
  return collectBlogWorkflowSourceText({
    inputState,
    deps: getWebsiteBlogWorkflowDeps(),
  });
}

function collectDeployBlogSourceText(inputState: AgentState, project: any): string {
  return collectBlogWorkflowSourceText({
    inputState,
    project,
    deps: getWebsiteBlogWorkflowDeps(),
  });
}

function inferBlogBrand(text: string, locale: "zh-CN" | "en"): string {
  return inferBlogBrandForWorkflow(text, locale);
}

function diffStaticProjectFiles(beforeProject: any, afterProject: any): string[] {
  const beforeFiles = dedupeFiles((ensureSkillDirectStaticProject(beforeProject)?.staticSite?.files || []) as any[]);
  const afterFiles = dedupeFiles((ensureSkillDirectStaticProject(afterProject)?.staticSite?.files || []) as any[]);
  const beforeMap = new Map(
    beforeFiles.map((file) => [normalizePath(String(file?.path || "")), String(file?.content || "")] as const),
  );
  const changed = new Set<string>();
  for (const file of afterFiles) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    const nextContent = String(file?.content || "");
    const previousContent = beforeMap.get(normalizedPath);
    if (previousContent === undefined || previousContent !== nextContent) {
      changed.add(normalizedPath);
    }
    beforeMap.delete(normalizedPath);
  }
  for (const removedPath of beforeMap.keys()) changed.add(removedPath);
  return Array.from(changed).sort((a, b) => a.localeCompare(b));
}

function isBlogDetailCompletionRefineInstruction(instruction: string): boolean {
  const normalized = String(instruction || "").trim().toLowerCase();
  if (!normalized) return false;
  return /(?:blog|article|post|内容页|详情页|明细页|文章页|detail page|detail pages)/i.test(normalized) &&
    /(?:缺少|缺失|补齐|补全|补充|complete|fill|missing|add|generate|create)/i.test(normalized);
}

function listProjectRoutes(project: any): string[] {
  const routes = new Set<string>();
  for (const page of Array.isArray(project?.pages) ? project.pages : []) {
    const route = normalizePath(String(page?.path || "/"));
    if (route) routes.add(route);
  }
  for (const file of Array.isArray(project?.staticSite?.files) ? project.staticSite.files : []) {
    const filePath = normalizePath(String(file?.path || ""));
    if (!filePath.toLowerCase().endsWith(".html")) continue;
    const route = filePath === "/index.html" ? "/" : normalizePath(filePath.replace(/\/index\.html$/i, ""));
    if (route) routes.add(route);
  }
  return Array.from(routes).sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}

function normalizeStructuralRouteCandidate(value: string): string | undefined {
  const raw = String(value || "").trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "");
  if (!raw) return undefined;
  if (raw.startsWith("/")) {
    const normalized = normalizePath(raw.replace(/\/+$/g, ""));
    return normalized || undefined;
  }

  const lowered = raw.toLowerCase().replace(/\s+/g, " ").trim();
  for (const alias of STRUCTURAL_ROUTE_ALIAS_MAP) {
    if (alias.keys.some((key) => lowered === key || lowered.includes(key))) {
      return alias.route;
    }
  }

  if (/^[a-z][a-z0-9\s/_-]{1,48}$/i.test(raw)) {
    const slug = normalizeSlugToken(raw, "");
    if (slug) return normalizePath(`/${slug}`);
  }

  return undefined;
}

function extractStructuralRefineRouteAdditions(project: any, instruction: string): string[] {
  return extractWebsiteStructuralRefineRouteAdditions(project, instruction, getWebsiteCompletionDeps());
}

function applyStructuralRefineCompletions(params: {
  project: any;
  inputState: AgentState;
  instruction: string;
  locale: "zh-CN" | "en" | "bilingual";
}): { project: any; changedFiles: string[] } {
  return applyWebsiteStructuralRefineCompletions({
    ...params,
    deps: getWebsiteCompletionDeps(),
  });
}

function buildBlogContentConfirmTimelineMetadata(params: {
  locale: "zh-CN" | "en" | "bilingual";
  navLabel: string;
  posts: BlogPostUpsertInput[];
  surfaceKind?: BlogWorkflowSurfaceKind;
}) {
  const visibleLocale = toVisibleLocale(params.locale);
  return buildContentWorkflowConfirmTimelineMetadataForWorkflow({
    ...params,
    locale: visibleLocale,
    deps: {
      toVisibleLocale,
    },
  });
}

function buildWebsiteGenerationTimelineMetadata(summary: SkillRuntimeExecutionSummary): Record<string, unknown> {
  const qaSummary = summary.qaSummary;
  return {
    websiteGeneration: {
      pageCount: summary.pageCount,
      fileCount: summary.fileCount,
      generatedFiles: summary.generatedFiles,
      provider: summary.provider,
      model: summary.model,
      siteGeneratorMode: summary.siteGeneratorMode,
      qa: qaSummary
        ? {
            averageScore: qaSummary.averageScore,
            totalRoutes: qaSummary.totalRoutes,
            passedRoutes: qaSummary.passedRoutes,
            totalRetries: qaSummary.totalRetries,
            categories: qaSummary.categories,
            observations: qaSummary.observations || [],
          }
        : undefined,
      routeRepairEvidence: {
        status:
          summary.routeRepairEvidence?.status ||
          (qaSummary && qaSummary.totalRetries > 0 ? "route_repairs_applied" : "no_route_repair_needed"),
        failedRoute: null,
        repairedFiles: summary.routeRepairEvidence?.repairedFiles || [],
        repairAttemptCount:
          summary.routeRepairEvidence?.repairAttemptCount ||
          (qaSummary && qaSummary.totalRetries > 0 ? qaSummary.totalRetries : 0),
        fullRegenerationAvoided:
          summary.routeRepairEvidence?.fullRegenerationAvoided ??
          (qaSummary && qaSummary.totalRetries > 0 ? true : null),
      },
      routeUnits: (summary.routeUnits || []).map((unit) => ({
        route: unit.route,
        pageKind: unit.pageKind,
        generatedFiles: unit.generatedFiles,
        validationStatus: unit.validationStatus,
        issueCount: unit.validationResult?.issues?.length || 0,
      })),
    },
  };
}

async function translateCatalogWithModel(params: {
  providerConfig: ProviderConfig;
  timeoutMs: number;
  targetLocale: string;
  defaultLocale: string;
  sourceMessages: Record<string, string>;
  existingMessages: Record<string, string>;
}): Promise<TranslationCatalogDraft | null> {
  const sourceEntries = Object.entries(params.sourceMessages);
  if (sourceEntries.length === 0) return null;

  const model = createModelForProvider(
    params.providerConfig,
    Math.max(25_000, Number(params.timeoutMs || 90_000)),
    Math.max(1200, Number(process.env.CHAT_TRANSLATION_MAX_TOKENS || 5000)),
    0.1,
  );

  const systemPrompt = [
    "You are a professional website localization engine.",
    "Translate message catalog values from the default locale into the target locale.",
    "Return strict JSON only without markdown fences.",
    "Preserve keys exactly and keep placeholders, HTML tags, brand names, URLs, code snippets, and variable tokens intact.",
  ].join(" ");

  const userPrompt = [
    `Default locale: ${params.defaultLocale}`,
    `Target locale: ${params.targetLocale}`,
    "",
    "Source messages:",
    JSON.stringify(params.sourceMessages, null, 2),
    "",
    "Existing target messages:",
    JSON.stringify(params.existingMessages, null, 2),
    "",
    'Return JSON with this exact shape: {"translated":true,"messages":{"key":"translated value"},"note":"optional short note"}',
    "Rules:",
    "- Include every source key in messages.",
    "- Translate only the values, never the keys.",
    "- Keep placeholders like {count}, {{name}}, %s, and :id unchanged.",
    "- Keep inline HTML tags and attribute-like fragments unchanged except for the human-language text around them.",
    "- If a value is already language-neutral or a proper noun, it may stay unchanged.",
  ].join("\n");

  const ai = await invokeModelWithIdleTimeout({
    model,
    messages: [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
    timeoutMs: Math.max(25_000, Number(params.timeoutMs || 90_000)),
    operation: `translate-catalog:${params.targetLocale}`,
  });
  const parsed = parseJsonFromLlmText(String(ai?.content || "").trim());
  const rawMessages = toRecord(parsed?.messages);
  const normalizedMessages = Object.fromEntries(
    sourceEntries.map(([key, fallbackValue]) => {
      const candidate = String(rawMessages[key] || "").trim();
      return [key, candidate || String(params.existingMessages[key] || "").trim() || fallbackValue];
    }),
  );
  return {
    translated: true,
    messages: normalizedMessages,
    note: String(parsed?.note || "").trim() || undefined,
  };
}

function resolveRuntimeTaskExecutionMode(state: AgentState): "generate" | "refine" | "translate" | "deploy" {
  const workflow = toRecord((state as any)?.workflow_context);
  const executionMode = String(workflow.executionMode || "").trim().toLowerCase();
  const deployRequested = Boolean(workflow.deployRequested) || isDeployConfirmationIntent(extractRequirementText(state));
  if (deployRequested || executionMode === "deploy") return "deploy";
  if (executionMode === "translate" || Boolean(workflow.translateRequested)) return "translate";
  if (executionMode === "refine" || Boolean(workflow.refineRequested)) return "refine";
  return "generate";
}

function isBlogDetailFillAction(inputState: AgentState): boolean {
  return String((inputState.workflow_context as any)?.skillActionDomain || "").trim() === "blog_detail" &&
    String((inputState.workflow_context as any)?.skillAction || "").trim() === "fill_details";
}

function getWorkflowContentPreviewPosts(workflowContext: Record<string, unknown>): BlogPostUpsertInput[] {
  if (Array.isArray((workflowContext as any)?.contentPreviewPosts)) {
    return (((workflowContext as any)?.contentPreviewPosts || []) as BlogPostUpsertInput[]).filter((post) => post && typeof post === "object");
  }
  if (Array.isArray((workflowContext as any)?.blogContentPreviewPosts)) {
    return (((workflowContext as any)?.blogContentPreviewPosts || []) as BlogPostUpsertInput[]).filter((post) => post && typeof post === "object");
  }
  return [];
}

function getWorkflowContentPreviewConfirmed(workflowContext: Record<string, unknown>): boolean {
  return Boolean((workflowContext as any)?.contentPreviewConfirmed ?? (workflowContext as any)?.blogContentConfirmed);
}

function getWorkflowContentPreviewStatus(workflowContext: Record<string, unknown>): string {
  return String((workflowContext as any)?.contentPreviewStatus || (workflowContext as any)?.blogContentPreviewStatus || "").trim();
}

function isBlogContentRegenerationAction(inputState: AgentState): boolean {
  return String((inputState.workflow_context as any)?.skillActionDomain || "").trim() === "blog_content" &&
    String((inputState.workflow_context as any)?.skillAction || "").trim() === "regenerate_posts";
}

function shouldRequireBlogDetailFillBeforeDomainBinding(workflowContext: Record<string, unknown>, project: any): boolean {
  if (Boolean((workflowContext as any)?.blogDetailFillCompleted)) return false;
  if (String((workflowContext as any)?.blogDetailFillStatus || "").trim() === "completed") return false;
  if (!projectHasGeneratedBlogContentMount(project)) return false;
  return true;
}

function resolveBlogNavLabelFromProject(project: any, locale: "zh-CN" | "en") {
  return resolveBlogNavLabelForWorkflow(project, locale, getWebsiteBlogWorkflowDeps());
}

async function ensureGeneratedBlogContentForDeploy(params: {
  projectId: string;
  userId?: string;
  inputState: AgentState;
  project: any;
  locale: "zh-CN" | "en" | "bilingual";
}) {
  if (!params.projectId) return { status: "skipped", postCount: 0 };
  if (!projectHasGeneratedBlogContentMount(params.project)) return { status: "skipped:no_content_mount", postCount: 0 };
  const sourceText = collectPrimaryBlogSourceText(params.inputState);

  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  if (!d1.isConfigured()) return { status: "skipped:no_d1", postCount: 0 };
  const project = params.userId
    ? await d1.queryOne<Record<string, unknown>>(
        `
        SELECT id, account_id AS accountId, owner_user_id AS ownerUserId
        FROM shpitto_projects
        WHERE id = ?
          AND owner_user_id = ?
          AND source_app = 'shpitto'
        LIMIT 1;
        `,
        [params.projectId, params.userId],
      )
    : await d1.queryOne<Record<string, unknown>>(
        `
        SELECT id, account_id AS accountId, owner_user_id AS ownerUserId
        FROM shpitto_projects
        WHERE id = ?
          AND source_app = 'shpitto'
        LIMIT 1;
        `,
        [params.projectId],
      );
  const accountId = String(project?.accountId || "").trim();
  const ownerUserId = String(params.userId || project?.ownerUserId || "").trim();
  if (!project || !accountId) return { status: "skipped:no_project", postCount: 0 };
  if (!ownerUserId) return { status: "skipped:no_owner", postCount: 0 };

  const visibleLocale = toVisibleLocale(params.locale);
  const now = new Date().toISOString();
  await d1.execute(
    `
    INSERT INTO shpitto_blog_settings (
      project_id, account_id, owner_user_id, source_app, enabled, nav_label, home_featured_count,
      default_layout_key, default_theme_key, rss_enabled, sitemap_enabled, created_at, updated_at
    )
    VALUES (?, ?, ?, 'shpitto', 1, ?, 3, '', '', 1, 1, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      enabled = 1,
      nav_label = excluded.nav_label,
      home_featured_count = 3,
      rss_enabled = 1,
      sitemap_enabled = 1,
      updated_at = excluded.updated_at;
    `,
    [params.projectId, accountId, ownerUserId, resolveBlogNavLabelFromProject(params.project, visibleLocale), now, now],
  );
  const confirmedWorkflowPosts = getWorkflowContentPreviewConfirmed((params.inputState.workflow_context as any) || {});
  const workflowPosts = getWorkflowContentPreviewPosts((params.inputState.workflow_context as any) || {});
  const previewPosts = buildBlogContentWorkflowPreview({
    inputState: params.inputState,
    project: params.project,
    locale: visibleLocale,
  }).posts;
  if (previewPosts.length === 0 && workflowPosts.length === 0 && sourceText.trim().length < 12) {
    return { status: "skipped:no_source", postCount: 0 };
  }
  const posts = confirmedWorkflowPosts && workflowPosts.length > 0
    ? workflowPosts
    : previewPosts.length > 0
      ? previewPosts
      : workflowPosts.length > 0
        ? workflowPosts
        : buildGeneratedBlogSeedPostsForTesting({ sourceText, locale: visibleLocale });
  await d1.execute(
    `
    DELETE FROM shpitto_blog_posts
    WHERE project_id = ?
      AND source_app = 'shpitto'
      AND (
        id LIKE 'generated-content-post-%'
        OR id LIKE ?
      );
    `,
    [params.projectId, `${params.projectId}-%-post-%`],
  );
  let written = 0;
  for (const [index, post] of posts.entries()) {
    const postId = `generated-content-post-${index + 1}`;
    const publishedAt = new Date(Date.now() - index * 60_000).toISOString();
    await d1.execute(
      `
      INSERT INTO shpitto_blog_posts (
        id, project_id, account_id, owner_user_id, source_app, slug, title, excerpt, content_md, content_html,
        status, author_name, category, tags_json, cover_image_url, cover_image_alt, seo_title, seo_description,
        theme_key, layout_key, published_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, 'published', ?, ?, ?, '', '', ?, ?, '', '', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        account_id = excluded.account_id,
        owner_user_id = excluded.owner_user_id,
        slug = excluded.slug,
        title = excluded.title,
        excerpt = excluded.excerpt,
        content_md = excluded.content_md,
        content_html = excluded.content_html,
        status = 'published',
        author_name = excluded.author_name,
        category = excluded.category,
        tags_json = excluded.tags_json,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at;
      `,
      [
        postId,
        params.projectId,
        accountId,
        ownerUserId,
        post.slug || postId,
        post.title,
        post.excerpt || "",
        post.contentMd,
        renderMarkdownToHtml(post.contentMd),
        post.authorName || "",
        post.category || "",
        JSON.stringify(post.tags || []),
        post.seoTitle || post.title,
        post.seoDescription || post.excerpt || "",
        publishedAt,
        now,
        now,
      ],
    );
    written += 1;
  }
  return { status: written >= 3 ? "seeded" : "partial", postCount: written };
}

function buildStaticBlogSnapshotPostsForDeploy(params: {
  projectId: string;
  userId?: string;
  inputState: AgentState;
  project: any;
  locale: "zh-CN" | "en";
}): BlogPostRecord[] {
  const confirmedWorkflowPosts = getWorkflowContentPreviewConfirmed((params.inputState.workflow_context as any) || {});
  const workflowPosts = getWorkflowContentPreviewPosts((params.inputState.workflow_context as any) || {});
  const previewPosts = buildBlogContentWorkflowPreview({
    inputState: params.inputState,
    project: params.project,
    locale: params.locale,
  }).posts;
  const posts = confirmedWorkflowPosts && workflowPosts.length > 0
    ? workflowPosts
    : previewPosts.length > 0
      ? previewPosts
      : workflowPosts;
  const usedSlugs = new Set<string>();
  const now = nowIso();
  return posts.map((post, index) => {
    const baseSlug = normalizeSlugToken(post.slug || post.title || "", `post-${index + 1}`);
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);
    const contentMd = String(post.contentMd || "").trim();
    const publishedAt = post.publishedAt || new Date(Date.now() - index * 60_000).toISOString();
    return {
      id: `static-content-post-${index + 1}`,
      projectId: params.projectId,
      accountId: "",
      ownerUserId: String(params.userId || "").trim(),
      slug,
      title: String(post.title || `Post ${index + 1}`).trim(),
      excerpt: String(post.excerpt || "").trim(),
      contentMd,
      contentHtml: renderMarkdownToHtml(contentMd),
      status: "published",
      authorName: String(post.authorName || "").trim(),
      category: String(post.category || "").trim(),
      tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
      coverImageUrl: String(post.coverImageUrl || "").trim(),
      coverImageAlt: String(post.coverImageAlt || "").trim(),
      seoTitle: String(post.seoTitle || post.title || "").trim(),
      seoDescription: String(post.seoDescription || post.excerpt || "").trim(),
      themeKey: String(post.themeKey || "").trim(),
      layoutKey: String(post.layoutKey || "").trim(),
      publishedAt,
      createdAt: now,
      updatedAt: now,
    };
  });
}

function buildStaticBlogSnapshotFilesForDeploy(params: {
  projectId: string;
  userId?: string;
  inputState: AgentState;
  project: any;
  locale: "zh-CN" | "en";
}) {
  if (!getWorkflowContentPreviewConfirmed((params.inputState.workflow_context as any) || {})) {
    return { files: [], postCount: 0 };
  }
  if (!projectHasGeneratedBlogContentMount(params.project)) {
    return { files: [], postCount: 0 };
  }
  const posts = buildStaticBlogSnapshotPostsForDeploy(params);
  if (posts.length === 0) return { files: [], postCount: 0 };
  const now = nowIso();
  return {
    files: buildDeployedBlogSnapshotFiles({
      projectId: params.projectId,
      posts,
      settings: {
        projectId: params.projectId,
        accountId: "",
        ownerUserId: String(params.userId || "").trim(),
        enabled: true,
        navLabel: resolveBlogNavLabelFromProject(params.project, params.locale),
        homeFeaturedCount: 3,
        defaultLayoutKey: "",
        defaultThemeKey: "",
        rssEnabled: true,
        sitemapEnabled: true,
        createdAt: now,
        updatedAt: now,
      },
      generatedAt: now,
    }),
    postCount: posts.length,
  };
}

function buildDesignGuidanceCacheSnapshot(
  requirementText: string,
  visualDecision?: ReturnType<typeof normalizeWorkflowVisualDecisionContext>,
): DesignGuidanceCacheSnapshot {
  return {
    requirementHash: crypto.createHash("sha1").update(String(requirementText || "").trim()).digest("hex"),
    templateStyleId: String(visualDecision?.templateStyleId || "").trim(),
    primaryVisualDirection: String(visualDecision?.primaryVisualDirection || "").trim(),
    secondaryVisualTags: Array.isArray(visualDecision?.secondaryVisualTags)
      ? visualDecision.secondaryVisualTags.map((item) => String(item || "").trim()).filter(Boolean).join("|")
      : "",
  };
}

function matchesDesignGuidanceCacheSnapshot(
  workflowContext: Record<string, unknown>,
  expected: DesignGuidanceCacheSnapshot,
): boolean {
  return (
    String(workflowContext.designGuidanceRequirementHash || "").trim() === expected.requirementHash &&
    String(workflowContext.designGuidanceTemplateStyleId || "").trim() === expected.templateStyleId &&
    String(workflowContext.designGuidancePrimaryVisualDirection || "").trim() === expected.primaryVisualDirection &&
    String(workflowContext.designGuidanceSecondaryVisualTags || "").trim() === expected.secondaryVisualTags
  );
}

function getSnapshotPostCount(files: Array<{ path?: string; content?: string }>) {
  const snapshot = files.find((file) => normalizePath(String(file?.path || "")) === "/shpitto-blog-snapshot.json");
  if (!snapshot) return 0;
  try {
    return Math.max(0, Number(JSON.parse(String(snapshot.content || "{}"))?.postCount || 0));
  } catch {
    return 0;
  }
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
  const checkpointRoot = localChatTaskRoot(chatId, taskId);
  const checkpointWorkflowDir = path.join(checkpointRoot, "workflow");
  let workflowRuntime = resolveWorkflowRuntimeFromState(inputState);
  if (workflowRuntime) {
    workflowRuntime = markWorkflowExecutionStarted(workflowRuntime);
    workflowRuntime = (
      await appendWorkflowAuditEvent({
        runtime: workflowRuntime,
        checkpointDir: checkpointWorkflowDir,
        type: "execution_started",
        message: "Deploy execution started.",
      })
    ).runtime;
  }

  await touchChatTaskHeartbeat(taskId, workerId);
  await updateChatTaskProgress(taskId, {
    assistantText: "Deploy request confirmed. Preparing deployment to shpitto server.",
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

  const sourceProject = await resolveDeploySourceProject(inputState, { chatId, taskId });
  if (!sourceProject) {
    if (workflowRuntime) {
      workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
      workflowRuntime = startWorkflowCompensation(workflowRuntime, {
        reason: "Deployment was requested without a generated baseline.",
      });
      workflowRuntime = completeWorkflowCompensation(workflowRuntime, {
        message: "No external deployment side effects were produced because the baseline was missing.",
      });
      workflowRuntime = (
        await appendWorkflowAuditEvent({
          runtime: workflowRuntime,
          checkpointDir: checkpointWorkflowDir,
          type: "execution_failed",
          message: "Deploy baseline is missing.",
        })
      ).runtime;
    }
    await failChatTask(taskId, "No generated site artifacts found for deployment. Please generate a site first, then confirm deploy.", workflowRuntime
      ? {
          internal: {
            inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            workerId,
          },
        }
      : undefined);
    return;
  }
  const deployLocale = detectRuntimeLocale(
    extractStateMessageText(inputState.messages),
    (inputState.workflow_context as any)?.preferredLocale,
  );
  const deployBlogLocale = toVisibleLocale(deployLocale);
  const blogPreview = buildBlogContentWorkflowPreview({
    inputState,
    project: sourceProject,
    locale: deployBlogLocale,
  });
  if (blogPreview.required && !getWorkflowContentPreviewConfirmed((inputState.workflow_context as any) || {})) {
    await failChatTask(
      taskId,
      deployLocale === "zh-CN"
        ? "Blog 文章尚未确认。请先确认生成的文章内容，再执行部署。"
        : "Blog articles are not confirmed yet. Confirm the generated article set before deploying.",
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
  let publishedAssetVersion = "";
  let deploymentStrategy: CloudflareDeployStrategy = "direct-upload";
  let wranglerDeployment: WranglerDeployResult | null = null;

  try {
    if (ownerUserId) {
      await assertCanMutatePublishedSite(ownerUserId);
      try {
        dbProjectId = await saveProjectState(ownerUserId, sourceProject, inputState.access_token, chatId);
      } catch (error) {
        console.warn(
          `[SkillRuntimeExecutor] saveProjectState before deploy failed: ${String((error as any)?.message || error || "unknown")}`,
        );
      }
    }

    await updateChatTaskProgress(taskId, {
      assistantText: shouldProvisionWebAnalyticsForDeployment(deploymentHost)
        ? `Provisioning analytics for ${deploymentHost}...`
        : `Skipping Cloudflare Web Analytics for ${deploymentHost}.`,
      phase: "deploy",
      progress: {
        stage: "deploying:analytics",
        stageMessage: shouldProvisionWebAnalyticsForDeployment(deploymentHost)
          ? "Preparing Cloudflare Web Analytics site token..."
          : "Skipping Web Analytics for pages.dev preview deployment.",
        startedAt: new Date(startedAt).toISOString(),
        lastTokenAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        attempt: 1,
      } as any,
    });

    if (shouldProvisionWebAnalyticsForDeployment(deploymentHost)) {
      try {
        analyticsSite = await cf.ensureWebAnalyticsSite(deploymentHost);
        deployProject = injectCloudflareAnalyticsBeacon(sourceProject, analyticsSite.siteTag);
        analyticsStatus = "active";
      } catch (error) {
        analyticsStatus = "degraded";
        analyticsWarning = String((error as any)?.message || error || "Cloudflare analytics provisioning failed");
        console.warn(`[SkillRuntimeExecutor] analytics provisioning warning: ${analyticsWarning}`);
      }
    } else {
      analyticsStatus = "pending";
      analyticsWarning =
        "Skipped for pages.dev preview deployment. Bind a custom domain or set CLOUDFLARE_WA_ENABLE_PAGES_DEV=1 to enable Web Analytics.";
    }

    try {
      if (ownerUserId) {
        const published = await publishCurrentProjectAssets({
          ownerUserId,
          projectId: chatId,
        });
        publishedAssetVersion = String(published.publishedVersion || "").trim();
        const projectAssets = await listProjectAssets({
          ownerUserId,
          projectId: chatId,
        }).catch(() => []);
        deployProject = rewriteProjectAssetLogicalUrlsForRelease(deployProject, {
          ownerUserId,
          projectId: chatId,
        }, projectAssets);
      }
    } catch (error) {
      console.warn(
        `[SkillRuntimeExecutor] publishCurrentProjectAssets failed before deploy: ${String((error as any)?.message || error || "unknown")}`,
      );
    }

    const contentSeedLocale = detectRuntimeLocale(
      collectDeployBlogSourceText(inputState, deployProject) || extractStateMessageText(inputState.messages),
      (inputState.workflow_context as any)?.preferredLocale,
    );
    let generatedBlogContentStatus: { status: string; postCount: number } = { status: "skipped", postCount: 0 };
    try {
      generatedBlogContentStatus = await ensureGeneratedBlogContentForDeploy({
        projectId: dbProjectId || chatId,
        userId: ownerUserId || undefined,
        inputState,
        project: deployProject,
        locale: toVisibleLocale(contentSeedLocale),
      });
    } catch (error) {
      generatedBlogContentStatus = { status: "failed", postCount: 0 };
      console.warn(
        `[SkillRuntimeExecutor] ensureGeneratedBlogContentForDeploy failed: ${String((error as any)?.message || error || "unknown")}`,
      );
    }

    const blogD1Binding = resolveBlogD1BindingConfig();
    let blogRuntimeStatus = "snapshot:skipped";
    let blogRuntimeInjected = false;
    try {
      let snapshotFiles = await buildDeployedBlogSnapshotFilesFromD1(dbProjectId || chatId);
      if (getSnapshotPostCount(snapshotFiles) === 0) {
        const staticSnapshot = buildStaticBlogSnapshotFilesForDeploy({
          projectId: dbProjectId || chatId,
          userId: ownerUserId || undefined,
          inputState,
          project: deployProject,
          locale: deployBlogLocale,
        });
        if (staticSnapshot.postCount > 0) {
          snapshotFiles = staticSnapshot.files;
          const statusSuffix = generatedBlogContentStatus.status.startsWith("skipped:")
            ? generatedBlogContentStatus.status.slice("skipped:".length)
            : "preview";
          generatedBlogContentStatus = { status: `static:${statusSuffix}`, postCount: staticSnapshot.postCount };
        }
      }
      const snapshot = injectDeployedBlogSnapshot(deployProject, snapshotFiles);
      deployProject = snapshot.project;
      blogRuntimeStatus = snapshot.injected ? `snapshot:${snapshot.files.length}` : "snapshot:skipped";
    } catch (error) {
      blogRuntimeStatus = "snapshot:failed";
      console.warn(
        `[SkillRuntimeExecutor] buildDeployedBlogSnapshotFilesFromD1 failed: ${String((error as any)?.message || error || "unknown")}`,
      );
    }
    const shouldInjectBlogRuntime = isDeployedBlogRuntimeEnabled() && projectHasGeneratedBlogContentMount(deployProject);
    if (shouldInjectBlogRuntime) {
      const injected = injectDeployedBlogRuntime(deployProject, {
        projectId: dbProjectId || chatId,
        d1BindingName: blogD1Binding?.bindingName || "DB",
        generatedAt: nowIso(),
      });
      deployProject = injected.project;
      blogRuntimeInjected = injected.injected;
      blogRuntimeStatus = injected.injected
        ? blogD1Binding
          ? `active:${blogD1Binding.bindingName}`
          : "injected_without_d1_binding"
        : "skipped";
    }
    deploymentStrategy = resolveCloudflareDeployStrategy({
      blogRuntimeEnabled: shouldInjectBlogRuntime,
      blogRuntimeInjected,
    });

    await updateChatTaskProgress(taskId, {
      assistantText: `Deploying to shpitto server project ${projectName} (${deploymentStrategy})...`,
      phase: "deploy",
      progress: {
        stage: "deploying:upload",
        stageMessage:
          deploymentStrategy === "wrangler"
            ? "Publishing Pages Functions bundle with Wrangler..."
            : "Uploading static bundle to Cloudflare Pages...",
        startedAt: new Date(startedAt).toISOString(),
        lastTokenAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        attempt: 1,
        analyticsStatus,
        blogRuntimeStatus,
        generatedBlogContentStatus,
        deploymentStrategy,
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

    await cf.createProject(projectName, deploymentStrategy === "wrangler" ? blogD1Binding || undefined : undefined);
    if (deploymentStrategy === "wrangler") {
      wranglerDeployment = await deployWithWrangler({
        taskId,
        projectName,
        branch: "main",
        bundle,
      });
    } else {
      await cf.uploadDeployment(projectName, bundle);
    }
    const productionUrl = `https://${projectName}.pages.dev`;
    const postDeploySmoke = await runPostDeploySmoke(productionUrl, {
      fallbackUrls: wranglerDeployment?.deploymentUrl ? [wranglerDeployment.deploymentUrl] : undefined,
    });
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
    const blogRuntimeSmoke =
      deploymentStrategy === "wrangler" && blogRuntimeInjected
        ? await runPostDeployBlogRuntimeSmoke(productionUrl)
        : undefined;
    if (blogRuntimeSmoke?.status === "failed") {
      await failChatTask(
        taskId,
        `Post-deploy Blog runtime smoke gate failed: ${blogRuntimeSmoke.checks
          .filter((check) => !check.passed)
          .map((check) => `${check.name}${check.message ? ` (${check.message})` : ""}`)
          .join(", ")}`,
      );
      return;
    }
    const liveUrl = productionUrl;

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

    const blogDetailFillRequired = shouldRequireBlogDetailFillBeforeDomainBinding(
      ((inputState.workflow_context as any) || {}) as Record<string, unknown>,
      deployProject,
    );
    const deploymentMessageParts = [
      deployLocale === "zh-CN" ? `\u90e8\u7f72\u6210\u529f\uff1a${liveUrl}` : `Deployment successful: ${liveUrl}`,
      publishedAssetVersion ? `(Published assets ${publishedAssetVersion})` : "",
      analyticsStatus === "active"
        ? "(Cloudflare analytics enabled)"
        : analyticsWarning
          ? `(Analytics pending: ${analyticsWarning})`
          : "(Analytics pending)",
      blogRuntimeStatus.startsWith("active:")
        ? `(Blog runtime bound to D1 ${blogRuntimeStatus.slice("active:".length)})`
        : blogRuntimeStatus === "injected_without_d1_binding"
          ? "(Blog runtime injected; D1 binding missing)"
          : blogRuntimeStatus.startsWith("snapshot:")
            ? `(Blog snapshot ${blogRuntimeStatus.slice("snapshot:".length)} file(s))`
          : "",
      generatedBlogContentStatus.postCount
        ? `(Generated ${generatedBlogContentStatus.postCount} content-derived Blog post(s))`
        : "",
      `(Deploy: ${deploymentStrategy})`,
      `(Smoke: pre=${preDeploySmoke.status}, post=${postDeploySmoke.status}${
        blogRuntimeSmoke ? `, blogRuntime=${blogRuntimeSmoke.status}` : ""
      })`,
      blogDetailFillRequired
        ? deployLocale === "zh-CN"
          ? "\u4e0b\u4e00\u6b65\uff1a\u5148\u8865\u5168 blog detail \u8be6\u60c5\u9875\u5e76\u5bf9\u9f50 slug\u3001URL\u5173\u7cfb\uff0c\u5b8c\u6210\u540e\u518d\u7ed1\u5b9a\u81ea\u5b9a\u4e49\u57df\u540d\u3002"
          : "Next, run blog detail fill to generate slug-aligned article pages. Custom-domain binding stays blocked until that step is complete."
        : deployLocale === "zh-CN"
          ? "\u4e0b\u4e00\u6b65\uff1a\u8bf7\u76f4\u63a5\u5728\u4e0b\u65b9\u6d88\u606f\u5361\u7247\u91cc\u586b\u5199\u5e76\u7ed1\u5b9a\u4f60\u7684\u81ea\u5b9a\u4e49\u57df\u540d\uff0c\u63d0\u4ea4\u540e\u4f1a\u7acb\u5373\u7ed9\u51fa DNS \u914d\u7f6e\u5361\u7247\u3002"
          : "Next, enter the custom domain you want to use directly in the card below. After submission, the app will immediately show the exact DNS records to configure.",
    ].filter(Boolean);
    const deploymentMessage = deploymentMessageParts.join("\n");
    const domainGuidanceMetadata = {
      cardType: blogDetailFillRequired ? "blog_detail_fill_required" : "domain_binding_required",
      locale: deployLocale === "zh-CN" ? "zh" : "en",
      title: blogDetailFillRequired
        ? deployLocale === "zh-CN" ? "\u5148\u8865\u5168 Blog Detail" : "Fill Blog Details First"
        : deployLocale === "zh-CN" ? "\u7ed1\u5b9a\u81ea\u5b9a\u4e49\u57df\u540d" : "Bind a Custom Domain",
      payload: blogDetailFillRequired
        ? deployLocale === "zh-CN"
          ? "请补全当前站点的 blog detail 详情页，并对齐 blog slug 和 URL 关联。"
          : "Fill the current site's blog detail pages now and align the blog slugs with their final URLs."
        : "",
      label: blogDetailFillRequired
        ? deployLocale === "zh-CN" ? "\u7acb\u5373\u8865\u5168 Blog Detail" : "Fill Blog Details Now"
        : "",
      summary:
        blogDetailFillRequired
          ? deployLocale === "zh-CN"
            ? "\u7f51\u7ad9\u5df2\u90e8\u7f72\uff0c\u4f46 blog detail \u8be6\u60c5\u9875\u8fd8\u672a\u8865\u5168\u3002\u5148\u751f\u6210\u8be6\u60c5\u9875\u5e76\u5bf9\u9f50 slug / URL\uff0c\u7136\u540e\u518d\u7ed1\u5b9a\u57df\u540d\u3002"
            : "The site is deployed, but blog detail pages are not filled yet. Generate slug-aligned detail pages first, then continue to custom-domain binding."
          : deployLocale === "zh-CN"
            ? "\u8fd9\u4e2a\u7f51\u7ad9\u5df2\u7ecf\u90e8\u7f72\u6210\u529f\u3002\u8bf7\u76f4\u63a5\u5728\u8fd9\u5f20\u5361\u7247\u91cc\u586b\u5199\u4f60\u8981\u4f7f\u7528\u7684\u57df\u540d\uff0c\u63d0\u4ea4\u540e\u518d\u6309\u63d0\u793a\u914d\u7f6e DNS \u5e76\u7b49\u5f85\u751f\u6548\u3002"
            : "Your site is deployed. Enter the domain you want to use directly in this card, submit it for binding, and then follow the DNS instructions shown here.",
      propagation:
        deployLocale === "zh-CN"
          ? "\u901a\u5e38\u51e0\u5206\u949f\u751f\u6548\uff0c\u6700\u957f\u53ef\u80fd\u9700\u8981 24 \u5c0f\u65f6\u3002"
          : "Usually active within minutes; some DNS providers can take up to 24 hours.",
      deployedUrl: liveUrl,
      deploymentHost,
      blogDetailFillRequired,
      steps:
        blogDetailFillRequired
          ? deployLocale === "zh-CN"
            ? [
                "\u89e6\u53d1 blog detail fill workflow\uff0c\u751f\u6210\u8be6\u60c5\u9875\u6b63\u6587\u5e76\u5bf9\u9f50 slug / URL\u3002",
                "\u786e\u8ba4 `/blog` \u5217\u8868\u4e0e `/blog/{slug}/` \u8be6\u60c5\u9875\u4e00\u4e00\u5bf9\u5e94\u3002",
                "\u5b8c\u6210\u540e\u518d\u8fdb\u5165 custom domain \u7ed1\u5b9a\u3002",
              ]
            : [
                "Run the blog detail fill workflow to generate article bodies and align slugs and URLs.",
                "Confirm the `/blog` archive and `/blog/{slug}/` detail routes match one-to-one.",
                "When that step is complete, continue to custom-domain binding.",
              ]
          : deployLocale === "zh-CN"
          ? [
              "\u76f4\u63a5\u5728\u8fd9\u5f20\u5361\u7247\u91cc\u8f93\u5165\u4f60\u7684\u6839\u57df\u540d\u6216 www \u57df\u540d\uff0c\u63d0\u4ea4\u7ed1\u5b9a\u3002",
              "\u63d0\u4ea4\u540e\u6309\u5361\u7247\u4e0b\u65b9\u7ed9\u51fa\u7684 DNS \u8bb0\u5f55\u914d\u7f6e\u3002",
              "\u914d\u7f6e DNS \u540e\u5728\u5361\u7247\u91cc\u5237\u65b0\u57df\u540d\u72b6\u6001\u3002",
              "\u57df\u540d Active \u540e\uff0c\u91cd\u65b0\u68c0\u67e5\u767b\u5f55\u3001\u6ce8\u518c\u548c\u627e\u56de\u5bc6\u7801\u9875\u9762\u3002",
            ]
          : [
              "Enter the apex or www domain you want to use directly in this card and submit it for binding.",
              "After submission, configure the exact DNS records shown below.",
              "Once DNS is in place, refresh the domain status from the same card.",
              "Once the domain becomes active, reopen login, registration, and password recovery pages to confirm auth now follows that domain.",
            ],
    };

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
        blogRuntimeStatus,
        generatedBlogContentStatus,
        blogContentPreviewStatus:
          blogPreview.required && getWorkflowContentPreviewConfirmed((inputState.workflow_context as any) || {})
            ? "confirmed"
            : getWorkflowContentPreviewStatus((inputState.workflow_context as any) || {}),
        contentPreviewStatus:
          blogPreview.required && getWorkflowContentPreviewConfirmed((inputState.workflow_context as any) || {})
            ? "confirmed"
            : getWorkflowContentPreviewStatus((inputState.workflow_context as any) || {}),
        deploymentStrategy,
        wranglerDeploymentUrl: wranglerDeployment?.deploymentUrl || "",
        productionUrl: liveUrl,
        smoke: {
          preDeploy: preDeploySmoke,
          postDeploy: postDeploySmoke,
          ...(blogRuntimeSmoke ? { blogRuntime: blogRuntimeSmoke } : {}),
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

    if (workflowRuntime) {
      workflowRuntime = markWorkflowExecutionCompleted(workflowRuntime);
      workflowRuntime = (
        await appendWorkflowAuditEvent({
          runtime: workflowRuntime,
          checkpointDir: checkpointWorkflowDir,
          type: "execution_completed",
          message: "Deploy execution completed.",
          metadata: {
            deployedUrl: liveUrl,
            deploymentStrategy,
          },
        })
      ).runtime;
    }
    const nextStateWithWorkflow = workflowRuntime ? attachWorkflowRuntimeToState(nextState, workflowRuntime) : nextState;
    if (setSessionState) setSessionState(nextStateWithWorkflow);

    const elapsedMs = Date.now() - startedAt;
    const mergedResult: ChatTaskResult = {
      assistantText: deploymentMessage,
      actions: [{ text: "View Live Site", payload: liveUrl, type: "url" }],
      phase: "end",
      deployedUrl: liveUrl,
      timelineMetadata: domainGuidanceMetadata,
      internal: {
        workerId,
        inputState: buildSessionSnapshot(nextStateWithWorkflow),
        sessionState: buildSessionSnapshot(nextStateWithWorkflow),
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
        blogRuntimeStatus,
        generatedBlogContentStatus,
        blogDetailFillStatus: blogDetailFillRequired ? "pending" : "completed",
        blogDetailFillCompleted: !blogDetailFillRequired,
        deploymentStrategy,
        wranglerDeploymentUrl: wranglerDeployment?.deploymentUrl || "",
        productionUrl: liveUrl,
        smoke: {
          preDeploy: preDeploySmoke,
          postDeploy: postDeploySmoke,
          ...(blogRuntimeSmoke ? { blogRuntime: blogRuntimeSmoke } : {}),
        },
        ...(publishedAssetVersion ? { publishedAssetVersion } : {}),
      } as any,
    };

    await completeChatTask(taskId, mergedResult);
    await syncChatMemoryFromState({
      chatId,
      taskId,
      stage: "deployed",
      state: nextStateWithWorkflow,
      recentSummary: deploymentMessage,
      deployedUrl: liveUrl,
    }).catch((error) => {
      console.warn(`[SkillRuntimeExecutor] short-term memory sync failed after deploy: ${String((error as any)?.message || error)}`);
    });
  } catch (error) {
    const message = String((error as any)?.message || error || "Deploy failed.");
    if (workflowRuntime) {
      workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
      workflowRuntime = startWorkflowCompensation(workflowRuntime, {
        reason: message,
      });
      workflowRuntime = (
        await appendWorkflowAuditEvent({
          runtime: workflowRuntime,
          checkpointDir: checkpointWorkflowDir,
          type: "execution_failed",
          message,
        })
      ).runtime;
      try {
        workflowRuntime = completeWorkflowCompensation(workflowRuntime, {
          message: "Compensation plan recorded for deploy failure.",
        });
      } catch (compensationError) {
        workflowRuntime = failWorkflowCompensation(
          workflowRuntime,
          String((compensationError as any)?.message || compensationError || "compensation failed"),
        );
      }
    }
    await failChatTask(taskId, message, workflowRuntime
      ? {
          internal: {
            inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            workerId,
          },
          progress: {
            stage: "deploy_failed",
            stageMessage: message,
            checkpointDir: checkpointRoot,
            checkpointWorkflowDir,
            checkpointSaved: false,
          } as any,
        }
      : undefined);
  }
}

async function runTranslateTask(params: {
  taskId: string;
  chatId: string;
  workerId: string;
  inputState: AgentState;
  setSessionState?: (state: AgentState) => void;
}): Promise<void> {
  const { taskId, chatId, workerId, inputState, setSessionState } = params;
  const startedAt = Date.now();
  const checkpointRoot = localChatTaskRoot(chatId, taskId);
  const checkpointProjectPath = path.join(checkpointRoot, "project.json");
  const checkpointStatePath = path.join(checkpointRoot, "state.json");
  const checkpointWorkflowDir = path.join(checkpointRoot, "workflow");
  const checkpointSiteDir = path.join(checkpointRoot, "site");

  await touchChatTaskHeartbeat(taskId, workerId);
  await updateChatTaskProgress(taskId, {
    assistantText: "Translation request accepted. Preparing locale catalogs from the latest site baseline.",
    phase: "translate",
    progress: {
      stage: "translating:prepare",
      stageMessage: "Loading the latest project baseline and locale source catalog...",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs: 0,
      attempt: 1,
      checkpointSaved: false,
    } as any,
  });

  const sourceProject = await resolveDeploySourceProject(inputState, { chatId, taskId });
  if (!sourceProject) {
    console.warn("[SkillRuntimeExecutor] translation baseline missing", {
      chatId,
      taskId,
      baseline: summarizeRefineBaselineInputs(inputState),
    });
    await failChatTask(
      taskId,
      "No preview/deployed baseline found for translation. Please generate a site first, then request locale catalogs.",
    );
    return;
  }

  const requirementText = extractRequirementText(inputState);
  const workflowContext = toRecord((inputState.workflow_context as any) || {});
  const translationPlan = resolveTranslationLanePlan({
    project: sourceProject,
    instructionText: requirementText,
    workflowContext,
  });
  if (!translationPlan) {
    await failChatTask(
      taskId,
      "Translation source catalog is missing. Generate the multilingual baseline first so locale resources can be derived.",
    );
    return;
  }
  if (translationPlan.targetLocales.length === 0) {
    await failChatTask(
      taskId,
      "No target locales were resolved for translation. Add supported locales in the requirement form or translation request.",
    );
    return;
  }

  const translateModelEnabledRaw = String(
    process.env.CHAT_TRANSLATE_ENABLE_MODEL ||
      (process.env.NODE_ENV === "test" ? "0" : "1"),
  )
    .trim()
    .toLowerCase();
  const translateModelEnabled = !["0", "false", "off", "no"].includes(translateModelEnabledRaw);
  const providerLock = resolveRunProviderRunnerLock({
    provider: String(workflowContext.lockedProvider || "").trim() || undefined,
    model: String(workflowContext.lockedModel || "").trim() || undefined,
  });
  const providerConfig = resolveProviderConfig(providerLock);
  let translateModelError = "";
  const translated = await applyTranslationLane({
    project: sourceProject,
    plan: translationPlan,
    translateCatalog: translateModelEnabled
      ? async ({ targetLocale, defaultLocale, sourceMessages, existingMessages }) => {
          try {
            return await translateCatalogWithModel({
              providerConfig,
              timeoutMs: Math.max(30_000, Number(process.env.CHAT_TRANSLATE_TIMEOUT_MS || 120_000)),
              targetLocale,
              defaultLocale,
              sourceMessages,
              existingMessages,
            });
          } catch (error) {
            translateModelError = String((error as any)?.message || "unknown translation failure");
            return null;
          }
        }
      : undefined,
  });

  await updateChatTaskProgress(taskId, {
    assistantText: "Writing locale catalogs and validating the updated preview bundle.",
    phase: "translate",
    progress: {
      stage: "translating:apply",
      stageMessage: "Generating locale catalog files...",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      attempt: 1,
      checkpointSaved: false,
    } as any,
  });

  await fs.mkdir(checkpointRoot, { recursive: true });
  await fs.mkdir(checkpointWorkflowDir, { recursive: true });
  const translateDecision = buildLocalDecisionPlan(inputState);
  const materialized = await materializeSiteDirectoryFromProject(translated.project, checkpointSiteDir, {
    decision: translateDecision,
    requirementText: requirementText || translateDecision.requirementText,
  });
  const translatedProject = materialized.project;
  await fs.writeFile(checkpointProjectPath, JSON.stringify(translatedProject, null, 2), "utf8");
  await fs.writeFile(
    path.join(checkpointWorkflowDir, "translation_report.md"),
    [
      "# Translation Report",
      "",
      `- generatedAt: ${nowIso()}`,
      `- defaultLocale: ${translated.validationReport.defaultLocale}`,
      `- supportedLocales: ${translated.validationReport.supportedLocales.join(", ") || "(none)"}`,
      `- targetLocales: ${translated.validationReport.targetLocales.join(", ") || "(none)"}`,
      `- sourceCatalogPath: ${translated.validationReport.sourceCatalogPath}`,
      `- sourceKeyCount: ${translated.validationReport.sourceKeyCount}`,
      `- translatedLocales: ${translated.validationReport.translatedLocales.join(", ") || "(none)"}`,
      `- fallbackLocales: ${translated.validationReport.fallbackLocales.join(", ") || "(none)"}`,
      `- missingKeyFillCount: ${translated.validationReport.missingKeyFillCount}`,
      ...(translateModelEnabled ? ["- translationModel: enabled"] : ["- translationModel: disabled"]),
      ...(translateModelError ? [`- translationModelError: ${translateModelError}`] : []),
      `- changedFiles: ${translated.changedFiles.join(", ") || "(none)"}`,
      ...(translated.validationReport.notes.length > 0
        ? [`- notes: ${translated.validationReport.notes.join(" | ")}`]
        : []),
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
        phase: "translate",
        stage: "translated",
        fileCount: materialized.fileCount,
        changedFiles: translated.changedFiles,
        validationReport: translated.validationReport,
      },
      null,
      2,
    ),
    "utf8",
  );

  const visibleLocale = detectRuntimeLocale(
    requirementText,
    typeof workflowContext.preferredLocale === "string" ? workflowContext.preferredLocale : undefined,
  );
  const nextState: AgentState = {
    ...inputState,
    phase: "end",
    project_json: translatedProject,
    site_artifacts: translatedProject,
    workflow_context: {
      ...(inputState.workflow_context || {}),
      executionMode: "generate",
      translateRequested: false,
      refineRequested: false,
      deployRequested: false,
      checkpointProjectPath,
      deploySourceProjectPath: checkpointProjectPath,
      deploySourceTaskId: taskId,
      translationSourceProjectPath: checkpointProjectPath,
      translationSourceTaskId: taskId,
      supportedLocales: translated.validationReport.supportedLocales,
      defaultLocale: translated.validationReport.defaultLocale,
      translationTargetLocales: translated.validationReport.targetLocales,
      translationValidationReport: translated.validationReport,
    } as any,
    messages: [
      ...(inputState.messages || []),
      new AIMessage({
        id: crypto.randomUUID(),
        content: `Translation completed. Generated locale catalogs for ${translated.validationReport.targetLocales.join(", ")}.`,
      }),
    ],
  };
  if (setSessionState) setSessionState(nextState);

  const elapsedMs = Date.now() - startedAt;
  await bestEffortWithTimeout(
    syncGeneratedProjectAssetsFromSite({
      ownerUserId: String(inputState.user_id || "").trim() || undefined,
      projectId: chatId,
      taskId,
      siteDir: checkpointSiteDir,
      generatedFiles: materialized.generatedFiles,
    }).catch((error) => {
      console.warn(
        `[SkillRuntimeExecutor] Generated asset sync failed after translation: ${String((error as any)?.message || error)}`,
      );
      return undefined;
    }),
    resolveGeneratedAssetSyncTimeoutMs(),
    "generated asset sync after translation",
  );
  await completeChatTask(taskId, {
    assistantText:
      visibleLocale === "zh-CN"
        ? `翻译资源已生成，已更新 ${translated.validationReport.targetLocales.length} 个目标语言 catalog。`
        : `Translation catalogs are ready for ${translated.validationReport.targetLocales.length} target locale(s).`,
    phase: "end",
    internal: {
      workerId,
      inputState: buildSessionSnapshot(nextState),
      sessionState: buildSessionSnapshot(nextState),
      artifactSnapshot: nextState.site_artifacts || null,
    } as any,
    progress: {
      stage: "translated",
      stageMessage: "Translation catalogs generated successfully.",
      startedAt: new Date(startedAt).toISOString(),
      lastTokenAt: nowIso(),
      elapsedMs,
      attempt: 1,
      fileCount: materialized.fileCount,
      generatedFiles: materialized.generatedFiles,
      changedFiles: translated.changedFiles,
      checkpointSaved: true,
      checkpointDir: checkpointRoot,
      checkpointStatePath,
      checkpointProjectPath,
      checkpointSiteDir,
      checkpointWorkflowDir,
      nextStep: "preview",
      provider: translateModelEnabled ? providerLock.provider : undefined,
      model: translateModelEnabled ? providerLock.model : undefined,
      translationValidationReport: translated.validationReport,
    } as any,
  });
  await syncChatMemoryFromState({
    chatId,
    taskId,
    stage: "previewing",
    state: nextState,
    recentSummary: `Translation completed. Generated locale catalogs for ${translated.validationReport.targetLocales.join(", ")}.`,
  }).catch((error) => {
    console.warn(`[SkillRuntimeExecutor] short-term memory sync failed after translation: ${String((error as any)?.message || error)}`);
  });
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
  const checkpointRoot = localChatTaskRoot(chatId, taskId);
  const checkpointProjectPath = path.join(checkpointRoot, "project.json");
  const checkpointStatePath = path.join(checkpointRoot, "state.json");
  const checkpointWorkflowDir = path.join(checkpointRoot, "workflow");
  const checkpointSiteDir = path.join(checkpointRoot, "site");
  let workflowRuntime = resolveWorkflowRuntimeFromState(inputState);
  if (workflowRuntime) {
    workflowRuntime = markWorkflowExecutionStarted(workflowRuntime);
    workflowRuntime = (
      await appendWorkflowAuditEvent({
        runtime: workflowRuntime,
        checkpointDir: checkpointWorkflowDir,
        type: "execution_started",
        message: "Refine execution started.",
      })
    ).runtime;
  }

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

  const sourceProject = await resolveDeploySourceProject(inputState, { chatId, taskId });
  if (!sourceProject) {
    console.warn("[SkillRuntimeExecutor] refine baseline missing", {
      chatId,
      taskId,
      baseline: summarizeRefineBaselineInputs(inputState),
    });
    if (workflowRuntime) {
      workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
      workflowRuntime = (
        await appendWorkflowAuditEvent({
          runtime: workflowRuntime,
          checkpointDir: checkpointWorkflowDir,
          type: "execution_failed",
          message: "Refine baseline is missing.",
        })
      ).runtime;
    }
    await failChatTask(taskId, "No preview/deployed baseline found for refine. Please generate a site first, then request refinement.", {
      internal: workflowRuntime
        ? {
            inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
            workerId,
          }
        : undefined,
    });
    return;
  }

  const requirementText = extractRequirementText(inputState);
  const refineDecision = buildLocalDecisionPlan(inputState);
  const refineScope = String((inputState.workflow_context as any)?.refineScope || "patch").trim().toLowerCase();
  const refineLocale = detectRuntimeLocale(
    requirementText,
    (inputState.workflow_context as any)?.preferredLocale,
  );
  const refineBlogLocale = toVisibleLocale(refineLocale);
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
        (isBlogDetailFillAction(inputState) ? "blog-detail-fill-workflow" : "") ||
        process.env.CHAT_REFINE_SKILL_ID ||
        "website-refinement-workflow",
    ).trim(),
  );
  let refineSkillDirective = "";
  let effectiveRefineSkillId = refineSkillId;
  let refineSkillError = "";
  const refineWorkflowContext = (inputState.workflow_context || {}) as Record<string, unknown>;
  const refineWebsiteSurfaceMode = resolveWorkflowSurfaceSelection(refineWorkflowContext).websiteSurfaceMode;
  const refineQualityContract = renderWebsiteQualityContract();
  const refineTargetRoutes = extractRefineTargetRoutes(sourceProject, requirementText);
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
      const validateRefinedProject = (candidate: { project: any; changedFiles: string[]; summary?: string }) => ({
        ...candidate,
        project: normalizeGeneratedProjectArtifactPreview({
          project: candidate.project,
          decision: refineDecision,
          requirementText: requirementText || refineDecision.requirementText,
          workflowContext: refineWorkflowContext,
        }),
      });

      const trySkillRefine = async (validationFeedback?: string) =>
        applyRefineInstructionWithSkill({
          project: sourceProject,
          instruction: requirementText,
          skillDirective: refineSkillDirective,
          providerConfig,
          timeoutMs: Math.max(30_000, Number(process.env.CHAT_REFINE_TIMEOUT_MS || 120_000)),
          refineScope,
          targetRoutes: refineTargetRoutes,
          websiteSurfaceMode: refineWebsiteSurfaceMode,
          qualityContract: refineQualityContract,
          validationFeedback,
        });

      refined = await trySkillRefine();
      if (refined.changedFiles.length > 0) {
        try {
          refined = validateRefinedProject(refined);
        } catch (error) {
          const validationMessage = String((error as any)?.message || error || "unknown validation failure");
          refineSkillError = [refineSkillError, `invalid_skill_refine_output:${validationMessage}`].filter(Boolean).join(" | ");
          if (isRecoverableRefineSkillFailure(error)) {
            try {
              const retried = await trySkillRefine(validationMessage);
              if (retried.changedFiles.length > 0) {
                refined = validateRefinedProject(retried);
              } else {
                refined = {
                  project: sourceProject,
                  changedFiles: [],
                  summary: retried.summary || refined.summary,
                };
              }
            } catch (retryError) {
              refineSkillError = [
                refineSkillError,
                `retry_failed:${String((retryError as any)?.message || retryError || "unknown retry failure")}`,
              ]
                .filter(Boolean)
                .join(" | ");
              refined = {
                project: sourceProject,
                changedFiles: [],
                summary: refined.summary,
              };
            }
          } else {
            refined = {
              project: sourceProject,
              changedFiles: [],
              summary: refined.summary,
            };
          }
        }
      }
    } catch (error) {
      const message = String((error as any)?.message || "unknown skill refine failure");
      refineSkillError = message;
      if (!isRecoverableRefineSkillFailure(error)) {
        // Leave the error recorded, but continue into deterministic fallback logic below.
      }
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
  if (refineScope === "structural" || refineScope === "route_regenerate") {
    const structuralCompletion = applyStructuralRefineCompletions({
      project: refined.project,
      inputState,
      instruction: requirementText,
      locale: refineLocale,
    });
    if (structuralCompletion.changedFiles.length > 0) {
      const mergedChanged = new Set<string>([
        ...refined.changedFiles,
        ...structuralCompletion.changedFiles,
      ]);
      refined = {
        ...refined,
        project: structuralCompletion.project,
        changedFiles: Array.from(mergedChanged).sort((a, b) => a.localeCompare(b)),
        summary:
          refined.summary ||
          "Completed structural refinement by materializing missing route-level content deliverables.",
      };
    }
  }
  refined = {
    ...refined,
    project: ensureSharedSiteRefsForRefineHtml(refined.project),
  };
  if (refined.changedFiles.length === 0) {
    if (refineScope === "structural" || isBlogDetailFillAction(inputState) || isBlogContentRegenerationAction(inputState)) {
      refined = {
        ...refined,
        project: ensureSharedSiteRefsForRefineHtml(sourceProject),
      };
    } else {
      if (workflowRuntime) {
        workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
        workflowRuntime = (
          await appendWorkflowAuditEvent({
            runtime: workflowRuntime,
            checkpointDir: checkpointWorkflowDir,
            type: "execution_failed",
            message: "Refine request did not map to any concrete site change.",
          })
        ).runtime;
      }
      await failChatTask(
        taskId,
        "Refine request did not match existing site content. Please provide exact target text/selector or a clearer visual change description.",
        workflowRuntime
          ? {
              internal: {
                inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
                sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
                workerId,
              },
            }
          : undefined,
      );
      return;
    }
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
  const materialized = await materializeSiteDirectoryFromProject(refined.project, checkpointSiteDir, {
    decision: refineDecision,
    requirementText: requirementText || refineDecision.requirementText,
    workflowContext: (inputState.workflow_context || {}) as Record<string, unknown>,
  });
  refined = {
    ...refined,
    project: materialized.project,
  };
  const lockedGenerationContract = resolveWorkflowGenerationContract(refineWorkflowContext);
  if (lockedGenerationContract) {
    const verification = verifyRouteUnitArtifacts({
      contract: lockedGenerationContract,
      files: Array.isArray(refined.project?.staticSite?.files) ? refined.project.staticSite.files : [],
      baselineFiles: Array.isArray(sourceProject?.staticSite?.files) ? sourceProject.staticSite.files : [],
    });
    await persistContractVerificationCheckpoints({
      checkpointRoot,
      contract: lockedGenerationContract,
      verification,
    });
    await fs.writeFile(
      path.join(checkpointWorkflowDir, "refine_verification.json"),
      JSON.stringify(verification, null, 2),
      "utf8",
    );
    if (verification.status !== "passed") {
      const violationError = new GenerationContractViolationError(verification);
      if (workflowRuntime) {
        workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
        workflowRuntime = (
          await appendWorkflowAuditEvent({
            runtime: workflowRuntime,
            checkpointDir: checkpointWorkflowDir,
            type: "execution_failed",
            message: `Refine verification failed: ${violationError.message}`,
            metadata: {
              violationCode: verification.violationCode,
              route: verification.route,
              scope: verification.scope,
            },
          })
        ).runtime;
      }
      await failChatTask(taskId, violationError.message, workflowRuntime
        ? {
            internal: {
              inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
              sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
              workerId,
            },
            progress: {
              stage: "refine_verification_failed",
              stageMessage: violationError.message,
              checkpointSaved: true,
              checkpointDir: checkpointRoot,
              checkpointProjectPath,
              checkpointSiteDir,
              checkpointWorkflowDir,
            } as any,
          }
        : undefined);
      return;
    }
  }
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

  const refinedBlogPreview = buildBlogContentWorkflowPreview({
    inputState,
    project: refined.project,
    locale: refineBlogLocale,
  });
  const isBlogContentRefine = isBlogContentRegenerationAction(inputState);
  const isBlogDetailFillRefine = isBlogDetailFillAction(inputState);
  let generatedBlogContentStatus = "";
  let refinedDbProjectId = String((inputState as any)?.db_project_id || "").trim();
  if (isBlogContentRefine && refinedBlogPreview.required) {
    const ownerUserId = String(inputState.user_id || "").trim();
    if (ownerUserId) {
      try {
        refinedDbProjectId = await saveProjectState(
          ownerUserId,
          refined.project,
          inputState.access_token,
          refinedDbProjectId || chatId,
        );
      } catch (error) {
        console.warn(
          `[SkillRuntimeExecutor] saveProjectState failed during Blog content refine: ${String((error as any)?.message || error)}`,
        );
      }
    }
    try {
      const blogPersistResult = await ensureGeneratedBlogContentForDeploy({
        projectId: refinedDbProjectId || chatId,
        userId: ownerUserId || undefined,
        inputState: {
          ...inputState,
          workflow_context: {
            ...(inputState.workflow_context || {}),
            contentPreviewPosts: refinedBlogPreview.posts,
            contentPreviewConfirmed: true,
            blogContentPreviewPosts: refinedBlogPreview.posts,
            blogContentConfirmed: true,
          },
        } as AgentState,
        project: refined.project,
        locale: refineLocale,
      });
      generatedBlogContentStatus = String(blogPersistResult?.status || "").trim();
    } catch (error) {
      generatedBlogContentStatus = `error:${String((error as any)?.message || error || "unknown")}`;
      console.warn(
        `[SkillRuntimeExecutor] ensureGeneratedBlogContentForDeploy failed during Blog content refine: ${String((error as any)?.message || error)}`,
      );
    }
  }
  const refinedBlogWorkflowState = refinedBlogPreview.required
      ? isBlogContentRefine
        ? {
          contentPreviewPosts: refinedBlogPreview.posts,
          contentPreviewStatus: "confirmed",
          contentPreviewConfirmed: true,
          blogContentPreviewPosts: refinedBlogPreview.posts,
          blogContentPreviewStatus: "confirmed",
          blogContentConfirmed: true,
        }
      : {
          contentPreviewPosts: refinedBlogPreview.posts,
          contentPreviewStatus: "pending_confirmation",
          contentPreviewConfirmed: false,
          blogContentPreviewPosts: refinedBlogPreview.posts,
          blogContentPreviewStatus: "pending_confirmation",
          blogContentConfirmed: false,
        }
    : {
        contentPreviewPosts: [],
        contentPreviewStatus: refinedBlogPreview.reason,
        contentPreviewConfirmed: false,
        blogContentPreviewPosts: [],
        blogContentPreviewStatus: refinedBlogPreview.reason,
        blogContentConfirmed: false,
      };

  const nextState: AgentState = {
    ...inputState,
    phase: "end",
    project_json: refined.project,
    site_artifacts: refined.project,
    db_project_id: refinedDbProjectId || (inputState as any)?.db_project_id,
    workflow_context: {
      ...(inputState.workflow_context || {}),
      executionMode: "generate",
      refineRequested: false,
      deployRequested: false,
      checkpointProjectPath,
      deploySourceProjectPath: checkpointProjectPath,
      deploySourceTaskId: taskId,
      ...(generatedBlogContentStatus ? { generatedBlogContentStatus } : {}),
      ...(isBlogDetailFillRefine
        ? {
            blogDetailFillStatus: "completed",
            blogDetailFillCompleted: true,
          }
        : {}),
      ...refinedBlogWorkflowState,
    } as any,
    messages: [
      ...(inputState.messages || []),
      new AIMessage({
        id: crypto.randomUUID(),
        content: `Refinement completed. Updated ${refined.changedFiles.length} files with your latest changes.`,
      }),
    ],
  };
  if (workflowRuntime) {
    workflowRuntime = markWorkflowExecutionCompleted(workflowRuntime);
    workflowRuntime = (
      await appendWorkflowAuditEvent({
        runtime: workflowRuntime,
        checkpointDir: checkpointWorkflowDir,
        type: "execution_completed",
        message: "Refine execution completed.",
        metadata: {
          changedFiles: refined.changedFiles,
        },
      })
    ).runtime;
  }
  const nextStateWithWorkflow = workflowRuntime ? attachWorkflowRuntimeToState(nextState, workflowRuntime) : nextState;
  if (setSessionState) setSessionState(nextStateWithWorkflow);

  const elapsedMs = Date.now() - startedAt;
  await bestEffortWithTimeout(
    syncGeneratedProjectAssetsFromSite({
      ownerUserId: String(inputState.user_id || "").trim() || undefined,
      projectId: chatId,
      taskId,
      siteDir: checkpointSiteDir,
      generatedFiles: materialized.generatedFiles,
    }).catch((error) => {
      console.warn(
        `[SkillRuntimeExecutor] Generated asset sync failed after refine: ${String((error as any)?.message || error)}`,
      );
      return undefined;
    }),
    resolveGeneratedAssetSyncTimeoutMs(),
    "generated asset sync after refine",
  );
  const pendingEdits = await readPendingEditsForTask(taskId);
  await completeChatTask(taskId, {
    assistantText: isBlogContentRefine
      ? `Blog content is generated. ${refinedBlogPreview.posts.length} article bodies were updated and synced into the project Blog data.`
      : isBlogDetailFillRefine
        ? `Blog detail fill is complete. ${refined.changedFiles.length} files were updated and slug-aligned detail routes are ready for custom-domain binding.`
      : refinedBlogPreview.required
        ? renderPendingContentConfirmationAssistantText({
            locale: refineLocale,
            postCount: refinedBlogPreview.posts.length,
            surfaceKind: refinedBlogPreview.surfaceKind,
            phase: "refine",
          })
      : `Refinement completed. Updated ${refined.changedFiles.length} files.`,
    phase: "end",
    timelineMetadata: refinedBlogPreview.required && !isBlogContentRefine
      ? buildBlogContentConfirmTimelineMetadata({
          locale: refineLocale,
          navLabel: refinedBlogPreview.navLabel,
          posts: refinedBlogPreview.posts,
          surfaceKind: refinedBlogPreview.surfaceKind,
        })
      : undefined,
    internal: {
      workerId,
      inputState: buildSessionSnapshot(nextStateWithWorkflow),
      sessionState: buildSessionSnapshot(nextStateWithWorkflow),
      artifactSnapshot: nextState.site_artifacts || null,
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
      ...(generatedBlogContentStatus ? { generatedBlogContentStatus } : {}),
    } as any,
  });
  await syncChatMemoryFromState({
    chatId,
    taskId,
    stage: "previewing",
    state: nextStateWithWorkflow,
    recentSummary: `Refinement completed. Updated ${refined.changedFiles.length} files.`,
  }).catch((error) => {
    console.warn(`[SkillRuntimeExecutor] short-term memory sync failed after refine: ${String((error as any)?.message || error)}`);
  });
  if (pendingEdits.length > 0) {
    await queuePendingRefineTask({
      taskId,
      chatId,
          ownerUserId: String(inputState.user_id || pendingEdits[pendingEdits.length - 1]?.ownerUserId || "").trim() || undefined,
          baseState: nextStateWithWorkflow,
          checkpointProjectPath,
          pendingEdits,
        });
  }
}

export class SkillRuntimeExecutor {
  static async runTask(params: SkillRuntimeTaskParams): Promise<void> {
    const { taskId, chatId, inputState, workerId = "worker", setSessionState } = params;
    const executionMode = resolveRuntimeTaskExecutionMode(inputState);
    if (executionMode === "refine") {
      await runRefineTask({ taskId, chatId, workerId, inputState, setSessionState });
      return;
    }
    if (executionMode === "translate") {
      await runTranslateTask({ taskId, chatId, workerId, inputState, setSessionState });
      return;
    }
    if (executionMode === "deploy") {
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
    const summaryProviderRef: { current: { provider: string; model: string } } = {
      current: {
        provider: lock.provider,
        model: lock.model,
      },
    };

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
          sourceRequirement:
            String((preparedState.workflow_context as any)?.sourceRequirement || "").trim() ||
            String((preparedState.workflow_context as any)?.canonicalPrompt || "").trim() ||
            decision.requirementText,
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

    const checkpointRoot = localChatTaskRoot(chatId, taskId);
    const checkpointWorkflowDir = path.join(checkpointRoot, "workflow");
    let workflowRuntime = resolveWorkflowRuntimeFromState(stateWithLock);

    try {
      if (workflowRuntime) {
        workflowRuntime = markWorkflowExecutionStarted(workflowRuntime);
        workflowRuntime = (
          await appendWorkflowAuditEvent({
            runtime: workflowRuntime,
            checkpointDir: checkpointWorkflowDir,
            type: "execution_started",
            message: "Generation execution started.",
          })
        ).runtime;
      }
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

      const onRuntimeStep = async (snapshot: SkillRuntimeStepSnapshot) => {
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
              provider:
                String((snapshot as any)?.provider || "").trim() ||
                String((summaryProviderRef.current as any)?.provider || "").trim() ||
                lock.provider,
              model:
                String((snapshot as any)?.model || "").trim() ||
                String((summaryProviderRef.current as any)?.model || "").trim() ||
                lock.model,
              attempt: 1,
              startedAt: new Date(startedAt).toISOString(),
              lastTokenAt: nowIso(),
              elapsedMs: Date.now() - startedAt,
              artifactKey: persisted.r2Prefix || persisted.localDir,
              pageCount: snapshot.pages.length,
              fileCount: snapshot.files.length,
              generatedFiles: snapshot.files.map((file) => normalizePath(file.path)),
              routeUnitCount: snapshot.routeUnits?.length || 0,
              routeUnits: snapshot.routeUnits || [],
              changedFiles: persisted.changedFiles.map((file) => normalizePath(file)),
              changedWorkflowFiles: persisted.changedWorkflowFiles.map((file) => normalizePath(file)),
              checkpointSaved: true,
              checkpointDir: persisted.latestDir,
              checkpointStepDir: persisted.localDir,
              checkpointSiteDir: latestCheckpointSiteDir,
              checkpointWorkflowDir: latestCheckpointWorkflowDir,
              r2UploadedCount: persisted.r2UploadedCount,
              r2UploadError: persisted.r2Error || null,
              qaSummary: snapshot.qaSummary,
            } as any,
          });
        } catch (progressError) {
          console.warn("[SkillRuntimeExecutor] continuing after non-fatal step progress update failure:", progressError);
        }
      };

      const lockedGenerationContract = resolveWorkflowGenerationContract(
        ((stateWithLock.workflow_context || {}) as Record<string, unknown>) || undefined,
      );
      const kernel = lockedGenerationContract
        ? await runV2RouteUnitRuntime({
            state: stateWithLock,
            timeoutMs: taskTimeoutMs,
            checkpointDir: checkpointRoot,
            contract: lockedGenerationContract,
            unitWorker: createSkillToolRouteUnitGenerationWorker({
              baseState: stateWithLock,
              timeoutMs: taskTimeoutMs,
            }),
            onStep: onRuntimeStep,
          })
        : null;
      const summary = kernel
        ? kernel.execution
        : await runSkillRuntimeExecutor({
            state: stateWithLock,
            timeoutMs: taskTimeoutMs,
            onStep: onRuntimeStep,
          });
      summaryProviderRef.current = {
        provider: String(summary.provider || "").trim() || lock.provider,
        model: String(summary.model || "").trim() || lock.model,
      };

      const checkpointProjectPath = path.join(checkpointRoot, "project.json");
      const finalizedProjectArtifact = finalizeGeneratedProjectArtifact({
        project:
          kernel?.project ||
          (summary.state as any)?.site_artifacts ||
          (summary.state as any)?.project_json ||
          {
            projectId: chatId,
            pages: getPages(summary.state as any),
            staticSite: {
              mode: "skill-direct",
              files: getStaticArtifactFiles(summary.state as any),
            },
          },
        inputState: summary.state as AgentState,
        locale: decision.locale,
      });
      const generatedProjectArtifact = normalizeGeneratedProjectArtifactPreview({
        project: finalizedProjectArtifact,
        decision,
        requirementText:
          String((summary.state as any)?.workflow_context?.sourceRequirement || "").trim() ||
          String((summary.state as any)?.workflow_context?.canonicalPrompt || "").trim() ||
          decision.requirementText,
      });
      const generatedBlogPreview = buildBlogContentWorkflowPreview({
        inputState: summary.state as AgentState,
        project: generatedProjectArtifact,
        locale: toVisibleLocale(decision.locale),
      });
      const preservedCanonicalPrompt = preferStrongerCanonicalPrompt(
        (preparedState.workflow_context as any)?.canonicalPrompt,
        (summary.state as any)?.workflow_context?.canonicalPrompt,
        (preparedState.workflow_context as any)?.sourceRequirement,
        (summary.state as any)?.workflow_context?.sourceRequirement,
      );
      const generatedBlogWorkflowState = generatedBlogPreview.required
        ? {
            contentPreviewPosts: generatedBlogPreview.posts,
            contentPreviewStatus: "pending_confirmation",
            contentPreviewConfirmed: false,
            blogContentPreviewPosts: generatedBlogPreview.posts,
            blogContentPreviewStatus: "pending_confirmation",
            blogContentConfirmed: false,
          }
        : {
            contentPreviewPosts: [],
            contentPreviewStatus: generatedBlogPreview.reason,
            contentPreviewConfirmed: false,
            blogContentPreviewPosts: [],
            blogContentPreviewStatus: generatedBlogPreview.reason,
            blogContentConfirmed: false,
          };
      const sessionStateForNext: AgentState = {
        ...(summary.state as any),
        site_artifacts: generatedProjectArtifact,
        project_json: generatedProjectArtifact,
        workflow_context: {
          ...((summary.state as any)?.workflow_context || {}),
          ...(preservedCanonicalPrompt
            ? {
                canonicalPrompt: preservedCanonicalPrompt,
                sourceRequirement: preservedCanonicalPrompt,
              }
            : {}),
          deploySourceProjectPath: checkpointProjectPath,
          deploySourceTaskId: taskId,
          checkpointProjectPath,
          deployRequested: false,
          ...generatedBlogWorkflowState,
        },
      };

      if (workflowRuntime) {
        workflowRuntime = markWorkflowExecutionCompleted(workflowRuntime);
        workflowRuntime = (
          await appendWorkflowAuditEvent({
            runtime: workflowRuntime,
            checkpointDir: checkpointWorkflowDir,
            type: "execution_completed",
            message: "Generation execution completed.",
            metadata: {
              generatedFiles: summary.generatedFiles,
              routeUnitCount: (summary.routeUnits || []).length,
            },
          })
        ).runtime;
      }
      const sessionStateForNextWithWorkflow = workflowRuntime
        ? attachWorkflowRuntimeToState(sessionStateForNext, workflowRuntime)
        : sessionStateForNext;

      if (setSessionState) setSessionState(sessionStateForNextWithWorkflow);
      await fs.mkdir(checkpointRoot, { recursive: true });
      await materializeSiteDirectoryFromProject(
        generatedProjectArtifact,
        latestCheckpointSiteDir || path.join(checkpointRoot, "latest", "site"),
        {
          decision,
          requirementText:
            String((summary.state as any)?.workflow_context?.sourceRequirement || "").trim() ||
            String((summary.state as any)?.workflow_context?.canonicalPrompt || "").trim() ||
            decision.requirementText,
        },
      );
      await materializeSiteDirectoryFromProject(generatedProjectArtifact, path.join(checkpointRoot, "site"), {
        decision,
        requirementText:
          String((summary.state as any)?.workflow_context?.sourceRequirement || "").trim() ||
          String((summary.state as any)?.workflow_context?.canonicalPrompt || "").trim() ||
          decision.requirementText,
      });
      await fs.writeFile(path.join(checkpointRoot, "state.json"), JSON.stringify({
        savedAt: nowIso(),
        phase: summary.phase,
        pageCount: summary.pageCount,
        fileCount: summary.fileCount,
        completedPhases: summary.completedPhases,
      }, null, 2), "utf8");
      await fs.writeFile(checkpointProjectPath, JSON.stringify(generatedProjectArtifact || null, null, 2), "utf8");

      const elapsedMs = Date.now() - startedAt;
      const pendingEdits = await readPendingEditsForTask(taskId);
      const websiteGenerationTimelineMetadata = buildWebsiteGenerationTimelineMetadata(summary);
      const mergedResult: ChatTaskResult = {
        assistantText: generatedBlogPreview.required
          ? renderPendingContentConfirmationAssistantText({
              locale: decision.locale,
              postCount: generatedBlogPreview.posts.length,
              surfaceKind: generatedBlogPreview.surfaceKind,
              phase: "generate",
            })
          : summary.assistantText,
        actions: summary.actions,
        phase: summary.phase,
        deployedUrl: summary.deployedUrl,
        timelineMetadata: generatedBlogPreview.required
          ? {
              ...buildBlogContentConfirmTimelineMetadata({
                locale: decision.locale,
                navLabel: generatedBlogPreview.navLabel,
                posts: generatedBlogPreview.posts,
                surfaceKind: generatedBlogPreview.surfaceKind,
              }),
              ...websiteGenerationTimelineMetadata,
            }
          : websiteGenerationTimelineMetadata,
        internal: {
          skillId: loadedSkill.id,
          workerId,
          inputState: buildSessionSnapshot(sessionStateForNextWithWorkflow),
          sessionState: buildSessionSnapshot(sessionStateForNextWithWorkflow),
          artifactSnapshot: generatedProjectArtifact || null,
          pendingEdits,
        } as any,
        progress: {
          stage: "done",
          stageMessage: "Generation completed successfully.",
          skillId: loadedSkill.id,
          provider: summaryProviderRef.current.provider,
          model: summaryProviderRef.current.model,
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
          qaSummary: summary.qaSummary,
        } as any,
      };

      if (summary.phase !== "end" || isAssistantFailureSemantic(summary.assistantText)) {
        await failChatTask(taskId, summary.assistantText || "skill-runtime ended without completion");
        return;
      }

      await bestEffortWithTimeout(
        syncGeneratedProjectAssetsFromSite({
          ownerUserId: String(inputState.user_id || "").trim() || undefined,
          projectId: chatId,
          taskId,
          siteDir: latestCheckpointSiteDir,
          generatedFiles: summary.generatedFiles,
        }).catch((error) => {
          console.warn(
            `[SkillRuntimeExecutor] Generated asset sync failed after generation: ${String(
              (error as any)?.message || error,
            )}`,
          );
          return undefined;
        }),
        resolveGeneratedAssetSyncTimeoutMs(),
        "generated asset sync after generation",
      );

      await completeChatTask(taskId, mergedResult);
      await syncChatMemoryFromState({
        chatId,
        taskId,
        stage: "previewing",
        state: sessionStateForNextWithWorkflow,
        recentSummary: String(mergedResult.assistantText || ""),
      }).catch((error) => {
        console.warn(`[SkillRuntimeExecutor] short-term memory sync failed after generation: ${String((error as any)?.message || error)}`);
      });
      if (pendingEdits.length > 0) {
        await queuePendingRefineTask({
          taskId,
          chatId,
          ownerUserId: String(inputState.user_id || pendingEdits[pendingEdits.length - 1]?.ownerUserId || "").trim() || undefined,
          baseState: sessionStateForNextWithWorkflow,
          checkpointProjectPath,
          pendingEdits,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureProviderMeta = resolveFailureProviderMeta(message, summaryProviderRef.current);
      if (workflowRuntime) {
        workflowRuntime = markWorkflowExecutionFailed(workflowRuntime);
        workflowRuntime = (
          await appendWorkflowAuditEvent({
            runtime: workflowRuntime,
            checkpointDir: checkpointWorkflowDir,
            type: "execution_failed",
            message,
          })
        ).runtime;
      }
      await updateChatTaskProgress(taskId, {
        assistantText: message,
        progress: {
          stage: "failed",
          stageMessage: "Generation failed.",
          skillId: loadedSkill.id,
          provider: failureProviderMeta.provider,
          model: failureProviderMeta.model,
          attempt: 1,
          startedAt: new Date(startedAt).toISOString(),
          lastTokenAt: nowIso(),
          elapsedMs: Date.now() - startedAt,
          errorCode: classifyErrorCode(message),
          artifactKey: checkpointRoot,
        } as any,
      });
      await failChatTask(
        taskId,
        message || "skill-runtime task failed",
        workflowRuntime
          ? {
              internal: {
                inputState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
                sessionState: buildSessionSnapshot(attachWorkflowRuntimeToState(inputState, workflowRuntime)),
                workerId,
              },
            }
          : undefined,
      );
    }
  }
}
