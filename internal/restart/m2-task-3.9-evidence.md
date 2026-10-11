# M2 task 3.9 evidence — Grant ledger, allocation lineage and atomic audit foundation

Status: **PASS** for task 3.9. Tasks 3.1–3.9 passed independent review; the M2
gate remains open. This task
adds immutable grant explanations and the audit/outbox transaction boundary
consumed by later reservation and generation work.

## Delivered scope

- `src/db/schema/credit.ts` adds immutable `credit_ledger_entries`,
  workspace-scoped `audit_events` and durable `outbox_events`. The ledger uses
  a composite `(grant_id, workspace_id)` foreign key so lineage cannot cross
  tenants; business keys are unique.
- Migration `0007_credit_ledger_audit.sql` creates the three tables and advances
  domain schema ownership to version 8. Existing grant/account/allocation tables
  remain Drizzle-owned and are not duplicated.
- `src/modules/credits/ledger.ts` issues one positive grant with bucket equality,
  account-row serialization, immutable ledger explanation, audit event and
  outbox event in one transaction. Reusing a business key replays the original
  result only when the semantic command identity matches.
- `scripts/probe-credit-ledger.ts` proves grant replay, mismatched semantic
  reuse rejection, bucket equality, cross-workspace ledger rejection and
  rollback after injected audit or outbox failure.
- This task does not implement server quotes, FEFO allocation, reservation
  settlement, provider calls or generation lifecycle behavior; those remain
  tasks 3.10 onward.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                      PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:m2 PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:credit-ledger PASS
corepack pnpm verify                            PASS
```

Credit-ledger probe result:

```json
{
  "status": "PASS",
  "replayed": true,
  "mismatchRejected": true,
  "bucketEquality": true,
  "auditRollback": true,
  "outboxRollback": true,
  "crossTenantRejected": true,
  "ledgerRows": 1,
  "auditRows": 1,
  "outboxRows": 1
}
```

No provider, payment, affiliate or hosted-service call was made. Reservation,
FEFO allocation, expiry/refund settlement and generation task tables are later
milestones; this record claims only the grant and transaction foundation.

## Review state

Independent `gpt-6-sol` review passed on 2026-09-28. The reviewer recomputed
all six candidate digests, reran the acceptance checker, credit-ledger and M2
foundation probes, and full repository verification. Quotes, FEFO/reservations,
settlement/refunds, generation and provider/payment work remain later scope.
