---
name: "bold-marketing-foundation"
description: |
  Website-only import adapted from Open Design patterns for bold marketing
  landings with strong motionless tension, proof cadence, and one decisive CTA.
triggers:
  - "marketing landing"
  - "campaign page"
  - "landing page"
  - "product launch"
od:
  mode: website
  platform: responsive
  scenario: marketing landing
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
    compatible_surface_modes: [marketing-landing-site]
---

# Bold Marketing Foundation

Use this seed for high-contrast, conversion-first landings with a memorable opening and a disciplined CTA budget.
