---
name: "ai-image-tool-baseline"
description: |
  Product baseline contract for AI image tool website generation. This baseline
  preserves core product workflow semantics while allowing visitor-facing brand
  and page-layer styling to vary safely.
triggers:
  - "ai image tool baseline"
  - "product baseline"
  - "fluxkreafree baseline"
---

# AI Image Tool Baseline

Use this baseline when the generated website is a productized AI image tool.

The baseline owns:

- product workflow continuity for prompt entry, render execution, result review,
  and history replay
- product route semantics for `/app`, `/history`, `/sign-in`, and `/account`
- stable input/output expectations for prompt-driven image generation
- route ownership boundaries across product, brand, and shared surfaces
- a reusable `fluxkreafree`-derived shared shell with separate marketing nav,
  app nav, footer nav, and legal surfaces
- a reusable `fluxkreafree`-derived design-token layer covering root CSS
  variables, font stacks, radius scale, and auth/code surface notes

The baseline allows mutation only on:

- brand framing
- visitor-facing homepage and marketing routes
- visual direction and route-level presentation modules that do not rewrite
  product workflow semantics

The baseline forbids:

- replacing the product workspace with a brochure-first surface
- removing generation history or replay semantics
- hiding prompt input or render controls behind visitor-facing brand routes
- allowing imported visitor-facing seeds to rewrite product-owned routes unless
  they are explicitly marked `product-ui-safe`

Use this contract together with the runtime ProductBaselineContract selection so
brand/page refinement remains separate from product-surface semantics.

Template extraction rule:

- treat `GiantClam/fluxkreafree` as the canonical upstream template
- extract shared shell and design tokens from the upstream project instead of
  hand-authoring a generic marketing/app shell
- allow downstream customization to swap brand framing and visitor-facing page
  content, but keep the upstream-derived shell ownership and token structure
  stable unless the template contract itself is intentionally revised
