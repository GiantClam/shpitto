import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {commercialBlockers, hostedCheckoutUrl, recordSourceOrder, canReceiveRelease, canAccessRelease} from '../../vendor/sales/commerce.mjs';
import {salesHandler} from '../../vendor/sales/server.mjs';

const config = JSON.parse(readFileSync('vendor/sales/commerce.config.json', 'utf8'));
const order = {provider: 'lemon-squeezy', mode: 'mock', status: 'paid', merchantId: 'local-vendor-fixture', id: 'fixture-order-1', buyerId: 'fixture-buyer-1', githubIdentity: 'fixture-github', purchasedAt: '2026-10-07T00:00:00.000Z'};
const release = {version: 'v1', artifactSha256: 'a'.repeat(64)};

test('default commercial configuration remains mock and cannot open real checkout', () => {
  assert.equal(config.mode, 'mock');
  assert.equal(config.provider, 'lemon-squeezy');
  assert.ok(commercialBlockers(config).includes('merchantApproval'));
  assert.ok(commercialBlockers(config).includes('sourcePrice'));
  assert.ok(commercialBlockers(config).includes('publicationAuthorization'));
  assert.throws(() => hostedCheckoutUrl(config), /blocked/);
});

const approvedConfig = () => ({...config, mode: 'hosted', merchantId: 'approved-merchant', hostedCheckoutUrl: 'https://test-store.lemonsqueezy.com/checkout/buy/00000000-0000-0000-0000-000000000001', approvals: Object.fromEntries(Object.keys(config.approvals).map((key) => [key, {status: 'approved', evidence: 'fixture-approved-record'}]))});

test('hosted checkout requires every explicit prerequisite and approved hosted origin', () => {
  const ready = approvedConfig();
  assert.equal(hostedCheckoutUrl(ready), ready.hostedCheckoutUrl);
  for (const key of Object.keys(config.approvals)) {
    assert.throws(() => hostedCheckoutUrl({...ready, approvals: {...ready.approvals, [key]: {status: 'unresolved', evidence: null}}}), /blocked/);
    assert.throws(() => hostedCheckoutUrl({...ready, approvals: {...ready.approvals, [key]: {status: 'approved', evidence: ''}}}), /blocked/);
  }
  for (const url of ['http://test-store.lemonsqueezy.com/checkout/buy/1', 'https://evil.example/checkout/buy/1', 'https://lemonsqueezy.com.evil.example/checkout/buy/1', 'https://user:secret@test-store.lemonsqueezy.com/checkout/buy/1', 'https://test-store.lemonsqueezy.com/checkout/buy/1?token=secret', 'https://test-store.lemonsqueezy.com/settings']) {
    assert.throws(() => hostedCheckoutUrl({...ready, hostedCheckoutUrl: url}), /blocked/);
  }
});

test('source orders are isolated from SaaS payments and enforce merchant and mode identity', () => {
  const entitlements = recordSourceOrder([], order, release, config);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].kind, 'source-license');
  assert.equal(entitlements[0].updateSupportEndsAt, '2027-10-07T00:00:00.000Z');
  assert.deepEqual(Object.keys(entitlements[0]).sort(), ['buyerId', 'githubIdentity', 'kind', 'orders', 'releases', 'updateSupportEndsAt'].sort());
  for (const overrides of [{provider: 'stripe'}, {mode: 'live'}, {merchantId: 'saas-account'}, {status: 'pending'}, {buyerId: ''}, {purchasedAt: 'bad-date'}]) {
    assert.throws(() => recordSourceOrder([], {...order, ...overrides}, release, config));
  }
  assert.throws(() => recordSourceOrder([], order, {...release, artifactSha256: 'invalid'}, config));
  assert.throws(() => recordSourceOrder(entitlements, {...order, id: 'new-order', merchantId: 'other-merchant'}, release, {...config, merchantId: 'other-merchant'}), /isolated/);
});

test('duplicate delivery is idempotent and order identity conflicts fail closed', () => {
  const original = recordSourceOrder([], order, release, config);
  assert.deepEqual(recordSourceOrder(original, order, release, config), original);
  for (const overrides of [{buyerId: 'someone-else'}, {githubIdentity: 'different'}, {purchasedAt: '2026-10-08T00:00:00.000Z'}]) {
    assert.throws(() => recordSourceOrder(original, {...order, ...overrides}, release, config), /conflict/);
  }
  assert.throws(() => recordSourceOrder(original, order, {...release, artifactSha256: 'b'.repeat(64)}, config), /conflict/);
});

test('expiry preserves acquired source and renewal enables later versions without rewriting past records', () => {
  const original = recordSourceOrder([], order, release, config);
  const before = JSON.stringify(original);
  assert.equal(canReceiveRelease(original[0], '2027-10-06T23:59:59.999Z'), true);
  assert.equal(canReceiveRelease(original[0], '2027-10-07T00:00:00.000Z'), false);
  assert.equal(canAccessRelease(original[0], release), true);
  assert.equal(canAccessRelease(original[0], {...release, version: 'v2'}), false);
  const renewed = recordSourceOrder(original, {...order, id: 'renewal-2', purchasedAt: '2028-01-01T00:00:00.000Z'}, {...release, version: 'v2'}, config);
  assert.equal(renewed[0].updateSupportEndsAt, '2029-01-01T00:00:00.000Z');
  assert.equal(canReceiveRelease(renewed[0], '2028-06-01T00:00:00.000Z'), true);
  assert.equal(canReceiveRelease(renewed[0], '2027-12-01T00:00:00.000Z'), false);
  assert.equal(canAccessRelease(renewed[0], release), true);
  assert.equal(canAccessRelease(renewed[0], {...release, version: 'v2'}), true);
  assert.equal(JSON.stringify(original), before);
});

test('hosted order rejection and checkout preview fail closed while business prerequisites are missing', async (t) => {
  const blocked = {...config, mode: 'hosted'};
  assert.throws(() => recordSourceOrder([], {...order, mode: 'hosted'}, release, blocked), /blocked/);
  const server = createServer(salesHandler(blocked));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/checkout`)).status, 503);
  assert.equal((await fetch(`${origin}/demo/receipt`)).status, 404);
});

test('twelve calendar months clamp leap day and early renewals preserve the remaining period', () => {
  const leap = recordSourceOrder([], {...order, purchasedAt: '2024-02-29T12:00:00.000Z'}, release, config);
  assert.equal(leap[0].updateSupportEndsAt, '2025-02-28T12:00:00.000Z');
  const early = recordSourceOrder(leap, {...order, id: 'early-renewal', purchasedAt: '2024-12-01T00:00:00.000Z'}, release, config);
  assert.equal(early[0].updateSupportEndsAt, '2026-02-28T12:00:00.000Z');
});

test('local sales preview exposes a complete fixture journey and never redirects to a payment provider', async (t) => {
  const server = createServer(salesHandler(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const landing = await fetch(origin);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /local source-license demo/i);
  const checkout = await fetch(`${origin}/checkout`, {redirect: 'manual'});
  assert.equal(checkout.status, 200);
  assert.equal(checkout.headers.get('location'), null);
  assert.match(await checkout.text(), /No payment is collected/);
  const receipt = await fetch(`${origin}/demo/receipt`);
  assert.equal(receipt.status, 200);
  assert.match(await receipt.text(), /source-license/);
  assert.match(await (await fetch(`${origin}/legal`)).text(), /Draft.*not approved/s);
  assert.equal((await fetch(`${origin}/api/stripe`, {method: 'POST'})).status, 405);
  assert.equal((await fetch(`${origin}/missing`)).status, 404);
});

test('vendor Docs proxy serves only public Docs/static routes and never forwards cookies', async (t) => {
  let observedCookie;
  const docs = createServer((request, response) => {
    observedCookie = request.headers.cookie;
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(`Published ${request.url}`);
  });
  await new Promise((resolve) => docs.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => docs.close(resolve)));
  const server = createServer(salesHandler(config, `http://127.0.0.1:${docs.address().port}`));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const published = await fetch(`${origin}/docs/v1/index`, {headers: {Cookie: 'private=do-not-forward'}});
  assert.equal(published.status, 200);
  assert.equal(published.headers.get('content-type'), 'text/plain');
  assert.equal(await published.text(), 'Published /docs/v1/index');
  assert.equal(observedCookie, undefined);
  assert.equal((await fetch(`${origin}/_next/static/chunk.js`)).status, 200);
  assert.equal((await fetch(`${origin}/_next/image?url=https://external.example`)).status, 404);
  assert.equal((await fetch(`${origin}/api/admin`)).status, 404);
  assert.throws(() => salesHandler(config, 'https://external.example'), /loopback/);
});
