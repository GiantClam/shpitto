import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

describe("skill-native guardrail", () => {
  it("returns complete site artifacts without legacy unknown placeholders", async () => {
    const summary = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage("Create LC-CNC site with routes / and /contact.")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/contact"],
      } as any,
      timeoutMs: 60_000,
    });

    expect(summary.phase).toBe("end");
    const site = (summary.state as any)?.site_artifacts;
    expect(site).toBeTruthy();
    expect(site?.staticSite?.generation?.isComplete).toBe(true);

    const serialized = JSON.stringify(site);
    expect(serialized).not.toContain("<UNKNOWN>");
    expect(serialized).not.toContain("[object Object]");
  });
});

