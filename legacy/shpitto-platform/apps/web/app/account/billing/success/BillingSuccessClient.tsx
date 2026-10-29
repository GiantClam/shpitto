"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type CaptureResponse = {
  ok: boolean;
  alreadyPaid?: boolean;
  entitlement?: {
    planCode: string;
    siteLimit: number;
    validUntil: string;
  };
  error?: string;
};

export function BillingSuccessClient({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(Boolean(orderId));
  const [result, setResult] = useState<CaptureResponse | null>(null);

  useEffect(() => {
    if (!orderId) {
      setResult({ ok: false, error: "Missing PayPal order token." });
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function capture() {
      try {
        const response = await fetch(`/api/billing/paypal/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST",
        });
        const data = (await response.json()) as CaptureResponse;
        if (!cancelled) setResult(data);
      } catch (error) {
        if (!cancelled) {
          setResult({ ok: false, error: error instanceof Error ? error.message : "Capture failed." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void capture();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const ok = Boolean(result?.ok);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fffaf5,#f1e8df)] px-6 py-12 text-[var(--shp-text)]">
      <section className="w-full max-w-xl rounded-[2rem] border border-[var(--shp-border)] bg-white/85 p-8 text-center shadow-[var(--shp-shadow)]">
        {loading ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--shp-primary)]" />
        ) : ok ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-rose-600" />
        )}

        <h1 className="mt-5 text-3xl font-black">
          {loading ? "Capturing PayPal payment" : ok ? "Payment captured" : "Payment needs attention"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--shp-muted)]">
          {loading
            ? "Do not close this page. Shpitto is confirming the order with PayPal."
            : ok
              ? result?.alreadyPaid
                ? "This PayPal order was already captured. Your billing state is unchanged."
                : `Your ${result?.entitlement?.planCode || "paid"} plan is active.`
              : result?.error || "The payment could not be captured."}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/account/billing" className="rounded-full bg-[var(--shp-primary)] px-6 py-3 font-black text-white">
            View billing
          </Link>
          <Link href="/launch-center" className="rounded-full border border-[var(--shp-border)] bg-white px-6 py-3 font-black">
            Continue building
          </Link>
        </div>
      </section>
    </main>
  );
}
