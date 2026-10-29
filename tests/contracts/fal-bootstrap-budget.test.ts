import assert from 'node:assert/strict';
import {test} from 'node:test';
import {authorizedFalEstimate} from '../../scripts/probe-fal-account-bootstrap.ts';

test('one-shot Fal bootstrap accepts only the authorized model/unit/currency and USD1 reference ceiling', () => {
  const price = {endpoint_id:'fal-ai/wan/v2.2-a14b/text-to-video',unit_price:0.08,currency:'USD',unit:'seconds'};
  assert.equal(authorizedFalEstimate(price),0.405);
  for (const invalid of [undefined,{...price,unit_price:2},{...price,currency:'EUR'},{...price,unit:'frames'},{...price,endpoint_id:'other'},{...price,unit_price:NaN}]) assert.throws(()=>authorizedFalEstimate(invalid));
});
