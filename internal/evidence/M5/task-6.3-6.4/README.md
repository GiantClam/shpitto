# M5 tasks 6.3 and 6.4: local verified webhook and payment reconciliation

Date: 2026-10-01. This evidence covers the local PostgreSQL and deterministic fixture profile only. It does not enable Stripe, create provider objects, make network calls, issue production entitlements, or authorize production refunds.

## Implemented contract

- Webhook ingress verifies the unmodified raw body with a Stripe-compatible HMAC signature, enforces a bounded payload, minimizes the stored event envelope, and rejects stale or forged requests before inserting an inbox row.
- `(provider, externalEventId)` is a durable delivery identity. Repeated delivery with the same payload is acknowledged without re-running economic effects; reusing an event ID with different bytes is rejected.
- Checkout session, invoice, PaymentIntent and charge aliases converge on one canonical order. A conflicting alias mapping is rejected.
- Payment reconciliation locks the workspace billing account, records the order and aliases atomically, issues a catalog-snapshot grant once, and marks the Checkout attempt paid only after the same transaction succeeds.
- Refund/dispute observations create immutable cash facts and an explicit recovery hold. A later paid observation cannot erase the hold or issue a grant.

## Verification

`green-contracts.log` contains 6 focused contract tests: deterministic Checkout behavior, DTO rejection, raw-body signature verification, stale/tampered signature rejection and envelope minimization.

`green-probe.log` contains 5 isolated PostgreSQL 17.6 cases:

1. verified payment persists the inbox and issues one catalog grant;
2. duplicate webhook is acknowledged without a second effect;
3. invoice and PaymentIntent aliases converge on the original order and grant;
4. forged signature creates no inbox or financial effect;
5. refund-before-payment holds the workspace and a late payment cannot grant credits.

The disposable database was removed after the probe. The live demo database was not used.

## Explicit boundary

The adapter is named Stripe-compatible only because its signature envelope matches the provider contract. The implementation provider is `fixture`; the production route rejects `NODE_ENV=production`, no Stripe SDK call is made, and no real payment or webhook account is involved. Production webhook configuration, authoritative remote reads, subscription lifecycle, cash refund execution and later M5 tasks remain open.
