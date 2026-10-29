# aipc local fixture rerun (2026-10-29)

Source: aipc, disposable Docker PostgreSQL 16 on `127.0.0.1:55432`. Fixture-only. No live Stripe charge, refund, or payout, and no real FirstPromoter write.

Archived files are UTF-8 without a byte-order mark. `local-acceptance-results-20261029.json`, `m5-summary-55432.json`, `m6-summary-55432.json`, and `probe-m6-two-factor-55432.out.txt` arrived with a BOM; only that prefix was removed.

Probe exits recorded here are fixture results. They do not change stage status. M4, M5, and M6 stay `IN_PROGRESS`. M7 and M8 stay `NOT_STARTED`. Standard criteria `M4-C01` through `M4-C04` stay `BLOCKED`. This archive left defect `M5-LOCAL-REFUND-STEPUP-20261029` open. The defect is `CLOSED` on `internal/evidence/acceptance/M5/m5-current-20261029/record.json` and that closure does not make this archive a suite PASS.

The source summary says the hosted four-path create is "already RECORDED PASS (prior)". The development record keeps that create as `RECORDED` and does not treat the source phrase as stage approval. The hosted recovery drill remains `PASS_SELECTED_SELF_HOSTED_RECOVERY_DRILL` and does not close M4.

`probe-m6-two-factor` stdout is `PASS` with `externalAccountsUsed=false`. The `m6` array in `local-acceptance-results-20261029.json` does not list that probe. `probe-billing-checkout` is attested as 10 cases by the supplied run fact; the retained summary snippet does not include the case count.

`probe-m6-affiliate` is `local-pure-contracts-only` with `databaseVerified=false` and `providerVerified=false`. `probe-m6-affiliate-referral` has `realAccountVerified=false`.
