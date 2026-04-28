# Shpitto - AI Portal Generation Platform

This repository contains the source code for Phase 1 (Industry-v0) of the Shpitto platform.

## Structure

*   `apps/web`: Next.js application with Puck editor and Chat interface.
*   `packages/schema`: Shared Zod schemas and TypeScript types.
*   `packages/db`: Database schema and client.

## Getting Started

### Prerequisites

*   Node.js 18+
*   pnpm
*   PostgreSQL (or Docker)

### Installation

1.  **Install Node dependencies:**
    ```bash
    pnpm install
    ```

### Running the Development Environment

1.  **Start Frontend:**
    ```bash
    cd apps/web
    pnpm dev
    ```

2.  **Access:**
    *   Frontend: [http://localhost:3000](http://localhost:3000)

### Development Features

*   **Instant Login**: In development mode (`NODE_ENV=development`), the login page includes a "Dev Mode: Instant Login" button to bypass authentication.

## Protocol

The core protocol is defined in `packages/schema/src/project-schema.ts`. This ensures that the AI generation matches the frontend's rendering capabilities.

## Infrastructure

- D1 schema: `packages/db/d1_schema.sql`
- Runtime auto-creates required tables in D1 through `apps/web/lib/d1.ts`
- Contact ingest endpoint: `POST /api/contact` (used by generated static sites)
- Contact submissions query endpoint (authenticated): `GET /api/contact/submissions`
- R2 archive support for generated site artifacts and contact payload snapshots: `apps/web/lib/r2.ts`
- Cloudflare Worker contact ingress service: `apps/contact-worker` (`POST /api/contact`)

Required environment variables for Cloudflare persistence:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID` (or `CLOUDFLARE_D1_DB_ID`)
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID` (or `R2_ACCESS_KEY`)
- `R2_SECRET_ACCESS_KEY` (or `R2_SECRET`)
- `SHPITTO_CONTACT_API_URL` (MUST be an absolute URL reachable by generated Cloudflare Pages sites, e.g. a Worker or the app domain `/api/contact`)

Required environment variables for email auth:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_EMAIL_ACCOUNT_ID` (or `EMAIL_PROVIDER_ACCOUNT_ID`)
- `CLOUDFLARE_EMAIL_API_TOKEN` (or `EMAIL_PROVIDER_API_TOKEN`)
- `CLOUDFLARE_EMAIL_FROM` (or `EMAIL_FROM`, e.g. `Shpitto <noreply@shpitto.com>`)
- `APP_URL` or `NEXT_PUBLIC_APP_URL` (used to build verification and password reset links)

Optional:

- `R2_ACCOUNT_ID` (defaults to `CLOUDFLARE_ACCOUNT_ID`)
- `R2_ENDPOINT` (defaults to `<account_id>.r2.cloudflarestorage.com`)
- `SHPITTO_APP_BASE_URL` or `NEXT_PUBLIC_APP_URL` (used when `SHPITTO_CONTACT_API_URL` is unset)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (GA4 measurement ID for Shpitto app page views, Web Vitals, and client exception monitoring)

Deploy worker and set contact URL:

```bash
cd apps/contact-worker
pnpm deploy
```

After deployment, set:

```env
SHPITTO_CONTACT_API_URL=https://<worker-subdomain>.workers.dev/api/contact
```
