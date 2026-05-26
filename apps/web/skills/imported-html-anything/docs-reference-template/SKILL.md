---
name: "docs-reference-template"
description: |
  Website-only staged import adapted from HTML Anything template discipline for
  documentation/reference pages. Keep as sidecar guidance until replay evidence
  proves promotion readiness.
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
    mode: sidecar
    rollout_status: staged
    website_only: true
    ownership_layer: skill
    compatible_surface_modes: [docs-knowledge-site]
---

# Docs Reference Template

This staged imported skill is a website-only sidecar seed for docs/reference pages.

Use it for:

- bounded route openings for guides and reference pages
- source-backed code/reference blocks
- table-of-contents and cross-link structure
- no placeholder examples, fake metrics, or editorial archive assumptions

Do not promote it to default selection until targeted replay evidence proves it improves long-running docs generation.
