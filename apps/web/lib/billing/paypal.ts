import type { CheckoutSession } from "./store.ts";

type PayPalConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  currency: "USD";
};

export const PAYPAL_SETTLEMENT_CURRENCY = "USD";

export type PayPalOrder = {
  id: string;
  status: string;
  approveUrl?: string;
  settlementAmount: ReturnType<typeof formatPayPalAmount>;
  raw: unknown;
};

export type PayPalCapture = {
  id?: string;
  status: string;
  raw: unknown;
};

export function getPayPalConfig(): PayPalConfig {
  const env = String(process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
  const currency = resolvePayPalSettlementCurrency();

  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured. Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET.");
  }

  return {
    baseUrl: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    clientId,
    clientSecret,
    webhookId: String(process.env.PAYPAL_WEBHOOK_ID || "").trim() || undefined,
    currency,
  };
}

export function formatPayPalAmount(session: Pick<CheckoutSession, "amountMinor" | "currency">) {
  const paypalCurrency = resolvePayPalSettlementCurrency();
  const displayCurrency = String(session.currency || "").trim().toUpperCase();

  if (paypalCurrency === displayCurrency) {
    return {
      currency: paypalCurrency,
      value: (session.amountMinor / 100).toFixed(2),
      sourceCurrency: displayCurrency,
      sourceAmountMinor: session.amountMinor,
      rate: 1,
    };
  }

  if (displayCurrency === "CNY" && paypalCurrency === "USD") {
    const rate = Number(process.env.SHPITTO_BILLING_CNY_TO_USD_RATE || "");
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Missing SHPITTO_BILLING_CNY_TO_USD_RATE for CNY to USD PayPal settlement.");
    }
    return {
      currency: paypalCurrency,
      value: ((session.amountMinor / 100) * rate).toFixed(2),
      sourceCurrency: displayCurrency,
      sourceAmountMinor: session.amountMinor,
      rate,
    };
  }

  throw new Error(`Unsupported PayPal currency conversion from ${displayCurrency} to ${paypalCurrency}.`);
}

export function resolvePayPalSettlementCurrency(): "USD" {
  const configured = String(process.env.PAYPAL_CURRENCY || process.env.SHPITTO_BILLING_PAYPAL_CURRENCY || PAYPAL_SETTLEMENT_CURRENCY)
    .trim()
    .toUpperCase();
  if (configured !== PAYPAL_SETTLEMENT_CURRENCY) {
    throw new Error("PayPal settlement currency must be USD for Shpitto billing.");
  }
  return PAYPAL_SETTLEMENT_CURRENCY;
}

export async function createPayPalOrder(params: {
  session: CheckoutSession;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PayPalOrder> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const amount = formatPayPalAmount(params.session);
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": params.session.id,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.session.id,
          description: params.description,
          amount: {
            currency_code: amount.currency,
            value: amount.value,
          },
        },
      ],
      application_context: {
        brand_name: "Shpitto",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
  const raw = await response.json();
  assertPayPalOk(response, raw);
  return {
    id: String(raw?.id || ""),
    status: String(raw?.status || ""),
    approveUrl: Array.isArray(raw?.links)
      ? raw.links.find((link: any) => link?.rel === "approve")?.href
      : undefined,
    settlementAmount: amount,
    raw,
  };
}

export async function capturePayPalOrder(orderId: string, requestId: string): Promise<PayPalCapture> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
  });
  const raw = await response.json();
  assertPayPalOk(response, raw);
  return {
    id: extractCaptureId(raw),
    status: String(raw?.status || ""),
    raw,
  };
}

export async function verifyPayPalWebhookSignature(params: {
  headers: Headers;
  rawBody: string;
  event: unknown;
}): Promise<boolean> {
  const config = getPayPalConfig();
  if (!config.webhookId) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID.");
  }
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${config.baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: params.headers.get("paypal-auth-algo"),
      cert_url: params.headers.get("paypal-cert-url"),
      transmission_id: params.headers.get("paypal-transmission-id"),
      transmission_sig: params.headers.get("paypal-transmission-sig"),
      transmission_time: params.headers.get("paypal-transmission-time"),
      webhook_id: config.webhookId,
      webhook_event: params.event || JSON.parse(params.rawBody || "{}"),
    }),
  });
  const raw = await response.json();
  assertPayPalOk(response, raw);
  return raw?.verification_status === "SUCCESS";
}

async function getPayPalAccessToken(config: PayPalConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const raw = await response.json();
  assertPayPalOk(response, raw);
  const token = String(raw?.access_token || "");
  if (!token) throw new Error("PayPal did not return an access token.");
  return token;
}

function extractCaptureId(raw: any): string | undefined {
  const captures = raw?.purchase_units?.flatMap?.((unit: any) => unit?.payments?.captures || []) || [];
  return captures[0]?.id ? String(captures[0].id) : undefined;
}

function assertPayPalOk(response: Response, raw: any) {
  if (response.ok) return;
  const message = raw?.message || raw?.details?.[0]?.description || `PayPal request failed with ${response.status}`;
  throw new Error(String(message));
}
