# Project Harness

Use this skill when working on website-generation bugs, regressions, or architecture changes in this repository.

## Purpose

This harness is for Codex behavior, not for the generated website runtime.

When a bug is reported, do not jump straight to `apps/web/lib/skill-runtime/**`.
First determine which layer owns the failure, then fix the highest stable layer that can prevent recurrence.

## Language Rule

All skill, spec, and markdown authoring in this repository must be in English.

If you create or update:

- `SKILL.md`
- spec documents
- workflow markdown
- engineering instruction markdown

write the normative content in English, even if the discovery context or discussion happened in another language.

## Default Ownership Order

1. Requirement / canonical prompt / `website_design_spec`
2. Skill contracts in `apps/web/skills/**`
3. Orchestrator / selector / policy in `apps/web/lib/agent/**`
4. Runtime executor in `apps/web/lib/skill-runtime/**`
5. Artifact-only tweak

## Strong Heuristics

Usually fix upstream first when the problem looks like:

- wrong site type or tone
- wrong homepage opening topology
- route pages all feel the same
- shared nav/footer shell drifts
- bilingual copy is visible at the same time
- pages expose implementation or fallback mechanics

Usually fix runtime only when the problem looks like:

- preview/deploy path resolution is wrong
- generated files are written, normalized, or loaded incorrectly
- scripts/styles are materialized incorrectly
- executor retries, round control, or tool wiring are broken

Artifact-only edits are acceptable when the user explicitly wants a one-off local tweak such as "only change this hero" or "fix this one paragraph."

## Root-Cause Discipline

Do not stop at the first working patch.

Required bug-fix posture:

1. identify the owner-layer defect
2. explain the defect class, not just the failing symptom
3. avoid symptom-only patches when the root cause remains unchanged

If the issue was discovered in one replay, theme, or brand scenario, do not assume the rule belongs to that scenario.

## Refactor Policy

You may refactor when needed to keep the implementation clean and the architecture reasonable.

Good reasons to refactor:

- remove accumulated patch logic
- merge duplicated rules into a single contract path
- restore clearer separation between skill/spec/policy/runtime
- replace narrow fixes with a generalized mechanism

Behavior must stay verified, but cleanliness and architectural coherence are explicit goals, not optional nice-to-haves.

## Anti-Special-Casing Rule

Do not write product rules around the discovery case.

Bad example:

- "IBM theme needs special homepage opening repair"

Good framing:

- "enterprise homepage topology requires a stronger generic opening contract"

Keep scenario labels such as brand names, theme names, or replay IDs in tests and evidence unless the product truly has a first-class business rule for that scenario.

## Required Workflow

1. Identify the likely owner layer before editing.
2. Inspect the upstream contract files before touching runtime code.
3. Prefer changing one stable source of truth over adding another patch.
4. If a runtime workaround is still necessary, document why the source layer was insufficient.

## Evidence To Report

In the final response, include:

- chosen owner layer
- files changed
- why that layer was selected
- why not a higher layer
- root cause summary
- upstream files inspected
- verification evidence
- remaining risk, if any
