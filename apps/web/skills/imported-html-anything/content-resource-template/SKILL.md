---
name: "content-resource-template"
description: |
  Website-only import adapted from HTML Anything template discipline for
  resource hubs and information-platform routes.
triggers:
  - "resource hub template"
  - "information platform"
  - "downloads hub"
  - "resource hub"
  - "research hub"
  - "standards"
  - "resources"
od:
  mode: website
  platform: responsive
  scenario: content resource
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
---

# Content Resource Template

This imported skill is the default website-only primary template seed for collection-first content hubs.

Use it for:

- route-owned collection openings
- resource cards and download ledgers
- research/standards/information navigation
- no fake article archives or placeholder resource rows

Treat this skill as the default concrete HTML/CSS route-template contract for collection-first content hubs.
