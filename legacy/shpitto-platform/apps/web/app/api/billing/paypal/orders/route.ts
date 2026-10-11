import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { createPayPalOrder } from "@/lib/billing/paypal";
import {
  attachPayPalOrderToCheckoutSession,
  getCheckoutSessionById,
} from "@/lib/billing/store";
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

    const body = (await request.json().catch(() => ({}))) as { checkoutSessionId?: string };
    const checkoutSessionId = String(body.checkoutSessionId || "").trim();
    const session = checkoutSessionId ? await getCheckoutSessionById(checkoutSessionId) : undefined;
    if (!session || session.ownerUserId !== userId) {
      return NextResponse.json({ ok: false, error: "Checkout session not found." }, { status: 404 });
    }
    if (session.status === "paid") {
      return NextResponse.json({ ok: false, error: "Checkout session is already paid." }, { status: 409 });
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Checkout session expired." }, { status: 410 });
    }

    const origin = request.nextUrl.origin;
    const order = await createPayPalOrder({
      session,
      description: `Shpitto ${session.planCode} prepaid ${session.months} months`,
      returnUrl: `${origin}/account/billing/success?checkout=${encodeURIComponent(session.id)}`,
      cancelUrl: `${origin}/account/billing/cancelled?checkout=${encodeURIComponent(session.id)}`,
    });
    await attachPayPalOrderToCheckoutSession(session.id, order.id, order.settlementAmount);

    return NextResponse.json({ ok: true, orderId: order.id, approveUrl: order.approveUrl, order });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create PayPal order." },
      { status: 500 },
    );
  }
}
