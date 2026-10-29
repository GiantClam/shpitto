# aipc local fixture re-run 2026-10-29 (Asia/Shanghai)

Source machine: aipc Windows, disposable Docker Postgres 16 on 127.0.0.1:55432
DATABASE_URL=postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres
No live Stripe charges/refunds/payouts. No real FirstPromoter.

## M5 PASS (exit 0)
- probe-billing-schema
- probe-billing-reconciliation
- probe-credit-ledger
- probe-credit-reservation
- probe-credit-refund
- probe-billing-checkout (10 cases)
- probe-credit-migration-backfill

Also previously: probe-provider-recovery (M4 local) PASS

## M6 PASS (exit 0)
- probe-m6-recovery
- probe-m6-affiliate (local-pure-contracts-only; databaseVerified=false; providerVerified=false)
- probe-m6-affiliate-db
- probe-m6-refund-preview
- probe-m6-admin-reads
- probe-m6-affiliate-notifications
- probe-m6-affiliate-races
- probe-m6-affiliate-referral (realAccountVerified=false)
- probe-m6-cash-affiliate
- probe-m6-operations
- probe-m6-privileged
- probe-m6-workspace-details
- probe-m6-two-factor

## M4 hosted (already recorded by prior run)
- Four-path paid creates: RECORDED
- Recovery drill PASS_SELECTED_SELF_HOSTED_RECOVERY_DRILL runId 9b0d0a5d-2bf7-4958-832e-40fef041dfb0
- Monitor ready deliveryPending=false

## Do NOT mark stages PASS
Keep M4/M5/M6 IN_PROGRESS. M7/M8 NOT_STARTED.
Preserve open defect M5-LOCAL-REFUND-STEPUP-20261029 if still present.
Never invent PASS for live Stripe / real FP / standard M4-C01–C04 / independent review.

## Update
Archive these summaries under internal/evidence/acceptance/aipc-local-55432-20261029/
Update m4-current / acceptance-status / queue / tasks.md accordingly.
Push to PR #4 branch.
