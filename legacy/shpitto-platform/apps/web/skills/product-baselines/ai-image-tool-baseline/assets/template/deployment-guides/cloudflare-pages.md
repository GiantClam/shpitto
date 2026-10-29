# Cloudflare Pages Compatibility

This AI image template is a Next.js server runtime. The existing Cloudflare
Pages adapter in Shpitto deploys static bundles, so Cloudflare Pages is not a
supported deployment target for this template.

Do not export this template as a static site: generation, authentication,
billing webhooks, CMS publication, signed downloads, and server-only provider
secrets would not work.

To use Cloudflare infrastructure, provide a tested Next.js-on-Workers adapter
and update the template contract before enabling this target. The current
template remains deployable through Vercel, Railway, Docker, or source.

## Prerequisites

1. A Cloudflare account for a future Workers adapter
2. A tested server-compatible Next.js adapter

## Steps

1. Do not deploy the server template with the static Pages adapter.
2. After a server adapter is added and verified, add all required environment variables from `.env.example`.
3. Add server-only secrets through Cloudflare secret storage.
4. Configure the production domain and update:
   - `NEXT_PUBLIC_APP_URL`
   - `NEXTAUTH_URL`
5. Deploy and verify the baseline routes and server APIs.

## Notes

- Confirm Stripe webhook endpoints point to the deployed Cloudflare URL.
- Keep China payment adapter secrets in Cloudflare secret storage, not in source.
