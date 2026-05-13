import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hasAuthCacheCookie, hasSupabaseAuthCookie, updateSession } from "./middleware";

describe("supabase middleware", () => {
  it("detects Supabase auth cookies for stale-session diagnostics", () => {
    expect(hasSupabaseAuthCookie(new NextRequest("http://localhost/"))).toBe(false);
    expect(
      hasSupabaseAuthCookie(
        new NextRequest("http://localhost/", {
          headers: { cookie: "sb-example-auth-token=value" },
        }),
      ),
    ).toBe(true);
    expect(
      hasSupabaseAuthCookie(
        new NextRequest("http://localhost/", {
          headers: { cookie: "sb-example-auth-token.0=value; sb-example-auth-token.1=value" },
        }),
      ),
    ).toBe(true);
  });

  it("detects the local auth cache cookie", () => {
    expect(hasAuthCacheCookie(new NextRequest("http://localhost/"))).toBe(false);
    expect(
      hasAuthCacheCookie(
        new NextRequest("http://localhost/", {
          headers: { cookie: "shpitto_auth_cache=value" },
        }),
      ),
    ).toBe(true);
  });

  it("allows public paths without an auth cache", async () => {
    const rootResponse = await updateSession(new NextRequest("http://localhost/"));
    const pricingResponse = await updateSession(new NextRequest("http://localhost/pricing"));
    const authResponse = await updateSession(new NextRequest("http://localhost/auth/password"));
    const signupResponse = await updateSession(new NextRequest("http://localhost/auth/signup"));
    const registerResponse = await updateSession(new NextRequest("http://localhost/register"));
    const forgotResponse = await updateSession(new NextRequest("http://localhost/auth/password/forgot"));
    const resetPageResponse = await updateSession(new NextRequest("http://localhost/reset-password"));
    const verifyEmailResponse = await updateSession(new NextRequest("http://localhost/verify-email"));
    const blogResponse = await updateSession(new NextRequest("http://localhost/blog"));
    const launchResponse = await updateSession(new NextRequest("http://localhost/launch-center"));

    expect(rootResponse.status).toBe(200);
    expect(pricingResponse.status).toBe(200);
    expect(authResponse.status).toBe(200);
    expect(signupResponse.status).toBe(200);
    expect(registerResponse.status).toBe(200);
    expect(forgotResponse.status).toBe(200);
    expect(resetPageResponse.status).toBe(200);
    expect(verifyEmailResponse.status).toBe(200);
    expect(blogResponse.status).toBe(200);
    expect(launchResponse.status).toBe(200);
  });

  it("redirects private workspace routes when the local auth cache is missing", async () => {
    const response = await updateSession(new NextRequest("http://localhost/projects/demo/analysis"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe("http://localhost/login?next=%2Fprojects%2Fdemo%2Fanalysis");
  });

  it("redirects project data routes to login with the original next path", async () => {
    const response = await updateSession(new NextRequest("http://localhost/projects/demo/data"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe("http://localhost/login?next=%2Fprojects%2Fdemo%2Fdata");
  });

  it("allows private workspace routes when the local auth cache exists", async () => {
    const response = await updateSession(
      new NextRequest("http://localhost/projects/demo/analysis", {
        headers: { cookie: "shpitto_auth_cache=value" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends stale Supabase cookies through a one-time local auth cache repair", async () => {
    const response = await updateSession(
      new NextRequest("http://localhost/projects/demo/analysis", {
        headers: { cookie: "sb-example-auth-token=value" },
      }),
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe(
      "http://localhost/auth/session/repair?next=%2Fprojects%2Fdemo%2Fanalysis",
    );
  });
});
