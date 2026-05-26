---
name: "docs-knowledge-foundation"
description: |
  Website-only staged import adapted from Open Design patterns for documentation
  and knowledge-base surfaces. Keep as sidecar guidance until replay evidence
  proves promotion readiness.
triggers:
  - "docs knowledge foundation"
  - "documentation hub"
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
    mode: sidecar
    rollout_status: staged
    website_only: true
    ownership_layer: skill
    compatible_surface_modes: [docs-knowledge-site]
---

# Docs Knowledge Foundation

This staged imported skill is a website-only seed for docs and knowledge surfaces.

Use it as sidecar guidance only:

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

Do not promote it to default selection until targeted replay evidence proves it improves stability.
