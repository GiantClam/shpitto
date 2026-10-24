# Manual Required Work

Candidate: `bc83efe9945c91ba27958da4f7ec41782a80862f0f18e1228571049a9fd802fe`

Automated implementation, local database probes, browser journeys, OpenSpec validation, quality checks, Stripe contract/integration tests, and dependency audit are complete for the current candidate. The following items still require an authorized human or external account owner.

## Automated revalidation (2026-10-24)

- The exact candidate digest above was revalidated after an acceptance-workflow-only rebaseline; product implementation inputs remain unchanged.
- `pnpm verify` passed, including typecheck, lint, format, configuration, database-boundary, root-integrity and production-build checks.
- `pnpm verify:acceptance` passed.
- `pnpm verify:openspec` passed.
- `git diff --check` passed. No tracked application implementation files were changed by verification; acceptance-policy metadata was rebaselined separately.

## M3 Current Revalidation

- Independent reviewer: inspect `internal/evidence/acceptance/M3/working-tree-20261022-current-r5/record.json` and the current browser walkthrough under `internal/evidence/M3/continuation-20261022/current-browser-run-3/`.
- Integrator: record a separate decision after the independent review. Do not reuse the historical M3 decision for the new digest.

## M4 Real Provider Gate

- Re-run the four provider rows on the current candidate: Replicate T2V/I2V and fal T2V/I2V.
- Provide authorized callback, private-output, credit-settlement, selected self-hosted recovery/monitoring and provider-cost evidence.
- Whole-stage review and separate integrator decision are deferred to the final manual-acceptance queue.

## M5 Stripe Gate

- Supply the acceptance-only Stripe test configuration: test secret, webhook signing secret, portal configuration, HTTPS acceptance origin, and `STRIPE_TEST_CATALOG_JSON` for the approved catalog.
- Exercise the remaining hosted test-mode purchase, subscription lifecycle, webhook ordering/replay, cancellation/replacement, refund/dispute and reconciliation scenarios for `SC-BIL-01` through `SC-BIL-16`.
- Review the existing test-mode object/refund evidence financially in the final manual-acceptance queue. No live charge or refund is authorized by this record.

## M6 Affiliate Gate

- Provide an authorized FirstPromoter account, campaign and hosted settlement test path.
- Reconcile the real account/settlement evidence with the current candidate; independent review/integrator decisions are deferred to the final manual-acceptance queue.
- Provide production email credentials only when the production profile is intentionally opened.

## M7 and M8 Release Gates

- M7 requires M4/M5/M6 gate closure, current trusted-validator review, four actual customization workflows and release-matched Docs review.
- M8 requires approved merchant/license/pricing/support terms, managed and Docker deployment accounts, final candidate deployment/restore/operations evidence, and RC/BETA/STABLE reviews. Publication and commercial delivery remain human-owned decisions.

No local implementation code remains pending for these items. External-profile evidence and final manual acceptance remain open; historical evidence remains retained separately and is not promoted across candidate digests.
