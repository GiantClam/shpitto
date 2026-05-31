---
name: "blog-detail-fill-workflow"
description: "Deferred blog detail generation workflow. Use after the initial site pass to fill blog detail pages, align slugs and URLs, and prepare the site for custom-domain binding."
triggers:
  - "blog detail"
  - "fill blog detail"
  - "generate blog details"
  - "article detail"
  - "post detail"
---

# Blog Detail Fill Workflow

This workflow keeps the main website-generation path small and predictable.

Use it when a generated site already has `/blog/index.html` or another content-backed archive and now needs finished detail pages.

## Scope

- Fill missing `/blog/{slug}/index.html` detail pages.
- Align archive entry topics, slugs, and final detail URLs.
- Refresh article bodies for the deployed blog runtime when needed.
- Mark the project ready for custom-domain binding after detail generation finishes.

## Non-goals

- Do not redesign the whole site.
- Do not regenerate unrelated routes unless shared-shell drift blocks detail quality.
- Do not invent new archive families unless explicitly requested.

## Workflow contract

1. Treat the initial website-generation pass as index-first.
2. Run this workflow after deploy readiness and before custom-domain binding, or when the user explicitly asks to generate blog/article details.
3. Keep slug ownership stable:
   - one topic maps to one canonical `/blog/{slug}/`
   - archive links and detail files must agree on the same slug
   - do not create duplicate slug aliases
4. Preserve the current shared shell:
   - same header, footer, CSS, locale behavior, and script references
5. Generate visitor-facing detail content only:
   - no workflow notes
   - no placeholder process copy
   - no backend/runtime explanations
6. If the site is already deployed, prefer updating the content-backed blog runtime state without forcing a full site regeneration.

## Completion bar

- Each archive item included in this fill pass has a matching stable slug.
- Each matching detail route exists and reads as a finished article or deliberate publishable detail page.
- Project workflow state marks blog detail fill as complete so custom-domain binding can continue.
