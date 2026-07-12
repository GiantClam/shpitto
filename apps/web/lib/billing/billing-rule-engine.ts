import {
  FLUXKREAFREE_SOURCE_BILLING_ENTITIES,
  getFluxKreaFreeBillingCatalog,
  getFluxKreaFreeBillingCatalogItem,
  type FluxKreaFreeBillingCatalogItem,
  type FluxKreaFreeBillingMode,
  type FluxKreaFreeSourceBillingEntity,
} from "./fluxkreafree-billing-model.ts";
import type { PaymentProviderId, VerifiedWebhookEventType } from "./payment-provider-adapter.ts";

export type BillingMode = FluxKreaFreeBillingMode;

export type EntitlementGrant = {
  key: string;
  quantity?: number;
  expiresAt?: string;
};

export type BillingCatalogItem = FluxKreaFreeBillingCatalogItem;

export type BillingApplyInput = {
  orderId: string;
  userId: string;
  provider: PaymentProviderId;
  providerEventId?: string;
  providerOrderId?: string;
  planId?: string;
  creditPackId?: string;
  eventType: VerifiedWebhookEventType;
  amountMinor?: number;
  metadata: Record<string, string>;
};

export type BillingApplyResult = {
  applied: boolean;
  grants: EntitlementGrant[];
  creditDelta: number;
  subscriptionState?: "active" | "past_due" | "cancelled";
  idempotencyKey: string;
  preservedSourceModels: FluxKreaFreeSourceBillingEntity[];
  normalizedRecords: {
    chargeOrder: {
      orderId: string;
      provider: PaymentProviderId;
      providerOrderId?: string;
      amountMinor?: number;
    };
    userBilling: {
      state: string;
      type: string;
      description: string;
    };
    userPaymentInfo?: {
      provider: PaymentProviderId;
      providerOrderId?: string;
    };
    userCreditTransaction?: {
      creditDelta: number;
      eventType: VerifiedWebhookEventType;
    };
  };
};

function getCatalogItem(catalogItemId: string | undefined): BillingCatalogItem | undefined {
  if (!catalogItemId) return undefined;
  return getFluxKreaFreeBillingCatalogItem(catalogItemId);
}

export function buildBillingIdempotencyKey(input: BillingApplyInput): string {
  const eventId = String(input.providerEventId || "").trim();
  const providerOrderId = String(input.providerOrderId || "").trim();
  if (!eventId && !providerOrderId) {
    throw new Error("Billing events require providerEventId or providerOrderId for idempotency.");
  }
  return [
    input.provider,
    input.eventType,
    eventId || "no-provider-event",
    providerOrderId || input.orderId,
    input.orderId,
  ].join(":");
}

export class BillingRuleEngine {
  readonly #catalog = new Map<string, BillingCatalogItem>();
  readonly #appliedEventKeys = new Set<string>();

  constructor(catalog: BillingCatalogItem[] = getFluxKreaFreeBillingCatalog()) {
    for (const item of catalog) {
      this.#catalog.set(item.id, {
        ...item,
        localeTitles: { ...item.localeTitles },
        providerDefaults: [...item.providerDefaults],
      });
    }
  }

  getCatalog(): BillingCatalogItem[] {
    return [...this.#catalog.values()].map((item) => ({
      ...item,
      localeTitles: { ...item.localeTitles },
      providerDefaults: [...item.providerDefaults],
    }));
  }

  hasProcessed(idempotencyKey: string): boolean {
    return this.#appliedEventKeys.has(idempotencyKey);
  }

  applyEvent(input: BillingApplyInput): BillingApplyResult {
    const idempotencyKey = buildBillingIdempotencyKey(input);
    if (this.hasProcessed(idempotencyKey)) {
      return {
        applied: false,
        grants: [],
        creditDelta: 0,
        idempotencyKey,
        preservedSourceModels: [...FLUXKREAFREE_SOURCE_BILLING_ENTITIES],
        normalizedRecords: {
          chargeOrder: {
            orderId: input.orderId,
            provider: input.provider,
            providerOrderId: input.providerOrderId,
            amountMinor: input.amountMinor,
          },
          userBilling: {
            state: "duplicate",
            type: "idempotent_skip",
            description: "Duplicate payment event ignored.",
          },
        },
      };
    }

    const catalogItemId =
      String(input.creditPackId || "").trim() ||
      String(input.planId || "").trim() ||
      String(input.metadata.catalogItemId || "").trim();
    const catalogItem = this.requireCatalogItem(catalogItemId);
    this.validateAmount(catalogItem, input.amountMinor);

    const result = this.buildResult(input, catalogItem, idempotencyKey);
    this.#appliedEventKeys.add(idempotencyKey);
    return result;
  }

  #buildActivationResult(
    input: BillingApplyInput,
    catalogItem: BillingCatalogItem,
    idempotencyKey: string,
  ): BillingApplyResult {
    const creditDelta = catalogItem.billingMode === "subscription" ? 0 : catalogItem.creditDelta;
    const grants =
      catalogItem.billingMode === "credits"
        ? []
        : [{ key: `plan:${catalogItem.id}`, quantity: 1 }];

    return {
      applied: true,
      grants,
      creditDelta,
      subscriptionState:
        catalogItem.billingMode === "credits"
          ? undefined
          : "active",
      idempotencyKey,
      preservedSourceModels: [...FLUXKREAFREE_SOURCE_BILLING_ENTITIES],
      normalizedRecords: {
        chargeOrder: {
          orderId: input.orderId,
          provider: input.provider,
          providerOrderId: input.providerOrderId,
          amountMinor: input.amountMinor,
        },
        userBilling: {
          state: "paid",
          type: catalogItem.kind === "credit-pack" ? "credit_purchase" : "plan_purchase",
          description: `${catalogItem.title} applied`,
        },
        userPaymentInfo: {
          provider: input.provider,
          providerOrderId: input.providerOrderId,
        },
        userCreditTransaction:
          creditDelta > 0
            ? {
                creditDelta,
                eventType: input.eventType,
              }
            : undefined,
      },
    };
  }

  #buildSubscriptionStateResult(
    input: BillingApplyInput,
    catalogItem: BillingCatalogItem,
    idempotencyKey: string,
    subscriptionState: "active" | "past_due" | "cancelled",
  ): BillingApplyResult {
    return {
      applied: true,
      grants: subscriptionState === "cancelled" ? [] : [{ key: `plan:${catalogItem.id}`, quantity: 1 }],
      creditDelta: 0,
      subscriptionState,
      idempotencyKey,
      preservedSourceModels: [...FLUXKREAFREE_SOURCE_BILLING_ENTITIES],
      normalizedRecords: {
        chargeOrder: {
          orderId: input.orderId,
          provider: input.provider,
          providerOrderId: input.providerOrderId,
          amountMinor: input.amountMinor,
        },
        userBilling: {
          state: subscriptionState,
          type: "subscription_state",
          description: `${catalogItem.title} subscription ${subscriptionState}`,
        },
        userPaymentInfo: {
          provider: input.provider,
          providerOrderId: input.providerOrderId,
        },
      },
    };
  }

  private buildResult(
    input: BillingApplyInput,
    catalogItem: BillingCatalogItem,
    idempotencyKey: string,
  ): BillingApplyResult {
    switch (input.eventType) {
      case "checkout_completed":
      case "payment_succeeded":
        return this.#buildActivationResult(input, catalogItem, idempotencyKey);
      case "subscription_created":
      case "subscription_updated":
        return this.#buildSubscriptionStateResult(input, catalogItem, idempotencyKey, "active");
      case "payment_failed":
        return this.#buildSubscriptionStateResult(input, catalogItem, idempotencyKey, "past_due");
      case "subscription_cancelled":
      case "refund_succeeded":
        return this.#buildSubscriptionStateResult(input, catalogItem, idempotencyKey, "cancelled");
      default:
        throw new Error(`Unsupported billing event type: ${String(input.eventType)}`);
    }
  }

  private requireCatalogItem(catalogItemId: string): BillingCatalogItem {
    const fromRegistry = this.#catalog.get(catalogItemId);
    if (fromRegistry) return fromRegistry;

    const fromDefaults = getCatalogItem(catalogItemId);
    if (fromDefaults) return fromDefaults;

    throw new Error(`Unknown billing catalog item: ${catalogItemId || "<empty>"}`);
  }

  private validateAmount(catalogItem: BillingCatalogItem, amountMinor?: number) {
    if (typeof amountMinor !== "number") return;
    if (amountMinor !== catalogItem.amountMinor) {
      throw new Error(
        `Billing amount mismatch for ${catalogItem.id}. Expected ${catalogItem.amountMinor}, received ${amountMinor}.`,
      );
    }
  }
}
