import { describe, expect, it } from "vitest";
import {
  canCreateProject,
  canMutatePublishedSite,
  isCleanupEligible,
  isWithinRetentionPeriod,
  type BillingEntitlement,
} from "./entitlements";

const activeStarter: BillingEntitlement = {
  planCode: "starter",
  status: "active",
  siteLimit: 3,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validUntil: new Date("2027-01-01T00:00:00.000Z"),
};

const freeTrial: BillingEntitlement = {
  planCode: "free",
  status: "trialing",
  siteLimit: 1,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validUntil: new Date("2026-01-08T00:00:00.000Z"),
};

describe("billing entitlements", () => {
  it("allows project creation below quota and blocks at quota", () => {
    expect(canCreateProject(activeStarter, 2, new Date("2026-06-01T00:00:00.000Z"))).toMatchObject({
      allowed: true,
      usedSites: 2,
      siteLimit: 3,
    });
    expect(canCreateProject(activeStarter, 3, new Date("2026-06-01T00:00:00.000Z"))).toMatchObject({
      allowed: false,
      reason: "quota_exceeded",
    });
  });

  it("blocks creation and site mutation after expiry during the 60 day retention window", () => {
    const now = new Date("2027-01-10T00:00:00.000Z");

    expect(isWithinRetentionPeriod(activeStarter, now)).toBe(true);
    expect(canCreateProject(activeStarter, 0, now)).toMatchObject({
      allowed: false,
      reason: "past_due",
    });
    expect(canMutatePublishedSite(activeStarter, now)).toBe(false);
  });

  it("marks cleanup eligibility only after retention ends", () => {
    expect(isCleanupEligible(activeStarter, new Date("2027-03-01T00:00:00.000Z"))).toBe(false);
    expect(isCleanupEligible(activeStarter, new Date("2027-03-03T00:00:00.000Z"))).toBe(true);
  });

  it("keeps free users in the same 60 day site retention window", () => {
    expect(isWithinRetentionPeriod(freeTrial, new Date("2026-02-15T00:00:00.000Z"))).toBe(true);
    expect(isCleanupEligible(freeTrial, new Date("2026-03-10T00:00:00.000Z"))).toBe(true);
  });
});
