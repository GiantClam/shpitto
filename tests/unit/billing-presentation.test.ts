import assert from 'node:assert/strict';
import {test} from 'node:test';

import {formatMinorCurrency} from '../../src/modules/billing/presentation.ts';

test('formats currency minor units using the currency decimal exponent without losing precision', () => {
  assert.equal(formatMinorCurrency(2500n, 'usd'), 'USD 25.00');
  assert.equal(formatMinorCurrency(2500n, 'jpy'), 'JPY 2,500');
  assert.equal(formatMinorCurrency(2500n, 'kwd'), 'KWD 2.500');
  assert.equal(formatMinorCurrency(900719925474099312345n, 'usd'), 'USD 9,007,199,254,740,993,123.45');
});
