import {deepEqual, equal, throws} from 'node:assert/strict';
import {test} from 'node:test';

import {firstPromoterTrackingRequest, readFirstPromoterBatch} from '../../src/adapters/affiliates/firstpromoter-contract.ts';

const workspaceId = '7d5a20f5-9b30-45f0-a30c-865565f341ed';

test('FirstPromoter V2 wire identities retain workspace UID and independent refund identity', () => {
  const base = {workspaceId, amountMinor: 123n, currency: 'usd'};
  deepEqual(firstPromoterTrackingRequest({...base, kind: 'sale', eventReference: 'pi_canonical'}), {path: '/track/sale', body: {uid: `workspace:${workspaceId}`, event_id: 'pi_canonical', amount: 123, currency: 'USD', skip_email_notification: true}});
  deepEqual(firstPromoterTrackingRequest({...base, kind: 'refund', eventReference: 're_one', paymentReference: 'pi_canonical'}), {path: '/track/refund', body: {uid: `workspace:${workspaceId}`, event_id: 're_one', sale_event_id: 'pi_canonical', amount: '123', currency: 'USD', skip_email_notification: true}});
  deepEqual(firstPromoterTrackingRequest({kind: 'signup', workspaceId, verifiedTouchReference: 'trusted_ref'}), {path: '/track/signup', body: {uid: `workspace:${workspaceId}`, ref_id: 'trusted_ref', skip_email_notification: true}});
});

test('money mapping preserves reviewed zero/two-decimal bases and rejects unsafe or unreviewed amounts', () => {
  const input = {kind: 'sale' as const, workspaceId, eventReference: 'pi_one', amountMinor: 750n, currency: 'jpy'};
  equal(firstPromoterTrackingRequest(input).body.amount, 750);
  for (const patch of [{amountMinor: 0n}, {amountMinor: -1n}, {amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n}, {currency: 'kwd'}, {currency: 'USD'}, {eventReference: ' pi_one'}, {workspaceId: 'not-a-workspace'}]) throws(() => firstPromoterTrackingRequest({...input, ...patch}));
});

test('batch acceptance and partial/failed completion cannot become successful commission review', () => {
  const complete = {id: 1, status: 'completed', selected_total: 2, processed_count: 2, failed_count: 0};
  equal(readFirstPromoterBatch(complete, 2).complete, true);
  for (const status of ['pending', 'in_progress', 'failed', 'stopped']) equal(readFirstPromoterBatch({...complete, status}, 2).complete, false);
  equal(readFirstPromoterBatch({...complete, processed_count: 1}, 2).complete, false);
  equal(readFirstPromoterBatch({...complete, failed_count: 1}, 2).complete, false);
  for (const invalid of [null, {}, {...complete, status: 'paid'}, {...complete, failed_count: -1}, {...complete, selected_total: 3}, {...complete, id: '1'}]) throws(() => readFirstPromoterBatch(invalid, 2));
});
