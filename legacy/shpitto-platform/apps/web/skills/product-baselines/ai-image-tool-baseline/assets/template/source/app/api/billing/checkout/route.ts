import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../../lib/auth";
import { attachChargeOrderProvider, createChargeOrder, updateChargeOrderStatus } from "../../../../lib/billing-store";
import crypto from "node:crypto";

const PRODUCT_CATALOG = {
  'starter-100': { name: 'Starter 100 credits', amountMinor: 990, creditAmount: 100, currency: 'USD', priceId: () => String(process.env.STRIPE_PRICE_ID || '').trim() },
} as const;

export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const secret = String(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '').trim();
  if (!secret) return NextResponse.json({ ok: false, error: 'Stripe checkout is not configured.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { successUrl?: string; cancelUrl?: string; productId?: string };
  const productId = String(body.productId || 'starter-100').trim().slice(0, 80);
  const product = PRODUCT_CATALOG[productId as keyof typeof PRODUCT_CATALOG];
  if (!product) return NextResponse.json({ ok: false, error: 'Unknown checkout product.' }, { status: 400 });
  const priceId = product.priceId();
  const orderId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await createChargeOrder({ id: orderId, userId: user.id, productId, amountMinor: product.amountMinor, creditAmount: product.creditAmount, currency: product.currency, provider: 'stripe', status: 'pending', createdAt });
  const origin = new URL(request.url).origin;
  const safeReturnUrl = (value: string | undefined, fallback: string) => { try { const url = new URL(String(value || fallback), origin); return url.origin === origin ? url.toString() : fallback; } catch { return fallback; } };
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  if (priceId) form.set('line_items[0][price]', priceId);
  else { form.set('line_items[0][price_data][currency]', product.currency.toLowerCase()); form.set('line_items[0][price_data][unit_amount]', String(product.amountMinor)); form.set('line_items[0][price_data][product_data][name]', product.name); }
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', safeReturnUrl(body.successUrl, `${origin}/app/order`));
  form.set('cancel_url', safeReturnUrl(body.cancelUrl, `${origin}/app/order`));
  form.set('client_reference_id', orderId);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url || !payload.id) { await updateChargeOrderStatus(orderId, 'failed'); return NextResponse.json({ ok: false, error: payload.error?.message || 'Stripe checkout failed.' }, { status: 502 }); }
  await attachChargeOrderProvider(orderId, payload.id);
  return NextResponse.json({ ok: true, orderId, sessionId: payload.id || '', url: payload.url });
}
