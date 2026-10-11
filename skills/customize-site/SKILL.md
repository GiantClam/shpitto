# customize-site

Coordinate approved brand, theme, content and page composition changes across
the site. The marketing, auth, product and admin shells start from the Shpitto
website baseline as a template fallback. Customer delivery uses this Skill to
compose the customer's own brand, theme and page presentation over that shell.

Use `DESIGN.md` and the shared brand contract as the source of truth for the
visual language.
Every route should read as part of the same system: the same container, type
scale, spacing rhythm, surface roles and interaction states should carry across
marketing, auth, product and operations surfaces.

## Inputs
- Customer site intent, brand assets, affected shells, tokens, routes, components and release baseline.
- The shared-shell surfaces and their required loading, empty, error and
  denied states.
- A route-level visual brief: hierarchy, content density, media purpose,
  primary action, responsive topology and motion preference.

## Allowed scope
Approved marketing/product presentation paths, `src/config/brand.ts`,
`src/config/navigation.ts`, `src/app/globals.css` and shared shell components.
Page-local CSS and JavaScript may compose existing primitives, but must not
introduce a second token vocabulary, unbounded animation, decorative gradients,
or interaction that changes protected business behavior.

## Protected contracts
Keep sign-in, workspace navigation, generation, downloads, billing, admin and i18n boundaries intact.

## Outputs and evidence
Record the change manifest, customer asset/token overrides, route visual brief,
all four journey checks, desktop/mobile/accessibility results, shared
navigation consistency, state coverage (default/hover/focus/disabled/error)
and recovery patch.

## Recovery
Resolve overlapping dirty work, then apply a scoped rollback without repository-wide reset.

## Escalation
Any protected contract or dependency change is classified as engineering work.
