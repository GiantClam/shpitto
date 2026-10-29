import {createStripeCheckoutProvider} from '../../adapters/billing/stripe-checkout.ts';
import {createStripeTestAdapter, STRIPE_TEST_API_VERSION} from '../../adapters/billing/stripe-test.ts';
import {getStripeTestConfiguration} from '../../config/env.ts';
import {DomainError} from '../../db/contracts.ts';
import Stripe from 'stripe';
import {createStripeTestEventMapper} from '../../adapters/billing/stripe-test-events.ts';
import {createStripeRefundProvider} from '../../adapters/billing/stripe-refunds.ts';
import type {AppDatabase} from '../../db/client.ts';

export function getBillingRefundRuntime(db: AppDatabase) {
  const configuration = getStripeTestConfiguration();
  return configuration ? {provider: createStripeRefundProvider(db, createStripeTestAdapter(configuration))} : {};
}

export function getStripeTestEventRuntime() {
  const configuration = getStripeTestConfiguration();
  if (!configuration) return null;
  const client = new Stripe(configuration.secretKey, {apiVersion: STRIPE_TEST_API_VERSION, maxNetworkRetries: 0, timeout: 20_000});
  return {configuration, mapper: createStripeTestEventMapper(client)};
}

/** A configured key alone never changes the offline fixture behavior. */
export function getBillingRuntime() {
  const configuration = getStripeTestConfiguration();
  if (!configuration) return {};
  return {
    provider: createStripeCheckoutProvider(createStripeTestAdapter(configuration)),
    snapshotBillingProduct(productKey: string) {
      const product = configuration.catalog.find(entry => entry.productKey === productKey);
      if (!product) throw new DomainError('CONFLICT', 'The billing product is unavailable.');
      return product;
    },
  };
}
