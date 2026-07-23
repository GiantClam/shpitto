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
