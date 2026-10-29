export type AbuseDecision = Readonly<{status: 'clear' | 'held' | 'unknown'; reasons: readonly string[]}>;

export function evaluateAbuse(input: Readonly<{ownerMatchesAffiliate: boolean | null; workspacesAttributedLast24h: number; sameInstrumentFingerprintCount: number | null}>): AbuseDecision {
  const reasons: string[] = [];
  if (input.ownerMatchesAffiliate === true) reasons.push('self-referral');
  if (input.workspacesAttributedLast24h > 3) reasons.push('more-than-three-workspaces-in-24h');
  if ((input.sameInstrumentFingerprintCount ?? 0) > 1) reasons.push('repeated-payment-instrument');
  if (reasons.length > 0) return {status: 'held', reasons};
  if (input.ownerMatchesAffiliate === null || input.sameInstrumentFingerprintCount === null) return {status: 'unknown', reasons: ['required-signal-unavailable']};
  return {status: 'clear', reasons};
}
