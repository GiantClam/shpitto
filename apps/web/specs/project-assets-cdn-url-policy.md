# Project Assets CDN URL Policy

## Goal

Generated websites should use stable logical asset paths while Shpitto resolves those paths to Cloudflare R2/CDN URLs for the current lifecycle stage. This keeps generated HTML/CSS/JS independent from R2 bucket layout and still lets assets load from CDN.

## Decision

Use platform-level URL rewriting, not generated-site runtime concatenation.

Generated code writes:

```text
/assets/project/{asset-path}
```

Shpitto rewrites that logical path at the delivery boundary:

- Preview/refine responses are rewritten to the current preview CDN prefix.
- Release bundles are rewritten to the release CDN prefix before Cloudflare Pages upload.

This gives the same CDN performance benefit as a CDN-prefix strategy while keeping generated sites portable and independent from account, bucket, project, and version internals.

## Rejected Alternatives

### Direct CDN URL in generated website code

Example:

```html
<img src="https://s.shpitto.com/project-assets/{owner}/{project}/preview/1.0.3/files/uploads/logo.png" />
```

Rejected because preview URLs contain mutable version state. A later refine or release changes the correct prefix, but the generated HTML would keep pointing at an old preview snapshot.

### Generated website concatenates a CDN prefix

Example:

```js
const assetBase = window.__SHPITTO_ASSET_BASE__;
logo.src = `${assetBase}/uploads/logo.png`;
```

Rejected for the default generated-site contract because it forces runtime bootstrapping into every static site, complicates plain HTML/CSS assets, weakens no-JS rendering, and spreads platform implementation details into generated output.

If a future advanced template needs explicit runtime asset configuration, it should still use `/assets/project/...` as the source-level contract and treat prefix injection as an optimization layer, not as the canonical reference.

## URL Model

Generated website source uses a logical path:

```text
/assets/project/{asset-path}
```

Example:

```html
<img src="/assets/project/uploads/logo.png" alt="Logo" />
```

The platform resolves that logical path by stage:

- **Preview / refine**
  - CDN prefix: `https://s.shpitto.com/project-assets/{owner}/{project}/preview/{version}/files`
  - Logical `/assets/project/uploads/logo.png` becomes:
    `https://s.shpitto.com/project-assets/{owner}/{project}/preview/{version}/files/uploads/logo.png`
  - Cache policy for uploaded/synced preview objects:
    `Cache-Control: no-store, max-age=0`

- **Release**
  - CDN prefix: `https://s.shpitto.com/project-assets/{owner}/{project}/release/current/files`
  - Logical `/assets/project/uploads/logo.png` becomes:
    `https://s.shpitto.com/project-assets/{owner}/{project}/release/current/files/uploads/logo.png`
  - Cache policy for release objects:
    `Cache-Control: public, max-age=300, stale-while-revalidate=86400`

Do not use `immutable` for `release/current` because the key is overwritten on each publish.

## Referenced Assets Contract

Runtime-provided asset references use this shape:

```text
Asset "logo.png" path: uploads/logo.png logical path: /assets/project/uploads/logo.png (version 1.0.3) preview CDN prefix: https://s.shpitto.com/project-assets/.../preview/1.0.3/files release CDN prefix: https://s.shpitto.com/project-assets/.../release/current/files preview URL: https://s.shpitto.com/project-assets/.../preview/1.0.3/files/uploads/logo.png release URL: https://s.shpitto.com/project-assets/.../release/current/files/uploads/logo.png key: project-assets/...
```

Skill rules:

- Use `logical path` in generated website code.
- Do not use `preview URL`, `release URL`, `preview CDN prefix`, `release CDN prefix`, or `key` directly in generated HTML/CSS/JS.
- Do not shorten the path to `uploads/...`, `assets/...`, `images/...`, or directory-only `uploads/`.
- Do not manually construct or edit R2/CDN version segments.

## Runtime Behavior

- Preview route rewrites logical asset paths in served HTML/CSS/JS/JSON/text to the current preview CDN prefix.
- Deploy pipeline publishes the current asset snapshot to `release/current/files` before creating the Pages bundle.
- Deploy pipeline rewrites logical asset paths in the bundle to the release CDN prefix before uploading to Cloudflare Pages.
- Project asset files remain in R2; Pages does not need to bundle them.

## Cache Defaults

Defaults can be overridden via env:

```text
PROJECT_ASSET_PREVIEW_CACHE_CONTROL=no-store, max-age=0
PROJECT_ASSET_RELEASE_CACHE_CONTROL=public, max-age=300, stale-while-revalidate=86400
```
