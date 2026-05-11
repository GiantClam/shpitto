import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  appendPendingEditToChatTask,
  appendChatTimelineMessage,
  createChatTask,
  getActiveChatTask,
  getLatestDeployableChatTaskForChat,
  getLatestChatTaskForChat,
  getLatestPreviewableChatTaskForChat,
  listChatTimelineMessages,
  type ChatTaskResult,
} from "../../../lib/agent/chat-task-store";
import { type BuilderAction } from "../../../lib/agent/chat-ui-payload";
import { type AgentState } from "../../../lib/agent/graph";
import {
  aggregateRequirementFromHistory,
  buildRequirementPatchPlan,
  buildClarificationQuestion,
  buildRequirementSpec,
  buildRequirementSlots,
  decideChatIntent,
  deriveConversationStage,
  hydrateRequirementSlotsFromSpec,
  isDeployIntent,
  parseRequirementFormFromText,
  validateRequiredRequirementSlots,
} from "../../../lib/agent/chat-orchestrator";
import {
  readChatLongTermPreferences,
  readChatShortTermMemory,
  writeChatLongTermPreferences,
  writeChatShortTermMemory,
  type ChatLongTermPreferenceSnapshot,
  type ChatRevisionPointer,
  type ChatShortTermMemorySnapshot,
} from "../../../lib/agent/chat-memory";
import { buildPromptDraftWithResearch } from "../../../lib/agent/prompt-draft-research";
import {
  appendReferencedAssetsBlock,
  collectReferencedAssetsFromTexts,
  parseReferencedAssetsFromText,
} from "../../../lib/agent/referenced-assets";
import { buildBlogContentWorkflowPreview } from "../../../lib/skill-runtime/executor";
import { loadProjectSkill } from "../../../lib/skill-runtime/project-skill-loader";
import { invalidateLaunchCenterRecentProjectsCache } from "../../../lib/launch-center/cache";
import {
  BillingAccessError,
  assertCanCreateProject,
  assertCanMutatePublishedSite,
} from "../../../lib/billing/enforcement";
import {
  hasBillableProject,
  releaseCreatedProjectUsageReservation,
  reserveCreatedProjectUsage,
} from "../../../lib/billing/store";
import { saveProjectState } from "../../../lib/agent/db";

export const runtime = "nodejs";

type ChatRequestBody = {
  id?: string;
  messages?: UIMessage[];
  user_id?: string;
  access_token?: string;
  async?: boolean;
  skill_id?: string;
  design_overrides?: Record<string, unknown>;
  confirm_design?: boolean;
};

const CONFIRM_GENERATE_PREFIX = "__SHP_CONFIRM_GENERATE__";
const CONFIRM_BLOG_CONTENT_DEPLOY_PREFIX = "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__";
const CONTINUE_STALE_RUNNING_TASK_MS = Math.max(
  30_000,
  Number(process.env.CHAT_CONTINUE_STALE_RUNNING_TASK_MS || 120_000),
);
const CHAT_ROUTE_STORE_TIMEOUT_MS = Math.max(1_000, Number(process.env.CHAT_ROUTE_STORE_TIMEOUT_MS || 8_000));
type ChatDisplayLocale = "zh" | "en";

const CHAT_COPY: Record<ChatDisplayLocale, Record<string, string>> = {
  en: {
    checkTaskStatus: "Check Task Status",
    deployLocked: "Deployment is in progress. Input is locked until deployment finishes.",
    pendingEditQueued:
      "A task is still running. This edit has been queued and will be applied against the latest preview after the current task completes.",
    activeTaskRunning: "A generation task is already running for this chat. Please wait for completion or check task status.",
    requirementFormTitle: "Required Information Before Generation",
    requirementFormInfo: "Complete the required information before generating the Prompt Draft.",
    promptDraftWeb: "Prompt Draft generated with LLM + Web Search. You can add details or confirm generation.",
    promptDraftLlm: "Prompt Draft generated with LLM. You can add details or confirm generation.",
    promptDraftTemplate: "Requirement draft updated. You can add details or confirm generation.",
    promptDraftTitle: "Website Generation Prompt Draft",
    confirmPromptText:
      "Confirm the Prompt Draft before generation. After confirmation, a background generation task will be created from this prompt.",
    confirmPromptLabel: "Confirm Prompt And Generate",
    promptDraftReady:
      "Prompt Draft generated. Expand it to review page structure, content modules, and design requirements, then click Confirm Prompt And Generate.",
    promptDraftWaiting: "Prompt Draft generated. Waiting for confirmation before generation starts.",
    clarificationInfo: "Requirement clarification is in progress. Add more details or confirm generation to start a task.",
    acceptedGenerate: "Generation task accepted. Queued for background worker execution.",
    acceptedRefine: "Refine task accepted. Will adjust the latest version in background.",
    acceptedDeploy: "Deploy task accepted. Queued for background deployment.",
    queuedStageSuffix: "task queued. Waiting for background worker...",
    syncDisabled: "Synchronous generation path is disabled. Use async task mode.",
    storageUnavailable: "Chat storage is temporarily unavailable. Please retry in a few seconds.",
    generateBeforeDeploy: "This chat does not have a completed generated site yet. Generate the site first, then confirm deployment.",
    blogConfirmBeforeDeploy: "Review and confirm the generated Blog articles before deployment.",
    blogConfirmLabel: "Confirm Blog Articles and Deploy to shpitto server",
    requestFailed: "Failed to process chat request.",
  },
  zh: {
    checkTaskStatus: "\u67e5\u770b\u4efb\u52a1\u72b6\u6001",
    deployLocked: "\u90e8\u7f72\u6b63\u5728\u8fdb\u884c\uff0c\u5f53\u524d\u9636\u6bb5\u5df2\u9501\u5b9a\u8f93\u5165\u3002\u8bf7\u7b49\u5f85\u90e8\u7f72\u5b8c\u6210\u540e\u518d\u7ee7\u7eed\u4fee\u6539\u6216\u53d1\u5e03\u3002",
    pendingEditQueued:
      "\u5f53\u524d\u4efb\u52a1\u4ecd\u5728\u8fd0\u884c\u3002\u672c\u6761\u4fee\u6539\u5df2\u52a0\u5165\u5f85\u5904\u7406\u961f\u5217\uff0c\u5f53\u524d\u4efb\u52a1\u5b8c\u6210\u540e\u4f1a\u81ea\u52a8\u57fa\u4e8e\u6700\u65b0\u9884\u89c8\u7ee7\u7eed\u4fee\u6b63\u3002",
    activeTaskRunning: "\u5f53\u524d\u4f1a\u8bdd\u5df2\u6709\u751f\u6210\u4efb\u52a1\u5728\u8fd0\u884c\u3002\u8bf7\u7b49\u5f85\u5b8c\u6210\uff0c\u6216\u67e5\u770b\u4efb\u52a1\u72b6\u6001\u3002",
    requirementFormTitle: "\u751f\u6210\u524d\u5fc5\u586b\u4fe1\u606f",
    requirementFormInfo: "\u8bf7\u5148\u5b8c\u6210\u751f\u6210\u524d\u5fc5\u586b\u4fe1\u606f\uff0c\u7136\u540e\u518d\u751f\u6210 Prompt Draft\u3002",
    promptDraftWeb: "\u5df2\u57fa\u4e8e LLM + Web Search \u751f\u6210 Prompt Draft\uff0c\u4f60\u53ef\u4ee5\u7ee7\u7eed\u8865\u5145\uff0c\u6216\u786e\u8ba4\u540e\u5f00\u59cb\u751f\u6210\u3002",
    promptDraftLlm: "\u5df2\u57fa\u4e8e LLM \u751f\u6210 Prompt Draft\uff0c\u4f60\u53ef\u4ee5\u7ee7\u7eed\u8865\u5145\uff0c\u6216\u786e\u8ba4\u540e\u5f00\u59cb\u751f\u6210\u3002",
    promptDraftTemplate: "\u5df2\u66f4\u65b0\u9700\u6c42\u8349\u7a3f\uff0c\u4f60\u53ef\u4ee5\u7ee7\u7eed\u8865\u5145\uff0c\u6216\u786e\u8ba4\u540e\u5f00\u59cb\u751f\u6210\u3002",
    promptDraftTitle: "\u7f51\u7ad9\u751f\u6210 Prompt Draft",
    confirmPromptText:
      "\u751f\u6210\u524d\u8bf7\u5148\u786e\u8ba4 Prompt Draft\u3002\u786e\u8ba4\u540e\uff0c\u7cfb\u7edf\u4f1a\u57fa\u4e8e\u8be5\u8349\u7a3f\u521b\u5efa\u540e\u53f0\u751f\u6210\u4efb\u52a1\u3002",
    confirmPromptLabel: "\u786e\u8ba4 Prompt Draft \u5e76\u5f00\u59cb\u751f\u6210",
    promptDraftReady:
      "Prompt Draft \u5df2\u751f\u6210\u3002\u5c55\u5f00\u540e\u68c0\u67e5\u9875\u9762\u7ed3\u6784\u3001\u5185\u5bb9\u6a21\u5757\u548c\u8bbe\u8ba1\u8981\u6c42\uff0c\u7136\u540e\u70b9\u51fb\u786e\u8ba4\u751f\u6210\u3002",
    promptDraftWaiting: "Prompt Draft \u5df2\u751f\u6210\uff0c\u7b49\u5f85\u786e\u8ba4\u540e\u518d\u5f00\u59cb\u751f\u6210\u3002",
    clarificationInfo: "\u5df2\u8fdb\u5165\u9700\u6c42\u68b3\u7406\u9636\u6bb5\u3002\u4f60\u53ef\u4ee5\u7ee7\u7eed\u8865\u5145\u9700\u6c42\uff0c\u6216\u786e\u8ba4\u540e\u5f00\u59cb\u751f\u6210\u3002",
    acceptedGenerate: "\u751f\u6210\u4efb\u52a1\u5df2\u63a5\u6536\uff0c\u6b63\u5728\u6392\u961f\u7b49\u5f85\u540e\u53f0\u6267\u884c\u3002",
    acceptedRefine: "\u4fee\u6539\u4efb\u52a1\u5df2\u63a5\u6536\uff0c\u5c06\u5728\u540e\u53f0\u57fa\u4e8e\u6700\u65b0\u7248\u672c\u8fdb\u884c\u8c03\u6574\u3002",
    acceptedDeploy: "\u90e8\u7f72\u4efb\u52a1\u5df2\u63a5\u6536\uff0c\u6b63\u5728\u6392\u961f\u7b49\u5f85\u53d1\u5e03\u3002",
    queuedStageSuffix: "\u4efb\u52a1\u5df2\u6392\u961f\uff0c\u7b49\u5f85\u540e\u53f0\u6267\u884c\u5668\u3002",
    syncDisabled: "\u540c\u6b65\u751f\u6210\u8def\u5f84\u5df2\u7981\u7528\uff0c\u8bf7\u4f7f\u7528\u5f02\u6b65\u4efb\u52a1\u6a21\u5f0f\u3002",
    storageUnavailable: "\u804a\u5929\u5b58\u50a8\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    generateBeforeDeploy: "\u5f53\u524d\u4f1a\u8bdd\u8fd8\u6ca1\u6709\u5df2\u5b8c\u6210\u7684\u7f51\u7ad9\u751f\u6210\u7ed3\u679c\uff0c\u8bf7\u5148\u5b8c\u6210\u751f\u6210\uff0c\u518d\u786e\u8ba4\u90e8\u7f72\u3002",
    blogConfirmBeforeDeploy: "\u8bf7\u5148\u67e5\u770b\u5e76\u786e\u8ba4\u751f\u6210\u7684 Blog \u6587\u7ae0\uff0c\u7136\u540e\u518d\u90e8\u7f72\u4e0a\u7ebf\u3002",
    blogConfirmLabel: "\u786e\u8ba4 Blog \u6587\u7ae0\u5e76\u90e8\u7f72\u5230 shpitto \u670d\u52a1\u5668",
    requestFailed: "\u5904\u7406\u804a\u5929\u8bf7\u6c42\u5931\u8d25\u3002",
  },
};

function detectChatDisplayLocale(text: string): ChatDisplayLocale {
  return /[\u4e00-\u9fff]/.test(String(text || "")) ? "zh" : "en";
}

function chatCopy(locale: ChatDisplayLocale, key: keyof (typeof CHAT_COPY)["en"]): string {
  return CHAT_COPY[locale]?.[key] || CHAT_COPY.en[key] || key;
}

function requirementProgressText(locale: ChatDisplayLocale, filled: number, total: number, percent: number): string {
  if (locale === "zh") return `\u9700\u6c42\u5b8c\u6210\u5ea6\uff1a${filled}/${total} (${percent}%)`;
  return `Requirement progress: ${filled}/${total} (${percent}%)`;
}

function localizedClarificationQuestion(params: {
  locale: ChatDisplayLocale;
  requiresRequirementForm?: boolean;
  question: string;
}): string {
  if (params.locale !== "zh") return params.question;
  if (params.requiresRequirementForm) {
    return "\u8bf7\u5148\u5b8c\u6210\u4e0b\u65b9\u7684\u751f\u6210\u524d\u5fc5\u586b\u4fe1\u606f\u3002\u5b8c\u6210\u540e\u6211\u4f1a\u751f\u6210\u53ef\u786e\u8ba4\u7684 Prompt Draft\u3002";
  }
  return "\u9700\u6c42\u4ecd\u9700\u8981\u8865\u5145\u3002\u4f60\u53ef\u4ee5\u7ee7\u7eed\u63d0\u4f9b\u7ec6\u8282\uff0c\u6216\u57fa\u4e8e\u5f53\u524d\u4fe1\u606f\u786e\u8ba4\u751f\u6210\u3002";
}

function localizedQueuedStageMessage(locale: ChatDisplayLocale, mode: "generate" | "refine" | "deploy"): string {
  if (locale === "zh") {
    const modeLabel =
      mode === "generate"
        ? "\u751f\u6210"
        : mode === "refine"
          ? "\u4fee\u6539"
          : "\u90e8\u7f72";
    return `${modeLabel}${chatCopy(locale, "queuedStageSuffix")}`;
  }
  return `${mode} ${chatCopy(locale, "queuedStageSuffix")}`;
}

function hasText(value: unknown): value is string {
  return Boolean(String(value || "").trim());
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function buildWorkflowContextFromLongTermPreferences(
  preferences?: ChatLongTermPreferenceSnapshot,
): Record<string, unknown> {
  if (!preferences) return {};
  return {
    ...(preferences.preferredLocale ? { preferredLocale: preferences.preferredLocale } : {}),
    ...(preferences.primaryVisualDirection ? { primaryVisualDirection: preferences.primaryVisualDirection } : {}),
    ...(Array.isArray(preferences.secondaryVisualTags) && preferences.secondaryVisualTags.length > 0
      ? { secondaryVisualTags: preferences.secondaryVisualTags }
      : {}),
    ...(preferences.deploymentProvider || preferences.deploymentDomain
      ? {
          deploymentPreference: {
            provider: preferences.deploymentProvider,
            domain: preferences.deploymentDomain,
          },
        }
      : {}),
  };
}

function mergeRequirementSpecWithMemory(params: {
  requirementSpec: ReturnType<typeof buildRequirementSpec>;
  shortTermMemory?: ChatShortTermMemorySnapshot;
  longTermPreferences?: ChatLongTermPreferenceSnapshot;
}): ReturnType<typeof buildRequirementSpec> {
  const { requirementSpec } = params;
  const shortTermSpec = params.shortTermMemory?.requirementState?.currentValues;
  const longTerm = params.longTermPreferences;
  const explicitFallbackDirection =
    (shortTermSpec?.visualDecisionSource === "user_explicit" ? shortTermSpec.primaryVisualDirection : undefined) ||
    longTerm?.primaryVisualDirection;
  const shouldOverrideRecommendedDirection =
    Boolean(explicitFallbackDirection) && requirementSpec.visualDecisionSource !== "user_explicit";
  const mergedTargetAudience =
    requirementSpec.targetAudience?.length
      ? requirementSpec.targetAudience
      : shortTermSpec?.targetAudience?.length
        ? shortTermSpec.targetAudience
        : longTerm?.targetAudience;
  const mergedPrimaryVisualDirection =
    shouldOverrideRecommendedDirection
      ? explicitFallbackDirection
      : requirementSpec.primaryVisualDirection || shortTermSpec?.primaryVisualDirection || longTerm?.primaryVisualDirection;
  const mergedSecondaryVisualTags =
    requirementSpec.secondaryVisualTags?.length
      ? requirementSpec.secondaryVisualTags
      : shortTermSpec?.secondaryVisualTags?.length
        ? shortTermSpec.secondaryVisualTags
        : longTerm?.secondaryVisualTags;
  const mergedVisualStyle =
    requirementSpec.visualStyle?.length
      ? requirementSpec.visualStyle
      : shortTermSpec?.visualStyle?.length
        ? shortTermSpec.visualStyle
        : mergedSecondaryVisualTags;
  const deploymentProvider =
    requirementSpec.deployment?.provider || shortTermSpec?.deployment?.provider || longTerm?.deploymentProvider;
  const deploymentDomain =
    requirementSpec.deployment?.domain || shortTermSpec?.deployment?.domain || longTerm?.deploymentDomain;

  return {
    ...requirementSpec,
    ...(hasText(requirementSpec.brand) ? {} : hasText(shortTermSpec?.brand) ? { brand: shortTermSpec?.brand } : {}),
    ...(hasText(requirementSpec.businessContext)
      ? {}
      : hasText(shortTermSpec?.businessContext)
        ? { businessContext: shortTermSpec?.businessContext }
        : {}),
    ...(mergedTargetAudience?.length ? { targetAudience: mergedTargetAudience } : {}),
    ...(hasText(requirementSpec.locale)
      ? {}
      : hasText(shortTermSpec?.locale)
        ? { locale: shortTermSpec?.locale }
        : hasText(longTerm?.preferredLocale)
          ? { locale: longTerm?.preferredLocale }
          : {}),
    ...(hasText(requirementSpec.tone)
      ? {}
      : hasText(shortTermSpec?.tone)
        ? { tone: shortTermSpec?.tone }
        : hasText(longTerm?.tone)
          ? { tone: longTerm?.tone }
          : {}),
    ...(mergedPrimaryVisualDirection ? { primaryVisualDirection: mergedPrimaryVisualDirection } : {}),
    ...(mergedSecondaryVisualTags?.length ? { secondaryVisualTags: mergedSecondaryVisualTags } : {}),
    ...(mergedVisualStyle?.length ? { visualStyle: mergedVisualStyle } : {}),
    ...(requirementSpec.visualDecisionSource === "user_explicit"
      ? { visualDecisionSource: requirementSpec.visualDecisionSource }
      : explicitFallbackDirection
        ? { visualDecisionSource: "user_explicit" as const }
        : shortTermSpec?.visualDecisionSource
          ? { visualDecisionSource: shortTermSpec.visualDecisionSource }
          : mergedPrimaryVisualDirection
            ? { visualDecisionSource: "fallback" as const }
            : {}),
    ...((deploymentProvider || deploymentDomain || requirementSpec.deployment?.requested || shortTermSpec?.deployment?.requested)
      ? {
          deployment: {
            provider: deploymentProvider,
            domain: deploymentDomain,
            requested:
              Boolean(requirementSpec.deployment?.requested) || Boolean(shortTermSpec?.deployment?.requested) || Boolean(deploymentProvider || deploymentDomain),
          },
        }
      : {}),
  };
}

function buildExplicitLongTermPreferences(params: {
  ownerUserId?: string;
  formValues?: ReturnType<typeof parseRequirementFormFromText>["formValues"];
  requirementSpec: ReturnType<typeof buildRequirementSpec>;
}): ChatLongTermPreferenceSnapshot | undefined {
  const ownerUserId = String(params.ownerUserId || "").trim();
  if (!ownerUserId) return undefined;
  const formValues = params.formValues;
  const next: ChatLongTermPreferenceSnapshot = {
    ownerUserId,
    updatedAt: new Date().toISOString(),
  };
  if (formValues?.language && params.requirementSpec.locale) {
    next.preferredLocale = params.requirementSpec.locale;
  }
  if (formValues?.primaryVisualDirection && params.requirementSpec.primaryVisualDirection) {
    next.primaryVisualDirection = params.requirementSpec.primaryVisualDirection;
  }
  if (Array.isArray(formValues?.secondaryVisualTags) && formValues.secondaryVisualTags.length > 0) {
    next.secondaryVisualTags = params.requirementSpec.secondaryVisualTags || [];
  }
  if (Array.isArray(formValues?.targetAudience) && formValues.targetAudience.length > 0) {
    next.targetAudience = params.requirementSpec.targetAudience || formValues.targetAudience;
  }
  if (params.requirementSpec.deployment?.requested) {
    if (params.requirementSpec.deployment.provider) next.deploymentProvider = params.requirementSpec.deployment.provider;
    if (params.requirementSpec.deployment.domain) next.deploymentDomain = params.requirementSpec.deployment.domain;
  }
  if (!next.preferredLocale && !next.primaryVisualDirection && !next.secondaryVisualTags?.length && !next.targetAudience?.length && !next.deploymentProvider && !next.deploymentDomain) {
    return undefined;
  }
  return next;
}

function buildRevisionPointer(params: {
  executionMode: "generate" | "refine" | "deploy";
  requirementRevision: number;
  existingWorkflow: Record<string, unknown>;
  shortTermMemory?: ChatShortTermMemorySnapshot;
}): ChatRevisionPointer {
  const existingRevisionId =
    String(params.existingWorkflow.siteRevisionId || params.shortTermMemory?.revisionPointer?.revisionId || "").trim() || undefined;
  const revisionId =
    params.executionMode === "deploy" && existingRevisionId ? existingRevisionId : crypto.randomUUID();
  return {
    revisionId,
    baseRevisionId: params.executionMode === "generate" ? existingRevisionId : existingRevisionId || params.shortTermMemory?.revisionPointer?.baseRevisionId,
    mode: params.executionMode,
    requirementRevision: params.requirementRevision,
    updatedAt: new Date().toISOString(),
  };
}

async function persistRouteMemorySnapshot(params: {
  chatId: string;
  ownerUserId?: string;
  stage: ReturnType<typeof deriveConversationStage>;
  intent?: ReturnType<typeof decideChatIntent>["intent"];
  intentConfidence?: number;
  requirementSpec: ReturnType<typeof buildRequirementSpec>;
  slots: ReturnType<typeof buildRequirementSlots>;
  missingCriticalSlots: string[];
  assumptions: string[];
  activeScope?: string;
  revisionPointer: ChatRevisionPointer;
  workflowContext?: Record<string, unknown>;
  recentSummary?: string;
  correctionSummary?: string[];
  explicitLongTermPreferences?: ChatLongTermPreferenceSnapshot;
}): Promise<void> {
  await writeChatShortTermMemory({
    threadId: params.chatId,
    stage: params.stage,
    intent: params.intent,
    intentConfidence: params.intentConfidence,
    recentSummary: params.recentSummary,
    activeScope: params.activeScope,
    revisionPointer: params.revisionPointer,
    workflowContext: params.workflowContext,
    updatedAt: new Date().toISOString(),
    requirementState: {
      slots: params.slots,
      conflicts: params.correctionSummary || [],
      missingCriticalSlots: params.missingCriticalSlots,
      readyScore: Math.max(0, Math.min(100, Math.round((params.slots.filter((slot) => slot.filled).length / Math.max(1, params.slots.length)) * 100))),
      activeScope: params.activeScope,
      assumptions: params.assumptions,
      currentValues: params.requirementSpec,
    },
  });
  if (params.explicitLongTermPreferences && params.ownerUserId) {
    await writeChatLongTermPreferences(params.explicitLongTermPreferences);
  }
}

function createInitialState(): AgentState {
  return {
    messages: [],
    phase: "conversation",
    current_page_index: 0,
    attempt_count: 0,
  };
}

function reviveMessage(raw: any): BaseMessage | undefined {
  if (!raw) return undefined;
  const role = String(raw.role || raw.type || "").toLowerCase();
  const content = String(raw.content || "").trim();
  if (!content) return undefined;
  if (role === "user" || role === "human") return new HumanMessage({ content });
  if (role === "assistant" || role === "ai") return new AIMessage({ content });
  return undefined;
}

function reviveSessionState(raw: any): AgentState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as AgentState;
  const restoredMessages = Array.isArray((source as any).messages)
    ? ((source as any).messages as any[]).map((message) => reviveMessage(message)).filter(Boolean)
    : [];
  return {
    messages: restoredMessages as BaseMessage[],
    phase: String(source.phase || "conversation"),
    current_page_index: Number(source.current_page_index || 0),
    attempt_count: Number(source.attempt_count || 0),
    sitemap: Array.isArray(source.sitemap) ? source.sitemap : undefined,
    workflow_context: source.workflow_context,
    design_hit: (source as any).design_hit,
    user_id: source.user_id,
    access_token: source.access_token,
    db_project_id: (source as any).db_project_id,
    deployed_url: (source as any).deployed_url,
    project_json: (source as any).project_json,
    site_artifacts: (source as any).site_artifacts,
  };
}

function localChatTasksBaseDirs(): string[] {
  return Array.from(
    new Set([
      path.resolve(/* turbopackIgnore: true */ process.cwd(), ".tmp", "chat-tasks"),
      path.resolve(/* turbopackIgnore: true */ process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
    ]),
  );
}

async function restoreProjectArtifactFromCheckpointPath(checkpointProjectPath: string): Promise<any | undefined> {
  const rawPath = String(checkpointProjectPath || "").trim();
  if (!rawPath) return undefined;
  const normalized = rawPath.replace(/\\/g, "/");
  const suffixMatch = normalized.match(/(?:^|\/)\.tmp\/chat-tasks\/(.+)$/i);
  const candidates = [path.resolve(rawPath)];
  if (suffixMatch?.[1]) {
    const suffix = suffixMatch[1].replace(/^\/+/, "");
    candidates.push(...localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, suffix)));
  }
  for (const absPath of Array.from(new Set(candidates))) {
    if (!absPath || !absPath.toLowerCase().endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(absPath, "utf8");
      const parsed = JSON.parse(raw);
      if (isStaticSiteProjectLike(parsed)) return parsed;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function recoverProjectArtifactFromTaskInternal(internal: Record<string, unknown>): any | undefined {
  const candidates = [
    (internal as any).artifactSnapshot,
    (internal as any).sessionState?.site_artifacts,
    (internal as any).sessionState?.project_json,
    (internal as any).inputState?.site_artifacts,
    (internal as any).inputState?.project_json,
  ];
  return candidates.find((candidate) => isStaticSiteProjectLike(candidate));
}

async function getSession(chatId: string): Promise<AgentState> {
  const latestTask = await getLatestChatTaskForChat(chatId);
  const baselineTask = taskHasRouteBaseline(latestTask)
    ? latestTask
    : await getLatestCompletedGenerationBaselineTask(chatId, latestTask);
  const sessionTask = baselineTask || latestTask;
  const internal = (sessionTask?.result?.internal || {}) as Record<string, unknown>;
  const fromSessionState = reviveSessionState(internal.sessionState);
  const checkpointProjectPath = String(
    sessionTask?.result?.progress?.checkpointProjectPath ||
      sessionTask?.result?.progress?.checkpointSiteDir ||
      sessionTask?.result?.progress?.checkpointDir ||
      "",
  ).trim();
  const deployedUrl = String(latestTask?.result?.deployedUrl || sessionTask?.result?.deployedUrl || "").trim();
  const recoveredArtifactFromCheckpoint = await restoreProjectArtifactFromCheckpointPath(checkpointProjectPath);
  const recoveredArtifactFromTask = recoverProjectArtifactFromTaskInternal(internal);
  const recoveredArtifact = recoveredArtifactFromTask || recoveredArtifactFromCheckpoint;
  if (fromSessionState) {
    return {
      ...fromSessionState,
      deployed_url: deployedUrl || fromSessionState.deployed_url,
      project_json:
        (isStaticSiteProjectLike((fromSessionState as any).project_json) ? (fromSessionState as any).project_json : undefined) ||
        recoveredArtifact,
      site_artifacts:
        (isStaticSiteProjectLike((fromSessionState as any).site_artifacts) ? (fromSessionState as any).site_artifacts : undefined) ||
        recoveredArtifact,
      workflow_context: {
        ...(fromSessionState.workflow_context || {}),
        deploySourceProjectPath:
          checkpointProjectPath || (fromSessionState.workflow_context as any)?.deploySourceProjectPath,
        deploySourceTaskId: sessionTask?.id || (fromSessionState.workflow_context as any)?.deploySourceTaskId,
        checkpointProjectPath:
          checkpointProjectPath || (fromSessionState.workflow_context as any)?.checkpointProjectPath,
      } as any,
    };
  }
  const fromInputState = reviveSessionState(internal.inputState);
  if (fromInputState) {
    return {
      ...fromInputState,
      deployed_url: deployedUrl || fromInputState.deployed_url,
      project_json:
        (isStaticSiteProjectLike((fromInputState as any).project_json) ? (fromInputState as any).project_json : undefined) ||
        recoveredArtifact,
      site_artifacts:
        (isStaticSiteProjectLike((fromInputState as any).site_artifacts) ? (fromInputState as any).site_artifacts : undefined) ||
        recoveredArtifact,
      workflow_context: {
        ...(fromInputState.workflow_context || {}),
        deploySourceProjectPath:
          checkpointProjectPath || (fromInputState.workflow_context as any)?.deploySourceProjectPath,
        deploySourceTaskId: sessionTask?.id || (fromInputState.workflow_context as any)?.deploySourceTaskId,
        checkpointProjectPath:
          checkpointProjectPath || (fromInputState.workflow_context as any)?.checkpointProjectPath,
      } as any,
    };
  }
  if (baselineTask) {
    const recoveredState = createInitialState();
    return {
      ...recoveredState,
      phase: "end",
      deployed_url: deployedUrl || undefined,
      project_json: recoveredArtifact,
      site_artifacts: recoveredArtifact,
      workflow_context: {
        ...(recoveredState.workflow_context || {}),
        deploySourceProjectPath: checkpointProjectPath,
        deploySourceTaskId: baselineTask.id,
        checkpointProjectPath,
      } as any,
    };
  }
  return createInitialState();
}

function extractLastUserText(messages: UIMessage[] = []): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;

    const text = (message.parts || [])
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
      .trim();

    if (text) return text;
  }

  return undefined;
}

function errorStreamResponse(message: string, status = 500) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "error", errorText: message });
      writer.write({ type: "finish", finishReason: "error" });
    },
  });

  return createUIMessageStreamResponse({ status, stream });
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const text = String(error.message || "").trim();
    if (text) return text;
  }
  if (error && typeof error === "object") {
    const anyErr = error as Record<string, unknown>;
    const code = String(anyErr.code || "").trim();
    const message = String(anyErr.message || "").trim();
    const details = String(anyErr.details || "").trim();
    const hint = String(anyErr.hint || "").trim();
    if (message) {
      const parts = [code ? `[${code}] ${message}` : message];
      if (details && details !== "null" && details !== "undefined") {
        parts.push(`details: ${details}`);
      }
      if (hint && hint !== "null" && hint !== "undefined") {
        parts.push(`hint: ${hint}`);
      }
      return parts.join(" | ");
    }
    try {
      return JSON.stringify(error);
    } catch {
      // ignore JSON stringify failures and fall back below
    }
  }
  return String(error);
}

function isTransientStorageConnectivityError(error: unknown): boolean {
  const anyError = (error || {}) as {
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
  };
  const code = String(anyError.code || anyError.cause?.code || "").toUpperCase();
  if (
    [
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(code)
  ) {
    return true;
  }

  const normalized = formatUnknownError(error).toLowerCase();
  return [
    "fetch failed",
    "connect timeout",
    "timed out",
    "timeout",
    "network",
    "socket",
    "connection reset",
    "service unavailable",
    "temporarily unavailable",
  ].some((token) => normalized.includes(token));
}

function createTaskStreamResponse(params: {
  assistantText: string;
  taskId: string;
  chatId: string;
  status: "queued" | "running";
  actions?: BuilderAction[];
  statusCode?: number;
  displayLocale?: ChatDisplayLocale;
}) {
  const { assistantText, taskId, chatId, status, actions, statusCode = 200, displayLocale = "en" } = params;
  const statusPath = `/api/chat/tasks/${taskId}`;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      const textId = crypto.randomUUID();
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: assistantText });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "data-task",
        data: {
          taskId,
          chatId,
          status,
          statusPath,
          locale: displayLocale,
        },
      });
      const nextActions = [
        ...(actions || []),
        { text: chatCopy(displayLocale, "checkTaskStatus"), payload: statusPath, type: "url" as const },
      ];
      writer.write({ type: "data-actions", data: nextActions });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ status: statusCode, stream });
}

function shouldUseAsyncTaskMode(body: ChatRequestBody): boolean {
  if (body.async === false) return false;
  if (body.async === true) return true;
  const envDefault = String(process.env.CHAT_ASYNC_DEFAULT || "0").trim() === "1";
  // Pure async by default: Vercel request path should not execute long-running generation.
  return envDefault || true;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function shouldAutoUseUploadedMaterials(params: { text: string; referencedAssets: string[] }): boolean {
  if (!params.referencedAssets.length) return false;
  const haystack = `${params.text}\n${params.referencedAssets.join("\n")}`;
  if (
    /[\u9644\u4ef6\u4e0a\u4f20\u6587\u6863\u6587\u4ef6\u8d44\u6599]/.test(haystack) &&
    /(\u9644\u4ef6|\u4e0a\u4f20|\u6587\u6863|\u6587\u4ef6|\u8d44\u6599|\u6839\u636e)/.test(haystack)
  ) {
    return true;
  }
  return /attachment|attached|uploaded|upload|document|pdf|file|materials?|according to|based on|附件|附加|上传|文档|文件|资料|根据附件|根据文档/i.test(
    haystack,
  );
}

function buildUploadedMaterialsRequirementHint(params: { text: string }): string {
  const locale = /[\u4e00-\u9fff]/.test(params.text) ? "zh-CN" : "en";
  const form = {
    siteType: "company",
    contentSources: ["uploaded_files"],
    targetAudience: ["infer_from_uploaded_materials"],
    secondaryVisualTags: ["professional"],
    pageStructure: { mode: "multi", planning: "auto" },
    functionalRequirements: ["contact_form"],
    primaryGoal: ["brand_trust", "lead_generation"],
    language: locale,
    brandLogo: { mode: "text_mark" },
    customNotes:
      "The user uploaded detailed project materials. Treat the uploaded documents as the primary source of truth, infer audience, pages, content modules, conversion goals, and copy details from those materials, and only mark unresolved facts as content gaps.",
  };
  return [
    "Auto-ingested uploaded materials requirement defaults:",
    "",
    "[Requirement Form]",
    "```json",
    JSON.stringify(form, null, 2),
    "```",
  ].join("\n");
}

function resolveAsyncRoundBudget(): number {
  return Math.max(1, Number(process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE || 1));
}

function extractConfirmedPrompt(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text.startsWith(CONFIRM_GENERATE_PREFIX)) return null;
  const payload = text.slice(CONFIRM_GENERATE_PREFIX.length).trim();
  return payload || null;
}

function isBlogContentDeployConfirmation(raw: string): boolean {
  return String(raw || "").trim().startsWith(CONFIRM_BLOG_CONTENT_DEPLOY_PREFIX);
}

function isInternalTimelineActionPayload(raw: string): boolean {
  const text = String(raw || "").trim();
  if (!text) return false;
  return text.startsWith(CONFIRM_GENERATE_PREFIX) || text.startsWith(CONFIRM_BLOG_CONTENT_DEPLOY_PREFIX);
}

function rewriteDeployDisplayText(text: string): string {
  const raw = String(text || "");
  if (!raw) return "";
  return raw
    .replace(/deploy to cloudflare/gi, "deploy to shpitto server")
    .replace(/deploy cloudflare/gi, "deploy shpitto server")
    .replace(/cloudflare pages/gi, "shpitto server")
    .replace(/部署到\s*cloudflare/gi, "部署到 shpitto 服务器")
    .replace(/发布到\s*cloudflare/gi, "部署到 shpitto 服务器")
    .replace(/上线到\s*cloudflare/gi, "部署到 shpitto 服务器");
}

function visibleTimelineUserText(raw: string, normalized?: string): string {
  if (isInternalTimelineActionPayload(raw)) return "";
  return rewriteDeployDisplayText(String(normalized || raw || "").trim());
}

function normalizeBlogPreviewPostsForCard(posts: unknown[]) {
  return posts
    .filter((post) => post && typeof post === "object")
    .map((post) => {
      const item = post as Record<string, unknown>;
      return {
        slug: String(item.slug || "").trim(),
        title: String(item.title || "").trim(),
        excerpt: String(item.excerpt || "").trim(),
        category: String(item.category || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
      };
    })
    .filter((post) => post.slug || post.title);
}

function buildBlogContentConfirmationMetadata(params: {
  locale: ChatDisplayLocale;
  navLabel?: string;
  posts: unknown[];
}) {
  return {
    cardType: "confirm_blog_content_deploy",
    locale: params.locale,
    title:
      params.locale === "zh"
        ? "Blog 文章已生成，确认后再部署上线"
        : "Blog articles are ready. Confirm before deployment.",
    label: chatCopy(params.locale, "blogConfirmLabel"),
    payload: CONFIRM_BLOG_CONTENT_DEPLOY_PREFIX,
    navLabel: String(params.navLabel || "").trim(),
    posts: normalizeBlogPreviewPostsForCard(params.posts),
  } as Record<string, unknown>;
}

function looksLikeCanonicalWebsitePrompt(text: string): boolean {
  const normalized = String(text || "").trim();
  return (
    /^#\s*Canonical Website Generation Prompt\b/i.test(normalized) ||
    /Prompt Control Manifest \(Machine Readable\)/i.test(normalized) ||
    /"promptKind"\s*:\s*"canonical_website_prompt"/i.test(normalized)
  );
}

function hasPlaceholderCanonicalBrand(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const withoutKnowledgeProfile = normalized.replace(
    /\n## Website Knowledge Profile\b[\s\S]*?(?=\n## |\n# |$)/gi,
    "\n",
  );
  return (
    /(?:^|\n)[-*\d.\s]*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    ) ||
    /\[brand\]\s*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    )
  );
}

function containsRequirementFormPromptLeak(text: string): boolean {
  const normalized = String(text || "");
  if (!normalized) return false;
  return (
    /\[Requirement Form\]/i.test(normalized) ||
    /(?:^|\n)\s*[-*]?\s*(?:Logo\s+strategy|Logo\s*策略)\s*[:：]/i.test(normalized)
  );
}

function hasStrongCanonicalPromptStructure(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!looksLikeCanonicalWebsitePrompt(normalized)) return false;
  const completion = normalized.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
  const completed = completion ? Number(completion[1]) : NaN;
  const total = completion ? Number(completion[2]) : NaN;
  if (Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed / total >= 0.8) {
    return true;
  }
  return (
    normalized.length > 4000 &&
    /Prompt Control Manifest \(Machine Readable\)/i.test(normalized) &&
    /Evidence Brief Contract|Page-Level Intent Contract|##\s*7\.\s*Evidence Brief/i.test(normalized)
  );
}

function shouldRejectRecoveredCanonicalPrompt(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  if (!looksLikeCanonicalWebsitePrompt(normalized)) return false;
  if (containsRequirementFormPromptLeak(normalized)) return true;
  return hasPlaceholderCanonicalBrand(normalized) && !hasStrongCanonicalPromptStructure(normalized);
}

function hasTrustedConfirmedPromptDraftMetadata(params: {
  confirmedPrompt?: string | null;
  confirmedPromptDraftText?: string;
  confirmedPromptDraftMetadata?: Record<string, unknown>;
}): boolean {
  const confirmedPrompt = String(params.confirmedPrompt || "").trim();
  const metadata = params.confirmedPromptDraftMetadata;
  if (!confirmedPrompt || !metadata) return false;
  const storedPrompt = String((metadata as any).canonicalPrompt || "").trim();
  const normalizedDraftText = String(params.confirmedPromptDraftText || "").trim();
  if (!storedPrompt) return false;
  if (!looksLikeCanonicalWebsitePrompt(storedPrompt)) return false;
  return confirmedPrompt === storedPrompt || normalizedDraftText === storedPrompt;
}

function shouldRebuildConfirmedPromptForCanonicalExecution(params: {
  explicitConfirmedPrompt?: boolean;
  confirmedPrompt?: string | null;
  confirmedPromptDraftText?: string;
  confirmedPromptDraftMetadata?: Record<string, unknown>;
}): boolean {
  if (!params.explicitConfirmedPrompt) return false;
  const directConfirmedPrompt = String(params.confirmedPrompt || "").trim();
  if (
    directConfirmedPrompt &&
    looksLikeCanonicalWebsitePrompt(directConfirmedPrompt) &&
    !shouldRejectRecoveredCanonicalPrompt(directConfirmedPrompt)
  ) {
    return false;
  }
  if (hasTrustedConfirmedPromptDraftMetadata(params)) return false;
  const normalized = String(params.confirmedPromptDraftText || params.confirmedPrompt || "").trim();
  if (!normalized) return false;
  if (shouldRejectRecoveredCanonicalPrompt(normalized)) return true;
  return !looksLikeCanonicalWebsitePrompt(normalized);
}

function hasUploadedSourceMaterial(text: string): boolean {
  const normalized = String(text || "");
  return (
    /##\s*7\.25\s+Source Material Appendix\b/i.test(normalized) ||
    /##\s*7\.\s+Evidence Brief\b/i.test(normalized) ||
    /"routeSource"\s*:\s*"uploaded_source_page_plan"/i.test(normalized) ||
    /##\s+Website Knowledge Profile\b/i.test(normalized)
  );
}

function shouldRebuildConfirmedPromptForUploadedSources(params: {
  explicitConfirmedPrompt?: boolean;
  confirmedPrompt?: string | null;
  confirmedPromptDraftText: string;
  referencedAssets: string[];
}): boolean {
  if (!params.explicitConfirmedPrompt) return false;
  if (!params.confirmedPrompt || params.referencedAssets.length === 0) return false;
  const prompt = String(params.confirmedPromptDraftText || params.confirmedPrompt || "").trim();
  if (!looksLikeCanonicalWebsitePrompt(prompt)) return true;
  return !hasUploadedSourceMaterial(prompt);
}

function isContinueGenerationIntent(raw: string): boolean {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return false;
  if (/^(?:continue|resume)(?:\s+(?:generation|generating|build|task))?$/.test(text)) return true;
  return /(?:\u7ee7\u7eed\s*\u751f\u6210|\u7eed\s*\u751f\u6210|\u6062\u590d\s*\u751f\u6210)/.test(text);
}

function isStaleRunningTaskForContinuation(task: { status?: string; updatedAt?: number }): boolean {
  if (String(task.status || "") !== "running") return false;
  const updatedAt = Number(task.updatedAt || 0);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  return Date.now() - updatedAt > CONTINUE_STALE_RUNNING_TASK_MS;
}

function findLatestConfirmedGenerationPrompt(
  timelineMessages: Awaited<ReturnType<typeof listChatTimelineMessages>>,
): string {
  for (let index = timelineMessages.length - 1; index >= 0; index -= 1) {
    const item = timelineMessages[index];
    if (item.role === "user") {
      const userPrompt = String(item.text || "").trim();
      if (userPrompt.startsWith("# Canonical Website Generation Prompt") && !shouldRejectRecoveredCanonicalPrompt(userPrompt)) {
        return userPrompt;
      }
      const extracted = extractConfirmedPrompt(userPrompt);
      if (extracted && !shouldRejectRecoveredCanonicalPrompt(extracted)) return extracted;
    }

    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : undefined;
    if (!metadata || String(metadata.cardType || "") !== "prompt_draft") continue;
    const storedPrompt = String((metadata as any).canonicalPrompt || "").trim();
    if (storedPrompt && !shouldRejectRecoveredCanonicalPrompt(storedPrompt)) return storedPrompt;
  }
  return "";
}

function findTaskGenerationPrompt(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined): string {
  const contexts = [
    (task?.result?.internal as any)?.inputState?.workflow_context,
    (task?.result?.internal as any)?.sessionState?.workflow_context,
  ];
  for (const context of contexts) {
    const sourceRequirement = String(context?.sourceRequirement || "").trim();
    if (sourceRequirement && !shouldRejectRecoveredCanonicalPrompt(sourceRequirement)) return sourceRequirement;
    const canonicalPrompt = String(context?.canonicalPrompt || "").trim();
    if (canonicalPrompt && !shouldRejectRecoveredCanonicalPrompt(canonicalPrompt)) return canonicalPrompt;
  }
  return "";
}

function isWebsiteSkill(skillId: string): boolean {
  return String(skillId || "").trim().toLowerCase() === "website-generation-workflow";
}

function createInfoStreamResponse(message: string, status = 200) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      const textId = crypto.randomUUID();
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: message });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ status, stream });
}

async function appendTimelineMessageBestEffort(input: {
  chatId: string;
  role: "user" | "assistant" | "system";
  text: string;
  taskId?: string;
  ownerUserId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await appendChatTimelineMessage(input);
  } catch {
    // Best-effort timeline persistence; do not block request.
  }
}

async function invalidateLaunchCenterRecentProjectsCacheBestEffort() {
  try {
    await invalidateLaunchCenterRecentProjectsCache();
  } catch {
    // Best-effort cache invalidation; do not block chat responses.
  }
}

function localTaskRootsForChat(chatId: string): string[] {
  const safeChatId = String(chatId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, safeChatId));
}

async function findLatestLocalContinuationPrompt(chatId: string): Promise<string> {
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const root of localTaskRootsForChat(chatId)) {
    try {
      const taskDirs = await fs.readdir(root, { withFileTypes: true });
      for (const taskDir of taskDirs) {
        if (!taskDir.isDirectory()) continue;
        const findingsPath = path.join(root, taskDir.name, "latest", "workflow", "findings.md");
        try {
          const stat = await fs.stat(findingsPath);
          if (stat.isFile()) candidates.push({ filePath: findingsPath, mtimeMs: stat.mtimeMs });
        } catch {
          // Ignore incomplete local checkpoints.
        }
      }
    } catch {
      // Ignore missing local checkpoint roots.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    try {
      const findings = await fs.readFile(candidate.filePath, "utf8");
      const start = findings.indexOf("# Canonical Website Generation Prompt");
      if (start < 0) continue;
      const derivedPlan = findings.indexOf("\n## Derived Route Plan", start);
      return findings.slice(start, derivedPlan > start ? derivedPlan : undefined).trim();
    } catch {
      // Try the next checkpoint.
    }
  }
  return "";
}

function findConfirmedPromptDraftMetadata(
  timelineMessages: Awaited<ReturnType<typeof listChatTimelineMessages>>,
  confirmedPrompt?: string | null,
): Record<string, unknown> | undefined {
  const normalizedPrompt = String(confirmedPrompt || "").trim();
  for (let index = timelineMessages.length - 1; index >= 0; index -= 1) {
    const item = timelineMessages[index];
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : undefined;
    if (!metadata || String(metadata.cardType || "") !== "prompt_draft") continue;
    const storedPrompt = String((metadata as any).canonicalPrompt || "").trim();
    if (normalizedPrompt && storedPrompt && storedPrompt !== normalizedPrompt) continue;
    return metadata;
  }
  return undefined;
}

function isStaticSiteProjectLike(value: unknown): boolean {
  const project = value as any;
  return Boolean(project && typeof project === "object" && Array.isArray(project?.staticSite?.files));
}

function taskHasRouteBaseline(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>>): boolean {
  const progress = task?.result?.progress || {};
  const internal = task?.result?.internal || {};
  return Boolean(
    String(progress.checkpointProjectPath || progress.checkpointSiteDir || progress.checkpointDir || "").trim() ||
      (Array.isArray(progress.generatedFiles) && progress.generatedFiles.length > 0) ||
      (internal.sessionState as any)?.site_artifacts ||
      (internal.sessionState as any)?.project_json ||
      (internal.inputState as any)?.site_artifacts ||
      (internal.inputState as any)?.project_json,
  );
}

function taskExecutionMode(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>>): string {
  const workflow = ((task?.result?.internal?.inputState as any)?.workflow_context ||
    (task?.result?.internal?.sessionState as any)?.workflow_context ||
    {}) as Record<string, unknown>;
  const explicit = String(workflow.executionMode || workflow.intent || task?.result?.progress?.nextStep || "").trim().toLowerCase();
  if (explicit === "deploy" || explicit === "generate" || explicit === "refine") return explicit;
  const phase = String(task?.result?.phase || "").trim().toLowerCase();
  if (phase === "deploy" || phase === "generate" || phase === "refine") return phase;
  const stage = String(task?.result?.progress?.stage || "").trim().toLowerCase();
  if (stage.includes("deploy")) return "deploy";
  if (stage.includes("refine")) return "refine";
  return "";
}

function taskIsCompletedGenerationBaseline(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>>): boolean {
  if (!task || task.status !== "succeeded" || !taskHasRouteBaseline(task)) return false;
  return taskExecutionMode(task) !== "deploy";
}

async function getLatestCompletedGenerationBaselineTask(
  chatId: string,
  latestTask?: Awaited<ReturnType<typeof getLatestChatTaskForChat>>,
) {
  if (taskIsCompletedGenerationBaseline(latestTask)) return latestTask;
  const previewableTask = await getLatestPreviewableChatTaskForChat(chatId, { statuses: ["succeeded"] }).catch(
    () => undefined,
  );
  return taskIsCompletedGenerationBaseline(previewableTask) ? previewableTask : undefined;
}

function deployableProjectArtifact(
  previousState: AgentState,
  deployableTask: Awaited<ReturnType<typeof getLatestDeployableChatTaskForChat>> | undefined,
) {
  const candidates = [
    (previousState as any).site_artifacts,
    (previousState as any).project_json,
    (deployableTask?.result?.internal as any)?.artifactSnapshot,
    (deployableTask?.result?.internal as any)?.sessionState?.site_artifacts,
    (deployableTask?.result?.internal as any)?.sessionState?.project_json,
    (deployableTask?.result?.internal as any)?.inputState?.site_artifacts,
    (deployableTask?.result?.internal as any)?.inputState?.project_json,
  ];
  return candidates.find((candidate) => isStaticSiteProjectLike(candidate));
}

function taskWorkflowContext(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined): Record<string, unknown> {
  return (
    (((task?.result?.internal as any)?.sessionState?.workflow_context ||
      (task?.result?.internal as any)?.inputState?.workflow_context ||
      {}) as Record<string, unknown>)
  );
}

async function recoverDeployableProjectArtifact(
  params: {
    reqUrl: string;
    deployIntentRequested: boolean;
    hasCompletedGenerationBaseline: boolean;
    previousState: AgentState;
    deployableTask: Awaited<ReturnType<typeof getLatestDeployableChatTaskForChat>> | undefined;
    latestTask: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined;
  },
) {
  const previousDeployArtifact =
    (params.previousState as any).site_artifacts || (params.previousState as any).project_json;
  if (
    !params.deployIntentRequested ||
    !params.hasCompletedGenerationBaseline ||
    isStaticSiteProjectLike(previousDeployArtifact)
  ) {
    return undefined;
  }
  return buildDeployStaticSiteFromPreview(
    params.deployableTask || params.latestTask,
    new URL(params.reqUrl).origin,
  ).catch(() => undefined);
}

function normalizeGeneratedFilePath(value: string): string {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/{2,}/g, "/");
}

function routePathFromHtmlFile(filePath: string): string {
  const normalized = normalizeGeneratedFilePath(filePath);
  if (!normalized || normalized === "/index.html") return "/";
  return normalized.replace(/\/index\.html$/i, "") || "/";
}

function inferStaticFileType(filePath: string, contentType: string): string {
  const header = String(contentType || "").split(";")[0]?.trim();
  if (header) return header;
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".js")) return "application/javascript";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewritePreviewHtmlForDeployment(html: string, taskId: string): string {
  const escapedTaskId = escapeRegExp(encodeURIComponent(taskId));
  if (!escapedTaskId) return html;
  const previewAssetPattern = new RegExp(
    `\\b(href|src)=["'](?:https?:\\/\\/[^"']+)?\\/api\\/chat\\/tasks\\/${escapedTaskId}\\/preview\\/?([^"'?#]*)([?#][^"']*)?["']`,
    "gi",
  );
  return String(html || "").replace(previewAssetPattern, (_match, attr: string, target: string, suffix = "") => {
    const normalizedTarget = String(target || "index.html").replace(/^\/+/, "");
    return `${attr}="/${normalizedTarget}${suffix || ""}"`;
  });
}

async function fetchPreviewFileForDeploy(origin: string, taskId: string, filePath: string) {
  const normalized = normalizeGeneratedFilePath(filePath);
  if (!origin || !taskId || !normalized) return undefined;
  const previewPath = normalized.replace(/^\/+/, "");
  const url = `${origin.replace(/\/+$/, "")}/api/chat/tasks/${encodeURIComponent(taskId)}/preview/${previewPath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return undefined;
  const contentType = res.headers.get("content-type") || "";
  const inferredType = inferStaticFileType(normalized, contentType);
  const rawContent = await res.text();
  const content = inferredType.startsWith("text/html")
    ? rewritePreviewHtmlForDeployment(rawContent, taskId)
    : rawContent;
  if (!content.trim()) return undefined;
  return {
    path: normalized,
    type: inferredType,
    content,
  };
}

async function buildDeployStaticSiteFromPreview(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>>, origin: string) {
  const taskId = String(task?.id || "").trim();
  const generatedFilesRaw = Array.isArray(task?.result?.progress?.generatedFiles)
    ? task?.result?.progress?.generatedFiles
    : [];
  const generatedFiles = Array.from(
    new Set(
      generatedFilesRaw
        .map((file) => normalizeGeneratedFilePath(String(file || "")))
        .filter((file) => /\.(?:html|css|js|svg|json|txt)$/i.test(file)),
    ),
  );
  if (!taskId || generatedFiles.length === 0) return undefined;

  const files = (
    await Promise.all(generatedFiles.map((file) => fetchPreviewFileForDeploy(origin, taskId, file).catch(() => undefined)))
  ).filter((file): file is { path: string; type: string; content: string } => Boolean(file));
  if (!files.some((file) => file.path === "/index.html")) return undefined;

  return {
    projectId: String(task?.chatId || taskId),
    branding: { name: String(task?.chatId || "Shpitto Site") },
    pages: files
      .filter((file) => file.path.toLowerCase().endsWith(".html"))
      .map((file) => ({ path: routePathFromHtmlFile(file.path), html: file.content })),
    staticSite: {
      mode: "skill-direct",
      files,
      generation: {
        source: "preview-recovery",
        sourceTaskId: taskId,
        recoveredAt: new Date().toISOString(),
      },
    },
  };
}

export async function POST(req: Request) {
  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return errorStreamResponse("Invalid request body.", 400);
  }

  const chatId = body.id || (body.user_id ? `user:${body.user_id}` : crypto.randomUUID());
  const userText = extractLastUserText(body.messages || []);

  if (!userText) {
    return errorStreamResponse("No user message found in request.", 400);
  }
  const displayLocale = detectChatDisplayLocale(userText);
  const continueGenerationRequested = isContinueGenerationIntent(userText);
  const timelineUserText = visibleTimelineUserText(userText);
  let usageReservedForThisRequest:
    | {
        ownerUserId: string;
        sourceProjectId: string;
      }
    | undefined;

  try {
  const previousState = await withTimeout(getSession(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Chat session lookup").catch(() =>
    createInitialState(),
  );
  let latestTask: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined;
  let activeTaskLookupError: unknown;
  const activeTask = await withTimeout(getActiveChatTask(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Active task lookup").catch(
    (error) => {
      activeTaskLookupError = error;
      return undefined;
    },
  );
  if (!activeTask && activeTaskLookupError && isTransientStorageConnectivityError(activeTaskLookupError)) {
    try {
      latestTask = await withTimeout(getLatestChatTaskForChat(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Latest task lookup");
    } catch (error) {
      if (isTransientStorageConnectivityError(error)) {
        console.warn(`[ChatRoute] latest task fallback degraded for ${chatId}: ${formatUnknownError(error)}`);
      }
      latestTask = undefined;
    }
  }
  const activeOrLatestTask =
    activeTask ||
    (latestTask && (latestTask.status === "queued" || latestTask.status === "running") ? latestTask : undefined);
  if (activeOrLatestTask && (activeOrLatestTask.status === "queued" || activeOrLatestTask.status === "running")) {
    const activeWorkflow = (activeOrLatestTask.result?.internal?.inputState as any)?.workflow_context || {};
    const activeExecutionMode = String(activeWorkflow.executionMode || "").trim().toLowerCase();
    const activeProgressStage = String(activeOrLatestTask.result?.progress?.stage || "").trim().toLowerCase();
    const activeNextStep = String(activeOrLatestTask.result?.progress?.nextStep || "").trim().toLowerCase();
    const deployLocked =
      activeExecutionMode === "deploy" ||
      activeProgressStage.includes("deploy") ||
      activeNextStep === "deploy";
    const shouldBypassActiveTaskForContinuation =
      continueGenerationRequested &&
      !deployLocked &&
      activeOrLatestTask.status === "running" &&
      isStaleRunningTaskForContinuation(activeOrLatestTask);
    if (shouldBypassActiveTaskForContinuation) {
      if (timelineUserText) {
        await appendTimelineMessageBestEffort({
          chatId,
          role: "user",
          text: timelineUserText,
          ownerUserId: body.user_id || previousState.user_id,
          taskId: activeOrLatestTask.id,
          metadata: { cardType: "continue_generation", staleTaskId: activeOrLatestTask.id, locale: displayLocale },
        });
      }
    } else {
    if (deployLocked) {
      return createTaskStreamResponse({
        assistantText: chatCopy(displayLocale, "deployLocked"),
        taskId: activeOrLatestTask.id,
        chatId,
        status: activeOrLatestTask.status,
        statusCode: 423,
        displayLocale,
      });
    }
    const shouldQueuePendingEdit =
      activeExecutionMode !== "deploy" && !isDeployIntent(userText) && !continueGenerationRequested;
    if (shouldQueuePendingEdit) {
      await appendPendingEditToChatTask(activeOrLatestTask.id, {
        text: userText,
        ownerUserId: body.user_id || previousState.user_id,
        patchPlan: buildRequirementPatchPlan(userText),
      });
    }
    if (timelineUserText) {
      await appendTimelineMessageBestEffort({
        chatId,
        role: "user",
        text: timelineUserText,
        ownerUserId: body.user_id || previousState.user_id,
        taskId: activeOrLatestTask.id,
        metadata: shouldQueuePendingEdit
          ? { cardType: "pending_edit", queuedForTaskId: activeOrLatestTask.id, locale: displayLocale }
          : undefined,
      });
    }
    const assistantText = shouldQueuePendingEdit
      ? chatCopy(displayLocale, "pendingEditQueued")
      : chatCopy(displayLocale, "activeTaskRunning");
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: assistantText,
      ownerUserId: body.user_id || previousState.user_id,
      taskId: activeOrLatestTask.id,
      metadata: shouldQueuePendingEdit
        ? { cardType: "pending_edit_queued", queuedForTaskId: activeOrLatestTask.id, locale: displayLocale }
        : { locale: displayLocale },
    });
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return createTaskStreamResponse({
      assistantText,
      taskId: activeOrLatestTask.id,
      chatId,
      status: activeOrLatestTask.status,
      statusCode: 202,
      displayLocale,
    });
    }
  }

  const useAsyncTaskMode = shouldUseAsyncTaskMode(body);
  const blogContentDeployConfirmed = isBlogContentDeployConfirmation(userText);
  const explicitConfirmedPrompt = extractConfirmedPrompt(userText);
  const confirmedPromptExplicitlyProvided = Boolean(explicitConfirmedPrompt);
  let confirmedPrompt = explicitConfirmedPrompt;
  let normalizedUserText = explicitConfirmedPrompt || (blogContentDeployConfirmed ? "deploy to cloudflare" : userText);
  const requestedSkillId = String(
    body.skill_id || (previousState.workflow_context as any)?.skillId || "website-generation-workflow",
  )
    .trim()
    .toLowerCase();

  try {
    await loadProjectSkill(requestedSkillId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorStreamResponse(`Invalid skill_id: ${message}`, 400);
  }

  if (!latestTask) {
    try {
      latestTask = await withTimeout(getLatestChatTaskForChat(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Latest task lookup");
    } catch (error) {
      if (isTransientStorageConnectivityError(error)) {
        console.warn(
          `[ChatRoute] latest task lookup degraded for ${chatId}: ${formatUnknownError(error)}`,
        );
      }
      latestTask = undefined;
    }
  }
  const deployableTask = await withTimeout(
    getLatestCompletedGenerationBaselineTask(chatId, latestTask),
    CHAT_ROUTE_STORE_TIMEOUT_MS,
    "Deployable task lookup",
  ).catch(() => undefined);
  const hasCompletedGenerationBaseline = Boolean(deployableTask);
  const checkpointProjectPath = String(
    deployableTask?.result?.progress?.checkpointProjectPath ||
      "",
  ).trim();
  const timelineMessages = await withTimeout(
    listChatTimelineMessages(chatId, 120),
    CHAT_ROUTE_STORE_TIMEOUT_MS,
    "Chat timeline lookup",
  ).catch(() => []);
  if (!confirmedPrompt && continueGenerationRequested) {
    confirmedPrompt =
      findLatestConfirmedGenerationPrompt(timelineMessages) ||
      findTaskGenerationPrompt(latestTask) ||
      String((previousState.workflow_context as any)?.sourceRequirement || (previousState.workflow_context as any)?.canonicalPrompt || "").trim() ||
      (await findLatestLocalContinuationPrompt(chatId)) ||
      null;
    normalizedUserText = confirmedPrompt || userText;
  }
  const parsedCurrentInput = parseReferencedAssetsFromText(normalizedUserText);
  const parsedRequirementForm = parseRequirementFormFromText(parsedCurrentInput.cleanText || normalizedUserText);
  const currentUserRequirementText = parsedCurrentInput.cleanText || normalizedUserText;
  const confirmedPromptDraftMetadata = confirmedPrompt
    ? findConfirmedPromptDraftMetadata(timelineMessages, confirmedPrompt)
    : undefined;
  const confirmedPromptControlManifest =
    (confirmedPromptDraftMetadata?.promptControlManifest &&
    typeof confirmedPromptDraftMetadata.promptControlManifest === "object"
      ? confirmedPromptDraftMetadata.promptControlManifest
      : undefined) || (previousState.workflow_context as any)?.promptControlManifest;
  const confirmedPromptDraftText =
    confirmedPrompt && typeof (confirmedPromptDraftMetadata as any)?.canonicalPrompt === "string"
      ? String((confirmedPromptDraftMetadata as any)?.canonicalPrompt || "").trim()
      : String(confirmedPrompt || "").trim();
  const historyUserMessagesRaw = timelineMessages
    .filter((item) => item.role === "user")
    .map((item) => String(item.text || ""));
  const historyUserMessages = historyUserMessagesRaw
    .map((text) => parseReferencedAssetsFromText(text).cleanText || text)
    .filter(Boolean);
  const ownerUserId = body.user_id || previousState.user_id;
  const shortTermMemory = await readChatShortTermMemory(chatId);
  const longTermPreferences = ownerUserId ? await readChatLongTermPreferences(ownerUserId) : undefined;
  const referencedAssets = collectReferencedAssetsFromTexts([...historyUserMessagesRaw, normalizedUserText]);
  const aggregated = aggregateRequirementFromHistory({
    historyUserMessages,
    currentUserText: currentUserRequirementText,
  });
  const uploadedMaterialsRequirementHint = shouldAutoUseUploadedMaterials({
    text: aggregated.requirementText,
    referencedAssets,
  })
    ? buildUploadedMaterialsRequirementHint({ text: aggregated.requirementText })
    : "";
  const effectiveRequirementText = uploadedMaterialsRequirementHint
    ? `${aggregated.requirementText}\n\n${uploadedMaterialsRequirementHint}`.trim()
    : aggregated.requirementText;
  const effectiveRequirementSourceMessages = uploadedMaterialsRequirementHint
    ? [...aggregated.sourceMessages, uploadedMaterialsRequirementHint]
    : aggregated.sourceMessages;
  const memoryWorkflowContext = {
    ...buildWorkflowContextFromLongTermPreferences(longTermPreferences),
    ...((shortTermMemory?.workflowContext || {}) as Record<string, unknown>),
    ...((previousState.workflow_context || {}) as Record<string, unknown>),
  } as Record<string, unknown>;
  delete (memoryWorkflowContext as any).lockedProvider;
  delete (memoryWorkflowContext as any).lockedModel;
  const requirementSpec = mergeRequirementSpecWithMemory({
    requirementSpec: buildRequirementSpec(effectiveRequirementText, effectiveRequirementSourceMessages),
    shortTermMemory,
    longTermPreferences,
  });
  const slots = hydrateRequirementSlotsFromSpec(buildRequirementSlots(effectiveRequirementText), requirementSpec);
  const requiredSlotValidation = validateRequiredRequirementSlots(slots);
  const requirementPatchPlan = buildRequirementPatchPlan(currentUserRequirementText, aggregated.revision);
  const stage = deriveConversationStage({
    latestTaskStatus: latestTask?.status,
    latestProgressStage: String(latestTask?.result?.progress?.stage || ""),
    latestDeployedUrl: String(latestTask?.result?.deployedUrl || ""),
    checkpointProjectPath,
    workflowContext: memoryWorkflowContext,
  });
  const decision = decideChatIntent({
    userText: currentUserRequirementText,
    stage,
    slots,
    isWebsiteSkill: isWebsiteSkill(requestedSkillId),
    forceGenerate: Boolean(confirmedPrompt),
  });
  const filled = slots.filter((slot) => slot.filled).length;
  const question = buildClarificationQuestion({
    slots,
    stage,
    decision,
  });
  const requiresRequirementForm =
    isWebsiteSkill(requestedSkillId) &&
    stage === "drafting" &&
    !confirmedPrompt &&
    !requiredSlotValidation.passed;
  const displayQuestion = localizedClarificationQuestion({
    locale: displayLocale,
    requiresRequirementForm,
    question,
  });
  const explicitLongTermPreferences = buildExplicitLongTermPreferences({
    ownerUserId,
    formValues: parsedRequirementForm.formValues,
    requirementSpec,
  });
  const draftRevisionPointer = buildRevisionPointer({
    executionMode:
      decision.intent === "deploy"
        ? "deploy"
        : decision.intent === "refine_preview" || decision.intent === "refine_deployed"
          ? "refine"
          : "generate",
    requirementRevision: aggregated.revision,
    existingWorkflow: memoryWorkflowContext,
    shortTermMemory,
  });
  const deployIntentRequested =
    !confirmedPrompt && (blogContentDeployConfirmed || decision.intent === "deploy" || isDeployIntent(normalizedUserText));
  const recoveredDeployableArtifactForGate = await recoverDeployableProjectArtifact({
    reqUrl: req.url,
    deployIntentRequested,
    hasCompletedGenerationBaseline,
    previousState,
    deployableTask,
    latestTask,
  });
  if (deployIntentRequested && !hasCompletedGenerationBaseline) {
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: normalizedUserText,
      ownerUserId: body.user_id || previousState.user_id,
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: chatCopy(displayLocale, "generateBeforeDeploy"),
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "lifecycle_gate",
        locale: displayLocale,
        requestedIntent: "deploy",
        requiredTaskStatus: "succeeded",
        hasCompletedGenerationBaseline,
      },
    });
    await persistRouteMemorySnapshot({
      chatId,
      ownerUserId,
      stage,
      intent: "deploy",
      intentConfidence: decision.confidence,
      requirementSpec,
      slots,
      missingCriticalSlots: decision.missingSlots,
      assumptions: decision.assumedDefaults,
      revisionPointer: draftRevisionPointer,
      workflowContext: {
        ...memoryWorkflowContext,
        conversationStage: stage,
        intent: "deploy",
        intentConfidence: decision.confidence,
        requirementSpec,
        requirementRevision: aggregated.revision,
      },
      recentSummary: effectiveRequirementText,
      correctionSummary: aggregated.correctionSummary,
      explicitLongTermPreferences,
    });
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return createInfoStreamResponse(chatCopy(displayLocale, "generateBeforeDeploy"), 200);
  }
  const deployArtifact = deployableProjectArtifact(previousState, deployableTask) || recoveredDeployableArtifactForGate;
  const existingWorkflow = {
    ...taskWorkflowContext(deployableTask || latestTask),
    ...memoryWorkflowContext,
  } as Record<string, unknown>;
  const workflowBlogPreviewPosts = Array.isArray((existingWorkflow as any)?.blogContentPreviewPosts)
    ? ((existingWorkflow as any)?.blogContentPreviewPosts as unknown[])
    : [];
  const workflowBlogPreviewStatus = String((existingWorkflow as any)?.blogContentPreviewStatus || "").trim();
  const workflowBlogConfirmed = Boolean((existingWorkflow as any)?.blogContentConfirmed);
  const deployBlogPreview =
    deployIntentRequested && hasCompletedGenerationBaseline && isStaticSiteProjectLike(deployArtifact)
      ? buildBlogContentWorkflowPreview({
          inputState: previousState,
          project: deployArtifact,
          locale: displayLocale === "zh" ? "zh-CN" : "en",
        })
      : { required: false, reason: "skipped", navLabel: "", posts: [] };
  const needsBlogContentConfirmation =
    deployIntentRequested &&
    hasCompletedGenerationBaseline &&
    (deployBlogPreview.required || workflowBlogPreviewStatus === "pending_confirmation") &&
    !blogContentDeployConfirmed &&
    !workflowBlogConfirmed;
  if (needsBlogContentConfirmation) {
    const previewPosts = workflowBlogPreviewPosts.length > 0 ? workflowBlogPreviewPosts : deployBlogPreview.posts;
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: normalizedUserText,
      ownerUserId: body.user_id || previousState.user_id,
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: chatCopy(displayLocale, "blogConfirmBeforeDeploy"),
      ownerUserId: body.user_id || previousState.user_id,
      metadata: buildBlogContentConfirmationMetadata({
        locale: displayLocale,
        navLabel: String((existingWorkflow as any)?.blogNavLabel || deployBlogPreview.navLabel || "").trim(),
        posts: previewPosts,
      }),
    });
    await persistRouteMemorySnapshot({
      chatId,
      ownerUserId,
      stage,
      intent: "deploy",
      intentConfidence: decision.confidence,
      requirementSpec,
      slots,
      missingCriticalSlots: decision.missingSlots,
      assumptions: decision.assumedDefaults,
      revisionPointer: draftRevisionPointer,
      workflowContext: {
        ...existingWorkflow,
        conversationStage: stage,
        intent: "deploy",
        intentConfidence: decision.confidence,
        requirementSpec,
        requirementRevision: aggregated.revision,
        blogContentPreviewPosts: previewPosts,
        blogContentPreviewStatus: "pending_confirmation",
      },
      recentSummary: effectiveRequirementText,
      correctionSummary: aggregated.correctionSummary,
      explicitLongTermPreferences,
    });
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return createInfoStreamResponse(chatCopy(displayLocale, "blogConfirmBeforeDeploy"), 200);
  }
  const rebuildConfirmedPromptForUploadedSources = shouldRebuildConfirmedPromptForUploadedSources({
    explicitConfirmedPrompt: confirmedPromptExplicitlyProvided,
    confirmedPrompt,
    confirmedPromptDraftText,
    referencedAssets,
  });
  const rebuildConfirmedPromptForCanonicalExecution = shouldRebuildConfirmedPromptForCanonicalExecution({
    explicitConfirmedPrompt: confirmedPromptExplicitlyProvided,
    confirmedPrompt,
    confirmedPromptDraftText,
    confirmedPromptDraftMetadata,
  });
  const shouldBuildPromptDraft =
    isWebsiteSkill(requestedSkillId) &&
    !requiresRequirementForm &&
    ((!confirmedPrompt && (decision.intent === "clarify" || decision.intent === "generate")) ||
      rebuildConfirmedPromptForUploadedSources ||
      rebuildConfirmedPromptForCanonicalExecution);
  const promptDraftResult = shouldBuildPromptDraft
    ? await buildPromptDraftWithResearch({
        requirementText: effectiveRequirementText,
        slots,
        referencedAssets,
        ownerUserId: body.user_id || previousState.user_id,
        projectId: chatId,
        displayLocale,
      })
    : {
        canonicalPrompt: confirmedPrompt ? confirmedPromptDraftText || String(confirmedPrompt || "") : effectiveRequirementText,
        usedWebSearch: false,
        sources: [],
        researchSummary: "",
        knowledgeProfile: undefined,
        promptControlManifest: confirmedPromptControlManifest,
        draftMode: "template" as const,
        fallbackReason: `skipped_for_intent:${decision.intent}`,
        provider: undefined,
        model: undefined,
      };
  const canonicalPromptBase = String(promptDraftResult.canonicalPrompt || "").trim();
  const canonicalPrompt = confirmedPrompt ? canonicalPromptBase : appendReferencedAssetsBlock(canonicalPromptBase, referencedAssets);
  const promptControlManifest =
    promptDraftResult.promptControlManifest ||
    confirmedPromptControlManifest ||
    (previousState.workflow_context as any)?.promptControlManifest;
  const requiresPromptDraftConfirmation =
    isWebsiteSkill(requestedSkillId) &&
    stage === "drafting" &&
    !confirmedPrompt &&
    !requiresRequirementForm &&
    (decision.intent === "clarify" || decision.intent === "generate");

  if (requiresRequirementForm) {
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: normalizedUserText,
      ownerUserId: body.user_id || previousState.user_id,
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "system",
      text: requirementProgressText(displayLocale, filled, slots.length, decision.completionPercent),
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "requirement_progress",
        locale: displayLocale,
        progress: {
          completed: filled,
          total: slots.length,
          percent: decision.completionPercent,
        },
        slots,
        required: requiredSlotValidation,
      },
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: displayQuestion,
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "requirement_form",
        locale: displayLocale,
        title: chatCopy(displayLocale, "requirementFormTitle"),
        slots,
        missingRequiredSlots: requiredSlotValidation.missingRequiredSlots,
        nextSlot: requiredSlotValidation.nextSlot,
        requirementSpec,
        requirementRevision: aggregated.revision,
        currentValues: requirementSpec,
        parsedCurrentForm: parsedRequirementForm.formValues || null,
      },
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: displayQuestion,
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "intent_decision",
        locale: displayLocale,
        intent: "clarify",
        confidence: decision.confidence,
        reason: "required-slots-incomplete",
        stage,
        missingRequiredSlots: requiredSlotValidation.missingRequiredSlots,
      },
    });
    await persistRouteMemorySnapshot({
      chatId,
      ownerUserId,
      stage,
      intent: "clarify",
      intentConfidence: decision.confidence,
      requirementSpec,
      slots,
      missingCriticalSlots: requiredSlotValidation.missingRequiredSlots,
      assumptions: decision.assumedDefaults,
      revisionPointer: draftRevisionPointer,
      workflowContext: {
        ...memoryWorkflowContext,
        conversationStage: stage,
        intent: "clarify",
        intentConfidence: decision.confidence,
        requirementSpec,
        requirementRevision: aggregated.revision,
      },
      recentSummary: effectiveRequirementText,
      correctionSummary: aggregated.correctionSummary,
      explicitLongTermPreferences,
    });
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    return createInfoStreamResponse(chatCopy(displayLocale, "requirementFormInfo"), 200);
  }

  if (decision.intent === "clarify" || requiresPromptDraftConfirmation) {
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: normalizedUserText,
      ownerUserId: body.user_id || previousState.user_id,
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "system",
      text: requirementProgressText(displayLocale, filled, slots.length, decision.completionPercent),
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "requirement_progress",
        locale: displayLocale,
        progress: {
          completed: filled,
          total: slots.length,
          percent: decision.completionPercent,
        },
        slots,
      },
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text:
        promptDraftResult.draftMode === "llm_web_search"
          ? chatCopy(displayLocale, "promptDraftWeb")
          : promptDraftResult.draftMode === "llm"
            ? chatCopy(displayLocale, "promptDraftLlm")
            : chatCopy(displayLocale, "promptDraftTemplate"),
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "prompt_draft",
        locale: displayLocale,
        draftMode: promptDraftResult.draftMode || null,
        title: chatCopy(displayLocale, "promptDraftTitle"),
        canonicalPrompt,
        usedWebSearch: promptDraftResult.usedWebSearch,
        missingSlots: decision.missingSlots,
        researchSummary: promptDraftResult.researchSummary,
        researchSources: promptDraftResult.sources,
        websiteKnowledgeProfile: promptDraftResult.knowledgeProfile || null,
        promptControlManifest: promptControlManifest || null,
        requirementSpec,
        requirementRevision: aggregated.revision,
        supersededMessages: aggregated.supersededMessages,
        correctionSummary: aggregated.correctionSummary,
        draftProvider: promptDraftResult.provider || null,
        draftModel: promptDraftResult.model || null,
        draftFallbackReason: promptDraftResult.fallbackReason || null,
        requiresConfirmation: true,
      },
    });
    if (canonicalPrompt) {
      await appendTimelineMessageBestEffort({
        chatId,
        role: "assistant",
        text: chatCopy(displayLocale, "confirmPromptText"),
        ownerUserId: body.user_id || previousState.user_id,
        metadata: {
          cardType: "confirm_generate",
          locale: displayLocale,
          label: chatCopy(displayLocale, "confirmPromptLabel"),
          payload: `${CONFIRM_GENERATE_PREFIX}\n${canonicalPrompt}`,
        },
      });
    }
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: requiresPromptDraftConfirmation
        ? chatCopy(displayLocale, "promptDraftReady")
        : displayQuestion,
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "intent_decision",
        locale: displayLocale,
        intent: decision.intent,
        confidence: decision.confidence,
        reason: decision.reason,
        stage,
        assumedDefaults: decision.assumedDefaults,
        requiresPromptDraftConfirmation,
      },
    });
    await persistRouteMemorySnapshot({
      chatId,
      ownerUserId,
      stage,
      intent: decision.intent,
      intentConfidence: decision.confidence,
      requirementSpec,
      slots,
      missingCriticalSlots: decision.missingSlots,
      assumptions: decision.assumedDefaults,
      revisionPointer: draftRevisionPointer,
      workflowContext: {
        ...memoryWorkflowContext,
        conversationStage: stage,
        intent: decision.intent,
        intentConfidence: decision.confidence,
        requirementSpec,
        requirementRevision: aggregated.revision,
        canonicalPrompt,
        requirementAggregatedText: effectiveRequirementText,
        promptControlManifest,
      },
      recentSummary: canonicalPrompt || effectiveRequirementText,
      correctionSummary: aggregated.correctionSummary,
      explicitLongTermPreferences,
    });
    await invalidateLaunchCenterRecentProjectsCacheBestEffort();
    if (requiresPromptDraftConfirmation) {
      return createInfoStreamResponse(chatCopy(displayLocale, "promptDraftWaiting"), 200);
    }

    return createInfoStreamResponse(chatCopy(displayLocale, "clarificationInfo"), 200);
  }

  const deployRequested = deployIntentRequested && hasCompletedGenerationBaseline;
  const refineRequested = decision.intent === "refine_preview" || decision.intent === "refine_deployed";
  const executionMode: "generate" | "refine" | "deploy" = deployRequested
    ? "deploy"
    : refineRequested
      ? "refine"
      : "generate";
  const revisionPointer = buildRevisionPointer({
    executionMode,
    requirementRevision: aggregated.revision,
    existingWorkflow,
    shortTermMemory,
  });
  const retainedGenerationRequirement =
    findTaskGenerationPrompt(deployableTask || latestTask) ||
    String((existingWorkflow as any)?.sourceRequirement || (existingWorkflow as any)?.canonicalPrompt || "").trim();
  const runtimeSourceRequirement =
    deployRequested && retainedGenerationRequirement
      ? retainedGenerationRequirement
      : executionMode === "generate" && isWebsiteSkill(requestedSkillId)
        ? canonicalPrompt
        : appendReferencedAssetsBlock(currentUserRequirementText, referencedAssets);
  const canonicalPromptForExecution =
    deployRequested && retainedGenerationRequirement
      ? String((existingWorkflow as any)?.canonicalPrompt || retainedGenerationRequirement || canonicalPrompt).trim() || canonicalPrompt
      : canonicalPrompt;
  const requirementAggregatedTextForExecution =
    deployRequested && retainedGenerationRequirement
      ? String((existingWorkflow as any)?.requirementAggregatedText || retainedGenerationRequirement || effectiveRequirementText).trim() ||
        effectiveRequirementText
      : effectiveRequirementText;
  const runtimeUserText =
    executionMode === "generate" && isWebsiteSkill(requestedSkillId)
      ? canonicalPrompt
      : appendReferencedAssetsBlock(currentUserRequirementText, referencedAssets);
  const previousDeployArtifact =
    (previousState as any).site_artifacts || (previousState as any).project_json;
  const recoveredDeployArtifact =
    deployRequested && !isStaticSiteProjectLike(previousDeployArtifact)
      ? recoveredDeployableArtifactForGate ||
        (await buildDeployStaticSiteFromPreview(deployableTask || latestTask, new URL(req.url).origin).catch(() => undefined))
      : undefined;

  const effectiveProjectArtifact = isStaticSiteProjectLike(previousDeployArtifact)
    ? previousDeployArtifact
    : recoveredDeployArtifact;

  const inputState: AgentState = {
    ...previousState,
    user_id: body.user_id || previousState.user_id,
    access_token: body.access_token || previousState.access_token,
    project_json: effectiveProjectArtifact,
    site_artifacts: effectiveProjectArtifact,
    workflow_context: {
      ...(previousState.workflow_context || {}),
      lockedProvider: undefined,
      lockedModel: undefined,
      runMode: useAsyncTaskMode ? "async-task" : "sync",
      genMode: "skill_native",
      skillId: requestedSkillId,
      sourceRequirement: runtimeSourceRequirement,
      refineSkillId: String(process.env.CHAT_REFINE_SKILL_ID || "website-refinement-workflow"),
      executionMode,
      conversationStage: stage,
      intent: decision.intent,
      intentConfidence: decision.confidence,
      intentReason: decision.reason,
      refineScope: decision.refineScope,
      deployRequested,
      refineRequested,
      blogContentConfirmed:
        blogContentDeployConfirmed || (deployRequested ? Boolean((previousState.workflow_context as any)?.blogContentConfirmed) : false),
      blogContentPreviewPosts:
        workflowBlogPreviewPosts.length > 0 ? workflowBlogPreviewPosts : deployBlogPreview.posts,
      blogContentPreviewStatus:
        workflowBlogPreviewStatus || (deployBlogPreview.required ? "pending_confirmation" : deployBlogPreview.reason || "skipped"),
      blogNavLabel: String((previousState.workflow_context as any)?.blogNavLabel || deployBlogPreview.navLabel || "").trim(),
      designOverrides:
        body.design_overrides && typeof body.design_overrides === "object"
          ? body.design_overrides
          : (previousState.workflow_context as any)?.designOverrides,
      designConfirmed:
        body.confirm_design === true ||
        Boolean((previousState.workflow_context as any)?.designConfirmed),
      deploySourceProjectPath: checkpointProjectPath || String((previousState.workflow_context as any)?.deploySourceProjectPath || ""),
      deploySourceTaskId: String(deployableTask?.id || latestTask?.id || (previousState.workflow_context as any)?.deploySourceTaskId || ""),
      refineSourceProjectPath: checkpointProjectPath || String((previousState.workflow_context as any)?.deploySourceProjectPath || ""),
      refineSourceTaskId: String(deployableTask?.id || latestTask?.id || (previousState.workflow_context as any)?.deploySourceTaskId || ""),
      checkpointProjectPath,
      siteRevisionId: revisionPointer.revisionId,
      baseSiteRevisionId: revisionPointer.baseRevisionId,
      siteRevisionMode: revisionPointer.mode,
      requirementCompletionPercent: decision.completionPercent,
      requirementSlots: slots,
      requirementSpec,
      primaryVisualDirection: requirementSpec.primaryVisualDirection,
      secondaryVisualTags: requirementSpec.secondaryVisualTags || [],
      visualDecisionSource: requirementSpec.visualDecisionSource,
      lockPrimaryVisualDirection: requirementSpec.visualDecisionSource === "user_explicit",
      requirementPatchPlan,
      requirementRevision: aggregated.revision,
      supersededMessages: aggregated.supersededMessages,
      correctionSummary: aggregated.correctionSummary,
      canonicalPrompt: canonicalPromptForExecution,
      requirementAggregatedText: requirementAggregatedTextForExecution,
      promptControlManifest,
      latestUserText: currentUserRequirementText,
      latestUserTextRaw: normalizedUserText,
      referencedAssets,
      assumedDefaults: decision.assumedDefaults,
      displayLocale,
    } as any,
    messages: [...(previousState.messages || []), new HumanMessage({ content: runtimeUserText })],
  };

  if (!useAsyncTaskMode) {
    return errorStreamResponse(chatCopy(displayLocale, "syncDisabled"), 409);
  }

  const acceptedMessageByMode: Record<"generate" | "refine" | "deploy", string> = {
    generate: chatCopy(displayLocale, "acceptedGenerate"),
    refine: chatCopy(displayLocale, "acceptedRefine"),
    deploy: chatCopy(displayLocale, "acceptedDeploy"),
  };
  const acceptedMessage = acceptedMessageByMode[executionMode];

  try {
    if (ownerUserId && executionMode === "generate") {
      const hadBillableProject = await hasBillableProject(ownerUserId, chatId);
      await assertCanCreateProject(ownerUserId, chatId);
      if (!hadBillableProject) {
        await reserveCreatedProjectUsage({
          ownerUserId,
          sourceProjectId: chatId,
          projectName: normalizedUserText.slice(0, 80) || "Untitled Project",
        });
        usageReservedForThisRequest = { ownerUserId, sourceProjectId: chatId };
      }
      await saveProjectState(
        ownerUserId,
        {
          branding: { name: normalizedUserText.slice(0, 80) || "Untitled Project" },
          billing: { reservedAt: new Date().toISOString(), status: "generation_queued" },
        },
        body.access_token || previousState.access_token,
        chatId,
      ).catch((error) => {
        console.warn(`[ChatRoute] billing project reservation failed: ${String((error as any)?.message || error)}`);
      });
    } else if (ownerUserId && executionMode === "deploy") {
      await assertCanMutatePublishedSite(ownerUserId);
    }
  } catch (error) {
    if (error instanceof BillingAccessError) {
      return errorStreamResponse(error.message, error.status);
    }
    throw error;
  }

  const initialResult: ChatTaskResult = {
    assistantText: acceptedMessage,
    phase: "queued",
    internal: {
      inputState,
      sessionState: inputState,
      queuedAt: new Date().toISOString(),
      skillId: requestedSkillId,
    },
    progress: {
      stage: "queued",
      stageMessage: localizedQueuedStageMessage(displayLocale, executionMode),
      skillId: requestedSkillId,
      attempt: 1,
      startedAt: new Date().toISOString(),
      round: 0,
      maxRounds: resolveAsyncRoundBudget(),
      checkpointSaved: false,
      nextStep: executionMode,
    } as any,
  };
  const task = await createChatTask(chatId, ownerUserId, initialResult);
  await persistRouteMemorySnapshot({
    chatId,
    ownerUserId,
    stage,
    intent: decision.intent,
    intentConfidence: decision.confidence,
    requirementSpec,
    slots,
    missingCriticalSlots: decision.missingSlots,
    assumptions: decision.assumedDefaults,
    revisionPointer: {
      ...revisionPointer,
      taskId: task.id,
      checkpointProjectPath: String((inputState.workflow_context as any)?.checkpointProjectPath || "").trim() || undefined,
      updatedAt: new Date().toISOString(),
    },
    workflowContext: (inputState.workflow_context || {}) as Record<string, unknown>,
    recentSummary: canonicalPromptForExecution || runtimeSourceRequirement,
    correctionSummary: aggregated.correctionSummary,
    explicitLongTermPreferences,
  });
  usageReservedForThisRequest = undefined;
  const queuedTimelineUserText = visibleTimelineUserText(userText, normalizedUserText);
  if (queuedTimelineUserText) {
    void appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: queuedTimelineUserText,
      ownerUserId: body.user_id || previousState.user_id,
      taskId: task.id,
    });
  }
  void appendTimelineMessageBestEffort({
    chatId,
    role: "assistant",
    text: acceptedMessage,
    ownerUserId: body.user_id || previousState.user_id,
    taskId: task.id,
    metadata: { status: "queued", executionMode, intent: decision.intent, stage, locale: displayLocale },
  });
  void invalidateLaunchCenterRecentProjectsCacheBestEffort();

  return createTaskStreamResponse({
    assistantText: acceptedMessage,
    taskId: task.id,
    chatId,
    status: "queued",
    statusCode: 202,
    displayLocale,
  });
  } catch (error) {
    if (usageReservedForThisRequest) {
      await releaseCreatedProjectUsageReservation(usageReservedForThisRequest).catch((rollbackError) => {
        console.warn(
          `[ChatRoute] billing project reservation rollback failed: ${String(
            (rollbackError as any)?.message || rollbackError,
          )}`,
        );
      });
    }
    if (isTransientStorageConnectivityError(error)) {
      return errorStreamResponse(chatCopy(displayLocale, "storageUnavailable"), 503);
    }
    const message = formatUnknownError(error);
    return errorStreamResponse(message || chatCopy(displayLocale, "requestFailed"), 500);
  }
}
