"use client";

import { useState } from "react";

export function CheckoutButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "starter-100" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "Checkout could not be started.");
      window.location.assign(payload.url);
    } catch (reason) {
      setError(String((reason as Error).message || reason));
    } finally {
      setLoading(false);
    }
  }

  return <><button type="button" className="button-primary" disabled={loading} onClick={checkout}>{loading ? "Loading..." : label}</button>{error ? <p className="auth-hint" role="alert">{error}</p> : null}</>;
}
