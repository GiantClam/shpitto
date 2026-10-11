"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PAID_BILLING_DISABLED_MESSAGE } from "@/lib/billing/config";
import { PREPAID_MONTH_OPTIONS, type BillingPlanCode } from "@/lib/billing/plans";

type BillingCheckoutPanelProps = {
  initialPlanCode: BillingPlanCode;
  initialMonths: number;
  billingEnabled: boolean;
};

type CheckoutResponse = {
  ok: boolean;
  checkoutSession?: {
    id: string;
  };
  error?: string;
};

type PayPalOrderResponse = {
  ok: boolean;
  approveUrl?: string;
  orderId?: string;
  error?: string;
};

export function BillingCheckoutPanel({
  initialPlanCode,
  initialMonths,
  billingEnabled,
}: BillingCheckoutPanelProps) {
  const [planCode, setPlanCode] = useState<BillingPlanCode>(initialPlanCode);
  const [months, setMonths] = useState(initialMonths);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canCheckout = useMemo(() => billingEnabled && planCode !== "free", [billingEnabled, planCode]);

  async function handleCheckout() {
    if (!canCheckout || loading) return;
    setLoading(true);
    setError("");
    try {
      const checkoutRes = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode, months }),
      });
      const checkoutData = (await checkoutRes.json()) as CheckoutResponse;
      if (!checkoutRes.ok || !checkoutData.ok || !checkoutData.checkoutSession?.id) {
        throw new Error(checkoutData.error || "Failed to create checkout session.");
      }

      const orderRes = await fetch("/api/billing/paypal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: checkoutData.checkoutSession.id }),
      });
      const orderData = (await orderRes.json()) as PayPalOrderResponse;
      if (!orderRes.ok || !orderData.ok || !orderData.approveUrl) {
        throw new Error(orderData.error || "Failed to create PayPal order.");
      }

      window.location.assign(orderData.approveUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--shp-border)] bg-white/80 p-7 shadow-[var(--shp-shadow-soft)]">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-hot)]">Checkout</p>
      <h2 className="mt-2 text-2xl font-black">Start a prepaid PayPal order</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--shp-muted)]">
        The server creates a price snapshot first, then creates a PayPal Orders API checkout. Amounts sent from the
        browser are ignored.
      </p>

      {!billingEnabled ? (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {PAID_BILLING_DISABLED_MESSAGE}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-bold">
          <span>Plan</span>
          <select
            value={planCode}
            onChange={(event) => setPlanCode(event.target.value as BillingPlanCode)}
            disabled={!billingEnabled}
            className="h-12 w-full rounded-xl border border-[var(--shp-border)] bg-white px-3"
          >
            <option value="experience">Experience</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="scale">Scale</option>
          </select>
        </label>

        <label className="space-y-2 text-sm font-bold">
          <span>Prepaid months</span>
          <select
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
            disabled={!billingEnabled || planCode === "experience"}
            className="h-12 w-full rounded-xl border border-[var(--shp-border)] bg-white px-3 disabled:opacity-60"
          >
            {(planCode === "experience" ? [12] : PREPAID_MONTH_OPTIONS).map((option) => (
              <option key={option} value={option}>
                {option} months
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void handleCheckout()}
        disabled={!canCheckout || loading}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--shp-primary)] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {billingEnabled ? "Continue to PayPal" : "PayPal temporarily unavailable"}
      </button>
    </section>
  );
}
