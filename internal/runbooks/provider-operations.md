# Provider operations

Provider health is derived from persisted observations and bounded recovery ages. A provider marked degraded affects generation capability only; authentication, workspace history and billing visibility remain available.

The buyer-owned worker is the default task runtime (`TASK_RUNTIME=self_hosted`).
Trigger is an optional future direction: `TASK_RUNTIME=trigger` is rejected even
with credentials until scoped registration and deployment are verified. The SDK
and helper tests are not hosted PASS evidence. Shared batch cleanup lives in
`src/modules/assets/cleanup-batch.ts`; `src/trigger/cleanup-assets.ts` only
re-exports it, and the unverified automatic all-workspace cron was removed.
Missing optional Trigger configuration does not block baseline M4 acceptance of
the selected self-hosted path. Real-provider and recovery evidence still applies.

- Unknown provider submissions alert at 30 minutes and expire at the accepted recovery deadline.
- Outbox lag over five minutes indicates scheduling pressure; it does not authorize a second paid create.
- Schedule the independent production deadline scan at a positive interval no greater than 60 seconds; local verification and the current isolated Railway worker use 10 seconds.
- Alert when successful sweep completion is older than three minutes. Readiness now requires fresh successful dispatch, sweep, inbox and cleanup loops, with in-memory `loops.<name>.lastSuccessAt` and `busy`. Errors do not refresh success; durable external heartbeat monitoring and alert delivery remain unimplemented/unverified.
- Before restarting a worker, preserve accepted deadlines and let old ownership expire. Reclaim with a new owner/token/generation; reuse the 60-second lease and 20-second heartbeat rather than creating another execution authority.
- Metrics contain workspace/task/attempt correlation and status only. Never copy provider bodies, signed URLs, prompts or credentials into logs.

The only runnable real-provider runtime remains the acceptance-only worker: matching Railway project,
private Railway PostgreSQL, a single workspace allowlist and paid creates disabled
by default. Generic buyer production support and the M8 production entry are not
yet implemented or proved; no guard has been broadened.
Keep `allowCreate=false` during unapproved acceptance work, but remember that
polling, materialization and settlement can still affect existing objects. Do not
run global sweep/cleanup helpers to compensate for a missing scoped deployment.

After total database/runner outage, overdue settlement must precede resumed
dispatch. The worker drains up to 10 batches of at most 100 overdue tasks, with
a no-progress guard and an empty confirmation batch within that budget.
Incomplete recovery returns `recovery_pending` before an outbox claim or provider
call; later cycles retry until clearance is confirmed. The independent sweep
uses the same scoped drain. Follow [generation recovery](generation-recovery.md)
for scope checks, maintenance limitations and monitoring requirements. Never run
self-hosted and Trigger dispatchers concurrently for the same scope.

All remediation must call generation domain commands (`reconcileSubmissionUnknown`, `settleGenerationTask`, or the materialization command). Direct balance or task-row edits are prohibited.
