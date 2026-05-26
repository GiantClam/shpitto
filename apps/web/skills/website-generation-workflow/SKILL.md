---
name: "website-generation-workflow"
description: "Defines the end-to-end website generation workflow. Invoke when generating multi-section pages or full websites."
---

# Website Generation Workflow

## Skill Relationship (Authoritative)

- This skill is the **orchestrator** for end-to-end website generation.
- `design-website-generator` is the **executor** skill/tooling surface for concrete generation, context building, and QA execution.
- When both are available, this workflow decides phases and delegates implementation slices to `design-website-generator`.

## Scope

Use this workflow for complete website generation from requirements to final delivery, including planning, design system setup, section batching, visual polish, and validation.

## Style Library (Mandatory)

Support and prioritize the dynamic style library at:

`https://github.com/VoltAgent/awesome-design-md`

### Dynamic Loading Rules

1. Fetch the latest README and repository tree before each new website generation run. Do not rely only on manually copied static files.
2. Extract: `category / styleName / slug / description / DESIGN.md URL`.
3. Build a local style index (defined below) and use it as the basis for style selection.
4. If network access fails, fall back to the latest cached index and mark it as `stale-cache`.

### Required Local Index Structure

```text
.cache/awesome-design-md/
  index.json
  index.md
  categories/
    <category-slug>.md
  README.source.snapshot.md
```

`index.json` must include at least:

- `sourceRepo`
- `generatedAt`
- `totalStyles`
- `categories[]`
- `styles[]` (each item includes `name/slug/category/description/designMdUrl/previewUrl`)

### Traceable Style Selection Rules

1. Match style candidates (Top 3) using industry, audience, and conversion goals.
2. Provide fit rationale and risk notes for each candidate.
3. Output one recommended style and explicit exclusion reasons.
4. Save `style-selection-record` including index version, candidates, final choice, and reasons.

## Required Phases

### Phase 0: Requirement Enrichment

1. Extract user goals, industry, target audience, key value propositions, and page structure.
2. Identify missing critical information and complete it.
3. Produce a structured requirements summary.

Quality gate: Critical information complete OR confidence > 0.8.

### Phase 0.25: Canonical Prompt Confirmation Gate (Mandatory)

Before creating or running any website generation task, produce a complete Canonical Website Prompt from the enriched requirements and wait for user confirmation.

The Canonical Website Prompt must be a rich markdown generation brief, similar to a senior strategist's page-by-page website prompt. It must include:

1. The user's explicit constraints, source evidence, and marked assumptions.
2. Overall website positioning, target audience, information architecture, and conversion goals.
3. Detailed page-by-page prompts with route-specific purpose, source facts, section order, copy direction, components, interactions, and mobile/accessibility notes.
4. General design rules: color, typography, spacing, layout, responsive behavior, states, and motion.
5. Special components and functional requirements that are supported by the runtime.
6. Fixed output files and routes in a thin machine-readable Prompt Control Manifest.
   - Include a `Prompt Control Manifest (Machine Readable)` JSON block with `routes`, `navLabels`, and `files`.
   - Treat this JSON block as the authoritative route/file handoff only.
   - Do not compress page content, copy, or design semantics into a structured generation spec.
7. The page differentiation contract and shared shell/footer contract from this workflow.

Generation must not start from the raw user request alone. Generation may start only after the user has confirmed the Canonical Website Prompt or provided an equivalent confirmed prompt payload. The confirmed Canonical Website Prompt becomes the source of truth for downstream planning and implementation. The Prompt Control Manifest is only used to split files and validate route completeness.

Quality gate: A confirmed Canonical Website Prompt exists before task creation or any file generation.

#### Internal Workflow Language Contract (Mandatory)

1. All internal workflow artifacts must stay in English: Canonical Website Prompt, Prompt Control Manifest prose, task plans, findings, design notes, QA notes, repair instructions, and other process files.
2. The requested website locale may still be Chinese, English, or bilingual, but that locale must be expressed as a requirement inside the internal artifact rather than changing the artifact language itself.
3. Do not paste multilingual raw user wording, uploaded-source excerpts, or process annotations directly into workflow files when an English-normalized summary can carry the same planning meaning.
4. If multilingual source material must be preserved, keep it in source storage or external artifacts and reference it from the English workflow notes instead of copying it into the prompt/process file.

#### Evidence Brief Contract (Mandatory)

When requirement enrichment, uploaded files, domain extraction, or web search produce a `## 7. Evidence Brief`, treat that section as the authoritative source hierarchy for website content focus.

Evidence Brief responsibilities:

1. Preserve `Priority Facts` in the Canonical Website Prompt. These facts define brand semantics, audience, offerings, differentiators, and proof points.
2. Use `Source Priorities` to decide which facts are reliable. Uploaded files, same-domain pages, and explicit user input outrank generic web search. Generic industry research may shape structure and UX, but it must not become brand-owned claims.
3. Use `Page Briefs` to write route-specific page prompts. Each page prompt must include page goal, audience intent, source-backed content inputs, section order, and next action.
4. Use `Gaps And Assumptions` only as internal planning context. Keep unsupported details honest by omitting them from visitor-facing pages or replacing them with neutral contact/download actions. Do not render assumption labels, content-gap labels, source-analysis rationale, missing-content notices, or placeholder-copy markers in generated HTML.
5. The Evidence Brief is a content strategy artifact, not a route/file manifest. The Prompt Control Manifest remains the only machine-readable route/file handoff.
6. If Evidence Brief content conflicts with generic template defaults, Evidence Brief content wins.

Quality gate: A Canonical Website Prompt generated from researched material must preserve priority facts, page briefs, content gaps, and assumption rules as planning context, while generated website pages must expose only finished visitor-facing copy.

#### Visitor-Facing Copy Contract (Mandatory)

1. Evidence Brief, Page Briefs, source priorities, gaps, assumptions, and prompt control metadata are internal strategy inputs.
2. Generated HTML must never include process phrases such as `content gap`, `placeholder copy`, `source-only note`, `permissions note`, `data note`, `collaboration note`, `navigation rationale`, `[Assumption]`, or `Assumption rule`.
3. If source material lacks a detail, do not explain the gap to visitors. Omit the detail, use a conservative generic CTA, or route the user to contact/download/consultation.
4. Transform source-backed facts into concrete headings, value propositions, cards, comparison rows, process steps, and CTAs. Do not copy analysis notes verbatim.
5. Each route must use a distinct hero composition and section rhythm. Shared header, footer, tokens, and navigation are allowed; repeated hero/body skeletons with swapped text are not.

#### Interior Page Differentiation Contract (Mandatory)

1. Language switching belongs to the shared shell. Do not add a repeated locale explainer, second EN/ZH toggle block, menu-like utility rail, or language-card panel inside the opening section of every interior page unless the brief explicitly asks for a route-level localization explainer.
2. Products, custom solutions, cases, contact, and about pages must not all open with the same `hero + side panel + generic grid` arrangement. Route role must change the opening module topology, section cadence, and component emphasis.
3. Use route-native opening modules:
   - `products`: assortment/category framing, buyer comparison, material/spec orientation
   - `custom-solutions`: scenario fit, customization path, delivery/collaboration model; default to a process intro or capability timeline rather than a full promotional hero
   - `cases`: evidence library, scenario/outcome framing, method/proof
   - `contact`: conversion-first contact surface, channels, response expectation
   - `about`: identity, operating model, trust/process proof; default to a company masthead, operating profile, or proof slab rather than a campaign hero
4. Shared shell consistency must not flatten the body layout. Reuse header/footer/tokens, but vary the first visible module, section rhythm, and component hierarchy by route so the site reads like a company website rather than one reusable personal-page template.
5. If a route starts to resemble a personal essay page, editorial note, archive explainer, or profile microsite rather than a company/B2B page, rewrite it toward capability, proof, procurement clarity, and business next actions.
6. Homepage may use a full promotional hero. Interior routes should default to compact lead bands, evidence headers, catalog intros, form-first starts, or profile mastheads instead of repeating a full homepage-style hero on every page.
6a. `products`, `custom-solutions`, and `cases` must not open as large white text slabs with delayed imagery. Each of those routes needs a real route-owned image in the opening band or the first opening-adjacent proof/capability band.
7. Language switching is utility UI only. Do not create visible section headings or major body sections whose topic is "Switch between English and Chinese", "Choose language", "Read in both languages", or equivalent wording. The locale control lives in the shared header/footer, not in the page body content model.

#### Brand Representation Contract (Mandatory)

1. If the logo strategy is `Text wordmark` / `text_mark`, the default brand treatment is text-only.
2. Do not automatically prepend a standalone initial, monogram, crest, badge, or icon chip to the company name unless source materials explicitly provide such a mark.
3. Do not invent a brand subtitle, slogan, or positioning line beneath the wordmark unless it is source-backed.
4. If the brand area needs visual structure, use spacing, typography, or a neutral divider rather than fabricating a logo system.
5. Header/footer branding on company websites should read like the company name itself, not `letter badge + company name`, unless the user or source explicitly requested that format.
6. Do not emit empty decorative brand-mark placeholders such as empty circles, empty squares, empty badge spans, or unlabeled logo chips when no real mark exists.
7. When the logo strategy is text wordmark and the chosen system is IBM / Carbon or another enterprise technology system, do not invent a two-letter badge, monogram chip, or initials block beside the company name. The brand should render as a clean text wordmark only.

#### Enterprise Tone Contract (Mandatory)

When the site type is `company` and the audience includes enterprise buyers, procurement teams, distributors, importers, or export customers:

1. The visible website tone must read as a company website first. Mood keywords such as `heritage`, `craft`, `warm`, `artisan`, `human`, or `material-led` may influence palette and texture, but they must not become the headline premise of the homepage or shared shell.
2. Do not place those mood words in the default `<title>`, meta description, H1, hero kicker, footer note, footer credit, or the first sentence of key interior pages unless the source material explicitly uses them as the company's own public positioning.
2a. Do not reuse the selected design-direction label itself as visible UI copy. Direction names such as `heritage manufacturing`, `warm`, `craft`, or similar are internal art-direction metadata, not visitor-facing eyebrow text.
2b. Unless the brief explicitly asks for company history or legacy storytelling, do not turn words such as `heritage`, `craft tradition`, or similar legacy-positioning language into homepage value claims. Use buyer-facing claims about sourcing clarity, quality control, responsiveness, and production discipline instead.
2c. Treat plain `heritage` as blocked homepage value language by default. Only use it when the brief explicitly requests heritage/history storytelling.
3. Prefer company-facing language such as:
   - enterprise manufacturing capability
   - procurement-ready product presentation
   - sourcing support
   - production coordination
   - custom development
   - buyer documentation / case evidence / inquiry flow
4. For company/manufacturer sites, capability, proof, product clarity, sourcing process, and response readiness outrank atmosphere in visible copy.
5. If the user-selected visual direction contains `heritage` or `warm`, reinterpret them as restrained confidence in visual styling only. Do not let them dominate visitor-facing copy or make the company sound like a boutique studio, maker profile, or personal essay brand.

#### Explicit Design-System Override Contract (Mandatory)

When the user explicitly names a design system or brand reference in later dialogue, treat that as a stronger visual instruction than any previously recommended or auto-selected visual direction.

1. An explicit system override such as `IBM`, `Carbon`, `Stripe`, `Apple`, or equivalent must supersede an earlier recommended/open-design default for visible layout language, component treatment, and homepage topology.
2. Keep source-backed business content and sitemap intent, but restyle the page architecture to match the explicit system.
3. Do not preserve a previous default's hero pattern, badge treatment, or editorial pacing once an explicit enterprise system override has been requested.

#### Corporate-B2B Enterprise Homepage Contract (Mandatory for company / manufacturer / enterprise-buyer sites)

If the site is a company/manufacturer/procurement-facing B2B website, apply this homepage structure by default. If the user explicitly asks for IBM or Carbon, keep this structure and layer the IBM/Carbon visual language on top:

1. The homepage must read as an enterprise technology/company homepage, not a lifestyle landing page, founder page, or boutique brand page.
2. Do not use a soft split-marketing hero with a decorative side card/panel as the main opening.
2a. Do not use a `hero-copy + hero-panel`, `hero-grid + aside`, lifestyle split hero, floating statistic card cluster, or campaign-style promo rail as the homepage opening topology.
3. Prefer:
   - an image-backed enterprise hero with readable overlay copy
   - a structured company masthead embedded in that hero
   - modular proof rows
   - disciplined grid-aligned capability bands
   - a concise enterprise CTA strip
   - a procurement-facing opening sequence such as `image-backed enterprise hero -> proof row -> capability band -> primary action`
3a. The first visible homepage band must be a single enterprise hero:
   - one image-backed lead band or company masthead
   - overlay copy remains primary and readable
   - no right-column promo rail
   - no `aside` stacked beside the opening copy
   - no first-screen image block acting as a decorative split-hero side panel
   - no side media card, side image frame, or right-column visual box competing with the overlay copy
   - no opening KPI/signals panel or quick-summary card sitting beside the masthead copy in the first band
3b. If a real stock/library image is used on the homepage, use it as the opening hero background/support visual rather than pushing the first meaningful image below the fold.
4. Avoid:
   - floating lifestyle-stat cards
   - warm craft-note framing
   - boutique/editorial art direction
   - soft campaign-hero language
   - badge-like initials next to a text wordmark
   - founder-profile composition
   - personal-site opening cadence
   - decorative side summaries that behave like a personal landing page sidebar
   - first-band structures such as `hero__grid`, `hero-grid`, `hero-panel`, `visual-rail`, or `hero-copy + aside`
5. Buttons, spacing, and layout rhythm should feel systematic and enterprise-grade rather than promotional or personal-brand styled.
6. Product/context imagery may remain, but it should support enterprise proof and procurement understanding rather than acting like a decorative lifestyle hero.
7. If the logo strategy is text-only, the header brand must render as text-only. Do not fabricate a `VB`, `V`, or other initial badge beside the company name.
8. The first screen must establish company scope, buyer relevance, and operational proof before any secondary supporting panel or visual callout.
9. Homepage section labels and opening modules should sound like enterprise information architecture: company overview, sourcing support, capability proof, product range, response process. They must not sound like personal branding, editorial storytelling, or lifestyle campaign framing.
10. Do not surface legacy direction labels or mood labels such as `heritage`, `heritage craft`, `warm palette`, `craft`, or similar in the eyebrow, hero, section labels, footer meta, footer chips, or trust rows. Those are internal styling cues, not visitor-facing company copy.
10c. Do not write homepage eyebrow/kicker text that exposes a hidden product vertical or heritage-led art-direction preset unless the brief explicitly asks for that exact public positioning. Prefer operational business framing instead.
10a. Do not surface implementation or brand-system mechanics in visible header/footer/shared-shell copy. Phrases such as `text wordmark`, `wordmark brand presentation`, `brand system`, `site experience`, `language strategy`, `English-first`, `i18n`, `locale`, or similar implementation notes are not visitor-facing enterprise copy.
10b. The same ban applies to compact tags, chips, or trust-signal rows. Do not emit visitor-facing tags such as `Text wordmark brand`, `Bilingual experience`, or similar implementation shorthand inside homepage proof rows, buyer-signal rows, or CTA support blocks.
11. Treat homepage imagery as a planned module, not a decorative afterthought.
    - The homepage opens with an image-backed enterprise hero.
    - The hero image sits behind or beneath the masthead copy with a readable overlay scrim.
    - The hero image should carry strong first-screen visual weight so buyers grasp product and use context immediately instead of seeing a mostly text-led banner.
    - On desktop, the hero image should contribute roughly 55-65% of the first-screen visual emphasis while the copy remains readable in a disciplined 35-45% overlay zone.
    - On mobile, preserve enough vertical image depth that the product/environment scene still reads before scroll; do not collapse the image into a shallow decorative strip.
    - The image must support procurement proof, product context, or manufacturing trust rather than acting like a lifestyle campaign.
    - If stock/library imagery is available, that first homepage image must be a real photographic asset. Do not substitute an inline SVG scene, abstract illustration, or data-URI placeholder as the primary enterprise proof image.
    - The first image must not be rendered as an empty right rail or detached proof block that leaves the opening hero visually hollow.
    - The opening hero must contain a real `<img>` or `<picture>` media node inside the hero media slot. Do not rely on a CSS-only background-image as the sole enterprise hero visual when a real photographic asset is available.
    - Do not replace that hero visual with a text-only placeholder box such as `enterprise-hero-visual`, `visual-content`, `visual-note`, `media-panel`, or other pseudo-image scaffolding.
    - If the route design spec provides `suggested_asset_url`, `suggested_asset_alt`, or `suggested_asset_caption`, use that real asset in the opening hero instead of inventing a placeholder block or empty `media-frame`.
    - Treat `suggested_asset_caption` as buyer-facing support copy only. Never copy generator/spec instruction wording such as `should`, `must`, `use`, `explain`, or `layout intent` into visible text.
    - For enterprise heroes, keep the copy layer transparent. Do not assign `background`, `border`, `box-shadow`, or `backdrop-filter` to `.enterprise-hero__content` or any equivalent hero copy wrapper.
    - For route-owned proof media on `products`, `custom-solutions`, and `cases`, use reusable semantic classes in `/styles.css` instead of inline `style=` attributes on `<img>`, `<figure>`, or proof panels.
    - For the `contact` opening support panel, use a dedicated route-owned class rather than inline `max-width`, `justify-self`, or other layout styles.
    - For enterprise homepage heroes, do not use legacy inner utility classes such as `hero-title`, `hero-copy`, `hero-actions`, or `page-section` inside the hero subtree.
    - Do not use generic action-group classes such as `hero-actions` on homepage or interior CTA clusters. Use enterprise- or route-owned action classes instead.
    - For enterprise homepage heroes, do not use generic opening wrappers such as `hero`, `section hero`, or other marketing-landing hero shells. The opening wrapper itself must be enterprise-specific, such as `enterprise-hero`.
    - For `products`, `custom-solutions`, and `cases`, the first opening section should foreground the route-owned opening class itself (for example `catalog-lead`, `process-intro`, `evidence-header`) rather than leading with a generic shell token such as `route-band`.
    - For interior routes and CTA bands, do not use inline-styled generic utility blocks such as `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or `media-frame` to control spacing/sizing. Use reusable route-owned classes in `/styles.css`.
    - Do not place inline `style=` attributes on `section__head`, `section-header`, or equivalent section-heading wrappers. Section-head spacing and alignment must stay class-owned.
    - Do not emit inline `margin-top` fixes on footer support notes, helper paragraphs, or footer action groups. Footer spacing must also come from reusable shell classes.
    - Preferred implementation shape:
      - one opening hero section
      - one real photographic hero asset bound to that opening section
      - overlay headline, lead, and CTA inside the same hero surface
      - exactly one homepage H1, and it must live inside that opening hero
      - the hero image should remain visually dominant enough to grab attention before the supporting proof row
      - the hero should begin close to the shared header; avoid a large blank band created by stacking top shell padding and full section padding before the first meaningful content
      - no blank right side waiting for a later proof image
      - no text-only box pretending to be the hero visual
      - no split-panel implementation where `.enterprise-hero__content` becomes an independent card or gradient slab beside a separate image card
      - the hero media layer should fill the hero container; the copy layer should sit above it with a readable scrim rather than owning its own standalone background surface
      - enterprise-specific class semantics such as `enterprise-hero`, `enterprise-hero__media`, and `enterprise-hero__content`
      - avoid legacy split-hero class naming like `hero-grid`, `hero__grid`, `hero-panel`, `media-frame`, or `hero-copy + aside`
      - do not mix legacy hero utility classes such as `hero__body`, `hero__content`, or `hero__actions` into the corporate-b2b homepage opening; use enterprise-specific hero class names consistently
      - the final homepage HTML must actually use the enterprise hero class family for the opening section rather than only matching the layout visually
      - the final homepage CSS must style the opening through `.enterprise-hero`, `.enterprise-hero__media`, `.enterprise-hero__content`, and `.enterprise-proof-row` rather than relying on `.hero-grid`, `.hero-copy`, `.hero-panel`, or similar legacy homepage classes
      - final corporate-b2b HTML should not depend on inline `style="..."` presentation for visible media or layout blocks; move hero, card, grid, and support-layout styling into shared classes in `/styles.css`
      - visible copy, placeholders, and CTA labels must be free of mojibake or encoding-corrupted punctuation such as broken apostrophes, broken dashes, or replacement characters
      - the capability band that follows the hero must not introduce a second H1 or another hero-scale heading; use H2/section-title semantics there
      - homepage shell spacing must stay controlled and enterprise-like: the first section should usually begin within roughly a 20-36px transition below the header, and major section transitions should usually land in roughly the 40-72px range rather than collapsing into dashboard-tight spacing or drifting into 96px+ marketing whitespace
      - interior pages should keep the same theme but breathe a little more than the homepage proof row; major interior section bands should generally stay in the 40-72px range
      - nested proof rows, capability grids, card stacks, CTA action groups, and support clusters should still feel comfortably spaced, usually in the 28-44px range rather than 8-16px dashboard density
12. Homepage shell layout should be expressed through reusable classes and design tokens, not ad-hoc inline layout styles. Do not hardcode visible `max-width`, `background`, spacing, or image-sizing rules directly on masthead, proof-strip, capability-band, or CTA shell nodes unless the executor explicitly requires a one-off fix.
12. Prefer restrained enterprise media treatment:
    - contained `figure` or media card inside the shell/grid
    - rectangular aspect ratio such as `5:3` or `4:3`
    - optional short caption that improves buyer understanding
    - if a caption is used, it must describe product/use context, sourcing relevance, or material proof; it must not explain the media module itself with phrases like `proof image`, `visual cue`, `this image supports`, or other meta-design wording
    - do not use imperative or coaching captions such as `Use contextual visuals`, `should show`, `should feel`, or `rather than abstract blocks`
    - do not let visible leads, captions, support lines, or CTA labels repeat generator/spec instruction verbs such as `should`, `must`, `use`, or `explain`
13. Do not emit a hard-inserted full-width image that simply expands to fill available width without regard to module ownership, enterprise rhythm, or the surrounding shell.
14. If the homepage includes buyer signals, metrics, or operational highlights, place them in a proof strip or follow-on capability row beneath the masthead. Do not render them as a competing right-column opening panel.
15. Buyer signals on a corporate-b2b homepage should default to a compact horizontal proof row:
    - short chips, compact metrics, or brief evidence cells
    - low vertical height
    - shell-aligned row treatment
    - no oversized summary card, no stacked spotlight panel, no second hero-like block directly under the masthead
    - do not label this block as `snapshot`, `company snapshot`, `overview panel`, or similar panel-style framing
    - do not wrap the whole proof row inside one large bordered card/panel container
16. Footer and shared-shell copy must read like company/trust/support language:
    - allowed: company summary, sourcing support, export readiness, route labels, contact/helpful trust notes
    - banned: implementation descriptors, brand-system descriptors, language-toggle explanations, or visitor-facing references to text-wordmark mode
16a. Header utility structure must remain clean:
    - primary nav links stay inside the nav list/cluster only
    - locale switch lives in a separate utility container beside the nav, not appended directly into the last nav link run
    - do not output malformed header HTML where the locale switch is concatenated into the nav link stream without a separate wrapper
    - do not emit an empty `header-utility` / `locale-utility` shell while the locale buttons remain inside `<nav>`
17. Homepage CTA treatment on a corporate-b2b company site must remain single-primary-block:
    - one main CTA narrative block is preferred
    - secondary support, if needed, should be a short inline checklist, brief trust line, or compact meta row
    - do not render a split CTA section with a second bordered panel/card that repeats instructions, form hints, or inquiry-prep notes beside the main CTA block
17a. CTA and section shells should not rely on one-off inline layout styles for final output. Prefer dedicated classes such as `cta-band`, `section__header`, `section__actions`, or equivalent reusable shell classes instead of `style="..."` spacing fixes.
17b. Do not use generic action-cluster classes such as `hero-actions` in CTA bands, route openings, or footer callouts; use route-owned or shell-owned action classes instead.
18. The homepage capability zone must be a unified enterprise capability band:
   - use one shell-aligned band with a heading block plus a capability grid/list underneath
   - do not render the capability zone as a left content column plus a right `aside`, `detail`, `proof-rail`, or buyer-help sidebar
   - do not use class or layout patterns such as `content-band--split`, `detail`, `proof-rail`, or `split-grid` for the homepage capability zone
   - buyer guidance for that zone should appear as short inline support notes, compact subcopy, or capability-card microcopy, not as a separate sidebar container
19. Header locale controls must be structurally clean:
   - the primary nav contains route links only
   - locale controls render once, inside a dedicated adjacent utility wrapper
   - do not place locale buttons inside the nav and then emit a second empty utility wrapper beside it
   - do not emit an empty locale utility shell
   - for corporate-b2b sites, keep locale button labels literal `EN` / `ZH`
     and place full language strings in the JSON dictionaries, not in the
     switch control itself

#### Industry-Neutral Company Variant (Mandatory)

The generic company workflow must stay industry-neutral unless the source
material explicitly names a product vertical and asks for that vertical's
language, imagery, or palette.

1. Theme:
   - Use a calm, professional company shell derived from the confirmed prompt,
     not from a hardcoded industry palette.
   - Do not inject ocean-blue, hospitality, export-textile, pool/beach, or
     any other vertical-coded palette by default.
2. Typography:
   - Use a clean company-appropriate type system chosen from the confirmed
     visual direction.
   - Do not force serif-editorial or sector-specific typography unless the
     source material explicitly asks for it.
3. Images:
   - Homepage, products/services, process, about, and contact routes may use
     real photographic support when it improves understanding.
   - Image choice must follow the confirmed route contract and source
     material, not a hardcoded product vertical.
4. Hard bans:
   - No scenario-specific image grammar in the generic path.
   - No hardcoded product families, export sectors, resort/hospitality scenes,
     towel stacks, pool/beach visuals, or other vertical assumptions unless the
     source material explicitly requires them.
   - No synthetic placeholder art when a real product/process/context image is
     available and relevant.

#### Image And Product Visualization Contract (Mandatory)

When the site is a company/manufacturer/export site and the source material does not already provide a complete image set:

1. Do not ship a text-only corporate website when page goals, product categories, specifications, or sourcing claims would benefit from visual support.
2. Prefer real photographic support over abstract decorative fills. Prioritize stock/library retrieval before AI illustration when a believable product or contextual image is needed.
3. Use images intentionally:
   - homepage: one strong category/production/context visual
   - products: category/supporting product images that help buyers understand range
   - custom solutions: process, application, or production-support imagery
   - cases: application or outcome support imagery
   - about: company/process/material image, not a lifestyle collage
   - these visuals must appear as actual image-bearing modules (`img`, `picture`, `figure`, or equivalent rendered media block), not only as text panels or abstract decorative backgrounds
4. Specification or capability sections should be paired with restrained supporting visuals, swatches, product detail crops, or environment photos where that increases comprehension.
5. Avoid pages that feel like pure wireframe copy blocks. The site should read as a real company presentation with selective imagery, not as a text-first prototype.
6. Keep image use disciplined. Do not turn the company site into a gallery or marketing collage; images should support procurement understanding, product confidence, and application clarity.
7. Abstract gradient blocks or empty decorative rails are not an acceptable substitute when the page clearly calls for a product/context image and stock/library imagery is available.
8. Before writing the final page, define a `media plan` for each route:
   - `slot owner` (homepage hero background, proof strip, capability band, product support block, process support block, company profile block)
   - `image purpose` (proof, product-support, process-support, company-support)
   - `preferred aspect ratio`
   - `caption rule` (if any)
   - `media source rule` (`curated stock/library photo first`; only fall back to illustration if no believable stock/library image exists)
9. Do not search for images after the layout is already composed. The page structure itself must reserve a media-bearing module so the selected image belongs to that module.
10. Image placement must follow route role:
    - homepage: opening enterprise hero background/support visual first, then proof/capability support only if needed
   - products: beside range/specification or shortlist context
   - custom solutions: beside process/collaboration/application context
   - about: beside company/process/material trust content
11. If a selected image would overpower the route or force a campaign-style hero composition, reduce its prominence or move it to a later module instead of stretching it across the opening band.
12. A real photographic slot and a synthetic placeholder are not equivalent. If the route calls for enterprise proof imagery and stock/library media is available, do not emit inline SVG fabric tableaux, abstract geometric placeholders, browser-generated diagram art, or `data:image/svg+xml` images as the final visitor-facing media module.

6. If the Canonical Website Prompt includes a `Source Material Appendix`, treat it as internal generation input for preserving page content depth, not as a visitor-facing section to render.
7. If the website is centered on one named person such as an author, founder, consultant, or executive, the homepage must first function as that person's public introduction. The hero, H1, title, and first screen should establish identity, expertise, and positioning before directing visitors into `/blog`, archives, or content categories. The blog/content route is a downstream publishing surface, not the homepage identity itself.
8. Every page, including the homepage, must deliver substantive visitor-facing content rather than explaining the site's route choreography. Do not write copy that tells visitors where to start browsing, which route comes next, what the page's "task" is, or that one page leads into deeper content.
9. Ban visible scaffold phrases and equivalents such as `start from the homepage`, `next read the blog`, `follow the reading path`, `reading entry`, `site entry`, `homepage route`, `continue exploring`, `next step`, `this page provides`, `homepage job`, `where to start`, or `start from home` when they explain navigation order rather than a concrete offer or action.
10. Fallback/no-JS/deployment compatibility content is a rendering safety net only, not a content source chain. Generate visitor copy from the confirmed Canonical Website Prompt, uploaded/source material, Evidence Brief, or explicit user content. Do not reuse previously generated HTML, placeholder cards, route summaries, or template examples as source text for new homepage, Blog, or detail-page copy.

#### Verified Specifics Guard (Mandatory)

Do not manufacture brand-owned specifics just to make a page look complete.

1. Never invent names of experts, staff, partners, clients, government agencies, institutions, awards, certifications, papers, reports, events, cities, cases, products, or spaces unless they appear in the user request, uploaded source text, Evidence Brief, same-domain crawl, or credible searched source.
2. Never invent certification numbers, standard numbers, publication dates, file sizes, download counts, participant counts, coverage counts, city counts, member counts, prices, addresses, phone numbers, email addresses, or validity periods unless source-backed.
3. If the source asks for a list module but does not provide concrete list items, render the module as a taxonomy, search/filter interface, process, CTA, or source-backed category list. Do not fill it with fictional examples.
4. For certification/search/download/data modules, prefer neutral CTAs like "Open the lookup flow", "View the resource library", "Sign in to download", or "Submit an application" over fake rows with made-up identifiers.
5. For research-team or case-study modules without named source facts, describe roles, research directions, or evaluation dimensions instead of creating person names or client/case identities.
6. Before finalizing each page, scan for unsupported numerals and proper nouns. Remove or generalize any value that is not traceable to the source material.

#### Gap-Driven Research Policy (Mandatory)

`Gaps And Assumptions` are not only warning labels. Treat each gap as a decision point before generating affected pages.

1. If a gap can be answered by public sources, call `web_search` before generating the page or section that depends on it.
2. Searchable gaps include public terminology, service/category definitions, industry context, audience expectations, public standards, common page modules, same-domain facts, and source-derived brand/domain hints.
3. Unsafe-to-infer gaps include private metrics, awards, client names, testimonials, certifications, prices, addresses, legal claims, contact details, or organization-owned promises unless a source explicitly proves them.
4. Search priority is: same-domain/domain-specific sources first; uploaded-file names, brand names, and gap terms second; reputable public or industry sources third for context and structure only.
5. Summarize useful search results into the Evidence Brief's `Source Priorities` or an `External Research Addendum` with title, URL, and concise reason for use. Do not paste raw search snippets into visitor-facing copy.
6. Generic industry research may improve content depth, taxonomy, page structure, and UX decisions, but it must not become brand-owned proof points.
7. If no credible source answers the gap, keep the gap internal and omit the unsupported detail from generated visitor pages.
8. Prefer fewer, targeted searches over broad template searches. Query the exact missing concept, audience, offering, or public standard that affects the page.

Quality gate: Before file generation, every high-impact gap is classified as source-backed, searched-but-unconfirmed, or unsafe-to-infer; generated pages only use source-backed facts or conservative generic framing.

### Phase 0.3: Route Planning Policy (Mandatory)

Treat the route plan as a workflow artifact, not as free-form prose extraction.

1. Derive routes first from the confirmed Canonical Website Prompt's `Prompt Control Manifest (Machine Readable)` JSON block.
2. If the JSON block is unavailable, derive routes from structured requirement state (`requirementSpec.pageStructure`) before any prose parsing.
3. Derive routes from prose only as a fallback, and only from explicit user navigation, confirmed sitemap, uploaded/source material structure, or the workflow's automatic planning output.
4. Do not convert prompt requirement slots, form fields, page modules, shell regions, or implementation notes into routes. These are metadata or components, not pages.
5. When the user selects multi-page automatic planning but cannot provide a structure, create a compact default sitemap first: `/`, `/custom-solutions`, `/cases`, `/contact`, `/about`.
6. Add `/products`, `/news`, or `/downloads` only when the requirement, uploaded files, domain crawl, or confirmed content clearly supports those content families.
7. Keep route count bounded. Prefer a complete 5-7 page site with deep content over many thin pages.
8. Keep `skill.json` route filters as defensive fallback only. Do not depend on enumerating every invalid label as the primary route planning mechanism.
9. Navigation order is constrained: keep `/` first, preserve the relative order of business/content pages, place the contact page second-to-last, and place the about page last.

Quality gate: The fixed route list contains user-facing website pages only. It must not include prompt-field routes such as `/target-audience`, `/primary-goal`, `/content-modules`, `/conversion-goals`, `/navigation`, `/hero`, or `/core-module-entries`.

### Phase 0.35: Semantic Content Backend Integration Contract (Mandatory)

Blog backend capability is semantic infrastructure, not a visible page template and not hardcoded to one navigation label. During route planning, identify the existing navigation page that most clearly represents a content stream, information platform, article hub, news/insights surface, publication library, or knowledge center. Assign that page a Blog backend confidence score from the workflow policy. If confidence meets the configured threshold, that existing route becomes the content-backend route powered by the Blog API. Do not inject a fallback `/blog` navigation route. A separate `/blog` entry is allowed only when the user, requirement form, sitemap, prompt control manifest, or explicit route contract already requested `/blog`.

When a content-backend route is selected, treat it as a first-class product feature and SEO content surface, not as a decorative mock page and not as a visible "Blog data source" block. The selected page may be `/blog`, but it may also be a semantically equivalent route such as an information platform, content stream, news, insights, publication library, or knowledge hub.

Visible IA rule:

1. The Blog backend is an invisible implementation capability. Do not expose backend names, API/storage/runtime/hydration/fallback jargon, data-source mechanics, English design jargon, or policy wording as visitor-facing headings, labels, helper copy, or section titles unless the navigation label itself is explicitly Blog.
2. The selected route's own information architecture must define the visible content model. For an information platform or knowledge hub, present API-backed posts as the page's own collections such as case library, standards/documents, research reports, policy/regulation updates, product database entries, publication cards, or insight records according to the prompt and source evidence.
3. The data attributes are invisible integration hooks only. `data-shpitto-blog-root`, `data-shpitto-blog-api`, and `data-shpitto-blog-list` must be attached to page-specific sections, lists, cards, or database surfaces without becoming visible copy.
4. Fallback content must read like the selected route's real resource collection. Use native fields such as resource type, document/category label, publication date, scope, summary, tags, status, CTA, or detail link. Do not dump a generic chronological blog feed into an unrelated page.
5. When `/blog/{slug}/` detail pages are required, they must inherit the selected route's detail grammar. If the selected route is an information platform, the detail shell should feel like a resource/report/case/standard detail page while still using `/blog/{slug}/` for SEO-addressable runtime routing.
6. Do not place article/resource cards that link to `/blog/{slug}/` outside `[data-shpitto-blog-list]`. Static explanatory cards may describe categories, but every readable article row/card that promises a detail page must come from the same content-backed list surface so deployed data and fallback content share one visual component.
7. Visitor-facing copy must be final content, not an explanation of the content model. Do not use headings or helper copy such as "three launch articles", "reading method", "how to read", "each article includes date/read time/tags", "this page collects...", "the list is backed by...", or any copy that describes the page mechanics instead of delivering the article/resource content itself. Route heroes may introduce the editorial point of view, but they must make a substantive claim or thesis for readers, not explain the site structure.
   - Also reject softer editorial-scaffold variants such as "reading path", "start with these three articles", "what you'll find here", or "this collection helps you...". These are still page-mechanics or reading-order explanations, not formal visitor-facing content.
   - Replace those phrases with a real editorial thesis, decision lens, or source-backed claim. Example: instead of announcing a reading path, write a claim that explains the core editorial viewpoint behind the collection.
8. When the user asks for articles, posts, reports, guides, or records, treat those items as deliverables. The page must present real item titles, substantive summaries, and clear detail entry points; the detail pages or Blog records must contain finished body content, not only titles, metadata, or excerpts.
9. A requested article count is an internal production constraint, not a visible slogan. Do not write hero copy, section titles, meta descriptions, helper text, or return links that announce "three articles", "three launch articles", "start with these three", or similar count-led framing unless the source material itself is explicitly about that count.
10. Express coverage by topic, tension, or editorial angle instead. The exact requested count should be visible through the actual number of cards/detail pages and through the preview-confirmation workflow, not through explanatory visitor copy.
11. For bilingual sites, language switching is a UI capability, not an editorial storyline. Do not describe the language toggle as "two reading paths" or any similar framing. Use direct language-switch wording instead.
12. If the overall site is person-led but the selected content-backend route is `/blog`, keep `/blog` as the archive/index while leaving `/` as the biography/value-proposition entry. Do not let the blog hero or article taxonomy replace the person's homepage introduction.

Generation responsibilities:

1. Design the selected content-backend route as part of the same website visual system, language, navigation, typography, spacing, and CTA strategy.
2. The selected page must include a stable data-source mount inside a page-specific resource/list/database module:
   - `data-shpitto-blog-root`
   - `data-shpitto-blog-api="/api/blog/posts"`
   - a child container with `data-shpitto-blog-list`
3. Render polished fallback resource cards inside the data-backed list. If the user did not ask for a specific article/resource count, render exactly 3 substantial entries by default. Render more than 3 only when the user, prompt manifest, or source material explicitly asks for that count. They must match the site's brand, locale, category language, taxonomy, and content strategy. These cards are preview/no-JS fallback content.
   - `data-fallback-posts`, inline JSON, or hidden templates may support hydration, but they are not a substitute for visible fallback cards. The initial HTML inside `[data-shpitto-blog-list]` must already contain readable article/resource items.
4. Use SEO-addressable detail links (`/blog/{slug}/`) only when the route is an explicit Blog/News/Articles archive or when the prompt/source explicitly asks for publishable detail pages.
   - Same-page anchors such as `#article-detail`, accordions, hidden panels, or inline detail sections inside the index are not valid substitutes when detail deliverables are required.
   - When detail links are required, the generated output must include the corresponding static `/blog/{slug}/index.html` file for every visible fallback/detail link required by the prompt.
5. Shared `/script.js` must include a small Blog hydrator that:
   - detects `[data-shpitto-blog-root]`,
   - fetches `/api/blog/posts`,
   - renders returned posts into `[data-shpitto-blog-list]`,
   - keeps fallback cards if the API is unavailable.
   - if the page has filter chips, search input, category tabs, or tag links, those controls must work after runtime hydration; either request `/api/blog/posts?tag=...`, `/api/blog/posts?category=...`, or `/api/blog/posts?search=...`, or re-apply client-side filters after replacing the list.
   - do not bind filters only to pre-hydration fallback cards.
6. Visible Blog taxonomy must match the data. If controls expose categories such as `All`, `Research`, `Architecture`, `Operations`, or `AI`, then fallback cards and deployed Blog records must include those exact tag/category values so each control returns a meaningful subset.
7. The generated content-backend page must have a clear, site-native detail region style. Deployment derives `/shpitto-blog-post-shell.html` from the generated site, preserving the same `<html lang>`, header, footer, CSS, typography, taxonomy language, and CTA language for dynamic `/blog/{slug}/` rendering. Dynamic `/blog/{slug}/`, `/blog/tag/{tag}/`, `/blog/category/{category}/`, and search-result collection pages must never fall back to a generic light-theme runtime template when the generated site uses a distinct visual theme.
8. Do not generate Cloudflare D1 credentials, Worker source, binding names, secrets, or server code in static HTML/JS. The deployed runtime owns `/api/blog/*`, `/blog/{slug}/`, RSS, sitemap, and D1 access.
9. Deployment may inject or refresh Blog data, but that is a compatibility fallback. The generated selected page itself must already expose a coherent page-specific content surface without mentioning deployment, runtime refresh, hydration, fallback, backend, API, or data-source mechanics to visitors.
10. When deploying a generated site with an explicit Blog route or another content-backed route that explicitly asks for publishable detail pages, create or update exactly 3 published Blog records derived from the user's provided requirements, uploaded/source material, Evidence Brief, and generated page copy. Prefer concrete source titles first: if the user's material names specific policies, standards, guides, reports, case studies, databases, manuals, or compilations, use those names as Blog post titles before falling back to synthesized guide titles. These records must be strongly related to the user's content, use page-appropriate categories/tags, and must not be generic verification posts, lorem ipsum, template news, or unrelated filler.
11. Blog article generation is an explicit workflow stage between site preview and deployment, not a hidden deploy-time side effect. After the site preview is ready and the confirmed plan includes an explicit Blog route or explicitly requested publishable detail pages, generate the article set, show the titles/excerpts/categories/tags to the user for confirmation, and only then proceed to deployment.
12. Generation and deployment are separate actions. The generation action stops at preview artifacts, content-backed list/detail deliverables, and any confirmation card. It must never silently deploy, auto-confirm deployment, combine generate+deploy into one completion step, or claim the site is deployed unless the user triggers a later explicit deploy action.
13. Deployment/runtime hydration must preserve the generated list's article/card class and visual rhythm. It may replace list data, but it must not replace a site-specific resource card layout with a generic Blog card style.
14. Explicit Blog routes and explicitly requested publishable detail pages imply detail deliverables. For those cases, every visible resource card rendered inside `[data-shpitto-blog-list]` that promises a detail page must link to a corresponding `/blog/{slug}/` target, and each linked target must contain a complete readable body page in the generated output. Without an explicit requested count, keep the initial fallback/detail set to 3 entries instead of expanding every inferred topic into a separate article.
    - This is a generation responsibility first. Use the user's supplied topics, named entities, source materials, and visible card promise to write the detail page at generation time instead of relying on runtime QA to infer direction later.
    - Each detail page must expand the exact list-card topic and the user's source direction rather than drifting into generic blog filler, website-process commentary, or reusable placeholder prose.
    - For generic information-platform, knowledge-hub, standards, research, or resource-collection routes, the default is collection-first. Do not invent `/blog/{slug}/` detail pages unless the prompt, route identity, or source material explicitly asks for publishable article/news details.
15. If the user requests a specific number of articles/posts/reports/guides, generate that exact number of complete content items. Each item must have:
    - a stable slug and `/blog/{slug}/` detail link,
    - title, date or publish state, category/tags, reading time or scope,
    - a list-page summary that is useful on its own,
    - full body content with multiple paragraphs and meaningful section headings,
    - body paragraphs and subheads that reuse the user's real topics, named entities, or source-document themes,
    - no placeholder, outline-only, "coming soon", or metadata-only detail page.
16. For article-style Blog routes, the list page is an index, not the article body. It must link to full details, and deployed/static output must make each requested article readable even when the Blog API or runtime route is unavailable. If runtime detail rendering cannot be guaranteed, emit static `/blog/{slug}/index.html` pages for every requested article using the same shell and typography.
    - Do not satisfy this requirement with data attributes alone. The no-JS initial HTML must visibly expose the article titles/summaries and their `/blog/{slug}/` links before any script runs.
    - This is a same-run generation requirement. Once `/blog/index.html` contains visible `/blog/{slug}/` cards, the same generated artifact batch must already include the matching `/blog/{slug}/index.html` files; do not leave detail pages for a later retry, deploy step, or QA repair pass.
17. Use web search or uploaded/source material enrichment when the user's requested article content needs facts, examples, current context, named tools, policies, standards, reports, or nontrivial domain knowledge. For broad personal-opinion or conceptual posts, LLM drafting may fill the prose, but it must still produce complete publishable body content. Generic web search may inform framing and examples; explicit user-provided content remains the highest-priority source.
18. When web search is used for article generation, distill facts into the Evidence Brief and write original article prose. Do not paste source excerpts, do not expose "web search says" copy to visitors, and do not cite unsupported claims as if they came from the site owner.
19. Regeneration is not a partial repaint. When the user asks to regenerate, rebuild, re-run, or restart generation for a site whose confirmed route plan includes `/blog` or another selected content-backed route with explicit detail deliverables, rerun the full content workflow for that route:
   - regenerate the site preview,
   - regenerate the Blog/content-backed index surface,
   - regenerate the matching `/blog/{slug}/` detail deliverables,
   - regenerate the Blog article confirmation artifact/card,
   - and reopen the deployment handoff stage.
20. A regenerate request must not stop after a fresh `/blog/index.html` preview if the site still contains an explicit Blog route or another content-backed route with explicit detail deliverables. The regenerated run is incomplete unless the updated article set and its detail pages are ready for confirmation again.
21. Regeneration does not collapse deployment into generation. It must reopen the Blog-and-deploy handoff, but deployment still requires a later explicit user action after the regenerated article set is shown again.

### Phase 0.375: Refinement Semantics Contract (Mandatory)

Treat refinement as non-full-site incremental evolution from the current website baseline.

1. If the user does not explicitly ask to regenerate the entire website, keep the task in the refinement lane.
2. Refinement includes three internal subtypes:
   - `patch`: adjust existing copy, layout, styling, or components inside already generated pages.
   - `structural`: add/remove pages, materialize newly requested route files, repair missing route deliverables, adjust navigation relationships, or complete omitted detail pages.
   - `route_regenerate`: rewrite one page or one route family from the current site baseline without discarding the whole website.
3. Only requests such as "full regenerate" or "rebuild everything" may leave refinement and re-enter full-site generation.
4. Requests such as "add missing blog detail pages", "add a new page", "remove the pricing page", "rewrite /about", or "redo the blog page" are still refinement tasks unless they explicitly ask for whole-site regeneration.
5. Structural refinement may create new route files when those files are missing deliverables implied by the current confirmed route plan, or when the user explicitly requests a new page without asking for full-site regeneration.
6. Any newly created page must inherit the current site's active theme, shared navigation, and shared footer contract by default. A structural refine must not introduce a visually detached page, a different header/footer system, or a one-off navigation shell unless the user explicitly requests a shell redesign.
7. Route-level regeneration must preserve the rest of the site's shell, navigation, style system, and unaffected routes unless the user explicitly asks to change them too.
8. Refinement is site-baseline-aware. It should prefer editing or completing the existing project over restarting planning from scratch.
9. Deployment remains a separate action. A refinement may reopen preview confirmation or Blog confirmation, but it must not auto-deploy unless the user later asks to deploy.
10. Preview-stage visual and copy feedback should use `website-refinement-workflow` as the targeted patch skill by default. Do not route ordinary preview feedback back into full generation unless the user explicitly asks for a full rebuild.
11. A refinement report must record the active refine skill, changed files, and whether a deterministic fallback was used, so failed edits can be replayed without losing the generated baseline.

Blog-backed list structure resilience:

1. The card or row class assigned to direct children of `[data-shpitto-blog-list]` must be visually complete on its own. If the class draws a border, radius, background, or shadow, that same class must define adequate internal padding, vertical rhythm, and child spacing.
   - Example: if each runtime item uses `.article-card` or `.blog-card` as the direct child of `[data-shpitto-blog-list]`, then `.article-card` or `.blog-card` itself must include the essential padding. Do not put all gutters only on nested wrappers such as `.article-card__body`, `.card__content`, or `.entry-main`.
2. Do not rely only on fallback-only wrappers such as `.card__body`, `.card__footer`, `.article-body`, or `.resource-main` for the card's essential gutters. Runtime Blog data may replace inner markup while preserving the outer article/card class.
3. If the chosen visual design needs nested wrappers, also provide direct-child fallback styles for runtime-injected simple markup, for example direct `h3`, `p`, meta, tag, and link spacing inside the card class.
4. Preserve the selected page's article/resource visual grammar when hydrating data, but make the CSS tolerant of both the generated fallback markup and a simplified runtime card body. The result must not shrink into text touching borders or cramped tag rows after deployment.

Quality gate: the selected content-backend route is visually integrated with the site and contains the Blog API mount, but the visitor-facing page reads as its own information platform, publication library, news surface, knowledge hub, or Blog according to route semantics; visible copy is formal content rather than explanatory page-mechanics copy; `/script.js` can hydrate the mount without breaking no-JS SEO fallback content; every user-requested article/resource has complete body content and a readable `/blog/{slug}/` detail page or Blog runtime record; deployed `/blog/{slug}/` can reuse the generated site shell without falling back to a generic runtime template or the home page; the deployed project has 3 source-derived published Blog posts when the user requested Blog content. If a semantically equivalent route already exists, do not add a duplicate Blog navigation entry.

### Phase 0.4: Semantic and Layout Preflight Gate (Mandatory)

Before emitting any files, run a route- and layout-aware preflight check.

Minimum deliverable priority before polish:

1. If the requirement is bilingual, every emitted non-blog HTML route must already ship with a visible EN/ZH switch in the shared header/navigation plus working `data-i18n` mappings for its core visible copy. Do not defer the switch to a later repair round.
2. If `/blog/index.html` emits visible article/resource cards linking to `/blog/{slug}/`, the same generation run must emit the corresponding `/blog/{slug}/index.html` files before spending budget on extra decorative modules, secondary sections, or ornamental variants.
3. Under token/time pressure, cut optional flourish first: decorative badges, extra testimonial rows, ornamental illustrations, secondary case-study modules, and non-essential filler sections are lower priority than bilingual switch completeness and Blog detail-page completeness.

1. Route `/` must read as the site home entry. Its title, meta description, H1, and first lead paragraph must establish brand mission, audience, scope, and navigation overview. Do not include download, certification, query/search, login, or registration wording in those fields; place those downstream functions only in later cards, navigation, or CTA modules.
2. If a hero visual rail is tall, it must contain real media, chart, or data-viz content. A large empty right rail with only bottom-aligned text is a generation failure.
3. Dense result cards rendered inside a 12-column grid must span the full available row unless the prompt explicitly calls for a narrower card pattern.
4. Any selected content-backed route with explicit detail deliverables must use `/blog/{slug}/` detail links and preserve the hidden data-source mount contract from Phase 0.35.
5. Express these checks as page-type rules in the Canonical Website Prompt and tool contract. Do not encode brand-specific exceptions in TS; if a page belongs to the `home`, `search-directory`, `blog-data-index`, `content-collection-index`, or `auth` class, apply the corresponding generic gate.
6. Route aliases belong in the workflow skill policy (`skill.json`) and should be consumed by the runtime. Do not hardcode brand-specific alias tables in decision-layer TS.
7. Formal content gate: reject generated pages whose prominent headings, hero panels, sidebars, or helper blocks explain the page structure instead of delivering visitor-facing substance. Examples of failures include "reading method", "three launch articles", "article overview", "each article has tags/read time/detail links", "this collection contains...", "fallback resources", or equivalent process/meta copy. Replace them with editorial thesis, source-backed insight, real article/resource content, or remove the block.
   - Treat reading-order and guide-the-reader phrasing as failures too, including "reading path", "start with these three articles", "what you'll find here", and "this page collects".
8. Global page-mechanics gate: reject any page, not only Blog pages, whose visible copy explains route order or page responsibilities instead of offering content. Homepage failures include "start from the homepage, then move into deeper content", "next read the blog for more detail", "reading entry", "site entry", "homepage route", "the homepage's job is...", "where to start", or "start from home, then read the blog".
   - CTA labels such as "view cases", "book a consultation", or equivalent localized actions are valid only when they point to a concrete offer, service, case, resource, or contact action. They are invalid when used as generic guide-the-reader copy.
9. Requested-content completeness gate: if the prompt asks for a fixed number of articles/posts/resources, validate that the generated output contains the same number of readable detail targets. Each target must include full body prose with multiple paragraphs or sections. A card with only title, tags, date, excerpt, or "read more" is not a completed content item.
10. Count-led editorial framing gate: if the prompt asks for a fixed number of articles/posts/resources, the generated page may contain that number of cards and details, but it must not turn the count itself into visitor-facing scaffold copy such as "three articles, three ways" or equivalent count-announcement prose.
11. Homepage entry gate: the home page may point visitors to the Blog/content route, but it must do so with site-positioning or topical CTA language. Do not explain the site by saying the blog currently has three articles, by summarizing those three articles in sequence, or by telling readers to start from those three pieces.
12. Blog-detail inevitability gate: if the route plan includes `/blog` or another content-backed route with explicit detail deliverables, the generated list surface must expose at least one visible `/blog/{slug}/` detail entry and must include matching readable detail output. A Blog archive that promises detail targets without readable detail output is a generation failure.
13. Action-separation gate: generation and deployment must remain distinct workflow actions. The generation stage may produce preview files, Blog cards, Blog detail pages, and confirmation artifacts, but it must not claim deployment success, auto-trigger deployment, or collapse "generate site" and "deploy site" into one step unless the user explicitly asks for deployment later.
14. Regeneration continuity gate: if a prior or current confirmed route plan includes `/blog` or another content-backed route with explicit detail deliverables, then a regenerate/rebuild request must re-enter the Blog workflow instead of ending at plain site preview. The regenerated output must again produce:
   - the Blog/content-backed list surface,
   - the corresponding `/blog/{slug}/` detail pages,
   - and a renewed pre-deploy Blog confirmation artifact.
   Do not treat regeneration as complete if only the shell pages were refreshed.

Quality gate: route semantics, layout structure, formal visitor-facing copy, and requested content completeness are validated before generation proceeds; a mismatch fails the page preflight instead of being deferred to later visual QA.

### Phase 0.5: Style Library Load and Indexing

1. Dynamically load awesome-design-md.
2. Build or refresh the full local index.
3. Produce style candidates and a style selection record.

Quality gate: Index is available and style decision is traceable.

### Phase 1: Planning and Design System

1. Create or update planning files (`task_plan`, `findings`, `progress`).
2. Define design system tokens: color, typography, spacing, radius, shadow, container rules.
3. Validate implementation readiness and remove hardcoded style values.

Quality gate: Design system validation passes.

### Phase 1.5: Image and Icon Asset Preparation

#### Referenced Project Assets

When the confirmed prompt or runtime context includes a `[Referenced Assets]` block:

1. Treat each listed asset as an external project asset with an authoritative `logical path`.
2. If the generated website uses that asset, reference the exact `logical path` in browser-facing code: HTML `src`, `href`, `srcset`, `poster`, CSS `url(...)`, JavaScript string references, JSON metadata, or downloadable links.
3. Never shorten referenced assets to local workspace paths such as `uploads/...`, `assets/...`, `images/...`, `./uploads/...`, or directory-only values like `uploads/`.
4. Do not use `preview URL`, `release URL`, `preview CDN prefix`, `release CDN prefix`, or `key` directly in generated website code. Those values are runtime resolver metadata only.
5. Apply this rule to every asset category, including logos, icons, images, PDFs, documents, videos, scripts, style files, and downloadable resources.
6. If multiple assets are listed, match by asset name/path and use the corresponding logical path. Do not replace unrelated internal site files.
7. Do not manually construct or edit `preview/{version}` or `release/current` URL segments. The platform rewrites logical paths to stage-specific CDN URLs.
8. During QA, inspect generated HTML/CSS/JS/JSON and verify that every used referenced asset points to the provided logical path, not a local workspace path or a CDN URL.

#### Uploaded Document Source Skills

When the confirmed prompt, Evidence Brief, or `[Referenced Assets]` block includes PDF, DOCX, or PPTX source files:

1. Load the matching local document skill before interpreting that source type:
   - `pdf` for `.pdf` files, scanned PDFs, OCR needs, or PDF downloads.
   - `docx` for Word documents, `.docx`, or `.doc` source material.
   - `pptx` for PowerPoint files, slide decks, presentations, or `.pptx` source material.
2. Treat Shpitto's extracted document text and Evidence Brief as the primary content source for website copy; use the document skill to guide how to interpret structure, tables, slides, and downloadable document references.
3. Preserve downloadable document assets with their exact logical paths when linking to them from the generated site.
4. Do not invent document contents that were not present in extracted text, user requirements, or credible external research.

#### Image Generation (prefer local `web-image-generator` skill, fallback to shared image tooling)

1. Analyze site structure and produce an image requirements list.
2. Classify each required image (Hero / Background / Illustration / Screenshot / Icon-like asset).
3. Generate optimized AI image prompts.
4. Run image generation tools or provide prompts for generation.
5. Save generated images under `images/`.

#### Icon Integration (prefer local `web-icon-library` skill, fallback to Lucide conventions)

1. Select one primary icon library (Lucide is recommended).
2. Map icons to functional semantics and UI intent.
3. Enforce icon size and color via design-system tokens.
4. Add required accessibility attributes.

#### Outputs

- `images/image_prompts.md` (image prompt specification)
- `images/*.png` (generated images)
- Icon usage manifest (icon name, purpose, location)

Quality gate:

- Image requirement coverage is complete.
- Image style is consistent with the design system.
- Icon semantics are clear and accessible.

### Phase 1.6: Site-wide Bilingual Content (EN/ZH)

Definition: bilingual means one active language at a time with a working language state and switch. It never means showing Chinese and English copy simultaneously in the same visible heading, card, paragraph, nav item, CTA, footer, or article.

1. Define default and fallback language from the user/session context (default `en`, support `zh` unless the brief makes Chinese primary).
2. Render only the default language as visible text in the initial HTML. Store the alternate language in `data-i18n-*` attributes, an in-page JS dictionary, generated `i18n/messages.*.json`, or hidden templates that are not visually exposed.
3. Build a unified i18n key structure (page-level + section-level keys).
4. Add language switch in the top navigation (EN / ZH) only when switching actually replaces visible copy.
   - The switch must be a real visible control in the shared header/navigation, not only a JavaScript function.
   - Required implementation protocol: `<button data-locale-toggle data-locale="zh-CN">ZH</button>` and `<button data-locale-toggle data-locale="en">EN</button>`, with translatable nodes carrying `data-i18n`, `data-i18n-zh`, and `data-i18n-en`.
   - Do not use a different selector or data attribute name. `data-i18n-text*`, `data-language-toggle`, `data-lang-switch`, `data-en`, and `data-zh` are invalid for generated output.
   - Never ship switch JavaScript whose queried controls do not exist in the HTML.
5. Ensure all core copy has bilingual mapping (nav, headings, CTA, form labels, footer, Blog/content cards, and detail/article pages).
6. Preserve the current route on language switch; only content language changes.
7. Persist language preference (recommended: `localStorage`) and update `html[lang]`, active switch state, and relevant `aria-label` values.
8. Keep default-language content readable without JavaScript.
9. If a complete language switch cannot be implemented, generate a single-language site. Do not fake bilingual support with visible `Chinese / English`, duplicated translated headings, or consecutive paragraphs that repeat the same copy in two languages.
10. When the user writes in Chinese or the requirement form says `language: "bilingual"` for a Chinese conversation, the default visible language is Chinese. English UI microcopy such as `Latest essays`, `3 stories`, `one theme`, `read more`, `featured`, `insights`, `journal`, or `collection` is not decorative; it is inactive-language copy and must be translated or moved into i18n storage.

Outputs:

- `i18n/messages.en.json`
- `i18n/messages.zh.json`
- `i18n/README.md` (key naming and contribution flow)

Quality gate:

- Bilingual coverage of critical copy = 100%.
- At any time, the visible page shows exactly one active language. The alternate language may exist only in data/dictionary/template storage until selected.
- Language switch causes no broken routes and no leaked placeholder keys.
- Language switch does not reduce accessibility (`lang`, `aria-label`, readable form labels).

#### Interactive Shell Implementation Contract (Mandatory)

Shared header, navigation, language controls, reusable list modules, and responsive behavior must be implemented as working UI, not visual placeholders.

Navigation requirements:

1. If a mobile menu button toggles a class such as `.is-open`, CSS must include the matching visible state for the controlled nav, for example `.nav.is-open { display: flex; }` or an equivalent layout rule inside the same breakpoint.
2. Menu state must update both DOM visibility and accessibility state: `aria-expanded`, focusability, Escape-to-close, click-outside close, and close-on-link-click on mobile.
3. The visible navigation menu must be exactly one line at every rendered width. Do not allow primary nav links to wrap onto a second row, even at intermediate desktop/tablet widths.
4. If the declared routes do not fit in one line, switch to the mobile/disclosure navigation at a higher breakpoint, reduce link density, shorten labels, or use a compact "More" overflow strategy. The overflow/disclosure trigger counts as the one-line menu; wrapped link rows do not.
5. CSS must enforce this explicitly with rules such as `flex-wrap: nowrap`, `white-space: nowrap`, constrained gaps, overflow handling, and responsive breakpoints. Do not rely on the browser's default flex wrapping behavior.
6. Header height must remain predictable across supported desktop/tablet widths; avoid layouts where nav wrapping unexpectedly increases sticky header height.
7. Active route styling must work after preview URL rewriting and must not rely on raw `/` path matching only.

i18n requirements:

1. An EN/ZH language switch is valid only if it changes visible core copy, not merely `document.documentElement.lang` or button state.
   - A bilingual implementation is invalid if alternate-language copy or switch JavaScript exists but the visible switch control is missing.
2. Every translatable text node in nav, heroes, CTAs, form labels, footer, and major section headings must have a stable i18n key or explicit bilingual data mapping using the exact attributes `data-i18n`, `data-i18n-zh`, and `data-i18n-en`.
   - Corporate-b2b override: prefer stable `data-i18n` keys plus
     `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json`; do not emit
     inline `data-i18n-zh` / `data-i18n-en` values across the final corporate
     HTML unless a route-specific exception is explicitly required.
3. The default language must render without JavaScript. JavaScript may enhance switching by replacing text from an in-page dictionary or generated i18n files.
4. Switching language must preserve the current route, active nav state, form accessibility labels, and persisted language preference.
   - The shared `/script.js` must bind click handlers to the same selector used by the header control, update active/pressed state, update `html[lang]`, and persist preference.
5. If full bilingual content cannot be implemented for the generated site, do not render an EN/ZH switch. Prefer a single-language site over a fake language toggle.
6. Visible bilingual pairs are invalid. Reject patterns such as `Chinese / English`, mixed-language titles in one heading, or two translated versions of the same paragraph shown one after another.
7. Blog/content-backed lists and article/detail pages must follow the same language-state contract. Their card titles, summaries, metadata, and article bodies must switch language instead of rendering both languages together.
8. In a Chinese default render, short technical acronyms like `AI`, `API`, `SEO`, `UI`, and `UX` are allowed, but English editorial/UI words are not. Translate visible labels such as `stories`, `theme`, `latest`, `essay`, `read`, `featured`, `collection`, and `journal`.
9. Article detail pages must not include an English abstract, English summary, or English translated paragraph below a Chinese article body. If bilingual article content is required, the English title/abstract/body belongs in i18n data and becomes visible only after switching to English.
10. Static `/blog/{slug}/index.html` pages for bilingual sites must follow the same rule as runtime pages: exactly one visible language body per render. Do not emit Chinese paragraph followed by its English translation, alternating zh/en paragraphs, bilingual blockquotes, or dual-language body sections on the same initial page.

Component spacing requirements:

1. Reusable row/list components such as news, article, download, result, and case rows must define horizontal padding or an equivalent card/list gutter. Avoid `padding: 16px 0` when the row sits inside a bordered panel.
2. Row layouts must have mobile-specific rules that preserve readable gutters, touch target spacing, and non-overlapping media/meta columns.
3. Any visible card/panel class that defines a border, border-radius, background surface, or box-shadow must also define internal spacing. At minimum, it needs explicit `padding` and either `display: grid; gap: ...`, `display: flex; gap: ...`, or child margin rules. Do not create shell-only classes such as `.about-panel` that only draw an outer border while inner text inherits `margin: 0` and touches the edge.
4. When a component class is added to a shared visual group for `background`, `border`, `border-radius`, or `box-shadow`, it must also be added to the matching spacing/layout group unless that class has its own dedicated padding/gap block.
5. Panel/card content that uses reset selectors such as `.card-title, .card-copy { margin: 0; }` must rely on parent `gap`, not default margins, for vertical rhythm.
6. Blog/content-backed list item classes are direct-runtime surfaces. Their outer card/row class must include enough padding and gap even when the runtime injects only meta, heading, summary, tags, and link nodes without the original fallback wrappers.
7. Shared row classes must be visually tested in at least one dense-content module; if a row appears flush against a panel edge, revise the component before emitting final files.
8. Homepage feature/value/coverage cards shown in a 2-4 column row must be treated as roomy feature cards, not compact badges. Each card needs explicit four-side padding, parent-controlled vertical rhythm (`gap` or equivalent), and a mobile rule that preserves the same gutter feel after stacking.
9. If a feature card uses a large ordinal, step number, watermark, kicker, or badge in a corner, that decorative element must have its own inset and must not consume the content gutter. Titles and body copy must still read from the same padded text column rather than appearing jammed into the card edge.

Quality gate:

- Mobile menu: button click makes the controlled nav visibly open and closable.
- Language switch: clicking EN/ZH changes representative visible copy and keeps the route intact.
- Language exclusivity: before and after switching, screenshots and DOM-visible text show one language only; the inactive language is not visible in headings, cards, paragraphs, nav, footer, or articles.
- Header: the visible navigation menu is one line at 320 / 768 / 1024 / 1280 / 1440 widths. At widths where all links cannot fit, the header must show a one-line disclosure/overflow menu instead of wrapping links.
- List rows: representative dense-list rows have readable left/right gutters on desktop and mobile.
- Cards and panels: every bordered/rounded/shadowed component has visible inner padding and stable vertical spacing between kicker/title/body/actions. No card content may visually touch the border.
- Homepage feature trios: representative 3-up info/value cards keep consistent top/right/bottom/left gutters, and any oversized numeral or badge remains visibly inset from the border instead of crowding the title/body.
- Blog-backed lists: after runtime/snapshot data replacement, article/resource list items keep the same generous gutters, borders, tag spacing, and readable vertical rhythm as the generated fallback cards.

### Phase 2: Section Batch Generation

1. Generate in batches of 3-5 sections.
2. Run design-system consistency checks immediately after each batch.
3. Record progress and design decisions.
4. Run visual QA every 3 sections.
5. For each section requiring a visual image, attempt image generation and placement:
   - If generation succeeds: replace the target placeholder with the generated image.
   - If generation fails: pass without blocking delivery, keep placeholder or style-only fallback.

Quality gate: Design-system compliance rate > 90%.

#### Page Differentiation Contract (Mandatory)

For multi-page websites, every route must be generated from the confirmed Canonical Website Prompt and its own route-specific intent. Shared design tokens, header, footer, navigation, and global CSS/JS are allowed, but the body composition cannot be copied from another page with only text replaced.

Requirements:

1. Generate only the fixed output files declared in the confirmed Canonical Website Prompt.
2. Each HTML page must derive its section sequence, content depth, and interactions from the Canonical Website Prompt, uploaded/source content, and route intent.
3. Any two inner pages must not have the same section class sequence, card type sequence, or primary body layout.
4. Section class names, headings, card types, and interactions must reflect the actual page purpose. Do not force preset industry modules when the source content defines a different site.
5. Navigation links must target only declared routes, and the current page should expose an active state.

If a page cannot be differentiated from another route, stop and revise the route intent or Canonical Website Prompt content before emitting the file.

#### Shared Shell/Footer Contract (Mandatory)

Every HTML page must contain a complete `header`, `main`, and `footer` structure. The footer is part of the shared site shell and must not appear only on the home page.

Footer requirements:

1. Do not reduce inner-page footers to a single copyright line.
2. Include brand summary, primary navigation links, product or solution links, a contact CTA or contact channel, and copyright.
3. Keep footer structure consistent across pages while allowing page-local active states and copy localization.
4. Ensure footer copy participates in bilingual content when EN/ZH support is enabled.
5. Footer navigation with more than 3 links must not use the unstable combination of a narrow right column, `flex-wrap`, `justify-content: flex-end`, and pill-button links. Use a left-aligned link list, balanced two-column text links, a full-width footer nav row, or an intentionally grouped footer sitemap instead.
6. If the footer switches from multi-column to single-column at any breakpoint, footer nav alignment must switch to `flex-start` or a readable grid/list at the same breakpoint. Do not keep right-aligned wrapped footer links in a single-column footer.
7. Pill-style footer links are allowed only when they fit in one intentional row or when each wrapped row remains visually balanced. A final lone right-aligned pill is a footer layout failure.

Missing or degenerate footers are generation failures, not polish issues.

### Phase 3: Visual Refinement

1. Unify visual hierarchy and rhythm.
2. Add micro-interactions and lightweight motion.
3. Alternate backgrounds and visual cadence for pacing.

Quality gate: Visual consistency > 85%.

### Phase 4: Final Validation

1. Breakpoint checks (320 / 768 / 1440).
2. Accessibility checks (WCAG AA).
3. Link and interaction usability checks.
4. Core performance sanity checks.
5. Verify image placement policy:
   - Successfully generated images are correctly inserted and rendered.
   - Failed generation tasks are marked `passed` and treated as non-blocking.
6. Verify Canonical Website Prompt adherence:
   - All fixed output files exist.
   - Every route follows its page-specific intent and confirmed Canonical Website Prompt content.
   - Inner pages are not repeated templates with swapped text.
   - Every HTML page includes the complete shared shell/footer contract.
   - Footer nav with more than 3 links does not render as right-aligned wrapped pills in a narrow column or single-column footer.
   - Route semantics were already validated in preflight, so do not accept a homepage that reads like a downloads portal or certification index.
   - Dense result cards inside 12-column grids retain full-width row spans.

Quality gate: All checks pass.

## Image Generation Integration

### Image Generation Utility

Use the shared `image_gen.py` utility:

```bash
python3 scripts/image_gen.py "your prompt" \
  --aspect_ratio 16:9 \
  --image_size 2K \
  --output project/images \
  --filename hero-main \
  --negative_prompt "text, watermark, low quality"
```

### Environment Configuration

```env
IMAGE_BACKEND=gemini  # or openai, qwen, zhipu, volcengine
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-3.1-flash-image-preview
```

### Supported Backends

- Core: `gemini`, `openai`, `qwen`, `zhipu`, `volcengine`
- Extended: `stability`, `bfl`, `ideogram`
- Experimental: `siliconflow`, `fal`, `replicate`

### Image Types and Suggested Specs

| Type | Suggested Size | Aspect Ratio | Usage |
|------|----------------|--------------|-------|
| Hero Image | 2560x1440 | 16:9 | Above-the-fold visual |
| Section Background | 1920x1080 | 16:9 | Section background |
| Feature Illustration | 800x600 | 4:3 | Feature cards |
| Product Screenshot | 1440x900 | 16:10 | Product showcase |
| Icon/Logo | 512x512 | 1:1 | Symbol assets |
| Social Share | 1200x630 | 1.91:1 | Social sharing preview |

### Prompt Optimization Principles

1. Hero: prioritize visual impact and reserve safe text space.
2. Background: keep contrast low to avoid competing with content.
3. Illustration: keep style consistent, preferably flat and clean.
4. Screenshot-like visuals: preserve realism and clarity.
5. Icon-like visuals: keep simple, scalable, and limited palette.

## Icon Library Integration

### Recommended Library

Primary recommendation: **Lucide Icons**

- Large, high-quality icon set
- Supports React, Vue, and plain HTML usage
- Consistent baseline sizing and stroke style
- Open-source ISC license

Install:

```bash
npm install lucide-react
```

Example:

```jsx
import { Home, User, Settings, Check } from 'lucide-react';

<Home />
<User size={32} color="var(--color-primary)" />
<Settings className="w-6 h-6 text-blue-500" />
```

### Common Icon Categories

- Navigation: Home, Menu, X, ChevronDown, ArrowRight
- Functional: Search, Settings, User, Bell, Mail, Download
- Status: Check, X, AlertCircle, Info, Loader
- Social: Twitter, Facebook, Instagram, Linkedin, Github
- Business: ShoppingCart, CreditCard, TrendingUp, BarChart

### Icon Usage Rules

```jsx
<Icon size={16} />  // small
<Icon size={24} />  // default
<Icon size={48} />  // large

<Icon color="var(--color-primary)" />
<Icon className="text-blue-500" />

<Icon aria-label="Go to homepage" />  // icon-only control
<Icon aria-hidden="true" />           // decorative icon
```

## Integrated Execution Checklist

```markdown
Phase 1.5 checklist:

1. Image asset preparation
   - [ ] Analyze page structure and list required visuals
   - [ ] Produce optimized prompts for each visual
   - [ ] Run image generation
   - [ ] Save outputs to `images/`
   - [ ] Validate style consistency

2. Icon asset preparation
   - [ ] Install/select primary icon library
   - [ ] Map icons by function
   - [ ] Build icon usage manifest
   - [ ] Enforce token-based sizing/color
   - [ ] Add accessibility attributes

3. Quality checks
   - [ ] No watermark or irrelevant artifacts
   - [ ] Image specs match usage requirements
   - [ ] Icon semantics are clear
   - [ ] All images/icons include accessible labeling where needed

4. Image failure policy
   - [ ] If image generation succeeds, replace target placeholder
   - [ ] If image generation fails, mark as `passed` and continue (non-blocking)
```

## Prohibited Practices

- Skipping planning or design-system definition
- Using hardcoded color/spacing values
- Delivering without passing quality gates
- Missing image alt text or equivalent accessibility labeling
- Mixing multiple icon libraries with inconsistent style
- Ignoring responsive image constraints
- Partial bilingual support (must be site-wide for critical copy)
- Hardcoding EN/ZH strings without unified i18n key management
- Starting website generation before Canonical Website Prompt confirmation
- Reusing the same inner-page body template across routes
- Omitting a complete footer on any HTML page
