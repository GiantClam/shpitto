export type PaymentProviderId =
  | "stripe"
  | "paypal"
  | "polar"
  | "alipay"
  | "wechatpay"
  | "hupijiao"
  | "custom";

export type VerifiedWebhookEventType =
  | "checkout_completed"
  | "payment_succeeded"
  | "payment_failed"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "refund_succeeded";

export type CheckoutOrderInput = {
  orderId: string;
  userId: string;
  currency: string;
  amountMinor: number;
  planId?: string;
  creditPackId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type CheckoutLaunch = {
  provider: PaymentProviderId;
  providerOrderId: string;
  checkoutUrl?: string;
  clientPayload?: Record<string, unknown>;
};

export type VerifiedWebhookEvent = {
  provider: PaymentProviderId;
  providerEventId: string;
  providerOrderId?: string;
  providerCustomerId?: string;
  eventType: VerifiedWebhookEventType;
  occurredAt: string;
  raw: unknown;
  metadata: Record<string, string>;
};

export type PaymentProviderCapabilities = {
  oneTime: boolean;
  subscription: boolean;
  refund: boolean;
  billingPortal: boolean;
};

export interface PaymentProviderAdapter {
  id: PaymentProviderId;
  supports: PaymentProviderCapabilities;
  createCheckoutOrder(input: CheckoutOrderInput): Promise<CheckoutLaunch>;
  verifyWebhook(request: Request, rawBody: string): Promise<VerifiedWebhookEvent>;
  getCustomerPortalUrl?(args: {
    userId: string;
    providerCustomerId: string;
    returnUrl: string;
  }): Promise<string>;
}

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return (
    value === "stripe" ||
    value === "paypal" ||
    value === "polar" ||
    value === "alipay" ||
    value === "wechatpay" ||
    value === "hupijiao" ||
    value === "custom"
  );
}

export function normalizePaymentProviderId(value: unknown): PaymentProviderId | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  return isPaymentProviderId(normalized) ? normalized : undefined;
}

export function normalizeProviderMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [String(key || "").trim(), String(item || "").trim()] as const)
      .filter(([key, item]) => Boolean(key) && Boolean(item)),
  );
}
