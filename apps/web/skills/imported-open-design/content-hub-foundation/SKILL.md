---
name: "content-hub-foundation"
description: |
  Website-only staged import adapted from Open Design patterns for resource hub,
  standards, research, and information-platform surfaces. Keep as sidecar
  guidance until replay evidence proves promotion readiness.
triggers:
  - "content hub foundation"
  - "resource hub"
od:
  mode: website
  platform: responsive
  scenario: content hub
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

# Content Hub Foundation

This staged imported skill is a website-only seed for resource and institutional content hubs.

Use it as sidecar guidance only:

- collection-first route openings
- route-owned resource grouping
- shared footer destination completeness
- no forced blog/archive detail pages
- homepage rhythm: editorial archive masthead -> topic/collection shelves ->
  standards or research ledger -> resource index rows -> institutional CTA
- preferred homepage classes: `collection-home`, `archive-masthead`,
  `resource-shelf`, `standards-ledger`, `research-index`, `issue-map`, and
  `institutional-context`
- reject generic marketing hero utility geometry even when collection-owned
  class names are present: no `hero`, `hero-wrap`, `hero-grid`,
  `hero__grid`, `hero-copy`, `hero__copy`, `hero__body`, `hero-panel`,
  `hero__panel`, `hero-aside`, `aside`, panel, or right-side visual rail
- avoid generic `hero + cards + CTA`, docs workspace chrome, and enterprise
  proof bands

Do not promote it to default selection until targeted replay evidence proves it improves stability.
