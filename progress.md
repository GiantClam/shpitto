## Progress Log

### 2026-05-28

1. Read the harness-required docs and current main architecture docs.
2. Confirmed that translation-lane implementation is already in the codebase and verified by targeted tests.
3. Updated the technical solution doc to describe the current architecture and the Open Design / HTML Anything maximization strategy.
4. Started the implementation landing pass with a gap audit focused on discovery-brief semantics, imported-seed primacy, and resource-context propagation.

### 2026-05-31

1. Audited the current implementation against `task_plan.md`, `docs/chat-full-lifecycle-optimization-plan.md`, `docs/website-generation-technical-solution.md`, and the homepage SEO repositioning plan.
2. Confirmed that chat lifecycle routing, structured chat memory, revision pointers, refine/translate execution modes, discovery-brief propagation, and imported seed/resource context are already landed in code.
3. Verified the core architecture path with targeted tests:
   - `lib/agent/chat-async-route.test.ts`
   - `lib/agent/chat-lifecycle-regression.test.ts`
   - `lib/agent/chat-memory-backend.test.ts`
   - `lib/skill-runtime/project-skill-loader.test.ts`
   - `lib/skill-runtime/translation-lane.test.ts`
   - `lib/skill-runtime/executor.test.ts`
4. Test result: `6` files passed, `77` tests passed.
5. Determined that the main inconsistency is documentation drift, not missing runtime behavior. Updated the working plan/findings to reflect the code-backed status.

---

### 2026-07-12

1. Created the persistent goal for the full AI-operated template platform objective.
2. Re-read the existing planning files and appended a separate productization plan without deleting prior history.
3. Audited OpenCode, skills, generated template, CMS, billing, and deployment paths.
4. Confirmed OpenCode `1.17.15` is installed and the runner invokes it, but the workspace does not inject real skills or project policies.
5. Confirmed the generated AI image template builds, while its generation API is explicitly mock-only and its deployment path is static-file-only.
6. Recorded the blocking gaps in `findings.md`; implementation begins with the shared workspace/skill contract and safe OpenCode execution boundary.
7. Attempted two bounded read-only subagent analyses; both failed before execution due to the local proxy/model configuration and made no file changes.

### 2026-07-12 Productization Implementation

1. Added the shared OpenCode skill manifest, workspace policy, result envelope, operation skills, and skill-resource materialization under `.opencode/skills/`.
2. Added a productized lifecycle for generate, refine, validate, preview, and deploy. Existing template workspaces are copied into a new task workspace before operation skills run; baseline regeneration is no longer used for refinement.
3. Added server-capable deployment support for Next.js workspaces through Vercel and Railway adapters, with build evidence, deployment evidence, rollback command, output redaction, and an explicit policy gate.
4. Upgraded the generated AI image template from mock-only behavior to a Replicate adapter with explicit mock preview mode, idempotent generation lookup, persisted history, and server-only provider secrets.
5. Added an append-only entitlement ledger, generation credit reservation/settlement/release, Supabase migration functions, Stripe signature verification, webhook idempotency, CMS published-content reads, authenticated CMS publication, and cache invalidation.
6. Replaced the hard-coded template security report with generated-workspace scanning and expanded generated-template smoke coverage for billing reservations and CMS publication.
7. Verification passed: `pnpm -C apps/web exec tsc --noEmit`; full web ESLint; 13 target test files with 39 tests; template feature gate; security report; lifecycle/deployment adapter tests; worker compatibility regression; and the generated Next.js workspace install/build/route/API smoke with explicit mock test settings.
8. External verification remains pending because the configured OpenCode account returned a quota error and no live Replicate, Stripe, Payload, Vercel, or Railway sandbox credentials are configured.
9. Added the operator/CI wrapper `apps/web/scripts/shpitto-template-cli.mts` and package scripts for the five template operations; it reuses the same OpenCode runner and result envelope.
10. Expanded the versioned template manifest with runtime, provider, CMS, billing, deployment, secret, and skill capability fields, and made the feature gate validate those fields.
11. Added a shared server workspace build gate used by validate, preview, and deploy operations. Full web lint and `next build` passed; build emitted existing broad file-pattern warnings only.

### 2026-07-13

1. Confirmed the installed OpenCode CLI supports native session continuation flags: `--session`, `--continue`, and `--fork`.
2. Confirmed the current Shpitto runner does not use those flags, uses a fixed 180-second timeout, and has no heartbeat loop during child execution.
3. Started the continuity/deployment audit with source-first contract inspection; implementation is pending focused runner and lifecycle changes.

4. Added native OpenCode session continuation, session persistence, workflow/step metadata, task-class timeout defaults, and a heartbeat callback wired through productized chat execution.
5. Raised the worker stale-running default to 45 minutes so long OpenCode tasks are not requeued during the new timeout windows.
6. Added Dockerfile/.dockerignore generation, Docker image build support, source package export support, and explicit Cloudflare server-runtime blocking metadata.
7. Verification passed: focused runner/contract/adapter/worker suites (25 tests), adapter follow-up suite (13 tests), generated AI-image workspace/feature-gate/report suite (4 tests), TypeScript, and ESLint.
8. The independent template source passed `tsc --noEmit` and `next build --webpack`, generating all 39 dynamic routes. The full web suite was attempted but stopped after external provider timeouts and unrelated legacy failures; it is not reported as green.
9. Updated the template feature gate and Cloudflare guide so the commercial export reports the actual Vercel/Railway/Docker/source matrix and blocks static Pages deployment for the server runtime.
10. Re-ran the productized OpenCode worker test with a test-only 10-second CLI timeout; it passed. The offline suite then passed 129 test files / 1,036 tests with 3 files / 4 tests skipped. The excluded failures are the known legacy MVP/prompt/refine contract tests and provider-backed `.local`/`.live` tests.
11. Final verification passed again: web TypeScript, targeted ESLint, and `git diff --check`. The generated source `.next` cache was removed after build verification so lifecycle resource tests remain deterministic.

## 2026-10-13 Railway Worker Progress

Started from local HEAD a865777 with existing fal/OpenSpec modifications and two unrelated .env.example deletions. Applying existing restart change; no archive. Parallel bounded fal authentication patch assigned; leader owns worker/lifecycle/deployment implementation and final validation.


## 2026-10-13 Worker Completion Evidence

Worker and companion Web deployed and health-checked; worker restarted successfully while paused. 145 contracts and 13 disposable PostgreSQL integration cases pass; fresh R2 signed input probe cleaned up. Independent bootstrap/adoption review fixes verified. No new paid generation. Full acceptance is blocked by stale M4 candidate digests and missing full live/hosted/independent stage evidence. Evidence saved under internal/evidence/M4/task-5.10/railway-worker/.


## 2026-10-13 Authorized Fal T2V Bootstrap

User authorized exactly one 720p/81-frame/16-FPS Fal T2V request with reference cost ~$0.41 and authorization budget USD1. Create a fresh seeded acceptance identity/workspace/reservation; retain an exclusive run record and durable submit fence. No blind retry on ambiguity. Establish account binding only from a JWKS-verified callback tied to the exact request ID returned by the authenticated create. Production worker remains create-disabled; only assigned-workspace recovery/polling may run. Preserve private output for Demo evidence, never print keys/signed URLs/session tokens.

## 2026-10-13 Authorized Fal T2V Live Verification

- Completed one paid submission (reference USD0.405, actual cost UNKNOWN), authentic signed callback/account confirmation, private R2 publication and seeded credit consumption.
- Owner HTTP200/hash, outsider403, anonymous401, expired403 and wrong-asset403 pass; actual video metadata was measured.
- One freshly created orphan was removed by the 60-second scheduler under synthetic DB age; ready output survived cleanup and a worker restart. All temporary auth sessions are removed.
- Final Railway worker is healthy, paused and create-disabled. Production catalog, production mail, historical balances and existing business objects were not changed.
- 115 related contracts, typecheck/lint/format/config/DB boundaries/build/OpenSpec/audit pass. Full acceptance still fails on stale M4 source/configuration/contract/validator fingerprints. No blind PASS refresh or full M4 completion claim.

## 2026-10-14 Verification Refresh

Current development candidate fingerprints for M4, M5 and M6 were recaptured from the repository and synchronized into their `IN_PROGRESS` records. `verify:acceptance` now passes without promoting any stage. Typecheck, lint, format, configuration, database, M2 foundation, local-service, shell, content-boundary, production build, strict OpenSpec and 85 related provider contracts pass. The isolated Railway Demo worker remains healthy, paused, create-disabled and unassigned; no new paid provider request was made. `verify:root` remains blocked by the older selected-stack dependency/lockfile baseline, which requires a separate reviewed provenance decision.
## 2026-10-26 Acceptance Gate Continuation

1. Confirmed the prior M5 hosted Checkout evidence and committed the recoverable Acceptance bootstrap plus evidence packet as `d55ef01a`.
2. Re-read the existing planning files and OpenSpec task dependencies before starting the remaining-gates pass.
3. Appended a scoped plan, findings and completion rule for automated evidence plus human decision recommendations.
4. Next: inventory gate records and run the independent local checks for M4-M8 before changing any status or evidence record.

5. Repaired the local verification environment by starting Docker Desktop, binding disposable PostgreSQL instances to ports 55432 and 55433, and starting the documented local services.
6. Automated verification passed: M4 provider/recovery 128/128; M5 billing suite 68/68 plus 49 schema, 10 Checkout and 18 reconciliation cases; M6 operations, privileged, MFA, recovery and affiliate probes; M7 Skills/customization/Docs/boundaries; M8 local preflight and fresh candidate runtime/restore.
7. Created `internal/evidence/acceptance/continuation-20261026/` with stage-by-stage automated explanations and `RETURN_FOR_EVIDENCE` recommendations.
8. Refreshed M4-M6 current candidate fingerprints after evidence/source changes, regenerated the final manual acceptance queue, and confirmed `verify:acceptance` passes without promoting any milestone.

9. Probed the replacement FirstPromoter credentials against read-only Admin API endpoints; all returned HTTP 200. Confirmed campaign 45084, zero promoters/referrals/commissions and no external write side effect.
10. Added the fail-closed live FirstPromoter adapter, server-side configuration gate and contract tests; incomplete commission batches cannot be reported as successful.
11. Deployed the adapter to hosted Acceptance with account/campaign runtime configuration; health remained ready and affiliate writes stayed disabled by the auto-payout safety flag.
12. Verified accepted promoter `15752036`, referral token `shpitto-203f34` and campaign `45084`; added automatic first-party capture of `?fpr=` and server-side promoter resolution without trusting browser-supplied IDs.
13. Confirmed FirstPromoter native Stripe tracking is still connected in test mode and the PayPal payout method is enabled; added a separate fail-closed flag to prevent duplicate tracking and payout exposure.
14. Added a disposable local referral-handler probe for FPR-only input, server-side promoter resolution, HttpOnly cookie issuance, disabled mode and mid-request configuration changes; it passes.
15. Recorded remaining M6 boundaries: affiliate settings still disabled, native Stripe test tracking connected, PayPal payout method enabled, and Stripe canonical order history not yet composed into affiliate reconciliation.
16. Added and tested the canonical Stripe history reader used by the configured affiliate authority; it fails closed on incomplete or mismatched payment history and never treats FirstPromoter commissions as billing history.

## 2026-10-27 Acceptance Manual Handoff

1. Started the local Next.js application on `http://127.0.0.1:3000`; `/api/healthz` returned HTTP 200 with `status=ready`, `profile=local` and `database=ready`.
2. Confirmed the hosted Acceptance origin is `https://shpitto-m4-web-production.up.railway.app` and opened its login page for the operator.
3. Manual Superadmin sign-in and 2FA remain pending. Credentials and one-time codes must be entered by the operator directly in the visible browser session; no secret values are recorded in evidence.

## 2026-10-28 Acceptance Continuation

1. Re-ran M5 local billing schema, Checkout and reconciliation probes: 49, 10 and 18 cases passed.
2. Re-ran Stripe Checkout, reconciliation, refund and inbox integration suites: 67/67 tests passed after starting the dedicated disposable PostgreSQL fixture on port 55433.
3. Re-ran M6 operations, admin reads, privileged, MFA, recovery, affiliate database, race, cash/dispute, notification and referral probes; all passed on disposable Docker PostgreSQL.
4. Corrected the admin-read probe to assert the actual fail-closed `pending` provider state instead of incorrectly expecting `unavailable` after configuration without a successful provider checkpoint.
5. Selected the existing verified Acceptance owner identity and applied the audited one-time Superadmin bootstrap. Password and second-factor evidence remain operator-owned.
6. Added `internal/evidence/acceptance/continuation-20261028/` with automated explanations and human decision recommendations. M4, M5 and M6 remain partial until the named hosted and independent evidence is reviewed.
