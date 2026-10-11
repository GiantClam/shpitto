import { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";

export type BuilderAction = {
  text: string;
  payload?: string;
  type?: "button" | "url";
};

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

export function extractUiPayload(state: AgentState) {
  const lastAiMessage = [...(state.messages || [])]
    .reverse()
    .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;

  const assistantText = lastAiMessage?.content?.toString?.() || "";
  const toolCalls =
    (lastAiMessage as any)?.tool_calls ||
    (lastAiMessage as any)?.additional_kwargs?.tool_calls ||
    [];

  let actions: BuilderAction[] | undefined;

  for (const call of toolCalls) {
    const name = call?.name || call?.function?.name;
    const args = parseToolCallArgs(call);
    if (name === "presentActions" && Array.isArray(args.actions)) {
      actions = args.actions;
    }
  }

  return { assistantText, actions };
}

