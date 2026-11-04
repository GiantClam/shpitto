# M5 soft-launch: hosted Checkout paid + reconciled (Staging, TEST)

Date: 2026-11-04 ~14:46 Asia/Shanghai. Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false.

## Status keys
- hostedCheckoutSessionUrl: PASS_paid_and_reconciled
- session_id: cs_test_a1Vo4XFZCVRdfeeufzyJlZ4MTR8ZnYGfv2TZFiJboXpFHNOR7sEBRgqZcy (ui_mode=hosted_page)
- session.status: complete
- payment_status: paid
- amount_total: 900 USD minor
- payment_intent: pi_3UXxycRcvKApiJYW0UtHUSZ7 (succeeded, amount_received 900)
- charge: ch_3UXxycRcvKApiJYW0camvJ9j (succeeded, captured, amount_refunded 0, visa 4242, no 3DS)
- webhook event: evt_1UXxydRcvKApiJYWxbVWAA2f checkout.session.completed
- order_id: NOT_DISCOVERED (UI-only readback; no read-only Staging DB/API readback done)
- grant_id: NOT_DISCOVERED (UI-only)
- UI reconcile: orders 2->3, new "Credit pack · paid" USD 9.00 refunded 0.00, new permanent grant 250 Available, total available 1000->1250 (monthly 1000 unchanged)
- m5: IN_PROGRESS (no stage PASS claimed; target later READY_FOR_REVIEW)

## Notes
- This pack is UNUSED and is the candidate for SC-BIL-11 hosted full refund. Not refunded by this run.
- Raw: raw/stripe-session.json, raw/stripe-payment-intent.json, raw/billing-ui-readback.json (secrets/client_secret/receipt_url omitted).