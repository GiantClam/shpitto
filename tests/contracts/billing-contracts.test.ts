import {deepEqual, equal, notEqual, throws} from 'node:assert/strict';
import {test} from 'node:test';

import {getBillingCatalog, snapshotBillingProduct} from '../../src/config/plans.ts';
import {semanticHash} from '../../src/contracts/http.ts';
import {parseBillingCatalogSnapshot, parseCheckoutRequest, parseCredits, parseMoneyMinor, parsePaymentAlias} from '../../src/modules/billing/contracts.ts';

test('only explicit local/test profiles expose fixture monthly subscriptions and permanent packs', () => {
  deepEqual(getBillingCatalog('production'), []);
  throws(() => getBillingCatalog('unexpected' as 'local'));
  const catalog = getBillingCatalog('test');
  equal(catalog.length, 2);
  equal(catalog.filter((product) => product.kind === 'subscription').length, 1);
  equal(catalog.find((product) => product.kind === 'subscription')?.interval, 'month');
  equal(catalog.find((product) => product.kind === 'pack')?.creditExpiry, 'never');
  equal(catalog.every((product) => product.provider === 'fixture'), true);
  throws(() => snapshotBillingProduct('fixture-monthly', 'production'));
});

test('catalog snapshots are stable, frozen, strict and separate cash from credits', () => {
  const first = snapshotBillingProduct('fixture-monthly', 'test');
  const second = snapshotBillingProduct('fixture-monthly', 'test');
  deepEqual(first, second);
  equal(Object.isFrozen(first), true);
  notEqual(first.amountMinor, first.credits);
  deepEqual(parseBillingCatalogSnapshot(JSON.parse(JSON.stringify(first))), first);
  for (const change of [{interval: 'year'}, {credits: 1}, {amountMinor: '1.5'}, {amountMinor: '-1'}, {credits: '0'}, {currency: 'USD'}, {provider: 'stripe'}, {surprise: true}, {snapshotHash: 'a'.repeat(64)}]) {
    throws(() => parseBillingCatalogSnapshot({...first, ...change}));
  }
  equal(snapshotBillingProduct('fixture-pack', 'local').interval, null);
});

test('domain snapshots can describe a future reviewed Stripe mapping without enabling a production product', () => {
  const {snapshotHash: _hash, ...fixture} = snapshotBillingProduct('fixture-monthly', 'test');
  const payload = {...fixture, provider: 'stripe', priceReference: 'price_TESTONLYContract'};
  equal(parseBillingCatalogSnapshot({...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)}).provider, 'stripe');
  deepEqual(getBillingCatalog('production'), []);
  for (const change of [{amountMinor: '0'}, {interval: 'year'}, {provider: 'stripe', priceReference: 'fixture:monthly:v1'}]) {
    const invalid = {...payload, ...change};
    throws(() => parseBillingCatalogSnapshot({...invalid, snapshotHash: semanticHash('billing.catalog.snapshot', invalid)}));
  }
});

test('checkout input cannot smuggle customer, price, tenant, interval or redirects', () => {
  deepEqual(parseCheckoutRequest({catalogProductKey: 'fixture-monthly'}), {catalogProductKey: 'fixture-monthly'});
  for (const value of [null, [], {}, {catalogProductKey: ''}, {catalogProductKey: 1}, {catalogProductKey: ' fixture-monthly'}, ...['workspaceId', 'customerId', 'priceId', 'amountMinor', 'interval', 'returnUrl'].map((key) => ({catalogProductKey: 'fixture-monthly', [key]: 'injected'}))]) {
    throws(() => parseCheckoutRequest(value));
  }
});

test('money and credit quantities cross JSON as canonical bounded decimal strings', () => {
  equal(parseMoneyMinor('0'), '0');
  equal(parseCredits('9223372036854775807'), '9223372036854775807');
  for (const invalid of [0, 10n, '01', '-1', '1.0', '1e2', ' 1', '9223372036854775808']) {
    throws(() => parseMoneyMinor(invalid));
    throws(() => parseCredits(invalid));
  }
  throws(() => parseCredits('0'));
});

test('canonical aliases distinguish transport objects without accepting unknown identity fields', () => {
  deepEqual(parsePaymentAlias({provider: 'fixture', objectKind: 'invoice', externalId: 'fixture-invoice-1'}), {provider: 'fixture', objectKind: 'invoice', externalId: 'fixture-invoice-1'});
  for (const change of [{objectKind: 'webhook_event'}, {provider: 'unknown'}, {externalId: ''}, {externalId: ' bad'}, {externalId: 'x'.repeat(256)}, {workspaceId: 'smuggled'}]) {
    throws(() => parsePaymentAlias({provider: 'stripe', objectKind: 'invoice', externalId: 'in_fixture', ...change}));
  }
});
