import crypto from "node:crypto";
export type Entitlement = { userId: string; credits: number; providerEventId?: string; updatedAt: string };
export type CreditReservation = { id: string; userId: string; units: number; status: 'reserved' | 'consumed' | 'released'; idempotencyKey: string; createdAt: string; updatedAt: string };
type LedgerEntry = { id: string; userId: string; delta: number; reason: string; providerEventId?: string; createdAt: string };
export type ChargeOrder = { id: string; userId: string; productId: string; amountMinor: number; creditAmount: number; currency: string; provider: string; providerOrderId?: string; providerPaymentId?: string; status: 'pending' | 'paid' | 'failed' | 'refunded'; createdAt: string; };
export type TemplateGiftCode = { code: string; creditAmount: number; expiresAt?: string; usedBy?: string; usedAt?: string; createdAt: string };

const memoryLedger = new Map<string, LedgerEntry[]>();
const memoryReservations = new Map<string, CreditReservation>();
const memoryOrders = new Map<string, ChargeOrder>();
const memoryGiftCodes = new Map<string, TemplateGiftCode>();

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}

function localBalance(userId: string): number {
  return (memoryLedger.get(userId) || []).reduce((total, entry) => total + entry.delta, 0);
}

export async function grantEntitlement(userId: string, credits: number, providerEventId: string): Promise<Entitlement> {
  const existing = Array.from(memoryLedger.values()).flat().find((entry) => entry.providerEventId === providerEventId);
  if (existing) return getEntitlement(userId) as Promise<Entitlement>;
  const delta = Math.max(0, Math.floor(credits));
  const entry = { id: crypto.randomUUID(), userId, delta, reason: 'payment', providerEventId, createdAt: new Date().toISOString() };
  memoryLedger.set(userId, [...(memoryLedger.get(userId) || []), entry]);
  const config = supabaseConfig();
  if (config) {
    const response = await fetch(`${config.url}/rest/v1/template_entitlement_ledger`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: entry.id, user_id: userId, delta, reason: entry.reason, provider_event_id: providerEventId, created_at: entry.createdAt }) });
    if (!response.ok && response.status !== 409) throw new Error(`Entitlement persistence failed with ${response.status}.`);
  }
  return { userId, credits: localBalance(userId), providerEventId, updatedAt: entry.createdAt };
}

export async function adjustEntitlement(userId: string, delta: number, providerEventId: string, reason: string): Promise<Entitlement> {
  const existing = Array.from(memoryLedger.values()).flat().find((entry) => entry.providerEventId === providerEventId);
  if (existing) return (await getEntitlement(userId)) || { userId, credits: localBalance(userId), updatedAt: new Date().toISOString() };
  const entry = { id: crypto.randomUUID(), userId, delta: Math.trunc(delta), reason: String(reason || 'billing_adjustment'), providerEventId, createdAt: new Date().toISOString() };
  memoryLedger.set(userId, [...(memoryLedger.get(userId) || []), entry]);
  const config = supabaseConfig();
  if (config) {
    const response = await fetch(`${config.url}/rest/v1/template_entitlement_ledger`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: entry.id, user_id: userId, delta: entry.delta, reason: entry.reason, provider_event_id: providerEventId, created_at: entry.createdAt }) });
    if (!response.ok && response.status !== 409) throw new Error(`Billing adjustment persistence failed with ${response.status}.`);
  }
  return { userId, credits: localBalance(userId), providerEventId, updatedAt: entry.createdAt };
}

export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const config = supabaseConfig();
  if (!config) return localBalance(userId) > 0 ? { userId, credits: localBalance(userId), updatedAt: new Date().toISOString() } : null;
  const response = await fetch(`${config.url}/rest/v1/template_entitlement_ledger?user_id=eq.${encodeURIComponent(userId)}&select=delta,provider_event_id,created_at&order=created_at.desc&limit=1000`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Entitlement lookup failed with ${response.status}.`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  return { userId, credits: rows.reduce((total, row) => total + Number(row.delta || 0), 0), providerEventId: String(rows.find((row) => row.provider_event_id)?.provider_event_id || ''), updatedAt: String(rows[0]?.created_at || '') };
}

export async function reserveCredits(userId: string, idempotencyKey: string, units = 1): Promise<CreditReservation | null> {
  const existing = memoryReservations.get(idempotencyKey);
  if (existing && existing.status !== 'released') return existing;
  const normalizedUnits = Math.max(1, Math.floor(units));
  const current = await getEntitlement(userId);
  const localReserved = Array.from(memoryReservations.values()).filter((item) => item.userId === userId && item.status === 'reserved').reduce((total, item) => total + item.units, 0);
  if (!current || current.credits - localReserved < normalizedUnits) return null;
  const now = new Date().toISOString();
  const reservation = { id: crypto.randomUUID(), userId, units: normalizedUnits, status: 'reserved' as const, idempotencyKey, createdAt: now, updatedAt: now };
  const config = supabaseConfig();
  if (config) {
    const response = await fetch(`${config.url}/rest/v1/rpc/reserve_generation_credits`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_id: userId, p_reservation_id: reservation.id, p_idempotency_key: idempotencyKey, p_units: normalizedUnits }) });
    if (!response.ok) throw new Error(`Credit reservation failed with ${response.status}.`);
    const accepted = await response.json().catch(() => false);
    if (accepted !== true && accepted !== 1 && accepted?.accepted !== true) return null;
  } else if (current.credits - localReserved < normalizedUnits) return null;
  memoryReservations.set(idempotencyKey, reservation);
  return reservation;
}

export async function settleReservation(reservation: CreditReservation): Promise<void> {
  const settled = { ...reservation, status: 'consumed' as const, updatedAt: new Date().toISOString() };
  memoryReservations.set(reservation.idempotencyKey, settled);
  const config = supabaseConfig();
  if (!config) { memoryLedger.set(reservation.userId, [...(memoryLedger.get(reservation.userId) || []), { id: crypto.randomUUID(), userId: reservation.userId, delta: -reservation.units, reason: 'generation', createdAt: settled.updatedAt }]); return; }
  const response = await fetch(`${config.url}/rest/v1/generation_usage_reservations?id=eq.${encodeURIComponent(reservation.id)}`, { method: 'PATCH', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'consumed', updated_at: settled.updatedAt }) });
  if (!response.ok) throw new Error(`Credit settlement failed with ${response.status}.`);
}

export async function releaseReservation(reservation: CreditReservation): Promise<void> {
  const current = memoryReservations.get(reservation.idempotencyKey);
  if (current?.status === 'released' || current?.status === 'consumed') return;
  const released = { ...reservation, status: 'released' as const, updatedAt: new Date().toISOString() };
  memoryReservations.set(reservation.idempotencyKey, released);
  const config = supabaseConfig();
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/rpc/release_generation_credits`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_reservation_id: reservation.id }) });
  if (!response.ok) throw new Error(`Credit release failed with ${response.status}.`);
}

export async function createChargeOrder(order: ChargeOrder): Promise<void> {
  memoryOrders.set(order.id, order);
  const config = supabaseConfig();
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/template_charge_orders`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, user_id: order.userId, product_id: order.productId, amount_minor: order.amountMinor, credit_amount: order.creditAmount, currency: order.currency, provider: order.provider, provider_order_id: order.providerOrderId || null, provider_payment_id: order.providerPaymentId || null, status: order.status, created_at: order.createdAt }) });
  if (!response.ok) throw new Error(`Charge order persistence failed with ${response.status}.`);
}

export async function listChargeOrders(userId: string): Promise<ChargeOrder[]> {
  const config = supabaseConfig();
  if (!config) return Array.from(memoryOrders.values()).filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const response = await fetch(`${config.url}/rest/v1/template_charge_orders?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Charge order lookup failed with ${response.status}.`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => toChargeOrder(row, userId));
}

function toChargeOrder(row: Record<string, unknown>, fallbackUserId = ''): ChargeOrder {
  return { id: String(row.id || ''), userId: String(row.user_id || fallbackUserId), productId: String(row.product_id || ''), amountMinor: Number(row.amount_minor || 0), creditAmount: Number(row.credit_amount || 0), currency: String(row.currency || 'USD'), provider: String(row.provider || ''), providerOrderId: String(row.provider_order_id || '') || undefined, providerPaymentId: String(row.provider_payment_id || '') || undefined, status: ['pending', 'paid', 'failed', 'refunded'].includes(String(row.status)) ? String(row.status) as ChargeOrder['status'] : 'pending', createdAt: String(row.created_at || '') };
}

async function findChargeOrder(column: 'id' | 'provider_order_id' | 'provider_payment_id', value: string): Promise<ChargeOrder | null> {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const local = Array.from(memoryOrders.values()).find((item) => column === 'id' ? item.id === normalized : column === 'provider_order_id' ? item.providerOrderId === normalized : item.providerPaymentId === normalized);
  if (local) return local;
  const config = supabaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/template_charge_orders?${column}=eq.${encodeURIComponent(normalized)}&limit=1`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Charge order lookup failed with ${response.status}.`);
  const row = ((await response.json()) as Array<Record<string, unknown>>)[0];
  return row ? toChargeOrder(row) : null;
}

export async function findChargeOrderById(id: string): Promise<ChargeOrder | null> { return findChargeOrder('id', id); }
export async function findChargeOrderByProviderOrderId(providerOrderId: string): Promise<ChargeOrder | null> { return findChargeOrder('provider_order_id', providerOrderId); }
export async function findChargeOrderByProviderPaymentId(providerPaymentId: string): Promise<ChargeOrder | null> { return findChargeOrder('provider_payment_id', providerPaymentId); }

export async function attachChargeOrderProvider(orderId: string, providerOrderId: string, providerPaymentId?: string): Promise<void> {
  const existing = memoryOrders.get(orderId);
  if (existing) memoryOrders.set(orderId, { ...existing, providerOrderId, providerPaymentId: providerPaymentId || existing.providerPaymentId });
  const config = supabaseConfig();
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/template_charge_orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider_order_id: providerOrderId, provider_payment_id: providerPaymentId || null, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(`Charge order provider update failed with ${response.status}.`);
}

export async function updateChargeOrderStatus(orderId: string, status: ChargeOrder['status']): Promise<void> {
  const existing = memoryOrders.get(orderId);
  if (existing) memoryOrders.set(orderId, { ...existing, status });
  const config = supabaseConfig();
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/template_charge_orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(`Charge order update failed with ${response.status}.`);
}

export async function redeemGiftCode(userId: string, code: string): Promise<number> {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || normalized.length < 8) return 0;
  const config = supabaseConfig();
  if (!config) {
    const gift = memoryGiftCodes.get(normalized);
    if (!gift || gift.usedBy || (gift.expiresAt && Date.parse(gift.expiresAt) < Date.now())) return 0;
    memoryGiftCodes.set(normalized, { ...gift, usedBy: userId, usedAt: new Date().toISOString() });
    await adjustEntitlement(userId, gift.creditAmount, `gift:${normalized}`, 'gift_code');
    return gift.creditAmount;
  }
  const response = await fetch(`${config.url}/rest/v1/rpc/redeem_template_gift_code`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: normalized, p_user_id: userId }) });
  if (!response.ok) throw new Error(`Gift code redemption failed with ${response.status}.`);
  return Number(await response.json()) || 0;
}

export async function listGiftCodes(): Promise<TemplateGiftCode[]> {
  const config = supabaseConfig();
  if (!config) return Array.from(memoryGiftCodes.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const response = await fetch(`${config.url}/rest/v1/template_gift_codes?select=code,credit_amount,expires_at,used_by,used_at,created_at&order=created_at.desc&limit=200`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Gift code lookup failed with ${response.status}.`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ code: String(row.code || ''), creditAmount: Number(row.credit_amount || 0), expiresAt: String(row.expires_at || '') || undefined, usedBy: String(row.used_by || '') || undefined, usedAt: String(row.used_at || '') || undefined, createdAt: String(row.created_at || '') }));
}

export async function createGiftCode(creditAmount: number, expiresAt?: string): Promise<TemplateGiftCode> {
  const normalizedCredits = Math.max(1, Math.floor(creditAmount));
  const code = `GIFT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const item = { code, creditAmount: normalizedCredits, expiresAt: expiresAt || undefined, createdAt: new Date().toISOString() };
  memoryGiftCodes.set(code, item);
  const config = supabaseConfig();
  if (!config) return item;
  const response = await fetch(`${config.url}/rest/v1/template_gift_codes`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ code: item.code, credit_amount: item.creditAmount, expires_at: item.expiresAt || null, created_at: item.createdAt }) });
  if (!response.ok) throw new Error(`Gift code creation failed with ${response.status}.`);
  return item;
}
