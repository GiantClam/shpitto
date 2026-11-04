# $25 monthly subscription purchase readback (SC-BIL-07 purchase evidence) — 2026-11-04

- account: Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false; read-only MCP reads (subscription NOT modified)
- workspace: ab0d1ea5-f538-4b4b-8c59-698b5d7c5d39
- status: VERIFIED_purchase_readback (purchase only)
- SC-BIL-07 / M5-C01: still BLOCKED — lifecycle not done (cancel-at-period-end, payment-failure recovery, repurchase)
- m5: IN_PROGRESS (not a stage PASS)

## Stripe readback
- subscription sub_1UXXXpRcvKApiJYW5NlKrZys: status active, customer cus_VY6rr4nkmOawCO, price price_1USZScRcvKApiJYWy4uFqr6f 2500 USD / month, qty 1
- current period: 1793673232 -> 1796265232 (2026-11-03 10:33:52 -> 2026-12-03 10:33:52 Asia/Kuala_Lumpur, UTC+8)
- cancel_at_period_end=false, cancel_at=null, canceled_at=null
- metadata productKey acceptance-monthly, attemptId b96228ce-8672-43da-9c5e-0da966e80a37
- latest_invoice in_1UXXXoRcvKApiJYWcxmgVlPK (NV1PGSWL-0001): paid, billing_reason subscription_create, amount_paid 2500
- PI pi_3UXXXoRcvKApiJYW0iTf5cZw: succeeded, 2500 received, charge ch_3UXXXoRcvKApiJYW00MXiFk3, order_reference cs_test_a1XAPNWd58usVP1HwgKEz0kZQq4X7Laxic5FgngAEp2nPK4sdHnA0BAJdn (soft-launch session 2026-11-03)

## App cross-reference (from prior Staging UI readback, not re-read this run)
- order bd57452a-e9c7-4fe5-9a9f-005b0289bb77 paid 2500
- monthly grant 580828d5… available 1000

## Raw (sanitized: no client secrets, receipt/invoice URLs, PM details, email)
- raw/stripe-subscription.json
- raw/stripe-invoice.json
- raw/stripe-payment-intent.json