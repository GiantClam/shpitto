import { afterEach, describe, expect, it, vi } from "vitest";

describe("billing config", () => {
  afterEach(() => {
    delete process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED;
    vi.resetModules();
  });

  it("defaults paid billing to enabled", async () => {
    delete process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED;
    const { isPaidBillingEnabled } = await import("./config");

    expect(isPaidBillingEnabled()).toBe(true);
  });

  it("treats common disabled values as off", async () => {
    process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED = "off";
    const { isPaidBillingEnabled } = await import("./config");

    expect(isPaidBillingEnabled()).toBe(false);
  });
});
