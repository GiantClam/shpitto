import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, getSupabaseAdminConfig } from "../supabase/admin.ts";
import type { BillingEntitlement, EntitlementStatus } from "./entitlements.ts";
import { FREE_TRIAL_DAYS } from "./entitlements.ts";
import type { BillingPlanCode } from "./plans.ts";
import { getBillingPlan, getBillingPlans } from "./plans.ts";
import type { PlanPriceQuote } from "./pricing.ts";

type SupabaseRow = Record<string, any>;

export type CheckoutPurpose = "new_purchase" | "upgrade" | "renewal";
export type CheckoutStatus = "created" | "paypal_created" | "paid" | "cancelled" | "expired";

export type CheckoutSession = {
  id: string;
  ownerUserId: string;
  purpose: CheckoutPurpose;
  planCode: BillingPlanCode;
  months: number;
  siteLimit: number;
  currency: string;
  amountMinor: number;
  discountFactor: number;
  priceSnapshot: unknown;
  status: CheckoutStatus;
  paypalOrderId?: string;
  paypalSubscriptionId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type LedgerEntryInput = {
  ownerUserId: string;
  entitlementId?: string;
  checkoutSessionId?: string;
  entryType: string;
  amountMinor: number;
  currency: string;
  serviceDays?: number;
  serviceStart?: Date;
  serviceEnd?: Date;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalEventId?: string;
  metadata?: unknown;
};

export type ActivateCheckoutPaymentInput = {
  session: CheckoutSession;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalEventId?: string;
  metadata?: unknown;
  now?: Date;
};

export function isBillingStorageConfigured(): boolean {
  return Boolean(getSupabaseAdminConfig());
}

export async function ensureBillingStorageReady() {
  if (!isBillingStorageConfigured()) {
    throw new Error("Billing storage is not configured. Missing Supabase service-role environment variables.");
  }
}

export async function seedBillingPlans() {
  const supabase = getBillingClient();
  const timestamp = new Date().toISOString();
  const rows = getBillingPlans().map((plan) => ({
    id: plan.code,
    code: plan.code,
    name: plan.name,
    site_limit: plan.siteLimit,
    base_monthly_price_minor: plan.baseMonthlyPriceMinor,
    currency: plan.currency,
    min_months: plan.minMonths,
    is_one_time: plan.isOneTime,
    active: true,
    metadata: { tagline: plan.tagline, trialDays: plan.trialDays, fixedAmountMinor: plan.fixedAmountMinor },
    created_at: timestamp,
    updated_at: timestamp,
  }));

  const { error } = await supabase.from("shpitto_billing_plans").upsert(rows, { onConflict: "code" });
  if (error) throw error;
}

export async function reserveCreatedProjectUsage(params: {
  ownerUserId: string;
  sourceProjectId: string;
  projectName?: string;
  now?: Date;
}) {
  const supabase = getBillingClient();
  const now = params.now || new Date();
  const timestamp = now.toISOString();
  const { error } = await supabase.from("shpitto_billing_project_usages").upsert(
    {
      owner_user_id: params.ownerUserId,
      source_app: "shpitto",
      source_project_id: params.sourceProjectId,
      project_name: String(params.projectName || "").trim() || "Untitled Project",
      project_status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    },
    { onConflict: "owner_user_id,source_app,source_project_id" },
  );
  if (error) throw error;
}

export async function releaseCreatedProjectUsageReservation(params: {
  ownerUserId: string;
  sourceProjectId: string;
}) {
  const supabase = getBillingClient();
  const { error } = await supabase
    .from("shpitto_billing_project_usages")
    .delete()
    .eq("owner_user_id", params.ownerUserId)
    .eq("source_app", "shpitto")
    .eq("source_project_id", params.sourceProjectId)
    .is("cleanup_completed_at", null);
  if (error) throw error;
}

export async function countCreatedProjects(ownerUserId: string): Promise<number> {
  const supabase = getBillingClientOrNull();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("shpitto_billing_project_usages")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("source_app", "shpitto")
    .is("cleanup_completed_at", null);
  if (error) throw error;
  return count || 0;
}

export async function hasBillableProject(ownerUserId: string, projectId: string): Promise<boolean> {
  const supabase = getBillingClientOrNull();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("shpitto_billing_project_usages")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("source_app", "shpitto")
    .eq("source_project_id", projectId)
    .is("cleanup_completed_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function getLatestEntitlement(ownerUserId: string): Promise<BillingEntitlement | undefined> {
  const supabase = getBillingClientOrNull();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from("shpitto_entitlements")
    .select("plan_code,status,site_limit,valid_from,valid_until,current_period_months")
    .eq("owner_user_id", ownerUserId)
    .order("valid_until", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEntitlement(data) : undefined;
}

export async function grantFreeTrialIfMissing(ownerUserId: string, now = new Date()): Promise<BillingEntitlement | undefined> {
  const existing = await getLatestEntitlement(ownerUserId);
  if (existing) return existing;

  const supabase = getBillingClientOrNull();
  if (!supabase) return undefined;

  const plan = getBillingPlan("free");
  if (!plan) throw new Error("Free billing plan is not configured.");

  const validUntil = new Date(now.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const timestamp = now.toISOString();
  const { error } = await supabase.from("shpitto_entitlements").insert({
    id: randomUUID(),
    owner_user_id: ownerUserId,
    plan_code: "free",
    status: "trialing",
    site_limit: plan.siteLimit,
    valid_from: timestamp,
    valid_until: validUntil.toISOString(),
    current_period_months: 0,
    auto_renew: false,
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw error;

  return {
    planCode: "free",
    status: "trialing",
    siteLimit: plan.siteLimit,
    validFrom: now,
    validUntil,
  };
}

export async function createCheckoutSession(params: {
  ownerUserId: string;
  purpose: CheckoutPurpose;
  quote: PlanPriceQuote;
  priceSnapshot?: unknown;
  now?: Date;
  ttlMinutes?: number;
}): Promise<CheckoutSession> {
  const supabase = getBillingClient();
  const now = params.now || new Date();
  const expiresAt = new Date(now.getTime() + (params.ttlMinutes ?? 30) * 60 * 1000);
  const row = {
    id: randomUUID(),
    owner_user_id: params.ownerUserId,
    purpose: params.purpose,
    plan_code: params.quote.planCode,
    months: params.quote.months,
    site_limit: params.quote.siteLimit,
    currency: params.quote.currency,
    amount_minor: params.quote.payableAmountMinor,
    discount_factor: params.quote.discountFactor,
    price_snapshot: params.priceSnapshot || params.quote,
    status: "created",
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data, error } = await supabase.from("shpitto_checkout_sessions").insert(row).select("*").single();
  if (error) throw error;
  return mapCheckoutSession(data);
}

export async function getCheckoutSessionById(id: string): Promise<CheckoutSession | undefined> {
  const supabase = getBillingClientOrNull();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from("shpitto_checkout_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCheckoutSession(data) : undefined;
}

export async function getCheckoutSessionByPayPalOrderId(paypalOrderId: string): Promise<CheckoutSession | undefined> {
  const supabase = getBillingClientOrNull();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from("shpitto_checkout_sessions")
    .select("*")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCheckoutSession(data) : undefined;
}

export async function attachPayPalOrderToCheckoutSession(
  sessionId: string,
  paypalOrderId: string,
  priceSnapshot?: unknown,
): Promise<void> {
  const supabase = getBillingClient();
  const session = priceSnapshot === undefined ? undefined : await getCheckoutSessionById(sessionId);
  const nextPriceSnapshot =
    priceSnapshot === undefined
      ? undefined
      : {
          ...(typeof session?.priceSnapshot === "object" && session.priceSnapshot ? session.priceSnapshot : {}),
          paypalSettlement: priceSnapshot,
        };

  const patch: Record<string, unknown> = {
    paypal_order_id: paypalOrderId,
    status: "paypal_created",
    updated_at: new Date().toISOString(),
  };
  if (nextPriceSnapshot !== undefined) patch.price_snapshot = nextPriceSnapshot;

  const { error } = await supabase.from("shpitto_checkout_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

export async function markCheckoutSessionPaid(sessionId: string): Promise<void> {
  const supabase = getBillingClient();
  const { error } = await supabase
    .from("shpitto_checkout_sessions")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function upsertPaidEntitlement(params: {
  ownerUserId: string;
  planCode: BillingPlanCode;
  siteLimit: number;
  months: number;
  now?: Date;
  validUntil?: Date;
}): Promise<{ id: string; entitlement: BillingEntitlement }> {
  const supabase = getBillingClient();
  const now = params.now || new Date();
  const validUntil = params.validUntil ? new Date(params.validUntil) : new Date(now);
  if (!params.validUntil) validUntil.setMonth(validUntil.getMonth() + params.months);

  const id = randomUUID();
  const timestamp = now.toISOString();
  const { error } = await supabase.from("shpitto_entitlements").insert({
    id,
    owner_user_id: params.ownerUserId,
    plan_code: params.planCode,
    status: "active",
    site_limit: params.siteLimit,
    valid_from: timestamp,
    valid_until: validUntil.toISOString(),
    current_period_months: params.months,
    auto_renew: false,
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw error;

  return {
    id,
    entitlement: {
      planCode: params.planCode,
      status: "active",
      siteLimit: params.siteLimit,
      validFrom: now,
      validUntil,
      currentPeriodMonths: params.months,
    },
  };
}

export async function activateCheckoutSessionPayment(input: ActivateCheckoutPaymentInput): Promise<{
  entitlementId: string;
  entitlement: BillingEntitlement;
}> {
  if (input.session.status === "paid") throw new Error("Checkout session is already paid.");
  if (input.session.expiresAt.getTime() <= Date.now()) throw new Error("Checkout session expired.");

  const now = input.now || new Date();
  const serviceEnd = resolveCheckoutServiceEnd(input.session, now);
  const { id: entitlementId, entitlement } = await upsertPaidEntitlement({
    ownerUserId: input.session.ownerUserId,
    planCode: input.session.planCode,
    siteLimit: input.session.siteLimit,
    months: input.session.months,
    now,
    validUntil: serviceEnd,
  });
  await createLedgerEntry({
    ownerUserId: input.session.ownerUserId,
    entitlementId,
    checkoutSessionId: input.session.id,
    entryType: input.session.purpose,
    amountMinor: input.session.amountMinor,
    currency: input.session.currency,
    serviceDays: Math.max(0, Math.round((entitlement.validUntil.getTime() - entitlement.validFrom.getTime()) / 86400000)),
    serviceStart: entitlement.validFrom,
    serviceEnd: entitlement.validUntil,
    paypalOrderId: input.paypalOrderId || input.session.paypalOrderId,
    paypalCaptureId: input.paypalCaptureId,
    paypalEventId: input.paypalEventId,
    metadata: input.metadata,
  });
  await markCheckoutSessionPaid(input.session.id);

  return { entitlementId, entitlement };
}

export async function createLedgerEntry(input: LedgerEntryInput): Promise<string> {
  const supabase = getBillingClient();
  if (input.paypalCaptureId) {
    const { data: existing, error: existingError } = await supabase
      .from("shpitto_billing_ledger")
      .select("id")
      .eq("paypal_capture_id", input.paypalCaptureId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return String(existing.id);
  }

  const id = randomUUID();
  const { error } = await supabase.from("shpitto_billing_ledger").insert({
    id,
    owner_user_id: input.ownerUserId,
    entitlement_id: input.entitlementId || null,
    checkout_session_id: input.checkoutSessionId || null,
    entry_type: input.entryType,
    amount_minor: input.amountMinor,
    currency: input.currency,
    service_days: input.serviceDays || 0,
    service_start: input.serviceStart?.toISOString() || null,
    service_end: input.serviceEnd?.toISOString() || null,
    paypal_order_id: input.paypalOrderId || null,
    paypal_capture_id: input.paypalCaptureId || null,
    paypal_event_id: input.paypalEventId || null,
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}

export async function recordPayPalEvent(params: {
  id: string;
  eventType: string;
  resourceId?: string;
  payload: unknown;
  processingError?: string;
  processedAt?: Date;
}): Promise<void> {
  const supabase = getBillingClient();
  const { error } = await supabase.from("shpitto_paypal_events").upsert(
    {
      id: params.id,
      event_type: params.eventType,
      resource_id: params.resourceId || null,
      payload: params.payload || {},
      processed_at: params.processedAt?.toISOString() || null,
      processing_error: params.processingError || null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

function getBillingClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Billing storage is not configured. Missing Supabase service-role environment variables.");
  }
  return supabase;
}

function getBillingClientOrNull() {
  return createSupabaseAdminClient();
}

function mapEntitlement(row: SupabaseRow): BillingEntitlement {
  return {
    planCode: String(row.plan_code || "free") as BillingPlanCode,
    status: String(row.status || "expired") as EntitlementStatus,
    siteLimit: Number(row.site_limit || 0),
    validFrom: new Date(String(row.valid_from || "")),
    validUntil: new Date(String(row.valid_until || "")),
    currentPeriodMonths: Number(row.current_period_months || 0) || undefined,
  };
}

function mapCheckoutSession(row: SupabaseRow): CheckoutSession {
  return {
    id: String(row.id || ""),
    ownerUserId: String(row.owner_user_id || ""),
    purpose: String(row.purpose || "new_purchase") as CheckoutPurpose,
    planCode: String(row.plan_code || "free") as BillingPlanCode,
    months: Number(row.months || 0),
    siteLimit: Number(row.site_limit || 0),
    currency: String(row.currency || ""),
    amountMinor: Number(row.amount_minor || 0),
    discountFactor: Number(row.discount_factor || 1),
    priceSnapshot: row.price_snapshot || {},
    status: String(row.status || "created") as CheckoutStatus,
    paypalOrderId: String(row.paypal_order_id || "") || undefined,
    paypalSubscriptionId: String(row.paypal_subscription_id || "") || undefined,
    expiresAt: new Date(String(row.expires_at || "")),
    createdAt: new Date(String(row.created_at || "")),
    updatedAt: new Date(String(row.updated_at || "")),
  };
}

function resolveCheckoutServiceEnd(session: CheckoutSession, now: Date): Date | undefined {
  if (session.purpose !== "upgrade") return undefined;
  const snapshot = session.priceSnapshot as {
    entitlement?: {
      validUntil?: string | Date;
    };
  };
  const existingEnd = snapshot?.entitlement?.validUntil ? new Date(snapshot.entitlement.validUntil) : null;
  if (!existingEnd || Number.isNaN(existingEnd.getTime()) || existingEnd.getTime() <= now.getTime()) {
    throw new Error("Cannot activate upgrade because the current service period is expired.");
  }
  return existingEnd;
}
