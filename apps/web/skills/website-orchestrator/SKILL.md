---
name: "website-orchestrator"
description: "Top-level website orchestration contract. Use when a website generation task must classify the site type, produce a website design spec, and hand execution to a type-specific website generator."
triggers:
  - "website orchestrator"
  - "corporate website"
  - "company website"
  - "landing page"
  - "portfolio site"
  - "blog site"
---

# Website Orchestrator

This skill does not own page-by-page HTML generation. It owns the upstream contract:

1. Classify the requested website into a stable site type.
2. Produce or refine `website_design_spec`.
3. Hand execution to the matching type-specific website generator skill.

## Mandatory stance

- Prefer source-first planning over runtime repair.
- Keep site-type selection explicit in the workflow context.
- Do not mix corporate, landing, and portfolio/blog homepage archetypes in one generic prompt.
- Treat `website_design_spec` as the primary execution contract for layout, shared shell, media, and route behavior.

## Current first-stage site types

1. `corporate-b2b-site`
2. `marketing-landing-site`
3. `portfolio-blog-site`

## Orchestration rules

### Corporate / B2B

Choose `corporate-b2b-site` when the request or source evidence points to:

- company / corporate / official website
- manufacturer / exporter / supplier / distributor
- enterprise buyers / procurement / sourcing / wholesale
- route sets such as `/products`, `/solutions`, `/cases`, `/about`, `/contact`

### Marketing / Landing

Choose `marketing-landing-site` when the request centers on:

- single product launch
- campaign page
- pricing / signup / conversion-first SaaS page
- minimal route count with one primary CTA

### Portfolio / Blog

Choose `portfolio-blog-site` when the request centers on:

- personal profile
- creator / consultant / resume presence
- portfolio + blog
- writing / insights / articles as first-class content

## Shared output contract

The selected type-specific skill must define:

- homepage archetype
- route-level section rhythm
- nav/footer shell contract
- media planning expectations
- tone and proof rules

The orchestrator must keep those concerns upstream. Runtime should validate or materialize, not redesign.
