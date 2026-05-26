---
name: "visual-qa-mandatory"
description: "Mandatory visual QA contract for generated websites and refinements. Use before finalizing a page, route unit, or full site."
---

# Visual QA Mandatory

Visual QA is part of generation, not a cosmetic afterthought. Each emitted file must pass bounded checks before the task is considered complete.

## QA Checkpoints

- Run section-level review after major sections are generated.
- Run route-level review after each HTML route is emitted.
- Run shared CSS review after `/styles.css` changes.
- Run final site review before `finish`.
- For refine tasks, review only changed routes and shared files unless the shell or token layer changed.

## Blocking Checks

1. Manifest completeness: every required route and shared file exists.
2. No unrequested core routes when the manifest is locked.
3. No placeholder copy, lorem ipsum, demo image URLs, or unfinished scaffold text.
4. No visitor-facing workflow, prompt, design-system, route-planning, or implementation rationale.
5. No text overflow, heading break risk, clipped table columns, or compressed hero stat cards.
6. No shell drift: nav, footer, language switch, and shared CTA destinations stay consistent.
7. No unsupported fake metrics, fake testimonials, fake clients, fake prices, or fake compliance claims.
8. No mojibake or encoding-corrupted visible copy.

## Observation-Only Checks

These should be reported but should not block the first rollout unless replay data proves they are reliable:

- visual monotony,
- repeated section rhythm,
- weak hero,
- inconsistent image style,
- absence of a decisive visual flourish.

## Output Expectations

When QA fails, repair the smallest affected route or shared file. Full-site regeneration is allowed only when shared shell, token, or manifest state is damaged.
