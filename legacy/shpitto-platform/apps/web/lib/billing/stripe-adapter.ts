import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutLaunch,
  CheckoutOrderInput,
  PaymentProviderAdapter,
  VerifiedWebhookEvent,
  VerifiedWebhookEventType,
} from "./payment-provider-adapter.ts";
import { normalizeProviderMetadata } from "./payment-provider-adapter.ts";

type StripeConfig = {
  apiBaseUrl: string;
  secretKey: string;
  webhookSecret: string;
  publishableKey?: string;
};

type StripeEventEnvelope = {
  id?: string;
  type?: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
};

type StripeCheckoutSessionRecord = {
  id?: string;
  url?: string;
};

type StripePortalSessionRecord = {
  url?: string;
};

type StripeSignatureParts = {
  timestamp: string;
  signatures: string[];
};

const STRIPE_API_BASE_URL = "https://api.stripe.com";

export function getStripeConfig(): StripeConfig {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const apiBaseUrl = String(process.env.STRIPE_API_BASE_URL || STRIPE_API_BASE_URL).trim() || STRIPE_API_BASE_URL;
  const publishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim() || undefined;

  if (!secretKey) {
    throw new Error("Stripe is not configured. Missing STRIPE_SECRET_KEY.");
  }
  if (!webhookSecret) {
    throw new Error("Stripe is not configured. Missing STRIPE_WEBHOOK_SECRET.");
  }

  return {
    apiBaseUrl,
    secretKey,
    webhookSecret,
    publishableKey,
  };
}

function mapStripeEventType(value: string): VerifiedWebhookEventType {
  switch (value) {
    case "checkout.session.completed":
      return "checkout_completed";
    case "payment_intent.succeeded":
    case "invoice.payment_succeeded":
      return "payment_succeeded";
    case "payment_intent.payment_failed":
    case "invoice.payment_failed":
      return "payment_failed";
    case "customer.subscription.created":
      return "subscription_created";
    case "customer.subscription.updated":
      return "subscription_updated";
    case "customer.subscription.deleted":
      return "subscription_cancelled";
    case "charge.refunded":
      return "refund_succeeded";
    default:
      throw new Error(`Unsupported Stripe webhook event: ${value}`);
  }
}

function encodeForm(params: Record<string, string | undefined>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    form.set(key, value);
  }
  return form;
}

function parseStripeSignatureHeader(value: string): StripeSignatureParts {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, payload] = part.split("=", 2);
    if (key === "t") timestamp = payload || "";
    if (key === "v1" && payload) signatures.push(payload);
  }
  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header.");
  }
  return { timestamp, signatures };
}

export function createStripeWebhookSignature(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyStripeWebhookSignature(rawBody: string, headerValue: string, secret: string): boolean {
  const parsed = parseStripeSignatureHeader(headerValue);
  const expected = createStripeWebhookSignature(rawBody, parsed.timestamp, secret);
  const expectedBytes = Buffer.from(expected, "utf8");

  return parsed.signatures.some((signature) => {
    const candidateBytes = Buffer.from(signature, "utf8");
    if (candidateBytes.length !== expectedBytes.length) return false;
    return timingSafeEqual(candidateBytes, expectedBytes);
  });
}

function extractStripeObjectMetadata(object: Record<string, unknown> | undefined): Record<string, string> {
  return normalizeProviderMetadata(object?.metadata);
}

function extractStripeProviderOrderId(object: Record<string, unknown> | undefined): string | undefined {
  const directId = String(object?.id || "").trim();
  if (directId) return directId;
  const paymentIntent = String(object?.payment_intent || "").trim();
  if (paymentIntent) return paymentIntent;
  const subscriptionId = String(object?.subscription || "").trim();
  if (subscriptionId) return subscriptionId;
  return undefined;
}

function extractStripeProviderCustomerId(object: Record<string, unknown> | undefined): string | undefined {
  const customer = String(object?.customer || "").trim();
  return customer || undefined;
}

function resolveStripeCheckoutMode(input: CheckoutOrderInput): "payment" | "subscription" {
  const billingMode = String(input.metadata.billingMode || "").trim().toLowerCase();
  if (billingMode === "subscription") return "subscription";
  return "payment";
}

function buildStripeCheckoutForm(input: CheckoutOrderInput): URLSearchParams {
  const form = encodeForm({
    mode: resolveStripeCheckoutMode(input),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[orderId]": input.orderId,
    "metadata[userId]": input.userId,
    "metadata[planId]": input.planId,
    "metadata[creditPackId]": input.creditPackId,
  });

  for (const [key, value] of Object.entries(input.metadata)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    form.set(`metadata[${normalizedKey}]`, normalizedValue);
  }

  const customerEmail = String(input.metadata.customerEmail || "").trim();
  if (customerEmail) form.set("customer_email", customerEmail);

  const stripePriceId = String(input.metadata.stripePriceId || "").trim();
  if (stripePriceId) {
    form.set("line_items[0][price]", stripePriceId);
    form.set("line_items[0][quantity]", "1");
    return form;
  }

  form.set("line_items[0][price_data][currency]", String(input.currency || "USD").trim().toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
  form.set("line_items[0][price_data][product_data][name]", String(input.metadata.productName || input.creditPackId || input.planId || "AI image purchase"));
  form.set("line_items[0][quantity]", "1");

  if (resolveStripeCheckoutMode(input) === "subscription") {
    throw new Error("Stripe subscription checkout requires metadata.stripePriceId.");
  }

  return form;
}

async function callStripe<T>(config: StripeConfig, path: string, body: URLSearchParams, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      String((payload.error as { message?: unknown } | undefined)?.message || "") ||
      `Stripe request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function createStripePaymentProviderAdapter(options?: {
  config?: StripeConfig;
  fetchImpl?: typeof fetch;
}): PaymentProviderAdapter {
  const fetchImpl = options?.fetchImpl || fetch;
  const readConfig = () => options?.config || getStripeConfig();

  return {
    id: "stripe",
    supports: {
      oneTime: true,
      subscription: true,
      refund: true,
      billingPortal: true,
    },
    async createCheckoutOrder(input: CheckoutOrderInput): Promise<CheckoutLaunch> {
      const config = readConfig();
      const payload = await callStripe<StripeCheckoutSessionRecord>(
        config,
        "/v1/checkout/sessions",
        buildStripeCheckoutForm(input),
        fetchImpl,
      );
      const providerOrderId = String(payload.id || "").trim();
      if (!providerOrderId) {
        throw new Error("Stripe checkout session did not return an id.");
      }
      return {
        provider: "stripe",
        providerOrderId,
        checkoutUrl: String(payload.url || "").trim() || undefined,
        clientPayload: config.publishableKey
          ? { publishableKey: config.publishableKey }
          : undefined,
      };
    },
    async verifyWebhook(request: Request, rawBody: string): Promise<VerifiedWebhookEvent> {
      const config = readConfig();
      const signature = String(request.headers.get("stripe-signature") || "").trim();
      if (!signature) {
        throw new Error("Missing Stripe signature header.");
      }
      if (!verifyStripeWebhookSignature(rawBody, signature, config.webhookSecret)) {
        throw new Error("Invalid Stripe webhook signature.");
      }

      const event = JSON.parse(rawBody) as StripeEventEnvelope;
      const object = event.data?.object;
      const eventType = mapStripeEventType(String(event.type || "").trim());
      return {
        provider: "stripe",
        providerEventId: String(event.id || "").trim() || "stripe-event-missing-id",
        providerOrderId: extractStripeProviderOrderId(object),
        providerCustomerId: extractStripeProviderCustomerId(object),
        eventType,
        occurredAt: new Date(Number(event.created || 0) * 1000 || Date.now()).toISOString(),
        raw: event,
        metadata: extractStripeObjectMetadata(object),
      };
    },
    async getCustomerPortalUrl(args): Promise<string> {
      const config = readConfig();
      const payload = await callStripe<StripePortalSessionRecord>(
        config,
        "/v1/billing_portal/sessions",
        encodeForm({
          customer: args.providerCustomerId,
          return_url: args.returnUrl,
        }),
        fetchImpl,
      );
      const url = String(payload.url || "").trim();
      if (!url) {
        throw new Error("Stripe billing portal session did not return a url.");
      }
      return url;
    },
  };
}
