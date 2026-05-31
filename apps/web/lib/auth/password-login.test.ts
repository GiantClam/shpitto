import { describe, expect, it, vi } from "vitest";
import { submitPasswordLogin } from "./password-login";

describe("submitPasswordLogin", () => {
  it("returns success when the auth route succeeds", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      submitPasswordLogin(
        {
          email: "qa@example.com",
          password: "secret",
        },
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("surfaces route-level auth errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "Invalid login credentials" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      submitPasswordLogin(
        {
          email: "qa@example.com",
          password: "wrong",
        },
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({ ok: false, error: "Invalid login credentials" });
  });

  it("turns thrown fetch failures into a visible retry message", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      submitPasswordLogin(
        {
          email: "qa@example.com",
          password: "secret",
        },
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({
      ok: false,
      error: "Unable to reach the authentication service. Please try again.",
    });
  });
});
