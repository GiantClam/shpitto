import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { capturePayPalOrder } from "@/lib/billing/paypal";
import {
  activateCheckoutSessionPayment,
  getCheckoutSessionByPayPalOrderId,
} from "@/lib/billing/store";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ orderId: string }> },
) {
  try {
    if (!isPaidBillingEnabled()) {
      return NextResponse.json(
        { ok: false, error: PAID_BILLING_DISABLED_MESSAGE },
        { status: 503 },
      );
    }

    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { orderId: rawOrderId } = await ctx.params;
    const orderId = decodeURIComponent(String(rawOrderId || "").trim());
    const session = orderId ? await getCheckoutSessionByPayPalOrderId(orderId) : undefined;
    if (!session || session.ownerUserId !== userId) {
      return NextResponse.json({ ok: false, error: "Checkout session not found." }, { status: 404 });
    }
    if (session.status === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Checkout session expired." }, { status: 410 });
    }

    const capture = await capturePayPalOrder(orderId, `${session.id}:capture`);
    if (capture.status !== "COMPLETED") {
      return NextResponse.json({ ok: false, error: `PayPal capture status is ${capture.status}.` }, { status: 409 });
    }

    const { entitlement } = await activateCheckoutSessionPayment({
      session,
      paypalOrderId: orderId,
      paypalCaptureId: capture.id,
      metadata: capture.raw,
    });

    return NextResponse.json({ ok: true, entitlement, capture });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to capture PayPal order." },
      { status: 500 },
    );
  }
}
