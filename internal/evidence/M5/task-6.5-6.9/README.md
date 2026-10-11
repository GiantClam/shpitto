# M5 tasks 6.5–6.9: local lifecycle, recovery, race and owner billing proof

Date: 2026-10-04. This evidence is limited to the local fixture profile and an isolated Docker PostgreSQL database. It does not claim a real Stripe account, live payment, production refund, or external operator authorization.

Implemented local scope:

- Subscription status mirroring preserves the original service-period end, supports period-end cancellation, prevents a replacement Checkout until termination, and records customer replacement history.
- Full unused cash refunds void only the matching unused grant with ledger, audit and outbox evidence. Partial, reserved, consumed and dispute exposure creates a recovery hold and case. Reversed disputes resolve a case once and release the hold.
- Refund preview is side-effect free. Durable refund requests retain a stable request/idempotency identity and represent lost remote responses as `unknown` until explicit reconciliation confirms the external reference.
- Owner billing queries and the owner-only billing page expose account hold state, subscriptions, cash orders, credit grant lineage, open recovery cases and refund requests. The browser never supplies catalog or monetary authority.

Verification command:

```text
DATABASE_URL=postgres://shpitto:<local-only>@127.0.0.1:55433/shpitto node --experimental-strip-types scripts/probe-billing-reconciliation.ts
```

The Docker-backed probe passed 18 cases, including subscription lifecycle, refund-before-payment, full unused refund, partial refund hold, lost-response refund reconciliation, concurrent paid observations producing one canonical order and one grant, reversed dispute recovery, and owner billing view isolation. The probe creates and removes a disposable database and does not use the persistent application database for assertions.

Other checks passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, and `corepack pnpm build`.

Remaining gate scope: task 6.10 remains `IN_PROGRESS`; real Stripe test-mode subscription/pack/refund evidence and independent whole-stage review are still required. No production financial action was performed.
