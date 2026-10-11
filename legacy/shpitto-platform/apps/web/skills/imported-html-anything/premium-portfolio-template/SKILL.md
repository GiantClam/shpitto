---
name: "premium-portfolio-template"
description: |
  Website-only import adapted from HTML Anything template discipline for
  premium portfolio/showcase sites with project-led openings and quiet luxury.
triggers:
  - "portfolio showcase"
  - "premium portfolio"
  - "creator portfolio"
  - "showcase site"
od:
  mode: website
  platform: responsive
  scenario: portfolio showcase
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
    compatible_surface_modes: [portfolio-blog-site]
---

# Premium Portfolio Template

Use this seed when the site should showcase work with restraint, hierarchy, and project-led differentiation.
