import { describe, expect, it } from "vitest";
import { buildSkillToolSystemInstructions, handleSkillToolCall } from "./skill-tool-registry";

describe("skill-tool-registry", () => {
  it("routes publicly researchable gaps through web_search guidance", () => {
    const instructions = buildSkillToolSystemInstructions();

    expect(instructions).toContain("web_search");
    expect(instructions).toContain("publicly researchable gaps");
    expect(instructions).toContain("Evidence Brief");
  });

  it("loads allowed skill content", async () => {
    const result = await handleSkillToolCall(
      { name: "load_skill", args: { skill_id: "website-generation-workflow" } },
      { loadedSkills: new Map(), maxSkillChars: 1200 },
    );

    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.skillId).toBe("website-generation-workflow");
      expect(result.toolResult).toContain("skill:website-generation-workflow");
    }
  });

  it("normalizes emitted file path", async () => {
    const result = await handleSkillToolCall(
      { name: "emit_file", args: { path: "index.html", content: "<html></html>" } },
      { loadedSkills: new Map() },
    );

    expect(result.kind).toBe("file");
    if (result.kind === "file") {
      expect(result.file.path).toBe("/index.html");
      expect(result.file.type).toBe("text/html");
    }
  });

  it("rejects skill outside bundle", async () => {
    await expect(
      handleSkillToolCall(
        { name: "load_skill", args: { skill_id: "website-refinement-workflow" } },
        { loadedSkills: new Map() },
      ),
    ).rejects.toThrow("not allowed");
  });

  it("loads website seed skill by frontmatter name", async () => {
    const result = await handleSkillToolCall(
      { name: "load_skill", args: { skill_id: "web-prototype" } },
      { loadedSkills: new Map(), maxSkillChars: 1200 },
    );

    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.skillId).toBe("open-design-web-prototype");
      expect(result.toolResult).toContain("Website Skill Contract");
    }
  });

  it("supports web_search via serper tool", async () => {
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevFetch = globalThis.fetch;
    try {
      process.env.SERPER_API_KEY = "test-serper-key";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            organic: [
              {
                title: "Test Result",
                link: "https://example.com",
                snippet: "example snippet",
              },
            ],
          }),
          { status: 200 },
        )) as any;

      const result = await handleSkillToolCall(
        { name: "web_search", args: { query: "test query", num: 1 } },
        { loadedSkills: new Map() },
      );

      expect(result.kind).toBe("search");
      if (result.kind === "search") {
        expect(result.query).toBe("test query");
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.sources[0]?.url).toContain("https://example.com");
      }
    } finally {
      if (prevSerperKey === undefined) {
        delete process.env.SERPER_API_KEY;
      } else {
        process.env.SERPER_API_KEY = prevSerperKey;
      }
      globalThis.fetch = prevFetch;
    }
  });
});
