# Deploy With Docker

The template includes a multi-stage `Dockerfile` for the Next.js server runtime.

1. Copy `.env.example` to `.env.local` and configure production secrets.
2. Build the image with `docker build -t shpitto-ai-image-tool .`.
3. Run it with `docker run --env-file .env.local -p 3000:3000 shpitto-ai-image-tool`.
4. Configure the reverse proxy and webhook URLs for the public domain.

The image does not include `.env` files, OpenCode session state, or build caches.
