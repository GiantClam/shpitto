---
name: "end-to-end-validation"
description: "Final delivery validation contract for generated websites, route units, and preview refinements."
---

# End-To-End Validation

Run final validation before presenting a generated or refined website as complete.

## Required Final Gates

1. Route/file gate: all required HTML, CSS, JS, locale, and content files are present.
2. Preview gate: the homepage and changed routes return valid HTML and load shared assets.
3. Responsive gate: mobile, tablet, and desktop layouts remain readable and navigable.
4. Content gate: visitor copy is topic-specific, source-aligned, and free of workflow/design/process leakage.
5. Shell gate: header, navigation, footer, CTA destinations, and locale controls are consistent across routes.
6. Placeholder gate: no placeholder copy, placeholder URLs, demo image services, or unfinished content labels remain.
7. Accessibility gate: semantic landmarks, form labels, alt text, focus states, and color contrast are acceptable.
8. Refine gate: preview/deployed follow-up tasks edit only the necessary files and preserve the current baseline unless the user asks for a full rebuild.

## Passing Standard

A site passes only when:

- blocking QA issues are fixed,
- route-unit repairs are scoped to the failed route whenever possible,
- changed files are recorded,
- remaining observation-only issues are reported separately from blockers.
