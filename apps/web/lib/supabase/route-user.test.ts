import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedRouteUserId } from "./route-user";

const mocks = vi.hoisted(() => ({
  getCachedAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabase/auth-cache", () => ({
  getCachedAuthUser: mocks.getCachedAuthUser,
}));

describe("getAuthenticatedRouteUserId", () => {
  beforeEach(() => {
    mocks.getCachedAuthUser.mockReset();
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
});
