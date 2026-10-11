# M2 task 3.1 identity and workspace foundation evidence

Status: **READY_FOR_REVIEW** for task 3.1. The M2 milestone gate remains `NOT_STARTED` until tasks 3.1–3.11 and the M2 gate review are complete.

Candidate: `working-tree-20260928-m2-3.1` on branch `codex/restart-shpitto-m0`.

The M1 acceptance record remains a historical PASS for its exact candidate
(`working-tree-20260928-m1`). M2 adds the identity/workspace foundation after
that review; it does not rewrite the M1 decision. The current task evidence
records the new source, schema, configuration and validator scopes and carries
forward only the unchanged M1 contract scope (`.shpitto/contracts`, registry,
Docs manifest and implementation design/acceptance inputs) by equivalence.

## Delivered scope

- `src/db/schema/auth.ts` declares the Better Auth user, session, account and verification tables with native text IDs, UTC timestamp columns and user foreign keys.
- `src/db/schema/workspace.ts` declares personal/team workspaces, memberships, retryable setup state, credit account ownership, grant bucket invariants and the composite grant/workspace allocation foreign key.
- All domain tables are declared through `appSchema.table`, matching the `app.*` migration namespace; the schema also declares the personal-creator partial unique index and positive workspace version check.
- `src/db/migrations/0001_identity_workspace.sql` adds the reviewed auth/domain tables to the single Drizzle migration chain and updates the schema ownership version.
- `tests/fixtures/workspaces.ts` provides deterministic users A/B/C, workspaces W1/W2, decimal-string credit fixtures and a cross-workspace lineage assertion.
- `scripts/probe-m2-foundation.ts` applies the migration chain twice, loads the fixtures, verifies rollback and rejects a W1 allocation against a W2 grant.
- `scripts/check-m2-foundation.mjs` and the root package scripts enforce the migration, fixture and probe contract.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
corepack pnpm verify:db-boundary                PASS
corepack pnpm verify:m2-foundation              PASS
corepack pnpm verify                           PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:m2 PASS
```

Probe result:

```json
{
  "status": "PASS",
  "migrationRows": 2,
  "fixtureMembershipRows": 3,
  "drizzleWorkspaceRows": 2,
  "fixtureMismatchObserved": true,
  "crossTenantRejected": true,
  "rollbackObserved": true,
  "rollbackRows": 0,
  "conventions": {
    "applicationIds": "uuid",
    "betterAuthIds": "text",
    "timestamps": "UTC timestamptz",
    "quantities": "nonnegative bigint; decimal strings at JSON boundary"
  }
}
```

The second migration run created no duplicate journal or ownership rows. The injected transaction failure left no rollback workspace. The Drizzle query reads both rows from `app.workspaces`, proving that ORM metadata and migration namespace agree. The fixture assertion first confirms that the grant belongs to W2 while the attempted allocation belongs to W1; the subsequent PostgreSQL insert fails on the composite `(grant_id, workspace_id)` foreign key, proving database enforcement rather than only fixture validation.

## Evidence mapping

- `SC-IAM-02`: retryable setup state, one setup row per user, transactional rollback probe.
- `SC-CRD-02`: grant/workspace composite key and cross-workspace allocation rejection.
- `T02`: W1/W2 fixture boundary and workspace-scoped foreign keys.
- `T05`: A/B/C and W1/W2 membership fixture foundation for later invitation and switching tests.
- `T60`: one Drizzle migration owner, repeated migration application and transaction rollback.

## Boundaries and deferred work

This task does not implement signup, invitations, ownership commands, credit reservation/settlement, public APIs or UI onboarding. Those behaviors remain owned by tasks 3.2–3.11. No second migration authority, request-time schema push or Payload.js schema was introduced.

The disposable PostgreSQL container is removed after evidence capture. No provider, payment, affiliate or hosted service was contacted.

## Review state

Independent reviewer `m2-gpt6-luna-review-20260928` returned **PASS** after
checking the corrected candidate. The review confirmed that all six domain
tables use `appSchema.table`, the personal-creator partial unique index and
positive workspace version check match the migration, and runtime metadata
reports `schema=app`. It also confirmed that the probe exercises the Drizzle
workspace query and separately proves the PostgreSQL composite-FK rejection.
The integrator recorded **PASS** and unlocked task 3.2. This record does not
close the M2 milestone gate.

## Current candidate digest scope

The task candidate uses the acceptance digest algorithm recorded by the M1
record: SHA-256 of sorted `relative-path\\0byte-size\\0file-digest` entries.
Current scope digests are recorded in the task verification record at
`internal/evidence/acceptance/M2/working-tree-20260928-m2-3.1/record.json`.
The contract digest is unchanged from M1; source, schema, configuration and
validator digests changed because this task adds the Drizzle schema, migration,
fixture and checks.
