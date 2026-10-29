# M4 implementation acceptance

Decision: **PASS**
Candidate: `m4-self-hosted-20261016`
Submitted by: `m4-implementation-owner-20261016` at 2026-10-16T00:18:00.000Z

## Accepted profile

This record accepts the selected self-hosted Railway demo profile only. It does not enable Trigger.dev, assert production email, perform Stripe transactions, recover historical anomalous balances, publish a customer release or authorize another provider create. Provider cost remains `UNKNOWN` where the provider did not expose an authoritative billable amount.

## Evidence

- Four real application rows: `internal/evidence/M4/provider-matrix.md` and the four row JSON files listed in `internal/evidence/acceptance/M4/m4-self-hosted-20261016/record.json`.
- Private R2 storage, hash verification and cleanup: `internal/evidence/M4/task-5.7-r2-live-adapter.json`, `internal/evidence/M4/task-5.7-storage-contract.json`.
- Recovery: `internal/evidence/M4/task-5.10/railway-worker/recovery-drill-20261016.json` (102 overdue tasks failed, 102 reservations released, submission fence retained, heartbeat/alert/incident assertions passed).
- Local fault/contract coverage: `internal/evidence/M4/task-5.10/railway-worker/local-fixture-validation-20261015.json` and `internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/coverage.json` (1530/1848 branches, 82.79%).
- Current M3 applicability/equivalence: `internal/evidence/acceptance/M4/m4-self-hosted-20261016/m3-equivalence-20261016.json`.
- Independent review and integration decision: `internal/evidence/acceptance/M4/m4-self-hosted-20261016/independent-review.json`, `internal/evidence/acceptance/M4/m4-self-hosted-20261016/integrator.json`.

## Quality gates

Typecheck, lint, format-check, database boundary, strict OpenSpec, frozen-lock install, production build, provider-input contracts and billing contracts have retained PASS receipts. The billing-schema receipt uses the existing isolated PostgreSQL PASS record because the same-day local rerun lacked database creation permission; the failed rerun is not relabeled as PASS.

## Safety

No secret values are recorded. No existing business object was read or deleted. No new provider request was made while assembling this acceptance record.
