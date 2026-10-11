# shpitto Contact Email Worker

Cloudflare Worker consumer for `shpitto_outbound_emails`.

It reads queued contact-email jobs from the shared Shpitto D1 database, sends them through Cloudflare Email, and marks each job as `sent`, `failed`, or `dead`.

## 1) Setup

```bash
cd apps/contact-email-worker
cp wrangler.toml.example wrangler.toml
```

If `apps/web/.env.local` or repo `.env` already contains:
- `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_EMAIL_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_EMAIL_FROM`

then `pnpm run preflight` will generate `wrangler.toml` automatically from those values.

Then sync the API token as a Worker secret:

```bash
pnpm install
pnpm run sync:secrets
```

Optional secret for manual drain calls:

```bash
pnpm exec wrangler secret put CONTACT_EMAIL_HEALTH_TOKEN
```

## 2) Deploy

```bash
pnpm run preflight
pnpm run deploy
```

## 3) Cron

The example uses:

```toml
[triggers]
crons = ["*/1 * * * *"]
```

That means the worker polls the queue once per minute and drains up to `CONTACT_EMAIL_BATCH_SIZE` jobs each run.

## 4) Manual endpoints

- `GET /healthz`
- `GET /stats`
- `POST /drain`

If `CONTACT_EMAIL_HEALTH_TOKEN` is set, `GET /stats` and `POST /drain` require:

```bash
curl -X POST https://<worker-url>/drain \
  -H "Authorization: Bearer <token>"
```

## 5) Integration

Generated websites do not deploy their own email worker.

This worker is shared by one Shpitto environment and consumes jobs for all projects that enqueue contact emails into the same D1 database.

## 6) Legacy note

The old Railway/Node `contact-email` worker path has been removed from the repository.

If Railway still has an old worker service running, stop it in Railway itself. Deleting the code path does not stop an already-running service automatically.
