# M5 hosted Stripe readiness evidence

Date: 2026-10-26. Scope: acceptance hosted readiness only. This packet does not close task 6.10 and does not claim a completed application Checkout, subscription lifecycle, refund, dispute or webhook replay.

## Automated observations

- The current Railway web deployment is `a846cdbd-1b40-43f4-b79d-9bd00b931a27` at `https://shpitto-m4-web-production.up.railway.app`.
- `GET /api/healthz` returned HTTP 200 with `profile=acceptance` and `database=ready`.
- Runtime configuration parsing passed with `NODE_ENV=production`, `SHPTITTO_RUNTIME_PROFILE=acceptance`, an HTTPS `APP_URL`, a `sk_test_` key prefix, two Stripe test catalog prices, the test portal configuration and a configured `whsec_` webhook secret.
- The Stripe test account was confirmed with `livemode=false`; the active monthly and one-time test Prices and the portal cancellation policy matched the application contract.
- `POST /api/webhooks/stripe` without a signature returned the dedicated Stripe test verification response (`403 FORBIDDEN`), proving the deployed route selected the test-mode ingress branch.

## Remaining hosted blocker

The repository's seeded local identities were tried against the current hosted database and both sign-in attempts returned `401`. No authenticated Acceptance owner/member session is currently available for the deployed database. Consequently, no new application-created hosted Checkout was opened during this run, and no hosted payment, subscription transition, refund, dispute or replay claim is made.

The next automated run needs an authorized, already verified Acceptance owner/member login supplied through runtime-only environment variables. It should then create the Checkout through the application, complete the Stripe test flow, collect Stripe/application/database readbacks and write the full explanation packet for human PASS/FAIL/RETURN_FOR_EVIDENCE selection.

## Safety boundary

All observations use Stripe test mode. No Live key, real charge, real refund or funds settlement was used.
