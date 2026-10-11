import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthCacheCookieValue, parseAuthCacheCookieValue } from "./auth-cache";

describe("auth cache cookie", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    process.env.SHPITTO_AUTH_CACHE_SECRET = "test-secret";
    process.env.SHPITTO_AUTH_CACHE_TTL_SECONDS = "60";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SHPITTO_AUTH_CACHE_SECRET;
    delete process.env.SHPITTO_AUTH_CACHE_TTL_SECONDS;
  });

  it("round-trips a signed cached user", () => {
    const value = createAuthCacheCookieValue({ id: "user-1", email: "u@example.com" });

    expect(parseAuthCacheCookieValue(value)).toEqual({
      id: "user-1",
      email: "u@example.com",
    });
  });

  it("rejects tampered cookie values", () => {
    const value = createAuthCacheCookieValue({ id: "user-1", email: "u@example.com" });
    const [payload, signature] = value.split(".");
    const tampered = `${payload.slice(0, -1)}x.${signature}`;

    expect(parseAuthCacheCookieValue(tampered)).toBeNull();
  });

  it("rejects expired cookie values", () => {
    const value = createAuthCacheCookieValue({ id: "user-1", email: "u@example.com" });

    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));

    expect(parseAuthCacheCookieValue(value)).toBeNull();
  });
});
