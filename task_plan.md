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

Status: in progress

1. Run targeted unit tests for touched files, then lint and typecheck the web app.
2. Update the main technical solution document if any implementation details evolve during landing.
3. Summarize changed files, simplifications, risks, and verification evidence.
