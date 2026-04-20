import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

describe("skill-native timeout surface", () => {
  it("produces completed artifacts under test runtime without hanging", async () => {
    const started = Date.now();
    const summary = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage("Generate LC-CNC site. Include routes /, /about, /contact.")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/about", "/contact"],
      } as any,
      timeoutMs: 90_000,
    });

    expect(summary.phase).toBe("end");
    expect(summary.generatedFiles).toEqual(
      expect.arrayContaining(["/styles.css", "/script.js", "/index.html", "/about/index.html", "/contact/index.html"]),
    );
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});

