import { NextResponse } from "next/server";
import { isPaidBillingEnabled } from "@/lib/billing/config";
import { canCreateProject } from "@/lib/billing/entitlements";
import {
  countCreatedProjects,
  grantFreeTrialIfMissing,
  seedBillingPlans,
} from "@/lib/billing/store";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    await seedBillingPlans();
    const entitlement = await grantFreeTrialIfMissing(userId);
    const usedSites = await countCreatedProjects(userId);
    const quota = canCreateProject(entitlement, usedSites);

    return NextResponse.json({ ok: true, paidBillingEnabled: isPaidBillingEnabled(), entitlement, usedSites, quota });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load entitlement." },
      { status: 500 },
    );
  }
}
