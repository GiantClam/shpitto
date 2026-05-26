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
  - `pnpm --dir apps/web run smoke:open-design-homepage:live` passed for all three selected scenarios with `SHPITTO_OD_HOMEPAGE_SCENARIO` set to `corporate`, `docs`, and `hub`.
  - Static scenario probe confirmed all three saved outputs have the expected brand, expected surface mode, visible footer band, and no hard page-mechanics leakage.
  - `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.
  - `pnpm --dir apps/web exec eslint lib/agent/open-design-homepage-live.test.ts lib/skill-runtime/skill-tool-executor.ts lib/skill-runtime/skill-tool-executor.test.ts` passed.
  - `git -c core.safecrlf=false diff --check --no-ext-diff` passed.

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
