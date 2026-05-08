import { describe, expect, it } from "vitest";
import { buildSkillToolSystemInstructions, handleSkillToolCall } from "./skill-tool-registry";

function payloadPrefix(toolResult: string, lines = 24): string {
  return String(toolResult || "")
    .split("\n")
    .slice(0, lines)
    .join("\n")
    .trimEnd();
}

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

  it("locks the workflow load_skill payload prefix with a snapshot", async () => {
    const result = await handleSkillToolCall(
      { name: "load_skill", args: { skill_id: "website-generation-workflow" } },
      { loadedSkills: new Map(), maxSkillChars: 700 },
    );

    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(payloadPrefix(result.toolResult)).toMatchInlineSnapshot(`
        "# skill:website-generation-workflow
        
        
        
        ---
        name: "website-generation-workflow"
        description: "Defines the end-to-end website generation workflow. Invoke when generating multi-section pages or full websites."
        ---
        
        # Website Generation Workflow
        
        ## Skill Relationship (Authoritative)
        
        - This skill is the **orchestrator** for end-to-end website generation.
        - \`design-website-generator\` is the **executor** skill/tooling surface for concrete generation, context building, and QA execution.
        - When both are available, this workflow decides phases and delegates implementation slices to \`design-website-generator\`.
        
        ## Scope
        
        Use this workflow for c
        
        [truncated due to context budget]"
      `);
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

  it("locks the website seed load_skill payload prefix with a snapshot", async () => {
    const result = await handleSkillToolCall(
      { name: "load_skill", args: { skill_id: "web-prototype" } },
      { loadedSkills: new Map(), maxSkillChars: 700 },
    );

    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(payloadPrefix(result.toolResult)).toMatchInlineSnapshot(`
        "# skill:open-design-web-prototype
        
        ## Website Skill Contract
        - Skill: web-prototype (open-design-web-prototype).
        - Allowed mode: website only.
        - Responsive target: responsive. Output must work in desktop and mobile previews.
        - Scenario: design.
        - Preview entry: index.html.
        - A local design system reference must be applied before emitting final HTML/CSS.
        - Required design-system sections: color, typography, layout, components.
        
        ## Seed Resource Index
        - assets/template.html: reusable HTML seed; tokens --bg, --surface, --fg, --muted, --border, --accent, --accent-soft, --fg-soft, --font-display, --font-body, --font-mono, --fs-h1; key classes container, section, topnav, pagefoot, grid-2, grid-3, grid-4, card, btn, ph-img; responsive collapse at 920px
        - references/checklist.md: self-review gates; P0=10; P1=8; P2=4; critical checks No raw hex outside \`:root\` token block.; All headings use \`var(--font-display)\`.; Accent appears at most twice per screen.; No purple/violet gradient backgrounds.; No emoji used as feature icons.; No invented metrics.
        
        ---
        name: web-prototype
        description: |
          General-purpose desktop web prototype. Single self-contained HTML file built
          by copying the seed \`assets/template.html\` and pasting section layouts from
          \`references/layouts.md\`. Default for any landing / marketing / docs / SaaS
          page when no more specific skill matches.
        triggers:
          - "prototype""
      `);
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
