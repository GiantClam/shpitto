## Objective

Fully land the current website-generation architecture so Shpitto's end-to-end website flow remains stable, translation-aware, seed-guided, and visually strong.

## Constraints

- Follow the repo's source-first fix order: requirement/spec -> skill contract -> orchestrator/policy -> runtime -> artifact.
- Prefer Open Design / HTML Anything contract upgrades over runtime-only patches.
- Keep existing behavior protected with tests whenever the behavior is already encoded or likely to regress.
- Preserve `website-generation-workflow` as the compatibility root while strengthening imported-seed-first behavior.

## Current Status (2026-05-31 Audit)

The codebase is ahead of this task plan.

Confirmed in code and targeted tests:

1. Discovery-brief locale propagation is already carried through chat intake, orchestrator state, workflow context, runtime execution, and translation handling with `supportedLocales` and `defaultLocale`.
2. Chat lifecycle routing already supports `generate`, `refine`, `translate`, and `deploy`, along with persisted revision pointers and short-term/long-term memory snapshots.
3. Imported seed-skill selection, selected-seed persistence, and seed resource index summaries are already visible in the loader, tool registry, tool executor, route-unit contracts, and runtime metadata.
4. Translation now runs as a dedicated execution lane instead of a prompt-only convention.

What remains from this plan is no longer feature landing at the runtime surface. The remaining work is status/documentation closure and broad verification.

## Execution Plan

### Phase 1: Gap audit and owner-layer mapping

Status: completed

1. Compare the current code paths against `docs/website-generation-technical-solution.md` section `4.6`.
2. Identify which missing behaviors belong to discovery/spec, skill metadata, orchestrator propagation, or runtime execution.
3. Record gaps and target owner layers in `findings.md`.

### Phase 2: Discovery-brief contract completion

Status: completed

1. Normalize `WebsiteDiscoveryBrief` so it can describe single-language, bilingual, and multilingual cases without losing `supportedLocales` / `defaultLocale`.
2. Ensure prompt-draft, route intake, and workflow context persist the same discovery contract through generate/refine/translate.
3. Add or update tests around discovery-brief propagation and locale semantics.

### Phase 3: Seed-skill primacy and resource-context upgrades

Status: completed

1. Make selected imported website seeds more visible in runtime metadata and workflow artifacts.
2. Ensure seed resource summaries (`example.html`, `assets/template.html`, `references/checklist.md`) are injected wherever imported website seeds materially shape generation.
3. Add tests for seed selection, seed resource prompt inclusion, and sidecar visibility.

### Phase 4: Quality-path tightening

Status: mostly completed

1. Inspect route-generation and website-spec surfaces for remaining generic fallbacks that suppress Open Design / HTML Anything value.
2. Move obvious surface-specific rules upward into skill/spec metadata when possible.
3. Add regression coverage around route contracts or workflow artifacts that benefit from the stronger source contract.

### Phase 5: End-to-end verification and documentation closure

Status: completed with environment-dependent full-suite gaps

1. Run targeted unit tests for touched files, then lint and typecheck the web app.
2. Update the main technical solution document if any implementation details evolve during landing.
3. Summarize changed files, simplifications, risks, and verification evidence.

---

## 2026-07-12 Productization Goal

### Objective

Make Shpitto a frontend control plane for an AI-operated website-template platform. A user request must be able to select a versioned template, have OpenCode execute the correct skill in an isolated workspace, modify or generate the template, validate it, preview it, and deploy the same runnable application. The first reference template is an AI image-generation product with real provider integration, CMS, authentication, history, billing, entitlements, and deployment runtime.

### Non-negotiable boundaries

- Shpitto frontend owns chat, task state, progress, preview links, approvals, and deployment evidence.
- OpenCode worker owns bounded code operations through injected, versioned skills.
- Template package owns product runtime, CMS adapter, payment adapter, provider adapter, migrations, and deployment configuration.
- Generated application runtime must not be reduced to static HTML when it declares server features.
- OpenCode failures, validation failures, and missing runtime capabilities must be reported as failures, not silently returned as successful baselines.
- Existing user changes remain untouched; each phase must be small and testable.

### Execution phases

1. Contract and workspace foundation: define the shared manifest, skill result envelope, workspace layout, capability declaration, and safe OpenCode policy.
2. Real skill execution: inject the selected skill and its resources, remove prompt-only skill selection, and make inspect/modify/validate/preview/deploy executable through one protocol.
3. Runnable AI image template: provide real provider, generation job, asset/history persistence, auth, and moderation boundaries; retain mock mode only as an explicit test adapter.
4. CMS and billing runtime: package Payload integration, schema/migrations, payment adapters, webhook verification, entitlement ledger, usage reservation, and reconciliation into the template runtime.
5. Modify and deploy lifecycle: route chat/CLI modifications through skills, validate before preview/deploy, deploy server-capable templates with the correct target adapter, and persist rollback evidence.
6. Verification and migration: run contract, generated-workspace build, provider sandbox, webhook replay, CMS publication, refinement, preview, deployment, and failure-path tests; update the product baseline and implementation documents.

### Current phase

Phases 1-5 are implemented in the current branch. Phase 6 is in progress: local contract, generated-workspace, failure-path, and adapter verification pass, while external provider sandbox, Stripe replay, Payload publication against a live CMS, and a real Vercel/Railway deployment still require environment credentials.

### Completion criteria

- A reference AI image template can be generated, modified, validated, previewed, and deployed from the Shpitto frontend.
- The deployed template performs a real sandbox image generation through a configured provider adapter.
- CMS edits affect published content through the declared publication path.
- A sandbox payment webhook grants entitlements exactly once and usage is reserved/settled correctly.
- A refinement request changes the template through the selected skill and produces a diff/audit record.
- OpenCode is never run with unbounded inherited secrets or implicit production permissions.
- Full verification evidence is recorded in `progress.md` and the current product baseline document.

### Implementation evidence

- OpenCode workspaces now contain `AGENTS.md`, `.shpitto/*`, and the selected versioned skill under `.opencode/skills/<skillId>/`.
- Productized generate/refine/validate/preview/deploy operations use one lifecycle protocol; refinement copies the previous workspace before applying the operation skill.
- Server-capable templates retain the Next.js workspace and use the Vercel/Railway deployment adapter. Static templates remain on the legacy static deployment path.
- The reference template includes a real Replicate adapter, Supabase-backed generation history, Stripe checkout/webhook verification, an append-only entitlement ledger, credit reservation/settlement/release, Payload publication and cache invalidation routes, and explicit preview-only mock mode.
- OpenCode failure is terminal by default. `SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK=1` is an explicit development compatibility mode and is recorded as a fallback, not as successful OpenCode execution.

### Errors encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Native read-only subagents failed with local proxy `404` because `gpt-5.3-codex` is not supported by the configured account | 1 | Continue with local analysis and implementation; no child-agent file changes were produced |
| Live OpenCode worker reached the installed CLI but the configured account quota was insufficient | 1 | Keep the default terminal failure behavior; the existing worker regression uses the explicit development fallback flag |

### 2026-07-13 OpenCode continuity and deployment audit

Status: completed with environment-dependent full-suite gaps

Objective: make OpenCode session continuity, workflow correlation, and long-running task handling explicit, then close the deployment capability audit without overstating unsupported targets.

1. Add session/workflow metadata to the OpenCode request and persist the native session identifier in the prepared workspace.
2. Pass `--session`, `--continue`, or `--fork` only when requested, and add regression coverage for each continuation mode.
3. Keep chat task heartbeats alive while OpenCode is running and choose timeout/stale windows by task class.
4. Update productized lifecycle state with the OpenCode session and workflow identifiers for later turns and recovery.
5. Add truthful source/Docker/Cloudflare capability declarations and adapters where the template can actually support them; leave unsupported server targets blocked.
6. Run focused tests, typecheck, lint, and generated-template smoke checks; record residual credential-dependent gaps.

Completed in this phase: native session flags and persistence, workflow correlation, in-flight heartbeat updates, task-class timeouts, Docker/source adapters, generated Docker packaging, and truthful Cloudflare capability metadata. Focused verification and the independent source build pass; the full web suite remains environment-dependent because it includes external provider tests and pre-existing legacy failures.

## 2026-10-13 Railway Provider Worker (active)

Scope: implement and deploy one isolated acceptance provider worker. No paid inference is authorized by this deployment task; keep submissions paused initially. Preserve unrelated .env.example deletions. No new dependencies, production mail, or existing business-object reads/deletes.

1. Inspect provider/lifecycle/OpenSpec contracts and Railway target (in progress).
2. Add regression tests for submission fencing, scoped runtime admission, transport bounds and recovery.
3. Implement workspace-scoped real dispatch/poll/materialization/settlement and separate health/sweep loops.
4. Repair official fal JWKS authentication in parallel, without weakening production admission.
5. Run typecheck, lint, format, provider/storage/worker contracts and disposable PostgreSQL integration.
6. Deploy separate Railway worker with create requests disabled; verify identity, health, tools and restart.
7. Save deployment evidence and update OpenSpec task 5.10 without claiming full M4 PASS.

## 2026-10-28 Configurable security controls

### Objective

Allow the template admin backend to configure optional SMTP/email verification, optional 2FA enforcement, and Cloudflare Turnstile without exposing secrets or bypassing server-side authorization. On a fresh installation, the first successful password signup may claim initial Superadmin ownership exactly once; existing installations keep claiming closed and retain audited server bootstrap.

### Constraints

- SMTP and 2FA are optional enhancements; authentication must still work when either is disabled.
- Turnstile is fail-closed when enabled and fail-open only when explicitly disabled.
- SMTP and Turnstile secret values are write-only from the admin UI and are encrypted at rest.
- Only an authenticated superadmin may change security settings.
- Existing Acceptance/production instances must not be silently reconfigured by the feature.
- First-user claiming is enabled only by migration on an empty installation; upgrades with any existing account keep it closed.
- Failed authentication, duplicate signup, and client-selected role or identity values must never claim ownership.
- No new dependency unless the existing runtime cannot support the feature.

### Phases

1. Contract and storage: add versioned security settings and operator-owner state schemas, encrypted-secret helper and server-side public/private projections.
2. Runtime policy: make email verification and operator step-up policy dynamic; atomically claim first-user ownership on successful credential auth, preserving upgrade behavior and audited server bootstrap.
3. Turnstile: add server verification, auth-route coverage and client widget support for signup, login and reset requests.
4. Admin UI/API: add superadmin-only security settings view with secret write-only fields and configuration status.
5. Tests and documentation: add contract/integration coverage, migration checks, OpenSpec updates and buyer setup guidance.
6. Verification: run format, lint, typecheck, focused auth/admin tests and disposable PostgreSQL probes.

### Current phase

Local implementation and verification complete. Hosted deployment, acceptance-gate review and independent stage decisions remain separate.

### Phase status

- Phase 1: complete. Security settings schema, encrypted-secret helper and migration are present.
- Phase 2: complete for email verification and operator 2FA policy wiring.
- Phase 3: complete for native Turnstile client/server integration and unit coverage.
- Phase 4: complete locally. Superadmin-only API and admin UI expose the optional controls with audited versioned updates.
- Phase 5: complete locally. OpenSpec and buyer operations docs cover optional controls, fresh-install ownership and upgrade bootstrap.
- Phase 6: complete locally for targeted verification. Dedicated PostgreSQL probes cover claim races, failed auth, restart, upgrades, bootstrap, security settings and 2FA; HTTP auth/team flows, typecheck, format, source boundaries, database boundaries, config, OpenSpec and production build pass.

### Completion rule

The local feature is complete when settings persist safely, auth behavior follows the configured policy, Turnstile rejects invalid enabled-mode requests, secrets never appear in responses/logs/evidence, the admin UI configures options through the supported API, and the one-time Superadmin claim is atomic, failure-safe, restart-safe and closed for upgrades. Hosted deployment and M6 acceptance remain separately gated.


## 2026-10-13 Worker Completion Evidence

Worker and companion Web deployed and health-checked; worker restarted successfully while paused. 145 contracts and 13 disposable PostgreSQL integration cases pass; fresh R2 signed input probe cleaned up. Independent bootstrap/adoption review fixes verified. No new paid generation. Full acceptance is blocked by stale M4 candidate digests and missing full live/hosted/independent stage evidence. Evidence saved under internal/evidence/M4/task-5.10/railway-worker/.


## 2026-10-13 Authorized Fal T2V Bootstrap

User authorized exactly one 720p/81-frame/16-FPS Fal T2V request with reference cost ~$0.41 and authorization budget USD1. Create a fresh seeded acceptance identity/workspace/reservation; retain an exclusive run record and durable submit fence. No blind retry on ambiguity. Establish account binding only from a JWKS-verified callback tied to the exact request ID returned by the authenticated create. Production worker remains create-disabled; only assigned-workspace recovery/polling may run. Preserve private output for Demo evidence, never print keys/signed URLs/session tokens.

## 2026-10-13 Authorized One-Shot Verification Complete

Exactly one Fal T2V create was accepted and never retried. Confirmed the account only from the signed, persisted-request callback, then bound both Railway services. Real worker/R2 publication, one seeded reservation consumption, HTTP authorization, scheduled fresh-fixture cleanup and restart retention passed. Worker is paused/create-disabled with effective scope unassigned. Full M4 remains open: current candidate digests are stale and the complete matrix/hosted-runner/whole-stage review is not asserted. Do not issue another paid create under this consumed authorization.

## 2026-10-26 Acceptance Gate Continuation

### Objective

Apply the evidence-first workflow to the remaining M4-M8 work: run available automated checks, exercise authorized hosted Acceptance paths without live money, write complete explanation packages, and recommend a human decision without asking reviewers to rerun tests.

### Scope

- M4 / task 5.10: refresh current automated and hosted worker evidence without another paid provider create.
- M5 / task 6.10: extend authenticated hosted Stripe test evidence; keep missing lifecycle/refund/dispute/webhook scenarios visible.
- M6 / task 7.14: run local and hosted-safe operations checks; record FirstPromoter and hosted settlement as external blockers if unavailable.
- M7 / task 8.15: verify governed skills, customization workflows, provenance and documentation against predecessor status.
- M8 / tasks 9.13-9.15: verify release/export/deployment prerequisites and record commercial and exact-candidate blockers.

### Execution phases

1. Inventory current gate records, queue entries, scripts and dependency edges.
2. Run independent local checks in parallel and capture exit codes and output references.
3. Run authorized hosted checks sequentially where the Acceptance environment supports them; do not use live keys, real funds or another paid provider create.
4. Create or update one evidence packet per gate with automated explanations, missing-claim blockers and human decision options.
5. Regenerate the final manual acceptance queue and verify that recommendations match the evidence.
6. Review the diff, run focused regression checks, commit using the Lore protocol and report remaining external/manual work.

### Completion rule

An automated PASS proves only the recorded scope. A gate remains `IN_PROGRESS` when a mandatory scenario, external account, exact release digest, independent review or integration decision is missing. Human reviewers choose `PASS`, `FAIL` or `RETURN_FOR_EVIDENCE` from the package; they do not rerun tests as a substitute for evidence review.

### Current phase

Phase 1: complete. Phases 2-6 completed for automated evidence continuation; external inputs and independent human decisions remain open by design.
