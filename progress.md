# Progress Log: Website Multi-Skill Phase 2 Corporate Execution Split

## Session: 2026-05-22

### Phase 1: Execution Split Discovery
- **Status:** complete
- Actions taken:
  - Confirmed runtime now distinguishes `skillId` and `executionSkillId`.
  - Confirmed adapter lookup is the cleanest seam for the first true type-specific execution lane.

### Phase 2: Dedicated Corporate Adapter
- **Status:** complete
- Actions taken:
  - Extracted `apps/web/lib/skill-runtime/corporate-b2b-skill-adapter.ts`.
  - Refactored `website-generation-skill-adapter.ts` to expose `createWebsiteGenerationSkillAdapter(...)`.
  - Kept shared website execution helpers intact to preserve current behavior.
  - Added the first corporate-specific execution contract to the dedicated adapter:
    - shared theme consistency
    - shared nav/footer consistency
    - route differentiation limited to main-content topology
  - Added the first corporate route-specific target page contract layer for:
    - `/products`
    - `/custom-solutions`
    - `/cases`
    - `/about`
    - `/contact`
  - Added the first corporate media/shell QA contract layer in skill + adapter:
    - route-owned media requirements
    - nav/footer drift treated as invalid output
    - single adjacent locale utility slot
    - no implementation/i18n shell leakage
  - Added the first adapter-level corporate validation rules:
    - reject duplicated locale controls in the shared shell
    - reject implementation/i18n shell-copy leakage
    - scan visible shell text instead of raw markup to avoid class-name false positives
  - Added corporate-owned shared-shell inheritance validation:
    - reject interior pages whose nav destinations drift from `/index.html`
    - reject interior pages whose footer destinations drift from `/index.html`
  - Replaced the corporate adapter's emitted-HTML sanitize pass-through with a corporate-owned sanitize hook that retains only the minimal blog-index editorial scaffold cleanup needed for explicit article-count briefs.
  - Wrapped shared website QA with a corporate-owned `validateCorporateRequiredFilesWithQa(...)` pipeline so post-QA normalization and shell validation now belong to the corporate adapter surface.
  - Switched the active corporate blog-index sanitize path to a clean `Safe` publishable-content counter, avoiding the old mojibake-prone local parser on the execution path.
  - Moved the remaining execution entry points behind corporate-owned wrappers:
    - required-file checklist
    - max-round resolution
    - round-objective planning
  - Replaced those three wrappers with corporate-owned implementations instead of shared-helper pass-throughs.
  - Added corporate-owned route asset-reference validation so enterprise route HTML must explicitly reference `/styles.css` and `/script.js`.
  - Added corporate-owned route page-role validation so `products / solutions / cases / about / contact` must read like their enterprise route responsibilities instead of only passing the shared generic route QA.
  - Fixed full-site replay preview persistence by merging `steps/*/site` snapshots into one stable local `site/` artifact when no complete checkpoint site directory exists yet.

### Phase 3: Registry Wiring
- **Status:** complete
- Actions taken:
  - Routed `corporate-b2b-site` through its dedicated adapter in `skill-execution-adapter-registry.ts`.
  - Left other type skills on generated website adapters for now.

### Phase 4: Verification
- **Status:** complete
- Actions taken:
  - Updated `skill-execution-adapter-registry.test.ts` to assert dedicated adapter ownership.
  - Ran:
    - `pnpm -C apps/web exec vitest run lib/skill-runtime/skill-execution-adapter-registry.test.ts lib/skill-runtime/executor.deploy.test.ts lib/agent/chat-canonical-replay.test.ts --testTimeout=30000 --maxWorkers=1 --reporter=dot`
    - `pnpm -C apps/web exec vitest run lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/skill-tool-registry.test.ts lib/skill-runtime/skill-execution-adapter-registry.test.ts lib/skill-runtime/executor.deploy.test.ts lib/agent/chat-canonical-replay.test.ts --testTimeout=30000 --maxWorkers=1 --reporter=dot`
    - `pnpm -C apps/web exec vitest run lib/skill-runtime/skill-execution-adapter-registry.test.ts lib/skill-runtime/website-type-selector.test.ts lib/skill-runtime/project-skill-loader.test.ts lib/skill-runtime/executor.deploy.test.ts lib/agent/chat-canonical-replay.test.ts --testTimeout=30000 --maxWorkers=1 --reporter=dot`
    - `pnpm -C apps/web exec vitest run lib/skill-runtime/skill-execution-adapter-registry.test.ts lib/skill-runtime/executor.deploy.test.ts lib/agent/chat-canonical-replay.test.ts --testTimeout=30000 --maxWorkers=1 --reporter=dot`

## Verification Summary
- Targeted integration suite result: `61 passed`
- Focused corporate adapter slice: `42 passed`
- Focused corporate adapter slice after shell inheritance extraction: `45 passed`
- Focused corporate adapter slice after sanitize extraction: `46 passed`
- Focused corporate adapter slice after QA pipeline wrapper extraction: `47 passed`
- Focused corporate adapter slice after route asset/page-role validation extraction: `49 passed`
- Real full-site VBUY replay after preview persistence fix: `1 passed`
- TypeScript diagnostics:
  - `corporate-b2b-skill-adapter.ts`: `0 error`
  - `website-generation-skill-adapter.ts`: `0 error`
  - `skill-execution-adapter-registry.ts`: `0 error`

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-05-22 | No dedicated execution adapter existed for `corporate-b2b-site`; registry aliasing hid type ownership | 1 | Extracted a dedicated adapter object while preserving shared execution helpers. |
