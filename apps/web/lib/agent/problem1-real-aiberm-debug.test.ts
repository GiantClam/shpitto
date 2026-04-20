import { describe, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

describe("problem1 real aiberm debug", () => {
  it(
    "prints tail summary for diagnosis",
    async () => {
      const summary = await runSkillRuntimeExecutor({
        state: {
          messages: [new HumanMessage({ content: "Generate LC-CNC 6-page website." })],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
        } as any,
        timeoutMs: 180_000,
      });

      const state = summary.state as any;
      const tail = (state.messages || []).slice(-8).map((m: any) => ({
        type: m?.constructor?.name || "unknown",
        content: String(m?.content || "").slice(0, 600),
      }));

      console.log(
        "REAL_AIBERM_DEBUG_TAIL=" +
          JSON.stringify({
            phase: summary.phase,
            hasProject: !!state.site_artifacts,
            provider: state?.workflow_context?.lockedProvider || "unknown",
            model: state?.workflow_context?.lockedModel || "unknown",
            tail,
          }),
      );
    },
    600000,
  );
});

