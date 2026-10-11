# M6 recovery and administrative read review

Review date: 2026-10-04. Scope: local source review and local Docker PostgreSQL
evidence for the recovery inspection/replay and administrative list-read paths.

**PASS for this reviewed local scope.** No blocking defect remains in the
reviewed stored-webhook replay, bounded recovery projection, model-health sample,
or administrative read paths. This report does not approve the separate new
workspace-details module/API/UI, the complete integrated M6 gate, or live-account
behavior. Real provider/account, production email, and actual payout verification
remain deferred to the next stage.

## Reviewed source

- `src/modules/operations/recovery.ts`
- `src/modules/operations/queries.ts`
- `src/modules/operations/authorize.ts`
- `src/modules/operations/integration-health.ts`
- `src/modules/generation/provider-webhooks.ts`
- `src/modules/generation/lifecycle.ts`
- `src/modules/credits/queries.ts`
- `src/app/api/admin/recovery/[workspaceId]/route.ts`
- `src/app/api/admin/recovery/[workspaceId]/webhook-replay/route.ts`
- `scripts/probe-m6-recovery.ts`
- `scripts/probe-m6-admin-reads.ts`

## Recovery command boundaries

The replay command rechecks the live operator role, the same-session MFA stamp,
and recent step-up. It requires a purpose, expected workspace version, inbox UUID,
and durable idempotency key. The HTTP command route also checks same origin and
accepts only the purpose, inbox identity, and expected version as its body.

Replay locks the workspace, credit account, and correlated inbox/attempt/task.
Correlation includes provider, provider request identity, attempt nonce, workspace,
and task linkage. Caller-supplied provider observations cannot enter this route.
The stored inbox must contain a supported normalized status, matching request and
nonce, and valid authentication evidence. The original inbox admission obtains
that evidence from signature-verifying provider adapters before persisting its
safe payload.

The narrowed domain call uses the original stored provider event identity and
original task requester. Its domain idempotency keys remain the original webhook
or webhook-materialization identities. Command result, workspace version, audit,
recovery outbox, and domain changes commit or roll back together. Replay does not
call provider submission. Stored completion can resume an eligible active task
only into materialization; it does not fabricate an output or successful task.
Late observations against terminal tasks cannot reopen, rebill, or restore their
credits. The Docker probe verifies this and audit-failure rollback.

## Recovery read boundaries

Inspection requires current operator authorization and recent step-up, and writes
a reasoned tenant-access audit. Selected task IDs are deduplicated and capped at
100. Inbox, asset, and outbox correlations are also capped at 100 and constrained
to the selected workspace/tasks. Private asset object keys and raw provider
request identifiers are excluded.

Model-health rows explicitly identify `selected_workspace_tasks` as their evidence
scope and include the sample count. They are not account-wide provider-uptime
measurements. The mock model is labeled `local_fixture`; the four real models
remain `live_disabled`. Missing successful evidence remains unavailable, while
unknown age or more recent failure evidence can indicate degradation. Known
provider cost maps to the confirmed state without claiming a live billing check.

## Resolved projection defect

The previous projection associated refund/release rows through a shared credit
grant. Two tasks funded by that grant could therefore display the same refund,
including on a still-active reservation. A regression assertion reproduced the
incorrect non-null refund on the active task before the fix.

The repaired query joins the exact immutable allocation settlement identity
(`allocationId:failed` or `allocationId:cancelled`) and matching workspace/grant.
It returns the latest matching settlement per reservation. Attempts and outbox
history now select only the latest row per task/reservation, while command-result
SQL filters the selected task IDs before selecting the latest result per task.
The broad grant-history scan, allocation-to-grant maps, and nested projection
loops were removed. These changes bound returned intermediate rows; they do not
claim constant-cost database work or an added index.

This reviewer implemented that two-file query/probe repair, so its RED/GREEN run
is implementation evidence. The root reviewer separately inspected the repair
against the settlement ledger identities, including expired-credit compensation,
and approved it. The root final aggregate also reran the recovery regression
successfully after source freeze.

## Administrative reads

The latest effective user-status expression treats an authentication-level
disable as disabled, otherwise uses the access-control status, and defaults an
absent access-control row to active. The same expression drives both filtering
and returned status. Both disable sources are covered by the independent Docker
read probe.

The independent seven-group probe also verifies live role isolation, rejection
of workspace-owner-only access to global administration, bounded/redacted user
lists, workspace filtering and audited tenant access, support-role tenant-detail
denial, billing/generation snapshot exclusion, audit-payload exclusion, affiliate
pagination/status/version, unavailable/disabled provider labels, and immediate
operator role revocation. This checks the existing read surfaces; approval of the
new workspace-details implementation is recorded separately by its reviewer.

## Evidence

| Evidence | Result |
| --- | --- |
| `logs/recovery-projection-red.log` | Expected failure: an active task incorrectly inherits another reservation's refund from their shared grant |
| `logs/recovery-projection-green.log` | PASS: exact refund isolation, correlation, version/replay conflicts, single audit/outbox effects, settlement and audit rollback, terminal-credit preservation, stored completion into materialization, bounded/redacted inspection |
| `logs/admin-reads-independent.log` | PASS: seven independent administrative read scenario groups against local Docker PostgreSQL |

After the projection repair, TypeScript no-emit checking, source-boundary checking,
database-boundary checking, and formatting checks passed. The parent owns the
separate final aggregate results and integrated phase-completion decision.
