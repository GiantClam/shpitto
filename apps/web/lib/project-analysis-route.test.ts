import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/projects/[projectId]/analysis/route";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
  getD1Client: vi.fn(),
  getProjectAnalyticsBinding: vi.fn(),
  resolveOwnedProjectRuntimeSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/route-user", () => ({
  getAuthenticatedRouteUserId: mocks.getAuthenticatedRouteUserId,
}));

vi.mock("@/lib/d1", () => ({
  getD1Client: mocks.getD1Client,
}));

vi.mock("@/lib/agent/db", () => ({
  getProjectAnalyticsBinding: mocks.getProjectAnalyticsBinding,
  upsertProjectSiteBinding: vi.fn(),
}));

vi.mock("@/lib/project-runtime-summary", () => ({
  resolveOwnedProjectRuntimeSummary: mocks.resolveOwnedProjectRuntimeSummary,
}));

vi.mock("@/lib/cloudflare", () => ({
  CloudflareClient: class {},
}));

describe("project analysis route", () => {
  beforeEach(() => {
    mocks.getAuthenticatedRouteUserId.mockReset();
    mocks.getD1Client.mockReset();
    mocks.getProjectAnalyticsBinding.mockReset();
    mocks.resolveOwnedProjectRuntimeSummary.mockReset();
    mocks.getD1Client.mockReturnValue({ isConfigured: () => true });
  });

  it("returns a pending empty payload for session-backed projects without D1 analytics bindings", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.resolveOwnedProjectRuntimeSummary.mockResolvedValue({
      projectId: "chat-1",
      projectName: "Project One",
      deploymentHost: null,
      latestDeploymentUrl: null,
      source: "chat-session",
      contractHash: "a".repeat(64),
      generationLane: "website-generation-mvp",
      generationLaneConfig: { disableWebSearch: true, routePolicy: "default" },
      websiteSurfaceMode: "content-hub-site",
    });
    mocks.getProjectAnalyticsBinding.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/projects/chat-1/analysis"), {
      params: Promise.resolve({ projectId: "chat-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.project.id).toBe("chat-1");
    expect(body.project.contractHash).toBe("a".repeat(64));
    expect(body.project.generationLane).toBe("website-generation-mvp");
    expect(body.project.generationLaneConfig).toEqual({ disableWebSearch: true, routePolicy: "default" });
    expect(body.project.websiteSurfaceMode).toBe("content-hub-site");
    expect(body.analytics.status).toBe("pending");
    expect(body.warning).toContain("Analytics will become available");
  });
});
