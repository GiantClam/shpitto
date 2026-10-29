import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "../app/api/projects/[projectId]/settings/route";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
  getProjectContactSettings: vi.fn(),
  updateProjectContactSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/route-user", () => ({
  getAuthenticatedRouteUserId: mocks.getAuthenticatedRouteUserId,
}));

vi.mock("@/lib/project-settings", () => ({
  getProjectContactSettings: mocks.getProjectContactSettings,
  updateProjectContactSettings: mocks.updateProjectContactSettings,
}));

describe("project settings route", () => {
  beforeEach(() => {
    mocks.getAuthenticatedRouteUserId.mockReset();
    mocks.getProjectContactSettings.mockReset();
    mocks.updateProjectContactSettings.mockReset();
  });

  it("rejects unauthenticated settings reads", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue(undefined);

    const response = await GET(new NextRequest("http://localhost/api/projects/demo/settings"), {
      params: Promise.resolve({ projectId: "demo" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.getProjectContactSettings).not.toHaveBeenCalled();
  });

  it("returns project contact settings", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.getProjectContactSettings.mockResolvedValue({
      forwardTo: ["official@example.com"],
      sendUserAck: true,
      replyToField: "email",
      brandName: "CASUX",
    });

    const response = await GET(new NextRequest("http://localhost/api/projects/demo/settings"), {
      params: Promise.resolve({ projectId: "demo" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.settings.forwardTo).toEqual(["official@example.com"]);
    expect(mocks.getProjectContactSettings).toHaveBeenCalledWith("demo", "user-1");
  });

  it("normalizes malformed workspace-prefixed project ids", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.getProjectContactSettings.mockResolvedValue({
      forwardTo: ["official@example.com"],
      sendUserAck: true,
      replyToField: "email",
      brandName: "CASUX",
    });

    const response = await GET(new NextRequest("http://localhost/api/projects/analysis-1779331037521/settings"), {
      params: Promise.resolve({ projectId: "analysis-1779331037521" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getProjectContactSettings).toHaveBeenCalledWith("1779331037521", "user-1");
  });

  it("updates project contact settings", async () => {
    mocks.getAuthenticatedRouteUserId.mockResolvedValue("user-1");
    mocks.updateProjectContactSettings.mockResolvedValue({
      forwardTo: ["official@example.com", "ops@example.com"],
      sendUserAck: false,
      replyToField: "email",
      brandName: "CASUX",
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/projects/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            forwardTo: "official@example.com, ops@example.com",
            sendUserAck: false,
          },
        }),
      }),
      {
        params: Promise.resolve({ projectId: "demo" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.updateProjectContactSettings).toHaveBeenCalledWith({
      projectId: "demo",
      userId: "user-1",
      forwardTo: "official@example.com, ops@example.com",
      sendUserAck: false,
      replyToField: undefined,
      brandName: undefined,
    });
  });
});
