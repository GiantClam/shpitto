# Deploy To Vercel

## Prerequisites

1. A Vercel account
2. A managed Postgres database or equivalent
3. Storage and AI provider credentials
4. Stripe keys if billing is enabled

## Steps

1. Import the project into Vercel.
2. Set the framework to Next.js.
3. Add every required variable from `.env.example`.
4. Set production values for:
   - `NEXT_PUBLIC_APP_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - provider, storage, and Stripe secrets
5. Trigger a build.
6. Verify:
   - homepage
   - pricing
   - prompt generator
   - sign-in
   - `/app/generate`
   - `/app/history`
   - `/app/order`

## Notes

- Stripe webhook endpoint must be registered after the deployment URL is known.
- Payload should run in server-only mode and must not expose admin secrets to the
  client bundle.
