---
name: "industrial-b2b-foundation"
description: |
  Website-only import adapted from Open Design patterns for precision
  manufacturing, procurement-facing product evidence, and industrial trust.
triggers:
  - "industrial b2b"
  - "corporate b2b"
  - "company website"
  - "manufacturer"
  - "factory"
  - "procurement"
  - "supplier"
od:
  mode: website
  platform: responsive
  scenario: corporate b2b
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
    compatible_surface_modes: [corporate-b2b-site]
    compatible_product_baselines: [ai-image-tool-baseline-v1]
    surface_scope: brand-only
---

# Industrial B2B Foundation

Use this seed when the site should read like a procurement-grade manufacturer or industrial supplier homepage.

Primary cues:

- image-backed procurement masthead
- capability bands and evidence-ledgers
- product/spec proof before storytelling
- inquiry and catalog CTA posture, not campaign hype
