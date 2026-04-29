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
  isDeployIntent,
  parseRequirementFormFromText,
  validateRequiredRequirementSlots,
} from "../../../lib/agent/chat-orchestrator";
import { buildPromptDraftWithResearch } from "../../../lib/agent/prompt-draft-research";
import {
  appendReferencedAssetsBlock,
  collectReferencedAssetsFromTexts,
  parseReferencedAssetsFromText,
} from "../../../lib/agent/referenced-assets";
import { loadProjectSkill } from "../../../lib/skill-runtime/project-skill-loader";
import { invalidateLaunchCenterRecentProjectsCache } from "../../../lib/launch-center/cache";

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

async function getSession(chatId: string): Promise<AgentState> {
  const latestTask = await getLatestChatTaskForChat(chatId);
  const baselineTask = taskHasRouteBaseline(latestTask)
    ? latestTask
    : await getLatestDeployableChatTaskForChat(chatId).catch(() => undefined);
  const sessionTask = baselineTask || latestTask;
  const internal = (sessionTask?.result?.internal || {}) as Record<string, unknown>;
  const fromSessionState = reviveSessionState(internal.sessionState);
  const checkpointProjectPath = String(sessionTask?.result?.progress?.checkpointProjectPath || "").trim();
  const deployedUrl = String(sessionTask?.result?.deployedUrl || "").trim();
  if (fromSessionState) {
    return {
      ...fromSessionState,
      deployed_url: deployedUrl || fromSessionState.deployed_url,
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
    designTheme: ["professional"],
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
      if (userPrompt.startsWith("# Canonical Website Generation Prompt")) return userPrompt;
      const extracted = extractConfirmedPrompt(userPrompt);
      if (extracted) return extracted;
    }

    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : undefined;
    if (!metadata || String(metadata.cardType || "") !== "prompt_draft") continue;
    const storedPrompt = String((metadata as any).canonicalPrompt || "").trim();
    if (storedPrompt) return storedPrompt;
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
    if (sourceRequirement) return sourceRequirement;
    const canonicalPrompt = String(context?.canonicalPrompt || "").trim();
    if (canonicalPrompt) return canonicalPrompt;
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

function localTaskRootsForChat(chatId: string): string[] {
  const safeChatId = String(chatId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return Array.from(
    new Set([
      path.resolve(process.cwd(), ".tmp", "chat-tasks", safeChatId),
      path.resolve(process.cwd(), "apps", "web", ".tmp", "chat-tasks", safeChatId),
    ]),
  );
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

  try {
  const previousState = await withTimeout(getSession(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Chat session lookup").catch(() =>
    createInitialState(),
  );
  const activeTask = await withTimeout(getActiveChatTask(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Active task lookup").catch(
    () => undefined,
  );
  if (activeTask && (activeTask.status === "queued" || activeTask.status === "running")) {
    const activeWorkflow = (activeTask.result?.internal?.inputState as any)?.workflow_context || {};
    const activeExecutionMode = String(activeWorkflow.executionMode || "").trim().toLowerCase();
    const activeProgressStage = String(activeTask.result?.progress?.stage || "").trim().toLowerCase();
    const activeNextStep = String(activeTask.result?.progress?.nextStep || "").trim().toLowerCase();
    const deployLocked =
      activeExecutionMode === "deploy" ||
      activeProgressStage.includes("deploy") ||
      activeNextStep === "deploy";
    const shouldBypassActiveTaskForContinuation =
      continueGenerationRequested &&
      !deployLocked &&
      activeTask.status === "running" &&
      isStaleRunningTaskForContinuation(activeTask);
    if (shouldBypassActiveTaskForContinuation) {
      await appendTimelineMessageBestEffort({
        chatId,
        role: "user",
        text: userText,
        ownerUserId: body.user_id || previousState.user_id,
        taskId: activeTask.id,
        metadata: { cardType: "continue_generation", staleTaskId: activeTask.id, locale: displayLocale },
      });
    } else {
    if (deployLocked) {
      return createTaskStreamResponse({
        assistantText: chatCopy(displayLocale, "deployLocked"),
        taskId: activeTask.id,
        chatId,
        status: activeTask.status,
        statusCode: 423,
        displayLocale,
      });
    }
    const shouldQueuePendingEdit =
      activeExecutionMode !== "deploy" && !isDeployIntent(userText) && !continueGenerationRequested;
    if (shouldQueuePendingEdit) {
      await appendPendingEditToChatTask(activeTask.id, {
        text: userText,
        ownerUserId: body.user_id || previousState.user_id,
        patchPlan: buildRequirementPatchPlan(userText),
      });
    }
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: userText,
      ownerUserId: body.user_id || previousState.user_id,
      taskId: activeTask.id,
      metadata: shouldQueuePendingEdit
        ? { cardType: "pending_edit", queuedForTaskId: activeTask.id, locale: displayLocale }
        : undefined,
    });
    const assistantText = shouldQueuePendingEdit
      ? chatCopy(displayLocale, "pendingEditQueued")
      : chatCopy(displayLocale, "activeTaskRunning");
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: assistantText,
      ownerUserId: body.user_id || previousState.user_id,
      taskId: activeTask.id,
      metadata: shouldQueuePendingEdit
        ? { cardType: "pending_edit_queued", queuedForTaskId: activeTask.id, locale: displayLocale }
        : { locale: displayLocale },
    });
    await invalidateLaunchCenterRecentProjectsCache();
    return createTaskStreamResponse({
      assistantText,
      taskId: activeTask.id,
      chatId,
      status: activeTask.status,
      statusCode: 202,
      displayLocale,
    });
    }
  }

  const useAsyncTaskMode = shouldUseAsyncTaskMode(body);
  const explicitConfirmedPrompt = extractConfirmedPrompt(userText);
  let confirmedPrompt = explicitConfirmedPrompt;
  let normalizedUserText = explicitConfirmedPrompt || userText;
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

  let latestTask: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined;
  try {
    latestTask = await withTimeout(getLatestChatTaskForChat(chatId), CHAT_ROUTE_STORE_TIMEOUT_MS, "Latest task lookup");
  } catch (error) {
    if (!continueGenerationRequested && isTransientStorageConnectivityError(error)) {
      return errorStreamResponse(chatCopy(displayLocale, "storageUnavailable"), 503);
    }
    latestTask = undefined;
  }
  const deployableTask = taskHasRouteBaseline(latestTask)
    ? latestTask
    : await withTimeout(
        getLatestDeployableChatTaskForChat(chatId),
        CHAT_ROUTE_STORE_TIMEOUT_MS,
        "Deployable task lookup",
      ).catch(() => undefined);
  const checkpointProjectPath = String(
    deployableTask?.result?.progress?.checkpointProjectPath ||
      latestTask?.result?.progress?.checkpointProjectPath ||
      (previousState.workflow_context as any)?.checkpointProjectPath ||
      (previousState.workflow_context as any)?.deploySourceProjectPath ||
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
  const slots = buildRequirementSlots(effectiveRequirementText);
  const requirementSpec = buildRequirementSpec(effectiveRequirementText, effectiveRequirementSourceMessages);
  const requiredSlotValidation = validateRequiredRequirementSlots(slots);
  const requirementPatchPlan = buildRequirementPatchPlan(currentUserRequirementText, aggregated.revision);
  const stage = deriveConversationStage({
    latestTaskStatus: latestTask?.status,
    latestProgressStage: String(latestTask?.result?.progress?.stage || ""),
    latestDeployedUrl: String(latestTask?.result?.deployedUrl || ""),
    checkpointProjectPath,
    workflowContext: (previousState.workflow_context || {}) as Record<string, unknown>,
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
  const shouldBuildPromptDraft =
    isWebsiteSkill(requestedSkillId) &&
    !confirmedPrompt &&
    !requiresRequirementForm &&
    (decision.intent === "clarify" || decision.intent === "generate");
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
    await invalidateLaunchCenterRecentProjectsCache();
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
    await invalidateLaunchCenterRecentProjectsCache();
    if (requiresPromptDraftConfirmation) {
      return createInfoStreamResponse(chatCopy(displayLocale, "promptDraftWaiting"), 200);
    }

    return createInfoStreamResponse(chatCopy(displayLocale, "clarificationInfo"), 200);
  }

  const deployRequested = decision.intent === "deploy" || isDeployIntent(normalizedUserText);
  const refineRequested = decision.intent === "refine_preview" || decision.intent === "refine_deployed";
  const executionMode: "generate" | "refine" | "deploy" = deployRequested
    ? "deploy"
    : refineRequested
      ? "refine"
      : "generate";
  const runtimeUserText =
    executionMode === "generate" && isWebsiteSkill(requestedSkillId)
      ? canonicalPrompt
      : appendReferencedAssetsBlock(currentUserRequirementText, referencedAssets);
  const previousDeployArtifact =
    (previousState as any).site_artifacts || (previousState as any).project_json;
  const recoveredDeployArtifact =
    deployRequested && !isStaticSiteProjectLike(previousDeployArtifact)
      ? await buildDeployStaticSiteFromPreview(deployableTask || latestTask, new URL(req.url).origin).catch(() => undefined)
      : undefined;

  const inputState: AgentState = {
    ...previousState,
    user_id: body.user_id || previousState.user_id,
    access_token: body.access_token || previousState.access_token,
    project_json: (previousState as any).project_json || recoveredDeployArtifact,
    site_artifacts: (previousState as any).site_artifacts || recoveredDeployArtifact,
    workflow_context: {
      ...(previousState.workflow_context || {}),
      runMode: useAsyncTaskMode ? "async-task" : "sync",
      genMode: "skill_native",
      skillId: requestedSkillId,
      sourceRequirement: runtimeUserText,
      refineSkillId: String(process.env.CHAT_REFINE_SKILL_ID || "website-refinement-workflow"),
      executionMode,
      conversationStage: stage,
      intent: decision.intent,
      intentConfidence: decision.confidence,
      intentReason: decision.reason,
      deployRequested,
      refineRequested,
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
      requirementCompletionPercent: decision.completionPercent,
      requirementSlots: slots,
      requirementSpec,
      requirementPatchPlan,
      requirementRevision: aggregated.revision,
      supersededMessages: aggregated.supersededMessages,
      correctionSummary: aggregated.correctionSummary,
      canonicalPrompt,
      requirementAggregatedText: effectiveRequirementText,
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
      provider: String(process.env.LLM_PROVIDER || "aiberm"),
      model: String(process.env.LLM_MODEL || process.env.LLM_MODEL_AIBERM || "openai/gpt-5.4-mini"),
      attempt: 1,
      startedAt: new Date().toISOString(),
      round: 0,
      maxRounds: resolveAsyncRoundBudget(),
      checkpointSaved: false,
      nextStep: executionMode,
    } as any,
  };
  const task = await createChatTask(chatId, body.user_id || previousState.user_id, initialResult);
  await appendTimelineMessageBestEffort({
    chatId,
    role: "user",
    text: normalizedUserText,
    ownerUserId: body.user_id || previousState.user_id,
    taskId: task.id,
  });
  await appendTimelineMessageBestEffort({
    chatId,
    role: "assistant",
    text: acceptedMessage,
    ownerUserId: body.user_id || previousState.user_id,
    taskId: task.id,
    metadata: { status: "queued", executionMode, intent: decision.intent, stage, locale: displayLocale },
  });
  await invalidateLaunchCenterRecentProjectsCache();

  return createTaskStreamResponse({
    assistantText: acceptedMessage,
    taskId: task.id,
    chatId,
    status: "queued",
    statusCode: 202,
    displayLocale,
  });
  } catch (error) {
    if (isTransientStorageConnectivityError(error)) {
      return errorStreamResponse(chatCopy(displayLocale, "storageUnavailable"), 503);
    }
    const message = formatUnknownError(error);
    return errorStreamResponse(message || chatCopy(displayLocale, "requestFailed"), 500);
  }
}
