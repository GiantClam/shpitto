# AI Image Tool Baseline Template

Canonical template id: `ai-image-tool-baseline-v1`

The `source/` directory is the independently generated, runnable Next.js
commercial template package. The surrounding manifest and guides describe the
contract used by Shpitto when regenerating or refining that package.

This template freezes `fluxkreafree` as the source product baseline for AI
image websites generated through Shpitto. The template preserves the core AI
image workflow while allowing branding, visitor-facing content, and approved
layout changes.

## Preserved Product Routes

- `/`
- `/pricing`
- `/flux-prompt-generator`
- `/sign-in`
- `/app`
- `/app/generate`
- `/app/history`
- `/app/giftcode`
- `/app/order`
- `/admin`
- `/admin/tasks`
- `/admin/projects`
- `/admin/assets`
- `/admin/gift-codes`
- `/admin/users`
- `/admin/settings`
- `/privacy-policy`
- `/terms-of-use`

## Required Runtime Contracts

- billing must run through `PaymentProviderAdapter`
- credits and entitlements must run through a verified webhook-backed ledger with generation reservation, settlement, and release
- Payload is low-frequency admin/config only
- locale changes must preserve route ownership
- secrets must remain server-only
- production generation must use a configured provider adapter; mock mode is preview/test-only
- generation supports model and aspect-ratio selection, optional reference-image URLs, signed asset download, and shareable result links
- payment checkout, gift-code redemption, order history, and credits require the included database migration and provider configuration
- CMS publication must use the authenticated publish endpoint and revalidation path

## Getting Started

1. Copy `.env.example` to `.env.local`.
2. Configure database, auth, object storage, and AI provider keys. Set `AI_PROVIDER_MODE=replicate` and `REPLICATE_MODEL_VERSION` for production. `REPLICATE_POLL_ATTEMPTS` and `REPLICATE_POLL_INTERVAL_MS` control the bounded provider wait window for long-running predictions.
3. Apply `supabase/migrations/001_ai_image_template.sql` to the configured Supabase project before starting production. With the Supabase CLI, run `supabase db push --db-url "$SUPABASE_DB_URL"` from the source root; the database URL is never used by the application runtime. The migration creates generation, credit, order, and gift-code tables plus transactional credit functions.
4. Configure at least one payment provider. Stripe is the default adapter; `STRIPE_SECRET_KEY` is canonical and `STRIPE_API_KEY` is accepted as the fluxkreafree compatibility alias.
5. Configure `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` for durable result storage and signed downloads.
6. If Payload is enabled, configure `PAYLOAD_SECRET` and `PAYLOAD_DATABASE_URL`.
7. Run install, typecheck, build, then route and API smoke checks before publishing.

## Template Verification Gate

Before promoting this baseline into platform flows, verify:

1. core routes render
2. sandbox AI generation works through the configured provider adapter
3. Stripe checkout and webhook verification work
4. model controls, reference-image input, download/share, gift-code redemption, and order history work
5. i18n can add at least one extra locale without route-purpose drift
6. Payload schema covers settings, billing metadata, localized content, publication roles, and cache invalidation
7. export artifacts and deployment guides are present

## Deployment Guides

- `deployment-guides/vercel.md`
- `deployment-guides/cloudflare-pages.md`
- `deployment-guides/railway.md`
