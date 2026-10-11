# M4/M5 local contract foundations

Tasks 5.1 and 6.1 are implemented and independently reviewed. M4 and M5 remain IN_PROGRESS. The task register now records 43 of 105 implementation tasks complete.

Source candidate: `6505c461336a6bdb8d1486226bee3702b8982623d2958195d38a24962e1aacef`.

## Delivered behavior and files

- `src/adapters/providers/{port,input,normalize,mock}.ts` and `src/config/provider-models.ts` define the shared provider contract, strict input/crop consent, stable accepted catalog snapshots, safe vendor mappings, normalized observations and the existing Mock bridge. `src/adapters/contracts.ts` re-exports the single port. Official schema inputs and provenance are in `internal/contracts/providers/`.
- `src/db/schema/billing.ts`, its schema export, migration `0016_billing_contracts.sql` and the migration journal define additive billing projections, immutable identities, tenant/provider/currency constraints, exclusive slots and reconciliation fencing. `src/config/plans.ts` and `src/modules/billing/contracts.ts` define local/test catalog and billing contracts.
- `tests/contracts/provider-inputs.test.ts`, `tests/contracts/billing-contracts.test.ts` and `scripts/probe-billing-schema.ts` cover the new behavior. Candidate digest and stage progression scripts/tests protect schema provenance, evidence freshness and approval boundaries. `scripts/verify-contract-foundations.mjs` retains combined regression/build evidence.
- `internal/restart/contract-register.md` aligns the provider signature with the implementation. The OpenSpec task and acceptance registers point to separate current-development records for M4/M5.

The implementation reuses existing Mock persistence functions, domain errors, integer parsing and semantic hashing. The unused competing generation interface was removed. No dependencies were added.

## Verification

The [unified result](2026-10-01T03-19-50-513Z-96d12a9e-f027-4b26-ab2b-a14936776d9a/result.json) records 50 successful commands, including typecheck, lint, format/config/boundary checks, OpenSpec validation, 21 existing domain probes, unit/contract tests, a frozen-lock installation and an isolated production build. The new contracts contribute 13 provider tests and 6 billing tests; the billing database probe passes 44 checks. Owned branch coverage is 1191/1388 = 85.81% across 44 modules. Both candidate captures match, and disposable database/build cleanup passed.

The [independent review](independent-review.md) includes independent focused tests, coverage recomputation and matching read-only retrieval of all four official provider schemas. [Root verification](root-verification.log) passes after the task/register updates.

## Local acceptance upgrade

The integrator made a private PostgreSQL custom-format backup before applying migration 0016 to the local acceptance database. Existing counts and all six credit buckets match before and after; six billing tables were added. The [migration record](2026-10-01T03-19-50-513Z-96d12a9e-f027-4b26-ab2b-a14936776d9a/local-migration.json) contains the backup reference and digest, without backup contents or credentials.

The prior local web, worker and mail-capture processes were no longer running and were restored. The [authenticated HTTP smoke](2026-10-01T03-19-50-513Z-96d12a9e-f027-4b26-ab2b-a14936776d9a/local-service-smoke.json) passes 10 checks across the two named demonstration accounts, dashboard, current team membership, workspace creation page and member detail pages. Account labels in this evidence are fixture names, not current authorization roles: the demo-member account owns its selected team following a prior ownership transfer. Temporary smoke sessions were signed out. An initial smoke used an old cached workspace ID that was no longer accessible to that account; the corrected probe follows each account's current rendered team link. Application permissions were not changed. This HTTP check does not claim an owner/non-owner permission matrix, browser interaction coverage or workspace creation.

## Approval boundaries and next work

Historical M3 records and browser artifacts retain their original approved candidate. [Impact analysis](m3-impact.json) explicitly marks current complete M3 applicability STALE pending separately reviewed current UI/application upgrade evidence. Existing historical approval was not rewritten or reused as current proof.

The [integration decision](integration-decision.json) approves only tasks 5.1 and 6.1. M4/M5 records leave whole-stage criteria and scenarios NOT_RUN. Tasks 5.2/5.3 (real provider adapters) and 6.2/6.3 (guarded Checkout/portal and authenticated durable Stripe intake) are next. Full gates still require their downstream implementation, reviewed credentials/catalog inputs and authorized external evidence. Production billing catalog is empty, live provider activation is disabled, and no paid provider request, Stripe transaction, production email integration or historical anomalous-balance recovery was performed.
