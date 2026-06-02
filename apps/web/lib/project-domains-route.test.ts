import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/projects/[projectId]/domains/route";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
  listProjectCustomDomains: vi.fn(),
  resolveOwnedProjectRuntimeSummary: vi.fn(),
  getLatestChatTaskForChat: vi.fn(),
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

vi.mock("@/lib/agent/chat-task-store", () => ({
  getLatestChatTaskForChat: mocks.getLatestChatTaskForChat,
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
    mocks.getLatestChatTaskForChat.mockReset();
  });

  it("returns an empty domain payload for session-backed projects without D1 project rows", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.resolveOwnedProjectRuntimeSummary.mockResolvedValue({
      projectId: "chat-1",
      projectName: "Project One",
      deploymentHost: null,
      latestDeploymentUrl: null,
      source: "chat-session",
      contractHash: "b".repeat(64),
      generationLane: "website-generation-mvp",
      generationLaneConfig: { disableWebSearch: true, routePolicy: "default" },
      websiteSurfaceMode: "content-hub-site",
    });
    mocks.listProjectCustomDomains.mockResolvedValue([]);
    mocks.getLatestChatTaskForChat.mockResolvedValue({
      result: {
        internal: {
          sessionState: {
            workflow_context: {
              blogDetailFillCompleted: true,
              blogDetailFillStatus: "completed",
            },
          },
        },
      },
    });

    const response = await GET(new NextRequest("http://localhost/api/projects/chat-1/domains"), {
      params: Promise.resolve({ projectId: "chat-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.project.projectId).toBe("chat-1");
    expect(body.project.contractHash).toBe("b".repeat(64));
    expect(body.project.generationLane).toBe("website-generation-mvp");
    expect(body.project.generationLaneConfig).toEqual({ disableWebSearch: true, routePolicy: "default" });
    expect(body.project.websiteSurfaceMode).toBe("content-hub-site");
    expect(body.domains).toEqual([]);
    expect(body.blogDetailFillRequired).toBe(false);
    expect(body.blogDetailFillCompleted).toBe(true);
    expect(body.blogDetailFillStatus).toBe("completed");
  });

  it("exposes blog-detail-fill gate state on GET before domain binding", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.resolveOwnedProjectRuntimeSummary.mockResolvedValue({
      projectId: "chat-1",
      projectName: "Project One",
      deploymentHost: "demo.pages.dev",
      latestDeploymentUrl: "https://demo.pages.dev",
      source: "chat-session",
      contractHash: "c".repeat(64),
      generationLane: "website-generation-mvp",
      generationLaneConfig: { disableWebSearch: true, routePolicy: "default" },
      websiteSurfaceMode: "content-hub-site",
    });
    mocks.listProjectCustomDomains.mockResolvedValue([]);
    mocks.getLatestChatTaskForChat.mockResolvedValue({
      result: {
        internal: {
          sessionState: {
            workflow_context: {
              blogDetailFillCompleted: false,
              blogDetailFillStatus: "pending",
            },
          },
        },
      },
    });

    const response = await GET(new NextRequest("http://localhost/api/projects/chat-1/domains"), {
      params: Promise.resolve({ projectId: "chat-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.contractHash).toBe("c".repeat(64));
    expect(body.project.generationLane).toBe("website-generation-mvp");
    expect(body.project.websiteSurfaceMode).toBe("content-hub-site");
    expect(body.blogDetailFillRequired).toBe(true);
    expect(body.blogDetailFillCompleted).toBe(false);
    expect(body.blogDetailFillStatus).toBe("pending");
  });

  it("blocks custom domain binding until blog detail fill completes", async () => {
    const { POST } = await import("../app/api/projects/[projectId]/domains/route");

    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.resolveOwnedProjectRuntimeSummary.mockResolvedValue({
      projectId: "chat-1",
      projectName: "Project One",
      deploymentHost: "demo.pages.dev",
      latestDeploymentUrl: "https://demo.pages.dev",
      source: "chat-session",
      contractHash: "d".repeat(64),
      generationLane: "website-generation-mvp",
      generationLaneConfig: { disableWebSearch: true, routePolicy: "default" },
      websiteSurfaceMode: "content-hub-site",
    });
    mocks.getLatestChatTaskForChat.mockResolvedValue({
      result: {
        internal: {
          sessionState: {
            workflow_context: {
              blogDetailFillCompleted: false,
              blogDetailFillStatus: "pending",
            },
          },
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/projects/chat-1/domains", {
        method: "POST",
        body: JSON.stringify({ hostname: "www.example.com" }),
      }),
      { params: Promise.resolve({ projectId: "chat-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("blog_detail_fill_required");
  });
});
