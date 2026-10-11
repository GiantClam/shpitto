# M2 task 3.5 evidence — Central tenant authorization

Status: **PASS** for task 3.5. Tasks 3.1–3.4 are PASS; this task
adds the reusable current-membership and resource-workspace authorization seam
and applies it to the registered workspace commands.

## Delivered scope

- `src/modules/workspaces/authorize.ts` centralizes current active verified
  membership, current owner authorization, and resource-to-workspace binding.
- Workspace commands and invitation creation use the shared owner gate; leave
  uses the shared current-membership gate. Each command still resolves live
  server-side rows inside its transaction, so a still-valid session does not
  preserve access after removal.
- `scripts/probe-tenant-authorization.ts` covers cross-workspace substitution,
  missing-workspace non-disclosure, mismatched resource binding, post-removal
  access with the same actor and concurrent last-owner mutations.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:tenant-auth PASS
```

Probe result:

```json
{
  "status": "PASS",
  "crossWorkspaceRejected": true,
  "missingWorkspaceNonDisclosing": true,
  "resourceMismatchRejected": true,
  "postRemovalRejected": true,
  "lastOwnerRaceRejected": true
}
```

The full `corepack pnpm verify` run, including database boundaries, M2
foundation checks, OpenSpec validation and the Next production build, passed
for this candidate. No provider, payment, affiliate or hosted-service call was
made.

## Scope boundaries

Task 3.5 does not implement workspace suspension/billing holds, operator roles,
or future task/credit/asset/download resource tables. Future tenant modules
must call the shared authorization seam and bind resource queries to the
authorized workspace.

## Review state

Independent review: **PASS** by `m2-gpt6-sol-review-20260928-3.5` on the exact
current candidate. The reviewer recomputed all six candidate digests, reran the
tenant authorization PostgreSQL probe and inspected the registered routes and
authorization seam. Integration decision: **PASS** by `root`; task 3.6 is
unlocked while the M2 gate remains open.
