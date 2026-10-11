import { describe, expect, it } from "vitest";
import { BillingAccessError } from "./enforcement";

describe("BillingAccessError", () => {
  it("carries an http status and machine-readable code", () => {
    const error = new BillingAccessError("quota_exceeded", "Quota exceeded");

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(402);
    expect(error.code).toBe("quota_exceeded");
  });
});
