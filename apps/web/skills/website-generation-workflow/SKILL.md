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

#### Evidence Brief Contract (Mandatory)

When requirement enrichment, uploaded files, domain extraction, or web search produce a `## 7. Evidence Brief`, treat that section as the authoritative source hierarchy for website content focus.

Evidence Brief responsibilities:

1. Preserve `Priority Facts` in the Canonical Website Prompt. These facts define brand semantics, audience, offerings, differentiators, and proof points.
2. Use `Source Priorities` to decide which facts are reliable. Uploaded files, same-domain pages, and explicit user input outrank generic web search. Generic industry research may shape structure and UX, but it must not become brand-owned claims.
3. Use `Page Briefs` to write route-specific page prompts. Each page prompt must include page goal, audience intent, source-backed content inputs, section order, and next action.
4. Use `Gaps And Assumptions` only as internal planning context. Keep unsupported details honest by omitting them from visitor-facing pages or replacing them with neutral contact/download actions. Do not render assumption labels, content-gap labels, source-analysis rationale, missing-content notices, or "待补充" copy in generated HTML.
5. The Evidence Brief is a content strategy artifact, not a route/file manifest. The Prompt Control Manifest remains the only machine-readable route/file handoff.
6. If Evidence Brief content conflicts with generic template defaults, Evidence Brief content wins.

Quality gate: A Canonical Website Prompt generated from researched material must preserve priority facts, page briefs, content gaps, and assumption rules as planning context, while generated website pages must expose only finished visitor-facing copy.

#### Visitor-Facing Copy Contract (Mandatory)

1. Evidence Brief, Page Briefs, source priorities, gaps, assumptions, and prompt control metadata are internal strategy inputs.
2. Generated HTML must never include process phrases such as `内容缺口`, `待补充`, `材料明确`, `材料仅`, `权限说明`, `数据说明`, `合作说明`, `分类导航要帮助用户`, `[Assumption]`, `Content gap`, or `Assumption rule`.
3. If source material lacks a detail, do not explain the gap to visitors. Omit the detail, use a conservative generic CTA, or route the user to contact/download/consultation.
4. Transform source-backed facts into concrete headings, value propositions, cards, comparison rows, process steps, and CTAs. Do not copy analysis notes verbatim.
5. Each route must use a distinct hero composition and section rhythm. Shared header, footer, tokens, and navigation are allowed; repeated hero/body skeletons with swapped text are not.
6. If the Canonical Website Prompt includes a `Source Material Appendix`, treat it as internal generation input for preserving page content depth, not as a visitor-facing section to render.

#### Verified Specifics Guard (Mandatory)

Do not manufacture brand-owned specifics just to make a page look complete.

1. Never invent names of experts, staff, partners, clients, government agencies, institutions, awards, certifications, papers, reports, events, cities, cases, products, or spaces unless they appear in the user request, uploaded source text, Evidence Brief, same-domain crawl, or credible searched source.
2. Never invent certification numbers, standard numbers, publication dates, file sizes, download counts, participant counts, coverage counts, city counts, member counts, prices, addresses, phone numbers, email addresses, or validity periods unless source-backed.
3. If the source asks for a list module but does not provide concrete list items, render the module as a taxonomy, search/filter interface, process, CTA, or source-backed category list. Do not fill it with fictional examples.
4. For certification/search/download/data modules, prefer neutral CTAs like “进入查询系统”, “查看资料库”, “登录后下载”, or “提交申请” over fake rows with made-up identifiers.
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

1. Define default and fallback language (default `en`, support `zh`).
2. Build a unified i18n key structure (page-level + section-level keys).
3. Add language switch in the top navigation (EN / ZH).
4. Ensure all core copy has bilingual mapping (nav, headings, CTA, form labels, footer).
5. Preserve the current route on language switch; only content language changes.
6. Persist language preference (recommended: `localStorage`).
7. Keep default-language content readable without JavaScript.

Outputs:

- `i18n/messages.en.json`
- `i18n/messages.zh.json`
- `i18n/README.md` (key naming and contribution flow)

Quality gate:

- Bilingual coverage of critical copy = 100%.
- Language switch causes no broken routes and no leaked placeholder keys.
- Language switch does not reduce accessibility (`lang`, `aria-label`, readable form labels).

#### Interactive Shell Implementation Contract (Mandatory)

Shared header, navigation, language controls, reusable list modules, and responsive behavior must be implemented as working UI, not visual placeholders.

Navigation requirements:

1. If a mobile menu button toggles a class such as `.is-open`, CSS must include the matching visible state for the controlled nav, for example `.nav.is-open { display: flex; }` or an equivalent layout rule inside the same breakpoint.
2. Menu state must update both DOM visibility and accessibility state: `aria-expanded`, focusability, Escape-to-close, click-outside close, and close-on-link-click on mobile.
3. Desktop navigation must not wrap into unstable multi-line headers at intermediate widths. If the declared routes do not fit, switch to the mobile/disclosure navigation at a higher breakpoint, reduce link density, or use a compact overflow strategy.
4. Header height must remain predictable across supported desktop/tablet widths; avoid layouts where nav wrapping unexpectedly increases sticky header height.
5. Active route styling must work after preview URL rewriting and must not rely on raw `/` path matching only.

i18n requirements:

1. An EN/ZH language switch is valid only if it changes visible core copy, not merely `document.documentElement.lang` or button state.
2. Every translatable text node in nav, heroes, CTAs, form labels, footer, and major section headings must have a stable i18n key or explicit bilingual data mapping.
3. The default language must render without JavaScript. JavaScript may enhance switching by replacing text from an in-page dictionary or generated i18n files.
4. Switching language must preserve the current route, active nav state, form accessibility labels, and persisted language preference.
5. If full bilingual content cannot be implemented for the generated site, do not render an EN/ZH switch. Prefer a single-language site over a fake language toggle.

Component spacing requirements:

1. Reusable row/list components such as news, article, download, result, and case rows must define horizontal padding or an equivalent card/list gutter. Avoid `padding: 16px 0` when the row sits inside a bordered panel.
2. Row layouts must have mobile-specific rules that preserve readable gutters, touch target spacing, and non-overlapping media/meta columns.
3. Shared row classes must be visually tested in at least one dense-content module; if a row appears flush against a panel edge, revise the component before emitting final files.

Quality gate:

- Mobile menu: button click makes the controlled nav visibly open and closable.
- Language switch: clicking EN/ZH changes representative visible copy and keeps the route intact.
- Header: navigation remains one line or intentionally switches to a disclosure menu at 320 / 768 / 1024 / 1280 / 1440 widths.
- List rows: representative dense-list rows have readable left/right gutters on desktop and mobile.

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
