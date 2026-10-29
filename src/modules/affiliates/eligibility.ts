import type {AffiliateEligibility, AffiliatePayment} from './contracts.ts';

export const AFFILIATE_ELIGIBILITY_DELAY_MS = 5 * 60 * 1000;

export function canonicalPayments(payments: readonly AffiliatePayment[]): AffiliatePayment[] {
  return [...payments].sort((left, right) => left.paidAt.getTime() - right.paidAt.getTime() || left.paymentReference.localeCompare(right.paymentReference));
}

export function resolveFirstPayment(payments: readonly AffiliatePayment[], now = new Date(), exportedReference: string | null = null): AffiliateEligibility {
  const ordered = canonicalPayments(payments);
  if (ordered.some((payment) => !payment.historyComplete)) return {firstPaymentReference: exportedReference, status: 'held', reason: 'history_incomplete'};
  const first = ordered[0];
  if (!first) return {firstPaymentReference: null, status: 'unattributed', reason: 'no_payment'};
  if (now.getTime() - first.paidAt.getTime() < AFFILIATE_ELIGIBILITY_DELAY_MS) return {firstPaymentReference: exportedReference, status: 'held', reason: 'history_incomplete'};
  if (exportedReference && exportedReference !== first.paymentReference) return {firstPaymentReference: exportedReference, status: 'held', reason: 'older_payment_conflict'};
  return {firstPaymentReference: first.paymentReference, status: exportedReference ? 'unattributed' : 'eligible', reason: exportedReference ? 'already_exported' : 'first_payment'};
}
