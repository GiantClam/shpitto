# customize-site

Coordinate approved brand, theme, content and page composition changes across
the site. The marketing, auth, product and admin shells start from the Shpitto
website baseline as a template fallback. Customer delivery uses this Skill to
compose the customer's own brand, theme and page presentation over that shell.

Use `DESIGN.md` for visual application rules and `src/config/brand.ts` as the
canonical source for all token values. The default template is a video creation
product baseline: use the warm marketing layer for creative value and the dark
studio layer for prompt, model, aspect ratio and output workflows.
Every route should read as part of the same system: the same container, type
scale, spacing rhythm, surface roles and interaction states should carry across
marketing, auth, product and operations surfaces.

## Inputs
- Customer site intent, brand assets, affected shells, tokens, routes, components and release baseline.
- The shared-shell surfaces and their required loading, empty, error and
  denied states.
- A route-level visual brief: hierarchy, content density, media purpose,
  primary action, responsive topology and motion preference.
- For video creation surfaces, a media-first brief naming the prompt composer,
  preview/result treatment, supported `text-to-video` or `image-to-video` mode,
  credits visibility and private asset state.
- The selected workspace context and its shared navigation contract.

## Allowed scope
Approved marketing/product presentation paths, `src/config/brand.ts`,
`src/config/navigation.ts`, `src/app/globals.css` and shared shell components.
Page-local CSS and JavaScript may compose existing primitives, but must not
introduce a second token vocabulary, unbounded animation, global decorative
effects, or interaction that changes protected business behavior. Controlled
gradients inside a purposeful media preview are allowed by `DESIGN.md`.

## Presentation rules
- Define studio values in `brand.tokens.studio` and project them with
  `brandCssVariables` in `src/config/brand.ts`, bound by `src/app/layout.tsx`.
  CSS consumes those variables and semantic aliases; do not introduce duplicate
  numeric token tables or literal `:root` fallbacks in `src/app/globals.css`.
- Scope semantic role remapping to the shared workspace shell so team, billing
  and settings inherit the same dark surfaces, text, borders, focus and status
  feedback as creation. Keep marketing, auth and documentation light, and keep
  dark marketing media previews locally scoped.
- Preserve customer logo artwork and colors on a light backing in the dark
  shell. Do not use logo inversion or recoloring filters.
- Keep selected workspace context in creation, history, assets, team, billing
  and settings links, including header/footer actions. Use the shared navigation
  contract and encode workspace identifiers without changing membership or
  selection rules.
- The shipped runtime is video only: `text-to-video` and `image-to-video`.
  Image input is not image generation. An image-generator visual ambition must
  not become an active image-generation tab, supported API or capability claim.
  Expose only model settings supported by the runtime; visual work does not
  enable live providers or add generation modes.
- Marketing demonstrates end-user creative value with truthful copy, metadata
  and previews. Keep template purchasing, code ownership and engineering
  guidance in buyer documentation, outside customer creation, sign-in and
  billing flows.
- Label the original AI illustration at `public/media/alpine-studio.png` as
  `Sample artwork`, with descriptive alt text where informative. Never present
  it as a live provider result, user-generated output or evidence of shipped
  image generation.
- Require keyboard operation and visible focus, WCAG AA text contrast (4.5:1
  normal text, 3:1 large text), touch targets of at least 44px by 44px and
  reduced-motion support. Verify desktop `1440x900` and mobile `390x844` across
  both themes without overlapping copy or controls.

## Protected contracts
Keep sign-in, workspace navigation, generation, downloads, billing, admin and i18n boundaries intact.

## Outputs and evidence
Record the change manifest, customer asset/token overrides, route visual brief,
all four journey checks, desktop/mobile/accessibility results, shared
navigation consistency, state coverage (default/hover/focus/disabled/error)
and recovery patch. Include scoped token mappings, light marketing/auth/docs,
dark team/billing/settings, logo backing, workspace-aware links, sample artwork
labeling and truthful video-only capability claims.

## Recovery
Resolve overlapping dirty work, then apply a scoped rollback without repository-wide reset.

## Escalation
Any protected contract or dependency change is classified as engineering work.
