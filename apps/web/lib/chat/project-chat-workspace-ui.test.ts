import { describe, expect, it } from "vitest";
import { shouldSuppressOptimisticTimelineEcho } from "../../components/chat/ProjectChatWorkspace";

describe("ProjectChatWorkspace timeline actions", () => {
  it("does not append optimistic echo messages for timeline card actions", () => {
    expect(shouldSuppressOptimisticTimelineEcho({ source: "timeline-action" })).toBe(true);
  });

  it("keeps optimistic echo messages for normal prompt submissions", () => {
    expect(shouldSuppressOptimisticTimelineEcho({ source: "prompt" })).toBe(false);
    expect(shouldSuppressOptimisticTimelineEcho()).toBe(false);
  });
});
