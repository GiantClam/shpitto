# Standalone application image for the buyer-owned Docker profile.
FROM node:24.15.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

FROM dependencies AS build
COPY . .
RUN APP_URL=https://build.invalid \
  DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
  BETTER_AUTH_SECRET=build-only-dummy-secret-never-used-at-runtime \
  STORAGE_DRIVER=s3-compatible GENERATION_DRIVER=provider MAIL_DRIVER=smtp \
  MAIL_SMTP_URL=smtp://127.0.0.1:1025 pnpm build

FROM node:24.15.0-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --no-install-recommends --yes ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/content/docs ./content/docs
COPY --from=build /app/src/db ./src/db
COPY --from=build /app/scripts/migrate.ts ./scripts/migrate.ts
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
