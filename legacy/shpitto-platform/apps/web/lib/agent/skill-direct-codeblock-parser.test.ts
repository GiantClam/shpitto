import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

describe("skill-native file output", () => {
  it("generates shared css/js and page html files", async () => {
    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage("Generate website with routes / and /contact")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/contact"],
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.phase).toBe("end");
    expect(result.generatedFiles).toEqual(
      expect.arrayContaining(["/styles.css", "/script.js", "/index.html", "/contact/index.html"]),
    );
  });

  it("does not include /styles or /script as page routes", async () => {
    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [
          new HumanMessage(
            "Generate pages /, /about, /contact and include shared assets /styles.css and /script.js",
          ),
        ],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/about", "/contact"],
      } as any,
      timeoutMs: 60_000,
    });

    const pages = Array.isArray((result.state as any)?.site_artifacts?.pages)
      ? (result.state as any).site_artifacts.pages
      : [];
    const pagePaths = pages.map((p: any) => p?.path);
    expect(pagePaths).toEqual(expect.arrayContaining(["/", "/about", "/contact"]));
    expect(pagePaths).not.toContain("/styles");
    expect(pagePaths).not.toContain("/script");
  });
});

