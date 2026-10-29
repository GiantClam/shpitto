export type RefundDecision = Readonly<{allowed: boolean; reason: 'sale_not_acknowledged' | 'exceeds_cash_basis' | 'duplicate' | 'ready'}>;

export function incrementalRefundDecision(input: Readonly<{saleAcknowledged: boolean; originalCashMinor: bigint; alreadyExportedMinor: bigint; requestedMinor: bigint}>): RefundDecision {
  if (!input.saleAcknowledged) return {allowed: false, reason: 'sale_not_acknowledged'};
  if (input.requestedMinor < 0n || input.originalCashMinor < 0n || input.alreadyExportedMinor < 0n || input.alreadyExportedMinor + input.requestedMinor > input.originalCashMinor) return {allowed: false, reason: 'exceeds_cash_basis'};
  if (input.requestedMinor === 0n) return {allowed: false, reason: 'duplicate'};
  return {allowed: true, reason: 'ready'};
}
