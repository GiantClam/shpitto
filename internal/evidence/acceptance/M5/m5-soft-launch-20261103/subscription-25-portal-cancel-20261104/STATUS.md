# SC-BIL-09 owner portal cancel on $25 subscription — 2026-11-04

- account: Stripe sandbox acct_1USYQxRcvKApiJYW, livemode=false (TEST, no charge)
- status: APP_REFLECTION_FAIL (Stripe portal cancel succeeded; app does not show it)
- SC-BIL-09: BLOCKED. m5: IN_PROGRESS (not a stage PASS)

## Owner portal (~15:14 Asia/Kuala_Lumpur)
- Stripe TEST portal (Sandbox) showed "Cancels Dec 3" / "Your service will end on December 3, 2026."
- Screenshots: screenshots/01-billing-before.png, 03-cancel-confirm.png, 04-portal-after.png

## Stripe readback
- sub_1UXXXpRcvKApiJYW5NlKrZys: status active, cancel_at_period_end=FALSE, cancel_at=1796265232 (2026-12-03 10:33:52 Asia/Kuala_Lumpur, = current_period_end), canceled_at 1793776456 (2026-11-04 15:14:16 Asia/Kuala_Lumpur), reason cancellation_requested
- event evt_1UXyOjRcvKApiJYWsCPe2EWM customer.subscription.updated (portal; no API request id); previous_attributes only cancel_at/canceled_at/cancellation_details; pending_webhooks=1 at read (likely unrelated remove-anything endpoint; per-endpoint delivery not visible)

## App readback
- Staging billing after 10s+reload: "active / No scheduled cancellation" (screenshots/05-billing-after.png) -> FAIL
- Earlier API cancel (cancel_at_period_end=true) WAS reflected (see ../subscription-25-cancel-at-period-end-20261104/).

## Root cause (code)
- src/adapters/billing/stripe-test-events.ts:38 Subscription type picks only cancel_at_period_end (no cancel_at)
- src/adapters/billing/stripe-test-events.ts:490 maps cancelAtPeriodEnd: subscription.cancel_at_period_end only
- src/modules/billing/subscriptions.ts:23/81/85 store only cancelAtPeriodEnd; schema src/db/schema/billing.ts:84 / migration 0016 has no cancel_at column
- Portal (billing_mode flexible / current API) schedules cancellation via cancel_at, leaving cancel_at_period_end=false, so app mirrors false.

## Local fix plan (not implemented)
1. stripe-test-events.ts:38 add 'cancel_at' to the Pick; :490 compute scheduledCancel = cancel_at_period_end || (cancel_at != null); pass cancelAtPeriodEnd: scheduledCancel and cancelAt: cancel_at ? new Date(cancel_at*1000) : null.
2. New migration: alter table app.billing_subscriptions add column cancel_at timestamptz null; schema billing.ts add cancelAt.
3. subscriptions.ts mirrorSubscription input add cancelAt?: Date|null; set on update/insert (explicit null clears on un-cancel).
4. billing/page.tsx:85 show "Cancels <cancelAt|periodEnd>" when cancelAtPeriodEnd or cancelAt.
5. Tests: tests/unit/stripe-test-events.test.ts case cancel_at_period_end=false + cancel_at=period_end -> cancelAtPeriodEnd true; un-cancel (cancel_at null) -> false; integration mirror test.
6. Redeploy Staging, then resend evt_1UXyOjRcvKApiJYWsCPe2EWM (Dashboard/CLI) or toggle in portal, and re-read billing page.

## Raw
- raw/stripe-portal-cancel-event.json