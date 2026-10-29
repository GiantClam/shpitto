# M2 task 3.8 evidence — Validated session DTOs and durable command identity

Status: **PASS** for task 3.8. Tasks 3.1–3.8 passed independent review; the M2
gate remains open. This task
adds the private session API contract, same-origin mutation gate, decimal-string
JSON boundary and durable semantic command replay.

## Delivered scope

- `src/contracts/http.ts` defines safe success/error envelopes, bounded
  idempotency-key parsing, stable semantic hashing, decimal-integer validation
  and recursive bigint/date serialization without exposing raw exceptions.
- `src/modules/shared/commands.ts` and `src/db/schema/commands.ts` provide a
  Drizzle-owned `command_results` table. A command is keyed by actor, scope,
  command name and bounded idempotency key; a different semantic payload is a
  conflict, while a committed result replays after the original transaction.
- Migration `0006_command_identity.sql` advances the domain schema ownership to
  version 7. No credit ledger or generation tables are added in this task.
- Existing private mutation routes require a trusted `Origin` or `Referer`
  matching `APP_URL` and a bounded `Idempotency-Key`. Better Auth continues to
  own session authentication and trusted-origin configuration.
- Team-workspace creation uses the durable command helper; the other existing
  mutation routes validate the same command identity contract before dispatch.
- `content/docs` API preview documents the session-only boundary, command key,
  safe envelopes and decimal-string quantity rule. No customer API-key or
  public generation API is advertised.

## Observed verification

Environment: Node `24.15.0`, Corepack pnpm `12.6.0`, PostgreSQL `15-alpine` in
disposable Docker container `shpitto-m2-db`, database `shpitto_m2`.

```text
corepack pnpm typecheck                         PASS
corepack pnpm lint                              PASS
corepack pnpm format:check                      PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:m2 PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:command-contract PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:access-states PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:operator PASS
DATABASE_URL=<redacted-local-credential> corepack pnpm db:probe:tenant-auth PASS
corepack pnpm verify                            PASS
```

Command-contract probe result:

```json
{
  "status": "PASS",
  "replayed": true,
  "mismatchRejected": true,
  "bigintAsDecimalString": true,
  "quantityBoundaryRejected": true,
  "stableSemanticHash": true,
  "forgedOriginRejected": true,
  "raceEffects": 1,
  "raceReplayed": [false, true]
}
```

No provider, payment, affiliate or hosted-service call was made. Credit ledger,
audit/outbox atomicity and generation settlement are later milestones; this
task verifies the command identity and HTTP boundary those domains will use.

## Review state

Independent `gpt-6-sol` review passed on 2026-09-28. The reviewer recomputed
all six candidate digests, reran the acceptance checker, command-contract race
probe, M2 foundation probe and full repository verification. The review keeps
route-by-route command-result migration and uniform legacy error envelopes as
follow-up boundaries; no credit-ledger or generation claim is made here.
