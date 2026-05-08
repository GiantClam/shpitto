import { NextResponse } from "next/server";
import { isPaidBillingEnabled } from "@/lib/billing/config";
import { getBillingPlans } from "@/lib/billing/plans";
import { calculatePlanPrice } from "@/lib/billing/pricing";

export const runtime = "nodejs";

export async function GET() {
  const paidBillingEnabled = isPaidBillingEnabled();
  const plans = getBillingPlans().map((plan) => ({
    ...plan,
    enabled: plan.code === "free" || paidBillingEnabled,
    prices:
      plan.code === "free"
        ? [calculatePlanPrice(plan.code, 0)]
        : plan.code === "experience"
          ? [calculatePlanPrice(plan.code, 12)]
          : [12, 24, 36, 48].map((months) => calculatePlanPrice(plan.code, months)),
  }));

  return NextResponse.json({ ok: true, paidBillingEnabled, plans });
}
