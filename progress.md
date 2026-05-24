# Progress Log: QA Report Recovery Fixes

## Session: 2026-05-23

### Phase 1: Root Cause Isolation
- **Status:** complete
- Actions taken:
  - Read the attached QA report and reduced the actionable scope to two blockers:
    - `/api/chat` 500 due to missing Supabase chat-memory tables
    - studio subpage failures caused by malformed workspace project IDs like `analysis-*`
  - Verified that the visible workspace React components currently build project links with the correct `/projects/{projectId}/{section}` pattern.
  - Confirmed that `chat-memory.ts` hard-assumes Supabase tables when `CHAT_MEMORY_BACKEND=supabase`.

### Phase 2: Implementation
- **Status:** complete
- Actions taken:
  - Added missing-table fallback from the Supabase chat-memory backend to the file backend when shared memory tables are absent.
  - Added workspace project-route compatibility normalization for malformed section-prefixed IDs such as `analysis-*`, `assets-*`, `data-*`, and `settings-*`.
  - Wired the route normalization into:
    - workspace pages under `app/projects/[projectId]/**`
    - project APIs under `app/api/projects/[projectId]/**`
    - contact submissions query handling
    - workspace metadata provider state matching

### Phase 3: Verification
- **Status:** complete
- Actions taken:
  - Ran focused Vitest suites for:
    - `chat-memory-backend`
    - `chat-history-memory`
    - `project-route-id`
    - `project-settings-route`
  - Ran `pnpm -C apps/web exec tsc --noEmit`.
  - Ran `pnpm -C apps/web exec next build --debug` to verify the new changes did not introduce a new compile/type failure; the build now advances through compile/type/static generation and only reports pre-existing dynamic-route/static-generation issues outside this fix scope.

### Phase 4: Live Smoke Follow-up
- **Status:** complete
- Actions taken:
  - Re-ran production smoke against `https://www.shpitto.com` using browser automation.
  - Confirmed the original top-level blockers from the QA attachment have improved in production:
    - login works
    - `/api/chat` no longer throws the missing-table 500 for new and existing project submissions
    - canonical `chat-*` project routes are preserved for studio subpages
  - Isolated the remaining production failures to narrower project-summary lookups:
    - `/api/projects/{chatId}/analysis` still returns 404 for session-backed legacy projects
    - `/api/projects/{chatId}/domains` still returns 404 for the same legacy project class
  - Implemented a shared runtime-summary fallback that resolves ownership from chat sessions when D1-backed project summaries are absent.
  - Wired that fallback into:
    - `app/api/projects/[projectId]/analysis/route.ts`
    - `app/api/projects/[projectId]/domains/route.ts`
  - Added focused regression coverage for the new fallback behavior and reran `tsc --noEmit`.

### Phase 5: New QA Report Reconciliation
- **Status:** in progress
- Actions taken:
  - Read the new 2026-05-24 deep QA report and compared it against the later production smoke results already gathered in this session.
  - Identified that several reported failures are stale relative to the current deployment (`/api/chat` 500, malformed `analysis-*` routing, `analysis/domains` 404s).
  - Narrowed the active investigation scope to the remaining generation/product-state blockers:
    - requirement collection not advancing to prompt draft / preview
    - existing-project edit requests lacking visible side effects
    - deploy staying disabled because the project never reaches a generated artifact state
Phase 5 update:
- Fixed workspace shell false-negative states from the 2026-05-24 QA report.
- Current-route project now remains visible in workspace selectors even before session lists fully hydrate.
- Chat preview empty state now distinguishes requirement collection vs prompt-draft confirmation instead of showing Current stage: -.
- Deploy call-to-action stays explanatory until the first preview exists instead of showing a misleading gray button.
Phase 6: Post-deploy regression for the 2026-05-24 QA cleanup
- Validate the deployed workspace-shell fixes on production.
- Re-check login, project chat, analysis, settings/domains, and assets after deployment.
Post-deploy production regression (2026-05-24):
- Confirmed login, new-project shell load, analysis, assets, and settings all remain reachable after deployment.
- Confirmed malformed project-id regressions did not return.
- Confirmed the new-project workspace no longer shows "No projects"; it now shows the current project selector immediately.
- Confirmed pre-preview deploy CTA now explains why deploy is unavailable instead of only showing a disabled button.
- Remaining regression gap: the empty-preview status chip still renders "Current stage: -" even though the new explanatory preview hint is live.
Phase 6 follow-up:
- Root-caused the remaining stage-chip gap to a local UI helper bug, not a runtime/task-store problem.
- `toReadableStage(undefined)` still returned `"-"`, which masked the already-correct requirement-collection fallback stage text.
- Tightened the stage label resolution so missing stages return an empty string and raw placeholder `"-"` task statuses no longer override requirement/prompt-draft shell copy.
- Added a focused regression test to lock the no-stage behavior.
Post-release online regression (2026-05-24, second pass):
- Pulled production `/api/chat/history?chatId=chat-1779603784668-6mayw0` after login and confirmed the requirement project currently returns:
  - `task: null`
  - `previewTask: null`
  - recent message card types: `requirement_progress`, `requirement_form`, `intent_decision(required-slots-incomplete)`
- Re-ran browser smoke on the deployed chat page and confirmed:
  - preview hint uses the new requirement-collection copy
  - deploy-disabled explanation uses the new copy
  - `Current stage: -` still renders
- This deployed combination is inconsistent with the current source logic, which would render `Collecting required information` for the same message/task payload.
