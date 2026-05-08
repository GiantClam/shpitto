export const BILLING_CURRENCY = "CNY";

export const PREPAID_MONTH_OPTIONS = [12, 24, 36, 48] as const;

export type PrepaidMonths = (typeof PREPAID_MONTH_OPTIONS)[number];

export type BillingPlanCode = "free" | "experience" | "starter" | "growth" | "scale";

export type BillingPlan = {
  code: BillingPlanCode;
  name: string;
  tagline: string;
  siteLimit: number;
  currency: typeof BILLING_CURRENCY;
  baseMonthlyPriceMinor: number;
  minMonths: number;
  trialDays?: number;
  fixedAmountMinor?: number;
  isOneTime: boolean;
  highlighted?: boolean;
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    code: "free",
    name: "Free",
    tagline: "7-day trial",
    siteLimit: 1,
    currency: BILLING_CURRENCY,
    baseMonthlyPriceMinor: 0,
    minMonths: 0,
    trialDays: 7,
    isOneTime: true,
  },
  {
    code: "experience",
    name: "Experience",
    tagline: "One-site annual pass",
    siteLimit: 1,
    currency: BILLING_CURRENCY,
    baseMonthlyPriceMinor: 0,
    minMonths: 12,
    fixedAmountMinor: 19900,
    isOneTime: true,
  },
  {
    code: "starter",
    name: "Starter",
    tagline: "Personal and small teams",
    siteLimit: 3,
    currency: BILLING_CURRENCY,
    baseMonthlyPriceMinor: 4900,
    minMonths: 12,
    isOneTime: false,
  },
  {
    code: "growth",
    name: "Growth",
    tagline: "Agencies and studios",
    siteLimit: 50,
    currency: BILLING_CURRENCY,
    baseMonthlyPriceMinor: 9900,
    minMonths: 12,
    isOneTime: false,
    highlighted: true,
  },
  {
    code: "scale",
    name: "Scale",
    tagline: "Bulk delivery teams",
    siteLimit: 100,
    currency: BILLING_CURRENCY,
    baseMonthlyPriceMinor: 19900,
    minMonths: 12,
    isOneTime: false,
  },
];

export function getBillingPlans(): BillingPlan[] {
  return BILLING_PLANS.map((plan) => ({ ...plan }));
}

export function getBillingPlan(code: string): BillingPlan | undefined {
  return BILLING_PLANS.find((plan) => plan.code === code);
}

export function isBillingPlanCode(value: string): value is BillingPlanCode {
  return Boolean(getBillingPlan(value));
}

export function isPrepaidMonths(value: number): value is PrepaidMonths {
  return PREPAID_MONTH_OPTIONS.includes(value as PrepaidMonths);
}
