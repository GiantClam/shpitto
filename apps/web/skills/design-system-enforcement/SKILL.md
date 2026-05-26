---
name: "design-system-enforcement"
description: "Design-system enforcement contract for generated website UI. Use when creating or refining sections, pages, shells, forms, cards, tables, and navigation."
---

# Design System Enforcement

The selected visual direction or design-system inspiration is a contract. Generated files must reuse it consistently instead of inventing a new visual language per route.

## Token Rules

- Define core colors in `:root` and reuse them with `var(...)` or derived `color-mix(...)` values.
- Avoid repeated raw hex colors outside the token block.
- Use one typography hierarchy across all routes.
- Use a documented spacing scale for sections, cards, grids, forms, and footers.
- Keep radius, border, shadow, and motion choices consistent across components.

## Route Consistency Rules

1. Header, navigation, footer, language switch, and CTA wording must remain stable unless the confirmed manifest changes.
2. Interior pages may vary layout and opening family, but they must inherit the same shell, color system, typography, and component grammar.
3. Do not create one-off inline style patches for spacing, object-fit, or alignment when a reusable class belongs in `/styles.css`.
4. Do not leak internal direction labels, template names, design-system labels, or route-planning rationale into visitor copy.
5. Accent color should be used sparingly for primary action, selected state, or one key emphasis. Do not flood the page with accent variants.

## Validation

Before completion:

- scan CSS for raw color drift,
- scan HTML for inline style workarounds on major layout blocks,
- confirm every route uses the same shell tokens,
- confirm footer destinations match the route plan,
- confirm visitor-facing copy contains no internal design labels.
