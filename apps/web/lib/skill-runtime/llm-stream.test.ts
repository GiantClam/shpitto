import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { invokeModelWithIdleTimeout } from "./llm-stream";

async function* streamFrom(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("invokeModelWithIdleTimeout", () => {
  it("keeps early tool_calls when later chunks have empty additional_kwargs", async () => {
    const call = {
      id: "call_1",
      type: "function",
      function: { name: "finish", arguments: "{\"status\":\"ok\"}" },
    };
    const model = {
      invoke: async () => ({ content: "" }),
      stream: async () =>
        streamFrom([
          { content: "", additional_kwargs: { tool_calls: [call] } },
          { content: "done", additional_kwargs: {} },
        ]),
    };

    const message = await invokeModelWithIdleTimeout({
      model,
      messages: [new HumanMessage("test")],
      timeoutMs: 5000,
      operation: "unit-test",
    });

    const kwargCalls = Array.isArray((message as any)?.additional_kwargs?.tool_calls)
      ? (message as any).additional_kwargs.tool_calls
      : [];
    expect(kwargCalls).toHaveLength(1);
    expect(kwargCalls[0]?.id).toBe("call_1");
    expect(String(message.content || "")).toContain("done");
  });

  it("merges chunk.tool_calls with additional_kwargs.tool_calls", async () => {
    const callA = { id: "call_A", name: "load_skill", args: { skill_id: "website-generation-workflow" } };
    const callB = {
      id: "call_B",
      type: "function",
      function: { name: "emit_file", arguments: "{\"path\":\"/styles.css\",\"content\":\"body{}\"}" },
    };
    const model = {
      invoke: async () => ({ content: "" }),
      stream: async () =>
        streamFrom([
          { content: "", tool_calls: [callA] },
          { content: "", additional_kwargs: { tool_calls: [callB] } },
        ]),
    };

    const message = await invokeModelWithIdleTimeout({
      model,
      messages: [new HumanMessage("test")],
      timeoutMs: 5000,
      operation: "unit-test-merge",
    });

    const directCalls = Array.isArray((message as any)?.tool_calls) ? (message as any).tool_calls : [];
    const kwargCalls = Array.isArray((message as any)?.additional_kwargs?.tool_calls)
      ? (message as any).additional_kwargs.tool_calls
      : [];
    expect(directCalls.length).toBeGreaterThanOrEqual(2);
    expect(kwargCalls.length).toBeGreaterThanOrEqual(1);
  });
});

