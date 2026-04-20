---
name: superpowers
description: |
  Project-bundled Superpowers workflow for complex delivery.
  Use this as a unified entrypoint instead of remembering three separate skills.

  Stages:
  1) Brainstorm (scope clarification)
  2) Write plan (atomic implementation plan)
  3) Execute plan (task-by-task execution with review checkpoints)

  Triggers:
  - "superpowers"
  - "superpowers workflow"
  - "brainstorm + plan + execute"

  Activation:
  - `$superpowers`
---

# Superpowers (Project-bundled)

This skill is a project-local orchestration wrapper around:

- `superpowers-brainstorming`
- `superpowers-writing-plans`
- `superpowers-executing-plans`

## Recommended usage

1. Run brainstorming first to clarify goals, constraints, and acceptance criteria.
2. Convert clarified requirements into an atomic implementation plan (2-5 minute tasks).
3. Execute tasks sequentially with verification checkpoints after each task.

## Execution contract

- Prefer small, verifiable tasks.
- Write progress incrementally; do not wait for end-of-run summaries.
- Fail fast on blockers and report the exact blocking task.
- Keep outputs reproducible: include file paths, commands, and verification evidence.

## Integration with planning-with-files

When task complexity is high, pair with `planning-with-files`:

- Maintain `task_plan.md`, `findings.md`, and `progress.md`.
- Keep `progress.md` updated after each completed task.

## Output requirements

- Current stage (`brainstorm` / `plan` / `execute`)
- Completed tasks
- Next task
- Verification evidence (test/lint/build/output)
