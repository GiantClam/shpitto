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
