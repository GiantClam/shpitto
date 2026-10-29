# M2 task 3.2 evidence — Better Auth and recoverable onboarding

Status: **PASS** for task 3.2. Task 3.1 is PASS and task 3.2
implements the persistent identity/session boundary plus account-to-personal-
workspace onboarding. The M2 milestone gate remains open until tasks 3.2–3.11
and task 3.12 review are complete.

## Delivered scope

- `src/lib/auth.ts` creates Better Auth 1.7.6 over the existing Drizzle
  PostgreSQL auth tables, with email/password signup and sign-in, bearer and
  Next cookie sessions, verification/reset callback seams, and a post-create
  hook that records a pending workspace setup.
- `src/app/api/auth/[...all]/route.ts` exposes the Better Auth handler.
- `src/modules/workspaces/onboard.ts` provides a transaction-scoped pending
  marker, idempotent personal workspace creation, owner membership insertion,
  status lookup and retry-safe re-read after the creator unique-index race.
- `src/app/api/onboarding/route.ts` requires the current Better Auth session,
  validates workspace names to 1-100 characters without control characters and
  completes onboarding without touching credit tables.
- Login, signup and reset-password pages now submit to the selected auth
  routes; no public API-key product surface is introduced.
- `scripts/probe-onboarding.ts` exercises three concurrent retries, one personal
  workspace/member result, rollback for an invalid user and cleanup/restart
  safety.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`, fixed probe
timestamps and generated isolated user IDs.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
corepack pnpm verify                           PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:onboarding PASS
```

Probe result:

```json
{
  "status": "PASS",
  "concurrentRetries": 3,
  "personalWorkspaces": 1,
  "memberships": 1,
  "rollbackObserved": true,
  "restartSafe": true,
  "demoCreditsIssued": false
}
```

The probe uses the corrected `app` schema Drizzle tables from task 3.1 and
checks the same creator/member rows through Drizzle. No provider, payment,
affiliate or hosted-service call was made.

The onboarding route rejects non-string names, empty names, names longer than
100 characters and control characters with HTTP 400 before opening a domain
command.

## Scope boundaries

Task 3.2 does not implement team ownership, invitations, centralized tenant
authorization, operator roles, suspension/holds, credit grants or demo funding.
Those behaviors remain assigned to tasks 3.3–3.11. The email callbacks are
explicit local mail adapter seams; delivery integration is task 3.4 scope.

## Review state

Independent reviewer `m2-gpt6-luna-review-20260928` returned **PASS** after
checking the bounded workspace-name input, current candidate digests, static
checks and PostgreSQL probe. The integrator recorded **PASS** and unlocked task
3.3. This evidence does not close the M2 milestone gate.
