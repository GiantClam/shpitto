---
name: "content-resource-template"
description: |
  Website-only staged import adapted from HTML Anything template discipline for
  resource hubs and information-platform routes.
triggers:
  - "resource hub template"
  - "information platform"
  - "downloads hub"
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
    mode: sidecar
    rollout_status: staged
    website_only: true
    ownership_layer: skill
    compatible_surface_modes: [content-hub-site]
---

# Content Resource Template

This staged imported skill is a website-only sidecar seed for collection-first content hubs.

Use it for:

- route-owned collection openings
- resource cards and download ledgers
- research/standards/information navigation
- no fake article archives or placeholder resource rows

Do not promote it to default selection until targeted replay evidence proves it improves long-running content-hub generation.
