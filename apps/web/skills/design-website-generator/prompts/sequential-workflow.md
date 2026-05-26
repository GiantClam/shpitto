# Sequential Page Generation Workflow

This document defines the prompt contract for sequential multi-page website
generation. It exists to keep terminology, design usage, navigation structure,
and media planning coherent from page to page.

## Core Concepts

### Why sequential generation

1. Content coherence
   - terminology and phrasing remain consistent across pages
2. Design coherence
   - token usage follows one stable interpretation
3. Navigation coherence
   - route structure grows from already-generated pages instead of drifting

### Sequential vs parallel

| Mode | Best for | Main tradeoff |
| --- | --- | --- |
| Sequential | Multi-page sites with shared meaning and shell | Slightly slower |
| Parallel | Independent pages with little dependency | Higher coherence risk |

## Page Generation Workflow

### Step 1: Initialize (Page 1 only)

Input:
- user brief
- design system / design spec
- confirmed design overrides

Output:
- `page1_context`
- `first_page_generated = true`

### Homepage Prompt Template

```md
You are an expert website page generator. Generate the homepage from the
following inputs.

## User Brief
{prompt}

## Design System
- Brand: {brand_name}
- Primary color: {primary_color}
- Accent color: {accent_color}
- Font family: {font_family}
- Shadow technique: shadow-as-border

## Design Rules
{design_rules_summary}

## Corporate-B2B Homepage Contract
- For company / manufacturer / procurement-facing B2B sites, use an enterprise
  homepage by default.
- If the latest confirmed dialogue explicitly requests IBM or Carbon, treat that
  only as a visual override. The homepage structure still follows the same
  enterprise rules below.
- The homepage must read as an enterprise company homepage, not a lifestyle
  landing page or personal site.
- Preferred opening sequence:
  - image-backed enterprise hero
  - proof / procurement-value strip
  - capability band
  - enterprise CTA band
- The first visible section must be a single image-backed enterprise hero, not
  a split hero.
- Do not generate:
  - `aside` hero rails
  - promo side cards
  - lifestyle visual rails
  - right-column stat stacks
  - detached image frames competing with the opening copy
- The hero must contain a real `<img>` / `<picture>` media node inside
  `enterprise-hero__media` when a stock/library asset is available.
- Do not use CSS-only background imagery as the sole proof of the hero visual
  when a real asset is available.
- Do not fake the visual with `enterprise-hero-visual`, `visual-content`,
  `visual-note`, `media-panel`, or another text-only pseudo-image box.
- If the route spec exposes `suggested_asset_url`, `suggested_asset_alt`, or
  `suggested_asset_caption`, use that asset in the hero.
- The hero must not render as `copy on the left + empty box on the right`.
- The hero must not render as `copy on the left + text-only role="img" panel`.
- Required structure:
  - one hero section
  - one real photographic hero asset
  - one readable overlay content stack
  - one homepage H1 only, inside the hero content block
  - one primary CTA group
  - zero detached side rails
- Keep the homepage shell close to the header. Do not create a large blank gap
  before the hero by stacking generous top padding.
- Use controlled corporate spacing:
  - 20-36px shell transition below the header
  - 40-72px major section spacing
  - 28-44px comfortable internal module spacing
- Preferred HTML skeleton:
  - `<section class="enterprise-hero">`
  - `<div class="enterprise-hero__media">...</div>`
  - `<div class="enterprise-hero__content">...</div>`
  - optional `<div class="enterprise-hero__actions">...</div>`
- Preferred CSS ownership:
  - `.enterprise-hero`
  - `.enterprise-hero__media`
  - `.enterprise-hero__content`
  - `.enterprise-proof-row`
- `.enterprise-hero__media` should fill the hero as the base media layer.
- `.enterprise-hero__content` should sit above the image as readable overlay
  copy.
- Do not give `.enterprise-hero__content` a detached card background, heavy
  card shadow, or a second surface treatment that makes the hero read as a
  split panel.
- `.enterprise-hero__content` must stay visually transparent. Do not assign
  `background`, `border`, `box-shadow`, or `backdrop-filter` styles that turn
  the copy layer into a frosted card.
- Do not implement the hero with `grid-template-columns` split logic.
- Do not use legacy inner hero classes such as `hero-title`, `hero-copy`,
  `hero-actions`, or `page-section` inside the enterprise hero subtree.
- Do not use generic action-group classes such as `hero-actions` anywhere on
  the homepage or interior CTA clusters. Use enterprise-owned or route-owned
  action classes instead.
- Do not use generic opening wrappers such as `hero`, `section hero`, or other
  marketing-landing hero shells. The opening wrapper itself must be
  enterprise-specific, such as `enterprise-hero`.
- Do not use legacy opening classes:
  - `hero-grid`
  - `hero__grid`
  - `hero-panel`
  - `media-frame`
  - `hero-copy + aside`
  - `hero__body`
  - `hero__content`
  - `hero__actions`
- The next capability band must not introduce a second H1 or another hero-scale
  title.
- Plan homepage imagery before composing JSX:
  - the first band is an image-backed enterprise hero
  - the first real image belongs to that hero
  - overlay copy stays primary and readable through a scrim/contrast treatment
  - target roughly 55-65% first-screen visual weight for the image and 35-45%
    for the overlay copy
  - preserve a tall first-screen crop on desktop and mobile
  - use wide enterprise-friendly ratios such as `16:9`, `21:9`, or disciplined
    landscape crops
  - do not compose the page first and then search for a place to insert an
    image
  - if stock/library imagery is available, use a real photographic asset, not
    inline SVG, abstract enterprise illustration, or
    `data:image/svg+xml` placeholder
  - keep visible media and layout blocks class-owned; do not rely on final HTML
    inline styles like `style="width:100%;height:100%;object-fit:cover"`
  - do not emit visible inline styles on opening grids, support lists, CTA
    shells, or other layout blocks; move those decisions into shared classes in
    `/styles.css`
  - do not place inline `style=` attributes on `section__head`,
    `section-header`, or equivalent section-heading wrappers
  - visible copy, placeholders, and CTA labels must be free of mojibake or
    encoding-corrupted punctuation
- If buyer signals are needed near the top, render them as a compact proof
  strip below the masthead.
- Do not render:
  - a large stacked summary panel
  - a second hero-like block
  - `snapshot`, `company snapshot`, or `overview panel`
  - a single bordered card that wraps the entire proof block
- The CTA zone must stay single-primary-block. If extra support is needed, use
  a short inline checklist or compact trust row.
- Header and utility rules:
  - locale switch belongs in a dedicated wrapper adjacent to nav
  - nav should contain route links only
  - do not place locale buttons inside `<nav>`
  - do not emit an empty locale wrapper
  - for corporate-b2b pages, keep locale button labels literal `EN` / `ZH`
  - for corporate-b2b pages, keep alternate-language strings in
    `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json` instead of
    emitting inline `data-i18n-zh` / `data-i18n-en` values across the final
    HTML
- Capability band rules:
  - render one unified capability band after the proof row
  - use one heading block plus one capability grid/list
  - do not use `content-band--split`, `split-grid`, `detail`, `proof-rail`, or
    a right-column `aside`
- Visitor-facing copy rules:
  - do not surface internal design-direction labels such as
    `heritage manufacturing`, `heritage craft`, `warm palette`, or similar
    art-direction metadata in the homepage eyebrow, hero kicker, trust row,
    proof row, or footer copy
  - unless the brief explicitly asks for company history or heritage
    storytelling, do not use plain `heritage` as homepage value language
  - specifically do not write homepage kickers that expose hidden vertical
    presets or art-direction metadata; use business offer, sourcing
    reliability, operating trust, or buyer-fit language instead
  - on `products`, `custom-solutions`, and `cases`, make the route-owned
    opening class explicit in the first section wrapper itself (for example
    `catalog-lead`, `process-intro`, `evidence-header`) rather than leading
    with generic shell tokens such as `route-band`

## Requirements
1. Use the provided design system precisely.
2. Generate a homepage that establishes the brand and the business path.
3. Return complete React component code.
4. Sections inside the page may run in parallel, but the opening hero remains
   a single coherent surface.

## Output Format
1. `page_context`: headings, key terms, design usage, media plan
2. `component_code`: complete TSX
3. `preview_requirements`: the elements required for preview capture
```

### Step 2: Generate Page 2+

Input:
- original user brief
- design system / design spec
- `previous_page_context`

Output:
- `pageN_context`
- updated context chain

### Follow-on Page Prompt Template

```md
You are an expert website page generator. Generate the current page based on
the previous page context.

## Original User Brief
{prompt}

## Previous Page Context
- Headings: {previous_headings}
- Key terms: {previous_key_terms}
- Design usage: {previous_design_usage}
- Internal links: {previous_links}

## Design System
- Brand: {brand_name}
- Primary color: {primary_color}
- Font family: {font_family}

## Inheritance Rules
1. Reuse approved terminology. Do not invent unnecessary synonyms.
2. Reuse the same design token application pattern.
3. Keep the same overall visual language while letting the route-specific
   opening and modules change to fit the page job.
4. For `products`, `custom-solutions`, and `cases`, place a real route-owned
   image in the opening band or the first opening-adjacent proof band. Do not
   delay the first useful image until a later support section.
5. Do not open `products`, `custom-solutions`, or `cases` as oversized white
   text slabs with an empty or visually weak right half.
6. If a visible image caption appears on `products`, `custom-solutions`, or
   `cases`, make it buyer-facing. It may describe material proof, application
   context, sourcing relevance, or delivery context, but it must not say things
   like `Use contextual visuals`, `this image supports`, `should show`, or
   `should feel`.
7. Never copy generator/spec wording into visitor-facing text. Do not let
   captions, leads, or support lines repeat instruction verbs such as `should`,
   `must`, `use`, `explain`, or other contract phrasing.
8. The first visible route-owned container on `products`, `custom-solutions`,
   and `cases` must use a route-specific opening class such as `catalog-lead`,
   `process-intro`, or `evidence-header`. Do not fall back to a generic
   `section content-grid`, `section stack-lg`, or similar generic shell.
9. Opening proof media on `products`, `custom-solutions`, and `cases` must use
   reusable semantic classes such as `product-media`, `process-media`,
   `case-media`, `panel-image`, or another route-owned media class. Do not emit
   inline `style=` attributes on `<img>`, `<figure>`, or proof panels to force
   width, height, object-fit, max-width, or alignment.
10. The `contact` opening support panel must use a dedicated route-owned class
    such as `contact-conversion__aside` or `contact-support-panel`. Do not emit
    inline `style=` attributes such as `max-width`, `justify-self`, or ad-hoc
    spacing/alignment fixes on the contact opening panel.
11. Do not use inline-styled generic utility blocks such as `hero-title`,
    `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or
    `media-frame` to control spacing or sizing on interior routes. Express
    those patterns through reusable route-owned classes in `/styles.css`.
12. Do not emit inline `margin-top` fixes on footer support notes, helper
    paragraphs, or footer action groups. Footer spacing must also come from
    reusable shell classes.

## Route Requirements
Page type: {page_type}

## Output Format
1. `page_context`: inherited + new headings, key terms, design usage
2. `component_code`: complete TSX
3. `coherence_check`: explain how the page remains consistent with the chain
```

### Step 3: Intra-Page Section Concurrency

Sections inside one page may run in parallel after the page-level plan is
defined.

Example:

```text
Page N
  -> Section A (features grid)
  -> Section B (proof row)
  -> Section C (CTA band)

All sections finish
  -> merge into pageN_context
```

### Section Prompt Template

```md
You are an expert section generator.

## Page Context
{page_context}

## Design System
- Colors: {design_colors}
- Font family: {font_family}
- Shadow tokens: {shadow_tokens}

## Section Type
{section_type}

## Section-Specific Prompt
{section_prompt}

## Design Rules
{design_rules_summary}

## Output
- `component_code`: TSX
- `element_list`: preview-relevant elements
```

## Context Transfer Mechanism

### Context Structure

```ts
interface PageContext {
  pageName: string;
  generatedAt: string;
  headings: string[];
  keyTerms: string[];
  featureList: string[];
  designUsage: {
    colorsUsed: string[];
    typographyUsed: string[];
    componentsUsed: string[];
  };
  navigation: {
    internalLinks: string[];
    sectionRefs: string[];
  };
}
```

### Context Merge Rules

When generating page `N`:

1. read all earlier page contexts
2. merge approved terminology
3. merge design-token usage history
4. pass a concise summary forward

Use the summary as:

- approved terminology list
- approved token patterns
- route/link structure memory

## QA Gate Integration

### After every page

Verify:

1. Design compliance
   - colors match the spec
   - typography follows hierarchy
   - shadows follow the shadow-as-border strategy
   - spacing follows the spacing rules
2. Coherence
   - terminology stays consistent
   - tone remains aligned
3. Technical validity
   - no hard-coded out-of-system color
   - no invalid fonts
   - code renders cleanly

### Failure Handling

If QA fails:

- Design issue -> regenerate the affected section with the correct tokens
- Coherence issue -> replace drifted language with approved terminology
- Technical issue -> repair the code and revalidate

Maximum repair attempts: 2

## End-to-End Example

User brief:
"Create an AI coding assistant SaaS website with a homepage, features page, and
pricing page."

Flow:

1. Phase 1
   - choose the design system
2. Phase 2
   - confirm the 8 design items
3. Phase 3
   - generate homepage first
   - generate later pages from inherited context
4. Phase 4
   - run cross-page QA

## Prompt Variable Reference

| Variable | Source | Meaning |
| --- | --- | --- |
| `{prompt}` | User input | Original request |
| `{brand_name}` | Phase 1 | Chosen design-system brand |
| `{primary_color}` | `DESIGN.md` | Primary color value |
| `{accent_color}` | `DESIGN.md` | Accent color value |
| `{font_family}` | `DESIGN.md` | Font family |
| `{shadow_tokens}` | `DESIGN.md` | Shadow token list |
| `{design_rules_summary}` | `rules/*.md` | Rule summary |
| `{previous_*}` | `PageContext` | Inherited context |
| `{page_type}` | Route plan | Current page type |
