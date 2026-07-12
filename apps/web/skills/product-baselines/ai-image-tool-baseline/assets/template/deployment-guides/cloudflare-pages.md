# Deploy To Cloudflare Pages

## Prerequisites

1. A Cloudflare account
2. A database reachable from Cloudflare runtime
3. Storage and AI provider credentials
4. Payload compatibility plan if admin mode is enabled

## Steps

1. Connect the repository to Cloudflare Pages.
2. Use the Next.js adapter/runtime that matches the generated template.
3. Add all required environment variables from `.env.example`.
4. Add server-only secrets through Cloudflare secret storage.
5. Configure the production domain and update:
   - `NEXT_PUBLIC_APP_URL`
   - `NEXTAUTH_URL`
6. Deploy and verify the baseline routes.

## Notes

- Confirm Stripe webhook endpoints point to the deployed Cloudflare URL.
- Keep China payment adapter secrets in Cloudflare secret storage, not in source.
