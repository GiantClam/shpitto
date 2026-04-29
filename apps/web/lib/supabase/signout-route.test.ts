import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../app/auth/signout/route";
import { AUTH_CACHE_COOKIE_NAME } from "./auth-cache";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

describe("signout route", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.signOut.mockReset();
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
  });

  it("does not sign out on GET requests", async () => {
    const response = await GET(new Request("http://localhost/auth/signout"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out on POST requests", async () => {
    const response = await POST(new Request("http://localhost/auth/signout", { method: "POST" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.cookies.get(AUTH_CACHE_COOKIE_NAME)?.value).toBe("");
  });
});
