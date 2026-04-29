# Task Plan: Prompt Draft Evidence Brief

## Goal
Increase prompt draft information density by introducing a structured evidence brief between web/source research and canonical website prompt authoring, then verify the behavior with focused tests.

## Current Phase
Phase 5

## Phases

### Phase 1: Discovery And Plan Document
- [x] Confirm current research and prompt draft flow.
- [x] Identify information-density failure points.
- [x] Write implementation plan document.
- **Status:** complete

### Phase 2: Evidence Brief Implementation
- [x] Add a structured evidence brief contract to content ingestion.
- [x] Feed the evidence brief into template fallback and LLM prompt authoring.
- [x] Preserve existing routing and source contracts.
- **Status:** complete

### Phase 3: Regression Tests
- [x] Add tests that assert evidence priority and page-level source inputs appear in the prompt.
- [x] Update existing expectations without weakening route/control coverage.
- **Status:** complete

### Phase 4: Verification
- [x] Run focused prompt draft tests.
- [x] Run any adjacent tests needed by changed contracts.
- [x] Record test results.
- **Status:** complete

### Phase 5: Delivery
- [x] Review changed files.
- [x] Summarize implementation, verification, and remaining risks.
- **Status:** complete

## Key Questions
1. How can source facts survive prompt generation without turning the prompt draft layer into a full website generator?
2. Which test assertions prove the user-visible content density improves?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Add an Evidence Brief derived from Website Knowledge Profile | Keeps research structured and authoritative before LLM prompt writing. |
| Keep Prompt Control Manifest separate from content planning | Existing route/file contract should remain machine-readable and stable. |
| Start with deterministic formatting, not new dependencies | Reduces risk and matches existing local patterns. |
| Preserve Evidence Brief during runtime prompt clipping | Long prompts should keep source priorities, not only early template text. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `pnpm --filter web vitest` missing script | 1 | Use existing `pnpm --filter web test -- ...` script. |
| Evidence Brief patch failed near legacy regex text | 1 | Reapply with smaller stable anchors. |

## Notes
- Avoid touching unrelated dirty worktree files.
- Use focused tests for the prompt draft research path.
