# Hosted Checkout URL defect (Stripe test account)

## Symptom
Checkout Sessions created with `ui_mode=hosted_page` return a `url` (~443 chars) that opens Stripe's "This link is incomplete" page on both `checkout.stripe.com` and `buy.stripe.com` rewrites. No card form is shown.

## Account context
- Stripe account `acct_1USYQxRcvKApiJYW`
- `details_submitted=false`, `charges_enabled=false`
- Payment Links and PaymentIntents (test card) work on the same account
- Embedded Checkout (`ui_mode=embedded_page` plus the publishable test key) works

## Acceptance workaround used 2026-10-29
1. Expire the app's hosted open attempt (session identity immutable once set)
2. Create embedded Checkout Session with same customer/catalog/metadata
3. Insert a new `billing_checkout_attempts` row bound to the embedded `stripe_session_id`
4. Pay via Stripe.js Embedded Checkout with test card 4242…
5. Webhook `checkout.session.completed` reconciled: attempt paid, order paid_minor=900, grant 250 credits

## Follow-up
Prefer fixing stripe-test adapter / account onboarding so hosted Checkout URLs work, or switch acceptance path to embedded_page end-to-end in the product UI.

## Staging product path (2026-10-30)
Hosted Checkout remains an incomplete URL on this Stripe account. The product path is now `embedded_page` mount verified on Staging after PR #7: `MOUNT_OK` in `EMBEDDED_CHECKOUT_MOUNT.md` (Pay not clicked; not an M5 stage PASS).
