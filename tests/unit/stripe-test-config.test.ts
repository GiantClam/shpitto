import assert from 'node:assert/strict';
import test from 'node:test';
import {semanticHash} from '../../src/contracts/http.ts';
import {parseStripeTestConfiguration} from '../../src/config/billing-test.ts';

function input() {
  const payload = {catalogVersion: 1, productKey: 'test-monthly', kind: 'subscription', interval: 'month', credits: '1000', amountMinor: '2500', currency: 'usd', creditExpiry: 'service_period_end', provider: 'stripe', priceReference: 'price_TestMonthly'};
  return {driver: 'stripe_test', runtimeProfile: 'acceptance', secretKey: 'sk_test_ExampleOnly', webhookSecret: 'whsec_TestOnly', portalConfigurationId: 'bpc_TestOnly', appUrl: 'https://acceptance.example.test', catalogJson: JSON.stringify([{...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)}])};
}

test('fixture configuration stays offline even when a Stripe key exists', () => {
  assert.equal(parseStripeTestConfiguration({...input(), driver: ''}), null);
});

test('explicit acceptance test catalog is immutable and binds real price identities', () => {
  const config = parseStripeTestConfiguration(input());
  assert.equal(config?.catalog[0]?.provider, 'stripe');
  assert.equal(config?.catalog[0]?.priceReference, 'price_TestMonthly');
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config?.catalog));
});

test('live credentials, production activation and unsafe return origins are rejected', () => {
  for (const change of [{secretKey: 'sk_live_ExampleOnly'}, {secretKey: 'rk_live_ExampleOnly'}, {runtimeProfile: 'production'}, {runtimeProfile: 'local'}, {appUrl: 'http://acceptance.example.test'}, {appUrl: 'https://user:password@acceptance.example.test'}, {portalConfigurationId: ''}, {webhookSecret: ''}, {driver: 'stripe'}]) {
    assert.throws(() => parseStripeTestConfiguration({...input(), ...change}));
  }
});

test('empty, tampered, duplicate and fixture catalog terms cannot enable Stripe', () => {
  const good = JSON.parse(input().catalogJson)[0];
  for (const catalog of [[], [good, good], [{...good, credits: '9999'}], [{...good, provider: 'fixture'}], {products: [good]}]) {
    assert.throws(() => parseStripeTestConfiguration({...input(), catalogJson: JSON.stringify(catalog)}));
  }
});
