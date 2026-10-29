# M5 current candidate development verification

Date: 2026-10-29T05:40:58.702Z
Candidate: `m5-current-20261029`
Source commit: `f59f1f094dab084374331de9ad2b7a6fb7ed081e`

On 2026-10-29T05:39Z the fixture-only local billing probes were rerun on disposable PostgreSQL. Billing schema, Checkout, and reconciliation probes passed. Fake-provider Stripe Checkout, reconciliation, and inbox integration suites passed, as did the billing presentation unit. Logs: `internal/evidence/acceptance/local-rerun-20261029/`.

The Stripe refunds integration suite failed again: 21 pass, 1 fail. `tests/integration/stripe-refunds.test.ts` still does not reject the operator refund after `operator_step_ups` is deleted while optional two-factor policy is off. Defect `M5-LOCAL-REFUND-STEPUP-20261029` stays `OPEN`. The suite is not a PASS command. No live Stripe call was made.

An aipc disposable Docker PostgreSQL 16 fixture rerun on `127.0.0.1:55432` is archived at `internal/evidence/acceptance/aipc-local-55432-20261029/`. billing-schema, billing-reconciliation, credit-ledger, credit-reservation, credit-refund, billing-checkout, and credit-migration-backfill exited 0. The billing-checkout case count of 10 is a supplied run fact; the retained summary snippet does not include that count. Defect `M5-LOCAL-REFUND-STEPUP-20261029` stays `OPEN`.

The hosted Stripe test-mode acceptance-pack path is `PASS_paid_and_reconciled` and does not close M5. Evidence: `internal/evidence/acceptance/stripe-test-pack-20261029/`. Embedded Checkout Session `cs_test_a14dakOqKBk0AhWBmOKGGupRbOhIRzuhpmbNL6synH6RexEdy6e3Vm5qyl` paid 900 cents in test mode (`livemode=false`) for workspace `88e1b0a0-a097-4a8c-b274-f5b8f0ab80d1`. Attempt `3efbaf91-10ec-4494-adee-58992793aee9` is paid via webhook `evt_1UVoXkRcvKApiJYWXUC6D3bt`. Order `da90a49b-c55a-4dcb-8fa1-a983769ff9a0` has `paid_minor=900`. Grant `7f0a93a4-78f6-4c4a-9468-5a0c4a84ec81` issued and still has 250 credits. The billing account is active with no hold. `BILLING_DRIVER` stayed `stripe_test`. Bootstrap enablement and reseed were off after the payment.

Hosted Checkout Session URLs on this Stripe account open an incomplete link and are not PASS. The earlier billing-return screenshot is a signed-out page (`Sign in to view billing`). A later signed-in owner capture is recorded at `internal/evidence/acceptance/stripe-test-pack-20261029/BILLING_UI_OWNER_SIGNED_IN.md`. Sign-in uses `/login`; `/sign-in` returns 404. That page shows the account active, one paid credit pack at USD 9.00, 250 credits available, zero subscriptions, and Recovery Clear. A member signed in via `/login` sees `Billing unavailable` and `This billing view is restricted to the current workspace owner.` with no cash or credit controls. Evidence: `internal/evidence/acceptance/stripe-test-pack-20261029/BILLING_UI_MEMBER_DENIED.md`. That denial does not close mobile layout, refund-command replay, or M5. The $25 subscription, refunds, live charges, and FirstPromoter were not run.

The record remains `IN_PROGRESS`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged. M7 and M8 are not claimed.
