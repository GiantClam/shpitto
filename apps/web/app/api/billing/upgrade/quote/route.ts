import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { getBillingPlan, type BillingPlanCode } from "@/lib/billing/plans";
import { calculatePlanPrice, quotePlanUpgrade } from "@/lib/billing/pricing";
import { getLatestEntitlement } from "@/lib/billing/store";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!isPaidBillingEnabled()) {
      return NextResponse.json(
        { ok: false, error: PAID_BILLING_DISABLED_MESSAGE },
        { status: 503 },
      );
    }

    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { targetPlanCode?: string };
    const targetPlanCode = String(body.targetPlanCode || "").trim().toLowerCase() as BillingPlanCode;
    if (!getBillingPlan(targetPlanCode) || targetPlanCode === "free") {
      return NextResponse.json({ ok: false, error: "Invalid target plan." }, { status: 400 });
    }

    const entitlement = await getLatestEntitlement(userId);
    if (!entitlement) return NextResponse.json({ ok: false, error: "No current entitlement." }, { status: 404 });
    if (entitlement.planCode === "free") {
      return NextResponse.json({ ok: false, error: "Free trial upgrades should use regular checkout." }, { status: 400 });
    }

    const currentMonths = entitlement.currentPeriodMonths || 12;
    const currentPaidAmountMinor = calculatePlanPrice(entitlement.planCode, currentMonths).payableAmountMinor;
    const quote = quotePlanUpgrade({
      currentPlanCode: entitlement.planCode,
      targetPlanCode,
      currentPaidAmountMinor,
      paidServiceStart: entitlement.validFrom,
      paidServiceEnd: entitlement.validUntil,
      now: new Date(),
    });

    return NextResponse.json({ ok: true, entitlement, quote });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to quote upgrade." },
      { status: 500 },
    );
  }
}
