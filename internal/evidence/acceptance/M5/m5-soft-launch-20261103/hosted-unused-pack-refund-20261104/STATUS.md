# Hosted unused-pack full refund (SC-BIL-11 evidence) — 2026-11-04

- scenario: SC-BIL-11 evidence (hosted, Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false)
- closesHostedUnusedRefund: true (for this pack only: order ff58ff4a-deb0-4e2e-8e41-9071e52dd34c)
- m5: IN_PROGRESS (not a stage PASS; SC-BIL-11 stays BLOCKED for partial/used refund and dispute profiles)

## Result
- Staging /admin Request refund: preview reason full-unused, expectedVersion 2, amountMinor 900; execute requestId e4068037-5669-44fb-bdf0-c943322eb524, command key 13f1f6f3-8efb-45dc-bedd-0085a985643a, status confirmed.
- Stripe refund re_3UXxycRcvKApiJYW0Jz6dEB0: status succeeded, amount 900 USD; charge ch_3UXxycRcvKApiJYW0camvJ9j refunded=true, amount_refunded=900; PI pi_3UXxycRcvKApiJYW0UtHUSZ7 succeeded (900 received).
- Order paid 900 -> refunded 900; grant ac89b23f-5556-4bc9-b760-ef5f2ca43733 voided 250. Available credits 1250 -> 1000; monthly grant 580828d5… still 1000.
- Preserved pack (88e1b0a0 / da90a49b / 7f0a93a4) not touched; older refund re_3UX0fc… unchanged.

## Raw
- raw/stripe-refund.json, raw/stripe-charge.json, raw/stripe-payment-intent.json (sanitized MCP reads)
- raw/app-refund-command.json (app-side preview/execute + ledger readback)

## Screenshots
- screenshots/refund-preview.png — /admin Request refund preview (full-unused, 900)
- screenshots/refund-command-result.png — refund command result (confirmed)
- screenshots/billing-after-refund.png — billing page after refund (available 1000)
