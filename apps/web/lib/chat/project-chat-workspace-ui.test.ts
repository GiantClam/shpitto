import { describe, expect, it } from "vitest";
import {
  formatQaSummaryDetail,
  shouldSuppressOptimisticTimelineEcho,
  summarizePromptDraftCard,
  summarizeRequirementCardDesignLine,
} from "../../components/chat/ProjectChatWorkspace";

describe("ProjectChatWorkspace timeline actions", () => {
  it("does not append optimistic echo messages for timeline card actions", () => {
    expect(shouldSuppressOptimisticTimelineEcho({ source: "timeline-action" })).toBe(true);
  });

  it("keeps optimistic echo messages for normal prompt submissions", () => {
    expect(shouldSuppressOptimisticTimelineEcho({ source: "prompt" })).toBe(false);
    expect(shouldSuppressOptimisticTimelineEcho()).toBe(false);
  });

  it("formats qa summary detail for timeline cards", () => {
    expect(
      formatQaSummaryDetail(
        {
          averageScore: 91,
          totalRoutes: 5,
          passedRoutes: 5,
          totalRetries: 3,
          retriesAllowed: 3,
          antiSlopIssueCount: 4,
          categories: [
            { code: "nav-scaffold-copy", count: 2, severity: "warning" },
            { code: "footer-scaffold-copy", count: 1, severity: "warning" },
          ],
        },
        "en",
      ),
    ).toContain("QA 91");
    expect(
      formatQaSummaryDetail(
        {
          averageScore: 91,
          totalRoutes: 5,
          passedRoutes: 5,
          totalRetries: 3,
          retriesAllowed: 3,
          antiSlopIssueCount: 4,
          categories: [
            { code: "nav-scaffold-copy", count: 2, severity: "warning" },
            { code: "footer-scaffold-copy", count: 1, severity: "warning" },
          ],
        },
        "en",
      ),
    ).toContain("3 retries");
    expect(formatQaSummaryDetail(null, "en")).toBe("");
  });

  it("condenses the requirement card design summary into one short line", () => {
    const line = summarizeRequirementCardDesignLine(
      {
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        contentSources: ["new_site"],
        primaryVisualDirection: "modern-minimal",
        secondaryVisualTags: ["tech", "warm", "luxury", "playful"],
        pageStructure: { mode: "single", planning: "manual", pages: [] },
        functionalRequirements: ["contact_form"],
        primaryGoal: ["lead_generation"],
        language: "en",
        brandLogo: { mode: "none" },
        customNotes: "",
        designSystemInspiration: {
          id: "aceternity-ui",
          title: "Aceternity UI",
          category: "Website Inspiration",
          summary: "Bold marketing components with dark surfaces and layered gradients.",
          swatches: [],
          sourcePath: "/tmp/aceternity-ui.md",
          source: "cache",
        },
      },
      [],
      "en",
    );

    expect(line).toContain("Design theme:");
    expect(line).toContain("Modern minimal / Linear");
    expect(line).toContain("Technology-driven, Warm and approachable +2");
    expect(line).not.toContain("Design system inspiration");
    expect(line).not.toContain("Premium");
    expect(line).not.toContain("Playful and youthful");
  });

  it("renders a user-readable prompt draft summary instead of the raw canonical prompt", () => {
    const summary = summarizePromptDraftCard(
      {
        canonicalPrompt: "# Canonical Website Generation Prompt\n\nInternal machine-readable content...",
        researchSummary:
          "Translate the founder notes into a calm bilingual AI practice blog that emphasizes prompt craft and editorial review.",
        requirementSpec: {
          siteType: "company",
          targetAudience: ["enterprise_buyers", "developers"],
          primaryGoal: ["lead_generation"],
          locale: "bilingual",
          primaryVisualDirection: "modern-minimal",
          secondaryVisualTags: ["tech", "warm", "luxury"],
          pages: ["home", "blog", "contact"],
          designSystemInspiration: { title: "Aceternity UI" },
          customNotes: "Use the founder notes as article direction and keep the tone calm.",
          deployment: { provider: "cloudflare", requested: true },
        },
        promptControlManifest: {
          routes: ["/", "/blog", "/contact"],
          pageIntents: [
            { route: "/", navLabel: "Home" },
            { route: "/blog", navLabel: "Blog" },
            { route: "/contact", navLabel: "Contact" },
          ],
        },
      },
      "en",
    );

    expect(summary).toContain("**Website brief**");
    expect(summary).toContain("Type: Company website");
    expect(summary).toContain("Audience and goal: Enterprise buyers, Developers · Lead generation");
    expect(summary).toContain("Pages: Home, Blog, Contact");
    expect(summary).toContain("Language: Chinese and English");
    expect(summary).toContain("Visual direction: Modern minimal / Linear");
    expect(summary).toContain("Warm and approachable +1");
    expect(summary).not.toContain("Aceternity UI");
    expect(summary).toContain("Deployment target: shpitto server");
    expect(summary).not.toContain("cloudflare");
    expect(summary).not.toContain("Canonical Website Generation Prompt");
  });
});
