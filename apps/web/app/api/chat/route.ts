import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import crypto from "node:crypto";
import {
  appendPendingEditToChatTask,
  appendChatTimelineMessage,
  createChatTask,
  getActiveChatTask,
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
  };
}

async function getSession(chatId: string): Promise<AgentState> {
  const latestTask = await getLatestChatTaskForChat(chatId);
  const internal = (latestTask?.result?.internal || {}) as Record<string, unknown>;
  const fromSessionState = reviveSessionState(internal.sessionState);
  const checkpointProjectPath = String(latestTask?.result?.progress?.checkpointProjectPath || "").trim();
  const deployedUrl = String(latestTask?.result?.deployedUrl || "").trim();
  if (fromSessionState) {
    return {
      ...fromSessionState,
      deployed_url: deployedUrl || fromSessionState.deployed_url,
      workflow_context: {
        ...(fromSessionState.workflow_context || {}),
        deploySourceProjectPath:
          checkpointProjectPath || (fromSessionState.workflow_context as any)?.deploySourceProjectPath,
        deploySourceTaskId: latestTask?.id || (fromSessionState.workflow_context as any)?.deploySourceTaskId,
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
        deploySourceTaskId: latestTask?.id || (fromInputState.workflow_context as any)?.deploySourceTaskId,
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
}) {
  const { assistantText, taskId, chatId, status, actions, statusCode = 200 } = params;
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
        },
      });
      const nextActions = [
        ...(actions || []),
        { text: "Check Task Status", payload: statusPath, type: "url" as const },
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

function resolveAsyncRoundBudget(): number {
  return Math.max(1, Number(process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE || 1));
}

function extractConfirmedPrompt(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text.startsWith(CONFIRM_GENERATE_PREFIX)) return null;
  const payload = text.slice(CONFIRM_GENERATE_PREFIX.length).trim();
  return payload || null;
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

  try {
  const previousState = await getSession(chatId);
  const activeTask = await getActiveChatTask(chatId);
  if (activeTask && (activeTask.status === "queued" || activeTask.status === "running")) {
    const activeWorkflow = (activeTask.result?.internal?.inputState as any)?.workflow_context || {};
    const activeExecutionMode = String(activeWorkflow.executionMode || "").trim().toLowerCase();
    const activeProgressStage = String(activeTask.result?.progress?.stage || "").trim().toLowerCase();
    const activeNextStep = String(activeTask.result?.progress?.nextStep || "").trim().toLowerCase();
    const deployLocked =
      activeExecutionMode === "deploy" ||
      activeProgressStage.includes("deploy") ||
      activeNextStep === "deploy";
    if (deployLocked) {
      return createTaskStreamResponse({
        assistantText: "部署正在进行中，当前阶段已锁定输入。请等待部署完成后再继续修改或发布。",
        taskId: activeTask.id,
        chatId,
        status: activeTask.status,
        statusCode: 423,
      });
    }
    const shouldQueuePendingEdit = activeExecutionMode !== "deploy" && !isDeployIntent(userText);
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
      metadata: shouldQueuePendingEdit ? { cardType: "pending_edit", queuedForTaskId: activeTask.id } : undefined,
    });
    const assistantText = shouldQueuePendingEdit
      ? "当前任务仍在运行。本条修改已加入待处理队列，当前任务完成后会自动基于最新预览继续修正。"
      : "A generation task is already running for this chat. Please wait for completion or check task status.";
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: assistantText,
      ownerUserId: body.user_id || previousState.user_id,
      taskId: activeTask.id,
      metadata: shouldQueuePendingEdit ? { cardType: "pending_edit_queued", queuedForTaskId: activeTask.id } : undefined,
    });
    await invalidateLaunchCenterRecentProjectsCache();
    return createTaskStreamResponse({
      assistantText,
      taskId: activeTask.id,
      chatId,
      status: activeTask.status,
      statusCode: 202,
    });
  }

  const useAsyncTaskMode = shouldUseAsyncTaskMode(body);
  const confirmedPrompt = extractConfirmedPrompt(userText);
  const normalizedUserText = confirmedPrompt || userText;
  const parsedCurrentInput = parseReferencedAssetsFromText(normalizedUserText);
  const currentUserRequirementText = parsedCurrentInput.cleanText || normalizedUserText;
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

  const latestTask = await getLatestChatTaskForChat(chatId);
  const checkpointProjectPath = String(
    latestTask?.result?.progress?.checkpointProjectPath ||
      (previousState.workflow_context as any)?.checkpointProjectPath ||
      (previousState.workflow_context as any)?.deploySourceProjectPath ||
      "",
  ).trim();
  const timelineMessages = await listChatTimelineMessages(chatId, 120);
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
  const slots = buildRequirementSlots(aggregated.requirementText);
  const requirementSpec = buildRequirementSpec(aggregated.requirementText, aggregated.sourceMessages);
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
  const shouldBuildPromptDraft =
    isWebsiteSkill(requestedSkillId) &&
    (decision.intent === "clarify" || decision.intent === "generate");
  const promptDraftResult = shouldBuildPromptDraft
    ? await buildPromptDraftWithResearch({
        requirementText: aggregated.requirementText,
        slots,
      })
    : {
        promptDraft: aggregated.requirementText,
        usedWebSearch: false,
        sources: [],
        researchSummary: "",
        draftMode: "template" as const,
        fallbackReason: `skipped_for_intent:${decision.intent}`,
        provider: undefined,
        model: undefined,
      };
  const promptDraft = appendReferencedAssetsBlock(String(promptDraftResult.promptDraft || "").trim(), referencedAssets);

  if (decision.intent === "clarify") {
    await appendTimelineMessageBestEffort({
      chatId,
      role: "user",
      text: normalizedUserText,
      ownerUserId: body.user_id || previousState.user_id,
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "system",
      text: `需求进度：${filled}/${slots.length} (${decision.completionPercent}%)`,
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "requirement_progress",
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
          ? "已基于 LLM + Web Search 生成 Prompt 草稿，可继续补充，或直接发送“开始生成”。"
          : promptDraftResult.draftMode === "llm"
            ? "已基于 LLM 生成 Prompt 草稿，可继续补充，或直接发送“开始生成”。"
            : "已更新需求草稿，可继续补充，或直接发送“开始生成”。",
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "prompt_draft",
        draftMode: promptDraftResult.draftMode || null,
        title: "网站生成 Prompt 草稿",
        promptDraft,
        usedWebSearch: promptDraftResult.usedWebSearch,
        missingSlots: decision.missingSlots,
        researchSummary: promptDraftResult.researchSummary,
        researchSources: promptDraftResult.sources,
        requirementSpec,
        requirementRevision: aggregated.revision,
        supersededMessages: aggregated.supersededMessages,
        correctionSummary: aggregated.correctionSummary,
        draftProvider: promptDraftResult.provider || null,
        draftModel: promptDraftResult.model || null,
        draftFallbackReason: promptDraftResult.fallbackReason || null,
      },
    });
    await appendTimelineMessageBestEffort({
      chatId,
      role: "assistant",
      text: question,
      ownerUserId: body.user_id || previousState.user_id,
      metadata: {
        cardType: "intent_decision",
        intent: decision.intent,
        confidence: decision.confidence,
        reason: decision.reason,
        stage,
        assumedDefaults: decision.assumedDefaults,
      },
    });
    await invalidateLaunchCenterRecentProjectsCache();

    return createInfoStreamResponse(
      "已进入需求梳理阶段。请继续补充需求，或直接输入“开始生成”触发任务。",
      200,
    );
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
      ? promptDraft
      : appendReferencedAssetsBlock(currentUserRequirementText, referencedAssets);

  const inputState: AgentState = {
    ...previousState,
    user_id: body.user_id || previousState.user_id,
    access_token: body.access_token || previousState.access_token,
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
      deploySourceTaskId: String(latestTask?.id || (previousState.workflow_context as any)?.deploySourceTaskId || ""),
      refineSourceProjectPath: checkpointProjectPath || String((previousState.workflow_context as any)?.deploySourceProjectPath || ""),
      refineSourceTaskId: String(latestTask?.id || (previousState.workflow_context as any)?.deploySourceTaskId || ""),
      checkpointProjectPath,
      requirementCompletionPercent: decision.completionPercent,
      requirementSlots: slots,
      requirementSpec,
      requirementPatchPlan,
      requirementRevision: aggregated.revision,
      supersededMessages: aggregated.supersededMessages,
      correctionSummary: aggregated.correctionSummary,
      requirementDraft: promptDraft,
      requirementAggregatedText: aggregated.requirementText,
      latestUserText: currentUserRequirementText,
      latestUserTextRaw: normalizedUserText,
      referencedAssets,
      assumedDefaults: decision.assumedDefaults,
    },
    messages: [...(previousState.messages || []), new HumanMessage({ content: runtimeUserText })],
  };

  if (!useAsyncTaskMode) {
    return errorStreamResponse("Synchronous generation path is disabled. Use async task mode.", 409);
  }

  const acceptedMessageByMode: Record<"generate" | "refine" | "deploy", string> = {
    generate: "Generation task accepted. Queued for background worker execution.",
    refine: "Refine task accepted. Will adjust the latest version in background.",
    deploy: "Deploy task accepted. Queued for background deployment.",
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
      stageMessage: `${executionMode} task queued. Waiting for background worker...`,
      skillId: requestedSkillId,
      provider: String(process.env.LLM_PROVIDER || "aiberm"),
      model: String(process.env.LLM_MODEL || process.env.LLM_MODEL_AIBERM || "openai/gpt-5.3-codex"),
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
    metadata: { status: "queued", executionMode, intent: decision.intent, stage },
  });
  await invalidateLaunchCenterRecentProjectsCache();

  return createTaskStreamResponse({
    assistantText: acceptedMessage,
    taskId: task.id,
    chatId,
    status: "queued",
    statusCode: 202,
  });
  } catch (error) {
    if (isTransientStorageConnectivityError(error)) {
      return errorStreamResponse("Chat storage is temporarily unavailable. Please retry in a few seconds.", 503);
    }
    const message = formatUnknownError(error);
    return errorStreamResponse(message || "Failed to process chat request.", 500);
  }
}
