import {createHash} from 'node:crypto';

import {DomainError} from '../../db/contracts.ts';

export type BillingRefundReference = Readonly<{requestId: string; orderId: string; idempotencyKey: string}>;
export type BillingRefundInput = BillingRefundReference & Readonly<{amountMinor: bigint; currency: string}>;
/** Untagged success is retained for fixture compatibility only. Stripe must explicitly succeed. */
export type BillingRefundProviderResult =
  | Readonly<{externalId: string; amountMinor: bigint; status?: 'succeeded' | 'pending' | 'failed'}>
  | Readonly<{unknown: true}>;

export type BillingRefundProvider = Readonly<{
  provider: 'fixture' | 'stripe';
  createRefund(input: BillingRefundInput): Promise<BillingRefundProviderResult>;
  lookupRefund?(input: BillingRefundReference): Promise<BillingRefundProviderResult>;
  retrieveRefund?(input: BillingRefundInput & Readonly<{externalId: string}>): Promise<BillingRefundProviderResult>;
}>;

/** The fixture default is available only for fixture intents/orders. */
export function selectBillingRefundProvider(provider: string, injected?: BillingRefundProvider): BillingRefundProvider {
  if (injected?.provider === provider && (provider === 'fixture' || provider === 'stripe')) return injected;
  if (provider === 'fixture' && !injected) return createFakeBillingRefundProvider();
  throw new DomainError('FORBIDDEN', 'An explicitly matching refund provider must be enabled.');
}

export type BillingRefundObservation = Readonly<{status: 'confirmed' | 'pending' | 'failed' | 'unknown'; externalId: string | null}>;

/** No amount mismatch, unknown status, or untagged Stripe result can create confirmed cash. */
export function classifyBillingRefund(provider: BillingRefundProvider, result: BillingRefundProviderResult, amountMinor: bigint): BillingRefundObservation {
  if ('unknown' in result || typeof result.externalId !== 'string' || !result.externalId.trim() || result.externalId.length > 255 || result.amountMinor !== amountMinor) return {status: 'unknown', externalId: null};
  if (result.status === 'pending' || result.status === 'failed') return {status: result.status, externalId: result.externalId};
  if (result.status === 'succeeded' || (provider.provider === 'fixture' && result.status === undefined)) return {status: 'confirmed', externalId: result.externalId};
  return {status: 'unknown', externalId: null};
}

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
