import { NextRequest, NextResponse } from "next/server";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { verifyPayPalWebhookSignature } from "@/lib/billing/paypal";
import {
  activateCheckoutSessionPayment,
  getCheckoutSessionByPayPalOrderId,
  recordPayPalEvent,
} from "@/lib/billing/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isPaidBillingEnabled()) {
    return NextResponse.json({ ok: false, error: PAID_BILLING_DISABLED_MESSAGE }, { status: 503 });
  }

  const rawBody = await request.text();
  let event: any;
  try {
    event = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const verified = await verifyPayPalWebhookSignature({ headers: request.headers, rawBody, event });
    if (!verified) return NextResponse.json({ ok: false, error: "Invalid PayPal webhook signature." }, { status: 400 });

    const eventId = String(event?.id || "");
    const eventType = String(event?.event_type || "");
    const resourceId = String(event?.resource?.id || "");
    const orderId = String(event?.resource?.supplementary_data?.related_ids?.order_id || resourceId || "");
    const session = orderId ? await getCheckoutSessionByPayPalOrderId(orderId) : undefined;

    if (eventType === "PAYMENT.CAPTURE.COMPLETED" && session && session.status !== "paid") {
      await activateCheckoutSessionPayment({
        session,
        paypalOrderId: orderId,
        paypalCaptureId: resourceId,
        paypalEventId: eventId,
        metadata: event,
      });
    }

    await recordPayPalEvent({
      id: eventId,
      eventType,
      resourceId,
      payload: event,
      processedAt: new Date(),
    });

    return NextResponse.json({ ok: true, eventId, eventType, matchedCheckoutSessionId: session?.id });
  } catch (error) {
    if (event?.id) {
      await recordPayPalEvent({
        id: String(event.id),
        eventType: String(event?.event_type || "unknown"),
        resourceId: String(event?.resource?.id || ""),
        payload: event,
        processingError: error instanceof Error ? error.message : "Webhook processing failed.",
      }).catch(() => undefined);
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to process PayPal webhook." },
      { status: 500 },
    );
  }
}
