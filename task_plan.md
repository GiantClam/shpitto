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

## Remaining rollout gaps

- Full replay acceptance is not complete in this pass. Representative corporate, docs/knowledge, and content-hub replays still need to be run and compared against baseline success rate, repair count, and full-regeneration frequency.
- Imported Open Design and HTML Anything skills remain staged/sidecar-first and gated by rollout flags; they are discoverable but not promoted as default replacements.
- Broad full Vitest/non-live Vitest runs exceeded the 5-minute command timeout in this environment, so verification relies on targeted suites plus lint/typecheck for this pass.
- The compact discovery brief still does not block generation with a UI form. It now records `needs_confirmation`, `missingFields`, and assumptions, but a future UI/API step must turn those fields into an actual user confirmation loop.
- Route-unit execution is still running inside the existing executor. The new `GenerationWorkerAdapter` interface creates the adapter boundary, but route rounds have not yet been fully migrated to adapter-dispatched units.
- Live replay acceptance still needs multi-route provider-backed runs. The new homepage live smoke proves the first route can finish with the Open Design sidecar/gate path, but it is not yet proof that all pages finish under route-unit repair.
- Pricing and refinement migrations are now contract-level and tested, but provider-backed replay still needs to prove they improve generated pricing routes and preview-edit repair rates in real tasks.
