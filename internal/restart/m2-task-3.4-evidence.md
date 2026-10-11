# M2 task 3.4 evidence — Team invitations and durable mail intent

Status: **PASS** for task 3.4. Tasks 3.1–3.3 are PASS; this task
adds owner-only invitation creation, one-use email-bound acceptance and a
transactional mail intent seam.

## Delivered scope

- `src/db/schema/invitations.ts` and migration `0002_workspace_invitations.sql`
  add hashed tokens, normalized email, exact seven-day expiry, accepted state,
  pending-email uniqueness and durable `mail_outbox` intent rows under the
  existing Drizzle `app` schema.
- `src/modules/workspaces/invitations.ts` creates invitations only for current
  team owners and accepts them once for an active verified account whose
  normalized email matches. Workspace and invitation row locks serialize
  concurrent acceptance.
- `src/adapters/mail/**` defines a local delivery adapter seam; creation stores
  the raw delivery token only in the internal outbox payload and never returns
  it from the HTTP creation route.
- `src/app/api/workspaces/[workspaceId]/invitations/route.ts` and
  `src/app/api/invitations/accept/route.ts` expose bounded JSON/session routes.
- `scripts/probe-invitations.ts` covers concurrent acceptance, replay,
  mismatched/expired email, committed mail intent and transaction rollback.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
corepack pnpm verify                           PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:invitations PASS
```

Probe result:

```json
{
  "status": "PASS",
  "concurrentWinners": 1,
  "exactSevenDayExpiry": true,
  "replayRejected": true,
  "mismatchRejected": true,
  "expiryRejected": true,
  "deletedWorkspaceRejected": true,
  "rollbackClean": true
}
```

The probe directly asserts `expires_at-created_at` equals the seven-day TTL,
then sets a separate expiry fixture `created_at` eight days in the past and
`expires_at=created_at+7 days` to preserve the database exact-seven-day check
while making the invitation expired. It also deletes a workspace before
acceptance and confirms the token is rejected without creating membership. No
provider, payment, affiliate or hosted-service call was made.

## Scope boundaries

Task 3.4 does not implement centralized tenant authorization, operator policy,
mail delivery workers or credit behavior. Those remain later tasks.

## Review state

Independent review: **PASS** by `m2-gpt6-sol-review-20260928` on the exact
current candidate. The reviewer recomputed all candidate digests, reran the
disposable PostgreSQL probe, and inspected the implementation, schema,
migration and routes. Integration decision: **PASS** by `root`; task 3.5 is
unlocked while the M2 gate remains open.
