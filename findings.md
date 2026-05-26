# Findings: Conservative Open Design Adoption for Long-Running Website Generation

## Baseline Architecture
- Shpitto already has a source-first website pipeline with:
  - requirement/spec enrichment in `apps/web/lib/agent/chat-orchestrator.ts`
  - canonical prompt / Prompt Control Manifest generation in `apps/web/lib/agent/prompt-draft-research.ts`
  - design-spec derivation in `apps/web/lib/skill-runtime/website-design-spec.ts`
  - type/site selection in `apps/web/lib/skill-runtime/website-type-selector.ts`
  - skill selection / execution in `apps/web/lib/skill-runtime/executor.ts` and `apps/web/lib/skill-runtime/project-skill-loader.ts`
- The pipeline already contains partial Open Design integration, but the contract is incomplete:
  - current seed Open Design skills are active in the flat `apps/web/skills/*` namespace
  - there is not yet a formal staged import lane for website-only imported skills
  - `websiteSurfaceMode` is not yet a first-class persisted workflow field

## Existing Reusable Open Design Building Blocks
- `apps/web/lib/open-design/question-form.ts` already parses website-capable question-form structures and supports `direction-cards`, making it a good base for a compact discovery brief sidecar.
- `apps/web/lib/skill-runtime/project-skill-loader.ts` already supports metadata-based discovery for website-mode skills, but only scans direct child skill folders and therefore cannot yet discover staged imports under nested namespaces.
- `apps/web/lib/skill-runtime/od-skill-metadata.ts` already parses `od:` metadata such as mode/platform/scenario/design-system hints, but it does not yet model rollout state, activation mode, or website-only compatibility flags.

## Gaps Against the Adoption Plan
- Current website generation surface split is still limited to:
  - `corporate-b2b-site`
  - `marketing-landing-site`
  - `portfolio-blog-site`
- Institutional knowledge / content-collection sites are still forced through legacy buckets, even after earlier collection-first fixes, because there is no explicit `docs-knowledge-site` or `content-hub-site` surface mode.
- Discovery questions exist conceptually in the codebase, but there is no persisted structured `WebsiteDiscoveryBrief` that becomes part of the prompt/spec/checkpoint contract.
- Route-by-route execution artifacts already exist, but there is no explicit persisted route-unit contract summary that captures inherited terminology/tokens, route-specific opening family, media plan, generated files, and local validation results.
- Hard gates already cover manifest mismatch, workflow-artifact language, and visitor-copy workflow/meta leakage; placeholder leakage still needs to be formalized as a first-class bounded gate in the current runtime path.

## Source-First Implementation Direction
- Upstream contract and policy should absorb the first rollout:
  - extend surface modes in selector/spec/prompt layers
  - persist discovery/design lock data in workflow context
  - create website-only docs/hub seed skills and staging namespaces
- Runtime should stay narrow:
  - consume selected surface mode rather than re-inferring
  - persist route-unit metadata
  - add placeholder leakage as a bounded hard gate
- New behavior should be feature-flagged and default-off unless explicitly enabled for targeted replay/dev or selected surfaces.

## Implementation Findings
- `websiteSurfaceMode` must be selected before queueing confirmed-prompt generation as well as during prompt-draft generation. Confirmed prompts skip `buildPromptDraftWithResearch`, so chat route workflow context must apply `selectWebsiteGenerationTypeSkill` after the fallback prompt-draft object is built.
- Staged imported skills need surface compatibility to affect scoring. Trigger text alone lets the generic `open-design-web-prototype` beat docs/hub imports even when `SHPITTO_OD_IMPORTED_SKILLS=1`.
- The manifest hard gate should be tied to `routeAuthorityMode` and core-route HTML only. Otherwise heuristic QA fixtures and generated content detail pages are incorrectly treated as unauthorized top-level routes.
- Design spec generation should infer surface mode from selector inputs when no explicit `websiteSurfaceMode` or discovery brief is supplied. This preserves corporate contracts in older call sites while still allowing explicit upstream selection to win.
- HTML Anything can share the existing nested metadata loader path. No separate TypeScript alias is needed for `apps/web/skills/imported-html-anything/**` as long as staged imports carry `od.mode: website` and compatible surface metadata.
- Discovery brief confirmation can be represented safely before introducing UI blocking. Recording `needs_confirmation`, missing fields, and assumptions gives downstream prompt/spec/checkpoint layers visibility without forcing every generation through a form.
- Observation-only visual QA should remain separate from hard gates. Repeated opening signatures are useful as non-blocking QA evidence, but should not fail generation until replay data proves a low-false-positive rule.
- Recommended seed skills need to be injected into the initial skill-tool context, not only listed as IDs. Relying on the model to call `load_skill` before seeing the imported sidecar contract is too fragile for long website generations.
- Staged imported skill examples should be indexed even when they use root-level `example.html` rather than `assets/template.html`; otherwise the runtime cannot surface example-backed contracts in compact guidance.
- A fast adoption smoke can be offline and still useful: it verifies surface selection, manifest completeness, discovery brief persistence, design-spec locks, route-unit summaries, selected sidecar guidance, and first-round prompt shape before spending provider budget.
- Generation result metadata should carry QA observations and route-repair evidence so the UI/test harness can compare failure rate, repair count, and full-regeneration avoidance across replay runs.
- The first smoke run exposed a source-layer bug: a docs request saying "no blog/archive assumptions" still created `/blog` and `/archive` because negative blog/archive intent was not honored by prompt/decision route planning. The fix belongs upstream in prompt/decision route selection, not in runtime gates.
- The first provider-backed homepage run exposed a real QA defect: `/index.html` collapsed the shared footer into a flat link row even though the CSS advertised a structured footer shell. This belongs in the HTML generation contract and bounded QA gate, because route HTML must consume the shared shell utilities instead of leaving footer structure to CSS alone.
- The next homepage run exposed fragile display typography: generated CSS allowed arbitrary heading word breaks, which split polished brand/possessive copy in screenshots. A suitable Open Design-style gate is to block `overflow-wrap:anywhere` and `word-break:break-all` on major heading selectors while keeping normal responsive wrapping available.
- Mobile screenshot review exposed two more visual fragility patterns: negative letter spacing and automatic heading hyphenation can make docs/hub homepage copy look broken at narrow widths. These are safe hard gates for generated site CSS because the project already prefers stable, readable generated UI over typographic tricks.
- Docs/hub pages naturally produce comparison matrices. Bare `<table>` markup is risky on mobile, so the current project should allow tables only when wrapped in a responsive shell such as `.table-wrap`/`.responsive-table` or when represented as stacked cards.
- Open Design's website checklist treats copy discipline as part of visual quality, not a separate editing pass. The portable rule for Shpitto is to block visitor-facing "page mechanics" prose such as "the page groups", "the homepage frames", or "the visual system keeps" because it exposes generation scaffolding instead of speaking about the user's subject.
- Open Design's layout/template references keep stat labels short and bounded. For Shpitto, the safe migration is not a pixel-specific rule; it is a contract that hero-side stat or summary cards must use compact labels/facts, and long explanations must move into full-width feature or list sections.
- CTA specificity and concise headings/leads are useful as warnings first, not blockers. They improve polish and reduce overflow risk, but hard-blocking every generic CTA or long lead would create false positives while the live replay set is still small.
- Raw hex colors outside root token definitions are a useful design-system drift warning, but not a hard gate yet because legacy generated artifacts and imported examples may still use direct colors before token normalization is complete.
- Subjective Open Design criteria such as "one decisive flourish", "section rhythm", "visual monotony", and "image-style consistency" should remain observation-only until replay evidence proves low false-positive behavior. They are valuable for design review, but risky as automatic route gates.
- `open-design-pricing-page` is useful as a route-specific sidecar, not as the top-level skill for every SaaS landing that happens to mention pricing. First-party Open Design route skills should receive a light surface bonus; staged imported docs/hub foundations still need a stronger surface bonus so they beat generic website seeds when their rollout flag is enabled.
- `website-refinement-workflow` already exists in the runtime refine path and defaults to `website-refinement-workflow` unless overridden by `CHAT_REFINE_SKILL_ID`. The missing piece was not another executor branch; it was an explicit upstream contract that preview-stage visual/copy feedback must stay in the refinement lane and record changed files instead of restarting full generation.
- The reusable quality skills were present in the bundle but too weak as operational inputs because several were non-English or corrupted. Rewriting them as English executable contracts makes them suitable prompt-side guidance and gives future QA tests stable wording to assert against.
- A semantic footer tag is not enough for generated-site quality. The latest live homepage showed that users read a card-only bottom area as "missing footer" unless the top-level `footer`, `.site-footer`, or `.footer` selector carries visible band chrome such as padding, background, border-top, or margin-top. This belongs in the bounded shared-shell QA gate because only the final HTML/CSS pair proves whether the footer renders as a distinct site footer.
- Footer content can still leak implementation labels even after the footer shell is fixed. Labels such as "Responsive layout" and "Shared shell" are page-mechanics copy, not website subject matter, so they should fail the same visitor-copy gate as "the page groups" and "the homepage frames".
- The live homepage matrix showed that smoke tests must be scenario-aware. Hardcoding the docs brand (`Meridian API Platform`) or banning every `template` / `placeholder` substring misclassifies valid hub content such as "Templates and checklists" or search-input placeholder attributes.
- Some page-mechanics rules are reliable hard gates (`responsive layout`, `shared shell`, `homepage built for`), while softer review-environment wording such as "internal reviews" can cause hub generations to exhaust bounded repair rounds. Keep the latter out of the hard gate until replay evidence shows a low false-positive and high-repair-success rule.
- Flat-footer repair needs both the affected HTML page and `/styles.css` as repair targets. Otherwise the model may repair markup without adding the visible footer-band CSS required to make the footer read as a footer.
- Surface selection alone does not guarantee visual differentiation. The three-scenario homepage matrix can still converge on the same green/white rounded-card token family unless the selected surface carries explicit CSS token, typography, module-vocabulary, and copy-exclusion contracts into `/website_design_spec.md` and the shared CSS round.
- A surface-token QA gate is appropriate for the current rollout because the defect is not subjective visual taste: `corporate-b2b-site`, `docs-knowledge-site`, and `content-hub-site` are first-class surface modes and should not silently ship the same default green/white theme when the spec defines distinct token families.
- Full-page static screenshots exposed two additional hard-gate candidates. Generated CSS must not hide `[data-reveal]` content with `opacity:0` before JavaScript/scroll interaction, because screenshots and previews can show blank body sections. Generated `/styles.css` must also not contain placeholder markers, because a partial runtime/media CSS patch can pass syntax checks while the site renders like unstyled browser-default HTML.
- Visitor-copy mechanics leakage has variants beyond "the page groups" and "the homepage frames". Phrases such as "the homepage foregrounds..." and "the homepage reflects..." still explain the page's construction rather than the subject itself, so they belong in the same bounded hard gate.
