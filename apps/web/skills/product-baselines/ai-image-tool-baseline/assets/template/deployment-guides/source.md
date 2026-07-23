# Deploy From Source

The `source/` directory is a complete Next.js App Router application.

1. Copy `.env.example` to `.env.local` and configure production secrets.
2. Install Node.js 20 or newer and enable pnpm through Corepack.
3. Run `pnpm install` and `pnpm build`.
4. Run `pnpm start` behind the hosting provider's process manager.

Source deployment is a packaging target, not an external Shpitto-managed deployment. The operator owns process supervision, TLS, domain routing, migrations, and secret storage.
