import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { getBillingPlan, type BillingPlanCode } from "@/lib/billing/plans";
import { calculatePlanPrice, quotePlanUpgrade } from "@/lib/billing/pricing";
import { createCheckoutSession, getLatestEntitlement } from "@/lib/billing/store";
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
    const targetPlan = getBillingPlan(targetPlanCode);
    if (!targetPlan || targetPlanCode === "free") {
      return NextResponse.json({ ok: false, error: "Invalid target plan." }, { status: 400 });
    }

    const entitlement = await getLatestEntitlement(userId);
    if (!entitlement) return NextResponse.json({ ok: false, error: "No current entitlement." }, { status: 404 });
    if (entitlement.planCode === "free") {
      return NextResponse.json({ ok: false, error: "Free trial upgrades should use regular checkout." }, { status: 400 });
    }

    const currentMonths = entitlement.currentPeriodMonths || 12;
    const currentPaidAmountMinor = calculatePlanPrice(entitlement.planCode, currentMonths).payableAmountMinor;
    const upgradeQuote = quotePlanUpgrade({
      currentPlanCode: entitlement.planCode,
      targetPlanCode,
      currentPaidAmountMinor,
      paidServiceStart: entitlement.validFrom,
      paidServiceEnd: entitlement.validUntil,
      now: new Date(),
    });
    const baseQuote = calculatePlanPrice(targetPlanCode, 12);
    const session = await createCheckoutSession({
      ownerUserId: userId,
      purpose: "upgrade",
      quote: {
        ...baseQuote,
        payableAmountMinor: upgradeQuote.amountDueMinor,
        displayMonthlyPriceMinor: Math.round(upgradeQuote.amountDueMinor / Math.max(1, upgradeQuote.remainingMonthsEquivalent)),
      },
      priceSnapshot: { targetPlan, entitlement, upgradeQuote },
      ttlMinutes: 15,
    });

    return NextResponse.json({ ok: true, checkoutSession: session, quote: upgradeQuote });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create upgrade checkout." },
      { status: 500 },
    );
  }
}
