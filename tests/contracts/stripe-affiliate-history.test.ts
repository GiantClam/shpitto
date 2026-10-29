import assert from 'node:assert/strict';
import {test} from 'node:test';

import type Stripe from 'stripe';

import {readStripeAffiliateHistory, type StripeAffiliateHistoryClient, type StripeAffiliateHistoryInput} from '../../src/adapters/affiliates/stripe-history.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const customerId = 'cus_test_1';
const intentId = 'pi_test_1';

function input(overrides: Partial<StripeAffiliateHistoryInput> = {}): StripeAffiliateHistoryInput {
  const order: StripeAffiliateHistoryInput['orders'][number] = {
    id: 'order-1', workspaceId, provider: 'stripe', customerId, kind: 'pack', status: 'paid',
    currency: 'usd', paidMinor: 1200n, paidAt: new Date('2026-10-25T12:00:00Z'),
  };
  const alias: StripeAffiliateHistoryInput['aliases'][number] = {
    workspaceId, provider: 'stripe', objectKind: 'payment_intent', externalId: intentId, orderId: 'order-1',
  };
  return {workspaceId, customers: [{provider: 'stripe', customerId}], orders: [order], aliases: [alias], ...overrides};
}

function intent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {id: intentId, livemode: false, customer: customerId, status: 'succeeded', amount_received: 1200, currency: 'usd', ...overrides} as Stripe.PaymentIntent;
}

function client(pages: readonly Readonly<{data: readonly Stripe.PaymentIntent[]; has_more: boolean}>[]): StripeAffiliateHistoryClient {
  let index = 0;
  return {paymentIntents: {list: async () => pages[index++] ?? {data: [], has_more: false}}};
}

test('canonical Stripe PaymentIntent matches every paid order exactly', async () => {
  const history = await readStripeAffiliateHistory(input(), client([{data: [intent()], has_more: false}]));
  assert.equal(history.complete, true);
  assert.deepEqual(history.payments.map((payment) => ({paymentReference: payment.paymentReference, amountMinor: payment.amountMinor, kind: payment.kind})), [{paymentReference: 'order-1', amountMinor: 1200n, kind: 'pack'}]);
});

test('unknown successful Stripe payments, mismatched bindings and incomplete pages hold history', async () => {
  const unknown = await readStripeAffiliateHistory(input(), client([{data: [intent({id: 'pi_unmapped'})], has_more: false}]));
  assert.equal(unknown.complete, false);
  const mismatch = await readStripeAffiliateHistory(input(), client([{data: [intent({amount_received: 1199})], has_more: false}]));
  assert.equal(mismatch.complete, false);
  const missing = await readStripeAffiliateHistory(input(), client([{data: [], has_more: false}]));
  assert.equal(missing.complete, false);
  const truncated = await readStripeAffiliateHistory(input(), client(Array.from({length: 20}, () => ({data: [intent()], has_more: true}))));
  assert.equal(truncated.complete, false);
});

test('live, wrong-customer and duplicate Stripe objects never qualify as canonical test history', async () => {
  const live = await readStripeAffiliateHistory(input(), client([{data: [intent({livemode: true})], has_more: false}]));
  assert.equal(live.complete, false);
  const wrongCustomer = await readStripeAffiliateHistory(input(), client([{data: [intent({customer: 'cus_other'})], has_more: false}]));
  assert.equal(wrongCustomer.complete, false);
  const duplicate = await readStripeAffiliateHistory(input(), client([{data: [intent(), intent()], has_more: false}]));
  assert.equal(duplicate.complete, false);
});
