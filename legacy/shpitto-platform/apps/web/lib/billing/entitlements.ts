import type { BillingPlanCode } from "./plans.ts";

export const DEFAULT_BILLING_RETENTION_DAYS = 60;
export const FREE_TRIAL_DAYS = 7;

export type EntitlementStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "expired"
  | "cancelled";

export type BillingEntitlement = {
  planCode: BillingPlanCode;
  status: EntitlementStatus;
  siteLimit: number;
  validFrom: Date;
  validUntil: Date;
  currentPeriodMonths?: number;
};

export type QuotaDecision = {
  allowed: boolean;
  reason?: "missing_entitlement" | "expired" | "past_due" | "quota_exceeded" | "cancelled";
  usedSites: number;
  siteLimit: number;
};

export function isEntitlementExpired(
  entitlement: Pick<BillingEntitlement, "validUntil">,
  now = new Date(),
): boolean {
  return entitlement.validUntil.getTime() <= now.getTime();
}

export function isWithinRetentionPeriod(
  entitlement: Pick<BillingEntitlement, "validUntil">,
  now = new Date(),
  retentionDays = DEFAULT_BILLING_RETENTION_DAYS,
): boolean {
  const expiresAt = entitlement.validUntil.getTime();
  const retentionEndsAt = expiresAt + retentionDays * 24 * 60 * 60 * 1000;
  return now.getTime() > expiresAt && now.getTime() <= retentionEndsAt;
}

export function isCleanupEligible(
  entitlement: Pick<BillingEntitlement, "validUntil">,
  now = new Date(),
  retentionDays = DEFAULT_BILLING_RETENTION_DAYS,
): boolean {
  const retentionEndsAt = entitlement.validUntil.getTime() + retentionDays * 24 * 60 * 60 * 1000;
  return now.getTime() > retentionEndsAt;
}

export function canCreateProject(
  entitlement: BillingEntitlement | undefined,
  usedSites: number,
  now = new Date(),
): QuotaDecision {
  if (!entitlement) {
    return { allowed: false, reason: "missing_entitlement", usedSites, siteLimit: 0 };
  }

  if (entitlement.status === "cancelled") {
    return {
      allowed: false,
      reason: "cancelled",
      usedSites,
      siteLimit: entitlement.siteLimit,
    };
  }

  if (entitlement.status === "past_due" || isWithinRetentionPeriod(entitlement, now)) {
    return {
      allowed: false,
      reason: "past_due",
      usedSites,
      siteLimit: entitlement.siteLimit,
    };
  }

  if (entitlement.status === "expired" || isEntitlementExpired(entitlement, now)) {
    return {
      allowed: false,
      reason: "expired",
      usedSites,
      siteLimit: entitlement.siteLimit,
    };
  }

  if (usedSites >= entitlement.siteLimit) {
    return {
      allowed: false,
      reason: "quota_exceeded",
      usedSites,
      siteLimit: entitlement.siteLimit,
    };
  }

  return { allowed: true, usedSites, siteLimit: entitlement.siteLimit };
}

export function canMutatePublishedSite(
  entitlement: BillingEntitlement | undefined,
  now = new Date(),
): boolean {
  if (!entitlement) return false;
  if (entitlement.status !== "active" && entitlement.status !== "trialing") return false;
  return !isEntitlementExpired(entitlement, now);
}
