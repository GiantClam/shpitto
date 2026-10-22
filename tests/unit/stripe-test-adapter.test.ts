import assert from 'node:assert/strict';
import {test} from 'node:test';

import {semanticHash} from '../../src/contracts/http.ts';
import {parseBillingCatalogSnapshot} from '../../src/modules/billing/contracts.ts';
import {createStripeTestAdapter, STRIPE_TEST_API_VERSION, type StripeTestClient} from '../../src/adapters/billing/stripe-test.ts';

const secretKey = 'sk_test_AdapterUnitOnly';
const appUrl = 'https://app.example.test';
const workspaceId = 'workspace-one';
const customerId = 'cus_UnitCustomer';
const customerKey = 'customer:workspace-one';
const customer = {id: customerId, livemode: false, metadata: {workspaceId, idempotencyKey: customerKey}};

function catalog(kind: 'pack' | 'subscription' = 'pack') {
  const terms = {catalogVersion: 1, productKey: `test-${kind}`, kind, interval: kind === 'pack' ? null : 'month', credits: '250', amountMinor: '900', currency: 'usd', creditExpiry: kind === 'pack' ? 'never' : 'service_period_end', provider: 'stripe', priceReference: 'price_UnitPrice'};
  return parseBillingCatalogSnapshot({...terms, snapshotHash: semanticHash('billing.catalog.snapshot', terms)});
}

function price(kind: 'pack' | 'subscription' = 'pack') {
  return {id: 'price_UnitPrice', livemode: false, active: true, currency: 'usd', unit_amount: 900, type: kind === 'pack' ? 'one_time' : 'recurring', billing_scheme: 'per_unit', tiers_mode: null, transform_quantity: null, recurring: kind === 'pack' ? null : {interval: 'month', interval_count: 1, usage_type: 'licensed'}};
}

function checkoutInput(kind: 'pack' | 'subscription' = 'pack') {
  return {workspaceId, customerId, attemptId: 'attempt-one', idempotencyKey: 'checkout:attempt-one', catalog: catalog(kind)};
}

function checkoutMetadata(kind: 'pack' | 'subscription' = 'pack') {
  const input = checkoutInput(kind);
  return {workspaceId, customerId, attemptId: input.attemptId, idempotencyKey: input.idempotencyKey, catalogHash: input.catalog.snapshotHash, productKey: input.catalog.productKey};
}

function session(kind: 'pack' | 'subscription' = 'pack') {
  return {id: 'cs_test_UnitSession', livemode: false, customer: customerId, metadata: checkoutMetadata(kind), client_reference_id: 'attempt-one', mode: kind === 'pack' ? 'payment' : 'subscription', status: 'open', payment_status: 'unpaid', currency: 'usd', amount_total: 900, expires_at: 1800000000, url: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession', payment_intent: kind === 'pack' ? 'pi_UnitPayment' : null, subscription: null, line_items: {has_more: false, data: [{quantity: 1, price: {id: 'price_UnitPrice'}}]}};
}

const refundInput = {workspaceId, customerId, requestId: 'request-one', orderId: 'order-one', paymentIntentId: 'pi_UnitPayment', amountMinor: '900', currency: 'usd', idempotencyKey: 'refund:request-one'};

function refund(status = 'succeeded') {
  return {id: 're_UnitRefund', amount: 900, currency: 'usd', customer: customerId, payment_intent: 'pi_UnitPayment', status, metadata: {workspaceId, customerId, requestId: refundInput.requestId, orderId: refundInput.orderId, idempotencyKey: refundInput.idempotencyKey}};
}

function harness(kind: 'pack' | 'subscription' = 'pack') {
  const calls: {method: string; args: unknown[]}[] = [];
  const record = <T>(method: string, value: T) => async (...args: unknown[]) => {calls.push({method, args}); return value;};
  const client: StripeTestClient = {
    customers: {create: record('customers.create', customer), retrieve: record('customers.retrieve', customer), list: record('customers.list', {data: [customer], has_more: false})},
    prices: {retrieve: record('prices.retrieve', price(kind))},
    checkout: {sessions: {create: record('checkout.create', session(kind)), retrieve: record('checkout.retrieve', session(kind))}},
    paymentIntents: {retrieve: record('paymentIntents.retrieve', {id: 'pi_UnitPayment', livemode: false, customer: customerId, currency: 'usd', amount_received: 900, status: 'succeeded'})},
    refunds: {create: record('refunds.create', refund()), retrieve: record('refunds.retrieve', refund()), list: record('refunds.list', {data: [refund()], has_more: false})},
    billingPortal: {
      configurations: {retrieve: record('portal.configuration', {id: 'bpc_UnitConfig', livemode: false, active: true, features: {subscription_update: {enabled: false}, subscription_cancel: {enabled: true, mode: 'at_period_end', proration_behavior: 'none'}}})},
      sessions: {create: record('portal.create', {id: 'bps_UnitPortal', livemode: false, customer: customerId, configuration: 'bpc_UnitConfig', return_url: `${appUrl}/workspaces/${workspaceId}/billing`, url: 'https://billing.stripe.com/p/session/test_UnitPortal'})},
    },
  };
  const adapter = () => createStripeTestAdapter({secretKey, appUrl, portalConfigurationId: 'bpc_UnitConfig', client});
  return {client, calls, adapter};
}

test('factory rejects live/restricted-live/publishable keys and unsafe origins before touching a client', () => {
  const {client, calls} = harness();
  for (const key of ['sk_live_UnitOnly', 'rk_live_UnitOnly', 'pk_test_UnitOnly', '', ` ${secretKey}`, 'sk_test_UnitOnly\n']) {
    assert.throws(() => createStripeTestAdapter({secretKey: key, appUrl, client}), /test/i);
  }
  for (const url of ['javascript:alert(1)', 'http://public.example.test', 'https://user:password@app.example.test', `${appUrl}/?token=private`]) {
    assert.throws(() => createStripeTestAdapter({secretKey, appUrl: url, client}), /origin/i);
  }
  assert.equal(STRIPE_TEST_API_VERSION, '2026-08-26.dahlia');
  assert.ok(createStripeTestAdapter({secretKey: 'rk_test_UnitOnly', appUrl: 'http://localhost:3100', client}));
  assert.equal(calls.length, 0);
});

test('customer creation and readback bind workspace and the exact stable provisioning key', async () => {
  const {adapter, calls} = harness();
  const input = {workspaceId, idempotencyKey: customerKey};
  const created = await adapter().createCustomer(input);
  assert.equal(created.status, 'succeeded');
  assert.deepEqual(calls[0], {method: 'customers.create', args: [{metadata: input}, {idempotencyKey: customerKey}]});
  const read = await adapter().retrieveCustomer({...input, customerId});
  assert.deepEqual(read, created);
  const recovered = await adapter().lookupCustomer(input);
  assert.deepEqual(recovered, created);
  assert.equal(calls.filter((call) => call.method === 'customers.create').length, 1);
});

test('customer ambiguity remains unknown and lookup never creates or invents a customer', async () => {
  const {client, adapter, calls} = harness();
  client.customers.create = async () => {throw new Error(`unredacted ${secretKey}`);};
  const unknown = await adapter().createCustomer({workspaceId, idempotencyKey: customerKey});
  assert.deepEqual(unknown, {status: 'unknown', code: 'provider_unavailable'});
  assert.equal(JSON.stringify(unknown).includes(secretKey), false);
  client.customers.list = async () => ({data: [], has_more: false});
  assert.deepEqual(await adapter().lookupCustomer({workspaceId, idempotencyKey: customerKey}), {status: 'unknown', code: 'not_found'});
  assert.equal(calls.length, 0);
});

test('customer readback rejects deleted, live, wrong workspace and wrong provisioning key', async () => {
  const {client, adapter} = harness();
  for (const observed of [{id: customerId, deleted: true as const}, {...customer, livemode: true}, {...customer, metadata: {...customer.metadata, workspaceId: 'other'}}, {...customer, metadata: {...customer.metadata, idempotencyKey: 'customer:other'}}]) {
    client.customers.retrieve = async () => observed;
    assert.equal((await adapter().retrieveCustomer({workspaceId, customerId, idempotencyKey: customerKey})).status, 'failed');
  }
});

for (const kind of ['pack', 'subscription'] as const) {
  test(`${kind} Checkout binds a validated snapshot and propagates stable correlation to the payment/subscription`, async () => {
    const {adapter, calls} = harness(kind);
    const input = checkoutInput(kind);
    const result = await adapter().createCheckout(input);
    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.equal(result.value.paymentStatus, 'unpaid', 'A created session is not a confirmed payment.');
    const call = calls.find((item) => item.method === 'checkout.create')!;
    const params = call.args[0] as Record<string, unknown>;
    assert.deepEqual(call.args[1], {idempotencyKey: input.idempotencyKey});
    assert.equal(params.customer, customerId);
    assert.equal(params.mode, kind === 'pack' ? 'payment' : 'subscription');
    assert.deepEqual(params.line_items, [{price: input.catalog.priceReference, quantity: 1}]);
    assert.deepEqual(params.metadata, checkoutMetadata(kind));
    assert.deepEqual(params[kind === 'pack' ? 'payment_intent_data' : 'subscription_data'], {metadata: checkoutMetadata(kind)});
    assert.equal(new URL(params.success_url as string).origin, appUrl);
    assert.equal(new URL(params.cancel_url as string).origin, appUrl);
    assert.equal(params.ui_mode, 'hosted_page');
    assert.deepEqual(await adapter().retrieveCheckout({...input, sessionId: result.value.sessionId}), result);
  });
}

test('invalid snapshots, remote prices and wrong customers never create Checkout', async () => {
  const {client, adapter, calls} = harness();
  const input = checkoutInput();
  assert.equal((await adapter().createCheckout({...input, catalog: {...input.catalog, amountMinor: '901' as typeof input.catalog.amountMinor}})).status, 'failed');
  for (const patch of [{livemode: true}, {unit_amount: 901}, {currency: 'eur'}, {active: false}, {id: 'price_Wrong'}, {type: 'recurring', recurring: {interval: 'year', interval_count: 1, usage_type: 'licensed'}}, {billing_scheme: 'tiered'}]) {
    client.prices.retrieve = async () => ({...price(), ...patch});
    assert.equal((await adapter().createCheckout(input)).status, 'failed');
  }
  client.prices.retrieve = async () => price();
  client.customers.retrieve = async () => ({...customer, metadata: {workspaceId: 'other'}});
  assert.equal((await adapter().createCheckout(input)).status, 'failed');
  assert.equal(calls.some((call) => call.method === 'checkout.create'), false);
});

test('Checkout readback rejects wrong binding, price, live objects and hostile redirect URLs', async () => {
  const {client, adapter} = harness();
  for (const patch of [{customer: 'cus_Wrong'}, {livemode: true}, {metadata: {...checkoutMetadata(), attemptId: 'other'}}, {line_items: {has_more: true, data: []}}, {line_items: {has_more: false, data: [{quantity: 1, price: {id: 'price_Wrong'}}]}}, {url: 'https://checkout.stripe.com.evil.test/steal'}, {amount_total: 901}]) {
    client.checkout.sessions.retrieve = async () => ({...session(), ...patch});
    assert.equal((await adapter().retrieveCheckout({...checkoutInput(), sessionId: 'cs_test_UnitSession'})).status, 'failed');
  }
});

test('lost Checkout response stays unknown and retry uses identical provider parameters/key', async () => {
  const {client, adapter} = harness();
  const attempts: unknown[][] = [];
  client.checkout.sessions.create = async (...args) => {attempts.push(args); throw {type: 'StripeConnectionError', message: secretKey};};
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(await adapter().createCheckout(checkoutInput()), {status: 'unknown', code: 'provider_unavailable'});
  }
  assert.deepEqual(attempts[0], attempts[1]);
});

test('portal uses the injected configuration and a fixed return destination', async () => {
  const {adapter, calls} = harness();
  const result = await adapter().createPortal({workspaceId, customerId, idempotencyKey: 'portal:request-one'});
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls.find((call) => call.method === 'portal.create')?.args, [{customer: customerId, configuration: 'bpc_UnitConfig', return_url: `${appUrl}/workspaces/${workspaceId}/billing`}, {idempotencyKey: 'portal:request-one'}]);
});

test('portal refuses missing/live/unsafe configuration before creating a session', async () => {
  const {client, adapter, calls} = harness();
  const input = {workspaceId, customerId, idempotencyKey: 'portal:request-one'};
  assert.equal((await createStripeTestAdapter({secretKey, appUrl, client}).createPortal(input)).status, 'failed');
  for (const features of [{subscription_update: {enabled: true}, subscription_cancel: {enabled: true, mode: 'at_period_end'}}, {subscription_update: {enabled: false}, subscription_cancel: {enabled: true, mode: 'immediately'}}]) {
    client.billingPortal.configurations.retrieve = async () => ({id: 'bpc_UnitConfig', livemode: false, active: true, features});
    assert.equal((await adapter().createPortal(input)).status, 'failed');
  }
  client.billingPortal.configurations.retrieve = async () => ({id: 'bpc_UnitConfig', livemode: true, active: true, features: {subscription_update: {enabled: false}, subscription_cancel: {enabled: true, mode: 'at_period_end'}}});
  assert.equal((await adapter().createPortal(input)).status, 'failed');
  assert.equal(calls.some((call) => call.method === 'portal.create'), false);
});

test('refund submits only the canonical PaymentIntent and stable request metadata/key', async () => {
  const {adapter, calls} = harness();
  const result = await adapter().createRefund(refundInput);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls.find((call) => call.method === 'refunds.create')?.args, [{payment_intent: 'pi_UnitPayment', amount: 900, metadata: refund().metadata}, {idempotencyKey: refundInput.idempotencyKey}]);
  assert.deepEqual(await adapter().retrieveRefund({...refundInput, refundId: 're_UnitRefund'}), result);
  assert.deepEqual(await adapter().lookupRefund(refundInput), result);
});

test('pending/action-required/failed/canceled/unknown refunds never report succeeded', async () => {
  const {client, adapter} = harness();
  for (const [remote, expected] of [['pending', 'pending'], ['requires_action', 'pending'], ['failed', 'failed'], ['canceled', 'failed'], ['future_status', 'unknown']] as const) {
    client.refunds.create = async () => refund(remote);
    const result = await adapter().createRefund(refundInput);
    assert.equal(result.status, expected);
  }
  client.refunds.create = async () => {throw new Error(`lost response ${secretKey}`);};
  assert.deepEqual(await adapter().createRefund(refundInput), {status: 'unknown', code: 'provider_unavailable'});
});

test('refund rejects wrong amount/currency/payment target/customer/request metadata', async () => {
  const {client, adapter} = harness();
  for (const patch of [{amount: 899}, {currency: 'eur'}, {payment_intent: 'pi_Other'}, {customer: 'cus_Other'}, {metadata: {...refund().metadata, requestId: 'other'}}]) {
    client.refunds.retrieve = async () => ({...refund(), ...patch});
    assert.equal((await adapter().retrieveRefund({...refundInput, refundId: 're_UnitRefund'})).status, 'failed');
  }
});

test('refund validates the test PaymentIntent/customer/currency/received amount before any POST', async () => {
  const {client, adapter, calls} = harness();
  for (const patch of [{livemode: true}, {customer: 'cus_Other'}, {currency: 'eur'}, {amount_received: 100}, {status: 'processing'}]) {
    client.paymentIntents.retrieve = async () => ({id: 'pi_UnitPayment', livemode: false, customer: customerId, currency: 'usd', amount_received: 900, status: 'succeeded', ...patch});
    assert.equal((await adapter().createRefund(refundInput)).status, 'failed');
  }
  assert.equal(calls.some((call) => call.method === 'refunds.create'), false);
});

test('refund lookup is read-only, paginated and refuses incomplete or duplicate matches', async () => {
  const {client, adapter, calls} = harness();
  const cursors: (string | undefined)[] = [];
  client.refunds.list = async (params) => {
    cursors.push(params.starting_after);
    return params.starting_after ? {data: [refund()], has_more: false} : {data: [{...refund(), id: 're_Unrelated', metadata: {...refund().metadata, requestId: 'unrelated', idempotencyKey: 'refund:unrelated'}}], has_more: true};
  };
  assert.equal((await adapter().lookupRefund(refundInput)).status, 'succeeded');
  assert.deepEqual(cursors, [undefined, 're_Unrelated']);
  client.refunds.list = async () => ({data: [refund(), {...refund(), id: 're_Duplicate'}], has_more: false});
  assert.equal((await adapter().lookupRefund(refundInput)).status, 'failed');
  client.refunds.list = async () => ({data: [refund()], has_more: true});
  assert.equal((await adapter().lookupRefund(refundInput)).status, 'unknown');
  assert.equal(calls.some((call) => call.method === 'refunds.create'), false);
});

test('provider errors expose only safe fixed codes and no SDK message or raw body', async () => {
  const {client, adapter} = harness();
  client.customers.create = async () => {throw {type: 'StripeAuthenticationError', message: secretKey, raw: {headers: {authorization: secretKey}}};};
  const result = await adapter().createCustomer({workspaceId, idempotencyKey: customerKey});
  assert.deepEqual(result, {status: 'failed', code: 'provider_rejected'});
  assert.equal(JSON.stringify(result).includes(secretKey), false);
});

test('portal refuses proration and validates returned customer/configuration/return URL', async () => {
  const {client, adapter, calls} = harness();
  const input = {workspaceId, customerId, idempotencyKey: 'portal:request-one'};
  const originalConfiguration = client.billingPortal.configurations.retrieve;
  client.billingPortal.configurations.retrieve = async () => ({id: 'bpc_UnitConfig', livemode: false, active: true, features: {subscription_update: {enabled: false}, subscription_cancel: {enabled: true, mode: 'at_period_end', proration_behavior: 'create_prorations'}}});
  assert.equal((await adapter().createPortal(input)).status, 'failed');
  assert.equal(calls.some((call) => call.method === 'portal.create'), false);
  client.billingPortal.configurations.retrieve = originalConfiguration;
  for (const patch of [{livemode: true}, {customer: 'cus_Other'}, {configuration: 'bpc_Other'}, {return_url: 'https://other.example.test'}, {url: 'javascript:alert(1)'}]) {
    client.billingPortal.sessions.create = async () => ({id: 'bps_UnitPortal', livemode: false, customer: customerId, configuration: 'bpc_UnitConfig', return_url: `${appUrl}/workspaces/${workspaceId}/billing`, url: 'https://billing.stripe.com/p/session/test_UnitPortal', ...patch});
    assert.equal((await adapter().createPortal(input)).status, 'failed');
  }
});

test('completed unpaid and expired Checkout readbacks are successful observations without payment claims', async () => {
  const {client, adapter} = harness();
  for (const status of ['complete', 'expired']) {
    client.checkout.sessions.retrieve = async () => ({...session(), status, url: null});
    const result = await adapter().retrieveCheckout({...checkoutInput(), sessionId: 'cs_test_UnitSession'});
    assert.equal(result.status, 'succeeded');
    if (result.status === 'succeeded') {
      assert.equal(result.value.status, status);
      assert.equal(result.value.paymentStatus, 'unpaid');
      assert.equal(result.value.url, null);
    }
  }
});

test('customer lookup rejects ambiguous identity, paginates, and stops on incomplete history', async () => {
  const {client, adapter} = harness();
  const input = {workspaceId, idempotencyKey: customerKey};
  client.customers.list = async (params) => params.starting_after ? {data: [customer], has_more: false} : {data: [{...customer, id: 'cus_Other', metadata: {workspaceId: 'other', idempotencyKey: 'customer:other'}}], has_more: true};
  assert.equal((await adapter().lookupCustomer(input)).status, 'succeeded');
  client.customers.list = async () => ({data: [customer, {...customer, id: 'cus_Duplicate'}], has_more: false});
  assert.equal((await adapter().lookupCustomer(input)).status, 'failed');
  client.customers.list = async () => ({data: [], has_more: true});
  assert.deepEqual(await adapter().lookupCustomer(input), {status: 'unknown', code: 'lookup_incomplete'});
  let pages = 0;
  client.customers.list = async () => ({data: [{...customer, id: `cus_Page${++pages}`, metadata: {workspaceId: 'other', idempotencyKey: 'customer:other'}}], has_more: true});
  assert.deepEqual(await adapter().lookupCustomer(input), {status: 'unknown', code: 'lookup_incomplete'});
  assert.equal(pages, 10);
});

test('refund readback permits a null refund customer only after the canonical payment customer is verified', async () => {
  const {client, adapter} = harness();
  client.refunds.retrieve = async () => ({...refund(), customer: null});
  assert.equal((await adapter().retrieveRefund({...refundInput, refundId: 're_UnitRefund'})).status, 'succeeded');
  client.paymentIntents.retrieve = async () => ({id: 'pi_UnitPayment', livemode: false, customer: {id: customerId, deleted: true}, currency: 'usd', amount_received: 900, status: 'succeeded'});
  assert.equal((await adapter().retrieveRefund({...refundInput, refundId: 're_UnitRefund'})).status, 'failed');
});

test('invalid refund intent and absent provider evidence cannot be upgraded to confirmation', async () => {
  const {client, adapter, calls} = harness();
  for (const patch of [{amountMinor: '0'}, {amountMinor: '9007199254740992'}, {amountMinor: '01'}, {currency: 'USD'}, {paymentIntentId: 'ch_WrongTarget'}, {idempotencyKey: 'short'}]) {
    assert.equal((await adapter().createRefund({...refundInput, ...patch})).status, 'failed');
  }
  assert.equal(calls.length, 0);
  client.refunds.list = async () => ({data: [], has_more: false});
  assert.deepEqual(await adapter().lookupRefund(refundInput), {status: 'unknown', code: 'not_found'});
  client.refunds.retrieve = async () => {throw {type: 'StripeAPIError', statusCode: 500, message: secretKey};};
  assert.deepEqual(await adapter().retrieveRefund({...refundInput, refundId: 're_UnitRefund'}), {status: 'unknown', code: 'provider_unavailable'});
  assert.equal((await adapter().retrieveRefund({...refundInput, refundId: ''})).status, 'failed');
});

test('Checkout validates frozen snapshot copies across asynchronous preflight', async () => {
  const {client, adapter, calls} = harness();
  const input = {...checkoutInput()};
  client.customers.retrieve = async () => {
    input.customerId = 'cus_Changed';
    input.idempotencyKey = 'checkout:changed';
    return customer;
  };
  assert.equal((await adapter().createCheckout(input)).status, 'succeeded');
  const call = calls.find((entry) => entry.method === 'checkout.create')!;
  assert.equal((call.args[0] as {customer: string}).customer, customerId);
  assert.deepEqual(call.args[1], {idempotencyKey: 'checkout:attempt-one'});
});

test('deactivated prices block new Checkout but do not invalidate a bound historical session', async () => {
  const {client, adapter, calls} = harness();
  client.prices.retrieve = async () => ({...price(), active: false});
  assert.equal((await adapter().createCheckout(checkoutInput())).status, 'failed');
  assert.equal(calls.some((call) => call.method === 'checkout.create'), false);
  assert.equal((await adapter().retrieveCheckout({...checkoutInput(), sessionId: 'cs_test_UnitSession'})).status, 'succeeded');
});

test('portal configuration must explicitly disable cancellation prorations', async () => {
  const {client, adapter, calls} = harness();
  client.billingPortal.configurations.retrieve = async () => ({id: 'bpc_UnitConfig', livemode: false, active: true, features: {subscription_update: {enabled: false}, subscription_cancel: {enabled: true, mode: 'at_period_end'}}});
  assert.equal((await adapter().createPortal({workspaceId, customerId, idempotencyKey: 'portal:request-one'})).status, 'failed');
  assert.equal(calls.some((call) => call.method === 'portal.create'), false);
});
