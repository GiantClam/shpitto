import {
  BILLING_CURRENCY,
  type BillingPlanCode,
  PREPAID_MONTH_OPTIONS,
  getBillingPlan,
  isPrepaidMonths,
} from "./plans";

export const ANNUAL_PREPAY_DISCOUNT_FACTOR = 0.7;
const DISCOUNT_NUMERATOR = 7;
const DISCOUNT_DENOMINATOR = 10;
const AVERAGE_DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PlanPriceQuote = {
  planCode: BillingPlanCode;
  months: number;
  siteLimit: number;
  currency: typeof BILLING_CURRENCY;
  baseMonthlyPriceMinor: number;
  discountFactor: number;
  payableAmountMinor: number;
  displayMonthlyPriceMinor: number;
  originalAmountMinor: number;
};

export type UpgradeQuoteInput = {
  currentPlanCode: BillingPlanCode;
  targetPlanCode: BillingPlanCode;
  currentPaidAmountMinor: number;
  paidServiceStart: Date;
  paidServiceEnd: Date;
  now: Date;
};

export type UpgradeQuote = {
  currentPlanCode: BillingPlanCode;
  targetPlanCode: BillingPlanCode;
  remainingDays: number;
  remainingMonthsEquivalent: number;
  unusedCreditMinor: number;
  targetPriceForRemainingPeriodMinor: number;
  amountDueMinor: number;
  currency: typeof BILLING_CURRENCY;
};

export function calculatePlanPrice(planCode: BillingPlanCode, months: number): PlanPriceQuote {
  const plan = getRequiredBillingPlan(planCode);

  if (plan.code === "free") {
    return {
      planCode,
      months: 0,
      siteLimit: plan.siteLimit,
      currency: plan.currency,
      baseMonthlyPriceMinor: 0,
      discountFactor: 1,
      payableAmountMinor: 0,
      displayMonthlyPriceMinor: 0,
      originalAmountMinor: 0,
    };
  }

  if (plan.code === "experience") {
    if (months !== 12) {
      throw new Error("Experience plan only supports 12 months.");
    }
    const payableAmountMinor = plan.fixedAmountMinor ?? 19900;
    return {
      planCode,
      months,
      siteLimit: plan.siteLimit,
      currency: plan.currency,
      baseMonthlyPriceMinor: 0,
      discountFactor: 1,
      payableAmountMinor,
      displayMonthlyPriceMinor: Math.round(payableAmountMinor / months),
      originalAmountMinor: payableAmountMinor,
    };
  }

  if (!isPrepaidMonths(months)) {
    throw new Error(`Paid plans only support ${PREPAID_MONTH_OPTIONS.join(", ")} prepaid months.`);
  }

  const originalAmountMinor = plan.baseMonthlyPriceMinor * months;
  const payableAmountMinor = Math.round(
    (originalAmountMinor * DISCOUNT_NUMERATOR) / DISCOUNT_DENOMINATOR,
  );

  return {
    planCode,
    months,
    siteLimit: plan.siteLimit,
    currency: plan.currency,
    baseMonthlyPriceMinor: plan.baseMonthlyPriceMinor,
    discountFactor: ANNUAL_PREPAY_DISCOUNT_FACTOR,
    payableAmountMinor,
    displayMonthlyPriceMinor: Math.round(payableAmountMinor / months),
    originalAmountMinor,
  };
}

export function quotePlanUpgrade(input: UpgradeQuoteInput): UpgradeQuote {
  const currentPlan = getRequiredBillingPlan(input.currentPlanCode);
  const targetPlan = getRequiredBillingPlan(input.targetPlanCode);

  if (targetPlan.siteLimit <= currentPlan.siteLimit) {
    throw new Error("Upgrade target must increase the website quota.");
  }

  const serviceMs = input.paidServiceEnd.getTime() - input.paidServiceStart.getTime();
  const remainingMs = Math.max(0, input.paidServiceEnd.getTime() - input.now.getTime());
  const paidServiceDays = Math.max(1, serviceMs / MS_PER_DAY);
  const remainingDays = remainingMs / MS_PER_DAY;
  const remainingMonthsEquivalent = remainingDays / AVERAGE_DAYS_PER_MONTH;
  const currentDailyValueMinor = input.currentPaidAmountMinor / paidServiceDays;
  const unusedCreditMinor = Math.round(currentDailyValueMinor * remainingDays);
  const targetPriceForRemainingPeriodMinor = Math.round(
    targetPlan.baseMonthlyPriceMinor *
      remainingMonthsEquivalent *
      ANNUAL_PREPAY_DISCOUNT_FACTOR,
  );

  return {
    currentPlanCode: input.currentPlanCode,
    targetPlanCode: input.targetPlanCode,
    remainingDays,
    remainingMonthsEquivalent,
    unusedCreditMinor,
    targetPriceForRemainingPeriodMinor,
    amountDueMinor: Math.max(0, targetPriceForRemainingPeriodMinor - unusedCreditMinor),
    currency: BILLING_CURRENCY,
  };
}

function getRequiredBillingPlan(planCode: BillingPlanCode) {
  const plan = getBillingPlan(planCode);
  if (!plan) {
    throw new Error(`Unknown billing plan: ${planCode}`);
  }
  return plan;
}
