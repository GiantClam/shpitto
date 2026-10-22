# Manual Required Work

Candidate: `3953059a33371e6a8c87e32833319c20b448781aec528908688d5f2649a3ded8`

Automated implementation, local database probes, browser journeys, OpenSpec validation, quality checks, Stripe contract/integration tests, and dependency audit are complete for the current candidate. The following items still require an authorized human or external account owner.

## M3 Current Revalidation

- Independent reviewer: inspect `internal/evidence/acceptance/M3/working-tree-20261022-current-r5/record.json` and the current browser walkthrough under `internal/evidence/M3/continuation-20261022/current-browser-run-3/`.
- Integrator: record a separate decision after the independent review. Do not reuse the historical M3 decision for the new digest.

## M4 Real Provider Gate

- Re-run the four provider rows on the current candidate: Replicate T2V/I2V and fal T2V/I2V.
- Provide authorized callback, private-output, credit-settlement, selected self-hosted recovery/monitoring and provider-cost evidence.
- Obtain an independent whole-stage review and separate integrator decision.

## M5 Stripe Gate

- Supply the acceptance-only Stripe test configuration: test secret, webhook signing secret, portal configuration, HTTPS acceptance origin, and `STRIPE_TEST_CATALOG_JSON` for the approved catalog.
- Exercise the remaining hosted test-mode purchase, subscription lifecycle, webhook ordering/replay, cancellation/replacement, refund/dispute and reconciliation scenarios for `SC-BIL-01` through `SC-BIL-16`.
- Review the existing test-mode object/refund evidence financially and record independent reviewer and integrator decisions. No live charge or refund is authorized by this record.

## M6 Affiliate Gate

- Provide an authorized FirstPromoter account, campaign and hosted settlement test path.
- Reconcile the real account/settlement evidence with the current candidate and obtain independent review/integrator decisions.
- Provide production email credentials only when the production profile is intentionally opened.

## M7 and M8 Release Gates

- M7 requires M4/M5/M6 gate closure, current trusted-validator review, four actual customization workflows and release-matched Docs review.
- M8 requires approved merchant/license/pricing/support terms, managed and Docker deployment accounts, final candidate deployment/restore/operations evidence, and RC/BETA/STABLE reviews. Publication and commercial delivery remain human-owned decisions.

No local code or automated verification remains pending for these items. Historical evidence remains retained separately and is not promoted across candidate digests.
