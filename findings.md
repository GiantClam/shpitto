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

## 2026-10-13 Railway Worker Findings

- Existing scripts/local-worker.ts is explicitly Mock/local-only; reuse domain commands, not that entrypoint.
- The acceptance profile currently exposes only mock-video; existing optional bypass in fal adapter is not safely scoped and must be removed/replaced.
- A crash after provider POST must never resend; persist a submission-start fence before network IO and reconcile unknown results without another create.
- Official fal JWKS is a keys array; modern headers do not require a key ID. Previous inline route parsing is incorrect.
- Provider costs may remain UNKNOWN under M4; do not invent a hard billable-cost requirement.
- Initial worker deployment will be paused with no admitted workspace. Health is not end-to-end M4 completion.

## 2026-10-13 Live Fal Runtime Findings

A trusted API-returned request ID plus official JWKS-verified callback can establish the Fal account binding without guessing a key prefix or copying a PEM. The ordinary paid-create guard remains unchanged. The output is 1280x720, 81 frames, duration 5.067 seconds; FFmpeg estimated r_frame_rate is not the requested FPS, so verification checks measured average rate and duration instead. R2 S3 API rejects the unsigned request with HTTP400/InvalidArgument; this is not an independent public-bucket-policy audit. A synthetically aged pending row drives a real scoped scheduler deletion, not a real 24-hour retention wait. Costs and local POST counters retain explicit provenance.

## 2026-10-14 Remaining Validation

The stale current-candidate fingerprint blocker is resolved for all development stages without changing any stage status or approval decision. The remaining root-integrity failure is a baseline-governance mismatch: the current root requires the S3 SDK and uses Next 16.3.8 while the selected-stack prototype records no S3 SDK and Next 16.3.6, and the accepted prototype lockfile digest differs from the root lockfile. This must be resolved by an explicit baseline/provenance review; it must not be hidden by changing validation output or promoting M4.
## 2026-10-26 Acceptance Gate Continuation Findings

1. The hosted Acceptance environment is usable for authenticated Stripe test Checkout and Portal verification. The bootstrap recovery path was exercised once, then disabled and its secret removed. No live Stripe key or real funds were used.
2. M5 hosted evidence now proves owner/member login, owner Checkout/Portal creation, member authorization denial and bootstrap cleanup. It does not prove the full 6.10 subscription lifecycle, refund, dispute or webhook replay scope.
3. The OpenSpec task file explicitly keeps M4, M5 and M6 development records `IN_PROGRESS` where whole-stage or external-provider evidence remains incomplete. Existing checked implementation rows do not automatically close the corresponding milestone gate.
4. M6 has local operations and affiliate probes, but the real FirstPromoter account and hosted settlement evidence remain external inputs. These cannot be synthesized from local fixtures without violating the acceptance contract.
5. M7 depends on M4, M5 and M6 gate closure and still requires exact current skill/workflow/provenance/docs evidence plus independent review.
6. M8 tasks 9.13, 9.14 and 9.15 remain blocked by commercial inputs, exact candidate/profile proof and final RC/BETA/STABLE review. A hosted readiness deployment alone cannot close those tasks.
7. The correct output for the remaining work is a set of automated evidence packages with explicit partial conclusions and human recommendations, not automatic checkbox promotion.

### Inventory snapshot

- The final queue currently has 10 records: M0-M3 are automated-ready or PASS; the current M4, M5 and M6 records are `IN_PROGRESS` with blocked criteria/scenarios; M7 and M8 have no current evidence record in the register.
- M4 current record has 10 retained local commands passing, coverage passing, four blocked criteria and 46 unrun scenarios.
- M5 current record has 18 retained local commands passing, coverage passing, five blocked criteria and 28 blocked scenarios; the new hosted Checkout packet covers only the authenticated hosted slice.
- M6 current record has 19 retained local commands passing, coverage passing, five blocked criteria and 39 blocked scenarios; FirstPromoter and hosted settlement remain external.
- The queue generator only consumes `evidenceRecordRefs` from `acceptance-status.json`, so supplemental evidence packets need explicit queue integration or a separate continuation report to be visible to reviewers.

### Fresh verification attempt

- TypeScript, source boundaries, format, config, database boundaries and strict OpenSpec validation passed.
- The combined M4 provider integration invocation failed before exercising provider logic because `APP_URL` was empty and the test constructed `new URL('')`.
- The combined M5 Stripe integration invocation failed before exercising billing logic because disposable PostgreSQL ports `55432` and `55433` were not running.
- These failures are environment blockers. They must be repaired by loading the repository's test environment and starting the documented disposable services before interpreting provider/billing behavior.

### Repaired local verification

- Docker Desktop was started and the documented local services became healthy. The main disposable PostgreSQL was bound to `55432`; a second ephemeral PostgreSQL was bound to `55433` for the hard-coded refund suite.
- M4 provider/recovery suite: 128/128 tests passed after supplying non-production dummy HTTPS S3 signing inputs. No provider network call or paid create was made.
- M5 Stripe/billing suite: 68/68 tests passed; billing schema, Checkout and reconciliation probes added 49 + 10 + 18 passing cases.
- M6 probes passed for operations, admin reads, workspace details, privileged commands, MFA, recovery, affiliate contracts, affiliate PostgreSQL, affiliate races, referral HTTP, cash affiliate and notifications. All used disposable local PostgreSQL; real FirstPromoter was not contacted.
- One M6 recovery probe initially failed because it used the PostgreSQL `postgres` database without the migrated application schema. Re-running against the migrated `shpitto` database passed; no source change was required.

### M7 and M8 automated continuation

- M7 Skills, customization, Docs, vendor Docs, release boundaries, content boundaries, shell boundaries and local-service checks all passed.
- The existing four-workflow M7 run is `LOCAL_WORKFLOWS_EXECUTED`: all four workflows passed, but it explicitly records no independent review, no gate promotion, and no real provider/payment execution.
- M8 local preflight passed for export boundaries, candidate runtime, deployment/Docker/config/restore/operations preflight and vendor commerce separation.
- The fresh local candidate check passed archive extraction, offline install, build, buyer checks, migration/seed, login/dashboard, cancellation/refund, worker success/deadline refund, private download, backup/restore, restart persistence and exactly-once credit behavior.
- M8 remains blocked for commercial readiness, real provider/payment/affiliate inputs, managed/production deployment and RC/BETA/STABLE independent review. These are evidence blockers, not failed local code checks.

### FirstPromoter account readback

- The supplied account/key pair now authenticates successfully: promoter campaigns, referrals, commissions and grouped payouts all return HTTP 200.
- Campaign `45084` (`web template Affiliate Program`) is confirmed. An accepted promoter exists; referrals and commissions are still zero.
- No write endpoint was called; no promoter, sale, refund, settlement or payout side effect occurred.
- M6 remains `RETURN_FOR_EVIDENCE` until a disposable test promoter/referral exists and the account's auto-payout setting is explicitly confirmed disabled.
- The live adapter is deployed to Acceptance and the hosted health endpoint remains ready; runtime credentials are not recorded in evidence.
- The owner updated campaign `45084` to `20% commission for first charge`; accepted promoter `15752036` and referral token `shpitto-203f34` resolve to that campaign.
- The FirstPromoter dashboard still shows native Stripe tracking connected in test mode and the PayPal payout method enabled. A separate fail-closed flag blocks custom sale/refund tracking until duplicate tracking and payout are confirmed safe.
- Promoter detail confirms accepted promoter `15752036` has referral token `shpitto-203f34`; the Admin API currently returns zero referrals and commissions.
- Shpitto affiliate settings remain disabled. The audited Superadmin campaign-policy command can bind the account after provider readback passes, but current payout and native-tracking safeguards prevent enablement.
- FirstPromoter commission history is not canonical Stripe payment history; reconciliation must consume complete local Stripe order/customer records before sale delivery.
- Latest Acceptance deployment serves the referral capture code and is healthy; the hosted referral endpoint returns `disabled` with no cookie until Superadmin binds/enables the provider, confirming fail-closed behavior.
