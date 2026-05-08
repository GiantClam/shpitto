import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
  listProjectAuthUsersByProject: vi.fn(),
}));

vi.mock("@/lib/supabase/route-user", () => ({
  getAuthenticatedRouteUserId: mocks.getAuthenticatedRouteUserId,
}));

vi.mock("@/lib/agent/db", () => ({
  listProjectAuthUsersByProject: mocks.listProjectAuthUsersByProject,
}));

describe("project auth users route", () => {
  beforeEach(() => {
    mocks.getAuthenticatedRouteUserId.mockReset();
    mocks.listProjectAuthUsersByProject.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue(undefined);

    const response = await GET(new NextRequest("http://localhost/api/projects/demo/auth-users"), {
      params: Promise.resolve({ projectId: "demo" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.listProjectAuthUsersByProject).not.toHaveBeenCalled();
  });

  it("returns auth users for the current project owner", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.listProjectAuthUsersByProject.mockResolvedValue([
      {
        id: "row-1",
        projectId: "demo",
        siteKey: "sp_demo",
        authUserId: "auth-1",
        email: "user@example.com",
        emailVerified: true,
        lastEvent: "signup",
        signupCount: 1,
        loginCount: 0,
        verificationCount: 0,
        passwordResetCount: 0,
        firstSeenAt: "2026-05-01T00:00:00.000Z",
        lastSeenAt: "2026-05-02T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/projects/demo/auth-users?limit=25&offset=8"),
      {
        params: Promise.resolve({ projectId: "demo" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(mocks.listProjectAuthUsersByProject).toHaveBeenCalledWith("user-1", "demo", 25, 8);
  });
});
