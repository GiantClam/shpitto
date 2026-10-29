# Generation recovery runbook

## Selected runtime and authority

The buyer-owned worker (`TASK_RUNTIME=self_hosted`) is the default recovery
runtime. Trigger is an optional future direction, not a mandatory baseline M4
dependency. `TASK_RUNTIME=trigger` is rejected even with credentials until scoped
registration and deployment are verified. Its helpers and installed SDK do not
constitute an executable/deployed hosted profile or a hosted PASS. Do not bypass
that rejection or run both runtimes for the same outbox scope.

The independent sweep reads authoritative `generation_tasks.deadline_at`, not
the original job's availability or a provider retry queue. Due-action processing
remains in the shared generation worker. Both paths reuse the same domain,
outbox, settlement and lease contracts; recovery must not edit task status,
balances or reservations directly.

The production scan interval must be positive and no greater than 60 seconds.
Local verification uses 10 seconds. The current isolated Railway worker also
schedules a workspace-scoped sweep every 10 seconds, separately from dispatch
polling, with inbox and cleanup loops outside dispatch as well.

## Current implementation limits

- The provider worker is currently restricted to the isolated Railway acceptance
  project, private database and one configured workspace; it is the only runnable
  real-provider runtime. A generic buyer production activation path and M8
  production entry are not yet implemented or proved. Never remove those fences
  to make a different deployment appear supported.
- Shared batch cleanup lives in `src/modules/assets/cleanup-batch.ts`;
  `src/trigger/cleanup-assets.ts` only re-exports it for compatibility. The
  automatic all-workspace cron was removed, not deployed. Explicit calls to the
  database-wide helper still require separate authority.
- The runtime launcher validates isolation before applying migrations and
  starting the worker. Starting the worker script directly skips that preflight.
- `allowCreate=false` still permits recovery, output ingestion and settlement;
  it is not permission to touch existing business objects.
- `drainOverdueGenerationTasks` processes up to 10 batches per drain, each
  selecting at most 100 overdue tasks. Only an empty batch confirms clearance,
  and that confirmation counts toward the budget. A nonempty batch with no
  settlements or budget exhaustion returns incomplete. Dispatch returns
  `recovery_pending` before claiming outbox work or making provider calls until
  a drain confirms empty; later cycles continue recovery. The independent sweep
  uses the same workspace-scoped drain. The local integration fixture asserts
  101 overdue settlements before the first fake provider call and no duplicate
  POST on a second restart; this is fixture coverage, not deployment evidence.
- Readiness requires successful, fresh completion of all four active loops:
  dispatch, sweep, inbox and cleanup. Health exposes each loop's in-memory
  `loops.<name>.lastSuccessAt` and `busy`; dispatch/inbox expire after 120 seconds,
  sweep/cleanup after 180 seconds. Errors do not refresh success. A paused or
  unassigned process has no active loops, so HTTP readiness alone does not prove
  active processing. Durable external heartbeat monitoring and alert delivery
  remain unimplemented/unverified.

## Operator procedure

1. Authenticate to the approved administrative host and record the approved
   database/workspace scope without copying credentials or connection URLs into
   arguments, logs or receipts. Do not query existing business objects merely
   to validate a worker configuration.
2. Prefer the configured workspace-scoped worker sweep. Keep the current
   acceptance worker bound to its approved isolated project and workspace.
3. Treat `scripts/reconcile-overdue.ts` as a database-wide maintenance command:
   it passes no workspace filter and has no application-level scope guard. Do
   not run it against a shared demo/customer database for workspace-only
   maintenance. It is usable only with separate authorization for the entire
   isolated target database; a generic scoped operator command remains pending.
4. Inspect scanned/terminalized counts and remaining overdue work. A command's
   `PASS` output describes that invocation, not backlog exhaustion, provider
   evidence, hosted acceptance or whole-stage M4 approval.
5. Reconcile an unknown submission only by the exact persisted provider request
   or an authenticated correlated callback. Preserve the 30-second submission
   timeout, 60-minute/24-probe unknown budget and 30-minute alert. Never send a
   second paid create to recover a missing response.
6. Alert when successful sweep completion is older than three minutes, using a
   monitor outside the failed loop. Stop/restart through the approved process
   supervisor; let old ownership expire and claim a fresh fenced lease. Never
   acknowledge or renew a serialized stale owner/token/generation.
7. After a total database/runner outage, settle overdue work before allowing
   resumed advancement. If the backlog cannot be cleared within a bounded pass,
   continue recovery and defer progress. Availability during the outage is not
   promised, and retries must not reset accepted deadlines.

Historical local/Trigger-helper receipts retain their original scope. The
self-hosted baseline still requires applicable recovery, provider and independent
review evidence, but not optional hosted Trigger deployment evidence.
