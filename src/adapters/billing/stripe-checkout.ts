import {DomainError} from '../../db/contracts.ts';
import type {BillingCheckoutProvider} from './fake.ts';
import type {StripeTestAdapter, StripeTestResult} from './stripe-test.ts';

function verified<T>(result: StripeTestResult<T>): T | null {
  if (result.status === 'succeeded') return result.value;
  if (result.status === 'unknown') return null;
  throw new DomainError('INFRASTRUCTURE', 'The Stripe test operation could not be verified.');
}

function unresolved(result: StripeTestResult<unknown>): Readonly<{unknown: true; sessionId?: string}> {
  if (result.status === 'unknown') return result.sessionId ? {unknown: true, sessionId: result.sessionId} : {unknown: true};
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
      const result = await adapter.createCheckout(input);
      if (result.status !== 'succeeded') return unresolved(result);
      const value = result.value;
      if (value.status === 'complete' && value.paymentStatus === 'paid') return {sessionId: value.sessionId, url: null, clientSecret: null, status: 'paid' as const, completed: true};
      if (value.status === 'expired') return {sessionId: value.sessionId, url: null, clientSecret: null, status: 'expired' as const};
      if (value.status !== 'open' || !value.clientSecret) return {unknown: true as const, sessionId: value.sessionId};
      return {sessionId: value.sessionId, url: null, clientSecret: value.clientSecret, status: 'open' as const};
    },
    async retrieveCheckout(input) {
      const result = await adapter.retrieveCheckout(input);
      if (result.status !== 'succeeded') return unresolved(result);
      const value = result.value;
      if (value.status === 'complete' && value.paymentStatus !== 'paid') return {unknown: true as const, sessionId: value.sessionId};
      const status = value.status === 'complete' ? 'paid' as const : value.status;
      return {sessionId: value.sessionId, url: value.url, clientSecret: status === 'open' ? value.clientSecret : null, status};
    },
    async expireCheckout(input) {
      if (!adapter.expireCheckout) throw new DomainError('INFRASTRUCTURE', 'The Stripe test Checkout could not be expired.');
      const result = await adapter.expireCheckout(input);
      if (result.status !== 'succeeded' || result.value.status !== 'expired') throw new DomainError('INFRASTRUCTURE', 'The Stripe test Checkout could not be expired.');
    },
    async createPortal(input) {
      const value = verified(await adapter.createPortal(input));
      if (!value) throw new DomainError('INFRASTRUCTURE', 'The Stripe test portal is temporarily unavailable.');
      return {url: value.url};
    },
  });
}
