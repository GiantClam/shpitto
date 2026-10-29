import {timingSafeEqual} from 'node:crypto';

import {DomainError} from '../../db/contracts.ts';

export function assertAcceptanceBootstrapAuthorized(input: Readonly<{
  runtimeProfile: string;
  enabled: string;
  configuredSecret: string;
  authorizationHeader: string;
}>): void {
  if (input.runtimeProfile !== 'acceptance' || input.enabled !== 'once' || input.configuredSecret.length < 32) {
    throw new DomainError('FORBIDDEN', 'Acceptance bootstrap is disabled.');
  }
  const expected = Buffer.from(input.configuredSecret, 'utf8');
  const actual = Buffer.from(input.authorizationHeader.startsWith('Bearer ') ? input.authorizationHeader.slice(7) : '', 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new DomainError('FORBIDDEN', 'Acceptance bootstrap authorization is invalid.');
  }
}
