import {deepEqual, equal, notEqual} from 'node:assert/strict';
import {test} from 'node:test';

import {createFakeBillingProvider} from '../../src/adapters/billing/fake.ts';
import {resolveCheckoutHandoff} from '../../src/components/billing/checkout-handoff.ts';
import {snapshotBillingProduct} from '../../src/config/plans.ts';
import {checkoutClientFields, presentCheckoutResult, type CheckoutResult} from '../../src/modules/billing/checkout.ts';
import {parseCheckoutRequest, parsePortalRequest} from '../../src/modules/billing/contracts.ts';
import {parseVerifiedBillingEvent, signFixtureWebhook, verifyStripeSignature} from '../../src/adapters/billing/stripe-webhooks.ts';

function checkoutResult(patch: Partial<CheckoutResult> = {}): CheckoutResult {
  return {attemptId: 'attempt-1', status: 'open', provider: 'stripe', sessionId: 'cs_test_UnitSession', checkoutUrl: null, clientSecret: 'cs_test_UnitSession_secret_UnitSecret', idempotencyKey: 'checkout:attempt-1', ...patch};
}

test('local provider is deterministic and idempotent by persisted Checkout key', async () => {
  const provider = createFakeBillingProvider();
  const catalog = snapshotBillingProduct('fixture-monthly', 'local');
  const input = {attemptId: 'attempt-1', workspaceId: '00000000-0000-4000-8000-000000000001', customerId: 'fixture_customer_1', idempotencyKey: 'checkout:attempt-1', catalog};
  const first = await provider.createCheckout(input);
  const replay = await provider.createCheckout({...input, attemptId: 'attempt-changed'});
  deepEqual(replay, first);
  if ('unknown' in first || !first.url) throw new Error('The default local provider must return a deterministic session.');
  equal(first.url.startsWith('http://localhost:3100/checkout/fixture/'), true);
});

test('local provider retains an unknown response until the same key is reconciled by a stable provider', async () => {
  const provider = createFakeBillingProvider({unknownCheckoutKeys: new Set(['checkout:unknown'])});
  const catalog = snapshotBillingProduct('fixture-pack', 'test');
  const input = {attemptId: 'attempt-unknown', workspaceId: '00000000-0000-4000-8000-000000000001', customerId: 'fixture_customer_1', idempotencyKey: 'checkout:unknown', catalog};
  const first = await provider.createCheckout(input);
  const retry = await provider.createCheckout(input);
  equal('unknown' in first, true);
  equal('unknown' in retry, true);
});

test('portal URL is provider-owned and ignores a caller supplied return destination', async () => {
  const provider = createFakeBillingProvider();
  const first = await provider.createPortal({workspaceId: '00000000-0000-4000-8000-000000000001', customerId: 'fixture_customer_1', idempotencyKey: 'portal:one', returnUrl: 'https://evil.example/steal'});
  const replay = await provider.createPortal({workspaceId: 'different', customerId: 'different', idempotencyKey: 'portal:one', returnUrl: 'https://evil.example/other'});
  notEqual(first.url, 'https://evil.example/steal');
  deepEqual(replay, first);
});

test('route DTOs reject extra browser-controlled billing fields', () => {
  deepEqual(parseCheckoutRequest({catalogProductKey: 'fixture-monthly'}), {catalogProductKey: 'fixture-monthly'});
  for (const extra of ['priceId', 'customerId', 'workspaceId', 'returnUrl', 'interval']) {
    const body = {catalogProductKey: 'fixture-monthly', [extra]: 'injected'};
    try { parseCheckoutRequest(body); throw new Error(`accepted ${extra}`); } catch (error) { if (error instanceof Error && error.message === `accepted ${extra}`) throw error; }
  }
  deepEqual(parsePortalRequest({}), {});
  for (const body of [{returnUrl: 'https://evil.example'}, {customerId: 'injected'}, {idempotencyKey: 'body-key'}]) {
    try { parsePortalRequest(body); throw new Error('accepted portal field'); } catch (error) { if (error instanceof Error && error.message === 'accepted portal field') throw error; }
  }
});

test('fixture webhook verifies raw bytes and rejects tampering or stale signatures', () => {
  const secret = 'local-test-webhook-secret';
  const raw = new TextEncoder().encode(JSON.stringify({id: 'evt_1', type: 'invoice.paid', data: {object: {invoiceId: 'in_1'}}}));
  const signature = signFixtureWebhook(raw, secret, 1_791_000_000);
  verifyStripeSignature(raw, signature, secret, new Date(1_791_000_000 * 1000));
  const parsed = parseVerifiedBillingEvent(raw);
  equal(parsed.eventId, 'evt_1');
  equal(parsed.payloadHash.length, 64);
  try { verifyStripeSignature(new TextEncoder().encode(`${new TextDecoder().decode(raw)} `), signature, secret, new Date(1_791_000_000 * 1000)); throw new Error('accepted tampered body'); } catch (error) { if (error instanceof Error && error.message === 'accepted tampered body') throw error; }
  try { verifyStripeSignature(raw, signature, secret, new Date((1_791_000_000 + 301) * 1000)); throw new Error('accepted stale signature'); } catch (error) { if (error instanceof Error && error.message === 'accepted stale signature') throw error; }
});

test('stripe test checkout response exposes an embedded client secret without a hosted url', () => {
  const embedded = presentCheckoutResult(checkoutResult(), 'pk_test_UnitPublishable');
  equal(embedded.checkoutUrl, null);
  equal(embedded.clientSecret, 'cs_test_UnitSession_secret_UnitSecret');
  equal(embedded.publishableKey, 'pk_test_UnitPublishable');
  equal(presentCheckoutResult(checkoutResult(), 'pk_live_UnitPublishable').publishableKey, null);
  equal(presentCheckoutResult(checkoutResult(), '').publishableKey, null);
  const fixture = presentCheckoutResult(checkoutResult({provider: 'fixture', sessionId: 'fixture_session_abc', checkoutUrl: 'http://localhost:3100/checkout/fixture/abc', clientSecret: null}), 'pk_test_UnitPublishable');
  equal(fixture.checkoutUrl, 'http://localhost:3100/checkout/fixture/abc');
  equal(fixture.clientSecret, null);
  equal(fixture.publishableKey, null);
});

test('checkout credentials stay reusable only while the provider session is open', () => {
  const secret = 'cs_test_UnitSession_secret_UnitSecret';
  deepEqual(checkoutClientFields({status: 'open', observation: {sessionId: 'cs_test_UnitSession', url: null, clientSecret: secret}}), {checkoutUrl: null, clientSecret: secret});
  deepEqual(checkoutClientFields({status: 'open', observation: {sessionId: 'cs_test_UnitSession', url: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession', status: 'open'}}), {checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession', clientSecret: null});
  deepEqual(checkoutClientFields({status: 'open', observation: {unknown: true}, previous: {checkoutUrl: null, clientSecret: secret}}), {checkoutUrl: null, clientSecret: secret});
  deepEqual(checkoutClientFields({status: 'open', observation: {sessionId: 'cs_test_UnitSession', url: null, clientSecret: secret, status: 'paid'}}), {checkoutUrl: null, clientSecret: null});
  deepEqual(checkoutClientFields({status: 'expired', observation: {sessionId: 'cs_test_UnitSession', url: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession', clientSecret: secret, status: 'expired'}}), {checkoutUrl: null, clientSecret: null});
});

test('billing UI mounts embedded checkout when a client secret is present', () => {
  const secret = 'cs_test_UnitSession_secret_UnitSecret';
  const publishableKey = 'pk_test_UnitPublishable';
  deepEqual(resolveCheckoutHandoff({clientSecret: secret, publishableKey, checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession'}), {action: 'embed', clientSecret: secret, publishableKey});
  deepEqual(resolveCheckoutHandoff({clientSecret: secret, publishableKey: null, checkoutUrl: 'http://localhost:3100/checkout/fixture/abc'}), {action: 'missing_publishable_key'});
  deepEqual(resolveCheckoutHandoff({checkoutUrl: 'http://localhost:3100/checkout/fixture/abc', clientSecret: null}), {action: 'redirect', url: 'http://localhost:3100/checkout/fixture/abc'});
  deepEqual(resolveCheckoutHandoff({checkoutUrl: null, clientSecret: null}), {action: 'pending'});
  deepEqual(resolveCheckoutHandoff({clientSecret: 'not-a-client-secret', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_UnitSession'}), {action: 'pending'});
});

test('fixture webhook parser retains only supported event envelope', () => {
  const raw = new TextEncoder().encode(JSON.stringify({id: 'evt_2', type: 'invoice.paid', data: {object: {invoiceId: 'in_2', secret: 'discarded'}}}));
  const event = parseVerifiedBillingEvent(raw);
  equal((event.payload.data as {object: {invoiceId: string}}).object.invoiceId, 'in_2');
});
