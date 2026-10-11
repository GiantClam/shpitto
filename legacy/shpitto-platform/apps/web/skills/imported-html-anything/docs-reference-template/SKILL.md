---
name: "docs-reference-template"
description: |
  Website-only import adapted from HTML Anything template discipline for
  documentation/reference pages. Default primary template discipline for docs
  and reference routes.
triggers:
  - "docs reference template"
  - "api reference"
  - "implementation guide"
od:
  mode: website
  platform: responsive
  scenario: docs reference
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

# Docs Reference Template

This imported skill is the default website-only primary template seed for docs/reference pages.

Use it for:

- bounded route openings for guides and reference pages
- source-backed code/reference blocks
- table-of-contents and cross-link structure
- no placeholder examples, fake metrics, or editorial archive assumptions

Treat this skill as the default concrete HTML/CSS route-template contract for docs/reference pages.
