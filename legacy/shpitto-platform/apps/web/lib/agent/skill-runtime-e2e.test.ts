import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

describe("skill-runtime-e2e", () => {
  it("runs staged skill-native loop until completion and returns generated files", async () => {
    const { runSkillRuntimeExecutor } = await import("../skill-runtime/executor.ts");
    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage("Generate LC-CNC site with home and about pages.")],
        phase: "conversation",
        sitemap: ["/", "/about"],
        workflow_context: { genMode: "skill_native" },
      } as any,
      timeoutMs: 30_000,
    });

    expect(result.phase).toBe("end");
    expect(result.assistantText).toContain("Skill-native");
    expect(result.generatedFiles).toEqual(
      expect.arrayContaining(["/styles.css", "/script.js", "/index.html", "/about/index.html"]),
    );
    expect(result.completedPhases).toEqual(
      expect.arrayContaining(["task_plan", "findings", "design", "styles", "script", "index", "pages", "repair"]),
    );
  });
});
