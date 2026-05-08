import { describe, expect, it } from "vitest";
import { formatQaSummaryDetail, shouldSuppressOptimisticTimelineEcho } from "../../components/chat/ProjectChatWorkspace";

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
});
