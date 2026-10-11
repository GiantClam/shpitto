FROM node:24.15.0-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends --yes ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY src ./src
COPY scripts/local-worker.ts scripts/migrate.ts scripts/worker-health.mjs scripts/local-worker-runtime.mjs ./scripts/
COPY tests/fixtures/video/local-demo.mp4 ./tests/fixtures/video/local-demo.mp4

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["node", "scripts/worker-health.mjs", "--probe"]
CMD ["node", "scripts/local-worker-runtime.mjs"]
