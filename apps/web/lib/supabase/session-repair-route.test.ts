import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/auth/session/repair/route";
import { AUTH_CACHE_COOKIE_NAME } from "./auth-cache";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

describe("session repair route", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.getUser.mockReset();
    process.env.SHPITTO_AUTH_CACHE_SECRET = "test-secret";
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("creates the local auth cache from an existing Supabase session", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/auth/session/repair?next=%2Fprojects%2Fdemo%2Fchat"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/projects/demo/chat");
    expect(response.cookies.get(AUTH_CACHE_COOKIE_NAME)?.value).toBeTruthy();
  });

  it("falls back to login when Supabase session repair fails", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing" },
    });

    const response = await GET(
      new Request("http://localhost/auth/session/repair?next=%2Fprojects%2Fdemo%2Fchat"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fprojects%2Fdemo%2Fchat&reason=auth_cache_repair_failed",
    );
    expect(response.cookies.get(AUTH_CACHE_COOKIE_NAME)).toBeUndefined();
  });
});
