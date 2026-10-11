import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createFakeBillingRefundProvider} from '../../src/adapters/billing/refunds.ts';

test('fixture lookup requires an observed result and never creates cash evidence', async () => {
  const provider = createFakeBillingRefundProvider();
  const input = {requestId: 'refund-1', orderId: 'order-1', amountMinor: 50n, currency: 'usd', idempotencyKey: 'refund:refund-1'};
  assert.deepEqual(await provider.lookupRefund!(input), {unknown: true});
  const result = await provider.createRefund(input);
  assert.deepEqual(await provider.lookupRefund!(input), result);
  assert.deepEqual(await createFakeBillingRefundProvider().lookupRefund!(input), {unknown: true}, 'A fresh fixture adapter must not invent evidence from a deterministic ID.');
});
