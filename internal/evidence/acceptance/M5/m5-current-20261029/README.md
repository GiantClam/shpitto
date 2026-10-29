# M5 current candidate development verification

Date: 2026-10-29T08:41:30.502Z
Candidate: `m5-current-20261029`
Source commit for the refund step-up test change: `e9f83994a886411ddc79de8b9bb572ba77728b52`

On 2026-10-29T05:39Z the fixture-only local billing probes were rerun on disposable PostgreSQL. Billing schema, Checkout, and reconciliation probes passed. Fake-provider Stripe Checkout, reconciliation, and inbox integration suites passed, as did the billing presentation unit. Logs: `internal/evidence/acceptance/local-rerun-20261029/`.

The 2026-10-29T05:39Z Stripe refunds integration log remains a retained failure: 21 pass, 1 fail. That run is not relabeled PASS. Defect `M5-LOCAL-REFUND-STEPUP-20261029` is `CLOSED`. The case now enables operator 2FA enforcement before deleting `operator_step_ups`, which is the OpenSpec boundary in REQ-SEC-04. A later fake-provider rerun at 2026-10-29T08:41:29Z is 22 pass, 0 fail. Log: `internal/evidence/acceptance/M5/m5-current-20261029/stripe-refunds-stepup-closure.log`. That rerun is not a stage PASS. No live Stripe call was made.

An aipc disposable Docker PostgreSQL 16 fixture rerun on `127.0.0.1:55432` is archived at `internal/evidence/acceptance/aipc-local-55432-20261029/`. billing-schema, billing-reconciliation, credit-ledger, credit-reservation, credit-refund, billing-checkout, and credit-migration-backfill exited 0. The billing-checkout case count of 10 is a supplied run fact; the retained summary snippet does not include that count. That archive left defect `M5-LOCAL-REFUND-STEPUP-20261029` open; the defect is closed on this record and the archive is not a suite PASS.

The hosted Stripe test-mode acceptance-pack path is `PASS_paid_and_reconciled` and does not close M5. Evidence: `internal/evidence/acceptance/stripe-test-pack-20261029/`. Embedded Checkout Session `cs_test_a14dakOqKBk0AhWBmOKGGupRbOhIRzuhpmbNL6synH6RexEdy6e3Vm5qyl` paid 900 cents in test mode (`livemode=false`) for workspace `88e1b0a0-a097-4a8c-b274-f5b8f0ab80d1`. Attempt `3efbaf91-10ec-4494-adee-58992793aee9` is paid via webhook `evt_1UVoXkRcvKApiJYWXUC6D3bt`. Order `da90a49b-c55a-4dcb-8fa1-a983769ff9a0` has `paid_minor=900`. Grant `7f0a93a4-78f6-4c4a-9468-5a0c4a84ec81` issued and still has 250 credits. The billing account is active with no hold. `BILLING_DRIVER` stayed `stripe_test`. Bootstrap enablement and reseed were off after the payment.

Hosted Checkout Session URLs on this Stripe account open an incomplete link and are not PASS. The billing-return screenshot is a signed-out page (`Sign in to view billing`) and does not prove the authenticated billing UI. In-process owner refund-command replay is `PASS_IN_PROCESS_ONLY` in `internal/evidence/acceptance/stripe-test-pack-20261029/owner-command-replay.md`: the integration case returns `replayed: true` and adds no provider call on replay. That note does not refund the unused acceptance pack and does not close hosted owner-command replay. The $25 subscription, hosted refunds, live charges, and FirstPromoter were not run.

The record remains `IN_PROGRESS`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged. M7 and M8 are not claimed.
