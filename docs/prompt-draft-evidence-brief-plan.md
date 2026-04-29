# Prompt Draft Evidence Brief Plan

## Problem
The Prompt Draft flow already performs user requirement parsing, optional uploaded-source ingestion, domain extraction, and web search. The weak point is the handoff from research to prompt authoring: evidence is compressed into a short Website Knowledge Profile and passed as an addendum, so the final canonical website prompt can still over-index on template structure and understate the actual source priorities.

## Goal
Create a deterministic Evidence Brief between source research and canonical prompt authoring so generated websites receive clearer content priorities, stronger page-specific facts, and explicit gaps/assumptions.

## Non-Goals
- Do not turn Prompt Draft into the final website generator.
- Do not add a new dependency or external service.
- Do not change the Prompt Control Manifest route/file contract.
- Do not invent brand-owned facts from generic industry research.

## Design
Add a `WebsiteEvidenceBrief` derived from the existing `WebsiteKnowledgeProfile`. The normative generation rules live in `apps/web/skills/website-generation-workflow/SKILL.md`; TypeScript only builds and transports the structured evidence.

The brief contains:
- `priorityFacts`: concise must-use facts grouped from brand, audience, offerings, differentiators, and proof points.
- `sourcePriorities`: ranked source references with type, confidence, and snippet.
- `pageBriefs`: page-level purpose plus source-backed content inputs.
- `contentGaps`: missing items the prompt must mark as assumptions or clarify later.
- `assumptions`: limited assumptions allowed when evidence is thin.

The prompt draft authoring flow will include this brief as a first-class section named `## 7. Evidence Brief`. LLM drafting receives the same formatted section in the user message, while the preservation rules come from the website generation skill contract.

## Implementation Steps
1. Extend `website-generation-workflow/SKILL.md` with the authoritative Evidence Brief contract.
2. Extend `content-source-ingestion.ts` with the `WebsiteEvidenceBrief` type, `buildWebsiteEvidenceBrief()`, and `formatWebsiteEvidenceBrief()`.
3. Reuse existing Website Knowledge Profile fields so the change stays deterministic and local.
4. Update `prompt-draft-research.ts` to build and pass the Evidence Brief through template fallback and LLM prompt drafting.
5. Keep the current Website Knowledge Profile in the result for compatibility.
6. Add focused tests that assert the canonical prompt includes Evidence Brief content, priority facts, page briefs, and source snippets.
7. Run focused prompt draft tests.

## Acceptance Criteria
- When a knowledge profile exists, the canonical prompt contains `## 7. Evidence Brief`.
- The Evidence Brief appears before or alongside the old research addendum and is not only a source list.
- Page-level source inputs are visible in the prompt.
- Gaps and assumptions are explicit.
- Existing Prompt Control Manifest tests still pass.

## Risks
- More context can increase token usage. Mitigation: cap source priorities and snippet lengths.
- LLMs may still compress output. Mitigation: deterministic fallback always includes the formatted Evidence Brief, and the website-generation-workflow skill contract requires preserving it.
- Existing downstream code may strip research sections. Mitigation: keep the section numbering and marker compatible with existing `## 7.` trimming behavior.
