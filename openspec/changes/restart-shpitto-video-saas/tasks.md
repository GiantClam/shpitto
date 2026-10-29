# Shpitto restart implementation tasks

Status (2026-10-29; exact-candidate development evidence rebound): Historical M0-M3 approvals remain preserved for their original candidates. Current M3 applicability on the M4, M5 and M6 development records is STALE until an independent equivalence review. Records `m4-current-20261029`, `m5-current-20261029` and `m6-current-20261029` are bound to commit `f59f1f094dab084374331de9ad2b7a6fb7ed081e` and remain `IN_PROGRESS`. `node scripts/check-stage-progression.mjs` passes as development validation and does not approve a milestone. The 2026-10-29 hosted four-path create/settle/verify and the selected self-hosted recovery drill are recorded for M4 and do not close the stage. Negative callback and financial-idempotence cases, numeric deadline and probe configuration, storage-failure fault suites, owned-module coverage, current M3 equivalence and independent review remain open. An aipc disposable Docker PostgreSQL 16 fixture rerun on 127.0.0.1:55432 is archived at `internal/evidence/acceptance/aipc-local-55432-20261029/` and does not close a stage. The hosted Stripe test-mode acceptance-pack embedded payment is PASS_paid_and_reconciled at `internal/evidence/acceptance/stripe-test-pack-20261029/` and does not close M5. The signed-in owner billing page is recorded at `internal/evidence/acceptance/stripe-test-pack-20261029/BILLING_UI_OWNER_SIGNED_IN.md` and does not close M5. Hosted Checkout Session URLs, member-denial UI, mobile layout, refund-command replay, the local Stripe refund step-up failure, the $25 subscription, refunds, and FirstPromoter settlement remain open. Provider cost status for the four paths is UNKNOWN. No live Stripe charge, refund, payout or publication was performed. M7 and M8 remain NOT_STARTED.

Read [proposal](proposal.md), [design](design.md), capability specs and [traceability](traceability.md) before implementation. [Chinese review](../../reviews/shpitto-restart.zh-CN.md) mirrors scope and task IDs.

## Execution contract

The [staged acceptance contract](acceptance-gates.md), [initial register](acceptance-status.json) and [record template](acceptance-record.template.json) govern all nine milestone reviews. Automated evidence is recorded first; independent review and integration decisions are accumulated in the final manual-acceptance queue. Deferred manual review does not block unrelated automated work; actual automated failures, missing scenarios and unavailable external profiles remain visible blockers for their dependent claims. M8 has RC, BETA and STABLE checkpoints; 9.15 remains open until STABLE passes. The register documents intended enforcement; implementation of the checker and CI integration remains future work.

Task IDs are stable identifiers, not a promise of numerical execution order. Follow the `Depends` edges and evidence scopes; 4.13 precedes gate 4.12, and M8 deploy assets must be finished before candidate freeze 9.3. M4/M5 run concurrently only after 4.12 and shared contract ownership is fixed. Early M7 content work can begin after 2.8; final integration awaits its stated predecessors.

Every task requires implemented outputs plus its named observed evidence before checking. Record source/artifact digest, environment, relevant SC/T case, expected/actual result, validator/policy version and sanitized evidence location. No source migration occurs before the preservation and M0 gates. Credentials, paid validation, live financial actions and publishing retain their explicit scoped authorization requirements.

Prepare regression scenarios before implementing the affected behavior. For implementation, run the relevant unit, actual PostgreSQL integration, adapter and browser checks, plus new-app lint/typecheck/build/import-boundary checks. Target at least 80% branch coverage in owned core-domain modules while requiring every mandatory monetary/isolation/state transition case. These are future verification instructions, not application tests executed while authoring this plan.

Keep one owner for schema, ledger, contracts and root manifests; at most four concurrent agents including the integrator. Paths listed are implementation targets. UI/adapters use domain commands, and no task author can weaken its own validator policy to obtain a pass. Missing or blocked evidence cannot count as completion.

SC-BIL-17 has M5 domain/test-mode and M6 operator-UI evidence. SC-OPS-13 has M6 integration and M8 clean-customer deployment evidence. A phase's partial proof must be labeled; only all profiles close the full scenario. See task descriptions and final G01-G31 release assessment.

## 1. M0 — Preservation inventory and selected-stack evidence

- [x] 1.1 Record the source, Git and local-authored-state preservation map. ✓ 2026-09-27
  - Paths: `internal/restart/inventory.json`, `internal/restart/relocation-map.json`, `internal/restart/restore.md`.
  - Depends: implementation authorization for this change; no application prerequisite.
  - Done when: Read-only inventory classifies root paths, tracked/untracked/ignored authored files, hashes, existing local changes, retained `.git`, private configuration and read-only hosting dependencies; proposed source/destination paths are explicit and collision checked. No source moves in this task.
  - Evidence: SC-FND-01, SC-FND-02, SC-FND-03, T44, T46; redacted inventory and recovery map.

- [x] 1.2 Prove dependency resolution and source redistribution provenance in a disposable prototype. ✓ 2026-09-27
  - Paths: `internal/spikes/selected-stack/`, `internal/restart/dependency-decisions.md`, `internal/restart/provenance.json`.
  - Depends: 1.1.
  - Done when: Resolve the selected runtime/library versions into a frozen lock, check actual peer/build compatibility, pin copied component sources and media-tool builds/checksums, record licenses/notices and any evidence-driven version substitution. Do not mutate the legacy lockfile.
  - Evidence: SC-FND-06, SC-FND-07, T52, T62; lockfile, dependency inventory and sanitized build/license results.

- [x] 1.3 Validate the selected auth/admin/domain transaction slice. ✓ 2026-09-27
  - Paths: `internal/spikes/selected-stack/{auth,admin,domain}/`, `internal/restart/admin-integration.md`.
  - Depends: 1.2.
  - Done when: Demonstrate a Better Auth session, separately authorized React-admin read, one audited credit command and Drizzle-owned migration; direct endpoint/role-revocation denials and injected domain/ledger/audit/outbox failures preserve atomicity. Prototype output is evidence, not a second production implementation.
  - Evidence: SC-FND-11, SC-FND-12, T04, T59, T60, T61.

- [x] 1.4 Validate Docs, media tooling and standalone packaging compatibility. ✓ 2026-09-27
  - Paths: `internal/spikes/selected-stack/{docs,worker,packaging}/`, `internal/restart/packaging-spike.md`.
  - Depends: 1.2.
  - Done when: Build trusted versioned MDX/static search, verify the selected admin island and standalone server bundling, and probe a local media fixture inside the proposed worker/container image without host-only FFmpeg assumptions. Record build sources and notices.
  - Evidence: SC-FND-06, SC-FND-08, T57, T62.

- [x] 1.5 Recheck external contracts and classify account/budget prerequisites. ✓ 2026-09-27
  - Paths: `internal/restart/integration-matrix.md`, `internal/restart/external-inputs.json`.
  - Depends: 1.2.
  - Done when: Check official current model endpoints/schema/versions, provider signatures/retry behavior, Stripe canonical identities, FirstPromoter stable UID/campaign/review/referral validation and vendor sales contracts. List account/region/entitlement, sandbox and paid-evidence limitations by dependent task; fixtures cannot substitute for required real evidence.
  - Evidence: SC-FND-07, SC-FND-13, T11, T22, T25, T27, T30, T53; no paid call without credentials and explicit budget.

- [x] 1.6 Freeze the implementation contract register and E01-E05 defaults. ✓ 2026-09-27
  - Paths: `internal/restart/contract-register.md`, `.shpitto/contracts/` design inputs, this change's `design.md` and specs.
  - Depends: 1.3, 1.4, 1.5.
  - Done when: Reconcile unique ProviderPort/DTOs, table ownership and lock ordering; confirm the personal/team and suspension matrices, bounded subscription lifecycle and affiliate attribution/correction defaults in the implementation baseline. Any approved deviation updates specs/scenarios and both language views before dependent work.
  - Evidence: SC-FND-05, SC-FND-11, T05.a, T22, T27, T59; no competing schemas or contradictory active contracts.

- [x] 1.7 Establish case ownership, evidence conventions and implementation verification commands. ✓ 2026-09-27
  - Paths: `internal/restart/verification-plan.md`, `internal/restart/evidence-index.json`, future root command contract.
  - Depends: 1.6.
  - Done when: Assign every T/SC and gate an owner and evidence location, define disposable database/clock/adapter/dirty-work/export fixtures, command prerequisites and mandatory negative/concurrency cases. Define at least 80% owned core-domain branch coverage plus mandatory cases regardless of percentage; distinguish Mock/fixtures/sandbox/live and record external blockers.
  - Evidence: SC-FND-13, SC-FND-14, T01-T62; complete plan, no invented application pass. Define criterion/profile records, stage status transitions, independent reviewer checks and digest invalidation from acceptance-gates.md; implement the initial documentary record checker and record its invocation for later root/CI wiring.

- [x] 1.8 Close M0 with an independently reviewed preservation and feasibility package. ✓ 2026-09-27
  - Paths: `internal/restart/m0-evidence.md`, `internal/restart/relocation-map.json`.
  - Depends: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7.
  - Done when: Required local selected-stack evidence and preservation/conflict checks are observed; cross-module contracts have one owner; external prerequisites are explicitly assigned to later gates rather than marked passed. A failed selected-stack slice blocks root replacement until fixed or a reviewed compatible replacement exists.
  - Evidence: SC-FND-01, SC-FND-02, SC-FND-06, SC-FND-07, SC-FND-11, SC-FND-12, SC-FND-13, SC-FND-14; M0 gate, G02, G15, G31 foundation evidence only.
  - Acceptance: Apply M0 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.

## 2. M1 — Reversible archive and new root scaffold

- [x] 2.1 Snapshot and verify the approved preservation map immediately before relocation. ✓ 2026-09-27
  - Paths: `internal/restart/pre-move-manifest.json`, private local backup location, `legacy/shpitto-platform/` destination plan.
  - Depends: 1.8.
  - Done when: Recheck changed/ignored authored bytes, root Git state and destination collisions; verify resolved absolute paths stay within approved workspace/archive or explicitly named private backup targets. Record rollback inputs and stop on mismatch without overwriting work.
  - Evidence: SC-FND-01, SC-FND-02, T44; source hashes and safe-path review, no exposed secret values.
  - Observed: Fresh snapshot recorded branch `codex/restart-shpitto-m0` at `6ad44be7b6f12fe028637f0300040bada826c47d`; 1,686 candidate files hash-checked; candidate Git changes `0`; destination collision `CLEAR`; path-safety review `PASS`. No source was moved.

- [x] 2.2 Relocate only inventoried legacy source and prove isolation of the retained archive. ✓ 2026-09-27
  - Paths: `legacy/shpitto-platform/**`, `internal/restart/post-move-manifest.json`, root preservation list.
  - Depends: 2.1.
  - Done when: Move mapped paths with native safe filesystem operations, keep `.git`, OpenSpec and approved planning documents at the root, preserve local/private files at their recorded locations, compare hashes and rehearse restoration in a disposable copy. Existing online services remain untouched by relocation.
  - Evidence: SC-FND-01, SC-FND-02, SC-FND-03, T44; complete before/after accounting and recovery proof.
  - Observed: The exact pre-move manifest moved 1,686 files with zero destination collisions; post-move hashes, source absence, archive accounting and disposable restoration all passed. No network or hosted-service action was performed.

- [x] 2.3 Establish the new root manifest, toolchain and validated configuration; wire acceptance-record/dependency/digest checks into the new verification command and CI entry point. ✓ 2026-09-28
  - Paths: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, lint/format configs, `.gitignore`, `.dockerignore`, `.env.example`, `src/config/env.ts`.
  - Depends: 2.2.
  - Done when: Port only the accepted prototype dependency baseline; remove old root workspace/deploy assumptions, define new commands and explicit legacy/vendor exclusions, validate local/production configuration and secret placeholders. Scope the pnpm/Docker environment to the new app.
  - Evidence: SC-FND-04, SC-FND-06, SC-FND-10, T45, T46, T62.
  - Observed: Frozen-lock install, typecheck, source-boundary, format, configuration, root-integrity, acceptance-record, OpenSpec and standalone build checks pass through `corepack pnpm verify`; CI invokes the same command. See `internal/restart/m1-root-scaffold-evidence.md`.

- [x] 2.4 Establish database/port boundaries and the single migration runner. ✓ 2026-09-28
  - Paths: `src/db/{client,schema}/`, `src/db/migrations/`, `scripts/migrate.ts`, `src/modules/shared/`, `src/adapters/`, import-boundary checks.
  - Depends: 2.3.
  - Done when: Define transaction/ID/time/error contracts, direct migration connection and advisory locking; prohibit browser-secret and domain-framework imports. Reserve domain schema ownership without importing the old platform's data model or executing request-time schema pushes.
  - Evidence: SC-FND-11, SC-FND-12, T60, T61; migration/transaction prototype evidence and enforced boundaries.
  - Observed: Drizzle PostgreSQL migrator uses one direct client and a transaction-independent advisory lock; static boundary checks pass, a disposable PostgreSQL 15 container applies the chain twice with one ownership row and one journal row, and the transaction probe proves rollback plus commit behavior. See `internal/restart/m1-db-boundary-evidence.md`.

- [x] 2.5 Provide reproducible persistent local dependency and worker images. ✓ 2026-09-28
  - Paths: `deploy/compose.local.yml`, `deploy/worker.Dockerfile`, `scripts/dev-services.ts`, `src/config/env.ts`, `docs/buyer/local-setup.md`.
  - Depends: 2.3, 2.4.
  - Done when: PostgreSQL, mail capture, asset volumes and worker media tools initialize/restart without cloud keys; describe volume lifecycle and prerequisites. Include production-demo rejection and observable readiness. Full generation follows M3 rather than being claimed here.
  - Evidence: SC-FND-08, SC-FND-09, SC-FND-10, T01 prerequisite subset, T48, T62.
  - Observed: Compose contract, PostgreSQL/Mailpit/asset volumes, FFmpeg worker image and readiness endpoint pass static and disposable Docker checks; restart keeps PostgreSQL and worker healthy. See `internal/restart/m1-local-services-evidence.md`.

- [x] 2.6 Scaffold product, auth, workspace, admin and documentation shells with the default presentation baseline. ✓ 2026-09-28
  - Paths: `src/app/{(marketing),(auth),(app),admin}/`, `src/components/`, `src/config/{brand,navigation}.ts`, `content/docs/`, Fumadocs source config.
  - Depends: 2.3, 2.4.
  - Done when: Establish English-first/i18n boundaries, responsive accessible shells and loading/error states; define named brand color, typography, spacing, focus/disabled/status tokens shared by marketing, auth, product and admin shells; keep navigation/menu dimensions consistent; separate client-only React-admin styles; provide server guard integration points and versioned Docs navigation. Placeholder routes must not claim working billing, public APIs or completed business behavior.
  - Evidence: SC-FND-05, SC-FND-06, SC-FND-15, SC-SKL-18, T56 prerequisite navigation, T59 foundation subset; G06/G08 surface inspection.
  - Observed: Marketing, auth, app, admin and Docs preview routes build successfully with responsive shared shells, loading state, server guard seams and a client-only admin shell. React-admin consumes the same Shpitto brand tokens for its default theme and menu sizing. Deferred behaviors are labeled. See `internal/restart/m1-shell-evidence.md`.

- [x] 2.7 Transition guidance and establish customer/engineering content boundaries. ✓ 2026-09-28
  - Paths: `AGENTS.md`, `legacy/shpitto-platform/AGENTS.md`, `skills/`, `.shpitto/contracts/`, `content/docs/`, `docs/buyer/`, `internal/restart/`.
  - Depends: 2.2, 2.3, 2.6.
  - Done when: Preserve old harness guidance with the legacy source and create a new root contract referencing OpenSpec; define twelve-Skill registry, shared versioned Docs source, trusted validation policy ownership and export classes. Preserve private state; do not package this internal OpenSpec/planning history as buyer runtime content.
  - Evidence: SC-FND-05, T44, T46, T52, T58, T62; named source owners and export exclusions.
  - Observed: Legacy AGENTS guidance, OpenSpec root contract, twelve-Skill registry, trusted validator ownership, export classes and shared versioned Docs source are checked by `corepack pnpm verify:content-boundaries`. See `internal/restart/m1-content-boundary-evidence.md`.

- [x] 2.8 Close M1 with a clean scaffold and preservation/isolation evidence. ✓ 2026-09-28
  - Paths: `internal/restart/m1-evidence.md`, disposable clean-copy and legacy-sentinel fixtures.
  - Depends: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7.
  - Done when: New root installs/builds and checks only its intended files; invalid legacy sentinel stays excluded; local services restart; manifests account for preserved bytes/history and source-only rollback. No unresolved root migration or dependency failure remains. Application journeys remain later phase work.
  - Evidence: SC-FND-01, SC-FND-02, SC-FND-03, SC-FND-04, SC-FND-05, SC-FND-06, SC-FND-08, SC-FND-09, SC-FND-10, SC-FND-11, SC-FND-14, T44-T48, T62; M1 gate.
  - Acceptance: Apply M1 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Observed: Candidate `working-tree-20260928-m1` passed independent `gpt-6-luna` review and integrator review. M2 task 3.1 is eligible; later M2 tasks remain dependency-gated.



## 3. M2 — Identity, workspaces and credits

- [x] 3.1 Establish the reviewed auth/domain migration and fixture foundation. ✓ 2026-09-28
  - Targets: `src/db/schema/auth.ts`, `src/db/schema/workspace.ts`, `src/db/migrations/**`, `tests/fixtures/workspaces.ts`.
  - Depends on: 2.8.
  - Done when: Freeze ID, tenant-FK, UTC and decimal-string conventions; apply the single Drizzle sequence to disposable PostgreSQL; provide A/B/C and W1/W2 fixtures and migration rollback boundaries.
  - Evidence: T02, T05, T60; [SC-IAM-02](specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable), [SC-CRD-02](specs/credit-accounting/spec.md#scenario-sc-crd-02-tenant-lineage-cannot-cross-workspaces).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.1/record.json` passed independent review by `m2-gpt6-luna-review-20260928`; task 3.2 is unlocked. The M2 gate remains open.

- [x] 3.2 Integrate persistent Better Auth and the account/workspace stage of onboarding. ✓ 2026-09-28
  - Targets: `src/lib/auth.ts`, `src/modules/workspaces/onboard.ts`, `src/app/(auth)/**`, `tests/integration/onboarding.test.ts`.
  - Depends on: 3.1.
  - Done when: Implement signup/session/verification/reset using the selected library; resume incomplete account/workspace setup and persist exactly one personal workspace across restart/concurrent retries. This stage does not issue demo credits: retain a recoverable funding-pending state until 3.10 integrates the ledger-backed grant command; the complete onboarding scenarios close at 3.12.
  - Evidence: T01, T05; [SC-IAM-01](specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace), [SC-IAM-02](specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.2/record.json` passed independent review by `m2-gpt6-luna-review-20260928`; task 3.3 is unlocked. The M2 gate remains open.

- [x] 3.3 Implement bounded personal/team ownership commands. ✓ 2026-09-28
  - Targets: `src/modules/workspaces/commands.ts`, `src/modules/workspaces/policy.ts`, `src/app/api/workspaces/**`, `tests/integration/workspace-ownership.test.ts`.
  - Depends on: 3.2.
  - Done when: Personal owner is immutable and collaboration uses a team; transfer requires an existing active verified member plus recent authentication; concurrent remove/demote/transfer cannot create an ownerless team.
  - Evidence: T05, T05.a; [SC-IAM-03](specs/identity-workspaces/spec.md#scenario-sc-iam-03-personal-workspace-rejects-team-operations), [SC-IAM-04](specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.3/record.json` passed independent review by `m2-gpt6-luna-review-20260928`; task 3.4 is unlocked. The M2 gate remains open.

- [x] 3.4 Implement one-use email-bound team invitations and durable mail intent.
  - Targets: `src/modules/workspaces/invitations.ts`, `src/adapters/mail/**`, `src/app/api/invitations/accept/route.ts`, `tests/integration/invitations.test.ts`.
  - Depends on: 3.3.
  - Done when: Persist hashed seven-day tokens, owner-only creation, matching verified email acceptance and committed mail intent; duplicate, expired and mismatched acceptance is safe.
  - Evidence: T05; [SC-IAM-05](specs/identity-workspaces/spec.md#scenario-sc-iam-05-accept-invitation-exactly-once), [SC-IAM-06](specs/identity-workspaces/spec.md#scenario-sc-iam-06-reject-expired-or-mismatched-invitation).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.4/record.json` passed independent review by `m2-gpt6-sol-review-20260928`; task 3.5 is unlocked. The M2 gate remains open.

- [x] 3.5 Centralize current-membership authorization across tenant endpoints.
  - Targets: `src/modules/workspaces/authorize.ts`, `src/app/api/workspaces/**`, `tests/integration/tenant-authorization.test.ts`.
  - Depends on: 3.3, 3.4.
  - Done when: Apply workspace/resource checks to every endpoint registered so far and reusable helpers for later tasks; deny W2 ID substitution and post-removal requests using still-live sessions; test last-owner races.
  - Evidence: T02, T03, T05.a; [SC-IAM-04](specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection), [SC-IAM-07](specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access), [SC-IAM-08](specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.5/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.5`; task 3.6 is unlocked. The M2 gate remains open.

- [x] 3.6 Implement separate operator roles and trusted session step-up. ✓ 2026-09-28
  - Targets: `src/db/schema/operator.ts`, `src/modules/operations/authorize.ts`, `src/lib/auth.ts`, `src/app/api/admin/me/route.ts`.
  - Depends on: 3.2, 3.5.
  - Done when: Persist explicit global roles and server-created successful second-factor stamps; apply same-live-session and ten-minute freshness only while operator 2FA enforcement is enabled; deny workspace-owner escalation and apply role revocation immediately. Admin screens and fresh-install owner initialization remain M6 work.
  - Evidence: T04, T59; [SC-IAM-09](specs/identity-workspaces/spec.md#scenario-sc-iam-09-workspace-ownership-is-not-global-administration), [SC-IAM-10](specs/identity-workspaces/spec.md#scenario-sc-iam-10-step-up-binds-user-and-live-session).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.6/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.6` using `gpt-6-sol` and integrator review; task 3.7 is unlocked. The M2 gate remains open. Real 2FA provider wiring remains later operator scope.

- [x] 3.7 Enforce account-disabled, workspace-suspended and billing-hold matrix. ✓ 2026-09-28
  - Targets: `src/modules/workspaces/access-state.ts`, `src/modules/operations/status-commands.ts`, `src/modules/billing/hold-policy.ts`, `tests/integration/access-states.test.ts`.
  - Depends on: 3.5, 3.6.
  - Done when: Encode selected engineering defaults in one policy used by reads and commands; disabled user does not disable teammates, workspace suspension denies member reads/downloads, billing hold blocks new generation/Checkout only among otherwise allowed actions; active worker settlement survives all relevant holds.
  - Evidence: T03, T04, T23, T59, T59.a; [SC-IAM-11](specs/identity-workspaces/spec.md#scenario-sc-iam-11-disable-one-account-without-harming-other-members), [SC-IAM-12](specs/identity-workspaces/spec.md#scenario-sc-iam-12-suspension-and-billing-hold-have-different-effects).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.7/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.7` using `gpt-6-sol` and integrator review; task 3.8 is unlocked. The M2 gate remains open. Audit-event persistence, semantic command idempotency and real worker/credit settlement remain later scope.

- [x] 3.8 Implement validated session DTOs and durable command identity. ✓ 2026-09-28
  - Targets: `src/contracts/http.ts`, `src/modules/shared/commands.ts`, `src/db/schema/commands.ts`, `src/app/api/**`.
  - Depends on: 3.1, 3.5.
  - Done when: Implement safe response/error envelopes, bounded idempotency keys with semantic hashes, same-origin/CSRF checks, integer decimal-string serialization and stored command replay; reject mismatched payload reuse and avoid public API-key surfaces.
  - Evidence: T02, T09, T57; [SC-IAM-13](specs/identity-workspaces/spec.md#scenario-sc-iam-13-reject-unauthenticated-or-forged-origin-mutations), [SC-IAM-14](specs/identity-workspaces/spec.md#scenario-sc-iam-14-validate-quantities-and-api-product-boundary), [SC-CRD-07](specs/credit-accounting/spec.md#scenario-sc-crd-07-replay-after-external-deduplication-expires).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.8/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.8` using `gpt-6-sol` and integrator review; task 3.9 is unlocked. The M2 gate remains open. Route-by-route command-result migration and uniform legacy error envelopes remain visible follow-up boundaries; no credit-ledger or generation claim is made here.

- [x] 3.9 Implement grant ledger, allocation lineage and atomic audit foundation. ✓ 2026-09-28
  - Targets: `src/db/schema/credit.ts`, `src/modules/credits/ledger.ts`, `src/modules/shared/transaction.ts`, `tests/integration/credit-ledger.test.ts`.
  - Depends on: 3.1, 3.8.
  - Done when: Enforce bucket equality/nonnegativity, tenant FKs, immutable ledger/allocation records, business uniqueness and credit-account serialization; injected ledger/audit/outbox failures roll back the entire command.
  - Evidence: T06, T07, T09, T60, T61; [SC-CRD-01](specs/credit-accounting/spec.md#scenario-sc-crd-01-every-balance-projection-reconciles), [SC-CRD-02](specs/credit-accounting/spec.md#scenario-sc-crd-02-tenant-lineage-cannot-cross-workspaces), [SC-CRD-08](specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.9/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.9` using `gpt-6-sol` and integrator review; task 3.10 is unlocked. The M2 gate remains open. Quotes, FEFO/reservations, settlement/refunds, generation and provider/payment work remain later scope.

- [x] 3.10 Implement server quotes, atomic reservation, FEFO allocation and local onboarding funding. ✓ 2026-09-28
  - Targets: `src/config/models.ts`, `src/modules/credits/reserve.ts`, `src/modules/credits/allocate.ts`, `src/modules/credits/issue-demo.ts`, `src/modules/workspaces/onboard.ts`, `scripts/probe-credit-reservation.ts`, `scripts/probe-onboarding.ts`.
  - Depends on: 3.7, 3.9.
  - Done when: Immutable server quotes, deterministic expiry/creation/ID ordering, immediate exclusion of expired unreserved amounts and at-most-three transaction retries pass concurrent insufficient-fund and stale-catalog cases without external calls. After 3.8/3.9 exist, complete funding-pending local onboarding through a profile-guarded grant command with a stable per-workspace business key; crashes/concurrent retries issue at most one permitted demo grant and production rejects demo funding.
  - Onboarding evidence: T01, T05; [SC-IAM-01](specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace), [SC-IAM-02](specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable).
  - Evidence: T06, T07, T08, T09; [SC-CRD-03](specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds), [SC-CRD-04](specs/credit-accounting/spec.md#scenario-sc-crd-04-client-price-and-stale-catalog-do-not-bind-the-ledger), [SC-CRD-05](specs/credit-accounting/spec.md#scenario-sc-crd-05-deterministic-fefo-preserves-permanent-purchases), [SC-CRD-06](specs/credit-accounting/spec.md#scenario-sc-crd-06-expiry-does-not-discard-a-reservation).
  - Acceptance: `internal/evidence/acceptance/M2/working-tree-20260928-m2-3.10/record.json` passed independent review by `m2-gpt6-sol-review-20260928-3.10` using `gpt-6-sol` and integrator review; task 3.11 is unlocked. The M2 gate remains open. A populated pre-3.10 allocation upgrade drill is recorded as P2 follow-up; settlement/refunds, generation and provider/payment work remain later scope.

- [x] 3.11 Implement expiry-aware refunds, nonrenewing compensation and balance queries.
  - Acceptance: Repaired task-3.11.json and independent-review.md under internal/evidence/acceptance/M2/working-tree-20260929-m2-repair passed independent gpt-6-sol and integrator review on 2026-09-29. Unknown legacy reservations and T49 recovery retain later-stage limits.
  - Targets: `src/modules/credits/settle.ts`, `src/modules/credits/expiry.ts`, `src/modules/credits/queries.ts`, `tests/integration/credit-refund.test.ts`.
  - Depends on: 3.9, 3.10.
  - Done when: Controlled-clock cases prove source-aware cancellation/failure settlement, exactly one seven-day grant per expired subscription allocation and unchanged compensation expiry; expose explainable source/expiry balances and discrepancy holds.
  - Evidence: T07, T08, T15, T16, T17, T18, T49; [SC-CRD-09](specs/credit-accounting/spec.md#scenario-sc-crd-09-cancelled-expired-allocation-is-not-compensation), [SC-CRD-11](specs/credit-accounting/spec.md#scenario-sc-crd-11-provider-charge-does-not-reduce-a-failure-refund), [SC-CRD-12](specs/credit-accounting/spec.md#scenario-sc-crd-12-mixed-source-failure-preserves-each-source), [SC-CRD-13](specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant), [SC-CRD-14](specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure), [SC-CRD-15](specs/credit-accounting/spec.md#scenario-sc-crd-15-user-can-explain-a-mixed-refund), [SC-CRD-16](specs/credit-accounting/spec.md#scenario-sc-crd-16-mismatch-never-silently-repairs-history).

- [x] 3.12 Close the M2 identity and credit invariant gate.
  - Acceptance: internal/evidence/acceptance/M2/working-tree-20260929-m2-repair/record.json PASS; independent verification passed 28 tests, 12 race repetitions, 575/620 branches (92.74%), real local auth/API/mail, responsive keyboard checks and final build.
  - Targets: `internal/evidence/M2/**`, `tests/integration/**`, `tests/unit/credits/**`.
  - Depends on: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11.
  - Done when: Collect fresh disposable-PostgreSQL authorization/race/ledger/audit evidence and owned-domain coverage; replay the complete account→personal-workspace→permitted-demo-grant onboarding across restart and concurrent retry, proving no duplicate workspace/grant and no production demo funding. All applicable IAM/CRD scenarios and mandatory monetary/isolation cases pass, core owned-domain branch coverage targets at least 80%, and pending later integration cases are explicitly recorded. M2 does not claim provider/billing/admin UI completion.
  - Evidence: T01, T02, T03, T04, T05, T06, T07, T08, T09, T16, T17, T18, T59, T60; [SC-IAM-01](specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace), [SC-IAM-04](specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection), [SC-IAM-07](specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access), [SC-IAM-10](specs/identity-workspaces/spec.md#scenario-sc-iam-10-step-up-binds-user-and-live-session), [SC-IAM-12](specs/identity-workspaces/spec.md#scenario-sc-iam-12-suspension-and-billing-hold-have-different-effects), [SC-CRD-03](specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds), [SC-CRD-08](specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation), [SC-CRD-13](specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant), [SC-CRD-14](specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure).
  - Acceptance: Apply M2 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.

## 4. M3 — Persistent local generation

- [x] 4.1 Implement task contract, guarded state machine and atomic create. ✓ 2026-09-29
  - Targets: `src/db/schema/generation.ts`, `src/modules/generation/create.ts`, `src/modules/generation/state.ts`, `src/app/api/workspaces/[w]/generations/**`.
  - Depends on: 3.12.
  - Done when: Persist accepted input/catalog/policy snapshots, task/reservation/command/outbox together; enforce all legal/illegal transitions; only server quote, authorized ready inputs and allowed access state can create work.
  - Evidence: T06, T09, T13, T20; [SC-CRD-03](specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds), [SC-CRD-04](specs/credit-accounting/spec.md#scenario-sc-crd-04-client-price-and-stale-catalog-do-not-bind-the-ledger), [SC-GEN-05](specs/generation-lifecycle/spec.md#scenario-sc-gen-05-queue-completion-with-error-is-not-success), [SC-GEN-06](specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary).
  - Observed: `tests/unit/generation-state.test.ts` covers legal/illegal monotonic transitions and input boundary rejection. `scripts/probe-generation-create.ts` applies the migration, creates a task against disposable PostgreSQL, proves task/reservation/command/audit/dispatch-outbox atomicity, verifies idempotent replay and conflicting replay rejection, and confirms server-quote validation through the shared reservation command. M3 remains open; provider execution, asset materialization and terminal settlement are later tasks.

- [x] 4.2 Implement atomic queued cancellation and one-time dispatch claim. ✓ 2026-09-29
  - Evidence: lifecycle probe proves account-lock serialization, reservation release, claim idempotency and post-cancel claim denial.
  - Targets: `src/modules/generation/cancel.ts`, `src/modules/generation/claim-dispatch.ts`, `tests/integration/cancel-dispatch.test.ts`.
  - Depends on: 4.1.
  - Done when: A real PostgreSQL cancel/claim race has one winner; claim disables cancellation before HTTP, creates one attempt and persists provider-independent dispatch identity; cancellation restores only valid allocations without compensation.
  - Evidence: T09, T10, T11; [SC-GEN-03](specs/generation-lifecycle/spec.md#scenario-sc-gen-03-cancel-wins-the-dispatch-race), [SC-GEN-04](specs/generation-lifecycle/spec.md#scenario-sc-gen-04-dispatch-wins-before-network-transmission), [SC-CRD-09](specs/credit-accounting/spec.md#scenario-sc-crd-09-cancelled-expired-allocation-is-not-compensation).

- [x] 4.3 Implement terminal success/failure and late-result quarantine. ✓ 2026-09-29
  - Evidence: lifecycle probe proves failure settlement, provider-cost evidence retention and terminal late-event quarantine.
  - Targets: `src/modules/generation/settle.ts`, `src/modules/generation/quarantine.ts`, `tests/integration/generation-settlement.test.ts`.
  - Depends on: 4.1, 3.11.
  - Done when: Success requires durable ready output, failure refunds by original lineage, unknown provider cost remains separate; replay/terminal conflicts never reopen, redebit, re-refund or resubmit.
  - Evidence: T09, T13, T15, T16, T17, T18, T19, T53; [SC-CRD-10](specs/credit-accounting/spec.md#scenario-sc-crd-10-only-durable-delivery-consumes), [SC-CRD-11](specs/credit-accounting/spec.md#scenario-sc-crd-11-provider-charge-does-not-reduce-a-failure-refund), [SC-CRD-13](specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant), [SC-CRD-14](specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure), [SC-GEN-13](specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined), [SC-GEN-14](specs/generation-lifecycle/spec.md#scenario-sc-gen-14-conflicting-duplicate-cannot-bypass-terminal-guard).

- [x] 4.4 Implement scripted persistent Mock provider fixtures. ✓ 2026-09-29
  - Evidence: `src/modules/generation/mock.ts` provides deterministic success, delay and failure observations with stable provider IDs and output keys.
  - Targets: `src/adapters/providers/mock/**`, `tests/fixtures/video/**`, `tests/fixtures/provider-scripts.ts`.
  - Depends on: 4.1.
  - Done when: Provide legally redistributable local video/image fixtures and success/failure/delay/unknown/replay scripts; selected scripts survive process restart, use shared normalized observations and are unmistakably demo-only.
  - Evidence: T01, T11, T12, T13; [SC-GEN-01](specs/generation-lifecycle/spec.md#scenario-sc-gen-01-local-journey-survives-a-restart), [SC-GEN-02](specs/generation-lifecycle/spec.md#scenario-sc-gen-02-mock-faults-exercise-real-domain-transitions).

- [x] 4.5 Implement persistent local worker, durable inbox/outbox and fenced leases. ✓ 2026-09-29
  - Evidence: `src/modules/generation/outbox.ts` and migration 0013 provide durable SKIP LOCKED leases; `scripts/probe-outbox-lease.ts` proves stale-owner fencing and persisted attempts.
  - Targets: `src/modules/generation/outbox.ts`, `src/modules/generation/inbox.ts`, `scripts/local-worker.ts`, `src/adapters/tasks/local.ts`.
  - Depends on: 4.2, 4.4.
  - Done when: Poll durable work with bounded batches; sixty-second leases/twenty-second heartbeat use owner/token/generation compare-and-set; persisted work resumes after scheduling or receipt crashes, while stale acknowledgments fail.
  - Evidence: T09, T12, T12.b, T20; [SC-GEN-02](specs/generation-lifecycle/spec.md#scenario-sc-gen-02-mock-faults-exercise-real-domain-transitions), [SC-GEN-11](specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover), [SC-GEN-12](specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease).

- [x] 4.6 Implement ambiguous-attempt recovery without paid-create replay. ✓ 2026-09-29
  - Targets: `src/modules/generation/dispatch.ts`, `src/modules/generation/reconcile.ts`, `tests/integration/unknown-submission.test.ts`.
  - Depends on: 4.2, 4.3, 4.5.
  - Done when: Thirty-second submit timeout enters unknown; exact provider/callback evidence is required, missing-ID scripts never send another create; sixty-minute/twenty-four-probe budget settles failure with correct compensation.
  - Evidence: T11, T12, T20, T53; [SC-GEN-07](specs/generation-lifecycle/spec.md#scenario-sc-gen-07-lost-response-never-triggers-a-second-paid-create), [SC-GEN-08](specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time).
  - Observed: `markSubmissionUnknown` enforces the 30-second boundary, persists one attempt, `reconcileSubmissionUnknown` caps missing-ID probes at 24/60 minutes, and `scripts/probe-generation-lifecycle.ts` proves no second claim and a single refund settlement.

- [x] 4.7 Implement independent deadline sweep and terminal fencing. ✓ 2026-09-29
  - Targets: `src/modules/generation/sweep-recovery.ts`, `src/db/schema/generation.ts`, `scripts/local-worker.ts`, `tests/integration/recovery-sweep.test.ts`.
  - Depends on: 4.3, 4.5, 4.6.
  - Done when: Ten-second local sweep scans indexed authoritative task deadlines independently of outbox health; enforce 10/60/30/90-minute budgets, eight materialization attempts and DB-time terminal arbitration; overdue recovery precedes post-outage progress.
  - Evidence: T12.a, T14, T20, T49, T53; [SC-GEN-09](specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner).
  - Observed: `sweepExpiredGenerationTasks` scans authoritative indexed deadlines independently of outbox state; migration `0015_materialization_attempts.sql` and the conditional increment in `materializeOutput` fence materialization at eight attempts. Lifecycle and race probes prove deadline refund and terminal arbitration.

- [x] 4.8 Implement local owned-asset materialization and bounded media validation. ✓ 2026-09-29
  - Targets: `src/modules/assets/ingest.ts`, `src/adapters/storage/local.ts`, `src/modules/assets/media-probe.ts`, `docker/local-worker.Dockerfile`.
  - Depends on: 4.3, 4.4.
  - Done when: Decode bounded input images; stream bounded outputs to deterministic private keys; verify bytes/hash/container/video/duration and integrity before ready; ffprobe uses fixed execFile arguments, local opaque paths, fifteen-second timeout, bounded output and disabled network protocols; recover upload-before-DB failures.
  - Evidence: T12, T13, T14; [SC-CRD-10](specs/credit-accounting/spec.md#scenario-sc-crd-10-only-durable-delivery-consumes), [SC-GEN-06](specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary), [SC-GEN-15](specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations), [SC-GEN-16](specs/generation-lifecycle/spec.md#scenario-sc-gen-16-object-and-metadata-finalization-are-recoverable).
  - Observed: private object writes reject traversal and symlink chains, output materialization requires bounded MP4/WebM headers and ready DB metadata, and the asset probe runs the fixed-argument 15-second `ffprobe` path against a generated 200 ms MP4.

- [x] 4.9 Implement authorized upload/download/delete interfaces. ✓ 2026-09-29
  - Targets: `src/app/api/workspaces/[w]/assets/**`, `src/modules/assets/authorize.ts`, `src/modules/assets/cleanup.ts`, `tests/integration/assets.test.ts`.
  - Depends on: 4.8, 3.5, 3.7.
  - Done when: Current membership gates assets and sixty-second download links; reject local path traversal/symlinks, unsafe images and foreign input IDs; active input deletion denied; one-hour incomplete uploads/twenty-four-hour orphan grace respected.
  - Evidence: T01, T02, T03, T14; [SC-IAM-07](specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access), [SC-IAM-08](specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session), [SC-GEN-15](specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations), [SC-GEN-17](specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance), [SC-GEN-18](specs/generation-lifecycle/spec.md#scenario-sc-gen-18-deletion-and-cleanup-preserve-active-references).
  - Observed: `scripts/probe-assets.ts` proves foreign workspace denial, 60-second token expiry, traversal/symlink denial and active input deletion denial; API routes are same-origin and membership-gated.

- [x] 4.10 Exercise crash boundaries, stale leases and concurrent terminal outcomes. ✓ 2026-09-29
  - Targets: `tests/integration/generation-crash.test.ts`, `tests/integration/outbox-fencing.test.ts`, `tests/integration/terminal-races.test.ts`.
  - Depends on: 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9.
  - Done when: Inject stops after reserve, claim, receipt, object upload and before settlement; test lost jobs, concurrent sweeps, stale ack and success-at-deadline; assert single business/credit effects and no repeated paid dispatch right.
  - Evidence: T09, T10, T11, T12, T12.a, T12.b, T19, T53, T60; [SC-CRD-07](specs/credit-accounting/spec.md#scenario-sc-crd-07-replay-after-external-deduplication-expires), [SC-CRD-08](specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation), [SC-GEN-09](specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner), [SC-GEN-11](specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover), [SC-GEN-12](specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease), [SC-GEN-13](specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined), [SC-GEN-14](specs/generation-lifecycle/spec.md#scenario-sc-gen-14-conflicting-duplicate-cannot-bypass-terminal-guard).
  - Observed: `scripts/probe-generation-races.ts` proves one cancel/claim winner, one terminal settlement with the competing result quarantined, consumed reservation lineage, and deadline recovery after a reserve-before-crash boundary. `scripts/probe-outbox-lease.ts` proves stale acknowledgement fencing.

- [x] 4.11 Complete local workspace UI and secret-free recovery signals. ✓ 2026-09-29
  - Targets: `src/app/(app)/**`, `src/modules/credits/queries.ts`, `src/modules/operations/telemetry.ts`, `internal/runbooks/local-recovery.md`.
  - Depends on: 4.7, 4.9, 3.11.
  - Done when: Wire workspace switcher, quote/submit, unknown/materializing/history, cancel, asset download and source/expiry credit views to real local commands; active/background polling at 3/10 seconds stops at terminal; correlated recovery evidence and mismatch/heartbeat alerts contain no secrets.
  - Evidence: T01, T07, T08, T20, T49; [SC-CRD-15](specs/credit-accounting/spec.md#scenario-sc-crd-15-user-can-explain-a-mixed-refund), [SC-CRD-16](specs/credit-accounting/spec.md#scenario-sc-crd-16-mismatch-never-silently-repairs-history), [SC-GEN-19](specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation), [SC-GEN-20](specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free).
  - Observed: dashboard routes now render real credit source/expiry/reconciliation rows, private ready-asset download links, task status/deadline/recovery state and queued cancellation; `next build` includes all local workspace routes.

- [x] 4.13 Implement team creation, membership and ownership product UI. ✓ 2026-10-01
  - Targets: `src/app/(app)/workspaces/new/page.tsx`, `src/app/(app)/workspaces/[w]/settings/members/page.tsx`, `src/app/(auth)/invitations/accept/page.tsx`, `src/components/workspaces/ownership-transfer.tsx`, `tests/e2e/workspace-membership.spec.ts`.
  - Depends on: 3.3, 3.4, 3.5, 3.7, 4.11.
  - Done when: Deliver team creation, invite creation/acceptance, member list/removal and owner transfer against real domain commands. Browser journeys prove owner/member permissions, verified eligible transfer with recent authentication, invite replay/expiry, personal-workspace restrictions and immediate post-removal denial in an already open tab; server checks remain authoritative. This task is placed before the unchanged 4.12 gate to preserve stable IDs.
  - Evidence: T02, T03, T05, T05.a; [SC-IAM-03](specs/identity-workspaces/spec.md#scenario-sc-iam-03-personal-workspace-rejects-team-operations), [SC-IAM-04](specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection), [SC-IAM-05](specs/identity-workspaces/spec.md#scenario-sc-iam-05-accept-invitation-exactly-once), [SC-IAM-06](specs/identity-workspaces/spec.md#scenario-sc-iam-06-reject-expired-or-mismatched-invitation), [SC-IAM-07](specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access), [SC-IAM-08](specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session).
  - Observed: Final candidate browser evidence (internal/evidence/M3/browser-walkthrough-20261001.json) proves team/invitation creation, acceptance/replay/expiry, owner transfer, member removal, personal restrictions and revoked access in an already-open tab. Both submitted owner operations returned POST 200; the final roster contains one owner. Current isolated team/access/tenant probes and three independent ownership-contention runs passed. See internal/evidence/M3/final-stage-review-20261001.json for the independent decision.

- [x] 4.12 Close the M3 persistent local vertical-slice and Mock demo gate. ✓ 2026-10-01
  - Targets: `internal/evidence/M3/**`, `tests/e2e/local-demo.spec.ts`, `tests/integration/**`.
  - Depends on: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13.
  - Done when: A clean no-cloud local run completes sign-in→workspace→Mock→durable download with restart, cancellation, failure, mixed expiry and unknown exhaustion; the 4.13 owner/member browser journeys prove team creation/invitations/removal/transfer, personal restrictions and post-removal denial; fixture billing, operations/admin views and all implemented local route states are exercised. All applicable IAM/CRD/GEN cases pass. Freeze shared generation/credit/asset contracts for parallel M4 and M5; label Mock proof accurately and keep real provider/payment/production evidence pending.
  - Evidence: T01, T02, T03, T09, T10, T12, T13, T14, T15, T16, T17, T18, T19, T20, T49, T53; [SC-GEN-01](specs/generation-lifecycle/spec.md#scenario-sc-gen-01-local-journey-survives-a-restart), [SC-GEN-03](specs/generation-lifecycle/spec.md#scenario-sc-gen-03-cancel-wins-the-dispatch-race), [SC-GEN-06](specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary), [SC-GEN-08](specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner), [SC-GEN-12](specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease), [SC-GEN-13](specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined), [SC-GEN-17](specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance), [SC-GEN-19](specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation).
  - Acceptance: Apply M3 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Observed: The historical PASS remains scoped to its original candidate. Current candidate evidence is in `internal/evidence/acceptance/M3/working-tree-20261022-current-r5/record.json`; all current criteria, local probes, HTTP checks, browser journeys, UI checks, digest freshness, cleanup and 84.04% owned branch coverage pass. Independent review and integration decision are deferred to the final manual-acceptance queue and do not block M4/M5 automated work. Local Mock scope only.

## 5. M4 — Real providers and durable execution

- [x] 5.1 Freeze the shared provider port and four versioned model schemas. ✓ 2026-10-01
  - Targets: `src/adapters/providers/port.ts`, `src/config/models.ts`, `internal/contracts/providers/**`, `tests/contracts/provider-inputs.test.ts`.
  - Depends on: 4.12.
  - Done when: Define capabilities/validate/submit/getStatus/readResult/verifyWebhook once; freeze selected endpoint/version/schema digests, client DTOs, safe preset, quote/deadline snapshot and cropped owned-image consent; no unverified idempotency or mutable-build claims.
  - Evidence: T02, T11, T13, T20; [SC-PRV-02](specs/provider-integrations/spec.md#scenario-sc-prv-02-contract-drift-is-explicit), [SC-PRV-03](specs/provider-integrations/spec.md#scenario-sc-prv-03-image-ratio-is-realized-through-approved-crop), [SC-PRV-04](specs/provider-integrations/spec.md#scenario-sc-prv-04-unapproved-parameters-do-not-reach-providers), [SC-PRV-05](specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely), [SC-PRV-06](specs/provider-integrations/spec.md#scenario-sc-prv-06-persisted-contract-survives-configuration-changes).
  - Observed: All four official schema files and exact version/digest provenance are retained in internal/contracts/providers/manifest.json. Thirteen contract tests cover strict crop consent, safe vendor mapping, unknown submissions and accepted historical catalog mapping. A thin ProviderPort bridge reuses persistent Mock functions; real dispatch, crop UI and callback authentication remain later tasks. Independent local task review: internal/evidence/acceptance/foundations-20261001/independent-review.json.
  - Observed: All four official schema files and exact version/digest provenance are retained in internal/contracts/providers/manifest.json. Thirteen contract tests cover strict crop consent, safe vendor mapping, unknown submissions and accepted historical catalog mapping. A thin ProviderPort bridge reuses persistent Mock functions; real dispatch, crop UI and callback authentication remain later tasks. Independent local task review: internal/evidence/acceptance/foundations-20261001/independent-review.json.

- [x] 5.2 Implement pinned Replicate T2V and I2V adapters. ✓ 2026-10-01
  - Targets: `src/adapters/providers/replicate/**`, `tests/contracts/replicate.test.ts`.
  - Depends on: 5.1.
  - Done when: POST pinned prediction versions with safe input mapping; I2V has image and no unsupported aspect_ratio; persist prediction ID, normalize output URI and failure, disable automatic create retries and prove lost-response behavior.
  - Evidence: T11, T12, T13, T20; [SC-PRV-01](specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video), [SC-PRV-03](specs/provider-integrations/spec.md#scenario-sc-prv-03-image-ratio-is-realized-through-approved-crop), [SC-PRV-05](specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely), [SC-PRV-09](specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend).

- [x] 5.3 Implement fal queue T2V and I2V adapters. ✓ 2026-10-01
  - Targets: `src/adapters/providers/fal/**`, `tests/contracts/fal.test.ts`.
  - Depends on: 5.1.
  - Done when: Use selected queue endpoints, X-Fal-No-Retry: 1, persisted request ID and validated tracking origins; normalize result video.url and distinguish queue COMPLETED from actual success; do not invent missing-ID lookup.
  - Evidence: T11, T12, T13, T20; [SC-PRV-01](specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video), [SC-PRV-04](specs/provider-integrations/spec.md#scenario-sc-prv-04-unapproved-parameters-do-not-reach-providers), [SC-PRV-05](specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely), [SC-PRV-09](specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend), [SC-PRV-10](specs/provider-integrations/spec.md#scenario-sc-prv-10-missing-id-similarity-is-not-ownership-evidence).

- [x] 5.4 Implement provider-specific raw-body webhook verification and reconciliation. ✓ 2026-10-04 (local contract slice)
  - Targets: `src/app/api/webhooks/replicate/[attemptNonce]/route.ts`, `src/app/api/webhooks/fal/[attemptNonce]/route.ts`, `src/adapters/providers/*/webhook.ts`, `tests/contracts/provider-webhooks.test.ts`.
  - Depends on: 5.2, 5.3.
  - Done when: Implement documented Replicate HMAC and fal ED25519/JWKS/account/time checks, raw-byte integrity and exact nonce/request mapping; durable inbox ack precedes processing; forged/stale/wrong-account/replayed/late events preserve domain terminal rules.
  - Evidence: T09, T19, T22, T53; [SC-PRV-07](specs/provider-integrations/spec.md#scenario-sc-prv-07-reject-forged-stale-or-wrong-account-observations), [SC-PRV-08](specs/provider-integrations/spec.md#scenario-sc-prv-08-authenticated-callback-is-durable-and-replay-safe), [SC-GEN-07](specs/generation-lifecycle/spec.md#scenario-sc-gen-07-lost-response-never-triggers-a-second-paid-create), [SC-GEN-08](specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time), [SC-GEN-13](specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined).
  - Observed: Replicate HMAC-SHA256 and fal ED25519 raw-body verification bind the event, timestamp, exact request and attempt nonce; accepted observations are persisted in a deduplicated provider inbox before optional processing. See `internal/evidence/M4/task-5.4/README.md`.

- [x] 5.5 Connect shared dispatch, outbox pump and fenced recovery jobs. ✓ 2026-10-04 (local contract slice; runtime default amended 2026-10-15)
  - Targets: `src/adapters/tasks/trigger.ts`, `trigger/dispatch.ts`, `trigger/reconcile.ts`, `trigger/outbox.ts`.
  - Depends on: 5.2, 5.3, 5.4.
  - Done when: The buyer-owned worker is the default outbox execution path and the optional Trigger entrypoint invokes the same shared domain commands with durable IDs; the selected runtime recovers missed scheduling; retries and expired leases resume safe reconciliation, never create another paid submission.
  - Evidence: T09, T11, T12, T12.b, T20; [SC-GEN-11](specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover), [SC-GEN-12](specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease), [SC-PRV-09](specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend).
  - Observed: Thin Trigger adapters use the existing fenced outbox lease, heartbeat, acknowledge/release/fail path and shared generation commands; retries never call a second paid create. See `internal/evidence/M4/task-5.5/README.md`.

- [x] 5.6 Deploy independent production recovery schedule and maintenance command. ✓ 2026-10-04 (local contract slice)
  - Targets: `trigger/sweep-recovery.ts`, `scripts/reconcile-overdue.ts`, `src/modules/generation/sweep-recovery.ts`, `internal/runbooks/generation-recovery.md`.
  - Depends on: 5.5.
  - Done when: The self-hosted worker performs the production recurring scan by default, while the optional Trigger schedule may invoke the same sweep; both read authoritative task deadlines even with dead/missing original runs; authenticated maintenance command uses the same sweep; missing heartbeat over three minutes alerts; stale lease/concurrent sweep/outage recovery retains one terminal effect.
  - Evidence: T12.a, T12.b, T20, T49, T53; [SC-GEN-09](specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner), [SC-GEN-20](specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free), [SC-PRV-09](specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend).
  - Observed: The isolated self-hosted worker exposes a ten-second recovery loop, `src/trigger/sweep-recovery.ts` retains runtime-neutral timer helpers, and `scripts/reconcile-overdue.ts` invokes the authoritative deadline sweep. These helpers do not constitute hosted task registration. See `internal/runbooks/generation-recovery.md`.
  - Runtime amendment (2026-10-15): `TASK_RUNTIME=self_hosted` defaults without Trigger credentials. The isolated worker drains overdue batches before dispatch and reports independent loop freshness. `TASK_RUNTIME=trigger` fails closed until executable scoped registration/deployment exists. Disposable fixture coverage does not close the selected-runtime live restart, independently persisted heartbeat and alert-delivery obligations.

- [x] 5.7 Integrate private S3/R2 output ingestion and worker media tooling. ✓ 2026-10-04 (local contract slice)
  - Targets: `src/adapters/storage/s3.ts`, `trigger/materialize.ts`, `trigger.config.ts`, `src/modules/assets/**`.
  - Depends on: 5.4, 5.5.
  - Done when: Implement bounded HTTPS/DNS/redirect-safe fetch and deterministic private uploads with HEAD/hash/media checks; package the selected media probe with version/hash/notices; output expiry/repeated copy and orphan recovery follow the 30-minute/eight-attempt budget. The asset boundary must support local filesystem for demo/acceptance and one S3-compatible private object-store adapter covering Cloudflare R2, AWS S3 and MinIO contract tests.
  - Evidence: T02, T12, T13, T14; [SC-GEN-15](specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations), [SC-GEN-16](specs/generation-lifecycle/spec.md#scenario-sc-gen-16-object-and-metadata-finalization-are-recoverable), [SC-GEN-17](specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance), [SC-GEN-18](specs/generation-lifecycle/spec.md#scenario-sc-gen-18-deletion-and-cleanup-preserve-active-references), [SC-PRV-11](specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery).
  - Observed: Remote provider candidates use bounded HTTPS-only fetches with DNS/redirect/private-address/MIME/size checks and then reuse the private asset materialization boundary. Local assets, cleanup, provider materialization and the unified S3-compatible transport contract are verified in `internal/evidence/M4/task-5.7-storage-contract.json`. Live Cloudflare R2 PUT/HEAD/GET/hash/list/delete and exact cleanup passed in `internal/evidence/M4/task-5.7-r2-live-adapter.json`; AWS S3 live connectivity remains pending.
  - Storage amendment tasks (2026-10-10):
    - [x] 5.7.a Define `PrivateObjectStore` and migrate upload, provider materialization, authorized download, delete and orphan cleanup to the port while preserving the local adapter. ✓ 2026-10-10 (local runtime and PostgreSQL probes)
    - [x] 5.7.b Implement one AWS SDK S3-compatible adapter for Cloudflare R2 and AWS S3, with endpoint/region/bucket/credential configuration and no provider-specific domain branches. ✓ 2026-10-10 (transport contract; cloud bucket connectivity deferred to release testing)
    - [x] 5.7.c Add MinIO or equivalent S3-compatible contract probes, private-object and failure-recovery tests, and production fail-closed configuration validation. ✓ 2026-10-10 (mocked S3 command contract, local asset/cleanup probes, production config guard)
    - [x] 5.7.d Add the production S3-profile orphan-cleanup schedule entry point with bounded workspace batches, persistent progress and per-workspace failure isolation. ✓ 2026-10-10 (Trigger cron entrypoint and isolated R2 lifecycle probe; not hosted deployment proof)
      - Amendment (2026-10-15): Shared batch cleanup now lives in `src/modules/assets/cleanup-batch.ts`; the previous path is a compatibility export without SDK loading or automatic all-workspace registration. The isolated self-hosted worker owns its workspace-scoped cleanup loop. Optional hosted cleanup must obtain scoped deployment proof before activation; the historical receipt remains unchanged.

- [x] 5.8 Wire production capability health, redacted metrics and recovery runbook. ✓ 2026-10-04 (local contract slice)
  - Targets: `src/modules/operations/integration-health.ts`, `src/modules/operations/telemetry.ts`, `internal/runbooks/provider-operations.md`, `src/app/(app)/**`.
  - Depends on: 5.6, 5.7.
  - Done when: Correlate task/attempt/provider/cost evidence; alert unknown age at thirty minutes, outbox lag over five minutes and sweep heartbeat over three; provider outage degrades affected capability while auth/history remain usable; support uses authorized safe commands.
  - Evidence: T15, T20, T49; [SC-GEN-19](specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation), [SC-GEN-20](specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free), [SC-PRV-11](specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery).
  - Observed: Provider health classifies healthy/degraded/unavailable states at the documented unknown-age threshold; telemetry emits only bounded correlation/status fields. See `internal/runbooks/provider-operations.md`.

- [x] 5.9 Collect deterministic integration failure and controlled recovery evidence. ✓ 2026-10-04 (local contract slice)
  - Targets: `tests/contracts/providers/**`, `tests/integration/provider-recovery.test.ts`, `internal/evidence/M4/failure-cases/**`.
  - Depends on: 5.4, 5.5, 5.6, 5.7, 5.8.
  - Done when: Exercise lost submit response, false completion, forged/reordered callbacks, storage failure, stale leases, deadline race and late success; use fixtures for unsafe cases and authorized account-backed negative evidence only where safe; preserve credit/cost separation.
  - Evidence: T09, T11, T12, T13, T14, T15, T19, T20, T22, T49, T53; [SC-GEN-08](specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner), [SC-GEN-12](specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease), [SC-GEN-13](specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined), [SC-PRV-07](specs/provider-integrations/spec.md#scenario-sc-prv-07-reject-forged-stale-or-wrong-account-observations), [SC-PRV-08](specs/provider-integrations/spec.md#scenario-sc-prv-08-authenticated-callback-is-durable-and-replay-safe), [SC-PRV-09](specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend), [SC-PRV-10](specs/provider-integrations/spec.md#scenario-sc-prv-10-missing-id-similarity-is-not-ownership-evidence), [SC-PRV-11](specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery).
  - Observed: The deterministic provider-recovery probe passes signature, stale-event, capability-degradation and secret-redaction cases. It is fixture evidence and does not close 5.10. See `internal/evidence/M4/task-5.9/README.md`.

- [x] 5.10 Close the M4 four-row real-provider and durable-output gate. ✓ 2026-10-17
  - Current development record: `internal/evidence/acceptance/M4/m4-current-20261029/record.json`.
  - Current candidate source tree SHA-256: `bf491d2dfb3c6260e89a4db2c07220cef98fa4ac3e162d9890a085c6294532ca`. Retained local install, typecheck, lint, format, database-boundary, OpenSpec, contract, billing-schema and production-build commands passed against source tree 03a98cc01995e498df99f181b887c687d1ab5e05c90c86a91819ecb9b35005aa and were not re-executed after the server-side Turnstile request-gate fix. Point-in-time hosted web and worker health reads are retained. A later controlled hosted four-path create/settle/verify on Railway worker `shpitto-m4-worker` (production) is recorded as done: one paid POST per path, stage verified, task succeeded, reservation consumed, quoted credits 10, private hash PASS, owner HTTP 200, outsider/wrong/expired token 403, authenticated account callback true, provider cost UNKNOWN. Evidence: `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261029/`. After the four paths the worker was returned to paused with creates disabled. A later selected self-hosted recovery drill on `shpitto-m4-staging` production is recorded as `PASS_SELECTED_SELF_HOSTED_RECOVERY_DRILL`: run `9b0d0a5d-2bf7-4958-832e-40fef041dfb0`, workspace `fc4b6bb4-eccc-431e-ac49-bc8241bd1b90`, incident `9525d623-9d2b-4856-930c-ed43b30e62bf`, 102 deadline-exceeded tasks, 102 reservation releases, unknown-submission fence preserved, zero paid provider requests, and recovery-monitor `/healthz` ready with `deliveryPending=false`. Evidence: `internal/evidence/M4/task-5.10/railway-worker/recovery-drill-20261029/`. Web `SHPITTO_RECOVERY_*` observe recipient env was missing at drill start and was restored mid-drill before delivery. The worker was left active with creates disabled. Historical provider evidence is not promoted. Task 5.10 stays blocked in the development record because negative callback and financial-idempotence cases, numeric deadline and probe configuration, storage-failure fault suites, owned-module coverage, current M3 equivalence and independent review were not re-verified.
  - Current revalidation (2026-10-17): Disposable PostgreSQL verification passed with 1,698/2,025 owned branches (83.85%) and zero paid provider calls; the signed webhook replay/crash suite passed 6/6; the isolated Railway recovery drill passed with 102 overdue tasks, 102 reservation releases, restored worker heartbeat and worker state `active`. Evidence root: `internal/evidence/M4/task-5.10/railway-worker/revalidation-20261017/`.
  - Scope boundary: selected self-hosted demo profile only. Trigger.dev remains optional and fail-closed; AWS S3 live connectivity, production email, Stripe transactions, historical anomalous-balance recovery and any further provider creates are outside this acceptance.
  - Independent slice reviews (2026-10-15): Code and security review pass for the self-hosted runtime amendment; reviewers independently reran nine and 31 local tests respectively. Evidence: `internal/evidence/M4/task-5.10/railway-worker/self-hosted-runtime-review-20261015.md` and `internal/evidence/M4/task-5.10/railway-worker/self-hosted-runtime-security-review-20261015.md`. These reviews do not approve whole M4 or deployment. Unchanged Docs build-tracing warnings require exact packaged-content inspection before deployment.
  - Subsequent local verification (2026-10-15): 203 contracts/units, 16 disposable PostgreSQL worker/helper cases and 14 deterministic generation/asset/credit/crash probe groups pass. Current M4-owned branch coverage is 1530/1848 (82.79%) with no missing sources, including runtime selection, task adapters, catalog/configuration, independent loop lifecycle and recovery telemetry. Fixture environment-file loading is blocked, all database/assets are newly created, and the temporary container/assets are removed. Evidence: `internal/evidence/M4/task-5.10/railway-worker/local-fixture-validation-20261015.json`. Selected self-hosted deployment/recovery/monitoring proof, authentic remaining rows, current M3 applicability and whole-stage approval remain open. Trigger profile evidence is optional and does not block this baseline; no paid generation was submitted.
  - Verification refresh (2026-10-15): The earlier current-root dependency replacement has independent policy/implementation review; it retains historical prototype/provenance, exact lock/workspace configuration and complete dependency-map checks. Its 178 related contracts/units and 13 disposable Railway PostgreSQL fake-transport cases, frozen-lock install, build and audit receipts remain historical scoped evidence. The retained authorized Fal output passed private hash/media and negative HTTP capability checks; temporary auth sessions were zero. Fresh-prefix R2 live and development-record receipts are under `internal/evidence/M4/task-5.10/railway-worker/remaining-validation-20261015.json`. The amended runtime has separate current local verification and independent code-slice review; neither is a new deployment or whole-stage approval. M4 remains IN_PROGRESS for remaining application outcomes, Replicate binding, selected-runtime deployment/recovery/monitoring and complete scenario/current-M3 applicability; whole-stage review is deferred to the final manual-acceptance queue. No new paid provider request was made.
  - Verified (2026-10-13, authorized live Fal T2V): One queue POST was accepted at the fixed 720p/81-frame/16-FPS request preset (USD0.405 reference estimate; actual provider cost UNKNOWN). A JWKS-verified callback confirmed the account binding and processed the inbox. The real Railway worker published a hashed private R2 video, consumed the seeded 10-credit reservation once, and passed owner/outsider/anonymous/expired/wrong-asset HTTP authorization checks. Scheduled cleanup removed one newly created, synthetically aged orphan while retaining the ready output. A paused worker restart preserved output downloads; temporary auth sessions were removed. 115 related contracts, typecheck, lint, format, config/DB boundaries, production build, strict OpenSpec and dependency audit pass. Full acceptance still rejects stale candidate digests; four-row/selected-runtime/independent whole-stage closure is not claimed. Evidence: `internal/evidence/M4/task-5.10/railway-worker/fal-authorized-bootstrap-20261013.json`.
  - Verification refresh (2026-10-14): M4/M5/M6 current development fingerprints are synchronized and `verify:acceptance` passes. Quality gates pass, but `verify:root` still reports the selected-stack dependency/lockfile baseline divergence; this is a separate provenance decision. M4 remains open for the complete provider matrix, selected-runtime acceptance and independent whole-stage review.
  - Authorization (2026-10-13): Exactly one isolated Fal T2V bootstrap is authorized at 720p, 81 frames and 16 FPS with a USD1 ceiling checked against the authenticated reference price. Use a fresh seeded acceptance workspace and a durable no-resubmit fence; never retry an uncertain POST. Normal background paid creates stay disabled. Account confirmation and authentic runtime evidence are pending, not yet PASS.
  - Progress (2026-10-13, Fal key preflight): The updated Fal key is present in both Railway services and runtime-loaded. An authenticated read-only pricing GET returned 200 while an invalid-key negative control returned 401; two target model pricing rows and two official JWKS keys were verified. The account binding remains unconfirmed and the callback guard correctly stops before a queue POST. Worker remains paused; zero new inference requests. Evidence: `internal/evidence/M4/task-5.10/railway-worker/fal-key-preflight-20261013.json`.
  - Observed (2026-10-13): Separate Railway provider worker and companion Web are deployed successfully. Startup isolation, pre-POST fencing, authenticated lost-ID adoption, atomic inbox processing and late-event quarantine are implemented. 145 focused contracts, 13 disposable PostgreSQL fixture cases, fresh R2 input capability integrity/cleanup and a controlled healthy restart pass. Deployment remains paused with no paid creates; authentic live callbacks/settlement and selected-runtime acceptance remain open, while whole-stage review is deferred to the final manual-acceptance queue. Evidence: `internal/evidence/M4/task-5.10/railway-worker/record.json`. The prior M4 candidate digests are stale and are not carried as current PASS evidence.
  - Progress (2026-10-13): A separate Railway acceptance provider worker is being implemented with an explicit project/workspace allowlist, a durable pre-POST submission fence, exact-ID polling, authenticated inbox processing, private output materialization and idempotent credit settlement. Deployment starts paused with new paid creates disabled; a healthy worker alone cannot close M4.
  - Progress (2026-10-11): fal.ai webhook integration must use the documented `fal_webhook` submission parameter and JWKS verification from `https://rest.fal.ai/.well-known/jwks.json`; no operator-managed PEM is required. Task 5.10 remains open until authentic callback, provider settlement, recovery evidence and independent review are complete.
  - Progress (2026-10-09): fal token supplied. Public schemas for T2V/I2V are readable, but queue authentication requires POST and no paid submission was created. 5.10 remains open pending capped-spend authorization, webhook identity, and real T2V/I2V evidence.
  - Progress (2026-10-09): One fal T2V queue POST was attempted with the funded token, but status polling returned HTTP 405 before request identity was persisted. No retry was made. Cost/result are unresolved; repair Key auth/dynamic status URL persistence and reconcile the attempt before another paid request. 5.10 remains open.
  - Progress (2026-10-09): Read-only account authentication passed for giantclam. Current API latest versions are now pinned and schema hashes refreshed: T2V c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d, I2V 4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea. Input/output contract compatibility passed; no prediction was created. 5.10 remains open pending paid T2V/I2V evidence.
  - Progress (2026-10-09): One controlled Replicate T2V prediction succeeded with the refreshed pin. Prediction wxrfrzbt1drmt0d141n98vhsxr, status succeeded, 98.37s total, 720p/1280x720, 81 frames at 16 FPS, 5.0625s output, media SHA-256 dcd63e34952a28c8f897f30c15b5d325f8bd004d76aa6f547e216ff52d4affef; evidence internal/evidence/M4/task-5.10/replicate-t2v-real-smoke.json. Polling was used because no webhook endpoint was configured. This is one real T2V row only; I2V, authenticated webhook, private ingestion, credit settlement, cost confirmation and fal rows remain open.
  - Progress (2026-10-10): Repaired fal adapter handling after the unresolved paid attempt: dynamic status_url/response_url values are validated and persisted atomically with providerRequestId in migration 0026, live auth uses Authorization: Key, and modern request/user/timestamp webhook headers with newline canonical signing are covered. PostgreSQL lifecycle probe confirms tracking URLs survive persistence; provider contracts pass 37/37. The original paid fal request remains unresolved; no retry was submitted before the adapter repair and explicit paid-run authorization. 5.10 remains open.
  - Progress (2026-10-10): With explicit paid-request authorization, one repaired fal T2V and one repaired fal I2V request completed successfully. Dynamic status/result URLs were persisted in run records, both outputs downloaded and media-probed as H.264 1280x720, 81 frames, approximately 5.07 seconds; evidence is internal/evidence/M4/task-5.10/fal-real-run-summary.json. Webhook delivery, private application storage materialization, provider cost confirmation and real reservation settlement remain open; independent review is deferred to the final manual-acceptance queue and 5.10 remains open.
  - Progress (2026-10-10): The already-paid fal T2V/I2V bytes passed the application-owned private lifecycle against the isolated R2 bucket and a disposable PostgreSQL database: ready asset publication, current-membership authorization, sixty-second token binding, exact SHA-256 download, authorized deletion and scheduled orphan cleanup all passed; all generated objects and the database were removed. Evidence: `internal/evidence/M4/task-5.10/fal-private-lifecycle-r2.json` and `internal/evidence/M4/task-5.7-r2-live-adapter.json`. No new provider request was created. Replicate I2V, authenticated callbacks, provider cost and real credit settlement remain open; independent review is deferred to the final manual-acceptance queue and 5.10 remains open.
  - Requirement amendment (2026-10-10): Private provider output storage is now explicit: local filesystem for local/demo, one S3-compatible adapter for Cloudflare R2 and AWS S3, and MinIO only for contract tests. See internal/research/private-storage-options-2026-10-10.md and REQ-PRV-07/SC-PRV-13/SC-PRV-14.
  - Progress (2026-10-11): One explicitly authorized Replicate I2V request completed against the pinned version using the captured public test image; prediction `0kwz3zvawxrmt0d15168x8c3rm` returned one output and the downloaded H.264 MP4 is 1,243,405 bytes, SHA-256 `9bbe15a33f782148a1c7b944dd5b67915f99c2a18fd8dc72d5c3857f40a63c25`, 5.0625 seconds at 16 FPS. Replicate T2V and I2V output bytes each passed the isolated R2/private PostgreSQL materialization, ready publication, authorized download, deletion and scheduled orphan-cleanup probes. Evidence: `replicate-i2v-real-run.json`, `replicate-t2v-private-lifecycle-r2.json`, `replicate-i2v-private-lifecycle-r2.json`, and `internal/evidence/M4/provider-matrix.md`. No retry or further provider request was made. Authenticated callbacks, real domain reservation settlement, provider cost confirmation (currently explicitly unknown) remains open; independent review is deferred to the final manual-acceptance queue and 5.10 remains open.
  - Targets: `internal/evidence/M4/provider-matrix.md`, `internal/evidence/M4/**`, `tests/e2e/provider-generation.spec.ts`.
  - Depends on: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9.
  - Done when: Under explicitly supplied accounts/budget, obtain successful T2V and I2V for both providers, exact contract/request IDs, durable download into the configured private object store, media/credit/cost outcomes and negative-case evidence. Local, Cloudflare R2 and AWS S3 profiles share one asset contract; unavailable resources remain visibly blocked and Mock cannot substitute. All PRV and production GEN cases pass before G03/G10 close.
  - Evidence: T13, T14, T15, T20, T49, T53; [SC-PRV-01](specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video), [SC-PRV-02](specs/provider-integrations/spec.md#scenario-sc-prv-02-contract-drift-is-explicit), [SC-PRV-12](specs/provider-integrations/spec.md#scenario-sc-prv-12-unavailable-paid-evidence-keeps-gate-open), [SC-GEN-06](specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary), [SC-GEN-08](specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time), [SC-GEN-10](specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner).
  - Acceptance: Apply M4 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.


## 6. M5 — Stripe billing

- [x] 6.1 Define reviewed billing schema and catalog contracts. ✓ 2026-10-01
  - Paths: `src/db/schema/billing.ts`, `src/db/migrations/*`, `src/config/plans.ts`, `src/modules/billing/contracts.ts`.
  - Depends: 4.12.
  - Work: Add checkout attempts/unique live slot, canonical payment aliases, immutable cash-event identity, historical customer mappings and fenced reconciliation fields. Define monthly-only approved products and domain DTOs; review tenant foreign keys, money/credit units and migration ownership.
  - Evidence: SC-BIL-01, SC-BIL-02, SC-BIL-07, T21.
  - Observed: Migration 0016 and six contract tests pass 44 PostgreSQL constraints/upgrade assertions, including ten-way Checkout contention, tenant/provider/currency foreign keys, immutable cash/customer identities and lease fencing. Existing status/credits survive upgrade. Production catalog remains empty; downstream billing scenarios require Checkout/reconciliation implementation. Independent local task review: internal/evidence/acceptance/foundations-20261001/independent-review.json.
  - Observed: Migration 0016 and six contract tests pass 44 PostgreSQL constraints/upgrade assertions, including ten-way Checkout contention, tenant/provider/currency foreign keys, immutable cash/customer identities and lease fencing. Existing status/credits survive upgrade. Production catalog remains empty; downstream billing scenarios require Checkout/reconciliation implementation. Independent local task review: internal/evidence/acceptance/foundations-20261001/independent-review.json.

- [x] 6.2 Implement guarded Checkout and portal commands. ✓ 2026-10-01
  - Paths: `src/modules/billing/checkout.ts`, `src/app/api/workspaces/[w]/billing/checkout/route.ts`, `src/app/api/workspaces/[w]/billing/portal/route.ts`, `src/adapters/billing/stripe.ts`.
  - Depends: 6.1.
  - Work: Bind owner/workspace/catalog, persist attempts before network calls, reconcile lost responses with the same Stripe key, release slots only from authoritative outcomes, and deny Checkout during billing hold. Configure portal without recurring-price changes, annual purchase, scheduling or proration.
  - Evidence: SC-BIL-01, SC-BIL-02, SC-BIL-03, T23.

- [x] 6.3 Implement authenticated durable Stripe webhook intake. ✓ 2026-10-01
  - Paths: `src/app/api/webhooks/stripe/route.ts`, `src/adapters/billing/stripe-webhooks.ts`, `src/modules/billing/inbox.ts`.
  - Depends: 6.1.
  - Work: Verify raw-body signatures, cap and minimize payloads, persist verified event identity before acknowledgement, and map the supported event set to one reconciliation command. Specify forged, replay, delayed and return-URL-negative cases before implementation.
  - Evidence: SC-BIL-04, SC-BIL-05, SC-BIL-06, T22, T24.

- [x] 6.4 Implement canonical payment reconciliation and grant issuance. ✓ 2026-10-01
  - Paths: `src/modules/billing/reconcile-payment.ts`, `src/modules/billing/payment-aliases.ts`, `src/modules/credits/commands.ts`, `src/adapters/billing/stripe.ts`.
  - Depends: 6.1, 6.3.
  - Work: Resolve invoice/session/PaymentIntent aliases, acquire a reconciliation fence, fetch authoritative state outside the transaction, and apply only the current generation under the documented lock order. Atomically commit payment projection, grant/reversal, holds, result, audit and downstream intent; reject unsupported invoices.
  - Evidence: SC-BIL-06, SC-BIL-07, SC-BIL-08, SC-BIL-14, SC-BIL-15, SC-BIL-16, T21, T24, T60.

- [x] 6.5 Implement subscription lifecycle and customer history. ✓ 2026-10-04
  - Paths: `src/modules/billing/subscriptions.ts`, `src/modules/billing/customer-history.ts`, `src/config/plans.ts`.
  - Depends: 6.2, 6.4.
  - Work: Mirror status without granting, retain original period expiry, support cancel-at-period-end followed by new purchase only after termination, and audit customer replacement while preserving mapping/eligibility history. Record future-only catalog updates; expose no scheduled-plan-change feature.
  - Evidence: SC-BIL-07, SC-BIL-08, SC-BIL-09, SC-BIL-10, T23, T26.
  - Observed: Local fixture implementation mirrors status without issuing grants, preserves the original period expiry, enforces cancel-at-period-end replacement rules, and records append-only customer replacement history. See `internal/evidence/M5/task-6.5-6.9/README.md` and the Docker PostgreSQL reconciliation probe.

- [x] 6.6 Implement cash-refund and dispute recovery rules. ✓ 2026-10-04
  - Paths: `src/modules/billing/recovery.ts`, `src/modules/credits/reversals.ts`, `src/modules/generation/create.ts`.
  - Depends: 6.4.
  - Work: Revoke only wholly unused/unreserved full-refund grants. Persist partial/reserved/consumed/dispute cases; enforce hold before new reservations and Checkout while active work settles. Deduplicate economic losses and restore only eligible original-expiry entitlement after case resolution.
  - Evidence: SC-BIL-11, SC-BIL-12, SC-BIL-13, SC-BIL-14, SC-BIL-15, T28.
  - Observed: Full unused refunds void only the matching grant; partial/exposed refunds and disputes create holds/cases; reversed disputes resolve once and release the hold. Ledger, audit and outbox reversal evidence is committed in the same transaction. See `internal/evidence/M5/task-6.5-6.9/README.md`.

- [x] 6.7 Prove reconciliation races and recovery on PostgreSQL. ✓ 2026-10-04
  - Paths: `tests/integration/billing/reconciliation.test.ts`, `tests/integration/billing/checkout.test.ts`, `tests/fixtures/stripe/*`.
  - Depends: 6.2, 6.4, 6.5, 6.6.
  - Work: Execute deterministic refund-before-paid, dispute-before-paid, concurrent grant/refund/reserve, stale-fetch fencing, simultaneous Checkout, lost-response and failure-rollback cases against real local PostgreSQL. Capture unique-order/grant and no-orphan-credit assertions; mocks alone cannot prove transactions.
  - Evidence: SC-BIL-02, SC-BIL-06, SC-BIL-14, SC-BIL-15, SC-BIL-16, T22, T24, T60.
  - Observed: Docker-backed PostgreSQL probe passes 18 cases, including refund-before-payment, concurrent paid observations converging to one order/grant, stable refund lost-response reconciliation, and owner billing projection isolation. See `internal/evidence/M5/task-6.5-6.9/README.md` and `.omx/docker-probe-billing-reconciliation.log`.

- [x] 6.8 Implement truthful owner billing and credit views. ✓ 2026-10-04
  - Paths: `src/app/(app)/workspaces/[w]/billing/*`, `src/app/api/workspaces/[w]/billing/route.ts`, `src/modules/billing/queries.ts`.
  - Depends: 6.2, 6.5, 6.6.
  - Work: Render pending/paid/subscription/cancellation, source and expiry, permanent packs, hold reasons and portal links. Keep approved catalog identifiers server-owned and distinguish cash refunds from task-credit refunds; exercise owner/member and mobile presentation cases.
  - Evidence: SC-BIL-05, SC-BIL-07, SC-BIL-09, SC-BIL-10, SC-BIL-12, T21, T23.
  - Observed: Owner-only billing query/API/page expose subscription state, cash order/refund amounts, grant source/expiry buckets, hold reason, recovery cases and refund request state while preserving workspace authorization. See `internal/evidence/M5/task-6.5-6.9/README.md`.

- [x] 6.9 Define cash-refund preview and recoverable execution port. ✓ 2026-10-04
  - Paths: `src/modules/billing/refund-command.ts`, `src/modules/billing/refund-preview.ts`, `src/adapters/billing/stripe.ts`, `content/docs/<release>/apis/billing.mdx`.
  - Depends: 6.6.
  - Work: Implement and exercise the refund preview/domain port with stable identifiers and pending/lost-response reconciliation through a test-mode harness. Do not expose it to customers; the operator UI and privileged request boundary arrive in 7.3. This closes only SC-BIL-17's domain/adapter subset; test evidence never authorizes a live refund.
  - Evidence: SC-BIL-11, SC-BIL-12, SC-BIL-17, T28, T30.
  - Observed: Local test-mode refund provider and durable request table support side-effect-free preview, pending/unknown/confirmed states, stable idempotency and explicit reconciliation. No customer-facing refund command or live refund is exposed. See `internal/evidence/M5/task-6.5-6.9/README.md`.

- [ ] 6.10 Pass the M5 billing gate
  - Paths: `internal/evidence/m5-billing/*`, `content/docs/<release>/template/billing.mdx`.
  - Depends: 6.7, 6.8, 6.9.
  - Work: Collect SC-BIL-01–SC-BIL-16, PostgreSQL race evidence, owner UI journey and authorized Stripe test-mode subscription/pack/refund-port evidence. For SC-BIL-17 record domain/adapter proof only; privileged operator UI closure belongs to 7.3 and 7.14. Record blocked external evidence and configuration/terms gaps explicitly.
  - Evidence: SC-BIL-01–SC-BIL-16; SC-BIL-17 domain/adapter subset only; T21, T22, T23, T24, T28, T60, G11, G12.
  - Acceptance: Apply M5 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Current verification: `internal/evidence/acceptance/M5/m5-current-20261029/record.json` records the 2026-10-29 exact-candidate rerun and a 2026-10-29T05:39Z fixture-only local rerun. Billing schema, Checkout, reconciliation, fake-provider Stripe Checkout, reconciliation, inbox, and billing presentation passed. The Stripe refunds integration suite failed its operator step-up case again (21 pass, 1 fail) and is not PASS. The aipc fixture archive records additional local credit and billing probes at exit 0 and leaves defect `M5-LOCAL-REFUND-STEPUP-20261029` open. The hosted Stripe test-mode acceptance-pack embedded payment is PASS_paid_and_reconciled at `internal/evidence/acceptance/stripe-test-pack-20261029/` and does not close task 6.10. The signed-in owner billing page is recorded at `internal/evidence/acceptance/stripe-test-pack-20261029/BILLING_UI_OWNER_SIGNED_IN.md` and does not close task 6.10. Sign-in uses `/login`; `/sign-in` is 404. Member-denial UI, mobile layout, refund-command replay, hosted Checkout Session URLs, the $25 subscription, refunds, and live charges were not closed. Task 6.10 remains open, current M3 applicability is STALE, and M5 remains IN_PROGRESS.

## 7. M6 — Operations and affiliate integration

The completed markers below describe the local implementation and fixture-verification profile only. They do not close real-account or production integration obligations. In particular, the FirstPromoter authority remains unavailable in application routes until the production adapter and supported account mapping are completed and separately verified; configuration alone cannot enable delivery, approval, or settlement. See `internal/evidence/M6/m6-local-fixtures-20261017/README.md` for the current candidate evidence and retained limitations. The integrated gate remains open.

- [x] 7.1 Implement global-role and step-up policy ✓ 2026-10-04 (local)
  - Paths: `src/modules/operations/authorization.ts`, `src/modules/operations/bootstrap.ts`, `src/lib/auth.ts`, `src/db/schema/operations.ts`, `src/db/schema/operator.ts`, `src/db/schema/security.ts`, `src/db/migrations/0031_operator_owner_state.sql`, `scripts/operator-owner.ts`, `scripts/probe-first-owner-claim.ts`.
  - Depends: 4.12.
  - Work: Recheck database role on every request; make email-verification and two-factor requirements explicit installation settings; and bind successful enabled step-up to that session for ten minutes. Persist a fresh-install-only first-user claim, serialize concurrent password registrations, commit the winning superadmin role with claim closure and audit, keep upgrades closed, and retain audited server bootstrap for uninitialized existing installations. Implement one shared administrative-ownership guard across initialization, role changes and account disablement, preserving an active superadmin. Define documented audited server recovery and specify revoked/expired/wrong-session, optional-policy, registration race/restart/upgrade and concurrent role/disable cases.
  - Evidence: SC-OPS-01, SC-OPS-02, SC-OPS-03, SC-OPS-04, SC-OPS-14, SC-OPS-15, SC-OPS-16, T04, T59.
  - Local verification (2026-10-29): Dedicated disposable PostgreSQL probe passes concurrent first claim, client-role rejection, failed/duplicate auth, interrupted-claim recovery, restart closure, upgrade lockout with legacy operator role and audited bootstrap promotion. Live local HTTP concurrency confirms exactly one Superadmin/audit, winner admin access and loser denial. This is implementation evidence only; M6 remains IN_PROGRESS pending the full gate record and independent review.

- [x] 7.2 Connect React-admin read surfaces to one authority ✓ 2026-10-04 (local)
  - Paths: `src/admin/auth-provider.ts`, `src/admin/data-provider.ts`, `src/admin/resources/*`, `src/app/admin/[[...segments]]/page.tsx`, `src/app/api/admin/*`.
  - Depends: 7.1, 6.10.
  - Work: Reuse the M1 client-only shell; add bounded/redacted list/detail resources, /admin/me, current-role permissions and allowlisted filters/sorts. Reject generic protected mutations on client/server; record OSS/license and profile dependencies without adding a second schema/auth owner.
  - Evidence: SC-OPS-01, SC-OPS-02, SC-OPS-05, SC-OPS-06, SC-OPS-09; SC-OPS-13/T62 local admin integration subset only; T59, T61. Final clean-delivery profiles belong to 9.4/9.14/9.15.

- [x] 7.3 Implement audited privileged command envelope ✓ 2026-10-04 (local)
  - Paths: `src/modules/operations/commands.ts`, `src/modules/operations/audit.ts`, `src/app/api/admin/commands/[command]/route.ts`, `src/app/api/admin/security-settings/route.ts`, `src/admin/commands/*`, `src/admin/security-settings-panel.tsx`.
  - Depends: 7.1, 6.10.
  - Work: Require reason, expectedVersion, semantic idempotency and recent step-up when configured; atomically record domain effects/result/audit/outbox. Add superadmin-only versioned security-settings controls for optional SMTP, email verification, 2FA enforcement and Turnstile with encrypted write-only secrets. Wire the cash-refund preview/execution UI and role commands without direct CRUD. Complete SC-BIL-17 operator-UI authorization/pending-result evidence using the existing M5 port, and prove failure rollback and duplicate-command behavior.
  - Evidence: SC-OPS-03, SC-OPS-04, SC-OPS-07, SC-OPS-08, SC-OPS-09, SC-BIL-17, T60, T61.

- [x] 7.4 Implement account/workspace controls and credit adjustments ✓ 2026-10-04 (local)
  - Paths: `src/modules/operations/account-controls.ts`, `src/modules/operations/credit-adjustments.ts`, `src/modules/workspaces/authorization.ts`, `src/admin/commands/*`.
  - Depends: 7.3.
  - Work: Apply the disabled-user/suspended-workspace/billing-hold matrix and preserve active settlement. Account disablement MUST use 7.1's same administrative-ownership guard as role changes, rejecting sole-active-superadmin disablement and unsafe concurrent outcomes. Add explicit credit/recovery commands without editing history or reserved credits; document redaction and audited tenant access.
  - Evidence: SC-OPS-07, SC-OPS-08, SC-OPS-11, SC-OPS-12, SC-OPS-14, T03, T04, T59, T60.

- [x] 7.5 Implement safe provider and delivery recovery views ✓ 2026-10-04 (local)
  - Paths: `src/modules/operations/recovery.ts`, `src/admin/resources/generation/*`, `src/admin/resources/integrations/*`, `content/docs/<release>/template/operations.mdx`.
  - Depends: 7.2, 7.3, 5.10.
  - Work: Expose task/attempt/asset/inbox/outbox correlation, unknown/estimated/confirmed costs, model health and named safe replay/reconciliation actions. Prove replay retains original keys and never reissues a paid submission or alters terminal credit effects; supply a bounded recovery drill.
  - Evidence: SC-OPS-05, SC-OPS-06, SC-OPS-10, T11, T12, T19, T49, T53.

- [x] 7.6 Define optional affiliate account and immutable attribution schema ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/contracts.ts`, `src/db/schema/affiliate.ts`, `src/db/migrations/*`, `src/config/env.ts`.
  - Depends: 6.10.
  - Work: Define disabled/default configuration, buyer-only credentials, workspace UID, immutable attribution, first-payment identity, policy revisions, review records and account checkpoint. Store no commission balances; pin FirstPromoter V2 mappings and explain independent vendor program ownership.
  - Evidence: SC-AFF-01, SC-AFF-02, SC-AFF-03, SC-AFF-05, T26, T29.

- [x] 7.7 Implement creator referral capture and validation ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/attribution.ts`, `src/app/api/affiliates/referral/route.ts`, `src/modules/workspaces/create.ts`, `src/adapters/affiliates/firstpromoter.ts`.
  - Depends: 7.6.
  - Work: Issue signed HttpOnly first-party tokens with a 30-day bound, choose the last verified valid touch before creation, bind once to creator/workspace, and reconcile transient verification failure for the original candidate only. Cover foreign/tampered/expired/late touches and competing members.
  - Evidence: SC-AFF-03, SC-AFF-04, SC-AFF-05, T26, T27.

- [x] 7.8 Implement chronological eligibility and ordered sale delivery ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/eligibility.ts`, `src/modules/affiliates/delivery.ts`, `src/adapters/affiliates/firstpromoter.ts`, `src/modules/billing/reconcile-payment.ts`.
  - Depends: 7.7, 6.10.
  - Work: Wait five minutes, reconcile all historical customer mappings/pages, sort canonical paid time/ID and bind the first reference under a workspace lock. Deliver signup/all verified sales with stable keys/payload digests, hold on history uncertainty, and persist older-payment conflicts without affecting earned billing credits.
  - Evidence: SC-AFF-06, SC-AFF-07, SC-AFF-08, SC-AFF-09, SC-AFF-10, T24, T25, T26.

- [x] 7.9 Implement incremental refund and dispute delivery ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/refunds.ts`, `src/modules/affiliates/delivery.ts`, `src/adapters/affiliates/firstpromoter.ts`.
  - Depends: 7.8, 6.6.
  - Work: Export unique incremental cash refunds only after sale acknowledgement, normalize currency/basis and enforce cumulative limits. Deduplicate refund/dispute economic loss, keep task-credit refunds local, and persist manual affiliate-correction holds for won disputes after denial/reversal.
  - Evidence: SC-AFF-10, SC-AFF-14, SC-AFF-15, SC-AFF-16, T28.

- [x] 7.10 Implement first-payment guard and campaign revision review ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/policy.ts`, `src/modules/affiliates/commission-review.ts`, `src/adapters/affiliates/firstpromoter.ts`, `content/docs/<release>/template/affiliates.mdx`.
  - Depends: 7.8, 7.9.
  - Work: Configure native By count=1, first_payment policy and disabled automatic disbursement. Persist denial intent for later commissions, verify behavior through refunds, and require matching reviewed provider_campaign revision for changed duration; preserve UID and historical events.
  - Evidence: SC-AFF-11, SC-AFF-12, SC-AFF-13, SC-AFF-16, T25, T26, T28.

- [x] 7.11 Implement durable review records and fresh payout guard ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/commission-review.ts`, `src/modules/affiliates/payout-guard.ts`, `trigger/affiliate-sync.ts`, `src/modules/operations/commands.ts`.
  - Depends: 7.3, 7.10.
  - Work: Persist eligible/held/deny-pending/denied records and account generation/checkpoint, reconcile every five minutes and just-in-time, require freshness within 60 seconds and completed denials, and fence policy/review/checkpoint versions across external reads. Fail closed on any missing evidence.
  - Evidence: SC-AFF-08, SC-AFF-17, SC-AFF-18, T30, T31, T60.

- [x] 7.12 Implement review actions, secure notifications and hosted payout visibility ✓ 2026-10-04 (local)
  - Paths: `src/admin/resources/affiliates/*`, `src/app/api/webhooks/affiliate/route.ts`, `src/adapters/affiliates/firstpromoter.ts`, `content/docs/<release>/template/affiliate-settlement.mdx`.
  - Depends: 7.11.
  - Work: Wire supported read/approve/deny/batch/status APIs, secret-header webhook verification plus authoritative readback, and the reviewed HTTPS dashboard handoff. Retain provider status meaning, require step-up, document account/method prerequisites and dashboard bypass limits; implement no invented direct payout endpoint.
  - Evidence: SC-AFF-18, SC-AFF-19, SC-AFF-20, SC-AFF-21, SC-AFF-22, T29, T30.

- [x] 7.13 Implement reviewable affiliate abuse defaults ✓ 2026-10-04 (local)
  - Paths: `src/modules/affiliates/abuse-review.ts`, `src/modules/operations/commands.ts`, `src/admin/resources/affiliates/*`.
  - Depends: 7.7, 7.11.
  - Work: Hold verified self-referrals, flag more than three new attributed workspaces per 24 hours or a repeated lawfully available verified instrument fingerprint, mark missing signals unknown, and implement reasoned audited release without a global user cap or raw card storage.
  - Evidence: SC-AFF-23, SC-AFF-24, SC-AFF-05, T26, T27, T31.

- [ ] 7.14 Pass the M6 operations and affiliate gate
  - Paths: `internal/evidence/m6-operations-affiliates/*`, `content/docs/<release>/template/operations.mdx`, `content/docs/<release>/template/affiliate-settlement.mdx`.
  - Depends: 7.2, 7.4, 7.5, 7.12, 7.13, 5.10, 6.10.
  - Work: Close SC-OPS-01–SC-OPS-12, SC-OPS-14–SC-OPS-16, SC-SEC-01–SC-SEC-07, SC-AFF-01–SC-AFF-24 and the privileged operator-UI portion of SC-BIL-17 with real-DB and authorized provider-backed evidence. SC-OPS-13/T62 is local admin integration/notices only here; final clean customer local/managed/Docker evidence is required at 9.4/9.14/9.15 before full closure. Exercise fresh-install claim concurrency/restart, upgrade lockout, disabled mode, optional SMTP/2FA, Turnstile rejection, failed refresh/batches, old-payment conflict, abuse release and hosted test settlement; record blocked account/method facts without authorizing live payout.
  - Evidence: SC-OPS-01–SC-OPS-12, SC-OPS-14–SC-OPS-16, SC-SEC-01–SC-SEC-07, SC-BIL-17 operator UI, SC-AFF-01–SC-AFF-24; SC-OPS-13/T62 local integration subset only; T04, T25, T26, T27, T28, T29, T30, T31, T49, T59, T60, T61, G22, G23, G24, G25, G26, G27, G31 integration subset.
  - Acceptance: Apply M6 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Current verification: `internal/evidence/acceptance/M6/m6-current-20261029/record.json` records the 2026-10-29 exact-candidate rerun and a 2026-10-29T05:39Z fixture-only rerun of local operations, privileged, MFA, recovery, affiliate, affiliate database, race, cash-affiliate, notification and referral probes. The referral probe recorded `realAccountVerified=false`. The aipc fixture archive adds refund-preview, admin-reads, and workspace-details exits of 0, and a two-factor stdout with `externalAccountsUsed=false`. Affiliate scope there is local pure contracts with database and provider verification false. The gate remains IN_PROGRESS because real FirstPromoter account and hosted-settlement evidence were not re-run, current M3 applicability is STALE, and independent review remains open.
  - Acceptance refresh (2026-10-26): FirstPromoter V2 read-only authentication passes for account `537zxqmq`; campaign `45084` is `20% commission for first charge`; accepted test promoter `15752036` and token `shpitto-203f34` resolve to the campaign. The hosted `?fpr=` capture path resolves server-side and issues only a signed HttpOnly cookie when the affiliate setting is enabled. Local referral HTTP and PostgreSQL probes pass. M6 remains `IN_PROGRESS`: native Stripe tracking is still connected in test mode, PayPal payout method is enabled, automatic payout disablement is unconfirmed, FirstPromoter commissions are not treated as canonical Stripe payment history, and no external referral/sale/settlement write was attempted. Keep external delivery blocked until duplicate tracking, payout safety and Stripe history evidence are resolved.


## 8. M7 — Governed customization and developer documentation

The checked items below retain the explicitly labeled local slices. The October
19 review found that static evidence checks did not establish an external pinned
validator execution chain or four actual customization runs. Those gaps require
current implementation and execution proof before final acceptance; older
checkmarks do not close them. Final upstream gates are M3=4.12, M4=5.10,
M5=6.10 and M6=7.14; M6 covers admin/local integration, while final
exported-profile SC-OPS-13 closes at 9.14/9.15.

- [x] 8.1 Create the twelve-Skill catalog and thin Codex/Claude Code/OpenCode discovery adapters; declare each adapter's supported behavior without a deployed CLI dependency. ✓ 2026-10-04 (local contract slice)
  - Paths: `skills/*/SKILL.md`, `.shpitto/contracts/skills.json`, `docs/buyer/agents.md`.
  - Depends: 2.8.
  - Evidence: SC-SKL-01, SC-SKL-02, T42; record exact release/environment and sanitized results.

- [x] 8.2 Author quick-start, deploy-template, security-review and upgrade-template with explicit prerequisites, output/evidence and recovery contracts. ✓ 2026-10-04 (local contract slice)
  - Paths: `skills/{quick-start,deploy-template,security-review,upgrade-template}/SKILL.md`.
  - Depends: 8.1.
  - Evidence: SC-SKL-01, T01, T42, T50; record exact release/environment and sanitized results.

- [x] 8.3 Finalize add-provider, add-generation-task, configure-credits and extend-assets only after the M3 adapter/domain contract gate, including legitimate core-change classification; earlier drafts are not final evidence. ✓ 2026-10-04 (local contract slice)
  - Paths: `skills/{add-provider,add-generation-task,configure-credits,extend-assets}/SKILL.md`, `.shpitto/contracts/extensions.json`.
  - Depends: 8.1, 4.12.
  - Evidence: SC-SKL-03, SC-SKL-08, T42, T43; record exact release/environment and sanitized results.

- [x] 8.4 Implement customize-brand and create-page guidance/templates over the default token baseline, assets, navigation and route contracts; record responsive and accessibility expectations. ✓ 2026-10-04 (local contract slice)
  - Paths: `skills/{customize-brand,create-page}/SKILL.md`, `src/config/{brand,navigation}.ts`, `.shpitto/contracts/presentation.json`.
  - Depends: 8.1.
  - Evidence: SC-SKL-04, SC-SKL-05, SC-SKL-18, SC-SKL-19, T32, T33, T56; record exact release/environment and sanitized results.

- [x] 8.5 Implement modify-page and customize-site guidance preserving real pricing bindings, checkout, shared shells and product journeys; expose the shared-shell/token edit surface and keep changes inside buyer SaaS presentation. ✓ 2026-10-04 (local contract slice)
  - Paths: `skills/{modify-page,customize-site}/SKILL.md`, `.shpitto/contracts/presentation.json`.
  - Depends: 8.4.
  - Evidence: SC-SKL-06, SC-SKL-07, SC-SKL-18, SC-SKL-19, T34, T35, T56; record exact release/environment and sanitized results.

- [x] 8.6 Implement baseline/dirty-work manifests and protected-scope/import classification, including unsafe imported blocks and explicit engineering escalation. ✓ 2026-10-04 (local contract slice)
  - Paths: `scripts/validate-change.ts`, `.shpitto/contracts/protected-paths.json`, `.shpitto/contracts/change-manifest.json`.
  - Depends: 8.3, 8.5.
  - Evidence: SC-SKL-08, SC-SKL-09, T36, T37, T43; record exact release/environment and sanitized results.

- [x] 8.7 Load validators from a pinned trusted release/worktree outside candidate edits and require independent review for policy revisions. ✓ 2026-10-04 (local contract slice)
  - Paths: `scripts/validate-change.ts`, `.shpitto/contracts/validation-policy.json`, `docs/buyer/customization.md`.
  - Depends: 8.6.
  - Evidence: SC-SKL-11, SC-SKL-13, T39, T54; record exact release/environment and sanitized results.

- [x] 8.8 Bind required check results to exact staged source/lockfile/contracts/configuration digests and implement a shared evidence check for export/deploy entrypoints. ✓ 2026-10-04 (local contract slice)
  - Paths: `scripts/validate-change.ts`, `scripts/export-release.ts`, `scripts/deploy-release.ts`, `.shpitto/contracts/validation-evidence.json`.
  - Depends: 8.7.
  - Evidence: SC-SKL-12, SC-REL-04, T40, T55; record exact release/environment and sanitized results.

- [x] 8.9 Verify representative four-workflow customization and negative semantic/bypass cases against integrated auth, credits, generation, billing and admin behavior. ✓ 2026-10-07 (local/mock integrated profile; external predecessor gates remain deferred)
  - Paths: `tests/customization/`, `internal/evidence/m7/customization/`.
  - Depends: 8.5, 8.6, 8.7, 8.8, 5.10, 6.10, 7.14.
  - Evidence: `internal/evidence/m7/customization/local-integrated-report.json`, SC-SKL-04, SC-SKL-05, SC-SKL-06, SC-SKL-07, SC-SKL-09, SC-SKL-10, SC-SKL-11, SC-SKL-12, T32, T33, T34, T35, T36, T38, T39, T40, T54, T55. The report is limited to the local/mock profile and carries the real provider/payment/affiliate prerequisites forward.

- [x] 8.10 Implement scoped rollback reports/patches and verify unrelated dirty-work preservation plus overlapping-edit resolution without repository-wide resets. ✓ 2026-10-04 (local contract slice)
  - Paths: `scripts/rollback-customization.ts`, `tests/customization/rollback/`, `docs/buyer/customization.md`.
  - Depends: 8.6.
  - Evidence: SC-SKL-14, SC-SKL-15, T41, T50; record exact release/environment and sanitized results.

- [x] 8.11 Record copied shadcn/other resource revision or hash, license notices and adaptation; exclude uncertain provenance and legacy runtime imports. ✓ 2026-10-04 (local inventory; no separately copied resource included)
  - Paths: `internal/licenses/resource-inventory.json`, `THIRD_PARTY_NOTICES`, `skills/`.
  - Depends: 8.1, 8.4, 8.5.
  - Evidence: SC-SKL-16, SC-SKL-17, T36, T46, T52; record exact release/environment and sanitized results.

- [x] 8.12 Build the Fumadocs versioned navigation, published-only search and direct-link shell with trusted repository MDX and consistent default English content. ✓ 2026-10-04 (local docs contract slice)
  - Paths: `vendor/sales/app/docs/`, `content/docs/`, `vendor/sales/source.config.ts`.
  - Depends: 2.8.
  - Evidence: SC-DOC-01, SC-DOC-02, SC-DOC-08, T56, T58; record exact release/environment and sanitized results.

- [x] 8.13 Write template tutorials, all twelve Skill references and actual API/integration examples from released contracts; label deferred public API scope and sanitize fixtures. ✓ 2026-10-07 (local docs profile)
  - Paths: `content/docs/<release>/{template,skills,apis,releases}/`, `scripts/check-doc-contracts.ts`.
  - Depends: 8.1, 8.2, 8.3, 8.4, 8.5, 8.12, 5.10, 6.10, 7.14.
  - Evidence: `internal/evidence/m7/docs/local-docs-report.json`, SC-DOC-03, SC-DOC-04, SC-DOC-05, SC-DOC-08, T01, T42, T57. Real provider/payment/affiliate examples stay explicitly deferred.

- [x] 8.14 Generate portable buyer Markdown/snippets from the shared release source and verify version links, example accuracy and vendor/private-content exclusion. ✓ 2026-10-07 (local buyer export)
  - Paths: `scripts/export-buyer-docs.ts`, `docs/buyer/`, `tests/docs/`, `internal/evidence/m7/docs/`.
  - Depends: 8.12, 8.13.
  - Evidence: `internal/evidence/m7/docs/local-docs-report.json`, SC-DOC-01, SC-DOC-02, SC-DOC-03, SC-DOC-04, SC-DOC-05, SC-DOC-06, SC-DOC-07, SC-DOC-08, T46, T47, T56, T57, T58. Final vendor Docs matching remains an M8 task.

- [ ] 8.15 M7 gate: review all twelve Skills, four customization workflows, trusted validation/rollback/provenance and release-matched Docs; close all required failures before accepting the phase.
  - Paths: `internal/evidence/m7/gate.md`, `.shpitto/contracts/validation-evidence.json`.
  - Depends: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 5.10, 6.10, 7.14.
  - Evidence: SC-SKL-01, SC-SKL-02, SC-SKL-03, SC-SKL-04, SC-SKL-05, SC-SKL-06, SC-SKL-07, SC-SKL-08, SC-SKL-09, SC-SKL-10, SC-SKL-11, SC-SKL-12, SC-SKL-13, SC-SKL-14, SC-SKL-15, SC-SKL-16, SC-SKL-17, SC-DOC-01, SC-DOC-02, SC-DOC-03, SC-DOC-04, SC-DOC-05, SC-DOC-06, SC-DOC-07, SC-DOC-08, T32, T33, T34, T35, T36, T37, T38, T39, T40, T41, T42, T43, T52, T54, T55, T56, T57, T58; record exact release/environment and sanitized results.
  - Acceptance: Apply M7 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Automated refresh (2026-10-24): current freeze-bound four-workflow evidence passes at `internal/evidence/m7/workflows-current-20261019/runs/2026-10-24T14-45-21-786Z-d5c94426/`; M7 remains open because M4/M5/M6 predecessor gates and final independent review are not closed.

## 9. M8 — Deployment, commercial delivery and release

Execution follows dependencies, not numeric order: author/preflight 9.5–9.9 and regenerate buyer guides at 9.12 before candidate freeze 9.3; verify the same candidate locally at 9.4 and in both production profiles at 9.14; accept it only at 9.15. After freeze, shipped-byte changes invalidate evidence and require a new archive/repository digest, fresh clean installation and repeated affected deployment/contract proof. Internal evidence and vendor-only records may change without altering customer bytes.

- [x] 9.1 Implement the positive release allowlist and isolated image/build/check contexts, including buyer docs/Skills and explicit legacy/vendor/internal/state/history exclusions. ✓ 2026-10-07 (local preflight; final candidate remains open)
  - Paths: `scripts/export-release.ts`, `.shpitto/contracts/export-manifest.json`, `.dockerignore`.
  - Depends: 8.8, 8.14.
  - Evidence: `internal/evidence/m8/export-scan/`, SC-REL-01, SC-DOC-07, T45, T46, T58. Exact 9.3 candidate packaging is still open.

- [x] 9.2 Inspect export dependencies, private/local lockfile references, secrets and redistribution rights; create complete component/binary notices and reject unlicensed Enterprise imports. ✓ 2026-10-07 (local preflight; release scan only)
  - Paths: `scripts/check-release-boundaries.ts`, `THIRD_PARTY_NOTICES`, `internal/licenses/`, `internal/evidence/m8/export-scan/`.
  - Depends: 9.1, 8.11.
  - Evidence: `internal/evidence/m8/export-scan/`, SC-REL-02, SC-SKL-16, SC-SKL-17, T46, T52, T62. Candidate-specific and acquired-version rights remain open.

- [x] 9.3 After other shipped source/recipes/configuration/guides are finalized, finalize version/migration/model/plan/Docs manifests and packaging inputs, run trusted candidate checks, freeze the exact staged digest, then create the checksum candidate ZIP and disposable clean-history repository from unchanged bytes; do not label it release-ready before 9.14/9.15. ✓ 2026-10-07 (local candidate only)
  - Paths: `template-version.json`, `scripts/export-release.ts`, `scripts/package-release.ts`, `internal/evidence/m8/artifact-manifest/`.
  - Depends: 9.1, 9.2, 8.15, 9.5, 9.6, 9.7, 9.8, 9.9, 9.12.
  - Evidence: `internal/evidence/m8/release-matrix.md`, `internal/evidence/m8/artifact-manifest/local-candidate-20261007/`, SC-REL-03, SC-REL-04, SC-DOC-06, T46, T47, T55, T58. Candidate remains `IN_PROGRESS` until final gates.

- [x] 9.4 Verify the immutable 9.3 candidate in a fresh no-cloud installation and restart journey, including Mock success/failure/cancel, credits, media probing and downloads; write evidence only, and reopen 9.3 if any shipped file must change. ✓ 2026-10-07 (fresh local candidate)
  - Paths: `tests/release/local-export/`, `internal/evidence/m8/local-demo/`.
  - Depends: 9.3.
  - Evidence: `internal/evidence/m8/local-demo/local-candidate-20261007/result.json`, `tests/release/local-candidate.test.ts`, SC-REL-03, SC-REL-07, T01, T47, T62. The result is fresh install/build evidence only; production paths remain open.

- [x] 9.5 Author and preflight the managed web/database/storage/mail reference configuration and canonical deployment guide before candidate freeze; record buyer-owned worker prerequisites and optional Trigger integration, with final exported-profile proof deferred to 9.14. ✓ 2026-10-07 (historical local preflight; runtime default amended 2026-10-15)
  - Paths: `content/docs/<release>/template/deploy-managed.mdx`, `vercel.json`, `trigger.config.ts`, `internal/evidence/m8/managed-preflight/`.
  - Depends: 9.1, 8.15, 5.10, 6.10, 7.14.
  - Evidence: `internal/evidence/m8/managed-preflight/`, SC-REL-05, T47, T48, T62. No managed account was contacted.
  - Amendment (2026-10-15): Historical preflight does not validate the amended self-hosted buyer production profile. Generic worker provisioning, network connectivity, durable heartbeat/alerts and immutable exported-profile installation must be reverified at 9.14. Trigger credentials are not baseline prerequisites.

- [x] 9.6 Author and preflight the multi-stage Next standalone Docker image, public/static packaging and canonical application-only deployment guide before candidate freeze; final exported-image proof belongs to 9.14. ✓ 2026-10-07 (local preflight)
  - Paths: `Dockerfile`, `docker/`, `content/docs/<release>/template/deploy-docker.mdx`, `internal/evidence/m8/docker-preflight/`.
  - Depends: 9.1, 8.15, 5.10, 6.10, 7.14.
  - Evidence: `internal/evidence/m8/docker-preflight/`, SC-REL-06, T48, T62. The result is a local context check, not a production image acceptance.

- [x] 9.7 Finalize production-profile guards, redacted diagnostics, direct-connection migration ordering and canonical checklists; preflight both recipes before freeze, leaving final immutable-candidate checks to 9.14. ✓ 2026-10-07 (local preflight)
  - Paths: `src/config/env.ts`, `scripts/migrate.ts`, `content/docs/<release>/template/deployment-checklist.mdx`, `tests/release/config-migration/`.
  - Depends: 9.5, 9.6.
  - Evidence: `internal/evidence/m8/config-migration/`, SC-REL-08, SC-REL-09, T29, T48, T50, T60, T62. Production adapters are not enabled.

- [x] 9.8 Finalize rollback/backup/restore runbooks and maintenance commands and rehearse them before candidate freeze; record observed recovery times, with final-candidate compatibility/restore evidence confirmed again at 9.14. ✓ 2026-10-07 (local preflight)
  - Paths: `content/docs/<release>/template/upgrade-recovery.mdx`, `scripts/maintenance/`, `internal/evidence/m8/restore-preflight/`.
  - Depends: 9.7.
  - Evidence: `internal/evidence/m8/restore-preflight/`, SC-REL-09, SC-REL-10, T12, T48, T50, T53. Final-candidate restore timing remains an M8 closure item.

- [x] 9.9 Finalize health/logging/alert implementation and canonical recovery runbooks; preflight worker/storage/callback failures before freeze, and rerun affected final-candidate operational cases at 9.14. ✓ 2026-10-07 (local preflight)
  - Paths: `content/docs/<release>/template/operations.mdx`, `src/app/api/health/`, `internal/evidence/m8/operations-preflight/`.
  - Depends: 9.7, 5.10, 6.10, 7.14.
  - Evidence: `internal/evidence/m8/operations-preflight/`, SC-REL-11, T12, T49, T53. Health is local/readiness-only until production services are supplied.

- [x] 9.10 Configure the isolated vendor sales application for Lemon Squeezy hosted source checkout/merchant affiliates and document account, order and policy separation from Stripe/FirstPromoter SaaS. ✓ 2026-10-07 (local fail-closed commerce profile; merchant onboarding remains external)
  - Paths: `vendor/sales/`, `internal/vendor/commerce-setup.md`, `internal/evidence/m8/commerce-separation/`.
  - Depends: 9.1, 6.10, 7.14.
  - Evidence: SC-COM-01, SC-COM-02, SC-COM-06, T21, T29, T46, T30; record exact release/environment and sanitized results.

- [x] 9.11 Create a manual fulfillment and entitlement runbook; rehearse paid-order verification, per-customer clean repository/ZIP delivery and expiry/renewal using sandbox or local fixtures. ✓ 2026-10-07 (local fixture only)
  - Paths: `internal/vendor/fulfillment-runbook.md`, `internal/vendor/entitlement-schema.json`, `internal/evidence/m8/fulfillment/`.
  - Depends: 9.3, 9.10.
  - Evidence: `internal/vendor/fulfillment-runbook.md`, `internal/vendor/entitlement-schema.json`, `internal/evidence/m8/fulfillment/local-fixture/result.json`, SC-COM-03, SC-COM-04, SC-COM-05, T46, T47, T50, T51. Vendor account and commercial terms remain unavailable.

- [x] 9.12 Finalize vendor Docs navigation and release examples after all deployment/recovery guides are authored, then regenerate synchronized offline buyer guides from canonical content before 9.3; final artifact/link checks belong to 9.14. ✓ 2026-10-07 (local candidate Docs/UI and buyer export)
  - Paths: `vendor/sales/app/`, `content/docs/`, `docs/buyer/`, `internal/evidence/m8/vendor-docs/`.
  - Depends: 8.15, 9.10, 9.5, 9.6, 9.7, 9.8, 9.9.
  - Evidence: SC-DOC-01, SC-DOC-02, SC-DOC-06, SC-DOC-07, SC-COM-01, T46, T56, T57, T58; record exact release/environment and sanitized results.

- [ ] 9.13 Record merchant eligibility and approved license/pricing/source-affiliate terms, twelve-month basic-support scope and separately priced services; label unresolved business inputs as release blockers.
  - Paths: `internal/vendor/commercial-readiness.md`, `vendor/sales/content/legal/`, `internal/evidence/m8/support-entitlement/`.
  - Depends: 9.10, 9.11.
  - Evidence: SC-COM-04, SC-COM-05, SC-COM-06, SC-REL-12, T30, T51; record exact release/environment and sanitized results.

- [ ] 9.14 Using the exact 9.3 ZIP/repository digest, prove both managed and Docker profiles plus SC-OPS-13 admin/profile closure, final Docs/export, migration/restore and affected operations; consolidate G01–G31/T01–T62. Any shipped-file fix invalidates evidence: reopen 9.3, regenerate archives and rerun 9.4 plus affected profile/contract flows before rechecking this gate.
  - Paths: `tests/release/`, `internal/evidence/m8/managed/`, `internal/evidence/m8/docker/`, `internal/evidence/m8/restore-drill/`, `internal/evidence/m8/operations-drill/`, `internal/evidence/m8/release-matrix.md`, `internal/evidence/m8/release-review.md`.
  - Depends: 9.3, 9.4, 9.11, 9.13, 8.15, 5.10, 6.10, 7.14.
  - Evidence: SC-REL-01, SC-REL-02, SC-REL-03, SC-REL-04, SC-REL-05, SC-REL-06, SC-REL-07, SC-REL-08, SC-REL-09, SC-REL-10, SC-REL-11, SC-REL-12, SC-REL-13, SC-OPS-13, SC-DOC-01, SC-DOC-02, SC-DOC-06, SC-DOC-07, T01, T21, T25, T29, T30, T46, T47, T48, T49, T50, T53, T55, T56, T57, T58, T59, T60, T61, T62; record exact release/environment and sanitized results.
  - Hosted demo evidence (2026-10-17): the isolated Railway project `shpitto-m4-staging` has successful Web, self-hosted provider worker and recovery monitor deployments with HTTP 200 readiness. The worker is isolated, migrated and running with paid creates disabled; the monitor is observe-only. Current application digests match the frozen M4 self-hosted candidate. Evidence: `internal/evidence/m8/railway-staging/hosted-verification-20261017.json`. This does not close 9.14 because the exact 9.3 managed/Docker release candidate, commercial inputs and dependent M5/M6/M7 gates remain open.

- [ ] 9.15 M8 gate (RC, BETA and STABLE records; complete only after STABLE PASS): accept only the exact regenerated 9.3 candidate proven by 9.4/9.14, with both production paths, SC-OPS-13 closure, acquired-version rights, matching Docs and complete V1 evidence; recheck artifact digest immediately before delivery and keep blocked commercial/live actions incomplete.
  - Paths: `internal/evidence/m8/gate.md`, `internal/evidence/m8/release-matrix.md`.
  - Depends: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14.
  - Evidence: SC-REL-01, SC-REL-02, SC-REL-03, SC-REL-04, SC-REL-05, SC-REL-06, SC-REL-07, SC-REL-08, SC-REL-09, SC-REL-10, SC-REL-11, SC-REL-12, SC-REL-13, SC-COM-01, SC-COM-02, SC-COM-03, SC-COM-04, SC-COM-05, SC-COM-06, SC-DOC-06, SC-DOC-07, SC-OPS-13, T01, T21, T25, T29, T30, T45, T46, T47, T48, T49, T50, T51, T52, T53, T55, T56, T57, T58, T60, T62, T59, T61; record exact release/environment and sanitized results.
  - Acceptance: Apply M8 criteria plus common standards in [acceptance-gates.md](acceptance-gates.md); submit the exact-candidate record as READY_FOR_REVIEW; accumulate independent review and integrator decisions in the final manual-acceptance queue. Partial SC/G profiles cannot close later obligations.
  - Checkpoints: Record RC candidate acceptance, BETA promised-scope/commercial readiness and STABLE representative observation plus issue closure separately. Keep this checkbox open after BETA; record the observation plan/window at RC and require current-byte evidence. Readiness does not assert publication.
