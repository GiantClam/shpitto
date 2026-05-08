import { afterEach, describe, expect, it } from "vitest";
import { formatPayPalAmount, getPayPalConfig, resolvePayPalSettlementCurrency } from "./paypal";

describe("PayPal amount formatting", () => {
  const previousCurrency = process.env.PAYPAL_CURRENCY;
  const previousRate = process.env.SHPITTO_BILLING_CNY_TO_USD_RATE;
  const previousClientId = process.env.PAYPAL_CLIENT_ID;
  const previousClientSecret = process.env.PAYPAL_CLIENT_SECRET;

  afterEach(() => {
    process.env.PAYPAL_CURRENCY = previousCurrency;
    process.env.SHPITTO_BILLING_CNY_TO_USD_RATE = previousRate;
    process.env.PAYPAL_CLIENT_ID = previousClientId;
    process.env.PAYPAL_CLIENT_SECRET = previousClientSecret;
  });

  it("formats USD minor units into PayPal decimal strings", () => {
    process.env.PAYPAL_CURRENCY = "USD";

    expect(formatPayPalAmount({ amountMinor: 41160, currency: "USD" })).toMatchObject({
      currency: "USD",
      value: "411.60",
      rate: 1,
    });
  });

  it("requires a server-side CNY to USD conversion rate when PayPal settles in USD", () => {
    process.env.PAYPAL_CURRENCY = "USD";
    delete process.env.SHPITTO_BILLING_CNY_TO_USD_RATE;

    expect(() => formatPayPalAmount({ amountMinor: 41160, currency: "CNY" })).toThrow(/CNY to USD/);
  });

  it("converts CNY display amounts to USD settlement amounts with the configured rate", () => {
    process.env.PAYPAL_CURRENCY = "USD";
    process.env.SHPITTO_BILLING_CNY_TO_USD_RATE = "0.14";

    expect(formatPayPalAmount({ amountMinor: 41160, currency: "CNY" })).toMatchObject({
      currency: "USD",
      value: "57.62",
      sourceCurrency: "CNY",
      sourceAmountMinor: 41160,
      rate: 0.14,
    });
  });

  it("rejects non-USD PayPal settlement configuration", () => {
    process.env.PAYPAL_CURRENCY = "CNY";

    expect(() => resolvePayPalSettlementCurrency()).toThrow(/must be USD/);
  });

  it("returns a USD PayPal config when credentials are present", () => {
    process.env.PAYPAL_CURRENCY = "USD";
    process.env.PAYPAL_CLIENT_ID = "client";
    process.env.PAYPAL_CLIENT_SECRET = "secret";

    expect(getPayPalConfig()).toMatchObject({ currency: "USD" });
  });
});
