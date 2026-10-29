# Task 6.1 billing schema and catalog contracts

Date: 2026-10-01. Scope: local contract foundation; this is not M5 stage acceptance or proof of live Stripe behavior.

## Reviewed authority

- `openspec/changes/restart-shpitto-video-saas/specs/billing/spec.md`, especially REQ-BIL-01, REQ-BIL-03, REQ-BIL-04 and REQ-BIL-06.
- `openspec/changes/restart-shpitto-video-saas/design.md`, E04.
- `docs/plans/2026-09-27-shpitto-detailed-technical-design.md`, schema register and sections 9.1 through 9.4.
- Existing root Drizzle ownership, tenant composite foreign keys, integer credit ledger and durable command conventions.

## Changes

Migration `0016_billing_contracts.sql` is additive and advances the domain ownership version from 16 to 17. Existing billing account rows retain their status, hold reason and version; new lease fields default to unclaimed generation zero. No grants, balances or external provider objects are created by the migration.

The new tables persist customer lineage, Checkout attempts, subscriptions, canonical orders, payment aliases and immutable confirmed cash facts. Composite foreign keys bind provider/customer/workspace, alias/order/workspace/provider and cash/order/workspace/provider/currency. Globally canonical aliases prevent observations from introducing another order identity. Customer replacement closes the old interval and appends another mapping with a predecessor and reason; history cannot be deleted or reassigned. SQL triggers also preserve purchase snapshots, established Checkout identities, terminal Checkout resolution and confirmed refund totals.

One unresolved recurring Checkout is allowed per workspace, including an unknown result. A terminal status requires a recorded resolution reference and time. Nonterminal subscriptions independently occupy a unique workspace slot; period-end cancellation does not release it. Cross-table Checkout-versus-subscription serialization remains the responsibility of the billing-account-locked command in task 6.2. SQL cannot authenticate whether a supplied resolution reference came from Stripe; the trusted reconciliation authority in tasks 6.3/6.4 must establish that fact before changing the projection.

Reconciliation uses an owner, token, monotonically increasing bigint generation and expiry. The database rejects incomplete lease fields and generation regression or ownership replacement without a newer generation. The probe demonstrates a stale compare-and-set has zero affected rows. Network fetch orchestration and atomic economic effects are tasks 6.4/6.7; this foundation does not claim those commands already exist.

The immutable local/test catalog provides one fictional monthly subscription and one permanent pack. The production catalog is empty and lookup fails closed. No Stripe account, approved commercial amount or real price mapping is configured. Strict snapshot DTOs can describe a future reviewed Stripe price reference without enabling it. The server stores all catalog terms and a deterministic semantic hash; the hash detects changes but is not an authorization signature. Caller Checkout input contains only a catalog product key. Money minor units and integer credits have separate branded types and bounded canonical decimal-string JSON representations; credits are never derived from cash amounts.

## Verification

- `red-contracts.log`: the first contract test run fails because the required contract/catalog implementation is absent.
- `red-schema.log`: a freshly migrated isolated database lacks the required Checkout table; the expected assertion fails and the database is removed.
- `green-contracts.log`: six contract tests pass, covering production exclusion, monthly/pack terms, immutable snapshots, future Stripe DTO shape, injected request fields, integer units and alias boundaries.
- `green-schema.log`: 44 PostgreSQL 17.6 constraint/upgrade cases pass. This includes migration 15-to-16 preserving a preexisting billing hold and available/reserved credits, a ten-connection recurring Checkout race with one winner, unknown/terminal slot behavior, subscription cancellation semantics, all three projection/provider bindings, tenant isolation, immutable cash/alias/history facts and lease fencing. The fresh database is verified absent after cleanup.
- `checks.log`: TypeScript, source boundaries, formatting and database ownership boundaries pass.

Commands: `node --experimental-strip-types --test tests/contracts/billing-contracts.test.ts`; `node --experimental-strip-types scripts/probe-billing-schema.ts`; `corepack pnpm typecheck`; `node scripts/check-source-boundaries.mjs`; `node scripts/format-check.mjs`; `node scripts/check-db-boundaries.mjs`.

The probe requires a local `DATABASE_URL` whose role may create databases. It creates a random `m5_billing_probe_*` database and migrates only that database. Verification used the existing isolated test PostgreSQL cluster on loopback port 55432; the live demo database on port 5432 was untouched. PostgreSQL 17.6 was read from the running server.

## Deployment and remaining boundaries

Apply migration 0016 before deploying code that uses the expanded Drizzle billing account schema. Older M3 commands still operate under the same column defaults once migrated; this is verified without changing their grant or access semantics. Do not point new source at the unmigrated demo database and assume hot reload is a migration strategy.

No dependency, package script, task register, acceptance gate or historical M3 evidence was modified in this implementation lane. Existing helpers for semantic hashing, decimal parsing and domain errors were reused. No checkout HTTP command, live Stripe request, webhook, grant reconciliation, cash refund, operator workflow or production enablement is claimed. Event identity deduplication is a database constraint; deduplication of an economic loss across different refund/dispute identities remains a reconciliation obligation. Historical customer changes require the future audited domain command; the schema only retains its reason and lineage.
