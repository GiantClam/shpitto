FROM node:24.15.0-bookworm-slim
RUN apt-get update -qq && apt-get install --no-install-recommends --yes -qq ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY src ./src
COPY scripts/migrate.ts scripts/provider-worker.ts scripts/provider-worker-runtime.mjs scripts/provider-worker-preflight.ts ./scripts/
COPY scripts/probe-provider-acceptance.ts ./scripts/probe-provider-acceptance.ts
COPY scripts/probe-write-b64-file.ts ./scripts/probe-write-b64-file.ts
COPY scripts/probe-fal-account-bootstrap.ts ./scripts/probe-fal-account-bootstrap.ts
COPY scripts/probe-worker-recovery-acceptance.ts ./scripts/probe-worker-recovery-acceptance.ts
COPY tests/integration/provider-worker.test.ts ./tests/integration/provider-worker.test.ts
COPY tests/fixtures/video/local-demo.mp4 ./tests/fixtures/video/local-demo.mp4
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/provider-worker-runtime.mjs"]
