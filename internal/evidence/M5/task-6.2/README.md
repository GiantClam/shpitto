# Task 6.2 guarded Checkout and billing portal commands

Date: 2026-10-01. This is the local contract/service slice only. It does not enable production billing, create Stripe objects, receive webhooks, or reconcile payment observations.

## Authority and boundaries

Implementation follows REQ-BIL-01 and REQ-BIL-04 in `openspec/changes/restart-shpitto-video-saas/specs/billing/spec.md`, task 6.2, and E04 in `openspec/changes/restart-shpitto-video-saas/design.md`. `requireCurrentOwner` is the existing transaction-locked workspace authorization boundary. The command identity uses the existing semantic idempotency implementation; the workspace and catalog key are part of the durable semantic payload.

The two application routes accept only same-origin, authenticated requests. Checkout accepts only `{catalogProductKey}` plus the required `Idempotency-Key` transport header. The server selects the profile and catalog snapshot. Customer, price, workspace, interval, annual plan, return URL and proration values are never taken from the request. Portal return destination is server-owned `/dashboard` under the configured app origin.

The local provider is a deterministic in-process fixture adapter. It records no network activity and returns no real Stripe identifier. Its Checkout result is keyed by the persisted `checkout:<attemptId>` identity; repeated calls receive the same session. The service commits a `creating` attempt with a one-hour reconciliation deadline before calling this provider. A provider result marked unknown leaves the attempt unresolved; retry queries that same attempt and calls the same provider identity. Accepted results move it to `open` and store the session reference. A recurring subscription or unresolved recurring attempt blocks another recurring Checkout while permanent packs remain available. Billing hold blocks Checkout but still permits the owner to open the portal for recovery.

Portal preparation also commits the durable command identity before invoking the provider. A lost caller response replays the same command key and provider identity. Portal does not alter subscription state and does not expose plan changes.

## Verification

- `green-contracts.log`: the six task 6.1 catalog/DTO tests remain green alongside the new service.
- `green-schema.log`: a disposable PostgreSQL 17.6 database passed ten service cases: owner/workspace binding, same-key Checkout replay, member denial, recurring slot denial, request field injection denial, billing hold denial, portal during hold, portal response-loss replay with stable URL/customer identity, unknown provider response recovery and one unresolved recurring slot. The random database was dropped and verified absent.
- `checks.log`: TypeScript, source-boundary and formatting checks passed; the probe was run against the existing isolated loopback PostgreSQL cluster at port 55432 and did not touch the live demo database.

Additional focused provider and route contracts in `tests/contracts/billing-checkout.test.ts` cover deterministic Checkout replay, retained unknown provider identity, provider-owned portal URLs and rejection of extra browser-controlled fields. These are four passing tests.

Commands:

```text
node --experimental-strip-types --test tests/contracts/billing-checkout.test.ts
node --experimental-strip-types scripts/probe-billing-checkout.ts
corepack pnpm typecheck
node scripts/check-source-boundaries.mjs
node scripts/format-check.mjs
```

## Explicit remaining work

Task 6.2 does not claim authenticated Stripe or other provider adapters, real Checkout/portal URLs, subscription creation, webhooks, payment reconciliation, customer replacement commands, refund behavior, credits issuance, billing UI or production catalog enablement. Those remain tasks 6.3 through 6.10 and later release gates. The routes currently run against the deployed schema only after migration 0016 has been applied; migration ownership is documented in task 6.1.
