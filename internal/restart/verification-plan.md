# M0 verification plan

Status: **M1 PASS**. Local feasibility, reversible relocation and new-root scaffold evidence passed independent and integrator review; later account-backed profiles remain explicitly deferred.

## Evidence rules

- Every implementation task maps to an owner, stage, SC/T/G obligation and evidence record under `internal/evidence/acceptance/<stage>/<candidate-id>/`.
- Use the [acceptance record template](../../openspec/changes/restart-shpitto-video-saas/acceptance-record.template.json); never store raw keys or signed URLs.
- Record candidate source/schema/lock/config/contract/validator SHA-256, environment and tool versions, fixture/seed, expected/observed assertions and sanitized logs.
- `NOT_STARTED`, `BLOCKED`, `FAIL` and `STALE` never unlock a dependent stage. A reviewer independent of the implementation must inspect a `READY_FOR_REVIEW` record before `PASS`.

## Initial command contract

These commands are documentary checks for the planning package and M0 records; they do not claim application behavior:

```powershell
openspec validate restart-shpitto-video-saas --strict --json --no-interactive
openspec status --change restart-shpitto-video-saas --json
```

The new root now exposes frozen-lock install, build, typecheck, lint, format, configuration, root-integrity, acceptance-record, OpenSpec and database-boundary checks through `corepack pnpm verify`. PostgreSQL integration, adapter replay, browser and recovery commands remain milestone-specific additions after the foundation boundary. No command may include legacy or private state by glob accident.

## M0 evidence checklist

| Task | Owner | Required observation | Current state |
| --- | --- | --- | --- |
| 1.1 | foundation | Inventory, hashes, collision policy and restoration instructions | READY_FOR_REVIEW |
| 1.2 | foundation/dependency | Selected lock resolves and disposable prototype builds without unsupported overrides | READY_FOR_REVIEW; pnpm 12 lock/typecheck/build and Docker worker provenance passed; final shipped-image notices remain |
| 1.3 | foundation/domain | Auth → operator authorization → admin read → domain command → Drizzle transaction slice and rollback | READY_FOR_REVIEW; PostgreSQL chain probe now proves persisted operator role, React-admin authorization, role revocation, one domain effect and duplicate suppression; final production role administration/step-up remains M1 |
| 1.4 | foundation/docs | MDX/search, admin isolation, worker media probe and standalone packaging slice | READY_FOR_REVIEW; Docs/admin/standalone and in-container worker probes passed |
| 1.5 | integrations | Official contract/account matrix and scoped external inputs | READY_FOR_REVIEW; local boundaries fixed and account/budget evidence assigned to M4/M5/M6/M8 |
| 1.6 | architecture | One ProviderPort/DTO/schema/lock-order owner and E01–E05 register | READY_FOR_REVIEW; frozen in `contract-register.md` and aligned with the selected design/specs |
| 1.7 | verification | Complete T/SC/G ownership and record checker plan | READY_FOR_REVIEW; generated ownership/index rules and checker invocation recorded |
| 1.8 | independent reviewer | M0 criteria and all applicable local evidence pass | PASS; independent reviewer and integrator decisions recorded |
| 2.8 | independent release reviewer | M1 preservation, isolation, local prerequisites, shells and content boundaries pass | PASS; `working-tree-20260928-m1` independently reviewed by `m1-gpt6-luna-review-20260928`; task 3.1 is eligible |

## Coverage ownership

The generated [evidence index](evidence-index.json) maps all 80 requirements, 175 scenarios, 62 test families and 105 tasks to an accountable owner, a profile and an evidence-record location. Its assignments are planning ownership, not test results. Core-domain branch coverage target is at least 80% once delivered; mandatory money, authorization, isolation, idempotency and state-transition cases are individually required.

## Ownership and evidence convention

- `SC-*` owner is selected from the prefix rule in `evidence-index.json`; `T*` owner follows the scenarios that cite it; all 31 `G*` obligations have explicit owners and required milestone evidence in `gateObligationAssignments`. The acceptance record remains the single evidence index for a candidate.
- M0 uses `internal/evidence/acceptance/M0/working-tree-20260927/record.json`. Future stages use `internal/evidence/acceptance/<stage>/<candidate-id>/record.json`; each record names the exact environment/profile and carries sanitized logs only.
- Local/documentary evidence proves preservation, dependency feasibility, contract shape and deterministic probes. Sandbox/test-mode evidence proves the corresponding external contract. Live evidence is required only where the acceptance gate explicitly says so.
- Disposable PostgreSQL, fixed-clock, provider-replay and dirty-work/export fixtures are required profiles. Seeds, payloads and expected assertions are versioned with the record; secrets, signed URLs and payment details are prohibited.
- A source/schema/lock/configuration/contract/validator or acceptance-policy digest change marks affected evidence `STALE`; the prior record is retained and the affected profile plus dependent regressions are rerun.

## Mandatory M0 negative and concurrency cases

The local package must retain evidence for cross-tenant read/write rejection, role revocation on the next request, transaction rollback across domain/ledger/audit/outbox, duplicate idempotency, migration rerun, container media generation/transcode/probe, and clean standalone packaging. These cases are observed in the selected-stack evidence files and are prerequisites for independent review; they are not a claim that the new product runtime is complete.
