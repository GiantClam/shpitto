---
name: "cinematic-launch-template"
description: |
  Website-only import adapted from HTML Anything template discipline for
  cinematic AI/product launch pages with staged demo proof and sharp CTA focus.
triggers:
  - "cinematic launch"
  - "ai launch page"
  - "product launch"
  - "demo landing"
od:
  mode: website
  platform: responsive
  scenario: cinematic launch
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

# Cinematic Launch Template

Use this seed for launch pages that need a stage-like opening, demo framing, and high-aesthetic product proof.
