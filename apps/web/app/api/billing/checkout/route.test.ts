import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("billing checkout route", () => {
  afterEach(() => {
    delete process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("rejects checkout when paid billing is disabled", async () => {
    process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED = "0";
    vi.resetModules();

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: "starter", months: 12 }),
      }),
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: "Paid plans are temporarily disabled. Only the free plan is available.",
    });
  });
});
