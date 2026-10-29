import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createFirstPromoterAuthority} from '../../src/adapters/affiliates/firstpromoter-live.ts';

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
}

test('live adapter reads the account and stays fail-closed until payout safety is confirmed', async () => {
  const requests: Array<{url: string; init: RequestInit}> = [];
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1',
    fetcher: async (url, init = {}) => { requests.push({url: String(url), init}); return response(url.toString().includes('/campaigns/45084') ? {id: 45084, rewards_for_promoters: [{reward: {name: '20% commission for first charge'}}]} : {data: []}); },
  });
  const readback = await authority.readAccount();
  assert.equal(readback.accountId, '537zxqmq');
  assert.equal(readback.programId, '45084');
  assert.equal(readback.complete, false);
  assert.equal(readback.automaticPayouts, true);
  assert.equal(readback.firstPaymentOnly, true);
  assert.equal(readback.complete, false, 'Unconfirmed auto-payout and native Stripe tracking must keep live writes disabled.');
  assert.deepEqual(requests.map((request) => request.url), [
    'https://api.firstpromoter.com/api/v2/company/campaigns/45084',
    'https://api.firstpromoter.com/api/v2/company/payouts/group_by_promoters',
  ]);
  assert.equal(new Headers(requests[0]!.init.headers).get('ACCOUNT-ID'), '537zxqmq');
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), 'Bearer test-api-key');
});

test('first-charge campaign remains blocked while native Stripe tracking is enabled', async () => {
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: true, nativeStripeTrackingDisabledConfirmed: false,
    fetcher: async (url) => response(url.toString().includes('/campaigns/45084') ? {id: 45084, rewards_for_promoters: [{reward: {name: '20% commission for first charge'}}]} : {data: []}),
  });
  const readback = await authority.readAccount();
  assert.equal(readback.firstPaymentOnly, true);
  assert.equal(readback.automaticPayouts, false);
  assert.equal(readback.complete, false);
});

test('live adapter verifies the exact promoter referral token and campaign', async () => {
  const requests: string[] = [];
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1',
    fetcher: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/company/promoters?')) return response({data: [{id: 15752036, promoter_campaigns: [{state: 'accepted', campaign_id: 45084, ref_token: 'shpitto-203f34'}]}]});
      return response([{id: 1, url: 'https://shpitto.com/?fpr=shpitto-203f34', campaign: {id: 45084}}]);
    },
  });
  const verified = await authority.verifyReference({affiliateId: '15752036', touchReference: 'shpitto-203f34', programId: '45084', capturedAt: new Date(), expiresAt: new Date(Date.now() + 60_000)});
  assert.equal(verified, 'verified');
  assert.equal(requests[0], 'https://api.firstpromoter.com/api/v2/company/promoters?q=shpitto-203f34');
  assert.equal(requests[1], 'https://api.firstpromoter.com/api/v2/company/promoters/15752036/referral_links');
});

test('live adapter resolves an FPR token to the unique promoter and campaign', async () => {
  const requests: string[] = [];
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1',
    fetcher: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/company/promoters?')) return response({data: [{id: 15752036, promoter_campaigns: [{state: 'accepted', campaign_id: 45084, ref_token: 'shpitto-203f34'}]}]});
      return response([{id: 1, url: 'https://shpitto.com/?fpr=shpitto-203f34', campaign: {id: 45084}}]);
    },
  });
  const resolved = await authority.resolveReferral!({touchReference: 'shpitto-203f34', programId: '45084', capturedAt: new Date('2026-10-26T00:00:00Z'), expiresAt: new Date('2026-11-25T00:00:00Z')});
  assert.deepEqual(resolved, {affiliateId: '15752036', touchReference: 'shpitto-203f34', programId: '45084', capturedAt: new Date('2026-10-26T00:00:00Z'), expiresAt: new Date('2026-11-25T00:00:00Z')});
  assert.equal(requests[0], 'https://api.firstpromoter.com/api/v2/company/promoters?q=shpitto-203f34');
  assert.equal(requests[1], 'https://api.firstpromoter.com/api/v2/company/promoters/15752036/referral_links');
});

test('live FirstPromoter data never claims to be complete canonical billing history', async () => {
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1',
    fetcher: async () => response([{id: 77, event_id: 'stripe-payment-1', sale_amount: 1200, original_sale_currency: 'USD', created_at: '2026-10-26T00:00:00.000Z'}]),
  });
  const history = await authority.readHistory({workspaceId: '11111111-1111-4111-8111-111111111111', customers: [{provider: 'stripe', customerId: 'cus_test'}]});
  assert.equal(history.complete, false);
  assert.deepEqual(history.customers, [{provider: 'stripe', customerId: 'cus_test'}]);
  assert.deepEqual(history.payments, []);
});

test('live adapter sends server-owned sale and refund identities', async () => {
  const calls: Array<{url: string; body: JsonObject}> = [];
  type JsonObject = Record<string, unknown>;
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: true, nativeStripeTrackingDisabledConfirmed: true,
    fetcher: async (url, init = {}) => {
      calls.push({url: String(url), body: init.body === undefined ? {} : JSON.parse(String(init.body)) as JsonObject});
      return response(url.toString().includes('/campaigns/45084') ? {id: 45084, rewards_for_promoters: [{reward: {name: '20% commission for first charge'}}]} : {data: []});
    },
  });
  await authority.deliver({accountId: '537zxqmq', programId: '45084', eventKind: 'sale', eventReference: 'payment-1', payloadDigest: 'a'.repeat(64), payload: {uid: 'workspace:11111111-1111-4111-8111-111111111111', paymentReference: 'payment-1', amountMinor: '1200', currency: 'usd'}});
  await authority.deliver({accountId: '537zxqmq', programId: '45084', eventKind: 'refund', eventReference: 'refund-1', payloadDigest: 'b'.repeat(64), payload: {uid: 'workspace:11111111-1111-4111-8111-111111111111', paymentReference: 'payment-1', amountMinor: '300', currency: 'usd'}});
  assert.equal(calls.filter((call) => call.url.endsWith('/track/sale')).length, 1);
  assert.deepEqual(calls.find((call) => call.url.endsWith('/track/sale'))!.body, {uid: 'workspace:11111111-1111-4111-8111-111111111111', event_id: 'payment-1', amount: 1200, currency: 'USD', skip_email_notification: true});
  assert.equal(calls.filter((call) => call.url.endsWith('/track/refund')).length, 1);
  assert.deepEqual(calls.find((call) => call.url.endsWith('/track/refund'))!.body, {uid: 'workspace:11111111-1111-4111-8111-111111111111', event_id: 'refund-1', amount: '300', currency: 'USD', sale_event_id: 'payment-1', skip_email_notification: true});
});

test('live adapter blocks all affiliate writes unless campaign and payout guards pass', async () => {
  const calls: string[] = [];
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: false,
    fetcher: async (url) => { calls.push(String(url)); return response(url.toString().includes('/campaigns/45084') ? {id: 45084, rewards_for_promoters: [{reward: {name: '20% recurring commission'}}]} : {data: []}); },
  });
  await assert.rejects(() => authority.deliver({accountId: '537zxqmq', programId: '45084', eventKind: 'sale', eventReference: 'stripe-payment-1', payloadDigest: 'd'.repeat(64), payload: {uid: 'workspace:11111111-1111-4111-8111-111111111111', amountMinor: '1200', currency: 'usd'}}));
  assert.equal(calls.some((url) => url.includes('/track/')), false);
});

test('live adapter rejects an incomplete commission batch instead of marking review successful', async () => {
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: true, nativeStripeTrackingDisabledConfirmed: true,
    fetcher: async (url) => url.toString().includes('/campaigns/45084') ? response({id: 45084, rewards_for_promoters: [{reward: {name: '20% commission for first charge'}}]}) : url.toString().includes('/commissions?') ? response([{id: 77, event_id: 'payment-1', promoter_campaign: {campaign_id: 45084}}]) : response({id: 4, status: 'completed', selected_total: 1, processed_count: 0, failed_count: 1}),
  });
  await assert.rejects(() => authority.sendReviewAction!({actionReference: 'review-1', action: 'approve', accountId: '537zxqmq', programId: '45084', paymentReference: 'payment-1', payloadDigest: 'c'.repeat(64), batchReference: null}));
});
