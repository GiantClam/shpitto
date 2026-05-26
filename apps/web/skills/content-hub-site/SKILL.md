---
name: "content-hub-site"
description: "Type-specific generation contract for research, standards, information-platform, resource-library, and institutional content-hub websites."
triggers:
  - "research center"
  - "information platform"
  - "resource hub"
  - "standards system"
  - "downloads"
  - "institutional"
---

# Content Hub Site

Use this skill when the site is a collection-first institutional or resource hub surface: research centers, standards systems, information platforms, policy/resource libraries, or downloads hubs.

## Surface contract

- Treat the site as a content collection surface, not as a product catalog and not as a publishable editorial archive unless the request explicitly asks for blog/news/article behavior.
- Homepage and interior routes should establish collection purpose, resource groupings, and onward navigation.
- Collection routes must remain route-owned. Do not flatten them into one repeated split hero or one generic route shell.

## Visual identity contract

- Content hubs must not share the same visual system as corporate B2B sites or docs/knowledge sites.
- Prefer an editorial/institutional archive, standards library, or research-desk aesthetic with publication-like typography and a paper/ink/terracotta/olive or similarly distinct archive palette.
- Do not default to a generic green-white rounded-card dashboard theme when the surface is a content hub.
- Preferred CSS token family: warm paper background, ink/brown text,
  terracotta primary, archival gold or olive accent, and a serif-forward type
  pairing.
- The dominant composition should use collection shelves, ledger rows, archive grids, research cards, resource indexes, and dense onward navigation.
- Avoid enterprise sales modules and documentation workspace chrome as the dominant content-hub template.

## Route family contract

- `/` must use an editorial/institutional collection-index homepage
  archetype, not the generic marketing homepage rhythm and not docs workspace
  chrome.
- Preferred homepage sequence:
  - editorial archive masthead
  - topic or collection shelves
  - standards or research ledger
  - resource index rows
  - institutional CTA
- Homepage modules should use route-owned collection classes such as
  `collection-home`, `archive-masthead`, `resource-shelf`,
  `standards-ledger`, `research-index`, `issue-map`, and
  `institutional-context`.
- Do not lead the content-hub homepage with only generic `hero`, `hero-grid`,
  `card-grid`, `page-section`, or campaign CTA shells.
- Do not hide generic marketing hero utility geometry behind collection-owned
  class names. A content-hub homepage opening must not be built from `hero`,
  `hero-wrap`, `hero-grid`, `hero__grid`, `hero-copy`, `hero__copy`,
  `hero__body`, `hero-panel`, `hero__panel`, `hero-aside`, an `aside`, panel,
  or right-side visual rail. The masthead, shelves, ledgers, and resource rows
  should create the opening geometry.
- Research, standards, information-platform, downloads, and advocacy/certification support routes should each open with their own route-owned lead band.
- Collection openings should use route-owned collection semantics rather than generic `hero` / `hero-grid` / `aside` shells.
- Resource cards, summary ledgers, index rows, and cross-navigation are the primary building blocks.
- Do not invent `/blog/{slug}/` detail pages, editorial archives, or publishability promises unless the request explicitly demands them.

## Shared shell contract

- Header, nav, and footer must preserve the planned route set across every route.
- Footer should keep all planned destinations, especially collection-first routes such as research, information, standards, downloads, and cases.
- Shared shell copy must stay visitor-facing and institution-facing.
- Do not expose workflow/process/meta text, route-planning rationale, or internal direction labels.

## Copy and media contract

- Copy should explain why the collection exists, how to use it, and where each resource path leads.
- Media should reinforce institutional/research/resource context when available, but should not dominate the experience like a campaign hero.
- Do not drift into product-sales grammar, founder-story framing, or fake long-form editorial filler.
- Do not leak placeholder, assumption, or content-gap wording.
- Do not expose internal layout, responsive-review, or QA labels such as
  `Responsive layout`, `Shared shell`, `Desktop and mobile review`,
  `homepage groups`, `homepage frames`, or `visual system keeps`.
- Rewrite any homepage or section explanation around the hub subject itself:
  standards coverage, research scope, resource categories, evidence quality,
  downloads, or institutional outcomes.
