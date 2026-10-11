# Shpitto OpenCode Workspace

This workspace was prepared by Shpitto for `build-ai-image-tool`.

## Start

```bash
pnpm install
pnpm dev
```

## Template Preview

Use the preview flag when you want the generated template to run with production-style `next start` while still exposing the local preview credentials fallback.

```bash
SHPITTO_TEMPLATE_PREVIEW=1 NEXTAUTH_SECRET=local-preview-secret NEXTAUTH_URL=http://127.0.0.1:4173 pnpm start --hostname 127.0.0.1 --port 4173
```

Google OAuth remains the production path. Preview credentials are only enabled outside production; production rejects SHPITTO_TEMPLATE_PREVIEW. Production administrators must be listed in CMS_ADMIN_EMAILS.

## CMS Integration

The AI image template includes hidden admin routes /admin, /admin/tasks, /admin/projects, /admin/assets, /admin/gift-codes, /admin/settings, and /admin/users.

Set these server-only variables when connecting real services:

- PAYLOAD_API_URL: Payload server base URL.
- PAYLOAD_API_KEY: server-only Payload credential.
- PAYLOAD_ADMIN_URL: optional Payload admin URL shown in settings.
- PRODUCT_API_URL: product task and high-frequency generation state API.

Before production start, apply `supabase/migrations/001_ai_image_template.sql` with `supabase db push --db-url "$SUPABASE_DB_URL"`. Set `SUPABASE_DB_URL` only in the deployment shell or migration environment; do not put it in public or application runtime variables.

Payload is used for low-frequency settings and metadata. High-frequency generation queues remain in the product task service.

## Contract

Read the `.shpitto/` directory before making structural changes. It contains the normalized request, template manifest, route contract, selected foundations, selected seeds, and deployment target.
