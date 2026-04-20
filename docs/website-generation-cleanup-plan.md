# Website Generation Cleanup Plan (2026-04-20)

## Goals
- Remove compile/runtime blockers in design website generation toolchain.
- Align workflow behavior with skill docs (context fidelity, retry policy, role boundaries).
- Improve robustness (JSON parsing, provider config, context budgeting).

## Scope
- apps/web/skills/design-website-generator/tools/
- apps/web/skills/design-website-generator/SKILL.md
- apps/web/skills/website-generation-workflow/SKILL.md
- apps/web/skills/website-generation-workflow/INTEGRATION_GUIDE.md
- apps/web/skills/website-generation-workflow/style-profiles.json
- apps/web/lib/design-style-preset.ts

## Work Items
1. Replace invalid imports in `workflow-tools.ts` with existing local modules and implement real orchestration helpers.
2. Fix Anthropic request shape and provider/baseURL resolution in `llm-executor.ts`.
3. Fix absolute-path handling in `design-system-tools.ts` and URL path typo (`cal.com`).
4. Fix `resource-loader.ts` ESM path resolution bug (`fileURLToPath`).
5. Expand `PageContext` to structured records and improve prompt serialization.
6. Add bounded context aggregation to avoid unbounded prompt growth.
7. Implement QA gate retry cap (max 2 retries) in generation loop.
8. Clarify orchestrator/executor role split across the two skills.
9. Remove references to non-existent sub-skills and define fallback behavior.
10. Remove Inter as default fallback typography in style presets.
11. Add tests for LLM request envelope, JSON parsing, context budgeting, and QA retry behavior.

## Verification
- Run targeted Vitest suite for modified modules.
- Run a focused TypeScript check for the edited files (or project test script if available).
- Inspect generated outputs from tests for retry and context-budget behavior.

## Risks
- Some JS CLI files are stale mirrors of TS modules; runtime may still use JS entrypoints.
- Skill markdown contains mojibake sections; edits will focus on machine-readable/English sections to avoid accidental corruption.