---
name: website-refinement-workflow
description: Transform natural-language visual refinement requests into concrete edits for an existing static website. Use when users want to fine-tune an already generated or deployed website without rebuilding it, especially for visual polish, hierarchy, spacing, typography, color, content removal, or targeted UI behavior updates tied to current HTML/CSS/JS.
---

# Website Refinement Workflow

## Overview
Apply targeted refinements to an existing static website by returning deterministic full-file edits.
Preserve existing routes and structure unless the user explicitly requests a structural change.

## Workflow

### 1) Inspect Baseline
- Read all available baseline files and keep their existing paths.
- Treat the current project as the source of truth; do not invent missing pages.

### 2) Translate Intent to Code Changes
- Convert visual requests into explicit layout, spacing, typography, color, and component-level edits.
- Convert deletion requests into real removals of matching nodes, text, and related hooks.
- Keep changes minimal and local to the requested scope.

### 2.5) Referenced Asset Handling
- If the user request contains a `[Referenced Assets]` block, treat each listed asset as an external project asset with an authoritative `logical path`.
- When any referenced asset is used in the website, use the exact provided `logical path` in `src`, `href`, `srcset`, `poster`, CSS `url(...)`, JavaScript string references, JSON metadata, or downloadable links.
- Do not shorten referenced assets to relative paths such as `uploads/...`, `assets/...`, `images/...`, `./uploads/...`, or directory-only values like `uploads/`.
- Do not use `preview URL`, `release URL`, `preview CDN prefix`, `release CDN prefix`, or `key` directly in generated website code. Those values are runtime resolver metadata only.
- Do not manually construct or edit `preview/{version}` or `release/current` URL segments. The platform rewrites logical paths to stage-specific CDN URLs.
- Apply this rule to all file types and asset categories, not only logos, icons, or images.
- If multiple assets are listed, use the logical path that belongs to the matching asset line by name/path and leave unrelated references unchanged.
- Before returning edits, inspect every changed file and verify that newly introduced references to listed assets use the `logical path`, not a local workspace path or a CDN URL.

### 3) Produce Strict JSON Output
Return JSON only using this schema:

```json
{
  "summary": "short summary of applied changes",
  "edits": [
    {
      "path": "/index.html",
      "content": "<full updated file content>",
      "reason": "what changed and why"
    }
  ]
}
```

## Output Rules
- Use existing file paths only.
- Return full file content in each `edits[].content` field.
- Include only files that actually changed.
- Keep HTML, CSS, and JS valid and runnable.
- Preserve exact referenced asset logical paths when editing asset references.
- Never wrap JSON in markdown fences.

## Change Quality Rules
- Make user-visible changes when the request is visual.
- Avoid no-op edits such as comment-only changes.
- Keep semantic HTML and accessible structure intact when editing sections and controls.
- If removing nav/menu triggers, also update related JS selectors and handlers as needed.

## Safety Rules
- Do not add new routes unless explicitly requested.
- Do not remove core shared imports required for rendering.
- Do not rewrite unrelated files.

## Completion Criteria
- Preview should show the requested change clearly.
- Referenced assets should use their provided logical paths so the platform can rewrite them to the correct CDN prefix.
- Edited files should be minimal and directly explainable by the request.
- The summary should match the actual edits.
