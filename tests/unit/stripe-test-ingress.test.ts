import assert from 'node:assert/strict';
import {test} from 'node:test';
import Stripe from 'stripe';
import {verifyStripeTestWebhook} from '../../src/adapters/billing/stripe-test-ingress.ts';

const secret = 'whsec_unit_test_only';
const payload = JSON.stringify({id: 'evt_test', object: 'event', type: 'checkout.session.completed', livemode: false, data: {object: {id: 'cs_test_example', object: 'checkout.session', metadata: {workspaceId: 'untrusted'}}}});
const header = (body = payload) => Stripe.webhooks.generateTestHeaderString({payload: body, secret});
test('test ingress verifies raw bytes and returns only transport identity', () => {
  const result = verifyStripeTestWebhook(new TextEncoder().encode(payload), header(), secret);
  assert.equal(result.hint.eventId, 'evt_test');
  assert.equal(result.hint.objectId, 'cs_test_example');
  assert.ok(!JSON.stringify(result).includes('untrusted'));
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
});
test('rotating signature headers accept a valid signature without trusting an invalid sibling', () => {
  const result = verifyStripeTestWebhook(new TextEncoder().encode(payload), `${header()},v1=${'0'.repeat(64)}`, secret);
  assert.equal(result.hint.livemode, false);
});
test('tampering, missing signature, oversized bodies and stale signatures are rejected', () => {
  for (const [body, signature] of [[`${payload} `, header()], [payload, null], ['x'.repeat(262145), header()], [payload, Stripe.webhooks.generateTestHeaderString({payload, secret, timestamp: 1})]] as const) {
    assert.throws(() => verifyStripeTestWebhook(new TextEncoder().encode(body), signature, secret));
  }
});
test('signed live events and fixture envelopes cannot activate Stripe reconciliation', () => {
  const live = payload.replace('"livemode":false', '"livemode":true');
  assert.throws(() => verifyStripeTestWebhook(new TextEncoder().encode(live), header(live), secret));
  const fixture = JSON.stringify({id: 'evt_fixture', type: 'checkout.completed', data: {object: {workspaceId: 'w'}}});
  assert.throws(() => verifyStripeTestWebhook(new TextEncoder().encode(fixture), header(fixture), secret));
});
