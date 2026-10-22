import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStripeCheckoutProvider} from '../../src/adapters/billing/stripe-checkout.ts';
import type {StripeTestAdapter} from '../../src/adapters/billing/stripe-test.ts';

function adapter(overrides: Record<string, unknown> = {}): StripeTestAdapter {
  return {
    createCustomer: async () => ({status: 'succeeded', value: {customerId: 'cus_test'}}),
    retrieveCustomer: async () => ({status: 'succeeded', value: {customerId: 'cus_test'}}),
    createCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'open', paymentStatus: 'unpaid', url: 'https://checkout.stripe.com/test'}}),
    retrieveCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'complete', paymentStatus: 'paid', url: null}}),
    createPortal: async () => ({status: 'succeeded', value: {url: 'https://billing.stripe.com/test'}}),
    ...overrides,
  } as unknown as StripeTestAdapter;
}

test('the bridge preserves verified IDs and terminal Checkout readback', async () => {
  const provider = createStripeCheckoutProvider(adapter());
  assert.equal(provider.provider, 'stripe');
  assert.deepEqual(await provider.createCustomer!({workspaceId: 'w', idempotencyKey: 'customer-key'}), {customerId: 'cus_test'});
  assert.deepEqual(await provider.retrieveCheckout!({sessionId: 'cs_test_a'} as never), {sessionId: 'cs_test_a', url: null, status: 'paid'});
});

test('unknown responses remain unresolved and failed responses do not become success', async () => {
  const unknown = createStripeCheckoutProvider(adapter({createCheckout: async () => ({status: 'unknown', code: 'provider_unavailable'})}));
  assert.deepEqual(await unknown.createCheckout({} as never), {unknown: true});
  const failed = createStripeCheckoutProvider(adapter({createCustomer: async () => ({status: 'failed', code: 'binding_mismatch'})}));
  await assert.rejects(failed.createCustomer!({workspaceId: 'w', idempotencyKey: 'customer-key'}), /could not be verified/);
});

test('a completed unpaid Checkout never becomes paid or a new open URL', async () => {
  const provider = createStripeCheckoutProvider(adapter({retrieveCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'complete', paymentStatus: 'unpaid', url: null}})}));
  assert.deepEqual(await provider.retrieveCheckout!({} as never), {unknown: true});
});
