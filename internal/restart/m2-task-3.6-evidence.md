# M2 task 3.6 evidence — Operator roles and trusted session step-up

Status: **PASS** for task 3.6. Tasks 3.1–3.5 are PASS; this task
adds explicit global operator roles and server-created step-up stamps bound to
one live Better Auth session.

## Delivered scope

- `src/db/schema/operator.ts` and migration `0003_operator_controls.sql` add
  explicit support/operator/superadmin roles plus session-bound trusted
  second-factor stamps with a ten-minute expiry.
- `src/modules/operations/authorize.ts` rechecks the active verified account,
  current non-revoked global role, exact session identity and fresh step-up for
  every privileged command. Workspace ownership is not treated as operator
  authority, and role revocation is observed immediately.
- `src/app/api/admin/me/route.ts` exposes only the authenticated, fully
  authorized operator session summary; admin screens remain a later milestone.
- `scripts/probe-operator.ts` covers owner-to-admin escalation denial, missing
  step-up, same-session success, different-session and expired-session
  rejection, step-up expiry and immediate role revocation.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                     PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:operator PASS
corepack pnpm verify                           PASS
```

Probe result:

```json
{
  "status": "PASS",
  "ownerEscalationRejected": true,
  "missingStepUpRejected": true,
  "sameSessionAccepted": true,
  "differentSessionRejected": true,
  "expiredSessionRejected": true,
  "expiredRejected": true,
  "revocationImmediate": true
}
```

No provider, payment, affiliate or hosted-service call was made. Admin UI,
production second-factor provider wiring and broader operator commands remain
later scope.

## Review state

Independent review by `m2-gpt6-sol-review-20260928-3.6` using `gpt-6-sol` is
**PASS**. The reviewer recomputed all candidate digests, reran the operator
probe and full repository verification, and confirmed unverified and disabled
operators are denied. The integrator decision is **PASS** for the exact
candidate; task 3.7 is unlocked and the M2 gate remains open.

The server-only `recordTrustedSecondFactor` helper remains an intentional seam:
it records a successful server-side step-up but does not yet prove a concrete
provider or credential assertion. Real Better Auth 2FA provider wiring is a
later operator-scope obligation and is not claimed by task 3.6.
