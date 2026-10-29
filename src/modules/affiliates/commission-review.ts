export type CommissionReviewStatus = 'eligible' | 'held' | 'approve_pending' | 'deny_pending' | 'denied' | 'approved';

export type CommissionReview = Readonly<{
  status: CommissionReviewStatus;
  reason: string;
  policyVersion: number;
  reviewVersion: number;
  accountCheckpointVersion: number;
  refreshedAt: Date | null;
  accountCheckpointAt: Date | null;
}>;

/** Current server evidence must be re-read after an external refresh, before committing an action. */
export type CommissionReviewEvidence = Readonly<{
  policyVersion: number;
  reviewVersion: number;
  accountCheckpointVersion: number;
  accountCheckpointAt: Date | null;
  accountSyncStatus: 'succeeded' | 'pending' | 'failed';
  unresolvedHolds: number;
  pendingDenials: number;
}>;

function recent(value: Date | null, now: Date, maximumAge: number): boolean {
  if (!value || !Number.isFinite(now.getTime())) return false;
  const age = now.getTime() - value.getTime();
  return Number.isFinite(age) && age >= 0 && age <= maximumAge;
}

export function reviewFresh(review: CommissionReview, evidence: CommissionReviewEvidence, now = new Date()): boolean {
  const versions = [review.policyVersion, review.reviewVersion, review.accountCheckpointVersion];
  return (review.status === 'eligible' || review.status === 'approved')
    && versions.every((value) => Number.isSafeInteger(value) && value > 0)
    && review.policyVersion === evidence.policyVersion
    && review.reviewVersion === evidence.reviewVersion
    && review.accountCheckpointVersion === evidence.accountCheckpointVersion
    && evidence.accountSyncStatus === 'succeeded'
    && evidence.unresolvedHolds === 0 && evidence.pendingDenials === 0
    && recent(review.refreshedAt, now, 60_000)
    && recent(review.accountCheckpointAt, now, 5 * 60_000)
    && review.accountCheckpointAt?.getTime() === evidence.accountCheckpointAt?.getTime();
}

export function approveReview(review: CommissionReview, evidence: CommissionReviewEvidence, now = new Date()): CommissionReview {
  if (review.status !== 'eligible' || !reviewFresh(review, evidence, now)) throw new Error('Commission review is stale or incomplete.');
  return {...review, status: 'approved'};
}

export function denyReview(review: CommissionReview): CommissionReview {
  if (review.status !== 'eligible' && review.status !== 'held') throw new Error('Commission review cannot be denied from its current state.');
  return {...review, status: 'deny_pending'};
}
