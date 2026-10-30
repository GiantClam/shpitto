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
  assert.deepEqual(await provider.retrieveCheckout!({sessionId: 'cs_test_a'} as never), {sessionId: 'cs_test_a', url: null, clientSecret: null, status: 'paid'});
});

test('embedded Checkout exposes the client secret and does not require a hosted url', async () => {
  const secret = 'cs_test_a_secret_Unit';
  const provider = createStripeCheckoutProvider(adapter({
    createCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'open', paymentStatus: 'unpaid', url: null, clientSecret: secret}}),
    retrieveCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'open', paymentStatus: 'unpaid', url: null, clientSecret: secret}}),
  }));
  assert.deepEqual(await provider.createCheckout({} as never), {sessionId: 'cs_test_a', url: null, clientSecret: secret, status: 'open'});
  assert.deepEqual(await provider.retrieveCheckout!({} as never), {sessionId: 'cs_test_a', url: null, clientSecret: secret, status: 'open'});
});

test('the bridge preserves an unknown Checkout session id for durable binding', async () => {
  const provider = createStripeCheckoutProvider(adapter({
    createCheckout: async () => ({status: 'unknown', code: 'binding_mismatch', sessionId: 'cs_test_a'}),
  }));
  assert.deepEqual(await provider.createCheckout({} as never), {unknown: true, sessionId: 'cs_test_a'});
});

test('the bridge maps a completed paid Checkout to a terminal paid observation', async () => {
  const provider = createStripeCheckoutProvider(adapter({
    createCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'complete', paymentStatus: 'paid', url: null, clientSecret: null}}),
  }));
  assert.deepEqual(await provider.createCheckout({} as never), {sessionId: 'cs_test_a', url: null, clientSecret: null, status: 'paid', completed: true});
});

test('a hosted url without a client secret is not a usable new Checkout', async () => {
  const provider = createStripeCheckoutProvider(adapter());
  assert.deepEqual(await provider.createCheckout({} as never), {unknown: true, sessionId: 'cs_test_a'});
});

test('completed Checkout does not reissue an embedded client secret', async () => {
  const provider = createStripeCheckoutProvider(adapter({retrieveCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'complete', paymentStatus: 'paid', url: null, clientSecret: 'cs_test_a_secret_Unit'}})}));
  assert.deepEqual(await provider.retrieveCheckout!({} as never), {sessionId: 'cs_test_a', url: null, clientSecret: null, status: 'paid'});
});

test('unknown responses remain unresolved and failed responses do not become success', async () => {
  const unknown = createStripeCheckoutProvider(adapter({createCheckout: async () => ({status: 'unknown', code: 'provider_unavailable'})}));
  assert.deepEqual(await unknown.createCheckout({} as never), {unknown: true});
  const failed = createStripeCheckoutProvider(adapter({
    createCustomer: async () => ({status: 'failed', code: 'binding_mismatch'}),
    createCheckout: async () => ({status: 'failed', code: 'binding_mismatch'}),
  }));
  await assert.rejects(failed.createCustomer!({workspaceId: 'w', idempotencyKey: 'customer-key'}), /The Stripe test operation could not be verified/);
  await assert.rejects(failed.createCheckout({} as never), /The Stripe test operation could not be verified/);
});

test('a completed unpaid Checkout never becomes paid or a new open URL', async () => {
  const provider = createStripeCheckoutProvider(adapter({retrieveCheckout: async () => ({status: 'succeeded', value: {sessionId: 'cs_test_a', status: 'complete', paymentStatus: 'unpaid', url: null}})}));
  assert.deepEqual(await provider.retrieveCheckout!({} as never), {unknown: true, sessionId: 'cs_test_a'});
});
