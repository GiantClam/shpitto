import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOptionalServerUser } from "./optional-user";

const mocks = vi.hoisted(() => ({
  getCachedAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabase/auth-cache", () => ({
  getCachedAuthUser: mocks.getCachedAuthUser,
}));

describe("getOptionalServerUser", () => {
  beforeEach(() => {
    mocks.getCachedAuthUser.mockReset();
  });

  it("returns null when the auth cache is missing", async () => {
    mocks.getCachedAuthUser.mockResolvedValue(null);

    await expect(getOptionalServerUser()).resolves.toBeNull();
  });

  it("returns the cached user without querying Supabase Auth", async () => {
    const user = { id: "user-1", email: "u@example.com" };
    mocks.getCachedAuthUser.mockResolvedValue(user);

    await expect(getOptionalServerUser()).resolves.toEqual(user);
  });
});
