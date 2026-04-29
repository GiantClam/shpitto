import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/auth/password/route";
import { AUTH_CACHE_COOKIE_NAME } from "./auth-cache";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

function passwordRequest(body: unknown) {
  return new NextRequest("http://localhost/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("password auth route", () => {
  beforeEach(() => {
    mocks.createServerClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("sets Supabase cookies on successful email password login", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        signInWithPassword: vi.fn(async () => {
          options.cookies.setAll([
            {
              name: "sb-example-auth-token",
              value: "token",
              options: { path: "/", httpOnly: true, sameSite: "lax" },
            },
          ]);
          return {
            data: { user: { id: "user-1", email: "qa@example.com" } },
            error: null,
          };
        }),
      },
    }));

    const response = await POST(passwordRequest({ email: "qa@example.com", password: "secret" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("token");
    expect(response.cookies.get(AUTH_CACHE_COOKIE_NAME)?.value).toBeTruthy();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("returns a 400 without calling Supabase when credentials are missing", async () => {
    const response = await POST(passwordRequest({ email: "qa@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "Email and password are required." });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("returns Supabase auth errors without setting a session cookie", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          error: { message: "Invalid login credentials" },
        })),
      },
    });

    const response = await POST(passwordRequest({ email: "qa@example.com", password: "wrong" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "Invalid login credentials" });
    expect(response.cookies.get("sb-example-auth-token")).toBeUndefined();
    expect(response.cookies.get(AUTH_CACHE_COOKIE_NAME)).toBeUndefined();
  });
});
