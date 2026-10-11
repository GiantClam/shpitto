export type GuardStatus = 'not-configured' | 'allowed' | 'denied';

export type GuardResult = Readonly<{
  status: GuardStatus;
  reason: string;
}>;

/** Integration point for Better Auth and domain authorization added in M2/M6. */
export function requireAuthenticatedSession(): GuardResult {
  return {status: 'not-configured', reason: 'Authentication is implemented in the identity milestone.'};
}

/** Integration point for the separate global operator policy. */
export function requireOperatorSession(): GuardResult {
  return {status: 'not-configured', reason: 'Operator authorization is implemented in the operations milestone.'};
}
