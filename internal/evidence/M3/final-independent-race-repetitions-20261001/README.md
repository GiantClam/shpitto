# Independent M3 ownership and credit race repetitions

Result: **PASS**. This is supplementary runtime evidence, not a full-stage approval.

Final combined evidence is in `final-summary.json`: **12 probe runs PASS**, comprising three fresh-database repetitions each of workspaces, credit reservation, duplicate durable commands, and generation replay. Every database and temporary asset directory was removed and absence confirmed. The original six-run records below remain intact; the additional six runs are recorded separately under `additional-contention/`.

Source candidate: `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`.
The source, schema, configuration, contract, validator and lockfile digests match before and after execution.

Six disposable PostgreSQL databases were created: one new database per probe per repetition. Each database received the normal migration runner before its unmodified probe. Every probe started with zero business fixture rows; all checked fixture counts returned to zero after the probe. Each database was dropped and its absence checked in `pg_database`. Each unique temporary asset root was removed and its absence verified. No live demo database, service, worker or source file was changed.

## Executed assertions

Three independent `probe-workspaces.ts` runs each proved:

- Ten simultaneous last-owner attempts all rejected.
- Ten simultaneous two-owner self-removal/self-demotion attempts yielded exactly one mutation and nine expected domain denials.
- Every observed committed owner count was at least one; final owner count was exactly one and workspace version advanced exactly once.
- Personal-space restrictions and eligible ownership transfer also passed.

Three independent `probe-credit-reservation.ts` runs each proved:

- Ten simultaneous 40-credit requests against 50 available credits, alternating two independent connection pools, yielded exactly one reservation and nine domain conflicts.
- Final grant buckets were 10 available and 40 reserved.
- Final counts were one allocation, two ledger entries, one durable command result, two audit events and two outbox events (including initial grant effects).
- Failed requests left no business effects. Existing replay, FEFO, stale/forged-price and local-only onboarding funding assertions also passed.

The exact final database state assertions are present in the unmodified probe source and run before its PASS output. Source file SHA-256 values are recorded in `result.json`; raw sanitized command logs and exit codes are preserved. `repetitions.json` records all six observed outputs, fresh database identities, concurrent index schedules, fixture counts and cleanup confirmations. Workspace probe UUID suffixes are visible in its observed transfer identity. PostgreSQL chooses the actual concurrent completion order; this harness does not claim to control that scheduler.

## Case mapping

- **T05.a:** personal/team and last-owner boundaries; `SC-IAM-03` and `SC-IAM-04`. Covered by the three ownership repetitions.
- **Credit reservation:** `REQ-CRD-02`, `SC-CRD-03` and `SC-CRD-04`, traced to T06/T09/T12. Covered by the three reservation repetitions.
- **T12.a:** independent deadline sweep, `SC-GEN-09`/`SC-GEN-10`. Not rerun by this supplementary artifact.
- **T12.b:** stale worker lease generation, `SC-GEN-11`/`SC-GEN-12`. Not rerun by this supplementary artifact.

Mapping references: accepted `specs/identity-workspaces/spec.md`, `specs/credit-accounting/spec.md`, `specs/generation-lifecycle/spec.md`, and `traceability.md` under `openspec/changes/restart-shpitto-video-saas/`.

The orchestration's initial credit case labels were corrected after the run as metadata only, from T12.a/T12.b to the accepted T06/T09/T12 mapping. Probe outcomes, command logs, assertions, timestamps and candidate captures were not altered or rerun.

## Additional duplicate-command and generation repetitions

Three fresh `probe-command-contract.ts` executions each proved ten simultaneous identical commands execute one business effect and return nine replays, twenty reordered semantic replays stay single-effect, conflicting payload reuse is rejected, and exactly two durable command identities exist for the original and race commands.

Three fresh `probe-generation-replay.ts` executions each proved ten-way duplicate generation creation, cancellation and success settlement produce one effect and nine replays. Twenty normalized callback deliveries, conflicting payload rejection and reordered outcomes preserve exactly one cancelled task and one succeeded task. Exact ledger counts are one consume, one grant issuance, one release and two reservations. Unrelated workspace records remain unchanged. These are local Mock/domain observations, not authenticated provider webhook evidence.

Generation replay ran from three separate temporary working directories containing copied migration/baseline inputs and the fixed MP4 fixture. The probe and imported application source were executed unchanged by absolute path. Its hardcoded `.data/probe-generation-replay-assets` therefore stayed inside each owned scratch directory; no root/shared probe assets were used.

For every supplemental run, an actual PostgreSQL query recorded `version()` and `current_setting('server_version')`: **PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35213, 64-bit**. The first six preserved records predate the requested version metadata query; the supplemental six records contain the actual observations.

## Evidence files

- `result.json`: combined verdict, candidate digests and probe source hashes.
- `repetitions.json`: per-run observations, invariants and cleanup evidence.
- `commands.json` and `logs/`: actual commands, timestamps, exit codes and sanitized output.
- `candidate-before/` and `candidate-after/`: full candidate manifests and hashed input footprints.
