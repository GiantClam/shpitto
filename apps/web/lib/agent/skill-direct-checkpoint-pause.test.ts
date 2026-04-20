import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { vi } from "vitest";
import type { AgentState } from "./graph";

class MockChatOpenAI {
  constructor(_opts: any) {}

  withStructuredOutput(_schema: any) {
    return {
      invoke: async () => ({
        intent: "chat",
        message: "Checkpoint saved. Retry will resume from remaining steps.",
        plan_outline: null,
      }),
    };
  }

  async invoke() {
    return new AIMessage({ content: "{}" });
  }
}

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI,
}));

describe("skill-direct checkpoint pause", () => {
  it("stops current invoke after checkpoint instead of auto-retrying skeleton", async () => {
    const { graph } = await import("./graph");
    const state: AgentState = {
      messages: [
        new AIMessage({
          content:
            "Skill-direct generation interrupted: timeout. Checkpoint saved. Retry will resume from remaining steps.",
        }),
      ],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
    };

    const result = (await graph.invoke(state)) as AgentState;
    expect(result.phase).toBe("conversation");
    expect(String((result.messages || [])[result.messages.length - 1]?.content || "")).toContain(
      "Checkpoint saved",
    );
  });
});
