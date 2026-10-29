# M4 scenario reconciliation and current M3 applicability

Date: 2026-10-15. Role: independent, bounded evidence verifier. **This is not stage acceptance, a live-row decision, or integrator approval.** No tests were executed; no providers, deployments, credentials or existing business objects were accessed by this review. Repository source, retained sanitized evidence and policy were inspected; only this review file was authored. The executions below are recommendations to the integration owner, not executions performed here.

## 1. Candidate, authority and evidence vocabulary

- Workspace: `D:/github/shpitto`; branch `codex/restart-shpitto-m0`; observed HEAD `1fa6436`.
- Governing policy: `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/acceptance-gates.md`, sections 1, 2 and M3/M4; detailed requirements in `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md` and `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md`; original T catalog: `D:/github/shpitto/.omx/plans/test-spec-shpitto-restart.md`.
- Current development record: `D:/github/shpitto/internal/evidence/acceptance/M4/local-preflight-20261007/record.json`: `DEVELOPMENT_VERIFICATION`, `IN_PROGRESS`, four blocked criteria, 46 mandatory scenario entries not run, current M3 applicability stale, independent review and integration decision not run. A record-consistency check is not acceptance.
- **Concurrency caveat:** owner/executor edits were appearing during inspection, including Replicate account/protocol changes and recovery-heartbeat migration/tests. An independent read-only recomputation against the retained M4 digest inputs found source, schema and validator changed; configuration and contract matched at that observation. Later edits can change those too. HEAD alone is not the candidate. The fresh receipt below proves its captured fixture candidate, not every subsequently edited file. Freeze and recapture all six digests after integration; rerun affected checks. Do not promote the old receipt by merely replacing its hashes.
- Existing unrelated legacy template `.env.example` deletions were left untouched. No actual environment files were read. Environment example/configuration source is not account configuration.

Evidence aliases below resolve to these **exact absolute files**. A case reference means inspected evidence exists, not that its entire scenario is closed.

| Alias | Exact evidence |
| --- | --- |
| E | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/result.json` (2026-10-15T14:11:18.291Z; 203 unit/contracts, 16 PostgreSQL integration cases, 14 probe groups; fake provider transport; disposable PostgreSQL 15; cleanup recorded) |
| E.unit | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/contracts-and-units-spec.log` |
| E.pg | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/provider-worker-integration-spec.log` |
| E.create | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-generation-create-spec.log` |
| E.lifecycle | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-generation-lifecycle-spec.log` |
| E.races | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-generation-races-spec.log` |
| E.replay | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-generation-replay-spec.log` |
| E.recovery | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-m3-recovery-spec.log` |
| E.crash | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-m3-crash-restart-spec.log` |
| E.lease | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-outbox-lease-spec.log` |
| E.assets | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-assets-spec.log` |
| E.security | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-asset-security-spec.log` |
| E.cleanup | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-asset-cleanup-spec.log` |
| E.refund | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-credit-refund-spec.log` |
| E.ledger / E.reserve | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-credit-ledger-spec.log`; `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-credit-reservation-spec.log` |
| E.health | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/probe-provider-recovery-spec.log` |
| E.coverage | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/coverage.json` (1530/1848 branches, 82.7922%, 50 owned modules, no missing sources; crash-child LCOV not measured) |
| E.candidate / E.summary | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/m4-local-fixture-candidate-20261015.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/local-fixture-validation-20261015.json` |
| Q | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/verify-full-post-local-fixtures-20261015.json` and `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/verify-full-post-local-fixtures-20261015.log` (full local verify exit 0) |
| Q.root / Q.audit | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/root-baseline-review-20261015.md`; `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/production-dependency-audit-self-hosted-20261015.json` |
| L.storage | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/r2-live-adapter-20261015.json` (storage-only roundtrip/private-access/integrity evidence; not DB publication or settlement) |
| L.fal | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/fal-authorized-bootstrap-20261013.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/fal-runtime-recheck-20261015.json` (one scoped Fal T2V application outcome, seeded identity/funding; retained output recheck) |
| L.matrix | `D:/github/shpitto/internal/evidence/M4/provider-matrix.md`; `D:/github/shpitto/internal/evidence/M4/task-5.10/fal-real-run-summary.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/fal-private-lifecycle-r2.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/replicate-i2v-real-run.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/replicate-t2v-private-lifecycle-r2.json`; `D:/github/shpitto/internal/evidence/M4/task-5.10/replicate-i2v-private-lifecycle-r2.json` (historical provider/media/private-lifecycle pieces, not four current application outcomes) |
| H3 | `D:/github/shpitto/internal/evidence/M3/final-stage-review-20261001.md` and `D:/github/shpitto/internal/evidence/M3/final-stage-review-20261001.json` (approved historical frozen local profile only) |

## 2. Exact test-name index

The following aliases keep the scenario matrix readable. All unit/contract names below occur in E.unit; PG names occur in E.pg. Probe names are executable filenames and their JSON assertion keys are identified explicitly, rather than invented test titles.

| Alias | Source and exact existing names/assertions |
| --- | --- |
| INPUT | `D:/github/shpitto/tests/contracts/provider-inputs.test.ts`: `all four selected schemas are inspected, byte-bound, and disabled for live use`; `strict public DTO rejects every unapproved top-level and nested vendor field`; `schema or exact-version drift blocks new submission contracts without a silent fallback`; `safe preset is server-owned and all four mappings fit inspected schema fields`; `mapping rechecks crop consent instead of trusting a forged validated TypeScript object`; `crop consent binds exact authorized ready asset, workspace, dimensions and crop revision`; `accepted historical contracts map after current registry removal, while new admission is rejected`; `frozen snapshot retains quote, deadline, endpoint and digests independent of later object changes`; `completed-with-error is failure and provider output remains a candidate` |
| REP / FAL | `D:/github/shpitto/tests/contracts/replicate.test.ts`: `builds pinned I2V request with owned image and omits unsupported aspect_ratio`; `transport timeout is unknown and never retried or converted to rejection`; `status and result use exact persisted prediction ID and normalize errors/output`; `mismatched ID and malformed response are rejected before attachment`. `D:/github/shpitto/tests/contracts/fal.test.ts`: `builds fal T2V queue request with safe mapping and no retry`; `builds fal I2V request with authorized image and validates tracking origins`; `status and result require exact request ID and completed result video`; `same-origin tracking URLs for another request are rejected before polling/result transport`. Newly edited Replicate cases are NOT covered by the earlier E.unit receipt. |
| SIGN | `D:/github/shpitto/tests/contracts/provider-webhooks.test.ts`: `Replicate raw-body HMAC binds event, timestamp, exact request and attempt`; `fal modern webhook headers bind request ID, user ID, timestamp, and raw body`; `fal modern account identity comes only from the signed user header, not body account fields`; `fal body account identity cannot authorize a different signed user`; `fal authentication fails closed for missing configuration, non-fal references, invalid identities and malformed bounded bodies`; `fal modern canonical signing preserves the exact timestamp text and enforces the five-minute window`; `health and telemetry remain redacted and bounded`. `D:/github/shpitto/tests/contracts/replicate-webhook-boundaries.test.ts`: `Replicate verification fails closed before processing for missing authentication and foreign references`; `Replicate authenticated account and attempt metadata cannot substitute for the persisted binding` (owner is changing this protocol slice). |
| INBOX | `D:/github/shpitto/tests/contracts/provider-inbox-fencing.test.ts`: `authenticated inbox ingestion remains idempotent and rejects event-ID payload substitution`; transaction/fencing/rollback cases use simulated database transactions, not a replacement for PG cases below. |
| WORKER | `D:/github/shpitto/tests/contracts/provider-worker.test.ts`: `started submissions, unknown results, restarts and terminals never choose another create`; `provider HTTP transport is bounded, authenticated and performs no automatic retry`; `provider input capability binds private key scope, method, host and one-hour expiry`; `worker is paused by default and cannot scan an unassigned workspace` |
| PG.four | `D:/github/shpitto/tests/integration/provider-worker.test.ts`: four cases named `<modelKey> is submitted once, materialized privately and settles UNKNOWN cost`, for `replicate-wan22-t2v`, `replicate-wan22-i2v`, `fal-wan22-t2v`, `fal-wan22-i2v`. Real adapter classes, fake transport, **replacement materializer using fixture bytes**, not live runs or end-to-end remote materialization faults. |
| PG.failure / PG.unknown / PG.marker | Same PG source: `definitive provider failure releases the original reservation`; `unknown submission recovers for at most 24 probes without a second create`; `a persisted network-start marker blocks restart and stale lease re-submission` |
| PG.inbox / PG.adopt / PG.stale / PG.late | Same PG source: `authenticated inbox completion and polling have only one terminal ledger effect`; `verified callback recovers an accepted create whose request ID write was lost`; `actual PostgreSQL stale-lease callback processing rolls back inbox and task together`; `terminal inbox drain quarantines a late completion without reopening credits`. PG.inbox supplies a constructed verified observation twice; it does not send twenty signed HTTP callbacks. |
| PG.restore / PG.isolation | Same PG source: `self-hosted restart drains a multi-batch overdue backlog before any provider transport`; `paused or unadmitted worker has no effect on another workspace`. Restart here is repeated function execution, not a stopped/restarted provider-worker process. |
| STORAGE | `D:/github/shpitto/tests/contracts/storage.test.ts`: `local private object store preserves isolated opaque-key operations`; `one S3-compatible adapter maps put/get/head/list/delete for R2 or AWS endpoints`; `S3 missing-object variants normalize consistently without swallowing access or transport faults`; `S3 streamed bodies concatenate bounded chunks and reject overflow before allocating the whole result`. Fake S3 transport. |
| FETCH | `D:/github/shpitto/tests/contracts/provider-webhooks.test.ts`: `remote output fetch follows only bounded public HTTPS redirects and MIME limits`. `D:/github/shpitto/tests/contracts/provider-output-download.test.ts`: `provider output download deadline includes DNS and prevents a late request`; `provider output request deadline aborts the pending HTTP request`; `provider output stream deadline cancels the unfinished response body`; `provider output redirects share the original download deadline`; `provider output abort listener errors are normalized as a download timeout`. |
| ASSET | `D:/github/shpitto/tests/unit/assets-validation.test.ts`: `input image validation decodes a bounded PNG`; `input image validation rejects signature-only, spoofed, oversized and non-image inputs`. `D:/github/shpitto/tests/unit/assets-authorization.test.ts`: `asset download links bind the resource and expire at the 60-second boundary`. E.assets asserts `crossWorkspace`, `tokenExpiry`, `traversal`, `activeInputDeletion`, exact-24-hour cleanup and symlink denial. |
| RESTORE | `D:/github/shpitto/tests/unit/recovery-drain.test.ts`: `restoration drains more than one batch and confirms emptiness before progress`; `restoration defers dispatch on a nonprogressing or over-budget backlog`; `incomplete restoration returns recovery_pending before outbox claim or provider construction`. `D:/github/shpitto/tests/unit/worker-loops.test.ts`: `worker readiness requires independent recovery success, not just a fresh dispatcher`; `worker loops skip overlapping cycles and drain outstanding work on shutdown`; `failed TCP bind starts no dispatch or maintenance operation`. |
| RUNTIME | `D:/github/shpitto/tests/unit/task-runtime-env.test.ts`: `self-hosted task runtime is the default without ambient configuration or Trigger credentials`; `undeployed Trigger opt-in fails closed rather than accepting a dead dispatcher`; `default production configuration does not require or expose optional Trigger credentials`. Also `D:/github/shpitto/tests/unit/recovery-schedule.test.ts` for repeated independent sweep/stop. |

## 3. All mandatory M4 scenarios: evidence and smallest remaining closure

Inventory: **16 GEN + 15 PRV + 15 T = 46** registered rows. Nested T12.a/T12.b remain required. `F1`–`F5`, `R`, `H`, `B`, `L`, and `A` refer to closure work in sections 5–7. “Local support” is intentionally not a scenario verdict.

| Criterion | Existing support | Remaining mandatory closure |
| --- | --- | --- |
| M4-C01 | INPUT, PG.four, L.matrix, L.fal, L.storage | L: all four current account-backed outcomes, exact endpoint/version/schema/request/attempt/input/output digests, measured duration, credits, cost status and authorized owned download. Four output files alone are insufficient. |
| M4-C02 | SIGN, REP/FAL authenticated polling contracts, INBOX, PG.inbox/stale/adopt, FETCH | F1 signed route/replay/crash/account matrix; F2/F3 bounded output integrity; leader's final Replicate account/protocol evidence. |
| M4-C03 | WORKER, PG.unknown/marker/restore, RESTORE, RUNTIME, E.recovery/races/security | F4 submit 30s, unknown 24 probes/60m with alert 30m, queue 10m, known 60m, materialization 30m/eight attempts, overall 90m immutable budgets; R independent sweep/lease/process/monitoring/overdue-first restoration and explicit total-outage limitation. |
| M4-C04 | PG.stale/late, E.crash/security/cleanup, STORAGE/FETCH | F2 actual adapter/materialization storage/source-expiry faults and R at least one controlled selected-runtime process restart using fixtures or an already authorized request, not another paid create. |

| Scenario | Exact existing local support | Remaining closure / limit |
| --- | --- | --- |
| SC-GEN-05 | INPUT completed-with-error; REP/FAL status/result; E.lifecycle invalid output and `headerOnlyRejected` assertions | F2 real-adapter unavailable/error-output path through materialization/settlement, not queue status alone |
| SC-GEN-06 | PG.four; E.lifecycle materializing/success/ready assets; E.security publication lock cases | F2 removes replacement-materializer blind spot; L links owned output to each live task/reservation |
| SC-GEN-07 | REP timeout; WORKER no retry; PG.unknown/PG.marker; E.crash ambiguous-response | Three fresh reset repetitions of selected races; final owner protocol regression, no paid replay |
| SC-GEN-08 | PG.unknown; E.recovery bounded unknown; E.refund `exactSevenDayExpiry`, compensation lineage/no renewal; E.crash ambiguous-response | F4 deadline boundaries; retain source-aware allocation/UNKNOWN-cost outcome and audit for the same integrated fault task |
| SC-GEN-09 | RESTORE; E.recovery `overdueWorkerRefundBeforeDispatch`, `unrelatedOutboxUnclaimed`; PG.restore | R selected-process independent lost-job recovery/overdue-first proof; owner monitoring slice |
| SC-GEN-10 | E.races exact one terminal winner/one ledger effect, success-first/deadline-first; E.security post-lock deadline resampling | F4 before/at/after table and three independent resets; current cases are not a complete time-boundary table |
| SC-GEN-11 | E.crash reservation/dispatch stop/restart; INBOX; PG.inbox | F1 actual verified-inbox commit -> killed processor -> fresh process recovery |
| SC-GEN-12 | E.lease; PG.stale/PG.marker; E.security `stale materialization lease cannot spend retries or disrupt its successor` and lease-expiry lock waits | Repetition on final bytes; R stale acknowledgment at actual selected-process restart |
| SC-GEN-13 | PG.late; E.recovery `lateSuccessAfterRefund.ledgerUnchanged`; E.replay late reordered outcomes | F1 authenticated late signed observation after refund; no task reopen/debit/refund |
| SC-GEN-14 | INBOX payload substitution; E.replay `conflictingPayloadRejected`, quarantined permutations | F1 same signed event ID/conflicting body and ordered/reordered authenticated observations; authorized recovery command negative API proof in H/B |
| SC-GEN-15 | INPUT/ASSET; E.assets/E.security; FETCH bounded redirect/deadline support | F3 explicit private-DNS/redirect/credential/IPv6 and streamed limit negatives; F5 crop/UI; H current cross-tenant endpoint proof |
| SC-GEN-16 | E.crash object-upload; E.security publication deadline rollback; E.cleanup rowless/retry | F2 real materializer put/probe/DB/cleanup faults and restart; no premature success or duplicate ready asset |
| SC-GEN-17 | ASSET token 59,999/60,000 ms; E.assets; historical L private lifecycle; L.fal current owner/outsider checks | H/B current member removal -> no new URL/download, then boundary check; do not infer current browser revocation from storage-only proof |
| SC-GEN-18 | E.assets active-input denial/exact 24h cleanup; E.cleanup bounded 1000/cursor/retry; E.security input create/delete row locks | Three reset repetitions of input-reference races; current API and browser deletion authorization; F2 failed-object collection |
| SC-GEN-19 | E.lifecycle/E.recovery secret-free persisted projection; inspected dashboard labels and terminal polling guard | B unknown/materializing/failed/delivered navigation/reload and polling cessation; API projection is not browser evidence |
| SC-GEN-20 | E.health `unknown age degrades capability and telemetry stays secret-free`; E.recovery correlation; RESTORE | R durable heartbeat + externally delivered missing-sweep alert and domain-command recovery, including ledger mismatch; owner implementation, not this verifier |
| SC-PRV-01 | INPUT four schemas; PG.four; L.matrix historical media/private-lifecycle pieces; L.fal scoped outcome | L four current application rows with complete contract/identity/media/credit/download linkage; none is approved by this review |
| SC-PRV-02 | INPUT schema/version-drift and accepted historical contract tests | Rerun after owner protocol changes; bind retained schema bytes/digests and explicit blocked admission to final candidate |
| SC-PRV-03 | REP I2V omits aspect_ratio; INPUT crop binding; PG.four I2V fixture uses **16:9**, not user-visible 9:16 consent | F5: current 9:16 crop preview/confirmation + normalized owned-image digest + measured dimensions/duration. Inspected dashboard has no image/model/ratio/crop controls: a concrete interface gap, not just a missing screenshot |
| SC-PRV-04 | INPUT strict DTO/preset; REP server-owned resolver; E.create quote/admission protection | H current forged/foreign URL/vendor-field request rejected before reserve/submit; B relevant actionable denied/error state |
| SC-PRV-05 | REP/FAL normalization; PG.failure/PG.unknown/PG.four; INPUT completed-with-error | F2 integration through actual materializer; final protocol changes must be rerun, not covered retroactively |
| SC-PRV-06 | INPUT accepted-contract preservation/frozen snapshot; E.lifecycle persisted tracking URLs | Add one PG recovery case changing current registry/preset/quote after acceptance, asserting persisted endpoint/schema/input/price/deadlines remain authoritative (F4 extension) |
| SC-PRV-07 | SIGN; boundary contracts; PG.adopt exact identity/substitution guards | F1 route -> verified mapping -> inbox/PG negative matrix. Replicate account binding/protocol revision is owned elsewhere |
| SC-PRV-08 | INBOX; PG.inbox/PG.stale | F1 twenty authenticated HTTP replays/conflict/reorder plus actual crash after durable receipt. E.replay explicitly says authenticated inbox NOT_RUN |
| SC-PRV-09 | WORKER/PG.marker/PG.unknown; thin Trigger entrypoint fixture tests in E.pg; RUNTIME | Apply retry invariant to selected self-hosted process, R. Scenario's old Trigger wording does not restore a hosted-Trigger baseline requirement |
| SC-PRV-10 | PG.adopt; REP exact-ID tests; FAL foreign/mismatched tracking-ID tests | F1 route missing-ID adoption only under valid signed/account-bound evidence; similarity never grants ownership; final owner account-binding tests |
| SC-PRV-11 | FAL unavailable/result tests; E.recovery materialization limit/deadline; FETCH | F2 expired source after interrupted copy, authoritative refresh if supported or one failure/refund at immutable budget |
| SC-PRV-12 | Development record remains IN_PROGRESS; E.summary separates fixture/live/current-M3 limits | Preserve truthful missing-row/account/budget/UNKNOWN-cost reporting in final record; L cannot be replaced by fixtures |
| SC-PRV-13 | STORAGE local/single S3 adapter; L.storage R2; historical L.matrix private lifecycle | F2 compare identical media/object metadata/authorized download through local and fake S3-backed application publication. AWS live connectivity/buyer installation is later-profile work, not a demand for another paid account |
| SC-PRV-14 | E.security publication/lease rollback; E.cleanup orphan/retry; STORAGE missing/fault guards | F2 actual storage pipeline faults, partial/lost put response, failed delete, retry and no duplicate ready assets |
| SC-PRV-15 | FETCH five exact timeout/abort tests (DNS + request + stream + shared redirect deadline) | Rerun final bytes; F2 assert timeout also publishes no asset and reaches bounded recovery. Existing timeout unit proof is real and should not be relabeled missing |
| T01 | E.lifecycle/E.crash persistent Mock + local output; H3 historical browser | H+B new user/local no-cloud download/history/credit lineage and app/worker restart on current source |
| T02 | E.assets/E.security tenant boundaries; PG.isolation; INPUT foreign input guards | H current API isolation (including newly implemented admin/recovery routes); B denial/no URL/data leakage |
| T03 | E.security removed creator/foreign deletion denial; L.fal owner/outsider partial | H team HTTP removed-member replay; B same-session open-tab revocation/current download denial |
| T09 | E.replay 10 concurrent creates/cancels/settles, 20 domain observations/conflict/reorder; E.refund 20; INBOX/PG.inbox | F1 signed20; three independent resets of selected critical contention; no paid replays |
| T11 | REP timeout; PG.unknown/PG.marker; E.crash ambiguous-response | R stopped provider-worker/fresh process retains one create intent; F4 exact time budgets |
| T12 | E.crash actual SIGKILL and fresh recovery child at five local boundaries | F1 missing verified remote inbox boundary; R selected-process drill. E.crash remoteInbox NOT_APPLICABLE is local-profile-only |
| T13 | INPUT completed-with-error; REP/FAL result checks; E.lifecycle invalid/header-only output | F2 adapter failure/unavailable/invalid media -> no delivered status/consumption |
| T14 | E.recovery 30m/8 attempts/overallcap; E.crash upload boundary; E.cleanup | F2 copy/source-expiry fault matrix; F4 complete boundary table |
| T15 | PG.failure/PG.unknown; E.refund source-aware refund; L rows preserve UNKNOWN cost | F2 fail delivery with upstream-success fixture, assert exactly one full credit refund and separate upstream cost; not an invoice proof requirement |
| T19 | PG.late; E.replay late permutations; INBOX conflict guards | F1 authenticated late/conflicting route replay and authorized recovery-command terminal guards |
| T20 | E.lifecycle unknown/materializing/invalid completion; PG.unknown; E.recovery | B persisted recovery state vs runner timeout; R operational evidence |
| T22 | SIGN; INBOX; PG.inbox | F1 actual signed HTTP20/conflict/reorder + zero effects for forged/stale/wrong-account; payment-webhook profile remains M5 |
| T48 | Q build/config/root; RUNTIME; L.storage | M4 subset: selected worker/runtime/private-storage configuration, restart/restore and production rejection of demo drivers. Full managed + Docker clean buyer-installation/release profiles remain M8, not a new M4 full-release requirement |
| T49 | E.recovery correlation/UNKNOWN/late quarantine; E.health; E.refund mismatch hold | R external stale-heartbeat/unknown/outbox/mismatch alert and authorized recovery UI/API; B actionability/redaction |
| T53 | PG.unknown; E.crash ambiguous response; E.refund expired-subscription compensation/no-renewal; PG.late | F1/F2/F4 join unknown exhaustion, expired allocation refund, late signed success and unchanged financial outcome for same task; exact audit/cost linkage |

Nested obligations: **T12.a** has RESTORE/E.recovery/PG.restore local support but still needs R actual independently scheduled selected-runtime proof. **T12.b** has E.lease, PG.stale and E.security real PG fencing support; retain exact owner/token/generation comparisons in the final process drill. Optional Trigger fixture coverage remains useful regression coverage; executable Trigger registration/deployment is required only before opting into it.

## 4. Nine common standards, not just the record's two aggregate rows

| Standard | Existing exact evidence | Remaining work |
| --- | --- | --- |
| Scope: 100% mandatory | Development record lists 46; this matrix includes all 46 plus T12.a/b | A replace broad summaries with per-ID/profile results; tasks 5.1–5.9 and current M3 prerequisite must be resolved; missing/blocked/flaky cases cannot be waived |
| Build/checks | Q exit0; Q.root independent baseline review; E.unit root/candidate tests; frozen-lock evidence referenced by Q.root | Freeze owner edits; fresh isolated frozen-lock install/build/typecheck/lint/import/format/config/root checks, preserve warning inventory. Existing Docs tracing warnings are limitations, not an automatic failure or permission to omit checks |
| Coverage >=80% | E.coverage 82.7922%, 50/50 delivered owned M4 modules | Recompute after new monitoring/account modules. Add current M3 delivered-core denominator/equivalence; M4 scope omits24 historical M3 modules. Do not sum percentages or count unmeasured crash children |
| Defects | `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-runtime-review-20261015.md`; `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/self-hosted-runtime-security-review-20261015.md`; Q.root resolved findings | Whole-stage independent P0/P1/mandatory-condition triage, including F5; any allowed P2/P3 needs scope impact/owner/due date, never a waiver of mandatory behavior |
| Isolation/security | INPUT/SIGN/FETCH/ASSET; PG.isolation/PG.stale; E.assets/E.security; L.fal limited HTTP | H current auth/origin/idempotency/tenant/admin recovery negatives; F1/F3; B live-session revocation and no secret/signed-location disclosure |
| Financial/task integrity | PG.four/failure/unknown/inbox/late; E.reserve/E.ledger/E.refund/E.races/E.replay | R+F1/F2 joined DB state, ledger/allocations/audit/outbox/inbox/attempt counts, unrelated-record snapshots; three-reset races and ten-way contention where applicable |
| UI completeness | H3 historical 11 journeys/8UI groups; inspected current dashboard/team/transfer/billing/admin code | B current 1440x900/390x844 CSS viewports + keyboard; success/loading/empty/error/denied per applicable implemented route, F5 crop; historic screenshots are not current-byte proof |
| Exact sanitized evidence | E.candidate/E.summary/E logs; Q; L scoped receipts | A immutable candidate+dirty patch/source/schema/config/contract/validator/lock, versions, seed, clock/limits, command/log/assertion refs, failed repetitions, owner-vs-upstream attribution; preserve history |
| Recovery | E.crash 5 local boundaries; E.cleanup; RESTORE/PG.restore | F1 remote inbox crash, F2 real pipeline faults, R actual self-hosted process restart/independent monitoring/overdue-first restoration; total-outage limitation disclosed |

Repeatability is separate from coverage: E.races has one local execution; E.replay20 is **normalized Mock/domain** callback replay, not signature/inbox replay. E.pg callback duplicate count is two. Repeated function calls are not process crashes. A passing aggregate must not silently substitute one of these for another.

## 5. Smallest missing tests / executions (share fixtures; do not duplicate owner work)

These are recommended additions, **not existing tests**. Extend existing suites where possible. Names below are proposed exact test names so the final evidence mapping is unambiguous.

1. **F1 — One signed-callback PostgreSQL fixture, parameterized over both providers.** Extend `D:/github/shpitto/tests/integration/provider-worker.test.ts` (or one isolated HTTP integration suite) with:
   - `signed callback route twenty-replay conflict and reorder preserve one terminal effect`: generate fake HMAC/Ed25519 keys; POST through the real route, not a hand-constructed verified object; twenty duplicates, same event ID/conflicting body, running/completed/failed reordered permutations, polling race, late success after refund; assert inbox/result/ledger/audit/outbox/asset counts and unrelated records. Invalid signature, timestamp, account, nonce, request/task/workspace mapping must have zero trusted/financial effects.
   - `verified inbox receipt survives process stop before processing`: handshake after committed receipt/HTTP acknowledgment, terminate processor, recover in a fresh child; same final counts, no second create. Extend `D:/github/shpitto/scripts/probe-m3-crash-restart.ts` remote profile rather than pretending its local NOT_APPLICABLE boundary covers it.
   - Run selected callback/poll terminal race three independently reset times. This closes GEN11/13/14, PRV07/08/10, T09/12/19/22 and much of T53 together. Consume the leader's final Replicate binding/protocol, do not independently redesign it.
2. **F2 — One real-materializer fault suite, real PG, fake provider/DNS/HTTP/store.** Proposed source `D:/github/shpitto/tests/integration/provider-materialization-faults.test.ts`; proposed table test `real adapter materialization faults never publish or settle prematurely`. Keep actual provider adapter normalization, `D:/github/shpitto/src/trigger/materialize.ts`, `D:/github/shpitto/src/modules/assets/ingest.ts` and domain settlement; do not replace materialization with direct bytes as PG.four currently does. Inject failures at remote download/expired URL, put (including committed put/lost response), media probe, DB publication, cleanup delete. Retry only authoritative result/output work, then exhaust 30m/eight attempts/overall cap; assert no premature ready/delivered row, one eventual output/consume OR one source-aware refund, orphan retention/collection and no duplicate create. Parameterize local and S3-compatible adapter transport with identical media and metadata. No external storage/network is needed. If a deterministic DNS seam is needed in the wrapper, have the owner add a narrowly scoped dependency injection; never disable origin checks for a test.
3. **F3 — Extend FETCH, not another downloader implementation.** In `D:/github/shpitto/tests/contracts/provider-output-download.test.ts`, add `provider output origin and stream limits reject unsafe candidates before publication`: HTTPS URL credentials; DNS private/link-local/loopback/IPv6 and mixed public/private answers; public redirect to private DNS/IP; every redirect revalidated; redirect exhaustion/missing location; unsupported MIME, declared and streamed >250 MiB. Current inspected FETCH security case covers a public redirect and HTTP loopback rejection, **not** this full matrix. Existing120-second DNS/request/stream timeout tests should be retained. F2 supplies no-publication/recovery integration assertions. Extend ASSET only for missing excessive-decoded-dimension/valid JPEG/WebP cases if the final suite still lacks them; PNG spoof/byte-limit tests already exist.
4. **F4 — Extend current PG recovery/race tests with one controlled-clock table.** Proposed name `accepted recovery budgets hold immediately before at and after every boundary`. Use persisted production configuration and assert queue 10m, submit 30s, unknown 60m/24 probes/alert 30m, known 60m, materialization 30m/8 attempts and overall 90m; demonstrate retry cannot reset budgets. Include 7/8/9 attempt and 23/24/25 probe fences, 60-second lease expiry and persisted20-second heartbeat where applicable. Existing E.recovery tests exact materialization expiry and cap, E.security proves post-lock resampling, ASSET proves 59,999/60,000ms token expiry, E.assets proves 24h cleanup: reuse those assertions; add only absent before/at/after entries. Add one accepted-contract-after-registry-change PG recovery subcase (PRV06). Label accelerated clocks, not actual hour-long service trials.
5. **F5 — User-visible 9:16 I2V crop evidence.** This is currently an implementation/applicability gap in the inspected app interface, not something another DTO assertion alone fixes. `D:/github/shpitto/src/app/(app)/dashboard/generation-panel.tsx` renders a Mock prompt/quote only; searching current app/components found no crop/aspect-ratio/I2V controls. INPUT binds a supplied consent object; it does not show or obtain user consent. Integration owner must supply the required supported crop-preview/confirmation interface or an explicitly accepted equivalent contract, then one browser+adapter request fixture verifies 9:16 normalized owned image, same crop digest/revision, rejection of stale/foreign consent, omission of unsupported Replicate aspect_ratio, and measured delivered dimensions/duration. No extra paid run is needed for local consent/negative proof. Live measurement can reuse an authorized appropriate output, with honest provenance.

**R/L ownership, deliberately not duplicated:** leader/other executor owns durable heartbeat, external missing-sweep alert, selected provider-worker process readiness/shutdown/restart, Replicate binding/protocol, provider acceptance probe and remaining live application rows. Their new tests and migration were present as in-progress files, not in E's executed manifest. Integrate their exact receipts after final freeze. L requires all four correlated live rows; UNKNOWN provider cost is permitted. Newly authorized real calls without an explicit spend ceiling do not by themselves document the gate's bounded-spend plan; the leader must record its actual safe authorization/limits. This verifier makes no calls or budget assumption.

## 6. Current M3 C01–C06: evidence impact, not blanket carry-forward

Historical anchor H3 accepted source digest `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`, five criteria, 38 SC/23 T, 38 owned modules, 993/1166 branches (85.16295%), 53 main commands, 11 browser journeys, 8 UI groups, and 12 fresh-database supplemental repetitions. Historical attempt footprints:

`D:/github/shpitto/internal/evidence/acceptance/M3/working-tree-20261001-current/verification-attempts/2026-10-01T02-12-59-069Z-0691f958-7be7-407a-a12b-e871950529a9/candidate-after/digest-footprints.json`

Owned manifest:

`D:/github/shpitto/internal/evidence/acceptance/M3/working-tree-20261001-current/verification-attempts/2026-10-01T02-12-59-069Z-0691f958-7be7-407a-a12b-e871950529a9/owned-modules.json`

Read-only SHA-256 comparison during this review: 201 historical source entries = 130 identical/71 changed/0 missing; 32 schema entries = 26 identical/6 changed; 12 configuration entries = 4 identical/8 changed. **Of 38 historical owned modules, 21 are byte-identical and 17 changed**. These counts exclude newly added files and are an inspection snapshot, not a freeze of concurrent edits.

Changed owned modules (full paths):

- `D:/github/shpitto/src/adapters/storage/local.ts`; `D:/github/shpitto/src/config/models.ts`; `D:/github/shpitto/src/lib/auth.ts`.
- `D:/github/shpitto/src/modules/assets/authorize.ts`; `D:/github/shpitto/src/modules/assets/cleanup.ts`; `D:/github/shpitto/src/modules/assets/ingest.ts`; `D:/github/shpitto/src/modules/assets/media-probe.ts`; `D:/github/shpitto/src/modules/assets/upload.ts`; `D:/github/shpitto/src/modules/assets/validate-input.ts`.
- `D:/github/shpitto/src/modules/credits/queries.ts`; `D:/github/shpitto/src/modules/generation/create.ts`; `D:/github/shpitto/src/modules/generation/lifecycle.ts`; `D:/github/shpitto/src/modules/generation/sweep-recovery.ts`.
- `D:/github/shpitto/src/modules/operations/authorize.ts`; `D:/github/shpitto/src/modules/operations/status-commands.ts`; `D:/github/shpitto/src/modules/workspaces/commands.ts`; `D:/github/shpitto/src/modules/workspaces/onboard.ts`.

Unchanged helper bytes include mail adapters, shared command/transaction contracts, credit allocation/expiry/grant/reserve/settle, workspace access/authorize/invitation/policy, Mock/outbox/state. Their callers, schema, auth integration, model admission, dependencies and runtime profile changed, so unchanged helper hashes alone do not establish end-to-end equivalence. Historical migration journal/auth/billing/generation/index/operator schemas changed; migrations 0016–0026 are new since H3 and 0027 was being added. Additional current provider/storage/billing/admin routes and domains must be included or explicitly scoped by impact, not omitted because absent from H3.

| Current criterion | Inspected impact and existing support | Minimum current closure |
| --- | --- | --- |
| M3-C01 | Changed auth/onboarding/quote/admission/storage/dashboard/download routes and dependency/config footprints. `D:/github/shpitto/src/lib/auth.ts` now includes disabled-account checks, transactional auth adapter and operator 2FA hooks. E.lifecycle/E.crash prove selected current Mock/domain transitions, not a new sign-in/download/browser journey | H auth HTTP + API isolation; B fresh no-cloud user/server quote/Mock/history/lineage/playback/download and app/worker restart; current exact IDs/digests |
| M3-C02 | Workspace commands/onboarding/auth changed; transfer/team client components were inspected. Unchanged invitation/policy helpers still depend on changed integration. `D:/github/shpitto/scripts/probe-team-http.ts` creates/invites/accepts/removes and checks current-session suspended/held/disabled/unverified page privacy and removed-member command replay; it does **not** execute successful HTTP owner transfer | H team HTTP + workspace/invitation/access-state/tenant-authorization probes; B actual owner-transfer 200, changed roles/last-owner and removed-open-tab denial, switching and personal immutability. Add one HTTP transfer positive regression only if browser network assertions do not already provide it |
| M3-C03 | Lifecycle/create/model/input changes; E.races/E.replay real PG support one terminal effect,10-way duplicate commands and20domain observations; E.lifecycle rejects malformed/header-only media | Three independent-reset current repetitions of generation-races and generation-replay; changed-source regressions/F2; preserve conflicting/reordered/financial DB assertions |
| M3-C04 | Sweep/deadline/materializer changes plus selected self-hosted recovery additions. E.crash uses real stopped/fresh children at reservation, dispatch claim, ambiguous response, object upload and success-before-ack; remote inbox explicitly not applicable only for that Mock fixture | Retain/reexecute five local crash boundaries after final changes; F4 controlled boundaries; R selected process/independent sweep; F1 required for the current implemented remote inbox. Local evidence may be carried only after dependency impact is recorded |
| M3-C05 | Local/storage/media/input/download changes; current candidate implements remote fetching, so policy now requires deterministic SSRF/DNS/redirect fixtures even for M3 applicability. ASSET/E.assets/E.security/E.cleanup/FETCH provide partial current support | H current private download and all implemented tenant endpoints; F3 missing security negatives; F2 media/publication faults; B no public API-key product claims. Do not reuse historical no-remote-fetch deferral |
| M3-C06 | **New criterion absent from H3 and the old five-criterion verifier/register.** `D:/github/shpitto/scripts/demo-seed.ts` seeds owner/member/team/invitation only; it does not seed completed videos, fixture checkout or authorized operator/2FA state. Current fixture billing/admin/demo components have implemented local routes requiring review | B seeded team/invitation/member/transfer, local fixture billing checkout/portal/reconciliation, operator/admin read/recovery and all applicable local route states/viewports/keyboard. Seed dedicated fake operator authorization/2FA through supported local fixtures; do not weaken guards or promote a team owner to global admin by assumption. Real rows stay pending |

Historical October6 refresh/demo records are not current equivalence approval. M3 scenario sources must be reconciled too: H3 contains CRD03/04/07–16, GEN01–20, IAM03–08 and T01/02/03/05–20/49/53/60/61. Current task/trace sources additionally mention release-profile cases such as SC-REL-14/15: explicitly map the local subset versus deferred release profiles; never silently import an entire later-stage release gate.

**Coverage decision:** E.coverage is M4-scoped, not current M3 coverage. Freeze an explicit delivered-core manifest for M3 impact (at least the historical 38 plus relevant new delivered modules and reviewed exclusions). `D:/github/shpitto/scripts/m3-evidence.mjs` currently defaults to *all* modules/adapters, including later-stage domains; do not silently use that expanding default or omit new M3-impact behavior. Merge only same-candidate LCOV at the reviewed denominator; record unchanged-case equivalence separately. E's denominator lacks 24 historical M3 owned modules.

## 7. Minimum verification execution set and safe local recipes

### 7.1 Owner execution order

1. **Freeze final source/schema/config/contract/validator/lock + test manifest.** Resolve policy/index drift listed below; no receipt is current across a changed digest without impact/rerun. Retain all failed attempts.
2. **One full local M4 fixture run** on final bytes, using the existing allowlisted disposable harness. Add the owner monitoring/account suites and F1–F4 suites to the reviewed manifest explicitly; the retained runner reads the23-file manifest and adds six known files, so newly created test filenames are not discovered automatically:

   ```powershell
   Set-Location D:\github\shpitto
   node internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/verify-m4-local-20261015.mjs
   ```

   This writes a fresh timestamped attempt below `D:/github/shpitto/.tmp/m4-local-verification-20261015`, owns a new localhost:55432 PostgreSQL container/database, blanks real provider keys, disables descendant env-file loading, and removes its own container/assets. Do not run against an occupied port or shared DB. The sidecar did not execute it.
3. **Minimum M3 domain delta executions:** under the isolated fake profile below, run once each `probe-auth-lifecycle`, `probe-onboarding`, `probe-invitations`, `probe-tenant-authorization`, `probe-access-states`, `probe-credit-migration-backfill`, `probe-operator`; reuse same-candidate E generation/asset/ledger/refund results instead of rerunning them merely to get an M3 label. Add only missing owned-module coverage checks after the scoped LCOV merge. Operator/admin added routes need their scoped existing M6 authorization/read/recovery probes as applicable, without claiming M6 acceptance.
4. **Critical race protocol:** three independently reset PG repetitions each of existing `probe-workspaces`, `probe-credit-reservation`, `probe-command-contract`, `probe-generation-replay`, `probe-generation-races`, `probe-asset-security` = 18 family executions. Each run must have before/after fixture counts and recorded interleavings; a fresh database per family/run is the simplest audit trail. Existing workspaces/reservation/command/replay probes already supply 10-way applicable contention. Add three reset signed callback/poll terminal-race fixture executions (F1), each can parameterize both providers. This is the selected minimum for the identified affected race families, not permission to skip new critical races introduced by owner changes. An already valid same-candidate independent-reset run can count toward the three; today’s historical/changed-candidate runs cannot automatically count.
5. **H: three HTTP probe executions once**, isolated candidate app + fake PG + Mailpit: auth-http, team-http, api-isolation. Browser network evidence may close owner-transfer positive API proof without a separate fourth script. Do not run unmodified `D:/github/shpitto/scripts/verify-m3.mjs` in the shared checkout: it directly reads `.env`/`.env.local`, writes historical/default records, reuses old browser paths and knows only C01–C05. Its repeat loop also does not establish separate reset databases by itself.
6. **B: one current browser campaign** with two isolated browser accounts/profiles; all 11 historical journey IDs plus C06 route-state inventory,1440x900 and 390x844 CSS viewports, keyboard and F5. Record actual requests/DOM/media/DB IDs, not labels alone. R can share B's local restart but must additionally exercise selected provider-worker process boundaries. R/L remain the integration owners' evidence; no deliberate extra paid generation for replay/fault/crash counts.
7. **One frozen-lock/check/build run**, scoped current coverage merger, then A independent whole-stage review. The retained full-verification wrapper overwrites its named receipt/log: do not execute it unchanged if preserving evidence. Use a new output attempt in an isolated candidate. `pnpm verify` does not by itself discover all new tests or prove frozen-lock installation, browser behavior, race reset protocol or live outputs.

### 7.2 Safe isolated H/B commands (recipe, not executed here)

These commands are for the **leader**, who owns fixture writes. Preconditions: freeze/commit the integrated candidate first; Node24/pnpm12, ffmpeg/ffprobe and required images/dependencies are already available/cached; ports 3199/56329/58029 are free. Never attach to an existing local/deployed application. No provider credential is copied. A source archive excludes private state and env files; all children receive a cleared, allowlisted environment. This local development-server recipe is not production-runtime/deployment evidence.

```powershell
$ErrorActionPreference = 'Stop'
$repo = 'D:\github\shpitto'
$id = [guid]::NewGuid().ToString('N')
$scratch = Join-Path ([IO.Path]::GetTempPath()) "shpitto-verifier-$id"
$null = New-Item -ItemType Directory -Path $scratch
$dbName = "verifier_$id"; $pg = "verifier-pg-$id"; $mail = "verifier-mail-$id"
$password = "fixture-$id"  # generated fixture only
$node = (Get-Command node.exe).Source
$pwsh = (Get-Command pwsh.exe).Source
$docker = (Get-Command docker.exe).Source
$platform = @{}
foreach ($key in @('PATH','PATHEXT','COMSPEC','SYSTEMROOT','WINDIR','SYSTEMDRIVE',
 'TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA',
 'PROGRAMFILES','PROGRAMFILES(X86)')) {
  $value = [Environment]::GetEnvironmentVariable($key)
  if ($null -ne $value) { $platform[$key] = $value }
}
$fake = $platform.Clone()
$fake.NODE_ENV='development'; $fake.SHPTITTO_RUNTIME_PROFILE='local'
$fake.TASK_RUNTIME='self_hosted'; $fake.GENERATION_DRIVER='mock'
$fake.STORAGE_DRIVER='local'; $fake.MAIL_DRIVER='local'
$fake.APP_URL='http://127.0.0.1:3199'
$fake.DATABASE_URL="postgres://postgres:${password}@127.0.0.1:56329/$dbName"
$fake.POSTGRES_PASSWORD=$password; $fake.POSTGRES_DB=$dbName
$fake.BETTER_AUTH_SECRET="fixture-auth-$id-$id"
$fake.ASSET_ROOT=Join-Path $scratch '.data/assets'
$fake.MAIL_HTTP_URL='http://127.0.0.1:58029'
$fake.MAIL_SMTP_URL='smtp://127.0.0.1:1' # unused by local HTTP mail adapter
$fake.NEXT_TELEMETRY_DISABLED='1'; $fake.COREPACK_ENABLE_NETWORK='0'
$fake.NPM_CONFIG_USERCONFIG=Join-Path $scratch 'absent-user-npmrc'
$fake.NPM_CONFIG_GLOBALCONFIG=Join-Path $scratch 'absent-global-npmrc'
# No ambient NODE_OPTIONS/provider/payment/cloud credentials survive Environment.Clear().
function Run-Fake([string]$exe, [string[]]$argv, [switch]$Background) {
  $s = [Diagnostics.ProcessStartInfo]::new($exe)
  $s.WorkingDirectory=$scratch; $s.UseShellExecute=$false; $s.CreateNoWindow=$true
  $s.Environment.Clear()
  foreach ($key in $fake.Keys) { $s.Environment[$key]=[string]$fake[$key] }
  foreach ($arg in $argv) { $s.ArgumentList.Add($arg) }
  $s.RedirectStandardOutput=$true; $s.RedirectStandardError=$true
  $p=[Diagnostics.Process]::Start($s)
  $o=$p.StandardOutput.ReadToEndAsync(); $e=$p.StandardError.ReadToEndAsync()
  $handle=[pscustomobject]@{Process=$p; Out=$o; Err=$e}
  if ($Background) { return $handle }
  $p.WaitForExit()
  $log=($o.Result + $e.Result).Replace($password,'[fixture]').Replace($fake.BETTER_AUTH_SECRET,'[fixture]')
  $name="command-$([guid]::NewGuid().ToString('N')).log"
  [IO.File]::WriteAllText((Join-Path $scratch $name),$log,[Text.UTF8Encoding]::new($false))
  Write-Host "$name exit=$($p.ExitCode)"
  if ($p.ExitCode -ne 0) { throw "Fixture command failed: $name" }
}
# Source-only archive: freeze HEAD first; this intentionally does not include owner dirty edits.
$paths=@('src','scripts','tests','content','skills','tooling','internal/contracts/providers',
 'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','next.config.ts','tsconfig.json')
$listed = & git -C $repo ls-files -- @paths
if ($LASTEXITCODE -ne 0 -or ($listed | Where-Object { (Split-Path $_ -Leaf) -match '^\.env(?:\.|$)' })) {
  throw 'Refuse an archive containing environment files; provide a reviewed env-free source snapshot.'
}
& git -C $repo archive --format=tar "--output=$scratch/candidate.tar" HEAD -- @paths
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
& tar -xf "$scratch/candidate.tar" -C $scratch
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
Run-Fake $pwsh @('-NoProfile','-Command','corepack pnpm install --frozen-lockfile --offline --ignore-scripts; exit $LASTEXITCODE')
# Some older probes contain a localhost:55432 fallback. Fence pg before any probe runs.
# This guard also propagates to Node descendants and blocks explicit loadEnvFile calls.
$guard=Join-Path $scratch 'fixture-guard.mjs'
[IO.File]::WriteAllText($guard, @'
import process from 'node:process';
import {syncBuiltinESMExports} from 'node:module';
import pg from 'pg';
process.loadEnvFile=()=>undefined;
syncBuiltinESMExports();
const connect=pg.Client.prototype.connect;
pg.Client.prototype.connect=function(...args) {
  const p=this.connectionParameters;
  if(p.host!=='127.0.0.1' || Number(p.port)!==56329)
    throw new Error('Fixture PG target escaped the owned loopback container');
  return connect.apply(this,args);
};
'@, [Text.UTF8Encoding]::new($false))
$fake.NODE_OPTIONS='--import="'+([uri]$guard).AbsoluteUri+'"'
Run-Fake $docker @('image','inspect','postgres:15-alpine')
Run-Fake $docker @('image','inspect','axllent/mailpit:v1.21.8')
Run-Fake $docker @('run','--rm','-d','--name',$pg,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB',
 '-p','127.0.0.1:56329:5432','postgres:15-alpine')
Run-Fake $docker @('run','--rm','-d','--name',$mail,'-p','127.0.0.1:58029:8025','axllent/mailpit:v1.21.8')
# Wait for this owned PG container's readiness; do not fall back to a host database.
$ready=$false
for($i=0;$i -lt 30;$i++) {
  try { Run-Fake $docker @('exec',$pg,'pg_isready','-U','postgres'); $ready=$true; break }
  catch { Start-Sleep -Milliseconds 500 }
}
if(-not $ready) { throw 'Owned fixture PostgreSQL did not become ready' }
Run-Fake $node @('--experimental-strip-types','scripts/migrate.ts')
$next=Join-Path $scratch 'node_modules/next/dist/bin/next'
$web=Run-Fake $node @($next,'dev','--hostname','127.0.0.1','--port','3199') -Background
# Bounded readiness checks against only the exact owned loopback listeners.
Run-Fake $node @('--input-type=module','-e', @'
for (const url of ['http://127.0.0.1:3199/login','http://127.0.0.1:58029/api/v1/search']) {
  const until=Date.now()+120000; let ready=false;
  while(Date.now()<until) {
    try { const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(1000)});
      if(r.status===200) {ready=true; break;} } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready) throw new Error('Owned fixture HTTP readiness timed out');
}
'@)
Run-Fake $node @('--experimental-strip-types','scripts/probe-auth-http.ts')
Run-Fake $node @('--experimental-strip-types','scripts/probe-team-http.ts')
Run-Fake $node @('--experimental-strip-types','scripts/probe-api-isolation.ts')
# Only after destructive HTTP fixture probes finish, seed the browser fixture and start Mock worker.
Run-Fake $node @('--experimental-strip-types','scripts/demo-seed.ts')
$worker=Run-Fake $node @('--experimental-strip-types','scripts/local-worker.ts') -Background
```

Use the generated fixture accounts only (the seed's public demo identities/passwords, not existing accounts). Do not import a normal signed-in browser profile. An explicit interactive browser launch on Windows, if Edge is installed:

```powershell
$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
if(-not (Test-Path -LiteralPath $edge)) { throw 'Use an installed browser with a fresh scratch profile' }
Start-Process -FilePath $edge -ArgumentList @(('--user-data-dir="'+(Join-Path $scratch 'browser-owner')+'"'),'--no-first-run','http://127.0.0.1:3199/login')
Start-Process -FilePath $edge -ArgumentList @(('--user-data-dir="'+(Join-Path $scratch 'browser-member')+'"'),'--no-first-run','http://127.0.0.1:3199/login')
```

Set **CSS viewport**, not merely outer window size, using browser device emulation to 1440x900 and 390x844; retain `window.innerWidth/innerHeight`, browser version, screenshots and keyboard observations. Use local network throttling/request blocking for loading/error states without disabling authorization. Owner must add appropriately labeled disposable task-state/operator fixtures for unknown/materializing/failed/denied/2FA/admin coverage; the seed alone does not create them. Synthetic task rows cannot substitute for successful validated generation/media.

Keep receipts and sanitized logs, then stop **only** owned handles/containers; put teardown in a `finally` block in any automated harness. For the manual session:

```powershell
foreach($h in @($worker,$web)) {
  if($h -and -not $h.Process.HasExited) { $h.Process.Kill($true); $h.Process.WaitForExit() }
}
Run-Fake $docker @('stop',$mail)
Run-Fake $docker @('stop',$pg)
# Keep scratch logs for review. Never recursively delete a computed path without containment checks.
```

Before browser seeding/worker startup, the exact delta executions are:

```powershell
function Run-CoveredProbe([string]$name,[string]$label) {
  Run-Fake $node @('--experimental-strip-types','--experimental-test-coverage',
   '--test-concurrency=1','--test-coverage-include','src/modules/**',
   '--test-coverage-include','src/adapters/**','--test-coverage-include','src/config/models.ts',
   '--test-coverage-include','src/contracts/http.ts','--test-coverage-include','src/lib/auth.ts',
   '--test-reporter=spec',"--test-reporter-destination=$scratch/$label-spec.log",
   '--test-reporter=lcov',"--test-reporter-destination=$scratch/$label.lcov",
   '--test',"scripts/probe-$name.ts")
}
foreach($name in @('auth-lifecycle','onboarding','invitations','tenant-authorization',
 'access-states','credit-migration-backfill','operator')) {
  Run-CoveredProbe $name "delta-$name"
}
```

For repetition, create a **new owned database/profile per run**, migrate, execute one race family, snapshot/assert cleanup, and destroy that database. The following exact executions cover the six identified existing families; add the F1 signed-callback race once its owner has supplied the suite. Run while the browser/Mock worker are stopped so they cannot alter race fixtures:

```powershell
$savedDatabase=$fake.DATABASE_URL
foreach($name in @('workspaces','credit-reservation','command-contract',
 'generation-replay','generation-races','asset-security')) {
  foreach($iteration in 1..3) {
    $raceDb='race_'+[guid]::NewGuid().ToString('N')
    Run-Fake $docker @('exec',$pg,'createdb','-U','postgres',$raceDb)
    try {
      $fake.DATABASE_URL="postgres://postgres:${password}@127.0.0.1:56329/$raceDb"
      Run-Fake $node @('--experimental-strip-types','scripts/migrate.ts')
      # Retain before/after zero fixture counts and emitted interleaving/financial assertions.
      Run-CoveredProbe $name "repeat-$iteration-$name"
    } finally {
      $fake.DATABASE_URL=$savedDatabase
      Run-Fake $docker @('exec',$pg,'dropdb','-U','postgres',$raceDb)
    }
  }
}
```

Do not send setup SQL or probes to a retained/shared app. Merge these LCOV files with the same-candidate local-suite LCOV using the reviewed scoped manifest and `D:/github/shpitto/scripts/m3-evidence.mjs`; retain missing-source and mandatory-case failures instead of treating the raw report's broad module roots as an approved denominator. Before browser startup, turn any readiness timeout into a recorded failure; do not attach to a different listener. This recipe has not been executed/validated by the sidecar, and does not pretend to automate before/after DB snapshots, the browser campaign or acceptance records.

### 7.3 Browser evidence inventory B

- Preserve eleven exact journey IDs used by `D:/github/shpitto/scripts/m3-evidence.mjs`: `fresh-user-generation`, `team-creation`, `invitation-creation`, `member-invitation`, `invitation-replay-expiry`, `owner-controls`, `workspace-switching`, `personal-space-denial`, `revoked-open-tab`, `private-download`, `application-worker-restart`.
- Record actual transfer/removal requests and final role/membership rows; keep removed member's tab/session open. Preserve same task/reservation/asset/digest through app and worker restarts; prove playable video and authorized bytes, not only a ready label. Verify active polling then terminal cessation over more than one 3-second interval; navigate away/back during unknown/materializing states and compare persisted DB projection.
- C06 adds a route/state matrix covering marketing/auth/signup/verification/reset/invitation, onboarding/dashboard/history/credit sources/assets, team creation/member management/switching, workspace billing, fixture checkout/portal, admin/operations/recovery and implemented Docs navigation/search. For each route, identify applicable success/loading/empty/error/denied states and justify any non-applicable state; cover both CSS viewports and keyboard controls. Newly added internal monitoring endpoints are API-only unless intentionally surfaced; test their authentication/secret-free response, not a fabricated UI page.
- Inspect actionability, disabled/focus states, private data/URL redaction and user-vs-global-admin separation. Current files inspected include `D:/github/shpitto/src/app/(app)/dashboard/page.tsx`, `D:/github/shpitto/src/app/(app)/dashboard/generation-panel.tsx`, `D:/github/shpitto/src/app/(app)/dashboard/team-panel.tsx`, `D:/github/shpitto/src/components/workspaces/ownership-transfer.tsx`, `D:/github/shpitto/src/components/billing/fixture-billing-panel.tsx`, `D:/github/shpitto/src/components/admin/admin-dashboard.tsx` and `D:/github/shpitto/src/components/auth/demo-access-card.tsx`. Source inspection is not a rendered UI verdict.

## 8. Superseded claims, register repairs and final independent/integrator records

**Superseded, not remaining baseline blockers:** hosted Trigger mandatory deployment; root-baseline mismatch; missing/sub-80% M4 owned coverage. RUNTIME, Q.root and E.coverage replace those older audit claims within their captured scope. Optional Trigger remains fail-closed until executable registration. A self-hosted process/monitoring drill is still necessary. Full AWS connectivity, generic buyer installation and complete managed/Docker release profiles remain later-stage obligations; no current cloud/email/provider/payout spending is authorized by this review.

**Genuine documentary gaps, owner repair required:**

1. `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/acceptance-status.json` and the five-criterion M3 verifier/historical record do not represent the current policy's M3-C06. Add a current applicability/result entry; do not rewrite H3's historical approval as if C06 existed then.
2. `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/traceability.json` omits SC-PRV-13/14/15 although spec/current M4 record includes them. Its 5.5 Trigger-only label is older than amended shared/self-hosted task semantics in `D:/github/shpitto/openspec/changes/restart-shpitto-video-saas/tasks.md`.
3. Development record's M4-C03 observation discusses settlement rather than the full deadline/recovery criterion; its two broad common-standard rows are not a nine-standard disposition. Populate exact criterion/scenario/common/profile links, including repeat counts/nested cases and current M3 applicability.
4. `D:/github/shpitto/internal/evidence/M4/task-5.10/railway-worker/related-test-manifest-20261015.json` is the 23-file/178-test earlier subset; E actually adds six files to reach 203. Owner's new tests must be listed and executed on frozen bytes, not assumed discovered. Do not overwrite earlier logs to hide superseded/failing attempts.

**A — Whole-stage independent review must contain:** independent reviewer identity/role/time and non-implementation scope; exact candidate/all six digest and environment matches; review of M3 C01–C06 impact/reruns/equivalence; each M4-C01–C04, all 46 scenarios/T12.a/b and nine standards with exact test/log/DB/browser/media refs and profile limitations; 80% reviewed denominator; three-reset races/ten-way contention/20 signed replays/crash/time-boundary protocol; four live row identities/contracts/input/output/playability/duration/credits/UNKNOWN-or-known cost/owned download; selected self-hosted process/independent monitoring/restore and safe fault evidence; secret scans/redaction, upstream attribution, all findings with P0/P1 and mandatory-condition blockers plus any legitimate P2/P3 owner/due date. Slice reviews and validators cannot replace this record.

**Separate integrator decision must contain:** submitter/reviewer references, final candidate match and source/schema/config/contract invalidation disposition, current prerequisite applicability, explicit technical decision/reasons/remaining blockers, accepted limitations and ownership, and next eligible tasks/dependency effects. It must not imply release/publication, production changes or unlimited provider spend. This document supplies neither that decision nor whole-stage approval.
