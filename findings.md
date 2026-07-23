## Working Findings

### Confirmed already-landed pieces

1. Translation now has a dedicated execution lane in `apps/web/lib/skill-runtime/executor.ts`.
2. Chat intake, orchestrator parsing, and memory persistence already carry `supportedLocales` and `defaultLocale`.
3. Imported website seed skills are discoverable from frontmatter and already expose a resource index for `example.html`, `assets/template.html`, and `references/checklist.md`.
4. Chat lifecycle orchestration already distinguishes `clarify`, `generate`, `refine_preview`, `refine_deployed`, `translate_preview`, `translate_deployed`, and `deploy`.
5. Chat memory already persists structured `requirementState`, `revisionPointer`, and a shared-storage fallback path through the file/supabase backend abstraction.
6. Runtime route units and website design spec generation already inherit `websiteDiscoveryBrief`, selected seed-skill IDs, and locale registry/source-catalog context.

### Audit conclusion

The previous "remaining high-value gaps" are no longer accurate after code inspection and targeted regression tests.

1. `WebsiteDiscoveryBrief` still keeps a high-level `localeMode`, but it also carries `supportedLocales` and `defaultLocale`, and the surrounding orchestrator/runtime code now preserves those fields through generate/refine/translate flows.
2. Seed/resource guidance is no longer sidecar-only. The loader, tool registry, tool executor, website design spec, and runtime workflow context all surface seed selection and seed-resource summaries.
3. The primary mismatch is documentation drift: status/plan files still describe these capabilities as pending even though the implementation and tests are already present.

### Residual gaps worth tracking

1. Broad repository verification is still pending. The targeted architecture tests passed, but lint/typecheck/full-suite confirmation has not yet been rerun as part of this audit.
2. Phase-5 closure artifacts should now focus on verification evidence and documentation cleanup rather than additional runtime feature work.

### Owner-layer hypothesis

1. The owner layer for the currently observed inconsistency is the plan/status documentation layer, not the runtime layer.
2. No new runtime patch should be introduced solely to satisfy stale planning language when the behavior is already implemented and test-covered.
3. Any remaining changes in this workstream should prefer documentation/status closure and broader verification over new execution-path edits.

---

## 2026-07-12 Productization Audit Findings

### Confirmed implementation

1. `apps/web/lib/opencode-cli/runner.ts` invokes the installed OpenCode binary (`1.17.15`) and parses JSON output.
2. `apps/web/lib/skill-runtime/executor.ts` routes productized baseline generation tasks into an OpenCode preparation path.
3. The generated workspace builds as a Next.js application in the gated smoke test.
4. Shpitto already contains separate billing adapters and server-side deployment code, but these are not packaged into the generated AI image template runtime.

### Blocking gaps

1. The OpenCode prompt carries a skill ID but the temporary workspace does not contain the selected `SKILL.md`, skill resources, or OpenCode project policy. Skill selection is therefore prompt-only.
2. The generated AI image template uses a mock SVG data URI endpoint instead of a provider adapter, job state, persistence, moderation, or asset storage.
3. The generated workspace contains only auth, locale, and mock generation API routes. Payment and Payload are represented by configuration/read adapters, not complete runtime integrations.
4. Deployment bundles only `staticSite.files`; the Next.js workspace and server routes are not deployed.
5. Refinement and deploy execution return through runtime branches before the OpenCode gate, so the main AI execution path does not cover modification or deployment.
6. OpenCode failure falls back to a successful prepared baseline by default.
7. OpenCode defaults to `--dangerously-skip-permissions` and inherits the full process environment.
8. The template manifest and baseline contract disagree about required CMS routes; the feature gate currently fails the route contract.
9. The template security report returns hard-coded passing values instead of inspecting the generated runtime.

### Verification evidence

- Targeted suite: 10 files, 27 tests passed and 3 failed. Failures include route-contract drift, stale mock-flow expectation, and template feature gate failure.
- Generated workspace build smoke: passed, but it validates only compilation and mock API behavior.
- Direct template feature gate: route contract failed; billing, Payload metadata, i18n, export artifacts, and secret-example checks passed.
- OpenCode executable check: `opencode --version` returned `1.17.15`.

### Owner layers

1. Skill injection and execution policy: OpenCode runner/workspace contract.
2. Template runtime capability gaps: AI image template package and its manifest.
3. Server-capable deployment: bundler/deployment adapter contract.
4. Route drift: baseline contract and template manifest.
5. False security pass: validation/reporting implementation.

### 2026-07-12 Closure Update

The blocking-gap list above is the pre-implementation audit and is retained as historical evidence. The following owner-layer fixes are now landed:

1. **OpenCode runner/workspace contract:** the selected skill, skill resources, `AGENTS.md`, manifest, route contract, deployment target, and result path are materialized into every productized workspace. The runner uses a safe environment allowlist and never enables production auto-approval.
2. **Template runtime:** the generated AI image template uses a Replicate adapter by default, explicit mock mode only for preview/test, persisted generation history, idempotent generation requests, and server-side auth boundaries.
3. **CMS and billing:** Payload reads published content, the authenticated CMS publish endpoint updates publication state and revalidates paths, Stripe webhooks verify signatures, and credits use an append-only ledger with reservation/settlement/release paths.
4. **Server deployment:** server-capable workspaces are preserved as runnable Next.js applications and deploy through the Vercel/Railway adapter; static-only templates continue to use the static bundler.
5. **Failure and security reporting:** OpenCode failures are terminal unless `SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK=1` is explicitly set, and the template security report scans generated files instead of returning hard-coded passing values.

Remaining verification is environment-dependent: a live Replicate sandbox, Stripe webhook replay, Payload publication against a running CMS, and an approved Vercel/Railway deployment have not been run in this workspace.

## 2026-07-13 OpenCode continuity audit

The installed OpenCode CLI is version 1.17.15 and its `run --help` contract exposes `--session`, `--continue`, and `--fork`. The current Shpitto runner does not pass any of these flags, so its multi-turn behavior is provided only by Shpitto's outer chat/workspace snapshots rather than by native OpenCode session continuity.

The current runner also applies one 180-second timeout to every operation and collects output until process exit. The chat worker's default stale-running threshold is 10 minutes, while the OpenCode execution branch only touches the task heartbeat before and after the child process. Long tasks can therefore be killed at three minutes or requeued as stale when the timeout is increased without a heartbeat loop.

The implementation target is a narrow runner/lifecycle contract repair: optional native session continuation, session persistence in `.shpitto/opencode-session.json`, workflow/step correlation in the request and result state, periodic task heartbeat during execution, and task-class timeout defaults. This remains a runtime fix because the failure is in process invocation and lifecycle control, not in the website-generation skill contract.

### Implementation outcome

The runner now passes native `--session`, `--continue`, and `--fork` flags when requested, persists the discovered session identifier, and exposes a progress callback. Productized chat execution uses that callback for a 20-second heartbeat and records `opencodeSessionId` in workflow context. Default timeouts are 30 minutes for baseline generation/deployment, 15 minutes for refinement/validation/preview, and 5 minutes for inspection; `SHPITTO_OPENCODE_TIMEOUT_MS` remains an explicit override. The worker stale-running default is 45 minutes.

Deployment capability is now explicit: Vercel and Railway remain managed server adapters; Docker builds a local server image; source produces a sanitized runnable package; Cloudflare Pages is declared unsupported for this server runtime because the existing Wrangler adapter is static-only. A generated multi-stage Dockerfile and `.dockerignore` are part of the template export.

The template feature gate now checks that deployment matrix and the Cloudflare guide agrees with the manifest. This prevents a future export from passing artifact checks while documenting an unsupported Pages deployment.

### Test isolation note

The productized worker regression now sets `SHPITTO_OPENCODE_TIMEOUT_MS=10000` only for the test and restores the environment afterward. Production task-class defaults remain unchanged. The template lifecycle test also revealed that generated `.next` output must not live inside the source template asset; the cache was removed after independent build verification.
