import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { graph, type AgentState } from "@/lib/agent/graph";

export const runtime = "nodejs";

type BuilderAction = {
  text: string;
  payload?: string;
  type?: "button" | "url";
};

type ChatRequestBody = {
  id?: string;
  messages?: UIMessage[];
  user_id?: string;
  access_token?: string;
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

function setSession(chatId: string, state: AgentState) {
  sessions.set(chatId, { state, updatedAt: now() });
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

function parseToolCallArgs(toolCall: any): Record<string, any> {
  const raw = toolCall?.args ?? toolCall?.function?.arguments;
  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof raw === "object") return raw;
  return {};
}

function extractUiPayload(state: AgentState) {
  const lastAiMessage = [...(state.messages || [])]
    .reverse()
    .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;

  const assistantText = lastAiMessage?.content?.toString?.() || "";
  const toolCalls =
    (lastAiMessage as any)?.tool_calls ||
    (lastAiMessage as any)?.additional_kwargs?.tool_calls ||
    [];

  let actions: BuilderAction[] | undefined;
  let projectJson: any | undefined;

  for (const call of toolCalls) {
    const name = call?.name || call?.function?.name;
    const args = parseToolCallArgs(call);

    if (name === "presentActions" && Array.isArray(args.actions)) {
      actions = args.actions;
    }

    if (name === "showWebsitePreview") {
      projectJson = args.projectJson ?? args.project_json;
    }
  }

  if (!projectJson && state.project_json) {
    projectJson = state.project_json;
  }

  return { assistantText, actions, projectJson };
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
  const inputState: AgentState = {
    ...previousState,
    user_id: body.user_id || previousState.user_id,
    access_token: body.access_token || previousState.access_token,
    messages: [...(previousState.messages || []), new HumanMessage({ content: userText })],
  };

  let nextState: AgentState;

  try {
    nextState = (await graph.invoke(inputState)) as AgentState;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return errorStreamResponse(message, 500);
  }

  setSession(chatId, nextState);

  const { assistantText, actions, projectJson } = extractUiPayload(nextState);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });

      if (assistantText) {
        const textId = crypto.randomUUID();
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: assistantText });
        writer.write({ type: "text-end", id: textId });
      }

      if (actions && actions.length > 0) {
        writer.write({ type: "data-actions", data: actions });
      }

      if (projectJson) {
        writer.write({ type: "data-preview", data: projectJson });
      }

      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
