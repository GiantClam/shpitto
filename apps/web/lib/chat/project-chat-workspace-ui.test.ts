import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { ensureVisibleWorkspaceProjects } from "../../components/chat/project-workspace-context";
import { buildDomainGuidanceCardMetadata } from "../../components/chat/project-domain-ui";
import {
  blogDetailFillCardCopy,
  deriveWorkspacePreTaskState,
  formatQaSummaryDetail,
  recoverHistoryAfterSubmitFailure,
  shouldRecoverFromSubmitFailure,
  shouldSuppressOptimisticTimelineEcho,
  summarizeGenerationRuntimeBadges,
  summarizePromptDraftCard,
  summarizeRequirementCardDesignLine,
  toReadableStage,
} from "../../components/chat/ProjectChatWorkspace";

describe("ProjectChatWorkspace timeline actions", () => {
  it("does not append optimistic echo messages for timeline card actions", () => {
    expect(shouldSuppressOptimisticTimelineEcho({ source: "timeline-action" })).toBe(true);
  });

  it("recovers submit failures when history already contains the submitted message and follow-up assistant output", () => {
    expect(
      shouldRecoverFromSubmitFailure({
        submittedText: "Requirement form submitted:\n[Requirement Form]\n```json\n{\"siteType\":\"company\"}\n```",
        history: {
          ok: true,
          messages: [
            { id: "1", role: "user", text: "Earlier message", createdAt: 1 },
            {
              id: "2",
              role: "user",
              text: "Requirement form submitted:\n[Requirement Form]\n```json\n{\"siteType\":\"company\"}\n```",
              createdAt: 2,
            },
            {
              id: "3",
              role: "assistant",
              text: "Prompt Draft generated with LLM. You can add details or confirm generation.",
              createdAt: 3,
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("does not recover submit failures when history does not confirm progress for the submitted text", () => {
    expect(
      shouldRecoverFromSubmitFailure({
        submittedText: "Fresh requirement form",
        history: {
          ok: true,
          messages: [
            { id: "1", role: "user", text: "Older requirement form", createdAt: 1 },
            { id: "2", role: "assistant", text: "Older prompt draft", createdAt: 2 },
          ],
        },
      }),
    ).toBe(false);
  });

  it("retries history recovery when submit progress lands after the first failed fetch window", async () => {
    const fetchHistory = vi
      .fn<Parameters<typeof recoverHistoryAfterSubmitFailure>[0]["fetchHistory"]>()
      .mockResolvedValueOnce({
        ok: true,
        messages: [{ id: "1", role: "user", text: "Earlier message", createdAt: 1 }],
      })
      .mockResolvedValueOnce({
        ok: true,
        messages: [
          {
            id: "2",
            role: "user",
            text: "Requirement form submitted:\n[Requirement Form]\n```json\n{\"siteType\":\"company\"}\n```",
            createdAt: 2,
          },
          {
            id: "3",
            role: "assistant",
            text: "Prompt Draft generated with LLM. You can add details or confirm generation.",
            createdAt: 3,
          },
        ],
      });
    const wait = vi.fn(async () => {});

    const recovered = await recoverHistoryAfterSubmitFailure({
      chatId: "chat-1",
      submittedText: "Requirement form submitted:\n[Requirement Form]\n```json\n{\"siteType\":\"company\"}\n```",
      fetchHistory,
      attempts: 2,
      delayMs: 1,
      wait,
    });

    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(recovered?.messages?.at(-1)?.text).toContain("Prompt Draft generated");
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
        supportedLocales: ["en"],
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

  it("summarizes generation lane and surface badges for workspace headers", () => {
    expect(
      summarizeGenerationRuntimeBadges(
        {
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "content-hub-site",
        },
        "en",
      ),
    ).toEqual(["MVP lane", "Content hub"]);

    expect(
      summarizeGenerationRuntimeBadges(
        {
          generationLane: "legacy",
          promptControlManifest: { websiteSurfaceMode: "docs-knowledge-site" },
        },
        "zh",
      ),
    ).toEqual(["旧链路", "文档站"]);
  });

  it("uses a current-project fallback instead of an empty project list", () => {
    const visible = ensureVisibleWorkspaceProjects([], "chat-123", "Current Project");

    expect(visible).toEqual([
      expect.objectContaining({
        id: "chat-123",
        title: "Current Project",
      }),
    ]);
  });

  it("describes requirement collection before any task has started", () => {
    const state = deriveWorkspacePreTaskState(
      [
        {
          metadata: {
            cardType: "requirement_form",
          },
        },
      ],
      "en",
    );

    expect(state.stageText).toBe("Collecting required information");
    expect(state.previewHint).toContain("Prompt Draft");
  });

  it("describes prompt confirmation before the first preview exists", () => {
    const state = deriveWorkspacePreTaskState(
      [
        {
          metadata: {
            cardType: "confirm_generate",
          },
        },
      ],
      "en",
    );

    expect(state.stageText).toBe("Waiting for Prompt Draft confirmation");
    expect(state.previewHint).toContain("Confirm the Prompt Draft");
  });

  it("does not emit a placeholder stage label when no task stage exists", () => {
    expect(toReadableStage(undefined, "en")).toBe("");
  });

  it("builds reusable domain guidance metadata from a bound domain and deployment host", () => {
    const metadata = buildDomainGuidanceCardMetadata({
      locale: "en",
      deploymentHost: "shpitto-chat-1778638147239-yoh11u-930d5607-4.pages.dev",
      deployedUrl: "https://shpitto-chat-1778638147239-yoh11u-930d5607-4.pages.dev",
      hostname: "snapsclean.com",
    });

    expect(metadata.cardType).toBe("domain_guidance");
    expect(String(metadata.summary || "")).toContain("snapsclean.com");
    expect(Array.isArray(metadata.dnsRecords)).toBe(true);
    expect((metadata.dnsRecords as Array<Record<string, string>>)[0]).toEqual(
      expect.objectContaining({
        type: "CNAME",
        host: "www",
        value: "shpitto-chat-1778638147239-yoh11u-930d5607-4.pages.dev",
      }),
    );
  });

  it("returns dedicated copy for the blog-detail-fill gate card", () => {
    expect(blogDetailFillCardCopy("en")).toEqual(
      expect.objectContaining({
        titleFallback: "Fill Blog Details First",
        buttonLabel: "Fill Blog Details Now",
      }),
    );
    expect(blogDetailFillCardCopy("zh")).toEqual(
      expect.objectContaining({
        titleFallback: "先补全 Blog Detail",
        buttonLabel: "立即补全 Blog Detail",
      }),
    );
  });
});
