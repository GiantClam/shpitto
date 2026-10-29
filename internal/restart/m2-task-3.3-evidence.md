# M2 task 3.3 evidence — Workspace ownership commands

Status: **PASS** for task 3.3. Tasks 3.1 and 3.2 are PASS; this
task adds bounded personal/team ownership commands and keeps invitations and
centralized authorization in later tasks.

## Delivered scope

- `src/modules/workspaces/policy.ts` resolves current membership from the
  database, checks active verified users, locks workspace rows and enforces
  recent session freshness (at most ten minutes).
- `src/modules/workspaces/commands.ts` implements team creation, ownership
  transfer, member removal, owner demotion and leaving, with personal-space
  invariants and last-owner transaction guards.
- `src/app/api/workspaces/**` exposes session-bound command routes with bounded
  request parsing and safe domain errors. Malformed or non-object JSON returns
  HTTP 400 before any workspace command can run; an empty body is the only
  intentional default-object case.
- `scripts/probe-workspaces.ts` proves personal-operation rejection, a
  concurrent last-owner race, verified-member transfer and cleanup.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
DATABASE_URL=<redacted-local-credential> node --experimental-strip-types scripts/probe-workspaces.ts PASS
```

Probe result:

```json
{
  "status": "PASS",
  "personalRejected": 3,
  "lastOwnerRaceRejected": 3,
  "transferOwner": "generated verified member"
}
```

The API comment records that session `updatedAt` is used as the server-trusted
freshness timestamp for this task; MFA step-up remains a later operator policy.
No provider, payment, affiliate or hosted-service call was made.

## Scope boundaries

Task 3.3 does not implement invitations, email delivery, centralized endpoint
authorization, suspension/holds or credit behavior. Those remain tasks 3.4–3.11.

## Review state

Independent reviewer `m2-gpt6-luna-review-20260928` returned **PASS** after
checking malformed JSON rejection, current candidate digests, static/build
checks and the PostgreSQL ownership race probe. The integrator recorded **PASS**
and unlocked task 3.4. This evidence does not close the M2 milestone gate.
