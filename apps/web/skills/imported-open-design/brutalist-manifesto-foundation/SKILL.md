---
name: "brutalist-manifesto-foundation"
description: |
  Website-only import adapted from Open Design patterns for manifesto-like
  landings with sharp contrast, oversized type, and asymmetrical proof.
triggers:
  - "brutalist manifesto"
  - "manifesto landing"
  - "experimental landing"
  - "statement page"
od:
  mode: website
  platform: responsive
  scenario: brutalist manifesto
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
    compatible_surface_modes: [marketing-landing-site, portfolio-blog-site]
    compatible_product_baselines: [ai-image-tool-baseline-v1]
    surface_scope: brand-only
---

# Brutalist Manifesto Foundation

Use this seed when the page should feel authored, stark, and intentionally anti-generic.
