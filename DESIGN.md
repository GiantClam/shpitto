---
version: 1.0
name: Shpitto AI media template design language
description: A dark, creation-first public homepage and workspace for AI video creation, with an editable public composer, curated inspiration and a signed-in review boundary. Auth and documentation remain light.
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

- The default public homepage is a dark, creation-first product surface using
  the shared `SiteShell` variant `creator`. The signed-in `workspace` variant
  is also dark; auth and documentation remain light.
- On desktop, keep tool navigation persistent beside a concise heading,
  editable video composer and curated gallery. On mobile, use compact tool
  navigation and stack the composer before the gallery.
- Interaction references may inform topology, not copied branding, artwork or
  assets. Customer identity remains governed by the customization contract.
- Use the coral brand signal for primary actions, a violet signal for creative
  focus and a green signal for healthy/private state. Keep all three semantic.
- Treat media previews, prompt composition and recent outputs as product
  surfaces. Empty cards and decorative chrome must never outrank the creation
  action.
- Keep the creation task visible immediately. Avoid oversized editorial hero
  headings, full-screen promotional stages and sales sections ahead of the
  composer.

## 2. Color Roles

Reference semantic roles from `brand.tokens.colors` through their CSS
projection. Do not introduce page-local hex values. Read current values from
the canonical source rather than copying them into documentation or CSS.

| Role | Usage |
| --- | --- |
| `canvas`, `canvasSoft` | Page backgrounds and quiet bands, remapped by shell |
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

The shared `SiteShell` variants `creator` and `workspace` remap existing
semantic color roles to these studio variables within `.site-shell-creator`
and `.site-shell-workspace`. The public homepage, team, billing and settings
must inherit the same dark canvas, surfaces, text, borders, focus and status
roles as creation, including shared forms and feedback. Do not rely only on
dashboard-specific selectors or introduce per-route palettes. Keep auth and
documentation light; the public homepage must not inherit a light marketing
theme merely because its route lives under `(marketing)`.

Text pairs must meet WCAG AA contrast: at least 4.5:1 for normal text and 3:1
for large text. Check supporting copy, labels, status messages and primary
action text against their actual light or dark backgrounds. Accent or muted
roles do not imply sufficient text contrast.

## 3. Typography Rules

- Use `--font-display` for headings and `--font-body` for body copy. The default
  stack starts with Avenir Next and falls back to portable system sans without a
  required font download.
- Use the provided type variables instead of page-local sizes.
- Keep the homepage heading concise and subordinate in space to the composer.
  Use normal tracking for body copy and labels; display typography must not
  push the public controls below an editorial hero.
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
- The creator shell provides persistent desktop tool navigation and compact
  mobile navigation. Tool labels must describe supported video workflows;
  `image-to-video` is the image entry, not an image-output tab.
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

- Use `--shell-max-content` and `--space-gutter` for the working area beside
  desktop tool navigation, then collapse to a single column on mobile.
- Use the 4px base rhythm and the shared section spacing.
- The homepage hierarchy is tool navigation, concise heading, editable
  composer and curated inspiration. Keep the primary review action next to
  the composer; avoid a giant hero or promotional content before the controls.
- Keep grids stable with `minmax(0, 1fr)` and explicit minimum control sizes.
- Keep implementation details, fallback names and provider mechanics out of
  public-facing product copy. Template purchasing, code ownership and
  engineering guidance belong in buyer documentation, not customer creation,
  sign-in or billing flows.

## 6. AI Media Surface Contract

- The shipped generation runtime is video only: `text-to-video` and
  `image-to-video`. Image-to-video is the supported image entry and produces
  video, not images. Do not expose an active image-output tab, image-generation
  API or promise of image generation. A visual refresh does not enable provider
  access or add generation modes.
- The public homepage offers a genuinely editable video composer: a
  `text-to-video` / `image-to-video` choice, prompt and `16:9` / `9:16` aspect
  ratio. Display the fixed `5s` / `720p` preset without unsupported duration or
  resolution selectors. The primary action says `Continue to studio` and goes
  to `/dashboard` through its existing auth guard, supporting both guests and
  signed-in visitors. Helper copy explains sign-in, model selection and credit
  review in the studio. The public composer does not generate or quote a video.
- Show an admitted model and actual cost only after sign-in, from current
  server-backed admission and quoting. Public copy must not invent model
  availability, credit costs or live provider access. In signed-in review,
  expose the prompt, supported mode, aspect ratio, admitted model and actual
  cost before an explicit generation action.

### Session draft and signed-in review

- Store `version: 1` as schema metadata and only `prompt`, `mode` and
  `aspectRatio` as intent fields in the session-scoped draft. Autosave during
  editing so tool mode-link navigation retains the draft; an explicit mode
  destination may update the mode. Preserve the draft across the auth handoff.
  Do not carry model selection, quotes, prices, assets, uploads, crop
  references, consent, workspace identity or other protected state in the
  draft. Workspace selection remains part of the existing navigation contract.
- Restore the draft for editable review, not submission. Obtain fresh model
  admission and an actual cost after sign-in. Never auto-submit, start a
  provider job or charge credits when restoring a draft or completing sign-in.
- For image-to-video, complete owned image upload, crop review and consent in
  the signed-in flow. Selecting this public mode or a gallery preset does not
  supply an asset, confer ownership or grant consent.

### Curated gallery and truthful media

- Gallery filters must change the displayed curated entries and expose their
  selected state. `Use prompt` replaces only the editable prompt and preserves
  the currently selected `mode` and `aspectRatio`. Only prompt inspiration is
  reused: the sample image is not uploaded, selected as an owned input or granted
  consent.
  Neither filtering nor prompt reuse submits a generation.
- The original AI illustrations at `public/media/alpine-studio.png`,
  `public/media/motion-product.png` and `public/media/neon-portrait.png` are
  sample artwork; `public/media/README.md` records their provenance. Label each
  visibly as `Sample artwork`, provide descriptive alt text where informative,
  and never present it as a live provider result, a user's
  generated output or proof of shipped image generation. Curated still samples
  must not have fake play controls or pretend to be playable video output.
- Keep copy, navigation, metadata and previews truthful about supported video
  capabilities and the distinction between sample artwork and actual results.
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
  the video workflow legible. Do not use global gradient orbs, noisy
  textures or unbounded parallax.
- Support `prefers-reduced-motion: reduce` and remove transforms or long-running
  animation when requested.
- Desktop uses the shared dark creator/workspace shell with persistent tool
  navigation and a bounded working area. Auth and docs keep their light shell.
- At mobile widths use compact navigation, stack composer and gallery, and keep
  actions full-size. Never let copy overlap a control or hide the review action.
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
- Verify editable public modes, aspect selection, fixed preset, functional
  gallery filters and prompt-only preset reuse that preserves the selected mode
  and aspect ratio. Check autosave across mode-link navigation and the
  `/dashboard` auth handoff for guests and signed-in visitors. Confirm the draft
  retains only the three intent fields plus `version: 1` schema metadata and
  restoration never auto-submits.

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
