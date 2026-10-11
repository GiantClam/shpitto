---
version: 1.0
name: Shpitto template design language
description: A calm, high-contrast product shell for governed website templates. Semantic ink and blue surfaces provide structure while a restrained red signal marks the primary action. The system favors real content, clear hierarchy, compact controls and predictable responsive behavior over decorative effects.
---

# Shpitto Template Design Language

This document is the visual contract for the default template. Read it with
`src/config/brand.ts`; the TypeScript token contract is the runtime source of
truth and this file explains how agents should apply those values.

## 1. Visual Theme and Atmosphere

- Light, editorial product UI with a cool canvas, white working surfaces and
  dark navy ink.
- Use the red brand signal for the primary action, important status and small
  emphasis. Keep it sparse enough that a user can scan for the next action.
- Use generous section spacing, a stable content width and short text measure.
- Prefer real imagery, diagrams or product states that explain the content.
  Empty decoration is not a substitute for a visual purpose.

## 2. Color Roles

Reference semantic roles from `brand.tokens.colors` or their CSS variables.
Do not introduce page-local hex values.

| Role | Default | Usage |
| --- | --- | --- |
| `canvas` | `#f4f7fb` | Page background |
| `canvasSoft` | `#eef3f8` | Quiet bands and navigation surfaces |
| `surface` | `#ffffff` | Cards, forms and elevated content |
| `surfaceAlt` | `#e8eef5` | Hover, code and secondary surfaces |
| `text` | `#102033` | Primary body text |
| `textMuted` | `#506174` | Supporting copy |
| `textSubtle` | `#718096` | Metadata and labels |
| `border` | `#d8e1eb` | Default dividers |
| `borderStrong` | `#aebdcd` | Inputs and active boundaries |
| `brand` | `#c74336` | Primary action |
| `brandStrong` | `#9f3027` | Hover and pressed action |
| `secondary` | `#dbeafe` | Selection and low-emphasis highlights |
| `focus` | `#1d4ed8` | Keyboard focus ring |
| `success` | `#087f5b` | Completed or healthy state |
| `danger` | `#b42318` | Destructive or blocked state |

Text must remain readable against its surface. Never use `brandSoft`,
`secondary` or `textSubtle` as body text without checking contrast.

## 3. Typography Rules

- Use `--font-display` for headings and `--font-body` for body copy. Both
  default to Inter/system sans so the template stays portable without a font
  download.
- Use the provided type variables: `--type-display-xl`,
  `--type-display-lg`, `--type-heading-lg`, `--type-heading-md`,
  `--type-body-lg`, `--type-body-md`, `--type-body-sm` and `--type-label`.
- Keep letter spacing at `0` unless a customer brand contract explicitly
  supplies another value. Let weight, size and whitespace establish hierarchy.
- Use `--font-mono` only for code, identifiers and tabular technical values.
- Body copy should stay within `--shell-max-reading` (`68ch`).

## 4. Component States

### Buttons

- Use `.button` for the single primary action in a region.
- Use `.button-muted` or `.button-secondary` for secondary actions.
- Keep the shared control height (`--shell-control-height`) and radius.
- Every action needs default, hover, focus-visible and disabled states. Preserve
  the text label when an action is loading; change the status copy instead of
  changing the control's geometry.

### Surfaces and cards

- Use a border and a small radius for a framed surface. Add
  `--shell-shadow-soft` only when the surface needs separation from the canvas.
- Keep page sections unframed. Cards are for repeated items, forms and tools;
  do not nest cards inside cards.
- Use the surface ladder (`canvas` -> `surfaceAlt` -> `surface`) to show depth.

### Navigation and forms

- Shared navigation uses one container, one control height and one focus ring.
- Keep labels short and expose preview/planned status as a small status token.
- Labels precede fields. Inputs use `surface`, `borderStrong`, the shared radius
  and a visible focus ring. Error and success messages use semantic status
  colors and `role="alert"` or `role="status"`.

## 5. Layout Principles

- Center content in `--shell-max-content` (`72rem`) with `--space-gutter`.
- Use the 4px base rhythm (`--space-unit`) and `--space-section` for major
  bands. Add a new spacing value only when an existing token cannot express the
  relationship.
- Establish one clear hierarchy per region: eyebrow, heading, supporting copy,
  then action or proof.
- Keep grids stable with `minmax(0, 1fr)` and explicit minimum control sizes.
- Keep implementation details, fallback names and provider mechanics out of
  public-facing copy.

## 6. Depth and Motion

- Prefer hairline borders and `--shell-shadow-soft` over heavy shadows.
- Use `--motion-fast` and `--motion-standard` with `--motion-easing` for
  hover, focus and small layout transitions.
- Support `prefers-reduced-motion: reduce`; remove transforms and long-running
  animation when it is requested.
- Do not use decorative gradient orbs, bokeh, noisy background textures or
  unbounded parallax in the default template.

## 7. Responsive Behavior

- Desktop uses the shared max-width container and a three-part header: brand,
  navigation and actions.
- At tablet widths, navigation may wrap into a second row while preserving the
  same ordering and labels.
- At mobile widths, stack content, keep actions full-size and allow horizontal
  navigation scrolling when labels cannot fit. Never let text overlap a control.
- Keep touch targets at least `44px` high and preserve visible focus on keyboard
  navigation.

## 8. Do and Don't

Do:

- Reference semantic tokens by name.
- Show real loading, empty, error and success states.
- Keep one primary CTA per region.
- Use progressive enhancement for client behavior and preserve link semantics.
- Validate the result at `1440x900` and `390x844`.

Don't:

- Scatter raw colors, arbitrary radii or one-off breakpoints through JSX/CSS.
- Add a second header/footer vocabulary to a route.
- Hide important labels behind icon-only controls without an accessible name.
- Do not use CSS or JavaScript to change protected auth, billing, generation or
  download behavior under the guise of a visual change.
- Add a visual effect whose purpose cannot be stated in the page brief.

## 9. Agent Prompt Guide

When creating or refining a page, state the visual decision in this order:

1. Audience and page purpose.
2. Information hierarchy and primary action.
3. Surface roles and semantic token choices.
4. Content width, spacing rhythm and responsive topology.
5. Component states, accessibility and reduced-motion behavior.
6. Media purpose and exact placement, if media is required.

The implementation is complete when the page follows this contract, the shared
shell remains recognizable, and the generated CSS and JavaScript preserve the
declared states across desktop, mobile and keyboard interaction.
