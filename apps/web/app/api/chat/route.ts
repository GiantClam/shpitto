import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { HumanMessage } from "@langchain/core/messages";
import crypto from "node:crypto";
import {
  createChatTask,
  getActiveChatTask,
  type ChatTaskResult,
} from "../../../lib/agent/chat-task-store";
import { type BuilderAction } from "../../../lib/agent/chat-ui-payload";
import { type AgentState } from "../../../lib/agent/graph";
import { loadProjectSkill } from "../../../lib/skill-runtime/project-skill-loader";

export const runtime = "nodejs";

type ChatRequestBody = {
  id?: string;
  messages?: UIMessage[];
  user_id?: string;
  access_token?: string;
  async?: boolean;
  skill_id?: string;
};

type SessionRecord = {
  state: AgentState;
  updatedAt: number;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const sessions = new Map<string, SessionRecord>();

function now() {
  return Date.now();
}

function createInitialState(): AgentState {
  return {
    messages: [],
    phase: "conversation",
    current_page_index: 0,
    attempt_count: 0,
  };
}

function cleanupSessions() {
  const threshold = now() - SESSION_TTL_MS;
  for (const [key, value] of sessions.entries()) {
    if (value.updatedAt < threshold) {
      sessions.delete(key);
    }
  }
}

function getSession(chatId: string): AgentState {
  cleanupSessions();
  const existing = sessions.get(chatId);
  if (existing) return existing.state;
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

  const previousState = getSession(chatId);
  const activeTask = await getActiveChatTask(chatId);
  if (activeTask && (activeTask.status === "queued" || activeTask.status === "running")) {
    return createTaskStreamResponse({
      assistantText: "A generation task is already running for this chat. Please wait for completion or check task status.",
      taskId: activeTask.id,
      chatId,
      status: activeTask.status,
      statusCode: 202,
    });
  }

  const useAsyncTaskMode = shouldUseAsyncTaskMode(body);
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

  const inputState: AgentState = {
    ...previousState,
    user_id: body.user_id || previousState.user_id,
    access_token: body.access_token || previousState.access_token,
    workflow_context: {
      ...(previousState.workflow_context || {}),
      runMode: useAsyncTaskMode ? "async-task" : "sync",
      genMode: "skill_native",
      skillId: requestedSkillId,
    },
    messages: [...(previousState.messages || []), new HumanMessage({ content: userText })],
  };

  if (!useAsyncTaskMode) {
    return errorStreamResponse("Synchronous generation path is disabled. Use async task mode.", 409);
  }

  const initialResult: ChatTaskResult = {
    assistantText: "Task accepted. Waiting for worker to claim execution.",
    phase: "queued",
    internal: {
      inputState,
      queuedAt: new Date().toISOString(),
      skillId: requestedSkillId,
    },
    progress: {
      stage: "queued",
      skillId: requestedSkillId,
      provider: String(process.env.LLM_PROVIDER || "aiberm"),
      model: String(process.env.LLM_MODEL || process.env.LLM_MODEL_AIBERM || "openai/gpt-5.3-codex"),
      attempt: 1,
      startedAt: new Date().toISOString(),
      round: 0,
      maxRounds: resolveAsyncRoundBudget(),
      checkpointSaved: false,
    } as any,
  };
  const task = await createChatTask(chatId, body.user_id || previousState.user_id, initialResult);

  return createTaskStreamResponse({
    assistantText: "Task accepted. Queued for background worker execution.",
    taskId: task.id,
    chatId,
    status: "queued",
    statusCode: 202,
  });
}
