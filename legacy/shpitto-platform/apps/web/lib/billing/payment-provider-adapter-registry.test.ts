import { describe, expect, it, vi } from "vitest";
import { PaymentProviderAdapterRegistry } from "./payment-provider-adapter-registry";
import type {
  PaymentProviderAdapter,
  VerifiedWebhookEvent,
} from "./payment-provider-adapter";

function createAdapter(id: PaymentProviderAdapter["id"]): PaymentProviderAdapter {
  return {
    id,
    supports: {
      oneTime: true,
      subscription: id === "stripe",
      refund: true,
      billingPortal: id === "stripe",
    },
    createCheckoutOrder: vi.fn(async (input) => ({
      provider: id,
      providerOrderId: `${id}-${input.orderId}`,
      checkoutUrl: `https://checkout.example.com/${id}/${input.orderId}`,
    })),
    verifyWebhook: vi.fn(async (): Promise<VerifiedWebhookEvent> => ({
      provider: id,
      providerEventId: `${id}-event-1`,
      providerOrderId: `${id}-order-1`,
      eventType: "payment_succeeded",
      occurredAt: "2026-06-29T00:00:00.000Z",
      raw: {},
      metadata: {},
    })),
  };
}

describe("PaymentProviderAdapterRegistry", () => {
  it("dispatches checkout creation to the requested adapter", async () => {
    const stripe = createAdapter("stripe");
    const paypal = createAdapter("paypal");
    const registry = new PaymentProviderAdapterRegistry([stripe, paypal]);

    const result = await registry.createCheckoutOrder("paypal", {
      orderId: "order-123",
      userId: "user-1",
      currency: "USD",
      amountMinor: 1990,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      metadata: { catalogItemId: "pro-250" },
    });

    expect(result.provider).toBe("paypal");
    expect(result.providerOrderId).toBe("paypal-order-123");
    expect(paypal.createCheckoutOrder).toHaveBeenCalledOnce();
    expect(stripe.createCheckoutOrder).not.toHaveBeenCalled();
  });

  it("dispatches webhook verification to the requested adapter", async () => {
    const stripe = createAdapter("stripe");
    const registry = new PaymentProviderAdapterRegistry([stripe]);

    const event = await registry.verifyWebhook(
      "stripe",
      new Request("https://example.com/webhook", { method: "POST" }),
      "{}",
    );

    expect(event.provider).toBe("stripe");
    expect(event.eventType).toBe("payment_succeeded");
    expect(stripe.verifyWebhook).toHaveBeenCalledOnce();
  });

  it("fails fast when a provider is not registered", async () => {
    const registry = new PaymentProviderAdapterRegistry();

    await expect(
      registry.createCheckoutOrder("stripe", {
        orderId: "order-123",
        userId: "user-1",
        currency: "USD",
        amountMinor: 990,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: {},
      }),
    ).rejects.toThrow(/not registered/);
  });
});
