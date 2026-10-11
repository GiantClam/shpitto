# Follow-up review of M4 5.3 and M5 6.3/6.4

Status: **SUPERSEDED** by [next-tasks-review-5.3-6.3-6.4-final.json](next-tasks-review-5.3-6.3-6.4-final.json).

Decision: **FAIL_RESIDUAL_RECOVERY_GAP**.

The current source snapshot addresses the three earlier findings: payment aliases are looked up as exact tuples, workspace/customer hints are checked against an existing canonical order before locking, and a failed inbox row is reset and retried on redelivery. The focused fal and billing tests, typecheck, lint, format check, and production build all pass.

One recovery gap remains. In `src/modules/billing/inbox.ts:33-45`, the inbox row is committed as `received` before reconciliation. If the process crashes in that interval, a later verified delivery sees an existing non-`failed` row and returns `duplicate=true`; reconciliation is never retried. This conflicts with `SC-BIL-16`'s requirement that a retry converge after an incomplete transaction. Add a row lock and bounded retry/lease handling for stale `received` rows, then add a crash-after-receive probe.

The disposable PostgreSQL probe could not be rerun in the current environment because the configured role lacks `CREATEDB` (`42501`). Existing `green-probe.log` evidence predates the current fixes and does not cover this residual path. Full machine-readable details and candidate digests are in [next-tasks-review-5.3-6.3-6.4-followup.json](next-tasks-review-5.3-6.3-6.4-followup.json).
