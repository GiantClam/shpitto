# M2 task 3.7 evidence — Account, workspace and billing access-state matrix

Status: **PASS** for task 3.7. Tasks 3.1–3.6 and this task passed independent
review; the M2 gate remains open. This task adds one shared policy for disabled
accounts, suspended workspaces, billing holds and active worker settlement.

## Delivered scope

- `src/db/schema/access.ts` and migration `0005_user_access_controls.sql` add
  domain-owned account access state. Better Auth remains the identity and
  session authority; its optional `disabled_at` projection is kept in sync for
  adapter compatibility.
- `src/db/schema/billing.ts` and migration `0004_access_state.sql` add one
  workspace-owned billing account with explicit `active` or `hold` state,
  reason and optimistic version.
- `src/modules/workspaces/access-state.ts` is the shared policy for member
  login/session/history/download/invitation/transfer/generation/Checkout,
  audited operator reads and worker delivery/settlement.
- `src/modules/billing/hold-policy.ts` centralizes the billing-hold rule:
  only new generation and Checkout are blocked.
- `src/modules/operations/status-commands.ts` provides named, idempotent,
  operator-plus-step-up commands for disabling/restoring users, suspending/
  resuming workspaces and placing/releasing billing holds. Disabling a user
  revokes their live sessions and does not change teammate membership.
- Better Auth sign-in and current workspace actor resolution recheck the
  domain access state, while worker settlement remains independent of member
  authorization.
- `scripts/probe-access-states.ts` exercises the full PostgreSQL matrix.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                       PASS
corepack pnpm lint                            PASS
corepack pnpm format:check                   PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:m2 PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:operator PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:tenant-auth PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:workspaces PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:invitations PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:onboarding PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:access-states PASS
corepack pnpm verify                         PASS
```

Access-state probe result:

```json
{
  "status": "PASS",
  "disabledUserDenied": true,
  "sessionsRevoked": true,
  "teammateUnaffected": true,
  "suspendedMemberDenied": true,
  "operatorAuditAllowed": true,
  "billingHoldGenerationCheckoutDenied": true,
  "billingHoldAllowedReadsInvitesPortalSupport": true,
  "workerSettlementPreserved": true
}
```

No provider, payment, affiliate or hosted-service call was made. Generation,
Checkout and worker domain tables are later milestones; this task verifies the
policy seam and state transitions they will consume.

## Review state

Independent `gpt-6-sol` review passed on 2026-09-28. The reviewer recomputed
all six candidate digests, reran the acceptance checker, access-state probe and
full repository verification, and confirmed the task-scoped policy matrix.
The review explicitly defers audit-event storage, semantic command idempotency,
real task/worker/credit settlement mutation and settlement lineage to later
tasks; this record does not claim those later boundaries are complete.
