import { describe, expect, it } from "vitest";
import { BillingRuleEngine } from "./billing-rule-engine";

describe("BillingRuleEngine", () => {
  it("maps a fluxkreafree credit-pack payment into normalized billing records", () => {
    const engine = new BillingRuleEngine();

    const result = engine.applyEvent({
      orderId: "order-1",
      userId: "user-1",
      provider: "stripe",
      providerEventId: "evt_1",
      providerOrderId: "cs_test_1",
      creditPackId: "starter-100",
      eventType: "payment_succeeded",
      amountMinor: 990,
      metadata: {},
    });

    expect(result.applied).toBe(true);
    expect(result.creditDelta).toBe(100);
    expect(result.grants).toEqual([]);
    expect(result.normalizedRecords.userBilling).toMatchObject({
      state: "paid",
      type: "credit_purchase",
    });
    expect(result.preservedSourceModels).toContain("ChargeOrder");
    expect(result.preservedSourceModels).toContain("UserCreditTransaction");
  });

  it("skips a duplicate webhook application using the idempotency key", () => {
    const engine = new BillingRuleEngine();
    const input = {
      orderId: "order-1",
      userId: "user-1",
      provider: "stripe" as const,
      providerEventId: "evt_1",
      providerOrderId: "cs_test_1",
      creditPackId: "starter-100",
      eventType: "payment_succeeded" as const,
      amountMinor: 990,
      metadata: {},
    };

    const first = engine.applyEvent(input);
    const second = engine.applyEvent(input);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.normalizedRecords.userBilling).toMatchObject({
      state: "duplicate",
      type: "idempotent_skip",
    });
  });

  it("supports subscription-state events for injected catalog items", () => {
    const engine = new BillingRuleEngine([
      {
        id: "pro-monthly",
        title: "Pro Monthly",
        amountMinor: 1290,
        originalAmountMinor: 1290,
        creditDelta: 0,
        currency: "USD",
        kind: "plan",
        billingMode: "subscription",
        message: "Subscription plan",
        localeTitles: { en: "Pro Monthly" },
        providerDefaults: ["stripe"],
      },
    ]);

    const result = engine.applyEvent({
      orderId: "order-sub-1",
      userId: "user-1",
      provider: "stripe",
      providerEventId: "evt_sub_1",
      providerOrderId: "sub_1",
      planId: "pro-monthly",
      eventType: "subscription_updated",
      amountMinor: 1290,
      metadata: {},
    });

    expect(result.applied).toBe(true);
    expect(result.creditDelta).toBe(0);
    expect(result.subscriptionState).toBe("active");
    expect(result.grants).toEqual([{ key: "plan:pro-monthly", quantity: 1 }]);
  });

  it("rejects events without provider-side idempotency identifiers", () => {
    const engine = new BillingRuleEngine();

    expect(() =>
      engine.applyEvent({
        orderId: "order-1",
        userId: "user-1",
        provider: "stripe",
        creditPackId: "starter-100",
        eventType: "payment_succeeded",
        amountMinor: 990,
        metadata: {},
      }),
    ).toThrow(/providerEventId or providerOrderId/);
  });
});
