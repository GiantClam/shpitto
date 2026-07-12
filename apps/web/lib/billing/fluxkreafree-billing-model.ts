import type { PaymentProviderId } from "./payment-provider-adapter.ts";

export type FluxKreaFreeSourceBillingEntity =
  | "ChargeOrder"
  | "UserBilling"
  | "UserCredit"
  | "UserCreditTransaction"
  | "UserPaymentInfo";

export type FluxKreaFreeBillingMode = "subscription" | "credits" | "hybrid";

export type FluxKreaFreeBillingCatalogItem = {
  id: string;
  title: string;
  amountMinor: number;
  originalAmountMinor: number;
  creditDelta: number;
  currency: "USD";
  kind: "plan" | "credit-pack";
  billingMode: FluxKreaFreeBillingMode;
  message: string;
  localeTitles: Record<string, string>;
  providerDefaults: PaymentProviderId[];
};

export const FLUXKREAFREE_SOURCE_BILLING_ENTITIES: FluxKreaFreeSourceBillingEntity[] = [
  "ChargeOrder",
  "UserBilling",
  "UserCredit",
  "UserCreditTransaction",
  "UserPaymentInfo",
];

const FLUXKREAFREE_BILLING_CATALOG: FluxKreaFreeBillingCatalogItem[] = [
  {
    id: "starter-100",
    title: "Starter",
    amountMinor: 990,
    originalAmountMinor: 1990,
    creditDelta: 100,
    currency: "USD",
    kind: "credit-pack",
    billingMode: "credits",
    message: "100 credits,Basic models,Standard support",
    localeTitles: {
      en: "Starter",
      zh: "入门版",
    },
    providerDefaults: ["stripe"],
  },
  {
    id: "pro-250",
    title: "Pro",
    amountMinor: 1990,
    originalAmountMinor: 3990,
    creditDelta: 250,
    currency: "USD",
    kind: "credit-pack",
    billingMode: "credits",
    message: "250 credits,All models,Priority support,Commercial license",
    localeTitles: {
      en: "Pro",
      zh: "专业版",
    },
    providerDefaults: ["stripe"],
  },
  {
    id: "business-750",
    title: "Business",
    amountMinor: 4990,
    originalAmountMinor: 9990,
    creditDelta: 750,
    currency: "USD",
    kind: "credit-pack",
    billingMode: "credits",
    message: "750 credits,All models,Priority support,Commercial license,API access",
    localeTitles: {
      en: "Business",
      zh: "企业版",
    },
    providerDefaults: ["stripe"],
  },
];

export function getFluxKreaFreeBillingCatalog(): FluxKreaFreeBillingCatalogItem[] {
  return FLUXKREAFREE_BILLING_CATALOG.map((item) => ({
    ...item,
    localeTitles: { ...item.localeTitles },
    providerDefaults: [...item.providerDefaults],
  }));
}

export function getFluxKreaFreeBillingCatalogItem(id: string): FluxKreaFreeBillingCatalogItem | undefined {
  return FLUXKREAFREE_BILLING_CATALOG.find((item) => item.id === id);
}
