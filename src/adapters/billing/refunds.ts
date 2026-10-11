import {createHash} from 'node:crypto';

export type BillingRefundProviderResult = Readonly<{externalId: string; amountMinor: bigint}> | Readonly<{unknown: true}>;

export type BillingRefundProvider = Readonly<{
  provider: 'fixture';
  createRefund(input: Readonly<{requestId: string; orderId: string; amountMinor: bigint; currency: string; idempotencyKey: string}>): Promise<BillingRefundProviderResult>;
  lookupRefund?(input: Readonly<{requestId: string; orderId: string; idempotencyKey: string}>): Promise<BillingRefundProviderResult>;
}>;

/** Deterministic test-mode provider. It never moves real cash. */
export function createFakeBillingRefundProvider(options: Readonly<{unknownKeys?: ReadonlySet<string>}> = {}): BillingRefundProvider {
  const results = new Map<string, BillingRefundProviderResult>();
  return Object.freeze({
    provider: 'fixture' as const,
    async lookupRefund(input) {
      return results.get(input.idempotencyKey) ?? {unknown: true};
    },
    async createRefund(input) {
      const existing = results.get(input.idempotencyKey);
      if (existing) return existing;
      if (options.unknownKeys?.has(input.idempotencyKey)) {
        const result = {unknown: true} as const;
        results.set(input.idempotencyKey, result);
        return result;
      }
      const suffix = createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24);
      const result = Object.freeze({externalId: `fixture_refund_${suffix}`, amountMinor: input.amountMinor});
      results.set(input.idempotencyKey, result);
      return result;
    },
  });
}
