# SC-BIL-09 cancel-at-period-end on $25 subscription — 2026-11-04

- account: Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false (TEST only, no charge)
- status: VERIFIED_api_cancel_app_reflected (API-initiated cancel; owner portal path still unproven)
- SC-BIL-09: BLOCKED (not met). m5: IN_PROGRESS (not a stage PASS)

## Method (deviation)
- App's intended owner path is the Stripe Customer Portal (src/adapters/billing/stripe-test.ts billingPortal.sessions.create; portal config subscription_cancel mode at_period_end).
- This run set cancel_at_period_end=true directly via Stripe API (MCP stripe_api_write), NOT via the owner portal. The portal-initiated owner cancel is still unproven.
- App ingests customer.subscription.updated (src/adapters/billing/stripe-test-events.ts) -> mirrorSubscription sets cancelAtPeriodEnd; billing page shows "Cancellation at period end".

## Stripe result
- sub_1UXXXpRcvKApiJYW5NlKrZys: status active, cancel_at_period_end=true, cancel_at 1796265232 = 2026-12-03 10:33:52 Asia/Kuala_Lumpur (= current_period_end), canceled_at 1793775991 = 2026-11-04 15:06:31 Asia/Kuala_Lumpur, reason cancellation_requested
- No new invoice/charge; latest_invoice still in_1UXXXoRcvKApiJYWcxmgVlPK
- event evt_1UXyHERcvKApiJYWnYFvNc13 customer.subscription.updated (request req_bMahS0Fifqe5op); pending_webhooks 2 -> 1 on re-read. Staging endpoint we_1UU8YPRcvKApiJYWVwQBqFcw subscribed; per-endpoint delivery not visible via MCP.

## App reflection: VERIFIED (superadmin, read-only, 2026-11-04 ~15:08 Asia/Kuala_Lumpur)
- Billing page /workspaces/ab0d1ea5-f538-4b4b-8c59-698b5d7c5d39/billing: Subscriptions (1) "active / Cancellation at period end", "Current period ends Dec 3, 2026".
- Monthly subscription grant 1000 credits, Available 1000, "Expires Dec 3, 2026" (credit expiry unchanged).
- Payment history: monthly USD 25 paid, 0 refunded. Recovery: Clear.
- Admin: no subscription detail view; admin billing lists the orders. First audit page has no entry for evt_1UXyHERcvKApiJYWnYFvNc13 (app may not audit subscription.updated); webhook row not directly observed.
- Screenshots: screenshots/billing.png, screenshots/admin-subscription.png
## Still required for SC-BIL-09
- owner cancel via portal; (credit expiry unchanged observed for this API cancel); immediate/scheduled price change unavailable; new subscription purchase blocked by Checkout guard until prior ends; catalog edits do not migrate existing customers.

## Raw
- raw/stripe-subscription-after-cancel.json
- raw/stripe-event-subscription-updated.json
## Checkout guard / price change (2026-11-04 15:10 Asia/Kuala_Lumpur, read-only)
- UI: with sub active + cancel at period end, Monthly "Open checkout" (USD 25) is ENABLED with no message -> UI does NOT block repurchase. "Open billing portal" enabled. No cancel/resume buttons. Screenshot: screenshots/checkout-block.png
- Price change: no plan/price-change control in UI -> "immediate/scheduled price change unavailable" observed in UI (portal config subscription_update disabled per unit tests; portal page itself not opened).
- Server guard (code, not exercised): YES. src/modules/billing/checkout.ts:89-101 assertNoActiveSubscription throws CONFLICT "A nonterminal subscription already exists for this workspace." when billing_subscriptions has status in ACTIVE_SUBSCRIPTION_STATUSES (checkout.ts:20: incomplete, trialing, active, past_due, unpaid, paused), and CONFLICT for a pending recurring Checkout attempt (:100). Called from createCheckoutAttempt (:180) and openCheckout (:209) for catalog.kind=subscription. Guard is status-based; cancel_at_period_end keeps status active, so it should reject. Defense in depth: reconcile-payment.ts:192 and subscriptions.ts:64 check for another nonterminal subscription.
- Not yet proven: clicking Open checkout on Staging returns the CONFLICT (needs a click readback; would not charge). UX gap: button enabled with no message.
- SC-BIL-09 remains BLOCKED (owner portal cancel path, live guard rejection, catalog-edit non-migration not proven).
