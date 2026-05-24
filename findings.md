# Findings: QA Report Fixes for Chat Flow and Studio Routing

## Current Root Cause Findings
- `/api/chat` reads and writes LangGraph-style memory through `apps/web/lib/agent/chat-memory.ts`.
- When `CHAT_MEMORY_BACKEND=supabase`, the code assumes `shpitto_chat_thread_memory` and `shpitto_chat_user_preferences` already exist.
- If those tables are missing in production, the read/write path throws immediately and bubbles into `/api/chat` as a 500 instead of degrading to the file backend.

- The visible workspace components currently generate project links correctly as `/projects/{projectId}/{section}`.
- The attached QA failure around `analysis-* / settings-* / assets-* / data-*` therefore appears to be a malformed route/input compatibility problem rather than the current visible nav builder generating new bad URLs.
- Several server routes (`/api/projects/[projectId]/analysis`, `/domains`, `/settings`, assets/data surfaces) trust the raw `[projectId]` param directly, so malformed prefixed IDs fail with `Project not found or access denied`.

## Repair Direction
- Treat missing chat-memory tables as an infrastructure gap, not a reason to hard-fail the user-facing chat route.
- Add a safe backend fallback in `chat-memory.ts` so Supabase-memory table absence degrades to the file backend for the current process.
- Add a narrow workspace-project-ID compatibility helper so old malformed paths like `analysis-<id>` can resolve back to the canonical project/chat id without polluting normal generation logic.

## Follow-up Findings From Live Smoke
- Production no longer reproduces the original `/api/chat` 500. New-project and existing-project chat submissions now return `200` and enter the conversation flow.
- Production no longer rewrites project routes to malformed `analysis-* / settings-* / assets-* / data-*` IDs. The browser stays on canonical `chat-*` project paths.
- Remaining production breakage is now narrower:
  - `GET /api/projects/{chatId}/analysis` still returns `404` for session-backed legacy projects that exist in chat storage but do not yet have a D1-backed project summary/binding.
  - `GET /api/projects/{chatId}/domains` still returns `404` for the same class of session-backed legacy projects.
  - The `Data` page identity drift observed during smoke is transient and disappears after hydration; it is not the primary root cause compared with the hard 404s above.

## Current Repair Direction
- Add a shared runtime-summary fallback that resolves project ownership from chat sessions when D1 project rows are missing.
- Use that fallback in `analysis` and `domains` GET flows so session-backed legacy projects return an empty/pending payload instead of `Project not found or access denied.`
- Keep domain mutations gated by real deployment host availability; do not fake bindability for undeployed projects.

## New QA Report Reconciliation (2026-05-24)
- The fresh deep QA report mixes current blockers with already-fixed symptoms:
  - `/api/chat` 500 is no longer reproducible.
  - malformed `analysis-* / settings-* / assets-* / data-*` route IDs are no longer reproducible on the latest deployment.
  - `analysis` / `domains` 404s were fixed after the prior deploy and should be treated as stale unless reproduced again.
- The still-credible product blockers are now concentrated around the generation flow itself:
  - new project request enters requirement collection but does not obviously progress to a prompt draft / generated preview in the QA report
  - existing project edit requests appear not to produce user-visible side effects
  - deploy remains disabled because no artifact reaches a deployable/generated state
- That means the active owner layer has likely shifted from pure routing/runtime failures toward project-state orchestration, requirement-completion gating, task-status propagation, or preview materialization.
Additional finding:
- The report's "20-minute blank preview" and "No projects" symptoms were amplified by shell-state UX gaps, not just backend failures.
- The generation path can intentionally be in requirement collection or prompt-draft confirmation with no task yet; the old shell rendered that as '-' and a generic preview placeholder.
Post-deploy finding:
- The deployed shell picked up the current-project fallback and deploy-unavailable explanation, but the stage badge still falls through to '-'. This likely means the requirement-form card state and the preview-stage chip are not reading the same source of truth in production.
Resolved follow-up:
- The requirement-form card state and preview empty hint were already correct.
- The actual bug was narrower: `toReadableStage(undefined)` returned a literal `"-"`, so the stage badge resolved to that placeholder before it could fall back to the requirement/prompt-draft pre-task state.
- This is a workspace-UI helper issue, not a chat-orchestrator, task-store, or preview-materialization failure.
Latest online verification:
- Production `chat-1779603784668-6mayw0` currently returns no task object at all (`task=null`, `previewTask=null`) while the message stream clearly contains requirement-collection cards.
- Under the current source code, that payload must render the requirement-collection stage copy, not `Current stage: -`.
- Therefore the remaining online `Current stage: -` is most likely a deployment artifact/version skew problem rather than a live API/state-shape problem.
