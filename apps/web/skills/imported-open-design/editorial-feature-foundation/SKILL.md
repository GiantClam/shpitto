---
name: "editorial-feature-foundation"
description: |
  Website-only import adapted from Open Design patterns for editorial feature
  homepages and magazine-style portfolio/blog surfaces.
triggers:
  - "editorial feature"
  - "magazine homepage"
  - "feature story"
  - "feature stories"
  - "writing"
  - "blog"
  - "portfolio blog"
od:
  mode: website
  platform: responsive
  scenario: editorial feature
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
    compatible_surface_modes: [portfolio-blog-site, content-hub-site]
---

# Editorial Feature Foundation

Use this seed for magazine-like portfolio/blog or feature-led editorial homepages with a strong lead story and visible reading rhythm.
