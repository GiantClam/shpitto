import { describe, expect, it } from "vitest";
import {
  getWorkspaceProjectRouteIdCandidates,
  normalizePreferredWorkspaceProjectRouteId,
  normalizeWorkspaceProjectRouteId,
} from "./project-route-id";

describe("project-route-id", () => {
  it("keeps canonical chat ids unchanged", () => {
    expect(normalizeWorkspaceProjectRouteId("chat-1779331037521-abcd12")).toBe("chat-1779331037521-abcd12");
    expect(normalizePreferredWorkspaceProjectRouteId("chat-1779331037521-abcd12")).toBe("chat-1779331037521-abcd12");
  });

  it("extracts canonical ids from malformed workspace-prefixed ids", () => {
    expect(getWorkspaceProjectRouteIdCandidates("analysis-1779331037521")).toEqual([
      "analysis-1779331037521",
      "1779331037521",
    ]);
    expect(normalizePreferredWorkspaceProjectRouteId("analysis-1779331037521")).toBe("1779331037521");
    expect(normalizePreferredWorkspaceProjectRouteId("settings-chat-1779331037521-abcd12")).toBe(
      "chat-1779331037521-abcd12",
    );
  });

  it("does not strip human-readable ids that only happen to start with a workspace prefix", () => {
    expect(getWorkspaceProjectRouteIdCandidates("analysis-dashboard")).toEqual(["analysis-dashboard"]);
    expect(normalizePreferredWorkspaceProjectRouteId("analysis-dashboard")).toBe("analysis-dashboard");
  });
});
