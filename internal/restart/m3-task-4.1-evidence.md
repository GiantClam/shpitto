# M3 tasks 4.1-4.11 and 4.13 evidence

Date: 2026-09-29

The task contract is implemented in the root `src/` application:

- `src/db/schema/generation.ts` defines the durable task row, immutable input/catalog/policy snapshots, queue and recovery deadlines, version, and guarded status check.
- `src/db/migrations/0011_generation_task_contract.sql` creates the table and binds a reservation to at most one task with a composite workspace foreign key. The migration is registered in `src/db/migrations/meta/_journal.json` and was applied twice to the disposable PostgreSQL instance.
- `src/modules/generation/state.ts` contains the single transition table and rejects terminal reopen, illegal jumps, and failed transitions without a failure code.
- `src/modules/generation/create.ts` authorizes current workspace membership and active billing, revalidates the server quote, rejects provider URLs and untrusted input assets, then writes task, reservation, command result, audit and dispatch outbox effects in one transaction. Asset inputs require a trusted server-side readiness resolver; browser routes cannot assert readiness by themselves.
- `src/app/api/workspaces/[workspaceId]/generations/route.ts` is a same-origin, authenticated adapter over the domain command.

Verification:

- `node_modules/.bin/tsc --noEmit` — PASS.
- `node_modules/.bin/next build` — PASS; the new generation API route is included in the production route manifest.
- `node --experimental-strip-types --test tests/unit/generation-state.test.ts tests/unit/m2-contracts.test.ts tests/unit/m2-policy.test.ts` — 17 tests PASS.
- `node --experimental-strip-types scripts/probe-generation-create.ts` with the local PostgreSQL profile — PASS. The probe observed one task, one task-bound reservation, one durable command result, one generation audit event and one generation dispatch outbox row; replay returned the original task, a different payload under the same key was rejected, billing hold blocked new work, and an asset without a trusted readiness resolver was rejected.
- `node --experimental-strip-types scripts/probe-generation-lifecycle.ts` with the local PostgreSQL profile — PASS. The probe observed queued cancellation with reservation release, one-time claim replay with a stable dispatch identity, failure settlement, and terminal late-event quarantine.
- `node --experimental-strip-types scripts/probe-outbox-lease.ts` with the local PostgreSQL profile — PASS. The probe observed durable lease generation/attempt metadata, current-owner acknowledgement, and stale-owner fencing.
- `node scripts/check-source-boundaries.mjs` and `node scripts/format-check.mjs` — PASS.

## Recovery, assets and local UI

- `src/modules/generation/lifecycle.ts` persists the single ambiguous submission attempt, enters `submission_unknown` after the submit timeout, requires provider request evidence before recovery, caps missing-ID reconciliation at 24 probes/60 minutes, and never creates a second paid attempt.
- `src/modules/generation/sweep-recovery.ts` scans authoritative task deadlines independently of outbox health. `src/db/migrations/0015_materialization_attempts.sql` and `src/modules/assets/ingest.ts` persist and conditionally fence the eight-attempt materialization budget.
- `src/modules/assets/authorize.ts`, `src/modules/assets/upload.ts`, `src/modules/assets/ingest.ts`, `src/adapters/storage/local.ts` and `src/modules/assets/media-probe.ts` implement membership-gated private assets, 60-second capability links, active-input deletion protection, opaque local keys, symlink/traversal rejection, bounded container checks and fixed-argument `ffprobe` validation.
- `src/app/(app)/dashboard/**`, `src/app/(app)/workspaces/**`, `src/app/(auth)/invitations/accept/page.tsx` and `src/components/workspaces/**` expose local task/recovery, credit source/expiry, private asset download, team invitation and ownership-transfer surfaces. All mutations remain server-authorized.

Additional verification:

- `corepack pnpm typecheck` — PASS.
- `corepack pnpm lint` — PASS.
- `corepack pnpm format:check` — PASS.
- `corepack pnpm build` — PASS; the build includes `/workspaces/new`, `/workspaces/[w]/settings/members`, `/invitations/accept`, generation and asset routes.
- `node --experimental-strip-types --test tests/unit/generation-state.test.ts tests/unit/m2-contracts.test.ts tests/unit/m2-policy.test.ts` — 17 tests PASS.
- `corepack pnpm db:probe:generation-lifecycle` — PASS: queued cancellation/release, claim replay, unknown submission, no second claim, expired reconciliation refund, late quarantine, ready-output success, deadline sweep and local Mock worker completion.
- `corepack pnpm db:probe:outbox-lease` — PASS: durable attempt, current-owner acknowledgement and stale-owner fencing.
- `corepack pnpm db:probe:assets` — PASS: cross-workspace denial, 60-second token expiry, traversal/symlink denial, active input deletion denial and 200 ms MP4 `ffprobe` result.
- `corepack pnpm db:probe:generation-races` — PASS: one cancel/claim winner, one terminal settlement plus quarantine, consumed reservation and reserve-before-crash deadline recovery.
- Local route smoke against `http://localhost:3100` — PASS: `/workspaces/new`, `/invitations/accept`, `/dashboard` and `/dashboard/team` returned HTTP 200; the browser accessibility tree exposed the team creation and invitation-token controls. The authenticated owner/member journey remains the manual gate item.

The implementation and automated evidence for 4.1-4.11 and 4.13 are complete. The M3 4.12 gate remains open and must not be marked PASS: browser team journeys, restart/demo walkthrough and independent manual acceptance are still required. Production email, real providers and historical anomalous-balance recovery remain outside this M3 scope.
