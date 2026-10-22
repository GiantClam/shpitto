/** Format stored minor currency units without converting large integer amounts to floating point. */
export function formatMinorCurrency(amountMinor: bigint, currency: string): string {
  const code = currency.toUpperCase();
  const fractionDigits = new Intl.NumberFormat('en-US', {style: 'currency', currency: code}).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(fractionDigits);
  const magnitude = amountMinor < 0n ? -amountMinor : amountMinor;
  const major = magnitude / scale;
  const fraction = fractionDigits === 0 ? '' : `.${(magnitude % scale).toString().padStart(fractionDigits, '0')}`;
  const sign = amountMinor < 0n ? '-' : '';
  return `${code} ${sign}${new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(major)}${fraction}`;
}
