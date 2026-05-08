import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOptionalServerUser } from "./optional-user";

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

describe("getOptionalServerUser", () => {
  beforeEach(() => {
    mocks.getCachedAuthUser.mockReset();
    mocks.createClient.mockReset();
  });

  it("returns null when the auth cache is missing", async () => {
    mocks.getCachedAuthUser.mockResolvedValue(null);
    mocks.createClient.mockRejectedValue(new Error("missing env"));

    await expect(getOptionalServerUser()).resolves.toBeNull();
  });

  it("returns the cached user without querying Supabase Auth", async () => {
    const user = { id: "user-1", email: "u@example.com" };
    mocks.getCachedAuthUser.mockResolvedValue(user);

    await expect(getOptionalServerUser()).resolves.toEqual(user);
  });

  it("falls back to Supabase Auth when the cache is missing", async () => {
    mocks.getCachedAuthUser.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "user-2", email: "supabase@example.com" },
          },
        }),
      },
    });

    await expect(getOptionalServerUser()).resolves.toEqual({
      id: "user-2",
      email: "supabase@example.com",
    });
  });
});
