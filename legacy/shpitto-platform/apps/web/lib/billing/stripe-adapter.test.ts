import { describe, expect, it, vi } from "vitest";
import {
  createStripePaymentProviderAdapter,
  createStripeWebhookSignature,
  verifyStripeWebhookSignature,
} from "./stripe-adapter";

describe("Stripe payment provider adapter", () => {
  it("creates a checkout session for one-time purchases", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body || ""));
      expect(body.get("mode")).toBe("payment");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("1990");
      expect(body.get("metadata[creditPackId]")).toBe("pro-250");
      return new Response(
        JSON.stringify({
          id: "cs_test_123",
          url: "https://checkout.stripe.test/cs_test_123",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const adapter = createStripePaymentProviderAdapter({
      config: {
        apiBaseUrl: "https://api.stripe.test",
        secretKey: "sk_test_123",
        webhookSecret: "whsec_test_123",
        publishableKey: "pk_test_123",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.createCheckoutOrder({
      orderId: "order-1",
      userId: "user-1",
      currency: "USD",
      amountMinor: 1990,
      creditPackId: "pro-250",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      metadata: {
        billingMode: "credits",
        productName: "Pro credits",
      },
    });

    expect(result).toEqual({
      provider: "stripe",
      providerOrderId: "cs_test_123",
      checkoutUrl: "https://checkout.stripe.test/cs_test_123",
      clientPayload: {
        publishableKey: "pk_test_123",
      },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("requires a Stripe price id for subscription checkout", async () => {
    const adapter = createStripePaymentProviderAdapter({
      config: {
        apiBaseUrl: "https://api.stripe.test",
        secretKey: "sk_test_123",
        webhookSecret: "whsec_test_123",
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      adapter.createCheckoutOrder({
        orderId: "order-1",
        userId: "user-1",
        currency: "USD",
        amountMinor: 1290,
        planId: "pro-monthly",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: {
          billingMode: "subscription",
        },
      }),
    ).rejects.toThrow(/requires metadata\.stripePriceId/i);
  });

  it("verifies webhook signatures and normalizes checkout events", async () => {
    const rawBody = JSON.stringify({
      id: "evt_123",
      type: "checkout.session.completed",
      created: 1782719203,
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_123",
          metadata: {
            orderId: "order-1",
            creditPackId: "starter-100",
          },
        },
      },
    });
    const timestamp = "1782719203";
    const secret = "whsec_test_123";
    const signature = createStripeWebhookSignature(rawBody, timestamp, secret);

    const adapter = createStripePaymentProviderAdapter({
      config: {
        apiBaseUrl: "https://api.stripe.test",
        secretKey: "sk_test_123",
        webhookSecret: secret,
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const event = await adapter.verifyWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": `t=${timestamp},v1=${signature}`,
        },
      }),
      rawBody,
    );

    expect(event).toMatchObject({
      provider: "stripe",
      providerEventId: "evt_123",
      providerOrderId: "cs_test_123",
      providerCustomerId: "cus_123",
      eventType: "checkout_completed",
      metadata: {
        orderId: "order-1",
        creditPackId: "starter-100",
      },
    });
  });

  it("rejects invalid webhook signatures", () => {
    const rawBody = JSON.stringify({ id: "evt_bad" });
    expect(
      verifyStripeWebhookSignature(rawBody, "t=1782719203,v1=bad-signature", "whsec_test_123"),
    ).toBe(false);
  });

  it("creates customer portal sessions", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          url: "https://billing.stripe.test/portal",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const adapter = createStripePaymentProviderAdapter({
      config: {
        apiBaseUrl: "https://api.stripe.test",
        secretKey: "sk_test_123",
        webhookSecret: "whsec_test_123",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      adapter.getCustomerPortalUrl?.({
        userId: "user-1",
        providerCustomerId: "cus_123",
        returnUrl: "https://example.com/account",
      }),
    ).resolves.toBe("https://billing.stripe.test/portal");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
