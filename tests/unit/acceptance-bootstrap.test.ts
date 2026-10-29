import assert from 'node:assert/strict';
import {test} from 'node:test';

import {assertAcceptanceBootstrapAuthorized} from '../../src/modules/acceptance/bootstrap.ts';

const secret = 'a'.repeat(48);

test('acceptance bootstrap requires the explicit one-time acceptance profile and bearer secret', () => {
  assert.doesNotThrow(() => assertAcceptanceBootstrapAuthorized({runtimeProfile: 'acceptance', enabled: 'once', configuredSecret: secret, authorizationHeader: `Bearer ${secret}`}));
  for (const input of [
    {runtimeProfile: 'production', enabled: 'once', configuredSecret: secret, authorizationHeader: `Bearer ${secret}`},
    {runtimeProfile: 'acceptance', enabled: 'off', configuredSecret: secret, authorizationHeader: `Bearer ${secret}`},
    {runtimeProfile: 'acceptance', enabled: 'once', configuredSecret: secret, authorizationHeader: 'Bearer wrong'},
    {runtimeProfile: 'acceptance', enabled: 'once', configuredSecret: 'short', authorizationHeader: 'Bearer short'},
  ]) assert.throws(() => assertAcceptanceBootstrapAuthorized(input), /Acceptance bootstrap/);
});
