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

Institution-led override:

- if the generation contract explicitly declares an official homepage identity, child-friendly institutional tone, or a locked palette such as ecological green `#2E8B57`, do not keep the concrete HTML/CSS template in the archive/terracotta default
- route `/` should become a brand-led institutional homepage with a real image-backed opening and later resource shelves, not a collection-first masthead
- interior routes must keep distinct opening structures that match their role instead of repeating one generic kicker/title/lead/CTA stack
- keep desktop navigation on one row by tightening labels, spacing, or utility width before allowing wrap
- only approved consultation-host routes may include the real form; all other routes should link to that host instead of duplicating the form
- emit reusable spacing classes for cards and proof rows so text never touches borders after runtime hydration

Treat this skill as the default concrete HTML/CSS route-template contract for collection-first content hubs.
