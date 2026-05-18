# Findings: Payload CMS Evaluation For Shpitto

## Current Workspace Findings
- `shpitto` is a pnpm monorepo centered on `apps/web` (Next.js 16), with shared schema and db packages plus Cloudflare worker/router pieces.
- The app already uses Supabase, Cloudflare services, LangChain/LangGraph, and custom generation/editor flows.
- The existing root planning files previously tracked a billing task and were reset for this Payload research effort.
- `shpitto` already has a substantial first-party blog/content system rather than a missing CMS hole:
  - project data workspace exposes a `blog` tab via `ProjectDataWorkspace`
  - editing uses Milkdown (`BlogMilkdownEditor`) over Markdown as source of truth
  - persistence uses D1 tables such as `shpitto_blog_posts`, `shpitto_blog_post_revisions`, `shpitto_blog_assets`, and `shpitto_blog_settings`
  - public delivery uses server-rendered Next.js blog pages and deployment-time snapshot/runtime support
- `shpitto` also already has a page-structure/editor contract around Puck-compatible project JSON in `packages/schema`, so Payload's layout-builder / blocks capabilities would overlap with an existing generation/rendering protocol instead of landing in a greenfield area.
- The runtime/storage model is mixed:
  - auth and some operational state use Supabase
  - blog/content and several project artifacts are intentionally built on Cloudflare D1 + R2
  - blog routes explicitly run in `nodejs` runtime, but storage logic is written around Cloudflare APIs rather than a local SQL driver
- Architectural implication: Payload would not be filling an empty slot. It would overlap with an existing content subsystem and introduce a second content platform unless kept very tightly bounded.

## Evaluation Questions
- Does Shpitto currently need a full CMS/admin platform, or only selective capabilities such as media, content models, drafts, versioning, or editorial workflows?
- Would Payload strengthen Shpitto's product surface, or create a second application platform beside the existing Next.js + Supabase + Cloudflare stack?
- If integrated, what is the narrowest useful boundary that avoids rewriting working systems?

## Open Questions
- How much of Shpitto's current editable content lives in code, ad hoc database tables, generated JSON, or the Puck editor?
- Whether Shpitto intends to ship a blog, template marketplace, reusable content catalog, or customer-managed headless content API.
- Whether the deployment target for the main app can comfortably support Payload's Node/Postgres-oriented runtime model.

## Key Local Evidence
- `apps/web/components/chat/ProjectDataWorkspace.tsx` mounts `ProjectBlogWorkspace` as a first-class workspace tab.
- `apps/web/components/chat/ProjectBlogWorkspace.tsx` already supports draft creation, publish/unpublish flow, taxonomy confirmation, theme/layout metadata, cover upload, and asset management.
- `apps/web/components/chat/BlogMilkdownEditor.tsx` provides rich editing plus image upload callbacks.
- `apps/web/lib/blog.ts` implements validation, taxonomy inference, revisions, asset upload, D1 persistence, R2 media, scheduled publish, and public blog retrieval.
- `apps/web/lib/d1.ts` auto-creates and evolves the project schema, including multiple blog tables on Cloudflare D1.
- `apps/web/app/blog/page.tsx` and `apps/web/app/blog/[slug]/page.tsx` already expose SSR public blog pages with metadata.
- `packages/schema/src/project-schema.ts` defines Puck-compatible page/component data, indicating that Shpitto already owns a structured page composition model.

## Payload Official Findings
- Payload is now a Next.js-native fullstack CMS/app framework that installs into an existing App Router app and can colocate admin, REST/GraphQL routes, and frontend in one codebase.
- Official integration shape for existing apps:
  - add `payload` and `@payloadcms/next`
  - add a database adapter
  - add the generated `(payload)` route group into the app tree
  - wrap Next config with `withPayload`
- Payload's strongest differentiators relative to Shpitto's current custom blog system are:
  - rich admin UI generation from schema
  - versions, drafts, autosave, diff/restore
  - granular access control across collection/global/field levels
  - field-level localization
  - built-in auth-enabled admin collections
  - jobs/queues for deferred or durable background work
- Official database support is MongoDB, Postgres, and SQLite. There is no first-class D1 adapter listed in the main database docs; D1 support is surfaced through the official Cloudflare template path.
- Official storage guidance says:
  - in Node.js environments, use the S3 adapter against Cloudflare R2's S3-compatible API
  - the R2 adapter is specifically for Cloudflare Workers where R2 is a native bucket binding
- Official Cloudflare template proves Payload can run with Workers + D1 + R2, but the template README also documents notable tradeoffs:
  - currently deployable only on Paid Workers because of bundle size limits
  - GraphQL support is not fully guaranteed on Workers yet
  - the template includes worker-specific logging and fetch workarounds
- Recent ecosystem signal:
  - Payload v3 re-architected the product around Next.js App Router and Local API
  - a Next.js 16 Turbopack compatibility issue existed and was later closed; recent releases also note a minimum required Next.js 16 version bump to `16.2.2`

## Integration Implications For Shpitto
- Best-case Payload fit is not "replace the current blog so editors can write posts." Shpitto already has that.
- Best-case fit is "replace or centralize multiple future structured-content/admin domains" such as:
  - marketing pages / docs / changelog / blog / media library
  - editorial permissions and drafts for non-technical operators
  - multilingual content
  - reusable content blocks for front-end rendering
- Worst-case fit is using Payload only for blog CRUD while keeping Shpitto's current blog runtime, D1 schema, R2 asset model, Puck model, and deploy pipeline. That would create duplicated models and migration cost with little net leverage.
