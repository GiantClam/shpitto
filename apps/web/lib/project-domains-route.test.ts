import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/projects/[projectId]/domains/route";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
  listProjectCustomDomains: vi.fn(),
  resolveOwnedProjectRuntimeSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/route-user", () => ({
  getAuthenticatedRouteUserId: mocks.getAuthenticatedRouteUserId,
}));

vi.mock("@/lib/agent/db", () => ({
  deleteProjectCustomDomain: vi.fn(),
  listProjectCustomDomains: mocks.listProjectCustomDomains,
  upsertProjectCustomDomain: vi.fn(),
}));

vi.mock("@/lib/project-runtime-summary", () => ({
  resolveOwnedProjectRuntimeSummary: mocks.resolveOwnedProjectRuntimeSummary,
}));

vi.mock("@/lib/project-web-analytics", () => ({
  provisionProjectWebAnalyticsSite: vi.fn(),
}));

vi.mock("@/lib/billing/enforcement", () => ({
  BillingAccessError: class BillingAccessError extends Error {
    status = 403;
    code = "mock";
  },
  assertCanMutatePublishedSite: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  CloudflareClient: class {
    isConfigured() {
      return false;
    }
  },
}));

describe("project domains route", () => {
  beforeEach(() => {
    mocks.getAuthenticatedRouteUserId.mockReset();
    mocks.listProjectCustomDomains.mockReset();
    mocks.resolveOwnedProjectRuntimeSummary.mockReset();
  });

  it("returns an empty domain payload for session-backed projects without D1 project rows", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.resolveOwnedProjectRuntimeSummary.mockResolvedValue({
      projectId: "chat-1",
      projectName: "Project One",
      deploymentHost: null,
      latestDeploymentUrl: null,
      source: "chat-session",
    });
    mocks.listProjectCustomDomains.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/projects/chat-1/domains"), {
      params: Promise.resolve({ projectId: "chat-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.project.projectId).toBe("chat-1");
    expect(body.domains).toEqual([]);
  });
});
