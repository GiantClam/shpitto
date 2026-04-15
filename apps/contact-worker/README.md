# Shpitto Contact Worker

Cloudflare Worker service that accepts generated-site form submissions at:

- `POST /api/contact`
- `GET /health`

It writes submissions into Cloudflare D1 (`shpitto_contact_submissions`) and archives JSON payloads into R2.

## Deploy

1. Check `wrangler.toml` bindings:
   - `account_id`
   - `d1_databases.database_id`
   - `r2_buckets.bucket_name`
2. Deploy:

```bash
cd apps/contact-worker
pnpm deploy
```

3. Copy the deployed worker URL and set it in root `.env`:

```env
SHPITTO_CONTACT_API_URL=https://<your-worker-subdomain>.workers.dev/api/contact
```

## Test

```bash
curl -X POST "https://<your-worker-subdomain>.workers.dev/api/contact?site_key=<site_key>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"test@example.com\",\"message\":\"hello\"}"
```

