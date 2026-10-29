# M2 task 3.10 evidence — server quotes, reservations, FEFO and local demo funding

Status: **PASS** for task 3.10 after independent `gpt-6-sol` review. M2 remains open; settlement,
refunds, generation tasks, provider adapters and payment work remain deferred.

## Delivered scope

- `src/config/models.ts` defines a versioned local model catalog and immutable
  server quote payloads. The reservation command re-derives unit cost and total
  cost from the current catalog, verifies the quote hash and rejects stale,
  disabled or forged values.
- `src/db/schema/workspace.ts` and migration `0008_credit_reservations.sql`
  add workspace-owned reservations and bind every allocation to one
  reservation. Reservation snapshots retain model, catalog version, quantity,
  unit cost, total cost and quote hash.
- `src/modules/credits/allocate.ts` (exported through `reserve.ts`) locks the
  workspace credit account, excludes unreserved expired grants immediately and
  allocates by expiry, creation time and ID. Grant bucket updates, allocation
  rows, reserve ledger entries, command result, audit event and dispatch intent
  commit together. Serialization/deadlock retries are bounded at three
  attempts.
- `src/modules/credits/issue-demo.ts` and onboarding options provide a stable
  per-workspace demo-grant business key. Concurrent local retries replay one
  grant; the production profile rejects demo funding. The default onboarding
  path remains funding-pending unless funding is explicitly requested.
- `scripts/probe-credit-reservation.ts` covers FEFO ordering, expired-grant
  exclusion, client-price forgery, reservation replay, concurrent insufficient
  funds, single-effect onboarding funding and production rejection.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`. No provider,
payment, payout or hosted-service call was made.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                      PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:m2 PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:credit-ledger PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:onboarding PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:credit-reservation PASS
corepack pnpm verify                            PASS
openspec validate restart-shpitto-video-saas --strict --json --no-interactive PASS
```

Reservation probe result:

```json
{
  "status": "PASS",
  "replayed": true,
  "fefoAllocation": ["20", "20"],
  "expiredUnreservedExcluded": true,
  "forgedPriceRejected": true,
  "staleCatalogRejected": true,
  "concurrentAffordableReservations": 1,
  "failedRaceEffects": 0,
  "onboardingDemoGrantSingleEffect": true,
  "productionDemoRejected": true
}
```

## Deferred boundaries

This task does not settle, release or consume reservations, issue failure
compensation, create generation tasks, call a provider, or integrate payment.
Those behaviors remain tasks 3.11 and later. The local catalog contains only the
Mock model until the generation adapter contract is accepted.

The acceptance record carries one P2 follow-up: migration 0008 has not been
exercised against a database containing pre-3.10 allocation rows because M2
creates no allocation rows before reservation ownership exists. A populated
upgrade fixture or reviewed backfill is required before claiming that upgrade
path.

## Review state

The exact current candidate was independently reviewed by
`m2-gpt6-sol-review-20260928-3.10`; the reviewer recomputed all candidate
digests, reran the reservation probe, the existing M2 probes and full
verification before recording PASS.
