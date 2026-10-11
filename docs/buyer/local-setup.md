# Local no-cloud setup

This profile starts the persistent local prerequisites for the product: PostgreSQL, Mailpit and a worker image with FFmpeg. It uses the Mock generation driver and local asset storage, so it does not require provider, payment, storage or mail credentials.

## Prerequisites

- Docker Desktop with Compose v2.
- Node.js 24 and Corepack-enabled pnpm 12.
- `ffprobe` and `ffmpeg` available on the host PATH used by the Next.js app. Input image uploads are decoded in the app process; the worker container has its own media tools.
- Ports `5432`, `1025`, `8025` and `8080` available.

## Start and verify

```powershell
Get-Command ffprobe, ffmpeg -ErrorAction Stop | Select-Object Name, Source
corepack pnpm services:up
corepack pnpm db:migrate
Invoke-WebRequest http://localhost:8080/healthz
```

The worker health response includes the FFmpeg version. Mailpit is available at <http://localhost:8025>. The Next.js app runs separately with `corepack pnpm dev` and uses the local values from `.env.example`.

## Persistent state and reset

Compose creates three named volumes: `shpitto-postgres` for database state, `shpitto-mail` for captured messages and `shpitto-assets` for generated files. `corepack pnpm services:down` stops containers and keeps these volumes. To intentionally reset the local profile, run `docker compose -f deploy/compose.local.yml down --volumes`; this deletes only the local demo data.

## Configuration boundary

The local profile sets `STORAGE_DRIVER=local`, `GENERATION_DRIVER=mock` and `MAIL_DRIVER=local`. `src/config/env.ts` rejects these drivers when `NODE_ENV=production`, so a local compose profile cannot silently become a production deployment. Cloud provider keys are not read by the worker image.
