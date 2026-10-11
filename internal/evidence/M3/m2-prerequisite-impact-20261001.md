# M2 prerequisite impact at the final M3 candidate

Candidate source: `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`.

Historical M2 approval: `internal/evidence/acceptance/M2/working-tree-20260929-m2-repair/record.json`, stage PASS with independent review and integrator decisions. This remains historical approval of its own bytes. The M3 candidate changes shared application code; it does not claim byte-identical carry-forward of M2 runtime evidence.

Current regression attempt: `2026-10-01T02-12-59-069Z-0691f958-7be7-407a-a12b-e871950529a9`. All 53 recorded commands passed, including every mapped command below; candidate bytes remained stable and the disposable database was removed. Independent supplemental verification completed three runs each of ownership, credit reservation, duplicate command and generation replay contention: 12 passing probe executions in 12 fresh databases, with every database and scratch directory removed. The supplemental manifests record 28 passing setup, probe and digest commands. All six candidate digests remained unchanged. The whole-stage decision is recorded separately by the independent reviewer and integrator.

Supplemental proof: `internal/evidence/M3/final-independent-race-repetitions-20261001/final-summary.json`, its referenced command logs and reset-run manifests. Six explicit SQL observations identify the runtime as PostgreSQL 17.6 on x86_64-windows (msvc-19.44.35213, 64-bit). The first six runs predate that metadata query; their historical manifests are preserved without claiming a version query.

| Shared obligation | M3 impact | Required current regression evidence |
| --- | --- | --- |
| Active verified identity and onboarding | Explicit personal setup, durable semantic replay, server-selected local funding and private-page account gates | `probe-auth-lifecycle`, `probe-auth-http`, `probe-onboarding`, `probe-m2-foundation` |
| Tenant membership and owner authority | Current authorization before cached generation results and private page reads; team collaboration remains separate from personal ownership | `probe-workspaces`, `probe-invitations`, `probe-tenant-authorization`, `probe-access-states`, `probe-team-http`, `probe-api-isolation` |
| Durable command idempotency | Generation wrappers authorize before replay; normalized onboarding payloads conflict correctly; existing command transaction remains authoritative | `probe-command-contract`, `probe-generation-create`, three repeated creation/race probes and isolated HTTP regressions |
| Credit conservation and source lineage | Generation adds reserve/consume/release use; live deadline fencing can roll back terminal transitions without changing grant/ledger rules | `probe-credit-ledger`, `probe-credit-reservation`, `probe-credit-refund`, `probe-credit-migration-backfill`, `probe-generation-lifecycle`, `probe-generation-races` |
| Operator and hold semantics | Billing holds retain private read/replay access, generation admission remains guarded, disabled users lose access, worker recovery can settle previously admitted work | `probe-operator`, `probe-access-states`, `probe-team-http`, `probe-m3-recovery` |
| Schema and packaging compatibility | M3 adds generation/asset records to the migration chain; the final audit repairs add no schema migration or dependency | `isolated-db-migrate`, `frozen-lock-install`, `production-build`, current domain/HTTP probes |

Fresh local browser proof separately demonstrates onboarding, workspace isolation and a single grant/reservation consumed after application and worker restart. This complements the isolated production-build HTTP probes; it cannot replace monetary, revocation or migration tests.

The carry-forward decision is limited to M2 local foundation obligations exercised on the current M3 candidate. Production email, real provider/payment integrations and historical anomalous-balance recovery remain separately gated. The independent evidence reviewer accepted command results, canonical mandatory IDs, browser artifacts, current digest match and this impact argument in internal/evidence/M3/final-stage-review-20261001.json; the separate integrator decision is internal/evidence/acceptance/M3/working-tree-20261001-current/final-integration/decision.json.

## Explicit nested test-family evidence

The 73 mandatory entries aggregate 38 scenarios, 23 test families, five criteria and seven common standards. Nested subcases remain obligations within their parent families; they are not waived by the aggregate count.

| Subcase | Observed current evidence |
| --- | --- |
| `T05.a` personal/team ownership boundaries | `probe-workspaces` proves immutable personal ownership and ten-attempt team ownership serialization; `probe-team-http` covers owner authority, direct personal command denial and removed-member replay rejection. Final browser files `09`, `22`, `23` and `24` show the personal single-owner view, transferred roles, the final one-owner roster and revoked open-tab denial. |
| `T12.a` independent deadline sweep | `probe-generation-lifecycle` reports `swept: 1` and a correlated released reservation; `probe-m3-recovery` reports overdue-worker refund before dispatch, capped deadlines, rejected expired success and late-result quarantine with unchanged ledger. These exercise the independent sweep rather than relying on claim-time deadline checks alone. |
| `T12.b` fenced durable ownership | `probe-outbox-lease` reports stale-owner rejection, transaction fence, blocked reclaim during fence, heartbeat renewal and acknowledgement; `probe-asset-security` covers publication/settlement lock waits and current lease/deadline checks; three reset `generation-races` repetitions and `generation-replay` cover callback replay and fenced competing transitions. Real provider webhook inbox evidence remains M4 scope. |

The crash/restart probe's fixture teardown is not claimed as automatic orphan cleanup. Scheduled rowless-output cleanup and restart-safe scanning are proven by the separate `probe-assets`, `probe-asset-cleanup` and scheduling-unit evidence from the same final attempt.
