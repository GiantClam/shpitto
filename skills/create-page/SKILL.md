# create-page

Add a use-case or product presentation page using approved routes and components.
Start with a compact visual brief before writing JSX: audience, hierarchy,
primary action, media purpose, surface treatment, responsive topology and
reduced-motion behavior.

## Inputs
- Page purpose, route, navigation label, metadata and content.
- The shared design contract in `DESIGN.md` and `src/config/brand.ts`, plus the intended page
  pattern (hero, proof, list, form, detail or utility).

## Allowed scope
Approved marketing/docs routes, navigation, metadata and existing presentation components.
Use semantic token variables and existing shell primitives for layout, type,
color, borders, depth and controls. Keep page JavaScript small, progressive and
keyboard operable; do not add client state when a link or server-rendered
composition is sufficient.

## Protected contracts
Do not add alternate auth, checkout, payment success, generation API or public asset behavior.

## Outputs and evidence
Record route/navigation diff, visual brief, default/hover/focus/disabled state
checks, responsive and keyboard checks, content boundary result and recovery
patch.

## Recovery
Remove only the new route, navigation entry and its content.

## Escalation
New server commands, protected data or public API needs engineering review.
