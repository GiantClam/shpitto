# Findings & Decisions

## Requirements
- Write a clear scheme document for improving prompt draft content density after user info search and web search.
- Implement the scheme in the codebase.
- Verify with tests.

## Research Findings
- `resolveWebSearchQueryBudget()` defaults ordinary requests to 3 queries, which limits coverage before prompt drafting.
- `formatWebsiteKnowledgeProfile()` truncates each source snippet to 260 characters and presents source findings as a compact profile.
- `requestPromptDraftWithLlm()` passes research as `Web search findings` plus `Website knowledge profile`, but the canonical prompt authoring rules do not require a prioritized evidence brief.
- External prompt/RAG best practice supports separating instructions from context, using structured context, and passing retrieved evidence rather than over-compressed summaries.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Introduce `WebsiteEvidenceBrief` | Creates a stable contract for must-use facts, page inputs, source priorities, gaps, and assumptions. |
| Format the brief as a dedicated markdown section | Existing prompt draft flow is markdown-oriented and tests can assert deterministic content. |
| Use existing profile fields first | Avoids new services and keeps the change local to ingestion/prompt authoring. |
| Update runtime clipping markers for `## 7. Evidence Brief` | Prompt budget clipping must preserve the new research handoff section. |
| Move Evidence Brief generation policy into `website-generation-workflow/SKILL.md` | The product is skill-centered; TS should build and pass evidence, not own website-generation policy. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Existing worktree has unrelated edits | Limit changes to docs and prompt draft ingestion/test files. |
| Initial patch failed around a non-ASCII regex block | Re-applied with smaller stable anchors. |

## Resources
- `apps/web/lib/agent/content-source-ingestion.ts`
- `apps/web/lib/agent/prompt-draft-research.ts`
- `apps/web/lib/agent/prompt-draft-research.test.ts`
- OpenAI prompt engineering and structured output guidance.
- Anthropic prompt engineering guidance for structured context.

## Visual/Browser Findings
- No visual/browser testing is required for this backend prompt pipeline change.
