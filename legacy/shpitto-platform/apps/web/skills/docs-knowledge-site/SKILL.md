---
name: "docs-knowledge-site"
description: "Type-specific generation contract for documentation, reference, handbook, and knowledge-base websites."
triggers:
  - "documentation"
  - "docs"
  - "knowledge base"
  - "developer portal"
  - "api reference"
  - "handbook"
  - "playbook"
---

# Docs Knowledge Site

Use this skill when the site is a documentation-oriented surface: product docs, developer references, implementation guides, handbooks, onboarding playbooks, FAQs, or knowledge bases.

## Surface contract

- Treat the site as a bounded website surface, not as a generic landing page and not as a blog archive by default.
- Homepage may be present, but it should establish terminology, wayfinding, and document hierarchy rather than behaving like a campaign hero.
- Interior routes should feel like reference or guide destinations with route-owned openings, sectional navigation, and stable findability.
- Do not invent publishable blog/article detail pages unless the request explicitly asks for editorial publishing.

## Visual identity contract

- Docs/knowledge sites must not share the same visual system as corporate B2B sites or content hubs.
- Prefer a documentation/reference workspace aesthetic with paper/ink/slate/cobalt/teal or another developer-documentation palette, monospaced accents, compact hierarchy, and strong wayfinding.
- Do not default to a generic green-white rounded-card dashboard theme when the surface is docs or knowledge.
- Preferred CSS token family: paper or cool-neutral background, ink/slate text,
  cobalt primary, teal technical accent, and a clear monospaced accent stack.
- The dominant composition should use docs wayfinding, document-family indexes, reference cards, code/reference panels, TOC/search cues, and narrow readable measures.
- Avoid enterprise product proof bands, campaign mastheads, and editorial archive shelves as the dominant docs template.

## Route family contract

- `/` should act as a docs or knowledge homepage:
  - orient the visitor
  - expose the main document families
  - point to the most important next paths
- `/` must use a docs workspace/reference-index archetype, not the generic
  marketing homepage rhythm.
- Preferred homepage sequence:
  - docs workspace masthead
  - search or index rail
  - quickstart strip
  - guide stack
  - reference matrix
  - compact support CTA
- Homepage modules should use route-owned docs classes such as `docs-home`,
  `docs-workspace`, `docs-index-rail`, `docs-search`, `quickstart-strip`,
  `guide-stack`, and `reference-matrix`.
- Do not lead the docs homepage with only generic `hero`, `hero-grid`,
  `card-grid`, `page-section`, or campaign CTA shells.
- Do not hide generic marketing hero utility geometry behind docs-owned class
  names. A docs homepage opening must not be built from `hero`, `hero-wrap`,
  `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`,
  `hero-panel`, `hero__panel`, `hero-aside`, an `aside`, panel, or right-side
  visual rail. Search, index rail, quickstart, guide, and reference structures
  should form the visible opening geometry.
- Guide/reference routes should open with route-owned lead bands such as:
  - documentation lead
  - guide header
  - handbook intro
  - reference overview
- Do not repeat a generic split hero across sibling routes.
- Prefer compact structural navigation, table-of-contents cues, document grouping, and cross-links over marketing proof rows.

## Shared shell contract

- Navigation, breadcrumbs, footer destinations, and terminology must stay consistent across all routes.
- Shared shell copy must remain visitor-facing and documentation-facing.
- Do not expose implementation notes, Prompt Control Manifest text, workflow labels, or design-direction metadata.
- Footer must keep the planned destinations; do not collapse docs/hub interiors into a one-line legal footer.

## Copy and interaction contract

- Copy should be precise, operational, and instructional for visitors.
- Avoid empty CTA rhetoric, conversion-first hype, and generic enterprise promise stacks.
- Search/filter/download controls are allowed when source-backed, but they must not become fake UI shells or placeholder mechanics.
- Do not leak placeholder text, TODO labels, sample-data hints, or workflow/process/meta copy.
- Do not expose internal layout, responsive-review, or QA labels such as
  `Responsive layout`, `Shared shell`, `Desktop and mobile review`,
  `homepage groups`, `homepage frames`, or `visual system keeps`.
- Rewrite any homepage or section explanation around the docs subject itself:
  reference areas, API behavior, implementation guidance, version policy,
  examples, or visitor outcomes.
