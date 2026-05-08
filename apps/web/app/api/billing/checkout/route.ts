import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import type { BillingPlanCode } from "@/lib/billing/plans";
import { getBillingPlan } from "@/lib/billing/plans";
import { calculatePlanPrice } from "@/lib/billing/pricing";
import { createCheckoutSession, seedBillingPlans } from "@/lib/billing/store";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Failed to create checkout session.");
  }
  return "Failed to create checkout session.";
}

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

    const body = (await request.json().catch(() => ({}))) as { planCode?: string; months?: number };
    const planCode = String(body.planCode || "").trim().toLowerCase() as BillingPlanCode;
    const plan = getBillingPlan(planCode);
    if (!plan || plan.code === "free") {
      return NextResponse.json({ ok: false, error: "Invalid paid plan." }, { status: 400 });
    }

    const months = Number(body.months || 12);
    const quote = calculatePlanPrice(plan.code, months);
    await seedBillingPlans();
    const session = await createCheckoutSession({
      ownerUserId: userId,
      purpose: "new_purchase",
      quote,
      priceSnapshot: { plan, quote },
    });

    return NextResponse.json({ ok: true, checkoutSession: session });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error) },
      { status: 500 },
    );
  }
}
