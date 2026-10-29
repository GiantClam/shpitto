# M5 current candidate development verification

Date: 2026-10-29T05:40:58.702Z
Candidate: `m5-current-20261029`
Source commit: `f59f1f094dab084374331de9ad2b7a6fb7ed081e`

On 2026-10-29T05:39Z the fixture-only local billing probes were rerun on disposable PostgreSQL. Billing schema, Checkout, and reconciliation probes passed. Fake-provider Stripe Checkout, reconciliation, and inbox integration suites passed, as did the billing presentation unit. Logs: `internal/evidence/acceptance/local-rerun-20261029/`.

The Stripe refunds integration suite failed again: 21 pass, 1 fail. `tests/integration/stripe-refunds.test.ts` still does not reject the operator refund after `operator_step_ups` is deleted while optional two-factor policy is off. Defect `M5-LOCAL-REFUND-STEPUP-20261029` stays `OPEN`. The suite is not a PASS command. No live Stripe call was made.

An aipc disposable Docker PostgreSQL 16 fixture rerun on `127.0.0.1:55432` is archived at `internal/evidence/acceptance/aipc-local-55432-20261029/`. billing-schema, billing-reconciliation, credit-ledger, credit-reservation, credit-refund, billing-checkout, and credit-migration-backfill exited 0. The billing-checkout case count of 10 is a supplied run fact; the retained summary snippet does not include that count. Defect `M5-LOCAL-REFUND-STEPUP-20261029` stays `OPEN`.

Hosted Stripe test-mode readback, owner-command replay, authenticated billing UI, and live charges were not re-run. The record remains `IN_PROGRESS`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged.
