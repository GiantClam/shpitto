import { describe, expect, it } from "vitest";
import { calculatePlanPrice, quotePlanUpgrade } from "./pricing";

describe("billing pricing", () => {
  it("calculates 12 month prepaid prices with the 30 percent discount", () => {
    expect(calculatePlanPrice("starter", 12)).toMatchObject({
      payableAmountMinor: 41160,
      displayMonthlyPriceMinor: 3430,
      originalAmountMinor: 58800,
      siteLimit: 3,
    });
    expect(calculatePlanPrice("growth", 12)).toMatchObject({
      payableAmountMinor: 83160,
      displayMonthlyPriceMinor: 6930,
      originalAmountMinor: 118800,
      siteLimit: 50,
    });
    expect(calculatePlanPrice("scale", 12)).toMatchObject({
      payableAmountMinor: 167160,
      displayMonthlyPriceMinor: 13930,
      originalAmountMinor: 238800,
      siteLimit: 100,
    });
  });

  it("keeps the experience plan as a fixed annual one-time price", () => {
    expect(calculatePlanPrice("experience", 12)).toMatchObject({
      payableAmountMinor: 19900,
      displayMonthlyPriceMinor: 1658,
      siteLimit: 1,
    });
  });

  it("rejects unsupported paid durations", () => {
    expect(() => calculatePlanPrice("starter", 1)).toThrow(/12, 24, 36, 48/);
    expect(() => calculatePlanPrice("experience", 24)).toThrow(/only supports 12 months/);
  });

  it("quotes immediate upgrades from unused credit and remaining period price", () => {
    const quote = quotePlanUpgrade({
      currentPlanCode: "starter",
      targetPlanCode: "growth",
      currentPaidAmountMinor: 41160,
      paidServiceStart: new Date("2026-01-01T00:00:00.000Z"),
      paidServiceEnd: new Date("2027-01-01T00:00:00.000Z"),
      now: new Date("2026-07-01T12:00:00.000Z"),
    });

    expect(quote.remainingDays).toBeCloseTo(183.5, 1);
    expect(quote.unusedCreditMinor).toBeGreaterThan(20000);
    expect(quote.targetPriceForRemainingPeriodMinor).toBeGreaterThan(quote.unusedCreditMinor);
    expect(quote.amountDueMinor).toBe(
      quote.targetPriceForRemainingPeriodMinor - quote.unusedCreditMinor,
    );
  });
});
