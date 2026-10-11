# Project Harness

This repository uses a Codex-facing harness for website-generation work.

The harness constrains how agents analyze and fix problems when they open this project. It is not an application runtime feature.

Read these files before changing website-generation behavior:

1. `docs/codex-harness-engineering.md`
2. `docs/website-generation-multi-skill-architecture-plan.zh-CN.md`
3. `docs/chat-full-lifecycle-optimization-plan.md`

## Documentation Language Rule

All skill, spec, and markdown authoring for this project must be written in English.

This applies to:

1. `SKILL.md`
2. `skill.json` descriptions and related prompt/spec text
3. spec documents
4. workflow notes
5. new or updated `.md` files used as engineering instructions, contracts, or process artifacts

Existing non-English reference material may be read, but newly written or modified normative content must be in English.

## Source-First Fix Order

When a website-generation issue is reported, use this repair order by default:

1. Requirement / canonical prompt / `website_design_spec`
2. Skill contract and workflow files under `apps/web/skills/**`
3. Orchestrator / selector / decision policy under `apps/web/lib/agent/**` and `apps/web/lib/skill-runtime/decision-layer.ts`
4. Runtime executor code under `apps/web/lib/skill-runtime/**`
5. Generated artifact or replay fixture

## Do Not Default To Runtime Patches

Treat these as upstream contract issues unless evidence proves otherwise:

- site type mismatch
- homepage topology mismatch
- route contract mismatch
- shared shell drift
- bilingual leakage
- content-mechanics leak

Only treat a problem as a runtime bug when it is clearly caused by file materialization, path handling, preview/deploy wiring, script injection, or executor control flow.

## Root-Cause First

When fixing a bug:

1. Analyze the root cause before editing.
2. Reject patch-only fixes that merely hide the symptom while leaving the owner-layer defect intact.
3. Prefer the smallest change that removes the defect class, not just the current failing example.

If a quick local patch is still chosen, the final report must explain why it is not merely symptom suppression.

## Refactor Allowance

Refactoring is allowed when it is necessary to:

1. remove patch accumulation
2. restore a clean contract boundary
3. generalize a fragile implementation into a reusable rule
4. keep the architecture understandable and maintainable

Do not preserve messy structure just to minimize line count. Clean, coherent, well-bounded code is preferred when behavior remains verified.

## No Scenario-Specific Rule Pollution

Do not encode rules around the incidental discovery scenario when the underlying issue is general.

Examples of disallowed behavior:

1. adding `ibm`-specific conditionals when the bug is actually a generic homepage topology problem
2. writing skill/spec clauses that mention one brand, one replay, or one theme when the real defect belongs to a broader site type or contract class
3. baking replay-specific strings, route names, or theme labels into code as if they were product rules

Required approach:

1. identify the generalized defect
2. express the fix at the right abstraction level
3. keep brand/theme/replay names only in tests, fixtures, or evidence when they are merely how the bug was discovered

## Runtime Change Gate

Before editing `apps/web/lib/skill-runtime/**`, inspect the relevant upstream contract first:

- `apps/web/skills/**/SKILL.md`
- `apps/web/skills/**/skill.json`
- prompt/spec markdown used by the workflow
- orchestrator / selector routing logic

If you still need a runtime change, explain in the final report:

1. Why the issue could not be solved at the skill/spec/policy layer
2. What upstream contract was inspected
3. What verification proves the runtime change is necessary

## Harness Report Contract

For website-generation bug fixes, regressions, or architecture changes, the final report must include these four fields in substance:

1. `Owner layer`
   - requirement/spec
   - skill
   - orchestrator/policy
   - runtime
   - artifact
2. `Upstream files inspected`
   - list the contract or routing files checked before choosing the fix layer
3. `Why not higher layer`
   - explain why the fix did not belong to an earlier layer in the source-first order
4. `Verification`
   - state what tests, replay checks, or manual evidence were used

If `apps/web/lib/skill-runtime/**` is modified, do not omit any of the four fields above.
