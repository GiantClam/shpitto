import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adjustEntitlement, attachChargeOrderProvider, findChargeOrderById, findChargeOrderByProviderOrderId, findChargeOrderByProviderPaymentId, grantEntitlement, updateChargeOrderStatus } from "../../../../lib/billing-store";

function verifyStripeSignature(rawBody: string, signature: string, secret: string): boolean {
  const pairs = signature.split(',').map((item) => item.split('=', 2)).filter(([key, value]) => key && value);
  const timestamp = String(pairs.find(([key]) => key === 't')?.[1] || '');
  const received = pairs.filter(([key]) => key === 'v1').map(([, value]) => String(value || '')).filter(Boolean);
  const timestampNumber = Number(timestamp);
  if (!timestamp || received.length === 0 || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const left = Buffer.from(expected, 'utf8');
  return received.some((value) => { const right = Buffer.from(value, 'utf8'); return left.length === right.length && timingSafeEqual(left, right); });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const signature = String(request.headers.get('stripe-signature') || '').trim();
  if (!secret || !verifyStripeSignature(rawBody, signature, secret)) return NextResponse.json({ ok: false, error: 'Invalid Stripe signature.' }, { status: 400 });
  let event: { id?: string; type?: string; data?: { object?: { id?: string; client_reference_id?: string; payment_intent?: string; payment_status?: string; amount_total?: number; amount_refunded?: number; currency?: string } } };
  try { event = JSON.parse(rawBody) as typeof event; } catch { return NextResponse.json({ ok: false, error: 'Invalid webhook JSON.' }, { status: 400 }); }
  if (event.type === 'checkout.session.completed' && event.data?.object?.payment_status === 'paid') {
    const session = event.data.object;
    const sessionId = String(session.id || '').trim();
    const order = (sessionId && await findChargeOrderByProviderOrderId(sessionId)) || (session.client_reference_id && await findChargeOrderById(session.client_reference_id));
    if (!order || !event.id || !sessionId || order.provider !== 'stripe') return NextResponse.json({ ok: false, error: 'Checkout order is not recognized.' }, { status: 422 });
    if (!Number.isInteger(session.amount_total) || session.amount_total !== order.amountMinor || String(session.currency || '').toUpperCase() !== order.currency) return NextResponse.json({ ok: false, error: 'Checkout amount does not match the stored order.' }, { status: 422 });
    if (order.status !== 'paid') {
      await attachChargeOrderProvider(order.id, sessionId, String(session.payment_intent || '').trim() || undefined);
      await grantEntitlement(order.userId, order.creditAmount, event.id);
      await updateChargeOrderStatus(order.id, 'paid');
    }
  }
  if ((event.type === 'charge.refunded' || event.type === 'charge.dispute.created') && event.data?.object) {
    const paymentIntent = String(event.data.object.payment_intent || '').trim();
    const order = paymentIntent ? await findChargeOrderByProviderPaymentId(paymentIntent) : null;
    if (order && event.id && order.status === 'paid') {
      await adjustEntitlement(order.userId, -Math.abs(order.creditAmount), event.id, event.type);
      await updateChargeOrderStatus(order.id, 'refunded');
    }
  }
  return NextResponse.json({ ok: true, received: true });
}
