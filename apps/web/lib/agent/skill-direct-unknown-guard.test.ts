import { describe, it, expect, vi } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

class UnknownThenRetryFailChatOpenAI {
  constructor(_opts: any) {}

  withStructuredOutput(_schema: any) {
    return {
      invoke: async (messages: any[]) => {
        const fullPrompt = messages.map((m: any) => String(m?.content || "")).join("\n");
        if (fullPrompt.includes("website-generation-workflow execution engine")) {
          return {
            site: {
              stylesCss: "body{margin:0}",
              scriptJs: "console.log('x')",
              pages: [
                {
                  path: "/",
                  title: "<UNKNOWN>",
                  description: "<UNKNOWN>",
                  bodyHtml: "<UNKNOWN>",
                },
              ],
            },
          };
        }

        const last = messages[messages.length - 1];
        const text = String(last?.content || "").toLowerCase();
        if (text.includes("confirm")) {
          return {
            intent: "confirm_build",
            message: "Confirmed.",
            plan_outline: "Plan confirmed.",
          };
        }
        return {
          intent: "propose_plan",
          message: "Plan drafted.",
          plan_outline: "Plan drafted.",
        };
      },
    };
  }

  async invoke(messages: any[]) {
    const prompt = String(messages?.[0]?.content || "");
    if (prompt.includes("website-generation-workflow execution engine")) {
      // Force retry parse failure so we can verify invalid first-pass payload is not used.
      return new AIMessage({ content: "INVALID_JSON" });
    }
    return new AIMessage({ content: "{}" });
  }
}

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: UnknownThenRetryFailChatOpenAI,
}));

describe("skill-direct unknown guard", () => {
  it("does not leak invalid first-pass payload when retry fails", async () => {
    const { graph } = await import("./graph");

    const first = (await graph.invoke({
      messages: [
        new HumanMessage({
          content: [
            "Create a complete 6-page static site for LC-CNC.",
            "Routes must include: / /company /products /news /cases /contact.",
            "Please provide a plan first.",
          ].join("\n"),
        }),
      ],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
    })) as any;

    const second = (await graph.invoke({
      ...first,
      messages: [...(first.messages || []), new HumanMessage({ content: "I confirm the plan. Start generation." })],
    })) as any;

    expect(second.project_json).toBeFalsy();
    expect(second.phase).toBe("conversation");
    const allTexts = (second.messages || []).map((m: any) => String(m?.content || ""));
    expect(allTexts.some((text: string) => text.includes("Skill-direct generation failed"))).toBe(true);
  });
});

