---
version: 1.0
name: Shpitto AI media template design language
description: A media-first product shell for AI video creation. The warm editorial marketing layer explains creative value while the dark studio layer focuses on supported video workflows.
---

# Shpitto AI Media Template Design Language

This document is the visual contract for the default template. Read it with
`src/config/brand.ts`, the canonical source for all presentation token values.
This file explains their roles and application; it is not another value table.
`brandCssVariables` in that same file projects the tokens into CSS variables,
which `src/app/layout.tsx` binds at runtime. `src/app/globals.css` consumes those
variables and scopes semantic aliases; do not maintain duplicate numeric token
tables or literal `:root` fallbacks in CSS.

## 1. Visual Theme and Atmosphere

- Use a split baseline: a warm light marketing canvas for positioning, proof and
  pricing, and a dark studio canvas for prompt composition, model choice and
  output review.
- Use the coral brand signal for primary actions, a violet signal for creative
  focus and a green signal for healthy/private state. Keep all three semantic.
- Treat media previews, prompt composition and recent outputs as product
  surfaces. Empty cards and decorative chrome must never outrank the creation
  action.
- The default should feel like a focused creative tool that can be branded and
  sold, rather than a generic admin dashboard.

## 2. Color Roles

Reference semantic roles from `brand.tokens.colors` through their CSS
projection. Do not introduce page-local hex values. Read current values from
the canonical source rather than copying them into documentation or CSS.

| Role | Usage |
| --- | --- |
| `canvas`, `canvasSoft` | Light page backgrounds and quiet bands |
| `surface`, `surfaceAlt`, `surfaceRaised` | Cards, forms, hover and elevated content |
| `text`, `textMuted`, `textSubtle` | Body text, supporting copy and metadata |
| `border`, `borderStrong` | Dividers, inputs and active boundaries |
| `brand`, `brandStrong`, `onBrand` | Primary action, interaction state and its text |
| `brandText` | Accessible brand-colored text on light surfaces; do not use the button fill for small labels |
| `secondary` | Selection and low-emphasis highlights |
| `focus`, `link` | Keyboard focus and links |
| `success`, `danger`, `warning` | Status, error and recovery feedback |

Studio values belong to `brand.tokens.studio` and project to `--studio-*`
variables, including canvas, surface, raised/soft surfaces, text, muted text,
border, violet, green, danger and warning. `--studio-accent` aliases the shared
`--color-brand`; it is not a separately maintained color value.

The shared workspace shell remaps existing semantic color roles to these
studio variables within `.site-shell-workspace`. Team, billing and settings
must inherit the same dark canvas, surfaces, text, borders, focus and status
roles as creation, including shared forms and feedback. Do not rely only on
dashboard-specific selectors or introduce per-route palettes. Keep marketing,
auth and documentation surfaces light; any dark media preview stays locally
scoped and must not change the surrounding page theme.

Text pairs must meet WCAG AA contrast: at least 4.5:1 for normal text and 3:1
for large text. Check supporting copy, labels, status messages and primary
action text against their actual light or dark backgrounds. Accent or muted
roles do not imply sufficient text contrast.

## 3. Typography Rules

- Use `--font-display` for headings and `--font-body` for body copy. The default
  stack starts with Avenir Next and falls back to portable system sans without a
  required font download.
- Use the provided type variables instead of page-local sizes.
- Keep letter spacing tight only for display headings. Use normal tracking for
  body copy and labels.
- Use `--font-mono` only for code, identifiers and technical values.
- Body copy should stay within `--shell-max-reading` (`68ch`).

## 4. Component States

### Buttons

- Use `.button` for the single primary action in a region.
- Use `.button-muted` or `.button-secondary` for secondary actions.
- Keep the shared control height and radius.
- Every action needs default, hover, focus-visible and disabled states. Preserve
  the label when loading and expose status copy separately.

### Surfaces and cards

- Use a border and a small radius for a framed surface. Add the shared shadow
  only when a surface needs separation from the canvas.
- Keep page sections unframed. Cards are for repeated items, forms and tools.
- In the studio, use the dark surface ladder and reserve one raised surface for
  the prompt composer or an active media result.

### Navigation and forms

- Shared navigation uses one container, one control height and one focus ring.
- Workspace links and creation actions preserve the selected workspace context,
  including team, billing, settings, history and assets links. Use the shared
  navigation contract and correctly encode workspace identifiers in URLs.
  Preserve existing workspace selection and membership checks.
- Present the customer logo on a light backing within the dark shell. Preserve
  the supplied artwork and colors; never use inversion or recoloring filters
  to make a customer logo fit the theme.
- Labels precede fields. Inputs use a semantic surface, strong border, shared
  radius and a visible focus ring.
- Error and success messages use semantic status colors and `role="alert"` or
  `role="status"`.

## 5. Layout Principles

- Center content in `--shell-max-content` with `--space-gutter`.
- Use the 4px base rhythm and the shared section spacing.
- Establish one clear hierarchy per region: eyebrow, heading, supporting copy,
  then action or proof.
- Keep grids stable with `minmax(0, 1fr)` and explicit minimum control sizes.
- Keep implementation details, fallback names and provider mechanics out of
  public-facing marketing copy. Template purchasing, code ownership and
  engineering guidance belong in buyer documentation, not customer creation,
  sign-in or billing flows.

## 6. AI Media Surface Contract

- The shipped generation runtime is video only: `text-to-video` and
  `image-to-video`. Image input for video is not image generation. An image
  generator may inform the visual ambition, but must not appear as an active
  image-generation tab, supported API or shipped capability. A visual refresh
  does not enable provider access or add generation modes.
- The marketing demo must communicate end-user creative value, such as turning
  an idea or an owned image into a video, with one primary `Start creating`
  action. Keep copy, navigation, metadata and previews truthful about supported
  capabilities; do not imply live provider results from illustrative media.
- The creation workspace must expose the prompt, supported model, aspect ratio
  and cost in the first viewport. Show only settings accepted by the current
  runtime. The submit action must read as a video action.
- The original AI illustration at `public/media/alpine-studio.png` is sample
  artwork. Label it visibly as `Sample artwork`, provide descriptive alt text
  where informative, and never present it as a live provider result, a user's
  generated output or proof of shipped image generation.
- Image-to-video input must remain an owned, reviewable crop flow. Visual changes
  may restyle the crop surface but must not bypass its upload or consent checks.
- Output, history, private assets, credits and recovery state remain separate
  product surfaces with their existing server contracts.
- Template customization must be able to replace brand colors, logo, copy,
  media treatment and navigation labels without creating a second token system.

## 7. Depth, Motion and Responsive Behavior

- Prefer hairline borders and the shared soft shadow over heavy shadows.
- Use shared motion tokens for hover, focus and small layout transitions.
- Controlled gradients are allowed inside media preview frames when they make
  the image/video concept legible. Do not use global gradient orbs, noisy
  textures or unbounded parallax.
- Support `prefers-reduced-motion: reduce` and remove transforms or long-running
  animation when requested.
- Desktop uses a shared max-width container. Marketing uses a light header; the
  workspace uses a dark header with a visible studio state.
- At mobile widths stack content, keep actions full-size and allow horizontal
  navigation scrolling. Never let copy overlap a control.
- Keep touch targets at least 44px by 44px and preserve visible keyboard focus
  through navigation, forms and the crop flow on both light and dark surfaces.

## 8. Do and Don't

Do:

- Reference semantic tokens by name.
- Show real loading, empty, error and success states.
- Keep one primary CTA per region.
- Use progressive enhancement and preserve link semantics.
- Validate at `1440x900` and `390x844`.
- Check workspace context, sample artwork labels and capability claims along
  with keyboard operation, text contrast and touch target dimensions.

Don't:

- Scatter raw colors, arbitrary radii or one-off breakpoints through JSX/CSS.
- Add a second header/footer vocabulary to a route.
- Hide important labels behind icon-only controls without an accessible name.
- Change protected auth, billing, generation or download behavior under a visual
  change.
- Add an effect whose purpose cannot be stated in the page brief.

## 9. Agent Prompt Guide

When creating or refining a page, state the visual decision in this order:

1. Audience and page purpose.
2. Information hierarchy and primary action.
3. Surface roles and semantic token choices.
4. Content width, spacing rhythm and responsive topology.
5. Component states, accessibility and reduced-motion behavior.
6. Media purpose and exact placement, if media is required.

The implementation is complete when the page follows this contract, the shared
shell remains recognizable, and the protected product journeys still work.
