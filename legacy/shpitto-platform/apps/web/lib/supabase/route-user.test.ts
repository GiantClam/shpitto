import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedRouteUserId } from "./route-user";

const mocks = vi.hoisted(() => ({
  getCachedAuthUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth-cache", () => ({
  getCachedAuthUser: mocks.getCachedAuthUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

describe("getAuthenticatedRouteUserId", () => {
  beforeEach(() => {
    mocks.getCachedAuthUser.mockReset();
    mocks.createClient.mockReset();
  });

  it("returns undefined when the auth cache is missing", async () => {
    mocks.getCachedAuthUser.mockResolvedValue(null);

    await expect(getAuthenticatedRouteUserId()).resolves.toBeUndefined();
  });

  it("returns undefined when the cached user id is blank", async () => {
    mocks.getCachedAuthUser.mockResolvedValue({ id: "   ", email: "u@example.com" });

    await expect(getAuthenticatedRouteUserId()).resolves.toBeUndefined();
  });

  it("returns user id from the local auth cache", async () => {
    mocks.getCachedAuthUser.mockResolvedValue({ id: "user-1", email: "u@example.com" });

    await expect(getAuthenticatedRouteUserId()).resolves.toBe("user-1");
  });

  it("prefers the local auth cache before Supabase session lookup", async () => {
    mocks.getCachedAuthUser.mockResolvedValue({ id: "user-cache", email: "u@example.com" });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-remote" } },
        }),
      },
    });

    await expect(getAuthenticatedRouteUserId()).resolves.toBe("user-cache");
  });

  it("falls back to undefined when both auth sources are missing", async () => {
    mocks.getCachedAuthUser.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    await expect(getAuthenticatedRouteUserId()).resolves.toBeUndefined();
  });
});
