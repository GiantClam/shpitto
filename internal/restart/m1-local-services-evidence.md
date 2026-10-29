# M1 local services evidence

Status: **READY_FOR_REVIEW** for task 2.5. This profile establishes persistent local prerequisites and worker readiness; it does not claim a completed generation flow.

## Observed result

- `corepack pnpm verify:local-services` passed the Compose service, volume, no-cloud-credential and worker health contract checks.
- `docker compose -f deploy/compose.local.yml config --quiet` passed.
- The worker image built successfully from `deploy/worker.Dockerfile` with Node `24.15.0-bookworm-slim` and FFmpeg `5.1.9-0+deb12u1` available in the image.
- A worker container returned HTTP 200 from `/healthz` with its FFmpeg version.
- A disposable Compose project initialized PostgreSQL, Mailpit and all three named volumes; PostgreSQL and Mailpit reported healthy, the worker reported healthy, and the worker remained healthy after PostgreSQL and worker restart.
- The disposable Compose project and volumes were removed after the check. Existing user containers were not modified.

## Local profile contract

- PostgreSQL state is stored in `shpitto-postgres`; captured mail is stored in `shpitto-mail`; generated assets are stored in `shpitto-assets`.
- The worker uses only local/mock drivers and has no provider, payment or cloud-storage credential names in its Compose environment.
- `src/config/env.ts` rejects local storage, Mock generation and local mail drivers in production.
- `scripts/dev-services.ts` provides explicit `up`, `down` and `status` actions. `down` preserves volumes; an explicit `down --volumes` is required to erase demo state.

## Reproduction

```powershell
corepack pnpm verify:local-services
docker compose -f deploy/compose.local.yml config --quiet
corepack pnpm services:up
Invoke-WebRequest http://localhost:8080/healthz
corepack pnpm services:down
```

The full Compose check used an isolated project name and alternate host ports because other local Docker services were already running.
