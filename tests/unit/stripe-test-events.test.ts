import assert from 'node:assert/strict';
import {test} from 'node:test';
import type Stripe from 'stripe';

import {semanticHash} from '../../src/contracts/http.ts';
import {parseBillingCatalogSnapshot} from '../../src/modules/billing/contracts.ts';
import {createStripeTestEventMapper, parseStripeTestEvent, type StripeTestEventClient} from '../../src/adapters/billing/stripe-test-events.ts';

// Compile-time conformance only: never construct an SDK client or read credentials in this suite.
const sdkClientPort = (client: Stripe): StripeTestEventClient => client;
void sdkClientPort;

const customerId = 'cus_Mapper';
const start = Date.parse('2026-01-31T12:00:00Z') / 1000;
const end = Date.parse('2026-02-28T12:00:00Z') / 1000;
const fence = {workspaceId: 'workspace-local', owner: 'test', token: 'claim', generation: '1', leaseUntil: '2026-11-01T00:00:00.000Z'};
const metadata = {workspaceId: 'workspace-forged', productKey: 'forged', attemptId: 'attempt-forged', credits: '999999'};

function binding(kind: 'pack' | 'subscription' = 'pack') {
  const terms = {catalogVersion: 1, productKey: 'local-product', kind, interval: kind === 'pack' ? null : 'month', credits: '250', amountMinor: '900', currency: 'usd', creditExpiry: kind === 'pack' ? 'never' : 'service_period_end', provider: 'stripe', priceReference: 'price_Mapper'};
  const catalogSnapshot = parseBillingCatalogSnapshot({...terms, snapshotHash: semanticHash('billing.catalog.snapshot', terms)});
  return {workspaceId: fence.workspaceId, customerId, catalogSnapshot, checkoutSessionId: 'cs_test_Mapper', ...(kind === 'subscription' ? {externalSubscriptionId: 'sub_Mapper'} : {})};
}

function event(type = 'checkout.session.completed', object = 'checkout.session', id = 'cs_test_Mapper') {
  return parseStripeTestEvent(Buffer.from(JSON.stringify({id: 'evt_Mapper', object: 'event', livemode: false, type, data: {object: {id, object, customer: 'cus_Forged', metadata}}})));
}

function harness(kind: 'pack' | 'subscription' = 'pack') {
  const price = {id: 'price_Mapper', livemode: false, currency: 'usd', unit_amount: 900, billing_scheme: 'per_unit', tiers_mode: null, transform_quantity: null, type: kind === 'pack' ? 'one_time' : 'recurring', recurring: kind === 'pack' ? null : {interval: 'month', interval_count: 1, usage_type: 'licensed'}};
  const session = {id: 'cs_test_Mapper', livemode: false, customer: customerId, mode: kind === 'pack' ? 'payment' : 'subscription', status: 'complete', payment_status: 'paid', currency: 'usd', amount_total: 900, amount_subtotal: 900, automatic_tax: {enabled: false}, discounts: [], total_details: {amount_discount: 0, amount_tax: 0, amount_shipping: 0}, payment_intent: kind === 'pack' ? 'pi_Mapper' : null, invoice: kind === 'pack' ? null : 'in_Mapper', subscription: kind === 'pack' ? null : 'sub_Mapper', metadata};
  const line = {id: 'li_Mapper', quantity: 1, price, currency: 'usd', amount_subtotal: 900, amount_total: 900, amount_discount: 0, amount_tax: 0, discounts: [], taxes: []};
  const paymentIntent = {id: 'pi_Mapper', livemode: false, customer: customerId, status: 'succeeded', amount: 900, amount_received: 900, currency: 'usd', latest_charge: 'ch_Mapper'};
  const charge = {id: 'ch_Mapper', livemode: false, customer: customerId, payment_intent: 'pi_Mapper', amount: 900, amount_captured: 900, currency: 'usd', paid: true, captured: true, status: 'succeeded', created: start};
  const refund = {id: 're_Mapper', charge: 'ch_Mapper', payment_intent: 'pi_Mapper', customer: customerId, status: 'succeeded', amount: 100, currency: 'usd', created: end, metadata};
  const dispute = {id: 'du_Mapper', livemode: false, charge: 'ch_Mapper', payment_intent: 'pi_Mapper' as string | null, status: 'needs_response', amount: 100, currency: 'usd', created: end, metadata};
  const item = {id: 'si_Mapper', subscription: 'sub_Mapper', price, quantity: 1, current_period_start: start, current_period_end: end, discounts: [], tax_rates: []};
  const subscription = {id: 'sub_Mapper', livemode: false, customer: customerId, status: 'active', cancel_at_period_end: true, automatic_tax: {enabled: false}, default_tax_rates: [], discounts: [], items: {has_more: false, data: [item]}, metadata};
  const invoiceLine = {id: 'il_Mapper', invoice: 'in_Mapper', livemode: false, subscription: 'sub_Mapper' as string | null, currency: 'usd', amount: 900, subtotal: 900, quantity: 1, quantity_decimal: '1', pricing: {type: 'price_details' as const, price_details: {price: 'price_Mapper'}, unit_amount_decimal: '900'}, parent: {type: 'subscription_item_details', subscription_item_details: {subscription: 'sub_Mapper', subscription_item: 'si_Mapper', proration: false}}, period: {start, end}, discounts: [], discount_amounts: [], pretax_credit_amounts: [], taxes: []};
  const invoicePayment = {id: 'inpay_Mapper', invoice: 'in_Mapper', livemode: false, status: 'paid', amount_paid: 900, currency: 'usd', payment: {type: 'payment_intent', payment_intent: 'pi_Mapper'}};
  const invoice = {id: 'in_Mapper', livemode: false, customer: customerId, status: 'paid', billing_reason: 'subscription_create', currency: 'usd', amount_paid: 900, amount_due: 900, amount_remaining: 0, amount_paid_off_stripe: 0, total: 900, subtotal: 900, starting_balance: 0, ending_balance: 0, pre_payment_credit_notes_amount: 0, post_payment_credit_notes_amount: 0, automatic_tax: {enabled: false}, default_tax_rates: [], discounts: [], total_discount_amounts: [], total_taxes: [], parent: {type: 'subscription_details', subscription_details: {subscription: 'sub_Mapper'}}, payments: {data: [invoicePayment], has_more: false}, lines: {data: [invoiceLine], has_more: false}, status_transitions: {paid_at: start}, metadata};
  const calls: string[] = [];
  const read = <T>(name: string, value: () => T) => async (..._args: unknown[]) => {calls.push(name); return structuredClone(value());};
  const client: StripeTestEventClient = {
    checkout: {sessions: {retrieve: read('session', () => session), listLineItems: read('lines', () => ({data: [line], has_more: false})), list: async (params) => {calls.push('sessions'); return {data: params.payment_intent && kind === 'subscription' ? [] : [structuredClone(session)], has_more: false};}}},
    invoices: {retrieve: read('invoice', () => invoice)}, subscriptions: {retrieve: read('subscription', () => subscription)},
    invoicePayments: {list: read('invoicePayments', () => ({data: kind === 'subscription' ? [invoicePayment] : [], has_more: false}))},
    prices: {retrieve: read('price', () => price)}, paymentIntents: {retrieve: read('intent', () => paymentIntent)},
    charges: {retrieve: read('charge', () => charge)}, refunds: {retrieve: read('refund', () => refund), list: read('refunds', () => ({data: [refund], has_more: false}))},
    disputes: {retrieve: read('dispute', () => dispute)},
  };
  return {client, mapper: createStripeTestEventMapper(client), calls, session, line, price, paymentIntent, charge, refund, dispute, subscription, item, invoice, invoiceLine, invoicePayment};
}

test('authenticated parser minimizes raw identity and rejects live or malformed events', () => {
  assert.deepEqual(event(), {eventId: 'evt_Mapper', eventType: 'checkout.session.completed', objectId: 'cs_test_Mapper', objectType: 'checkout.session', livemode: false});
  for (const body of ['{', '{}', JSON.stringify({id: 'evt_A', type: 'invoice.paid', livemode: true, data: {object: {id: 'in_A', object: 'invoice'}}}), JSON.stringify({id: 'evt_A', type: 'invoice.paid', livemode: false, data: {object: {id: 'cs_test_A', object: 'checkout.session'}}})]) assert.throws(() => parseStripeTestEvent(Buffer.from(body)));
});

test('discovery exposes canonical scope; post-claim normalization refetches and ignores all metadata', async () => {
  const h = harness();
  const discovery = await h.mapper.discover(event());
  assert.equal(discovery.customerId, customerId);
  assert.equal(discovery.checkoutSessionId, 'cs_test_Mapper');
  assert.equal('workspaceId' in discovery, false);
  const before = h.calls.filter((name) => name === 'session').length;
  const [observation] = await h.mapper.normalize(discovery, binding(), fence);
  assert.ok(h.calls.filter((name) => name === 'session').length > before);
  assert.equal(observation!.workspaceId, fence.workspaceId);
  assert.equal(observation!.productKey, undefined);
  assert.equal(observation!.paymentIntentId, 'pi_Mapper');
  assert.equal(observation!.chargeId, 'ch_Mapper');
  assert.equal(observation!.amountMinor, '900');
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.stripe?.priceReference, 'price_Mapper');
  assert.deepEqual(observation!.fence, fence);
});

test('normalize rejects a different local customer, canonical customer drift, live objects and fence workspace', async () => {
  const h = harness();
  const discovery = await h.mapper.discover(event());
  await assert.rejects(h.mapper.normalize(discovery, {...binding(), customerId: 'cus_Other'}, fence));
  await assert.rejects(h.mapper.normalize(discovery, binding(), {...fence, workspaceId: 'other'}));
  h.paymentIntent.customer = 'cus_Other';
  await assert.rejects(h.mapper.normalize(discovery, binding(), fence));
  h.paymentIntent.customer = customerId;
  h.charge.livemode = true;
  await assert.rejects(h.mapper.normalize(discovery, binding(), fence));
});

for (const change of ['quantity', 'discount', 'tax', 'price', 'amount', 'currency', 'payment', 'line-price'] as const) {
  test(`pack ${change} becomes holding evidence without metadata/catalog fallback`, async () => {
    const h = harness();
    const discovery = await h.mapper.discover(event());
    if (change === 'quantity') h.line.quantity = 2;
    if (change === 'discount') h.line.amount_discount = 1;
    if (change === 'tax') h.session.total_details.amount_tax = 1;
    if (change === 'price') h.price.id = 'price_Other';
    if (change === 'amount') h.paymentIntent.amount_received = 899;
    if (change === 'currency') h.charge.currency = 'eur';
    if (change === 'payment') h.paymentIntent.status = 'processing';
    if (change === 'line-price') h.line.price = {...h.price, id: 'price_Other'};
    const [observation] = await h.mapper.normalize(discovery, binding(), fence);
    assert.equal(observation!.stripe?.supported, false);
    assert.equal(observation!.productKey, undefined);
  });
}

test('initial invoice yields invoice, intent, charge and persisted Checkout aliases with canonical monthly period', async () => {
  const h = harness('subscription');
  const discovery = await h.mapper.discover(event('invoice.paid', 'invoice', 'in_Mapper'));
  assert.equal(discovery.externalSubscriptionId, 'sub_Mapper');
  assert.equal(discovery.checkoutSessionId, 'cs_test_Mapper');
  const [observation] = await h.mapper.normalize(discovery, binding('subscription'), fence);
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.stripe?.billingReason, 'subscription_create');
  assert.equal(observation!.checkoutSessionId, 'cs_test_Mapper');
  assert.equal(observation!.invoiceId, 'in_Mapper');
  assert.equal(observation!.periodStart, '2026-01-31T12:00:00.000Z');
  assert.equal(observation!.periodEnd, '2026-02-28T12:00:00.000Z');
});

test('recurring invoice accepts parent subscription item detail when top-level line subscription is absent', async () => {
  const h = harness('subscription');
  h.invoiceLine.subscription = null;
  const discovery = await h.mapper.discoverIdentity(event('invoice.paid', 'invoice', 'in_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, binding('subscription'), fence);
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.externalSubscriptionId, 'sub_Mapper');
});

test('recurring invoice rejects conflicting top-level and parent subscription identities', async () => {
  const h = harness('subscription');
  h.invoiceLine.subscription = 'sub_Other';
  const discovery = await h.mapper.discoverIdentity(event('invoice.paid', 'invoice', 'in_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, binding('subscription'), fence);
  assert.equal(observation!.stripe?.supported, false);
});

test('early subscription discovery retrieves the initial Checkout without metadata binding', async () => {
  const h = harness('subscription');
  const discovery = await h.mapper.discoverIdentity(event('customer.subscription.created', 'subscription', 'sub_Mapper'));
  assert.equal(discovery.checkoutSessionId, 'cs_test_Mapper');
  assert.ok(h.calls.includes('sessions') && h.calls.includes('session'));
});

test('early recurring PaymentIntent reverses through invoicePayments when Checkout PI lookup is empty', async () => {
  const h = harness('subscription');
  h.client.checkout.sessions.list = async (params) => ({data: params.payment_intent ? [] : [h.session], has_more: false});
  const discovery = await h.mapper.discoverIdentity(event('payment_intent.succeeded', 'payment_intent', 'pi_Mapper'));
  assert.equal(discovery.invoiceId, 'in_Mapper');
  assert.equal(discovery.checkoutSessionId, 'cs_test_Mapper');
  assert.equal((await h.mapper.normalize(discovery, binding('subscription'), fence))[0]!.stripe?.supported, true);
});

test('subscription-cycle PaymentIntent lookup ignores a Checkout Session with a null PaymentIntent', async () => {
  const h = harness('subscription');
  h.invoice.billing_reason = 'subscription_cycle';
  h.client.checkout.sessions.list = async (params) => params.payment_intent
    ? {data: [{...h.session, payment_intent: null}], has_more: false}
    : {data: [h.session], has_more: false};
  const discovery = await h.mapper.discoverIdentity(event('refund.updated', 'refund', 're_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, {...binding('subscription'), invoiceId: 'in_Mapper'}, fence);
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.invoiceId, 'in_Mapper');
  assert.equal(observation!.externalSubscriptionId, 'sub_Mapper');
});

test('pack PaymentIntent aliases its canonical Checkout', async () => {
  const h = harness();
  const discovery = await h.mapper.discoverIdentity(event('payment_intent.succeeded', 'payment_intent', 'pi_Mapper'));
  assert.equal((await h.mapper.normalize(discovery, binding(), fence))[0]!.stripe?.supported, true);
});

test('monthly periods retain Stripe end-of-month anchors across a short month', async () => {
  const h = harness('subscription');
  h.invoiceLine.period.start = end;
  h.invoiceLine.period.end = Date.parse('2026-03-31T12:00:00Z') / 1000;
  h.invoice.billing_reason = 'subscription_cycle';
  const discovery = await h.mapper.discoverIdentity(event('invoice.paid', 'invoice', 'in_Mapper'));
  assert.equal((await h.mapper.normalize(discovery, binding('subscription'), fence))[0]!.stripe?.supported, true);
});

test('a longer next month cannot shorten an existing day-30 monthly anchor', async () => {
  const h = harness('subscription');
  h.invoiceLine.period.start = Date.parse('2026-04-30T12:00:00Z') / 1000;
  h.invoiceLine.period.end = Date.parse('2026-05-29T12:00:00Z') / 1000;
  h.invoice.billing_reason = 'subscription_cycle';
  const discovery = await h.mapper.discoverIdentity(event('invoice.paid', 'invoice', 'in_Mapper'));
  assert.equal((await h.mapper.normalize(discovery, binding('subscription'), fence))[0]!.stripe?.supported, false);
});

test('initial subscription can use its persisted Checkout binding before a subscription row exists', async () => {
  const h = harness('subscription');
  const local = {...binding('subscription'), externalSubscriptionId: undefined};
  const discovery = await h.mapper.discoverIdentity(event('customer.subscription.created', 'subscription', 'sub_Mapper'));
  const observation = await h.mapper.normalizeSubscription(discovery, local, fence);
  assert.equal(observation!.externalId, 'sub_Mapper');
});

test('subscription cannot take a lifecycle binding from a different persisted Checkout', async () => {
  const h = harness('subscription');
  const local = {...binding('subscription'), externalSubscriptionId: undefined, checkoutSessionId: 'cs_test_Other'};
  const discovery = await h.mapper.discoverIdentity(event('customer.subscription.created', 'subscription', 'sub_Mapper'));
  await assert.rejects(h.mapper.normalizeSubscription(discovery, local, fence));
});

test('nullable SDK shipping total is zero without weakening tax or discount validation', async () => {
  const h = harness();
  h.client.checkout.sessions.retrieve = async () => ({...h.session, total_details: {...h.session.total_details, amount_shipping: null}});
  const discovery = await h.mapper.discoverIdentity(event());
  assert.equal((await h.mapper.normalize(discovery, binding(), fence))[0]!.stripe?.supported, true);
});

test('async Checkout success is canonical; unpaid completion emits no payment', async () => {
  const h = harness();
  const discovery = await h.mapper.discoverIdentity(event('checkout.session.async_payment_succeeded'));
  assert.equal((await h.mapper.normalize(discovery, binding(), fence))[0]!.stripe?.supported, true);
  h.session.payment_status = 'unpaid';
  assert.deepEqual(await h.mapper.normalize(discovery, binding(), fence), []);
});

test('pack multiple lines and incomplete pagination become holding evidence', async () => {
  for (const hasMore of [true, false]) {
    const h = harness();
    h.client.checkout.sessions.listLineItems = async () => ({data: hasMore ? [h.line] : [h.line, {...h.line, id: 'li_Other'}], has_more: hasMore});
    const discovery = await h.mapper.discoverIdentity(event());
    assert.equal((await h.mapper.normalize(discovery, binding(), fence))[0]!.stripe?.supported, false);
  }
});

test('canonical invoice payments, line items and prices reject live mode', async () => {
  for (const target of ['payment', 'line', 'price']) {
    const h = harness('subscription');
    const discovery = await h.mapper.discoverIdentity(event('invoice.paid', 'invoice', 'in_Mapper'));
    if (target === 'payment') h.invoicePayment.livemode = true;
    if (target === 'line') h.invoiceLine.livemode = true;
    if (target === 'price') h.price.livemode = true;
    await assert.rejects(h.mapper.normalize(discovery, binding('subscription'), fence));
  }
});

test('canonical refund/customer identity mismatch rejects, regardless of metadata', async () => {
  const h = harness();
  const discovery = await h.mapper.discoverIdentity(event('refund.updated', 'refund', 're_Mapper'));
  h.refund.customer = 'cus_Other';
  await assert.rejects(h.mapper.normalize(discovery, binding(), fence));
});

test('provider failures propagate for durable inbox retry without fabricating payment evidence', async () => {
  const h = harness();
  const discovery = await h.mapper.discoverIdentity(event());
  h.client.prices.retrieve = async () => {throw new Error('test provider unavailable');};
  await assert.rejects(h.mapper.normalize(discovery, binding(), fence), /test provider unavailable/);
});

test('subscription Checkout maps its invoice; renewal never aliases the initial Checkout', async () => {
  const h = harness('subscription');
  const checkout = await h.mapper.discover(event());
  assert.equal((await h.mapper.normalize(checkout, binding('subscription'), fence))[0]!.stripe?.supported, true);
  h.invoice.billing_reason = 'subscription_cycle';
  const discovery = await h.mapper.discover(event('invoice.paid', 'invoice', 'in_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, binding('subscription'), fence);
  assert.equal(observation!.checkoutSessionId, undefined);
  assert.equal(observation!.stripe?.supported, true);
});

for (const change of ['annual', 'proration', 'multiple', 'discount', 'tax', 'quantity', 'reason', 'payments', 'period', 'truncated', 'unbound'] as const) {
  test(`subscription ${change} is held`, async () => {
    const h = harness('subscription');
    const discovery = await h.mapper.discover(event('invoice.paid', 'invoice', 'in_Mapper'));
    if (change === 'annual') h.price.recurring = {interval: 'year', interval_count: 1, usage_type: 'licensed'};
    if (change === 'proration') h.invoiceLine.parent.subscription_item_details.proration = true;
    if (change === 'multiple') h.invoice.lines.data.push({...h.invoiceLine, id: 'il_Extra'});
    if (change === 'discount') h.invoice.total_discount_amounts = [{amount: 0}] as never[];
    if (change === 'tax') h.invoice.automatic_tax.enabled = true;
    if (change === 'quantity') h.item.quantity = 2;
    if (change === 'reason') h.invoice.billing_reason = 'subscription_update';
    if (change === 'payments') h.invoice.payments.data.push({...h.invoicePayment, id: 'inpay_Other'});
    if (change === 'period') h.invoiceLine.period.end = start + 86400;
    if (change === 'truncated') h.invoice.lines.has_more = true;
    const local = change === 'unbound' ? {...binding('subscription'), checkoutSessionId: undefined} : binding('subscription');
    const [observation] = await h.mapper.normalize(discovery, local, fence);
    assert.equal(observation!.stripe?.supported, false);
  });
}

test('refund succeeded uses independent refund identity and original payment amount', async () => {
  const h = harness();
  const discovery = await h.mapper.discover(event('refund.updated', 'refund', 're_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, binding(), fence);
  assert.equal(observation!.eventType, 'charge.refunded');
  assert.equal(observation!.refundId, 're_Mapper');
  assert.equal(observation!.amountMinor, '100');
  assert.equal(observation!.stripe?.paymentAmountMinor, '900');
  assert.equal(observation!.stripe?.supported, true);
});

for (const status of ['failed', 'canceled'] as const) {
  test(`terminal ${status} refund remains holding evidence instead of being silently discarded`, async () => {
    const h = harness();
    h.refund.status = 'pending';
    const pending = await h.mapper.discoverIdentity(event('refund.updated', 'refund', 're_Mapper'));
    assert.deepEqual(await h.mapper.normalize(pending, binding(), fence), []);
    h.refund.status = status;
    const discovery = await h.mapper.discoverIdentity(event('refund.failed', 'refund', 're_Mapper'));
    const [observation] = await h.mapper.normalize(discovery, binding(), fence);
    assert.equal(observation!.refundId, 're_Mapper');
    assert.equal(observation!.amountMinor, '100');
    assert.equal(observation!.stripe?.supported, false);
  });
}

test('refund-before-paid validates canonical Checkout lines and immutable price', async () => {
  const h = harness();
  const discovery = await h.mapper.discover(event('refund.updated', 'refund', 're_Mapper'));
  h.line.quantity = 2;
  const [observation] = await h.mapper.normalize(discovery, binding(), fence);
  assert.equal(observation!.stripe?.supported, false);
});

test('recurring refund refetches original invoice period, never the current subscription period', async () => {
  const h = harness('subscription');
  h.invoice.billing_reason = 'subscription_cycle';
  h.item.current_period_start = end;
  h.item.current_period_end = Date.parse('2026-03-28T12:00:00Z') / 1000;
  const discovery = await h.mapper.discover(event('refund.updated', 'refund', 're_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, {...binding('subscription'), invoiceId: 'in_Mapper'}, fence);
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.periodStart, '2026-01-31T12:00:00.000Z');
  assert.equal(observation!.periodEnd, '2026-02-28T12:00:00.000Z');
  assert.equal(observation!.stripe?.billingReason, 'subscription_cycle');
  assert.equal(observation!.externalSubscriptionId, 'sub_Mapper');
});

test('historical recurring refund uses the original invoice terms after current subscription changes', async () => {
  const h = harness('subscription');
  h.invoice.billing_reason = 'subscription_cycle';
  h.item.price = {...h.item.price, id: 'price_current_other'};
  h.item.quantity = 2;
  h.subscription.status = 'canceled';
  const discovery = await h.mapper.discoverIdentity(event('refund.updated', 'refund', 're_Mapper'));
  const [observation] = await h.mapper.normalize(discovery, {...binding('subscription'), invoiceId: 'in_Mapper'}, fence);
  assert.equal(observation!.stripe?.supported, true);
  assert.equal(observation!.periodStart, '2026-01-31T12:00:00.000Z');
  assert.equal(observation!.periodEnd, '2026-02-28T12:00:00.000Z');
});

test('refund invoice alias must point at the same canonical PaymentIntent', async () => {
  const h = harness('subscription');
  const discovery = await h.mapper.discover(event('refund.updated', 'refund', 're_Mapper'));
  h.invoicePayment.payment.payment_intent = 'pi_Other';
  await assert.rejects(h.mapper.normalize(discovery, {...binding('subscription'), invoiceId: 'in_Mapper'}, fence));
});

test('charge refund selection emits exactly one independently refetched refund', async () => {
  const h = harness();
  const other = {...h.refund, id: 're_Other', amount: 200};
  h.client.refunds.list = async () => ({data: [h.refund, other], has_more: false});
  h.client.refunds.retrieve = async (id) => id === other.id ? other : h.refund;
  const discovery = await h.mapper.discover(event('charge.refunded', 'charge', 'ch_Mapper'));
  const observations = await h.mapper.normalize(discovery, binding(), fence, {refundId: other.id});
  assert.equal(observations.length, 1);
  assert.equal(observations[0]!.refundId, other.id);
  assert.equal(observations[0]!.amountMinor, '200');
});

for (const status of ['pending', 'requires_action'] as const) {
  test(`refund ${status} emits no cash`, async () => {
    const h = harness();
    h.refund.status = status;
    const discovery = await h.mapper.discover(event('refund.created', 'refund', 're_Mapper'));
    assert.deepEqual(await h.mapper.normalize(discovery, binding(), fence), []);
  });
}

for (const status of ['failed', 'canceled'] as const) {
  test(`refund ${status} emits holding evidence`, async () => {
    const h = harness();
    h.refund.status = status;
    const discovery = await h.mapper.discover(event('refund.failed', 'refund', 're_Mapper'));
    const [observation] = await h.mapper.normalize(discovery, binding(), fence);
    assert.equal(observation!.refundId, 're_Mapper');
    assert.equal(observation!.stripe?.supported, false);
  });
}

test('charge refund event lists and refetches individual refunds; cumulative amount is never cash', async () => {
  const h = harness();
  const discovery = await h.mapper.discover(event('charge.refunded', 'charge', 'ch_Mapper'));
  const observations = await h.mapper.normalize(discovery, binding(), fence);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]!.amountMinor, '100');
  assert.ok(h.calls.includes('refunds'));
  assert.ok(h.calls.includes('refund'));
});

test('subscription lifecycle normalization is separate and cannot emit a cash observation', async () => {
  const h = harness('subscription');
  const discovery = await h.mapper.discover(event('customer.subscription.updated', 'subscription', 'sub_Mapper'));
  assert.deepEqual(await h.mapper.normalize(discovery, binding('subscription'), fence), []);
  const observation = await h.mapper.normalizeSubscription(discovery, binding('subscription'), fence);
  assert.equal(observation!.externalId, 'sub_Mapper');
  assert.equal(observation!.status, 'active');
  assert.equal(observation!.cancelAtPeriodEnd, true);
  assert.equal(observation!.periodEnd!.toISOString(), '2026-02-28T12:00:00.000Z');
});

for (const type of ['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed']) {
  test(`${type} parses and discovers the canonical disputed payment`, async () => {
    const h = harness();
    const hint = event(type, 'dispute', 'du_Mapper');
    assert.equal(hint.objectId, h.dispute.id);
    const discovery = await h.mapper.discoverIdentity(hint);
    assert.equal(discovery.customerId, customerId);
    assert.equal(discovery.chargeId, 'ch_Mapper');
    assert.equal(discovery.paymentIntentId, 'pi_Mapper');
    assert.equal(discovery.checkoutSessionId, 'cs_test_Mapper');
    assert.equal('workspaceId' in discovery, false);
  });
}

for (const status of ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review', 'lost', 'won']) {
  test(`canonical dispute ${status} maps one stable recovery phase without metadata authority`, async () => {
    const h = harness();
    const discovery = await h.mapper.discoverIdentity(event('charge.dispute.updated', 'dispute', 'du_Mapper'));
    const before = h.calls.filter((name) => name === 'dispute').length;
    h.dispute.status = status;
    const observations = await h.mapper.normalize(discovery, binding(), fence);
    assert.equal(observations.length, 1);
    const observation = observations[0]!;
    const expected = status === 'lost' ? 'charge.dispute.lost' : status === 'won' ? 'charge.dispute.reversed' : 'charge.dispute.created';
    assert.equal(observation.eventType, expected);
    assert.equal(observation.disputeId, 'du_Mapper');
    assert.equal(observation.economicLossId, 'dispute:du_Mapper');
    assert.equal(observation.relatedEventId, status === 'won' ? 'du_Mapper' : undefined);
    assert.equal(observation.amountMinor, '100');
    assert.equal(observation.stripe?.paymentAmountMinor, '900');
    assert.equal(observation.stripe?.supported, true);
    assert.equal(observation.workspaceId, binding().workspaceId);
    assert.equal(observation.productKey, undefined);
    assert.deepEqual(observation.fence, fence);
    assert.ok(h.calls.filter((name) => name === 'dispute').length > before);
  });
}

for (const status of ['warning_closed', 'prevented', 'pending', 'unknown']) {
  test(`dispute ${status} cannot create cash loss or restore credits`, async () => {
    const h = harness();
    h.dispute.status = status;
    const discovery = await h.mapper.discoverIdentity(event('charge.dispute.closed', 'dispute', 'du_Mapper'));
    assert.deepEqual(await h.mapper.normalize(discovery, binding(), fence), []);
  });
}

for (const target of ['live-dispute', 'live-charge', 'wrong-intent', 'wrong-charge', 'wrong-customer', 'wrong-invoice', 'wrong-checkout']) {
  test(`dispute ${target} rejects its canonical payment relationship`, async () => {
    const h = harness();
    const discovery = await h.mapper.discoverIdentity(event('charge.dispute.created', 'dispute', 'du_Mapper'));
    if (target === 'live-dispute') h.dispute.livemode = true;
    if (target === 'live-charge') h.charge.livemode = true;
    if (target === 'wrong-intent') h.dispute.payment_intent = 'pi_Other';
    if (target === 'wrong-charge') h.dispute.charge = 'ch_Other';
    if (target === 'wrong-customer') h.paymentIntent.customer = 'cus_Other';
    if (target === 'wrong-invoice') h.invoicePayment.payment.payment_intent = 'pi_Other';
    const local = target === 'wrong-invoice' ? {...binding(), invoiceId: 'in_Mapper'}
      : target === 'wrong-checkout' ? {...binding(), checkoutSessionId: 'cs_test_Other'} : binding();
    await assert.rejects(h.mapper.normalize(discovery, local, fence));
  });
}

for (const invalid of ['amount', 'currency', 'price', 'quantity']) {
  test(`dispute ${invalid} produces holding evidence`, async () => {
    const h = harness();
    const discovery = await h.mapper.discoverIdentity(event('charge.dispute.created', 'dispute', 'du_Mapper'));
    if (invalid === 'amount') h.dispute.amount = 901;
    if (invalid === 'currency') h.dispute.currency = 'eur';
    if (invalid === 'price') h.price.unit_amount = 899;
    if (invalid === 'quantity') h.line.quantity = 2;
    const [observation] = await h.mapper.normalize(discovery, binding(), fence);
    assert.equal(observation!.stripe?.supported, false);
  });
}

test('dispute with nullable PI still proves the original payment through its canonical Charge', async () => {
  const h = harness();
  h.dispute.payment_intent = null;
  const discovery = await h.mapper.discoverIdentity(event('charge.dispute.created', 'dispute', 'du_Mapper'));
  assert.equal(discovery.paymentIntentId, 'pi_Mapper');
  assert.equal((await h.mapper.normalize(discovery, binding(), fence))[0]!.stripe?.supported, true);
});

test('dispute opened, lost and won share one economic loss and retain original expired service period', async () => {
  const h = harness('subscription');
  h.invoice.billing_reason = 'subscription_cycle';
  h.item.current_period_start = Date.parse('2026-10-01T12:00:00Z') / 1000;
  h.item.current_period_end = Date.parse('2026-11-01T12:00:00Z') / 1000;
  const discovery = await h.mapper.discoverIdentity(event('charge.dispute.updated', 'dispute', 'du_Mapper'));
  assert.equal(discovery.invoiceId, 'in_Mapper');
  const phases = [];
  for (const status of ['under_review', 'lost', 'won']) {
    h.dispute.status = status;
    // Each phase gets its own claim and canonical readback. No new service period is invented.
    const claim = {...fence, token: `claim-${status}`};
    const [observation] = await h.mapper.normalize(discovery, {...binding('subscription'), invoiceId: 'in_Mapper'}, claim);
    phases.push(observation!);
    assert.equal(observation!.stripe?.supported, true);
    assert.equal(observation!.periodStart, '2026-01-31T12:00:00.000Z');
    assert.equal(observation!.periodEnd, '2026-02-28T12:00:00.000Z');
    assert.equal(observation!.stripe?.billingReason, 'subscription_cycle');
    assert.equal(observation!.paidAt, '2026-01-31T12:00:00.000Z');
    assert.equal(observation!.fence!.token, claim.token);
  }
  assert.equal(new Set(phases.map((observation) => observation.economicLossId)).size, 1);
  assert.deepEqual(phases.map((observation) => observation.eventType), ['charge.dispute.created', 'charge.dispute.lost', 'charge.dispute.reversed']);
  assert.equal(phases[2]!.relatedEventId, phases[0]!.disputeId);
});
