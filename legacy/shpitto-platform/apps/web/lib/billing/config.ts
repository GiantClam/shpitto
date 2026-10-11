const DISABLED_VALUES = new Set(["0", "false", "off", "no", "disabled"]);

export const PAID_BILLING_DISABLED_MESSAGE =
  "Paid plans are temporarily disabled. Only the free plan is available.";

export function isPaidBillingEnabled(): boolean {
  const raw = String(process.env.SHPITTO_BILLING_PAID_PLANS_ENABLED || "1").trim().toLowerCase();
  return !DISABLED_VALUES.has(raw);
}
