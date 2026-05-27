1. [complete] Baseline the current Open Design / website-generation integration points, feature boundaries, and existing regression coverage for surface modes, skill loading, prompt/spec persistence, route execution, and hard gates.
2. [complete] Implement Phase 1 foundation pieces behind default-off rollout controls:
   - formalize `websiteSurfaceMode`
   - add new surface targets `docs-knowledge-site` and `content-hub-site`
   - extend loader/metadata support for staged imported website skills
3. [complete] Implement Phase 2 and Phase 3 upstream contract pieces:
   - structured `WebsiteDiscoveryBrief` sidecar
   - persisted visual direction / design-system lock inputs
   - prompt/spec/context propagation without changing default production behavior
4. [complete] Implement Phase 5 / Phase 6 bounded execution pieces that are safe in the current architecture:
   - route-unit checkpoint metadata persistence
   - placeholder leakage hard gate
   - route-scoped validation/reporting where feasible without broad runtime rewrites
5. [complete] Add website-only seed skills/contracts for `docs-knowledge-site` and `content-hub-site`, plus imported-skill staging scaffolding and compatibility metadata.
6. [complete] Run focused regression coverage for loader/metadata, selector/surface mode, discovery brief, design-system persistence, route-unit metadata, gates, and typecheck.
7. [complete] Record remaining rollout gaps, especially any pieces intentionally left default-off or sidecar-only, and summarize risks plus follow-up replay needs.
8. [complete] Add a fast local Open Design adoption smoke path for the first rollout surfaces:
   - corporate-b2b
   - docs/knowledge
   - content hub
   - canonical prompt, `website_design_spec`, route-unit summaries, first-round prompt, and selected sidecar guidance artifacts.
9. [complete] Inject selected seed/sidecar guidance into the initial skill-tool generation context so imported Open Design / HTML Anything website patterns influence generation before the model chooses to load full skills.
10. [complete] Persist generation QA evidence into task result metadata, including QA observations and route-repair evidence status.
11. [complete] Add and run a provider-backed homepage smoke path for fast effect testing:
   - live docs/knowledge homepage generation
   - generated `/styles.css`, `/script.js`, `/index.html`, and `/qa-report.json`
   - desktop/mobile Playwright screenshots
   - browser-level sanity probe for placeholder leakage, structured footer, and fragile heading CSS.
12. [complete] Port suitable Open Design-style visual QA gates into the current project gate layer:
   - structured footer shell minimum for generated HTML pages
   - heading word-break guard for polished homepage copy
   - negative letter-spacing and heading hyphenation guards
   - responsive table shell guard for docs/hub comparison matrices.
13. [complete] Promote the next safe skill migrations for faster quality gains:
   - make `open-design-pricing-page` surface-compatible as a controlled pricing sidecar for `marketing-landing-site` and `corporate-b2b-site`
   - make preview-stage feedback explicitly prefer `website-refinement-workflow` over full regeneration
   - rewrite reusable quality skills as English executable contracts for responsive layout, section quality, design-system enforcement, visual QA, and final validation.
14. [complete] Extend Open Design adoption from homepage MVP to full-site main-flow validation:
   - preserve exact Prompt Control Manifest route paths through policy normalization
   - pass selected `websiteSurfaceMode` into runtime QA instead of re-inferring from mixed prompt text
   - keep manifest-mode HTML outputs closed to declared routes plus allowed explicit publishable detail routes
   - add provider-backed full-site smoke coverage for corporate, docs/knowledge, and content-hub scenarios.
15. [complete] Add full-site static visual/preview sanity evidence:
   - validate each generated route has core preview structure, shared asset references, nav/footer shell, H1/main landmarks, sufficient visible copy, and manifest-bounded internal links
   - validate shared CSS avoids placeholder markers, hidden reveal baselines, and fragile wrap rules
   - persist per-route `route-visual-checks.json` and include the same evidence in full-site smoke reports.
16. [complete] Persist full-site QA repair evidence for main-flow adoption:
   - carry route repair attempts and target files from the skill-tool executor into execution summaries
   - expose repair evidence in workflow artifacts, full-site smoke reports, and timeline metadata
   - record whether bounded route repair avoided full regeneration.
17. [complete] Add publishable-content and no-blog/no-archive cross-check coverage:
   - verify explicit Blog/article prompts keep `/blog` and generate requested `/blog/{slug}` detail pages
   - verify resource-hub prompts that forbid blog/archive behavior reject hidden Blog runtime hooks, not only visible route links
   - tighten route-opening repair guidance for static directory/resource pages that fall back to legacy split-hero openings.
18. [complete] Promote media planning from prompt text toward a first-class contract:
   - add a structured `WebsiteMediaResource` schema and markdown formatter in `website-media-plan.ts`
   - keep existing `media_plan` text lines for backward compatibility while exposing structured media resources through route-unit summaries
   - add tests that assert route media resources are available as data, not only embedded prose.
19. [complete] Make route-unit snapshots adapter-ready:
   - add a builder that turns `RouteUnitContractSummary` into `GenerationUnitInput`
   - include adapter unit id and target files in route-unit snapshots emitted by the native runtime and skill-tool main path
   - keep this as metadata-only wiring before replacing actual generation round dispatch.
20. [complete] Add no-provider route-unit adapter dispatch coverage:
   - add a static route-unit smoke adapter and batch dispatch helper
   - execute every adoption-smoke route unit through the adapter
   - persist `route-unit-dispatch.json` alongside route-unit summaries for corporate, docs, and hub smoke scenarios.
21. [complete] Bridge provider-backed full-site output into adapter dispatch evidence:
   - verify live full-site summaries expose adapter-ready `generationUnit` metadata for each route
   - dispatch provider-backed route-unit summaries through the static adapter after generation
   - persist route-unit dispatch evidence in the full-site live smoke report.
22. [complete] Add a controlled skill-execution bridge for future provider route-unit dispatch:
   - add a `createSkillExecutionGenerationWorkerAdapter` bridge that converts `GenerationUnitInput` into the existing skill execution adapter prompt/objective shape
   - keep the actual provider invocation injected so the bridge can be tested without changing default generation control flow
   - cover the bridge with a fake round executor before wiring real provider-backed route rounds through it.
23. [complete] Prove route-unit bridge compatibility with provider fallback semantics:
   - route a `GenerationUnitInput` through `createSkillExecutionGenerationWorkerAdapter`
   - call the existing provider fallback helper from the injected bridge round
   - verify timeout fallback selects the next provider while preserving route-unit target files and prompt/objective construction.
24. [complete] Add feature-flagged provider bridge attempt inside the main skill-tool loop:
   - gate the bridge behind `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=1`
   - limit the first main-loop attempt to strict single-target interior HTML rounds
   - fall back to the legacy round path and record a bridge fallback note if the bridge attempt fails.
25. [complete] Persist provider bridge evidence for live route-unit migration:
   - expose route-unit provider bridge notes through skill-tool and runtime execution summaries
   - persist `route-unit-provider-bridge.json` in full-site live smoke output
   - assert flagged live smoke runs record either a bridge attempt or a bridge legacy-fallback note.
26. [complete] Fix negative Blog/archive wording in website type selection:
   - stop treating "do not generate blog/archive" as a positive portfolio-blog signal
   - keep explicit `/blog` routes and personal/writing-led requests on the portfolio-blog surface
   - rerun the corporate full-site live smoke to prove the scenario now selects `corporate-b2b-site`.
27. [complete] Add the first hybrid frontend generator strategy layer:
   - introduce `SHPITTO_SITE_GENERATOR=native|open-design|html-anything|hybrid`
   - record the frontend generator boundary in `website_design_spec` and skill-tool runtime summaries
   - let hybrid/open-design/html-anything modes enable compatible staged imports without turning unrelated staged skills into global defaults
   - keep Shpitto as the platform owner for backend hooks, QA/repair, preview, deploy, and DNS.
28. [complete] Lock the functionality-port boundary for Open Design / HTML Anything:
   - port generation functionality, template discipline, route-unit structure, and QA checklists only
   - do not port external product chrome, account UI, admin panels, global app layout, or platform navigation
   - keep Shpitto Studio on `apps/web/app/globals.css`, `--shp-*` tokens, and `.shp-*` shell classes.
29. [complete] Promote the hybrid frontend generator to the default main path and close this cleanup pass:
   - default website artifact generation to `hybrid`, with `SHPITTO_SITE_GENERATOR=native` kept as the explicit opt-out path
   - default the strict interior route-unit provider bridge on for non-native generator modes, with `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=0` kept as the explicit opt-out path
   - remove redundant smoke-test rollout env forcing now covered by the default hybrid strategy
   - expand the reusable hybrid generation regression script to cover selector, loader, spec, adapter, executor, adoption smoke, and full-site live harness wiring.
30. [complete] Add a unified Open Design release-baseline matrix entry point:
   - persist homepage live smoke artifacts by scenario as well as `latest`
   - add one matrix runner that executes the static hybrid regression gate plus homepage and full-site live scenario matrices
   - emit an aggregated markdown/json matrix report for release review instead of requiring manual command stitching
   - keep scenario lists configurable by env without changing the default baseline set.
31. [complete] Add a CASUX end-to-end live full-flow regression:
   - start from the chat entry prompt-draft stage instead of a direct runtime-only shortcut
   - use an uploaded-source-style CASUX planning fixture so route planning covers the full institutional site contract
   - run generation, preview, deploy confirmation, deploy worker execution, and deployed runtime verification in one test
   - expose the flow through a dedicated `smoke:casux-fullflow:live` script and persist a report under `.tmp`.
32. [complete] Promote the CASUX live full-flow regression into the shared workflow baseline:
   - extend the aggregated workflow runner so it executes the CASUX generate-preview-deploy verification lane alongside the homepage and full-site matrices
   - keep a bounded opt-out via `SHPITTO_OD_MATRIX_SKIP_CASUX=1` for fast local runs
   - expose the workflow entry as `smoke:open-design:workflow` while keeping the existing matrix alias
   - include the CASUX report path and deployment verification mode in the aggregated markdown/json report.

## Remaining rollout gaps

- [complete] Promote the home-page MVP path to full-site generation:
  - preserve surface/discovery/design-system context in the default skill-tool flow after provider selection
  - persist route-unit snapshots from skill-tool checkpoints, not only the native runtime path
  - add a provider-backed full-site smoke entry point for multi-route route-unit validation
- First-pass full-site live replay acceptance is complete for the three rollout samples: corporate, docs/knowledge, and content hub each generated 5 declared routes plus shared CSS/JS with 5/5 route QA pass status. A flagged bridge matrix also passed for all three surfaces with 4/4 interior route-unit bridge attempts per scenario and zero legacy bridge fallbacks. Broader replay acceptance is still needed across more industries, larger route counts, and explicit publishable-content sites.
- Imported Open Design and HTML Anything skills remain staged/sidecar-first, but compatible website sidecars are now promoted by the default hybrid generator strategy instead of requiring smoke tests to force rollout env vars.
- Hybrid mode is now the default website artifact generation strategy. It promotes compatible Open Design / HTML Anything sidecars into frontend generation guidance while Shpitto still owns backend hooks, QA/repair, preview checkpoints, deploy, and DNS. Native generation remains available as an explicit opt-out fallback.
- Broad full Vitest/non-live Vitest runs exceeded the 5-minute command timeout in this environment, so verification relies on targeted suites plus lint/typecheck for this pass.
- The compact discovery brief still does not block generation with a UI form. It now records `needs_confirmation`, `missingFields`, and assumptions, but a future UI/API step must turn those fields into an actual user confirmation loop.
- Route-unit execution now defaults to the bridge lane for strict single-target interior HTML rounds when the generator mode is hybrid, Open Design, or HTML Anything. Shared assets, homepage, and multi-target rounds still use the existing executor path. `SHPITTO_ROUTE_UNIT_PROVIDER_BRIDGE=0` is the explicit opt-out, and full-site live smoke reports continue to persist bridge notes for migration statistics.
- Multi-route provider-backed smoke coverage now exists for the three first rollout surfaces, including per-route static preview sanity evidence and route-repair evidence. Remaining live replay work should focus on repair-rate statistics over larger matrices, browser screenshot review, and route-specific content depth for pages beyond the homepage.
- Publishable Blog/detail-page coverage now exists for a personal technical blog scenario with 3 generated `/blog/{slug}` pages. Remaining publishable replay work should cover non-blog article labels such as insights, reports, case libraries, and standards libraries.
- The shared workflow baseline now includes the CASUX full-flow deploy lane by default. Faster local runs can still skip it with `SHPITTO_OD_MATRIX_SKIP_CASUX=1`, but release-grade workflow runs should keep it enabled because it is the only current regression that exercises chat entry, prompt draft, generation, preview, deploy confirmation, deploy worker execution, and deployed verification together.
- Pricing and refinement migrations are now contract-level and tested, but provider-backed replay still needs to prove they improve generated pricing routes and preview-edit repair rates in real tasks.
