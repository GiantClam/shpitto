# SC-BIL-09 cancel-at-period-end on $25 subscription — 2026-11-04

- account: Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false (TEST only, no charge)
- status: STRIPE_SIDE_DONE_APP_REFLECTION_UNVERIFIED
- SC-BIL-09: BLOCKED (not met). m5: IN_PROGRESS (not a stage PASS)

## Method (deviation)
- App's intended owner path is the Stripe Customer Portal (src/adapters/billing/stripe-test.ts billingPortal.sessions.create; portal config subscription_cancel mode at_period_end).
- This run set cancel_at_period_end=true directly via Stripe API (MCP stripe_api_write), NOT via the owner portal. The portal-initiated owner cancel is still unproven.
- App ingests customer.subscription.updated (src/adapters/billing/stripe-test-events.ts) -> mirrorSubscription sets cancelAtPeriodEnd; billing page shows "Cancellation at period end".

## Stripe result
- sub_1UXXXpRcvKApiJYW5NlKrZys: status active, cancel_at_period_end=true, cancel_at 1796265232 = 2026-12-03 10:33:52 Asia/Kuala_Lumpur (= current_period_end), canceled_at 1793775991 = 2026-11-04 15:06:31 Asia/Kuala_Lumpur, reason cancellation_requested
- No new invoice/charge; latest_invoice still in_1UXXXoRcvKApiJYWcxmgVlPK
- event evt_1UXyHERcvKApiJYWnYFvNc13 customer.subscription.updated (request req_bMahS0Fifqe5op); pending_webhooks 2 -> 1 on re-read. Staging endpoint we_1UU8YPRcvKApiJYWVwQBqFcw subscribed; per-endpoint delivery not visible via MCP.

## App reflection: NOT VERIFIED
- No unauthenticated readable API/DB path from this run. Needs UI readback: Staging billing page (expect "Cancellation at period end") and/or /admin workspace details section=subscriptions (cancelAtPeriodEnd=true), plus webhook event row for evt_1UXyHERcvKApiJYWnYFvNc13.

## Still required for SC-BIL-09
- owner cancel via portal; app reflection; credits keep original expiry; immediate/scheduled price change unavailable; new subscription purchase blocked by Checkout guard until prior ends; catalog edits do not migrate existing customers.

## Raw
- raw/stripe-subscription-after-cancel.json
- raw/stripe-event-subscription-updated.json