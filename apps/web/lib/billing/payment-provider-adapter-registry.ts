import type {
  CheckoutLaunch,
  CheckoutOrderInput,
  PaymentProviderAdapter,
  PaymentProviderId,
  VerifiedWebhookEvent,
} from "./payment-provider-adapter.ts";

export class PaymentProviderAdapterRegistry {
  readonly #adapters = new Map<PaymentProviderId, PaymentProviderAdapter>();

  constructor(adapters: PaymentProviderAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: PaymentProviderAdapter) {
    this.#adapters.set(adapter.id, adapter);
  }

  has(providerId: PaymentProviderId): boolean {
    return this.#adapters.has(providerId);
  }

  get(providerId: PaymentProviderId): PaymentProviderAdapter | undefined {
    return this.#adapters.get(providerId);
  }

  require(providerId: PaymentProviderId): PaymentProviderAdapter {
    const adapter = this.get(providerId);
    if (!adapter) {
      throw new Error(`Payment provider adapter is not registered: ${providerId}`);
    }
    return adapter;
  }

  list(): PaymentProviderId[] {
    return [...this.#adapters.keys()];
  }

  async createCheckoutOrder(providerId: PaymentProviderId, input: CheckoutOrderInput): Promise<CheckoutLaunch> {
    return this.require(providerId).createCheckoutOrder(input);
  }

  async verifyWebhook(providerId: PaymentProviderId, request: Request, rawBody: string): Promise<VerifiedWebhookEvent> {
    return this.require(providerId).verifyWebhook(request, rawBody);
  }
}

export function createPaymentProviderAdapterRegistry(
  adapters: PaymentProviderAdapter[] = [],
): PaymentProviderAdapterRegistry {
  return new PaymentProviderAdapterRegistry(adapters);
}
