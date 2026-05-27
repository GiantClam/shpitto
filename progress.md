# Progress Log: Conservative Open Design Adoption

## Session: 2026-05-26

### Phase 1: Baseline and Planning
- **Status:** in progress
- Actions taken:
  - Read the adoption plan and the required harness architecture docs before editing.
  - Audited the main owner-layer files for website generation:
    - `chat-orchestrator.ts`
    - `prompt-draft-research.ts`
    - `website-design-spec.ts`
    - `website-type-selector.ts`
    - `project-skill-loader.ts`
    - `od-skill-metadata.ts`
    - `executor.ts`
    - `skill-tool-executor.ts`
  - Confirmed that:
    - partial Open Design integration already exists
    - surface modes are too narrow for docs/hub sites
    - staged imported website skills are not yet discoverable
    - hard gates are partly in place, but placeholder leakage is not yet formalized in the current bounded validation set

### Next Implementation Targets
- Add rollout flags and surface-mode extensions.
- Add staged imported-skill discovery/metadata support.
- Persist `WebsiteDiscoveryBrief` and design-system lock inputs.
- Add route-unit metadata persistence and placeholder leakage gate.
- Add focused tests before broader replay work.

### Phase 1 Continuation: Verification-Guided Wiring
- **Status:** complete
- Actions taken:
  - Ran focused typecheck and regression tests for prompt draft, website surface selection, design spec, and skill loader.
  - Found unfinished Open Design wiring:
    - `website-type-selector.ts` returned docs/content-hub skill IDs while its type list still allowed only the original three modes.
    - `prompt-draft-research.ts` referenced a missing explicit URL source-priority helper.
    - prompt-control manifest test helpers did not attach a discovery brief, so knowledge-profile manifests lost `websiteSurfaceMode`.
  - Patched those upstream prompt/selector contract gaps before touching any runtime executor behavior.
  - Fixed route-scope gate behavior:
    - unexpected generated HTML now blocks only confirmed Prompt/Workflow Manifest core routes
    - nested content detail pages remain valid supporting artifacts
    - heuristic route plans keep existing QA behavior without being treated as locked manifests
  - Focused verification now passes for prompt/spec/loader/surface selection, chat refine/store flows, route-unit/gate runtime tests, and TypeScript typecheck.
  - Fixed confirmed-prompt async queue propagation so docs/knowledge prompts persist `websiteSurfaceMode`, `websiteTypeSkillId`, and the sidecar discovery brief as `docs-knowledge-site`.
  - Final verification performed:
    - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
    - `pnpm --dir apps/web exec eslint .` passed.
    - Prompt/spec/loader/surface/content-source focused suite passed: 6 files, 93 tests.
    - Route-unit/gate/runtime focused suite passed: 5 files, 260 tests, 1 skipped.
    - Chat async/refine/store/preview focused suite passed: 7 files, 85 tests.
    - Additional skill-tool/workflow focused suite passed: 3 files, 158 tests.
    - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.
  - Full Vitest and non-live Vitest attempts exceeded the 5-minute command timeout, so replay-wide verification remains a follow-up gap.

### Phase 2 Continuation: Remaining Adoption Gaps
- **Status:** complete for this pass
- Actions taken:
  - Added staged `apps/web/skills/imported-html-anything/**` website-only skills for docs/reference and content/resource surfaces, including examples and notices.
  - Added `WebsiteDiscoveryBrief` confirmation metadata:
    - `confirmationStatus`
    - `missingFields`
    - `assumptions`
  - Added route-unit metadata fields for inherited terminology, inherited design tokens, route contract lines, opening family, generated files, and structured validation result.
  - Added a `GenerationWorkerAdapter` interface and factory as the internal boundary for future route-unit execution adapters.
  - Added observation-only QA findings for repeated route opening signatures; these are reported in `qaSummary.observations` and do not block generation.
- Verification:
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint .` passed.
  - Focused adoption/runtime suite passed: 6 files, 245 tests.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 3 Continuation: Fast Adoption Smoke and Sidecar Injection
- **Status:** complete
- Actions taken:
  - Indexed root-level `example.html` files in project skill resource summaries so staged imported Open Design / HTML Anything skills expose example-backed contracts.
  - Added automatic initial-context injection for selected website seed/sidecar skills in skill-tool generation.
  - Added `renderWebsiteSeedSkillSidecarGuidance` and regression coverage proving the docs/knowledge sidecar contract appears before a model calls `load_skill`.
  - Added `pnpm --dir apps/web run smoke:open-design-adoption`, backed by `open-design-adoption-smoke.test.ts`, to generate offline artifacts for corporate, docs/knowledge, and content-hub rollout surfaces:
    - canonical prompt
    - `website_design_spec.md`
    - first round prompt
    - sidecar guidance
    - route unit JSON
    - smoke report JSON
  - Added generation result metadata with QA observations and route-repair evidence status.
  - Tightened route planning for negative blog/archive intent after the smoke exposed a docs/knowledge prompt that still added `/blog` and `/archive`.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 167 tests.
  - `pnpm --dir apps/web run smoke:open-design-adoption` passed: 3 smoke scenarios inside 1 Vitest test; docs/knowledge now keeps only `/`, `/docs`, `/guides`, `/api-reference`, and `/support`.
  - `pnpm --dir apps/web exec vitest run lib/agent/open-design-adoption-smoke.test.ts lib/agent/prompt-draft-research.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/skill-runtime/website-type-selector.test.ts --reporter=dot` passed: 5 files, 203 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint .` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 4 Continuation: Risk Convergence and Live Homepage QA
- **Status:** complete
- Actions taken:
  - Loaded the project harness again before changing QA behavior.
  - Treated suitable Open Design-style visual checks as portable QA gates inside the current project layer rather than importing unrelated Open Design surfaces.
  - Added a provider-backed live homepage smoke command for the `docs-knowledge-site` path.
  - Ran live homepage generation for a docs/knowledge brief and captured generated output under `apps/web/.tmp/open-design-homepage-live/latest/site`.
  - Converted the observed flat-footer failure into a structured footer shell generation contract and bounded hard gate.
  - Converted observed typography breakage into CSS hard gates for:
    - arbitrary heading word breaks
    - negative letter spacing
    - automatic heading hyphenation
  - Added a responsive table shell hard gate after mobile screenshot review showed docs/hub matrix content is a likely narrow-width risk.
  - Captured desktop and mobile screenshots in `output/playwright/open-design-homepage-live-desktop.png` and `output/playwright/open-design-homepage-live-mobile.png`.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/visual-qa/anti-slop-linter.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 165 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint .` passed.
  - `pnpm --dir apps/web run smoke:open-design-adoption` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.
  - `pnpm --dir apps/web run smoke:open-design-homepage:live` passed after the final table-gate patch, generating `/styles.css`, `/script.js`, `/index.html`, and `/qa-report.json` in about 81 seconds.
  - Browser probe for the latest live homepage returned status 200, no placeholder copy, no heading break risk, no negative letter spacing, no heading hyphenation, a structured footer signal, and a responsive-table signal.

### Phase 5 Continuation: Open Design Rule Migration for Homepage Quality
- **Status:** complete
- Actions taken:
  - Rechecked Open Design website references for the two observed preview problems:
    - visitor-facing copy describing page mechanics instead of the subject
    - compressed hero-side text overflowing narrow cards
  - Migrated suitable Open Design-style rules into Shpitto's current website path:
    - block visible page-mechanics copy such as "the page groups", "the homepage frames", and "the visual system keeps"
    - require hero-side stat/summary cards to use short labels and compact facts, not long explanatory sentences
    - require responsive shells for table-like docs/hub matrices
    - block generated CSS that makes headings fragile on narrow screens: arbitrary heading word breaks, heading hyphenation, and negative letter spacing
    - warn on generic CTA labels, overlong headings, overlong lead copy, raw hex color drift outside token definitions, and visible mojibake
  - Kept more subjective Open Design review ideas as observation/manual candidates instead of hard gates for this rollout:
    - one decisive visual flourish
    - alternating section rhythm
    - consistent image style per page
    - visual monotony scoring
  - Regenerated the live docs/knowledge homepage and browser-checked the latest preview.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/visual-qa/anti-slop-linter.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 170 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint .` passed.
  - `pnpm --dir apps/web run smoke:open-design-adoption` passed.
  - `pnpm --dir apps/web run smoke:open-design-homepage:live` passed, regenerating the latest homepage in about 87 seconds.
  - Browser probe for `http://127.0.0.1:4180/index.html` returned status 200 and confirmed no page-mechanics copy, no compressed stat copy, no placeholder copy, no heading break risk, no negative letter spacing, a structured footer, and a responsive table shell.

### Phase 6 Continuation: Additional Skill Migration for Quality and Stability
- **Status:** complete for this pass
- Actions taken:
  - Checked remaining local website-related skills for migration value.
  - Promoted `open-design-pricing-page` as a controlled sidecar for supported pricing routes by adding surface compatibility metadata for:
    - `marketing-landing-site`
    - `corporate-b2b-site`
  - Adjusted seed scoring so first-party specialized sidecars receive a light surface bonus while staged docs/hub imports keep the stronger surface bonus. This prevents pricing guidance from taking over a broader SaaS landing page while still letting pricing routes see the pricing contract.
  - Confirmed `website-refinement-workflow` is already the default refine skill in the runtime path and made the upstream workflow contract explicit:
    - preview-stage visual/copy feedback should stay in the refinement lane
    - ordinary preview feedback should not trigger full regeneration
    - refine reports must record the active refine skill and changed files
  - Rewrote reusable quality skills in English so they can serve as executable website contracts instead of loose or corrupted guidance:
    - `responsive-by-default`
    - `section-quality-checklist`
    - `design-system-enforcement`
    - `visual-qa-mandatory`
    - `end-to-end-validation`
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/open-design-real-env.test.ts --reporter=dot` passed: 2 files, 21 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint .` passed.
  - `pnpm --dir apps/web run smoke:open-design-adoption` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 7 Continuation: Footer Band and Preview Link Verification
- **Status:** complete
- Actions taken:
  - Root-caused the reported "missing footer" preview issue as a generated HTML/CSS contract gap: the footer tag could exist while the page lacked a distinct top-level footer band.
  - Strengthened the structured footer hard gate so shared footer utilities must be paired with visible top-level footer band styling on `footer`, `.site-footer`, or `.footer`.
  - Strengthened QA repair guidance so footer repairs rebuild both HTML zones and CSS band chrome, not just link wrappers.
  - Extended visitor-copy mechanics detection to block visible implementation labels such as "Responsive layout" and "Shared shell".
  - Regenerated the docs/knowledge homepage and confirmed the preview at `http://127.0.0.1:4180/index.html` serves the latest output with a visible footer.
  - Captured verification screenshots:
    - `output/playwright/open-design-homepage-footer-fixed-desktop.png`
    - `output/playwright/open-design-homepage-footer-fixed-mobile.png`
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 1 file, 153 tests.
  - `pnpm --dir apps/web run smoke:open-design-homepage:live` passed after the final copy-mechanics gate, generating `/styles.css`, `/script.js`, `/index.html`, and `/qa-report.json` in about 82 seconds.
  - Browser probe for `http://127.0.0.1:4180/index.html` returned status 200, `hasFooter=True`, and `badMechanics=False`.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 8 Continuation: Three-Scenario Homepage Replay Matrix
- **Status:** complete
- Actions taken:
  - Ran provider-backed homepage smoke generation for:
    - `corporate` -> `corporate-b2b-site`
    - `docs` -> `docs-knowledge-site`
    - `hub` -> `content-hub-site`
  - Fixed the live smoke harness so scenario-specific brands are checked correctly instead of always expecting `Meridian API Platform`.
  - Narrowed smoke placeholder assertions so legitimate resource-hub content such as "templates" and search-input placeholder attributes do not fail the run.
  - Added page-mechanics hard gates for more direct implementation-copy leaks:
    - `responsive layout`
    - `shared shell`
    - `homepage built/designed for`
  - Kept softer review-environment wording out of the hard gate after hub replay showed it caused repeated bounded-repair exhaustion.
  - Added `/styles.css` to flat-footer QA repair targets so footer-shell repairs can update both markup and visible footer-band styling.
  - Saved scenario artifacts:
    - `apps/web/.tmp/open-design-homepage-live/corporate`
    - `apps/web/.tmp/open-design-homepage-live/docs`
    - `apps/web/.tmp/open-design-homepage-live/hub`
  - Captured screenshots:
    - `output/playwright/open-design-homepage-matrix-corporate-desktop.png`
    - `output/playwright/open-design-homepage-matrix-corporate-mobile.png`
    - `output/playwright/open-design-homepage-matrix-docs-desktop.png`
    - `output/playwright/open-design-homepage-matrix-docs-mobile.png`
    - `output/playwright/open-design-homepage-matrix-hub-desktop.png`
    - `output/playwright/open-design-homepage-matrix-hub-mobile.png`
- Matrix results:
  - `corporate`: passed, `corporate-b2b-site`, ~65.2s, 1 warning (`raw-hex-outside-root`), footer present, no hard page-mechanics leakage.
  - `docs`: passed after one transient Vitest worker retry, `docs-knowledge-site`, ~110.0s, 2 warnings (`overlong-lead-copy`, `raw-hex-outside-root`), footer present, no hard page-mechanics leakage.
  - `hub`: passed after tuning over-strict gates, `content-hub-site`, ~96.1s, 2 warnings (`overlong-lead-copy`, `raw-hex-outside-root`), footer present, no hard page-mechanics leakage.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 1 file, 153 tests.

### Phase 30 Continuation: CASUX Full-Flow Live Coverage
- **Status:** complete
- Actions taken:
  - Added a dedicated CASUX live smoke at `apps/web/lib/agent/casux-fullflow-live.test.ts`.
  - Kept the flow on the real Shpitto main path:
    - chat entry request
    - prompt draft card generation
    - confirm-generate queueing
    - generation worker execution
    - preview verification
    - deploy confirmation gate
    - deploy worker execution
    - deployed runtime verification
  - Used an uploaded-source-style CASUX planning fixture by intercepting only the synthetic `CASUX_.md.pdf` fetch while leaving deploy-time network verification real.
  - Added `pnpm --dir apps/web run smoke:casux-fullflow:live` as the dedicated entry point.
- Verification:
  - Added a Windows-safe wrapper script so the dedicated live command starts reliably under `pnpm` and preserves `NODE_USE_ENV_PROXY=1` and `RUN_CASUX_FULLFLOW_LIVE=1`.
  - Added deploy-smoke runtime fallback coverage so Cloudflare API deployment success can bypass false post-deploy live-fetch failures when `pages.dev` is unreachable from the worker environment.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/executor.deploy.test.ts --reporter=dot` passed: 1 file, 37 tests.
  - `pnpm --dir apps/web run smoke:open-design-homepage:live` passed for all three selected scenarios with `SHPITTO_OD_HOMEPAGE_SCENARIO` set to `corporate`, `docs`, and `hub`.
  - Static scenario probe confirmed all three saved outputs have the expected brand, expected surface mode, visible footer band, and no hard page-mechanics leakage.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-homepage-live.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 31 Continuation: CASUX Workflow Integration
- **Status:** complete
- Actions taken:
  - Extended `apps/web/scripts/open-design-regression-matrix.mts` so the shared workflow runner now includes the CASUX full-flow live lane by default.
  - Added a `casux` summary block to the aggregated markdown/json report with:
    - report path
    - manifest route count
    - runtime-content-route presence
    - deployment verification mode
    - deployed or production URL
  - Added `SHPITTO_OD_MATRIX_SKIP_CASUX=1` as the bounded opt-out for fast local runs.
  - Added `pnpm --dir apps/web run smoke:open-design:workflow` as a clearer workflow alias while keeping the existing `smoke:open-design:matrix` command.
- Verification:
  - `pnpm --dir apps/web exec eslint scripts/open-design-regression-matrix.mts lib/agent/casux-fullflow-live.test.ts lib/skill-runtime/executor.ts lib/cloudflare.ts lib/skill-runtime/executor.deploy.test.ts` passed.
  - `pnpm --dir apps/web exec -- tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec -- vitest run lib/skill-runtime/executor.deploy.test.ts --reporter=dot` passed.
  - `pnpm --dir apps/web run smoke:open-design:workflow` passed with `SHPITTO_OD_MATRIX_SKIP_STATIC=1`, `SHPITTO_OD_MATRIX_SKIP_HOMEPAGE=1`, and `SHPITTO_OD_MATRIX_SKIP_FULLSITE=1`, proving the shared workflow entry now executes and reports the CASUX full-flow lane.
  - Aggregated report captured `CASUX Full Flow` with `cloudflare-api-plus-local-bundle` verification mode and report path persistence under `.tmp/open-design-regression-matrix/report.{md,json}`.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 32 Continuation: Docs Fullsite Stability Sampling
- **Status:** complete
- Actions taken:
  - Ran the full release-grade workflow baseline once with all lanes enabled:
    - static hybrid gate
    - homepage matrix
    - fullsite matrix
    - CASUX full-flow generate-preview-deploy verification
  - Confirmed the aggregate baseline passed and persisted the result under `.tmp/open-design-regression-matrix/report.{md,json}`.
  - Investigated the only notable soft-risk signal from that run: `docs` fullsite passed only after one retry and one bounded route repair.
  - Ran three additional targeted stability samples using the shared workflow entry with only `docs` fullsite enabled.
  - Persisted per-run copies under `.tmp/open-design-regression-matrix-history/docs-fullsite-run-{1,2,3}.json` plus `.tmp/open-design-regression-matrix-history/docs-fullsite-summary.json`.
- Verification:
  - Full workflow baseline passed with:
    - homepage: `corporate/docs/hub` all pass, zero warnings
    - fullsite: `corporate/docs/hub/publishable` all pass
    - CASUX full-flow: pass to deploy verification
  - The follow-up `docs` fullsite stability samples passed `3/3`:
    - all three runs passed on the first attempt
    - all three runs reported `5/5` route visual checks
    - all three runs reported `bridgeAttempted=true`, `bridgeFallbacks=0`
    - all three runs reported `no_route_repair_needed`

### Phase 9 Continuation: Surface Visual Differentiation Contract
- **Status:** implemented; live replay blocked by provider network resets
- Actions taken:
  - Root-caused the reported same-theme/similar-template issue as a missing surface visual identity contract plus weak CSS token authority.
  - Added explicit surface visual identity, copy exclusion, CSS token, and typography token contracts to `website_design_spec` for:
    - `corporate-b2b-site`
    - `docs-knowledge-site`
    - `content-hub-site`
  - Added matching visual identity contracts to the three surface skills.
  - Updated the shared asset round prompt so `/styles.css` must honor `surface_css_tokens` and `surface_typography_tokens` from `/website_design_spec.md` over generic style preset colors.
  - Passed upstream `websiteSurfaceMode`, discovery brief, and design-system lock metadata into skill-tool-generated `website_design_spec.md` instead of relying only on requirement-text inference.
  - Added a bounded surface-token QA gate that blocks the generic green/white rounded-card token family for the selected first-rollout surfaces and routes repairs back to `/styles.css`.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 166 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.
  - Provider-backed `corporate` homepage replay was attempted twice, but all configured providers failed before generation with TLS `ECONNRESET` connection errors. No new visual preview could be produced in this pass.

### Phase 10 Continuation: Provider-Backed Surface Preview Verification
- **Status:** complete
- Actions taken:
  - Diagnosed provider TLS failures as a Node proxy path issue. `NODE_USE_ENV_PROXY=1` is required for Node fetch/OpenAI calls to honor the local `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7890` proxy in this environment.
  - Re-ran provider-backed homepage generation for `corporate`, `docs`, and `hub`, and saved each scenario under `apps/web/.tmp/open-design-homepage-live/{corporate,docs,hub}`.
  - Captured updated desktop and mobile screenshots for all three scenarios:
    - `output/playwright/open-design-homepage-surface-corporate-desktop.png`
    - `output/playwright/open-design-homepage-surface-corporate-mobile.png`
    - `output/playwright/open-design-homepage-surface-docs-desktop.png`
    - `output/playwright/open-design-homepage-surface-docs-mobile.png`
    - `output/playwright/open-design-homepage-surface-hub-desktop.png`
    - `output/playwright/open-design-homepage-surface-hub-mobile.png`
  - Added hard gates for two preview-visible defects discovered during replay:
    - `[data-reveal]` / `.reveal` CSS must not hide route content with `opacity:0` before scroll-driven JavaScript runs.
    - `/styles.css` must not contain placeholder CSS markers.
  - Expanded page-mechanics copy detection to catch "homepage foregrounds..." and "homepage reflects..." framing leaks.
- Final replay results:
  - `corporate`: passed, `corporate-b2b-site`, ~387.2s, QA 92, 5 sections, distinct dark enterprise tokens, no hard copy/CSS leaks.
  - `docs`: passed, `docs-knowledge-site`, ~184.9s, QA 92, 4 sections, distinct docs/reference tokens, no hard copy/CSS leaks.
  - `hub`: passed, `content-hub-site`, ~121.3s, QA 92, 7 sections, distinct archive/editorial tokens, no hard copy/CSS leaks.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 1 file, 156 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - Static scenario probe confirmed all three saved outputs have distinct CSS token families and no hard page-mechanics or placeholder/reveal-hidden CSS leaks.

### Phase 11 Continuation: Full-Site Main Flow Wiring
- **Status:** complete for this pass
- Actions taken:
  - Compared the remaining implementation against the multi-skill architecture plan.
  - Identified the next owner-layer gap as orchestrator/runtime handoff rather than homepage contract quality:
    - the default skill-tool path rebuilds workflow files after provider selection without preserving `websiteSurfaceMode`, `websiteDiscoveryBrief`, or explicit design-system lock metadata.
    - route-unit checkpoint snapshots are present in the native runtime path but not in the skill-tool path that the main flow uses by default.
    - provider-backed smoke coverage is still homepage-only, so route-unit behavior across all planned routes is not exercised.
  - Preserved surface/discovery/design-system metadata across the skill-tool workflow-file rebuild after provider selection.
  - Added route-unit snapshot generation to the skill-tool flow, including generated files and per-route validation status.
  - Persisted route-unit counts/snapshots in task progress and included compact route-unit evidence in website generation timeline metadata.
  - Added `smoke:open-design-fullsite:live` for provider-backed full-site route-unit validation.
- Verification:
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 171 tests.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-design-spec.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/executor.ts lib/agent/open-design-fullsite-live.test.ts` passed.
  - `pnpm --dir apps/web run smoke:open-design-fullsite:live` passed for the docs scenario with 5 routes, 7 generated files, QA average 92, 5/5 passed routes, and 0 repair retries.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 12 Continuation: Full-Site Replay Matrix and Manifest Closure
- **Status:** complete for this pass
- Actions taken:
  - Fixed authoritative Prompt Control Manifest route drift by preserving exact structured manifest paths during route normalization. `/solutions` now remains `/solutions` instead of being canonicalized to `/custom-solutions`.
  - Passed the selected `websiteSurfaceMode` into runtime QA so homepage archetype checks no longer re-infer the wrong surface from mixed prompt text.
  - Tightened manifest-mode output handling:
    - extra HTML emitted outside the manifest route set is rejected during tool execution
    - manifest required-file calculation no longer chases unrequested `/blog/{slug}` files
    - expected route pages that link to unrequested `/blog` or `/archive` route families are repaired instead of materializing those routes
    - explicit publishable-content routes still allow corresponding detail pages when the request asks for them.
  - Narrowed the workflow/meta copy gate so normal docs wording such as "assumption" is allowed, while internal phrases such as "assumption notes" remain blocked.
  - Isolated full-site smoke outputs per scenario under `apps/web/.tmp/open-design-fullsite-live/{scenario}`.
- Matrix results:
  - `corporate`: passed, `corporate-b2b-site`, 5 routes, 7 generated files, 5/5 passed routes, no `/custom-solutions` drift.
  - `docs`: passed, `docs-knowledge-site`, 5 routes, 7 generated files, 5/5 passed routes.
  - `hub`: passed, `content-hub-site`, 5 routes, 7 generated files, 5/5 passed routes, no unrequested `/blog/{slug}` files.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 200 tests, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/skill-execution-adapter.ts lib/skill-runtime/website-generation-skill-adapter.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/decision-layer.ts lib/agent/open-design-fullsite-live.test.ts` passed.
  - `NODE_USE_ENV_PROXY=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed for `SHPITTO_OD_FULLSITE_SCENARIO=corporate`, `docs`, and `hub`.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 13 Continuation: Full-Site Static Preview Sanity Evidence
- **Status:** complete for this pass
- Actions taken:
  - Extended `open-design-fullsite-live.test.ts` so every materialized full-site route is checked after bundling.
  - Added per-route sanity checks for:
    - doctype, viewport, shared CSS/JS references, `main`, `h1`, navigation, and footer shell
    - sufficient visible text for real page content
    - manifest-bounded internal route links
    - visible placeholder copy and page-mechanics copy leakage
  - Added shared CSS sanity checks for placeholder CSS markers, hidden reveal baselines, and fragile heading wrap rules.
  - Persisted results to `route-visual-checks.json` and embedded them in each full-site smoke `report.json`.
- Matrix results:
  - `corporate`: passed, 5 route visual checks, 0 failures, 5 routes, 7 generated files.
  - `docs`: passed, 5 route visual checks, 0 failures, 5 routes, 7 generated files.
  - `hub`: passed, 5 route visual checks, 0 failures, 5 routes, 7 generated files.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 200 tests, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-fullsite-live.test.ts lib/skill-runtime/skill-execution-adapter.ts lib/skill-runtime/website-generation-skill-adapter.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/decision-layer.ts` passed.
  - `NODE_USE_ENV_PROXY=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed for `SHPITTO_OD_FULLSITE_SCENARIO=corporate`, `docs`, and `hub`.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 14 Continuation: Full-Site Route Repair Evidence
- **Status:** complete for this pass
- Actions taken:
  - Added explicit `routeRepairEvidence` to skill-tool execution summaries.
  - Counted bounded QA repair attempts and collected the generated files targeted by those repairs.
  - Persisted route repair evidence into:
    - workflow QA report artifacts
    - final workflow context
    - skill-runtime execution summaries
    - website generation timeline metadata
    - provider-backed full-site smoke reports.
  - Re-ran the content-hub full-site live smoke to verify a real repair path is visible as evidence rather than hidden inside executor logs.
- Evidence:
  - The latest hub full-site replay passed with 5 route visual checks and recorded `route_repairs_applied`.
  - The replay captured 2 bounded repair attempts against `/resources/index.html`.
  - `fullRegenerationAvoided` was recorded as `true`, proving the main flow can repair a route without restarting the whole site generation.
- Verification:
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 200 tests, 1 skipped.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-fullsite-live.test.ts lib/skill-runtime/executor.ts lib/skill-runtime/skill-tool-executor.ts` passed.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=hub pnpm --dir apps/web run smoke:open-design-fullsite:live` passed and wrote route repair evidence into `apps/web/.tmp/open-design-fullsite-live/hub/report.json`.

### Phase 15 Continuation: No-Blog/Archive Runtime Hook Closure
- **Status:** complete for this pass
- Actions taken:
  - Ran provider-backed full-site smoke for corporate, docs, and hub.
  - Found a remaining hub defect: `/resources/index.html` did not create `/blog` or `/archive` links, but it still emitted `data-shpitto-blog-root` and `data-shpitto-blog-api="/api/blog/posts"` runtime hooks.
  - Treated this as a source contract and QA coverage gap, not an artifact-only patch.
  - Updated route blueprint generation so explicit "no blog/archive behavior" keeps semantic resource/research routes as static route-owned directory surfaces instead of Blog runtime-backed content collections.
  - Added runtime QA blocking for Blog/content collection hooks when a closed Prompt Control Manifest explicitly forbids blog/archive behavior.
  - Extended the full-site static visual check so any generated route without `/blog` in the manifest fails if it contains Blog runtime hooks, `/api/blog/posts`, `/blog` links, or archive links.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 2 files, 202 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-fullsite-live.test.ts lib/skill-runtime/decision-layer.ts lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - `NODE_USE_ENV_PROXY=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed for `corporate`, `docs`, and `hub`.
  - Independent `rg` scan of all three generated site directories found no `data-shpitto-blog`, `/api/blog/posts`, `/custom-solutions`, `/blog`, or `/archive` route-link residue.

### Phase 16 Continuation: Publishable Detail-Page Risk Coverage
- **Status:** complete for this pass
- Actions taken:
  - Added a provider-backed `publishable` full-site smoke scenario for a personal technical blog.
  - Extended the full-site smoke harness to:
    - allow expected `/blog/{slug}` detail routes only when the scenario requests them
    - require at least the requested number of Blog detail pages
    - run static sanity checks on generated detail pages, including visible body length, h1, article/section body, and h2 structure
    - keep no-blog/no-archive scenarios strict by requiring zero Blog detail routes.
  - Fixed a route-planning regression where archive-negative wording such as "Do not invent archive category routes beyond the Blog route" suppressed an explicitly requested `/blog` route.
  - Tightened content-hub/no-blog static-directory contracts and QA repair guidance after live replay showed `/resources` could repeatedly fall back to legacy split-hero directory openings.
  - Fixed website surface selection so personal technical blogs with About/Contact routes still select `portfolio-blog-site`, not `corporate-b2b-site`.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/decision-layer.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 3 files, 209 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=publishable pnpm --dir apps/web run smoke:open-design-fullsite:live` passed with 3 generated Blog detail routes and 7/7 visual checks.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=hub pnpm --dir apps/web run smoke:open-design-fullsite:live` passed after route-opening guidance was tightened.
  - Independent scans found no hidden Blog runtime hooks or archive/custom-solution residue in the hub output, and no archive/custom-solution residue in the publishable output.

### Phase 17 Continuation: Structured Media Resource Contract
- **Status:** complete for this pass
- Actions taken:
  - Added `apps/web/lib/skill-runtime/website-media-plan.ts` with a structured `WebsiteMediaResource` schema plus compatibility formatters for `media_plan` lines and markdown resource sections.
  - Updated `website-design-spec.ts` so route media planning is built as structured data first, then rendered into the existing markdown contract.
  - Extended route-unit summaries with `mediaResources` while preserving the existing `mediaPlan` string array for current consumers.
  - Added regression coverage proving media resources can be consumed as structured route-level contract data.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/generation-worker-adapter.test.ts --reporter=dot` passed: 2 files, 15 tests.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts lib/skill-runtime/website-design-spec.test.ts --reporter=dot` passed: 2 files, 174 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-media-plan.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/executor.ts lib/skill-runtime/skill-tool-executor.ts` passed.

### Phase 18 Continuation: Adapter-Ready Route-Unit Snapshots
- **Status:** complete for this pass
- Actions taken:
  - Added `buildGenerationUnitInputFromRouteContract()` to the generation worker adapter boundary.
  - The builder converts a `RouteUnitContractSummary` into a bounded `GenerationUnitInput` with:
    - stable route unit id
    - route path
    - intended target files
    - route contract, opening topology, inherited tokens, media plan, and structured media resources in context.
  - Updated native runtime and skill-tool route-unit snapshots to include compact `generationUnit` metadata (`unitId`, `route`, `targetFiles`).
  - Kept the change metadata-only; actual LLM/tool generation rounds still run through the existing executor until the adapter-dispatch migration is safe to perform.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts --reporter=dot` passed: 3 files, 176 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/generation-worker-adapter.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/executor.ts lib/skill-runtime/skill-tool-executor.ts` passed.

### Phase 19 Continuation: Static Route-Unit Adapter Dispatch
- **Status:** complete for this pass
- Actions taken:
  - Added `createRouteUnitSmokeAdapter()` as a no-provider static adapter that executes `GenerationUnitInput` objects and emits deterministic target files.
  - Added `runGenerationUnitsWithAdapter()` to batch-dispatch route units and collect a compact pass/fail report.
  - Updated `open-design-adoption-smoke.test.ts` so each corporate/docs/hub route unit is executed through the static adapter.
  - Persisted `route-unit-dispatch.json` beside `route-units.json` in the adoption smoke output.
  - Kept provider-backed generation unchanged; this is an offline execution-boundary proof, not a provider round rewrite.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed: 2 files, 4 tests.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed: 4 files, 178 tests.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/generation-worker-adapter.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-media-plan.ts lib/skill-runtime/executor.ts lib/skill-runtime/skill-tool-executor.ts lib/agent/open-design-adoption-smoke.test.ts` passed.

### Phase 20 Continuation: Provider-Backed Route-Unit Dispatch Evidence
- **Status:** complete for this pass
- Actions taken:
  - Updated `open-design-fullsite-live.test.ts` so provider-backed full-site summaries must expose adapter-ready `generationUnit` metadata for every manifest route.
  - Re-dispatched the live run's generated route-unit summaries through the static route-unit adapter after provider-backed generation completes.
  - Persisted `route-unit-dispatch.json` in the full-site live smoke output and embedded a compact `routeUnitDispatch` block in `report.json`.
  - Kept actual provider-backed round execution unchanged; the new evidence proves the generated route-unit summaries can already drive the adapter surface.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/agent/open-design-fullsite-live.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/skill-runtime/generation-worker-adapter.test.ts --reporter=dot` passed: 2 files passed, 1 skipped; 4 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-fullsite-live.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/skill-runtime/generation-worker-adapter.ts lib/skill-runtime/generation-worker-adapter.test.ts` passed.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=docs pnpm --dir apps/web run smoke:open-design-fullsite:live` passed in about 151 seconds.
  - The docs live report recorded `routeUnitDispatch.adapterId = "shpitto-route-unit-smoke"`, `passed = true`, and `unitCount = 5`.

### Phase 21 Continuation: Controlled Skill-Execution Bridge Adapter
- **Status:** complete for this pass
- Actions taken:
  - Added `createSkillExecutionGenerationWorkerAdapter()` to bridge route-unit `GenerationUnitInput` into the existing `SkillExecutionAdapter` round prompt/objective contract.
  - Kept provider/model invocation injected through `invokeRound`, so the bridge can be tested safely before it controls default generation.
  - Added a regression test proving the bridge:
    - preserves route-unit target files
    - builds the prompt through the skill execution adapter
    - returns a normal `GenerationUnitResult`.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts --reporter=dot` passed: 1 file, 4 tests.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 2 files passed, 1 skipped; 5 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/generation-worker-adapter.ts lib/skill-runtime/generation-worker-adapter.test.ts` passed.

### Phase 22 Continuation: Route-Unit Bridge Through Provider Fallback
- **Status:** complete for this pass
- Actions taken:
  - Added a targeted regression in `skill-tool-executor.test.ts` that runs a `GenerationUnitInput` through `createSkillExecutionGenerationWorkerAdapter()`.
  - The bridge constructs the route-unit round prompt/objective through `createWebsiteGenerationSkillAdapter("website-generation-workflow")`.
  - The injected bridge round calls the existing provider fallback helper and verifies timeout fallback from `pptoken/gpt-5.4-mini` to `aiberm/gpt-5.4-mini`.
  - Default provider-backed full-site generation remains unchanged; this only proves the bridge can preserve provider fallback semantics before route rounds are migrated.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts -t "routes a generation unit bridge through provider fallback" --reporter=dot` passed: 1 test.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 4 files passed, 1 skipped; 180 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/generation-worker-adapter.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-media-plan.ts lib/skill-runtime/executor.ts lib/skill-runtime/skill-tool-executor.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts` passed.

### Phase 23 Continuation: Feature-Flagged Main-Loop Provider Bridge
- **Status:** complete for this pass
- Actions taken:
  - Added `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1` as a default-off feature flag.
  - Wired the main skill-tool round loop to try `createSkillExecutionGenerationWorkerAdapter()` only when the objective is a strict single-target interior HTML route.
  - The bridge path uses existing provider attempts, active attempt, excluded-provider set, timeout config, and provider fallback logic.
  - If the bridge attempt throws, the executor records `route_unit_provider_bridge_legacy_fallback:*` and immediately retries the same round through the legacy path.
  - Added a gating regression proving the bridge remains off by default and excludes homepage/shared/multi-target rounds.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts -t "route-unit bridge" --reporter=dot` passed.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/skill-tool-executor.test.ts -t "routes a generation unit bridge through provider fallback" --reporter=dot` passed.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 4 files passed, 1 skipped; 181 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.

### Phase 24 Continuation: Provider Bridge Evidence Persistence
- **Status:** complete for this pass
- Actions taken:
  - Exposed provider notes and route-unit provider bridge notes from the skill-tool executor summary.
  - Forwarded the notes through the public skill runtime execution summary.
  - Updated full-site live smoke reporting to persist `route-unit-provider-bridge.json` and embed the same evidence in `report.json`.
  - Added a flagged-run assertion that `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1` records either a bridge attempt or bridge legacy-fallback note.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 4 files passed, 1 skipped; 181 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts lib/skill-runtime/executor.ts lib/agent/open-design-fullsite-live.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=docs SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed in about 208 seconds.
  - The docs live report recorded `routeUnitProviderBridge.enabled = true`, `attempted = true`, `legacyFallbackCount = 0`, and four bridge notes for `/api-reference`, `/docs`, `/guides`, and `/support`.

### Phase 25 Continuation: Bridge Matrix and Selector Risk Closure
- **Status:** complete for this pass
- Actions taken:
  - Ran flagged provider-backed full-site smoke for corporate and hub after the docs bridge evidence pass.
  - Found that the corporate scenario was incorrectly selecting `portfolio-blog-site` because negative "Do not generate blog/archive" wording was counted as a positive blog signal.
  - Fixed the website type selector so negative Blog/archive wording no longer overrides corporate signals, while explicit `/blog` routes and personal/writing-led requests still select `portfolio-blog-site`.
  - Added a regression test for the corporate negative Blog/archive selector case.
  - Re-ran corporate flagged full-site smoke after the fix.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-type-selector.test.ts --reporter=dot` passed: 1 file, 7 tests.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=corporate SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed in about 195 seconds after the selector fix.
  - `NODE_USE_ENV_PROXY=1 SHPITTO_OD_FULLSITE_SCENARIO=hub SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1 pnpm --dir apps/web run smoke:open-design-fullsite:live` passed in about 177 seconds.
  - Matrix report summary after the fix:
    - docs: `docs-knowledge-site`, 5/5 route QA, 5/5 route visual checks, 5/5 static route-unit dispatch, 4 bridge notes, 0 bridge fallbacks.
    - corporate: `corporate-b2b-site`, 5/5 route QA, 5/5 route visual checks, 5/5 static route-unit dispatch, 4 bridge notes, 0 bridge fallbacks.
    - hub: `content-hub-site`, 5/5 route QA, 5/5 route visual checks, 5/5 static route-unit dispatch, 4 bridge notes, 0 bridge fallbacks.

### Phase 26 Continuation: Hybrid Frontend Generator Strategy
- **Status:** complete for this pass
- Actions taken:
  - Added `website-artifact-generator.ts` with `SHPITTO_SITE_GENERATOR=native|open-design|html-anything|hybrid`.
  - Made `hybrid`, `open-design`, and `html-anything` modes automatically enable staged website imports while keeping default `native` behavior unchanged.
  - Added a frontend artifact generator contract to `website_design_spec.md` so runs explicitly state whether Open Design, HTML Anything, or Shpitto owns frontend artifact generation.
  - Injected the same contract into the skill-tool initial context and propagated `siteGeneratorMode` through runtime summaries and timeline metadata.
  - Updated hybrid seed scoring so compatible Open Design / HTML Anything sidecars get promoted, while unrelated staged imports do not leak into other surfaces.
  - Tightened pricing/dashboard seed selection so route-specific sidecars require direct pricing/dashboard intent instead of being selected from broad corporate or operations wording.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/website-design-spec.test.ts lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed: 3 files, 36 tests.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/project-skill-loader.test.ts lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed after selector tightening: 2 files, 21 tests.
  - Adoption smoke selected `open-design-web-prototype` for corporate, `docs-reference-template` plus `docs-knowledge-foundation` for docs, and `content-hub-foundation` plus `content-resource-template` for hub.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 6 files passed, 1 skipped; 209 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-artifact-generator.ts lib/skill-runtime/open-design-adoption.ts lib/skill-runtime/project-skill-loader.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/executor.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts lib/agent/graph.ts` passed.

### Phase 27 Continuation: Shpitto UI Theme Preservation Boundary
- **Status:** complete for this pass
- Actions taken:
  - Extended the hybrid frontend generator contract so Open Design / HTML Anything may port generation functionality, template discipline, route-unit structure, and QA checklists only.
  - Added an explicit prohibition against porting external product chrome, account UI, admin panels, global app layout, or unrelated platform navigation.
  - Locked Shpitto Studio and platform UI to the existing app theme in `apps/web/app/globals.css`, including `--shp-*` tokens and `.shp-*` shell classes.
  - Clarified that generated customer sites may use their own route-level tokens in emitted `/styles.css`, but those tokens must not mutate Shpitto Studio, auth, project settings, deployment, or DNS UI.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-design-spec.test.ts lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed: 2 files, 16 tests.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 6 files passed, 1 skipped; 209 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-artifact-generator.ts lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-design-spec.test.ts lib/agent/open-design-adoption-smoke.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 28 Continuation: Full Hybrid Default and Cleanup Completion
- **Status:** complete for this pass
- Actions taken:
  - Promoted the frontend artifact generator default from `native` to `hybrid`.
  - Kept `SHPITTO_SITE_GENERATOR=native` as the explicit fallback/opt-out path for legacy behavior.
  - Made the strict interior route-unit provider bridge default on for non-native generator modes while keeping `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=0` as the explicit opt-out.
  - Removed redundant imported-skill rollout env forcing from adoption, homepage live, and full-site live tests because the default hybrid strategy now enables compatible staged website sidecars.
  - Added focused coverage for the generator strategy contract and expanded `test:hybrid-generation` to cover selector, loader, spec, adapter, executor, adoption smoke, and full-site live harness wiring.
  - Verified the generated adoption smoke specs now persist `site_generator_mode: hybrid`, the Open Design / HTML Anything boundary, the Shpitto UI theme boundary, and the selected frontend seed skills for corporate, docs, and hub scenarios.
- Verification:
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-artifact-generator.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts -t "hybrid|native|route-unit bridge|staged imported|website-artifact-generator" --reporter=dot` passed: 4 files, 11 tests, 190 skipped.
  - `pnpm --dir apps/web exec vitest run lib/skill-runtime/website-artifact-generator.test.ts lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/generation-worker-adapter.test.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.test.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-fullsite-live.test.ts --reporter=dot` passed: 7 files passed, 1 skipped; 213 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec vitest run lib/agent/open-design-adoption-smoke.test.ts --reporter=dot` passed after selected frontend seed ids were threaded into the generated design spec.
  - `pnpm --dir apps/web run test:hybrid-generation` passed: 7 files passed, 1 skipped; 213 tests passed, 1 skipped.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/skill-runtime/website-artifact-generator.ts lib/skill-runtime/website-artifact-generator.test.ts lib/skill-runtime/open-design-adoption.ts lib/skill-runtime/project-skill-loader.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/website-design-spec.ts lib/skill-runtime/website-design-spec.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts lib/skill-runtime/executor.ts lib/agent/open-design-adoption-smoke.test.ts lib/agent/open-design-homepage-live.test.ts lib/agent/open-design-fullsite-live.test.ts lib/agent/graph.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

### Phase 29 Continuation: Unified Release-Baseline Matrix
- **Status:** complete for this pass
- Actions taken:
  - Updated homepage live smoke output so each run persists artifacts in both `latest` and a scenario-specific directory, matching the full-site smoke artifact layout.
  - Added `scripts/open-design-regression-matrix.mts` as one release-baseline entry point.
  - The matrix runner now:
    - executes `test:hybrid-generation`
    - runs homepage live smoke for `corporate`, `docs`, and `hub`
    - runs full-site live smoke for `corporate`, `docs`, `hub`, and `publishable`
    - emits aggregated markdown and JSON reports under `.tmp/open-design-regression-matrix/`
  - Added `pnpm --dir apps/web run smoke:open-design:matrix` as the single operator-facing command for the current release baseline.
- Verification:
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-homepage-live.test.ts lib/agent/open-design-fullsite-live.test.ts scripts/open-design-regression-matrix.mts` passed.
  - `pnpm --dir apps/web run smoke:open-design:matrix` passed and wrote:
    - `.tmp/open-design-regression-matrix/report.json`
    - `.tmp/open-design-regression-matrix/report.md`
  - The aggregated matrix passed with homepage scenarios `corporate/docs/hub` and full-site scenarios `corporate/docs/hub/publishable`.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.
