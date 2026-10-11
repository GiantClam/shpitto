---
name: "precision-catalog-template"
description: |
  Website-only import adapted from HTML Anything template discipline for
  industrial product catalogs, spec comparison, and buyer inquiry routes.
triggers:
  - "product catalog"
  - "products"
  - "catalog"
  - "spec comparison"
  - "manufacturer catalog"
  - "industrial catalog"
od:
  mode: website
  platform: responsive
  scenario: industrial catalog
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
---

# Precision Catalog Template

Use this seed for concrete catalog/spec pages where comparison clarity matters more than storytelling.
