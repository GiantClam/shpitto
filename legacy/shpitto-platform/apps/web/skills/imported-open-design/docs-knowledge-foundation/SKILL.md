---
name: "docs-knowledge-foundation"
description: |
  Website-only import adapted from Open Design patterns for documentation
  and knowledge-base surfaces. Default primary seed for docs/knowledge
  generation.
triggers:
  - "docs knowledge foundation"
  - "documentation hub"
  - "documentation"
  - "knowledge base"
  - "docs portal"
  - "developer portal"
  - "api reference"
  - "implementation guides"
od:
  mode: website
  platform: responsive
  scenario: docs knowledge
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
    compatible_surface_modes: [docs-knowledge-site]
    compatible_product_baselines: [ai-image-tool-baseline-v1]
    surface_scope: brand-only
---

# Docs Knowledge Foundation

This imported skill is the default website-only primary seed for docs and knowledge surfaces.

Use it as primary guidance:

- route-owned documentation openings
- structured wayfinding
- example-backed layout discipline
- no editorial/archive assumptions
- homepage rhythm: docs workspace masthead -> search/index rail -> quickstart
  strip -> guide stack -> reference matrix -> compact support CTA
- preferred homepage classes: `docs-home`, `docs-workspace`,
  `docs-index-rail`, `docs-search`, `quickstart-strip`, `guide-stack`, and
  `reference-matrix`
- reject generic marketing hero utility geometry even when docs-owned class
  names are present: no `hero`, `hero-wrap`, `hero-grid`, `hero__grid`,
  `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`, `hero__panel`,
  `hero-aside`, `aside`, panel, or right-side visual rail
- avoid generic `hero + cards + CTA`, enterprise proof bands, and content-hub
  archive shelves

Treat this skill as the first structural contract for docs/knowledge surfaces before falling back to generic local website generation guidance.
