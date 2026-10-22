import {DomainError} from '../../db/contracts.ts';
import type {BillingCheckoutProvider} from './fake.ts';
import type {StripeTestAdapter, StripeTestResult} from './stripe-test.ts';

function verified<T>(result: StripeTestResult<T>): T | null {
  if (result.status === 'succeeded') return result.value;
  if (result.status === 'unknown') return null;
  throw new DomainError('INFRASTRUCTURE', 'The Stripe test operation could not be verified.');
}

/** The durable command layer owns retry decisions; this bridge never initiates retries. */
export function createStripeCheckoutProvider(adapter: StripeTestAdapter): BillingCheckoutProvider {
  return Object.freeze({
    provider: 'stripe' as const,
    async createCustomer(input) {
      const value = verified(await adapter.createCustomer(input));
      return value ? {customerId: value.customerId} : {unknown: true as const};
    },
    async retrieveCustomer(input) {
      const value = verified(await adapter.retrieveCustomer(input));
      return value ? {customerId: value.customerId} : {unknown: true as const};
    },
    async createCheckout(input) {
      const value = verified(await adapter.createCheckout(input));
      return value?.status === 'open' && value.url ? {sessionId: value.sessionId, url: value.url} : {unknown: true as const};
    },
    async retrieveCheckout(input) {
      const value = verified(await adapter.retrieveCheckout(input));
      if (!value || (value.status === 'complete' && value.paymentStatus !== 'paid')) return {unknown: true as const};
      return {sessionId: value.sessionId, url: value.url, status: value.status === 'complete' ? 'paid' as const : value.status};
    },
    async createPortal(input) {
      const value = verified(await adapter.createPortal(input));
      if (!value) throw new DomainError('INFRASTRUCTURE', 'The Stripe test portal is temporarily unavailable.');
      return {url: value.url};
    },
  });
}
