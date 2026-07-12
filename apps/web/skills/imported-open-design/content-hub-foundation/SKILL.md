---
name: "content-hub-foundation"
description: |
  Website-only import adapted from Open Design patterns for resource hub,
  standards, research, and information-platform surfaces. Default primary
  seed for content-hub generation.
triggers:
  - "content hub foundation"
  - "resource hub"
  - "content hub"
  - "resource center"
  - "research hub"
  - "standards library"
  - "information platform"
od:
  mode: website
  platform: responsive
  scenario: content hub
  preview:
    type: html
    entry: example.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  activation:
    mode: primary
    rollout_status: active
    website_only: true
    ownership_layer: skill
    compatible_surface_modes: [content-hub-site]
    compatible_product_baselines: [ai-image-tool-baseline-v1]
    surface_scope: brand-only
---

# Content Hub Foundation

This imported skill is the default website-only primary seed for resource and institutional content hubs.

Use it as primary guidance:

- collection-first route openings
- route-owned resource grouping
- shared footer destination completeness
- no forced blog/archive detail pages
- homepage rhythm: editorial archive masthead -> topic/collection shelves ->
  standards or research ledger -> resource index rows -> institutional CTA
- preferred homepage classes: `collection-home`, `archive-masthead`,
  `resource-shelf`, `standards-ledger`, `research-index`, `issue-map`, and
  `institutional-context`
- reject generic marketing hero utility geometry even when collection-owned
  class names are present: no `hero`, `hero-wrap`, `hero-grid`,
  `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`,
  `hero__panel`, `hero-aside`, `aside`, panel, or right-side visual rail
- avoid generic `hero + cards + CTA`, docs workspace chrome, and enterprise
  proof bands
- keep interior-route copy subject-facing; reject page-mechanics lines such as
  `The page groups...`, `This route helps teams...`,
  `This page helps teams compare...`, or
  `How the collection is organized`

Institution-led override:

- if the canonical prompt or `website_design_spec` explicitly locks an official homepage identity, child-friendly institutional tone, or a visual direction such as `institutional-child-friendly`, do not keep the site in the archive/terracotta default
- in that override mode, route `/` should open as a brand-led institutional masthead before any archive shelves or resource ledgers
- route-owned interior pages should follow their declared opening topology (for example process lead, framework grid, scoring band, research proof, or standards library) instead of repeating the same archive masthead shell
- prefer ecological green / bright neutral surfaces when the prompt explicitly locks that palette; do not pull the site back into terracotta archive tokens
- every primary route should carry a real contextual image in the opening band or first proof band
- only the approved consultation-host routes may contain the real consultation form; other routes should link back to that host
- keep the locale switch in a dedicated utility wrapper beside navigation and make it work across every route, not only on the homepage

Treat this skill as the first structural contract for content-hub surfaces before falling back to generic local website generation guidance.
