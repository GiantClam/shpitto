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
