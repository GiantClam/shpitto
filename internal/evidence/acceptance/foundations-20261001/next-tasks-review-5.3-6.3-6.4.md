# Review of M4 5.3 and M5 6.3/6.4

Status: **SUPERSEDED** by [next-tasks-review-5.3-6.3-6.4-final.json](next-tasks-review-5.3-6.3-6.4-final.json).

Decision: **FAIL_REQUIRES_FIX** for the combined review. M4 task 5.3 passes its bounded local fal queue contract. M5 tasks 6.3 and 6.4 do not pass this review yet.

The billing specification requires exact event-alias convergence, tenant-safe mismatched mapping handling, durable duplicate-delivery semantics, and atomic recovery. Three runtime defects remain:

1. `src/modules/billing/payment-aliases.ts:13-17` uses independent `IN` filters for object kind and external ID. A cross-pair row can therefore resolve an event to an unrelated order. The lookup must match exact `(objectKind, externalId)` tuples and reject or quarantine mismatches.
2. `src/modules/billing/reconcile-payment.ts:99-105,141-156` accepts an existing alias order without checking the incoming workspace/customer hints. It can lock the hinted workspace while resolving an order in another workspace, then attach aliases to the resolved order. The event must fail closed and create a recovery case on tenant or customer mismatch.
3. `src/modules/billing/inbox.ts:33-41` treats every existing inbox row as a duplicate. A row left `failed` after a reconciliation error can never be retried by a verified redelivery. Failed delivery rows need an explicit safe retry path that preserves the delivery identity and economic idempotency.

## Owner layer

Runtime. The requirements and billing specification were inspected first; the defects are in query predicates and delivery control flow, so an upstream documentation-only change would not remove the unsafe behavior.

## Verification

- `tests/contracts/fal.test.ts`: 5/5 passed.
- `tests/contracts/billing-checkout.test.ts`: 6/6 passed.
- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, and `corepack pnpm build` passed. The build emitted `/api/webhooks/stripe`.
- The current PostgreSQL reconciliation probe could not recreate its disposable database because the local role lacks `CREATEDB` (`42501`). Prior 5/5 probe evidence remains at `internal/evidence/M5/task-6.3-6.4/green-probe.log`.

Candidate digest and full machine-readable findings are recorded in [next-tasks-review-5.3-6.3-6.4.json](next-tasks-review-5.3-6.3-6.4.json). The review is local and fixture-only; it does not authorize Stripe, fal, production billing, production email, paid requests, or a stage-gate status change.
