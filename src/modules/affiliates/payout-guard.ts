import type {CommissionReview, CommissionReviewEvidence} from './commission-review.ts';
import {reviewFresh} from './commission-review.ts';

/** The approved origin is server-owned configuration, never a request parameter. */
function reviewedDashboard(value: string | null, approvedOrigin: string | null): boolean {
  if (!value || !approvedOrigin) return false;
  try {
    const url = new URL(value);
    const approved = new URL(approvedOrigin);
    return approved.protocol === 'https:' && approved.pathname === '/' && !approved.search && !approved.hash
      && !approved.username && !approved.password && url.origin === approved.origin
      && url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function canHandoffPayout(input: Readonly<{review: CommissionReview; evidence: CommissionReviewEvidence; providerDashboardUrl: string | null; approvedDashboardOrigin: string | null; now?: Date}>): boolean {
  return input.review.status === 'approved'
    && reviewedDashboard(input.providerDashboardUrl, input.approvedDashboardOrigin)
    && reviewFresh(input.review, input.evidence, input.now ?? new Date());
}
