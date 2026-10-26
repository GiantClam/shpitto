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
    fetcher: async (url, init = {}) => { requests.push({url: String(url), init}); return response(url.toString().includes('promoter_campaigns') ? [] : {data: []}); },
  });
  const readback = await authority.readAccount();
  assert.equal(readback.accountId, '537zxqmq');
  assert.equal(readback.programId, '45084');
  assert.equal(readback.complete, false);
  assert.equal(readback.automaticPayouts, true);
  assert.deepEqual(requests.map((request) => request.url), [
    'https://api.firstpromoter.com/api/v2/company/promoter_campaigns',
    'https://api.firstpromoter.com/api/v2/company/payouts/group_by_promoters',
  ]);
  assert.equal(new Headers(requests[0]!.init.headers).get('ACCOUNT-ID'), '537zxqmq');
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), 'Bearer test-api-key');
});

test('live adapter sends server-owned sale and refund identities', async () => {
  const calls: Array<{url: string; body: JsonObject}> = [];
  type JsonObject = Record<string, unknown>;
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: true,
    fetcher: async (url, init = {}) => { calls.push({url: String(url), body: JSON.parse(String(init.body)) as JsonObject}); return response({}); },
  });
  await authority.deliver({accountId: '537zxqmq', programId: '45084', eventKind: 'sale', eventReference: 'payment-1', payloadDigest: 'a'.repeat(64), payload: {uid: 'workspace:11111111-1111-4111-8111-111111111111', paymentReference: 'payment-1', amountMinor: '1200', currency: 'usd'}});
  await authority.deliver({accountId: '537zxqmq', programId: '45084', eventKind: 'refund', eventReference: 'refund-1', payloadDigest: 'b'.repeat(64), payload: {uid: 'workspace:11111111-1111-4111-8111-111111111111', paymentReference: 'payment-1', amountMinor: '300', currency: 'usd'}});
  assert.equal(calls[0]!.url, 'https://api.firstpromoter.com/api/v2/track/sale');
  assert.deepEqual(calls[0]!.body, {uid: 'workspace:11111111-1111-4111-8111-111111111111', event_id: 'payment-1', amount: 1200, currency: 'USD', skip_email_notification: true});
  assert.equal(calls[1]!.url, 'https://api.firstpromoter.com/api/v2/track/refund');
  assert.deepEqual(calls[1]!.body, {uid: 'workspace:11111111-1111-4111-8111-111111111111', event_id: 'refund-1', amount: '300', currency: 'USD', sale_event_id: 'payment-1', skip_email_notification: true});
});

test('live adapter rejects an incomplete commission batch instead of marking review successful', async () => {
  const authority = createFirstPromoterAuthority({
    accountId: '537zxqmq', apiKey: 'test-api-key', programId: '45084', campaignRevision: 'first-payment-v1', autoPayoutsDisabledConfirmed: true,
    fetcher: async (url) => url.toString().includes('/commissions?') ? response([{id: 77, event_id: 'payment-1', promoter_campaign: {campaign_id: 45084}}]) : response({id: 4, status: 'completed', selected_total: 1, processed_count: 0, failed_count: 1}),
  });
  await assert.rejects(() => authority.sendReviewAction!({actionReference: 'review-1', action: 'approve', accountId: '537zxqmq', programId: '45084', paymentReference: 'payment-1', payloadDigest: 'c'.repeat(64), batchReference: null}));
});
