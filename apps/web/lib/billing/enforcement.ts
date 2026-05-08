import { canCreateProject, canMutatePublishedSite, type BillingEntitlement } from "./entitlements.ts";
import {
  countCreatedProjects,
  getLatestEntitlement,
  grantFreeTrialIfMissing,
  hasBillableProject,
  isBillingStorageConfigured,
  seedBillingPlans,
} from "./store.ts";

export type BillingAccessSnapshot = {
  enforcementEnabled: boolean;
  entitlement?: BillingEntitlement;
  usedSites: number;
};

export class BillingAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 402) {
    super(message);
    this.name = "BillingAccessError";
    this.code = code;
    this.status = status;
  }
}

export async function getBillingAccessSnapshot(ownerUserId: string): Promise<BillingAccessSnapshot> {
  if (!isBillingStorageConfigured()) {
    return { enforcementEnabled: false, usedSites: 0 };
  }

  await seedBillingPlans();
  const entitlement = await grantFreeTrialIfMissing(ownerUserId);
  const usedSites = await countCreatedProjects(ownerUserId);
  return { enforcementEnabled: true, entitlement, usedSites };
}

export async function assertCanCreateProject(ownerUserId: string, projectId?: string): Promise<BillingAccessSnapshot> {
  const snapshot = await getBillingAccessSnapshot(ownerUserId);
  if (!snapshot.enforcementEnabled) return snapshot;
  if (projectId && (await hasBillableProject(ownerUserId, projectId))) return snapshot;

  const decision = canCreateProject(snapshot.entitlement, snapshot.usedSites);
  if (!decision.allowed) {
    throw new BillingAccessError(
      decision.reason || "billing_blocked",
      buildCreateProjectBlockedMessage(decision.reason, decision.usedSites, decision.siteLimit),
    );
  }

  return snapshot;
}

export async function assertCanMutatePublishedSite(ownerUserId: string): Promise<BillingAccessSnapshot> {
  if (!isBillingStorageConfigured()) {
    return { enforcementEnabled: false, usedSites: 0 };
  }

  await seedBillingPlans();
  const entitlement = await getLatestEntitlement(ownerUserId);
  if (!canMutatePublishedSite(entitlement)) {
    throw new BillingAccessError(
      "billing_inactive",
      "Your plan is expired, past due, or in retention. Renew or upgrade before publishing, deploying, or changing domains.",
    );
  }

  const usedSites = await countCreatedProjects(ownerUserId);
  return { enforcementEnabled: true, entitlement, usedSites };
}

function buildCreateProjectBlockedMessage(reason: string | undefined, usedSites: number, siteLimit: number): string {
  if (reason === "quota_exceeded") {
    return `Your website quota is full: ${usedSites}/${siteLimit} sites are already counted. Deleted or archived projects keep using quota until system cleanup completes.`;
  }
  if (reason === "past_due" || reason === "expired") {
    return "Your plan is expired or in retention. Renew or upgrade before creating a new site.";
  }
  if (reason === "cancelled") {
    return "Your plan is cancelled. Buy a new plan before creating a new site.";
  }
  return "This account has no active plan. Start a trial or choose a paid plan before creating a new site.";
}
