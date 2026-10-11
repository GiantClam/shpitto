---
name: "design-website-generator"
version: "2.0.0"
author: "shpitto-tools"
license: "MIT"
description: |
  Website generation skill built on top of the awesome-design-md design library.
  This skill uses sequential page generation so design language, terminology,
  and navigation stay coherent across the whole site.

  Core value:
  - SKILL defines workflow, standards, and selection logic
  - TypeScript provides execution tools, loaders, and validators
  - Sequential generation preserves cross-page coherence

  Trigger conditions:
  - The user asks to create a website
  - The user asks to reference an existing website style
  - The user asks to use an existing design system
---

# Design Website Generator Skill

## Responsibility Boundary (Authoritative)

- This skill is the execution skill for website generation.
- It loads design context, builds page prompts, enforces source contracts, and
  coordinates QA checks.
- It must not become the top-level workflow orchestrator when
  `website-generation-workflow` is active.
- `website-generation-workflow` owns phase orchestration, enrichment, and
  cross-phase gates. This skill executes already-scoped generation work.

## Core Philosophy

**The skill defines the contract. TypeScript executes the contract.**

| Responsibility | SKILL.md | TypeScript tools |
| --- | --- | --- |
| Workflow definition | Full owner | Not the source of truth |
| Selection criteria | Full owner | Execution only |
| Confirmation flow | Full owner | Support only |
| Design standards | Full owner | Validation only |
| Loader behavior | Documented contract | `loadDesignSystem()` |
| LLM execution | Prompt contract | `executeLLM()` |
| Preview generation | Output requirements | `renderPreview()` |

## Sequential Page Generation Workflow

Sequential generation is mandatory for multi-page websites when terminology,
design tokens, and navigation must remain coherent.

### Core idea

1. Generate the homepage first so it establishes:
   - brand tone
   - terminology
   - token usage
   - route hierarchy
2. Carry that context into each later page.
3. Let sections within the same page run in parallel only after the page-level
   context is defined.
4. Run page-level and site-level QA before finalizing artifacts.

### Why sequential generation

| Parallel generation problem | Sequential generation advantage |
| --- | --- |
| Terminology drifts across pages | Later pages inherit approved terms |
| Token usage becomes inconsistent | Later pages reuse the same token logic |
| Navigation structure conflicts | The route chain grows from earlier pages |
| Rework rate is high | Rework rate drops after context inheritance |

## Phase 1: Design System Selection

### 1.1 Selection Criteria (owned by the skill)

Choose the design system using the following dimensions:

1. Industry fit
   - AI / ML products -> Claude, Cohere, Replicate
   - Developer tools -> Vercel, Linear, Cursor
   - Finance / crypto -> Coinbase, Kraken, Stripe
   - Ecommerce / SaaS -> Shopify, Stripe, Notion
2. Design tone
   - Dark-first -> Claude, Linear, Vercel
   - Light-first -> Notion, Figma, Airbnb
   - High contrast -> Apple, Tesla, NVIDIA
3. Complexity fit
   - Simple landing page -> Framer, Webflow
   - Corporate multi-page site -> Vercel, Stripe, IBM
   - Complex multi-page content system -> Figma, Notion, Linear
4. Content mix
   - Text-led -> Notion, Linear
   - Image-led -> Pinterest, Unsplash-inspired directions
   - Data-led -> Stripe, Vercel

### 1.2 Selection Workflow

1. Analyze the user brief
   - extract industry, product type, audience, and missing information
2. Generate the top design-system candidates
   - use the selection criteria above
3. Confirm direction
   - show brand + key visual traits
   - record explicit user overrides
4. Initialize the design spec
   - load the chosen `DESIGN.md`
   - resolve colors, typography, shadows, layout, and component tone

### 1.3 TypeScript Tool Responsibilities

```ts
interface DesignSystemLoader {
  loadDesignSystem(brand: string): Promise<DesignSystem>;
  listBrands(category?: string): Promise<BrandInfo[]>;
  getDesignSummary(system: DesignSystem): string;
}
```

## Phase 2: Design Confirmation

### 2.1 Confirmation Items (8 required checks)

| Item | What must be confirmed | Example validator |
| --- | --- | --- |
| Primary color | CTA / action color | `validateColor(primary)` |
| Accent color | Hover / link emphasis | `validateColor(accent)` |
| Neutral palette | Background / border system | `validateColor(neutral)` |
| Typography | Families and hierarchy | `validateTypography()` |
| Shadow tokens | Shadow-as-border strategy | `validateShadow()` |
| Spacing scale | Base spacing rhythm | `validateSpacing()` |
| Border radius | Rounding scale | `validateBorderRadius()` |
| Component style | Button, card, input language | `validateComponents()` |

### 2.2 Confirmation Workflow

1. Show the resolved design spec.
2. Let the user confirm or adjust any of the eight items.
3. Merge confirmed values with explicit overrides.
4. Produce `design_context` for generation.

## Phase 3: Sequential Page Generation

### 3.0 Opening Topology Matrix (Mandatory)

Do not let every interior route inherit the same full marketing hero.
The shell may stay shared, but the first visible module after the header must
match the job of the route.

Required opening patterns:

- `Homepage`
  - May use a full brand hero.
  - Must establish company positioning, buyer relevance, and the primary
    business path.
- `Products`
  - Start with a catalog lead, assortment map, comparison frame, or buyer
    decision aid.
  - Do not reuse a homepage-style billboard hero.
- `Custom Solutions`
  - Start with scenario fit, process, delivery model, or collaboration logic.
- `Cases`
  - Start with evidence, scenario/outcome framing, or a case ledger.
- `Contact`
  - Start form-first or channel-first.
- `About`
  - Start with company identity, operating model, proof, or trust posture.

Hard bans:

- No repeated `hero + side card/panel + generic grid` opening across products,
  solutions, cases, contact, and about.
- No locale/language explainer section inside route bodies.
- No menu-like utility blocks disguised as content.
- No personal-blog/editorial-note opening on company routes unless the brief
  explicitly requests it.

### 3.0.25 Corporate-B2B Homepage Execution Contract (Mandatory for company / manufacturer / enterprise-buyer sites)

- Treat the corporate-b2b homepage structure as generic. IBM/Carbon may be a
  visual override, but it does not own the structural rules.
- The homepage must read as an enterprise company homepage, not a lifestyle
  landing page or personal site.
- Default opening sequence:
  - image-backed enterprise hero
  - proof / procurement-value strip
  - capability band
  - enterprise CTA band
- The first visible homepage section must be a single image-backed enterprise
  hero, not a split hero.
- The opening hero must not contain:
  - an `aside` rail
  - a detached side card
  - a visual rail
  - a side media card
  - a founder-profile cadence
  - floating stat cards
- The opening hero must contain a real `<img>` or `<picture>` inside
  `enterprise-hero__media` when stock/library imagery is available.
- Do not fake the hero visual with text-only pseudo-media such as
  `enterprise-hero-visual`, `visual-content`, `visual-note`, or `media-panel`.
- Use the route design spec asset fields when provided.
- The hero must not render as `copy on the left + empty box on the right`.
- Required homepage class family:
  - `enterprise-hero`
  - `enterprise-hero__media`
  - `enterprise-hero__content`
  - optional `enterprise-hero__actions`
  - optional `enterprise-proof-row`
- The hero content must overlay the image rather than live in a detached card.
- Keep the hero close to the shared header. Do not create a large blank gap by
  stacking header padding and first-section padding.
- Use breathable corporate spacing:
  - 20-36px shell transition below header
  - 40-72px major section rhythm
  - 28-44px comfortable spacing inside proof rows, capability grids, and CTA
    bands
- The next capability band must not become a second hero.
- Locale controls must live in a dedicated utility wrapper adjacent to nav.
- Do not put locale buttons inside `<nav>` and then leave an empty utility
  wrapper beside it.
- CTA bands must stay class-owned. Avoid ad-hoc inline spacing styles.

### 3.0.5 Company Theme Interpretation (Mandatory)

For `company` websites aimed at enterprise buyers, procurement teams,
distributors, or export customers:

- The output must read as a company website first, not a personal site,
  boutique editorial page, or founder essay surface.
- If the direction includes `heritage`, `craft`, or `warm`, reinterpret those
  cues as restrained material confidence inside a B2B company shell.
- Capability, proof, product clarity, process reliability, and inquiry
  readiness outrank atmosphere.
- Warmth may affect palette and texture, but it must not dominate the site
  structure.
- Do not surface direction labels such as `heritage`, `craft`, `warm`, or
  `artisan` in visible copy unless the source material explicitly uses them.
- Rewrite visible copy toward export readiness, sourcing clarity, manufacturing
  capability, proof, delivery discipline, and inquiry readiness.

### 3.0.7 Image Usage For Company/Product Sites (Mandatory)

- Prefer selective real-photo support over purely typographic pages when
  products, materials, specs, or sourcing use cases are central to
  understanding.
- Prefer stock/library retrieval before AI illustration.
- Homepage must contain at least one meaningful company/product/context image.
- On an enterprise homepage, the first meaningful image should normally belong
  to the opening hero itself.
- `.enterprise-hero__media` acts as the shared hero background/support layer.
- `.enterprise-hero__content` remains the readable overlay text layer.
- Do not give `.enterprise-hero__content` an opaque card background or another
  treatment that visually splits the hero into two sibling surfaces.
- Products pages should use assortment, specification, texture, or material
  support imagery.
- About and custom-solutions pages should use company, process, material, or
  production-proof imagery rather than lifestyle collage.
- Keep the site disciplined: enough imagery to avoid a text prototype, but not
  so much that the site becomes a gallery.
- Each image must belong to a deliberate module with a defined ratio and job.
- Final visible media and layout blocks should be class-owned, not inline-style
  owned.
- Visible copy, placeholders, and CTA labels must be free of mojibake or
  encoding-corrupted punctuation.

### 3.0.8 Industry-Neutral Company Visual Rule (Mandatory)

The generic company generator must not encode one specific product vertical as
its default visual grammar.

- Do not hardcode towels, home textiles, hospitality, pool/beach scenes, or
  any other sector-specific palette/image bundle into the generic company flow.
- Choose palette, media, and surface tone from the confirmed prompt, source
  material, and selected visual direction.
- Real stock/library imagery may still outrank synthetic illustration, but the
  subject matter must be justified by the source material rather than by a
  hidden vertical preset.

### 3.0.6 Text Wordmark Handling (Mandatory)

When the brief indicates `Text wordmark` or `text_mark`:

- Render the company name as text-only branding by default.
- Do not fabricate a monogram, badge, crest, or icon chip unless source-backed.
- Do not invent a brand subtitle or slogan unless source-backed.
- Do not emit empty decorative brand-mark placeholders.
- Do not tell visitors that the site is using a text wordmark.

### 3.1 Page Generation Order

Generate pages in order so each page inherits approved context:

| Order | Page type | Purpose | Context required |
| --- | --- | --- | --- |
| 1 | Homepage | Establish brand and navigation | `design_context` |
| 2 | Features / Products | Expand the offer | `homepage_context` |
| 3 | Pricing / Solutions | Clarify conversion path | previous page context |
| 4 | About | Build trust | all earlier context |
| 5 | Contact | Drive action | all earlier context |

### 3.2 Page Context Structure

```ts
interface PageContext {
  pageName: string;
  generatedAt: string;
  contentSummary: {
    headings: string[];
    keyTerms: string[];
    featureList: string[];
    pricingTiers?: string[];
  };
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

### 3.3 Intra-Page Section Generation

- Page-level context is sequential.
- Section-level generation inside the same page may run in parallel with a
  bounded concurrency level, typically `3`.
- Hero/opening sections should be planned first so later sections inherit the
  correct terminology and media plan.

### 3.4 TypeScript Tool Responsibilities

```ts
interface PageGenerator {
  generatePage(
    pageOrder: number,
    pageType: string,
    designContext: DesignContext,
    previousPageContext?: PageContext
  ): Promise<PageResult>;

  generateSection(
    sectionType: string,
    pageContext: PageContext,
    designSpec: DesignSpec
  ): Promise<SectionResult>;
}

interface LLMTool {
  executePrompt(prompt: string, systemContext: string): Promise<LLMResponse>;
}
```

## Phase 4: Visual QA Gate

### 4.1 QA Checkpoints

Every generated page must pass:

| Checkpoint | Timing | TypeScript validator | Skill standard |
| --- | --- | --- | --- |
| Color compliance | Per section | Yes | `rules/design-color-compliance.md` |
| Typography hierarchy | Per section | Yes | `rules/design-typography-hierarchy.md` |
| Shadow technique | Per section | Yes | `rules/design-shadow-technique.md` |
| Spacing and grid | Per section | Yes | `rules/design-spacing-grid.md` |
| Accessibility | Per section | Yes | `rules/design-accessibility.md` |

### 4.2 Page-Level QA

After each page:

1. Run design QA.
2. Verify color, typography, shadow, spacing, and accessibility rules.
3. Verify terminology coherence against previous pages.
4. Repair up to two times if the page fails.

### 4.3 Site-Level QA

After all pages:

1. Compare headings and terminology across pages.
2. Verify internal links.
3. Verify cross-page token usage and shell coherence.

## Core Principles

1. The skill defines workflow, standards, and selection logic.
2. TypeScript executes and validates the agreed contract.
3. Sequential page generation protects coherence.
4. Design rules under `rules/` remain the final compliance source.
5. QA gates are mandatory.

## Success Metrics

| Metric | Target | Meaning |
| --- | --- | --- |
| Design compliance | >= 90% | QA pass rate |
| Content coherence | >= 95% | Cross-page term consistency |
| Revision rate | < 20% | Pages requiring major rework |
| Generation speed | < 2 min / page | Average generation time |

## Design Compliance Rules

Generated components must follow:

| Rule | File | Scope |
| --- | --- | --- |
| Color compliance | `rules/design-color-compliance.md` | Primary/accent/neutral/semantic color use |
| Typography hierarchy | `rules/design-typography-hierarchy.md` | Font family, size, weight, line height |
| Shadow technique | `rules/design-shadow-technique.md` | Shadow-as-border usage |
| Spacing grid | `rules/design-spacing-grid.md` | Spacing system and max width |
| Accessibility | `rules/design-accessibility.md` | WCAG AA expectations |

## References

| Type | Path | Purpose |
| --- | --- | --- |
| Workflow details | `prompts/sequential-workflow.md` | Step-by-step sequential generation |
| Selection criteria | `prompts/selection-criteria.md` | Design-system selection policy |
| Command reference | `references/command-reference.md` | Tool and command notes |
| Troubleshooting | `references/troubleshooting.md` | Common issues |
| Design system structure | `references/design-system-structure.md` | `DESIGN.md` interpretation |

## Available Design Systems (58+)

| Category | Brands |
| --- | --- |
| AI and ML | Claude, Cohere, ElevenLabs, Minimax, Mistral AI, Ollama, OpenCode AI, Replicate, RunwayML, Together AI, VoltAgent, x.ai |
| Developer tools | Cursor, Expo, Linear, Lovable, Mintlify, PostHog, Raycast, Resend, Sentry, Supabase, Superhuman, Vercel, Warp, Zapier |
| Infrastructure | ClickHouse, Composio, HashiCorp, MongoDB, Sanity, Stripe |
| Design and productivity | Airtable, Cal.com, Clay, Figma, Framer, Intercom, Miro, Notion, Pinterest, Webflow |
| Fintech | Coinbase, Kraken, Revolut, Wise |
| Enterprise | Airbnb, Apple, IBM, NVIDIA, SpaceX, Spotify, Uber |
| Automotive | BMW, Ferrari, Lamborghini, Renault, Tesla |

## Magic UI Components

Use only when they support the brief and the chosen visual system:

| Category | Components |
| --- | --- |
| Animation | AnimatedBeam, Marquee, NumberTicker, TextReveal |
| Effect | BorderBeam, GlowCard, GradientText, Particles |
| Interactive | Carousel, ComparisonSlider, Magnifier, SceneSwitcher |
| Layout | BentoCard, BentoGrid |

---

Last updated: 2026-05-22
Version: 2.0.0
